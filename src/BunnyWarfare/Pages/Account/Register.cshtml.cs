using BunnyWarfare.Business;
using BunnyWarfare.Data;
using BunnyWarfare.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Mvc;

namespace BunnyWarfare.Pages.Account;

public sealed class RegisterModel(AppDbContext db) : AppPageModel(db)
{
    [BindProperty]
    public string DisplayName { get; set; } = string.Empty;

    [BindProperty]
    public string LoginName { get; set; } = string.Empty;

    [BindProperty]
    public string Password { get; set; } = string.Empty;

    public bool Allowed { get; private set; }

    public bool First { get; private set; }

    private async Task LoadAsync()
    {
        Allowed = await PlayerLogic.CanRegisterAsync(Db);
        First = !await PlayerLogic.HasAnyAsync(Db);
    }

    public async Task OnGetAsync() => await LoadAsync();

    public async Task<IActionResult> OnPostAsync()
        => await TryAsync(async () =>
        {
            var player = await PlayerLogic.RegisterAsync(Db, LoginName, DisplayName, Password);
            await HttpContext.SignInAsync(Identity.Scheme, Identity.ToPrincipal(player), new AuthenticationProperties { IsPersistent = true });
            Flash(player.Role == PlayerRole.Admin ? "Willkommen! Du bist der Administrator dieses Servers." : $"Willkommen, {player.DisplayName}!");
            return Redirect("/");
        }, LoadAsync);
}
