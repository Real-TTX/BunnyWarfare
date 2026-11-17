using BunnyWarfare.Business;
using BunnyWarfare.Data;
using BunnyWarfare.Game;

namespace BunnyWarfare.Tests;

/// <summary>The islands of every theme and size: shape, landmarks (caves, temple), room for the bunnies.</summary>
public sealed class WorldTests
{
    /// <summary>The worlds a server seeds (the first four of the empty database and the later ones).</summary>
    public static TheoryData<string> SeededWorlds()
    {
        var data = new TheoryData<string>();
        foreach (var w in AllSeeded())
        {
            data.Add(w.Name);
        }

        return data;
    }

    private static IEnumerable<World> AllSeeded() =>
    [
        new() { Name = "Möhrenwiese", Theme = WorldTheme.Meadow, GridSize = 96, HillHeight = 7, Roughness = 0.45, WaterLevel = 0, Gravity = 9.81, MaxWind = 4, Seed = 1337 },
        new() { Name = "Frostbau", Theme = WorldTheme.Snow, GridSize = 88, HillHeight = 10, Roughness = 0.65, WaterLevel = 0.5, Gravity = 9.81, MaxWind = 6, Seed = 4242 },
        new() { Name = "Dünenland", Theme = WorldTheme.Desert, GridSize = 112, HillHeight = 5, Roughness = 0.3, WaterLevel = -0.5, Gravity = 9.81, MaxWind = 3, Seed = 777 },
        new() { Name = "Mondkrater", Theme = WorldTheme.Moon, GridSize = 80, HillHeight = 6, Roughness = 0.8, WaterLevel = -1.5, Gravity = 3.2, MaxWind = 0, Seed = 9001 },
        .. SeedLogic.LaterWorlds(),
    ];

    private static World Seeded(string name) => AllSeeded().First(w => w.Name == name);

    private static Terrain Generate(World w, List<Terrain.Landmark>? landmarks = null) =>
        Terrain.Generate(w.GridSize, w.Seed, w.HillHeight, w.Roughness, w.WaterLevel, w.Theme, landmarks);

    private static void AssertIsland(Terrain t, double minShare = 0.2, double maxShare = 0.78)
    {
        var size = t.Size;
        var land = 0;
        for (var iz = 0; iz < size; iz++)
        {
            for (var ix = 0; ix < size; ix++)
            {
                var h = t.Heights[iz * size + ix];
                var border = Math.Min(Math.Min(ix, iz), Math.Min(size - 1 - ix, size - 1 - iz));
                if (border < 6)
                {
                    Assert.True(h < t.WaterLevel - 2.5, $"border cell {ix},{iz} at {h}");
                }

                if (h > t.WaterLevel + 0.4)
                {
                    land++;
                }
            }
        }

        Assert.InRange(land / (double)(size * size), minShare, maxShare);
    }

    [Theory]
    [MemberData(nameof(SeededWorlds))]
    public void SeededWorld_IsAnIsland_WithDeepBorders(string name)
    {
        AssertIsland(Generate(Seeded(name)));
    }

    [Theory]
    [InlineData(WorldTheme.Meadow)]
    [InlineData(WorldTheme.Snow)]
    [InlineData(WorldTheme.Desert)]
    [InlineData(WorldTheme.Moon)]
    [InlineData(WorldTheme.Autumn)]
    [InlineData(WorldTheme.Volcano)]
    [InlineData(WorldTheme.Jungle)]
    public void EveryTheme_InEverySize_IsAnIsland(WorldTheme theme)
    {
        foreach (var size in new[] { 48, 64, 96, 124, 160 })
        {
            foreach (var seed in new[] { 3, 512, 77777 })
            {
                var t = Terrain.Generate(size, seed, 8, 0.5, 0, theme);
                AssertIsland(t, 0.15, 0.8);
                Assert.Equal(t.Heights, Terrain.Generate(size, seed, 8, 0.5, 0, theme).Heights);
            }
        }
    }

    [Fact]
    public void TheNewWorlds_HaveCaves_AndTheJungleATemple()
    {
        foreach (var w in SeedLogic.LaterWorlds())
        {
            var landmarks = new List<Terrain.Landmark>();
            Generate(w, landmarks);
            if (w.Theme != WorldTheme.Moon)
            {
                Assert.True(landmarks.Count(l => l.Kind == "cave") >= 1, $"{w.Name} has no cave");
            }

            if (w.Theme == WorldTheme.Jungle)
            {
                Assert.Single(landmarks, l => l.Kind == "temple");
            }
        }
    }

    [Theory]
    [MemberData(nameof(SeededWorlds))]
    public void Landmarks_AreFlat_AndCavesCanBeWalkedIntoAndOutOf(string name)
    {
        var w = Seeded(name);
        var landmarks = new List<Terrain.Landmark>();
        var t = Generate(w, landmarks);
        foreach (var l in landmarks)
        {
            for (var z = l.MinZ; z <= l.MaxZ; z++)
            {
                for (var x = l.MinX; x <= l.MaxX; x++)
                {
                    Assert.Equal(l.Floor, t.Heights[z * t.Size + x]);
                }
            }

            Assert.True(l.Floor > t.WaterLevel + 0.4, $"{l.Kind} of {name} under water");
            if (l.Kind != "cave")
            {
                continue;
            }

            // the long side is the way in; the mouth is the end where the ground outside is level with the floor
            var alongX = l.MaxX - l.MinX > l.MaxZ - l.MinZ;
            var mid = alongX ? (l.MinZ + l.MaxZ) / 2.0 : (l.MinX + l.MaxX) / 2.0;
            var (start, end) = alongX ? (l.MinX, l.MaxX) : (l.MinZ, l.MaxZ);
            double HeightAlong(double cell) => alongX ? t.HeightAt(cell * Terrain.CellSize, mid * Terrain.CellSize) : t.HeightAt(mid * Terrain.CellSize, cell * Terrain.CellSize);
            var mouthLow = Math.Abs(HeightAlong(start - 2) - l.Floor) < 0.5;
            var (outside, inside) = mouthLow ? (start - 3.0, end - 0.5) : (end + 3.0, start + 0.5);
            Assert.True(Math.Abs(HeightAlong(outside) - l.Floor) < 0.5, $"cave of {name}: no level approach");

            // walk in like MatchRoom.Move: steps of 0.2 m, never up a wall, never into water
            var steps = (int)Math.Ceiling(Math.Abs(inside - outside) * Terrain.CellSize / 0.2);
            var previous = HeightAlong(outside);
            for (var i = 1; i <= steps; i++)
            {
                var cell = outside + (inside - outside) * i / steps;
                var ground = HeightAlong(cell);
                var rise = ground - previous;
                Assert.False(rise > 0.3 && rise / 0.2 > 1.6, $"cave of {name}: a wall at cell {cell:0.0}");
                Assert.True(ground >= t.WaterLevel + 0.05);
                previous = ground;
            }

            // inside, the walls on both sides are higher than a bunny
            var deep = (start + end) / 2;
            foreach (var side in new[] { -3, 3 })
            {
                var wall = alongX ? t.Heights[(int)(mid + side) * t.Size + deep] : t.Heights[deep * t.Size + (int)(mid + side)];
                Assert.True(wall >= l.Floor + 1.5, $"cave of {name}: low wall {wall} vs floor {l.Floor}");
            }
        }
    }

    [Theory]
    [MemberData(nameof(SeededWorlds))]
    public void EveryBunny_FindsASpot_OnLand(string name)
    {
        var w = Seeded(name);
        w.Id = 1;
        var match = new Match { Id = 3, Name = "Test", HostPlayerId = 1, WorldId = 1, MaxTeams = 4, BunniesPerTeam = 3, BunnyHealth = 100, TurnSeconds = 30 };
        var room = new MatchRoom(match, w);
        room.SeatPlayer(new Player { Id = 1, DisplayName = "Host", TeamName = "Hosts", TeamColor = "#c2410c" });
        for (var i = 0; i < 3; i++)
        {
            room.AddBot(1, BotLevel.Normal);
        }

        room.StartGame([new Weapon { Id = 1, Name = "Karottenwerfer", Kind = WeaponKind.Projectile, Damage = 45, BlastRadius = 2.6, AmmoPerMatch = -1 }], DateTime.UtcNow);
        var game = room.Game!;
        Assert.Equal(12, game.Bunnies.Count);
        Assert.All(game.Bunnies, b => Assert.True(b.Position.Y > game.Terrain.WaterLevel + 0.3, $"{b.Name} at {b.Position}"));
    }
}
