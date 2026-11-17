# The game protocol (SignalR, `/hub/game`)

The browser connects with the cookie of the sign-in (the hub is `[Authorize]`). JSON, names in camelCase. The server is authoritative: it simulates every shot
(`Game/Simulation.cs`), the browsers only play what it sends. The DTOs are in `src/BunnyWarfare/Game/Dtos.cs`.

## Browser → server

| Method | Arguments | Who | What |
|---|---|---|---|
| `Join(token)` | the token of the match (from the link `/Play/{token}`) | everyone with the link | Enters the room, takes a seat in the lobby when one is free; returns `RoomDto`. A finished match returns only its `result`. |
| `AddBot(level)` | `Easy` \| `Normal` \| `Hard` | host, lobby | A computer team. |
| `RemoveTeam(teamIndex)` | | host (others), a player (themselves), lobby | |
| `Start()` | | host, lobby, ≥ 2 teams | Saves the teams, builds the island, places the bunnies, first turn. |
| `Move(x, z, yaw)` | feet position, facing | the player of the turn (Aiming, Retreat) | ≤ 1.6 m per message, within the stamina, not into water, not up steep walls; else a correction to the sender only. |
| `AimAt(yaw, pitch, weaponId)` | | the player of the turn | Relayed to the others (spectators see the aim). |
| `Fire(weaponId, yaw, pitch, power, targetX, targetZ)` | radians, power 0..1, target only for the airstrike | the player of the turn (Aiming) | Simulates the shot, sends `Shot`. |
| `SkipTurn()` | | the player of the turn | |
| `Surrender()` | | a player of the match | All their bunnies leave the island. |
| `Chat(text)` | ≤ 200 characters | everyone in the room | |

Errors (not your turn, no ammo ...) arrive as a `HubException` with a German message.

## Server → browser

| Message | Payload | When |
|---|---|---|
| `Room` | `RoomDto` (lobby, and on start the whole `GameDto` with the height map) | lobby changes, start |
| `Turn` | `TurnUpdateDto` (turn, all bunnies, all teams) | a new turn, the retreat after a shot, a correction after a surrender — the browser snaps to it |
| `Moved` | `MovedDto` (`correction = true`: snap your own bunny back) | the bunny of the turn walked |
| `Aim` | `AimDto` | the player of the turn aims (or a bot) |
| `Shot` | `ShotResult` | a shot: everything it does, in time order |
| `Chat` | `ChatDto` (`system = true` for messages of the game) | |
| `GameOver` | `ResultDto` (winner, ranking; `aborted`) | the match ended |

## Coordinates and the height map

- y is up; the island spans `0 .. (size - 1) * 0.5` m on x and z. `heights` is base64 of little-endian float32, index `iz * size + ix`.
- A crater (`explosion.crater` radius around `x, y, z`): every grid point with `d < r` becomes `min(h, y - sqrt(r² - d²))`, never below −6 m.
- Yaw 0 looks along +z: direction `(sin yaw, 0, cos yaw)`; aim `(cos p · sin yaw, sin p, cos p · cos yaw)`; the muzzle is at feet + (0, 0.85, 0) + aim · 0.6.

## A shot (`ShotResult`)

`duration` seconds long; every time `t` is seconds after the shot.

- `projectiles[]`: `look` (`carrot`, `beet`, `cabbage`, `leaf`, `carrot-drop`), `start`, `points` (flat `[x, y, z, ...]`, one sample every 1/30 s from `start`), `end` (`explode`, `splash`, `vanish`).
- `rays[]`: hitscan pellets `t`, `from`, `to`.
- `explosions[]`: `t`, `x, y, z`, `radius`, `crater` — dig the crater at `t`.
- `damages[]`: `t`, `bunnyId`, `amount`, `health` (after the hit).
- `bunnyTracks[]`: knockback and falls, `bunnyId`, `start`, `points` (1/30 s).
- `deaths[]`: `t`, `bunnyId`, `cause` (`hp`, `water`).
- `kind` is the weapon kind as a number (0 projectile, 1 grenade, 2 cluster, 3 hitscan, 4 airstrike).

## Turn flow

`Aiming` (turn time; walk with stamina 9 m, shoot once) → `Resolving` (the browsers play the shot) → `Retreat` (3 s to run, humans only) → next team.
A team without living bunnies is out; when one team is left it wins (none: a draw). Bots think for about two seconds, then shoot.
A running match nobody watches for three minutes is aborted; after a restart of the server every running match is aborted (the state lives in memory).
