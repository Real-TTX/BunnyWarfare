<p align="center"><img src="docs/logo/bunnywarfare-hero.svg" alt="BunnyWarfare" width="420" /></p>

# BunnyWarfare

Rundenbasierte **3D-Artillerie mit Hasen** im Browser: Teams aus Hasen bekämpfen sich auf kleinen Inseln mit Karotten, Rüben und Kohlköpfen.
Allein gegen Bots oder mit Freunden über das Netz – mit einer Administration für Spieler, Spiele, Welten und Waffen.

- **Spiel:** three.js (3D, zerstörbares Gelände, Wind, Wasser), Echtzeit über SignalR, der Server rechnet jeden Schuss (keine Schummelei im Browser).
- **Multiplayer:** Lobby mit Einladungslink, 2–8 Teams, Bots in drei Stärken, Zuschauen, Chat, Rangliste.
- **Waffen:** Karottenwerfer (Wind), Rübengranate (springt, Zünder), Kohlkopf-Splitter (Bomblets), Löwenzahn-Flinte (Schrot), Möhrenregen (Luftschlag) – alle in der Administration änderbar.
- **Welten:** Möhrenwiese, Frostbau, Dünenland, Mondkrater (wenig Schwerkraft) – aus einem Seed erzeugt, mit Vorschau in der Administration.
- **Administration** unter `/Admin`: Übersicht (live), Spieler, Spiele (beenden, löschen), Welten, Waffen, System. Design: MatUi aus [MatDesign](https://github.com/Real-TTX/MatDesign).

Stack: ASP.NET Core 10 (Razor Pages, SignalR), PostgreSQL 17 (EF Core), three.js r187, Docker. Port **2772**.

## Starten

```bash
docker compose up -d                                 # Release (main, :latest)      -> http://localhost:2772
docker compose -f docker-compose.dev.yml up -d       # Entwicklung (dev, :nightly)  -> App 2772, pgAdmin 2773
./scripts/redeploy.ps1                               # Lokal aus dem Quellcode       -> App 2772, pgAdmin 2773, Postgres 2774
```

Das **erste Konto**, das sich registriert, wird Administrator. Ohne Docker (Postgres des lokalen Stacks auf Port 2774):

```bash
dotnet run --project src/BunnyWarfare     # appsettings.Development.json zeigt auf localhost:2774
```

## Steuerung

| Taste | |
|---|---|
| `W` `A` `S` `D` | laufen (Ausdauer pro Zug) |
| Maus ziehen / Mausrad | Kamera drehen (= zielen) / zoomen |
| `↑` `↓` oder `R` `F` | Rohr heben / senken |
| `Leertaste` halten | Kraft laden – loslassen feuert |
| `1`–`9` | Waffe wählen; Luftschlag: Ziel anklicken |
| `Tab` / `Enter` | Zug beenden / Chat |

## Versionen und Branches

| Branch | Version | Image |
|---|---|---|
| `main` | `<major>.<minor>.<build>-<datum>` z. B. `0.1.42-20261117` | `ghcr.io/real-ttx/bunnywarfare:latest` |
| `dev` | `nightly-<build>-<datum>` | `ghcr.io/real-ttx/bunnywarfare:nightly` |
| lokal | `local-<datum>` | `bunnywarfare:local` |

Major/Minor stehen in `Directory.Build.props`, die Build-Nummer kommt aus GitHub Actions (`.github/workflows/build.yml`). Die Version steht unten links im Menü und führt zur About-Seite.

## Aufbau

```
src/BunnyWarfare/
  Data/        Entitäten (PascalCase, Id bigint, Audit-Spalten, UpdateState), DbContext, Migrationen
  Business/    statische Klassen mit der Logik und den Berechtigungsprüfungen (PlayerLogic, MatchLogic, WorldLogic, WeaponLogic, SettingLogic, SeedLogic)
  Game/        Terrain, Simulation (Physik), Bot, MatchRoom (Lobby/Züge), RoomRegistry, GameHub (SignalR), GameTicker
  Pages/       Razor Pages: Start, Spielen, Rangliste, Konto, Admin/*; Play/Game = das Spiel (eigene Oberfläche)
  Controls/    Tag-Helper: md-field, md-buttons, md-table, md-tabs, md-tab-group
  wwwroot/     matui/ (MatUi, kopiert), lib/ (three.js, SignalR), js/game/ (der Spiel-Client), css/, img/logo/
tests/BunnyWarfare.Tests   Simulation, Rundenlogik, Berechtigungen
docs/PROTOCOL.md           das Protokoll zwischen Browser und Server
```

## Logo

`node scripts/logo.js` schreibt das Logo in allen Detailstufen (Favicon, Mark, Maskable, Mono, Wortmarke hell/dunkel, Hero) nach `docs/logo` und `wwwroot/img/logo`;
`./scripts/icons.ps1` zeichnet daraus die PNG-Icons (Edge headless).

<p><img src="docs/logo/bunnywarfare-mark.svg" width="64" alt="Mark" /> <img src="docs/logo/bunnywarfare-favicon.svg" width="32" alt="Favicon" /> <img src="docs/logo/bunnywarfare-logo.svg" height="40" alt="Logo" /></p>
