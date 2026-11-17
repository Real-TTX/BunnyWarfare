using BunnyWarfare.Business;
using BunnyWarfare.Data;
using Microsoft.AspNetCore.Mvc;

namespace BunnyWarfare.Pages;

public sealed class IndexModel(AppDbContext db) : AppPageModel(db)
{
    public string Announcement { get; private set; } = string.Empty;

    public IReadOnlyList<MatchHistoryRow> History { get; private set; } = [];

    public async Task OnGetAsync()
    {
        Announcement = (await SettingLogic.GetAsync(Db)).Announcement;
        History = await MatchLogic.HistoryAsync(Db, Me);
    }

    /// <summary>A private match on the first world with the defaults; the game page adds a bot and starts it (quick=1).</summary>
    public async Task<IActionResult> OnPostQuickAsync()
    {
        var worlds = await WorldLogic.ListEnabledAsync(Db, Me);
        if (worlds.Count == 0)
        {
            FlashError("Es gibt noch keine Welt – die Administration muss eine anlegen.");
            return RedirectToPage();
        }

        var settings = await SettingLogic.GetAsync(Db);
        var world = worlds[Random.Shared.Next(worlds.Count)];
        var name = $"Schnellspiel von {Me.DisplayName}";
        var token = await MatchLogic.CreateAsync(Db, Me, new MatchInput(name.Length > 60 ? name[..60] : name, world.Id, 2, 3, 100, settings.DefaultTurnSeconds, false));
        return Redirect($"/Play/{token}?quick=1");
    }
}
