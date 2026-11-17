using BunnyWarfare.Data;

namespace BunnyWarfare.Game;

public enum TurnPhase
{
    /// <summary>The bunny of the turn may walk and shoot.</summary>
    Aiming,

    /// <summary>A shot flies and explodes (the browsers play it).</summary>
    Resolving,

    /// <summary>A few seconds after the shot to run for cover.</summary>
    Retreat,

    Over,
}

public sealed class BunnyState
{
    public required int Id { get; init; }

    public required int TeamIndex { get; init; }

    public required string Name { get; init; }

    /// <summary>The feet of the bunny.</summary>
    public V3 Position { get; set; }

    public double Yaw { get; set; }

    public int Health { get; set; }

    public bool Alive => Health > 0;

    /// <summary>The middle of the body: what explosions measure to and projectiles hit.</summary>
    public V3 Center => Position + new V3(0, Simulation.BunnyCenterHeight, 0);
}

public sealed class WeaponState
{
    public required long Id { get; init; }

    public required string Name { get; init; }

    public required WeaponKind Kind { get; init; }

    public required int Damage { get; init; }

    public required double BlastRadius { get; init; }

    public required bool AffectedByWind { get; init; }

    public required double FuseSeconds { get; init; }

    public required int ClusterCount { get; init; }

    public required int Pellets { get; init; }

    /// <summary>Shots per team; -1 = unlimited.</summary>
    public required int Ammo { get; init; }

    public static WeaponState From(Weapon w) => new()
    {
        Id = w.Id, Name = w.Name, Kind = w.Kind, Damage = w.Damage, BlastRadius = w.BlastRadius, AffectedByWind = w.AffectedByWind, FuseSeconds = w.FuseSeconds,
        ClusterCount = w.ClusterCount, Pellets = w.Pellets, Ammo = w.AmmoPerMatch,
    };
}

public sealed class TeamState
{
    public required int Index { get; init; }

    public required string Name { get; init; }

    public required string Color { get; init; }

    public long? PlayerId { get; init; }

    public bool IsBot { get; init; }

    public BotLevel BotLevel { get; init; }

    /// <summary>Shots left per weapon (only weapons with limited ammo are in it).</summary>
    public Dictionary<long, int> Ammo { get; } = [];

    /// <summary>Which of the team's bunnies comes next (cycles through the living ones).</summary>
    public int BunnyCursor { get; set; }

    public int Kills { get; set; }

    public int DamageDealt { get; set; }

    /// <summary>The turn the team lost its last bunny (for the placement); null while it lives.</summary>
    public int? EliminatedAtTurn { get; set; }

    public bool Surrendered { get; set; }
}

/// <summary>The state of a running match. Only touched under the lock of its <see cref="MatchRoom"/>.</summary>
public sealed class GameState
{
    public required Terrain Terrain { get; init; }

    public required double Gravity { get; init; }

    public required double MaxWind { get; init; }

    public required WorldTheme Theme { get; init; }

    public required string WorldName { get; init; }

    public required int TurnSeconds { get; init; }

    public required Random Random { get; init; }

    public List<TeamState> Teams { get; } = [];

    public List<BunnyState> Bunnies { get; } = [];

    public List<WeaponState> Weapons { get; } = [];

    public int TurnNumber { get; set; }

    public int CurrentTeam { get; set; } = -1;

    public int CurrentBunnyId { get; set; } = -1;

    public TurnPhase Phase { get; set; } = TurnPhase.Aiming;

    public DateTime PhaseEnds { get; set; }

    /// <summary>The wind of the turn (horizontal acceleration, m/s²).</summary>
    public V3 Wind { get; set; }

    /// <summary>Metres the bunny of the turn may still walk.</summary>
    public double Stamina { get; set; }

    public DateTime? BotActAt { get; set; }

    public int? WinnerTeam { get; set; }

    public BunnyState? CurrentBunny => Bunnies.FirstOrDefault(b => b.Id == CurrentBunnyId);

    public bool TeamAlive(int teamIndex) => Bunnies.Any(b => b.TeamIndex == teamIndex && b.Alive);
}
