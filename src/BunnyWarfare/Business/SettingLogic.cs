using System.Globalization;
using BunnyWarfare.Data;
using Microsoft.EntityFrameworkCore;

namespace BunnyWarfare.Business;

/// <summary>The settings of the server (Administration → System).</summary>
public sealed record ServerSettings(bool RegistrationOpen, int DefaultTurnSeconds, int MaxTeamsPerMatch, string Announcement)
{
    public static readonly ServerSettings Default = new(true, 45, 6, string.Empty);
}

public static class SettingLogic
{
    private const string RegistrationOpenKey = "RegistrationOpen";
    private const string DefaultTurnSecondsKey = "DefaultTurnSeconds";
    private const string MaxTeamsPerMatchKey = "MaxTeamsPerMatch";
    private const string AnnouncementKey = "Announcement";

    /// <summary>Everyone may read the settings (the start page shows the announcement, the new match form the defaults).</summary>
    public static async Task<ServerSettings> GetAsync(AppDbContext db)
    {
        var values = await db.Settings.AsNoTracking().ToDictionaryAsync(s => s.Key, s => s.Value);
        var d = ServerSettings.Default;
        return new ServerSettings(
            values.TryGetValue(RegistrationOpenKey, out var open) ? open == "true" : d.RegistrationOpen,
            values.TryGetValue(DefaultTurnSecondsKey, out var turn) && int.TryParse(turn, CultureInfo.InvariantCulture, out var t) ? t : d.DefaultTurnSeconds,
            values.TryGetValue(MaxTeamsPerMatchKey, out var teams) && int.TryParse(teams, CultureInfo.InvariantCulture, out var m) ? m : d.MaxTeamsPerMatch,
            values.TryGetValue(AnnouncementKey, out var text) ? text : d.Announcement);
    }

    public static async Task SaveAsync(AppDbContext db, Actor actor, ServerSettings settings)
    {
        Guard.Admin(actor);
        if (settings.DefaultTurnSeconds is < 15 or > 120)
        {
            throw new BusinessException("Die Zugzeit liegt zwischen 15 und 120 Sekunden.", nameof(ServerSettings.DefaultTurnSeconds));
        }

        if (settings.MaxTeamsPerMatch is < 2 or > 8)
        {
            throw new BusinessException("Ein Spiel hat 2 bis 8 Teams.", nameof(ServerSettings.MaxTeamsPerMatch));
        }

        if (settings.Announcement.Length > 500)
        {
            throw new BusinessException("Die Ankündigung hat höchstens 500 Zeichen.", nameof(ServerSettings.Announcement));
        }

        await SetAsync(db, RegistrationOpenKey, settings.RegistrationOpen ? "true" : "false");
        await SetAsync(db, DefaultTurnSecondsKey, settings.DefaultTurnSeconds.ToString(CultureInfo.InvariantCulture));
        await SetAsync(db, MaxTeamsPerMatchKey, settings.MaxTeamsPerMatch.ToString(CultureInfo.InvariantCulture));
        await SetAsync(db, AnnouncementKey, settings.Announcement.Trim());
        await db.ActingAs(actor.AuditId).SaveChangesAsync();
    }

    private static async Task SetAsync(AppDbContext db, string key, string value)
    {
        var setting = await db.Settings.FirstOrDefaultAsync(s => s.Key == key);
        if (setting is null)
        {
            db.Settings.Add(new Setting { Key = key, Value = value });
        }
        else if (setting.Value != value)
        {
            setting.Value = value;
        }
    }
}
