using BunnyWarfare.Data;
using Microsoft.EntityFrameworkCore;

namespace BunnyWarfare.Business;

/// <summary>
/// The worlds and weapons a fresh server starts with (<see cref="SeedContent"/>; only when the tables are empty: what the administrators change stays),
/// and the worlds and weapons of later versions (added once by name).
/// </summary>
public static class SeedLogic
{
    public static async Task EnsureAsync(AppDbContext db, Actor actor)
    {
        Guard.Admin(actor);
        if (!await db.Worlds.AnyAsync())
        {
            db.Worlds.AddRange(SeedContent.FirstWorlds());
        }

        if (!await db.Weapons.AnyAsync())
        {
            db.Weapons.AddRange(SeedContent.FirstWeapons());
        }

        // worlds that came with later versions: added to every database once (a world with the same name or seed counts as there,
        // also a deleted one: what the administrators removed stays removed)
        var known = await db.Worlds.Select(w => new { w.Name, w.Seed }).ToListAsync();
        foreach (var world in SeedContent.LaterWorlds())
        {
            if (!known.Any(k => k.Name == world.Name || k.Seed == world.Seed))
            {
                db.Worlds.Add(world);
            }
        }

        // weapons that came with later versions (the ones only found in supply crates): added once by name, also a deleted one counts as there
        var knownWeapons = await db.Weapons.Select(w => w.Name).ToListAsync();
        foreach (var weapon in SeedContent.LaterWeapons().Where(w => !knownWeapons.Contains(w.Name)))
        {
            db.Weapons.Add(weapon);
        }

        await db.ActingAs(actor.AuditId).SaveChangesAsync();
    }
}
