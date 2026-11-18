using BunnyWarfare.Business;
using BunnyWarfare.Data;
using BunnyWarfare.Web;
using MatGame.Sdk.Web;

namespace BunnyWarfare.Pages.Admin.Worlds;

public sealed class IndexModel(AppDbContext db) : AppPageModel(db)
{
    public IReadOnlyList<WorldRow> Items { get; private set; } = [];

    public ToolbarModel Toolbar { get; private set; } = null!;

    public PagerModel Pager { get; private set; } = null!;

    public async Task OnGetAsync()
    {
        var request = ReadList(["theme", "status"]);
        var result = await WorldLogic.ListAsync(Db, Me, request);
        Items = result.Items;
        Toolbar = new ToolbarModel
        {
            Id = "worlds", Action = "/Admin/BunnyWarfare/Worlds", Label = "Welten", Search = request.Search, SearchField = true, SearchPlaceholder = "Name oder Beschreibung",
            Filters =
            [
                new FilterField("theme", "Thema", Enum.GetValues<WorldTheme>().Select(t => new FilterOption(t.ToString(), WorldLogic.ThemeName(t))).ToList(), request.Filter("theme")),
                new FilterField("status", "Status", [new FilterOption("enabled", "Aktiv"), new FilterOption("disabled", "Aus")], request.Filter("status")),
            ],
            SortOptions = [new SortOption("name", "Name"), new SortOption("size", "Größe"), new SortOption("gravity", "Schwerkraft")],
            Sort = request.Sort, Descending = request.Descending, DefaultSort = "name",
            Total = result.Total, Matching = result.Matching, Noun = "Welten", NounOne = "Welt",
        };
        Pager = BuildPager(Toolbar, request.Page, request.PageSize, result.Matching);
    }
}
