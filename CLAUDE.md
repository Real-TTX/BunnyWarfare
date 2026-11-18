# CLAUDE.md

Guidance for working in this repository. Keep it in sync with the code.

## What BunnyWarfare is

A turn-based 3D artillery game with bunnies in the browser (genre: artillery/tactics; the names, characters, weapons and art are our own — do not copy other games).
Multiplayer over SignalR, bots, small generated islands. BunnyWarfare is a **plugin of MatGame** (`../MatGame`, the master of the Mat games: accounts, guests,
device sign-in, portal, `/Admin`, discovery for the apps). It runs in three ways from one code base:

- **On a MatGame master** (Docker): the player app at `/bunnywarfare/`, its API at `/bunnywarfare/api`, the hub at `/bunnywarfare/hub`, its admin pages at `/Admin/BunnyWarfare`.
- **In the app** (MatGame.Shell, Windows now, mobile later) **online** against a master the player chooses (the built-in default: `MatGameDefaultServer` in `Directory.Build.props`).
- **In the app offline**: `BunnyWarfare.Local` plays the server's part on the device (the local guest, bots, a local profile).

**Players only ever see the full-screen 3D app** (menu, sign-in/guest, server choice in the app, lobbies, leaderboard, profile and the match, in a KingBee-like cartoon look over a living island);
**only administrators** see the classic MatUi pages, inside MatGame's admin shell.
Stack: **.NET 10**, Razor class library, SignalR, EF Core + **PostgreSQL 17** (MatGame's database, schema `bunnywarfare`), three.js r187 (vendored, no build step).

## Build / run / test

- The repositories live side by side: `../MatGame` is required (the projects reference `../MatGame/src/MatGame.Sdk` and `../MatGame/src/MatGame.Local`).
- `dotnet build BunnyWarfare.slnx`, `dotnet test BunnyWarfare.slnx` (simulation, turn logic, permissions, accounts, the offline game; no database needed).
- `./scripts/redeploy.ps1` rebuilds and starts **MatGame's** local stack with every game (`../MatGame/scripts/redeploy.ps1`): http://localhost:2770/bunnywarfare/. This is how every change is tested.
- Migrations: `dotnet tool restore`, then `dotnet ef migrations add <Name> --project src/BunnyWarfare.Module --output-dir Data/Migrations` (the design-time factory uses MatGame's
  local Postgres on port 2775, `BUNNYWARFARE_DESIGN_DB` overrides it). The plugin migrates its schema at start (`BunnyWarfareModule.StartAsync`).
- JS check: `node --check --input-type=module < file.js` for the modules in `wwwroot/js/game` and `wwwroot/js/matgame`.
- The MatGame JS SDK in `wwwroot/js/matgame` is a **copy**: never edit it here; change `../MatGame/sdk/js` and run `node ../MatGame/tools/sdk-copy.js src/BunnyWarfare.Module/wwwroot/js/matgame`
  (CI checks the copy against `matgame.version`).
- Windows app: `dotnet run --project src/BunnyWarfare.App` (MatGame.Shell + the embedded wwwroot + BunnyWarfareLocal offline; a local build never installs or updates).
  Publish: `dotnet publish src/BunnyWarfare.App -c Release -r win-x64` = one self-installing `BunnyWarfare.exe`. CI job `windows` (push) puts it with
  `bunnywarfare-update.json` into the rolling release `release-channel` (main) / `nightly-channel` (dev). Test it in the real app through WebView2's remote debugging (see MatGame/CLAUDE.md).

## Rules (from the owner's guidelines — keep them)

- **Git:** branches `main` (release) and `dev` (nightly). Commits only under the owner's name; **no Co-Authored-By or other contributor lines**, no generated-by lines in PRs.
- **Versions:** release `<major>.<minor>.<build>-<date>`, nightly `nightly-<build>-<date>`, local `local-<date>` (`Directory.Build.props`, CI sets Channel/BuildNumber/BuildDate).
  `BunnyWarfareModule.Protocol` rises only with a change of the API or the hub old apps cannot follow; `GameInfo.MinClient` holds old apps back.
- **Docker:** BunnyWarfare has no image of its own any more — MatGame's image contains it (main → `:latest`, dev → `:nightly`). CI builds and tests here and tells MatGame to build.
- **C#:** Microsoft coding conventions, readable names, flat code. **Business layer = static classes** in `Business/`, each method takes an `Actor` and **checks the permission itself** (`Guard`), even when the page is already protected. **No database queries in pages or models** — page models call the business layer only.
- **Accounts are MatGame's.** The plugin never signs anyone in: `Web/Players.cs` turns MatGame's account (`HttpContext.User.ToAccount()`) into an `Actor`; the player row
  (`Player.Id` = the account id, `IsGuest`) is made at the first request (`PlayerLogic.EnsureAsync`) and follows the account's name. Guests play but are not in the leaderboard.
- **Database:** the schema `bunnywarfare` in MatGame's database with its own migration history there; tables and columns PascalCase (singular table names), every key `Id bigint`,
  every record `CreateDate, CreateUserId, UpdateDate, UpdateUserId` (filled by `AppDbContext.SaveChangesAsync` from `ActingAs`), soft delete with `UpdateState` for players, worlds, weapons. Secrets in links are tokens (`Match.Token`).
- **Admin pages** (`Pages/Admin/BunnyWarfare/...`, `@page "/Admin/BunnyWarfare/..."`): MatUi through MatGame's admin shell (`_Layout` of the host, set in `_ViewStart`) and the SDK's admin kit
  (`MatGame.Sdk.Controls`: md-field, md-buttons, md-table, md-tabs; `MatGame.Sdk.Web`: toolbar, pager, `Ui`; partials `_Toolbar`, `_Pager`, `_FormSummary`). Every page includes
  `<partial name="_Assets" />` (the game's admin stylesheet and its own icons). The menu entries are `BunnyWarfareModule.Admin`. Lists: toolbar on top, table, pager below, actions below and left;
  edit pages: one page with `md-buttons` (Save, Back, space, Delete); areas are tabs; fields only when they make sense (`show-if`).
- **The player app** (`wwwroot/index.html`, `wwwroot/js/game`, `css/play.css`, `css/effects.css`, `fonts/`) is special game UI, not MatUi: chunky cartoon panels (Lilita One + Nunito,
  cream paper, thick brown outlines, carrot orange). It talks to the game API, the hub and MatGame's host API **only through `js/game/api.js`** (the SDK: `connect`, `OnlineTransport`,
  `LocalTransport`, `Session`); keep every player-facing screen inside it.
- **Base path:** the app is served at `/bunnywarfare/` on the master **and** in the app shell (`https://bunnywarfare.matgame.app/bunnywarfare/`); `index.html` is a plain static file with
  `<base href="/bunnywarfare/">`. No absolute `/js`, `/lib`, `/css`, `/fonts`, `/img`, `/api`, `/hub` or `/Play` URLs: relative ones, or `BASE` from `api.js`. Everything the client loads
  comes from `wwwroot` (no CDN).
- **Offline rule:** `BunnyWarfare.Local` must answer **every** API call and hub method the client makes, with the same shapes and messages. A new endpoint or hub method needs its offline
  answer (or a clear "offline not available" in the client) and a test in `LocalGameTests`.

## Map

```
src/BunnyWarfare.Core      (no ASP.NET, no EF) Data/Entities.cs (POCOs), Game/ Terrain, Simulation, Bot, Crates, MatchRoom (lobby + turns, returns messages), GameState, Dtos (protocol), Showcase;
                           Business/ Common (Actor, Guard, exceptions, ListRequest), Cosmetics (wardrobe, unlocks, level curve, XP), GameRules (team colours, names, defaults, TeamSlot/TeamOutcome),
                           PlayerRules (profile view, look, team checks, AddMatch), SeedContent (the seeded worlds and weapons)
src/BunnyWarfare.Module    the plugin (Razor class library, static web assets at /bunnywarfare): BunnyWarfareModule (IGameModule), Data/ AppDbContext (schema bunnywarfare) + Migrations/,
                           Business/ PlayerLogic, MatchLogic, WorldLogic, WeaponLogic, SettingLogic, SeedLogic, ImportLogic (old stand-alone databases), Game/ GameHub, RoomRegistry, GameTicker,
                           Web/ Api (/bunnywarfare/api), PlayerApp (serves index.html with the version), Players (account → Actor), AdminAssets, AppInfo;
                           Pages/Admin/BunnyWarfare (Übersicht, Spieler, Spiele, Welten, Waffen, Einstellungen, Import)
src/BunnyWarfare.Local     the offline game of the app: BunnyWarfareLocal (ILocalGame: API + hub + clock), LocalProfile (profile.json)
src/BunnyWarfare.App       the Windows app: MatGame.Shell with BunnyWarfare.Module/wwwroot embedded as web/bunnywarfare/** and BunnyWarfareLocal as the offline game
src/BunnyWarfare.Module/wwwroot  index.html, js/game (main = entry and router <base>↔<base>Play/{token}, api = where and as whom (SDK), ui, menu (all panels incl. sign-in/guest and servers),
                           showcase, match, aim, hud, avatars, portrait, input, audio, icons, maps, scene + terrain + world + world/, bunny + fx/, effects + playback), js/matgame (SDK copy),
                           lib/ (three.js, SignalR), css/play.css + effects.css (player app), css/admin.css (admin pages), fonts/, img/
tests/BunnyWarfare.Tests   simulation, crates, rooms, worlds, progression, permissions, accounts, the offline game
docs/PROTOCOL.md           the hub protocol, the game API, offline mode — update it with every change of Dtos.cs / GameHub.cs / Api.cs / BunnyWarfareLocal
scripts/                   redeploy.ps1/.sh (MatGame's stack), logo.js, icons.ps1
```

## Game rules in code

- The server (or offline the app) is authoritative: `Simulation.Fire` changes terrain and bunnies and returns a `ShotResult` timeline that the browsers play. Browsers only send intentions.
- `Terrain` heights are float32 and the crater formula is duplicated in `wwwroot/js/game` — keep both identical.
- `Terrain.Generate` shapes the island per theme (warped coast, beaches/cliffs, pond, ridges, dunes, craters) and keeps the outer 9 cells under water; the client extends the sea floor beyond the map (`world/`), so no edge is visible. Tests hold the border depth and the land share.
- Themes: Meadow, Snow, Desert, Moon, Autumn, Volcano (the liquid is lava: same WaterLevel rule), Jungle. `Terrain.CarveLandmarks` cuts walkable caves (and the jungle temple) with exactly flat floors; the browser finds them by that flat value (`world/landmarks.js`) and dresses them (`world/buildings.js`) — decoration only, no collision, cleared by craters. `SeedLogic` adds missing seeded worlds and weapons (`SeedContent`) to existing databases (by name or seed).
- The aim help (`aim.js`) mirrors `Simulation.Fly`/`Ray`/airstrike drops (Dt, MaxSpeed, factors 0.8/0.9, bounce 0.45/0.35, bunny radius) — change both together. The own bunny ignores the echo of its own `Moved` (only corrections snap it).
- Progression: `Player.Xp` grows in `MatchLogic.FinishAsync` (`PlayerRules.AddMatch` = `Cosmetics.XpForMatch`, players only, never for aborted matches); the room computes the same XP for the result screen; offline `BunnyWarfareLocal` adds it to the local profile. The look (`Fur`, `Outfit`, `Face`, `Frame`) is stored on the player and copied to `MatchTeam`; the keys in `Cosmetics.cs` are a contract with `bunny.js`/`portrait.js` — never rename one, add new ones at the end. `SaveLookAsync` refuses locked items, administrators may give anything. Bots and the menu island wear random looks (often wild ones).
- Team colours in a lobby are kept apart (`MatchRoom.FreeColor`, distance > 120); a running match whose players all left is aborted after 30 s.
- Everything of a room happens under `MatchRoom.LockAsync()`; methods return `Outgoing` messages that are sent in order while the lock is held (online by `RoomRegistry`/`GameHub`, offline by `BunnyWarfareLocal.Send`).
- Supply crates (`Game/Crates.cs`, `Match.CrateRate`): drops at turn start (chance per rate, certain after a few turns, max 3), content secret (weapon ammo incl. crate-only weapons with `AmmoPerMatch` 0, health, shield/double/turbo/Hasenloch), picked up on `Move` (`CratePicked`, sent to everyone with `Outgoing.ToAll`) and after shots (`ShotResult.crates`); explosions destroy crates and weapon crates explode (chain once). The Hasenloch is `WeaponKind.Teleport` (target like the airstrike, `Simulation.CanTeleport`); bots never use it.
- Running matches live in memory; a restart aborts them (`MatchLogic.AbortStaleAsync`).
- The import (`ImportLogic`, admin page Import or `MATGAME_IMPORT_BUNNYWARFARE` at start) takes over an old stand-alone database once per source: accounts via `IGameAccounts.ImportAsync` (password hashes kept; an existing account with the same login name is used), stats/XP/look added, worlds and weapons by name, finished matches with their teams.
