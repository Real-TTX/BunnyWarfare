using BunnyWarfare.Business;
using BunnyWarfare.Data;
using Microsoft.AspNetCore.Mvc;

namespace BunnyWarfare.Pages.Account;

public sealed class SecurityModel(AppDbContext db) : AppPageModel(db)
{
    [BindProperty]
    public string CurrentPassword { get; set; } = string.Empty;

    [BindProperty]
    public string NewPassword { get; set; } = string.Empty;

    public void OnGet()
    {
    }

    public async Task<IActionResult> OnPostAsync()
        => await TryAsync(async () =>
        {
            await PlayerLogic.ChangePasswordAsync(Db, Me, CurrentPassword, NewPassword);
            Flash("Das Passwort wurde geändert.");
            return RedirectToPage();
        });
}
