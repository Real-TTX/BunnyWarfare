using BunnyWarfare.Business;
using BunnyWarfare.Controls;
using BunnyWarfare.Data;
using Microsoft.AspNetCore.Mvc;

namespace BunnyWarfare.Pages.Account;

public sealed class IndexModel(AppDbContext db) : AppPageModel(db)
{
    [BindProperty]
    public string DisplayName { get; set; } = string.Empty;

    [BindProperty]
    public string TeamName { get; set; } = string.Empty;

    [BindProperty]
    public string TeamColor { get; set; } = string.Empty;

    public IReadOnlyList<Choice> Colors { get; } = PlayerLogic.TeamColors.Select(c => new Choice(c.Value, c.Label, null, c.Value)).ToList();

    public async Task OnGetAsync()
    {
        var me = await PlayerLogic.GetAsync(Db, Me, Me.PlayerId);
        DisplayName = me!.DisplayName;
        TeamName = me.TeamName;
        TeamColor = me.TeamColor;
    }

    public async Task<IActionResult> OnPostAsync()
        => await TryAsync(async () =>
        {
            await PlayerLogic.UpdateProfileAsync(Db, Me, new ProfileInput(DisplayName, TeamName, TeamColor));
            Flash("Gespeichert.");
            return RedirectToPage();
        });
}
