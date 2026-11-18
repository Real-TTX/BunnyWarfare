using System.Collections.Concurrent;
using System.Globalization;
using System.Reflection;
using System.Text.Json;
using BunnyWarfare.Business;
using BunnyWarfare.Data;
using BunnyWarfare.Game;
using MatGame.Local;

namespace BunnyWarfare.Local;

/// <summary>
/// BunnyWarfare offline, inside the app (MatGame.Shell): answers every call the player app makes online – the game API (<see cref="RequestAsync"/>, the same
/// paths and shapes as <c>/bunnywarfare/api</c>) and the hub (<see cref="InvokeAsync"/>, the same methods as GameHub) – with the same rules (<see cref="MatchRoom"/>,
/// the bots, the crates) and sends the same hub messages through <see cref="ILocalHost.Emit"/>. The one local player (id 1) is a guest; its profile is a JSON file.
/// The worlds and weapons are the seeded ones (<see cref="SeedContent"/>). A clock (like the server's GameTicker) ends turns and lets the bots shoot.
/// </summary>
public sealed class BunnyWarfareLocal : ILocalGame
{
    public const long LocalPlayerId = 1;

    private const string Connection = "local";
    private static readonly TimeSpan Interval = TimeSpan.FromMilliseconds(150);
    private static readonly TimeSpan FinishedLifetime = TimeSpan.FromMinutes(10);
    private static readonly string Version =
        typeof(BunnyWarfareLocal).Assembly.GetCustomAttribute<AssemblyInformationalVersionAttribute>()?.InformationalVersion ?? "local";

    private readonly ConcurrentDictionary<Guid, MatchRoom> _rooms = new();
    private readonly object _profileLock = new();
    private ILocalHost _host = null!;
    private LocalProfile _profile = null!;
    private IReadOnlyList<World> _worlds = [];
    private IReadOnlyList<Weapon> _weapons = [];
    private CancellationTokenSource? _clock;
    private Task? _clockTask;
    private long _nextMatchId;
    private Guid? _current;

    /// <summary>The shell creates the game with <c>new BunnyWarfareLocal()</c> and starts it with <see cref="StartAsync"/>.</summary>
    public BunnyWarfareLocal()
    {
    }

    public string GameId => "bunnywarfare";

    /// <summary>The rooms of this run (tests look at them).</summary>
    internal IReadOnlyCollection<MatchRoom> Rooms => _rooms.Values.ToList();

    /// <summary>The local player (tests look at it).</summary>
    internal Player Player => _profile.Player;

    public Task StartAsync(ILocalHost host, CancellationToken ct)
    {
        _host = host;
        Directory.CreateDirectory(host.DataDirectory);
        _profile = LocalProfile.Load(host.DataDirectory, host.PlayerName);
        _worlds = SeedContent.AllWorlds().Where(w => w.IsEnabled).ToList();
        _weapons = SeedContent.AllWeapons().Where(w => w.IsEnabled).ToList();
        _clock = new CancellationTokenSource();
        _clockTask = RunClockAsync(_clock.Token);
        return Task.CompletedTask;
    }

    public async ValueTask DisposeAsync()
    {
        if (_clock is null)
        {
            return;
        }

        await _clock.CancelAsync();
        try
        {
            if (_clockTask is not null)
            {
                await _clockTask;
            }
        }
        catch (OperationCanceledException)
        {
            // the clock stopped
        }

        _clock.Dispose();
        _clock = null;
    }

    // ---------------------------------------------------------------- the game API

    public Task<LocalResponse> RequestAsync(string method, string path, JsonElement? body, CancellationToken ct)
    {
        try
        {
            var (route, query) = Split(path);
            var segments = route.Trim('/').Split('/', StringSplitOptions.RemoveEmptyEntries);
            var answer = (method.ToUpperInvariant(), segments) switch
            {
                ("GET", ["session"]) => LocalResponse.Ok(new { signedIn = true, player = PlayerDto(), version = Version, offline = true }),
                ("GET", ["showcase"]) => Showcase(query),
                ("GET", ["home"]) => Home(),
                ("GET", ["settings"]) => LocalResponse.Ok(new { defaultTurnSeconds = GameRules.DefaultTurnSeconds, maxTeamsPerMatch = GameRules.DefaultMaxTeams }),
                ("GET", ["worlds"]) => LocalResponse.Ok(_worlds.Select(WorldDto)),
                ("GET", ["worlds", var id, "terrain"]) => Terrain(id),
                ("GET", ["matches"]) => LocalResponse.Ok(new { items = Array.Empty<object>(), matching = 0, total = 0 }),
                ("POST", ["matches"]) => CreateMatch(Read<CreateMatchBody>(body)),
                ("POST", ["matches", "quick"]) => QuickMatch(Read<QuickMatchBody>(body)),
                ("GET", ["leaderboard"]) => Leaderboard(),
                ("GET", ["profile"]) => LocalResponse.Ok(ProfileDto()),
                ("PUT", ["profile"]) => SaveProfile(Read<ProfileBody>(body)),
                ("PUT", ["profile", "look"]) => SaveLook(Read<LookBody>(body)),
                _ => LocalResponse.Error(404, "Das gibt es offline nicht."),
            };
            return Task.FromResult(answer);
        }
        catch (BusinessException e)
        {
            var field = string.IsNullOrEmpty(e.Field) ? null : char.ToLower(e.Field[0], CultureInfo.InvariantCulture) + e.Field[1..];
            return Task.FromResult(LocalResponse.Error(400, e.Message, field));
        }
        catch (AccessDeniedException e)
        {
            return Task.FromResult(LocalResponse.Error(403, e.Message));
        }
        catch (JsonException)
        {
            return Task.FromResult(LocalResponse.Error(400, "Die Anfrage ist unvollständig."));
        }
    }

    private object PlayerDto()
    {
        var p = _profile.Player;
        return new
        {
            p.Id, p.DisplayName, p.IsGuest, isAdmin = false, p.TeamName, p.TeamColor, p.Fur, p.Outfit, p.Face, p.Frame, level = Cosmetics.LevelOf(p.Xp),
        };
    }

    private static object WorldDto(World w) => new
    {
        w.Id, w.Name, w.Description, theme = w.Theme.ToString(), themeName = GameRules.ThemeName(w.Theme), w.GridSize, width = GameRules.WidthOf(w.GridSize), w.Gravity,
        w.MaxWind,
    };

    private LocalResponse Showcase(IReadOnlyDictionary<string, string> query)
    {
        var world = query.TryGetValue("worldId", out var text) && long.TryParse(text, CultureInfo.InvariantCulture, out var id)
            ? _worlds.FirstOrDefault(w => w.Id == id)
            : null;
        world ??= _worlds.Count == 0 ? null : _worlds[Random.Shared.Next(_worlds.Count)];
        return world is null ? LocalResponse.Error(404, "Es gibt keine Welt.") : LocalResponse.Ok(Game.Showcase.Build(world));
    }

    private LocalResponse Terrain(string id)
        => long.TryParse(id, CultureInfo.InvariantCulture, out var worldId) && _worlds.FirstOrDefault(w => w.Id == worldId) is { } world
            ? LocalResponse.Ok(Game.Showcase.WorldOf(world))
            : LocalResponse.Error(404, "Diese Welt gibt es nicht.");

    private LocalResponse Home()
    {
        var p = _profile.Player;
        List<LocalHistoryEntry> history;
        lock (_profileLock)
        {
            history = _profile.History.OrderByDescending(h => h.EndDate).Take(8).ToList();
        }

        return LocalResponse.Ok(new
        {
            player = new { level = Cosmetics.LevelOf(p.Xp), p.Xp, p.Fur, p.Outfit, p.Face, p.Frame, p.TeamColor },
            announcement = string.Empty,
            stats = new { p.GamesPlayed, p.GamesWon, p.Kills, p.DamageDealt, rank = 0 },
            history = history.Select(h => new { token = h.Token, h.Name, h.WorldName, status = h.Status, endDate = h.EndDate, h.Placement, h.Kills, h.DamageDealt, h.XpGained }),
        });
    }

    private LocalResponse Leaderboard()
    {
        var p = _profile.Player;
        var row = new
        {
            rank = 1, playerId = p.Id, p.DisplayName, p.TeamName, p.TeamColor, p.GamesPlayed, p.GamesWon, p.Kills, p.DamageDealt, level = Cosmetics.LevelOf(p.Xp),
            p.Fur, p.Outfit, p.Face, p.Frame, winRate = p.GamesPlayed == 0 ? 0 : (int)Math.Round(100.0 * p.GamesWon / p.GamesPlayed),
        };
        return LocalResponse.Ok(new { items = new[] { row }, matching = 1, total = 1 });
    }

    private object ProfileDto()
    {
        var p = _profile.Player;
        var view = PlayerRules.ProfileOf(p, new PlayerStats(p.GamesPlayed, p.GamesWon, p.Kills, p.DamageDealt, 0));
        return new
        {
            view.DisplayName, view.IsGuest, view.TeamName, view.TeamColor,
            view.Look.Fur, view.Look.Outfit, view.Look.Face, view.Look.Frame,
            view.Level, view.Xp, view.XpAtLevel, view.XpForNext, view.MaxLevel,
            stats = new { view.Stats.GamesPlayed, view.Stats.GamesWon, view.Stats.Kills, view.Stats.DamageDealt, view.Stats.Rank },
            wardrobe = view.Wardrobe,
            colors = GameRules.TeamColors.Select(c => new { value = c.Value, label = c.Label }),
        };
    }

    /// <summary>Offline the name belongs to the profile too (online it is the account's, changed in MatGame).</summary>
    private LocalResponse SaveProfile(ProfileBody body)
    {
        var p = _profile.Player;
        var teamName = body.TeamName ?? p.TeamName;
        var teamColor = body.TeamColor ?? p.TeamColor;
        PlayerRules.ValidateTeam(teamName, teamColor);
        if (body.DisplayName is { } name && (string.IsNullOrWhiteSpace(name) || name.Trim().Length > 60))
        {
            throw new BusinessException("Der Name fehlt oder ist länger als 60 Zeichen.", "DisplayName");
        }

        lock (_profileLock)
        {
            p.DisplayName = body.DisplayName?.Trim() ?? p.DisplayName;
            p.TeamName = teamName.Trim();
            p.TeamColor = teamColor.ToLowerInvariant();
            _profile.Save(_host.DataDirectory);
        }

        return LocalResponse.Ok(ProfileDto());
    }

    private LocalResponse SaveLook(LookBody body)
    {
        var p = _profile.Player;
        var look = new Look(body.Fur ?? string.Empty, body.Outfit ?? string.Empty, body.Face ?? string.Empty, body.Frame ?? string.Empty);
        if (Cosmetics.Check(look, Progress.Of(p)) is { } problem)
        {
            throw new BusinessException(problem.Message, problem.Field);
        }

        lock (_profileLock)
        {
            PlayerRules.SetLook(p, look);
            _profile.Save(_host.DataDirectory);
        }

        return LocalResponse.Ok(ProfileDto());
    }

    private LocalResponse CreateMatch(CreateMatchBody body)
    {
        var name = body.Name?.Trim() ?? string.Empty;
        if (name.Length is 0 or > 60)
        {
            throw new BusinessException("Der Name fehlt oder ist länger als 60 Zeichen.", "Name");
        }

        var world = _worlds.FirstOrDefault(w => w.Id == body.WorldId) ?? throw new BusinessException("Bitte eine Welt wählen.", "WorldId");
        if (body.MaxTeams < 2 || body.MaxTeams > GameRules.DefaultMaxTeams)
        {
            throw new BusinessException($"Ein Spiel hat 2 bis {GameRules.DefaultMaxTeams} Teams.", "MaxTeams");
        }

        if (body.BunniesPerTeam is < 1 or > 6)
        {
            throw new BusinessException("Ein Team hat 1 bis 6 Hasen.", "BunniesPerTeam");
        }

        if (body.BunnyHealth is < 25 or > 300)
        {
            throw new BusinessException("Die Gesundheit liegt zwischen 25 und 300.", "BunnyHealth");
        }

        if (body.TurnSeconds is < 15 or > 120)
        {
            throw new BusinessException("Die Zugzeit liegt zwischen 15 und 120 Sekunden.", "TurnSeconds");
        }

        var rate = (CrateRate)(body.CrateRate ?? (int)CrateRate.Normal);
        if (!Enum.IsDefined(rate))
        {
            throw new BusinessException("Bitte wählen, wie oft Kisten fallen.", "CrateRate");
        }

        return LocalResponse.Ok(new { token = OpenRoom(name, world, body.MaxTeams, body.BunniesPerTeam, body.BunnyHealth, body.TurnSeconds, rate) });
    }

    private LocalResponse QuickMatch(QuickMatchBody body)
    {
        if (_worlds.Count == 0)
        {
            throw new BusinessException("Es gibt keine Welt.");
        }

        var world = _worlds.FirstOrDefault(w => w.Id == body.WorldId) ?? _worlds[Random.Shared.Next(_worlds.Count)];
        var bots = Math.Clamp(body.Bots, 1, GameRules.DefaultMaxTeams - 1);
        var rate = body.CrateRate is { } r && Enum.IsDefined((CrateRate)r) ? (CrateRate)r : CrateRate.Normal;
        var name = $"Schnellspiel von {_profile.Player.DisplayName}";
        return LocalResponse.Ok(new { token = OpenRoom(name.Length > 60 ? name[..60] : name, world, bots + 1, 3, 100, GameRules.DefaultTurnSeconds, rate) });
    }

    private Guid OpenRoom(string name, World world, int maxTeams, int bunnies, int health, int turnSeconds, CrateRate rate)
    {
        var match = new Match
        {
            Id = Interlocked.Increment(ref _nextMatchId), Name = name, WorldId = world.Id, World = world, HostPlayerId = LocalPlayerId, MaxTeams = maxTeams,
            BunniesPerTeam = bunnies, BunnyHealth = health, TurnSeconds = turnSeconds, IsPublic = false, CrateRate = rate, Status = MatchStatus.Lobby,
        };
        var room = new MatchRoom(match, world);
        _rooms[match.Token] = room;
        return match.Token;
    }

    // ---------------------------------------------------------------- the hub

    public async Task<JsonElement?> InvokeAsync(string method, IReadOnlyList<JsonElement> args, CancellationToken ct)
    {
        switch (method)
        {
            case "Join":
                return Serialize(await JoinAsync(Text(args, 0)));
            case "AddBot":
                await InRoomAsync(room => room.AddBot(LocalPlayerId, Enum.TryParse<BotLevel>(Text(args, 0), true, out var level) ? level : BotLevel.Normal));
                return null;
            case "RemoveTeam":
                await InRoomAsync(room => room.RemoveSlot(LocalPlayerId, (int)Number(args, 0)));
                return null;
            case "Start":
                await InRoomAsync(room =>
                {
                    room.TeamsForStart(LocalPlayerId);
                    if (_weapons.Count == 0)
                    {
                        throw new BusinessException("Es gibt keine Waffen.");
                    }

                    return room.StartGame(_weapons, DateTime.UtcNow);
                });
                return null;
            case "Move":
                await InRoomAsync(room => room.Move(LocalPlayerId, Connection, Number(args, 0), Number(args, 1), Number(args, 2)), toOthers: true);
                return null;
            case "AimAt":
                await InRoomAsync(room => room.AimAt(LocalPlayerId, Number(args, 0), Number(args, 1), (long)Number(args, 2)), toOthers: true);
                return null;
            case "Fire":
                await InRoomAsync(room => room.Fire(LocalPlayerId, (long)Number(args, 0), new Aim(Number(args, 1), Number(args, 2), Number(args, 3), Number(args, 4), Number(args, 5)),
                    DateTime.UtcNow));
                return null;
            case "SkipTurn":
                await InRoomAsync(room => room.SkipTurn(LocalPlayerId, DateTime.UtcNow));
                return null;
            case "Surrender":
                await InRoomAsync(room => room.Surrender(LocalPlayerId, DateTime.UtcNow));
                return null;
            case "Chat":
                var text = Text(args, 0);
                await InRoomAsync(room => string.IsNullOrWhiteSpace(text) ? [] : [room.Chat(LocalPlayerId, text)]);
                return null;
            default:
                throw new BusinessException($"Das gibt es offline nicht ({method}).");
        }
    }

    private async Task<RoomDto> JoinAsync(string token)
    {
        if (!Guid.TryParse(token, out var id))
        {
            throw new BusinessException("Diesen Link gibt es nicht.");
        }

        var room = _rooms.TryGetValue(id, out var found) ? found : throw new BusinessException("Dieses Spiel gibt es nicht (mehr).");
        // the player is in one room at a time: leaving an open lobby drops it
        if (_current is { } previous && previous != id && _rooms.TryGetValue(previous, out var old))
        {
            using (await old.LockAsync())
            {
                old.Connections.Remove(Connection);
                if (old.Status == MatchStatus.Lobby)
                {
                    _rooms.TryRemove(previous, out _);
                }
            }
        }

        _current = id;
        using (await room.LockAsync())
        {
            room.Connections[Connection] = LocalPlayerId;
            room.LastActivity = DateTime.UtcNow;
            var messages = room.SeatPlayer(_profile.Player);
            if (messages.Count == 0 && room.Status == MatchStatus.Lobby)
            {
                messages.Add(new Outgoing("Room", room.ToDto()));
            }

            Send(messages, toOthers: false);
            return room.ToDto();
        }
    }

    private async Task InRoomAsync(Func<MatchRoom, List<Outgoing>> change, bool toOthers = false)
    {
        var room = _current is { } id && _rooms.TryGetValue(id, out var found) ? found : throw new BusinessException("Du bist in keinem Spiel.");
        using (await room.LockAsync())
        {
            Send(change(room), toOthers);
        }
    }

    /// <summary>
    /// Sends the messages of a room to the browser part. Online moves and aims go only to the other browsers (the sender already shows them): offline there
    /// is no other browser, so only what is meant for the sender too (a correction, a picked crate) is sent.
    /// </summary>
    private void Send(IEnumerable<Outgoing> messages, bool toOthers)
    {
        foreach (var m in messages)
        {
            if (!toOthers || m.OnlyConnection is not null || m.ToAll)
            {
                _host.Emit(m.Method, m.Payload);
            }
        }
    }

    // ---------------------------------------------------------------- the clock

    private async Task RunClockAsync(CancellationToken ct)
    {
        using var timer = new PeriodicTimer(Interval);
        while (await timer.WaitForNextTickAsync(ct))
        {
            foreach (var (token, room) in _rooms)
            {
                try
                {
                    await TickAsync(token, room);
                }
                catch (Exception e)
                {
                    _host.Log($"BunnyWarfare: tick of match {room.MatchId} failed: {e.Message}");
                }
            }
        }
    }

    /// <summary>One tick of a room (the server's GameTicker, offline): the clock of the turn, the bots, the outcome into the profile.</summary>
    internal async Task TickAsync(Guid token, MatchRoom room)
    {
        var now = DateTime.UtcNow;
        using (await room.LockAsync())
        {
            var messages = room.Tick(now);
            if (messages.Count > 0 && _current == token)
            {
                Send(messages, toOthers: false);
            }

            if (room.NeedsSaving)
            {
                room.NeedsSaving = false;
                Finish(room);
            }
        }

        if (room.Status is MatchStatus.Finished or MatchStatus.Aborted && now - room.LastActivity > FinishedLifetime && _current != token)
        {
            _rooms.TryRemove(token, out _);
        }
    }

    /// <summary>A finished match: the local player's team adds its numbers and experience to the profile (the same rule as online), and the match to the history.</summary>
    private void Finish(MatchRoom room)
    {
        var game = room.Game;
        var team = game?.Teams.FirstOrDefault(t => t.PlayerId == LocalPlayerId);
        var outcome = team is null ? null : room.Outcomes().FirstOrDefault(o => o.TeamIndex == team.Index);
        if (game is null || team is null || outcome is null)
        {
            return;
        }

        var aborted = room.Status == MatchStatus.Aborted;
        lock (_profileLock)
        {
            var xp = aborted ? 0 : PlayerRules.AddMatch(_profile.Player, game.WinnerTeam == team.Index, outcome.Placement, outcome.Kills, outcome.DamageDealt);
            _profile.History.Add(new LocalHistoryEntry(room.Token, room.Name, room.World.Name, room.Status.ToString(), DateTime.UtcNow, outcome.Placement, outcome.Kills,
                outcome.DamageDealt, xp));
            if (_profile.History.Count > 30)
            {
                _profile.History.RemoveRange(0, _profile.History.Count - 30);
            }

            _profile.Save(_host.DataDirectory);
        }
    }

    // ---------------------------------------------------------------- helpers

    private static (string Route, IReadOnlyDictionary<string, string> Query) Split(string path)
    {
        var mark = path.IndexOf('?', StringComparison.Ordinal);
        if (mark < 0)
        {
            return (path, new Dictionary<string, string>());
        }

        var query = path[(mark + 1)..].Split('&', StringSplitOptions.RemoveEmptyEntries)
            .Select(p => p.Split('=', 2))
            .GroupBy(p => Uri.UnescapeDataString(p[0]))
            .ToDictionary(g => g.Key, g => g.Last().Length > 1 ? Uri.UnescapeDataString(g.Last()[1]) : string.Empty, StringComparer.OrdinalIgnoreCase);
        return (path[..mark], query);
    }

    private static T Read<T>(JsonElement? body)
        where T : new()
        => body is { ValueKind: JsonValueKind.Object } json ? json.Deserialize<T>(LocalJson.Options) ?? new T() : new T();

    private static string Text(IReadOnlyList<JsonElement> args, int index)
        => index < args.Count && args[index].ValueKind == JsonValueKind.String ? args[index].GetString() ?? string.Empty : string.Empty;

    private static double Number(IReadOnlyList<JsonElement> args, int index)
        => index < args.Count && args[index].ValueKind == JsonValueKind.Number ? args[index].GetDouble() : double.NaN;

    private static JsonElement Serialize(object value) => JsonSerializer.SerializeToElement(value, LocalJson.Options);

    private sealed class CreateMatchBody
    {
        public string? Name { get; set; }

        public long WorldId { get; set; }

        public int MaxTeams { get; set; } = 2;

        public int BunniesPerTeam { get; set; } = 3;

        public int BunnyHealth { get; set; } = 100;

        public int TurnSeconds { get; set; } = GameRules.DefaultTurnSeconds;

        public int? CrateRate { get; set; }
    }

    private sealed class QuickMatchBody
    {
        public long? WorldId { get; set; }

        public int Bots { get; set; } = 1;

        public int? CrateRate { get; set; }
    }

    private sealed class ProfileBody
    {
        public string? DisplayName { get; set; }

        public string? TeamName { get; set; }

        public string? TeamColor { get; set; }
    }

    private sealed class LookBody
    {
        public string? Fur { get; set; }

        public string? Outfit { get; set; }

        public string? Face { get; set; }

        public string? Frame { get; set; }
    }
}
