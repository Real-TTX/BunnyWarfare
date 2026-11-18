using BunnyWarfare.Data;

namespace BunnyWarfare.Game;

/// <summary>
/// The supply crates: now and then one falls from the sky at the start of a turn (by the <see cref="CrateRate"/> of the match). A bunny that walks
/// (or is blown) onto it takes it for its team: ammo of a weapon, health, or a support item. Explosions destroy crates – a weapon crate goes up itself.
/// Everything runs under the lock of the room, like the rest of the game.
/// </summary>
public static class Crates
{
    public const int MaxOnIsland = 3;
    public const double PickupReach = 0.9;
    public const double PickupHeight = 1.2;
    public const int HealthAmount = 35;
    public const double TurboStamina = 8;
    public const int ShieldHits = 2;
    public const int BlastDamage = 25;
    public const double BlastRadius = 2.2;

    /// <summary>The middle of a crate above its bottom (what explosions measure to).</summary>
    public const double CenterHeight = 0.35;

    /// <summary>The chance of a drop per turn, and after how many turns without one a drop is certain.</summary>
    public static (double Chance, int Guaranteed) RuleOf(CrateRate rate) => rate switch
    {
        CrateRate.Rare => (0.20, 5),
        CrateRate.Normal => (0.35, 4),
        CrateRate.Often => (0.60, 3),
        _ => (0, int.MaxValue),
    };

    /// <summary>At the start of a turn: maybe a crate falls (returns it, already on the ground; the browsers animate the fall).</summary>
    public static CrateState? TryDrop(GameState game)
    {
        if (game.CrateRate == CrateRate.Off || game.TurnNumber < 2 || game.Crates.Count >= MaxOnIsland)
        {
            return null;
        }

        var (chance, guaranteed) = RuleOf(game.CrateRate);
        var due = game.TurnNumber - game.LastCrateTurn >= guaranteed;
        if (!due && game.Random.NextDouble() >= chance)
        {
            return null;
        }

        if (FindSpot(game) is not { } spot)
        {
            return null;
        }

        var crate = Roll(game, spot);
        game.Crates.Add(crate);
        game.LastCrateTurn = game.TurnNumber;
        return crate;
    }

    /// <summary>A free spot on land: not steep, out of the water, away from the bunnies and the other crates.</summary>
    internal static V3? FindSpot(GameState game)
    {
        var terrain = game.Terrain;
        for (var attempt = 0; attempt < 500; attempt++)
        {
            var x = 3 + game.Random.NextDouble() * (terrain.Width - 6);
            var z = 3 + game.Random.NextDouble() * (terrain.Width - 6);
            var y = terrain.HeightAt(x, z);
            if (y < terrain.WaterLevel + 0.3 || terrain.SlopeAt(x, z) >= 1)
            {
                continue;
            }

            var spot = new V3(x, y, z);
            if (game.Bunnies.Any(b => b.Alive && Flat(b.Position, spot) < 2.5) || game.Crates.Any(c => Flat(c.Position, spot) < 2.5))
            {
                continue;
            }

            return spot;
        }

        return null;
    }

    /// <summary>What is in a new crate: 55 % weapon ammo, 25 % health, 20 % support.</summary>
    internal static CrateState Roll(GameState game, V3 spot)
    {
        var id = game.NextCrateId++;
        var r = game.Random.NextDouble();
        var limited = game.Weapons.Where(w => w.Ammo >= 0 && w.Kind != WeaponKind.Teleport).ToList();
        if (r < 0.55 && limited.Count > 0)
        {
            var weapon = limited[game.Random.Next(limited.Count)];
            var amount = weapon.Ammo == 0 || weapon.Kind == WeaponKind.Airstrike ? 1 : 2;
            return new CrateState { Id = id, Position = spot, Look = "weapon", Content = "ammo", WeaponId = weapon.Id, Amount = amount };
        }

        if (r < 0.80)
        {
            return new CrateState { Id = id, Position = spot, Look = "health", Content = "health", Amount = HealthAmount };
        }

        var teleport = game.Weapons.FirstOrDefault(w => w.Kind == WeaponKind.Teleport);
        var supports = teleport is null ? new[] { "shield", "double", "turbo" } : ["shield", "double", "turbo", "teleport"];
        var pick = supports[game.Random.Next(supports.Length)];
        return pick == "teleport"
            ? new CrateState { Id = id, Position = spot, Look = "support", Content = "ammo", WeaponId = teleport!.Id, Amount = 1 }
            : new CrateState { Id = id, Position = spot, Look = "support", Content = pick };
    }

    /// <summary>Puts a crate with a known content on the island (tests, and nothing else).</summary>
    internal static CrateState Place(GameState game, V3 position, string look, string content, long? weaponId = null, int amount = 0)
    {
        var crate = new CrateState { Id = game.NextCrateId++, Position = position, Look = look, Content = content, WeaponId = weaponId, Amount = amount };
        game.Crates.Add(crate);
        return crate;
    }

    /// <summary>The bunny takes every crate it stands on; returns them with the text for the browsers ("+2 Kohlkopf-Splitter").</summary>
    public static List<(CrateState Crate, string Text)> PickUp(GameState game, BunnyState bunny)
    {
        var picked = new List<(CrateState, string)>();
        if (!bunny.Alive)
        {
            return picked;
        }

        foreach (var crate in game.Crates.Where(c => Touches(bunny, c)).ToList())
        {
            game.Crates.Remove(crate);
            picked.Add((crate, Apply(game, bunny, crate)));
        }

        return picked;
    }

    private static bool Touches(BunnyState bunny, CrateState crate)
        => Flat(bunny.Position, crate.Position) < PickupReach && Math.Abs(bunny.Position.Y - crate.Position.Y) < PickupHeight;

    private static string Apply(GameState game, BunnyState bunny, CrateState crate)
    {
        var team = game.Teams.First(t => t.Index == bunny.TeamIndex);
        switch (crate.Content)
        {
            case "ammo":
            {
                var weapon = game.Weapons.FirstOrDefault(w => w.Id == crate.WeaponId);
                if (weapon is null)
                {
                    return "Leer!";
                }

                team.Ammo[weapon.Id] = (team.Ammo.TryGetValue(weapon.Id, out var left) ? Math.Max(0, left) : 0) + crate.Amount;
                return $"+{crate.Amount} {weapon.Name}";
            }

            case "health":
            {
                var healed = Math.Max(0, Math.Min(crate.Amount, game.BunnyHealth - bunny.Health));
                bunny.Health += healed;
                return healed > 0 ? $"+{healed} Leben" : "Schon kerngesund!";
            }

            case "shield":
                bunny.Shield += ShieldHits;
                return "Panzerfell!";
            case "double":
                team.DoubleDamage = true;
                return "Doppel-Wumms!";
            case "turbo":
                if (game.CurrentTeam == team.Index && game.Phase != TurnPhase.Over)
                {
                    game.Stamina += TurboStamina;
                }
                else
                {
                    team.TurboPending = true;
                }

                return "Turbo-Möhre!";
            default:
                return "Leer!";
        }
    }

    // ---------------------------------------------------------------- during a shot (Simulation)

    /// <summary>Destroys the crates in an explosion; returns the weapon crates among them (they go up themselves).</summary>
    internal static List<CrateState> DestroyNear(GameState game, ShotResult result, V3 center, double radius, double t)
    {
        var hit = game.Crates.Where(c => (c.Position + new V3(0, CenterHeight, 0)).DistanceTo(center) < radius + 0.4).ToList();
        foreach (var crate in hit)
        {
            game.Crates.Remove(crate);
            result.Crates.Add(new CrateEvent(t, crate.Id, "destroyed", Look: crate.Look));
        }

        return hit.Where(c => c.Look == "weapon").ToList();
    }

    /// <summary>After the shot: crates follow the dug-away ground; whose ground is now under water sink.</summary>
    internal static void Settle(GameState game, ShotResult result, double t)
    {
        var terrain = game.Terrain;
        foreach (var crate in game.Crates.ToList())
        {
            var ground = terrain.HeightAt(crate.Position.X, crate.Position.Z);
            if (ground < terrain.WaterLevel)
            {
                game.Crates.Remove(crate);
                result.Crates.Add(new CrateEvent(t, crate.Id, "sunk", Look: crate.Look));
                continue;
            }

            if (Math.Abs(crate.Position.Y - ground) > 0.05)
            {
                crate.Position = crate.Position with { Y = ground };
                result.Crates.Add(new CrateEvent(t, crate.Id, "moved", Y: Math.Round(ground, 3)));
            }
        }
    }

    /// <summary>After the shot: every living bunny takes the crates it ended up on (the team and the bunny arrive with the next Turn message).</summary>
    internal static void PickUpAfterShot(GameState game, ShotResult result, double t)
    {
        foreach (var bunny in game.Bunnies.Where(b => b.Alive))
        {
            foreach (var (crate, text) in PickUp(game, bunny))
            {
                result.Crates.Add(new CrateEvent(t, crate.Id, "picked", bunny.Id, Text: text, Look: crate.Look));
            }
        }
    }

    private static double Flat(V3 a, V3 b) => Math.Sqrt((a.X - b.X) * (a.X - b.X) + (a.Z - b.Z) * (a.Z - b.Z));
}
