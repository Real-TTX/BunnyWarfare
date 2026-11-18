using BunnyWarfare.Business;
using BunnyWarfare.Data;
using MatGame.Sdk.Web;

namespace BunnyWarfare.Pages.Admin.Players;

public sealed class IndexModel(AppDbContext db) : AppPageModel(db)
{
    public IReadOnlyList<PlayerRow> Items { get; private set; } = [];

    public ToolbarModel Toolbar { get; private set; } = null!;

    public PagerModel Pager { get; private set; } = null!;

    public async Task OnGetAsync()
    {
        var request = ReadList(["kind"]);
        var result = await PlayerLogic.ListAsync(Db, Me, request);
        Items = result.Items;
        Toolbar = new ToolbarModel
        {
            Id = "players", Action = "/Admin/BunnyWarfare/Players", Label = "Spieler", Search = request.Search, SearchField = true, SearchPlaceholder = "Name oder Team",
            Filters =
            [
                new FilterField("kind", "Art", [new FilterOption("account", "Konto"), new FilterOption("guest", "Gast")], request.Filter("kind")),
            ],
            SortOptions = [new SortOption("name", "Name"), new SortOption("seen", "Zuletzt gesehen"), new SortOption("games", "Spiele"), new SortOption("wins", "Siege"), new SortOption("level", "Level")],
            Sort = request.Sort, Descending = request.Descending, DefaultSort = "name",
            Total = result.Total, Matching = result.Matching, Noun = "Spieler", NounOne = "Spieler",
        };
        Pager = BuildPager(Toolbar, request.Page, request.PageSize, result.Matching);
    }
}
