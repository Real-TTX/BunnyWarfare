using System.Globalization;
using BunnyWarfare.Business;
using BunnyWarfare.Data;
using BunnyWarfare.Game;
using BunnyWarfare.Web;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.ResponseCompression;
using Microsoft.EntityFrameworkCore;

if (args.Contains("--healthcheck"))
{
    return await HealthCheck.RunAsync();
}

// numbers in forms and in the query are always written with a point (input type=number), whatever the language of the server
CultureInfo.DefaultThreadCurrentCulture = CultureInfo.InvariantCulture;
CultureInfo.DefaultThreadCurrentUICulture = CultureInfo.GetCultureInfo("de-DE");

var builder = WebApplication.CreateBuilder(args);
builder.WebHost.UseUrls(builder.Configuration["urls"] ?? $"http://+:{AppInfo.Port}");

// ---- the database (PostgreSQL): the connection string of appsettings.json fits the compose files, no variable is needed ----
var connection = builder.Configuration.GetConnectionString("Default")
                 ?? "Host=db;Port=5432;Database=bunnywarfare;Username=bunnywarfare;Password=bunnywarfare";
builder.Services.AddDbContext<AppDbContext>(o => o.UseNpgsql(connection));

// the keys that protect the cookie are in the volume: a sign-in survives a restart of the container
var dataDirectory = Path.GetFullPath(builder.Configuration["DataDirectory"] ?? "/data");
var keys = Path.Combine(dataDirectory, "keys");
Directory.CreateDirectory(keys);
builder.Services.AddDataProtection().PersistKeysToFileSystem(new DirectoryInfo(keys)).SetApplicationName("BunnyWarfare");

builder.Services.AddAuthentication(Identity.Scheme)
    .AddCookie(Identity.Scheme, o =>
    {
        o.LoginPath = "/";
        o.ReturnUrlParameter = "returnUrl";
        o.LogoutPath = "/Account/Logout";
        o.AccessDeniedPath = "/";
        o.Cookie.Name = "bunnywarfare.auth";
        o.Cookie.HttpOnly = true;
        o.Cookie.SameSite = SameSiteMode.Lax;
        o.ExpireTimeSpan = TimeSpan.FromDays(30);
        o.SlidingExpiration = true;
        o.Events = new CookieAuthenticationEvents
        {
            // the app and the hub answer with a status code; pages go to the sign-in of the app (which then returns to returnUrl)
            OnRedirectToLogin = context =>
            {
                if (IsMachineRequest(context.Request))
                {
                    context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                    return Task.CompletedTask;
                }

                context.Response.Redirect(context.RedirectUri);
                return Task.CompletedTask;
            },
            OnRedirectToAccessDenied = context =>
            {
                if (IsMachineRequest(context.Request))
                {
                    context.Response.StatusCode = StatusCodes.Status403Forbidden;
                    return Task.CompletedTask;
                }

                context.Response.Redirect("/");
                return Task.CompletedTask;
            },
            // a disabled or deleted account is signed out at once, and a changed role or name takes effect
            OnValidatePrincipal = async context =>
            {
                var actor = Identity.ToActor(context.Principal!);
                var db = context.HttpContext.RequestServices.GetRequiredService<AppDbContext>();
                var player = actor is null ? null : await PlayerLogic.FindActiveAsync(db, actor.PlayerId);
                if (player is null)
                {
                    context.RejectPrincipal();
                    return;
                }

                if (player.DisplayName != actor!.DisplayName || (player.Role == PlayerRole.Admin) != actor.IsAdmin)
                {
                    context.ReplacePrincipal(Identity.ToPrincipal(player));
                    context.ShouldRenew = true;
                }
            },
        };
    });

builder.Services.AddAuthorizationBuilder()
    .AddPolicy("Admin", p => p.RequireRole(Identity.AdminRole))
    .SetFallbackPolicy(new Microsoft.AspNetCore.Authorization.AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build());

builder.Services.AddRazorPages(o =>
{
    o.Conventions.AuthorizeFolder("/Admin", "Admin");
    // the player app (the 3D menu and the game): one page for "/" and "/Play/{token}", open before the sign-in (it shows its own)
    o.Conventions.AddPageRoute("/App", "Play/{token:guid}");
    o.Conventions.AllowAnonymousToPage("/App");
    o.Conventions.AllowAnonymousToPage("/Error");
    o.Conventions.AllowAnonymousToPage("/About");
}).AddMvcOptions(o =>
{
    // the business layer validates (with German messages at the field); the framework only reports values it cannot read
    o.SuppressImplicitRequiredAttributeForNonNullableReferenceTypes = true;
    var m = o.ModelBindingMessageProvider;
    m.SetValueMustNotBeNullAccessor(_ => "Bitte ausfüllen.");
    m.SetMissingBindRequiredValueAccessor(_ => "Bitte ausfüllen.");
    m.SetMissingKeyOrValueAccessor(() => "Bitte ausfüllen.");
    m.SetAttemptedValueIsInvalidAccessor((value, _) => $"„{value}“ ist kein gültiger Wert.");
    m.SetValueIsInvalidAccessor(value => $"„{value}“ ist kein gültiger Wert.");
    m.SetValueMustBeANumberAccessor(_ => "Bitte eine Zahl eingeben.");
    m.SetNonPropertyAttemptedValueIsInvalidAccessor(value => $"„{value}“ ist kein gültiger Wert.");
    m.SetNonPropertyValueMustBeANumberAccessor(() => "Bitte eine Zahl eingeben.");
    m.SetUnknownValueIsInvalidAccessor(_ => "Ungültiger Wert.");
    m.SetNonPropertyUnknownValueIsInvalidAccessor(() => "Ungültiger Wert.");
    m.SetMissingRequestBodyRequiredValueAccessor(() => "Bitte ausfüllen.");
});
builder.Services.AddSignalR(o => o.MaximumReceiveMessageSize = 64 * 1024);
builder.Services.AddResponseCompression(o =>
{
    o.EnableForHttps = true;
    o.MimeTypes = ResponseCompressionDefaults.MimeTypes.Concat(["application/octet-stream", "image/svg+xml", "application/manifest+json"]);
});
builder.Services.AddAntiforgery(o => o.HeaderName = "RequestVerificationToken");
builder.Services.AddSingleton<Assets>();
builder.Services.AddSingleton<RoomRegistry>();
builder.Services.AddHostedService<GameTicker>();

var app = builder.Build();

// ---- the database is brought up to date, the start content is there, and matches lost with the last run are closed ----
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    var log = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();
    for (var attempt = 1; ; attempt++)
    {
        try
        {
            await db.Database.MigrateAsync();
            break;
        }
        catch (Exception e) when (attempt < 15)
        {
            log.LogWarning("The database is not ready yet ({Message}), attempt {Attempt}", e.Message, attempt);
            await Task.Delay(TimeSpan.FromSeconds(2));
        }
    }

    await SeedLogic.EnsureAsync(db, Actor.System);
    var stale = await MatchLogic.AbortStaleAsync(db, Actor.System);
    if (stale > 0)
    {
        log.LogInformation("{Count} matches of the last run were closed", stale);
    }
}

if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Error");
}

app.UseResponseCompression();
app.Use(async (context, next) =>
{
    var headers = context.Response.Headers;
    headers.XContentTypeOptions = "nosniff";
    headers["Referrer-Policy"] = "same-origin";
    headers.XFrameOptions = "SAMEORIGIN";
    await next();
});
app.UseStaticFiles(new StaticFileOptions
{
    OnPrepareResponse = ctx =>
    {
        // the vendored libraries never change under the same name
        if (ctx.Context.Request.Path.StartsWithSegments("/lib"))
        {
            ctx.Context.Response.Headers.CacheControl = "public, max-age=604800";
        }

        // the modules of the game import each other without a version: the browser asks every time (ETag), so a new release is never mixed with an old module
        else if (ctx.Context.Request.Path.StartsWithSegments("/js/game"))
        {
            ctx.Context.Response.Headers.CacheControl = "no-cache";
        }
    },
});
app.UseRouting();
app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/api/health", async (AppDbContext db) =>
{
    var database = await db.Database.CanConnectAsync();
    return database ? Results.Ok(new { status = "ok", version = AppInfo.Version }) : Results.Json(new { status = "down", version = AppInfo.Version }, statusCode: 503);
}).AllowAnonymous();
app.MapGet("/api/version", () => Results.Ok(new { version = AppInfo.Version })).AllowAnonymous();

app.MapApi();
app.MapRazorPages();
app.MapHub<GameHub>("/hub/game");

await app.RunAsync();
return 0;

// a request of a script (the app's API, the hub) gets a status code instead of the sign-in page
static bool IsMachineRequest(HttpRequest request)
    => request.Path.StartsWithSegments("/api") || request.Path.StartsWithSegments("/hub");
