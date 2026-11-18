using System.Security.Claims;
using BunnyWarfare.Business;
using BunnyWarfare.Data;
using BunnyWarfare.Web;
using MatGame.Sdk;
using Microsoft.EntityFrameworkCore;

namespace BunnyWarfare.Tests;

/// <summary>The players of BunnyWarfare are MatGame accounts: the row is made at the first visit, keyed by the account id, and follows the account's name.</summary>
public sealed class AccountTests
{
    private static AppDbContext NewDb() => new(new DbContextOptionsBuilder<AppDbContext>().UseInMemoryDatabase(Guid.NewGuid().ToString()).Options);

    [Fact]
    public void TheActor_IsTheAccountOfTheHost()
    {
        var principal = GameAccounts.ToPrincipal(new GameAccount(77, "Hoppel", IsAdmin: true, IsGuest: false), GameAccounts.CookieScheme);
        var actor = Players.ActorOf(principal)!;
        Assert.Equal((77L, "Hoppel", true), (actor.PlayerId, actor.DisplayName, actor.IsAdmin));
        Assert.Null(Players.ActorOf(new ClaimsPrincipal(new ClaimsIdentity())));
        Assert.True(Players.IsGuest(GameAccounts.ToPrincipal(new GameAccount(78, "Gast", false, IsGuest: true), GameAccounts.TokenScheme, deviceId: 3)));
    }

    [Fact]
    public async Task ThePlayer_IsCreatedAtTheFirstVisit_AndFollowsTheAccount()
    {
        await using var db = NewDb();
        var first = await PlayerLogic.EnsureAsync(db, new Actor(500, "Hoppel", false), isGuest: true);
        Assert.NotNull(first);
        Assert.Equal(500, first!.Id);
        Assert.Equal("Team Hoppel", first.TeamName);
        Assert.True(first.IsGuest);

        // the guest became an account and changed its name in MatGame
        var again = await PlayerLogic.EnsureAsync(db, new Actor(500, "Hoppel der Große", false), isGuest: false);
        Assert.Equal("Hoppel der Große", again!.DisplayName);
        Assert.False(again.IsGuest);
        Assert.Equal(1, await db.Players.CountAsync());
    }

    [Fact]
    public async Task Guests_AreNotInTheLeaderboard_AndHaveNoRank()
    {
        await using var db = NewDb();
        db.Players.AddRange(
            new Player { Id = 1, DisplayName = "Konto", GamesWon = 1 },
            new Player { Id = 2, DisplayName = "Gast", IsGuest = true, GamesWon = 9 });
        await db.SaveChangesAsync();
        var me = new Actor(2, "Gast", false);
        Assert.Equal(0, (await PlayerLogic.StatsAsync(db, me)).Rank);
        Assert.Equal(1, (await PlayerLogic.StatsAsync(db, new Actor(1, "Konto", false))).Rank);
    }
}
