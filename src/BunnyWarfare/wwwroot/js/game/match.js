// One match in the browser: connects to the hub, keeps the state of the match, drives the island, the input and the HUD.
// The server decides everything; the browser shows it, walks the own bunny (the server checks each step) and plays the shots the server computed.
import * as THREE from 'three';
import { World } from './world.js';
import { ShotPlayback } from './playback.js';
import { AimGuide, predictShot } from './aim.js';
import { ammoLeft } from './hud.js';
import { $, toast, banner } from './ui.js';

const WALK_SPEED = 2.2;        // metres per second
const PITCH_MIN = -30 * Math.PI / 180;
const PITCH_MAX = 85 * Math.PI / 180;
const FINE = 0.22;             // Shift: fine aim (share of the normal speed)
const DEFAULT_POWER = 0.6;     // the power the guide shows before the first shot of a weapon
const QUIPS = ['Für die Möhre!', 'Jetzt gibt\'s Salat!', 'Ohren steif!', 'Hopp, hopp!', 'Wer hat meine Karotte?', 'Achtung, Hase!', 'Möhren marsch!', 'Gleich knallt\'s!', 'Kopf runter!', 'Ich hab Hunger!'];
const CHARGE_SECONDS = 1.5;
const MOVE_INTERVAL = 100;     // ms between Move messages
const AIM_INTERVAL = 200;      // ms between AimAt messages

const r3 = v => Math.round(v * 1000) / 1000;

/** The message of a HubException (without the text SignalR puts before it). */
function errorText(error) {
    const text = String(error?.message ?? error);
    const i = text.indexOf('HubException:');
    return i >= 0 ? text.slice(i + 13).trim() : 'Das hat nicht geklappt.';
}

export class Match {
    /** ctx: stage, sound, floaters, hud, me (player id), onExit(), onAgain({ quick }) */
    constructor(ctx) {
        this.ctx = ctx;
        this.stage = ctx.stage;
        this.hud = ctx.hud;
        this.sound = ctx.sound;
        this.floaters = ctx.floaters;
        this.token = null;
        this.hub = null;
        this.active = false;
        this.reset();
    }

    reset() {
        this.state = {
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
            lastPower: {},
            pitchHold: 0,
            yawHold: 0,
            stamina: 0,
            lastSent: null,
            lastAim: { yaw: 0, pitch: 0, weaponId: 0, at: 0 },
            playback: null,
            pendingTurns: [],
            pendingOver: null,
            result: null,
            quickDone: false,
            hudClock: 0,
            fullClock: 0,
            overHidden: false,
        };
    }

    get world() {
        return this.state.world;
    }

    /** Opens a match by its token; quick = { bots, level } adds the bots and starts at once (host only, empty lobby). */
    async start(token, { quick = null } = {}) {
        this.token = token;
        this.quick = quick;
        this.active = true;
        this.reset();
        this.hud.clearChat();
        this.hud.resetWeapons();
        const hub = new signalR.HubConnectionBuilder()
            .withUrl('/hub/game')
            .withAutomaticReconnect([0, 1000, 2000, 5000, 10000, 10000, 30000])
            .configureLogging(signalR.LogLevel.Warning)
            .build();
        this.hub = hub;
        // SignalR treats a value returned by a handler as a "client result" and complains: every handler returns nothing
        hub.on('Room', room => { this.applyRoom(room); });
        hub.on('Turn', update => {
            if (this.state.playback) this.state.pendingTurns.push(update);
            else this.applyTurn(update);
        });
        hub.on('Moved', moved => { this.onMoved(moved); });
        hub.on('Aim', aim => { this.onAim(aim); });
        hub.on('Shot', shot => { this.onShot(shot); });
        hub.on('Chat', message => { this.hud.chat(message); });
        hub.on('GameOver', result => {
            if (this.state.playback) this.state.pendingOver = result;
            else this.showOver(result);
        });
        hub.onreconnecting(() => { if (this.hub === hub) banner('Verbindung verloren … wird wiederhergestellt'); });
        hub.onreconnected(async () => {
            if (this.hub !== hub) return;
            banner(null);
            await this.join();
        });
        hub.onclose(() => { if (this.hub === hub && this.active) banner('Verbindung getrennt – bitte die Seite neu laden.'); });
        try {
            await hub.start();
            if (this.hub !== hub) return;
            await this.join();
        } catch (e) {
            if (this.hub !== hub) return;
            toast(`Keine Verbindung zum Server: ${errorText(e)}`);
            this.ctx.onExit();
        }
    }

    /** Leaves the match: closes the connection and drops the island (the menu builds its own). */
    async leave() {
        this.active = false;
        const hub = this.hub;
        this.hub = null;
        banner(null);
        this.state.playback?.finish?.();
        this.state.world?.dispose();
        this.state.world = null;
        this.hud.show(false);
        this.hud.hideLobby();
        this.hud.hideOver();
        $('bw-help').hidden = true;
        $('bw-dropdown').hidden = true;
        $('bw-confirm').hidden = true;
        this.guide?.dispose();
        this.guide = null;
        this.stage.rig.followRate = 5;
        this.stage.rig.autoDistance = 0;
        this.stage.rig.manualZoom = false;
        this.stage.rig.manualPitch = false;
        this.stage.rig.autoPitch = 0;
        this.stage.setCenterShift(0);
        if (hub) await hub.stop().catch(() => {});
    }

    async call(method, ...args) {
        try {
            return await this.hub.invoke(method, ...args);
        } catch (e) {
            toast(errorText(e));
            throw e;
        }
    }

    send(method, ...args) {
        if (this.hub?.state === signalR.HubConnectionState.Connected) this.hub.send(method, ...args).catch(() => {});
    }

    async join() {
        try {
            const room = await this.hub.invoke('Join', this.token);
            this.applyRoom(room);
        } catch (e) {
            toast(errorText(e));
            this.ctx.onExit();
        }
    }

    // ---------------------------------------------------------------- the state of the match

    get lobbyActions() {
        return {
            addBot: level => this.call('AddBot', level).catch(() => {}),
            remove: index => this.call('RemoveTeam', index).catch(() => {}),
            start: () => this.call('Start').catch(() => {}),
            chat: text => this.call('Chat', text).catch(() => {}),
            leave: () => this.ctx.onExit(),
            link: () => `${location.origin}/Play/${this.token}`,
        };
    }

    applyRoom(room) {
        const state = this.state;
        state.room = room;
        this.ctx.onRoom?.(room);
        if (room.status === 'Lobby') {
            this.hud.show(false);
            this.hud.lobby(room, this.ctx.me(), this.lobbyActions);
            this.quickStart(room);
            return;
        }
        this.hud.hideLobby();
        if (room.game) this.buildGame(room.game);
        if ((room.status === 'Finished' || room.status === 'Aborted') && room.result) this.showOver(room.result);
    }

    async quickStart(room) {
        const quick = this.quick;
        const state = this.state;
        if (!quick || state.quickDone || room.hostPlayerId !== this.ctx.me() || room.slots.length !== 1) return;
        state.quickDone = true;
        try {
            const bots = Math.max(1, Math.min(room.maxTeams - 1, quick.bots ?? 1));
            for (let i = 0; i < bots; i++) await this.call('AddBot', quick.level ?? 'Normal');
            await this.call('Start');
        } catch {
            // the toast already said why
        }
    }

    buildGame(game) {
        const state = this.state;
        state.playback?.finish();
        state.playback = null;
        state.pendingTurns = [];
        state.world?.dispose();
        this.ctx.beforeWorld?.();
        this.guide?.dispose();
        state.world = new World(this.stage, game);
        this.guide = new AimGuide(state.world.group);
        this.stage.setCenterShift(0.13);
        state.weapons = game.weapons;
        state.gravity = game.world.gravity;
        state.lastTurnNumber = -1;
        this.hud.resetWeapons();
        this.applyTurn({ turn: game.turn, bunnies: game.bunnies, teams: game.teams });
        this.stage.rig.distance = 10;
        this.stage.rig.pitch = 0.42;
        this.stage.rig.focus(this.focusPoint(), true);
        this.hud.show(true);
    }

    currentBunny() {
        const s = this.state;
        return s.turn ? s.world?.bunnies.get(s.turn.bunnyId) : null;
    }

    teamOf(index) {
        return this.state.teams.find(t => t.index === index);
    }

    applyTurn(update) {
        const state = this.state;
        const world = state.world;
        if (!world) return;
        const turn = update.turn;
        state.turn = turn;
        state.turnAt = performance.now();
        state.teams = update.teams;
        world.setTeams(update.teams);
        world.setBunnies(update.bunnies);
        world.setWind?.(turn.windX, turn.windZ);
        state.myTeam = update.teams.find(t => t.playerId === this.ctx.me()) ?? null;
        const bunny = this.currentBunny();
        world.marker.attach(turn.phase === 'Over' ? null : bunny);

        if (turn.number !== state.lastTurnNumber) {
            state.lastTurnNumber = turn.number;
            state.charging = false;
            state.power = 0;
            state.awaitingShot = false;
            state.airTarget = null;
            this.guide?.hide();
            for (const b of world.bunnies.values()) {
                b.setAim(null);
                if (b !== bunny && b.alive) b.play?.('idle');
            }
            if (bunny) {
                state.lastSent = { x: bunny.position.x, y: bunny.position.y, z: bunny.position.z, at: 0 };
                if (this.isMine()) {
                    this.stage.rig.yaw = bunny.yaw;
                    this.stage.rig.manualZoom = false;
                    this.stage.rig.manualPitch = false;
                    this.sound.ping();
                    toast('Du bist dran!', 'success');
                }
                if (turn.phase === 'Aiming') bunny.say?.(QUIPS[Math.floor(Math.random() * QUIPS.length)]);
            }
        }
        state.stamina = turn.stamina;
        this.ensureWeapon();
        this.equip();
        this.refreshHud(true);
    }

    /** The selected weapon must exist and have ammo left; otherwise the first one that does. */
    ensureWeapon() {
        const state = this.state;
        const team = state.myTeam;
        const current = state.weapons.find(w => w.id === state.weaponId);
        if (current && ammoLeft(current, team) !== 0) return;
        state.weaponId = state.weapons.find(w => ammoLeft(w, team) !== 0)?.id ?? null;
    }

    selectedWeapon() {
        return this.state.weapons.find(w => w.id === this.state.weaponId) ?? null;
    }

    /** The bunny of my turn holds the selected weapon. */
    equip() {
        const bunny = this.currentBunny();
        if (bunny && this.isMine()) bunny.setWeapon?.(this.selectedWeapon()?.kind ?? null);
    }

    /** It is the turn of my team (walking allowed: aiming and retreat). */
    isMine() {
        const s = this.state;
        const t = s.turn;
        return !!(t && s.myTeam && t.team === s.myTeam.index && (t.phase === 'Aiming' || t.phase === 'Retreat') && !s.playback && this.currentBunny()?.alive);
    }

    canAim() {
        return this.isMine() && this.state.turn.phase === 'Aiming' && !this.state.awaitingShot;
    }

    onMoved(m) {
        const s = this.state;
        const b = s.world?.bunnies.get(m.bunnyId);
        if (!b) return;
        // my own steps come back from the server: the bunny is already there (pulling it back made the walk rubbery and the bunny hop on the spot)
        if (!m.correction && this.isMine() && b === this.currentBunny()) return;
        if (m.correction) {
            b.snap(m.x, m.y, m.z, m.yaw);
            s.stamina = m.stamina;
            s.lastSent = { x: m.x, y: m.y, z: m.z, at: performance.now() };
        } else {
            b.walkTo(m.x, m.y, m.z, m.yaw);
        }
    }

    onAim(a) {
        const s = this.state;
        const b = s.world?.bunnies.get(a.bunnyId);
        if (!b || (this.isMine() && b === this.currentBunny())) return;
        b.goalYaw = a.yaw;
        const weapon = s.weapons.find(w => w.id === a.weaponId);
        b.setWeapon?.(weapon?.kind ?? null);
        b.setAimPitch?.(a.pitch);
        b.play?.('aim');
        // the others see the direction (the first moment of the flight), not where it lands: they don't know the power
        const start = this.predict(b, weapon, a.yaw, a.pitch, 0.55)?.paths[0]?.points.slice(0, 16);
        b.setAim(start ?? null);
        if (start && weapon.kind !== 'Airstrike') this.guide?.show({ paths: [{ points: start }], impacts: [] }, this.teamOf(b.team)?.color, { impacts: false });
        else this.guide?.hide();
    }

    onShot(result) {
        const s = this.state;
        const world = s.world;
        if (!world) return;
        s.charging = false;
        s.power = 0;
        s.awaitingShot = false;
        this.guide?.hide();
        for (const b of world.bunnies.values()) b.setAim(null);
        if (s.turn) s.turn = { ...s.turn, phase: 'Resolving' };
        world.bunnies.get(result.shooterId)?.play?.('fire');
        s.playback?.finish();
        const stage = this.stage;
        s.playback = new ShotPlayback(world, result, {
            launch: () => this.sound.fire(),
            explosion: (e, point) => {
                world.effects.explosion(point, e.radius);
                stage.rig.shake(0.3 + e.radius * 0.15);
                this.sound.boom(e.radius);
            },
            damage: (e, bunny) => {
                bunny.hurt(e.amount); // bigger hits, more slapstick
                this.floaters.add(bunny.position, `−${e.amount}`);
            },
            death: (e, bunny) => this.floaters.add(bunny.position, e.cause === 'water' ? (world.theme === 'Volcano' ? 'Brutzel!' : 'Plumps!') : 'K.O.', 'ko'),
            splash: point => {
                world.effects.splash(point);
                this.sound.splash();
            },
            ray: (from, to) => world.effects.ray(from, to),
        });
        this.refreshHud(true);
    }

    playbackFinished() {
        const s = this.state;
        s.playback = null;
        const turns = s.pendingTurns;
        s.pendingTurns = [];
        for (const t of turns) this.applyTurn(t);
        if (s.pendingOver) {
            const over = s.pendingOver;
            s.pendingOver = null;
            this.showOver(over);
        }
    }

    showOver(result) {
        const s = this.state;
        s.result = result;
        if (s.turn) s.turn = { ...s.turn, phase: 'Over' };
        s.world?.marker.attach(null);
        // the winners dance, the others watch
        if (s.world && result.winnerTeam !== null && result.winnerTeam !== undefined) {
            for (const b of s.world.bunnies.values()) {
                if (b.alive === false) continue;
                b.play?.(b.team === result.winnerTeam ? 'dance' : 'idle');
            }
        }
        this.hud.gameOver(result, s.myTeam?.index ?? null, {
            again: () => this.ctx.onAgain({ quick: this.quick }),
            menu: () => this.ctx.onExit(),
            view: s.world ? () => {
                this.hud.hideOver();
                s.overHidden = true;
            } : null,
        });
        this.refreshHud(true);
    }

    // ---------------------------------------------------------------- aiming and firing

    /** Where a shot of <bunny> would go (aim.js flies it like the server: gravity, wind of the turn, bounces, bunnies in the way). */
    predict(bunny, weapon, yaw, pitch, power) {
        const s = this.state;
        if (!s.world || !weapon) return null;
        const turn = s.turn;
        return predictShot({
            data: s.world.data,
            bunnies: s.world.bunnies.values(),
            wind: new THREE.Vector2(turn?.windX ?? 0, turn?.windZ ?? 0),
            gravity: s.gravity,
            target: s.airTarget,
        }, bunny, weapon, yaw, pitch, power);
    }

    /** The power the guide shows: while charging the charge, else the power of the last shot with this weapon. */
    guidePower() {
        const s = this.state;
        return s.charging ? s.power : s.lastPower[s.weaponId] ?? DEFAULT_POWER;
    }

    startCharge() {
        if (!this.canAim()) return;
        const weapon = this.selectedWeapon();
        if (!weapon) return;
        if (weapon.kind === 'Airstrike' || weapon.kind === 'Hitscan') {
            this.fire(1);
            return;
        }
        this.state.charging = true;
        this.state.chargeStart = performance.now();
    }

    releaseCharge() {
        if (!this.state.charging) return;
        this.state.charging = false;
        this.fire(this.state.power);
    }

    async fire(power) {
        const s = this.state;
        const weapon = this.selectedWeapon();
        if (!this.canAim() || !weapon) return;
        if (ammoLeft(weapon, s.myTeam) === 0) {
            toast('Keine Munition mehr.');
            return;
        }
        let tx = 0, tz = 0;
        if (weapon.kind === 'Airstrike') {
            if (!s.airTarget) {
                toast('Erst ein Ziel auf der Insel anklicken.', 'info');
                return;
            }
            tx = s.airTarget.x;
            tz = s.airTarget.z;
        }
        s.awaitingShot = true;
        if (weapon.kind !== 'Airstrike' && weapon.kind !== 'Hitscan') s.lastPower[weapon.id] = Math.max(0.05, power);
        try {
            await this.call('Fire', weapon.id, r3(this.stage.rig.yaw), r3(s.pitch), r3(Math.max(0.05, power)), r3(tx), r3(tz));
        } catch {
            s.awaitingShot = false;
        }
    }

    selectWeapon(id) {
        const s = this.state;
        const weapon = s.weapons.find(w => w.id === id);
        if (!weapon || ammoLeft(weapon, s.myTeam) === 0) return;
        s.weaponId = id;
        s.charging = false;
        s.power = 0;
        if (weapon.kind === 'Airstrike' && this.isMine()) toast('Luftschlag: Ziel auf der Insel anklicken, dann Feuer.', 'info');
        this.equip();
        this.refreshHud(true);
    }

    /** The point of the island under the pointer: steps along the ray of the camera until it is below the ground (no mesh needed). */
    groundUnder(clientX, clientY) {
        const world = this.state.world;
        const rect = this.stage.renderer.domElement.getBoundingClientRect();
        const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
        const ray = new THREE.Raycaster();
        ray.setFromCamera(ndc, this.stage.camera);
        const p = ray.ray.origin.clone();
        const step = ray.ray.direction.clone().multiplyScalar(0.25);
        let previous = p.clone();
        for (let i = 0; i < 1200; i++) {
            p.add(step);
            if (world.data.inside(p.x, p.z) && p.y <= world.heightAt(p.x, p.z)) {
                // halve back once for a little precision
                const mid = previous.clone().lerp(p, 0.5);
                const hit = world.data.inside(mid.x, mid.z) && mid.y <= world.heightAt(mid.x, mid.z) ? mid : p;
                return new THREE.Vector3(hit.x, world.heightAt(hit.x, hit.z), hit.z);
            }
            previous = p.clone();
            if (p.y < -20) break;
        }
        return null;
    }

    placeAirTarget(clientX, clientY) {
        const s = this.state;
        const world = s.world;
        const weapon = this.selectedWeapon();
        if (!world || !this.canAim() || weapon?.kind !== 'Airstrike') return;
        const point = this.groundUnder(clientX, clientY);
        if (!point) return;
        s.airTarget = point;
        this.sound.tick();
    }

    // ---------------------------------------------------------------- walking

    walk(dt, input) {
        const s = this.state;
        const bunny = this.currentBunny();
        const world = s.world;
        if (!bunny || !world || !s.lastSent) return;
        const forward = this.stage.rig.forward, right = this.stage.rig.right;
        const dir = new THREE.Vector3();
        if (input.isDown('KeyW')) dir.add(forward);
        if (input.isDown('KeyS')) dir.sub(forward);
        if (input.isDown('KeyD')) dir.add(right);
        if (input.isDown('KeyA')) dir.sub(right);
        const now = performance.now();
        if (dir.lengthSq() < 1e-6) {
            this.flushMove(bunny, now, true);
            return;
        }
        dir.normalize();
        const step = Math.min(WALK_SPEED * dt, s.stamina);
        if (step <= 0.001) {
            this.flushMove(bunny, now, true);
            return;
        }
        const nx = bunny.position.x + dir.x * step;
        const nz = bunny.position.z + dir.z * step;
        const ground = world.heightAt(nx, nz);
        const yaw = Math.atan2(dir.x, dir.z);
        // the same rules as the server: on the island, out of the water, not up a wall
        const rise = ground - bunny.position.y;
        const last = s.lastSent;
        const sinceSent = Math.hypot(nx - last.x, nz - last.z);
        const riseSent = ground - last.y;
        const ok = world.data.inside(nx, nz) && nx > 0.3 && nz > 0.3 && nx < world.width - 0.3 && nz < world.width - 0.3
            && ground >= world.data.waterLevel + 0.08
            && !(rise > 0.05 && rise / step > 1.6)
            && !(riseSent > 0.3 && riseSent / Math.max(sinceSent, 0.01) > 1.6)
            && sinceSent < 1.5;
        bunny.goalYaw = yaw;
        if (!ok) {
            this.flushMove(bunny, now, true);
            return;
        }
        bunny.position.set(nx, ground, nz);
        bunny.goal.copy(bunny.position);
        bunny.moving = 0.15;
        if (!this.walking) {
            this.walking = true;
            bunny.play?.('walk');
        }
        s.stamina = Math.max(0, s.stamina - step);
        this.flushMove(bunny, now, false);
    }

    /** Sends the position of the own bunny at most every 100 ms (and once more when it stops). */
    flushMove(bunny, now, stopped) {
        const s = this.state;
        if (stopped && this.walking) {
            this.walking = false;
            bunny.play?.('aim');
        }
        const last = s.lastSent;
        if (!last) return;
        const moved = Math.hypot(bunny.position.x - last.x, bunny.position.z - last.z) > 0.01;
        if (!moved || (!stopped && now - last.at < MOVE_INTERVAL)) return;
        this.send('Move', r3(bunny.position.x), r3(bunny.position.z), r3(bunny.goalYaw));
        s.lastSent = { x: bunny.position.x, y: bunny.position.y, z: bunny.position.z, at: now };
    }

    // ---------------------------------------------------------------- input (called by the app while a match is open)

    keyDown(code, e) {
        if (!this.state.world) return false;
        if (code === 'Space') {
            if (!e?.repeat) this.startCharge();
            return true;
        }
        if (/^Digit[1-9]$/.test(code)) {
            const weapon = this.state.weapons[Number(code.slice(5)) - 1];
            if (weapon) this.selectWeapon(weapon.id);
            return true;
        }
        if (code === 'Tab') {
            if (this.isMine()) this.call('SkipTurn').catch(() => {});
            return true;
        }
        if (code === 'Enter') {
            $('bw-chat-input').focus();
            return true;
        }
        if (code === 'KeyH') {
            $('bw-help').hidden = !$('bw-help').hidden;
            return true;
        }
        if (code === 'Escape') {
            $('bw-help').hidden = true;
            $('bw-dropdown').hidden = true;
            return true;
        }
        return ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(code);
    }

    keyUp(code) {
        if (code === 'Space') {
            this.releaseCharge();
            return true;
        }
        return false;
    }

    click(x, y) {
        this.placeAirTarget(x, y);
    }

    /**
     * A drag on the island: the left button turns the camera (= the direction of the aim); the right button aims precisely:
     * sideways turns, up and down tilts the barrel (Shift: even finer). Returns false when the drag is not for aiming.
     */
    aimDrag(dx, dy, button, fine) {
        if (button !== 2 || !this.canAim()) return false;
        const s = this.state;
        const k = fine ? FINE : 1;
        this.stage.rig.yaw -= dx * 0.0028 * k;
        s.pitch = Math.min(PITCH_MAX, Math.max(PITCH_MIN, s.pitch - dy * 0.0035 * k));
        return true;
    }

    skip() {
        this.call('SkipTurn').catch(() => {});
    }

    surrender() {
        this.call('Surrender').catch(() => {});
    }

    chat(text) {
        this.call('Chat', text).catch(() => {});
    }

    // ---------------------------------------------------------------- the frame

    focusPoint() {
        const bunny = this.currentBunny();
        if (bunny) return bunny.position.clone().add(new THREE.Vector3(0, 0.9, 0));
        const w = this.state.world?.width ?? 20;
        return new THREE.Vector3(w / 2, 2, w / 2);
    }

    /** Where the aim camera looks and how far it stays back so that the bunny and the impact <end> are both in the picture. */
    aimView(bunny, end) {
        const from = this.focusPoint();
        const horizontal = Math.hypot(end.x - from.x, end.z - from.z);
        if (horizontal < 4) return null; // close shots: the normal camera shows them
        // far shots (into the sea) do not pull the camera away from the bunny: at most 6.5 m to the side and 22 m back
        const share = Math.min(0.38, 6.5 / horizontal);
        const focus = from.clone().lerp(new THREE.Vector3(end.x, Math.max(end.y, this.state.world.data.waterLevel), end.z), share);
        focus.y = Math.max(focus.y, from.y - 1.5);
        return { focus, distance: Math.min(22, 6.5 + Math.min(horizontal, 26) * 0.6) };
    }

    refreshHud(full = false) {
        const s = this.state;
        const world = s.world;
        const turn = s.turn;
        if (!world || !turn) return;
        const hud = this.hud;
        const team = this.teamOf(turn.team);
        const bunny = this.currentBunny();
        const mine = this.isMine();
        const phaseText = { Aiming: 'zielt', Resolving: 'Schuss!', Retreat: 'Rückzug!', Over: '' }[turn.phase] ?? '';
        if (turn.phase === 'Over' || s.result) {
            hud.turn({ title: 'Spiel vorbei', sub: s.result?.winnerName ? `${s.result.winnerName} gewinnt` : '', color: '#9a8a78', mine: false });
        } else {
            hud.turn({
                title: mine ? 'Du bist dran!' : team?.name ?? '–',
                sub: `${bunny?.name ?? ''} ${phaseText}${mine && turn.phase === 'Retreat' ? ' – lauf in Deckung' : ''}`,
                color: team?.color,
                mine,
            });
        }
        const counting = turn.phase === 'Aiming' || turn.phase === 'Retreat';
        hud.timer(counting && !s.result ? turn.endsInMs - (performance.now() - s.turnAt) : null);
        hud.wind(turn.windX, turn.windZ, turn.maxWind, this.stage.rig.yaw);
        hud.stamina(s.stamina, turn.maxStamina, mine);
        hud.power(s.power, s.charging);
        const weapon = this.selectedWeapon();
        const aimText = weapon?.kind === 'Airstrike' ? (s.airTarget ? 'Ziel gesetzt' : 'Ziel anklicken') : weapon?.kind === 'Hitscan' ? `Winkel ${Math.round(s.pitch * 180 / Math.PI)}°` : `Winkel ${Math.round(s.pitch * 180 / Math.PI)}° · Kraft ${Math.round(this.guidePower() * 100)} %`;
        hud.aimInfo(`${weapon?.name ?? '–'} · ${aimText}`);
        hud.controls(this.canAim(), mine, weapon?.kind === 'Airstrike' || weapon?.kind === 'Hitscan' ? 'Feuer' : 'Feuer (halten)');
        if (full) {
            hud.teams(s.teams, world.bunnies.values(), turn.team);
            hud.weapons(s.weapons, s.myTeam, s.weaponId, !!s.myTeam && !s.result, id => this.selectWeapon(id));
        }
    }

    frame(dt, now, input) {
        const s = this.state;
        const world = s.world;
        const stage = this.stage;
        if (!world) {
            // the lobby: the island of the menu stays behind it (the app keeps it turning)
            return false;
        }
        const mine = this.isMine();
        const fine = input.isDown('ShiftLeft', 'ShiftRight') ? FINE : 1;
        // keys turn and tilt slowly at first (small corrections), faster when held; Shift = fine
        const turning = input.isDown('KeyQ', 'ArrowLeft') || input.isDown('KeyE', 'ArrowRight');
        s.yawHold = turning ? s.yawHold + dt : 0;
        const yawSpeed = (0.5 + Math.min(1, s.yawHold / 0.6) * 1.1) * fine;
        if (input.isDown('KeyQ', 'ArrowLeft')) stage.rig.yaw += dt * yawSpeed;
        if (input.isDown('KeyE', 'ArrowRight')) stage.rig.yaw -= dt * yawSpeed;

        if (mine) this.walk(dt, input);
        if (this.canAim()) {
            const tilting = input.isDown('ArrowUp', 'KeyR', 'ArrowDown', 'KeyF');
            s.pitchHold = tilting ? s.pitchHold + dt : 0;
            const pitchSpeed = (0.35 + Math.min(1, s.pitchHold / 0.6) * 0.75) * fine;
            if (input.isDown('ArrowUp', 'KeyR')) s.pitch = Math.min(PITCH_MAX, s.pitch + dt * pitchSpeed);
            if (input.isDown('ArrowDown', 'KeyF')) s.pitch = Math.max(PITCH_MIN, s.pitch - dt * pitchSpeed);
            if (s.charging) {
                s.power = Math.min(1, (now - s.chargeStart) / 1000 / CHARGE_SECONDS);
                if (s.power >= 1) this.releaseCharge();
            }
            const bunny = this.currentBunny();
            const moving = input.isDown('KeyW', 'KeyA', 'KeyS', 'KeyD');
            if (!moving) bunny.goalYaw = stage.rig.yaw;
            bunny.setAimPitch?.(s.pitch);
            const weapon = this.selectedWeapon();
            const prediction = this.predict(bunny, weapon, stage.rig.yaw, s.pitch, this.guidePower());
            bunny.setAim(weapon?.kind === 'Airstrike' ? null : prediction?.paths[0]?.points ?? null);
            this.guide?.show(prediction, this.state.myTeam?.color, { data: world.data, dots: weapon?.kind !== 'Airstrike' });
            // the aim camera: it moves between the bunny and the impact and backs off until both are in view (also while walking: no swing when the bunny stops)
            // (frozen while charging, so the picture holds still; the zoom of the player wins)
            if (!s.charging) {
                const end = weapon?.kind === 'Airstrike' ? null : prediction?.impacts[0]?.point ?? prediction?.paths[0]?.end;
                s.aimView = end ? this.aimView(bunny, end) : null;
            }
            const a = s.lastAim;
            if (now - a.at > AIM_INTERVAL && (Math.abs(a.yaw - stage.rig.yaw) > 0.01 || Math.abs(a.pitch - s.pitch) > 0.01 || a.weaponId !== s.weaponId)) {
                s.lastAim = { yaw: stage.rig.yaw, pitch: s.pitch, weaponId: s.weaponId ?? 0, at: now };
                this.send('AimAt', r3(stage.rig.yaw), r3(s.pitch), s.weaponId ?? 0);
            }
        } else {
            s.aimView = null;
            if (mine) {
                this.currentBunny()?.setAim(null);
                this.guide?.hide();
            }
        }
        stage.rig.autoDistance = s.aimView?.distance ?? 0;
        stage.rig.autoPitch = s.aimView ? 0.62 : 0;
        this.guide?.update(dt);
        // the camera keeps up tightly while the own bunny walks, elsewhere it glides
        stage.rig.followRate = this.walking ? 10 : 6;

        if (s.playback) {
            // late messages waiting: catch up faster
            s.playback.update(s.pendingTurns.length > 0 ? dt * 2.5 : dt);
            stage.rig.focus(s.playback.focus ?? this.focusPoint());
            if (s.playback.done) this.playbackFinished();
        } else {
            stage.rig.focus(s.aimView?.focus ?? this.focusPoint());
        }

        world.update(dt, now / 1000);
        stage.rig.update(dt, (x, z) => world.heightAt(x, z));
        this.floaters.update(dt);

        s.hudClock += dt;
        s.fullClock += dt;
        if (s.hudClock > 0.1) {
            s.hudClock = 0;
            const full = s.fullClock > 0.3;
            if (full) s.fullClock = 0;
            this.refreshHud(full);
        }
        return true;
    }
}
