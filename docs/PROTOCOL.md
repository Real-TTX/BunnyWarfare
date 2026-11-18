# The game protocol (SignalR, `/bunnywarfare/hub`)

BunnyWarfare is a plugin of MatGame (`../MatGame`; its `docs/PROTOCOL.md` describes the master: discovery, accounts, guests, device tokens, the bridge of the app).
Every path of the game is below `/bunnywarfare` on the master. The browser connects with MatGame's cookie, an app with its device token (SignalR's `access_token`,
plus `mgp` / `mgc` for the version check); the hub is `[Authorize]` with MatGame's scheme, guests included. JSON, names in camelCase. The server is authoritative:
it simulates every shot (`Game/Simulation.cs` in BunnyWarfare.Core), the browsers only play what it sends. The DTOs are in `src/BunnyWarfare.Core/Game/Dtos.cs`.
**Offline** (the app without a master) `BunnyWarfare.Local` answers the same methods with the same messages (see the end).


## Browser → server

| Method | Arguments | Who | What |
|---|---|---|---|
| `Join(token)` | the token of the match (from the link `/bunnywarfare/Play/{token}`) | everyone with the link | Enters the room, takes a seat in the lobby when one is free; returns `RoomDto`. A finished match returns only its `result`. |
| `AddBot(level)` | `Easy` \| `Normal` \| `Hard` | host, lobby | A computer team. |
| `RemoveTeam(teamIndex)` | | host (others), a player (themselves), lobby | |
| `Start()` | | host, lobby, ≥ 2 teams | Saves the teams, builds the island, places the bunnies, first turn. |
| `Move(x, z, yaw)` | feet position, facing | the player of the turn (Aiming, Retreat) | ≤ 1.6 m per message, within the stamina, not into water, not up steep walls; else a correction to the sender only. |
| `AimAt(yaw, pitch, weaponId)` | | the player of the turn | Relayed to the others (spectators see the aim). |
| `Fire(weaponId, yaw, pitch, power, targetX, targetZ)` | radians, power 0..1, target only for the airstrike and the Hasenloch (`Teleport`) | the player of the turn (Aiming) | Simulates the shot, sends `Shot`. A Hasenloch target in the water, off the map or on another bunny is refused ("Da kann der Hase nicht hin."). |
| `SkipTurn()` | | the player of the turn | |
| `Surrender()` | | a player of the match | All their bunnies leave the island. |
| `Chat(text)` | ≤ 200 characters | everyone in the room | |

Errors (not your turn, no ammo ...) arrive as a `HubException` with a German message.

## Server → browser

| Message | Payload | When |
|---|---|---|
| `Room` | `RoomDto` (lobby, and on start the whole `GameDto` with the height map) | lobby changes, start |
| `Turn` | `TurnUpdateDto` (turn, all bunnies, all teams, all `crates`) | a new turn, the retreat after a shot, a correction after a surrender — the browser snaps to it |
| `CrateDrop` | `CrateDropDto { crate }` | right after the `Turn` message of a turn in which a supply crate falls (that `Turn` already lists it): animate the fall |
| `CratePicked` | `CratePickedDto { crateId, bunnyId, team, look, text, teamState, bunny, stamina }` | a bunny walked onto a crate — to everyone, also the walker: show `text`, apply `teamState` (ammo, effects), `bunny` (health, shield) and `stamina` |
| `Moved` | `MovedDto` (`correction = true`: snap your own bunny back) | the bunny of the turn walked |
| `Aim` | `AimDto` | the player of the turn aims (or a bot) |
| `Shot` | `ShotResult` | a shot: everything it does, in time order |
| `Chat` | `ChatDto` (`system = true` for messages of the game) | |
| `GameOver` | `ResultDto` (winner, ranking; `aborted`; per team the look, and for players `xpGained`, `levelBefore`, `levelAfter`, `unlocked[{ kind, key, name }]`) | the match ended |

## Looks and levels

Every team carries how its bunnies look: `fur`, `outfit`, `face` (keys of `BunnyWarfare.Core/Business/Cosmetics.cs`, drawn by `bunny.js`) and `frame` (the frame of its portrait, `portrait.js`),
plus `level` (players: from their XP; bots: a level by their strength). They are in `TeamDto`, the lobby slots (`LobbySlotDto`) and `TeamResultDto`.
The XP of a match (`Cosmetics.XpForMatch`: 25 + 10 per place above 4th for taking part, only when the team won, hit or knocked out something; + 75 for the win + 30 per K.O. + damage/4 up to 300) goes to players only, never for an aborted match;
the result computes it in the room (from the player's progress when they took the seat), `MatchLogic.FinishAsync` saves the same number.

## Supply crates

The match option `crateRate` (`RoomDto.crateRate` 0 off, 1 rare, 2 normal, 3 often; `crateRateName` "Aus" / "Selten" / "Normal" / "Oft"; quick matches: normal).
At the start of every turn from turn 2 a crate may fall (rare 20 %, normal 35 %, often 60 % per turn; certain after 5 / 4 / 3 turns without one; at most 3 on the island)
onto a free land spot (not steep, ≥ 2.5 m from bunnies and crates). `CrateDto { id, x, y, z, look }` (the bottom of the crate) is in `GameDto.crates` and `TurnUpdateDto.crates`;
`look` is `weapon` | `health` | `support`, the content stays secret (`BunnyWarfare.Core/Game/Crates.cs`):

- weapon (55 %): ammo for a limited weapon of the match, also the crate-only ones (`AmmoPerMatch` 0: "Goldene Riesenmöhre"): +1 for crate-only weapons and the airstrike, else +2.
- health (25 %): +35 for the picking bunny, at most up to its full health.
- support (20 %): `shield` "Panzerfell" (the bunny takes half damage from its next 2 hits, `BunnyDto.shield` = hits left), `double` "Doppel-Wumms" (the team's next shot does
  double damage, `TeamDto.effects` contains `double`), `turbo` "Turbo-Möhre" (+8 m stamina now when it is the team's turn, else at its next turn: effect `turbo`),
  or +1 "Hasenloch" (the teleport weapon, crate-only).

A living bunny whose feet come within 0.9 m (1.2 m up or down) of a crate takes it: after an accepted `Move` (message `CratePicked`) and after a shot for every bunny at its
final position (`ShotResult.crates` with action `picked`; the team and bunny changes arrive with the next `Turn`). An explosion destroys every crate in its radius; a weapon crate
then explodes itself (damage 25, radius 2.2, 0.15 s later; a chain goes on only once). After a shot crates follow the dug-away ground (`moved`) or sink when it is under water (`sunk`).

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
- `crates[]`: `t`, `crateId`, `action` (`destroyed`, `picked`, `moved`, `sunk`), `bunnyId` (picked), `y` (moved: the new bottom), `text` and `look` (picked; `look` also on destroyed/sunk).
- `teleports[]`: the Hasenloch, `t`, `bunnyId`, `from`, `to` (`[x, y, z]`, feet).
- `kind` is the weapon kind as a number (0 projectile, 1 grenade, 2 cluster, 3 hitscan, 4 airstrike, 5 teleport; offline the name – the app accepts both). `WeaponDto.kind` is the name (`Teleport` for the Hasenloch).

## Turn flow

`Aiming` (turn time; walk with stamina 9 m (+8 with a Turbo-Möhre), shoot once) → `Resolving` (the browsers play the shot) → `Retreat` (3 s to run, humans only) → next team.
A team without living bunnies is out; when one team is left it wins (none: a draw). Bots think for about two seconds, then shoot.
A running match without any of its players connected for 30 seconds is aborted (spectators do not count); after a restart of the server every running match is aborted (the state lives in memory).

# The JSON API of the player app (`/bunnywarfare/api`, `Web/Api.cs`)

The player app (`/bunnywarfare/` and `/bunnywarfare/Play/{token}`: one static page, `wwwroot/index.html` with `<base href="/bunnywarfare/">`) talks to these endpoints,
to the hub and to MatGame's host API. **Accounts are MatGame's**: sign-in, registration, guests, logout and the account's name and password go to `/api/matgame/...`
(MatGame docs/PROTOCOL.md, "Host API"). The game keeps one player per account (`Player.Id` = the account id), made at the first call. Every call goes through the
business layer (which checks the permission) and `GameApi.ForGame` (the app version; the antiforgery token of cookie requests in `RequestVerificationToken` – an app's
bearer requests need none; CORS for the apps). Errors: `400 { error, field }` (field in camelCase or null), `401` not signed in, `403` denied, `426 { error, update: true }`
the app is too old. Offline `BunnyWarfare.Local` answers the same paths with the same shapes (`/matches` is empty there, the leaderboard has only the local player).

| Method | Path (below `/bunnywarfare/api`) | Body / query | Answer |
|---|---|---|---|
| GET | `/session` (anonymous) | | `{ signedIn, player: { id, displayName, isGuest, isAdmin, teamName, teamColor, fur, outfit, face, frame, level } \| null, version }` (offline also `offline: true`) |
| GET | `/showcase?worldId=` (anonymous) | | `{ world: WorldDto, teams, bunnies }` — the island behind the menu |
| GET | `/home` | | `{ player: { level, xp, fur, outfit, face, frame, teamColor }, announcement, stats: { gamesPlayed, gamesWon, kills, damageDealt, rank }, history[] (with xpGained) }` (guests: rank 0) |
| GET | `/settings` | | `{ defaultTurnSeconds, maxTeamsPerMatch }` |
| GET | `/worlds` | | `[{ id, name, description, theme, themeName, gridSize, width, gravity, maxWind }]` |
| GET | `/worlds/{id}/terrain` | | `WorldDto` (height map for previews) |
| GET | `/matches` | `q, status (lobby\|running\|mine), page` | `{ items[{ token, name, worldName, theme, hostName, status, maxTeams, seats, bunniesPerTeam, turnSeconds, createDate, isMine }], matching, total }` |
| POST | `/matches` | `{ name, worldId, maxTeams, bunniesPerTeam, bunnyHealth, turnSeconds, isPublic, crateRate }` (crateRate 0–3, default 2) | `{ token }` |
| POST | `/matches/quick` | `{ worldId?, bots, level }` | `{ token }` (the app joins, adds the bots and starts) |
| GET | `/leaderboard` | `q, sort (rank\|level\|name\|games\|kills\|damage), dir, page` | `{ items[] (with level, fur, outfit, face, frame), matching, total }` — accounts only, no guests |
| GET/PUT | `/profile` | `{ teamName, teamColor }` (offline also `displayName`) | `{ displayName, isGuest, teamName, teamColor, fur, outfit, face, frame, level, xp, xpAtLevel, xpForNext, maxLevel, stats, wardrobe[{ kind, name, items[{ key, name, unlocked, requirement, wild, level }] }], colors[] }` |
| PUT | `/profile/look` | `{ fur, outfit, face, frame }` | the profile; `400` when an item is unknown or still locked (`field` = the kind) |

Requests without a sign-in get `401`. The admin pages (`/Admin/BunnyWarfare/...`, inside MatGame's admin shell) are for MatGame's administrators.

# Offline (the app)

The app shell (MatGame.Shell) loads the same `wwwroot` from its own files at `https://bunnywarfare.matgame.app/bunnywarfare/` (same base path, extension-less paths fall back
to `index.html`) and runs `BunnyWarfare.Local` (`MatGame.Local.ILocalGame`, created with `new BunnyWarfareLocal()`, started with the shell's `ILocalHost`):
`local.request` = the API above, `local.invoke` = the hub methods, the bridge event `local` = the hub messages. The player is the local guest (id 1) with a profile of its own
(`profile.json` in the app's data folder: name, team, look, numbers, XP, the last 30 matches); level and unlocks follow the same rules as online but are never sent to a master.
The worlds and weapons are the seeded ones (`SeedContent`); a clock like the server's GameTicker runs the turns and the bots. Open matches and the invitation link do not exist offline.
