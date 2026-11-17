using System.Text.RegularExpressions;
using BunnyWarfare.Data;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;

namespace BunnyWarfare.Business;

public sealed record PlayerRow(long Id, string LoginName, string DisplayName, PlayerRole Role, bool IsActive, string TeamName, string TeamColor, DateTime? LastLoginDate,
    int GamesPlayed, int GamesWon, int Kills, int Xp)
{
    public int Level => Cosmetics.LevelOf(Xp);
}

public sealed record PlayerInput(long Id, string LoginName, string DisplayName, PlayerRole Role, bool IsActive, string TeamName, string TeamColor, string? Password,
    int? Xp = null, Look? Look = null);

public sealed record PlayerStats(int GamesPlayed, int GamesWon, int Kills, int DamageDealt, int Rank);

public sealed record ProfileInput(string DisplayName, string TeamName, string TeamColor);

/// <summary>An item of the wardrobe for one player: whether it is theirs yet, and how to get it.</summary>
/// <param name="Level">The level that unlocks it (0 = only by wins or knock-outs).</param>
public sealed record WardrobeItem(string Key, string Name, bool Unlocked, string Requirement, bool Wild, int Level);

public sealed record WardrobeKind(string Kind, string Name, IReadOnlyList<WardrobeItem> Items);

/// <summary>The profile of the signed-in player: names, look, level and the progress to the next, numbers and the wardrobe.</summary>
public sealed record ProfileView(string DisplayName, string LoginName, string TeamName, string TeamColor, Look Look, int Level, int Xp, int XpAtLevel, int XpForNext,
    bool MaxLevel, PlayerStats Stats, IReadOnlyList<WardrobeKind> Wardrobe);

public sealed record LeaderboardRow(int Rank, long PlayerId, string DisplayName, string TeamName, string TeamColor, int GamesPlayed, int GamesWon, int Kills, int DamageDealt,
    int Level, string Fur, string Outfit, string Face, string Frame)
{
    public int WinRate => GamesPlayed == 0 ? 0 : (int)Math.Round(100.0 * GamesWon / GamesPlayed);
}

/// <summary>The accounts: registration, sign-in, profile, administration and the leaderboard.</summary>
public static partial class PlayerLogic
{
    public const int PasswordMinLength = 6;

    private static readonly PasswordHasher<Player> Hasher = new();

    [GeneratedRegex("^[a-zA-Z0-9_.-]{3,40}$")]
    private static partial Regex LoginNameRegex();

    [GeneratedRegex("^#[0-9a-fA-F]{6}$")]
    private static partial Regex ColorRegex();

    /// <summary>The colours a team can have (well apart from each other on the meadow, the snow and the sand).</summary>
    public static readonly IReadOnlyList<(string Value, string Label)> TeamColors =
    [
        ("#c2410c", "Möhrenorange"), ("#2563eb", "Blau"), ("#16a34a", "Grün"), ("#9333ea", "Violett"),
        ("#dc2626", "Rot"), ("#0891b2", "Türkis"), ("#ca8a04", "Senf"), ("#db2777", "Pink"),
    ];

    private static IQueryable<Player> Alive(AppDbContext db) => db.Players.Where(p => p.UpdateState != UpdateState.Deleted);

    public static async Task<PagedResult<PlayerRow>> ListAsync(AppDbContext db, Actor actor, ListRequest request)
    {
        Guard.Admin(actor);
        var all = Alive(db);
        var query = all;
        if (request.Search is { } search)
        {
            var pattern = $"%{search}%";
            query = query.Where(p => EF.Functions.ILike(p.LoginName, pattern) || EF.Functions.ILike(p.DisplayName, pattern) || EF.Functions.ILike(p.TeamName, pattern));
        }

        query = request.Filter("role") switch
        {
            "admin" => query.Where(p => p.Role == PlayerRole.Admin),
            "player" => query.Where(p => p.Role == PlayerRole.Player),
            _ => query,
        };
        query = request.Filter("status") switch
        {
            "active" => query.Where(p => p.IsActive),
            "disabled" => query.Where(p => !p.IsActive),
            _ => query,
        };

        query = request.Sort switch
        {
            "login" => query.SortBy(p => p.LastLoginDate, request.Descending),
            "games" => query.SortBy(p => p.GamesPlayed, request.Descending),
            "wins" => query.SortBy(p => p.GamesWon, request.Descending),
            "level" => query.SortBy(p => p.Xp, request.Descending),
            _ => query.SortBy(p => p.DisplayName, request.Descending),
        };

        var total = await all.CountAsync();
        var matching = await query.CountAsync();
        var items = await query.Page(request)
            .Select(p => new PlayerRow(p.Id, p.LoginName, p.DisplayName, p.Role, p.IsActive, p.TeamName, p.TeamColor, p.LastLoginDate, p.GamesPlayed, p.GamesWon, p.Kills, p.Xp))
            .ToListAsync();
        return new PagedResult<PlayerRow>(items, matching, total);
    }

    public static async Task<Player?> GetAsync(AppDbContext db, Actor actor, long id)
    {
        Guard.AdminOrSelf(actor, id);
        return await Alive(db).AsNoTracking().FirstOrDefaultAsync(p => p.Id == id);
    }

    /// <summary>Creates (Id 0) or changes an account (administrators).</summary>
    public static async Task<long> SaveAsync(AppDbContext db, Actor actor, PlayerInput input)
    {
        Guard.Admin(actor);
        var isNew = input.Id == 0;
        var player = isNew ? new Player() : await Alive(db).FirstOrDefaultAsync(p => p.Id == input.Id) ?? throw new BusinessException("Der Spieler wurde nicht gefunden.");
        await ValidateLoginNameAsync(db, input.LoginName, input.Id);
        ValidateNames(input.DisplayName, input.TeamName, input.TeamColor);
        if (!isNew && player.Id == actor.PlayerId && (input.Role != PlayerRole.Admin || !input.IsActive))
        {
            throw new BusinessException("Du kannst dir die Administration nicht selbst nehmen.", nameof(PlayerInput.Role));
        }

        if (isNew || !string.IsNullOrEmpty(input.Password))
        {
            ValidatePassword(input.Password, nameof(PlayerInput.Password));
            player.PasswordHash = Hasher.HashPassword(player, input.Password!);
        }

        player.LoginName = input.LoginName.Trim();
        player.DisplayName = input.DisplayName.Trim();
        player.Role = input.Role;
        player.IsActive = input.IsActive;
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

            SetLook(player, look);
        }
        else if (isNew)
        {
            player.Fur = Cosmetics.StarterFur(Random.Shared);
        }

        if (isNew)
        {
            db.Players.Add(player);
        }

        await db.ActingAs(actor.AuditId).SaveChangesAsync();
        return player.Id;
    }

    /// <summary>Soft delete (administrators; nobody deletes themselves).</summary>
    public static async Task DeleteAsync(AppDbContext db, Actor actor, long id)
    {
        Guard.Admin(actor);
        if (id == actor.PlayerId)
        {
            throw new BusinessException("Du kannst dich nicht selbst löschen.");
        }

        var player = await Alive(db).FirstOrDefaultAsync(p => p.Id == id) ?? throw new BusinessException("Der Spieler wurde nicht gefunden.");
        player.UpdateState = UpdateState.Deleted;
        player.IsActive = false;
        player.LoginName = $"{player.LoginName}~deleted~{player.Id}";
        await db.ActingAs(actor.AuditId).SaveChangesAsync();
    }

    /// <summary>Whether a new account may be registered: always when there is none yet (the first becomes the administrator), else when the setting allows it.</summary>
    public static async Task<bool> CanRegisterAsync(AppDbContext db)
        => !await Alive(db).AnyAsync() || (await SettingLogic.GetAsync(db)).RegistrationOpen;

    public static async Task<bool> HasAnyAsync(AppDbContext db) => await Alive(db).AnyAsync();

    /// <summary>Registers a new account. The very first one becomes the administrator.</summary>
    public static async Task<Player> RegisterAsync(AppDbContext db, string loginName, string displayName, string password)
    {
        if (!await CanRegisterAsync(db))
        {
            throw new BusinessException("Die Registrierung ist geschlossen.");
        }

        await ValidateLoginNameAsync(db, loginName, 0);
        ValidateNames(displayName, null, null);
        ValidatePassword(password, "Password");
        var first = !await Alive(db).AnyAsync();
        var player = new Player
        {
            LoginName = loginName.Trim(),
            DisplayName = displayName.Trim(),
            Role = first ? PlayerRole.Admin : PlayerRole.Player,
            TeamName = $"Team {displayName.Trim()}",
            TeamColor = TeamColors[Random.Shared.Next(TeamColors.Count)].Value,
            Fur = Cosmetics.StarterFur(Random.Shared),
            LastLoginDate = DateTime.UtcNow,
        };
        if (player.TeamName.Length > 40)
        {
            player.TeamName = player.TeamName[..40];
        }

        player.PasswordHash = Hasher.HashPassword(player, password);
        db.Players.Add(player);
        await db.ActingAs(null).SaveChangesAsync();
        return player;
    }

    /// <summary>The account for a name and a password, or null; remembers the time of the sign-in.</summary>
    public static async Task<Player?> SignInAsync(AppDbContext db, string loginName, string password)
    {
        var name = loginName.Trim();
        var player = await Alive(db).FirstOrDefaultAsync(p => p.LoginName.ToLower() == name.ToLower());
        if (player is null || !player.IsActive)
        {
            return null;
        }

        var check = Hasher.VerifyHashedPassword(player, player.PasswordHash, password);
        if (check == PasswordVerificationResult.Failed)
        {
            return null;
        }

        if (check == PasswordVerificationResult.SuccessRehashNeeded)
        {
            player.PasswordHash = Hasher.HashPassword(player, password);
        }

        player.LastLoginDate = DateTime.UtcNow;
        await db.ActingAs(player.Id).SaveChangesAsync();
        return player;
    }

    /// <summary>Whether the account behind a cookie may still sign in (not deleted, not disabled); null when it may not.</summary>
    public static async Task<Player?> FindActiveAsync(AppDbContext db, long id)
        => await Alive(db).AsNoTracking().FirstOrDefaultAsync(p => p.Id == id && p.IsActive);

    public static async Task UpdateProfileAsync(AppDbContext db, Actor actor, ProfileInput input)
    {
        Guard.Player(actor);
        ValidateNames(input.DisplayName, input.TeamName, input.TeamColor);
        var player = await Alive(db).FirstAsync(p => p.Id == actor.PlayerId);
        player.DisplayName = input.DisplayName.Trim();
        player.TeamName = input.TeamName.Trim();
        player.TeamColor = input.TeamColor.ToLowerInvariant();
        await db.ActingAs(actor.AuditId).SaveChangesAsync();
    }

    public static async Task ChangePasswordAsync(AppDbContext db, Actor actor, string currentPassword, string newPassword)
    {
        Guard.Player(actor);
        var player = await Alive(db).FirstAsync(p => p.Id == actor.PlayerId);
        if (Hasher.VerifyHashedPassword(player, player.PasswordHash, currentPassword) == PasswordVerificationResult.Failed)
        {
            throw new BusinessException("Das aktuelle Passwort stimmt nicht.", "CurrentPassword");
        }

        ValidatePassword(newPassword, "NewPassword");
        player.PasswordHash = Hasher.HashPassword(player, newPassword);
        await db.ActingAs(actor.AuditId).SaveChangesAsync();
    }

    public static async Task<PagedResult<LeaderboardRow>> LeaderboardAsync(AppDbContext db, Actor actor, ListRequest request)
    {
        Guard.Player(actor);
        var all = Alive(db).Where(p => p.IsActive);
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

    /// <summary>The numbers of the player and their place in the leaderboard (same order as <see cref="LeaderboardAsync"/>).</summary>
    public static async Task<PlayerStats> StatsAsync(AppDbContext db, Actor actor)
    {
        Guard.Player(actor);
        var me = await Alive(db).AsNoTracking().FirstAsync(p => p.Id == actor.PlayerId);
        var better = await Alive(db).Where(p => p.IsActive).CountAsync(p => p.GamesWon > me.GamesWon
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
        var progress = Progress.Of(me);
        var level = progress.Level;
        var wardrobe = Cosmetics.Kinds.Select(k => new WardrobeKind(k.Kind, k.Name,
            k.Items.Select(c => new WardrobeItem(c.Key, c.Name, c.IsUnlocked(progress), c.Requirement, c.Wild, c.Level)).ToList())).ToList();
        return new ProfileView(me.DisplayName, me.LoginName, me.TeamName, me.TeamColor, Look.Of(me), level, me.Xp, Cosmetics.XpAt(level), Cosmetics.XpForNext(level),
            level >= Cosmetics.MaxLevel, stats, wardrobe);
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

        SetLook(player, look);
        await db.ActingAs(actor.AuditId).SaveChangesAsync();
    }

    private static void SetLook(Player player, Look look)
    {
        player.Fur = look.Fur;
        player.Outfit = look.Outfit;
        player.Face = look.Face;
        player.Frame = look.Frame;
    }

    private static async Task ValidateLoginNameAsync(AppDbContext db, string loginName, long ownId)
    {
        var name = loginName?.Trim() ?? string.Empty;
        if (!LoginNameRegex().IsMatch(name))
        {
            throw new BusinessException("Der Anmeldename hat 3 bis 40 Zeichen: Buchstaben, Ziffern, Punkt, Strich oder Unterstrich.", "LoginName");
        }

        if (await db.Players.AnyAsync(p => p.Id != ownId && p.LoginName.ToLower() == name.ToLower()))
        {
            throw new BusinessException("Dieser Anmeldename ist schon vergeben.", "LoginName");
        }
    }

    private static void ValidateNames(string displayName, string? teamName, string? teamColor)
    {
        if (string.IsNullOrWhiteSpace(displayName) || displayName.Trim().Length > 60)
        {
            throw new BusinessException("Der Name fehlt oder ist länger als 60 Zeichen.", "DisplayName");
        }

        if (teamName is not null && (string.IsNullOrWhiteSpace(teamName) || teamName.Trim().Length > 40))
        {
            throw new BusinessException("Der Teamname fehlt oder ist länger als 40 Zeichen.", "TeamName");
        }

        if (teamColor is not null && !ColorRegex().IsMatch(teamColor))
        {
            throw new BusinessException("Die Teamfarbe ist keine Farbe (#rrggbb).", "TeamColor");
        }
    }

    private static void ValidatePassword(string? password, string field)
    {
        if (string.IsNullOrEmpty(password) || password.Length < PasswordMinLength)
        {
            throw new BusinessException($"Das Passwort hat mindestens {PasswordMinLength} Zeichen.", field);
        }
    }
}
