using BunnyWarfare.Data;
using BunnyWarfare.Web;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Mvc;

namespace BunnyWarfare.Pages.Account;

public sealed class LogoutModel(AppDbContext db) : AppPageModel(db)
{
    public IActionResult OnGet() => Redirect("/");

    public async Task<IActionResult> OnPostAsync()
    {
        await HttpContext.SignOutAsync(Identity.Scheme);
        return Redirect("/Account/Login");
    }
}
