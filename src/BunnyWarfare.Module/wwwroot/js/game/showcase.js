// The living island behind the menu: a world from /api/showcase with a few bunnies that idle, wave, nibble carrots and hop around,
// a camera that slowly circles (with an occasional close-up) and now and then a demo carrot that arcs over the island and goes boom.
// Purely decorative: nothing here is played or sent to the server.
import * as THREE from 'three';
import { World } from './world.js';
import { projectileModel } from './effects.js';
import { api } from './api.js';

const G = 9.81;
const MOODS = ['wave', 'eat', 'cheer', 'dance', 'eat', 'wave'];

const rand = (a, b) => a + Math.random() * (b - a);
const pick = list => list[Math.floor(Math.random() * list.length)];

export class Showcase {
    constructor(stage) {
        this.stage = stage;
        this.world = null;
        this.worldId = null;
        this.loading = null;
        this.time = 0;
        this.nextMood = 3;
        this.nextShot = 6;
        this.nextCut = 16;
        this.closeUp = null;
        this.shots = [];
        this.walkers = new Map();
        this.paused = false;
    }

    get active() {
        return !!this.world;
    }

    /** Builds the island (a random one, or the given world). With an island already there, null (or the same world) keeps it. */
    async show(worldId = null, { force = false } = {}) {
        if (this.world && !force && (worldId === null || worldId === this.worldId)) return;
        const query = worldId === null ? '' : `?worldId=${encodeURIComponent(worldId)}`;
        const ticket = {};
        this.loading = ticket;
        let dto;
        try {
            dto = await api.get(`/showcase${query}`);
        } catch {
            return;
        }
        if (this.loading !== ticket) return; // a newer request won
        this.build(dto, worldId);
    }

    build(dto, worldId) {
        this.dispose();
        this.world = new World(this.stage, { world: dto.world, teams: dto.teams, bunnies: dto.bunnies });
        this.worldId = worldId ?? -1;
        this.worldName = dto.world.name;
        const rig = this.stage.rig;
        const w = this.world.width;
        this.center = new THREE.Vector3(w / 2, Math.max(1.5, dto.world.waterLevel + 2), w / 2);
        rig.focus(this.center, true);
        rig.distance = Math.min(70, Math.max(22, w * 0.82));
        rig.pitch = 0.46;
        rig.yaw = Math.random() * Math.PI * 2;
        this.closeUp = null;
        this.nextCut = rand(12, 18);
        this.nextShot = rand(4, 7);
        this.nextMood = 1.5;
        for (const b of this.world.bunnies.values()) b.play?.('idle');
    }

    /** Forgets the island (a match builds its own); the next show() makes a new one. */
    dispose() {
        for (const s of this.shots) s.mesh.removeFromParent();
        this.shots = [];
        this.walkers.clear();
        this.world?.dispose();
        this.world = null;
        this.worldId = null;
        this.worldName = null;
    }

    release() {
        // the match takes over the stage: drop the island without touching the stage (the match's World rebuilds it)
        this.loading = null;
        this.dispose();
    }

    landSpot(near, radius) {
        const world = this.world;
        for (let i = 0; i < 20; i++) {
            const a = Math.random() * Math.PI * 2;
            const r = rand(radius * 0.4, radius);
            const x = near.x + Math.sin(a) * r;
            const z = near.z + Math.cos(a) * r;
            if (!world.data.inside(x, z)) continue;
            const y = world.heightAt(x, z);
            if (y > world.data.waterLevel + 0.4) return new THREE.Vector3(x, y, z);
        }
        return null;
    }

    mood() {
        const bunnies = [...this.world.bunnies.values()].filter(b => b.alive !== false);
        if (bunnies.length === 0) return;
        const b = pick(bunnies);
        if (Math.random() < 0.45 && !this.walkers.has(b)) {
            const to = this.landSpot(b.position, 3.5);
            if (to) {
                this.walkers.set(b, to);
                b.play?.('walk');
                return;
            }
        }
        b.play?.(pick(MOODS));
    }

    walk(dt) {
        for (const [b, to] of this.walkers) {
            const dx = to.x - b.position.x;
            const dz = to.z - b.position.z;
            const d = Math.hypot(dx, dz);
            if (d < 0.08) {
                this.walkers.delete(b);
                b.play?.('idle');
                continue;
            }
            const step = Math.min(d, 1.4 * dt);
            const nx = b.position.x + (dx / d) * step;
            const nz = b.position.z + (dz / d) * step;
            const ny = this.world.heightAt(nx, nz);
            if (ny < this.world.data.waterLevel + 0.2) {
                this.walkers.delete(b);
                continue;
            }
            b.walkTo(nx, ny, nz, Math.atan2(dx, dz));
        }
    }

    /** A demo carrot from one bunny to somewhere near another: a ballistic arc, a trail, a boom. */
    shoot() {
        const bunnies = [...this.world.bunnies.values()];
        if (bunnies.length < 2) return;
        const shooter = pick(bunnies);
        const others = bunnies.filter(b => b !== shooter && b.team !== shooter.team);
        const target = others.length ? pick(others) : pick(bunnies.filter(b => b !== shooter));
        const aim = this.landSpot(target.position, 3.2) ?? target.position.clone();
        const yaw = Math.atan2(aim.x - shooter.position.x, aim.z - shooter.position.z);
        this.walkers.delete(shooter);
        shooter.setWeapon?.('Projectile');
        shooter.lookAt?.(aim.x, aim.z);
        shooter.goalYaw = yaw;
        shooter.play?.('aim');
        const from = shooter.position.clone().add(new THREE.Vector3(Math.sin(yaw) * 0.6, 0.95, Math.cos(yaw) * 0.6));
        const flight = rand(1.5, 2.2);
        const velocity = new THREE.Vector3(
            (aim.x - from.x) / flight,
            (aim.y - from.y + 0.5 * G * flight * flight) / flight,
            (aim.z - from.z) / flight);
        const mesh = projectileModel('carrot');
        mesh.visible = false;
        this.world.group.add(mesh);
        this.shots.push({ mesh, from, velocity, flight, t: -0.7, shooter, target, aim, trail: 0 });
    }

    flyShots(dt) {
        const world = this.world;
        for (const s of [...this.shots]) {
            s.t += dt;
            if (s.t < 0) continue;
            if (!s.launched) {
                s.launched = true;
                s.shooter.play?.('fire');
                s.mesh.visible = true;
            }
            const t = Math.min(s.t, s.flight);
            const p = new THREE.Vector3(s.from.x + s.velocity.x * t, s.from.y + s.velocity.y * t - 0.5 * G * t * t, s.from.z + s.velocity.z * t);
            const v = new THREE.Vector3(s.velocity.x, s.velocity.y - G * t, s.velocity.z);
            s.mesh.position.copy(p);
            s.mesh.lookAt(p.clone().add(v));
            s.trail += dt;
            if (s.trail > 0.03) {
                s.trail = 0;
                world.effects?.trail?.(p);
            }
            if (s.t >= s.flight) {
                s.mesh.removeFromParent();
                this.shots.splice(this.shots.indexOf(s), 1);
                world.effects?.explosion?.(s.aim, 2.2);
                this.stage.rig.shake?.(this.closeUp ? 0.25 : 0.12);
                for (const b of world.bunnies.values()) {
                    const d = b.position.distanceTo(s.aim);
                    if (d < 3.2) {
                        this.walkers.delete(b);
                        b.play?.('hurt');
                    } else if (b.team === s.shooter.team) {
                        b.play?.('cheer');
                    }
                }
                s.shooter.play?.('cheer');
            }
        }
    }

    cut() {
        const rig = this.stage.rig;
        if (this.closeUp) {
            this.closeUp = null;
            rig.distance = Math.min(70, Math.max(22, this.world.width * 0.82));
            rig.pitch = 0.46;
            this.nextCut = rand(14, 20);
        } else {
            const b = pick([...this.world.bunnies.values()]);
            this.closeUp = b;
            rig.distance = rand(7, 10);
            rig.pitch = rand(0.22, 0.34);
            b.play?.(pick(['wave', 'eat', 'dance']));
            this.nextCut = rand(6, 9);
        }
    }

    update(dt, time) {
        const world = this.world;
        const rig = this.stage.rig;
        if (!world) {
            rig.yaw += dt * 0.05;
            rig.update(dt);
            return;
        }
        this.time += dt;
        this.nextMood -= dt;
        this.nextShot -= dt;
        this.nextCut -= dt;
        if (this.nextMood <= 0) {
            this.nextMood = rand(1.2, 3);
            this.mood();
        }
        if (this.nextShot <= 0) {
            this.nextShot = rand(7, 12);
            this.shoot();
        }
        if (this.nextCut <= 0) this.cut();
        this.walk(dt);
        this.flyShots(dt);

        if (typeof rig.orbit === 'function') rig.orbit(this.closeUp ? 0.12 : 0.045, dt);
        else rig.yaw += dt * (this.closeUp ? 0.12 : 0.045);
        const focus = this.closeUp ? this.closeUp.position.clone().add(new THREE.Vector3(0, 0.8, 0)) : this.center;
        rig.focus(focus);
        world.update(dt, time);
        rig.update(dt, (x, z) => world.heightAt(x, z));
    }
}
