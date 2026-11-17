using BunnyWarfare.Business;
using BunnyWarfare.Controls;
using BunnyWarfare.Data;
using BunnyWarfare.Game;
using Microsoft.AspNetCore.Mvc;

namespace BunnyWarfare.Pages.Admin.Worlds;

public sealed class EditModel(AppDbContext db) : AppPageModel(db)
{
    [BindProperty(SupportsGet = true)]
    public long Id { get; set; }

    [BindProperty]
    public string Name { get; set; } = string.Empty;

    [BindProperty]
    public string? Description { get; set; }

    [BindProperty]
    public WorldTheme Theme { get; set; }

    [BindProperty]
    public int GridSize { get; set; } = 96;

    [BindProperty]
    public double HillHeight { get; set; } = 7;

    [BindProperty]
    public double Roughness { get; set; } = 0.5;

    [BindProperty]
    public double WaterLevel { get; set; }

    [BindProperty]
    public double Gravity { get; set; } = 9.81;

    [BindProperty]
    public double MaxWind { get; set; } = 4;

    [BindProperty]
    public int Seed { get; set; } = Random.Shared.Next(1, 100000);

    [BindProperty]
    public bool IsEnabled { get; set; } = true;

    public bool IsNew => Id == 0;

    public IReadOnlyList<Choice> Themes { get; } = Enum.GetValues<WorldTheme>().Select(t => new Choice(t.ToString(), WorldLogic.ThemeName(t))).ToList();

    public async Task<IActionResult> OnGetAsync()
    {
        if (IsNew)
        {
            return Page();
        }

        var world = await WorldLogic.GetAsync(Db, Me, Id);
        if (world is null)
        {
            return NotFound();
        }

        Name = world.Name;
        Description = world.Description;
        Theme = world.Theme;
        GridSize = world.GridSize;
        HillHeight = world.HillHeight;
        Roughness = world.Roughness;
        WaterLevel = world.WaterLevel;
        Gravity = world.Gravity;
        MaxWind = world.MaxWind;
        Seed = world.Seed;
        IsEnabled = world.IsEnabled;
        return Page();
    }

    public async Task<IActionResult> OnPostAsync()
        => await TryAsync(async () =>
        {
            var id = await WorldLogic.SaveAsync(Db, Me, new WorldInput(Id, Name, Description ?? string.Empty, Theme, GridSize, HillHeight, Roughness, WaterLevel, Gravity, MaxWind, Seed,
                IsEnabled));
            Flash(IsNew ? "Die Welt wurde angelegt." : "Gespeichert.");
            return RedirectToPage(new { id });
        });

    public async Task<IActionResult> OnPostDeleteAsync()
        => await TryAsync(async () =>
        {
            await WorldLogic.DeleteAsync(Db, Me, Id);
            Flash("Die Welt wurde gelöscht.");
            return RedirectToPage("Index");
        });

    /// <summary>The height map for the preview (generated, nothing is saved).</summary>
    public IActionResult OnGetPreview(int gridSize, int seed, double hillHeight, double roughness, double waterLevel, WorldTheme theme)
    {
        var size = Math.Clamp(gridSize, WorldLogic.MinGridSize, WorldLogic.MaxGridSize);
        var terrain = Terrain.Generate(size, seed, Math.Clamp(hillHeight, 1, 20), Math.Clamp(roughness, 0, 1), Math.Clamp(waterLevel, -2, 4), theme);
        return new JsonResult(new { size, waterLevel = terrain.WaterLevel, hillHeight, width = terrain.Width, heights = terrain.ToBase64() });
    }
}
