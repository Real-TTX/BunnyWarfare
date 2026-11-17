// The aim help: where a shot will go. predictShot() flies a shot like the server (Simulation.Fly: gravity, wind, bounces, fuse,
// bunnies in the way, water) on the height map of the browser; AimGuide draws the path as marching dots (faint where a hill hides them)
// and a small crosshair where it lands (constant size on the screen; red when it hits a bunny, blue in the water).
import * as THREE from 'three';

const DT = 1 / 120;              // Simulation.Dt
const SAMPLE_EVERY = 4;          // a point every 1/30 s
const MAX_SPEED = 24;            // Simulation.MaxSpeed
const MAX_FLIGHT = 14;           // Simulation.MaxFlightSeconds
const BUNNY_RADIUS = 0.45;       // Simulation.BunnyRadius
const BUNNY_CENTER = 0.5;        // Simulation.BunnyCenterHeight
const ABYSS = -12;               // Terrain.Abyss
const CELL = 0.5;                // Terrain.CellSize

/** The muzzle like Simulation.Muzzle: feet + 0.85 up + 0.6 along the aim. */
export function muzzle(position, yaw, pitch) {
    const dir = new THREE.Vector3(Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), Math.cos(pitch) * Math.cos(yaw));
    return { origin: new THREE.Vector3(position.x, position.y + 0.85, position.z).addScaledVector(dir, 0.6), dir };
}

function normalAt(data, x, z) {
    const dx = data.heightAt(x + CELL, z) - data.heightAt(x - CELL, z);
    const dz = data.heightAt(x, z + CELL) - data.heightAt(x, z - CELL);
    return new THREE.Vector3(-dx, 2 * CELL, -dz).normalize();
}

/**
 * Flies one projectile. options: { wind: Vector2|null, gravity, bounces, fuse, shooter, bunnies }.
 * Returns { points (Vector3 every 1/30 s), end (Vector3), how: 'impact' | 'fuse' | 'splash' | 'vanish', bunny (the one it hits or null) }.
 */
export function fly(data, start, velocity, options) {
    const points = [start.clone()];
    const pos = start.clone();
    const vel = velocity.clone();
    const ax = options.wind ? options.wind.x : 0;
    const az = options.wind ? options.wind.y : 0;
    const ay = -options.gravity;
    const fuse = options.fuse ?? Infinity;
    const next = new THREE.Vector3();
    const center = new THREE.Vector3();
    let resting = false;
    let steps = 0;
    const done = (end, how, bunny = null) => {
        points.push(end.clone());
        return { points, end: end.clone(), how, bunny };
    };
    for (let t = 0; t < MAX_FLIGHT; t += DT) {
        steps++;
        if (t >= fuse) return done(pos, 'fuse');
        if (!resting) {
            vel.x += ax * DT;
            vel.y += ay * DT;
            vel.z += az * DT;
            next.copy(pos).addScaledVector(vel, DT);

            let bounced = false;
            for (const b of options.bunnies) {
                if (!b.alive || (b === options.shooter && t < 0.3)) continue;
                center.set(b.position.x, b.position.y + BUNNY_CENTER, b.position.z);
                if (next.distanceTo(center) >= BUNNY_RADIUS + 0.12) continue;
                if (options.bounces) {
                    const away = next.clone().sub(center).normalize();
                    vel.addScaledVector(away, -2 * vel.dot(away)).multiplyScalar(0.35);
                    next.copy(pos);
                    bounced = true;
                    break;
                }
                return done(next, 'impact', b);
            }

            const ground = data.heightAt(next.x, next.z);
            if (!bounced && next.y <= ground && data.inside(next.x, next.z)) {
                if (!options.bounces) return done(new THREE.Vector3(next.x, ground, next.z), 'impact');
                const normal = normalAt(data, next.x, next.z);
                const into = vel.dot(normal);
                if (into < 0) vel.addScaledVector(normal, -2 * into).multiplyScalar(0.45);
                next.y = ground + 0.12;
                if (vel.length() < 0.8) {
                    vel.set(0, 0, 0);
                    resting = true;
                }
            }
            pos.copy(next);
            if (pos.y < data.waterLevel && data.heightAt(pos.x, pos.z) < data.waterLevel) return done(pos, 'splash');
            const margin = 25;
            if (pos.x < -margin || pos.z < -margin || pos.x > data.width + margin || pos.z > data.width + margin || pos.y < ABYSS) return done(pos, 'vanish');
        }
        if (steps % SAMPLE_EVERY === 0) points.push(pos.clone());
    }
    return done(pos, 'vanish');
}

/** A straight shot (Simulation.Ray): the point where it hits the ground or a bunny within the range. */
export function ray(data, from, dir, range, bunnies, shooter) {
    const p = new THREE.Vector3();
    const center = new THREE.Vector3();
    for (let d = 0; d < range; d += 0.08) {
        p.copy(from).addScaledVector(dir, d);
        if (p.y <= data.heightAt(p.x, p.z)) return { points: [from.clone(), p.clone()], end: p.clone(), how: 'impact', bunny: null };
        for (const b of bunnies) {
            if (!b.alive || b === shooter) continue;
            center.set(b.position.x, b.position.y + BUNNY_CENTER, b.position.z);
            if (p.distanceTo(center) < BUNNY_RADIUS) return { points: [from.clone(), p.clone()], end: p.clone(), how: 'impact', bunny: b };
        }
    }
    return { points: [from.clone(), p.clone()], end: p.clone(), how: 'vanish', bunny: null };
}

/**
 * Where the shot of <shooter> goes with the weapon (WeaponDto: kind, wind, fuse, count), yaw/pitch in radians, power 0..1.
 * ctx: { data (TerrainData), bunnies (iterable of Bunny), wind (Vector2, m/s²), gravity, target (Vector3, airstrike only) }.
 * Returns { paths: [{ points, end, how, bunny }], impacts: [{ point, radius, hit }] } or null.
 */
export function predictShot(ctx, shooter, weapon, yaw, pitch, power) {
    if (!weapon || !shooter) return null;
    const bunnies = [...ctx.bunnies];
    const radius = weapon.radius ?? 2;
    const result = { paths: [], impacts: [] };
    const land = (path, r) => {
        result.paths.push(path);
        if (path.how === 'impact' || path.how === 'fuse') result.impacts.push({ point: path.end, radius: r, hit: path.bunny && path.bunny.team !== shooter.team ? path.bunny : null });
        else if (path.how === 'splash') result.impacts.push({ point: new THREE.Vector3(path.end.x, ctx.data.waterLevel, path.end.z), radius: 0.9, hit: null, water: true });
    };
    if (weapon.kind === 'Airstrike') {
        if (!ctx.target) return null;
        const count = Math.max(1, weapon.count || 1);
        const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
        let top = -Infinity;
        for (const h of ctx.data.heights) if (h > top) top = h;
        top += 16;
        for (let i = 0; i < count; i++) {
            const offset = (i - (count - 1) / 2) * 1.7;
            const start = new THREE.Vector3(ctx.target.x + forward.x * (offset - 3), top, ctx.target.z + forward.z * (offset - 3));
            const drop = fly(ctx.data, start, forward.clone().multiplyScalar(2).add(new THREE.Vector3(0, -4, 0)), { gravity: ctx.gravity, bunnies });
            land(drop, radius);
        }
        return result;
    }
    const { origin, dir } = muzzle(shooter.position, yaw, pitch);
    if (weapon.kind === 'Hitscan') {
        land(ray(ctx.data, origin, dir, 40, bunnies, shooter), radius);
        return result;
    }
    power = Math.min(1, Math.max(0.05, power));
    const factor = weapon.kind === 'Grenade' ? 0.8 : weapon.kind === 'Cluster' ? 0.9 : 1;
    const options = {
        gravity: ctx.gravity,
        wind: weapon.wind && weapon.kind !== 'Grenade' ? ctx.wind : null,
        bounces: weapon.kind === 'Grenade',
        fuse: weapon.kind === 'Grenade' ? weapon.fuse : Infinity,
        shooter,
        bunnies,
    };
    land(fly(ctx.data, origin, dir.multiplyScalar(power * MAX_SPEED * factor), options), radius);
    return result;
}

// ---------------------------------------------------------------- the guide

const MAX_DOTS = 160;
const DOT_STEP = 0.32;

function markerTexture() {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const c = canvas.getContext('2d');
    const m = size / 2;
    c.lineCap = 'round';
    // a thick outlined ring with four ticks: reads on grass, sand, snow and moon dust
    const ring = (r, width, color) => {
        c.beginPath();
        c.arc(m, m, r, 0, Math.PI * 2);
        c.lineWidth = width;
        c.strokeStyle = color;
        c.stroke();
    };
    ring(m * 0.8, 26, 'rgba(40,24,10,0.85)');
    ring(m * 0.8, 13, '#ffffff');
    for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 2;
        const x1 = m + Math.cos(a) * m * 0.42, y1 = m + Math.sin(a) * m * 0.42;
        const x2 = m + Math.cos(a) * m * 0.66, y2 = m + Math.sin(a) * m * 0.66;
        for (const [w, col] of [[22, 'rgba(40,24,10,0.85)'], [10, '#ffffff']]) {
            c.beginPath();
            c.moveTo(x1, y1);
            c.lineTo(x2, y2);
            c.lineWidth = w;
            c.strokeStyle = col;
            c.stroke();
        }
    }
    c.beginPath();
    c.arc(m, m, 12, 0, Math.PI * 2);
    c.fillStyle = 'rgba(40,24,10,0.85)';
    c.fill();
    c.beginPath();
    c.arc(m, m, 6, 0, Math.PI * 2);
    c.fillStyle = '#ffffff';
    c.fill();
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
}

/** Draws predicted shots: dots along the paths and a marker at every impact. */
export class AimGuide {
    constructor(parent) {
        this.group = new THREE.Group();
        this.group.name = 'aim-guide';
        parent.add(this.group);
        const dot = new THREE.SphereGeometry(0.075, 10, 8);
        // three passes over the same dots: faint through the ground, a dark outline, the bright fill
        this.hidden = new THREE.InstancedMesh(dot, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28, depthTest: false, depthWrite: false }), MAX_DOTS);
        this.outline = new THREE.InstancedMesh(dot, new THREE.MeshBasicMaterial({ color: 0x28180a, side: THREE.BackSide }), MAX_DOTS);
        this.fill = new THREE.InstancedMesh(dot, new THREE.MeshBasicMaterial({ color: 0xffffff }), MAX_DOTS);
        this.hidden.renderOrder = 7;
        // the shadow of the path on the ground: shows where the shot travels over the island, even when the arc goes away from the camera
        const disc = new THREE.CircleGeometry(0.11, 12);
        disc.rotateX(-Math.PI / 2);
        this.shadow = new THREE.InstancedMesh(disc, new THREE.MeshBasicMaterial({ color: 0x28180a, transparent: true, opacity: 0.45, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), MAX_DOTS);
        this.shadow.renderOrder = 4;
        for (const mesh of [this.hidden, this.outline, this.fill, this.shadow]) {
            mesh.frustumCulled = false;
            mesh.count = 0;
            this.group.add(mesh);
        }
        this.texture = markerTexture();
        this.markers = [];
        this.markerGeometry = new THREE.PlaneGeometry(1, 1);
        this.paths = [];
        this.time = 0;
        this.color = new THREE.Color(0xffffff);
        this.group.visible = false;
    }

    /** A marker: a small crosshair that keeps about the same size on the screen (update() sizes it by the camera distance). */
    marker(i) {
        while (this.markers.length <= i) {
            const marker = new THREE.Group();
            const cross = new THREE.Mesh(this.markerGeometry, new THREE.MeshBasicMaterial({ map: this.texture, color: 0xffffff, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }));
            cross.renderOrder = 6;
            // the crosshair shows through small bumps, a little
            const ghost = new THREE.Mesh(this.markerGeometry, new THREE.MeshBasicMaterial({ map: this.texture, color: 0xffffff, transparent: true, opacity: 0.3, depthTest: false, depthWrite: false }));
            ghost.renderOrder = 7;
            cross.add(ghost);
            marker.add(cross);
            marker.userData = { cross };
            this.group.add(marker);
            this.markers.push(marker);
        }
        return this.markers[i];
    }

    /**
     * Shows a prediction (predictShot) in a colour; options: { impacts = true (markers), marching = true, data (TerrainData, to lay the markers on the ground) }.
     * null hides everything.
     */
    show(prediction, color, options = {}) {
        if (!prediction || prediction.paths.length === 0) {
            this.hide();
            return;
        }
        this.group.visible = true;
        this.paths = prediction.paths.map(p => p.points);
        this.fill.material.color.set(color ?? 0xffffff).lerp(new THREE.Color(0xffffff), 0.35);
        this.dotsVisible = options.dots !== false;
        this.data = options.data ?? null;
        const showImpacts = options.impacts !== false;
        let used = 0;
        if (showImpacts) {
            for (const impact of prediction.impacts) {
                const m = this.marker(used++);
                m.visible = true;
                const { cross } = m.userData;
                const n = options.data && !impact.water ? normalAt(options.data, impact.point.x, impact.point.z) : new THREE.Vector3(0, 1, 0);
                m.position.copy(impact.point).addScaledVector(n, 0.06);
                m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
                cross.rotation.z = this.time * (impact.hit ? 2.5 : 0.8);

                const tint = impact.hit ? 0xff3b1f : impact.water ? 0x8fdcff : color ?? 0xffffff;
                cross.material.color.set(tint);
                cross.children[0].material.color.set(tint);
                m.userData.hit = !!impact.hit;
            }
        }
        for (let i = used; i < this.markers.length; i++) this.markers[i].visible = false;
        this.layDots();
    }

    hide() {
        this.group.visible = false;
        this.paths = [];
    }

    layDots() {
        const m = new THREE.Matrix4();
        const p = new THREE.Vector3();
        const phase = (this.time * 1.4) % 1; // the dots march along the path
        let count = 0;
        let shadows = 0;
        const data = this.data;
        if (this.dotsVisible) {
            for (const points of this.paths) {
                let total = 0;
                for (let i = 1; i < points.length; i++) total += points[i].distanceTo(points[i - 1]);
                let walked = 0;
                let d = phase * DOT_STEP;
                for (let i = 1; i < points.length && count < MAX_DOTS; i++) {
                    const from = points[i - 1], to = points[i];
                    const len = from.distanceTo(to);
                    while (d <= len && count < MAX_DOTS) {
                        p.copy(from).lerp(to, len > 0 ? d / len : 0);
                        // small at the muzzle, full size in the middle, a little smaller at the end
                        const k = (walked + d) / Math.max(total, 0.01);
                        const s = Math.min(1, 0.45 + k * 3) * (1 - 0.3 * k);
                        m.makeScale(s, s, s).setPosition(p);
                        this.fill.setMatrixAt(count, m);
                        this.hidden.setMatrixAt(count, m);
                        m.makeScale(s * 1.45, s * 1.45, s * 1.45).setPosition(p);
                        this.outline.setMatrixAt(count, m);
                        if (data && count % 2 === 0) {
                            const ground = Math.max(data.heightAt(p.x, p.z), data.waterLevel);
                            if (p.y - ground > 0.25) {
                                m.makeScale(s, 1, s).setPosition(p.x, ground + 0.04, p.z);
                                this.shadow.setMatrixAt(shadows++, m);
                            }
                        }
                        count++;
                        d += DOT_STEP;
                    }
                    d -= len;
                    walked += len;
                }
            }
        }
        for (const mesh of [this.hidden, this.outline, this.fill]) {
            mesh.count = count;
            mesh.instanceMatrix.needsUpdate = true;
        }
        this.shadow.count = shadows;
        this.shadow.instanceMatrix.needsUpdate = true;
    }

    /** Per frame: the dots march; the crosshairs keep about 45 px on the screen whatever the zoom (camera optional). */
    update(dt, camera) {
        if (!this.group.visible) return;
        this.time += dt;
        this.layDots();
        const pulse = 1 + Math.sin(this.time * 6) * 0.06;
        for (const m of this.markers) {
            if (!m.visible) continue;
            const d = camera ? camera.position.distanceTo(m.position) : 12;
            const size = Math.min(1.6, Math.max(0.35, d * 0.042));
            m.userData.cross.scale.set(size, size, 1);
            m.userData.cross.children[0].scale.setScalar(pulse);
        }
    }

    dispose() {
        this.group.parent?.remove(this.group);
        for (const mesh of [this.hidden, this.outline, this.fill, this.shadow]) {
            mesh.material.dispose();
            mesh.dispose();
        }
        this.fill.geometry.dispose();
        this.shadow.geometry.dispose();
        for (const m of this.markers) {
            m.userData.cross.material.dispose();
            m.userData.cross.children[0].material.dispose();
        }
        this.markerGeometry.dispose();
        this.texture.dispose();
    }
}
