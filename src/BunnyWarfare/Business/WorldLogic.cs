using BunnyWarfare.Data;
using Microsoft.EntityFrameworkCore;

namespace BunnyWarfare.Business;

public sealed record WorldRow(long Id, string Name, WorldTheme Theme, int GridSize, double HillHeight, double Gravity, double MaxWind, bool IsEnabled, int Matches);

public sealed record WorldInput(long Id, string Name, string Description, WorldTheme Theme, int GridSize, double HillHeight, double Roughness, double WaterLevel,
    double Gravity, double MaxWind, int Seed, bool IsEnabled);

/// <summary>The worlds: small islands, generated from a seed.</summary>
public static class WorldLogic
{
    public const int MinGridSize = 48;
    public const int MaxGridSize = 160;

    public static string ThemeName(WorldTheme theme) => theme switch
    {
        WorldTheme.Meadow => "Möhrenwiese",
        WorldTheme.Snow => "Frostbau",
        WorldTheme.Desert => "Dünenland",
        WorldTheme.Moon => "Mondkrater",
        _ => theme.ToString(),
    };

    /// <summary>The width of an island in metres.</summary>
    public static double WidthOf(int gridSize) => (gridSize - 1) * Game.Terrain.CellSize;

    private static IQueryable<World> Alive(AppDbContext db) => db.Worlds.Where(w => w.UpdateState != UpdateState.Deleted);

    public static async Task<PagedResult<WorldRow>> ListAsync(AppDbContext db, Actor actor, ListRequest request)
    {
        Guard.Admin(actor);
        var all = Alive(db);
        var query = all;
        if (request.Search is { } search)
        {
            var pattern = $"%{search}%";
            query = query.Where(w => EF.Functions.ILike(w.Name, pattern) || EF.Functions.ILike(w.Description, pattern));
        }

        if (request.Filter("theme") is { } theme && Enum.TryParse<WorldTheme>(theme, out var t))
        {
            query = query.Where(w => w.Theme == t);
        }

        query = request.Filter("status") switch
        {
            "enabled" => query.Where(w => w.IsEnabled),
            "disabled" => query.Where(w => !w.IsEnabled),
            _ => query,
        };

        query = request.Sort switch
        {
            "size" => query.SortBy(w => w.GridSize, request.Descending),
            "gravity" => query.SortBy(w => w.Gravity, request.Descending),
            _ => query.SortBy(w => w.Name, request.Descending),
        };

        var total = await all.CountAsync();
        var matching = await query.CountAsync();
        var items = await query.Page(request)
            .Select(w => new WorldRow(w.Id, w.Name, w.Theme, w.GridSize, w.HillHeight, w.Gravity, w.MaxWind, w.IsEnabled, db.Matches.Count(m => m.WorldId == w.Id)))
            .ToListAsync();
        return new PagedResult<WorldRow>(items, matching, total);
    }

    /// <summary>The worlds a match can be played on (every player).</summary>
    public static async Task<IReadOnlyList<World>> ListEnabledAsync(AppDbContext db, Actor actor)
    {
        Guard.Player(actor);
        return await Alive(db).AsNoTracking().Where(w => w.IsEnabled).OrderBy(w => w.Name).ToListAsync();
    }

    public static async Task<World?> GetAsync(AppDbContext db, Actor actor, long id)
    {
        Guard.Admin(actor);
        return await Alive(db).AsNoTracking().FirstOrDefaultAsync(w => w.Id == id);
    }

    /// <summary>
    /// An enabled world for the 3D background of the menu and the previews: public by design (also before the sign-in), it holds nothing secret.
    /// Without an id (or an unknown one) a random enabled world; null when there is none.
    /// </summary>
    public static async Task<World?> ShowcaseAsync(AppDbContext db, long? id)
    {
        var enabled = Alive(db).AsNoTracking().Where(w => w.IsEnabled);
        if (id is { } wanted && await enabled.FirstOrDefaultAsync(w => w.Id == wanted) is { } world)
        {
            return world;
        }

        var all = await enabled.ToListAsync();
        return all.Count == 0 ? null : all[Random.Shared.Next(all.Count)];
    }

    /// <summary>The world of a match, for the game itself (the system or a player).</summary>
    internal static async Task<World?> GetForGameAsync(AppDbContext db, long id)
        => await db.Worlds.AsNoTracking().FirstOrDefaultAsync(w => w.Id == id);

    public static async Task<long> SaveAsync(AppDbContext db, Actor actor, WorldInput input)
    {
        Guard.Admin(actor);
        Validate(input);
        var world = input.Id == 0 ? new World() : await Alive(db).FirstOrDefaultAsync(w => w.Id == input.Id) ?? throw new BusinessException("Die Welt wurde nicht gefunden.");
        world.Name = input.Name.Trim();
        world.Description = input.Description?.Trim() ?? string.Empty;
        world.Theme = input.Theme;
        world.GridSize = input.GridSize;
        world.HillHeight = input.HillHeight;
        world.Roughness = input.Roughness;
        world.WaterLevel = input.WaterLevel;
        world.Gravity = input.Gravity;
        world.MaxWind = input.MaxWind;
        world.Seed = input.Seed;
        world.IsEnabled = input.IsEnabled;
        if (input.Id == 0)
        {
            db.Worlds.Add(world);
        }

        await db.ActingAs(actor.AuditId).SaveChangesAsync();
        return world.Id;
    }

    public static async Task DeleteAsync(AppDbContext db, Actor actor, long id)
    {
        Guard.Admin(actor);
        var world = await Alive(db).FirstOrDefaultAsync(w => w.Id == id) ?? throw new BusinessException("Die Welt wurde nicht gefunden.");
        if (await db.Matches.AnyAsync(m => m.WorldId == id && (m.Status == MatchStatus.Lobby || m.Status == MatchStatus.Running)))
        {
            throw new BusinessException("Auf dieser Welt läuft gerade ein Spiel.");
        }

        world.UpdateState = UpdateState.Deleted;
        world.IsEnabled = false;
        await db.ActingAs(actor.AuditId).SaveChangesAsync();
    }

    private static void Validate(WorldInput input)
    {
        if (string.IsNullOrWhiteSpace(input.Name) || input.Name.Trim().Length > 60)
        {
            throw new BusinessException("Der Name fehlt oder ist länger als 60 Zeichen.", nameof(WorldInput.Name));
        }

        if (input.GridSize is < MinGridSize or > MaxGridSize)
        {
            throw new BusinessException($"Die Größe liegt zwischen {MinGridSize} und {MaxGridSize} Punkten.", nameof(WorldInput.GridSize));
        }

        if (input.HillHeight is < 1 or > 20)
        {
            throw new BusinessException("Die Hügelhöhe liegt zwischen 1 und 20 m.", nameof(WorldInput.HillHeight));
        }

        if (input.Roughness is < 0 or > 1)
        {
            throw new BusinessException("Die Rauheit liegt zwischen 0 und 1.", nameof(WorldInput.Roughness));
        }

        if (input.WaterLevel is < -2 or > 4)
        {
            throw new BusinessException("Der Wasserstand liegt zwischen -2 und 4 m.", nameof(WorldInput.WaterLevel));
        }

        if (input.Gravity is < 1 or > 25)
        {
            throw new BusinessException("Die Schwerkraft liegt zwischen 1 und 25 m/s².", nameof(WorldInput.Gravity));
        }

        if (input.MaxWind is < 0 or > 12)
        {
            throw new BusinessException("Der Wind liegt zwischen 0 und 12.", nameof(WorldInput.MaxWind));
        }
    }
}
