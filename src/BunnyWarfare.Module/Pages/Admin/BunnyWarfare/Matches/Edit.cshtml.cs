using BunnyWarfare.Business;
using BunnyWarfare.Data;
using BunnyWarfare.Game;
using Microsoft.AspNetCore.Mvc;

namespace BunnyWarfare.Pages.Admin.Matches;

public sealed class EditModel(AppDbContext db, RoomRegistry registry) : AppPageModel(db)
{
    [BindProperty(SupportsGet = true)]
    public long Id { get; set; }

    [BindProperty]
    public string Name { get; set; } = string.Empty;

    [BindProperty]
    public bool IsPublic { get; set; }

    public Match? Match { get; private set; }

    private async Task LoadAsync() => Match = await MatchLogic.AdminGetAsync(Db, Me, Id);

    public async Task<IActionResult> OnGetAsync()
    {
        await LoadAsync();
        if (Match is null)
        {
            return NotFound();
        }

        Name = Match.Name;
        IsPublic = Match.IsPublic;
        return Page();
    }

    public async Task<IActionResult> OnPostAsync()
        => await TryAsync(async () =>
        {
            await MatchLogic.AdminSaveAsync(Db, Me, Id, Name, IsPublic);
            Flash("Gespeichert.");
            return RedirectToPage(new { id = Id });
        }, LoadAsync);

    public async Task<IActionResult> OnPostAbortAsync()
        => await TryAsync(async () =>
        {
            await LoadAsync();
            if (Match is null)
            {
                return NotFound();
            }

            await MatchControl.AbortAsync(Db, Me, registry, Id, Match.Token);
            Flash("Das Spiel wurde beendet.");
            return RedirectToPage(new { id = Id });
        }, LoadAsync);

    public async Task<IActionResult> OnPostDeleteAsync()
        => await TryAsync(async () =>
        {
            await MatchLogic.DeleteAsync(Db, Me, Id);
            Flash("Das Spiel wurde gelöscht.");
            return RedirectToPage("Index");
        }, LoadAsync);
}
