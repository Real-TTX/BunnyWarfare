// Everything on top of a match: the lobby room, the turn banner, timer, wind, teams, weapons, power, chat and the end with its podium.
import { $, el, icon, button, toast, copyText, themeName, LEVEL_NAMES } from './ui.js';
import { weaponIcon, seatBadge } from './icons.js';
import { mapCanvasByName } from './maps.js';
import { portrait } from './avatars.js';

export class Hud {
    constructor() {
        this.root = $('bw-hud');
        this.weaponButtons = new Map();
        this.lobbyMap = null;
        this.chatLogs = [$('bw-chat-log')];
        this.teamPortraits = new Map(); // "index|look" -> portrait element (kept between redraws: no flicker)
    }

    show(on) {
        this.root.hidden = !on;
    }

    // ------------------------------------------------------------ lobby

    /** The room before the start: seats, bots, rules, the map of the world, the chat. actions: addBot, remove, start, leave. */
    lobby(room, me, actions) {
        const layer = $('layer-lobby');
        layer.hidden = false;
        const host = room.hostPlayerId === me;
        const panel = layer.querySelector('.panel') ?? this.buildLobby(layer, actions);

        panel.querySelector('[data-name]').textContent = room.name;
        const slots = panel.querySelector('[data-slots]');
        slots.replaceChildren();
        for (const s of room.slots) {
            const mine = s.playerId === me;
            const li = el('li', `slot${mine ? ' is-me' : ''}`);
            const text = el('div', null, [
                el('strong', null, s.teamName),
                el('small', null, s.isBot ? `Computer · ${LEVEL_NAMES[s.botLevel] ?? s.botLevel}` : s.playerName),
            ]);
            const actionsBox = el('div', 'actions');
            if (s.playerId === room.hostPlayerId) actionsBox.append(el('span', 'badge host', 'Gastgeber'));
            if (mine) actionsBox.append(el('span', 'badge mine', 'Du'));
            const dot = el('span', `dot${s.connected ? ' on' : ''}`);
            dot.title = s.connected ? 'verbunden' : 'nicht verbunden';
            actionsBox.append(dot);
            if ((host && !mine) || (!host && mine)) {
                actionsBox.append(button(null, {
                    className: 'round-btn small', iconName: 'x', title: host ? 'Entfernen' : 'Platz freigeben', onClick: () => actions.remove(s.teamIndex),
                }));
            }
            li.append(portrait(s, { size: 54, level: s.level || null, className: s.isBot ? 'is-bot' : '' }), text, actionsBox);
            slots.append(li);
        }
        for (let i = room.slots.length; i < room.maxTeams; i++) {
            const li = el('li', 'slot is-free');
            const text = el('div', null, [el('strong', null, 'Freier Platz'), el('small', null, host ? 'Einladen oder einen Bot dazunehmen' : 'Wartet auf Mitspieler')]);
            const box = el('div', 'actions');
            if (host) {
                for (const level of ['Easy', 'Normal', 'Hard']) {
                    box.append(button(`+ ${LEVEL_NAMES[level]}`, { className: 'btn small', title: `Bot (${LEVEL_NAMES[level]}) dazunehmen`, onClick: () => actions.addBot(level) }));
                }
            }
            li.append(seatBadge('#e9dccb', false, true), text, box);
            slots.append(li);
        }

        const rules = panel.querySelector('[data-rules]');
        rules.replaceChildren(...[
            themeName(room.theme) !== room.worldName ? el('span', null, themeName(room.theme)) : null,
            el('span', null, `${room.bunniesPerTeam} Hasen pro Team`),
            el('span', null, `${room.bunnyHealth} Leben`),
            el('span', null, `${room.turnSeconds} s pro Zug`),
            room.crateRate !== undefined && room.crateRate !== null ? el('span', null, ['Keine Kisten', 'Selten Kisten', 'Kisten', 'Oft Kisten'][room.crateRate] ?? 'Kisten') : null,
            el('span', null, `bis ${room.maxTeams} Teams`)].filter(Boolean));
        panel.querySelector('[data-world]').textContent = room.worldName;
        if (this.lobbyMap?.name !== room.worldName) {
            const holder = panel.querySelector('[data-map]');
            const canvas = mapCanvasByName(room.worldName);
            holder.replaceChildren(canvas);
            this.lobbyMap = { name: room.worldName };
        }

        const start = panel.querySelector('[data-start]');
        start.hidden = !host;
        start.disabled = room.slots.length < 2;
        panel.querySelector('[data-hint]').textContent = host
            ? (room.slots.length < 2 ? 'Lade Freunde mit dem Link ein oder nimm einen Bot dazu – ab zwei Teams geht es los.' : 'Alles bereit? Dann ab aufs Schlachtfeld!')
            : 'Gleich geht es los – der Gastgeber startet das Spiel.';
    }

    buildLobby(layer, actions) {
        const panel = el('section', 'panel wide');
        panel.setAttribute('aria-label', 'Lobby');
        const head = el('div', 'panel-head', [
            button(null, { className: 'round-btn', iconName: 'back', title: 'Lobby verlassen', onClick: () => actions.leave() }),
            el('h2', 'title', [document.createTextNode('Lobby '), el('span', 'tag', '')]),
            el('span', 'spacer'),
            actions.link() == null ? null : button('Einladungslink kopieren', {
                className: 'btn small', iconName: 'link', onClick: async () => {
                    const link = actions.link();
                    if (await copyText(link)) toast('Einladungslink kopiert.', 'success');
                    else window.prompt('Einladungslink:', link);
                },
            }),
        ]);
        head.querySelector('.tag').dataset.name = '';
        const slots = el('ul', 'slots');
        slots.dataset.slots = '';
        slots.style.listStyle = 'none';
        slots.style.margin = '0';
        slots.style.padding = '0';

        const left = el('div', 'stack', [el('h3', 'h3', [icon('users'), document.createTextNode('Teams')]), slots]);
        // the chat goes under the seats, so the island and the rules fit beside them
        const map = el('div', 'lobby-world');
        map.dataset.map = '';
        const worldName = el('div', 'muted');
        worldName.dataset.world = '';
        worldName.style.textAlign = 'center';
        worldName.style.marginTop = '8px';
        const rules = el('div', 'rules');
        rules.dataset.rules = '';

        const chatLog = el('div', 'chatlog');
        chatLog.setAttribute('aria-live', 'polite');
        this.chatLogs.push(chatLog);
        const chatInput = el('input', 'field');
        chatInput.maxLength = 200;
        chatInput.placeholder = 'Sag hallo …';
        chatInput.setAttribute('aria-label', 'Chat-Nachricht');
        const chatForm = el('form', 'chatform', [chatInput, button(null, { className: 'round-btn small', iconName: 'arrow-right', title: 'Senden', type: 'submit' })]);
        chatForm.addEventListener('submit', e => {
            e.preventDefault();
            const text = chatInput.value.trim();
            chatInput.value = '';
            if (text) actions.chat(text);
        });

        const right = el('div', 'stack', [
            el('h3', 'h3', [icon('globe-map'), document.createTextNode('Insel')]),
            map, worldName, rules,
        ]);
        left.append(el('div', 'lobby-chat', [el('h3', 'h3', [icon('message-square'), document.createTextNode('Chat')]), chatLog, chatForm]));

        const hint = el('p', 'sub');
        hint.dataset.hint = '';
        const start = button('Spiel starten', { className: 'btn big primary', iconName: 'play', onClick: () => actions.start() });
        start.dataset.start = '';
        const foot = el('div', 'panel-foot', [hint, el('span', 'spacer'), button('Verlassen', { className: 'btn ghost', iconName: 'logout', onClick: () => actions.leave() }), start]);

        panel.append(head, el('div', 'grid2', [left, right]), foot);
        layer.replaceChildren(panel);
        return panel;
    }

    hideLobby() {
        const layer = $('layer-lobby');
        layer.hidden = true;
        const log = layer.querySelector('.chatlog');
        this.chatLogs = this.chatLogs.filter(l => l !== log);
        layer.replaceChildren();
        this.lobbyMap = null;
    }

    // ------------------------------------------------------------ game over

    /** The end: winner, podium, ranking. actions: again, menu, view (hide the panel and look at the island). */
    gameOver(result, myTeam, actions) {
        const layer = $('layer-over');
        layer.hidden = false;
        const teams = [...(result.teams ?? [])].sort((a, b) => (a.placement || 99) - (b.placement || 99));
        const won = !result.aborted && result.winnerTeam !== null && result.winnerTeam !== undefined && result.winnerTeam === myTeam;
        const title = result.aborted ? 'Abgebrochen' : !result.winnerName ? 'Unentschieden' : won ? 'Sieg!' : myTeam === null ? 'Vorbei!' : 'Verloren!';
        const sub = result.aborted
            ? 'Das Spiel wurde vorzeitig beendet.'
            : !result.winnerName ? 'Kein Hase hat überlebt.'
                : won ? `${result.winnerName} gewinnt – Ehre den Löffelohren!` : `${result.winnerName} gewinnt. Nächstes Mal klappt’s!`;

        const podium = el('div', 'podium');
        const order = [teams[1], teams[0], teams[2]];
        const classes = ['second', 'first', 'third'];
        order.forEach((t, i) => {
            if (!t) return;
            const avatar = portrait(t, { size: i === 1 ? 92 : 74, level: (t.levelAfter || t.level) || null, className: 'podium-portrait' });
            podium.append(el('div', `place ${classes[i]}`, [
                el('div', 'who', [avatar, el('b', null, t.name), el('small', null, `${t.kills} K.O. · ${t.damage} Schaden`)]),
                el('div', 'block', String(t.placement || '–')),
            ]));
        });

        const table = el('table', 'table');
        table.innerHTML = '<thead><tr><th>Platz</th><th>Team</th><th class="num">K.O.</th><th class="num">Schaden</th></tr></thead>';
        const body = el('tbody');
        for (const t of teams) {
            const tr = el('tr', t.index === myTeam ? 'is-me' : null);
            const sw = el('span', 'swatch');
            sw.style.setProperty('--c', t.color);
            tr.append(
                el('td', 'rank', t.placement > 0 ? `${t.placement}.` : '–'),
                el('td', null, el('div', 'teamcell', [sw, el('span', null, `${t.name}${t.isBot ? ' (Bot)' : ''}`)])),
                el('td', 'num', String(t.kills)),
                el('td', 'num', String(t.damage)));
            body.append(tr);
        }
        table.append(body);

        const panel = el('section', 'panel', [
            el('div', 'over-head', [el('div', 'crown', result.aborted ? '🏳️' : won ? '🏆' : result.winnerName ? '🥕' : '🤝'), el('h2', 'title', title), el('p', 'lead muted', sub)]),
            podium,
            this.xpGain(teams.find(t => t.index === myTeam && !t.isBot), result.aborted),
            table,
            el('div', 'panel-foot', [
                actions.view ? button('Insel ansehen', { className: 'btn ghost', iconName: 'eye', onClick: () => actions.view() }) : null,
                el('span', 'spacer'),
                button('Zum Menü', { className: 'btn', iconName: 'home', onClick: () => actions.menu() }),
                button('Nochmal!', { className: 'btn big primary', iconName: 'refresh', onClick: () => actions.again() }),
            ]),
        ]);
        layer.replaceChildren(panel);
    }

    /** What the match brought the own team: XP, a level up, new things for the wardrobe. */
    xpGain(mine, aborted) {
        if (!mine) return null;
        if (aborted || !mine.xpGained) return el('div', 'xp-gain is-none', [el('span', 'muted', aborted ? 'Abgebrochene Spiele bringen keine XP.' : 'Diesmal gab es keine XP.')]);
        const up = mine.levelAfter > mine.levelBefore;
        const unlocked = mine.unlocked ?? [];
        const kinds = { fur: 'Fell', outfit: 'Hut', face: 'Gesicht', frame: 'Rahmen' };
        const box = el('div', `xp-gain${up ? ' is-up' : ''}`, [
            portrait(mine, { size: 64, level: mine.levelAfter, className: up ? 'pop' : '' }),
            el('div', 'xp-text', [
                el('b', 'xp-plus', `+${mine.xpGained} XP`),
                up ? el('span', 'levelup', `Level ${mine.levelAfter}!`) : el('span', 'muted', `Level ${mine.levelAfter}`),
            ]),
        ]);
        if (unlocked.length) {
            box.append(el('div', 'unlocks', [
                el('small', null, 'Neu im Kleiderschrank:'),
                el('div', 'row', unlocked.slice(0, 6).map(u => el('span', 'unlock', [portrait({ ...mine, [u.kind]: u.key }, { size: 40 }), el('span', null, [el('b', null, u.name), el('small', null, kinds[u.kind] ?? '')])]))),
            ]));
        }
        return box;
    }

    hideOver() {
        const layer = $('layer-over');
        layer.hidden = true;
        layer.replaceChildren();
    }

    // ------------------------------------------------------------ turn

    turn({ title, sub, color, mine }) {
        $('bw-turn-title').textContent = title;
        $('bw-turn-sub').textContent = sub ?? '';
        const box = $('bw-turn');
        box.style.setProperty('--c', color ?? '#9a8a78');
        box.classList.toggle('is-mine', !!mine);
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
        const arrow = $('bw-wind-arrow');
        arrow.style.transform = `rotate(${screen}rad)`;
        arrow.style.opacity = strength < 0.05 ? '0.25' : '1';
        $('bw-wind-fill').style.width = `${share * 100}%`;
        $('bw-wind-text').textContent = strength < 0.05 ? 'Windstill' : `Wind ${strength.toFixed(1).replace('.', ',')}`;
    }

    stamina(value, max, visible) {
        $('bw-stamina').hidden = !visible;
        $('bw-stamina-fill').style.width = `${Math.max(0, Math.min(1, value / max)) * 100}%`;
    }

    teams(teams, bunnies, currentTeam) {
        const box = $('bw-teams');
        box.replaceChildren(el('h2', null, 'Teams'));
        // bunnies may be an iterator (Map.values()): read it once, not once per team
        const all = [...bunnies];
        for (const t of teams) {
            const own = all.filter(b => b.team === t.index);
            const hp = own.reduce((sum, b) => sum + Math.max(0, b.health), 0);
            const max = own.reduce((sum, b) => sum + b.maxHealth, 0) || 1;
            const alive = own.filter(b => b.alive !== false && b.health > 0).length;
            const key = `${t.index}|${t.fur}|${t.outfit}|${t.face}|${t.frame}|${t.color}`;
            let face = this.teamPortraits.get(key);
            if (!face) {
                face = portrait(t, { size: 30, level: t.level || null, className: 'mini' });
                this.teamPortraits.set(key, face);
            }
            const fill = el('i');
            fill.style.width = `${(hp / max) * 100}%`;
            fill.style.background = t.color;
            // what the team got from crates and has not used yet
            const effects = (t.effects ?? []).map(e => el('span', `fx-badge fx-${e}`, e === 'double' ? '×2' : e === 'turbo' ? 'Turbo' : e));
            const row = el('div', `hteam${t.index === currentTeam ? ' is-current' : ''}${t.out ? ' is-out' : ''}`, [
                el('div', 'head', [face, el('span', 'name', t.name + (t.isBot ? ' · Bot' : '')), ...effects, el('span', null, String(hp))]),
                el('div', 'bar', fill),
                el('small', null, `${alive} Hasen${t.kills > 0 ? ` · ${t.kills} K.O.` : ''}`),
            ]);
            box.append(row);
        }
    }

    weapons(weapons, team, selectedId, enabled, onSelect) {
        const bar = $('bw-weapons');
        if (this.weaponButtons.size !== weapons.length) {
            bar.replaceChildren();
            this.weaponButtons.clear();
            weapons.forEach((w, i) => {
                const b = el('button', 'weapon');
                b.type = 'button';
                b.title = w.kind === 'Teleport'
                    ? `${w.name} – buddelt deinen Hasen an eine andere Stelle${w.ammo === 0 ? ' (nur aus Kisten)' : ''}`
                    : `${w.name} – ${w.damage} Schaden, Radius ${String(w.radius).replace('.', ',')} m${w.wind ? ', windanfällig' : ''}${w.ammo === 0 ? ' (nur aus Kisten)' : ''}`;
                if (w.ammo === 0) b.classList.add('is-crate-only');
                b.append(el('span', 'key', String(i + 1)), weaponIcon(w.kind, w.name), el('span', 'nm', w.name), el('span', 'ammo', ''));
                b.onclick = () => onSelect(w.id);
                bar.append(b);
                this.weaponButtons.set(w.id, b);
            });
        }
        for (const w of weapons) {
            const b = this.weaponButtons.get(w.id);
            const left = ammoLeft(w, team);
            b.querySelector('.ammo').textContent = left < 0 ? '∞' : String(left);
            b.classList.toggle('is-on', w.id === selectedId);
            b.disabled = !enabled || left === 0;
        }
    }

    resetWeapons() {
        this.weaponButtons.clear();
        $('bw-weapons').replaceChildren();
    }

    power(value, charging) {
        $('bw-power-fill').style.width = `${Math.round(value * 100)}%`;
        $('bw-power').classList.toggle('is-charging', charging);
    }

    /** The bird's-eye view is on (the round HUD button shows it). */
    birdsEye(on) {
        const button = $('bw-btn-bird');
        if (button && button.classList.contains('is-on') !== !!on) button.classList.toggle('is-on', !!on);
    }

    aimInfo(text) {
        $('bw-aiminfo').textContent = text;
    }

    controls(canFire, canSkip, fireLabel) {
        const fire = $('bw-btn-fire');
        fire.disabled = !canFire;
        fire.querySelector('span').textContent = fireLabel ?? 'Feuer';
        $('bw-btn-skip').disabled = !canSkip;
    }

    chat({ name, color, text, system }) {
        for (const log of this.chatLogs) {
            const line = el('div', `line${system ? ' sys' : ''}`);
            if (!system) {
                const who = el('strong', null, `${name}: `);
                who.style.color = color;
                line.append(who);
            }
            line.append(document.createTextNode(text));
            log.append(line);
            while (log.children.length > 80) log.firstChild.remove();
            log.scrollTop = log.scrollHeight;
        }
    }

    clearChat() {
        $('bw-chat-log').replaceChildren();
    }
}

/** Shots left of a weapon for a team: -1 = unlimited. */
export function ammoLeft(weapon, team) {
    if (weapon.ammo < 0) return -1;
    const left = team?.ammo?.[String(weapon.id)];
    return left === undefined ? weapon.ammo : left;
}
