using BunnyWarfare.Data;

namespace BunnyWarfare.Business;

/// <summary>Rules and names of the game that need no database (the plugin, the offline game and the match in memory share them).</summary>
public static class GameRules
{
    /// <summary>The colours a team can have (well apart from each other on the meadow, the snow and the sand).</summary>
    public static readonly IReadOnlyList<(string Value, string Label)> TeamColors =
    [
        ("#c2410c", "Möhrenorange"), ("#2563eb", "Blau"), ("#16a34a", "Grün"), ("#9333ea", "Violett"),
        ("#dc2626", "Rot"), ("#0891b2", "Türkis"), ("#ca8a04", "Senf"), ("#db2777", "Pink"),
    ];

    public const int MinGridSize = 48;
    public const int MaxGridSize = 160;

    public static string CrateRateName(CrateRate rate) => rate switch
    {
        CrateRate.Off => "Aus",
        CrateRate.Rare => "Selten",
        CrateRate.Often => "Oft",
        _ => "Normal",
    };

    public static string StatusName(MatchStatus status) => status switch
    {
        MatchStatus.Lobby => "Lobby",
        MatchStatus.Running => "Läuft",
        MatchStatus.Finished => "Beendet",
        MatchStatus.Aborted => "Abgebrochen",
        _ => status.ToString(),
    };

    public static string ThemeName(WorldTheme theme) => theme switch
    {
        WorldTheme.Meadow => "Möhrenwiese",
        WorldTheme.Snow => "Frostbau",
        WorldTheme.Desert => "Dünenland",
        WorldTheme.Moon => "Mondkrater",
        WorldTheme.Autumn => "Herbstwald",
        WorldTheme.Volcano => "Vulkaninsel",
        WorldTheme.Jungle => "Dschungel",
        _ => theme.ToString(),
    };

    /// <summary>The width of an island in metres.</summary>
    public static double WidthOf(int gridSize) => (gridSize - 1) * Game.Terrain.CellSize;

    /// <summary>A team name for a new player ("Team Hoppel", at most 40 characters).</summary>
    public static string TeamNameFor(string displayName)
    {
        var name = $"Team {displayName.Trim()}";
        return name.Length > 40 ? name[..40] : name;
    }

    /// <summary>The settings of a server (or of the offline game) that matter for quick matches and new matches.</summary>
    public const int DefaultTurnSeconds = 45;

    public const int DefaultMaxTeams = 6;
}

/// <summary>A team as the lobby sends it into a starting match.</summary>
public sealed record TeamSlot(int TeamIndex, long? PlayerId, bool IsBot, BotLevel BotLevel, string TeamName, string TeamColor, Look Look);

/// <summary>The outcome of one team when a match ends.</summary>
public sealed record TeamOutcome(int TeamIndex, int Kills, int DamageDealt, int Placement);
