// The menus of the player app over the living island: sign-in, the main menu and its panels
// (quick match, open matches, new match, leaderboard, profile & team, guide, about).
import { $, el, icon, button, segmented, field, toast, themeName, LEVEL_NAMES } from './ui.js';
import { logo, bunnyAvatar, weaponIcon, speakerIcon } from './icons.js';
import { api, session, worlds, ApiError, status } from './api.js';
import { mapCanvas, mapCanvasByName } from './maps.js';
import { portrait, updatePortrait, levelBadge, sizeBadge } from './avatars.js';
import { BunnyPreview, lookOf } from './portrait.js';
import { shotElement } from './thumbs.js';

const TOKEN_IN_LINK = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

/** How often supply crates fall (Match.CrateRate 0..3). */
const CRATE_RATES = ['Aus', 'Selten', 'Normal', 'Oft'];
const BOT_NAMES = ['Rübenräuber', 'Möhrenmafia', 'Kohlkopf-Klan'];
const BOT_COLORS = ['#2563eb', '#16a34a', '#9333ea'];
const WILD = {
    fur: ['tiger', 'zebra', 'neon', 'lava', 'galaxy', 'gold', 'rainbow', 'pink', 'mint', 'spotted', 'ginger', 'black'],
    outfit: ['viking', 'pirate', 'mohawk', 'crown', 'horns', 'party', 'cowboy', 'astronaut', 'carrot', 'tophat', 'bandana'],
    face: ['sunglasses', 'eyepatch', 'warpaint', 'mustache', 'lasers', 'scar', 'goggles', 'monocle'],
    frame: ['fire', 'galaxy', 'gold', 'legend', 'silver'],
};

/** A random wild look for a computer bunny of the quick match (shown only; the server dresses the real bots). */
function randomBotLook(i) {
    const pick = list => list[Math.floor(Math.random() * list.length)];
    return { fur: pick(WILD.fur), outfit: pick(WILD.outfit), face: pick(WILD.face), frame: pick(WILD.frame), color: BOT_COLORS[i % BOT_COLORS.length] };
}

/** Shows the message of an ApiError at its field (when it has one of these inputs) or as a toast. */
function showError(error, inputs = {}) {
    const message = error instanceof ApiError || error?.message ? error.message : 'Das hat nicht geklappt.';
    const target = error?.field ? inputs[error.field] : null;
    if (target) {
        target.input.classList.add('is-invalid');
        target.error.textContent = message;
        target.input.focus();
    } else {
        toast(message);
    }
}

async function busy(buttonElement, work) {
    buttonElement.disabled = true;
    try {
        return await work();
    } finally {
        buttonElement.disabled = false;
    }
}

export class Menu {
    /** app: stage, sound, showcase, startMatch(token, options), signedIn(), signedOut(), returnUrl */
    constructor(app) {
        this.app = app;
        this.panel = null;
        this.refreshTimer = 0;
        this.home = null;
        window.addEventListener('keydown', e => {
            if (e.key === 'Escape' && this.panel && !$('layer-panel').hidden) {
                e.preventDefault();
                this.closePanel();
            }
        });
    }

    // ------------------------------------------------------------ layers

    hideAll() {
        $('layer-auth').hidden = true;
        $('layer-auth').replaceChildren();
        $('menu').hidden = true;
        this.closePanel(false);
    }

    blur(mode) {
        const stage = $('bw-stage');
        stage.classList.toggle('is-soft', mode === 'soft');
        stage.classList.toggle('is-blurred', mode === 'strong');
    }

    /** The 3D bunny of the wardrobe lives only while its panel is open. */
    disposePreview() {
        this.preview?.dispose();
        this.preview = null;
    }

    openPanel(kind, content) {
        clearInterval(this.refreshTimer);
        if (!content.contains(this.preview?.container)) this.disposePreview();
        const layer = $('layer-panel');
        layer.replaceChildren(content);
        layer.hidden = false;
        $('menu').hidden = true;
        this.panel = kind;
        this.blur('strong');
        const first = content.querySelector('input, button.btn.primary');
        if (first && matchMedia('(pointer: fine)').matches) setTimeout(() => first.focus(), 60);
    }

    closePanel(toMenu = true) {
        clearInterval(this.refreshTimer);
        this.disposePreview();
        const layer = $('layer-panel');
        layer.hidden = true;
        layer.replaceChildren();
        const wasOpen = !!this.panel;
        this.panel = null;
        if (toMenu && wasOpen) {
            if (session.signedIn) this.showMain();
            else this.showAuth();
        }
    }

    head(title, { back = true, extra = [] } = {}) {
        return el('div', 'panel-head', [
            back ? button(null, { className: 'round-btn', iconName: 'back', title: 'Zurück (Esc)', onClick: () => this.closePanel() }) : null,
            el('h2', 'title', title),
            el('span', 'spacer'),
            ...extra,
        ]);
    }

    // ------------------------------------------------------------ sign-in

    showAuth(mode = null) {
        this.hideAll();
        this.blur('soft');
        const layer = $('layer-auth');
        layer.hidden = false;
        const wrap = el('div', 'stack', [el('div', 'auth-logo', logo())]);
        wrap.style.alignItems = 'center';
        wrap.style.width = '100%';
        if (session.mode === 'unreachable') {
            wrap.append(this.unreachablePanel());
            layer.replaceChildren(wrap);
            return;
        }

        const kind = mode ?? 'login';
        const panel = el('section', 'panel narrow');
        const tabs = el('div', 'tabs row center');
        const tab = (label, value) => {
            const c = el('button', `chip${kind === value ? ' is-on' : ''}`, label);
            c.type = 'button';
            c.onclick = () => this.showAuth(value);
            return c;
        };
        tabs.append(tab('Anmelden', 'login'));
        if (session.canRegister) tabs.append(tab('Registrieren', 'register'));
        if (session.guests) tabs.append(tab('Als Gast', 'guest'));

        const inputs = {};
        const form = el('form', 'stack');
        form.noValidate = true;
        let submitText = 'Los geht’s!';
        let submitIcon = 'login';
        if (kind === 'register') {
            inputs.displayName = field('Dein Name', { maxLength: 60, autocomplete: 'nickname', placeholder: 'So sehen dich die anderen' });
            inputs.loginName = field('Anmeldename', { maxLength: 40, autocomplete: 'username' });
            inputs.password = field('Passwort', { type: 'password', maxLength: 100, autocomplete: 'new-password', placeholder: 'mindestens 6 Zeichen' });
            form.append(inputs.displayName.row, inputs.loginName.row, inputs.password.row);
            submitText = 'Konto anlegen';
            submitIcon = 'user';
        } else if (kind === 'guest') {
            inputs.name = field('Dein Name', { maxLength: 24, autocomplete: 'nickname', placeholder: 'So sehen dich die anderen' });
            form.append(inputs.name.row, el('p', 'hint', 'Ohne Passwort und ohne Rangliste. Aus dem Gast wird später mit einem Klick ein Konto – Level und Kleiderschrank bleiben.'));
            submitText = 'Als Gast spielen';
            submitIcon = 'play';
        } else {
            inputs.loginName = field('Anmeldename', { maxLength: 40, autocomplete: 'username' });
            inputs.password = field('Passwort', { type: 'password', maxLength: 100, autocomplete: 'current-password' });
            form.append(inputs.loginName.row, inputs.password.row);
        }
        const submit = button(submitText, { className: 'btn big primary block', iconName: submitIcon, type: 'submit' });
        form.append(submit);
        form.addEventListener('submit', async e => {
            e.preventDefault();
            await busy(submit, async () => {
                try {
                    if (kind === 'register') await api.register(inputs.displayName.input.value, inputs.loginName.input.value, inputs.password.input.value);
                    else if (kind === 'guest') await api.guest(inputs.name.input.value);
                    else await api.login(inputs.loginName.input.value, inputs.password.input.value);
                    this.app.signedIn();
                } catch (error) {
                    showError(error, inputs);
                }
            });
        });
        panel.append(tabs.children.length > 1 ? tabs : el('div'), form);
        if (kind === 'login' && api.isApp) panel.append(this.browserSignIn());
        if (kind === 'login' && !session.canRegister) panel.append(el('p', 'hint', 'Neue Konten legt die Administration an.'));
        if (api.isApp) panel.append(this.serverLine());
        wrap.append(panel);
        layer.replaceChildren(wrap);
        setTimeout(() => (inputs.displayName ?? inputs.name ?? inputs.loginName).input.focus(), 80);
    }

    /** Apps: sign in on the master's page in the system browser (MatIdentity too); the app waits for the confirmation. */
    browserSignIn() {
        const box = el('div', 'stack');
        const b = button('Im Browser anmelden', { className: 'btn block', iconName: 'external' });
        b.onclick = () => busy(b, async () => {
            const controller = new AbortController();
            const code = el('div', 'device-code');
            const cancel = button('Abbrechen', { className: 'btn small', onClick: () => controller.abort() });
            try {
                await api.deviceLogin(({ code: text }) => {
                    code.replaceChildren(el('span', 'muted', 'Bestätige im Browser diesen Code:'), el('b', null, text), cancel);
                    box.append(code);
                }, controller.signal);
                this.app.signedIn();
            } catch (error) {
                code.remove();
                showError(error);
            }
        });
        box.append(b);
        return box;
    }

    /** Apps: which master the app plays on, and the ways to another one or offline. */
    serverLine() {
        const name = session.serverName ?? session.server ?? 'Offline';
        return el('div', 'server-line', [
            el('span', `net-badge is-${session.mode}`, session.mode === 'online' ? 'Online' : 'Offline'),
            el('span', 'muted', name),
            el('span', 'spacer'),
            button('Server', { className: 'btn small', iconName: 'server', onClick: () => this.showServers() }),
            button('Offline spielen', { className: 'btn small', iconName: 'gamepad', onClick: () => this.app.reconnect(null) }),
        ]);
    }

    /** The master could not be reached (or the app is too old for it): again, another server, or offline. */
    unreachablePanel() {
        const update = status.value === 'update';
        return el('section', 'panel narrow', [
            el('div', 'panel-head center', el('h2', 'title small', update ? 'Update nötig' : 'Server nicht erreichbar')),
            el('p', 'lead', session.problem ?? 'Der Server antwortet gerade nicht.'),
            el('p', 'muted', session.server ?? ''),
            el('div', 'panel-foot', [
                button('Nochmal', { className: 'btn', iconName: 'refresh', onClick: () => this.app.reconnect() }),
                button('Anderer Server', { className: 'btn', iconName: 'server', onClick: () => this.showServers() }),
                el('span', 'spacer'),
                button('Offline spielen', { className: 'btn primary', iconName: 'gamepad', onClick: () => this.app.reconnect(null) }),
            ]),
        ]);
    }

    /** Apps: the masters – the built-in one, own addresses (tested before they are used), offline play. */
    async showServers() {
        $('layer-auth').hidden = true;
        const list = el('div', 'servers');
        const current = await api.currentServer();
        const draw = async () => {
            const known = await api.servers();
            list.replaceChildren(...known.map(s => {
                const on = s.url === current;
                return el('div', `server${on ? ' is-on' : ''}`, [
                    el('span', 'server-icon', icon(on ? 'check-circle' : 'server')),
                    el('div', 'server-text', [el('b', null, s.name ?? s.url.replace(/^https?:\/\//, '')), el('small', 'muted', s.builtIn ? `${s.url} · voreingestellt` : s.url)]),
                    el('span', 'spacer'),
                    on && session.mode === 'online'
                        ? el('span', 'net-badge is-online', 'Verbunden')
                        : button('Verbinden', { className: 'btn small primary', onClick: () => this.app.reconnect(s.url) }),
                    s.builtIn ? null : button(null, {
                        className: 'round-btn', iconName: 'trash', title: 'Entfernen', onClick: async () => {
                            await api.removeServer(s.url);
                            draw();
                        },
                    }),
                ]);
            }));
        };
        await draw();
        const address = field('Adresse eines Servers', { maxLength: 200, placeholder: 'games.example.com', autocomplete: 'url' });
        const result = el('p', 'hint', 'Jede MatGame-Installation mit BunnyWarfare: Adresse eingeben, testen, verbinden.');
        const test = button('Testen', { className: 'btn', iconName: 'search' });
        test.onclick = () => busy(test, async () => {
            try {
                const doc = await api.testServer(address.input.value);
                result.textContent = `✔ ${doc.name ?? 'MatGame'} · Version ${doc.version}`;
            } catch (error) {
                result.textContent = `✘ ${error.message}`;
            }
        });
        const add = button('Verbinden', { className: 'btn primary', iconName: 'plug' });
        add.onclick = () => busy(add, async () => {
            try {
                await api.testServer(address.input.value);
                await this.app.reconnect(address.input.value);
            } catch (error) {
                result.textContent = `✘ ${error.message}`;
            }
        });
        const offline = button('Offline spielen', { className: 'btn', iconName: 'gamepad', onClick: () => this.app.reconnect(null) });
        const lead = session.mode === 'offline'
            ? 'Du spielst gerade offline auf diesem Gerät – gegen Bots oder abwechselnd zu mehreren.'
            : `Du spielst auf ${session.serverName ?? session.server ?? '–'}.`;
        const panel = el('section', 'panel', [
            this.head('Server'),
            el('p', 'lead', lead),
            list,
            el('div', 'stack', [address.row, el('div', 'row', [test, add]), result]),
            el('div', 'panel-foot', [el('span', 'sub', 'Offline bleibt dein Fortschritt auf diesem Gerät.'), el('span', 'spacer'), offline]),
        ]);
        this.openPanel('servers', panel);
    }

    // ------------------------------------------------------------ main menu

    async showMain() {
        const layer = $('menu');
        $('layer-auth').hidden = true;
        this.closePanel(false);
        layer.hidden = false;
        this.blur('soft');
        if (!layer.dataset.built || layer.dataset.player !== String(session.player?.id)) this.buildMain(layer);
        this.loadHome();
    }

    buildMain(layer) {
        layer.dataset.built = '1';
        layer.dataset.player = String(session.player?.id ?? '');
        const p = session.player;

        const avatar = portrait(p, { size: 46, level: p.level ?? 1 });
        avatar.dataset.me = '';
        const chip = el('button', 'player-chip', [avatar, el('span', 'name', [document.createTextNode(p.displayName), el('small', null, p.teamName)])]);
        chip.type = 'button';
        chip.title = 'Profil & Kleiderschrank';
        chip.onclick = () => this.showProfile();
        // online or offline, and on which master (in the app a click changes the server)
        const online = session.mode === 'online';
        const net = el('button', `net-badge is-${session.mode}`, online ? (session.serverName ?? 'Online') : 'Offline');
        net.type = 'button';
        net.title = api.isApp ? 'Server wechseln' : (session.server ?? '');
        if (api.isApp) net.onclick = () => this.showServers();
        const top = el('div', 'menu-top', [
            chip,
            el('span', 'spacer'),
            net,
            p.isAdmin && online ? el('a', 'btn small', [icon('shield'), el('span', null, 'Administration')]) : null,
            online ? button(null, { className: 'round-btn', iconName: 'logout', title: 'Abmelden', onClick: () => this.app.signOut() }) : null,
        ]);
        const adminLink = top.querySelector('a.btn');
        if (adminLink) {
            adminLink.href = `${api.isApp ? session.server : ''}/Admin`;
            if (api.isApp) adminLink.target = '_blank';
        }

        const card = (cls, iconNode, title, sub, onClick) => {
            const b = el('button', `mcard ${cls}`, [el('span', 'mc-orb', el('span', 'mc-icon', iconNode)), el('span', 'mc-title', title), el('span', 'mc-sub', sub)]);
            b.type = 'button';
            b.onclick = () => {
                this.app.sound.tick?.();
                onClick();
            };
            return b;
        };
        const cards = el('div', 'menu-cards', [
            card('carrot', weaponIcon('Projectile'), 'Schnellspiel', 'Gegen Bots', () => this.showQuick()),
            card('sky', icon('globe'), 'Online', 'Mit Freunden spielen', () => this.showOnline()),
            card('leaf', icon('plus'), 'Neues Spiel', 'Eigene Regeln', () => this.showCreate()),
            card('plum', icon('trophy'), 'Rangliste', 'Die besten Löffel', () => this.showLeaderboard()),
        ]);
        const small = el('div', 'menu-small', [
            button('Profil', { className: 'btn small', iconName: 'user', onClick: () => this.showProfile() }),
            button('Kleiderschrank', { className: 'btn small', iconName: 'sparkles', onClick: () => this.showProfile('wardrobe') }),
            button('Anleitung', { className: 'btn small', iconName: 'book', onClick: () => this.showGuide() }),
        ]);

        const sound = button(null, { className: 'round-btn sound-btn', title: 'Ton an/aus' });
        sound.append(speakerIcon());
        const syncSound = () => {
            sound.classList.toggle('is-off', this.app.sound.muted);
            sound.title = this.app.sound.muted ? 'Ton ist aus' : 'Ton ist an';
        };
        sound.onclick = () => {
            this.app.sound.toggle();
            syncSound();
        };
        syncSound();
        const stats = el('div', 'stats-card');
        stats.dataset.stats = '';
        const version = el('button', 'ver', `BUNNYWARFARE · ${session.version}`);
        version.type = 'button';
        version.onclick = () => this.showAbout();
        const foot = el('div', 'menu-foot', [el('div', 'stack', [stats, el('div', 'row', [sound])]), version]);
        const announce = el('div', 'announce');
        announce.hidden = true;
        announce.dataset.announce = '';

        layer.replaceChildren(top, logo(), announce, cards, small, foot);
    }

    async loadHome() {
        try {
            const home = await api.get('/home');
            this.home = home;
            const layer = $('menu');
            const me = layer.querySelector('[data-me]');
            if (me && home.player) {
                Object.assign(session.player, home.player);
                updatePortrait(me, session.player, home.player.level);
            }
            const announce = layer.querySelector('[data-announce]');
            if (announce) {
                announce.hidden = !home.announcement;
                announce.replaceChildren(icon('bell'), el('span', null, home.announcement ?? ''));
            }
            const stats = layer.querySelector('[data-stats]');
            if (stats) {
                const s = home.stats ?? {};
                const grid = el('div', 'stats-grid', [
                    el('div', null, [el('b', null, String(s.gamesPlayed ?? 0)), el('span', null, 'Spiele')]),
                    el('div', null, [el('b', null, String(s.gamesWon ?? 0)), el('span', null, 'Siege')]),
                    el('div', null, [el('b', null, String(s.kills ?? 0)), el('span', null, 'K.O.')]),
                    el('div', null, [el('b', null, s.rank ? `#${s.rank}` : '–'), el('span', null, 'Rang')]),
                ]);
                const list = el('ul', 'history');
                for (const h of (home.history ?? []).slice(0, 3)) {
                    const result = h.status === 'Aborted' ? 'abgebr.' : h.placement === 1 ? 'Sieg!' : `${h.placement}. Platz`;
                    list.append(el('li', null, [el('span', null, h.worldName), h.xpGained > 0 ? el('span', 'xp', `+${h.xpGained} XP`) : null, el('span', h.placement === 1 ? 'win' : null, result)]));
                }
                stats.replaceChildren(el('h3', null, [icon('bar-chart'), document.createTextNode('Deine Bilanz')]), grid, list.children.length ? list : el('p', 'hint', 'Noch keine Spiele – auf geht’s!'));
            }
        } catch (error) {
            if (error?.status === 401) this.app.signedOut();
        }
    }

    // ------------------------------------------------------------ quick match

    /** The big picture of the chosen island (quick match): screenshot, name, theme, size, description and hints. */
    featureOf(w) {
        if (!w) {
            return el('div', 'feature is-random', [
                el('div', 'shot big dice', el('span', null, '🎲')),
                el('div', 'feature-text', [
                    el('h3', 'feature-name', 'Zufallsinsel'),
                    el('div', 'row', [el('span', 'badge theme', 'Überraschung')]),
                    el('p', null, 'Irgendeine Insel – mal klein und knackig, mal groß mit Höhlen und Häusern.'),
                ]),
            ]);
        }
        const hints = [
            w.gravity < 6 ? '🪶 wenig Schwerkraft' : null,
            w.maxWind >= 4 ? '💨 viel Wind' : w.maxWind <= 1.5 ? '🍃 kaum Wind' : null,
            w.theme === 'Volcano' ? '🔥 Lava statt Wasser' : null,
        ].filter(Boolean);
        return el('div', 'feature', [
            shotElement(w.id, 'shot big'),
            el('div', 'feature-text', [
                el('h3', 'feature-name', w.name),
                el('div', 'row', [el('span', `badge theme theme-${w.theme}`, w.themeName ?? themeName(w.theme)), sizeBadge(w.width), el('span', 'muted', `${Math.round(w.width)} m`)]),
                w.description ? el('p', null, w.description) : null,
                hints.length ? el('div', 'hints', hints.map(h => el('span', 'hint-chip', h))) : null,
            ]),
        ]);
    }

    /** A card of an island with its screenshot (quick match, new match). */
    worldCard(w, onPick) {
        const card = el('button', 'wshot', w
            ? [shotElement(w.id, 'shot'), el('span', 'wshot-name', [el('b', null, w.name), sizeBadge(w.width)])]
            : [el('div', 'shot dice', el('span', null, '🎲')), el('span', 'wshot-name', [el('b', null, 'Zufall')])]);
        card.type = 'button';
        card.dataset.id = w ? String(w.id) : '';
        card.title = w ? `${w.name} · ${w.themeName ?? themeName(w.theme)} · ${Math.round(w.width)} m` : 'Eine zufällige Insel';
        card.onclick = () => onPick(w);
        return card;
    }

    async showQuick() {
        const choice = { bots: 1, level: 'Normal', worldId: null, crateRate: 2 };
        let list = [];
        try {
            list = await worlds();
        } catch (error) {
            showError(error);
        }
        const feature = el('div', 'feature-box');
        const grid = el('div', 'wshots');
        const cards = [];
        const pick = w => {
            choice.worldId = w?.id ?? null;
            for (const c of cards) c.classList.toggle('is-on', c.dataset.id === (w ? String(w.id) : ''));
            feature.replaceChildren(this.featureOf(w));
            if (w && w.name !== this.app.showcase.worldName) this.app.showcase.show(w.id);
        };
        for (const w of [null, ...list]) {
            const card = this.worldCard(w, pick);
            cards.push(card);
            grid.append(card);
        }

        // the opponents: up to three computer bunnies in wild looks; a click sets how many
        const foes = el('div', 'foes');
        const bots = [0, 1, 2].map(i => randomBotLook(i));
        const drawFoes = () => {
            foes.replaceChildren();
            bots.forEach((look, i) => {
                const on = i < choice.bots;
                const b = el('button', `foe${on ? ' is-on' : ''}`, on
                    ? [portrait(look, { size: 64 }), el('small', null, BOT_NAMES[i])]
                    : [el('span', 'foe-add', '+'), el('small', null, 'dazu')]);
                b.type = 'button';
                b.title = on ? (i === choice.bots - 1 && i > 0 ? 'Diesen Gegner entfernen' : `${i + 1} Gegner`) : `${i + 1} Gegner`;
                b.onclick = () => {
                    choice.bots = on && i === choice.bots - 1 && i > 0 ? i : i + 1;
                    drawFoes();
                };
                foes.append(b);
            });
        };
        drawFoes();

        const levels = el('div', 'levels');
        const levelCards = [['Easy', '🌱', 'Zielt oft daneben'], ['Normal', '🥕', 'Ein fairer Kampf'], ['Hard', '🔥', 'Trifft verdammt gut']].map(([value, emoji, text]) => {
            const b = el('button', `lvlcard${value === choice.level ? ' is-on' : ''}`, [el('span', 'lvl-emoji', emoji), el('b', null, LEVEL_NAMES[value]), el('small', null, text)]);
            b.type = 'button';
            b.onclick = () => {
                choice.level = value;
                for (const c of levelCards) c.classList.toggle('is-on', c === b);
            };
            levels.append(b);
            return b;
        });
        const crates = segmented(CRATE_RATES.map((label, value) => ({ value, label })), choice.crateRate, v => (choice.crateRate = v));

        const start = button('Los!', { className: 'btn big primary', iconName: 'play' });
        start.onclick = () => busy(start, async () => {
            try {
                const { token } = await api.post('/matches/quick', { worldId: choice.worldId, bots: choice.bots, level: choice.level, crateRate: choice.crateRate });
                this.app.startMatch(token, { quick: { bots: choice.bots, level: choice.level, worldId: choice.worldId } });
            } catch (error) {
                showError(error);
            }
        });
        const panel = el('section', 'panel wide quick', [
            this.head('Schnellspiel', { extra: [el('span', 'lead-inline', 'Du gegen die Computer-Hasen – sofort, ohne warten.')] }),
            el('div', 'quick-grid', [
                el('div', 'quick-main', [
                    feature,
                    el('div', 'tile', [el('h3', 'tile-head', [icon('sliders'), document.createTextNode('Stärke')]), levels]),
                ]),
                el('div', 'quick-side', [
                    el('div', 'tile', [el('h3', 'tile-head', [icon('globe-map'), document.createTextNode('Insel')]), grid]),
                    el('div', 'tile-row', [
                        el('div', 'tile', [el('h3', 'tile-head', [icon('users'), document.createTextNode('Gegner')]), foes]),
                        el('div', 'tile', [el('h3', 'tile-head', [icon('box'), document.createTextNode('Kisten')]), crates.element]),
                    ]),
                ]),
            ]),
            el('div', 'panel-foot', [el('span', 'sub', 'Kisten fallen ab und zu vom Himmel – hinlaufen lohnt sich!'), el('span', 'spacer'), start]),
        ]);
        this.openPanel('quick', panel);
        const current = list.find(w => w.name === this.app.showcase.worldName);
        pick(null);
        if (current) cards.find(c => c.dataset.id === String(current.id))?.scrollIntoView?.({ block: 'nearest' });
    }
    // ------------------------------------------------------------ open matches

    showOnline() {
        if (session.mode !== 'online') {
            toast('Mit Freunden spielen geht über einen Server – wähle einen aus.');
            this.showServers();
            return;
        }
        const filter = { q: '', status: '' };
        const list = el('div', 'matches');
        const count = el('span', 'muted');
        const load = async () => {
            try {
                const params = new URLSearchParams();
                if (filter.q) params.set('q', filter.q);
                if (filter.status) params.set('status', filter.status);
                const data = await api.get(`/matches?${params}`);
                count.textContent = data.matching === data.total ? `${data.total} Spiele` : `${data.matching} von ${data.total}`;
                this.renderMatches(list, data.items ?? []);
            } catch (error) {
                showError(error);
            }
        };

        const search = el('input', 'field');
        search.type = 'search';
        search.placeholder = 'Spiel, Gastgeber oder Insel';
        search.setAttribute('aria-label', 'Spiele durchsuchen');
        let timer = 0;
        search.addEventListener('input', () => {
            clearTimeout(timer);
            timer = setTimeout(() => {
                filter.q = search.value.trim();
                load();
            }, 250);
        });
        const chips = [['', 'Alle'], ['lobby', 'Lobby'], ['running', 'Läuft'], ['mine', 'Meine']].map(([value, label]) => {
            const c = el('button', `chip${value === '' ? ' is-on' : ''}`, label);
            c.type = 'button';
            c.onclick = () => {
                filter.status = value;
                for (const x of chips) x.classList.toggle('is-on', x === c);
                load();
            };
            return c;
        });

        const link = el('input', 'field');
        link.placeholder = 'Einladungslink oder Code einfügen';
        link.setAttribute('aria-label', 'Einladungslink');
        const joinLink = () => {
            const m = TOKEN_IN_LINK.exec(link.value);
            if (!m) {
                toast('Das ist kein Einladungslink.');
                return;
            }
            this.app.startMatch(m[1].toLowerCase());
        };
        link.addEventListener('keydown', e => {
            if (e.key === 'Enter') joinLink();
        });

        const panel = el('section', 'panel wide', [
            this.head('Online spielen', {
                extra: [
                    count,
                    button(null, { className: 'round-btn', iconName: 'refresh', title: 'Aktualisieren', onClick: load }),
                    button('Neues Spiel', { className: 'btn green', iconName: 'plus', onClick: () => this.showCreate() }),
                ],
            }),
            el('div', 'toolbar', [el('div', 'search', [icon('search'), search]), ...chips]),
            list,
            el('div', 'joinlink', [icon('link'), link, button('Beitreten', { className: 'btn', iconName: 'arrow-right', onClick: joinLink })]),
        ]);
        this.openPanel('online', panel);
        load();
        this.refreshTimer = setInterval(load, 5000);
    }

    renderMatches(list, items) {
        if (items.length === 0) {
            const empty = el('div', 'empty', [el('div', 'avatar'), el('p', null, 'Gerade ist keine Lobby offen.'), button('Selbst eins eröffnen', { className: 'btn primary', iconName: 'plus', onClick: () => this.showCreate() })]);
            const a = empty.querySelector('.avatar');
            a.style.width = '90px';
            a.style.height = '90px';
            a.style.margin = '0 auto 10px';
            a.append(bunnyAvatar('#c2410c', { wink: true }));
            empty.style.gridColumn = '1 / -1';
            list.replaceChildren(empty);
            return;
        }
        // the maps of the cards are kept between refreshes (by match), so the list does not flicker
        const thumbs = new Map([...list.querySelectorAll('canvas[data-token]')].map(c => [c.dataset.token, c]));
        list.replaceChildren();
        for (const m of items) {
            const running = m.status === 'Running';
            const seats = el('span', 'seats');
            for (let i = 0; i < m.maxTeams; i++) seats.append(el('i', i < m.seats ? 'on' : null));
            const thumb = thumbs.get(m.token) ?? mapCanvasByName(m.worldName);
            thumb.dataset.token = m.token;
            const card = el('article', `mcard2${m.isMine ? ' is-mine' : ''}`, [
                thumb,
                el('div', null, [
                    el('h4', null, m.name),
                    el('div', 'meta', `${themeName(m.theme) === m.worldName ? m.worldName : `${themeName(m.theme)} · ${m.worldName}`} · von ${m.hostName}`),
                    el('div', 'meta', `${m.bunniesPerTeam} Hasen · ${m.turnSeconds} s pro Zug`),
                    el('div', 'row', [
                        el('span', `badge ${running ? 'running' : 'lobby'}`, running ? 'Läuft' : 'Lobby'),
                        m.isMine ? el('span', 'badge mine', 'Deins') : null,
                        seats,
                        el('span', 'spacer'),
                        button(running ? (m.isMine ? 'Weiter' : 'Zuschauen') : 'Beitreten', {
                            className: `btn small${running ? '' : ' primary'}`, iconName: running ? 'eye' : 'play', onClick: () => this.app.startMatch(m.token),
                        }),
                    ]),
                ]),
            ]);
            card.querySelector('.row .spacer').style.flex = '1';
            list.append(card);
        }
    }

    // ------------------------------------------------------------ new match

    async showCreate() {
        let settings = { defaultTurnSeconds: 45, maxTeamsPerMatch: 6 };
        let list = [];
        try {
            [settings, list] = await Promise.all([api.get('/settings'), worlds()]);
        } catch (error) {
            showError(error);
            return;
        }
        if (list.length === 0) {
            toast('Es gibt noch keine Insel – die Administration muss eine anlegen.');
            return;
        }
        const p = session.player;
        const choice = {
            name: `Schlacht von ${p.displayName}`.slice(0, 60),
            worldId: list[0].id,
            maxTeams: Math.min(4, settings.maxTeamsPerMatch),
            bunniesPerTeam: 3,
            bunnyHealth: 100,
            turnSeconds: settings.defaultTurnSeconds,
            isPublic: true,
            crateRate: 2,
        };
        const feature = el('div', 'feature-box small');
        const grid = el('div', 'wshots');
        const cards = [];
        const select = w => {
            choice.worldId = w.id;
            for (const c of cards) c.classList.toggle('is-on', c.dataset.id === String(w.id));
            feature.replaceChildren(this.featureOf(w));
            if (w.name !== this.app.showcase.worldName) this.app.showcase.show(w.id);
        };
        for (const w of list) {
            const c = this.worldCard(w, select);
            cards.push(c);
            grid.append(c);
        }

        const name = field('Name', { value: choice.name, maxLength: 60 });
        const inputs = { name };
        const teamOptions = [];
        for (let n = 2; n <= settings.maxTeamsPerMatch; n++) teamOptions.push({ value: n, label: String(n) });
        const turnValues = [...new Set([30, 45, 60, 90, choice.turnSeconds])].sort((a, b) => a - b);
        const pub = el('input');
        pub.type = 'checkbox';
        pub.checked = true;
        pub.onchange = () => (choice.isPublic = pub.checked);
        const open = button('Lobby öffnen', { className: 'btn big primary', iconName: 'play' });
        open.onclick = () => busy(open, async () => {
            try {
                const { token } = await api.post('/matches', { ...choice, name: name.input.value });
                this.app.startMatch(token);
            } catch (error) {
                showError(error, inputs);
            }
        });

        const panel = el('section', 'panel wide create', [
            this.head('Neues Spiel'),
            el('div', 'create-grid', [
                el('div', 'create-left', [feature, el('div', 'tile', [el('h3', 'tile-head', [icon('globe-map'), document.createTextNode('Insel wählen')]), grid])]),
                el('div', 'create-right', [
                    el('div', 'tile', [name.row, el('label', 'switch', [pub, el('span', null, 'Öffentlich – unter „Online“ zu finden')])]),
                    el('div', 'tile', [
                        el('h3', 'tile-head', [icon('users'), document.createTextNode('Teams')]),
                        el('div', 'opt', [el('span', 'label', 'Teams'), segmented(teamOptions, choice.maxTeams, v => (choice.maxTeams = v)).element]),
                        el('div', 'opt', [el('span', 'label', 'Hasen pro Team'), segmented([1, 2, 3, 4, 5, 6].map(n => ({ value: n, label: String(n) })), 3, v => (choice.bunniesPerTeam = v)).element]),
                    ]),
                    el('div', 'tile', [
                        el('h3', 'tile-head', [icon('sliders'), document.createTextNode('Regeln')]),
                        el('div', 'opt', [el('span', 'label', 'Leben pro Hase'), segmented([50, 100, 150, 200].map(n => ({ value: n, label: String(n) })), 100, v => (choice.bunnyHealth = v)).element]),
                        el('div', 'opt', [el('span', 'label', 'Zugzeit'), segmented(turnValues.map(n => ({ value: n, label: `${n} s` })), choice.turnSeconds, v => (choice.turnSeconds = v)).element]),
                        el('div', 'opt', [el('span', 'label', 'Kisten'), segmented(CRATE_RATES.map((label, value) => ({ value, label })), choice.crateRate, v => (choice.crateRate = v)).element]),
                    ]),
                ]),
            ]),
            el('div', 'panel-foot', [el('span', 'sub', 'Freunde holst du mit dem Einladungslink in der Lobby dazu.'), el('span', 'spacer'), open]),
        ]);
        this.openPanel('create', panel);
        select(list.find(w => w.name === this.app.showcase.worldName) ?? list[0]);
    }

    // ------------------------------------------------------------ leaderboard

    showLeaderboard() {
        const query = { q: '', sort: 'rank', dir: 'asc', page: 1 };
        const podium = el('div', 'podium');
        const tbody = el('tbody');
        const pager = el('div', 'pager');
        const load = async () => {
            try {
                const params = new URLSearchParams({ sort: query.sort, dir: query.dir, page: String(query.page) });
                if (query.q) params.set('q', query.q);
                const data = await api.get(`/leaderboard?${params}`);
                this.renderBoard(data, query, podium, tbody, pager, load);
            } catch (error) {
                showError(error);
            }
        };
        const search = el('input', 'field');
        search.type = 'search';
        search.placeholder = 'Spieler oder Team suchen';
        search.setAttribute('aria-label', 'Rangliste durchsuchen');
        let timer = 0;
        search.addEventListener('input', () => {
            clearTimeout(timer);
            timer = setTimeout(() => {
                query.q = search.value.trim();
                query.page = 1;
                load();
            }, 250);
        });
        const sorts = [['rank', 'Rang', 'asc'], ['level', 'Level', 'desc'], ['kills', 'K.O.', 'desc'], ['damage', 'Schaden', 'desc'], ['games', 'Spiele', 'desc'], ['name', 'Name', 'asc']];
        const chips = sorts.map(([value, label, dir]) => {
            const c = el('button', `chip${value === 'rank' ? ' is-on' : ''}`, label);
            c.type = 'button';
            c.onclick = () => {
                query.sort = value;
                query.dir = dir;
                query.page = 1;
                for (const x of chips) x.classList.toggle('is-on', x === c);
                load();
            };
            return c;
        });
        const table = el('table', 'table');
        table.innerHTML = '<thead><tr><th>#</th><th>Spieler</th><th class="hide-sm">Team</th><th class="num">Spiele</th><th class="num">Siege</th><th class="num hide-sm">Quote</th><th class="num">K.O.</th><th class="num hide-sm">Schaden</th></tr></thead>';
        table.append(tbody);
        const panel = el('section', 'panel wide', [
            this.head('Rangliste'),
            podium,
            el('div', 'toolbar', [el('div', 'search', [icon('search'), search]), ...chips]),
            table,
            pager,
        ]);
        this.openPanel('leaderboard', panel);
        load();
    }

    renderBoard(data, query, podium, tbody, pager, reload) {
        const items = data.items ?? [];
        const me = session.player?.id;
        if (query.sort === 'rank' && query.page === 1 && !query.q) {
            const top = items.slice(0, 3);
            const order = [top[1], top[0], top[2]];
            const classes = ['second', 'first', 'third'];
            podium.replaceChildren();
            order.forEach((r, i) => {
                if (!r) return;
                const a = portrait(r, { size: i === 1 ? 92 : 74, level: r.level, className: 'podium-portrait' });
                podium.append(el('div', `place ${classes[i]}`, [
                    el('div', 'who', [a, el('b', null, r.displayName), el('small', null, `${r.gamesWon} Siege · ${r.kills} K.O.`)]),
                    el('div', 'block', String(r.rank)),
                ]));
            });
            podium.hidden = top.length === 0;
        } else {
            podium.hidden = true;
        }
        tbody.replaceChildren();
        if (items.length === 0) {
            const tr = el('tr');
            const td = el('td', null, 'Niemand gefunden.');
            td.colSpan = 8;
            tr.append(td);
            tbody.append(tr);
        }
        for (const r of items) {
            const sw = el('span', 'swatch');
            sw.style.setProperty('--c', r.teamColor);
            tbody.append(el('tr', r.playerId === me ? 'is-me' : null, [
                el('td', 'rank', String(r.rank)),
                el('td', null, el('div', 'playercell', [portrait(r, { size: 34, level: r.level }), el('span', null, r.displayName)])),
                el('td', 'hide-sm', el('div', 'teamcell', [sw, el('span', null, r.teamName)])),
                el('td', 'num', String(r.gamesPlayed)),
                el('td', 'num', String(r.gamesWon)),
                el('td', 'num hide-sm', `${r.winRate} %`),
                el('td', 'num', String(r.kills)),
                el('td', 'num hide-sm', String(r.damageDealt)),
            ]));
        }
        const pages = Math.max(1, Math.ceil((data.matching ?? 0) / 50));
        pager.replaceChildren();
        if (pages > 1) {
            const prev = button(null, { className: 'round-btn small', iconName: 'chevron-left', title: 'Vorherige Seite', onClick: () => { query.page--; reload(); } });
            const next = button(null, { className: 'round-btn small', iconName: 'chevron-right', title: 'Nächste Seite', onClick: () => { query.page++; reload(); } });
            prev.disabled = query.page <= 1;
            next.disabled = query.page >= pages;
            pager.append(prev, el('span', null, `Seite ${query.page} von ${pages}`), next);
        }
    }

    // ------------------------------------------------------------ profile, wardrobe & team

    async showProfile(tab = 'profile') {
        let profile;
        try {
            profile = await api.get('/profile');
        } catch (error) {
            showError(error);
            return;
        }
        // the account (password, guest → account) is MatGame's and only there online
        const online = session.mode === 'online';
        const tabs = [['profile', 'Profil', 'user'], ['wardrobe', 'Kleiderschrank', 'sparkles'], ['team', 'Team', 'users']];
        if (online && profile.isGuest) tabs.push(['account', 'Konto erstellen', 'key']);
        else if (online) tabs.push(['security', 'Sicherheit', 'lock']);
        const tabRow = el('div', 'tabs');
        for (const [value, label, iconName] of tabs) {
            const c = el('button', `chip${value === tab ? ' is-on' : ''}`, [icon(iconName), el('span', null, label)]);
            c.type = 'button';
            c.onclick = () => this.showProfile(value);
            tabRow.append(c);
        }
        const body = el('div');
        const foot = el('div', 'panel-foot');
        const inputsByField = {};
        const save = async (work, okText) => {
            try {
                await work();
                await api.refreshSession();
                $('menu').dataset.built = '';
                toast(okText, 'success');
            } catch (error) {
                showError(error, inputsByField);
            }
        };
        if (tab === 'profile') {
            this.profileOverview(profile, body, foot, save, inputsByField);
        } else if (tab === 'wardrobe') {
            this.wardrobe(profile, body, foot);
        } else if (tab === 'team') {
            let color = profile.teamColor;
            const name = field('Teamname', { value: profile.teamName, maxLength: 40 });
            inputsByField.teamName = name;
            const preview = el('div', 'preview-bunny');
            const draw = () => preview.replaceChildren(portrait({ ...profile, color }, { size: 150, className: 'big' }));
            const colors = el('div', 'colors');
            for (const c of profile.colors ?? []) {
                const sw = el('button', c.value === color ? 'is-on' : null);
                sw.type = 'button';
                sw.title = c.label;
                sw.setAttribute('aria-label', c.label);
                sw.style.setProperty('--c', c.value);
                sw.onclick = () => {
                    color = c.value;
                    for (const x of colors.children) x.classList.toggle('is-on', x === sw);
                    draw();
                };
                colors.append(sw);
            }
            draw();
            body.append(el('div', 'grid2', [
                el('div', 'stack', [name.row, el('div', null, [el('span', 'label', 'Teamfarbe'), colors]), el('p', 'hint', 'Helm, Schal und Rahmen tragen die Teamfarbe. Ist sie in einem Spiel schon vergeben, bekommst du eine freie.')]),
                preview,
            ]));
            const b = button('Speichern', { className: 'btn primary', iconName: 'save' });
            b.onclick = () => busy(b, () => save(() => api.put('/profile', { teamName: name.input.value, teamColor: color }), 'Dein Team ist bereit.'));
            foot.append(el('span', 'spacer'), b);
        } else if (tab === 'account') {
            const displayName = field('Dein Name', { value: profile.displayName, maxLength: 60, autocomplete: 'nickname' });
            const loginName = field('Anmeldename', { maxLength: 40, autocomplete: 'username' });
            const password = field('Passwort', { type: 'password', maxLength: 100, autocomplete: 'new-password', placeholder: 'mindestens 6 Zeichen' });
            Object.assign(inputsByField, { displayName, loginName, password });
            body.append(el('p', 'lead', 'Aus deinem Gast wird ein richtiges Konto: Level, Kleiderschrank und Statistik bleiben, und du kommst in die Rangliste.'),
                displayName.row, loginName.row, password.row);
            const b = button('Konto erstellen', { className: 'btn primary', iconName: 'key' });
            b.onclick = () => busy(b, () => save(() => api.upgrade(displayName.input.value, loginName.input.value, password.input.value), 'Willkommen! Dein Konto ist fertig.'));
            foot.append(el('span', 'spacer'), b);
        } else if (online) {
            const current = field('Aktuelles Passwort', { type: 'password', maxLength: 100, autocomplete: 'current-password' });
            const next = field('Neues Passwort', { type: 'password', maxLength: 100, autocomplete: 'new-password', placeholder: 'mindestens 6 Zeichen' });
            inputsByField.currentPassword = current;
            inputsByField.newPassword = next;
            body.append(current.row, next.row);
            const b = button('Passwort ändern', { className: 'btn primary', iconName: 'key' });
            b.onclick = () => busy(b, () => save(async () => {
                await api.account('POST', '/account/password', { currentPassword: current.input.value, newPassword: next.input.value });
                current.input.value = '';
                next.input.value = '';
            }, 'Das Passwort wurde geändert.'));
            foot.append(el('span', 'spacer'), b);
        }
        const wide = tab === 'profile' || tab === 'wardrobe';
        const panel = el('section', `panel${wide ? ' wide' : ''}`, [this.head(tab === 'wardrobe' ? 'Kleiderschrank' : 'Profil'), tabRow, body, foot]);
        this.openPanel('profile', panel);
        if (tab === 'wardrobe') this.preview?.start?.();
    }

    /** The profile at a glance: portrait, level and XP, numbers, the next rewards, the name. */
    profileOverview(profile, body, foot, save, inputsByField) {
        const inLevel = profile.xp - profile.xpAtLevel;
        const share = profile.maxLevel ? 1 : Math.max(0, Math.min(1, inLevel / Math.max(1, profile.xpForNext)));
        const fill = el('i');
        fill.style.width = `${share * 100}%`;
        const xpbar = el('div', 'xpbar', [fill, el('span', null, profile.maxLevel ? 'Höchstes Level erreicht!' : `${inLevel} / ${profile.xpForNext} XP bis Level ${profile.level + 1}`)]);
        const items = (profile.wardrobe ?? []).flatMap(k => k.items.map(i => ({ ...i, kind: k.kind, kindName: k.name })));
        const owned = items.filter(i => i.unlocked).length;
        const next = items.filter(i => !i.unlocked && i.level > profile.level).sort((a, b) => a.level - b.level).slice(0, 4);
        const special = items.filter(i => !i.unlocked && i.level === 0).slice(0, 3);
        const look = { ...profile, color: profile.teamColor };
        const rewardTile = i => {
            const tile = el('div', `reward${i.wild ? ' is-wild' : ''}`, [
                portrait({ ...look, [i.kind]: i.key }, { size: 54 }),
                el('div', null, [el('b', null, i.name), el('small', null, `${i.kindName} · ${i.requirement}`)]),
            ]);
            if (i.wild) tile.append(el('span', 'flame', '🔥'));
            return tile;
        };
        const s = profile.stats ?? {};
        const tile = (value, label) => el('div', 'stat', [el('b', null, String(value)), el('span', null, label)]);
        const name = field('Dein Name', { value: profile.displayName, maxLength: 60 });
        inputsByField.displayName = name;
        const dress = button('Zum Kleiderschrank', { className: 'btn small', iconName: 'sparkles', onClick: () => this.showProfile('wardrobe') });

        body.append(
            el('div', 'profile-hero', [
                el('div', 'hero-portrait', [portrait(look, { size: 150, className: 'big' }), levelBadge(profile.level)]),
                el('div', 'who', [
                    el('h3', 'pname', profile.displayName),
                    el('div', 'muted', `${profile.teamName} · ${session.mode === 'offline' ? 'offline auf diesem Gerät' : profile.isGuest ? 'Gast' : `angemeldet als ${session.account?.loginName ?? profile.displayName}`}`),
                    el('div', 'lvl-line', [el('b', null, `Level ${profile.level}`), el('span', 'muted', `${profile.xp} XP gesamt`)]),
                    xpbar,
                    el('div', 'row', [el('span', 'muted', `${owned} von ${items.length} Sachen freigeschaltet`), el('span', 'spacer'), dress]),
                ]),
            ]),
            el('div', 'stat-tiles', [tile(s.gamesPlayed ?? 0, 'Spiele'), tile(s.gamesWon ?? 0, 'Siege'), tile(s.kills ?? 0, 'K.O.'), tile(s.damageDealt ?? 0, 'Schaden'), tile(s.rank ? `#${s.rank}` : '–', 'Rang')]),
            el('div', 'grid2', [
                el('div', 'stack', [el('h3', 'h3', [icon('star'), document.createTextNode('Nächste Belohnungen')]),
                    next.length ? el('div', 'rewards', next.map(rewardTile)) : el('p', 'hint', 'Alles, was es mit Leveln gibt, hast du schon!')]),
                el('div', 'stack', [el('h3', 'h3', [icon('trophy'), document.createTextNode('Nur für Helden')]),
                    special.length ? el('div', 'rewards', special.map(rewardTile)) : el('p', 'hint', 'Alle Sieg- und K.O.-Belohnungen gehören dir.'),
                    name.row]),
            ]));
        const b = button('Speichern', { className: 'btn primary', iconName: 'save' });
        b.onclick = () => busy(b, () => save(() => (session.mode === 'online' ? api.account('PUT', '/account', { displayName: name.input.value }) : api.put('/profile', { displayName: name.input.value, teamName: profile.teamName, teamColor: profile.teamColor })), 'Gespeichert.'));
        foot.append(el('span', 'sub', 'XP gibt es für jedes fertige Spiel: mehr für Siege, K.O. und Schaden.'), el('span', 'spacer'), b);
    }

    /** The wardrobe: fur, hat, face and frame; a turning 3D bunny shows the choice, locked things say how to get them. */
    wardrobe(profile, body, foot) {
        const color = profile.teamColor;
        const saved = lookOf(profile);
        const draft = { fur: saved.fur, outfit: saved.outfit, face: saved.face, frame: saved.frame };
        const kinds = profile.wardrobe ?? [];
        let kind = kinds[0]?.kind ?? 'fur';

        const stage = el('div', 'wardrobe-stage');
        this.disposePreview();
        try {
            this.preview = new BunnyPreview(stage);
            this.preview.setLook({ ...draft, color });
        } catch {
            this.preview = null;
        }
        const big = portrait({ ...draft, color }, { size: 96 });
        const caption = el('div', 'wardrobe-caption');
        const kindRow = el('div', 'tabs small');
        const grid = el('div', 'wardrobe-grid');
        const count = el('span', 'muted');
        const saveButton = button('Anziehen', { className: 'btn primary', iconName: 'save' });

        const dirty = () => ['fur', 'outfit', 'face', 'frame'].some(k => draft[k] !== saved[k]);
        const nameOf = (k, key) => kinds.find(x => x.kind === k)?.items.find(i => i.key === key)?.name ?? key;
        const refresh = (cheer = false) => {
            updatePortrait(big, { ...draft, color });
            this.preview?.setLook({ ...draft, color });
            if (cheer) this.preview?.play?.('cheer');
            caption.replaceChildren(el('b', null, `${nameOf('fur', draft.fur)} · ${nameOf('outfit', draft.outfit)}`),
                el('small', null, `${nameOf('face', draft.face)} · Rahmen ${nameOf('frame', draft.frame)}`));
            saveButton.disabled = !dirty();
        };
        const render = () => {
            const group = kinds.find(k => k.kind === kind);
            grid.replaceChildren();
            if (!group) return;
            count.textContent = `${group.items.filter(i => i.unlocked).length} / ${group.items.length} freigeschaltet`;
            for (const item of group.items) {
                const on = draft[kind] === item.key;
                const tile = el('button', `witem${on ? ' is-on' : ''}${item.unlocked ? '' : ' is-locked'}${item.wild ? ' is-wild' : ''}`, [
                    portrait({ ...draft, [kind]: item.key, color }, { size: 64 }),
                    el('b', null, item.name),
                    item.unlocked ? null : el('small', 'req', [icon('lock'), el('span', null, item.requirement)]),
                ]);
                if (item.wild) tile.append(el('span', 'flame', '🔥'));
                tile.type = 'button';
                tile.title = item.unlocked ? item.name : `${item.name} – gesperrt: ${item.requirement}`;
                tile.onclick = () => {
                    if (!item.unlocked) {
                        this.app.sound.tick?.();
                        toast(`„${item.name}“ ist noch gesperrt – ${item.requirement}.`, 'info');
                        return;
                    }
                    draft[kind] = item.key;
                    this.app.sound.tick?.();
                    render();
                    refresh(true);
                };
                grid.append(tile);
            }
        };
        for (const k of kinds) {
            const c = el('button', `chip${k.kind === kind ? ' is-on' : ''}`, k.name);
            c.type = 'button';
            c.onclick = () => {
                kind = k.kind;
                for (const x of kindRow.children) x.classList.toggle('is-on', x === c);
                render();
            };
            kindRow.append(c);
        }
        const shuffle = button('Zufall', { className: 'btn small', iconName: 'refresh', title: 'Ein zufälliger Look aus deinen Sachen' });
        shuffle.onclick = () => {
            for (const k of kinds) {
                const free = k.items.filter(i => i.unlocked);
                if (free.length) draft[k.kind] = free[Math.floor(Math.random() * free.length)].key;
            }
            render();
            refresh(true);
        };
        saveButton.onclick = () => busy(saveButton, async () => {
            try {
                await api.put('/profile/look', { ...draft });
                Object.assign(saved, draft);
                await api.refreshSession();
                $('menu').dataset.built = '';
                this.preview?.play?.('dance');
                toast('Schick! So ziehen deine Hasen in die Schlacht.', 'success');
                refresh();
            } catch (error) {
                showError(error);
            }
        });

        body.append(el('div', 'wardrobe', [
            el('div', 'wardrobe-left', [stage, el('div', 'row wardrobe-me', [big, caption])]),
            el('div', 'wardrobe-right', [el('div', 'row', [kindRow, el('span', 'spacer'), count]), grid]),
        ]));
        foot.append(el('span', 'sub', 'Neue Sachen gibt es mit jedem Level – und für Siege und K.O. 🔥 = besonders wild.'), el('span', 'spacer'), shuffle, saveButton);
        render();
        refresh();
    }

    // ------------------------------------------------------------ guide & about

    showGuide() {
        const keys = el('ul', 'keys');
        const k = (...parts) => {
            const li = el('li');
            for (const p of parts) li.append(typeof p === 'string' && p.startsWith('[') ? el('kbd', null, p.slice(1, -1)) : document.createTextNode(p));
            keys.append(li);
        };
        k('[W]', '[A]', '[S]', '[D]', ' laufen – jeder Zug hat etwas Ausdauer');
        k('[Maus ziehen]', ' Kamera drehen = in diese Richtung zielen · ', '[rechte Maustaste]', ' ziehen = genau zielen · ', '[Mausrad]', ' zoomen');
        k('[↑]', '[↓]', ' oder ', '[R]', '[F]', ' Rohr heben und senken · ', '[Shift]', ' halten = fein zielen');
        k('Die gepunktete Bahn zeigt, wohin der Schuss fliegt (mit Wind) – das Fadenkreuz, wo er einschlägt; rot = Treffer, blau = Wasser.');
        k('[Leertaste]', ' halten = Kraft laden, loslassen = Feuer');
        k('[1]', '–', '[9]', ' Waffe wählen · Luftschlag: Ziel auf der Insel anklicken');
        k('[Tab]', ' Zug beenden · ', '[Enter]', ' Chat · ', '[H]', ' Hilfe · ', '[V]', ' Vogelperspektive');
        k('Kisten fallen ab und zu am Fallschirm vom Himmel: hinlaufen! Holzkiste = Waffen, Herzkiste = Leben, Sternkiste = Extras (Panzerfell, Doppel-Wumms, Turbo-Möhre, Hasenloch). Eine Explosion zerstört Kisten – Waffenkisten knallen dabei selbst.');
        const weapons = [
            ['Projectile', 'Karottenwerfer', 'Fliegt weit, treibt im Wind und gräbt beim Aufschlag einen Krater.'],
            ['Grenade', 'Rübengranate', 'Springt über Hügel und explodiert nach ihrem Zünder. Der Wind ist ihr egal.'],
            ['Cluster', 'Kohlkopf-Splitter', 'Platzt beim Aufschlag und verteilt Kohlblätter mit Wumms.'],
            ['Hitscan', 'Löwenzahn-Flinte', 'Mehrere Samenkugeln geradeaus – ideal auf kurze Distanz.'],
            ['Airstrike', 'Möhrenregen', 'Ziel anklicken, und von oben regnet es Karotten. Die Kamera geht dafür in die Vogelperspektive.'],
            ['Projectile', 'Goldene Riesenmöhre', 'Nur aus Kisten: ein riesiger Krater in Gold.', 'Goldene Riesenmöhre'],
            ['Teleport', 'Hasenloch', 'Nur aus Kisten: Ziel anklicken – dein Hase buddelt sich ein und taucht dort wieder auf.'],
        ];
        const cards = el('div', 'guide', weapons.map(([kind, name, text, iconName]) => el('div', 'card', [el('h4', null, [weaponIcon(kind, iconName ?? ''), document.createTextNode(name)]), el('p', null, text)])));
        const rules = el('div', 'card', [
            el('h4', null, [icon('info'), document.createTextNode('So läuft eine Runde')]),
            el('p', null, 'Die Teams sind nacheinander dran, jedes Mal ein anderer Hase. Lauf in Position, ziel, lade die Kraft und feuer. Danach hast du drei Sekunden, um in Deckung zu hoppeln. Wer ins Wasser fällt, ist raus. Das letzte Team mit Hasen gewinnt.'),
        ]);
        const panel = el('section', 'panel wide', [
            this.head('Anleitung'),
            el('div', 'grid2', [el('div', 'stack', [el('h3', 'h3', [icon('gamepad'), document.createTextNode('Steuerung')]), el('div', 'card', keys), rules]),
                el('div', 'stack', [el('h3', 'h3', [icon('carrot'), document.createTextNode('Waffen')]), cards])]),
        ]);
        this.openPanel('guide', panel);
    }

    showAbout() {
        const mark = el('img');
        mark.src = 'img/logo/bunnywarfare-mark.svg';
        mark.alt = '';
        mark.width = 84;
        mark.height = 84;
        const dl = el('dl');
        for (const [k, v] of [['Version', session.version], ['Grafik', 'three.js (MIT)'], ['Echtzeit', 'ASP.NET Core SignalR'], ['Schriften', 'Lilita One, Nunito (SIL OFL)'], ['Idee', 'Rundenbasierte Artillerie mit Hasen']]) {
            dl.append(el('dt', null, k), el('dd', null, v));
        }
        const panel = el('section', 'panel narrow about', [
            this.head('Über'),
            el('div', 'row', [mark, el('div', null, [el('h3', 'h3', 'BunnyWarfare'), el('p', 'muted', 'Karotten werfen, Rüben rollen lassen, Krater graben – die Hasenschlacht im Browser.')])]),
            dl,
        ]);
        this.openPanel('about', panel);
    }
}

