// Plays a shot the server has already computed (ShotResult): flights, rays, explosions with craters, damage, knockback, deaths.
// The timing follows the server exactly (every time in the result is seconds after the shot); only the looks are added here:
// the shooter's fire animation, spinning and wobbling projectiles, trails, bunnies that tumble along their knockback track, flinch and land.
import * as THREE from 'three';
import { projectileModel } from './effects.js';

export const SAMPLE = 1 / 30;

const KINDS = ['Projectile', 'Grenade', 'Cluster', 'Hitscan', 'Airstrike'];

function at(points, i, target) {
    return target.set(points[i * 3], points[i * 3 + 1], points[i * 3 + 2]);
}

const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();

/** The position along a track of samples, <time> seconds after its start (clamped to its ends). */
function along(points, time, target) {
    const count = points.length / 3;
    const f = Math.max(0, time / SAMPLE);
    const i = Math.min(count - 1, Math.floor(f));
    if (i >= count - 1) return at(points, count - 1, target);
    at(points, i, tmpA);
    at(points, i + 1, tmpB);
    return target.copy(tmpA).lerp(tmpB, f - i);
}

const UP = new THREE.Vector3(0, 1, 0);

export class ShotPlayback {
    /** hooks: explosion(event, point), damage(event, bunny), death(event, bunny), splash(point), launch(result), ray(from, to) */
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
        this.tracks = (result.bunnyTracks ?? []).map(t => ({ ...t, length: Math.max(0, (t.points.length / 3 - 1) * SAMPLE), finished: false, started: false }));
        // single moments, in the order of time
        this.events = [
            ...(result.rays ?? []).map(e => ({ t: e.t, kind: 'ray', e })),
            ...(result.explosions ?? []).map(e => ({ t: e.t, kind: 'explosion', e })),
            ...(result.damages ?? []).map(e => ({ t: e.t, kind: 'damage', e })),
            ...(result.deaths ?? []).map(e => ({ t: e.t, kind: 'death', e })),
        ].sort((a, b) => a.t - b.t || order(a.kind) - order(b.kind));
        this.cursor = 0;
        this.trailClock = 0;

        // dirt chunks bounce on the island
        world.effects?.setGround?.((x, z) => world.heightAt(x, z));

        // the shooter fires (or throws, or calls the airstrike on the radio)
        const shooter = world.bunnies?.get(result.shooterId);
        if (shooter?.alive) {
            const kind = typeof result.kind === 'number' ? KINDS[result.kind] : result.kind;
            if (kind) shooter.setWeapon?.(kind);
            shooter.play?.('fire');
            if (kind === 'Projectile' && this.flights[0]) {
                const first = this.flights[0].points;
                if (first.length >= 3) world.effects?.muzzle?.(new THREE.Vector3(first[0], first[1], first[2]));
            }
        }
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
        const trail = this.trailClock > 0.025;
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
            // carrots spin around their axis, round things tumble
            if (f.mesh.userData.spin) f.mesh.rotateY(local * f.mesh.userData.spin);
            if (f.mesh.userData.wobble) {
                f.mesh.rotateX(local * f.mesh.userData.wobble);
                f.mesh.rotateZ(local * f.mesh.userData.wobble * 0.6);
            }
            if (trail) this.world.effects.trail(pos, f.look);
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
            const local = t - track.start;
            const p = along(track.points, local, new THREE.Vector3());
            const ahead = along(track.points, local + SAMPLE, new THREE.Vector3());
            bunny?.snap(p.x, p.y, p.z);
            // a knockback (a fast track) tumbles; a slow fall just falls
            const v = ahead.sub(p).divideScalar(SAMPLE);
            if (bunny?.alive && v.lengthSq() > 4) bunny.setFlight?.(v.x, v.y, v.z);
            track.started = true;
            if (!focus) focus = p;
            if (local >= track.length) {
                track.finished = true;
                if (bunny?.alive) bunny.land?.();
            }
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
                    if (bunny.alive && e.health > 0) bunny.hurt?.(e.amount);
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
            if (bunny && n > 0) {
                bunny.snap(track.points[(n - 1) * 3], track.points[(n - 1) * 3 + 1], track.points[(n - 1) * 3 + 2]);
                if (bunny.alive) bunny.land?.();
            }
        }
        this.done = true;
    }
}

function order(kind) {
    return { ray: 0, explosion: 1, damage: 2, death: 3 }[kind] ?? 9;
}
