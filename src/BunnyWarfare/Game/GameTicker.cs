using BunnyWarfare.Business;
using BunnyWarfare.Data;

namespace BunnyWarfare.Game;

/// <summary>
/// The clock of all matches: ends turns whose time ran out, lets the bots shoot, starts the next turn after a shot, saves the outcome of finished matches
/// and forgets rooms nobody looks at any more.
/// </summary>
public sealed class GameTicker(RoomRegistry registry, IServiceScopeFactory scopes, ILogger<GameTicker> logger) : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromMilliseconds(150);
    private static readonly TimeSpan EmptyLobbyLifetime = TimeSpan.FromMinutes(30);
    private static readonly TimeSpan EmptyGameLifetime = TimeSpan.FromMinutes(3);
    private static readonly TimeSpan FinishedLifetime = TimeSpan.FromMinutes(10);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(Interval);
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            foreach (var room in registry.Rooms)
            {
                try
                {
                    await TickAsync(room);
                }
                catch (Exception e)
                {
                    logger.LogError(e, "Tick of match {Match} failed", room.MatchId);
                }
            }
        }
    }

    private async Task TickAsync(MatchRoom room)
    {
        var now = DateTime.UtcNow;
        bool save;
        using (await room.LockAsync())
        {
            var messages = room.Tick(now);

            // a running match without anyone watching ends after a while (the bots do not play alone forever)
            if (room.Status == MatchStatus.Running && room.Connections.Count == 0 && now - room.LastActivity > EmptyGameLifetime)
            {
                messages.AddRange(room.Abort("Alle Spieler sind gegangen – das Spiel wurde beendet."));
                room.NeedsSaving = true;
            }

            if (messages.Count > 0)
            {
                await registry.SendAsync(room, messages);
            }

            save = room.NeedsSaving;
            room.NeedsSaving = false;
        }

        if (save)
        {
            await SaveAsync(room);
        }

        var idle = now - room.LastActivity;
        var forget = room.Connections.Count == 0 && room.Status switch
        {
            MatchStatus.Lobby => idle > EmptyLobbyLifetime,
            MatchStatus.Finished or MatchStatus.Aborted => idle > TimeSpan.FromSeconds(20),
            _ => false,
        };
        if (forget || (room.Status is MatchStatus.Finished or MatchStatus.Aborted && idle > FinishedLifetime))
        {
            registry.Remove(room.Token);
        }
    }

    private async Task SaveAsync(MatchRoom room)
    {
        using var scope = scopes.CreateScope();
        var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
        await MatchLogic.FinishAsync(db, Actor.System, room.MatchId, room.Game?.WinnerTeam, room.Game?.TurnNumber ?? 0, room.Outcomes(), room.Status == MatchStatus.Aborted);
        logger.LogInformation("Match {Match} saved ({Status})", room.MatchId, room.Status);
    }
}

/// <summary>Ends a match from the administration: in memory (the browsers are told) and in the database.</summary>
public static class MatchControl
{
    public static async Task AbortAsync(AppDbContext db, Actor actor, RoomRegistry registry, long matchId, Guid token)
    {
        await MatchLogic.AbortAsync(db, actor, matchId);
        if (registry.Find(token) is { } room)
        {
            using (await room.LockAsync())
            {
                await registry.SendAsync(room, room.Abort("Das Spiel wurde von der Administration beendet."));
                room.NeedsSaving = false;
            }
        }
    }
}
