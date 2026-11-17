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
| `GameOver` | `ResultDto` (winner, ranking; `aborted`; per team the look, and for players `xpGained`, `levelBefore`, `levelAfter`, `unlocked[{ kind, key, name }]`) | the match ended |

## Looks and levels

Every team carries how its bunnies look: `fur`, `outfit`, `face` (keys of `Business/Cosmetics.cs`, drawn by `bunny.js`) and `frame` (the frame of its portrait, `portrait.js`),
plus `level` (players: from their XP; bots: a level by their strength). They are in `TeamDto`, the lobby slots (`LobbySlotDto`) and `TeamResultDto`.
The XP of a match (`Cosmetics.XpForMatch`: 25 + 10 per place above 4th for taking part, only when the team won, hit or knocked out something; + 75 for the win + 30 per K.O. + damage/4 up to 300) goes to players only, never for an aborted match;
the result computes it in the room (from the player's progress when they took the seat), `MatchLogic.FinishAsync` saves the same number.

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
A running match without any of its players connected for 30 seconds is aborted (spectators do not count); after a restart of the server every running match is aborted (the state lives in memory).

# The JSON API of the player app (`/api`, `Web/Api.cs`)

The player app (`/`, `/Play/{token}`) is a single page: it talks to these endpoints and to the hub. Every call goes through the business layer
(which checks the permission). Changes (POST, PUT) carry the antiforgery token of the session in the header `RequestVerificationToken`;
the token changes with the user, so the app fetches `/api/session` again after login, registration and logout.
Errors: `400 { error, field }` (field in camelCase or null), `401` not signed in, `403` denied.

| Method | Path | Body / query | Answer |
|---|---|---|---|
| GET | `/api/session` (anonymous) | | `{ signedIn, player: { id, displayName, loginName, isAdmin, teamName, teamColor, fur, outfit, face, frame, level } \| null, canRegister, firstRun, version, antiforgery }` |
| POST | `/api/session/login` (anonymous) | `{ loginName, password }` | session |
| POST | `/api/session/register` (anonymous) | `{ displayName, loginName, password }` | session (the first account becomes the administrator) |
| POST | `/api/session/logout` | | `{ ok }` |
| GET | `/api/showcase?worldId=` (anonymous) | | `{ world: WorldDto, teams, bunnies }` — the island behind the menu |
| GET | `/api/home` | | `{ player: { level, xp, fur, outfit, face, frame, teamColor }, announcement, stats: { gamesPlayed, gamesWon, kills, damageDealt, rank }, history[] (with xpGained) }` |
| GET | `/api/settings` | | `{ defaultTurnSeconds, maxTeamsPerMatch }` |
| GET | `/api/worlds` | | `[{ id, name, description, theme, themeName, gridSize, width, gravity, maxWind }]` |
| GET | `/api/worlds/{id}/terrain` | | `WorldDto` (height map for previews) |
| GET | `/api/matches` | `q, status (lobby\|running\|mine), page` | `{ items[{ token, name, worldName, theme, hostName, status, maxTeams, seats, bunniesPerTeam, turnSeconds, createDate, isMine }], matching, total }` |
| POST | `/api/matches` | `{ name, worldId, maxTeams, bunniesPerTeam, bunnyHealth, turnSeconds, isPublic }` | `{ token }` |
| POST | `/api/matches/quick` | `{ worldId?, bots, level }` | `{ token }` (the app joins, adds the bots and starts) |
| GET | `/api/leaderboard` | `q, sort (rank\|level\|name\|games\|kills\|damage), dir, page` | `{ items[] (with level, fur, outfit, face, frame), matching, total }` |
| GET/PUT | `/api/profile` | `{ displayName, teamName, teamColor }` | `{ displayName, loginName, teamName, teamColor, fur, outfit, face, frame, level, xp, xpAtLevel, xpForNext, maxLevel, stats, wardrobe[{ kind, name, items[{ key, name, unlocked, requirement, wild, level }] }], colors[] }` |
| PUT | `/api/profile/look` | `{ fur, outfit, face, frame }` | the profile; `400` when an item is unknown or still locked (`field` = the kind) |
| POST | `/api/profile/password` | `{ currentPassword, newPassword }` | `{ ok }` |

Unauthenticated requests to `/api` and `/hub` get `401`; pages of the administration redirect to `/?returnUrl=...`, where the app signs in and returns.
