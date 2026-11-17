using System.Globalization;
using BunnyWarfare.Business;
using BunnyWarfare.Data;
using BunnyWarfare.Web;

namespace BunnyWarfare.Pages.Admin.Matches;

public sealed class IndexModel(AppDbContext db) : AppPageModel(db)
{
    public IReadOnlyList<MatchAdminRow> Items { get; private set; } = [];

    public ToolbarModel Toolbar { get; private set; } = null!;

    public PagerModel Pager { get; private set; } = null!;

    public string Tone(MatchStatus status) => status switch
    {
        MatchStatus.Lobby => "mat-pill--ok",
        MatchStatus.Running => "mat-pill--warn",
        MatchStatus.Finished => "mat-pill--accent",
        _ => "mat-pill--plain",
    };

    public async Task OnGetAsync()
    {
        var request = ReadList(["status", "world"], 25, defaultDescending: true);
        var result = await MatchLogic.AdminListAsync(Db, Me, request);
        var worlds = await WorldLogic.ListEnabledAsync(Db, Me);
        Items = result.Items;
        Toolbar = new ToolbarModel
        {
            Id = "matches", Action = "/Admin/Matches", Label = "Spiele", Search = request.Search, SearchField = true, SearchPlaceholder = "Spiel, Gastgeber oder Welt",
            Filters =
            [
                new FilterField("status", "Status", Enum.GetValues<MatchStatus>().Select(s => new FilterOption(s.ToString(), MatchLogic.StatusName(s))).ToList(), request.Filter("status")),
                new FilterField("world", "Welt", worlds.Select(w => new FilterOption(w.Id.ToString(CultureInfo.InvariantCulture), w.Name)).ToList(), request.Filter("world")),
            ],
            SortOptions = [new SortOption("created", "Erstellt"), new SortOption("name", "Name"), new SortOption("start", "Start"), new SortOption("end", "Ende")],
            Sort = request.Sort, Descending = request.Descending, DefaultSort = "created", DefaultDescending = true,
            Total = result.Total, Matching = result.Matching, Noun = "Spiele", NounOne = "Spiel",
        };
        Pager = BuildPager(Toolbar, request.Page, request.PageSize, result.Matching);
    }
}
