using BunnyWarfare.Business;
using BunnyWarfare.Controls;
using BunnyWarfare.Data;
using Microsoft.AspNetCore.Mvc;

namespace BunnyWarfare.Pages.Admin.Weapons;

public sealed class EditModel(AppDbContext db) : AppPageModel(db)
{
    [BindProperty(SupportsGet = true)]
    public long Id { get; set; }

    [BindProperty]
    public string Name { get; set; } = string.Empty;

    [BindProperty]
    public string? Description { get; set; }

    [BindProperty]
    public WeaponKind Kind { get; set; }

    [BindProperty]
    public int Damage { get; set; } = 40;

    [BindProperty]
    public double BlastRadius { get; set; } = 2.5;

    [BindProperty]
    public bool AffectedByWind { get; set; } = true;

    [BindProperty]
    public double FuseSeconds { get; set; } = 3;

    [BindProperty]
    public int ClusterCount { get; set; } = 4;

    [BindProperty]
    public int Pellets { get; set; } = 3;

    [BindProperty]
    public int AmmoPerMatch { get; set; } = -1;

    [BindProperty]
    public int SortOrder { get; set; } = 100;

    [BindProperty]
    public bool IsEnabled { get; set; } = true;

    public bool IsNew => Id == 0;

    public IReadOnlyList<Choice> Kinds { get; } =
    [
        new(nameof(WeaponKind.Projectile), WeaponLogic.KindName(WeaponKind.Projectile), "fliegt, explodiert beim Aufschlag"),
        new(nameof(WeaponKind.Grenade), WeaponLogic.KindName(WeaponKind.Grenade), "springt, explodiert nach dem Zünder"),
        new(nameof(WeaponKind.Cluster), WeaponLogic.KindName(WeaponKind.Cluster), "platzt in Bomblets"),
        new(nameof(WeaponKind.Hitscan), WeaponLogic.KindName(WeaponKind.Hitscan), "gerade Linie, sofort"),
        new(nameof(WeaponKind.Airstrike), WeaponLogic.KindName(WeaponKind.Airstrike), "Bomben von oben aufs Ziel"),
    ];

    public async Task<IActionResult> OnGetAsync()
    {
        if (IsNew)
        {
            return Page();
        }

        var weapon = await WeaponLogic.GetAsync(Db, Me, Id);
        if (weapon is null)
        {
            return NotFound();
        }

        Name = weapon.Name;
        Description = weapon.Description;
        Kind = weapon.Kind;
        Damage = weapon.Damage;
        BlastRadius = weapon.BlastRadius;
        AffectedByWind = weapon.AffectedByWind;
        FuseSeconds = weapon.FuseSeconds;
        ClusterCount = weapon.ClusterCount;
        Pellets = weapon.Pellets;
        AmmoPerMatch = weapon.AmmoPerMatch;
        SortOrder = weapon.SortOrder;
        IsEnabled = weapon.IsEnabled;
        return Page();
    }

    public async Task<IActionResult> OnPostAsync()
        => await TryAsync(async () =>
        {
            var id = await WeaponLogic.SaveAsync(Db, Me, new WeaponInput(Id, Name, Description ?? string.Empty, Kind, Damage, BlastRadius, AffectedByWind, FuseSeconds, ClusterCount,
                Pellets, AmmoPerMatch, SortOrder, IsEnabled));
            Flash(IsNew ? "Die Waffe wurde angelegt." : "Gespeichert.");
            return RedirectToPage(new { id });
        });

    public async Task<IActionResult> OnPostDeleteAsync()
        => await TryAsync(async () =>
        {
            await WeaponLogic.DeleteAsync(Db, Me, Id);
            Flash("Die Waffe wurde gelöscht.");
            return RedirectToPage("Index");
        });
}
