using BunnyWarfare.Business;
using BunnyWarfare.Data;
using Microsoft.AspNetCore.Mvc;

namespace BunnyWarfare.Pages.Admin;

public sealed class SystemModel(AppDbContext db) : AppPageModel(db)
{
    [BindProperty]
    public bool RegistrationOpen { get; set; }

    [BindProperty]
    public int DefaultTurnSeconds { get; set; }

    [BindProperty]
    public int MaxTeamsPerMatch { get; set; }

    [BindProperty]
    public string? Announcement { get; set; }

    public async Task OnGetAsync()
    {
        Guard.Admin(Me);
        var s = await SettingLogic.GetAsync(Db);
        RegistrationOpen = s.RegistrationOpen;
        DefaultTurnSeconds = s.DefaultTurnSeconds;
        MaxTeamsPerMatch = s.MaxTeamsPerMatch;
        Announcement = s.Announcement;
    }

    public async Task<IActionResult> OnPostAsync()
        => await TryAsync(async () =>
        {
            await SettingLogic.SaveAsync(Db, Me, new ServerSettings(RegistrationOpen, DefaultTurnSeconds, MaxTeamsPerMatch, Announcement ?? string.Empty));
            Flash("Gespeichert.");
            return RedirectToPage();
        });
}
