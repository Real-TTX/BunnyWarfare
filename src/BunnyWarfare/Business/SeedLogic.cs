using BunnyWarfare.Data;
using Microsoft.EntityFrameworkCore;

namespace BunnyWarfare.Business;

/// <summary>The worlds and weapons a fresh server starts with (only when the tables are empty: what the administrators change stays), and the worlds of later versions.</summary>
public static class SeedLogic
{
    public static async Task EnsureAsync(AppDbContext db, Actor actor)
    {
        Guard.Admin(actor);
        if (!await db.Worlds.AnyAsync())
        {
            db.Worlds.AddRange(
                new World
                {
                    Name = "Möhrenwiese", Theme = WorldTheme.Meadow, GridSize = 96, HillHeight = 7, Roughness = 0.45, WaterLevel = 0, Gravity = 9.81, MaxWind = 4, Seed = 1337,
                    Description = "Saftige Hügel, ein Teich in der Mitte und überall Deckung. Die Heimat jedes Hasen.",
                },
                new World
                {
                    Name = "Frostbau", Theme = WorldTheme.Snow, GridSize = 88, HillHeight = 10, Roughness = 0.65, WaterLevel = 0.5, Gravity = 9.81, MaxWind = 6, Seed = 4242,
                    Description = "Steile Schneegipfel und eisiger Wind. Wer oben steht, sieht alles – und wird gesehen.",
                },
                new World
                {
                    Name = "Dünenland", Theme = WorldTheme.Desert, GridSize = 112, HillHeight = 5, Roughness = 0.3, WaterLevel = -0.5, Gravity = 9.81, MaxWind = 3, Seed = 777,
                    Description = "Weite, sanfte Dünen. Wenig Deckung, viel Platz für Granaten.",
                },
                new World
                {
                    Name = "Mondkrater", Theme = WorldTheme.Moon, GridSize = 80, HillHeight = 6, Roughness = 0.8, WaterLevel = -1.5, Gravity = 3.2, MaxWind = 0, Seed = 9001,
                    Description = "Wenig Schwerkraft, kein Wind, sehr lange Flugbahnen. Statt Wasser: das All.",
                });
        }

        if (!await db.Weapons.AnyAsync())
        {
            db.Weapons.AddRange(
                new Weapon
                {
                    Name = "Karottenwerfer", Kind = WeaponKind.Projectile, Damage = 45, BlastRadius = 2.6, AffectedByWind = true, AmmoPerMatch = -1, SortOrder = 10,
                    Description = "Die gute alte Karotten-Rakete. Fliegt gerade, treibt im Wind, macht Krater.",
                },
                new Weapon
                {
                    Name = "Rübengranate", Kind = WeaponKind.Grenade, Damage = 50, BlastRadius = 2.8, FuseSeconds = 3, AmmoPerMatch = -1, SortOrder = 20,
                    Description = "Springt über die Hügel und geht nach drei Sekunden hoch. Der Wind ist ihr egal.",
                },
                new Weapon
                {
                    Name = "Kohlkopf-Splitter", Kind = WeaponKind.Cluster, Damage = 30, BlastRadius = 2.0, AffectedByWind = true, ClusterCount = 5, AmmoPerMatch = 2, SortOrder = 30,
                    Description = "Platzt beim Aufschlag und verteilt fünf Kohlblätter mit Wumms.",
                },
                new Weapon
                {
                    Name = "Löwenzahn-Flinte", Kind = WeaponKind.Hitscan, Damage = 18, BlastRadius = 0.9, Pellets = 3, AmmoPerMatch = -1, SortOrder = 40,
                    Description = "Drei Samenkugeln auf einmal, direkt geradeaus. Für kurze Distanzen.",
                },
                new Weapon
                {
                    Name = "Möhrenregen", Kind = WeaponKind.Airstrike, Damage = 35, BlastRadius = 2.2, ClusterCount = 5, AmmoPerMatch = 1, SortOrder = 50,
                    Description = "Ein Ziel auf der Karte wählen – und von oben regnet es Karotten.",
                });
        }

        // worlds that came with later versions: added to every database once (a world with the same name or seed counts as there,
        // also a deleted one: what the administrators removed stays removed)
        var known = await db.Worlds.Select(w => new { w.Name, w.Seed }).ToListAsync();
        foreach (var world in LaterWorlds())
        {
            if (!known.Any(k => k.Name == world.Name || k.Seed == world.Seed))
            {
                db.Worlds.Add(world);
            }
        }

        // weapons that came with later versions (the ones only found in supply crates): added once by name, also a deleted one counts as there
        var knownWeapons = await db.Weapons.Select(w => w.Name).ToListAsync();
        foreach (var weapon in LaterWeapons().Where(w => !knownWeapons.Contains(w.Name)))
        {
            db.Weapons.Add(weapon);
        }

        await db.ActingAs(actor.AuditId).SaveChangesAsync();
    }

    /// <summary>The weapons of the supply crates: AmmoPerMatch 0 = nobody has them at the start, a crate brings one.</summary>
    internal static IReadOnlyList<Weapon> LaterWeapons() =>
    [
        new()
        {
            Name = "Goldene Riesenmöhre", Kind = WeaponKind.Projectile, Damage = 70, BlastRadius = 4.0, AffectedByWind = true, AmmoPerMatch = 0, SortOrder = 60,
            Description = "Nur aus Kisten: eine goldene Riesen-Karotte mit gewaltigem Krater. Treibt im Wind.",
        },
        new()
        {
            Name = "Hasenloch", Kind = WeaponKind.Teleport, Damage = 0, BlastRadius = 0, AmmoPerMatch = 0, SortOrder = 70,
            Description = "Nur aus Kisten: ein Ziel auf der Insel wählen – der Hase buddelt sich ein und taucht dort wieder auf.",
        },
    ];

    /// <summary>More islands in every theme and size: small duel maps (64–72 points), medium ones and a few big ones (up to 124 points).</summary>
    internal static IReadOnlyList<World> LaterWorlds() =>
    [
        new()
        {
            Name = "Möhrchen-Atoll", Theme = WorldTheme.Meadow, GridSize = 64, HillHeight = 5, Roughness = 0.4, WaterLevel = 0, Gravity = 9.81, MaxWind = 3, Seed = 2024,
            Description = "Winzig, schnell, gnadenlos: ein kleines Atoll für das Duell zwischendurch.",
        },
        new()
        {
            Name = "Kürbishof", Theme = WorldTheme.Autumn, GridSize = 96, HillHeight = 7, Roughness = 0.45, WaterLevel = 0, Gravity = 9.81, MaxWind = 5, Seed = 3110,
            Description = "Bunte Wälder, Kürbisfelder und ein gemütlicher Hof mit rauchendem Schornstein. Fast zu schön für Explosionen.",
        },
        new()
        {
            Name = "Glutberg", Theme = WorldTheme.Volcano, GridSize = 92, HillHeight = 8, Roughness = 0.6, WaterLevel = 0, Gravity = 9.81, MaxWind = 4, Seed = 6660,
            Description = "Ein rauchender Vulkan mitten auf der Insel, ringsum ein Meer aus Lava. Wer reinfällt, ist gegrillt.",
        },
        new()
        {
            Name = "Lavaduell", Theme = WorldTheme.Volcano, GridSize = 66, HillHeight = 6, Roughness = 0.55, WaterLevel = 0, Gravity = 9.81, MaxWind = 3, Seed = 1668,
            Description = "Klein, heiß und schnell vorbei: ein Vulkan im Taschenformat für zwei Teams.",
        },
        new()
        {
            Name = "Tempeldschungel", Theme = WorldTheme.Jungle, GridSize = 116, HillHeight = 9, Roughness = 0.55, WaterLevel = 0, Gravity = 9.81, MaxWind = 3, Seed = 8080,
            Description = "Dichter Dschungel, ein alter Tempel, ein Wasserfall und Höhlen in den Hängen. Hier lauert hinter jedem Farn ein Hase.",
        },
        new()
        {
            Name = "Eisschelf", Theme = WorldTheme.Snow, GridSize = 124, HillHeight = 9, Roughness = 0.6, WaterLevel = 0.5, Gravity = 9.81, MaxWind = 7, Seed = 5150,
            Description = "Ein riesiges Eisschelf mit Hütten, Höhlen und viel Wind. Die große Schlacht im Schnee.",
        },
        new()
        {
            Name = "Dünenduell", Theme = WorldTheme.Desert, GridSize = 70, HillHeight = 5, Roughness = 0.35, WaterLevel = -0.5, Gravity = 9.81, MaxWind = 4, Seed = 7071,
            Description = "Eine kleine Wüsteninsel mit Lehmhaus und Felshöhle. Sand in den Ohren garantiert.",
        },
        new()
        {
            Name = "Doppelkrater", Theme = WorldTheme.Moon, GridSize = 108, HillHeight = 7, Roughness = 0.8, WaterLevel = -1.5, Gravity = 3.2, MaxWind = 0, Seed = 9090,
            Description = "Zwei Krater, eine Mondbasis, endlose Flugbahnen. Wer hier daneben schießt, trifft vielleicht die Erde.",
        },
    ];
}

