using BunnyWarfare.Business;
using BunnyWarfare.Data;
using MatGame.Sdk;
using Microsoft.AspNetCore.Mvc;

namespace BunnyWarfare.Pages.Admin;

/// <summary>Takes over the database of an old stand-alone BunnyWarfare server (accounts, players, worlds, weapons, finished matches).</summary>
public sealed class ImportModel(AppDbContext db, IGameAccounts accounts) : AppPageModel(db)
{
    [BindProperty]
    public string? ConnectionString { get; set; }

    public ImportReport? Report { get; private set; }

    public void OnGet() => Guard.Admin(Me);

    public async Task<IActionResult> OnPostAsync(CancellationToken ct)
        => await TryAsync(async () =>
        {
            Report = await ImportLogic.ImportAsync(Db, Me, accounts, ConnectionString ?? string.Empty, onlyOnce: false, ct);
            Flash(Report.Summary);
            return RedirectToPage();
        });
}
