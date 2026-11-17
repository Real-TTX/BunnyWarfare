// Everything on top of the scene: lobby, turn banner, timer, wind, teams, weapons, power, chat, toasts, game over.
const $ = id => document.getElementById(id);

function el(tag, className, text) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (text !== undefined) e.textContent = text;
    return e;
}

const LEVELS = { Easy: 'leicht', Normal: 'normal', Hard: 'schwer' };
const THEMES = { Meadow: 'Möhrenwiese', Snow: 'Frostbau', Desert: 'Dünenland', Moon: 'Mondkrater' };
const KIND_GLYPH = { Projectile: '🥕', Grenade: '🟣', Cluster: '🥬', Hitscan: '•••', Airstrike: '✈' };

export const themeName = theme => THEMES[theme] ?? theme;

export class Hud {
    constructor() {
        this.root = $('bw-hud');
        this.weaponButtons = new Map();
    }

    loading(on) {
        $('bw-loading').hidden = !on;
    }

    banner(text) {
        const b = $('bw-banner');
        b.hidden = !text;
        b.textContent = text ?? '';
    }

    toast(text, tone = 'danger') {
        const t = el('div', `bw-toast bw-toast--${tone}`, text);
        $('bw-toasts').appendChild(t);
        setTimeout(() => t.classList.add('is-leaving'), 3200);
        setTimeout(() => t.remove(), 3700);
    }

    show(on) {
        this.root.hidden = !on;
    }

    // ------------------------------------------------------------ lobby

    lobby(room, me, actions) {
        $('bw-lobby').hidden = false;
        $('bw-lobby-name').textContent = room.name;
        $('bw-lobby-rules').textContent =
            `${themeName(room.theme)} · ${room.worldName} · ${room.bunniesPerTeam} Hasen pro Team · ${room.bunnyHealth} Leben · ${room.turnSeconds} s pro Zug`;
        const host = room.hostPlayerId === me;
        const list = $('bw-slots');
        list.replaceChildren();
        for (const s of room.slots) {
            const li = el('li', 'bw-slot');
            const sw = el('span', 'bw-swatch');
            sw.style.setProperty('--bw-team', s.color);
            const text = el('div', 'bw-slot__text');
            text.append(el('strong', '', s.teamName), el('small', 'mat-muted', s.isBot ? `Bot (${LEVELS[s.botLevel] ?? s.botLevel})` : s.playerName));
            const dot = el('span', `bw-dot ${s.connected ? 'is-on' : ''}`);
            dot.title = s.connected ? 'verbunden' : 'nicht verbunden';
            li.append(sw, text);
            if (s.playerId === room.hostPlayerId) li.append(el('span', 'mat-pill mat-pill--accent', 'Gastgeber'));
            if (s.playerId === me) li.append(el('span', 'mat-pill mat-pill--plain', 'Du'));
            li.append(dot);
            const removable = (host && s.playerId !== me) || (!host && s.playerId === me);
            if (removable) {
                const x = el('button', 'mat-btn mat-btn--ghost mat-btn--sm', host ? 'Entfernen' : 'Platz freigeben');
                x.type = 'button';
                x.onclick = () => actions.remove(s.teamIndex);
                li.append(x);
            }
            list.append(li);
        }
        for (let i = room.slots.length; i < room.maxTeams; i++) {
            const li = el('li', 'bw-slot bw-slot--free');
            li.append(el('span', 'bw-swatch'), el('div', 'bw-slot__text mat-muted', 'Freier Platz'));
            list.append(li);
        }
        const bots = $('bw-lobby-bots');
        bots.hidden = !host || room.slots.length >= room.maxTeams;
        for (const b of bots.querySelectorAll('[data-bot]')) b.onclick = () => actions.addBot(b.dataset.bot);
        const start = $('bw-btn-start');
        start.hidden = !host;
        start.disabled = room.slots.length < 2;
        start.onclick = () => actions.start();
        $('bw-lobby-hint').textContent = host
            ? (room.slots.length < 2 ? 'Lade Freunde mit dem Link ein oder nimm einen Bot dazu – ab zwei Teams geht es los.' : 'Alles bereit? Dann los!')
            : 'Warte, bis der Gastgeber das Spiel startet.';
        $('bw-btn-invite').onclick = () => actions.invite();
    }

    hideLobby() {
        $('bw-lobby').hidden = true;
    }

    // ------------------------------------------------------------ game over

    gameOver(result, onView) {
        $('bw-over').hidden = false;
        $('bw-over-title').textContent = result.aborted ? 'Spiel abgebrochen' : result.winnerName ? `${result.winnerName} gewinnt!` : 'Unentschieden';
        $('bw-over-sub').textContent = result.aborted ? 'Das Spiel wurde vorzeitig beendet.' : result.winnerName ? 'Ehre den Löffelohren!' : 'Kein Hase hat überlebt.';
        const rows = $('bw-over-rows');
        rows.replaceChildren();
        for (const t of result.teams ?? []) {
            const tr = el('tr');
            const place = el('td', 'mat-mono', t.placement > 0 ? `${t.placement}.` : '–');
            const name = el('td');
            const sw = el('span', 'bw-swatch');
            sw.style.setProperty('--bw-team', t.color);
            name.append(sw, document.createTextNode(` ${t.name}${t.isBot ? ' (Bot)' : ''}`));
            tr.append(place, name, el('td', 'mat-num mat-mono', String(t.kills)), el('td', 'mat-num mat-mono', String(t.damage)));
            rows.append(tr);
        }
        const view = $('bw-over-view');
        view.hidden = !onView;
        view.onclick = () => {
            $('bw-over').hidden = true;
            onView?.();
        };
    }

    // ------------------------------------------------------------ turn

    turn({ title, sub, color, mine }) {
        $('bw-turn-title').textContent = title;
        $('bw-turn-sub').textContent = sub ?? '';
        $('bw-turn-dot').style.background = color ?? '#888';
        $('bw-turn').classList.toggle('is-mine', !!mine);
        this.root.classList.toggle('is-my-turn', !!mine);
    }

    timer(ms) {
        const t = $('bw-timer');
        if (ms === null) {
            t.textContent = '–';
            t.classList.remove('is-urgent');
            return;
        }
        const s = Math.max(0, Math.ceil(ms / 1000));
        t.textContent = String(s);
        t.classList.toggle('is-urgent', s <= 5);
    }

    wind(windX, windZ, maxWind, cameraYaw) {
        const strength = Math.hypot(windX, windZ);
        const share = maxWind > 0 ? Math.min(1, strength / maxWind) : 0;
        const windYaw = Math.atan2(windX, windZ);
        // up on the screen is the direction the camera looks; turning right lowers the yaw
        const screen = -(windYaw - cameraYaw);
        $('bw-wind-arrow').style.transform = `rotate(${screen}rad)`;
        $('bw-wind-arrow').style.opacity = strength < 0.05 ? '0.25' : '1';
        $('bw-wind-fill').style.width = `${share * 100}%`;
        $('bw-wind-text').textContent = strength < 0.05 ? 'Windstill' : `Wind ${strength.toFixed(1)}`;
    }

    stamina(value, max, visible) {
        $('bw-stamina').hidden = !visible;
        $('bw-stamina-fill').style.width = `${Math.max(0, Math.min(1, value / max)) * 100}%`;
    }

    teams(teams, bunnies, currentTeam) {
        const box = $('bw-teams');
        box.replaceChildren(el('h2', 'bw-teams__title', 'Teams'));
        // bunnies may be an iterator (Map.values()): read it once, not once per team
        const all = [...bunnies];
        for (const t of teams) {
            const own = all.filter(b => b.team === t.index);
            const hp = own.reduce((sum, b) => sum + Math.max(0, b.health), 0);
            const max = own.reduce((sum, b) => sum + b.maxHealth, 0) || 1;
            const row = el('div', `bw-team ${t.index === currentTeam ? 'is-current' : ''} ${t.out ? 'is-out' : ''}`);
            const head = el('div', 'bw-team__head');
            const sw = el('span', 'bw-swatch');
            sw.style.setProperty('--bw-team', t.color);
            head.append(sw, el('span', 'bw-team__name', t.name + (t.isBot ? ' 🤖' : '')), el('span', 'bw-team__hp', String(hp)));
            const bar = el('div', 'bw-bar bw-bar--team');
            const fill = el('span');
            fill.style.width = `${(hp / max) * 100}%`;
            fill.style.background = t.color;
            bar.append(fill);
            row.append(head, bar);
            if (t.kills > 0) row.append(el('small', 'bw-team__kills', `${t.kills} Treffer`));
            box.append(row);
        }
    }

    weapons(weapons, team, selectedId, enabled, onSelect) {
        const bar = $('bw-weapons');
        if (this.weaponButtons.size !== weapons.length) {
            bar.replaceChildren();
            this.weaponButtons.clear();
            weapons.forEach((w, i) => {
                const b = el('button', 'bw-weapon');
                b.type = 'button';
                b.title = `${w.name} – ${w.damage} Schaden, Radius ${w.radius} m${w.wind ? ', windanfällig' : ''}`;
                b.append(el('span', 'bw-weapon__key', String(i + 1)), el('span', 'bw-weapon__glyph', KIND_GLYPH[w.kind] ?? '•'), el('span', 'bw-weapon__name', w.name), el('span', 'bw-weapon__ammo', ''));
                b.onclick = () => onSelect(w.id);
                bar.append(b);
                this.weaponButtons.set(w.id, b);
            });
        }
        for (const w of weapons) {
            const b = this.weaponButtons.get(w.id);
            const left = ammoLeft(w, team);
            b.querySelector('.bw-weapon__ammo').textContent = left < 0 ? '∞' : String(left);
            b.classList.toggle('is-selected', w.id === selectedId);
            b.disabled = !enabled || left === 0;
        }
    }

    power(value, charging) {
        $('bw-power-fill').style.width = `${Math.round(value * 100)}%`;
        $('bw-power-fill').parentElement.classList.toggle('is-charging', charging);
    }

    aimInfo(text) {
        $('bw-aiminfo').textContent = text;
    }

    controls(canFire, canSkip, fireLabel) {
        $('bw-btn-fire').disabled = !canFire;
        $('bw-btn-fire').textContent = fireLabel ?? 'Feuer';
        $('bw-btn-skip').disabled = !canSkip;
    }

    chat({ name, color, text, system }) {
        const log = $('bw-chat-log');
        const line = el('div', `bw-chat__line ${system ? 'is-system' : ''}`);
        if (!system) {
            const who = el('strong', '', `${name}: `);
            who.style.color = color;
            line.append(who);
        }
        line.append(document.createTextNode(text));
        log.append(line);
        while (log.children.length > 80) log.firstChild.remove();
        log.scrollTop = log.scrollHeight;
    }
}

/** Shots left of a weapon for a team: -1 = unlimited. */
export function ammoLeft(weapon, team) {
    if (weapon.ammo < 0) return -1;
    const left = team?.ammo?.[String(weapon.id)];
    return left === undefined ? weapon.ammo : left;
}
