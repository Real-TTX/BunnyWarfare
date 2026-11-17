using System.Security.Claims;
using BunnyWarfare.Business;
using BunnyWarfare.Data;

namespace BunnyWarfare.Web;

/// <summary>The cookie of the sign-in: what it carries about the player, and the <see cref="Actor"/> the business layer gets.</summary>
public static class Identity
{
    public const string Scheme = "BunnyWarfare";
    public const string AdminRole = "Admin";

    public static ClaimsPrincipal ToPrincipal(Player player)
    {
        var claims = new List<Claim>
        {
            new(ClaimTypes.NameIdentifier, player.Id.ToString(System.Globalization.CultureInfo.InvariantCulture)),
            new(ClaimTypes.Name, player.DisplayName),
            new("login", player.LoginName),
        };
        if (player.Role == PlayerRole.Admin)
        {
            claims.Add(new Claim(ClaimTypes.Role, AdminRole));
        }

        return new ClaimsPrincipal(new ClaimsIdentity(claims, Scheme));
    }

    public static Actor? ToActor(ClaimsPrincipal user)
    {
        if (user.Identity?.IsAuthenticated != true || !long.TryParse(user.FindFirstValue(ClaimTypes.NameIdentifier), out var id))
        {
            return null;
        }

        return new Actor(id, user.FindFirstValue(ClaimTypes.Name) ?? "?", user.IsInRole(AdminRole));
    }
}
