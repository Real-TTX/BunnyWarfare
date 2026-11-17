using BunnyWarfare.Data;

namespace BunnyWarfare.Game;

/// <summary>The island behind the menu: a world with a few decorative teams of idle bunnies (nothing is played, nothing is saved).</summary>
public static class Showcase
{
    private static readonly (string Name, string Color)[] Teams = [("Möhrenbande", "#c2410c"), ("Blaue Löffel", "#2563eb"), ("Kleeblatt-Crew", "#16a34a"), ("Lila Rübe", "#9333ea")];

    public sealed record ShowcaseDto(WorldDto World, IReadOnlyList<TeamDto> Teams, IReadOnlyList<BunnyDto> Bunnies);

    public static WorldDto WorldOf(World world)
    {
        var terrain = Terrain.Generate(world.GridSize, world.Seed, world.HillHeight, world.Roughness, world.WaterLevel, world.Theme);
        return new WorldDto(world.Name, terrain.Size, Terrain.CellSize, world.Theme.ToString(), terrain.WaterLevel, world.Gravity, world.MaxWind, terrain.ToBase64());
    }

    public static ShowcaseDto Build(World world, int teams = 3, int bunniesPerTeam = 2)
    {
        var random = new Random(world.Seed ^ Environment.TickCount);
        var terrain = Terrain.Generate(world.GridSize, world.Seed, world.HillHeight, world.Roughness, world.WaterLevel, world.Theme);
        var game = new GameState
        {
            Terrain = terrain, Gravity = world.Gravity, MaxWind = world.MaxWind, Theme = world.Theme, WorldName = world.Name, TurnSeconds = 45, Random = random,
        };
        var names = MatchRoom.BunnyNames.OrderBy(_ => random.Next()).ToList();
        var teamDtos = new List<TeamDto>();
        var id = 1;
        for (var t = 0; t < Math.Min(teams, Teams.Length); t++)
        {
            // the decorative teams show off the wardrobe (wild things included)
            var look = Business.Cosmetics.RandomLook(random, 0.5);
            teamDtos.Add(new TeamDto(t, Teams[t].Name, Teams[t].Color, null, true, new Dictionary<string, int>(), false, 0, 0, look.Fur, look.Outfit, look.Face, look.Frame, 0));
            for (var k = 0; k < bunniesPerTeam; k++)
            {
                var spot = MatchRoom.FindSpot(game, random);
                var middle = terrain.Width / 2;
                game.Bunnies.Add(new BunnyState
                {
                    Id = id, TeamIndex = t, Name = names[(id - 1) % names.Count], Position = spot, Health = 100, Yaw = Math.Atan2(middle - spot.X, middle - spot.Z),
                });
                id++;
            }
        }

        var world3d = new WorldDto(world.Name, terrain.Size, Terrain.CellSize, world.Theme.ToString(), terrain.WaterLevel, world.Gravity, world.MaxWind, terrain.ToBase64());
        var bunnies = game.Bunnies.Select(b => new BunnyDto(b.Id, b.TeamIndex, b.Name, Math.Round(b.Position.X, 3), Math.Round(b.Position.Y, 3), Math.Round(b.Position.Z, 3),
            Math.Round(b.Yaw, 3), 100, 100)).ToList();
        return new ShowcaseDto(world3d, teamDtos, bunnies);
    }
}
