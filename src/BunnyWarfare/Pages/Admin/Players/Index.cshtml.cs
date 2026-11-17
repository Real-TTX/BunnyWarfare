using BunnyWarfare.Business;
using BunnyWarfare.Data;
using BunnyWarfare.Web;

namespace BunnyWarfare.Pages.Admin.Players;

public sealed class IndexModel(AppDbContext db) : AppPageModel(db)
{
    public IReadOnlyList<PlayerRow> Items { get; private set; } = [];

    public ToolbarModel Toolbar { get; private set; } = null!;

    public PagerModel Pager { get; private set; } = null!;

    public async Task OnGetAsync()
    {
        var request = ReadList(["role", "status"]);
        var result = await PlayerLogic.ListAsync(Db, Me, request);
        Items = result.Items;
        Toolbar = new ToolbarModel
        {
            Id = "players", Action = "/Admin/Players", Label = "Spieler", Search = request.Search, SearchField = true, SearchPlaceholder = "Name, Anmeldename oder Team",
            Filters =
            [
                new FilterField("role", "Rolle", [new FilterOption("admin", "Administrator"), new FilterOption("player", "Spieler")], request.Filter("role")),
                new FilterField("status", "Status", [new FilterOption("active", "Aktiv"), new FilterOption("disabled", "Gesperrt")], request.Filter("status")),
            ],
            SortOptions = [new SortOption("name", "Name"), new SortOption("login", "Letzte Anmeldung"), new SortOption("games", "Spiele"), new SortOption("wins", "Siege"), new SortOption("level", "Level")],
            Sort = request.Sort, Descending = request.Descending, DefaultSort = "name",
            Total = result.Total, Matching = result.Matching, Noun = "Spieler", NounOne = "Spieler",
        };
        Pager = BuildPager(Toolbar, request.Page, request.PageSize, result.Matching);
    }
}
