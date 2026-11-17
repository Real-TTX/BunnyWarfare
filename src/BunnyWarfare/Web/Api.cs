using System.Globalization;
using BunnyWarfare.Business;
using BunnyWarfare.Data;
using BunnyWarfare.Game;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication;

namespace BunnyWarfare.Web;

/// <summary>
/// The JSON interface of the player app (the 3D menu): session, home, worlds, the background island, matches, leaderboard, profile.
/// Every call goes through the business layer (which checks the permission); changes need the antiforgery token of the session in the header
/// <c>RequestVerificationToken</c>. Errors: 400 <c>{ error, field }</c>, 401 not signed in, 403 denied.
/// </summary>
public static class Api
{
    public sealed record LoginRequest(string? LoginName, string? Password);

    public sealed record RegisterRequest(string? DisplayName, string? LoginName, string? Password);

    public sealed record CreateMatchRequest(string? Name, long WorldId, int MaxTeams, int BunniesPerTeam, int BunnyHealth, int TurnSeconds, bool IsPublic);

    public sealed record QuickMatchRequest(long? WorldId, int Bots = 1, string? Level = null);

    public sealed record ProfileRequest(string? DisplayName, string? TeamName, string? TeamColor);

    public sealed record PasswordRequest(string? CurrentPassword, string? NewPassword);

    public sealed record LookRequest(string? Fur, string? Outfit, string? Face, string? Frame);

    public static void MapApi(this WebApplication app)
    {
        var api = app.MapGroup("/api").AddEndpointFilter(Errors).AddEndpointFilter(Antiforgery);

        // ---- session (anonymous) ----
        api.MapGet("/session", Session).AllowAnonymous();
        api.MapPost("/session/login", async (LoginRequest body, HttpContext http, AppDbContext db, IAntiforgery af) =>
        {
            var player = await PlayerLogic.SignInAsync(db, body.LoginName ?? string.Empty, body.Password ?? string.Empty)
                         ?? throw new BusinessException("Anmeldename oder Passwort stimmen nicht.", "LoginName");
            return await SignInAsync(http, db, af, player);
        }).AllowAnonymous();
        api.MapPost("/session/register", async (RegisterRequest body, HttpContext http, AppDbContext db, IAntiforgery af) =>
        {
            var player = await PlayerLogic.RegisterAsync(db, body.LoginName ?? string.Empty, body.DisplayName ?? string.Empty, body.Password ?? string.Empty);
            return await SignInAsync(http, db, af, player);
        }).AllowAnonymous();
        api.MapPost("/session/logout", async (HttpContext http) =>
        {
            await http.SignOutAsync(Identity.Scheme);
            return Results.Ok(new { ok = true });
        }).AllowAnonymous();

        // ---- the island behind the menu (anonymous: it is shown behind the sign-in too) ----
        api.MapGet("/showcase", async (long? worldId, AppDbContext db) =>
            await WorldLogic.ShowcaseAsync(db, worldId) is { } world ? Results.Ok(Showcase.Build(world)) : Results.NotFound(new { error = "Es gibt keine Welt." }))
            .AllowAnonymous();

        // ---- home ----
        api.MapGet("/home", async (HttpContext http, AppDbContext db) =>
        {
            var me = Me(http);
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
            var worlds = await WorldLogic.ListEnabledAsync(db, Me(http));
            return Results.Ok(worlds.Select(w => new
            {
                w.Id, w.Name, w.Description, theme = w.Theme.ToString(), themeName = WorldLogic.ThemeName(w.Theme), w.GridSize, width = WorldLogic.WidthOf(w.GridSize), w.Gravity,
                w.MaxWind,
            }));
        });
        api.MapGet("/worlds/{id:long}/terrain", async (long id, HttpContext http, AppDbContext db) =>
        {
            Guard.Player(Me(http));
            return await WorldLogic.ShowcaseAsync(db, id) is { } world && world.Id == id ? Results.Ok(Showcase.WorldOf(world)) : Results.NotFound(new { error = "Diese Welt gibt es nicht." });
        });

        // ---- matches ----
        api.MapGet("/matches", async (string? q, string? status, int? page, HttpContext http, AppDbContext db, RoomRegistry registry) =>
        {
            var request = new ListRequest(Clean(q), new Dictionary<string, string?> { ["status"] = Clean(status) }, "created", true, Math.Max(1, page ?? 1), 24);
            var result = await MatchLogic.OpenListAsync(db, Me(http), request);
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
            var token = await MatchLogic.CreateAsync(db, Me(http),
                new MatchInput(body.Name ?? string.Empty, body.WorldId, body.MaxTeams, body.BunniesPerTeam, body.BunnyHealth, body.TurnSeconds, body.IsPublic));
            return Results.Ok(new { token });
        });
        api.MapPost("/matches/quick", async (QuickMatchRequest body, HttpContext http, AppDbContext db) =>
        {
            var me = Me(http);
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
                new MatchInput(name.Length > 60 ? name[..60] : name, world.Id, bots + 1, 3, 100, settings.DefaultTurnSeconds, false));
            return Results.Ok(new { token });
        });

        // ---- leaderboard ----
        api.MapGet("/leaderboard", async (string? q, string? sort, string? dir, int? page, HttpContext http, AppDbContext db) =>
        {
            var request = new ListRequest(Clean(q), new Dictionary<string, string?>(), Clean(sort), string.Equals(dir, "desc", StringComparison.OrdinalIgnoreCase),
                Math.Max(1, page ?? 1), 50);
            var result = await PlayerLogic.LeaderboardAsync(db, Me(http), request);
            return Results.Ok(new { items = result.Items, result.Matching, result.Total });
        });

        // ---- profile ----
        api.MapGet("/profile", async (HttpContext http, AppDbContext db) => Results.Ok(await ProfileAsync(db, Me(http))));
        api.MapPut("/profile", async (ProfileRequest body, HttpContext http, AppDbContext db) =>
        {
            var me = Me(http);
            await PlayerLogic.UpdateProfileAsync(db, me, new ProfileInput(body.DisplayName ?? string.Empty, body.TeamName ?? string.Empty, body.TeamColor ?? string.Empty));
            return Results.Ok(await ProfileAsync(db, me));
        });
        api.MapPut("/profile/look", async (LookRequest body, HttpContext http, AppDbContext db) =>
        {
            var me = Me(http);
            await PlayerLogic.SaveLookAsync(db, me, new Look(body.Fur ?? string.Empty, body.Outfit ?? string.Empty, body.Face ?? string.Empty, body.Frame ?? string.Empty));
            return Results.Ok(await ProfileAsync(db, me));
        });
        api.MapPost("/profile/password", async (PasswordRequest body, HttpContext http, AppDbContext db) =>
        {
            await PlayerLogic.ChangePasswordAsync(db, Me(http), body.CurrentPassword ?? string.Empty, body.NewPassword ?? string.Empty);
            return Results.Ok(new { ok = true });
        });
    }

    private static Actor Me(HttpContext http) => Identity.ToActor(http.User) ?? throw new AccessDeniedException("Bitte zuerst anmelden.");

    private static string? Clean(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static async Task<IResult> Session(HttpContext http, AppDbContext db, IAntiforgery af)
    {
        var actor = Identity.ToActor(http.User);
        var player = actor is null ? null : await PlayerLogic.FindActiveAsync(db, actor.PlayerId);
        return Results.Ok(await SessionOf(http, db, af, player, http.User));
    }

    private static async Task<IResult> SignInAsync(HttpContext http, AppDbContext db, IAntiforgery af, Player player)
    {
        var principal = Identity.ToPrincipal(player);
        await http.SignInAsync(Identity.Scheme, principal, new AuthenticationProperties { IsPersistent = true });

        // the antiforgery token belongs to the user: the new one is made for the principal that just signed in
        http.User = principal;
        return Results.Ok(await SessionOf(http, db, af, player, principal));
    }

    private static async Task<object> SessionOf(HttpContext http, AppDbContext db, IAntiforgery af, Player? player, System.Security.Claims.ClaimsPrincipal user)
    {
        http.User = user;
        var tokens = af.GetAndStoreTokens(http);
        var first = !await PlayerLogic.HasAnyAsync(db);
        return new
        {
            signedIn = player is not null,
            player = player is null
                ? null
                : new
                {
                    player.Id, player.DisplayName, player.LoginName, isAdmin = player.Role == PlayerRole.Admin, player.TeamName, player.TeamColor,
                    player.Fur, player.Outfit, player.Face, player.Frame, level = Cosmetics.LevelOf(player.Xp),
                },
            canRegister = await PlayerLogic.CanRegisterAsync(db),
            firstRun = first,
            version = AppInfo.Version,
            antiforgery = tokens.RequestToken,
        };
    }

    private static async Task<object> ProfileAsync(AppDbContext db, Actor me)
    {
        var p = await PlayerLogic.ProfileAsync(db, me);
        return new
        {
            p.DisplayName, p.LoginName, p.TeamName, p.TeamColor,
            p.Look.Fur, p.Look.Outfit, p.Look.Face, p.Look.Frame,
            p.Level, p.Xp, p.XpAtLevel, p.XpForNext, p.MaxLevel,
            stats = new { p.Stats.GamesPlayed, p.Stats.GamesWon, p.Stats.Kills, p.Stats.DamageDealt, p.Stats.Rank },
            wardrobe = p.Wardrobe,
            colors = PlayerLogic.TeamColors.Select(c => new { value = c.Value, label = c.Label }),
        };
    }

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

    /// <summary>Every change carries the antiforgery token of the session (the cookie alone is not enough).</summary>
    private static async ValueTask<object?> Antiforgery(EndpointFilterInvocationContext context, EndpointFilterDelegate next)
    {
        var http = context.HttpContext;
        if (!HttpMethods.IsGet(http.Request.Method) && !HttpMethods.IsHead(http.Request.Method))
        {
            var af = http.RequestServices.GetRequiredService<IAntiforgery>();
            if (!await af.IsRequestValidAsync(http))
            {
                return Results.BadRequest(new { error = "Die Sitzung ist abgelaufen – bitte die Seite neu laden.", field = (string?)null });
            }
        }

        return await next(context);
    }
}
