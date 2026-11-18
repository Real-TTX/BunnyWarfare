using BunnyWarfare.Business;
using BunnyWarfare.Data;
using BunnyWarfare.Game;

namespace BunnyWarfare.Pages.Admin;

public sealed record LiveRoom(long MatchId, Guid Token, string Name, MatchStatus Status, string World, int Teams, int Connections, int Turn);

public sealed class IndexModel(AppDbContext db, RoomRegistry registry) : AppPageModel(db)
{
    public DashboardNumbers Numbers { get; private set; } = null!;

    public int Online => registry.OnlineConnections;

    public int RoomsInMemory { get; private set; }

    public IReadOnlyList<LiveRoom> Rooms { get; private set; } = [];

    public async Task OnGetAsync()
    {
        Numbers = await MatchLogic.DashboardAsync(Db, Me);
        var rooms = registry.Rooms;
        RoomsInMemory = rooms.Count;
        Rooms = rooms.Where(r => r.Status is MatchStatus.Lobby or MatchStatus.Running)
            .OrderByDescending(r => r.Status).ThenBy(r => r.Name)
            .Select(r => new LiveRoom(r.MatchId, r.Token, r.Name, r.Status, r.World.Name, r.Slots.Count, r.Connections.Count, r.Game?.TurnNumber ?? 0))
            .ToList();
    }
}
