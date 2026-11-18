namespace BunnyWarfare.Business;

/// <summary>What a player has earned so far: the base of the level and of every unlock.</summary>
public sealed record Progress(int Xp, int GamesPlayed, int GamesWon, int Kills, int DamageDealt)
{
    public static Progress Of(Data.Player p) => new(p.Xp, p.GamesPlayed, p.GamesWon, p.Kills, p.DamageDealt);

    public int Level => Cosmetics.LevelOf(Xp);

    /// <summary>The progress after one more match (the same numbers <see cref="MatchLogic.FinishAsync"/> adds).</summary>
    public Progress After(bool won, int placement, int kills, int damage) =>
        new(Xp + Cosmetics.XpForMatch(won, placement, kills, damage, aborted: false), GamesPlayed + 1, GamesWon + (won ? 1 : 0), Kills + kills, DamageDealt + damage);
}

/// <summary>How the bunnies of a team look: keys of <see cref="Cosmetics"/> (fur, outfit, face; the frame belongs to the portrait).</summary>
public sealed record Look(string Fur, string Outfit, string Face, string Frame)
{
    public static readonly Look Default = new("snow", "helmet", "none", "wood");

    public static Look Of(Data.Player p) => new(p.Fur, p.Outfit, p.Face, p.Frame);
}

/// <summary>An item a player has just unlocked (shown after a match). Kind: fur, outfit, face, frame.</summary>
public sealed record Unlock(string Kind, string Key, string Name);

/// <summary>An item of the wardrobe: <paramref name="Key"/> is stored on the player and drawn by the browser (bunny.js, portrait.js).</summary>
/// <param name="Level">Unlocked from this level on (1 = from the start).</param>
/// <param name="Wins">... or when the player has won this many matches (0 = no such rule).</param>
/// <param name="Kills">... or knocked out this many bunnies (0 = no such rule).</param>
/// <param name="Wild">A loud, crazy item (shown with a flame in the wardrobe; bots wear them more often).</param>
public sealed record Cosmetic(string Key, string Name, int Level = 1, int Wins = 0, int Kills = 0, bool Wild = false)
{
    /// <summary>Unlocked when one of its rules is met (level, or wins, or kills).</summary>
    public bool IsUnlocked(Progress progress) =>
        Cosmetics.LevelOf(progress.Xp) >= Level && Level > 0
        || Wins > 0 && progress.GamesWon >= Wins
        || Kills > 0 && progress.Kills >= Kills;

    /// <summary>How to get it, for the lock in the wardrobe ("Ab Level 8", "10 Siege").</summary>
    public string Requirement =>
        string.Join(" oder ", new[]
        {
            Level > 1 ? $"Level {Level}" : null,
            Wins > 0 ? $"{Wins} {(Wins == 1 ? "Sieg" : "Siege")}" : null,
            Kills > 0 ? $"{Kills} K.O." : null,
        }.Where(s => s is not null));
}

/// <summary>
/// The wardrobe of the bunnies and the level curve. The keys are a contract with the browser: bunny.js draws furs, outfits and faces by key,
/// portrait.js draws the frames. Add new items at the end of a list; never rename a key (players have it stored).
/// Level = 0 means: only by the other rules (wins / kills).
/// </summary>
public static class Cosmetics
{
    public const int MaxLevel = 30;

    /// <summary>The fur of all bunnies of the player.</summary>
    public static readonly IReadOnlyList<Cosmetic> Furs =
    [
        new("snow", "Schneeweiß"),
        new("caramel", "Karamell"),
        new("grey", "Steingrau"),
        new("cream", "Vanille"),
        new("brown", "Schokobraun"),
        new("dark", "Rußfell"),
        new("ginger", "Rotfuchs", Level: 3),
        new("black", "Mitternacht", Level: 5),
        new("spotted", "Gescheckt", Level: 7),
        new("pink", "Zuckerwatte", Level: 9, Wild: true),
        new("mint", "Minzeis", Level: 11, Wild: true),
        new("tiger", "Tigerstreifen", Level: 0, Wins: 10, Wild: true),
        new("zebra", "Zebra", Level: 14, Wild: true),
        new("neon", "Neongrün", Level: 17, Wild: true),
        new("lava", "Lava", Level: 0, Kills: 50, Wild: true),
        new("galaxy", "Galaxie", Level: 22, Wild: true),
        new("gold", "Pures Gold", Level: 0, Wins: 25, Wild: true),
        new("rainbow", "Regenbogen", Level: 30, Wild: true),
    ];

    /// <summary>What the bunnies wear on the head (in the team colour where it makes sense).</summary>
    public static readonly IReadOnlyList<Cosmetic> Outfits =
    [
        new("helmet", "Stahlhelm"),
        new("beret", "Barett", Level: 2),
        new("cap", "Schirmmütze", Level: 4),
        new("bandana", "Stirnband", Level: 6),
        new("pirate", "Piratenhut", Level: 8),
        new("viking", "Wikingerhelm", Level: 10, Wild: true),
        new("cowboy", "Cowboyhut", Level: 12),
        new("chef", "Kochmütze", Level: 13),
        new("party", "Partyhütchen", Level: 0, Wins: 3, Wild: true),
        new("tophat", "Zylinder", Level: 15),
        new("mohawk", "Punk-Irokese", Level: 18, Wild: true),
        new("astronaut", "Raumhelm", Level: 20),
        new("crown", "Krone", Level: 0, Wins: 20, Wild: true),
        new("carrot", "Möhrenkostüm", Level: 24, Wild: true),
        new("horns", "Teufelshörner", Level: 0, Kills: 100, Wild: true),
    ];

    /// <summary>Something on the face.</summary>
    public static readonly IReadOnlyList<Cosmetic> Faces =
    [
        new("none", "Nichts"),
        new("blush", "Rote Bäckchen"),
        new("glasses", "Brille", Level: 3),
        new("sunglasses", "Sonnenbrille", Level: 5),
        new("mustache", "Schnurrbart", Level: 7),
        new("eyepatch", "Augenklappe", Level: 9),
        new("warpaint", "Kriegsbemalung", Level: 0, Kills: 25, Wild: true),
        new("monocle", "Monokel", Level: 16),
        new("scar", "Narbe", Level: 0, Kills: 75, Wild: true),
        new("goggles", "Fliegerbrille", Level: 19),
        new("lasers", "Laseraugen", Level: 27, Wild: true),
    ];

    /// <summary>The frame of the portrait (the avatar of the player in menus, lobby, ranking and match).</summary>
    public static readonly IReadOnlyList<Cosmetic> Frames =
    [
        new("wood", "Holz"),
        new("meadow", "Wiese"),
        new("sky", "Himmel", Level: 3),
        new("carrot", "Möhre", Level: 0, Wins: 1),
        new("snow", "Frost", Level: 6),
        new("silver", "Silber", Level: 10),
        new("fire", "Feuer", Level: 0, Kills: 30, Wild: true),
        new("gold", "Gold", Level: 20),
        new("galaxy", "Galaxie", Level: 25, Wild: true),
        new("legend", "Legende", Level: 30, Wild: true),
    ];

    /// <summary>The XP needed to go from level <paramref name="level"/> to the next.</summary>
    public static int XpForNext(int level) => 100 + (level - 1) * 60;

    /// <summary>The total XP at which <paramref name="level"/> starts (level 1 = 0).</summary>
    public static int XpAt(int level)
    {
        var total = 0;
        for (var l = 1; l < level; l++)
        {
            total += XpForNext(l);
        }

        return total;
    }

    public static int LevelOf(int xp)
    {
        var level = 1;
        while (level < MaxLevel && xp >= XpAt(level + 1))
        {
            level++;
        }

        return level;
    }

    /// <summary>
    /// The XP of one finished match for a team of a player. The share for taking part and the placement only counts when the team did something
    /// (won, hit, knocked out): giving up at once against bots earns nothing, so levels cannot be farmed in seconds.
    /// </summary>
    public static int XpForMatch(bool won, int placement, int kills, int damage, bool aborted)
    {
        if (aborted)
        {
            return 0;
        }

        var acted = won || kills > 0 || damage > 0;
        var taking = acted ? 25 + Math.Max(0, 4 - placement) * 10 : 0;
        return taking + (won ? 75 : 0) + kills * 30 + Math.Min(300, damage) / 4;
    }

    public static Cosmetic? Find(IReadOnlyList<Cosmetic> list, string? key) => list.FirstOrDefault(c => c.Key == key);

    /// <summary>The four lists by kind (fur, outfit, face, frame), in the order of the wardrobe.</summary>
    public static readonly IReadOnlyList<(string Kind, string Name, IReadOnlyList<Cosmetic> Items)> Kinds =
    [
        ("fur", "Fell", Furs), ("outfit", "Hut", Outfits), ("face", "Gesicht", Faces), ("frame", "Rahmen", Frames),
    ];

    /// <summary>What <paramref name="after"/> unlocks that <paramref name="before"/> did not.</summary>
    public static IReadOnlyList<Unlock> NewlyUnlocked(Progress before, Progress after) =>
        Kinds.SelectMany(k => k.Items.Where(c => !c.IsUnlocked(before) && c.IsUnlocked(after)).Select(c => new Unlock(k.Kind, c.Key, c.Name))).ToList();

    /// <summary>A look made of unlocked items only; null when one key is unknown or still locked (the message says which).</summary>
    public static (string Field, string Message)? Check(Look look, Progress progress)
    {
        foreach (var (kind, name, items) in Kinds)
        {
            var key = kind switch { "fur" => look.Fur, "outfit" => look.Outfit, "face" => look.Face, _ => look.Frame };
            var item = Find(items, key);
            if (item is null)
            {
                return (kind, $"{name}: „{key}“ gibt es nicht.");
            }

            if (!item.IsUnlocked(progress))
            {
                return (kind, $"{name} „{item.Name}“ ist noch gesperrt ({item.Requirement}).");
            }
        }

        return null;
    }

    /// <summary>Whether every key of the look exists (administrators may give any item, locked or not).</summary>
    public static bool Exists(Look look) =>
        Find(Furs, look.Fur) is not null && Find(Outfits, look.Outfit) is not null && Find(Faces, look.Face) is not null && Find(Frames, look.Frame) is not null;

    /// <summary>
    /// A random look for a bot or a decorative team. <paramref name="wildness"/> 0..1 is the chance to pick from the wild items:
    /// bots are "a bit wilder" than the players at the start.
    /// </summary>
    public static Look RandomLook(Random random, double wildness = 0.45)
    {
        string Pick(IReadOnlyList<Cosmetic> items)
        {
            var wild = items.Where(c => c.Wild).ToList();
            var pool = wild.Count > 0 && random.NextDouble() < wildness ? wild : items.Where(c => !c.Wild).ToList();
            return pool[random.Next(pool.Count)].Key;
        }

        return new Look(Pick(Furs), Pick(Outfits), random.NextDouble() < 0.4 ? "none" : Pick(Faces), Pick(Frames));
    }

    /// <summary>A starter fur for a new account (one of the free ones), so not every new team is white.</summary>
    public static string StarterFur(Random random)
    {
        var free = Furs.Where(f => f.Level == 1 && f.Wins == 0 && f.Kills == 0).ToList();
        return free[random.Next(free.Count)].Key;
    }
}
