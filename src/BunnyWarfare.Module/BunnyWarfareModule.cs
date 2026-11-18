using BunnyWarfare.Business;
using BunnyWarfare.Data;
using BunnyWarfare.Game;
using BunnyWarfare.Web;
using MatGame.Sdk;
using Microsoft.AspNetCore.Routing;
using Microsoft.EntityFrameworkCore;

namespace BunnyWarfare.Module;

/// <summary>
/// BunnyWarfare as a game of MatGame: the player app at <c>/bunnywarfare/</c>, its API at <c>/bunnywarfare/api</c>, the hub at <c>/bunnywarfare/hub</c>,
/// the tables in the schema <c>bunnywarfare</c>, the admin pages under <c>/Admin/BunnyWarfare</c>. The host (MatGame) signs the players in.
/// </summary>
public sealed class BunnyWarfareModule : IGameModule
{
    /// <summary>The game id (path, schema, apps).</summary>
    public const string Id = "bunnywarfare";

    /// <summary>The protocol of the game: rises only with a change of the API or the hub old apps cannot follow.</summary>
    public const int Protocol = 1;

    /// <summary>The variable that names an old stand-alone BunnyWarfare database to take over once at start (a PostgreSQL connection string).</summary>
    public const string ImportVariable = "MATGAME_IMPORT_BUNNYWARFARE";

    public GameInfo Info { get; } = new(
        Id,
        "BunnyWarfare",
        "Rundenbasierte 3D-Hasenschlacht: Karotten, Granaten und Luftschläge auf kleinen Inseln – gegen Bots oder Freunde.",
        AppInfo.Version,
        Protocol,
        MinClient: null,
        Accent: "#c2410c",
        Cover: "img/cover.jpg",
        Icon: "img/icon-512.png");

    public IReadOnlyList<AdminLink> Admin { get; } =
    [
        new("Übersicht", "/Admin/BunnyWarfare", "dashboard"),
        new("Spieler", "/Admin/BunnyWarfare/Players", "users"),
        new("Spiele", "/Admin/BunnyWarfare/Matches", "gamepad"),
        new("Welten", "/Admin/BunnyWarfare/Worlds", "globe"),
        new("Waffen", "/Admin/BunnyWarfare/Weapons", "rocket"),
        new("Einstellungen", "/Admin/BunnyWarfare/System", "settings"),
        new("Import", "/Admin/BunnyWarfare/Import", "download"),
    ];

    public void AddServices(IServiceCollection services, GameEnvironment environment)
    {
        services.AddDbContext<AppDbContext>(o => AppDatabase.Configure(o, environment.ConnectionString));
        services.AddSingleton<RoomRegistry>();
        services.AddHostedService<GameTicker>();
    }

    public void MapGame(IEndpointRouteBuilder game, GameEnvironment environment)
    {
        game.MapApi(Info);
        game.MapHub<GameHub>("/hub", o => o.ApplicationMaxBufferSize = 64 * 1024).RequireCors(MatGameProtocol.AppCorsPolicy);
        PlayerApp.Map(game, environment.BasePath);
    }

    public async Task StartAsync(IServiceProvider services, CancellationToken ct)
    {
        using var scope = services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var log = scope.ServiceProvider.GetRequiredService<ILogger<BunnyWarfareModule>>();
        for (var attempt = 1; ; attempt++)
        {
            try
            {
                await db.Database.MigrateAsync(ct);
                break;
            }
            catch (Exception e) when (attempt < 15 && !ct.IsCancellationRequested)
            {
                log.LogWarning("BunnyWarfare: the database is not ready yet ({Message}), attempt {Attempt}", e.Message, attempt);
                await Task.Delay(TimeSpan.FromSeconds(2), ct);
            }
        }

        await SeedLogic.EnsureAsync(db, Actor.System);
        var stale = await MatchLogic.AbortStaleAsync(db, Actor.System);
        if (stale > 0)
        {
            log.LogInformation("BunnyWarfare: {Count} matches of the last run were closed", stale);
        }

        if (Environment.GetEnvironmentVariable(ImportVariable) is { Length: > 0 } source)
        {
            var accounts = scope.ServiceProvider.GetRequiredService<IGameAccounts>();
            try
            {
                var report = await ImportLogic.ImportAsync(db, Actor.System, accounts, source, onlyOnce: true, ct);
                log.LogInformation("BunnyWarfare import: {Report}", report.Summary);
            }
            catch (Exception e)
            {
                log.LogError(e, "BunnyWarfare import from {Variable} failed", ImportVariable);
            }
        }
    }

    public Task<GameStats> StatsAsync(IServiceProvider services, CancellationToken ct)
    {
        var registry = services.GetRequiredService<RoomRegistry>();
        var rooms = registry.Rooms;
        var players = rooms.SelectMany(r => r.Connections.Values).Distinct().Count();
        var running = rooms.Count(r => r.Status == MatchStatus.Running);
        return Task.FromResult(new GameStats(players, running));
    }

    public async Task<GameProfile?> ProfileAsync(IServiceProvider services, long accountId, CancellationToken ct)
    {
        using var scope = services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        var player = await db.Players.AsNoTracking().FirstOrDefaultAsync(p => p.Id == accountId && p.UpdateState != UpdateState.Deleted, ct);
        return player is null ? null : new GameProfile(Cosmetics.LevelOf(player.Xp), $"{player.GamesWon} {(player.GamesWon == 1 ? "Sieg" : "Siege")}");
    }

    public async Task AccountDeletedAsync(IServiceProvider services, long accountId, CancellationToken ct)
    {
        using var scope = services.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        await PlayerLogic.AccountDeletedAsync(db, Actor.System, accountId);
    }
}
