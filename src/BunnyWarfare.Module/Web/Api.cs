using System.Globalization;
using BunnyWarfare.Business;
using BunnyWarfare.Data;
using BunnyWarfare.Game;
using MatGame.Sdk;
using Microsoft.AspNetCore.Routing;

namespace BunnyWarfare.Web;

/// <summary>
/// The JSON interface of the player app under <c>/bunnywarfare/api</c>: the game player, home, worlds, the background island, matches, leaderboard, profile.
/// Accounts (sign-in, registration, guests, passwords) are MatGame's host API (<c>/api/matgame/...</c>). Every call goes through the business layer (which checks
/// the permission); <see cref="GameApi.ForGame"/> checks the app version and the antiforgery token of cookie requests. Errors: 400 <c>{ error, field }</c>,
/// 401 not signed in, 403 denied. The offline game of the app (BunnyWarfare.Local) answers the same calls with the same shapes.
/// </summary>
public static class Api
{
    public sealed record CreateMatchRequest(string? Name, long WorldId, int MaxTeams, int BunniesPerTeam, int BunnyHealth, int TurnSeconds, bool IsPublic, int? CrateRate = null);

    public sealed record QuickMatchRequest(long? WorldId, int Bots = 1, string? Level = null);

    public sealed record ProfileRequest(string? TeamName, string? TeamColor);

    public sealed record LookRequest(string? Fur, string? Outfit, string? Face, string? Frame);

    public static void MapApi(this IEndpointRouteBuilder game, GameInfo info)
    {
        var api = game.MapGroup("/api").ForGame(info).AddEndpointFilter(Errors).AllowAnonymous();

        // ---- the game player of the signed-in account (anonymous: signedIn = false) ----
        api.MapGet("/session", async (HttpContext http, AppDbContext db) =>
        {
            if (Players.ActorOf(http.User) is null)
            {
                return Results.Ok(new { signedIn = false, player = (object?)null, version = AppInfo.Version });
            }

            var me = await Players.RequireAsync(http, db);
            var player = await PlayerLogic.GetAsync(db, me, me.PlayerId) ?? throw new AccessDeniedException();
            return Results.Ok(new { signedIn = true, player = PlayerOf(player, me.IsAdmin), version = AppInfo.Version });
        });

        // ---- the island behind the menu (anonymous: it is shown behind the sign-in too) ----
        api.MapGet("/showcase", async (long? worldId, AppDbContext db) =>
            await WorldLogic.ShowcaseAsync(db, worldId) is { } world ? Results.Ok(Showcase.Build(world)) : Results.NotFound(new { error = "Es gibt keine Welt." }));

        // ---- home ----
        api.MapGet("/home", async (HttpContext http, AppDbContext db) =>
        {
            var me = await Players.RequireAsync(http, db);
            var settings = await SettingLogic.GetAsync(db);
            var stats = await PlayerLogic.StatsAsync(db, me);
            var history = await MatchLogic.HistoryAsync(db, me);
            var player = await PlayerLogic.GetAsync(db, me, me.PlayerId) ?? throw new AccessDeniedException();
            return Results.Ok(new
            {
                player = new { level = Cosmetics.LevelOf(player.Xp), player.Xp, player.Fur, player.Outfit, player.Face, player.Frame, player.TeamColor },
                announcement = settings.Announcement,
                stats = new { stats.GamesPlayed, stats.GamesWon, stats.Kills, stats.DamageDealt, stats.Rank },
                history = history.Select(h => new { h.Token, h.Name, h.WorldName, status = h.Status.ToString(), h.EndDate, h.Placement, h.Kills, h.DamageDealt, h.XpGained }),
            });
        });

        api.MapGet("/settings", async (AppDbContext db) =>
        {
            var s = await SettingLogic.GetAsync(db);
            return Results.Ok(new { s.DefaultTurnSeconds, s.MaxTeamsPerMatch });
        });

        // ---- worlds ----
        api.MapGet("/worlds", async (HttpContext http, AppDbContext db) =>
        {
            var worlds = await WorldLogic.ListEnabledAsync(db, await Players.RequireAsync(http, db));
            return Results.Ok(worlds.Select(WorldOf));
        });
        api.MapGet("/worlds/{id:long}/terrain", async (long id, HttpContext http, AppDbContext db) =>
        {
            Guard.Player(await Players.RequireAsync(http, db));
            return await WorldLogic.ShowcaseAsync(db, id) is { } world && world.Id == id ? Results.Ok(Showcase.WorldOf(world)) : Results.NotFound(new { error = "Diese Welt gibt es nicht." });
        });

        // ---- matches ----
        api.MapGet("/matches", async (string? q, string? status, int? page, HttpContext http, AppDbContext db, RoomRegistry registry) =>
        {
            var request = new ListRequest(Clean(q), new Dictionary<string, string?> { ["status"] = Clean(status) }, "created", true, Math.Max(1, page ?? 1), 24);
            var result = await MatchLogic.OpenListAsync(db, await Players.RequireAsync(http, db), request);
            return Results.Ok(new
            {
                items = result.Items.Select(m => new
                {
                    m.Token, m.Name, m.WorldName, theme = m.Theme.ToString(), m.HostName, status = m.Status.ToString(), m.MaxTeams,
                    seats = registry.Find(m.Token)?.Slots.Count ?? 0, m.BunniesPerTeam, m.TurnSeconds, m.CreateDate, m.IsMine,
                }),
                result.Matching,
                result.Total,
            });
        });
        api.MapPost("/matches", async (CreateMatchRequest body, HttpContext http, AppDbContext db) =>
        {
            var token = await MatchLogic.CreateAsync(db, await Players.RequireAsync(http, db),
                new MatchInput(body.Name ?? string.Empty, body.WorldId, body.MaxTeams, body.BunniesPerTeam, body.BunnyHealth, body.TurnSeconds, body.IsPublic,
                    (CrateRate)(body.CrateRate ?? (int)CrateRate.Normal)));
            return Results.Ok(new { token });
        });
        api.MapPost("/matches/quick", async (QuickMatchRequest body, HttpContext http, AppDbContext db) =>
        {
            var me = await Players.RequireAsync(http, db);
            var worlds = await WorldLogic.ListEnabledAsync(db, me);
            if (worlds.Count == 0)
            {
                throw new BusinessException("Es gibt noch keine Welt – die Administration muss eine anlegen.");
            }

            var world = worlds.FirstOrDefault(w => w.Id == body.WorldId) ?? worlds[Random.Shared.Next(worlds.Count)];
            var settings = await SettingLogic.GetAsync(db);
            var bots = Math.Clamp(body.Bots, 1, Math.Max(1, settings.MaxTeamsPerMatch - 1));
            var name = $"Schnellspiel von {me.DisplayName}";
            var token = await MatchLogic.CreateAsync(db, me,
                new MatchInput(name.Length > 60 ? name[..60] : name, world.Id, bots + 1, 3, 100, settings.DefaultTurnSeconds, false, CrateRate.Normal));
            return Results.Ok(new { token });
        });

        // ---- leaderboard ----
        api.MapGet("/leaderboard", async (string? q, string? sort, string? dir, int? page, HttpContext http, AppDbContext db) =>
        {
            var request = new ListRequest(Clean(q), new Dictionary<string, string?>(), Clean(sort), string.Equals(dir, "desc", StringComparison.OrdinalIgnoreCase),
                Math.Max(1, page ?? 1), 50);
            var result = await PlayerLogic.LeaderboardAsync(db, await Players.RequireAsync(http, db), request);
            return Results.Ok(new { items = result.Items, result.Matching, result.Total });
        });

        // ---- profile ----
        api.MapGet("/profile", async (HttpContext http, AppDbContext db) => Results.Ok(await ProfileAsync(db, await Players.RequireAsync(http, db))));
        api.MapPut("/profile", async (ProfileRequest body, HttpContext http, AppDbContext db) =>
        {
            var me = await Players.RequireAsync(http, db);
            await PlayerLogic.UpdateProfileAsync(db, me, new ProfileInput(body.TeamName ?? string.Empty, body.TeamColor ?? string.Empty));
            return Results.Ok(await ProfileAsync(db, me));
        });
        api.MapPut("/profile/look", async (LookRequest body, HttpContext http, AppDbContext db) =>
        {
            var me = await Players.RequireAsync(http, db);
            await PlayerLogic.SaveLookAsync(db, me, new Look(body.Fur ?? string.Empty, body.Outfit ?? string.Empty, body.Face ?? string.Empty, body.Frame ?? string.Empty));
            return Results.Ok(await ProfileAsync(db, me));
        });
    }

    /// <summary>The player as the app knows it (the same shape offline).</summary>
    public static object PlayerOf(Player player, bool isAdmin) => new
    {
        player.Id, player.DisplayName, player.IsGuest, isAdmin, player.TeamName, player.TeamColor,
        player.Fur, player.Outfit, player.Face, player.Frame, level = Cosmetics.LevelOf(player.Xp),
    };

    /// <summary>A world of the list (the same shape offline).</summary>
    public static object WorldOf(World w) => new
    {
        w.Id, w.Name, w.Description, theme = w.Theme.ToString(), themeName = GameRules.ThemeName(w.Theme), w.GridSize, width = GameRules.WidthOf(w.GridSize), w.Gravity,
        w.MaxWind,
    };

    /// <summary>The profile answer (the same shape offline).</summary>
    public static object ProfileOf(ProfileView p) => new
    {
        p.DisplayName, p.IsGuest, p.TeamName, p.TeamColor,
        p.Look.Fur, p.Look.Outfit, p.Look.Face, p.Look.Frame,
        p.Level, p.Xp, p.XpAtLevel, p.XpForNext, p.MaxLevel,
        stats = new { p.Stats.GamesPlayed, p.Stats.GamesWon, p.Stats.Kills, p.Stats.DamageDealt, p.Stats.Rank },
        wardrobe = p.Wardrobe,
        colors = GameRules.TeamColors.Select(c => new { value = c.Value, label = c.Label }),
    };

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static async Task<object> ProfileAsync(AppDbContext db, Actor me) => ProfileOf(await PlayerLogic.ProfileAsync(db, me));

    /// <summary>A broken rule is a 400 with the message and the field (camelCase), a denied action a 403.</summary>
    private static async ValueTask<object?> Errors(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        try
        {
            return await next(context);
        }
        catch (BusinessException e)
        {
            var field = string.IsNullOrEmpty(e.Field) ? null : char.ToLower(e.Field[0], CultureInfo.InvariantCulture) + e.Field[1..];
            return Results.BadRequest(new { error = e.Message, field });
        }
        catch (AccessDeniedException e)
        {
            var signedIn = context.HttpContext.User.Identity?.IsAuthenticated == true;
            return Results.Json(new { error = e.Message }, statusCode: signedIn ? 403 : 401);
        }
        catch (BadHttpRequestException)
        {
            return Results.BadRequest(new { error = "Die Anfrage ist unvollständig.", field = (string?)null });
        }
    }
}
