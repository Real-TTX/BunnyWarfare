using BunnyWarfare.Business;
using BunnyWarfare.Data;
using BunnyWarfare.Web;

namespace BunnyWarfare.Pages.Leaderboard;

public sealed class IndexModel(AppDbContext db) : AppPageModel(db)
{
    public IReadOnlyList<LeaderboardRow> Items { get; private set; } = [];

    public ToolbarModel Toolbar { get; private set; } = null!;

    public PagerModel Pager { get; private set; } = null!;

    public async Task OnGetAsync()
    {
        var request = ReadList(["played"], 25);
        var result = await PlayerLogic.LeaderboardAsync(Db, Me, request);
        Items = result.Items;
        Toolbar = new ToolbarModel
        {
            Id = "ranks", Action = "/Leaderboard", Label = "Rangliste", Search = request.Search, SearchField = true, SearchPlaceholder = "Spieler oder Team suchen",
            Filters = [new FilterField("played", "Spiele", [new FilterOption("yes", "Nur wer schon gespielt hat")], request.Filter("played"))],
            SortOptions = [new SortOption("rank", "Rang"), new SortOption("name", "Name"), new SortOption("games", "Spiele"), new SortOption("kills", "Treffer"), new SortOption("damage", "Schaden")],
            Sort = request.Sort, Descending = request.Descending, DefaultSort = "rank",
            Total = result.Total, Matching = result.Matching, Noun = "Spieler", NounOne = "Spieler",
        };
        Pager = BuildPager(Toolbar, request.Page, request.PageSize, result.Matching);
    }
}
