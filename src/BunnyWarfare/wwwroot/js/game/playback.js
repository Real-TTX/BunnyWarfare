// Plays a shot the server has already computed (ShotResult): flights, rays, explosions with craters, damage, knockback, deaths.
import * as THREE from 'three';
import { projectileModel } from './effects.js';

export const SAMPLE = 1 / 30;

function at(points, i, target) {
    return target.set(points[i * 3], points[i * 3 + 1], points[i * 3 + 2]);
}

/** The position along a track of samples, <time> seconds after its start (clamped to its ends). */
function along(points, time, target) {
    const count = points.length / 3;
    const f = Math.max(0, time / SAMPLE);
    const i = Math.min(count - 1, Math.floor(f));
    if (i >= count - 1) return at(points, count - 1, target);
    const a = at(points, i, new THREE.Vector3());
    const b = at(points, i + 1, new THREE.Vector3());
    return target.copy(a).lerp(b, f - i);
}

const UP = new THREE.Vector3(0, 1, 0);

export class ShotPlayback {
    /** hooks: explosion(event), damage(event, bunny), death(event, bunny), splash(point), launch(), ray(from, to) */
    constructor(world, result, hooks) {
        this.world = world;
        this.hooks = hooks;
        this.t = 0;
        this.duration = Math.max(0.5, result.duration ?? 0);
        this.done = false;
        this.focus = null;
        this.lastBlast = null;
        this.flights = (result.projectiles ?? []).map(p => ({
            look: p.look, start: p.start, points: p.points, end: p.end, mesh: null, finished: false,
            length: Math.max(0, (p.points.length / 3 - 1) * SAMPLE),
        }));
        this.tracks = (result.bunnyTracks ?? []).map(t => ({ ...t, length: Math.max(0, (t.points.length / 3 - 1) * SAMPLE), finished: false }));
        // single moments, in the order of time
        this.events = [
            ...(result.rays ?? []).map(e => ({ t: e.t, kind: 'ray', e })),
            ...(result.explosions ?? []).map(e => ({ t: e.t, kind: 'explosion', e })),
            ...(result.damages ?? []).map(e => ({ t: e.t, kind: 'damage', e })),
            ...(result.deaths ?? []).map(e => ({ t: e.t, kind: 'death', e })),
        ].sort((a, b) => a.t - b.t || order(a.kind) - order(b.kind));
        this.cursor = 0;
        this.trailClock = 0;
        hooks.launch?.(result);
    }

    update(dt) {
        if (this.done) return;
        this.t += dt;
        const t = this.t;
        let focus = null;

        while (this.cursor < this.events.length && this.events[this.cursor].t <= t) {
            this.fire(this.events[this.cursor++]);
        }

        this.trailClock += dt;
        const trail = this.trailClock > 0.03;
        if (trail) this.trailClock = 0;
        for (const f of this.flights) {
            if (f.finished || t < f.start) continue;
            const local = t - f.start;
            if (!f.mesh) {
                f.mesh = projectileModel(f.look);
                this.world.group.add(f.mesh);
            }
            const pos = along(f.points, local, f.mesh.position);
            const ahead = along(f.points, local + SAMPLE, new THREE.Vector3());
            const dir = ahead.sub(pos);
            if (dir.lengthSq() > 1e-8) f.mesh.quaternion.setFromUnitVectors(UP, dir.normalize());
            if (f.look === 'beet') f.mesh.rotateX(local * 8);
            if (trail && f.look !== 'beet') this.world.effects.trail(pos);
            focus = pos;
            if (local >= f.length) {
                f.finished = true;
                if (f.end === 'splash') this.hooks.splash?.(pos.clone());
                this.world.group.remove(f.mesh);
            }
        }

        for (const track of this.tracks) {
            if (track.finished || t < track.start) continue;
            const bunny = this.world.bunnies.get(track.bunnyId);
            const p = along(track.points, t - track.start, new THREE.Vector3());
            bunny?.snap(p.x, p.y, p.z);
            if (!focus) focus = p;
            if (t - track.start >= track.length) track.finished = true;
        }

        if (!focus && this.lastBlast && t - this.lastBlast.t < 1.2) focus = this.lastBlast.at;
        this.focus = focus;
        if (t >= this.duration + 0.2) this.finish();
    }

    fire({ kind, e }) {
        const world = this.world;
        switch (kind) {
            case 'ray':
                this.hooks.ray?.(new THREE.Vector3(...e.from), new THREE.Vector3(...e.to));
                break;
            case 'explosion': {
                const point = new THREE.Vector3(e.x, e.y, e.z);
                world.crater(e.x, e.y, e.z, e.crater);
                this.lastBlast = { t: this.t, at: point };
                this.hooks.explosion?.(e, point);
                break;
            }
            case 'damage': {
                const bunny = world.bunnies.get(e.bunnyId);
                if (bunny) {
                    bunny.setHealth(e.health);
                    this.hooks.damage?.(e, bunny);
                }
                break;
            }
            case 'death': {
                const bunny = world.bunnies.get(e.bunnyId);
                if (bunny && bunny.alive) {
                    if (e.cause === 'water') bunny.sink();
                    else bunny.die();
                    this.hooks.death?.(e, bunny);
                }
                break;
            }
        }
    }

    /** Ends the playback at once (everything that is left happens now). */
    finish() {
        if (this.done) return;
        while (this.cursor < this.events.length) this.fire(this.events[this.cursor++]);
        for (const f of this.flights) if (f.mesh) this.world.group.remove(f.mesh);
        for (const track of this.tracks) {
            const n = track.points.length / 3;
            const bunny = this.world.bunnies.get(track.bunnyId);
            if (bunny && n > 0) bunny.snap(track.points[(n - 1) * 3], track.points[(n - 1) * 3 + 1], track.points[(n - 1) * 3 + 2]);
        }
        this.done = true;
    }
}

function order(kind) {
    return { ray: 0, explosion: 1, damage: 2, death: 3 }[kind] ?? 9;
}
