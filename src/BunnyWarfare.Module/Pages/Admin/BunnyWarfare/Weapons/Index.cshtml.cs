using BunnyWarfare.Business;
using BunnyWarfare.Data;
using BunnyWarfare.Web;
using MatGame.Sdk.Web;

namespace BunnyWarfare.Pages.Admin.Weapons;

public sealed class IndexModel(AppDbContext db) : AppPageModel(db)
{
    public IReadOnlyList<WeaponRow> Items { get; private set; } = [];

    public ToolbarModel Toolbar { get; private set; } = null!;

    public PagerModel Pager { get; private set; } = null!;

    public async Task OnGetAsync()
    {
        var request = ReadList(["kind", "status"]);
        var result = await WeaponLogic.ListAsync(Db, Me, request);
        Items = result.Items;
        Toolbar = new ToolbarModel
        {
            Id = "weapons", Action = "/Admin/BunnyWarfare/Weapons", Label = "Waffen", Search = request.Search, SearchField = true, SearchPlaceholder = "Name oder Beschreibung",
            Filters =
            [
                new FilterField("kind", "Art", Enum.GetValues<WeaponKind>().Select(k => new FilterOption(k.ToString(), WeaponLogic.KindName(k))).ToList(), request.Filter("kind")),
                new FilterField("status", "Status", [new FilterOption("enabled", "Aktiv"), new FilterOption("disabled", "Aus")], request.Filter("status")),
            ],
            SortOptions = [new SortOption("order", "Reihenfolge"), new SortOption("name", "Name"), new SortOption("damage", "Schaden"), new SortOption("radius", "Radius")],
            Sort = request.Sort, Descending = request.Descending, DefaultSort = "order",
            Total = result.Total, Matching = result.Matching, Noun = "Waffen", NounOne = "Waffe",
        };
        Pager = BuildPager(Toolbar, request.Page, request.PageSize, result.Matching);
    }
}
