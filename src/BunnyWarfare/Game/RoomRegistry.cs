using System.Collections.Concurrent;
using BunnyWarfare.Data;
using Microsoft.AspNetCore.SignalR;

namespace BunnyWarfare.Game;

/// <summary>The matches in memory (lobbies and running games) and which browser sits in which.</summary>
public sealed class RoomRegistry(IHubContext<GameHub> hub)
{
    private readonly ConcurrentDictionary<Guid, MatchRoom> _rooms = new();
    private readonly ConcurrentDictionary<string, Guid> _connections = new();

    public IReadOnlyCollection<MatchRoom> Rooms => _rooms.Values.ToList();

    /// <summary>Browsers connected to a match right now.</summary>
    public int OnlineConnections => _connections.Count;

    public MatchRoom? Find(Guid token) => _rooms.TryGetValue(token, out var room) ? room : null;

    public MatchRoom GetOrAdd(Match match, World world) => _rooms.GetOrAdd(match.Token, _ => new MatchRoom(match, world));

    public void Remove(Guid token) => _rooms.TryRemove(token, out _);

    public void Attach(string connectionId, Guid token) => _connections[connectionId] = token;

    public Guid? Detach(string connectionId) => _connections.TryRemove(connectionId, out var token) ? token : null;

    public Guid? RoomOf(string connectionId) => _connections.TryGetValue(connectionId, out var token) ? token : null;

    /// <summary>Sends the messages of a room in their order: to the whole group, or to one browser.</summary>
    public async Task SendAsync(MatchRoom room, IEnumerable<Outgoing> messages)
    {
        var group = room.Token.ToString();
        foreach (var m in messages)
        {
            var target = m.OnlyConnection is null ? hub.Clients.Group(group) : hub.Clients.Client(m.OnlyConnection);
            await target.SendAsync(m.Method, m.Payload);
        }
    }
}
