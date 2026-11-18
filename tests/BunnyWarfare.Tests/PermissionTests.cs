using BunnyWarfare.Business;
using BunnyWarfare.Data;

namespace BunnyWarfare.Tests;

/// <summary>The business layer checks the permission itself, before it touches the database (here there is none: a check that came too late would fail differently).</summary>
public sealed class PermissionTests
{
    private static readonly Actor Player = new(5, "Spieler", false);
    private static readonly ListRequest Everything = new(null, new Dictionary<string, string?>(), null, false, 1);

    [Fact]
    public async Task Administration_IsRefusedToPlayers()
    {
        AppDbContext db = null!;
        await Assert.ThrowsAsync<AccessDeniedException>(() => PlayerLogic.ListAsync(db, Player, Everything));
        await Assert.ThrowsAsync<AccessDeniedException>(() => PlayerLogic.DeleteAsync(db, Player, 1));
        await Assert.ThrowsAsync<AccessDeniedException>(() => WorldLogic.ListAsync(db, Player, Everything));
        await Assert.ThrowsAsync<AccessDeniedException>(() => WeaponLogic.SaveAsync(db, Player, new WeaponInput(0, "X", "", WeaponKind.Projectile, 1, 1, false, 3, 4, 3, -1, 0, true)));
        await Assert.ThrowsAsync<AccessDeniedException>(() => MatchLogic.AdminListAsync(db, Player, Everything));
        await Assert.ThrowsAsync<AccessDeniedException>(() => MatchLogic.DashboardAsync(db, Player));
        await Assert.ThrowsAsync<AccessDeniedException>(() => SettingLogic.SaveAsync(db, Player, ServerSettings.Default));
        await Assert.ThrowsAsync<AccessDeniedException>(() => ImportLogic.ImportAsync(db, Player, null!, "Host=x", onlyOnce: false, CancellationToken.None));
        await Assert.ThrowsAsync<AccessDeniedException>(() => PlayerLogic.AccountDeletedAsync(db, Player, 6));
    }

    [Fact]
    public async Task APlayer_SeesOnlyThemselves()
    {
        AppDbContext db = null!;
        await Assert.ThrowsAsync<AccessDeniedException>(() => PlayerLogic.GetAsync(db, Player, 6));
    }

    [Fact]
    public async Task TheSystem_IsNoPlayer()
    {
        AppDbContext db = null!;
        await Assert.ThrowsAsync<AccessDeniedException>(() => MatchLogic.CreateAsync(db, Actor.System, new MatchInput("X", 1, 2, 1, 100, 30, true)));
        await Assert.ThrowsAsync<AccessDeniedException>(() => PlayerLogic.EnsureAsync(db, Actor.System, isGuest: false));
    }
}
