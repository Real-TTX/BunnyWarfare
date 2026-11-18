using System.Data.Common;
using System.Security.Cryptography;
using System.Text;
using BunnyWarfare.Data;
using MatGame.Sdk;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace BunnyWarfare.Business;

/// <summary>What an import took over.</summary>
public sealed record ImportReport(int Accounts, int Players, int Worlds, int Weapons, int Matches, bool Skipped)
{
    public string Summary => Skipped
        ? "Diese Datenbank wurde schon übernommen."
        : $"{Accounts} Konten, {Players} Spieler, {Worlds} Welten, {Weapons} Waffen, {Matches} Spiele übernommen.";
}

/// <summary>
/// Takes over the database of an old stand-alone BunnyWarfare server (before MatGame; its tables in the schema "public"): the accounts become MatGame accounts
/// (the password hashes are kept, so the old passwords work), their numbers, experience, look and team become players here, worlds and weapons the
/// administrators made are added (same name = already there), finished matches come along with their teams. A source is taken over only once.
/// </summary>
public static class ImportLogic
{
    private const string ImportedKeyPrefix = "ImportedFrom:";

    public static async Task<ImportReport> ImportAsync(AppDbContext db, Actor actor, IGameAccounts accounts, string connectionString, bool onlyOnce, CancellationToken ct)
    {
        Guard.Admin(actor);
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            throw new BusinessException("Bitte die Verbindung zur alten Datenbank angeben.", "ConnectionString");
        }

        var key = ImportedKeyPrefix + Fingerprint(connectionString);
        if (await db.Settings.AnyAsync(s => s.Key == key, ct))
        {
            if (onlyOnce)
            {
                return new ImportReport(0, 0, 0, 0, 0, Skipped: true);
            }

            throw new BusinessException("Diese Datenbank wurde schon übernommen.", "ConnectionString");
        }

        await using var source = new NpgsqlConnection(connectionString);
        try
        {
            await source.OpenAsync(ct);
        }
        catch (Exception e) when (e is NpgsqlException or ArgumentException or InvalidOperationException)
        {
            throw new BusinessException($"Die alte Datenbank ist nicht erreichbar: {e.Message}", "ConnectionString");
        }

        if (!await TableExistsAsync(source, "Player", ct))
        {
            throw new BusinessException("Das ist keine BunnyWarfare-Datenbank (die Tabelle \"Player\" fehlt).", "ConnectionString");
        }

        // ---- accounts and players ----
        var playerIds = new Dictionary<long, long>();
        var accountCount = 0;
        var playerCount = 0;
        foreach (var row in await ReadAsync(source, "SELECT * FROM public.\"Player\" WHERE \"UpdateState\" <> 0", ct))
        {
            var login = Get(row, "LoginName", string.Empty);
            if (login.Length == 0)
            {
                continue;
            }

            var accountId = await accounts.ImportAsync(new ImportedAccount(login, Get(row, "DisplayName", login), Get(row, "PasswordHash", string.Empty),
                Get(row, "Role", (short)0) == 1, Get(row, "IsActive", true), Get(row, "CreateDate", DateTime.UtcNow), GetNullable<DateTime>(row, "LastLoginDate")), ct);
            accountCount++;
            playerIds[Get(row, "Id", 0L)] = accountId;

            var player = await db.Players.FirstOrDefaultAsync(p => p.Id == accountId, ct);
            if (player is null)
            {
                player = new Player { Id = accountId, DisplayName = Get(row, "DisplayName", login) };
                db.Players.Add(player);
            }

            player.TeamName = Get(row, "TeamName", GameRules.TeamNameFor(player.DisplayName));
            player.TeamColor = Get(row, "TeamColor", player.TeamColor);
            player.LastSeenDate = GetNullable<DateTime>(row, "LastLoginDate") ?? player.LastSeenDate;
            player.GamesPlayed += Get(row, "GamesPlayed", 0);
            player.GamesWon += Get(row, "GamesWon", 0);
            player.Kills += Get(row, "Kills", 0);
            player.DamageDealt += Get(row, "DamageDealt", 0);
            player.Xp += Get(row, "Xp", 0);
            var look = new Look(Get(row, "Fur", player.Fur), Get(row, "Outfit", player.Outfit), Get(row, "Face", player.Face), Get(row, "Frame", player.Frame));
            if (Cosmetics.Exists(look))
            {
                PlayerRules.SetLook(player, look);
            }

            playerCount++;
        }

        await db.ActingAs(actor.AuditId).SaveChangesAsync(ct);

        // ---- worlds and weapons (by name) ----
        var worldIds = new Dictionary<long, long>();
        var worldCount = 0;
        var known = await db.Worlds.ToDictionaryAsync(w => w.Name, w => w, ct);
        var newWorlds = new List<(long OldId, World World)>();
        foreach (var row in await ReadAsync(source, "SELECT * FROM public.\"World\" WHERE \"UpdateState\" <> 0", ct))
        {
            var name = Get(row, "Name", string.Empty);
            if (known.TryGetValue(name, out var existing))
            {
                worldIds[Get(row, "Id", 0L)] = existing.Id;
                continue;
            }

            var world = new World
            {
                Name = name, Description = Get(row, "Description", string.Empty), Theme = (WorldTheme)Get(row, "Theme", (short)0), GridSize = Get(row, "GridSize", 96),
                HillHeight = Get(row, "HillHeight", 7.0), Roughness = Get(row, "Roughness", 0.5), WaterLevel = Get(row, "WaterLevel", 0.0), Gravity = Get(row, "Gravity", 9.81),
                MaxWind = Get(row, "MaxWind", 4.0), Seed = Get(row, "Seed", 1), IsEnabled = Get(row, "IsEnabled", true),
            };
            db.Worlds.Add(world);
            newWorlds.Add((Get(row, "Id", 0L), world));
            known[name] = world;
            worldCount++;
        }

        var knownWeapons = await db.Weapons.Select(w => w.Name).ToListAsync(ct);
        var weaponCount = 0;
        foreach (var row in await ReadAsync(source, "SELECT * FROM public.\"Weapon\" WHERE \"UpdateState\" <> 0", ct))
        {
            var name = Get(row, "Name", string.Empty);
            if (knownWeapons.Contains(name))
            {
                continue;
            }

            db.Weapons.Add(new Weapon
            {
                Name = name, Description = Get(row, "Description", string.Empty), Kind = (WeaponKind)Get(row, "Kind", (short)0), Damage = Get(row, "Damage", 40),
                BlastRadius = Get(row, "BlastRadius", 2.5), AffectedByWind = Get(row, "AffectedByWind", false), FuseSeconds = Get(row, "FuseSeconds", 3.0),
                ClusterCount = Get(row, "ClusterCount", 4), Pellets = Get(row, "Pellets", 3), AmmoPerMatch = Get(row, "AmmoPerMatch", -1), SortOrder = Get(row, "SortOrder", 0),
                IsEnabled = Get(row, "IsEnabled", true),
            });
            knownWeapons.Add(name);
            weaponCount++;
        }

        await db.ActingAs(actor.AuditId).SaveChangesAsync(ct);
        foreach (var (oldId, world) in newWorlds)
        {
            worldIds[oldId] = world.Id;
        }

        // ---- finished matches with their teams ----
        var matchCount = 0;
        var tokens = (await db.Matches.Select(m => m.Token).ToListAsync(ct)).ToHashSet();
        var teams = (await ReadAsync(source, "SELECT * FROM public.\"MatchTeam\"", ct)).ToLookup(r => Get(r, "MatchId", 0L));
        foreach (var row in await ReadAsync(source, "SELECT * FROM public.\"Match\" WHERE \"Status\" IN (2, 3)", ct))
        {
            var token = Get(row, "Token", Guid.Empty);
            if (tokens.Contains(token) || !playerIds.TryGetValue(Get(row, "HostPlayerId", 0L), out var host) || !worldIds.TryGetValue(Get(row, "WorldId", 0L), out var worldId))
            {
                continue;
            }

            var match = new Match
            {
                Token = token, Name = Get(row, "Name", "Spiel"), WorldId = worldId, HostPlayerId = host, Status = (MatchStatus)Get(row, "Status", (short)2),
                IsPublic = Get(row, "IsPublic", true), MaxTeams = Get(row, "MaxTeams", 4), BunniesPerTeam = Get(row, "BunniesPerTeam", 3), BunnyHealth = Get(row, "BunnyHealth", 100),
                TurnSeconds = Get(row, "TurnSeconds", 45), CrateRate = (CrateRate)Get(row, "CrateRate", (short)2), StartDate = GetNullable<DateTime>(row, "StartDate"),
                EndDate = GetNullable<DateTime>(row, "EndDate"), TurnCount = Get(row, "TurnCount", 0), WinnerTeamIndex = GetNullable<int>(row, "WinnerTeamIndex"),
            };
            foreach (var t in teams[Get(row, "Id", 0L)])
            {
                var oldPlayer = GetNullable<long>(t, "PlayerId");
                match.Teams.Add(new MatchTeam
                {
                    TeamIndex = Get(t, "TeamIndex", 0), PlayerId = oldPlayer is { } p && playerIds.TryGetValue(p, out var mapped) ? mapped : null, IsBot = Get(t, "IsBot", false),
                    BotLevel = (BotLevel)Get(t, "BotLevel", (short)1), TeamName = Get(t, "TeamName", "Team"), TeamColor = Get(t, "TeamColor", "#888888"), Kills = Get(t, "Kills", 0),
                    DamageDealt = Get(t, "DamageDealt", 0), Placement = Get(t, "Placement", 0), Fur = Get(t, "Fur", "snow"), Outfit = Get(t, "Outfit", "helmet"),
                    Face = Get(t, "Face", "none"), Frame = Get(t, "Frame", "wood"), XpGained = Get(t, "XpGained", 0),
                });
            }

            db.Matches.Add(match);
            tokens.Add(token);
            matchCount++;
        }

        db.Settings.Add(new Setting { Key = key, Value = DateTime.UtcNow.ToString("O") });
        await db.ActingAs(actor.AuditId).SaveChangesAsync(ct);
        return new ImportReport(accountCount, playerCount, worldCount, weaponCount, matchCount, Skipped: false);
    }

    /// <summary>A short fingerprint of a source (host, port, database), so the same database is not taken over twice (no password in it).</summary>
    private static string Fingerprint(string connectionString)
    {
        string text;
        try
        {
            var b = new NpgsqlConnectionStringBuilder(connectionString);
            text = $"{b.Host}:{b.Port}/{b.Database}".ToLowerInvariant();
        }
        catch (ArgumentException)
        {
            text = connectionString;
        }

        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(text)))[..16];
    }

    private static async Task<bool> TableExistsAsync(NpgsqlConnection source, string table, CancellationToken ct)
    {
        await using var command = new NpgsqlCommand("SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = @t)", source);
        command.Parameters.AddWithValue("t", table);
        return await command.ExecuteScalarAsync(ct) is true;
    }

    private static async Task<List<Dictionary<string, object?>>> ReadAsync(NpgsqlConnection source, string sql, CancellationToken ct)
    {
        await using var command = new NpgsqlCommand(sql, source);
        await using DbDataReader reader = await command.ExecuteReaderAsync(ct);
        var rows = new List<Dictionary<string, object?>>();
        while (await reader.ReadAsync(ct))
        {
            var row = new Dictionary<string, object?>(StringComparer.Ordinal);
            for (var i = 0; i < reader.FieldCount; i++)
            {
                row[reader.GetName(i)] = await reader.IsDBNullAsync(i, ct) ? null : reader.GetValue(i);
            }

            rows.Add(row);
        }

        return rows;
    }

    /// <summary>A column of an old row (older versions lack some columns: then the default).</summary>
    private static T Get<T>(Dictionary<string, object?> row, string column, T fallback)
    {
        if (!row.TryGetValue(column, out var value) || value is null)
        {
            return fallback;
        }

        if (value is T typed)
        {
            return typed;
        }

        return (T)Convert.ChangeType(value, typeof(T), System.Globalization.CultureInfo.InvariantCulture);
    }

    private static T? GetNullable<T>(Dictionary<string, object?> row, string column)
        where T : struct
        => row.TryGetValue(column, out var value) && value is not null ? (T)Convert.ChangeType(value, typeof(T), System.Globalization.CultureInfo.InvariantCulture) : null;
}
