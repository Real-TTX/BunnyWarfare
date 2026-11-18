using BunnyWarfare.Business;
using BunnyWarfare.Data;
using MatGame.Sdk.Controls;
using MatGame.Sdk.Web;
using Microsoft.AspNetCore.Mvc;

namespace BunnyWarfare.Pages.Admin.Players;

/// <summary>The game data of a player: team, experience, look, statistics. The account (name, password, role) is edited in MatGame's own administration.</summary>
public sealed class EditModel(AppDbContext db) : AppPageModel(db)
{
    [BindProperty(SupportsGet = true)]
    public long Id { get; set; }

    [BindProperty]
    public string TeamName { get; set; } = string.Empty;

    [BindProperty]
    public string TeamColor { get; set; } = PlayerLogic.TeamColors[0].Value;

    [BindProperty]
    public int Xp { get; set; }

    [BindProperty]
    public string Fur { get; set; } = Look.Default.Fur;

    [BindProperty]
    public string Outfit { get; set; } = Look.Default.Outfit;

    [BindProperty]
    public string Face { get; set; } = Look.Default.Face;

    [BindProperty]
    public string Frame { get; set; } = Look.Default.Frame;

    public int Level => Cosmetics.LevelOf(Xp);

    public string DisplayName => Stats?.DisplayName ?? "Spieler";

    /// <summary>The items of a kind for a select; locked ones say what the player still needs (the administrator may give them anyway).</summary>
    public IReadOnlyList<Choice> ChoicesOf(IReadOnlyList<Cosmetic> items)
    {
        var progress = Stats is { } s ? Progress.Of(s) : new Progress(0, 0, 0, 0, 0);
        return items.Select(c => new Choice(c.Key, c.Name + (c.Wild ? " 🔥" : string.Empty), c.IsUnlocked(progress) ? null : "gesperrt: " + c.Requirement)).ToList();
    }

    public Player? Stats { get; private set; }

    /// <summary>The tab shown first: the one with an error, else the team.</summary>
    public string Tab => HasError(nameof(Xp)) || HasError(nameof(Fur)) ? "progress" : "general";

    private bool HasError(string key) => ModelState.TryGetValue(key, out var entry) && entry.Errors.Count > 0;

    public IReadOnlyList<Choice> Colors { get; } = PlayerLogic.TeamColors.Select(c => new Choice(c.Value, c.Label, null, c.Value)).ToList();

    private async Task LoadStatsAsync() => Stats = await PlayerLogic.GetAsync(Db, Me, Id);

    public async Task<IActionResult> OnGetAsync()
    {
        await LoadStatsAsync();
        if (Stats is null)
        {
            return NotFound();
        }

        TeamName = Stats.TeamName;
        TeamColor = Stats.TeamColor;
        Xp = Stats.Xp;
        Fur = Stats.Fur;
        Outfit = Stats.Outfit;
        Face = Stats.Face;
        Frame = Stats.Frame;
        return Page();
    }

    public async Task<IActionResult> OnPostAsync()
        => await TryAsync(async () =>
        {
            await PlayerLogic.SaveAsync(Db, Me, new PlayerInput(Id, TeamName, TeamColor, Xp, new Look(Fur, Outfit, Face, Frame)));
            Flash("Gespeichert.");
            return RedirectToPage(new { id = Id });
        }, LoadStatsAsync);

    public async Task<IActionResult> OnPostDeleteAsync()
        => await TryAsync(async () =>
        {
            await PlayerLogic.DeleteAsync(Db, Me, Id);
            Flash("Der Spieler wurde aus BunnyWarfare entfernt.");
            return RedirectToPage("Index");
        }, LoadStatsAsync);
}
