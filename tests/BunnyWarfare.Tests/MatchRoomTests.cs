using BunnyWarfare.Business;
using BunnyWarfare.Data;
using BunnyWarfare.Game;

namespace BunnyWarfare.Tests;

public sealed class MatchRoomTests
{
    private static readonly Player Host = new() { Id = 1, DisplayName = "Host", TeamName = "Hosts", TeamColor = "#c2410c" };
    private static readonly Player Guest = new() { Id = 2, DisplayName = "Guest", TeamName = "Guests", TeamColor = "#c2410c" };

    private static MatchRoom NewRoom()
    {
        var world = new World { Id = 1, Name = "Möhrenwiese", Theme = WorldTheme.Meadow, GridSize = 80, HillHeight = 6, Roughness = 0.4, WaterLevel = 0, Gravity = 9.81, MaxWind = 3, Seed = 42 };
        var match = new Match { Id = 7, Name = "Test", HostPlayerId = Host.Id, WorldId = 1, MaxTeams = 3, BunniesPerTeam = 2, BunnyHealth = 100, TurnSeconds = 30 };
        return new MatchRoom(match, world);
    }

    private static IReadOnlyList<Weapon> Arsenal() =>
    [
        new() { Id = 1, Name = "Karottenwerfer", Kind = WeaponKind.Projectile, Damage = 45, BlastRadius = 2.6, AffectedByWind = true, AmmoPerMatch = -1 },
        new() { Id = 2, Name = "Möhrenregen", Kind = WeaponKind.Airstrike, Damage = 35, BlastRadius = 2.2, ClusterCount = 5, AmmoPerMatch = 1 },
    ];

    [Fact]
    public void Lobby_SeatsPlayers_WithDistinctColours_AndOnlyTheHostAddsBots()
    {
        var room = NewRoom();
        room.SeatPlayer(Host);
        room.SeatPlayer(Guest);
        room.SeatPlayer(Guest);
        Assert.Equal(2, room.Slots.Count);
        Assert.NotEqual(room.Slots[0].Color, room.Slots[1].Color);

        Assert.Throws<AccessDeniedException>(() => room.AddBot(Guest.Id, BotLevel.Easy));
        room.AddBot(Host.Id, BotLevel.Hard);
        Assert.Equal(3, room.TeamsForStart(Host.Id).Count);
        Assert.Throws<BusinessException>(() => room.AddBot(Host.Id, BotLevel.Easy));
    }

    [Fact]
    public void Lobby_NeverGivesTwoTeamsSimilarColours()
    {
        var room = NewRoom();
        room.SeatPlayer(new Player { Id = 1, DisplayName = "Rot", TeamName = "Rot", TeamColor = "#dc2626" });
        room.SeatPlayer(new Player { Id = 2, DisplayName = "Orange", TeamName = "Orange", TeamColor = "#c2410c" });
        room.AddBot(1, BotLevel.Easy);
        var colours = room.Slots.Select(s => s.Color).ToList();
        for (var i = 0; i < colours.Count; i++)
        {
            for (var j = i + 1; j < colours.Count; j++)
            {
                Assert.True(MatchRoom.ColorDistance(colours[i], colours[j]) > 120, $"{colours[i]} vs {colours[j]}");
            }
        }
    }

    [Fact]
    public void Start_PlacesEveryBunnyOnLand_AndStartsATurn()
    {
        var room = NewRoom();
        room.SeatPlayer(Host);
        room.AddBot(Host.Id, BotLevel.Normal);
        var messages = room.StartGame(Arsenal(), DateTime.UtcNow);

        var game = room.Game!;
        Assert.Equal(MatchStatus.Running, room.Status);
        Assert.Equal(4, game.Bunnies.Count);
        Assert.All(game.Bunnies, b => Assert.True(b.Position.Y > game.Terrain.WaterLevel));
        Assert.Equal(TurnPhase.Aiming, game.Phase);
        Assert.Equal(1, game.TurnNumber);
        Assert.Contains(messages, m => m.Method == "Turn");
        Assert.Contains(messages, m => m.Method == "Room");
        Assert.Equal(1, game.Teams.First(t => t.IsBot).Ammo[2]);
    }

    [Fact]
    public void Turn_EndsWhenTheTimeRunsOut()
    {
        var room = NewRoom();
        room.SeatPlayer(Host);
        room.SeatPlayer(Guest);
        var start = DateTime.UtcNow;
        room.StartGame(Arsenal(), start);
        var first = room.Game!.CurrentTeam;

        room.Tick(start.AddSeconds(10));
        Assert.Equal(1, room.Game.TurnNumber);
        room.Tick(start.AddSeconds(31));
        Assert.Equal(2, room.Game.TurnNumber);
        Assert.NotEqual(first, room.Game.CurrentTeam);
    }

    [Fact]
    public void OnlyThePlayerOfTheTurn_MayShoot_AndAShotIsResolvedThenTheNextTurnComes()
    {
        var room = NewRoom();
        room.SeatPlayer(Host);
        room.SeatPlayer(Guest);
        var now = DateTime.UtcNow;
        room.StartGame(Arsenal(), now);
        var game = room.Game!;
        var current = game.Teams.First(t => t.Index == game.CurrentTeam).PlayerId!.Value;
        var other = current == Host.Id ? Guest.Id : Host.Id;

        Assert.Throws<AccessDeniedException>(() => room.Fire(other, 1, new Aim(0, 0.5, 0.5), now));
        var shot = room.Fire(current, 1, new Aim(0, 0.5, 0.5), now);
        Assert.Contains(shot, m => m.Method == "Shot");
        Assert.Equal(TurnPhase.Resolving, game.Phase);

        // after the shot: retreat, then the other team
        room.Tick(game.PhaseEnds.AddMilliseconds(1));
        if (game.Phase == TurnPhase.Retreat)
        {
            room.Tick(game.PhaseEnds.AddMilliseconds(1));
        }

        Assert.Equal(2, game.TurnNumber);
    }

    [Fact]
    public void Ammo_RunsOut()
    {
        var room = NewRoom();
        room.SeatPlayer(Host);
        room.SeatPlayer(Guest);
        var now = DateTime.UtcNow;
        room.StartGame(Arsenal(), now);
        var game = room.Game!;
        var team = game.Teams.First(t => t.Index == game.CurrentTeam);
        team.Ammo[2] = 0;
        Assert.Throws<BusinessException>(() => room.Fire(team.PlayerId!.Value, 2, new Aim(0, 0, 1, 10, 10), now));
    }

    [Fact]
    public void Surrender_OfTheLastHuman_LetsTheBotWin()
    {
        var room = NewRoom();
        room.SeatPlayer(Host);
        room.AddBot(Host.Id, BotLevel.Easy);
        room.StartGame(Arsenal(), DateTime.UtcNow);
        var messages = room.Surrender(Host.Id, DateTime.UtcNow);

        Assert.Equal(MatchStatus.Finished, room.Status);
        Assert.Contains(messages, m => m.Method == "GameOver");
        var result = room.Result!;
        Assert.Equal(room.Game!.Teams.First(t => t.IsBot).Index, result.WinnerTeam);
        Assert.Equal(1, result.Teams[0].Placement);
        Assert.True(room.NeedsSaving);
    }

    [Fact]
    public void Bot_FindsAShot()
    {
        var room = NewRoom();
        room.SeatPlayer(Host);
        room.AddBot(Host.Id, BotLevel.Hard);
        room.StartGame(Arsenal(), DateTime.UtcNow);
        var game = room.Game!;
        var bot = game.Teams.First(t => t.IsBot);
        var bunny = game.Bunnies.First(b => b.TeamIndex == bot.Index);
        var decision = Bot.Plan(game, bot, bunny);
        Assert.NotNull(decision);
    }

    [Fact]
    public void Move_IsLimitedByStamina_AndSteps()
    {
        var room = NewRoom();
        room.SeatPlayer(Host);
        room.SeatPlayer(Guest);
        room.StartGame(Arsenal(), DateTime.UtcNow);
        var game = room.Game!;
        var player = game.Teams.First(t => t.Index == game.CurrentTeam).PlayerId!.Value;
        var bunny = game.CurrentBunny!;
        var start = bunny.Position;

        // a jump of 5 m in one message is refused (the browser is corrected)
        var refused = room.Move(player, "c1", start.X + 5, start.Z, 0);
        Assert.Equal("c1", Assert.Single(refused).OnlyConnection);
        Assert.Equal(start, bunny.Position);
    }

    [Fact]
    public void OnlyPlayersOfTheMatch_CountAsPresent()
    {
        var room = NewRoom();
        room.SeatPlayer(Host);
        room.AddBot(Host.Id, BotLevel.Easy);
        room.StartGame(Arsenal(), DateTime.UtcNow);
        Assert.False(room.AnyPlayerConnected);
        room.Connections["spectator"] = 99;
        Assert.False(room.AnyPlayerConnected);
        room.Connections["host"] = Host.Id;
        Assert.True(room.AnyPlayerConnected);
    }
}
