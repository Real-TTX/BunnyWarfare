// The JSON API of the server (/api/*): the session (who plays, the anti-forgery token) and calls with German error messages.

/** An error of the server: the message to show and the field it belongs to (null = the whole form). */
export class ApiError extends Error {
    constructor(message, field = null, status = 0) {
        super(message);
        this.field = field;
        this.status = status;
    }
}

export const session = {
    signedIn: false,
    player: null,
    canRegister: true,
    firstRun: false,
    version: '',
    antiforgery: '',
};

async function request(method, url, body) {
    const headers = { Accept: 'application/json' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (method !== 'GET' && session.antiforgery) headers.RequestVerificationToken = session.antiforgery;
    let response;
    try {
        response = await fetch(url, { method, headers, credentials: 'same-origin', body: body === undefined ? undefined : JSON.stringify(body) });
    } catch {
        throw new ApiError('Keine Verbindung zum Server.');
    }
    const text = await response.text();
    let data = null;
    try {
        data = text ? JSON.parse(text) : null;
    } catch {
        data = null;
    }
    // a call that needs a sign-in may be answered with the redirect of the cookie to the start page
    if (response.redirected && !new URL(response.url).pathname.startsWith('/api/')) throw new ApiError('Bitte zuerst anmelden.', null, 401);
    if (response.ok) return data;
    if (response.status === 401) throw new ApiError('Bitte zuerst anmelden.', null, 401);
    if (response.status === 403) throw new ApiError(data?.error ?? 'Das darfst du nicht.', null, 403);
    throw new ApiError(data?.error ?? data?.title ?? 'Das hat nicht geklappt.', data?.field ?? null, response.status);
}

export const api = {
    get: url => request('GET', url),
    post: (url, body = {}) => request('POST', url, body),
    put: (url, body = {}) => request('PUT', url, body),

    async refreshSession() {
        Object.assign(session, await request('GET', '/api/session'));
        return session;
    },
    async login(loginName, password) {
        Object.assign(session, await request('POST', '/api/session/login', { loginName, password }));
        // the token belongs to the user: ask again so the next call carries the new one
        return this.refreshSession();
    },
    async register(displayName, loginName, password) {
        Object.assign(session, await request('POST', '/api/session/register', { displayName, loginName, password }));
        return this.refreshSession();
    },
    async logout() {
        await request('POST', '/api/session/logout', {});
        return this.refreshSession();
    },
};

/** The terrain of a world (cached): for the previews. */
const terrains = new Map();
export function worldTerrain(id) {
    if (!terrains.has(id)) terrains.set(id, api.get(`/api/worlds/${id}/terrain`).catch(e => {
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
        worldsCache = api.get('/api/worlds');
        worldsAt = performance.now();
        worldsCache.catch(() => (worldsCache = null));
    }
    return worldsCache;
}
