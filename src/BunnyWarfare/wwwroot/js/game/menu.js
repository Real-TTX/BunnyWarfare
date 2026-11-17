// The menus of the player app over the living island: sign-in, the main menu and its panels
// (quick match, open matches, new match, leaderboard, profile & team, guide, about).
import { $, el, icon, button, segmented, field, toast, themeName, LEVEL_NAMES } from './ui.js';
import { logo, bunnyAvatar, weaponIcon, speakerIcon } from './icons.js';
import { api, session, worlds, ApiError } from './api.js';
import { mapCanvas, mapCanvasByName } from './maps.js';

const TOKEN_IN_LINK = /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;

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

    openPanel(kind, content) {
        clearInterval(this.refreshTimer);
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
        const layer = $('layer-panel');
        layer.hidden = true;
        layer.replaceChildren();
        const wasOpen = !!this.panel;
        this.panel = null;
        if (toMenu && wasOpen && session.signedIn) this.showMain();
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
        const register = mode === 'register' || (mode === null && session.firstRun);
        const panel = el('section', 'panel narrow');
        const tabs = el('div', 'tabs row center');
        const login = el('button', `chip${register ? '' : ' is-on'}`, 'Anmelden');
        const reg = el('button', `chip${register ? ' is-on' : ''}`, 'Registrieren');
        login.type = reg.type = 'button';
        login.onclick = () => this.showAuth('login');
        reg.onclick = () => this.showAuth('register');
        if (!session.firstRun) tabs.append(login);
        if (session.canRegister) tabs.append(reg);

        const inputs = {};
        const form = el('form', 'stack');
        form.noValidate = true;
        if (register) {
            if (session.firstRun) form.append(el('p', 'lead', 'Willkommen! Das erste Konto dieses Servers wird der Administrator.'));
            inputs.displayName = field('Dein Name', { maxLength: 60, autocomplete: 'nickname', placeholder: 'So sehen dich die anderen' });
            inputs.loginName = field('Anmeldename', { maxLength: 40, autocomplete: 'username' });
            inputs.password = field('Passwort', { type: 'password', maxLength: 100, autocomplete: 'new-password', placeholder: 'mindestens 6 Zeichen' });
            form.append(inputs.displayName.row, inputs.loginName.row, inputs.password.row);
        } else {
            inputs.loginName = field('Anmeldename', { maxLength: 40, autocomplete: 'username' });
            inputs.password = field('Passwort', { type: 'password', maxLength: 100, autocomplete: 'current-password' });
            form.append(inputs.loginName.row, inputs.password.row);
        }
        const submit = button(register ? 'Konto anlegen' : 'Los geht’s!', { className: 'btn big primary block', iconName: register ? 'user' : 'login', type: 'submit' });
        form.append(submit);
        form.addEventListener('submit', async e => {
            e.preventDefault();
            await busy(submit, async () => {
                try {
                    if (register) await api.register(inputs.displayName.input.value, inputs.loginName.input.value, inputs.password.input.value);
                    else await api.login(inputs.loginName.input.value, inputs.password.input.value);
                    this.app.signedIn();
                } catch (error) {
                    showError(error, inputs);
                }
            });
        });
        panel.append(tabs.children.length > 1 ? tabs : el('div'), form);
        if (!session.canRegister && !register) panel.append(el('p', 'hint', 'Neue Konten legt die Administration an.'));
        const wrap = el('div', 'stack', [el('div', 'auth-logo', logo()), panel]);
        wrap.style.alignItems = 'center';
        wrap.style.width = '100%';
        layer.replaceChildren(wrap);
        setTimeout(() => (inputs.displayName ?? inputs.loginName).input.focus(), 80);
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

        const avatar = el('span', 'avatar');
        avatar.style.background = p.teamColor;
        avatar.append(bunnyAvatar(p.teamColor));
        const chip = el('button', 'player-chip', [avatar, el('span', 'name', [document.createTextNode(p.displayName), el('small', null, p.teamName)])]);
        chip.type = 'button';
        chip.title = 'Profil & Team';
        chip.onclick = () => this.showProfile();
        const top = el('div', 'menu-top', [
            chip,
            el('span', 'spacer'),
            p.isAdmin ? el('a', 'btn small', [icon('shield'), el('span', null, 'Administration')]) : null,
            button(null, { className: 'round-btn', iconName: 'logout', title: 'Abmelden', onClick: () => this.app.signOut() }),
        ]);
        const adminLink = top.querySelector('a.btn');
        if (adminLink) adminLink.href = '/Admin';

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
            button('Profil & Team', { className: 'btn small', iconName: 'user', onClick: () => this.showProfile() }),
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
            const home = await api.get('/api/home');
            this.home = home;
            const layer = $('menu');
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
                    list.append(el('li', null, [el('span', null, h.worldName), el('span', h.placement === 1 ? 'win' : null, result)]));
                }
                stats.replaceChildren(el('h3', null, [icon('bar-chart'), document.createTextNode('Deine Bilanz')]), grid, list.children.length ? list : el('p', 'hint', 'Noch keine Spiele – auf geht’s!'));
            }
        } catch (error) {
            if (error?.status === 401) this.app.signedOut();
        }
    }

    // ------------------------------------------------------------ quick match

    async showQuick() {
        const choice = { bots: 1, level: 'Normal', worldId: null };
        const panel = el('section', 'panel narrow');
        const bots = segmented([1, 2, 3].map(n => ({ value: n, label: String(n) })), 1, v => (choice.bots = v));
        const level = segmented(['Easy', 'Normal', 'Hard'].map(v => ({ value: v, label: LEVEL_NAMES[v] })), 'Normal', v => (choice.level = v));
        const worldRow = el('div', 'row');
        const chips = [];
        const addChip = (id, label) => {
            const c = el('button', `chip${id === null ? ' is-on' : ''}`, label);
            c.type = 'button';
            c.onclick = () => {
                choice.worldId = id;
                for (const x of chips) x.classList.toggle('is-on', x === c);
                const w = id === null ? null : this.worldList?.find(x => x.id === id);
                if (w && w.name !== this.app.showcase.worldName) this.app.showcase.show(id);
            };
            chips.push(c);
            worldRow.append(c);
        };
        addChip(null, '🎲 Zufall');
        const start = button('Los!', { className: 'btn big primary block', iconName: 'play' });
        start.onclick = () => busy(start, async () => {
            try {
                const { token } = await api.post('/api/matches/quick', { worldId: choice.worldId, bots: choice.bots, level: choice.level });
                this.app.startMatch(token, { quick: { bots: choice.bots, level: choice.level, worldId: choice.worldId } });
            } catch (error) {
                showError(error);
            }
        });
        panel.append(
            this.head('Schnellspiel'),
            el('p', 'lead', 'Du gegen die Computer-Hasen – sofort, ohne warten.'),
            el('div', 'settings', [
                el('div', null, [el('span', 'label', 'Gegner'), bots.element]),
                el('div', null, [el('span', 'label', 'Stärke'), level.element]),
                el('div', null, [el('span', 'label', 'Insel'), worldRow]),
            ]),
            el('div', 'panel-foot', [start]));
        this.openPanel('quick', panel);
        try {
            this.worldList = await worlds();
            for (const w of this.worldList) addChip(w.id, w.name);
        } catch (error) {
            showError(error);
        }
    }

    // ------------------------------------------------------------ open matches

    showOnline() {
        const filter = { q: '', status: '' };
        const list = el('div', 'matches');
        const count = el('span', 'muted');
        const load = async () => {
            try {
                const params = new URLSearchParams();
                if (filter.q) params.set('q', filter.q);
                if (filter.status) params.set('status', filter.status);
                const data = await api.get(`/api/matches?${params}`);
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
            [settings, list] = await Promise.all([api.get('/api/settings'), worlds()]);
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
        };
        const desc = el('p', 'wdesc');
        const grid = el('div', 'worlds');
        const cards = [];
        const select = w => {
            choice.worldId = w.id;
            for (const c of cards) c.classList.toggle('is-on', c.dataset.id === String(w.id));
            desc.textContent = `${w.themeName} · ${String(w.width.toFixed?.(1) ?? w.width).replace('.', ',')} m · Schwerkraft ${String(w.gravity).replace('.', ',')} · ${w.description || ''}`;
            if (w.name !== this.app.showcase.worldName) this.app.showcase.show(w.id);
        };
        for (const w of list) {
            const sub = `${(w.themeName ?? themeName(w.theme)) === w.name ? '' : `${w.themeName ?? themeName(w.theme)} · `}${Math.round(w.width)} m${w.gravity < 6 ? ' · wenig Schwerkraft' : ''}`;
            const c = el('button', 'wcard', [mapCanvas(w.id), el('b', null, w.name), el('small', null, sub)]);
            c.type = 'button';
            c.dataset.id = String(w.id);
            c.onclick = () => select(w);
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
                const { token } = await api.post('/api/matches', { ...choice, name: name.input.value });
                this.app.startMatch(token);
            } catch (error) {
                showError(error, inputs);
            }
        });

        const panel = el('section', 'panel wide', [
            this.head('Neues Spiel'),
            el('div', 'grid2', [
                el('div', null, [el('h3', 'h3', [icon('globe-map'), document.createTextNode('Insel wählen')]), grid, desc]),
                el('div', 'settings', [
                    name.row,
                    el('div', null, [el('span', 'label', 'Teams'), segmented(teamOptions, choice.maxTeams, v => (choice.maxTeams = v)).element]),
                    el('div', null, [el('span', 'label', 'Hasen pro Team'), segmented([1, 2, 3, 4, 5, 6].map(n => ({ value: n, label: String(n) })), 3, v => (choice.bunniesPerTeam = v)).element]),
                    el('div', null, [el('span', 'label', 'Leben pro Hase'), segmented([50, 100, 150, 200].map(n => ({ value: n, label: String(n) })), 100, v => (choice.bunnyHealth = v)).element]),
                    el('div', null, [el('span', 'label', 'Zugzeit'), segmented(turnValues.map(n => ({ value: n, label: `${n} s` })), choice.turnSeconds, v => (choice.turnSeconds = v)).element]),
                    el('label', 'switch', [pub, el('span', null, 'Öffentlich – unter „Online“ zu finden')]),
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
                const data = await api.get(`/api/leaderboard?${params}`);
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
        const sorts = [['rank', 'Rang', 'asc'], ['kills', 'K.O.', 'desc'], ['damage', 'Schaden', 'desc'], ['games', 'Spiele', 'desc'], ['name', 'Name', 'asc']];
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
                const a = el('div', 'avatar');
                a.style.background = r.teamColor;
                a.append(bunnyAvatar(r.teamColor, { wink: i === 1 }));
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
                el('td', null, r.displayName),
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

    // ------------------------------------------------------------ profile & team

    async showProfile(tab = 'profile') {
        let profile;
        try {
            profile = await api.get('/api/profile');
        } catch (error) {
            showError(error);
            return;
        }
        const tabs = [['profile', 'Profil', 'user'], ['team', 'Team', 'users'], ['security', 'Sicherheit', 'lock']];
        const tabRow = el('div', 'tabs');
        for (const [value, label, iconName] of tabs) {
            const c = el('button', `chip${value === tab ? ' is-on' : ''}`, [icon(iconName), el('span', null, label)]);
            c.type = 'button';
            c.onclick = () => this.showProfile(value);
            tabRow.append(c);
        }
        const body = el('div');
        const foot = el('div', 'panel-foot');
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
        const inputsByField = {};
        if (tab === 'profile') {
            const name = field('Dein Name', { value: profile.displayName, maxLength: 60 });
            inputsByField.displayName = name;
            body.append(el('p', 'lead', `Angemeldet als ${profile.loginName}.`), name.row);
            const b = button('Speichern', { className: 'btn primary', iconName: 'save' });
            b.onclick = () => busy(b, () => save(() => api.put('/api/profile', { displayName: name.input.value, teamName: profile.teamName, teamColor: profile.teamColor }), 'Gespeichert.'));
            foot.append(el('span', 'spacer'), b);
        } else if (tab === 'team') {
            let color = profile.teamColor;
            const name = field('Teamname', { value: profile.teamName, maxLength: 40 });
            inputsByField.teamName = name;
            const preview = el('div', 'preview-bunny');
            const draw = () => {
                const a = el('div', 'avatar');
                a.style.background = color;
                a.append(bunnyAvatar(color, { wink: true }));
                preview.replaceChildren(a);
            };
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
                el('div', 'stack', [name.row, el('div', null, [el('span', 'label', 'Teamfarbe'), colors]), el('p', 'hint', 'Ist die Farbe in einem Spiel schon vergeben, bekommst du eine freie.')]),
                preview,
            ]));
            const b = button('Speichern', { className: 'btn primary', iconName: 'save' });
            b.onclick = () => busy(b, () => save(() => api.put('/api/profile', { displayName: profile.displayName, teamName: name.input.value, teamColor: color }), 'Dein Team ist bereit.'));
            foot.append(el('span', 'spacer'), b);
        } else {
            const current = field('Aktuelles Passwort', { type: 'password', maxLength: 100, autocomplete: 'current-password' });
            const next = field('Neues Passwort', { type: 'password', maxLength: 100, autocomplete: 'new-password', placeholder: 'mindestens 6 Zeichen' });
            inputsByField.currentPassword = current;
            inputsByField.newPassword = next;
            body.append(current.row, next.row);
            const b = button('Passwort ändern', { className: 'btn primary', iconName: 'key' });
            b.onclick = () => busy(b, () => save(async () => {
                await api.post('/api/profile/password', { currentPassword: current.input.value, newPassword: next.input.value });
                current.input.value = '';
                next.input.value = '';
            }, 'Das Passwort wurde geändert.'));
            foot.append(el('span', 'spacer'), b);
        }
        const panel = el('section', 'panel', [this.head('Profil & Team'), tabRow, body, foot]);
        this.openPanel('profile', panel);
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
        k('[Maus ziehen]', ' Kamera drehen = in diese Richtung zielen · ', '[Mausrad]', ' zoomen');
        k('[↑]', '[↓]', ' oder ', '[R]', '[F]', ' Rohr heben und senken');
        k('[Leertaste]', ' halten = Kraft laden, loslassen = Feuer');
        k('[1]', '–', '[9]', ' Waffe wählen · Luftschlag: Ziel auf der Insel anklicken');
        k('[Tab]', ' Zug beenden · ', '[Enter]', ' Chat · ', '[H]', ' Hilfe');
        const weapons = [
            ['Projectile', 'Karottenwerfer', 'Fliegt weit, treibt im Wind und gräbt beim Aufschlag einen Krater.'],
            ['Grenade', 'Rübengranate', 'Springt über Hügel und explodiert nach ihrem Zünder. Der Wind ist ihr egal.'],
            ['Cluster', 'Kohlkopf-Splitter', 'Platzt beim Aufschlag und verteilt Kohlblätter mit Wumms.'],
            ['Hitscan', 'Löwenzahn-Flinte', 'Mehrere Samenkugeln geradeaus – ideal auf kurze Distanz.'],
            ['Airstrike', 'Möhrenregen', 'Ziel anklicken, und von oben regnet es Karotten.'],
        ];
        const cards = el('div', 'guide', weapons.map(([kind, name, text]) => el('div', 'card', [el('h4', null, [weaponIcon(kind), document.createTextNode(name)]), el('p', null, text)])));
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
        mark.src = '/img/logo/bunnywarfare-mark.svg';
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

