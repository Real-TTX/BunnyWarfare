using BunnyWarfare.Web;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace BunnyWarfare.Pages;

/// <summary>
/// The player app (/ and /Play/{token}): one page with the 3D scene, the menus and the HUD. Everything else comes from /api and /hub/game;
/// the page itself reads nothing from the database (signed in or not, it is the same shell).
/// </summary>
[AllowAnonymous]
public sealed class AppModel : PageModel
{
    public string Version => AppInfo.Version;

    /// <summary>The match of the address /Play/{token} (null on /).</summary>
    public Guid? Token { get; private set; }

    public void OnGet(Guid? token) => Token = token;
}
