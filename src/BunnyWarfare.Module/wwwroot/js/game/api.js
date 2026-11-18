// Where and as whom the player app plays, and the game API – through the MatGame SDK (../matgame, a copy: never edit it here).
//   browser : the master that serves the page (games.matthix.de/bunnywarfare/), signed in with its cookie (account or guest)
//   app     : a master chosen in the "Server" panel (device token), or offline: the game runs in the app (BunnyWarfare.Local) as the local guest
// The calls are the same in every mode: api.get('/home') is GET <base>api/home on the master, or the local game in the app.
import { connect, host, servers, OnlineTransport, LocalTransport, status, isUpdateError, normalizeServer } from '../matgame/index.js';

export const GAME = 'bunnywarfare';

/** The address of the app: "/bunnywarfare/" on the master and in the app shell (the <base href> of index.html). */
export const BASE = new URL(document.baseURI).pathname.replace(/\/?$/, '/');

/** An error of the server: the message to show and the field it belongs to (null = the whole form); update = the app is too old for the master. */
export class ApiError extends Error {
    constructor(message, field = null, status = 0, update = false) {
        super(message);
        this.field = field;
        this.status = status;
        this.update = update;
    }
}

/**
 * Who plays: signedIn, player (the game player: id, displayName, isGuest, isAdmin, team, look, level), version,
 * mode ('online' | 'offline' | 'unreachable'), server (the master's address), serverName, account (the MatGame account), canRegister, guests, problem (why unreachable).
 */
export const session = {
    signedIn: false,
    player: null,
    version: '',
    mode: 'online',
    server: null,
    serverName: null,
    account: null,
    canRegister: false,
    guests: false,
    problem: null,
};

/** The SDK session (account on the master) and the transport (game API + hub) of the current mode. */
const net = { session: null, transport: null };

function wrap(error) {
    if (error instanceof ApiError) return error;
    const status = error?.status ?? 0;
    if (status === 401) return new ApiError('Bitte zuerst anmelden.', null, 401);
    const message = status === 0 && !error?.message ? 'Keine Verbindung zum Server.' : (error?.message ?? 'Das hat nicht geklappt.');
    return new ApiError(message, error?.field ?? null, status, isUpdateError(error));
}

async function request(method, url, body) {
    if (!net.transport) throw new ApiError(session.problem ?? 'Keine Verbindung zum Server.');
    const path = url.replace(/^\/api(?=\/)/, '');
    try {
        return await net.transport.request(method, path, body);
    } catch (error) {
        const wrapped = wrap(error);
        if (wrapped.update) status.set('update', wrapped.message);
        throw wrapped;
    }
}

export const api = {
    get: url => request('GET', url),
    post: (url, body = {}) => request('POST', url, body),
    put: (url, body = {}) => request('PUT', url, body),

    /** The transport of the match (hub methods and messages). */
    transport: () => net.transport,

    /** In an app shell (servers can be chosen, offline play possible). */
    get isApp() {
        return host.isApp;
    },

    /**
     * Finds the master (or the offline game) and who is signed in. In the browser the master is the page's own; in the app the chosen one
     * (none = offline). A master the app cannot reach leaves mode 'unreachable' (the menu offers other servers and offline play).
     */
    async connect() {
        clearCaches();
        await net.transport?.stop?.();
        net.transport = null;
        const result = await connect({ game: GAME, base: BASE.replace(/\/$/, '') });
        net.session = result.session;
        session.server = result.server;
        session.problem = result.problem?.message ?? null;
        session.serverName = result.discovery?.name ?? null;
        if (result.server && !result.problem) {
            session.mode = 'online';
            net.transport = new OnlineTransport({
                signalR: window.signalR,
                session: result.session,
                base: result.entry?.path ?? BASE.replace(/\/$/, ''),
                configure: builder => builder.withAutomaticReconnect([0, 1000, 2000, 5000, 10000, 10000, 30000]),
            });
        } else if (host.isApp && !result.server) {
            session.mode = 'offline';
            net.transport = new LocalTransport({ game: GAME });
        } else {
            session.mode = 'unreachable';
        }
        await this.refreshSession();
        return session;
    },

    async refreshSession() {
        session.signedIn = false;
        session.player = null;
        session.account = null;
        if (session.mode === 'unreachable') return session;
        if (session.mode === 'online') {
            try {
                await net.session.refresh();
            } catch (error) {
                throw wrap(error);
            }
            session.account = net.session.account;
            session.canRegister = net.session.canRegister;
            session.guests = net.session.guests;
            session.serverName = net.session.serverName ?? session.serverName;
            if (!session.account) {
                const meta = document.querySelector('meta[name="matgame-version"]')?.content;
                session.version = meta || session.version;
                return session;
            }
        }
        const game = await request('GET', '/session');
        session.signedIn = !!game?.signedIn;
        session.player = game?.player ?? null;
        session.version = game?.version ?? session.version;
        return session;
    },

    async login(loginName, password) {
        await this.onMaster(() => net.session.login(loginName, password));
        return this.refreshSession();
    },
    async register(displayName, loginName, password) {
        await this.onMaster(() => net.session.register(displayName, loginName, password));
        return this.refreshSession();
    },
    /** Plays as a guest on the master (no password; the master must allow guests). */
    async guest(name) {
        await this.onMaster(() => net.session.guest(name));
        return this.refreshSession();
    },
    /** The guest becomes an account (same id: level and wardrobe stay). */
    async upgrade(displayName, loginName, password) {
        await this.onMaster(() => net.session.upgrade(displayName, loginName, password));
        return this.refreshSession();
    },
    /** Sign-in in the browser (apps): onCode({ code, verifyUrl }) shows the code; resolves once the player confirmed it on the master. */
    async deviceLogin(onCode, signal) {
        await this.onMaster(() => net.session.deviceLogin({ onCode, signal }));
        return this.refreshSession();
    },
    async logout() {
        if (session.mode === 'online') await this.onMaster(() => net.session.logout()).catch(() => {});
        return this.refreshSession();
    },
    /** A call of MatGame's host API (/api/matgame/...): the account's name and password. */
    account(method, path, body) {
        return this.onMaster(() => net.session.fetch(`/api/matgame${path}`, { method, body }));
    },

    async onMaster(work) {
        if (!net.session || session.mode !== 'online') throw new ApiError('Dafür braucht es eine Verbindung zu einem Server.');
        try {
            return await work();
        } catch (error) {
            throw wrap(error);
        }
    },

    // ---- the servers of the app ----
    servers: () => servers.list(),
    currentServer: () => servers.current(),
    /** Tests an address: the master's name, or throws a readable error. */
    async testServer(url) {
        const doc = await servers.discover(url);
        if (!servers.gameOf(doc, GAME)) throw new ApiError(`${doc.name ?? 'Dieser Server'} hat BunnyWarfare nicht.`);
        return doc;
    },
    /** Plays against a master from now on (null = offline) and connects again. */
    async useServer(url) {
        await servers.select(url ? normalizeServer(url) : null);
        return this.connect();
    },
    removeServer: url => servers.remove(url),
    playOffline() {
        return this.useServer(null);
    },
};

/** The terrain of a world (cached): for the previews. */
const terrains = new Map();
export function worldTerrain(id) {
    if (!terrains.has(id)) terrains.set(id, api.get(`/worlds/${id}/terrain`).catch(e => {
        terrains.delete(id);
        throw e;
    }));
    return terrains.get(id);
}

/** All worlds (cached for a minute). */
let worldsCache = null;
let worldsAt = 0;
export async function worlds() {
    if (!worldsCache || performance.now() - worldsAt > 60000) {
        worldsCache = api.get('/worlds');
        worldsAt = performance.now();
        worldsCache.catch(() => (worldsCache = null));
    }
    return worldsCache;
}

/** Forgets what was cached for another server or mode. */
export function clearCaches() {
    terrains.clear();
    worldsCache = null;
}

export { host, status };
