using BunnyWarfare.Data;
using Microsoft.EntityFrameworkCore;

namespace BunnyWarfare.Business;

public sealed record MatchInput(string Name, long WorldId, int MaxTeams, int BunniesPerTeam, int BunnyHealth, int TurnSeconds, bool IsPublic,
    CrateRate CrateRate = CrateRate.Normal);

public sealed record OpenMatchRow(Guid Token, string Name, string WorldName, WorldTheme Theme, string HostName, MatchStatus Status, int MaxTeams, int BunniesPerTeam,
    int TurnSeconds, DateTime CreateDate, bool IsMine);

public sealed record MatchHistoryRow(Guid Token, string Name, string WorldName, MatchStatus Status, DateTime? EndDate, int Placement, int Kills, int DamageDealt, int XpGained);

public sealed record MatchAdminRow(long Id, Guid Token, string Name, string WorldName, string HostName, MatchStatus Status, bool IsPublic, int Teams, DateTime CreateDate,
    DateTime? StartDate, DateTime? EndDate, string? WinnerName);

public sealed record DashboardNumbers(int Players, int ActivePlayers7Days, int MatchesTotal, int MatchesRunning, int MatchesInLobby, int Worlds, int Weapons);

/// <summary>Matches: create, list, start, finish, and their administration.</summary>
public static class MatchLogic
{
    public static string StatusName(MatchStatus status) => GameRules.StatusName(status);

    public static string CrateRateName(CrateRate rate) => GameRules.CrateRateName(rate);

    public static async Task<Guid> CreateAsync(AppDbContext db, Actor actor, MatchInput input)
    {
        Guard.Player(actor);
        var settings = await SettingLogic.GetAsync(db);
        if (string.IsNullOrWhiteSpace(input.Name) || input.Name.Trim().Length > 60)
        {
            throw new BusinessException("Der Name fehlt oder ist länger als 60 Zeichen.", nameof(MatchInput.Name));
        }

        if (!await db.Worlds.AnyAsync(w => w.Id == input.WorldId && w.IsEnabled && w.UpdateState != UpdateState.Deleted))
        {
            throw new BusinessException("Bitte eine Welt wählen.", nameof(MatchInput.WorldId));
        }

        if (input.MaxTeams < 2 || input.MaxTeams > settings.MaxTeamsPerMatch)
        {
            throw new BusinessException($"Ein Spiel hat 2 bis {settings.MaxTeamsPerMatch} Teams.", nameof(MatchInput.MaxTeams));
        }

        if (input.BunniesPerTeam is < 1 or > 6)
        {
            throw new BusinessException("Ein Team hat 1 bis 6 Hasen.", nameof(MatchInput.BunniesPerTeam));
        }

        if (input.BunnyHealth is < 25 or > 300)
        {
            throw new BusinessException("Die Gesundheit liegt zwischen 25 und 300.", nameof(MatchInput.BunnyHealth));
        }

        if (input.TurnSeconds is < 15 or > 120)
        {
            throw new BusinessException("Die Zugzeit liegt zwischen 15 und 120 Sekunden.", nameof(MatchInput.TurnSeconds));
        }

        if (!Enum.IsDefined(input.CrateRate))
        {
            throw new BusinessException("Bitte wählen, wie oft Kisten fallen.", nameof(MatchInput.CrateRate));
        }

        var match = new Match
        {
            Name = input.Name.Trim(),
            WorldId = input.WorldId,
            HostPlayerId = actor.PlayerId,
            MaxTeams = input.MaxTeams,
            BunniesPerTeam = input.BunniesPerTeam,
            BunnyHealth = input.BunnyHealth,
            TurnSeconds = input.TurnSeconds,
            IsPublic = input.IsPublic,
            CrateRate = input.CrateRate,
        };
        db.Matches.Add(match);
        await db.ActingAs(actor.AuditId).SaveChangesAsync();
        return match.Token;
    }

    /// <summary>The public lobbies, and the unfinished matches of the player (also private ones).</summary>
    public static async Task<PagedResult<OpenMatchRow>> OpenListAsync(AppDbContext db, Actor actor, ListRequest request)
    {
        Guard.Player(actor);
        var me = actor.PlayerId;
        var all = db.Matches.Where(m => (m.Status == MatchStatus.Lobby && m.IsPublic)
                                        || ((m.Status == MatchStatus.Lobby || m.Status == MatchStatus.Running) && (m.HostPlayerId == me || m.Teams.Any(t => t.PlayerId == me))));
        var query = all;
        if (request.Search is { } search)
        {
            var pattern = $"%{search}%";
            query = query.Where(m => EF.Functions.ILike(m.Name, pattern) || EF.Functions.ILike(m.HostPlayer!.DisplayName, pattern) || EF.Functions.ILike(m.World!.Name, pattern));
        }

        if (request.Filter("world") is { } world && long.TryParse(world, out var worldId))
        {
            query = query.Where(m => m.WorldId == worldId);
        }

        query = request.Filter("status") switch
        {
            "lobby" => query.Where(m => m.Status == MatchStatus.Lobby),
            "running" => query.Where(m => m.Status == MatchStatus.Running),
            "mine" => query.Where(m => m.HostPlayerId == me || m.Teams.Any(t => t.PlayerId == me)),
            _ => query,
        };

        query = request.Sort switch
        {
            "name" => query.SortBy(m => m.Name, request.Descending),
            "world" => query.SortBy(m => m.World!.Name, request.Descending),
            _ => query.SortBy(m => m.CreateDate, request.Descending),
        };

        var total = await all.CountAsync();
        var matching = await query.CountAsync();
        var items = await query.Page(request)
            .Select(m => new OpenMatchRow(m.Token, m.Name, m.World!.Name, m.World.Theme, m.HostPlayer!.DisplayName, m.Status, m.MaxTeams, m.BunniesPerTeam, m.TurnSeconds,
                m.CreateDate, m.HostPlayerId == me || m.Teams.Any(t => t.PlayerId == me)))
            .ToListAsync();
        return new PagedResult<OpenMatchRow>(items, matching, total);
    }

    /// <summary>The last matches the player took part in.</summary>
    public static async Task<IReadOnlyList<MatchHistoryRow>> HistoryAsync(AppDbContext db, Actor actor, int count = 8)
    {
        Guard.Player(actor);
        return await db.MatchTeams.Where(t => t.PlayerId == actor.PlayerId && (t.Match!.Status == MatchStatus.Finished || t.Match.Status == MatchStatus.Aborted))
            .OrderByDescending(t => t.Match!.EndDate)
            .Take(count)
            .Select(t => new MatchHistoryRow(t.Match!.Token, t.Match.Name, t.Match.World!.Name, t.Match.Status, t.Match.EndDate, t.Placement, t.Kills, t.DamageDealt, t.XpGained))
            .ToListAsync();
    }

    /// <summary>The match behind a link, with its world (whoever has the link may look at it).</summary>
    public static async Task<Match?> GetByTokenAsync(AppDbContext db, Actor actor, Guid token)
    {
        Guard.Player(actor);
        return await db.Matches.AsNoTracking().Include(m => m.World).Include(m => m.HostPlayer).Include(m => m.Teams).FirstOrDefaultAsync(m => m.Token == token);
    }

    /// <summary>Starts a match from its lobby: only the host (or the system) may do it, with 2 teams or more.</summary>
    public static async Task StartAsync(AppDbContext db, Actor actor, long matchId, IReadOnlyList<TeamSlot> teams)
    {
        var match = await db.Matches.Include(m => m.Teams).FirstOrDefaultAsync(m => m.Id == matchId) ?? throw new BusinessException("Das Spiel wurde nicht gefunden.");
        if (!actor.IsSystem && match.HostPlayerId != actor.PlayerId)
        {
            throw new AccessDeniedException("Nur der Gastgeber startet das Spiel.");
        }

        if (match.Status != MatchStatus.Lobby)
        {
            throw new BusinessException("Das Spiel läuft schon.");
        }

        if (teams.Count < 2 || teams.Count > match.MaxTeams)
        {
            throw new BusinessException($"Es braucht 2 bis {match.MaxTeams} Teams.");
        }

        match.Teams.Clear();
        foreach (var t in teams)
        {
            match.Teams.Add(new MatchTeam
            {
                TeamIndex = t.TeamIndex, PlayerId = t.PlayerId, IsBot = t.IsBot, BotLevel = t.BotLevel, TeamName = t.TeamName, TeamColor = t.TeamColor,
                Fur = t.Look.Fur, Outfit = t.Look.Outfit, Face = t.Look.Face, Frame = t.Look.Frame,
            });
        }

        match.Status = MatchStatus.Running;
        match.StartDate = DateTime.UtcNow;
        await db.ActingAs(actor.AuditId).SaveChangesAsync();
    }

    /// <summary>Writes the outcome of a match and adds it to the statistics and the experience of its players (the game loop, as the system; once per match).</summary>
    public static async Task FinishAsync(AppDbContext db, Actor actor, long matchId, int? winnerTeamIndex, int turnCount, IReadOnlyList<TeamOutcome> outcomes, bool aborted)
    {
        Guard.Admin(actor);
        var match = await db.Matches.Include(m => m.Teams).ThenInclude(t => t.Player).FirstOrDefaultAsync(m => m.Id == matchId);
        if (match is null || match.Status is MatchStatus.Finished or MatchStatus.Aborted)
        {
            return;
        }

        match.Status = aborted ? MatchStatus.Aborted : MatchStatus.Finished;
        match.EndDate = DateTime.UtcNow;
        match.TurnCount = turnCount;
        match.WinnerTeamIndex = aborted ? null : winnerTeamIndex;
        foreach (var team in match.Teams)
        {
            var outcome = outcomes.FirstOrDefault(o => o.TeamIndex == team.TeamIndex);
            if (outcome is null)
            {
                continue;
            }

            team.Kills = outcome.Kills;
            team.DamageDealt = outcome.DamageDealt;
            team.Placement = outcome.Placement;
            if (team.Player is { } player && !team.IsBot && !aborted)
            {
                var won = winnerTeamIndex == team.TeamIndex;
                team.XpGained = PlayerRules.AddMatch(player, won, outcome.Placement, outcome.Kills, outcome.DamageDealt);
            }
        }

        await db.ActingAs(actor.AuditId).SaveChangesAsync();
    }

    /// <summary>Ends a lobby or a running match (administrators, or the host while it is a lobby).</summary>
    public static async Task AbortAsync(AppDbContext db, Actor actor, long matchId)
    {
        var match = await db.Matches.FirstOrDefaultAsync(m => m.Id == matchId) ?? throw new BusinessException("Das Spiel wurde nicht gefunden.");
        if (!actor.IsAdmin && !(match.HostPlayerId == actor.PlayerId && match.Status == MatchStatus.Lobby))
        {
            throw new AccessDeniedException();
        }

        if (match.Status is MatchStatus.Finished or MatchStatus.Aborted)
        {
            return;
        }

        match.Status = MatchStatus.Aborted;
        match.EndDate = DateTime.UtcNow;
        await db.ActingAs(actor.AuditId).SaveChangesAsync();
    }

    /// <summary>After a restart of the server no match is alive any more: lobbies and running matches are marked as aborted.</summary>
    public static async Task<int> AbortStaleAsync(AppDbContext db, Actor actor)
    {
        Guard.Admin(actor);
        var stale = await db.Matches.Where(m => m.Status == MatchStatus.Running || (m.Status == MatchStatus.Lobby && m.CreateDate < DateTime.UtcNow.AddHours(-12))).ToListAsync();
        foreach (var m in stale)
        {
            m.Status = MatchStatus.Aborted;
            m.EndDate = DateTime.UtcNow;
        }

        await db.ActingAs(actor.AuditId).SaveChangesAsync();
        return stale.Count;
    }

    public static async Task<PagedResult<MatchAdminRow>> AdminListAsync(AppDbContext db, Actor actor, ListRequest request)
    {
        Guard.Admin(actor);
        var all = db.Matches.AsQueryable();
        var query = all;
        if (request.Search is { } search)
        {
            var pattern = $"%{search}%";
            query = query.Where(m => EF.Functions.ILike(m.Name, pattern) || EF.Functions.ILike(m.HostPlayer!.DisplayName, pattern) || EF.Functions.ILike(m.World!.Name, pattern));
        }

        if (request.Filter("status") is { } status && Enum.TryParse<MatchStatus>(status, out var s))
        {
            query = query.Where(m => m.Status == s);
        }

        if (request.Filter("world") is { } world && long.TryParse(world, out var worldId))
        {
            query = query.Where(m => m.WorldId == worldId);
        }

        query = request.Sort switch
        {
            "name" => query.SortBy(m => m.Name, request.Descending),
            "start" => query.SortBy(m => m.StartDate, request.Descending),
            "end" => query.SortBy(m => m.EndDate, request.Descending),
            _ => query.SortBy(m => m.CreateDate, request.Descending),
        };

        var total = await all.CountAsync();
        var matching = await query.CountAsync();
        var items = await query.Page(request)
            .Select(m => new MatchAdminRow(m.Id, m.Token, m.Name, m.World!.Name, m.HostPlayer!.DisplayName, m.Status, m.IsPublic, m.Teams.Count, m.CreateDate, m.StartDate,
                m.EndDate, m.Teams.Where(t => t.TeamIndex == m.WinnerTeamIndex).Select(t => t.TeamName).FirstOrDefault()))
            .ToListAsync();
        return new PagedResult<MatchAdminRow>(items, matching, total);
    }

    public static async Task<Match?> AdminGetAsync(AppDbContext db, Actor actor, long id)
    {
        Guard.Admin(actor);
        return await db.Matches.AsNoTracking().Include(m => m.World).Include(m => m.HostPlayer).Include(m => m.Teams).ThenInclude(t => t.Player)
            .FirstOrDefaultAsync(m => m.Id == id);
    }

    public static async Task AdminSaveAsync(AppDbContext db, Actor actor, long id, string name, bool isPublic)
    {
        Guard.Admin(actor);
        if (string.IsNullOrWhiteSpace(name) || name.Trim().Length > 60)
        {
            throw new BusinessException("Der Name fehlt oder ist länger als 60 Zeichen.", "Name");
        }

        var match = await db.Matches.FirstOrDefaultAsync(m => m.Id == id) ?? throw new BusinessException("Das Spiel wurde nicht gefunden.");
        match.Name = name.Trim();
        match.IsPublic = isPublic;
        await db.ActingAs(actor.AuditId).SaveChangesAsync();
    }

    /// <summary>Removes a match that is over (administrators).</summary>
    public static async Task DeleteAsync(AppDbContext db, Actor actor, long id)
    {
        Guard.Admin(actor);
        var match = await db.Matches.FirstOrDefaultAsync(m => m.Id == id) ?? throw new BusinessException("Das Spiel wurde nicht gefunden.");
        if (match.Status is MatchStatus.Lobby or MatchStatus.Running)
        {
            throw new BusinessException("Das Spiel läuft noch: erst beenden, dann löschen.");
        }

        db.Matches.Remove(match);
        await db.SaveChangesAsync();
    }

    public static async Task<DashboardNumbers> DashboardAsync(AppDbContext db, Actor actor)
    {
        Guard.Admin(actor);
        var since = DateTime.UtcNow.AddDays(-7);
        return new DashboardNumbers(
            await db.Players.CountAsync(p => p.UpdateState != UpdateState.Deleted),
            await db.Players.CountAsync(p => p.UpdateState != UpdateState.Deleted && p.LastSeenDate >= since),
            await db.Matches.CountAsync(),
            await db.Matches.CountAsync(m => m.Status == MatchStatus.Running),
            await db.Matches.CountAsync(m => m.Status == MatchStatus.Lobby),
            await db.Worlds.CountAsync(w => w.UpdateState != UpdateState.Deleted),
            await db.Weapons.CountAsync(w => w.UpdateState != UpdateState.Deleted));
    }
}
