using System.Text.RegularExpressions;
using BunnyWarfare.Data;

namespace BunnyWarfare.Business;

public sealed record PlayerStats(int GamesPlayed, int GamesWon, int Kills, int DamageDealt, int Rank);

/// <summary>An item of the wardrobe for one player: whether it is theirs yet, and how to get it.</summary>
/// <param name="Level">The level that unlocks it (0 = only by wins or knock-outs).</param>
public sealed record WardrobeItem(string Key, string Name, bool Unlocked, string Requirement, bool Wild, int Level);

public sealed record WardrobeKind(string Kind, string Name, IReadOnlyList<WardrobeItem> Items);

/// <summary>The profile of the signed-in player: names, look, level and the progress to the next, numbers and the wardrobe.</summary>
public sealed record ProfileView(string DisplayName, bool IsGuest, string TeamName, string TeamColor, Look Look, int Level, int Xp, int XpAtLevel, int XpForNext,
    bool MaxLevel, PlayerStats Stats, IReadOnlyList<WardrobeKind> Wardrobe);

/// <summary>The rules of a player that need no database (the plugin and the offline game share them).</summary>
public static partial class PlayerRules
{
    [GeneratedRegex("^#[0-9a-fA-F]{6}$")]
    private static partial Regex ColorRegex();

    /// <summary>The profile view of a player: level, progress, the whole wardrobe.</summary>
    public static ProfileView ProfileOf(Player me, PlayerStats stats)
    {
        var progress = Progress.Of(me);
        var level = progress.Level;
        var wardrobe = Cosmetics.Kinds.Select(k => new WardrobeKind(k.Kind, k.Name,
            k.Items.Select(c => new WardrobeItem(c.Key, c.Name, c.IsUnlocked(progress), c.Requirement, c.Wild, c.Level)).ToList())).ToList();
        return new ProfileView(me.DisplayName, me.IsGuest, me.TeamName, me.TeamColor, Look.Of(me), level, me.Xp, Cosmetics.XpAt(level), Cosmetics.XpForNext(level),
            level >= Cosmetics.MaxLevel, stats, wardrobe);
    }

    public static void SetLook(Player player, Look look)
    {
        player.Fur = look.Fur;
        player.Outfit = look.Outfit;
        player.Face = look.Face;
        player.Frame = look.Frame;
    }

    public static void ValidateTeam(string teamName, string teamColor)
    {
        if (string.IsNullOrWhiteSpace(teamName) || teamName.Trim().Length > 40)
        {
            throw new BusinessException("Der Teamname fehlt oder ist länger als 40 Zeichen.", "TeamName");
        }

        if (!ColorRegex().IsMatch(teamColor ?? string.Empty))
        {
            throw new BusinessException("Die Teamfarbe ist keine Farbe (#rrggbb).", "TeamColor");
        }
    }

    /// <summary>Adds a finished match to the numbers and the experience of a player (the same as the server's MatchLogic.FinishAsync).</summary>
    public static int AddMatch(Player player, bool won, int placement, int kills, int damage)
    {
        var xp = Cosmetics.XpForMatch(won, placement, kills, damage, aborted: false);
        player.Xp += xp;
        player.GamesPlayed++;
        player.Kills += kills;
        player.DamageDealt += damage;
        if (won)
        {
            player.GamesWon++;
        }

        return xp;
    }
}
