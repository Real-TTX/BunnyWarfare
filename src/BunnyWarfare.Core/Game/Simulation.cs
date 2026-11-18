using BunnyWarfare.Data;

namespace BunnyWarfare.Game;

/// <summary>What the bunny of the turn aims with: yaw (radians, 0 = +z), pitch (radians, up), power (0..1) and, for an airstrike, the target on the map.</summary>
public readonly record struct Aim(double Yaw, double Pitch, double Power, double TargetX = 0, double TargetZ = 0);

/// <summary>A flying object for the browser: its look and its positions every <see cref="Simulation.SampleInterval"/> seconds from <see cref="Start"/>.</summary>
public sealed record ProjectileTrack(string Look, double Start, float[] Points, string End);

public sealed record ExplosionEvent(double T, double X, double Y, double Z, double Radius, double Crater);

public sealed record DamageEvent(double T, int BunnyId, int Amount, int Health);

public sealed record BunnyTrack(int BunnyId, double Start, float[] Points);

public sealed record DeathEvent(double T, int BunnyId, string Cause);

public sealed record RayEvent(double T, float[] From, float[] To);

/// <summary>What happened to a supply crate during a shot: "destroyed", "picked" (by <see cref="BunnyId"/>, with <see cref="Text"/>), "moved" (to <see cref="Y"/>), "sunk".</summary>
public sealed record CrateEvent(double T, int CrateId, string Action, int? BunnyId = null, double? Y = null, string? Text = null, string? Look = null);

/// <summary>The Hasenloch: the bunny digs in at <see cref="From"/> and pops out at <see cref="To"/>.</summary>
public sealed record TeleportEvent(double T, int BunnyId, float[] From, float[] To);

/// <summary>Everything a shot does, in the order of time: the browsers play it, the server has already applied it.</summary>
public sealed class ShotResult
{
    public int ShooterId { get; init; }

    public long WeaponId { get; init; }

    public string WeaponName { get; init; } = string.Empty;

    public WeaponKind Kind { get; init; }

    public List<ProjectileTrack> Projectiles { get; } = [];

    public List<RayEvent> Rays { get; } = [];

    public List<ExplosionEvent> Explosions { get; } = [];

    public List<DamageEvent> Damages { get; } = [];

    public List<BunnyTrack> BunnyTracks { get; } = [];

    public List<DeathEvent> Deaths { get; } = [];

    public List<CrateEvent> Crates { get; } = [];

    public List<TeleportEvent> Teleports { get; } = [];

    public double Duration { get; set; }

    internal void Extend(double t) => Duration = Math.Max(Duration, t);
}

/// <summary>
/// The physics of BunnyWarfare: projectiles, explosions, craters, damage, knockback and falls. Runs on the server only; the result is sent to every browser.
/// </summary>
public static class Simulation
{
    public const double Dt = 1.0 / 120;
    public const double SampleInterval = 1.0 / 30;
    public const int StepsPerSample = 4;
    public const double MaxSpeed = 24;
    public const double BunnyRadius = 0.45;
    public const double BunnyCenterHeight = 0.5;
    public const double WindFactor = 1.0;
    public const double MaxFlightSeconds = 14;

    private enum FlightEnd
    {
        Impact,
        Splash,
        Vanish,
        Fuse,
    }

    private sealed record Flight(List<V3> Samples, V3 End, double EndTime, FlightEnd How, BunnyState? HitBunny);

    private sealed class FlightOptions
    {
        public bool Wind { get; init; }

        public bool Bounces { get; init; }

        public double Fuse { get; init; } = double.MaxValue;

        public BunnyState? Shooter { get; init; }

        public bool Record { get; init; } = true;
    }

    /// <summary>Where the muzzle is and in which direction it points.</summary>
    public static (V3 Origin, V3 Direction) Muzzle(BunnyState shooter, Aim aim)
    {
        var dir = new V3(Math.Cos(aim.Pitch) * Math.Sin(aim.Yaw), Math.Sin(aim.Pitch), Math.Cos(aim.Pitch) * Math.Cos(aim.Yaw));
        return (shooter.Position + new V3(0, 0.85, 0) + dir * 0.6, dir);
    }

    /// <summary>Fires a weapon: changes the terrain and the bunnies of <paramref name="state"/> and returns what happened.</summary>
    public static ShotResult Fire(GameState state, BunnyState shooter, WeaponState weapon, Aim aim)
    {
        var result = new ShotResult { ShooterId = shooter.Id, WeaponId = weapon.Id, WeaponName = weapon.Name, Kind = weapon.Kind };
        var (origin, dir) = Muzzle(shooter, aim);
        var power = Math.Clamp(aim.Power, 0.05, 1);
        // "Doppel-Wumms" from a crate: this shot hurts twice as much (the Hasenloch does not use it up)
        var team = state.Teams.FirstOrDefault(t => t.Index == shooter.TeamIndex);
        var damage = weapon.Damage;
        if (team is { DoubleDamage: true } && weapon.Kind != WeaponKind.Teleport)
        {
            damage *= 2;
            team.DoubleDamage = false;
        }

        switch (weapon.Kind)
        {
            case WeaponKind.Teleport:
            {
                var from = shooter.Position;
                var to = new V3(aim.TargetX, state.Terrain.HeightAt(aim.TargetX, aim.TargetZ), aim.TargetZ);
                shooter.Position = to;
                result.Teleports.Add(new TeleportEvent(0.5, shooter.Id, P(from), P(to)));
                result.Extend(1.6);
                break;
            }

            case WeaponKind.Projectile:
            {
                var flight = Fly(state, origin, dir * (power * MaxSpeed), new FlightOptions { Wind = weapon.AffectedByWind, Shooter = shooter });
                Track(result, "carrot", 0, flight);
                if (flight.How == FlightEnd.Impact)
                {
                    Explode(state, result, flight.End, flight.EndTime, weapon.BlastRadius, damage, shooter.TeamIndex);
                }

                break;
            }

            case WeaponKind.Grenade:
            {
                var flight = Fly(state, origin, dir * (power * MaxSpeed * 0.8), new FlightOptions { Bounces = true, Fuse = weapon.FuseSeconds, Shooter = shooter });
                Track(result, "beet", 0, flight);
                if (flight.How is FlightEnd.Fuse or FlightEnd.Impact)
                {
                    Explode(state, result, flight.End, flight.EndTime, weapon.BlastRadius, damage, shooter.TeamIndex);
                }

                break;
            }

            case WeaponKind.Cluster:
            {
                var flight = Fly(state, origin, dir * (power * MaxSpeed * 0.9), new FlightOptions { Wind = weapon.AffectedByWind, Shooter = shooter });
                Track(result, "cabbage", 0, flight);
                if (flight.How != FlightEnd.Impact)
                {
                    break;
                }

                Explode(state, result, flight.End, flight.EndTime, weapon.BlastRadius, damage, shooter.TeamIndex);
                var count = Math.Max(1, weapon.ClusterCount);
                var start = flight.End + new V3(0, 0.4, 0);
                for (var i = 0; i < count; i++)
                {
                    var angle = 2 * Math.PI * i / count + state.Random.NextDouble() * 0.6;
                    var outward = 2.5 + state.Random.NextDouble() * 2.5;
                    var velocity = new V3(Math.Sin(angle) * outward, 6 + state.Random.NextDouble() * 2.5, Math.Cos(angle) * outward);
                    var bomblet = Fly(state, start, velocity, new FlightOptions());
                    Track(result, "leaf", flight.EndTime, bomblet);
                    if (bomblet.How == FlightEnd.Impact)
                    {
                        Explode(state, result, bomblet.End, flight.EndTime + bomblet.EndTime, weapon.BlastRadius * 0.7, (int)Math.Round(damage * 0.6),
                            shooter.TeamIndex);
                    }
                }

                break;
            }

            case WeaponKind.Hitscan:
            {
                var pellets = Math.Max(1, weapon.Pellets);
                for (var i = 0; i < pellets; i++)
                {
                    var spread = pellets == 1 ? 0 : (i - (pellets - 1) / 2.0) * 0.035;
                    var lift = (i % 2 == 0 ? 1 : -1) * 0.012 * (i == 0 ? 0 : 1);
                    var pelletAim = aim with { Yaw = aim.Yaw + spread, Pitch = aim.Pitch + lift };
                    var (from, direction) = Muzzle(shooter, pelletAim);
                    var t = 0.12 * i;
                    var (hit, to) = Ray(state, from, direction, 40, shooter);
                    result.Rays.Add(new RayEvent(t, P(from), P(to)));
                    if (hit)
                    {
                        Explode(state, result, to, t + 0.05, weapon.BlastRadius, damage, shooter.TeamIndex);
                    }

                    result.Extend(t + 0.3);
                }

                break;
            }

            case WeaponKind.Airstrike:
            {
                var count = Math.Max(1, weapon.ClusterCount);
                var forward = new V3(Math.Sin(aim.Yaw), 0, Math.Cos(aim.Yaw));
                var top = state.Terrain.Heights.Max() + 16;
                for (var i = 0; i < count; i++)
                {
                    var offset = (i - (count - 1) / 2.0) * 1.7;
                    var start = new V3(aim.TargetX + forward.X * (offset - 3), top, aim.TargetZ + forward.Z * (offset - 3));
                    var t0 = 0.6 + i * 0.18;
                    var drop = Fly(state, start, forward * 2.0 + new V3(0, -4, 0), new FlightOptions());
                    Track(result, "carrot-drop", t0, drop);
                    if (drop.How == FlightEnd.Impact)
                    {
                        Explode(state, result, drop.End, t0 + drop.EndTime, weapon.BlastRadius, damage, shooter.TeamIndex);
                    }
                }

                break;
            }
        }

        // whatever lost the ground under its feet falls now; then the crates follow the ground and the bunnies take what they landed on
        Settle(state, result, result.Duration, shooter.TeamIndex);
        Crates.Settle(state, result, result.Duration);
        Crates.PickUpAfterShot(state, result, result.Duration);
        result.Extend(0.5);
        return result;
    }

    /// <summary>Whether the Hasenloch may bring <paramref name="bunny"/> to (x, z): on the island, on land, not onto another bunny.</summary>
    public static bool CanTeleport(GameState state, BunnyState bunny, double x, double z)
    {
        var terrain = state.Terrain;
        if (!double.IsFinite(x) || !double.IsFinite(z) || x < 0.3 || z < 0.3 || x > terrain.Width - 0.3 || z > terrain.Width - 0.3)
        {
            return false;
        }

        if (terrain.HeightAt(x, z) < terrain.WaterLevel + 0.1)
        {
            return false;
        }

        return !state.Bunnies.Any(b => b.Alive && b != bunny && Math.Sqrt((b.Position.X - x) * (b.Position.X - x) + (b.Position.Z - z) * (b.Position.Z - z)) < 0.9);
    }

    /// <summary>Where a shot would land, without changing anything (the bots aim with it). Null when it ends in the water or off the map.</summary>
    public static V3? Predict(GameState state, BunnyState shooter, WeaponState weapon, Aim aim)
    {
        var (origin, dir) = Muzzle(shooter, aim);
        var power = Math.Clamp(aim.Power, 0.05, 1);
        Flight flight = weapon.Kind switch
        {
            WeaponKind.Grenade => Fly(state, origin, dir * (power * MaxSpeed * 0.8), new FlightOptions { Bounces = true, Fuse = weapon.FuseSeconds, Shooter = shooter, Record = false }),
            WeaponKind.Cluster => Fly(state, origin, dir * (power * MaxSpeed * 0.9), new FlightOptions { Wind = weapon.AffectedByWind, Shooter = shooter, Record = false }),
            _ => Fly(state, origin, dir * (power * MaxSpeed), new FlightOptions { Wind = weapon.AffectedByWind, Shooter = shooter, Record = false }),
        };
        return flight.How is FlightEnd.Impact or FlightEnd.Fuse ? flight.End : null;
    }

    /// <summary>A straight line from <paramref name="from"/>: whether it hits the ground or a bunny within <paramref name="range"/>, and where.</summary>
    public static (bool Hit, V3 Point) Ray(GameState state, V3 from, V3 direction, double range, BunnyState? ignore)
    {
        const double step = 0.08;
        var p = from;
        for (double d = 0; d < range; d += step)
        {
            p = from + direction * d;
            if (p.Y <= state.Terrain.HeightAt(p.X, p.Z))
            {
                return (true, p);
            }

            foreach (var b in state.Bunnies)
            {
                if (b.Alive && b != ignore && p.DistanceTo(b.Center) < BunnyRadius)
                {
                    return (true, p);
                }
            }
        }

        return (false, p);
    }

    private static Flight Fly(GameState state, V3 start, V3 velocity, FlightOptions options)
    {
        var terrain = state.Terrain;
        var samples = new List<V3>();
        if (options.Record)
        {
            samples.Add(start);
        }

        var pos = start;
        var vel = velocity;
        var gravity = new V3(0, -state.Gravity, 0);
        var wind = options.Wind ? state.Wind * WindFactor : new V3(0, 0, 0);
        var resting = false;
        var steps = 0;
        for (var t = 0.0; t < MaxFlightSeconds; t += Dt)
        {
            steps++;
            if (t >= options.Fuse)
            {
                return new Flight(samples, pos, t, FlightEnd.Fuse, null);
            }

            if (!resting)
            {
                vel += (gravity + wind) * Dt;
                var next = pos + vel * Dt;

                // a bunny in the way (the shooter only after the first moment)
                foreach (var b in state.Bunnies)
                {
                    if (!b.Alive || (b == options.Shooter && t < 0.3) || next.DistanceTo(b.Center) >= BunnyRadius + 0.12)
                    {
                        continue;
                    }

                    if (options.Bounces)
                    {
                        var away = (next - b.Center).Normalized();
                        vel = (vel - away * (2 * vel.Dot(away))) * 0.35;
                        next = pos;
                        break;
                    }

                    if (options.Record)
                    {
                        samples.Add(next);
                    }

                    return new Flight(samples, next, t + Dt, FlightEnd.Impact, b);
                }

                var ground = terrain.HeightAt(next.X, next.Z);
                if (next.Y <= ground && terrain.Inside(next.X, next.Z))
                {
                    if (!options.Bounces)
                    {
                        var impact = next with { Y = ground };
                        if (options.Record)
                        {
                            samples.Add(impact);
                        }

                        return new Flight(samples, impact, t + Dt, FlightEnd.Impact, null);
                    }

                    var normal = terrain.NormalAt(next.X, next.Z);
                    var into = vel.Dot(normal);
                    if (into < 0)
                    {
                        vel = (vel - normal * (2 * into)) * 0.45;
                    }

                    next = next with { Y = ground + 0.12 };
                    if (vel.Length < 0.8)
                    {
                        vel = new V3(0, 0, 0);
                        resting = true;
                    }
                }

                pos = next;
                if (pos.Y < terrain.WaterLevel && terrain.HeightAt(pos.X, pos.Z) < terrain.WaterLevel)
                {
                    if (options.Record)
                    {
                        samples.Add(pos);
                    }

                    return new Flight(samples, pos, t + Dt, FlightEnd.Splash, null);
                }

                var margin = 25;
                if (pos.X < -margin || pos.Z < -margin || pos.X > terrain.Width + margin || pos.Z > terrain.Width + margin || pos.Y < Terrain.Abyss)
                {
                    return new Flight(samples, pos, t + Dt, FlightEnd.Vanish, null);
                }
            }

            if (options.Record && steps % StepsPerSample == 0)
            {
                samples.Add(pos);
            }
        }

        return new Flight(samples, pos, MaxFlightSeconds, options.Bounces ? FlightEnd.Fuse : FlightEnd.Vanish, null);
    }

    private static void Track(ShotResult result, string look, double start, Flight flight)
    {
        var end = flight.How switch
        {
            FlightEnd.Impact or FlightEnd.Fuse => "explode",
            FlightEnd.Splash => "splash",
            _ => "vanish",
        };
        var points = new float[flight.Samples.Count * 3];
        for (var i = 0; i < flight.Samples.Count; i++)
        {
            points[i * 3] = R(flight.Samples[i].X);
            points[i * 3 + 1] = R(flight.Samples[i].Y);
            points[i * 3 + 2] = R(flight.Samples[i].Z);
        }

        result.Projectiles.Add(new ProjectileTrack(look, start, points, end));
        result.Extend(start + flight.EndTime);
    }

    /// <summary>An explosion: crater, damage by distance, knockback, falls; crates in it are destroyed, a weapon crate goes up itself (depth: chain only once).</summary>
    private static void Explode(GameState state, ShotResult result, V3 center, double t, double radius, int damage, int shooterTeam, int depth = 0)
    {
        var craterRadius = radius * 0.75;
        result.Explosions.Add(new ExplosionEvent(t, R(center.X), R(center.Y), R(center.Z), radius, craterRadius));
        state.Terrain.Crater(center, craterRadius);
        result.Extend(t + 0.8);

        var reach = radius + BunnyRadius;
        var knocked = new List<(BunnyState Bunny, V3 Velocity)>();
        foreach (var b in state.Bunnies.Where(b => b.Alive))
        {
            var offset = b.Center - center;
            var d = offset.Length;
            if (d >= reach)
            {
                continue;
            }

            var share = 1 - d / reach;
            var amount = Math.Max(1, (int)Math.Round(damage * share));
            Hurt(state, result, b, amount, t, shooterTeam);
            var away = (offset.Normalized() + new V3(0, 0.7, 0)).Normalized();
            knocked.Add((b, away * (2.5 + 8.5 * share)));
        }

        foreach (var (bunny, velocity) in knocked)
        {
            Tumble(state, result, bunny, velocity, t, shooterTeam);
        }

        foreach (var crate in Crates.DestroyNear(state, result, center, radius, t))
        {
            if (depth < 2)
            {
                Explode(state, result, crate.Position + new V3(0, Crates.CenterHeight, 0), t + 0.15, Crates.BlastRadius, Crates.BlastDamage, shooterTeam, depth + 1);
            }
        }
    }

    /// <summary>Lets every bunny that stands in the air fall down.</summary>
    private static void Settle(GameState state, ShotResult result, double t, int shooterTeam)
    {
        foreach (var b in state.Bunnies.Where(b => b.Alive))
        {
            var ground = state.Terrain.HeightAt(b.Position.X, b.Position.Z);
            if (b.Position.Y > ground + 0.05)
            {
                Tumble(state, result, b, new V3(0, 0, 0), t, shooterTeam);
            }
        }
    }

    /// <summary>A bunny flies (knocked away) or falls until it lands; a long fall hurts, the water drowns.</summary>
    private static void Tumble(GameState state, ShotResult result, BunnyState bunny, V3 velocity, double t0, int shooterTeam)
    {
        var terrain = state.Terrain;
        var pos = bunny.Position;
        var vel = velocity;
        var highest = pos.Y;
        var samples = new List<V3> { pos };
        var gravity = new V3(0, -state.Gravity, 0);
        var t = 0.0;
        var steps = 0;
        var drowned = false;
        while (t < 8)
        {
            steps++;
            t += Dt;
            vel += gravity * Dt;
            var next = pos + vel * Dt;
            highest = Math.Max(highest, next.Y);
            var ground = terrain.HeightAt(next.X, next.Z);
            if (next.Y <= ground)
            {
                // a wall: slide down along it instead of going through
                if (ground - pos.Y > 0.6)
                {
                    next = new V3(pos.X, Math.Max(next.Y, terrain.HeightAt(pos.X, pos.Z)), pos.Z);
                    vel = new V3(-vel.X * 0.2, Math.Min(0, vel.Y), -vel.Z * 0.2);
                    pos = next;
                    continue;
                }

                pos = next with { Y = ground };
                break;
            }

            pos = next;
            if (pos.Y < terrain.WaterLevel && ground < terrain.WaterLevel)
            {
                drowned = true;
                break;
            }

            if (pos.Y < Terrain.Abyss)
            {
                drowned = true;
                break;
            }

            if (steps % StepsPerSample == 0)
            {
                samples.Add(pos);
            }
        }

        samples.Add(pos);
        var points = new float[samples.Count * 3];
        for (var i = 0; i < samples.Count; i++)
        {
            points[i * 3] = R(samples[i].X);
            points[i * 3 + 1] = R(samples[i].Y);
            points[i * 3 + 2] = R(samples[i].Z);
        }

        if (samples.Count > 2)
        {
            result.BunnyTracks.Add(new BunnyTrack(bunny.Id, t0, points));
        }

        bunny.Position = pos;
        var landed = t0 + t;
        result.Extend(landed + 0.3);
        if (drowned)
        {
            Hurt(state, result, bunny, bunny.Health, landed, shooterTeam, "water");
            return;
        }

        var drop = highest - pos.Y;
        if (drop > 3.5)
        {
            Hurt(state, result, bunny, (int)Math.Round((drop - 3.5) * 4), landed, shooterTeam);
        }
    }

    private static void Hurt(GameState state, ShotResult result, BunnyState bunny, int amount, double t, int shooterTeam, string cause = "hp")
    {
        if (!bunny.Alive || amount <= 0)
        {
            return;
        }

        // the "Panzerfell" of a crate halves a hit (not the water)
        if (bunny.Shield > 0 && cause == "hp")
        {
            amount = (amount + 1) / 2;
            bunny.Shield--;
        }

        var dealt = Math.Min(amount, bunny.Health);
        bunny.Health -= dealt;
        result.Damages.Add(new DamageEvent(t, bunny.Id, dealt, bunny.Health));
        var shooter = state.Teams.FirstOrDefault(x => x.Index == shooterTeam);
        if (shooter is not null && bunny.TeamIndex != shooterTeam)
        {
            shooter.DamageDealt += dealt;
        }

        if (!bunny.Alive)
        {
            result.Deaths.Add(new DeathEvent(t + 0.4, bunny.Id, cause));
            result.Extend(t + 1.2);
            if (shooter is not null && bunny.TeamIndex != shooterTeam)
            {
                shooter.Kills++;
            }
        }
    }

    private static float[] P(V3 v) => [R(v.X), R(v.Y), R(v.Z)];

    private static float R(double v) => (float)Math.Round(v, 3);
}
