using BunnyWarfare.Data;

namespace BunnyWarfare.Business;

/// <summary>
/// The worlds and weapons BunnyWarfare comes with, as plain data: the plugin seeds its database from them (SeedLogic), the offline game of the app plays
/// with them in memory. Add new ones at the end of the "later" lists (a server adds them once by name).
/// </summary>
public static class SeedContent
{
    /// <summary>The four islands of the very first version.</summary>
    public static IReadOnlyList<World> FirstWorlds() =>
    [
        new()
        {
            Name = "Möhrenwiese", Theme = WorldTheme.Meadow, GridSize = 96, HillHeight = 7, Roughness = 0.45, WaterLevel = 0, Gravity = 9.81, MaxWind = 4, Seed = 1337,
            Description = "Saftige Hügel, ein Teich in der Mitte und überall Deckung. Die Heimat jedes Hasen.",
        },
        new()
        {
            Name = "Frostbau", Theme = WorldTheme.Snow, GridSize = 88, HillHeight = 10, Roughness = 0.65, WaterLevel = 0.5, Gravity = 9.81, MaxWind = 6, Seed = 4242,
            Description = "Steile Schneegipfel und eisiger Wind. Wer oben steht, sieht alles – und wird gesehen.",
        },
        new()
        {
            Name = "Dünenland", Theme = WorldTheme.Desert, GridSize = 112, HillHeight = 5, Roughness = 0.3, WaterLevel = -0.5, Gravity = 9.81, MaxWind = 3, Seed = 777,
            Description = "Weite, sanfte Dünen. Wenig Deckung, viel Platz für Granaten.",
        },
        new()
        {
            Name = "Mondkrater", Theme = WorldTheme.Moon, GridSize = 80, HillHeight = 6, Roughness = 0.8, WaterLevel = -1.5, Gravity = 3.2, MaxWind = 0, Seed = 9001,
            Description = "Wenig Schwerkraft, kein Wind, sehr lange Flugbahnen. Statt Wasser: das All.",
        },
    ];

    /// <summary>The weapons of the very first version.</summary>
    public static IReadOnlyList<Weapon> FirstWeapons() =>
    [
        new()
        {
            Name = "Karottenwerfer", Kind = WeaponKind.Projectile, Damage = 45, BlastRadius = 2.6, AffectedByWind = true, AmmoPerMatch = -1, SortOrder = 10,
            Description = "Die gute alte Karotten-Rakete. Fliegt gerade, treibt im Wind, macht Krater.",
        },
        new()
        {
            Name = "Rübengranate", Kind = WeaponKind.Grenade, Damage = 50, BlastRadius = 2.8, FuseSeconds = 3, AmmoPerMatch = -1, SortOrder = 20,
            Description = "Springt über die Hügel und geht nach drei Sekunden hoch. Der Wind ist ihr egal.",
        },
        new()
        {
            Name = "Kohlkopf-Splitter", Kind = WeaponKind.Cluster, Damage = 30, BlastRadius = 2.0, AffectedByWind = true, ClusterCount = 5, AmmoPerMatch = 2, SortOrder = 30,
            Description = "Platzt beim Aufschlag und verteilt fünf Kohlblätter mit Wumms.",
        },
        new()
        {
            Name = "Löwenzahn-Flinte", Kind = WeaponKind.Hitscan, Damage = 18, BlastRadius = 0.9, Pellets = 3, AmmoPerMatch = -1, SortOrder = 40,
            Description = "Drei Samenkugeln auf einmal, direkt geradeaus. Für kurze Distanzen.",
        },
        new()
        {
            Name = "Möhrenregen", Kind = WeaponKind.Airstrike, Damage = 35, BlastRadius = 2.2, ClusterCount = 5, AmmoPerMatch = 1, SortOrder = 50,
            Description = "Ein Ziel auf der Karte wählen – und von oben regnet es Karotten.",
        },
    ];

    /// <summary>The weapons of the supply crates: AmmoPerMatch 0 = nobody has them at the start, a crate brings one.</summary>
    public static IReadOnlyList<Weapon> LaterWeapons() =>
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
    public static IReadOnlyList<World> LaterWorlds() =>
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

    /// <summary>Every seeded world with an id (1, 2, …) for the offline game.</summary>
    public static IReadOnlyList<World> AllWorlds()
    {
        var list = FirstWorlds().Concat(LaterWorlds()).ToList();
        for (var i = 0; i < list.Count; i++)
        {
            list[i].Id = i + 1;
        }

        return list;
    }

    /// <summary>Every seeded weapon with an id (1, 2, …) for the offline game, in the order of the arsenal.</summary>
    public static IReadOnlyList<Weapon> AllWeapons()
    {
        var list = FirstWeapons().Concat(LaterWeapons()).OrderBy(w => w.SortOrder).ToList();
        for (var i = 0; i < list.Count; i++)
        {
            list[i].Id = i + 1;
        }

        return list;
    }
}
