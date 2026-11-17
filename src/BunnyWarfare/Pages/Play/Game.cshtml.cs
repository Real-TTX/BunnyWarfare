using BunnyWarfare.Business;
using BunnyWarfare.Data;
using Microsoft.AspNetCore.Mvc;

namespace BunnyWarfare.Pages.Play;

/// <summary>
/// The game itself (/Play/{token}): a page of its own (3D scene and HUD, no menu). Everything after the first load runs over the hub (/hub/game);
/// the page only checks that the match exists and hands the browser who is playing.
/// </summary>
public sealed class GameModel(AppDbContext db) : AppPageModel(db)
{
    public Guid Token { get; private set; }

    public string MatchName { get; private set; } = string.Empty;

    /// <summary>Started from "Quick match": the browser adds a bot and starts at once.</summary>
    public bool Quick { get; private set; }

    public async Task<IActionResult> OnGetAsync(Guid token, int? quick)
    {
        var match = await MatchLogic.GetByTokenAsync(Db, Me, token);
        if (match is null)
        {
            return NotFound();
        }

        Token = token;
        MatchName = match.Name;
        Quick = quick == 1;
        return Page();
    }
}
