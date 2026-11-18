using BunnyWarfare.Business;
using BunnyWarfare.Data;
using BunnyWarfare.Game;
using Microsoft.EntityFrameworkCore;

namespace BunnyWarfare.Tests;

/// <summary>Level, experience and the wardrobe: the curve, the unlock rules, saving a look, and the XP of a match (once, never for bots or aborted matches).</summary>
public sealed class ProgressionTests
{
    private static AppDbContext NewDb() => new(new DbContextOptionsBuilder<AppDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);

    [Fact]
    public void LevelCurve_StartsAtOne_GrowsSteadily_AndStopsAtTheTop()
    {
        Assert.Equal(1, Cosmetics.LevelOf(0));
        Assert.Equal(1, Cosmetics.LevelOf(Cosmetics.XpAt(2) - 1));
        Assert.Equal(2, Cosmetics.LevelOf(Cosmetics.XpAt(2)));
        for (var level = 1; level < Cosmetics.MaxLevel; level++)
        {
            Assert.True(Cosmetics.XpForNext(level + 1) > Cosmetics.XpForNext(level));
            Assert.Equal(level, Cosmetics.LevelOf(Cosmetics.XpAt(level)));
        }

        Assert.Equal(Cosmetics.MaxLevel, Cosmetics.LevelOf(int.MaxValue / 2));
    }

    [Fact]
    public void Catalog_HasUniqueKeys_FreeDefaults_AndEveryItemCanBeReached()
    {
        foreach (var (_, _, items) in Cosmetics.Kinds)
        {
            Assert.Equal(items.Count, items.Select(c => c.Key).Distinct().Count());
            Assert.All(items, c => Assert.True(c.Level > 0 || c.Wins > 0 || c.Kills > 0, $"{c.Key} can never be unlocked"));
            Assert.All(items, c => Assert.True(c.Key.Length <= 24));
        }

        var start = new Progress(0, 0, 0, 0, 0);
        Assert.Null(Cosmetics.Check(Look.Default, start));
        Assert.Contains(Cosmetics.Kinds, k => k.Items.Any(c => c.Wild));
    }

    [Fact]
    public void UnlockRules_LevelOrWinsOrKills()
    {
        var tiger = Cosmetics.Find(Cosmetics.Furs, "tiger")!; // 10 wins
        var pirate = Cosmetics.Find(Cosmetics.Outfits, "pirate")!; // level 8
        var fire = Cosmetics.Find(Cosmetics.Frames, "fire")!; // 30 knock-outs
        var nobody = new Progress(0, 0, 0, 0, 0);
        Assert.False(tiger.IsUnlocked(nobody));
        Assert.True(tiger.IsUnlocked(nobody with { GamesWon = 10 }));
        Assert.False(pirate.IsUnlocked(nobody with { Xp = Cosmetics.XpAt(8) - 1 }));
        Assert.True(pirate.IsUnlocked(nobody with { Xp = Cosmetics.XpAt(8) }));
        Assert.True(fire.IsUnlocked(nobody with { Kills = 30 }));
        Assert.Equal("10 Siege", tiger.Requirement);

        var unlocked = Cosmetics.NewlyUnlocked(nobody with { GamesWon = 9 }, nobody with { GamesWon = 10 });
        Assert.Contains(unlocked, u => u.Kind == "fur" && u.Key == "tiger");
    }

    [Fact]
    public void Xp_ForAMatch_RewardsWinsAndKills_AndNothingWhenAborted()
    {
        var lost = Cosmetics.XpForMatch(false, 3, 0, 40, aborted: false);
        var won = Cosmetics.XpForMatch(true, 1, 2, 120, aborted: false);
        Assert.True(lost > 0);
        // giving up without doing anything earns nothing (no farming against bots)
        Assert.Equal(0, Cosmetics.XpForMatch(false, 2, 0, 0, aborted: false));
        Assert.True(won > lost + 100);
        Assert.Equal(0, Cosmetics.XpForMatch(true, 1, 5, 500, aborted: true));
    }

    [Fact]
    public async Task SaveLook_RefusesLockedItems_AndKeepsUnlockedOnes()
    {
        await using var db = NewDb();
        var player = new Player { Id = 41, DisplayName = "Hoppel", TeamName = "Team Hoppel", Xp = Cosmetics.XpAt(5) };
        db.Players.Add(player);
        await db.SaveChangesAsync();
        var actor = new Actor(player.Id, player.DisplayName, false);

        // level 5: sunglasses yes, the crown (20 wins) no
        await PlayerLogic.SaveLookAsync(db, actor, new Look("black", "beret", "sunglasses", "sky"));
        var error = await Assert.ThrowsAsync<BusinessException>(() => PlayerLogic.SaveLookAsync(db, actor, new Look("black", "crown", "none", "wood")));
        Assert.Equal("outfit", error.Field);
        await Assert.ThrowsAsync<BusinessException>(() => PlayerLogic.SaveLookAsync(db, actor, new Look("plaid", "helmet", "none", "wood")));

        var saved = await db.Players.AsNoTracking().FirstAsync(p => p.Id == player.Id);
        Assert.Equal(("black", "beret", "sunglasses", "sky"), (saved.Fur, saved.Outfit, saved.Face, saved.Frame));

        var profile = await PlayerLogic.ProfileAsync(db, actor);
        Assert.Equal(5, profile.Level);
        Assert.False(profile.Wardrobe.First(k => k.Kind == "outfit").Items.First(i => i.Key == "crown").Unlocked);
        Assert.Equal("20 Siege", profile.Wardrobe.First(k => k.Kind == "outfit").Items.First(i => i.Key == "crown").Requirement);
    }

    [Fact]
    public async Task Finish_GivesXpOnce_ToPlayersOnly_AndNothingForAnAbortedMatch()
    {
        await using var db = NewDb();
        var host = new Player { Id = 42, DisplayName = "Host", TeamName = "Hosts" };
        var world = new World { Name = "Wiese", Seed = 1 };
        db.AddRange(host, world);
        await db.SaveChangesAsync();
        var match = new Match { Name = "Test", WorldId = world.Id, HostPlayerId = host.Id, MaxTeams = 2 };
        var aborted = new Match { Name = "Abbruch", WorldId = world.Id, HostPlayerId = host.Id, MaxTeams = 2 };
        db.Matches.AddRange(match, aborted);
        await db.SaveChangesAsync();
        TeamSlot[] teams =
        [
            new(0, host.Id, false, BotLevel.Normal, "Hosts", "#c2410c", Look.Default),
            new(1, null, true, BotLevel.Hard, "Bots", "#2563eb", new Look("tiger", "crown", "lasers", "fire")),
        ];
        await MatchLogic.StartAsync(db, Actor.System, match.Id, teams);
        await MatchLogic.StartAsync(db, Actor.System, aborted.Id, teams);
        TeamOutcome[] outcomes = [new(0, 2, 150, 1), new(1, 0, 40, 2)];

        await MatchLogic.FinishAsync(db, Actor.System, match.Id, 0, 12, outcomes, aborted: false);
        await MatchLogic.FinishAsync(db, Actor.System, match.Id, 0, 12, outcomes, aborted: false); // twice: counted once
        await MatchLogic.FinishAsync(db, Actor.System, aborted.Id, 0, 3, outcomes, aborted: true);

        var expected = Cosmetics.XpForMatch(true, 1, 2, 150, aborted: false);
        var saved = await db.Players.AsNoTracking().FirstAsync(p => p.Id == host.Id);
        Assert.Equal(expected, saved.Xp);
        Assert.Equal(1, saved.GamesPlayed);
        var bot = await db.MatchTeams.AsNoTracking().FirstAsync(t => t.MatchId == match.Id && t.IsBot);
        Assert.Equal(0, bot.XpGained);
        Assert.Equal("tiger", bot.Fur);
        Assert.Equal(expected, (await db.MatchTeams.AsNoTracking().FirstAsync(t => t.MatchId == match.Id && !t.IsBot)).XpGained);
    }

    [Fact]
    public void Result_ShowsTheXpOfTheMatch_TheLevelUp_AndTheLookOfEveryTeam()
    {
        var world = new World { Id = 1, Name = "Wiese", Theme = WorldTheme.Meadow, GridSize = 80, HillHeight = 6, Roughness = 0.4, WaterLevel = 0, Gravity = 9.81, MaxWind = 3, Seed = 42 };
        var room = new MatchRoom(new Match { Id = 3, Name = "T", HostPlayerId = 1, WorldId = 1, MaxTeams = 2, BunniesPerTeam = 1, BunnyHealth = 100, TurnSeconds = 30 }, world);
        // just below level 2: a win brings the level up; the guest gives up at once and earns nothing
        var player = new Player { Id = 1, DisplayName = "Host", TeamName = "Hosts", TeamColor = "#c2410c", Xp = Cosmetics.XpAt(2) - 1, Fur = "pink", Outfit = "pirate" };
        var guest = new Player { Id = 2, DisplayName = "Guest", TeamName = "Guests", TeamColor = "#2563eb", Xp = Cosmetics.XpAt(2) - 1 };
        room.SeatPlayer(player);
        room.SeatPlayer(guest);
        Assert.Equal("pink", room.ToDto().Slots[0].Fur);
        room.StartGame([new Weapon { Id = 1, Name = "Karotte", Kind = WeaponKind.Projectile, Damage = 40, BlastRadius = 2, AmmoPerMatch = -1 }], DateTime.UtcNow);
        var over = room.Surrender(2, DateTime.UtcNow);
        Assert.Contains(over, m => m.Method == "GameOver");

        var mine = room.Result!.Teams.First(t => t.Name == "Hosts");
        var quitter = room.Result.Teams.First(t => t.Name == "Guests");
        Assert.True(mine.XpGained > 0);
        Assert.Equal(1, mine.LevelBefore);
        Assert.Equal(2, mine.LevelAfter);
        Assert.Equal(("pink", "pirate"), (mine.Fur, mine.Outfit));
        Assert.Equal(0, quitter.XpGained);
        Assert.Equal(1, quitter.LevelAfter);

        // bots wear a look too (and earn nothing)
        var withBot = new MatchRoom(new Match { Id = 4, Name = "B", HostPlayerId = 1, WorldId = 1, MaxTeams = 2, BunniesPerTeam = 1, BunnyHealth = 100, TurnSeconds = 30 }, world);
        withBot.SeatPlayer(player);
        withBot.AddBot(1, BotLevel.Easy);
        Assert.False(string.IsNullOrEmpty(withBot.ToDto().Slots[1].Fur));
    }
}
