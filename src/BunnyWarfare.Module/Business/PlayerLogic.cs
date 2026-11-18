using BunnyWarfare.Data;
using Microsoft.EntityFrameworkCore;

namespace BunnyWarfare.Business;

public sealed record PlayerRow(long Id, string DisplayName, bool IsGuest, string TeamName, string TeamColor, DateTime? LastSeenDate, int GamesPlayed, int GamesWon, int Kills, int Xp)
{
    public int Level => Cosmetics.LevelOf(Xp);
}

/// <summary>What an administrator changes on a player (the account itself – name, password, role – is changed in MatGame).</summary>
public sealed record PlayerInput(long Id, string TeamName, string TeamColor, int? Xp = null, Look? Look = null);

public sealed record ProfileInput(string TeamName, string TeamColor);

public sealed record LeaderboardRow(int Rank, long PlayerId, string DisplayName, string TeamName, string TeamColor, int GamesPlayed, int GamesWon, int Kills, int DamageDealt,
    int Level, string Fur, string Outfit, string Face, string Frame)
{
    public int WinRate => GamesPlayed == 0 ? 0 : (int)Math.Round(100.0 * GamesWon / GamesPlayed);
}

/// <summary>
/// The players of BunnyWarfare: the game's row of each MatGame account (created at the first visit), profile, look, administration and the leaderboard.
/// Accounts, sign-in and passwords are MatGame's.
/// </summary>
public static class PlayerLogic
{
    /// <summary>The colours a team can have.</summary>
    public static IReadOnlyList<(string Value, string Label)> TeamColors => GameRules.TeamColors;

    private static IQueryable<Player> Alive(AppDbContext db) => db.Players.Where(p => p.UpdateState != UpdateState.Deleted);

    /// <summary>
    /// The player of an account: created at the first visit (a starter fur, a random colour), the name and the guest flag follow the account.
    /// Returns null for a deleted player (an administrator removed it from the game).
    /// </summary>
    public static async Task<Player?> EnsureAsync(AppDbContext db, Actor actor, bool isGuest)
    {
        Guard.Player(actor);
        var player = await db.Players.FirstOrDefaultAsync(p => p.Id == actor.PlayerId);
        var now = DateTime.UtcNow;
        if (player is null)
        {
            player = new Player
            {
                Id = actor.PlayerId,
                DisplayName = Clip(actor.DisplayName, 60),
                IsGuest = isGuest,
                TeamName = GameRules.TeamNameFor(actor.DisplayName),
                TeamColor = GameRules.TeamColors[Random.Shared.Next(GameRules.TeamColors.Count)].Value,
                Fur = Cosmetics.StarterFur(Random.Shared),
                LastSeenDate = now,
            };
            db.Players.Add(player);
            await db.ActingAs(actor.AuditId).SaveChangesAsync();
            return player;
        }

        if (player.UpdateState == UpdateState.Deleted)
        {
            return null;
        }

        var name = Clip(actor.DisplayName, 60);
        var changed = player.DisplayName != name || player.IsGuest != isGuest || player.LastSeenDate is null || now - player.LastSeenDate.Value > TimeSpan.FromMinutes(5);
        if (changed)
        {
            player.DisplayName = name;
            player.IsGuest = isGuest;
            player.LastSeenDate = now;
            await db.ActingAs(actor.AuditId).SaveChangesAsync();
        }

        return player;
    }

    public static async Task<PagedResult<PlayerRow>> ListAsync(AppDbContext db, Actor actor, ListRequest request)
    {
        Guard.Admin(actor);
        var all = Alive(db);
        var query = all;
        if (request.Search is { } search)
        {
            var pattern = $"%{search}%";
            query = query.Where(p => EF.Functions.ILike(p.DisplayName, pattern) || EF.Functions.ILike(p.TeamName, pattern));
        }

        query = request.Filter("kind") switch
        {
            "guest" => query.Where(p => p.IsGuest),
            "account" => query.Where(p => !p.IsGuest),
            _ => query,
        };

        query = request.Sort switch
        {
            "seen" => query.SortBy(p => p.LastSeenDate, request.Descending),
            "games" => query.SortBy(p => p.GamesPlayed, request.Descending),
            "wins" => query.SortBy(p => p.GamesWon, request.Descending),
            "level" => query.SortBy(p => p.Xp, request.Descending),
            _ => query.SortBy(p => p.DisplayName, request.Descending),
        };

        var total = await all.CountAsync();
        var matching = await query.CountAsync();
        var items = await query.Page(request)
            .Select(p => new PlayerRow(p.Id, p.DisplayName, p.IsGuest, p.TeamName, p.TeamColor, p.LastSeenDate, p.GamesPlayed, p.GamesWon, p.Kills, p.Xp))
            .ToListAsync();
        return new PagedResult<PlayerRow>(items, matching, total);
    }

    public static async Task<Player?> GetAsync(AppDbContext db, Actor actor, long id)
    {
        Guard.AdminOrSelf(actor, id);
        return await Alive(db).AsNoTracking().FirstOrDefaultAsync(p => p.Id == id);
    }

    /// <summary>Changes the game data of a player (administrators): team, experience, look.</summary>
    public static async Task SaveAsync(AppDbContext db, Actor actor, PlayerInput input)
    {
        Guard.Admin(actor);
        var player = await Alive(db).FirstOrDefaultAsync(p => p.Id == input.Id) ?? throw new BusinessException("Der Spieler wurde nicht gefunden.");
        PlayerRules.ValidateTeam(input.TeamName, input.TeamColor);
        player.TeamName = input.TeamName.Trim();
        player.TeamColor = input.TeamColor.ToLowerInvariant();
        if (input.Xp is { } xp)
        {
            if (xp is < 0 or > 10_000_000)
            {
                throw new BusinessException("Die Erfahrung liegt zwischen 0 und 10 000 000.", nameof(PlayerInput.Xp));
            }

            player.Xp = xp;
        }

        if (input.Look is { } look)
        {
            // administrators may give any item, also one that is still locked for the player
            if (!Cosmetics.Exists(look))
            {
                throw new BusinessException("Diesen Look gibt es nicht.", "Fur");
            }

            PlayerRules.SetLook(player, look);
        }

        await db.ActingAs(actor.AuditId).SaveChangesAsync();
    }

    /// <summary>Removes a player from the game (administrators): the statistics go, the account in MatGame stays; a new visit starts from scratch.</summary>
    public static async Task DeleteAsync(AppDbContext db, Actor actor, long id)
    {
        Guard.Admin(actor);
        var player = await db.Players.FirstOrDefaultAsync(p => p.Id == id) ?? throw new BusinessException("Der Spieler wurde nicht gefunden.");
        await RemoveAsync(db, actor, player);
    }

    /// <summary>The account was deleted in MatGame: its player is removed for good (teams of old matches keep their names, without the link).</summary>
    public static async Task AccountDeletedAsync(AppDbContext db, Actor actor, long accountId)
    {
        Guard.Admin(actor);
        if (await db.Players.FirstOrDefaultAsync(p => p.Id == accountId) is { } player)
        {
            await RemoveAsync(db, actor, player);
        }
    }

    private static async Task RemoveAsync(AppDbContext db, Actor actor, Player player)
    {
        if (await db.Matches.AnyAsync(m => m.HostPlayerId == player.Id && (m.Status == MatchStatus.Lobby || m.Status == MatchStatus.Running)))
        {
            throw new BusinessException("Der Spieler hat gerade ein offenes Spiel.");
        }

        // the matches the player hosted (all over: open ones block above) go with their teams
        await db.Matches.Where(m => m.HostPlayerId == player.Id).ExecuteDeleteAsync();
        db.Players.Remove(player);
        await db.ActingAs(actor.AuditId).SaveChangesAsync();
    }

    public static async Task UpdateProfileAsync(AppDbContext db, Actor actor, ProfileInput input)
    {
        Guard.Player(actor);
        PlayerRules.ValidateTeam(input.TeamName, input.TeamColor);
        var player = await Alive(db).FirstAsync(p => p.Id == actor.PlayerId);
        player.TeamName = input.TeamName.Trim();
        player.TeamColor = input.TeamColor.ToLowerInvariant();
        await db.ActingAs(actor.AuditId).SaveChangesAsync();
    }

    public static async Task<PagedResult<LeaderboardRow>> LeaderboardAsync(AppDbContext db, Actor actor, ListRequest request)
    {
        Guard.Player(actor);
        var all = Alive(db).Where(p => !p.IsGuest);
        var query = all;
        if (request.Search is { } search)
        {
            var pattern = $"%{search}%";
            query = query.Where(p => EF.Functions.ILike(p.DisplayName, pattern) || EF.Functions.ILike(p.TeamName, pattern));
        }

        if (request.Filter("played") == "yes")
        {
            query = query.Where(p => p.GamesPlayed > 0);
        }

        // the rank is by wins, then kills, then damage; another sort only changes the order of the rows
        var ranked = await query.OrderByDescending(p => p.GamesWon).ThenByDescending(p => p.Kills).ThenByDescending(p => p.DamageDealt).ThenBy(p => p.DisplayName)
            .Select(p => new { p.Id, p.DisplayName, p.TeamName, p.TeamColor, p.GamesPlayed, p.GamesWon, p.Kills, p.DamageDealt, p.Xp, p.Fur, p.Outfit, p.Face, p.Frame })
            .ToListAsync();
        var rows = ranked.Select((p, i) => new LeaderboardRow(i + 1, p.Id, p.DisplayName, p.TeamName, p.TeamColor, p.GamesPlayed, p.GamesWon, p.Kills, p.DamageDealt,
            Cosmetics.LevelOf(p.Xp), p.Fur, p.Outfit, p.Face, p.Frame));
        rows = request.Sort switch
        {
            "games" => request.Descending ? rows.OrderByDescending(r => r.GamesPlayed) : rows.OrderBy(r => r.GamesPlayed),
            "kills" => request.Descending ? rows.OrderByDescending(r => r.Kills) : rows.OrderBy(r => r.Kills),
            "damage" => request.Descending ? rows.OrderByDescending(r => r.DamageDealt) : rows.OrderBy(r => r.DamageDealt),
            "name" => request.Descending ? rows.OrderByDescending(r => r.DisplayName) : rows.OrderBy(r => r.DisplayName),
            "level" => request.Descending ? rows.OrderByDescending(r => r.Level) : rows.OrderBy(r => r.Level),
            _ => request.Descending ? rows.OrderByDescending(r => r.Rank) : rows.OrderBy(r => r.Rank),
        };
        var list = rows.ToList();
        return new PagedResult<LeaderboardRow>(list.Skip((request.Page - 1) * request.PageSize).Take(request.PageSize).ToList(), list.Count, await all.CountAsync());
    }

    /// <summary>The numbers of the player and their place in the leaderboard (same order as <see cref="LeaderboardAsync"/>; guests have rank 0).</summary>
    public static async Task<PlayerStats> StatsAsync(AppDbContext db, Actor actor)
    {
        Guard.Player(actor);
        var me = await Alive(db).AsNoTracking().FirstAsync(p => p.Id == actor.PlayerId);
        if (me.IsGuest)
        {
            return new PlayerStats(me.GamesPlayed, me.GamesWon, me.Kills, me.DamageDealt, 0);
        }

        var better = await Alive(db).Where(p => !p.IsGuest).CountAsync(p => p.GamesWon > me.GamesWon
                                                                           || (p.GamesWon == me.GamesWon && p.Kills > me.Kills)
                                                                           || (p.GamesWon == me.GamesWon && p.Kills == me.Kills && p.DamageDealt > me.DamageDealt));
        return new PlayerStats(me.GamesPlayed, me.GamesWon, me.Kills, me.DamageDealt, better + 1);
    }

    /// <summary>The profile of the signed-in player with the level and the whole wardrobe (what is theirs, what is still locked).</summary>
    public static async Task<ProfileView> ProfileAsync(AppDbContext db, Actor actor)
    {
        Guard.Player(actor);
        var me = await Alive(db).AsNoTracking().FirstAsync(p => p.Id == actor.PlayerId);
        var stats = await StatsAsync(db, actor);
        return PlayerRules.ProfileOf(me, stats);
    }

    /// <summary>The player dresses their bunnies: only with items they have unlocked.</summary>
    public static async Task SaveLookAsync(AppDbContext db, Actor actor, Look look)
    {
        Guard.Player(actor);
        var player = await Alive(db).FirstAsync(p => p.Id == actor.PlayerId);
        if (Cosmetics.Check(look, Progress.Of(player)) is { } problem)
        {
            throw new BusinessException(problem.Message, problem.Field);
        }

        PlayerRules.SetLook(player, look);
        await db.ActingAs(actor.AuditId).SaveChangesAsync();
    }

    private static string Clip(string text, int length)
    {
        var t = string.IsNullOrWhiteSpace(text) ? "Hase" : text.Trim();
        return t.Length > length ? t[..length] : t;
    }
}
