using BunnyWarfare.Business;
using BunnyWarfare.Data;
using BunnyWarfare.Game;

namespace BunnyWarfare.Tests;

public sealed class CrateTests
{
    private const long Carrot = 1, Golden = 2, Teleport = 3, Shotgun = 4;

    private static readonly Player Host = new() { Id = 1, DisplayName = "Host", TeamName = "Hosts", TeamColor = "#c2410c" };
    private static readonly Player Guest = new() { Id = 2, DisplayName = "Guest", TeamName = "Guests", TeamColor = "#2563eb" };

    private static GameState FlatState(CrateRate rate = CrateRate.Off, double height = 2, int size = 120)
    {
        var heights = Enumerable.Repeat((float)height, size * size).ToArray();
        var state = new GameState
        {
            Terrain = new Terrain(size, heights, 0), Gravity = 9.81, MaxWind = 0, Theme = WorldTheme.Meadow, WorldName = "Test", TurnSeconds = 45, Random = new Random(7),
            CrateRate = rate, BunnyHealth = 100,
        };
        state.Weapons.Add(new WeaponState { Id = Carrot, Name = "Karotte", Kind = WeaponKind.Projectile, Damage = 40, BlastRadius = 2.5, AffectedByWind = false, FuseSeconds = 3, ClusterCount = 3, Pellets = 1, Ammo = -1 });
        state.Weapons.Add(new WeaponState { Id = Golden, Name = "Goldene Riesenmöhre", Kind = WeaponKind.Projectile, Damage = 70, BlastRadius = 4, AffectedByWind = false, FuseSeconds = 3, ClusterCount = 3, Pellets = 1, Ammo = 0 });
        state.Weapons.Add(new WeaponState { Id = Teleport, Name = "Hasenloch", Kind = WeaponKind.Teleport, Damage = 0, BlastRadius = 0, AffectedByWind = false, FuseSeconds = 3, ClusterCount = 3, Pellets = 1, Ammo = 0 });
        state.Weapons.Add(new WeaponState { Id = Shotgun, Name = "Flinte", Kind = WeaponKind.Hitscan, Damage = 30, BlastRadius = 0.9, AffectedByWind = false, FuseSeconds = 3, ClusterCount = 3, Pellets = 1, Ammo = -1 });
        foreach (var index in new[] { 0, 1 })
        {
            var team = new TeamState { Index = index, Name = index == 0 ? "A" : "B", Color = index == 0 ? "#c2410c" : "#2563eb" };
            team.Ammo[Golden] = 0;
            team.Ammo[Teleport] = 0;
            state.Teams.Add(team);
        }

        state.CurrentTeam = 0;
        return state;
    }

    private static BunnyState AddBunny(GameState state, int id, int team, double x, double z, int health = 100)
    {
        var bunny = new BunnyState { Id = id, TeamIndex = team, Name = $"B{id}", Position = new V3(x, state.Terrain.HeightAt(x, z), z), Health = health };
        state.Bunnies.Add(bunny);
        return bunny;
    }

    private static V3 Ground(GameState state, double x, double z) => new(x, state.Terrain.HeightAt(x, z), z);

    private static WeaponState Weapon(GameState state, long id) => state.Weapons.First(w => w.Id == id);

    /// <summary>The aim of a single pellet from the shooter straight at a point on the ground.</summary>
    private static Aim AimAt(BunnyState shooter, V3 point)
    {
        var (origin, _) = Simulation.Muzzle(shooter, new Aim(0, 0, 1));
        var to = point - origin;
        return new Aim(Math.Atan2(to.X, to.Z), Math.Asin(Math.Clamp(to.Y / to.Length, -1, 1)), 1);
    }

    // ---------------------------------------------------------------- drops

    [Fact]
    public void Drops_FollowTheRate_NeverMoreThanThree_AndNoneWhenOff()
    {
        var off = FlatState(CrateRate.Off);
        AddBunny(off, 1, 0, 10, 10);
        for (var turn = 2; turn < 50; turn++)
        {
            off.TurnNumber = turn;
            Assert.Null(Crates.TryDrop(off));
        }

        foreach (var rate in new[] { CrateRate.Rare, CrateRate.Normal, CrateRate.Often })
        {
            var game = FlatState(rate);
            AddBunny(game, 1, 0, 10, 10);
            var (_, guaranteed) = Crates.RuleOf(rate);
            var last = 1;
            var drops = 0;
            for (var turn = 2; turn < 120; turn++)
            {
                game.TurnNumber = turn;
                var crate = Crates.TryDrop(game);
                Assert.True(game.Crates.Count <= Crates.MaxOnIsland);
                if (crate is not null)
                {
                    drops++;
                    last = turn;
                }

                // a crate is picked up now and then, so the limit does not stop the drops
                if (game.Crates.Count == Crates.MaxOnIsland && turn % 3 == 0)
                {
                    game.Crates.RemoveAt(0);
                }

                if (game.Crates.Count < Crates.MaxOnIsland)
                {
                    Assert.True(turn - last < guaranteed, $"{rate}: no crate since turn {last} (turn {turn})");
                }
            }

            Assert.True(drops > 5, $"{rate}: only {drops} drops");
        }
    }

    [Fact]
    public void Drops_AreOnLand_AwayFromBunniesAndEachOther()
    {
        var terrain = Terrain.Generate(80, 42, 6, 0.4, 0);
        var game = new GameState
        {
            Terrain = terrain, Gravity = 9.81, MaxWind = 0, Theme = WorldTheme.Meadow, WorldName = "Insel", TurnSeconds = 45, Random = new Random(3), CrateRate = CrateRate.Often,
        };
        game.Teams.Add(new TeamState { Index = 0, Name = "A", Color = "#c2410c" });
        game.Weapons.Add(new WeaponState { Id = Carrot, Name = "Karotte", Kind = WeaponKind.Projectile, Damage = 40, BlastRadius = 2.5, AffectedByWind = false, FuseSeconds = 3, ClusterCount = 3, Pellets = 1, Ammo = 2 });
        var random = new Random(5);
        for (var i = 0; i < 6; i++)
        {
            game.Bunnies.Add(new BunnyState { Id = i + 1, TeamIndex = 0, Name = "B", Position = MatchRoom.FindSpot(game, random), Health = 100 });
        }

        for (var turn = 2; game.Crates.Count < Crates.MaxOnIsland && turn < 40; turn++)
        {
            game.TurnNumber = turn;
            Crates.TryDrop(game);
        }

        Assert.Equal(Crates.MaxOnIsland, game.Crates.Count);
        foreach (var crate in game.Crates)
        {
            Assert.True(crate.Position.Y >= terrain.WaterLevel + 0.3);
            Assert.Equal(terrain.HeightAt(crate.Position.X, crate.Position.Z), crate.Position.Y, 3);
            Assert.All(game.Bunnies, b => Assert.True(Flat(b.Position, crate.Position) >= 2.5));
            Assert.All(game.Crates.Where(c => c != crate), c => Assert.True(Flat(c.Position, crate.Position) >= 2.5));
        }
    }

    [Fact]
    public void A_NewTurn_MayDropACrate_AfterTheTurnMessage()
    {
        var world = new World { Id = 1, Name = "Wiese", Theme = WorldTheme.Meadow, GridSize = 80, HillHeight = 6, Roughness = 0.4, WaterLevel = 0, Gravity = 9.81, MaxWind = 3, Seed = 42 };
        var room = new MatchRoom(new Match { Id = 9, Name = "K", HostPlayerId = 1, WorldId = 1, MaxTeams = 2, BunniesPerTeam = 1, BunnyHealth = 100, TurnSeconds = 30, CrateRate = CrateRate.Often }, world);
        room.SeatPlayer(Host);
        room.SeatPlayer(Guest);
        var now = DateTime.UtcNow;
        room.StartGame([new Weapon { Id = Carrot, Name = "Karotte", Kind = WeaponKind.Projectile, Damage = 40, BlastRadius = 2.5, AmmoPerMatch = -1 }], now);
        Assert.Equal((int)CrateRate.Often, room.ToDto().CrateRate);

        List<Outgoing>? withDrop = null;
        for (var i = 0; i < 8 && withDrop is null; i++)
        {
            var current = room.Game!.Teams.First(t => t.Index == room.Game.CurrentTeam).PlayerId!.Value;
            var messages = room.SkipTurn(current, now);
            if (messages.Any(m => m.Method == "CrateDrop"))
            {
                withDrop = messages;
            }
        }

        Assert.NotNull(withDrop);
        var methods = withDrop!.Select(m => m.Method).ToList();
        Assert.True(methods.IndexOf("Turn") < methods.IndexOf("CrateDrop"));
        var drop = (CrateDropDto)withDrop!.First(m => m.Method == "CrateDrop").Payload;
        var turn = (TurnUpdateDto)withDrop!.First(m => m.Method == "Turn").Payload;
        Assert.Contains(turn.Crates, c => c.Id == drop.Crate.Id);
        Assert.Contains(drop.Crate.Look, new[] { "weapon", "health", "support" });
    }

    // ---------------------------------------------------------------- pickups

    [Fact]
    public void CrateOnlyWeapons_StartWithZero_AndCannotBeFired()
    {
        var world = new World { Id = 1, Name = "Wiese", Theme = WorldTheme.Meadow, GridSize = 80, HillHeight = 6, Roughness = 0.4, WaterLevel = 0, Gravity = 9.81, MaxWind = 3, Seed = 42 };
        var room = new MatchRoom(new Match { Id = 3, Name = "T", HostPlayerId = 1, WorldId = 1, MaxTeams = 2, BunniesPerTeam = 1, BunnyHealth = 100, TurnSeconds = 30, CrateRate = CrateRate.Off }, world);
        room.SeatPlayer(Host);
        room.SeatPlayer(Guest);
        var now = DateTime.UtcNow;
        room.StartGame(
        [
            new Weapon { Id = Carrot, Name = "Karotte", Kind = WeaponKind.Projectile, Damage = 40, BlastRadius = 2.5, AmmoPerMatch = -1 },
            new Weapon { Id = Golden, Name = "Goldene Riesenmöhre", Kind = WeaponKind.Projectile, Damage = 70, BlastRadius = 4, AmmoPerMatch = 0 },
        ], now);
        var game = room.Game!;
        Assert.All(game.Teams, t => Assert.Equal(0, t.Ammo[Golden]));
        var current = game.Teams.First(t => t.Index == game.CurrentTeam);
        Assert.False(Bot.HasAmmo(current, game.Weapons.First(w => w.Id == Golden)));
        Assert.Throws<BusinessException>(() => room.Fire(current.PlayerId!.Value, Golden, new Aim(0, 0.5, 0.5), now));
    }

    [Fact]
    public void Walking_OntoACrate_TakesIt_AndTellsEveryone()
    {
        var world = new World { Id = 1, Name = "Wiese", Theme = WorldTheme.Meadow, GridSize = 80, HillHeight = 6, Roughness = 0.4, WaterLevel = 0, Gravity = 9.81, MaxWind = 3, Seed = 42 };
        var room = new MatchRoom(new Match { Id = 4, Name = "T", HostPlayerId = 1, WorldId = 1, MaxTeams = 2, BunniesPerTeam = 1, BunnyHealth = 100, TurnSeconds = 30, CrateRate = CrateRate.Off }, world);
        room.SeatPlayer(Host);
        room.SeatPlayer(Guest);
        room.StartGame(
        [
            new Weapon { Id = Carrot, Name = "Karotte", Kind = WeaponKind.Projectile, Damage = 40, BlastRadius = 2.5, AmmoPerMatch = -1 },
            new Weapon { Id = Golden, Name = "Goldene Riesenmöhre", Kind = WeaponKind.Projectile, Damage = 70, BlastRadius = 4, AmmoPerMatch = 0 },
        ], DateTime.UtcNow);
        var game = room.Game!;
        var team = game.Teams.First(t => t.Index == game.CurrentTeam);
        var bunny = game.CurrentBunny!;
        // a step to the side that the rules allow (not steep, on land)
        var target = new[] { (0.5, 0.0), (-0.5, 0.0), (0.0, 0.5), (0.0, -0.5) }
            .Select(d => new V3(bunny.Position.X + d.Item1, 0, bunny.Position.Z + d.Item2))
            .Select(p => p with { Y = game.Terrain.HeightAt(p.X, p.Z) })
            .First(p => p.Y > game.Terrain.WaterLevel + 0.1 && p.Y - bunny.Position.Y < 0.3);
        var crate = Crates.Place(game, target, "weapon", "ammo", Golden, 1);

        var messages = room.Move(team.PlayerId!.Value, "c1", target.X, target.Z, 0);

        Assert.Equal(["Moved", "CratePicked"], messages.Select(m => m.Method));
        Assert.True(messages[1].ToAll);
        var picked = (CratePickedDto)messages[1].Payload;
        Assert.Equal(crate.Id, picked.CrateId);
        Assert.Equal(bunny.Id, picked.BunnyId);
        Assert.Equal("+1 Goldene Riesenmöhre", picked.Text);
        Assert.Equal(1, picked.TeamState.Ammo[Golden.ToString()]);
        Assert.Equal(1, team.Ammo[Golden]);
        Assert.Empty(game.Crates);
    }

    [Fact]
    public void EveryContent_DoesWhatItSays()
    {
        var game = FlatState();
        var a = AddBunny(game, 1, 0, 20, 20, health: 50);
        var teamA = game.Teams[0];
        game.CurrentBunnyId = a.Id;
        game.Stamina = 2;

        Crates.Place(game, a.Position, "weapon", "ammo", Golden, 1);
        Crates.Place(game, a.Position, "health", "health", amount: Crates.HealthAmount);
        Crates.Place(game, a.Position, "support", "shield");
        Crates.Place(game, a.Position, "support", "double");
        Crates.Place(game, a.Position, "support", "turbo");
        Crates.Place(game, a.Position, "support", "ammo", Teleport, 1);
        var texts = Crates.PickUp(game, a).Select(p => p.Text).ToList();

        Assert.Equal(["+1 Goldene Riesenmöhre", "+35 Leben", "Panzerfell!", "Doppel-Wumms!", "Turbo-Möhre!", "+1 Hasenloch"], texts);
        Assert.Equal(1, teamA.Ammo[Golden]);
        Assert.Equal(1, teamA.Ammo[Teleport]);
        Assert.Equal(85, a.Health);
        Assert.Equal(Crates.ShieldHits, a.Shield);
        Assert.True(teamA.DoubleDamage);
        Assert.Equal(2 + Crates.TurboStamina, game.Stamina);
        Assert.Contains("double", teamA.Effects);
        Assert.Empty(game.Crates);

        // health never goes above the full health; a turbo outside the own turn waits for the next one
        var b = AddBunny(game, 2, 1, 40, 40, health: 90);
        Crates.Place(game, b.Position, "health", "health", amount: Crates.HealthAmount);
        Crates.Place(game, b.Position, "support", "turbo");
        Crates.PickUp(game, b);
        Assert.Equal(100, b.Health);
        Assert.True(game.Teams[1].TurboPending);
        Assert.Equal(["turbo"], game.Teams[1].Effects);
    }

    [Fact]
    public void A_CrateFarAway_IsNotPickedUp()
    {
        var game = FlatState();
        var a = AddBunny(game, 1, 0, 20, 20);
        Crates.Place(game, Ground(game, 21.2, 20), "health", "health", amount: 35);
        Assert.Empty(Crates.PickUp(game, a));
        Assert.Single(game.Crates);
    }

    // ---------------------------------------------------------------- explosions, ground

    [Fact]
    public void Explosions_DestroyCrates_AndAWeaponCrateGoesUp_ChainingOnlyOnce()
    {
        var game = FlatState();
        var shooter = AddBunny(game, 1, 0, 20, 10);
        game.CurrentBunnyId = shooter.Id;
        var target = Ground(game, 20, 16);
        var first = Crates.Place(game, target, "weapon", "ammo", Golden, 1);
        var second = Crates.Place(game, Ground(game, 20, 18), "weapon", "ammo", Golden, 1);     // in the blast of the first
        var third = Crates.Place(game, Ground(game, 20, 20.2), "weapon", "ammo", Golden, 1);    // only in the blast of the second
        var far = Crates.Place(game, Ground(game, 40, 40), "health", "health", amount: 35);

        var result = Simulation.Fire(game, shooter, Weapon(game, Shotgun), AimAt(shooter, target));

        var destroyed = result.Crates.Where(c => c.Action == "destroyed").Select(c => c.CrateId).ToList();
        Assert.Equal([first.Id, second.Id, third.Id], destroyed.Order());
        // the pellet, the first crate, the second crate – the third is destroyed but does not chain on
        Assert.Equal(3, result.Explosions.Count);
        Assert.Equal(first.Position.Z, result.Explosions[1].Z, 1);
        Assert.True(result.Explosions[1].T > result.Explosions[0].T);
        Assert.Equal([far], game.Crates);
    }

    [Fact]
    public void A_HealthCrate_InABlast_IsDestroyed_WithoutAnExplosion()
    {
        var game = FlatState();
        var shooter = AddBunny(game, 1, 0, 20, 10);
        var target = Ground(game, 20, 16);
        Crates.Place(game, target, "health", "health", amount: 35);
        var result = Simulation.Fire(game, shooter, Weapon(game, Shotgun), AimAt(shooter, target));
        Assert.Single(result.Explosions);
        Assert.Contains(result.Crates, c => c.Action == "destroyed" && c.Look == "health");
        Assert.Empty(game.Crates);
    }

    [Fact]
    public void Crates_FollowTheGround_AndSinkWhenItIsUnderWater()
    {
        var game = FlatState();
        var shooter = AddBunny(game, 1, 0, 10, 10);
        var falling = Crates.Place(game, Ground(game, 30, 30), "health", "health", amount: 35);
        var sinking = Crates.Place(game, Ground(game, 50, 50), "support", "shield");
        Dig(game, 30, 30, 0.8f);
        Dig(game, 50, 50, -1.5f);

        // any shot settles the crates afterwards (here a shot into the ground far away)
        var result = Simulation.Fire(game, shooter, Weapon(game, Shotgun), AimAt(shooter, Ground(game, 10, 14)));

        var moved = Assert.Single(result.Crates, c => c.Action == "moved");
        Assert.Equal(falling.Id, moved.CrateId);
        Assert.Equal(0.8, moved.Y!.Value, 2);
        Assert.Equal(0.8, falling.Position.Y, 2);
        Assert.Contains(result.Crates, c => c.Action == "sunk" && c.CrateId == sinking.Id);
        Assert.Equal([falling], game.Crates);
    }

    [Fact]
    public void A_BunnyBlownOntoACrate_TakesIt_AfterTheShot()
    {
        var game = FlatState();
        var shooter = AddBunny(game, 1, 0, 10, 10);
        var lucky = AddBunny(game, 2, 1, 30, 30);
        Crates.Place(game, lucky.Position, "support", "double");
        var result = Simulation.Fire(game, shooter, Weapon(game, Shotgun), AimAt(shooter, Ground(game, 10, 14)));
        var picked = Assert.Single(result.Crates, c => c.Action == "picked");
        Assert.Equal(lucky.Id, picked.BunnyId);
        Assert.Equal("Doppel-Wumms!", picked.Text);
        Assert.True(game.Teams[1].DoubleDamage);
    }

    // ---------------------------------------------------------------- effects

    [Fact]
    public void DoubleDamage_DoublesTheNextShot_Once()
    {
        int FirstHit(bool doubled)
        {
            var game = FlatState();
            var shooter = AddBunny(game, 1, 0, 20, 10);
            var victim = AddBunny(game, 2, 1, 20, 16);
            game.Teams[0].DoubleDamage = doubled;
            var result = Simulation.Fire(game, shooter, Weapon(game, Shotgun), AimAt(shooter, victim.Center));
            Assert.False(game.Teams[0].DoubleDamage);
            return result.Damages.First(d => d.BunnyId == victim.Id).Amount;
        }

        var normal = FirstHit(false);
        var doubled = FirstHit(true);
        // twice the damage (rounded once instead of twice)
        Assert.InRange(doubled, normal * 2 - 1, normal * 2 + 1);
    }

    [Fact]
    public void Shield_HalvesTwoHits_ThenCountsDown()
    {
        (int Amount, int ShieldAfter) Hit(int shield)
        {
            var game = FlatState();
            var shooter = AddBunny(game, 1, 0, 20, 10);
            var victim = AddBunny(game, 2, 1, 20, 16);
            victim.Shield = shield;
            var result = Simulation.Fire(game, shooter, Weapon(game, Shotgun), AimAt(shooter, victim.Center));
            return (result.Damages.First(d => d.BunnyId == victim.Id).Amount, victim.Shield);
        }

        var (full, _) = Hit(0);
        var (halved, left) = Hit(2);
        var (halvedAgain, none) = Hit(1);
        Assert.Equal((full + 1) / 2, halved);
        Assert.Equal((full + 1) / 2, halvedAgain);
        // the first hit of the pellet takes one hit of the shield (a fall afterwards may take the next)
        Assert.True(left <= 1);
        Assert.Equal(0, none);
    }

    // ---------------------------------------------------------------- the Hasenloch

    [Fact]
    public void Teleport_OnlyGoesToAllowedTargets()
    {
        var world = new World { Id = 1, Name = "Wiese", Theme = WorldTheme.Meadow, GridSize = 80, HillHeight = 6, Roughness = 0.4, WaterLevel = 0, Gravity = 9.81, MaxWind = 3, Seed = 42 };
        var room = new MatchRoom(new Match { Id = 5, Name = "T", HostPlayerId = 1, WorldId = 1, MaxTeams = 2, BunniesPerTeam = 1, BunnyHealth = 100, TurnSeconds = 30, CrateRate = CrateRate.Off }, world);
        room.SeatPlayer(Host);
        room.SeatPlayer(Guest);
        var now = DateTime.UtcNow;
        room.StartGame(
        [
            new Weapon { Id = Carrot, Name = "Karotte", Kind = WeaponKind.Projectile, Damage = 40, BlastRadius = 2.5, AmmoPerMatch = -1 },
            new Weapon { Id = Teleport, Name = "Hasenloch", Kind = WeaponKind.Teleport, Damage = 0, BlastRadius = 0, AmmoPerMatch = 0 },
        ], now);
        var game = room.Game!;
        var team = game.Teams.First(t => t.Index == game.CurrentTeam);
        var player = team.PlayerId!.Value;
        var bunny = game.CurrentBunny!;
        var other = game.Bunnies.First(b => b.TeamIndex != team.Index);

        // no Hasenloch yet
        Assert.Throws<BusinessException>(() => room.Fire(player, Teleport, new Aim(0, 0, 1, 20, 20), now));
        team.Ammo[Teleport] = 3;
        // into the sea (the corner of the map is always under water), onto another bunny
        Assert.Throws<BusinessException>(() => room.Fire(player, Teleport, new Aim(0, 0, 1, 1, 1), now));
        Assert.Throws<BusinessException>(() => room.Fire(player, Teleport, new Aim(0, 0, 1, other.Position.X + 0.2, other.Position.Z), now));
        Assert.Equal(3, team.Ammo[Teleport]);

        // a free spot on land
        var free = MatchRoom.FindSpot(game, new Random(11));
        var messages = room.Fire(player, Teleport, new Aim(0, 0, 1, free.X, free.Z), now);
        var shot = (ShotResult)Assert.Single(messages, m => m.Method == "Shot").Payload;
        var hop = Assert.Single(shot.Teleports);
        Assert.Equal(bunny.Id, hop.BunnyId);
        Assert.Equal(free.X, bunny.Position.X, 3);
        Assert.Equal(free.Z, bunny.Position.Z, 3);
        Assert.Empty(shot.Damages);
        Assert.Equal(2, team.Ammo[Teleport]);
    }

    [Fact]
    public void Bots_NeverUseTheHasenloch()
    {
        var game = FlatState();
        var bot = AddBunny(game, 1, 0, 20, 20);
        AddBunny(game, 2, 1, 30, 28);
        AddBunny(game, 3, 1, 12, 34);
        game.Teams[0].Ammo[Teleport] = 5;
        game.Teams[0].Ammo[Golden] = 2;
        var team = game.Teams[0];
        for (var i = 0; i < 12; i++)
        {
            var decision = Bot.Plan(game, team, bot);
            Assert.NotNull(decision);
            Assert.NotEqual(WeaponKind.Teleport, decision!.Weapon.Kind);
        }
    }

    // ---------------------------------------------------------------- helpers

    private static void Dig(GameState game, double x, double z, float height)
    {
        var t = game.Terrain;
        var cx = (int)Math.Round(x / Terrain.CellSize);
        var cz = (int)Math.Round(z / Terrain.CellSize);
        for (var iz = cz - 3; iz <= cz + 3; iz++)
        {
            for (var ix = cx - 3; ix <= cx + 3; ix++)
            {
                t.Heights[iz * t.Size + ix] = height;
            }
        }
    }

    private static double Flat(V3 a, V3 b) => Math.Sqrt((a.X - b.X) * (a.X - b.X) + (a.Z - b.Z) * (a.Z - b.Z));
}
