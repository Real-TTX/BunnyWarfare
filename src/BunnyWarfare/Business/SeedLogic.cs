using BunnyWarfare.Data;
using Microsoft.EntityFrameworkCore;

namespace BunnyWarfare.Business;

/// <summary>The worlds and weapons a fresh server starts with (only when the tables are empty: what the administrators change stays).</summary>
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

        await db.ActingAs(actor.AuditId).SaveChangesAsync();
    }
}
