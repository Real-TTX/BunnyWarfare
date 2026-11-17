using BunnyWarfare.Business;
using BunnyWarfare.Data;
using BunnyWarfare.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Mvc;

namespace BunnyWarfare.Pages.Account;

public sealed class LoginModel(AppDbContext db) : AppPageModel(db)
{
    [BindProperty]
    public string LoginName { get; set; } = string.Empty;

    [BindProperty]
    public string Password { get; set; } = string.Empty;

    [BindProperty(SupportsGet = true)]
    public string? ReturnUrl { get; set; }

    public bool CanRegister { get; private set; }

    public async Task<IActionResult> OnGetAsync()
    {
        // a fresh server has no account yet: the first one is made on the registration (and becomes the administrator)
        if (!await PlayerLogic.HasAnyAsync(Db))
        {
            return RedirectToPage("/Account/Register");
        }

        CanRegister = await PlayerLogic.CanRegisterAsync(Db);
        return Page();
    }

    public async Task<IActionResult> OnPostAsync()
    {
        CanRegister = await PlayerLogic.CanRegisterAsync(Db);
        var player = await PlayerLogic.SignInAsync(Db, LoginName, Password);
        if (player is null)
        {
            ModelState.AddModelError(nameof(LoginName), "Anmeldename oder Passwort stimmen nicht.");
            return Page();
        }

        await HttpContext.SignInAsync(Identity.Scheme, Identity.ToPrincipal(player), new AuthenticationProperties { IsPersistent = true });
        return LocalRedirect(Url.IsLocalUrl(ReturnUrl) ? ReturnUrl! : "/");
    }
}
