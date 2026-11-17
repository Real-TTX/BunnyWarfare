namespace BunnyWarfare.Data;

/// <summary>The state of a record that supports soft delete (0 = Deleted, 1 = Created, 2 = Updated).</summary>
public enum UpdateState : short
{
    Deleted = 0,
    Created = 1,
    Updated = 2,
}

/// <summary>Every record has an Id (bigint) and the four audit columns.</summary>
public abstract class Entity
{
    public long Id { get; set; }

    public DateTime CreateDate { get; set; }

    public long? CreateUserId { get; set; }

    public DateTime UpdateDate { get; set; }

    public long? UpdateUserId { get; set; }
}

/// <summary>A record that is never removed from the table, only marked as deleted.</summary>
public abstract class SoftDeleteEntity : Entity
{
    public UpdateState UpdateState { get; set; } = UpdateState.Created;
}

public enum PlayerRole : short
{
    Player = 0,
    Admin = 1,
}

/// <summary>An account: signs in, plays, and (as an administrator) manages the server.</summary>
public sealed class Player : SoftDeleteEntity
{
    /// <summary>The name to sign in with (unique, compared without case).</summary>
    public string LoginName { get; set; } = string.Empty;

    public string DisplayName { get; set; } = string.Empty;

    public string PasswordHash { get; set; } = string.Empty;

    public PlayerRole Role { get; set; } = PlayerRole.Player;

    public bool IsActive { get; set; } = true;

    /// <summary>The name of the team of bunnies the player brings into a match.</summary>
    public string TeamName { get; set; } = string.Empty;

    /// <summary>The colour of the team (#rrggbb).</summary>
    public string TeamColor { get; set; } = "#c2410c";

    public DateTime? LastLoginDate { get; set; }

    public int GamesPlayed { get; set; }

    public int GamesWon { get; set; }

    public int Kills { get; set; }

    public int DamageDealt { get; set; }

    /// <summary>Experience from finished matches (Business.Cosmetics.XpForMatch); the level follows from it.</summary>
    public int Xp { get; set; }

    /// <summary>The look of the player's bunnies: keys of Business.Cosmetics (fur, outfit, face) and the frame of the portrait.</summary>
    public string Fur { get; set; } = "snow";

    public string Outfit { get; set; } = "helmet";

    public string Face { get; set; } = "none";

    public string Frame { get; set; } = "wood";
}

public enum WorldTheme : short
{
    Meadow = 0,
    Snow = 1,
    Desert = 2,
    Moon = 3,
    Autumn = 4,
    Volcano = 5,
    Jungle = 6,
}

/// <summary>A small island the bunnies fight on: generated from a seed and a few parameters.</summary>
public sealed class World : SoftDeleteEntity
{
    public string Name { get; set; } = string.Empty;

    public string Description { get; set; } = string.Empty;

    public WorldTheme Theme { get; set; }

    /// <summary>Points of the height map per side (the island is (GridSize - 1) * 0.5 m wide).</summary>
    public int GridSize { get; set; } = 96;

    /// <summary>The height of the highest hills in metres.</summary>
    public double HillHeight { get; set; } = 7;

    /// <summary>0 = gentle, 1 = rugged.</summary>
    public double Roughness { get; set; } = 0.5;

    public double WaterLevel { get; set; }

    public double Gravity { get; set; } = 9.81;

    /// <summary>The strongest wind of a turn (m/s²).</summary>
    public double MaxWind { get; set; } = 4;

    public int Seed { get; set; }

    public bool IsEnabled { get; set; } = true;
}

public enum WeaponKind : short
{
    /// <summary>Flies straight off, drifts with the wind, explodes on impact.</summary>
    Projectile = 0,

    /// <summary>Bounces and explodes after its fuse.</summary>
    Grenade = 1,

    /// <summary>Explodes on impact and scatters bomblets.</summary>
    Cluster = 2,

    /// <summary>A blast of pellets along the line of sight.</summary>
    Hitscan = 3,

    /// <summary>Drops a row of bombs from the sky onto a target.</summary>
    Airstrike = 4,
}

public sealed class Weapon : SoftDeleteEntity
{
    public string Name { get; set; } = string.Empty;

    public string Description { get; set; } = string.Empty;

    public WeaponKind Kind { get; set; }

    public int Damage { get; set; } = 40;

    /// <summary>The radius of the explosion in metres (the crater is a little smaller).</summary>
    public double BlastRadius { get; set; } = 2.5;

    public bool AffectedByWind { get; set; }

    /// <summary>Grenade only: seconds until it explodes.</summary>
    public double FuseSeconds { get; set; } = 3;

    /// <summary>Cluster only: how many bomblets it scatters. Airstrike: how many bombs drop.</summary>
    public int ClusterCount { get; set; } = 4;

    /// <summary>Hitscan only: pellets of one shot.</summary>
    public int Pellets { get; set; } = 3;

    /// <summary>Shots of one team per match; -1 = unlimited.</summary>
    public int AmmoPerMatch { get; set; } = -1;

    public int SortOrder { get; set; }

    public bool IsEnabled { get; set; } = true;
}

public enum MatchStatus : short
{
    Lobby = 0,
    Running = 1,
    Finished = 2,
    Aborted = 3,
}

public sealed class Match : Entity
{
    /// <summary>The secret part of the link to the match (who has it, can join).</summary>
    public Guid Token { get; set; } = Guid.NewGuid();

    public string Name { get; set; } = string.Empty;

    public long WorldId { get; set; }

    public World? World { get; set; }

    public long HostPlayerId { get; set; }

    public Player? HostPlayer { get; set; }

    public MatchStatus Status { get; set; } = MatchStatus.Lobby;

    /// <summary>A public match is listed under "Open matches"; a private one is only reached by its link.</summary>
    public bool IsPublic { get; set; } = true;

    public int MaxTeams { get; set; } = 4;

    public int BunniesPerTeam { get; set; } = 3;

    public int BunnyHealth { get; set; } = 100;

    public int TurnSeconds { get; set; } = 45;

    public DateTime? StartDate { get; set; }

    public DateTime? EndDate { get; set; }

    public int TurnCount { get; set; }

    public int? WinnerTeamIndex { get; set; }

    public List<MatchTeam> Teams { get; set; } = [];
}

public enum BotLevel : short
{
    Easy = 0,
    Normal = 1,
    Hard = 2,
}

/// <summary>One team of a match: a player's or a bot's.</summary>
public sealed class MatchTeam : Entity
{
    public long MatchId { get; set; }

    public Match? Match { get; set; }

    public int TeamIndex { get; set; }

    public long? PlayerId { get; set; }

    public Player? Player { get; set; }

    public bool IsBot { get; set; }

    public BotLevel BotLevel { get; set; } = BotLevel.Normal;

    public string TeamName { get; set; } = string.Empty;

    public string TeamColor { get; set; } = "#c2410c";

    public int Kills { get; set; }

    public int DamageDealt { get; set; }

    /// <summary>1 = winner; 0 while the match runs.</summary>
    public int Placement { get; set; }

    /// <summary>The look the team had in this match (so old results show the right portraits, also of bots).</summary>
    public string Fur { get; set; } = "snow";

    public string Outfit { get; set; } = "helmet";

    public string Face { get; set; } = "none";

    public string Frame { get; set; } = "wood";

    /// <summary>The experience the player got for this match (0 for bots and aborted matches).</summary>
    public int XpGained { get; set; }
}

/// <summary>A setting of the server (key and value).</summary>
public sealed class Setting : Entity
{
    public string Key { get; set; } = string.Empty;

    public string Value { get; set; } = string.Empty;
}
