using BunnyWarfare.Business;
using BunnyWarfare.Controls;
using BunnyWarfare.Data;
using Microsoft.AspNetCore.Mvc;

namespace BunnyWarfare.Pages.Admin.Players;

public sealed class EditModel(AppDbContext db) : AppPageModel(db)
{
    [BindProperty(SupportsGet = true)]
    public long Id { get; set; }

    [BindProperty]
    public string DisplayName { get; set; } = string.Empty;

    [BindProperty]
    public string LoginName { get; set; } = string.Empty;

    [BindProperty]
    public string TeamName { get; set; } = string.Empty;

    [BindProperty]
    public string TeamColor { get; set; } = PlayerLogic.TeamColors[0].Value;

    [BindProperty]
    public PlayerRole Role { get; set; } = PlayerRole.Player;

    [BindProperty]
    public bool IsActive { get; set; } = true;

    [BindProperty]
    public string? Password { get; set; }

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

    /// <summary>The items of a kind for a select; locked ones say what the player still needs (the administrator may give them anyway).</summary>
    public IReadOnlyList<Choice> ChoicesOf(IReadOnlyList<Cosmetic> items)
    {
        var progress = Stats is { } s ? Progress.Of(s) : new Progress(0, 0, 0, 0, 0);
        return items.Select(c => new Choice(c.Key, c.Name + (c.Wild ? " 🔥" : string.Empty), c.IsUnlocked(progress) ? null : "gesperrt: " + c.Requirement)).ToList();
    }

    public Player? Stats { get; private set; }

    public bool IsNew => Id == 0;

    public bool IsSelf => Id == Me.PlayerId;

    /// <summary>The tab shown first: the one with an error, else General.</summary>
    public string Tab => HasError(nameof(Password)) || HasError(nameof(Role)) ? "security" : HasError(nameof(Xp)) || HasError(nameof(Fur)) ? "progress" : "general";

    private bool HasError(string key) => ModelState.TryGetValue(key, out var entry) && entry.Errors.Count > 0;

    public IReadOnlyList<Choice> Colors { get; } = PlayerLogic.TeamColors.Select(c => new Choice(c.Value, c.Label, null, c.Value)).ToList();

    public IReadOnlyList<Choice> Roles { get; } = [new(nameof(PlayerRole.Player), "Spieler"), new(nameof(PlayerRole.Admin), "Administrator", "Darf alles in der Administration")];

    private async Task LoadStatsAsync()
    {
        if (!IsNew)
        {
            Stats = await PlayerLogic.GetAsync(Db, Me, Id);
        }
    }

    public async Task<IActionResult> OnGetAsync()
    {
        if (IsNew)
        {
            return Page();
        }

        await LoadStatsAsync();
        if (Stats is null)
        {
            return NotFound();
        }

        DisplayName = Stats.DisplayName;
        LoginName = Stats.LoginName;
        TeamName = Stats.TeamName;
        TeamColor = Stats.TeamColor;
        Role = Stats.Role;
        IsActive = Stats.IsActive;
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
            var id = await PlayerLogic.SaveAsync(Db, Me, new PlayerInput(Id, LoginName, DisplayName, Role, IsActive, TeamName, TeamColor, Password,
                IsNew ? null : Xp, IsNew ? null : new Look(Fur, Outfit, Face, Frame)));
            Flash(IsNew ? "Der Spieler wurde angelegt." : "Gespeichert.");
            return RedirectToPage(new { id });
        }, LoadStatsAsync);

    public async Task<IActionResult> OnPostDeleteAsync()
        => await TryAsync(async () =>
        {
            await PlayerLogic.DeleteAsync(Db, Me, Id);
            Flash("Der Spieler wurde gelöscht.");
            return RedirectToPage("Index");
        }, LoadStatsAsync);
}
