using BunnyWarfare.Data;
using BunnyWarfare.Game;

namespace BunnyWarfare.Tests;

public sealed class SimulationTests
{
    private static GameState FlatState(double height = 2, int size = 64, double gravity = 9.81)
    {
        var heights = Enumerable.Repeat((float)height, size * size).ToArray();
        var state = new GameState
        {
            Terrain = new Terrain(size, heights, 0), Gravity = gravity, MaxWind = 0, Theme = WorldTheme.Meadow, WorldName = "Test", TurnSeconds = 45, Random = new Random(1),
        };
        state.Teams.Add(new TeamState { Index = 0, Name = "A", Color = "#c2410c" });
        state.Teams.Add(new TeamState { Index = 1, Name = "B", Color = "#2563eb" });
        return state;
    }

    private static BunnyState AddBunny(GameState state, int id, int team, double x, double z, int health = 100)
    {
        var bunny = new BunnyState { Id = id, TeamIndex = team, Name = $"B{id}", Position = new V3(x, state.Terrain.HeightAt(x, z), z), Health = health };
        state.Bunnies.Add(bunny);
        return bunny;
    }

    private static WeaponState Weapon(WeaponKind kind, int damage = 50, double radius = 2.5, int clusterCount = 3) => new()
    {
        Id = (long)kind + 1, Name = kind.ToString(), Kind = kind, Damage = damage, BlastRadius = radius, AffectedByWind = kind == WeaponKind.Projectile, FuseSeconds = 2,
        ClusterCount = clusterCount, Pellets = 3, Ammo = -1,
    };

    [Fact]
    public void Generate_IsDeterministic_AndHasLandAndWater()
    {
        var a = Terrain.Generate(96, 1337, 7, 0.5, 0);
        var b = Terrain.Generate(96, 1337, 7, 0.5, 0);
        Assert.Equal(a.Heights, b.Heights);
        Assert.Contains(a.Heights, h => h > 1);
        Assert.Contains(a.Heights, h => h < 0);
        // the edges are under water
        Assert.True(a.HeightAt(0, 0) < 0);
        Assert.True(a.HeightAt(a.Width, a.Width) < 0);
    }

    [Fact]
    public void Crater_LowersTheGroundInsideTheRadiusOnly()
    {
        var state = FlatState();
        state.Terrain.Crater(new V3(10, 2, 10), 2);
        Assert.True(state.Terrain.HeightAt(10, 10) < 0.1);
        Assert.Equal(2, state.Terrain.HeightAt(15, 15), 3);
    }

    [Fact]
    public void Projectile_ExplodesNearTheTarget_AndHurtsIt()
    {
        var state = FlatState();
        var shooter = AddBunny(state, 1, 0, 10, 16);
        var target = AddBunny(state, 2, 1, 22, 16);
        var weapon = Weapon(WeaponKind.Projectile);

        // search the power that lands closest to the target, then fire it
        var yaw = Math.Atan2(target.Position.X - shooter.Position.X, target.Position.Z - shooter.Position.Z);
        var best = Enumerable.Range(10, 90).Select(p => p / 100.0)
            .Select(p => (Power: p, Impact: Simulation.Predict(state, shooter, weapon, new Aim(yaw, 0.6, p))))
            .Where(x => x.Impact is not null)
            .MinBy(x => x.Impact!.Value.DistanceTo(target.Center));
        var result = Simulation.Fire(state, shooter, weapon, new Aim(yaw, 0.6, best.Power));

        Assert.Single(result.Projectiles);
        Assert.NotEmpty(result.Explosions);
        Assert.Contains(result.Damages, d => d.BunnyId == target.Id);
        Assert.True(target.Health < 100);
        Assert.True(state.Teams[0].DamageDealt > 0);
        Assert.True(result.Duration > 0.5);
    }

    [Fact]
    public void Grenade_ExplodesAfterItsFuse()
    {
        var state = FlatState();
        var shooter = AddBunny(state, 1, 0, 10, 10);
        var result = Simulation.Fire(state, shooter, Weapon(WeaponKind.Grenade), new Aim(0, 0.3, 0.3));
        var explosion = Assert.Single(result.Explosions);
        Assert.InRange(explosion.T, 1.9, 2.2);
    }

    [Fact]
    public void Cluster_ScattersBomblets()
    {
        var state = FlatState();
        var shooter = AddBunny(state, 1, 0, 30, 10);
        var result = Simulation.Fire(state, shooter, Weapon(WeaponKind.Cluster), new Aim(0, 0.5, 0.6));
        Assert.Equal(4, result.Projectiles.Count);
        Assert.True(result.Explosions.Count >= 2);
    }

    [Fact]
    public void Shotgun_HitsABunnyInFront()
    {
        var state = FlatState();
        var shooter = AddBunny(state, 1, 0, 10, 10);
        var target = AddBunny(state, 2, 1, 10, 14);
        var (origin, _) = Simulation.Muzzle(shooter, new Aim(0, 0, 1));
        var to = target.Center - origin;
        var result = Simulation.Fire(state, shooter, Weapon(WeaponKind.Hitscan, damage: 20, radius: 0.8), new Aim(0, Math.Asin(to.Y / to.Length), 1));
        Assert.Equal(3, result.Rays.Count);
        Assert.True(target.Health < 100);
    }

    [Fact]
    public void Airstrike_DropsOnTheTarget()
    {
        var state = FlatState();
        var shooter = AddBunny(state, 1, 0, 5, 5);
        var target = AddBunny(state, 2, 1, 25, 25);
        var result = Simulation.Fire(state, shooter, Weapon(WeaponKind.Airstrike), new Aim(0, 0, 1, 25, 25));
        Assert.Equal(3, result.Projectiles.Count);
        Assert.True(target.Health < 100);
        Assert.Equal(100, shooter.Health);
    }

    [Fact]
    public void Bunny_KnockedIntoTheWater_Drowns()
    {
        // a thin strip of land at the edge of the water
        var state = FlatState(height: -3);
        for (var iz = 0; iz < 64; iz++)
        {
            for (var ix = 0; ix < 6; ix++)
            {
                state.Terrain.Heights[iz * 64 + ix] = 0.5f;
            }
        }

        var shooter = AddBunny(state, 1, 0, 0.5, 30);
        var victim = AddBunny(state, 2, 1, 2.4, 30, health: 300);

        // a big blast right behind the victim pushes it into the sea
        var result = Simulation.Fire(state, shooter, Weapon(WeaponKind.Airstrike, damage: 10, radius: 3, clusterCount: 1), new Aim(0, 0, 1, 1.4, 30));
        Assert.False(victim.Alive);
        Assert.Contains(result.Deaths, d => d.BunnyId == victim.Id && d.Cause == "water");
        Assert.Equal(1, state.Teams[0].Kills);
    }
}
