using BunnyWarfare.Data;
using Microsoft.EntityFrameworkCore;

namespace BunnyWarfare.Business;

public sealed record WeaponRow(long Id, string Name, WeaponKind Kind, int Damage, double BlastRadius, int AmmoPerMatch, int SortOrder, bool IsEnabled);

public sealed record WeaponInput(long Id, string Name, string Description, WeaponKind Kind, int Damage, double BlastRadius, bool AffectedByWind, double FuseSeconds,
    int ClusterCount, int Pellets, int AmmoPerMatch, int SortOrder, bool IsEnabled);

/// <summary>The weapons of the arsenal.</summary>
public static class WeaponLogic
{
    public static string KindName(WeaponKind kind) => kind switch
    {
        WeaponKind.Projectile => "Geschoss",
        WeaponKind.Grenade => "Granate",
        WeaponKind.Cluster => "Splitterbombe",
        WeaponKind.Hitscan => "Schrot",
        WeaponKind.Airstrike => "Luftschlag",
        _ => kind.ToString(),
    };

    private static IQueryable<Weapon> Alive(AppDbContext db) => db.Weapons.Where(w => w.UpdateState != UpdateState.Deleted);

    public static async Task<PagedResult<WeaponRow>> ListAsync(AppDbContext db, Actor actor, ListRequest request)
    {
        Guard.Admin(actor);
        var all = Alive(db);
        var query = all;
        if (request.Search is { } search)
        {
            var pattern = $"%{search}%";
            query = query.Where(w => EF.Functions.ILike(w.Name, pattern) || EF.Functions.ILike(w.Description, pattern));
        }

        if (request.Filter("kind") is { } kind && Enum.TryParse<WeaponKind>(kind, out var k))
        {
            query = query.Where(w => w.Kind == k);
        }

        query = request.Filter("status") switch
        {
            "enabled" => query.Where(w => w.IsEnabled),
            "disabled" => query.Where(w => !w.IsEnabled),
            _ => query,
        };

        query = request.Sort switch
        {
            "name" => query.SortBy(w => w.Name, request.Descending),
            "damage" => query.SortBy(w => w.Damage, request.Descending),
            "radius" => query.SortBy(w => w.BlastRadius, request.Descending),
            _ => query.SortBy(w => w.SortOrder, request.Descending),
        };

        var total = await all.CountAsync();
        var matching = await query.CountAsync();
        var items = await query.Page(request)
            .Select(w => new WeaponRow(w.Id, w.Name, w.Kind, w.Damage, w.BlastRadius, w.AmmoPerMatch, w.SortOrder, w.IsEnabled))
            .ToListAsync();
        return new PagedResult<WeaponRow>(items, matching, total);
    }

    /// <summary>The arsenal of a new match (the system starts it).</summary>
    internal static async Task<IReadOnlyList<Weapon>> ListForGameAsync(AppDbContext db)
        => await Alive(db).AsNoTracking().Where(w => w.IsEnabled).OrderBy(w => w.SortOrder).ThenBy(w => w.Name).ToListAsync();

    public static async Task<Weapon?> GetAsync(AppDbContext db, Actor actor, long id)
    {
        Guard.Admin(actor);
        return await Alive(db).AsNoTracking().FirstOrDefaultAsync(w => w.Id == id);
    }

    public static async Task<long> SaveAsync(AppDbContext db, Actor actor, WeaponInput input)
    {
        Guard.Admin(actor);
        Validate(input);
        var weapon = input.Id == 0 ? new Weapon() : await Alive(db).FirstOrDefaultAsync(w => w.Id == input.Id) ?? throw new BusinessException("Die Waffe wurde nicht gefunden.");
        weapon.Name = input.Name.Trim();
        weapon.Description = input.Description?.Trim() ?? string.Empty;
        weapon.Kind = input.Kind;
        weapon.Damage = input.Damage;
        weapon.BlastRadius = input.BlastRadius;

        // only what the kind uses is kept; the rest goes back to its default, so a later change of the kind starts clean
        weapon.AffectedByWind = input.Kind is WeaponKind.Projectile or WeaponKind.Cluster && input.AffectedByWind;
        weapon.FuseSeconds = input.Kind == WeaponKind.Grenade ? input.FuseSeconds : 3;
        weapon.ClusterCount = input.Kind is WeaponKind.Cluster or WeaponKind.Airstrike ? input.ClusterCount : 4;
        weapon.Pellets = input.Kind == WeaponKind.Hitscan ? input.Pellets : 3;
        weapon.AmmoPerMatch = input.AmmoPerMatch;
        weapon.SortOrder = input.SortOrder;
        weapon.IsEnabled = input.IsEnabled;
        if (input.Id == 0)
        {
            db.Weapons.Add(weapon);
        }

        await db.ActingAs(actor.AuditId).SaveChangesAsync();
        return weapon.Id;
    }

    public static async Task DeleteAsync(AppDbContext db, Actor actor, long id)
    {
        Guard.Admin(actor);
        var weapon = await Alive(db).FirstOrDefaultAsync(w => w.Id == id) ?? throw new BusinessException("Die Waffe wurde nicht gefunden.");
        weapon.UpdateState = UpdateState.Deleted;
        weapon.IsEnabled = false;
        await db.ActingAs(actor.AuditId).SaveChangesAsync();
    }

    private static void Validate(WeaponInput input)
    {
        if (string.IsNullOrWhiteSpace(input.Name) || input.Name.Trim().Length > 60)
        {
            throw new BusinessException("Der Name fehlt oder ist länger als 60 Zeichen.", nameof(WeaponInput.Name));
        }

        if (input.Damage is < 1 or > 200)
        {
            throw new BusinessException("Der Schaden liegt zwischen 1 und 200.", nameof(WeaponInput.Damage));
        }

        if (input.BlastRadius is < 0.5 or > 8)
        {
            throw new BusinessException("Der Radius liegt zwischen 0,5 und 8 m.", nameof(WeaponInput.BlastRadius));
        }

        if (input.Kind == WeaponKind.Grenade && input.FuseSeconds is < 1 or > 6)
        {
            throw new BusinessException("Der Zünder läuft 1 bis 6 Sekunden.", nameof(WeaponInput.FuseSeconds));
        }

        if (input.Kind is WeaponKind.Cluster or WeaponKind.Airstrike && input.ClusterCount is < 2 or > 8)
        {
            throw new BusinessException("Es sind 2 bis 8 Bomben.", nameof(WeaponInput.ClusterCount));
        }

        if (input.Kind == WeaponKind.Hitscan && input.Pellets is < 1 or > 8)
        {
            throw new BusinessException("Ein Schuss hat 1 bis 8 Schrotkugeln.", nameof(WeaponInput.Pellets));
        }

        if (input.AmmoPerMatch is < -1 or 0 or > 20)
        {
            throw new BusinessException("Die Munition ist -1 (unbegrenzt) oder 1 bis 20.", nameof(WeaponInput.AmmoPerMatch));
        }
    }
}
