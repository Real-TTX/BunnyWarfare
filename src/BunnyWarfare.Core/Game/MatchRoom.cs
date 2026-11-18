using BunnyWarfare.Business;
using BunnyWarfare.Data;

namespace BunnyWarfare.Game;

/// <summary>A seat of the lobby: a player's team or a bot's.</summary>
public sealed class LobbySlot
{
    public required int TeamIndex { get; init; }

    public long? PlayerId { get; init; }

    public required string PlayerName { get; init; }

    public required string TeamName { get; init; }

    public required string Color { get; init; }

    public bool IsBot { get; init; }

    public BotLevel BotLevel { get; init; }

    public Look Look { get; init; } = Look.Default;

    /// <summary>What the player had earned when they took the seat (null for bots): the result shows the XP and the unlocks of the match from it.</summary>
    public Progress? Progress { get; init; }

    /// <summary>The level shown in the lobby and the match (bots: by their strength).</summary>
    public int Level { get; init; }
}

/// <summary>
/// One match in memory: its lobby, and once started its <see cref="GameState"/>. Every change happens under <see cref="LockAsync"/>;
/// the methods return the messages for the browsers, which the caller sends while it still holds the lock (so they arrive in order).
/// </summary>
public sealed class MatchRoom
{
    public const double MaxStamina = 9;
    public const double RetreatSeconds = 3;
    public const double BotThinkSeconds = 2.2;

    internal static readonly string[] BunnyNames =
    [
        "Hoppel", "Mümmel", "Puschel", "Klopfer", "Flocke", "Stampfer", "Löffel", "Möhrchen", "Krümel", "Schnuffel", "Wuschel", "Fiete", "Lotte", "Bommel", "Kasimir",
        "Rübe", "Knöpfchen", "Socke", "Zottel", "Pünktchen", "Hops", "Brummel", "Flitzer", "Nuss",
    ];

    private static readonly string[] BotTeamNames = ["Rübenräuber", "Karotten-Kommando", "Löffelohren-Legion", "Mümmel-Miliz", "Kaninchen-Kompanie", "Bau-Brigade", "Hasen-Horde", "Möhren-Mafia"];

    private readonly SemaphoreSlim _gate = new(1, 1);

    public MatchRoom(Match match, World world)
    {
        MatchId = match.Id;
        Token = match.Token;
        Name = match.Name;
        HostPlayerId = match.HostPlayerId;
        Status = match.Status;
        MaxTeams = match.MaxTeams;
        BunniesPerTeam = match.BunniesPerTeam;
        BunnyHealth = match.BunnyHealth;
        TurnSeconds = match.TurnSeconds;
        CrateRate = match.CrateRate;
        World = world;
    }

    public long MatchId { get; }

    public Guid Token { get; }

    public string Name { get; }

    public long HostPlayerId { get; }

    public MatchStatus Status { get; private set; }

    public int MaxTeams { get; }

    public int BunniesPerTeam { get; }

    public int BunnyHealth { get; }

    public int TurnSeconds { get; }

    /// <summary>How often supply crates fall in this match.</summary>
    public CrateRate CrateRate { get; }

    public World World { get; }

    public List<LobbySlot> Slots { get; } = [];

    /// <summary>The browsers in the room: connection id → player id.</summary>
    public Dictionary<string, long> Connections { get; } = [];

    public GameState? Game { get; private set; }

    public ResultDto? Result { get; private set; }

    public DateTime LastActivity { get; set; } = DateTime.UtcNow;

    /// <summary>The outcome is not saved yet (the ticker saves it).</summary>
    public bool NeedsSaving { get; set; }

    public async Task<IDisposable> LockAsync()
    {
        await _gate.WaitAsync();
        return new Releaser(_gate);
    }

    public bool IsConnected(long playerId) => Connections.ContainsValue(playerId);

    /// <summary>Whether a player of a team (not a spectator, not a bot) is connected to the running match.</summary>
    public bool AnyPlayerConnected => Game is { } g && g.Teams.Any(t => t.PlayerId is { } id && !t.Surrendered && IsConnected(id));

    /// <summary>Since when no player of the match is connected (null while one is).</summary>
    public DateTime? PlayersGoneSince { get; set; }

    // ---------------------------------------------------------------- lobby

    /// <summary>Gives a player a seat in the lobby (when one is free); a player who already has one keeps it.</summary>
    public List<Outgoing> SeatPlayer(Player player)
    {
        var outgoing = new List<Outgoing>();
        if (Status != MatchStatus.Lobby || Slots.Any(s => s.PlayerId == player.Id) || Slots.Count >= MaxTeams)
        {
            return outgoing;
        }

        Slots.Add(new LobbySlot
        {
            TeamIndex = FreeTeamIndex(), PlayerId = player.Id, PlayerName = player.DisplayName, TeamName = player.TeamName, Color = FreeColor(player.TeamColor),
            Look = Look.Of(player), Progress = Progress.Of(player), Level = Cosmetics.LevelOf(player.Xp),
        });
        outgoing.Add(System($"{player.DisplayName} ist dabei."));
        outgoing.Add(new Outgoing("Room", ToDto()));
        return outgoing;
    }

    public List<Outgoing> AddBot(long playerId, BotLevel level)
    {
        RequireHostInLobby(playerId);
        if (Slots.Count >= MaxTeams)
        {
            throw new BusinessException("Alle Plätze sind besetzt.");
        }

        var name = BotTeamNames.FirstOrDefault(n => Slots.All(s => s.TeamName != n)) ?? $"Bots {Slots.Count + 1}";
        Slots.Add(new LobbySlot
        {
            TeamIndex = FreeTeamIndex(), PlayerName = "Bot (" + LevelName(level) + ")", TeamName = name, Color = FreeColor(null), IsBot = true, BotLevel = level,
            Look = Cosmetics.RandomLook(Random.Shared), Level = BotShownLevel(level),
        });
        return [new Outgoing("Room", ToDto())];
    }

    /// <summary>The host removes a seat (not their own); a player leaves their own.</summary>
    public List<Outgoing> RemoveSlot(long playerId, int teamIndex)
    {
        if (Status != MatchStatus.Lobby)
        {
            throw new BusinessException("Das Spiel läuft schon.");
        }

        var slot = Slots.FirstOrDefault(s => s.TeamIndex == teamIndex) ?? throw new BusinessException("Diesen Platz gibt es nicht.");
        var own = slot.PlayerId == playerId;
        if (!own && playerId != HostPlayerId)
        {
            throw new AccessDeniedException("Nur der Gastgeber entfernt Teams.");
        }

        if (own && playerId == HostPlayerId)
        {
            throw new BusinessException("Der Gastgeber bleibt im Spiel.");
        }

        Slots.Remove(slot);
        return [new Outgoing("Room", ToDto())];
    }

    public IReadOnlyList<TeamSlot> TeamsForStart(long playerId)
    {
        RequireHostInLobby(playerId);
        if (Slots.Count < 2)
        {
            throw new BusinessException("Es braucht mindestens zwei Teams – lade jemanden ein oder nimm einen Bot dazu.");
        }

        return Slots.OrderBy(s => s.TeamIndex).Select(s => new TeamSlot(s.TeamIndex, s.PlayerId, s.IsBot, s.BotLevel, s.TeamName, s.Color, s.Look)).ToList();
    }

    private void RequireHostInLobby(long playerId)
    {
        if (playerId != HostPlayerId)
        {
            throw new AccessDeniedException("Das darf nur der Gastgeber.");
        }

        if (Status != MatchStatus.Lobby)
        {
            throw new BusinessException("Das Spiel läuft schon.");
        }
    }

    private int FreeTeamIndex()
    {
        var i = 0;
        while (Slots.Any(s => s.TeamIndex == i))
        {
            i++;
        }

        return i;
    }

    /// <summary>
    /// A colour for a new team: the wish when no team in the lobby has a similar one, else the colour of the palette that differs most from
    /// every colour already taken (so red and orange never play against each other).
    /// </summary>
    private string FreeColor(string? wish)
    {
        var taken = Slots.Select(s => s.Color).ToList();
        const double similar = 120;
        if (wish is not null && taken.All(c => ColorDistance(c, wish) > similar))
        {
            return wish;
        }

        return GameRules.TeamColors.Select(c => c.Value)
            .Where(c => taken.All(t => !string.Equals(t, c, StringComparison.OrdinalIgnoreCase)))
            .OrderByDescending(c => taken.Count == 0 ? 0 : taken.Min(t => ColorDistance(t, c)))
            .FirstOrDefault() ?? "#888888";
    }

    /// <summary>The distance of two #rrggbb colours (weighted RGB, roughly as the eye sees it).</summary>
    internal static double ColorDistance(string a, string b)
    {
        static (int R, int G, int B) Parse(string c) => c.Length == 7
            ? (Convert.ToInt32(c[1..3], 16), Convert.ToInt32(c[3..5], 16), Convert.ToInt32(c[5..7], 16))
            : (128, 128, 128);
        var (r1, g1, b1) = Parse(a);
        var (r2, g2, b2) = Parse(b);
        var rMean = (r1 + r2) / 2.0;
        var dr = r1 - r2;
        var dg = g1 - g2;
        var db = b1 - b2;
        return Math.Sqrt((2 + rMean / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rMean) / 256) * db * db);
    }

    /// <summary>Bots show a level by their strength (a hard bot looks like a veteran).</summary>
    private static int BotShownLevel(BotLevel level) => level switch
    {
        BotLevel.Easy => 2 + Random.Shared.Next(3),
        BotLevel.Hard => 18 + Random.Shared.Next(8),
        _ => 8 + Random.Shared.Next(5),
    };

    private static string LevelName(BotLevel level) => level switch
    {
        BotLevel.Easy => "leicht",
        BotLevel.Hard => "schwer",
        _ => "normal",
    };

    // ---------------------------------------------------------------- start

    /// <summary>Builds the island, places the bunnies and starts the first turn.</summary>
    public List<Outgoing> StartGame(IReadOnlyList<Weapon> weapons, DateTime now)
    {
        var random = new Random(unchecked((int)(MatchId * 7919) ^ World.Seed ^ now.Millisecond));
        var terrain = Terrain.Generate(World.GridSize, World.Seed, World.HillHeight, World.Roughness, World.WaterLevel, World.Theme);
        var game = new GameState
        {
            Terrain = terrain, Gravity = World.Gravity, MaxWind = World.MaxWind, Theme = World.Theme, WorldName = World.Name, TurnSeconds = TurnSeconds, Random = random,
            CrateRate = CrateRate, BunnyHealth = BunnyHealth,
        };
        foreach (var w in weapons)
        {
            game.Weapons.Add(WeaponState.From(w));
        }

        var names = BunnyNames.OrderBy(_ => random.Next()).ToList();
        var nextId = 1;
        foreach (var slot in Slots.OrderBy(s => s.TeamIndex))
        {
            var team = new TeamState
            {
                Index = slot.TeamIndex, Name = slot.TeamName, Color = slot.Color, PlayerId = slot.PlayerId, IsBot = slot.IsBot, BotLevel = slot.BotLevel,
                Look = slot.Look, Progress = slot.Progress, Level = slot.Level,
            };
            // limited weapons; the ones with 0 shots come only from supply crates
            foreach (var w in game.Weapons.Where(w => w.Ammo >= 0))
            {
                team.Ammo[w.Id] = w.Ammo;
            }

            game.Teams.Add(team);
            for (var k = 0; k < BunniesPerTeam; k++)
            {
                var spot = FindSpot(game, random);
                var middle = terrain.Width / 2;
                game.Bunnies.Add(new BunnyState
                {
                    Id = nextId, TeamIndex = team.Index, Name = names[(nextId - 1) % names.Count], Position = spot, Health = BunnyHealth,
                    Yaw = Math.Atan2(middle - spot.X, middle - spot.Z),
                });
                nextId++;
            }
        }

        Game = game;
        Status = MatchStatus.Running;
        game.CurrentTeam = random.Next(game.Teams.Count) - 1;
        var outgoing = new List<Outgoing> { System("Das Spiel beginnt. Viel Glück, Löffelohren!") };
        NextTurn(now, outgoing, announce: false);
        outgoing.Insert(0, new Outgoing("Room", ToDto()));
        return outgoing;
    }

    internal static V3 FindSpot(GameState game, Random random)
    {
        var terrain = game.Terrain;
        var best = new V3(terrain.Width / 2, terrain.HeightAt(terrain.Width / 2, terrain.Width / 2), terrain.Width / 2);
        var bestDistance = -1.0;
        for (var attempt = 0; attempt < 600; attempt++)
        {
            var x = 2 + random.NextDouble() * (terrain.Width - 4);
            var z = 2 + random.NextDouble() * (terrain.Width - 4);
            var y = terrain.HeightAt(x, z);
            if (y < terrain.WaterLevel + 0.4 || terrain.SlopeAt(x, z) > 0.9)
            {
                continue;
            }

            var spot = new V3(x, y, z);
            var nearest = game.Bunnies.Count == 0 ? 99 : game.Bunnies.Min(b => b.Position.DistanceTo(spot));
            if (nearest > 5)
            {
                return spot;
            }

            if (nearest > bestDistance)
            {
                bestDistance = nearest;
                best = spot;
            }
        }

        return best;
    }

    // ---------------------------------------------------------------- turns

    private TeamState? TeamOf(long playerId) => Game?.Teams.FirstOrDefault(t => t.PlayerId == playerId);

    /// <summary>The bunny of the turn, when it belongs to the player and may act in this phase.</summary>
    private BunnyState RequireTurn(long playerId, params TurnPhase[] phases)
    {
        var game = Game ?? throw new BusinessException("Das Spiel läuft nicht.");
        if (Status != MatchStatus.Running || !phases.Contains(game.Phase))
        {
            throw new BusinessException("Gerade nicht.");
        }

        var team = game.Teams.FirstOrDefault(t => t.Index == game.CurrentTeam);
        if (team?.PlayerId != playerId)
        {
            throw new AccessDeniedException("Du bist nicht am Zug.");
        }

        var bunny = game.CurrentBunny;
        if (bunny is null || !bunny.Alive)
        {
            throw new BusinessException("Dein Hase kann nicht mehr.");
        }

        return bunny;
    }

    public List<Outgoing> Move(long playerId, string connectionId, double x, double z, double yaw)
    {
        var game = Game!;
        var bunny = RequireTurn(playerId, TurnPhase.Aiming, TurnPhase.Retreat);
        var terrain = game.Terrain;
        var from = bunny.Position;
        var dx = x - from.X;
        var dz = z - from.Z;
        var distance = Math.Sqrt(dx * dx + dz * dz);
        var ground = terrain.HeightAt(x, z);
        var rise = ground - from.Y;
        var ok = double.IsFinite(x) && double.IsFinite(z) && terrain.Inside(x, z) && distance <= 1.6 && distance <= game.Stamina + 0.05
                 && ground >= terrain.WaterLevel + 0.05 && !(rise > 0.3 && rise / Math.Max(distance, 0.01) > 1.6);
        if (!ok)
        {
            // the browser is told where the bunny really is
            return [new Outgoing("Moved", new MovedDto(bunny.Id, bunny.Position.X, bunny.Position.Y, bunny.Position.Z, bunny.Yaw, game.Stamina, true), connectionId)];
        }

        bunny.Position = new V3(x, ground, z);
        bunny.Yaw = double.IsFinite(yaw) ? yaw : bunny.Yaw;
        game.Stamina = Math.Max(0, game.Stamina - distance);
        LastActivity = DateTime.UtcNow;
        var outgoing = new List<Outgoing>();
        // a crate under the feet: taken for the team (a turbo crate adds stamina, so the Moved message comes after it)
        var picked = Crates.PickUp(game, bunny);
        outgoing.Add(new Outgoing("Moved", new MovedDto(bunny.Id, bunny.Position.X, bunny.Position.Y, bunny.Position.Z, bunny.Yaw, game.Stamina, false)));
        foreach (var (crate, text) in picked)
        {
            var team = game.Teams.First(t => t.Index == bunny.TeamIndex);
            outgoing.Add(new Outgoing("CratePicked", new CratePickedDto(crate.Id, bunny.Id, team.Index, crate.Look, text, TeamDtoOf(team), BunnyOf(bunny), Math.Round(game.Stamina, 2)),
                ToAll: true));
        }

        return outgoing;
    }

    public List<Outgoing> AimAt(long playerId, double yaw, double pitch, long weaponId)
    {
        var bunny = RequireTurn(playerId, TurnPhase.Aiming);
        if (double.IsFinite(yaw))
        {
            bunny.Yaw = yaw;
        }

        return [new Outgoing("Aim", new AimDto(bunny.Id, yaw, pitch, weaponId))];
    }

    public List<Outgoing> Fire(long playerId, long weaponId, Aim aim, DateTime now)
    {
        var game = Game!;
        var bunny = RequireTurn(playerId, TurnPhase.Aiming);
        var team = game.Teams.First(t => t.Index == game.CurrentTeam);
        var weapon = game.Weapons.FirstOrDefault(w => w.Id == weaponId) ?? throw new BusinessException("Diese Waffe gibt es nicht.");
        if (!Bot.HasAmmo(team, weapon))
        {
            throw new BusinessException("Keine Munition mehr.");
        }

        if (!double.IsFinite(aim.Yaw) || !double.IsFinite(aim.Pitch) || !double.IsFinite(aim.Power) || !double.IsFinite(aim.TargetX) || !double.IsFinite(aim.TargetZ))
        {
            throw new BusinessException("Ungültiges Ziel.");
        }

        var clamped = aim with
        {
            Pitch = Math.Clamp(aim.Pitch, -1.2, 1.5),
            Power = Math.Clamp(aim.Power, 0.05, 1),
            TargetX = Math.Clamp(aim.TargetX, 0, game.Terrain.Width),
            TargetZ = Math.Clamp(aim.TargetZ, 0, game.Terrain.Width),
        };
        if (weapon.Kind == WeaponKind.Teleport && !Simulation.CanTeleport(game, bunny, aim.TargetX, aim.TargetZ))
        {
            throw new BusinessException("Da kann der Hase nicht hin.");
        }
        LastActivity = DateTime.UtcNow;
        return Shoot(team, bunny, weapon, clamped, now);
    }

    private List<Outgoing> Shoot(TeamState team, BunnyState bunny, WeaponState weapon, Aim aim, DateTime now)
    {
        var game = Game!;
        bunny.Yaw = weapon.Kind is WeaponKind.Airstrike or WeaponKind.Teleport ? bunny.Yaw : aim.Yaw;
        if (team.Ammo.TryGetValue(weapon.Id, out var left))
        {
            team.Ammo[weapon.Id] = left - 1;
        }

        var result = Simulation.Fire(game, bunny, weapon, aim);
        foreach (var t in game.Teams.Where(t => t.EliminatedAtTurn is null && !game.TeamAlive(t.Index)))
        {
            t.EliminatedAtTurn = game.TurnNumber;
        }

        game.Phase = TurnPhase.Resolving;
        game.PhaseEnds = now.AddSeconds(result.Duration + 0.6);
        game.BotActAt = null;
        return [new Outgoing("Shot", result)];
    }

    public List<Outgoing> SkipTurn(long playerId, DateTime now)
    {
        RequireTurn(playerId, TurnPhase.Aiming, TurnPhase.Retreat);
        var outgoing = new List<Outgoing>();
        NextTurn(now, outgoing);
        return outgoing;
    }

    public List<Outgoing> Surrender(long playerId, DateTime now)
    {
        var game = Game ?? throw new BusinessException("Das Spiel läuft nicht.");
        var team = TeamOf(playerId) ?? throw new BusinessException("Du spielst nicht mit.");
        if (Status != MatchStatus.Running || team.Surrendered)
        {
            return [];
        }

        team.Surrendered = true;
        foreach (var b in game.Bunnies.Where(b => b.TeamIndex == team.Index))
        {
            b.Health = 0;
        }

        team.EliminatedAtTurn ??= game.TurnNumber;
        var outgoing = new List<Outgoing> { System($"{team.Name} gibt auf und hoppelt davon.") };
        if (AliveTeams().Count <= 1 || (game.CurrentTeam == team.Index && game.Phase != TurnPhase.Resolving))
        {
            NextTurn(now, outgoing);
        }
        else
        {
            outgoing.Add(new Outgoing("Turn", TurnUpdate(now)));
        }

        return outgoing;
    }

    /// <summary>The clock of the match (called by the ticker every few hundred milliseconds).</summary>
    public List<Outgoing> Tick(DateTime now)
    {
        var outgoing = new List<Outgoing>();
        var game = Game;
        if (game is null || Status != MatchStatus.Running)
        {
            return outgoing;
        }

        switch (game.Phase)
        {
            case TurnPhase.Aiming when now >= game.PhaseEnds:
                outgoing.Add(System("Zeit abgelaufen."));
                NextTurn(now, outgoing);
                break;
            case TurnPhase.Aiming when game.BotActAt is { } at && now >= at:
                game.BotActAt = null;
                BotAct(now, outgoing);
                break;
            case TurnPhase.Resolving when now >= game.PhaseEnds:
                var team = game.Teams.FirstOrDefault(t => t.Index == game.CurrentTeam);
                if (AliveTeams().Count > 1 && game.CurrentBunny is { Alive: true } && team is { IsBot: false })
                {
                    game.Phase = TurnPhase.Retreat;
                    game.PhaseEnds = now.AddSeconds(RetreatSeconds);
                    outgoing.Add(new Outgoing("Turn", TurnUpdate(now)));
                }
                else
                {
                    NextTurn(now, outgoing);
                }

                break;
            case TurnPhase.Retreat when now >= game.PhaseEnds:
                NextTurn(now, outgoing);
                break;
        }

        return outgoing;
    }

    private void BotAct(DateTime now, List<Outgoing> outgoing)
    {
        var game = Game!;
        var team = game.Teams.First(t => t.Index == game.CurrentTeam);
        var bunny = game.CurrentBunny;
        if (bunny is null || !bunny.Alive)
        {
            NextTurn(now, outgoing);
            return;
        }

        var decision = Bot.Plan(game, team, bunny);
        if (decision is null)
        {
            outgoing.Add(System($"{team.Name} setzt aus."));
            NextTurn(now, outgoing);
            return;
        }

        if (decision.Weapon.Kind != WeaponKind.Airstrike)
        {
            bunny.Yaw = decision.Aim.Yaw;
            outgoing.Add(new Outgoing("Aim", new AimDto(bunny.Id, decision.Aim.Yaw, decision.Aim.Pitch, decision.Weapon.Id)));
        }

        outgoing.AddRange(Shoot(team, bunny, decision.Weapon, decision.Aim, now));
    }

    private List<TeamState> AliveTeams() => Game!.Teams.Where(t => !t.Surrendered && Game.TeamAlive(t.Index)).ToList();

    private void NextTurn(DateTime now, List<Outgoing> outgoing, bool announce = true)
    {
        var game = Game!;
        foreach (var t in game.Teams.Where(t => t.EliminatedAtTurn is null && !game.TeamAlive(t.Index)))
        {
            t.EliminatedAtTurn = game.TurnNumber;
        }

        var alive = AliveTeams();
        if (alive.Count <= 1)
        {
            EndGame(alive.Count == 1 ? alive[0] : null, outgoing);
            return;
        }

        // the next team after the current one that still has bunnies
        var order = game.Teams.OrderBy(t => t.Index).ToList();
        var position = order.FindIndex(t => t.Index == game.CurrentTeam);
        TeamState next = alive[0];
        for (var step = 1; step <= order.Count; step++)
        {
            var candidate = order[((position < 0 ? -1 : position) + step + order.Count) % order.Count];
            if (alive.Contains(candidate))
            {
                next = candidate;
                break;
            }
        }

        var bunnies = game.Bunnies.Where(b => b.TeamIndex == next.Index && b.Alive).OrderBy(b => b.Id).ToList();
        var bunny = bunnies[next.BunnyCursor % bunnies.Count];
        next.BunnyCursor++;

        game.TurnNumber++;
        game.CurrentTeam = next.Index;
        game.CurrentBunnyId = bunny.Id;
        game.Phase = TurnPhase.Aiming;
        game.PhaseEnds = now.AddSeconds(TurnSeconds);
        game.Stamina = MaxStamina;
        var angle = game.Random.NextDouble() * Math.PI * 2;
        var strength = game.MaxWind * Math.Pow(game.Random.NextDouble(), 1.3);
        game.Wind = new V3(Math.Sin(angle) * strength, 0, Math.Cos(angle) * strength);
        if (next.TurboPending)
        {
            game.Stamina += Crates.TurboStamina;
            next.TurboPending = false;
        }

        game.BotActAt = next.IsBot ? now.AddSeconds(BotThinkSeconds) : null;
        if (announce)
        {
            outgoing.Add(System($"{next.Name}: {bunny.Name} ist dran."));
        }

        // maybe a supply crate falls (it is in the Turn message already; CrateDrop lets the browsers animate the fall)
        var crate = Crates.TryDrop(game);
        outgoing.Add(new Outgoing("Turn", TurnUpdate(now)));
        if (crate is not null)
        {
            outgoing.Add(System("Eine Kiste fällt vom Himmel!"));
            outgoing.Add(new Outgoing("CrateDrop", new CrateDropDto(CrateOf(crate))));
        }
    }

    private void EndGame(TeamState? winner, List<Outgoing> outgoing)
    {
        var game = Game!;
        game.Phase = TurnPhase.Over;
        game.WinnerTeam = winner?.Index;
        Status = MatchStatus.Finished;
        Result = BuildResult(aborted: false);
        NeedsSaving = true;
        outgoing.Add(System(winner is null ? "Unentschieden – alle Hasen sind weg." : $"{winner.Name} gewinnt!"));
        outgoing.Add(new Outgoing("GameOver", Result));
    }

    /// <summary>Ends the match from outside (an administrator, or nobody is left).</summary>
    public List<Outgoing> Abort(string reason)
    {
        if (Status is MatchStatus.Finished or MatchStatus.Aborted)
        {
            return [];
        }

        if (Game is { } game)
        {
            game.Phase = TurnPhase.Over;
        }

        Status = MatchStatus.Aborted;
        Result = BuildResult(aborted: true);
        return [System(reason), new Outgoing("GameOver", Result)];
    }

    private ResultDto BuildResult(bool aborted)
    {
        var game = Game;
        if (game is null)
        {
            return new ResultDto(null, null, aborted, []);
        }

        // the winner first, then by how long a team survived
        var ranked = game.Teams
            .OrderBy(t => t.Index == game.WinnerTeam ? 0 : 1)
            .ThenByDescending(t => t.EliminatedAtTurn ?? int.MaxValue)
            .ThenByDescending(t => t.DamageDealt)
            .ToList();
        var teams = ranked.Select((t, i) => ResultOf(t, i + 1, t.Index == game.WinnerTeam && !aborted, aborted)).ToList();
        var winner = game.Teams.FirstOrDefault(t => t.Index == game.WinnerTeam);
        return new ResultDto(aborted ? null : winner?.Index, aborted ? null : winner?.Name, aborted, teams);
    }

    /// <summary>The result of a team; a player's team also gets the XP of the match (the same numbers MatchLogic.FinishAsync saves), the new level and what it unlocked.</summary>
    private static TeamResultDto ResultOf(TeamState t, int placement, bool won, bool aborted)
    {
        var look = t.Look;
        if (t.IsBot || t.Progress is not { } before || aborted)
        {
            return new TeamResultDto(t.Index, t.Name, t.Color, placement, t.Kills, t.DamageDealt, t.IsBot, look.Fur, look.Outfit, look.Face, look.Frame, t.Level, 0, t.Level, t.Level, []);
        }

        var after = before.After(won, placement, t.Kills, t.DamageDealt);
        return new TeamResultDto(t.Index, t.Name, t.Color, placement, t.Kills, t.DamageDealt, false, look.Fur, look.Outfit, look.Face, look.Frame, before.Level,
            after.Xp - before.Xp, before.Level, after.Level, Cosmetics.NewlyUnlocked(before, after));
    }

    public IReadOnlyList<TeamOutcome> Outcomes()
        => Result?.Teams.Select(t => new TeamOutcome(t.Index, t.Kills, t.Damage, t.Placement)).ToList() ?? [];

    public static Outgoing System(string text) => new("Chat", new ChatDto("System", "#888888", text, true));

    public Outgoing Chat(long playerId, string text)
    {
        var name = Slots.FirstOrDefault(s => s.PlayerId == playerId)?.PlayerName ?? "Zuschauer";
        var color = Game?.Teams.FirstOrDefault(t => t.PlayerId == playerId)?.Color ?? Slots.FirstOrDefault(s => s.PlayerId == playerId)?.Color ?? "#888888";
        var clean = text.Trim();
        return new Outgoing("Chat", new ChatDto(name, color, clean.Length > 200 ? clean[..200] : clean, false));
    }

    // ---------------------------------------------------------------- snapshots

    public RoomDto ToDto()
    {
        var now = DateTime.UtcNow;
        var slots = Slots.OrderBy(s => s.TeamIndex)
            .Select(s => new LobbySlotDto(s.TeamIndex, s.PlayerId, s.PlayerName, s.TeamName, s.Color, s.IsBot, s.BotLevel.ToString(), s.IsBot || (s.PlayerId is { } id && IsConnected(id)),
                s.Look.Fur, s.Look.Outfit, s.Look.Face, s.Look.Frame, s.Level))
            .ToList();
        GameDto? game = null;
        if (Game is { } g)
        {
            var world = new WorldDto(g.WorldName, g.Terrain.Size, Terrain.CellSize, g.Theme.ToString(), g.Terrain.WaterLevel, g.Gravity, g.MaxWind, g.Terrain.ToBase64());
            var weapons = g.Weapons.Select(w => new WeaponDto(w.Id, w.Name, w.Kind.ToString(), w.Damage, w.BlastRadius, w.AffectedByWind, w.FuseSeconds, w.ClusterCount,
                w.Pellets, w.Ammo)).ToList();
            game = new GameDto(world, Teams(), Bunnies(), weapons, Turn(now), CratesOf(g));
        }

        return new RoomDto(Token.ToString(), Name, Status.ToString(), HostPlayerId, World.Name, World.Theme.ToString(), MaxTeams, BunniesPerTeam, BunnyHealth, TurnSeconds,
            slots, game, Result, (int)CrateRate, GameRules.CrateRateName(CrateRate));
    }

    private TurnUpdateDto TurnUpdate(DateTime now) => new(Turn(now), Bunnies(), Teams(), CratesOf(Game!));

    private static List<CrateDto> CratesOf(GameState game) => game.Crates.Select(CrateOf).ToList();

    private static CrateDto CrateOf(CrateState c) => new(c.Id, Math.Round(c.Position.X, 3), Math.Round(c.Position.Y, 3), Math.Round(c.Position.Z, 3), c.Look);

    private TurnDto Turn(DateTime now)
    {
        var g = Game!;
        var endsIn = (int)Math.Max(0, (g.PhaseEnds - now).TotalMilliseconds);
        var turnMs = g.Phase == TurnPhase.Retreat ? (int)(RetreatSeconds * 1000) : TurnSeconds * 1000;
        return new TurnDto(g.TurnNumber, g.CurrentTeam, g.CurrentBunnyId, g.Phase.ToString(), endsIn, turnMs, Math.Round(g.Wind.X, 3), Math.Round(g.Wind.Z, 3), g.MaxWind,
            Math.Round(g.Stamina, 2), MaxStamina);
    }

    private List<BunnyDto> Bunnies() => Game!.Bunnies.Select(BunnyOf).ToList();

    private BunnyDto BunnyOf(BunnyState b)
        => new(b.Id, b.TeamIndex, b.Name, Math.Round(b.Position.X, 3), Math.Round(b.Position.Y, 3), Math.Round(b.Position.Z, 3), Math.Round(b.Yaw, 3), b.Health, BunnyHealth,
            b.Shield);

    private List<TeamDto> Teams() => Game!.Teams.Select(TeamDtoOf).ToList();

    private TeamDto TeamDtoOf(TeamState t)
        => new(t.Index, t.Name, t.Color, t.PlayerId, t.IsBot,
            t.Ammo.ToDictionary(a => a.Key.ToString(global::System.Globalization.CultureInfo.InvariantCulture), a => a.Value),
            t.Surrendered || !Game!.TeamAlive(t.Index), t.Kills, t.DamageDealt, t.Look.Fur, t.Look.Outfit, t.Look.Face, t.Look.Frame, t.Level, t.Effects);

    private sealed class Releaser(SemaphoreSlim gate) : IDisposable
    {
        private int _released;

        public void Dispose()
        {
            if (Interlocked.Exchange(ref _released, 1) == 0)
            {
                gate.Release();
            }
        }
    }
}
