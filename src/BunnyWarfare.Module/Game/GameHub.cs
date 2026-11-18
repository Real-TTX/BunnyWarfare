using BunnyWarfare.Business;
using BunnyWarfare.Data;
using BunnyWarfare.Web;
using MatGame.Sdk;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;

namespace BunnyWarfare.Game;

/// <summary>
/// The real-time connection of the game (/bunnywarfare/hub). Every method checks who calls (the MatGame account: cookie in the browser, device token in the app) and what they may do;
/// the rules themselves are in <see cref="MatchRoom"/> and the business layer. Errors reach the browser as a message (HubException).
/// </summary>
[Authorize(AuthenticationSchemes = GameAccounts.AnyScheme)]
public sealed class GameHub(AppDbContext db, RoomRegistry registry, ILogger<GameHub> logger) : Hub
{
    private Actor Me => Players.ActorOf(Context.User!) ?? throw new HubException("Bitte zuerst anmelden.");

    public async Task<RoomDto> Join(string token)
    {
        return await Guarded(async () =>
        {
            var actor = Me;
            if (!Guid.TryParse(token, out var id))
            {
                throw new BusinessException("Diesen Link gibt es nicht.");
            }

            var room = registry.Find(id);
            if (room is null)
            {
                var match = await MatchLogic.GetByTokenAsync(db, actor, id) ?? throw new BusinessException("Dieses Spiel gibt es nicht.");
                if (match.Status != MatchStatus.Lobby)
                {
                    // a match that is over (or was lost with a restart of the server): only its result
                    return Archived(match);
                }

                room = registry.GetOrAdd(match, match.World!);
            }

            var player = await PlayerLogic.EnsureAsync(db, actor, Players.IsGuest(Context.User!)) ?? throw new AccessDeniedException("Dein Spieler wurde aus BunnyWarfare entfernt.");
            using (await room.LockAsync())
            {
                room.Connections[Context.ConnectionId] = actor.PlayerId;
                room.LastActivity = DateTime.UtcNow;
                registry.Attach(Context.ConnectionId, room.Token);
                await Groups.AddToGroupAsync(Context.ConnectionId, room.Token.ToString());
                var messages = room.SeatPlayer(player);
                if (messages.Count == 0 && room.Status == MatchStatus.Lobby)
                {
                    messages.Add(new Outgoing("Room", room.ToDto()));
                }

                await registry.SendAsync(room, messages);
                return room.ToDto();
            }
        });
    }

    public Task AddBot(string level)
        => InRoom((room, actor) => room.AddBot(actor.PlayerId, Enum.TryParse<BotLevel>(level, true, out var l) ? l : BotLevel.Normal));

    public Task RemoveTeam(int teamIndex) => InRoom((room, actor) => room.RemoveSlot(actor.PlayerId, teamIndex));

    public async Task Start()
    {
        await Guarded(async () =>
        {
            var actor = Me;
            var room = CurrentRoom();
            using (await room.LockAsync())
            {
                var teams = room.TeamsForStart(actor.PlayerId);
                var weapons = await WeaponLogic.ListForGameAsync(db);
                if (weapons.Count == 0)
                {
                    throw new BusinessException("Es gibt keine Waffen – die Administration muss welche anlegen.");
                }

                await MatchLogic.StartAsync(db, actor, room.MatchId, teams);
                var messages = room.StartGame(weapons, DateTime.UtcNow);
                logger.LogInformation("Match {Match} started with {Teams} teams on {World}", room.MatchId, teams.Count, room.World.Name);
                await registry.SendAsync(room, messages);
            }

            return true;
        });
    }

    public Task Move(double x, double z, double yaw) => InRoom((room, actor) => room.Move(actor.PlayerId, Context.ConnectionId, x, z, yaw), toOthers: true);

    public Task AimAt(double yaw, double pitch, long weaponId) => InRoom((room, actor) => room.AimAt(actor.PlayerId, yaw, pitch, weaponId), toOthers: true);

    public Task Fire(long weaponId, double yaw, double pitch, double power, double targetX, double targetZ)
        => InRoom((room, actor) => room.Fire(actor.PlayerId, weaponId, new Aim(yaw, pitch, power, targetX, targetZ), DateTime.UtcNow));

    public Task SkipTurn() => InRoom((room, actor) => room.SkipTurn(actor.PlayerId, DateTime.UtcNow));

    public Task Surrender() => InRoom((room, actor) => room.Surrender(actor.PlayerId, DateTime.UtcNow));

    public Task Chat(string text)
        => InRoom((room, actor) => string.IsNullOrWhiteSpace(text) ? [] : [room.Chat(actor.PlayerId, text)]);

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        if (registry.Detach(Context.ConnectionId) is { } token && registry.Find(token) is { } room)
        {
            using (await room.LockAsync())
            {
                room.Connections.Remove(Context.ConnectionId, out var playerId);
                room.LastActivity = DateTime.UtcNow;
                if (room.Status == MatchStatus.Lobby)
                {
                    // a player who leaves the lobby frees the seat (the host keeps theirs)
                    var slot = room.Slots.FirstOrDefault(s => s.PlayerId == playerId);
                    if (slot is not null && playerId != room.HostPlayerId && !room.IsConnected(playerId))
                    {
                        room.Slots.Remove(slot);
                    }

                    await registry.SendAsync(room, [new Outgoing("Room", room.ToDto())]);
                }
            }
        }

        await base.OnDisconnectedAsync(exception);
    }

    private MatchRoom CurrentRoom()
        => registry.RoomOf(Context.ConnectionId) is { } token && registry.Find(token) is { } room ? room : throw new BusinessException("Du bist in keinem Spiel.");

    /// <summary>Runs a change of the room under its lock and sends what it says (moves and aims only to the others: the sender already shows them).</summary>
    private async Task InRoom(Func<MatchRoom, Actor, List<Outgoing>> change, bool toOthers = false)
    {
        await Guarded(async () =>
        {
            var actor = Me;
            var room = CurrentRoom();
            using (await room.LockAsync())
            {
                var messages = change(room, actor);
                if (toOthers)
                {
                    var group = room.Token.ToString();
                    foreach (var m in messages)
                    {
                        if (m.OnlyConnection is not null)
                        {
                            await Clients.Client(m.OnlyConnection).SendAsync(m.Method, m.Payload);
                        }
                        else if (m.ToAll)
                        {
                            await Clients.Group(group).SendAsync(m.Method, m.Payload);
                        }
                        else
                        {
                            await Clients.OthersInGroup(group).SendAsync(m.Method, m.Payload);
                        }
                    }
                }
                else
                {
                    await registry.SendAsync(room, messages);
                }
            }

            return true;
        });
    }

    private static async Task<T> Guarded<T>(Func<Task<T>> action)
    {
        try
        {
            return await action();
        }
        catch (BusinessException e)
        {
            throw new HubException(e.Message);
        }
        catch (AccessDeniedException e)
        {
            throw new HubException(e.Message);
        }
    }

    private static RoomDto Archived(Match match)
    {
        var teams = match.Teams.OrderBy(t => t.Placement == 0 ? int.MaxValue : t.Placement)
            .Select(t => new TeamResultDto(t.TeamIndex, t.TeamName, t.TeamColor, t.Placement, t.Kills, t.DamageDealt, t.IsBot, t.Fur, t.Outfit, t.Face, t.Frame, 0, t.XpGained, 0, 0, []))
            .ToList();
        var winner = match.Teams.FirstOrDefault(t => t.TeamIndex == match.WinnerTeamIndex);
        var aborted = match.Status != MatchStatus.Finished;
        var result = new ResultDto(winner?.TeamIndex, winner?.TeamName, aborted, teams);
        var status = match.Status == MatchStatus.Running ? MatchStatus.Aborted : match.Status;
        return new RoomDto(match.Token.ToString(), match.Name, status.ToString(), match.HostPlayerId, match.World?.Name ?? string.Empty, (match.World?.Theme ?? WorldTheme.Meadow).ToString(),
            match.MaxTeams, match.BunniesPerTeam, match.BunnyHealth, match.TurnSeconds, [], null, result, (int)match.CrateRate, Business.MatchLogic.CrateRateName(match.CrateRate));
    }
}
