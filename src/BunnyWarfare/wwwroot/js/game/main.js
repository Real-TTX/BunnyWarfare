// BunnyWarfare for players: one full-screen 3D app. A living island lies behind the menus (Showcase); a match (Match) takes the stage over.
// Routing: "/" = the menu, "/Play/{token}" = a lobby or a match (history.pushState, no reloads). The admin area (/Admin) is a separate site.
import { Stage } from './scene.js';
import { Input } from './input.js';
import { Hud } from './hud.js';
import { Sound } from './audio.js';
import { Floaters } from './effects.js';
import { Showcase } from './showcase.js';
import { Menu } from './menu.js';
import { Match } from './match.js';
import { api, session } from './api.js';
import { $, toast } from './ui.js';

const PLAY_PATH = /^\/Play\/([0-9a-f-]{36})\/?$/i;

const stage = new Stage($('bw-stage'));
const sound = new Sound();
const hud = new Hud();
const floaters = new Floaters($('bw-floaters'), stage.camera);
const showcase = new Showcase(stage);

const app = {
    stage,
    sound,
    showcase,
    startMatch: (token, options) => startMatch(token, options),
    signedIn: () => afterSignIn(),
    signedOut: () => showSignIn(),
    signOut: () => signOut(),
};
const menu = new Menu(app);
const match = new Match({
    stage,
    sound,
    floaters,
    hud,
    me: () => session.player?.id ?? 0,
    onExit: () => exitMatch(),
    onAgain: options => again(options),
    onRoom: room => menu.blur(room.status === 'Lobby' ? 'strong' : 'none'),
    beforeWorld: () => showcase.release(),
});

// ---------------------------------------------------------------- routing

function tokenInPath() {
    return PLAY_PATH.exec(location.pathname)?.[1]?.toLowerCase() ?? null;
}

async function startMatch(token, options = {}) {
    if (!session.signedIn) {
        showSignIn();
        return;
    }
    if (match.active) await match.leave();
    menu.hideAll();
    menu.blur('strong');
    if (tokenInPath() !== token) history.pushState({ token }, '', `/Play/${token}`);
    document.title = 'Lobby · BunnyWarfare';
    await match.start(token, options);
}

async function exitMatch({ push = true } = {}) {
    if (match.active) await match.leave();
    document.title = 'BunnyWarfare';
    if (push && location.pathname !== '/') history.pushState({}, '', '/');
    showcase.show(null, { force: !showcase.active });
    if (session.signedIn) menu.showMain();
    else showSignIn();
}

async function again(options) {
    const quick = options?.quick;
    if (!quick) {
        await exitMatch();
        menu.showCreate();
        return;
    }
    try {
        const { token } = await api.post('/api/matches/quick', { worldId: quick.worldId ?? null, bots: quick.bots, level: quick.level });
        await match.leave();
        showcase.show(null, { force: true });
        await startMatch(token, { quick });
    } catch (error) {
        toast(error.message);
    }
}

window.addEventListener('popstate', () => {
    const token = tokenInPath();
    if (token && token !== match.token) startMatch(token);
    else if (!token && match.active) exitMatch({ push: false });
});

// ---------------------------------------------------------------- session

function showSignIn() {
    if (match.active) match.leave();
    menu.showAuth();
}

async function afterSignIn() {
    const returnUrl = new URLSearchParams(location.search).get('returnUrl');
    if (returnUrl && returnUrl.startsWith('/') && !returnUrl.startsWith('//')) {
        location.href = returnUrl;
        return;
    }
    if (location.search) history.replaceState(history.state, '', location.pathname);
    const token = tokenInPath();
    if (token) startMatch(token);
    else menu.showMain();
}

async function signOut() {
    try {
        if (match.active) await match.leave();
        await api.logout();
    } catch (error) {
        toast(error.message);
    }
    history.pushState({}, '', '/');
    showSignIn();
}

// ---------------------------------------------------------------- input and the buttons of the HUD

const input = new Input(stage.renderer.domElement, {
    keyDown: (code, e) => {
        if (match.active && match.world) return match.keyDown(code, e);
        return false;
    },
    keyUp: code => (match.active && match.world ? match.keyUp(code) : false),
    rotate: (dx, dy) => {
        if (match.active && match.world) stage.rig.rotate(dx, dy);
    },
    zoom: delta => {
        if (match.active && match.world) stage.rig.zoom(delta);
    },
    click: (x, y) => {
        if (match.active && match.world) match.click(x, y);
    },
});

function wireHud() {
    const fire = $('bw-btn-fire');
    fire.addEventListener('pointerdown', e => {
        e.preventDefault();
        match.startCharge();
    });
    fire.addEventListener('pointerup', () => match.releaseCharge());
    fire.addEventListener('pointerleave', () => match.releaseCharge());
    $('bw-btn-skip').onclick = () => match.skip();
    $('bw-btn-help').onclick = () => ($('bw-help').hidden = !$('bw-help').hidden);
    $('bw-help-close').onclick = () => ($('bw-help').hidden = true);
    $('bw-btn-menu').onclick = () => ($('bw-dropdown').hidden = !$('bw-dropdown').hidden);
    const soundButton = $('bw-btn-sound');
    soundButton.classList.toggle('is-off', sound.muted);
    soundButton.onclick = () => soundButton.classList.toggle('is-off', sound.toggle());
    $('bw-btn-full').onclick = () => {
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen?.().catch(() => {});
    };
    $('bw-btn-surrender').onclick = () => {
        $('bw-dropdown').hidden = true;
        $('bw-confirm').hidden = false;
    };
    $('bw-btn-leave').onclick = () => {
        $('bw-dropdown').hidden = true;
        exitMatch();
    };
    $('bw-confirm-no').onclick = () => ($('bw-confirm').hidden = true);
    $('bw-confirm-yes').onclick = () => {
        $('bw-confirm').hidden = true;
        match.surrender();
    };
    const chatInput = $('bw-chat-input');
    $('bw-chat-form').addEventListener('submit', e => {
        e.preventDefault();
        const text = chatInput.value.trim();
        chatInput.value = '';
        chatInput.blur();
        if (text) match.chat(text);
    });
    chatInput.addEventListener('keydown', e => {
        if (e.key === 'Escape') chatInput.blur();
    });
}

// ---------------------------------------------------------------- the frame

let previous = performance.now();
function frame(now) {
    const dt = Math.min(0.05, (now - previous) / 1000);
    previous = now;
    const playing = match.active && match.frame(dt, now, input);
    if (!playing) {
        showcase.update(dt, now / 1000);
        floaters.update(dt);
    }
    stage.render();
    requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- start

function hideSplash() {
    $('bw-splash').classList.add('is-gone');
}

async function boot() {
    wireHud();
    requestAnimationFrame(frame);
    try {
        await api.refreshSession();
    } catch (error) {
        hideSplash();
        toast(error.message);
        return;
    }
    // the island first (behind the sign-in too), but never wait for it longer than a few seconds
    await Promise.race([showcase.show(), new Promise(resolve => setTimeout(resolve, 4000))]);
    hideSplash();
    if (session.signedIn) afterSignIn();
    else showSignIn();
}

boot();

