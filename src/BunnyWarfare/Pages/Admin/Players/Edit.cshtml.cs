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

    public Player? Stats { get; private set; }

    public bool IsNew => Id == 0;

    public bool IsSelf => Id == Me.PlayerId;

    /// <summary>The tab shown first: the one with an error, else General.</summary>
    public string Tab => ModelState.ContainsKey(nameof(Password)) && ModelState[nameof(Password)]!.Errors.Count > 0
                         || ModelState.ContainsKey(nameof(Role)) && ModelState[nameof(Role)]!.Errors.Count > 0
        ? "security"
        : "general";

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
        return Page();
    }

    public async Task<IActionResult> OnPostAsync()
        => await TryAsync(async () =>
        {
            var id = await PlayerLogic.SaveAsync(Db, Me, new PlayerInput(Id, LoginName, DisplayName, Role, IsActive, TeamName, TeamColor, Password));
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
