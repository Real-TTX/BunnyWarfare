using BunnyWarfare.Business;
using BunnyWarfare.Data;
using BunnyWarfare.Game;
using BunnyWarfare.Web;

namespace BunnyWarfare.Pages.Play;

public sealed class IndexModel(AppDbContext db, RoomRegistry registry) : AppPageModel(db)
{
    public IReadOnlyList<OpenMatchRow> Items { get; private set; } = [];

    public ToolbarModel Toolbar { get; private set; } = null!;

    public PagerModel Pager { get; private set; } = null!;

    /// <summary>The seats taken in a lobby right now (from memory; null when nobody has opened it since the start of the server).</summary>
    public int? SeatsTaken(Guid token) => registry.Find(token)?.Slots.Count;

    public async Task OnGetAsync()
    {
        var request = ReadList(["status", "world"], 20, defaultDescending: true);
        var result = await MatchLogic.OpenListAsync(Db, Me, request);
        var worlds = await WorldLogic.ListEnabledAsync(Db, Me);
        Items = result.Items;
        Toolbar = new ToolbarModel
        {
            Id = "open", Action = "/Play", Label = "Offene Spiele", Search = request.Search, SearchField = true, SearchPlaceholder = "Spiel, Gastgeber oder Welt",
            Filters =
            [
                new FilterField("status", "Status", [new FilterOption("lobby", "Lobby"), new FilterOption("running", "Läuft"), new FilterOption("mine", "Meine")], request.Filter("status")),
                new FilterField("world", "Welt", worlds.Select(w => new FilterOption(w.Id.ToString(System.Globalization.CultureInfo.InvariantCulture), w.Name)).ToList(), request.Filter("world")),
            ],
            SortOptions = [new SortOption("created", "Erstellt"), new SortOption("name", "Name"), new SortOption("world", "Welt")],
            Sort = request.Sort, Descending = request.Descending, DefaultSort = "created", DefaultDescending = true,
            Total = result.Total, Matching = result.Matching, Noun = "Spiele", NounOne = "Spiel",
        };
        Pager = BuildPager(Toolbar, request.Page, request.PageSize, result.Matching);
    }
}
