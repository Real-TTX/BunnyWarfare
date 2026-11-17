// BunnyWarfare in the browser: connects to the hub, keeps the state of the match, drives the scene, the input and the HUD.
// The server decides everything; the browser shows it, walks the own bunny (the server checks each step) and plays the shots the server computed.
import * as THREE from 'three';
import { Stage } from './scene.js';
import { World } from './world.js';
import { ShotPlayback } from './playback.js';
import { Input } from './input.js';
import { Hud, ammoLeft } from './hud.js';
import { Sound } from './audio.js';
import { Floaters } from './effects.js';

const TOKEN = document.body.dataset.token;
const ME = Number(document.body.dataset.playerId);
const QUICK = document.body.dataset.quick === '1';

const MAX_SPEED = 24;          // Simulation.MaxSpeed
const WALK_SPEED = 2.2;        // metres per second
const PITCH_MIN = -30 * Math.PI / 180;
const PITCH_MAX = 85 * Math.PI / 180;
const CHARGE_SECONDS = 1.5;
const MOVE_INTERVAL = 100;     // ms between Move messages
const AIM_INTERVAL = 200;      // ms between AimAt messages

const hud = new Hud();
const sound = new Sound();
const stage = new Stage(document.getElementById('bw-stage'));
const floaters = new Floaters(document.getElementById('bw-floaters'), stage.camera);
const raycaster = new THREE.Raycaster();

const state = {
    room: null,
    world: null,
    teams: [],
    weapons: [],
    gravity: 9.81,
    turn: null,
    turnAt: 0,
    lastTurnNumber: -1,
    myTeam: null,
    weaponId: null,
    pitch: 0.55,
    power: 0,
    charging: false,
    chargeStart: 0,
    awaitingShot: false,
    airTarget: null,
    airMarker: null,
    stamina: 0,
    lastSent: null,
    lastAim: { yaw: 0, pitch: 0, weaponId: 0, at: 0 },
    playback: null,
    pendingTurns: [],
    pendingOver: null,
    result: null,
    quickDone: false,
    hudClock: 0,
};

// ---------------------------------------------------------------- the connection

const hub = new signalR.HubConnectionBuilder()
    .withUrl('/hub/game')
    .withAutomaticReconnect([0, 1000, 2000, 5000, 10000, 10000, 30000])
    .configureLogging(signalR.LogLevel.Warning)
    .build();

// SignalR treats a value returned by a handler as a "client result" and complains: every handler returns nothing
hub.on('Room', room => { applyRoom(room); });
hub.on('Turn', update => {
    if (state.playback) {
        state.pendingTurns.push(update);
    } else {
        applyTurn(update);
    }
});
hub.on('Moved', moved => { onMoved(moved); });
hub.on('Aim', aim => { onAim(aim); });
hub.on('Shot', shot => { onShot(shot); });
hub.on('Chat', message => { hud.chat(message); });
hub.on('GameOver', result => {
    if (state.playback) {
        state.pendingOver = result;
    } else {
        showOver(result);
    }
});
hub.onreconnecting(() => hud.banner('Verbindung verloren … wird wiederhergestellt'));
hub.onreconnected(async () => {
    hud.banner(null);
    await join();
});
hub.onclose(() => hud.banner('Verbindung getrennt – bitte die Seite neu laden.'));

/** The message of a HubException (without the text SignalR puts before it). */
function errorText(error) {
    const text = String(error?.message ?? error);
    const i = text.indexOf('HubException:');
    return i >= 0 ? text.slice(i + 13).trim() : 'Das hat nicht geklappt.';
}

async function call(method, ...args) {
    try {
        return await hub.invoke(method, ...args);
    } catch (e) {
        hud.toast(errorText(e));
        throw e;
    }
}

function send(method, ...args) {
    if (hub.state === signalR.HubConnectionState.Connected) hub.send(method, ...args).catch(() => {});
}

async function join() {
    try {
        const room = await hub.invoke('Join', TOKEN);
        applyRoom(room);
    } catch (e) {
        hud.loading(false);
        hud.banner(errorText(e));
    }
}

// ---------------------------------------------------------------- the state of the match

const lobbyActions = {
    addBot: level => call('AddBot', level).catch(() => {}),
    remove: index => call('RemoveTeam', index).catch(() => {}),
    start: () => call('Start').catch(() => {}),
    invite: () => {
        const link = `${location.origin}/Play/${TOKEN}`;
        navigator.clipboard?.writeText(link).then(() => hud.toast('Einladungslink kopiert.', 'success'), () => window.prompt('Einladungslink:', link))
            ?? window.prompt('Einladungslink:', link);
    },
};

function applyRoom(room) {
    state.room = room;
    if (room.status === 'Lobby') {
        hud.loading(false);
        hud.show(false);
        hud.lobby(room, ME, lobbyActions);
        quickStart(room);
        return;
    }
    hud.hideLobby();
    if (room.game) {
        buildGame(room.game);
    } else {
        hud.loading(false);
    }
    if ((room.status === 'Finished' || room.status === 'Aborted') && room.result) showOver(room.result);
}

async function quickStart(room) {
    if (!QUICK || state.quickDone || room.hostPlayerId !== ME || room.slots.length !== 1) return;
    state.quickDone = true;
    history.replaceState(null, '', location.pathname);
    try {
        await call('AddBot', 'Normal');
        await call('Start');
    } catch {
        // the toast already said why
    }
}

function buildGame(game) {
    state.playback?.finish();
    state.playback = null;
    state.pendingTurns = [];
    state.world?.dispose();
    state.world = new World(stage, game);
    state.airMarker = null;
    state.weapons = game.weapons;
    state.gravity = game.world.gravity;
    state.lastTurnNumber = -1;
    applyTurn({ turn: game.turn, bunnies: game.bunnies, teams: game.teams });
    stage.rig.focus(focusPoint(), true);
    hud.show(true);
    hud.loading(false);
}

function currentBunny() {
    return state.turn ? state.world?.bunnies.get(state.turn.bunnyId) : null;
}

function teamOf(index) {
    return state.teams.find(t => t.index === index);
}

function applyTurn(update) {
    const world = state.world;
    if (!world) return;
    const turn = update.turn;
    state.turn = turn;
    state.turnAt = performance.now();
    state.teams = update.teams;
    world.setTeams(update.teams);
    world.setBunnies(update.bunnies);
    state.myTeam = update.teams.find(t => t.playerId === ME) ?? null;
    const bunny = currentBunny();
    world.marker.attach(turn.phase === 'Over' ? null : bunny);

    if (turn.number !== state.lastTurnNumber) {
        state.lastTurnNumber = turn.number;
        state.charging = false;
        state.power = 0;
        state.awaitingShot = false;
        state.airTarget = null;
        if (state.airMarker) state.airMarker.visible = false;
        for (const b of world.bunnies.values()) b.setAim(null);
        if (bunny) {
            state.lastSent = { x: bunny.position.x, y: bunny.position.y, z: bunny.position.z, at: 0 };
            if (isMine()) {
                stage.rig.yaw = bunny.yaw;
                sound.ping();
                hud.toast('Du bist dran!', 'success');
            }
        }
    }
    state.stamina = turn.stamina;
    ensureWeapon();
    refreshHud(true);
}

/** The selected weapon must exist and have ammo left; otherwise the first one that does. */
function ensureWeapon() {
    const team = state.myTeam;
    const current = state.weapons.find(w => w.id === state.weaponId);
    if (current && ammoLeft(current, team) !== 0) return;
    state.weaponId = state.weapons.find(w => ammoLeft(w, team) !== 0)?.id ?? null;
}

function selectedWeapon() {
    return state.weapons.find(w => w.id === state.weaponId) ?? null;
}

/** It is the turn of my team (walking allowed: aiming and retreat). */
function isMine() {
    const t = state.turn;
    return !!(t && state.myTeam && t.team === state.myTeam.index && (t.phase === 'Aiming' || t.phase === 'Retreat') && !state.playback && currentBunny()?.alive);
}

function canAim() {
    return isMine() && state.turn.phase === 'Aiming' && !state.awaitingShot;
}

function onMoved(m) {
    const b = state.world?.bunnies.get(m.bunnyId);
    if (!b) return;
    if (m.correction) {
        b.snap(m.x, m.y, m.z, m.yaw);
        state.stamina = m.stamina;
        state.lastSent = { x: m.x, y: m.y, z: m.z, at: performance.now() };
    } else {
        b.walkTo(m.x, m.y, m.z, m.yaw);
    }
}

function onAim(a) {
    const world = state.world;
    const b = world?.bunnies.get(a.bunnyId);
    if (!b || (isMine() && b === currentBunny())) return;
    b.goalYaw = a.yaw;
    const weapon = state.weapons.find(w => w.id === a.weaponId);
    b.setAim(aimPoints(b, a.yaw, a.pitch, weapon, 0.55));
}

function onShot(result) {
    const world = state.world;
    if (!world) return;
    state.charging = false;
    state.power = 0;
    state.awaitingShot = false;
    if (state.airMarker) state.airMarker.visible = false;
    for (const b of world.bunnies.values()) b.setAim(null);
    if (state.turn) state.turn = { ...state.turn, phase: 'Resolving' };
    state.playback?.finish();
    state.playback = new ShotPlayback(world, result, {
        launch: () => sound.fire(),
        explosion: (e, point) => {
            world.effects.explosion(point, e.radius);
            stage.rig.shake(0.3 + e.radius * 0.15);
            sound.boom(e.radius);
        },
        damage: (e, bunny) => floaters.add(bunny.position, `−${e.amount}`),
        death: (e, bunny) => floaters.add(bunny.position, e.cause === 'water' ? 'Plumps!' : 'K.O.', 'ko'),
        splash: point => {
            world.effects.splash(point);
            sound.splash();
        },
        ray: (from, to) => world.effects.ray(from, to),
    });
    refreshHud(true);
}

function playbackFinished() {
    state.playback = null;
    const turns = state.pendingTurns;
    state.pendingTurns = [];
    for (const t of turns) applyTurn(t);
    if (state.pendingOver) {
        const over = state.pendingOver;
        state.pendingOver = null;
        showOver(over);
    }
}

function showOver(result) {
    state.result = result;
    if (state.turn) state.turn = { ...state.turn, phase: 'Over' };
    state.world?.marker.attach(null);
    hud.loading(false);
    hud.gameOver(result, state.world ? () => {} : null);
    refreshHud(true);
}

// ---------------------------------------------------------------- aiming and firing

/** The first ~0.6 s of a shot as points (a hint, not a prediction: no wind, no ground). */
function aimPoints(bunny, yaw, pitch, weapon, power) {
    if (!weapon || weapon.kind === 'Airstrike') return null;
    const dir = new THREE.Vector3(Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), Math.cos(pitch) * Math.cos(yaw));
    const origin = bunny.position.clone().add(new THREE.Vector3(0, 0.85, 0)).addScaledVector(dir, 0.6);
    if (weapon.kind === 'Hitscan') return [origin, origin.clone().addScaledVector(dir, 12)];
    const factor = weapon.kind === 'Grenade' ? 0.8 : weapon.kind === 'Cluster' ? 0.9 : 1;
    const v = dir.multiplyScalar(Math.max(0.15, power) * MAX_SPEED * factor);
    const points = [];
    for (let t = 0; t <= 0.6001; t += 0.04) {
        points.push(new THREE.Vector3(origin.x + v.x * t, origin.y + v.y * t - 0.5 * state.gravity * t * t, origin.z + v.z * t));
    }
    return points;
}

function startCharge() {
    if (!canAim()) return;
    const weapon = selectedWeapon();
    if (!weapon) return;
    if (weapon.kind === 'Airstrike' || weapon.kind === 'Hitscan') {
        fire(1);
        return;
    }
    state.charging = true;
    state.chargeStart = performance.now();
}

function releaseCharge() {
    if (!state.charging) return;
    state.charging = false;
    fire(state.power);
}

const r3 = v => Math.round(v * 1000) / 1000;

async function fire(power) {
    const weapon = selectedWeapon();
    if (!canAim() || !weapon) return;
    if (ammoLeft(weapon, state.myTeam) === 0) {
        hud.toast('Keine Munition mehr.');
        return;
    }
    let tx = 0, tz = 0;
    if (weapon.kind === 'Airstrike') {
        if (!state.airTarget) {
            hud.toast('Erst ein Ziel auf der Insel anklicken.', 'info');
            return;
        }
        tx = state.airTarget.x;
        tz = state.airTarget.z;
    }
    state.awaitingShot = true;
    try {
        await call('Fire', weapon.id, r3(stage.rig.yaw), r3(state.pitch), r3(Math.max(0.05, power)), r3(tx), r3(tz));
    } catch {
        state.awaitingShot = false;
    }
}

function selectWeapon(id) {
    const weapon = state.weapons.find(w => w.id === id);
    if (!weapon || ammoLeft(weapon, state.myTeam) === 0) return;
    state.weaponId = id;
    state.charging = false;
    state.power = 0;
    if (weapon.kind !== 'Airstrike' && state.airMarker) state.airMarker.visible = false;
    if (weapon.kind === 'Airstrike' && isMine()) hud.toast('Luftschlag: Ziel auf der Insel anklicken, dann Feuer.', 'info');
    refreshHud(true);
}

function placeAirTarget(clientX, clientY) {
    const world = state.world;
    const weapon = selectedWeapon();
    if (!world || !canAim() || weapon?.kind !== 'Airstrike') return;
    const rect = stage.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, stage.camera);
    const hit = raycaster.intersectObject(world.terrain.mesh, false)[0];
    if (!hit) return;
    state.airTarget = hit.point.clone();
    if (!state.airMarker) {
        const ring = new THREE.Mesh(new THREE.RingGeometry(1.4, 1.75, 32), new THREE.MeshBasicMaterial({ color: 0xff3b1f, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }));
        ring.rotation.x = -Math.PI / 2;
        ring.renderOrder = 6;
        world.group.add(ring);
        state.airMarker = ring;
    }
    state.airMarker.position.set(hit.point.x, hit.point.y + 0.08, hit.point.z);
    state.airMarker.visible = true;
}

// ---------------------------------------------------------------- walking

function walk(dt, input) {
    const bunny = currentBunny();
    const world = state.world;
    if (!bunny || !world || !state.lastSent) return;
    const forward = stage.rig.forward, right = stage.rig.right;
    const dir = new THREE.Vector3();
    if (input.isDown('KeyW')) dir.add(forward);
    if (input.isDown('KeyS')) dir.sub(forward);
    if (input.isDown('KeyD')) dir.add(right);
    if (input.isDown('KeyA')) dir.sub(right);
    const now = performance.now();
    if (dir.lengthSq() < 1e-6) {
        flushMove(bunny, now, true);
        return;
    }
    dir.normalize();
    const step = Math.min(WALK_SPEED * dt, state.stamina);
    if (step <= 0.001) {
        flushMove(bunny, now, true);
        return;
    }
    const nx = bunny.position.x + dir.x * step;
    const nz = bunny.position.z + dir.z * step;
    const ground = world.heightAt(nx, nz);
    const yaw = Math.atan2(dir.x, dir.z);
    // the same rules as the server: on the island, out of the water, not up a wall
    const rise = ground - bunny.position.y;
    const last = state.lastSent;
    const sinceSent = Math.hypot(nx - last.x, nz - last.z);
    const riseSent = ground - last.y;
    const ok = world.data.inside(nx, nz) && nx > 0.3 && nz > 0.3 && nx < world.width - 0.3 && nz < world.width - 0.3
        && ground >= world.data.waterLevel + 0.08
        && !(rise > 0.05 && rise / step > 1.6)
        && !(riseSent > 0.3 && riseSent / Math.max(sinceSent, 0.01) > 1.6)
        && sinceSent < 1.5;
    bunny.goalYaw = yaw;
    if (!ok) {
        flushMove(bunny, now, true);
        return;
    }
    bunny.position.set(nx, ground, nz);
    bunny.goal.copy(bunny.position);
    bunny.moving = 0.15;
    state.stamina = Math.max(0, state.stamina - step);
    flushMove(bunny, now, false);
}

/** Sends the position of the own bunny at most every 100 ms (and once more when it stops). */
function flushMove(bunny, now, stopped) {
    const last = state.lastSent;
    if (!last) return;
    const moved = Math.hypot(bunny.position.x - last.x, bunny.position.z - last.z) > 0.01;
    if (!moved || (!stopped && now - last.at < MOVE_INTERVAL)) return;
    send('Move', r3(bunny.position.x), r3(bunny.position.z), r3(bunny.goalYaw));
    state.lastSent = { x: bunny.position.x, y: bunny.position.y, z: bunny.position.z, at: now };
}

// ---------------------------------------------------------------- input

const input = new Input(stage.renderer.domElement, {
    keyDown: (code, e) => {
        if (code === 'Space') {
            if (!e.repeat) startCharge();
            return true;
        }
        if (/^Digit[1-9]$/.test(code)) {
            const weapon = state.weapons[Number(code.slice(5)) - 1];
            if (weapon) selectWeapon(weapon.id);
            return true;
        }
        if (code === 'Tab') {
            if (isMine()) call('SkipTurn').catch(() => {});
            return true;
        }
        if (code === 'Enter') {
            document.getElementById('bw-chat-input').focus();
            return true;
        }
        if (code === 'KeyH') {
            toggle('bw-help');
            return true;
        }
        if (code === 'Escape') {
            document.getElementById('bw-help').hidden = true;
            document.getElementById('bw-dropdown').hidden = true;
            return true;
        }
        return ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code);
    },
    keyUp: code => {
        if (code === 'Space') {
            releaseCharge();
            return true;
        }
        return false;
    },
    rotate: (dx, dy) => stage.rig.rotate(dx, dy),
    zoom: delta => stage.rig.zoom(delta),
    click: (x, y) => placeAirTarget(x, y),
});

function toggle(id) {
    const e = document.getElementById(id);
    e.hidden = !e.hidden;
}

function wireButtons() {
    const fireButton = document.getElementById('bw-btn-fire');
    fireButton.addEventListener('pointerdown', e => {
        e.preventDefault();
        startCharge();
    });
    fireButton.addEventListener('pointerup', () => releaseCharge());
    fireButton.addEventListener('pointerleave', () => releaseCharge());
    document.getElementById('bw-btn-skip').onclick = () => call('SkipTurn').catch(() => {});
    document.getElementById('bw-btn-help').onclick = () => toggle('bw-help');
    document.getElementById('bw-help-close').onclick = () => (document.getElementById('bw-help').hidden = true);
    document.getElementById('bw-btn-menu').onclick = () => toggle('bw-dropdown');
    const soundButton = document.getElementById('bw-btn-sound');
    soundButton.classList.toggle('is-off', sound.muted);
    soundButton.onclick = () => soundButton.classList.toggle('is-off', sound.toggle());
    document.getElementById('bw-btn-full').onclick = () => {
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen?.().catch(() => {});
    };
    document.getElementById('bw-btn-surrender').onclick = () => {
        document.getElementById('bw-dropdown').hidden = true;
        document.getElementById('bw-confirm').hidden = false;
    };
    document.getElementById('bw-confirm-no').onclick = () => (document.getElementById('bw-confirm').hidden = true);
    document.getElementById('bw-confirm-yes').onclick = () => {
        document.getElementById('bw-confirm').hidden = true;
        call('Surrender').catch(() => {});
    };
    const chatInput = document.getElementById('bw-chat-input');
    document.getElementById('bw-chat-form').addEventListener('submit', e => {
        e.preventDefault();
        const text = chatInput.value.trim();
        chatInput.value = '';
        chatInput.blur();
        if (text) call('Chat', text).catch(() => {});
    });
    chatInput.addEventListener('keydown', e => {
        if (e.key === 'Escape') chatInput.blur();
    });
}

// ---------------------------------------------------------------- the frame

function focusPoint() {
    const bunny = currentBunny();
    if (bunny) return bunny.position.clone().add(new THREE.Vector3(0, 0.9, 0));
    const w = state.world?.width ?? 20;
    return new THREE.Vector3(w / 2, 2, w / 2);
}

function refreshHud(full = false) {
    const world = state.world;
    const turn = state.turn;
    if (!world || !turn) return;
    const team = teamOf(turn.team);
    const bunny = currentBunny();
    const mine = isMine();
    const phaseText = { Aiming: 'zielt', Resolving: 'Schuss!', Retreat: 'Rückzug!', Over: '' }[turn.phase] ?? '';
    if (turn.phase === 'Over' || state.result) {
        hud.turn({ title: 'Spiel vorbei', sub: state.result?.winnerName ? `${state.result.winnerName} gewinnt` : '', color: '#888', mine: false });
    } else {
        hud.turn({
            title: mine ? 'Du bist dran!' : team?.name ?? '–',
            sub: `${bunny?.name ?? ''} ${phaseText}${mine && turn.phase === 'Retreat' ? ' – lauf in Deckung' : ''}`,
            color: team?.color,
            mine,
        });
    }
    const counting = turn.phase === 'Aiming' || turn.phase === 'Retreat';
    hud.timer(counting && !state.result ? turn.endsInMs - (performance.now() - state.turnAt) : null);
    hud.wind(turn.windX, turn.windZ, turn.maxWind, stage.rig.yaw);
    hud.stamina(state.stamina, turn.maxStamina, mine);
    hud.power(state.power, state.charging);
    const weapon = selectedWeapon();
    const aimText = weapon?.kind === 'Airstrike' ? (state.airTarget ? 'Ziel gesetzt' : 'Ziel anklicken') : `Winkel ${Math.round(state.pitch * 180 / Math.PI)}°`;
    hud.aimInfo(`${weapon?.name ?? '–'} · ${aimText}`);
    hud.controls(canAim(), mine, weapon?.kind === 'Airstrike' || weapon?.kind === 'Hitscan' ? 'Feuer' : 'Feuer (halten)');
    if (full) {
        hud.teams(state.teams, world.bunnies.values(), turn.team);
        hud.weapons(state.weapons, state.myTeam, state.weaponId, !!state.myTeam && !state.result, selectWeapon);
    }
}

let previous = performance.now();
function frame(now) {
    const dt = Math.min(0.05, (now - previous) / 1000);
    previous = now;
    const world = state.world;
    if (world) {
        const mine = isMine();
        // keyboard camera turn (Q / E, ← / →)
        if (input.isDown('KeyQ', 'ArrowLeft')) stage.rig.yaw += dt * 1.6;
        if (input.isDown('KeyE', 'ArrowRight')) stage.rig.yaw -= dt * 1.6;

        if (mine) walk(dt, input);
        if (canAim()) {
            if (input.isDown('ArrowUp', 'KeyR')) state.pitch = Math.min(PITCH_MAX, state.pitch + dt * 0.9);
            if (input.isDown('ArrowDown', 'KeyF')) state.pitch = Math.max(PITCH_MIN, state.pitch - dt * 0.9);
            if (state.charging) {
                state.power = Math.min(1, (now - state.chargeStart) / 1000 / CHARGE_SECONDS);
                if (state.power >= 1) releaseCharge();
            }
            const bunny = currentBunny();
            const moving = input.isDown('KeyW', 'KeyA', 'KeyS', 'KeyD');
            if (!moving) bunny.goalYaw = stage.rig.yaw;
            bunny.setAim(aimPoints(bunny, stage.rig.yaw, state.pitch, selectedWeapon(), state.charging ? state.power : 0.55));
            const a = state.lastAim;
            if (now - a.at > AIM_INTERVAL && (Math.abs(a.yaw - stage.rig.yaw) > 0.01 || Math.abs(a.pitch - state.pitch) > 0.01 || a.weaponId !== state.weaponId)) {
                state.lastAim = { yaw: stage.rig.yaw, pitch: state.pitch, weaponId: state.weaponId ?? 0, at: now };
                send('AimAt', r3(stage.rig.yaw), r3(state.pitch), state.weaponId ?? 0);
            }
        } else if (mine) {
            currentBunny()?.setAim(null);
        }

        if (state.playback) {
            // late messages waiting: catch up faster
            state.playback.update(state.pendingTurns.length > 0 ? dt * 2.5 : dt);
            stage.rig.focus(state.playback.focus ?? focusPoint());
            if (state.playback.done) playbackFinished();
        } else {
            stage.rig.focus(focusPoint());
        }
        if (state.airMarker?.visible) state.airMarker.rotation.z += dt;

        world.update(dt, now / 1000);
        stage.rig.update(dt, (x, z) => world.heightAt(x, z));
        floaters.update(dt);

        state.hudClock += dt;
        state.fullClock = (state.fullClock ?? 0) + dt;
        if (state.hudClock > 0.1) {
            state.hudClock = 0;
            const full = state.fullClock > 0.3;
            if (full) state.fullClock = 0;
            refreshHud(full);
        }
    } else {
        // the lobby: a slowly turning empty sky behind the cards
        stage.rig.yaw += dt * 0.05;
        stage.rig.update(dt);
    }
    stage.render();
    requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- start

wireButtons();
stage.scene.background = new THREE.Color(0x1b1712);
requestAnimationFrame(frame);
hub.start().then(join).catch(e => {
    hud.loading(false);
    hud.banner(`Keine Verbindung zum Server: ${errorText(e)}`);
});
