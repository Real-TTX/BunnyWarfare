using BunnyWarfare.Data;

namespace BunnyWarfare.Game;

/// <summary>The computer player: tries many shots in its head (<see cref="Simulation.Predict"/>), takes the one that hurts the enemy most, and misses a little by its level.</summary>
public static class Bot
{
    public sealed record Decision(WeaponState Weapon, Aim Aim);

    public static Decision? Plan(GameState state, TeamState team, BunnyState bunny)
    {
        var enemies = state.Bunnies.Where(b => b.Alive && b.TeamIndex != team.Index).OrderBy(b => b.Position.DistanceTo(bunny.Position)).Take(3).ToList();
        if (enemies.Count == 0)
        {
            return null;
        }

        var usable = state.Weapons.Where(w => HasAmmo(team, w)).ToList();
        Decision? best = null;
        var bestScore = double.MinValue;

        void Consider(WeaponState weapon, Aim aim, V3 impact)
        {
            var score = Score(state, team, weapon, impact);
            if (score > bestScore)
            {
                bestScore = score;
                best = new Decision(weapon, aim);
            }
        }

        foreach (var weapon in usable.Where(w => w.Kind is WeaponKind.Projectile or WeaponKind.Grenade or WeaponKind.Cluster))
        {
            // the special ones only now and then
            if (weapon.Ammo > 0 && state.Random.NextDouble() < 0.5)
            {
                continue;
            }

            foreach (var enemy in enemies)
            {
                var dx = enemy.Position.X - bunny.Position.X;
                var dz = enemy.Position.Z - bunny.Position.Z;
                var yaw = Math.Atan2(dx, dz);
                for (var pitchDeg = 6; pitchDeg <= 72; pitchDeg += 6)
                {
                    for (var power = 0.3; power <= 1.0001; power += 0.06)
                    {
                        // the wind blows the projectile sideways: aim a little against it
                        for (var yawFix = -0.08; yawFix <= 0.0801; yawFix += weapon.AffectedByWind && state.Wind.Length > 0.3 ? 0.08 : 1)
                        {
                            var aim = new Aim(yaw + yawFix, pitchDeg * Math.PI / 180, power);
                            if (Simulation.Predict(state, bunny, weapon, aim) is { } impact)
                            {
                                Consider(weapon, aim, impact);
                            }
                        }
                    }
                }
            }
        }

        // close by and in sight: the shotgun
        foreach (var weapon in usable.Where(w => w.Kind == WeaponKind.Hitscan))
        {
            foreach (var enemy in enemies.Where(e => e.Position.DistanceTo(bunny.Position) < 12))
            {
                var (origin, _) = Simulation.Muzzle(bunny, new Aim(0, 0, 1));
                var to = enemy.Center - origin;
                var aim = new Aim(Math.Atan2(to.X, to.Z), Math.Asin(Math.Clamp(to.Y / to.Length, -1, 1)), 1);
                var (_, dir) = Simulation.Muzzle(bunny, aim);
                var (hit, point) = Simulation.Ray(state, origin, dir, 40, bunny);
                if (hit && point.DistanceTo(enemy.Center) < 0.8)
                {
                    Consider(weapon, aim, point);
                }
            }
        }

        // an airstrike on the biggest group of enemies
        foreach (var weapon in usable.Where(w => w.Kind == WeaponKind.Airstrike && state.Random.NextDouble() < 0.35))
        {
            var target = enemies[0];
            var aim = new Aim(state.Random.NextDouble() * Math.PI * 2, 0, 1, target.Position.X, target.Position.Z);
            Consider(weapon, aim, target.Position);
        }

        if (best is null)
        {
            return null;
        }

        // nobody is perfect: an error by level
        var (yawError, pitchError, powerError) = team.BotLevel switch
        {
            BotLevel.Easy => (0.10, 0.08, 0.10),
            BotLevel.Hard => (0.012, 0.01, 0.012),
            _ => (0.04, 0.03, 0.04),
        };
        var r = state.Random;
        var a = best.Aim;
        var wobble = best.Weapon.Kind == WeaponKind.Airstrike ? 0 : 1;
        var noisy = a with
        {
            Yaw = a.Yaw + (r.NextDouble() * 2 - 1) * yawError * wobble,
            Pitch = a.Pitch + (r.NextDouble() * 2 - 1) * pitchError * wobble,
            Power = Math.Clamp(a.Power + (r.NextDouble() * 2 - 1) * powerError * wobble, 0.1, 1),
            TargetX = a.TargetX + (r.NextDouble() * 2 - 1) * yawError * 20,
            TargetZ = a.TargetZ + (r.NextDouble() * 2 - 1) * yawError * 20,
        };
        return best with { Aim = noisy };
    }

    public static bool HasAmmo(TeamState team, WeaponState weapon)
        => weapon.Ammo < 0 || !team.Ammo.TryGetValue(weapon.Id, out var left) || left > 0;

    /// <summary>The damage a hit at <paramref name="impact"/> would do: to enemies counts, to the own team counts twice against it.</summary>
    private static double Score(GameState state, TeamState team, WeaponState weapon, V3 impact)
    {
        var reach = weapon.BlastRadius + Simulation.BunnyRadius;
        double score = 0;
        double nearest = double.MaxValue;
        foreach (var b in state.Bunnies.Where(b => b.Alive))
        {
            var d = b.Center.DistanceTo(impact);
            var share = d < reach ? 1 - d / reach : 0;
            var damage = Math.Min(b.Health, weapon.Damage * share * (weapon.Kind == WeaponKind.Hitscan ? weapon.Pellets : 1));
            if (b.TeamIndex == team.Index)
            {
                score -= damage * 2;
            }
            else
            {
                score += damage + (damage >= b.Health ? 30 : 0);
                nearest = Math.Min(nearest, d);
            }
        }

        // no damage at all: at least come close
        return score - (nearest == double.MaxValue ? 100 : nearest * 0.5);
    }
}
