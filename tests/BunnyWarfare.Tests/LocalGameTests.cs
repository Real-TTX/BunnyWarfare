using System.Collections.Concurrent;
using System.Text.Json;
using BunnyWarfare.Data;
using BunnyWarfare.Local;
using MatGame.Local;

namespace BunnyWarfare.Tests;

/// <summary>
/// The offline game of the app answers the calls of the player app like the server: the API (session, worlds, quick match, profile) and the hub
/// (Join, AddBot, Start, Fire, Surrender) – here a whole short match against a bot, played through the same calls the browser part makes.
/// </summary>
public sealed class LocalGameTests : IAsyncLifetime
{
    private readonly string _folder = Path.Combine(Path.GetTempPath(), "bw-local-" + Guid.NewGuid().ToString("N"));
    private readonly FakeHost _host;
    private readonly BunnyWarfareLocal _game = new();

    public LocalGameTests() => _host = new FakeHost(_folder);

    public Task InitializeAsync() => _game.StartAsync(_host, CancellationToken.None);

    public async Task DisposeAsync()
    {
        await _game.DisposeAsync();
        if (Directory.Exists(_folder))
        {
            Directory.Delete(_folder, recursive: true);
        }
    }

    [Fact]
    public async Task TheSession_IsTheLocalGuest()
    {
        var session = await Get("/session");
        Assert.True(session.GetProperty("signedIn").GetBoolean());
        Assert.True(session.GetProperty("offline").GetBoolean());
        var player = session.GetProperty("player");
        Assert.Equal(BunnyWarfareLocal.LocalPlayerId, player.GetProperty("id").GetInt64());
        Assert.Equal("Hoppel", player.GetProperty("displayName").GetString());
        Assert.True(player.GetProperty("isGuest").GetBoolean());
    }

    [Fact]
    public async Task TheWorlds_AreTheSeededOnes_WithTerrainAndShowcase()
    {
        var worlds = await Get("/worlds");
        Assert.True(worlds.GetArrayLength() >= 12);
        var first = worlds[0];
        Assert.Equal("Möhrenwiese", first.GetProperty("name").GetString());
        var terrain = await Get($"/worlds/{first.GetProperty("id").GetInt64()}/terrain");
        Assert.False(string.IsNullOrEmpty(terrain.GetProperty("heights").GetString()));
        var showcase = await Get($"/showcase?worldId={first.GetProperty("id").GetInt64()}");
        Assert.Equal("Möhrenwiese", showcase.GetProperty("world").GetProperty("name").GetString());
        Assert.Equal(404, (await _game.RequestAsync("GET", "/worlds/999/terrain", null, CancellationToken.None)).Status);
    }

    [Fact]
    public async Task AQuickMatch_AgainstABot_IsPlayed_AndCountsInTheProfile()
    {
        var quick = await Post("/matches/quick", new { worldId = 1, bots = 1, level = "Easy" });
        var token = quick.GetProperty("token").GetString()!;

        var room = await Invoke("Join", token);
        Assert.Equal("Lobby", room!.Value.GetProperty("status").GetString());
        await Invoke("AddBot", "Easy");
        await Invoke("Start");
        Assert.Contains(_host.Sent, m => m.Name == "Turn");

        var match = _game.Rooms.Single();
        Assert.Equal(MatchStatus.Running, match.Status);

        // a shot when it is our turn (the bot plays its own turns on the clock), then we give up: the match is over
        if (match.Game!.Teams.First(t => t.Index == match.Game.CurrentTeam).PlayerId == BunnyWarfareLocal.LocalPlayerId)
        {
            var weapon = match.Game.Weapons.First(w => w.Ammo < 0);
            await Invoke("Fire", weapon.Id, 0.3, 0.6, 0.7, 0, 0);
            Assert.Contains(_host.Sent, m => m.Name == "Shot");
        }

        await Invoke("Surrender");
        await _game.TickAsync(Guid.Parse(token), match);
        Assert.Contains(_host.Sent, m => m.Name == "GameOver");
        Assert.Equal(MatchStatus.Finished, match.Status);

        // the profile knows the match (a loss without damage brings no XP, but it counts as played)
        var home = await Get("/home");
        Assert.Equal(1, home.GetProperty("stats").GetProperty("gamesPlayed").GetInt32());
        Assert.Equal(1, home.GetProperty("history").GetArrayLength());
        Assert.True(File.Exists(Path.Combine(_folder, LocalProfile.FileName)));

        // a second start reads the same profile
        await using var again = new BunnyWarfareLocal();
        await again.StartAsync(new FakeHost(_folder), CancellationToken.None);
        Assert.Equal(1, again.Player.GamesPlayed);
    }

    [Fact]
    public async Task TheHub_RefusesWhatIsNotAllowed_WithAMessage()
    {
        await Assert.ThrowsAsync<Business.BusinessException>(() => Invoke("Join", "kein-token"));
        await Assert.ThrowsAsync<Business.BusinessException>(() => Invoke("Start"));
        var token = (await Post("/matches/quick", new { bots = 1 })).GetProperty("token").GetString()!;
        await Invoke("Join", token);
        var error = await Assert.ThrowsAsync<Business.BusinessException>(() => Invoke("Start"));
        Assert.Contains("zwei Teams", error.Message);
    }

    [Fact]
    public async Task TheProfile_KeepsTeamNameAndLook_AndRefusesLockedItems()
    {
        var saved = await Put("/profile", new { displayName = "Mümmel", teamName = "Die Flinken", teamColor = "#2563EB" });
        Assert.Equal("Die Flinken", saved.GetProperty("teamName").GetString());
        Assert.Equal("#2563eb", saved.GetProperty("teamColor").GetString());

        var locked = await _game.RequestAsync("PUT", "/profile/look", Json(new { fur = "rainbow", outfit = "helmet", face = "none", frame = "wood" }), CancellationToken.None);
        Assert.Equal(400, locked.Status);
        Assert.Equal("fur", locked.Body!.Value.GetProperty("field").GetString());

        var look = await Put("/profile/look", new { fur = "caramel", outfit = "helmet", face = "blush", frame = "meadow" });
        Assert.Equal("caramel", look.GetProperty("fur").GetString());
        Assert.Equal("Mümmel", (await Get("/session")).GetProperty("player").GetProperty("displayName").GetString());
    }

    private async Task<JsonElement> Get(string path) => await Ok("GET", path, null);

    private async Task<JsonElement> Post(string path, object body) => await Ok("POST", path, body);

    private async Task<JsonElement> Put(string path, object body) => await Ok("PUT", path, body);

    private async Task<JsonElement> Ok(string method, string path, object? body)
    {
        var answer = await _game.RequestAsync(method, path, body is null ? null : Json(body), CancellationToken.None);
        Assert.True(answer.Status == 200, $"{method} {path}: {answer.Status} {answer.Body}");
        return answer.Body!.Value;
    }

    private Task<JsonElement?> Invoke(string method, params object[] args)
        => _game.InvokeAsync(method, args.Select(a => JsonSerializer.SerializeToElement(a, LocalJson.Options)).ToList(), CancellationToken.None);

    private static JsonElement Json(object value) => JsonSerializer.SerializeToElement(value, LocalJson.Options);

    private sealed class FakeHost(string folder) : ILocalHost
    {
        public ConcurrentQueue<(string Name, object?[] Args)> Sent { get; } = new();

        public string DataDirectory => folder;

        public string PlayerName => "Hoppel";

        public void Emit(string name, params object?[] args)
        {
            // the shell serializes every message: so does the fake (a shape that cannot be written would fail here)
            _ = JsonSerializer.Serialize(args, LocalJson.Options);
            Sent.Enqueue((name, args));
        }

        public void Log(string message)
        {
        }
    }
}
