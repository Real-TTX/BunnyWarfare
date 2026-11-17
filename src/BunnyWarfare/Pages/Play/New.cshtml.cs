using System.Globalization;
using BunnyWarfare.Business;
using BunnyWarfare.Controls;
using BunnyWarfare.Data;
using Microsoft.AspNetCore.Mvc;

namespace BunnyWarfare.Pages.Play;

public sealed class NewModel(AppDbContext db) : AppPageModel(db)
{
    [BindProperty]
    public string Name { get; set; } = string.Empty;

    [BindProperty]
    public long WorldId { get; set; }

    [BindProperty]
    public bool IsPublic { get; set; } = true;

    [BindProperty]
    public int MaxTeams { get; set; } = 4;

    [BindProperty]
    public int BunniesPerTeam { get; set; } = 3;

    [BindProperty]
    public int BunnyHealth { get; set; } = 100;

    [BindProperty]
    public int TurnSeconds { get; set; } = 45;

    public int MaxTeamsLimit { get; private set; } = 6;

    public IReadOnlyList<Choice> Worlds { get; private set; } = [];

    private async Task LoadAsync()
    {
        var settings = await SettingLogic.GetAsync(Db);
        MaxTeamsLimit = settings.MaxTeamsPerMatch;
        var worlds = await WorldLogic.ListEnabledAsync(Db, Me);
        Worlds = worlds.Select(w => new Choice(w.Id.ToString(CultureInfo.InvariantCulture), w.Name, $"{WorldLogic.ThemeName(w.Theme)} · {w.Description}")).ToList();
    }

    public async Task OnGetAsync()
    {
        await LoadAsync();
        var settings = await SettingLogic.GetAsync(Db);
        Name = $"Schlacht von {Me.DisplayName}";
        if (Name.Length > 60)
        {
            Name = Name[..60];
        }

        TurnSeconds = settings.DefaultTurnSeconds;
        MaxTeams = Math.Min(4, settings.MaxTeamsPerMatch);
        WorldId = long.TryParse(Worlds.FirstOrDefault()?.Value, out var first) ? first : 0;
    }

    public async Task<IActionResult> OnPostAsync()
        => await TryAsync(async () =>
        {
            var token = await MatchLogic.CreateAsync(Db, Me, new MatchInput(Name, WorldId, MaxTeams, BunniesPerTeam, BunnyHealth, TurnSeconds, IsPublic));
            return Redirect($"/Play/{token}");
        }, LoadAsync);
}
