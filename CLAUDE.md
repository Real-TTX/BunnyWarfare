# CLAUDE.md

Guidance for working in this repository. Keep it in sync with the code.

## What BunnyWarfare is

A turn-based 3D artillery game with bunnies in the browser (genre: artillery/tactics; the names, characters, weapons and art are our own — do not copy other games).
Multiplayer over SignalR, bots, small generated islands. **Players only ever see the full-screen 3D app** (`/`, `/Play/{token}`: menu, sign-in, lobbies, leaderboard, profile and the match, in a KingBee-like cartoon look over a living island); **only administrators** see the classic MatUi shell under `/Admin` (players, matches, worlds, weapons, system).
Stack: ASP.NET Core **.NET 10**, **Razor Pages**, SignalR, EF Core + **PostgreSQL 17**, three.js r187 (vendored, no build step), Docker. Port **2772** (pgAdmin 2773, local Postgres 2774).

## Build / run / test

- `dotnet build BunnyWarfare.slnx`, `dotnet test BunnyWarfare.slnx` (simulation, turn logic, permissions; no database needed).
- `./scripts/redeploy.ps1` rebuilds and starts the local stack (`docker-compose.local.yml`), `-Clean` drops the volumes. This is how every change is tested.
- Migrations: `dotnet tool restore`, then `dotnet ef migrations add <Name> --project src/BunnyWarfare --output-dir Data/Migrations`. The app migrates on start.
- JS check: `node --check --input-type=module < file.js` for the modules in `wwwroot/js/game`.

## Rules (from the owner's guidelines — keep them)

- **Git:** branches `main` (release) and `dev` (nightly). Commits only under the owner's name; **no Co-Authored-By or other contributor lines**, no generated-by lines in PRs.
- **Versions:** release `<major>.<minor>.<build>-<date>`, nightly `nightly-<build>-<date>`, local `local-<date>` (`Directory.Build.props`, CI sets Channel/BuildNumber/BuildDate). The version is at the bottom left of the menu and links to `/About`.
- **Docker:** one Dockerfile (ASP.NET Core base image), compose files for release/dev/local, **no `${VARIABLES}` and no `.env`**, always a stack (`name:`); volumes are named only by their role (`web-data`, `db-data`: the stack prefixes them).
- **C#:** Microsoft coding conventions, readable names, flat code. **Business layer = static classes** in `Business/`, each method takes an `Actor` and **checks the permission itself** (`Guard`), even when the page is already protected. **No database queries in pages or models** — page models call the business layer only.
- **Database:** tables and columns PascalCase (singular table names), every key `Id bigint`, every record `CreateDate, CreateUserId, UpdateDate, UpdateUserId` (filled by `AppDbContext.SaveChangesAsync` from `ActingAs`), soft delete with `UpdateState` (0 deleted, 1 created, 2 updated) for players, worlds, weapons. Secrets in links are tokens (`Match.Token`).
- **UI (administration only):** MatUi from MatDesign (`../MatDesign`, copied into `wwwroot/matui`, never edited — update by copying a release). Check the MatDesign rulebook before a new pattern.
  Lists: toolbar on top (search, filter, sort: `_Toolbar`), table (`md-table`), pager below (`_Pager`), actions below and left, positive → negative, delete apart.
  Edit pages: one page for create/update with delete (`md-buttons`: Save, Back, space, Delete). Areas of an item are tabs (`md-tab-group`/`md-tab-panel`, or `md-tabs` for tabs that are pages).
  Fields only when they make sense (`md-field show-if=... show-value=...`, e.g. the weapon form). Icons where they help. Space between tiles.
- **The player app** (`Pages/App.cshtml`, `wwwroot/js/game`, `css/play.css`, `css/effects.css`, `fonts/`) is special game UI, not MatUi: chunky cartoon panels (Lilita One + Nunito, cream paper, thick brown outlines, carrot orange). It talks to `/api` (`Web/Api.cs`) and the hub; keep every player-facing screen inside it (no new Razor pages for players).

## Map

```
src/BunnyWarfare/Data          Entities.cs, AppDbContext.cs (audit columns), Migrations/
src/BunnyWarfare/Business      Common.cs (Actor, Guard, ListRequest), PlayerLogic, MatchLogic, WorldLogic, WeaponLogic, SettingLogic, SeedLogic
src/BunnyWarfare/Game          Terrain (height map, generation, craters), Simulation (shots, explosions, knockback, water), Bot, MatchRoom (lobby + turns, returns messages),
                               RoomRegistry (rooms in memory), GameHub (/hub/game), GameTicker (clock, bots, saving), Dtos (protocol)
src/BunnyWarfare/Web           Identity (cookie ↔ Actor), AppInfo (version), Ui (icons), Assets (sprite), ListModels (toolbar, pager), HealthCheck, Api (the JSON API of the player app, antiforgery checked)
src/BunnyWarfare/Controls      tag helpers md-field, md-buttons, md-table, md-tabs/md-tab, md-tab-group/md-tab-button/md-tab-panel
src/BunnyWarfare/Pages         App (the 3D player app, anonymous, no DB access), Admin (Index, Players, Matches, Worlds, Weapons, System; only admins, _Layout is the admin shell), About, Account/Logout, Error
docs/PROTOCOL.md               the SignalR protocol and the JSON API — update it with every change of Dtos.cs / GameHub.cs / Api.cs
src/BunnyWarfare/wwwroot/js/game  main (entry, router /↔/Play), api, ui, menu (all menu panels), showcase (living menu island), match (the match controller), hud, input, audio, icons, maps;
                               scene + terrain + world + world/ (sky, water, vegetation, models, life): the island; bunny + fx/: bunnies and weapons; effects + playback: shots
scripts/                       redeploy.ps1/.sh, logo.js (logo in all levels of detail), icons.ps1 (PNG icons via Edge)
```

## Game rules in code

- The server is authoritative: `Simulation.Fire` changes terrain and bunnies and returns a `ShotResult` timeline that the browsers play. Browsers only send intentions.
- `Terrain` heights are float32 and the crater formula is duplicated in `wwwroot/js/game` — keep both identical.
- `Terrain.Generate` shapes the island per theme (warped coast, beaches/cliffs, pond, ridges, dunes, craters) and keeps the outer 9 cells under water; the client extends the sea floor beyond the map (`world/`), so no edge is visible. Tests hold the border depth and the land share.
- Team colours in a lobby are kept apart (`MatchRoom.FreeColor`, distance > 120); a running match whose players all left is aborted after 30 s.
- Everything of a room happens under `MatchRoom.LockAsync()`; methods return `Outgoing` messages that are sent in order while the lock is held.
- Running matches live in memory; a restart aborts them (`MatchLogic.AbortStaleAsync`).
