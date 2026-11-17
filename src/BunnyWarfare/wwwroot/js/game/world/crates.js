// Supply crates on the island: chunky cartoon crates per look (weapon: wooden crate with a carrot stencil, health: cream crate with a big heart,
// support: blue crate with a yellow star), dropped from the sky on a striped parachute, with a glowing ring on the ground so they are seen from far.
// Picking one pops the lid and lets its symbol fly up; destroyed crates burst into planks; crates whose ground ends under water sink with bubbles.
// The server decides everything (CrateDto { id, x, y, z, look }); this only shows it.
//
//   new Crates(group, particles)      the crates of one island (World creates it: world.crates)
//   sync(list, instant = false)       brings the crates to the server's list: unknown ones appear (after a short wait for a CrateDrop, or at once
//                                     with instant), missing ones vanish with a puff, known ones snap to the server's height
//   drop(dto)                         the crate falls from ~18 m on its parachute (≈ 2.2 s) and lands with a puff (restarts a crate shown without it)
//   pick(id) · destroy(id) · move(id, y) · sink(id)   what the server says happened to a crate
//   positionOf(id) → Vector3 | null   where a crate is (for floaters)
//   update(dt, time) · dispose()
import * as THREE from 'three';
import { paint, merge, softDot, softRing } from '../fx/shapes.js';

const SIZE = 0.72;
const DROP_HEIGHT = 18;
const DROP_TIME = 2.2;
const WAIT_FOR_DROP = 0.45; // a crate that first shows up in a Turn update waits this long for its CrateDrop message

const LOOKS = {
    weapon: { glow: 0xffb347, confetti: [0xf97316, 0xffd34d, 0x4fa83a, 0xffffff] },
    health: { glow: 0xff5a7a, confetti: [0xff4d6d, 0xffffff, 0xffb3c1] },
    support: { glow: 0x5fb4ff, confetti: [0x2f80ed, 0xffd34d, 0xffffff, 0x8fd3ff] },
};

const cache = new Map();
function cached(key, make) {
    if (!cache.has(key)) cache.set(key, make());
    return cache.get(key);
}

/** A flat extruded shape (a symbol on a side of a crate), centred, facing +z, depth d. */
function badge(shape, size, d, color) {
    const g = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: true, bevelThickness: d * 0.4, bevelSize: size * 0.03, bevelSegments: 1, curveSegments: 10 });
    g.computeBoundingBox();
    const b = g.boundingBox;
    const s = size / Math.max(b.max.x - b.min.x, b.max.y - b.min.y);
    g.translate(-(b.min.x + b.max.x) / 2, -(b.min.y + b.max.y) / 2, 0);
    g.scale(s, s, 1);
    paint(g, color);
    return g;
}

function heartShape() {
    const s = new THREE.Shape();
    s.moveTo(0, -0.9);
    s.bezierCurveTo(-1.2, -0.1, -1.1, 0.95, -0.5, 0.95);
    s.bezierCurveTo(-0.15, 0.95, 0, 0.7, 0, 0.5);
    s.bezierCurveTo(0, 0.7, 0.15, 0.95, 0.5, 0.95);
    s.bezierCurveTo(1.1, 0.95, 1.2, -0.1, 0, -0.9);
    return s;
}

function starShape() {
    const s = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
        const a = Math.PI / 2 + i * Math.PI / 5;
        const r = i % 2 ? 0.42 : 1;
        const x = Math.cos(a) * r, y = Math.sin(a) * r;
        if (i === 0) s.moveTo(x, y);
        else s.lineTo(x, y);
    }
    s.closePath();
    return s;
}

/** A carrot: an orange triangle with three green leaves (one shape per colour). */
function carrotParts(size, d) {
    const body = new THREE.Shape();
    body.moveTo(0, -1);
    body.lineTo(0.42, 0.55);
    body.quadraticCurveTo(0, 0.72, -0.42, 0.55);
    body.closePath();
    const leaves = new THREE.Shape();
    leaves.moveTo(0, 0.6);
    leaves.quadraticCurveTo(-0.5, 0.95, -0.38, 1.25);
    leaves.quadraticCurveTo(-0.1, 1.0, 0, 0.75);
    leaves.quadraticCurveTo(0.05, 1.15, 0.12, 1.35);
    leaves.quadraticCurveTo(0.3, 1.0, 0.06, 0.66);
    leaves.quadraticCurveTo(0.55, 0.9, 0.48, 1.15);
    leaves.quadraticCurveTo(0.2, 0.75, 0, 0.6);
    const opts = { depth: d, bevelEnabled: false, curveSegments: 8 };
    const a = new THREE.ExtrudeGeometry(body, opts);
    const b = new THREE.ExtrudeGeometry(leaves, opts);
    const k = size / 2.35;
    for (const g of [a, b]) {
        g.translate(0, -0.18, 0);
        g.scale(k, k, 1);
    }
    paint(a, '#f97316');
    paint(b, '#4fa83a');
    // the stripes of the carrot
    const stripes = [];
    for (const y of [-0.35, 0.05]) {
        const st = new THREE.BoxGeometry(0.34 * k * (1 + y), 0.05 * k, d * 1.2);
        st.translate(0, (y - 0.18) * k, d * 0.5);
        paint(st, '#c2410c');
        stripes.push(st);
    }
    return [a, b, ...stripes];
}

/** The four side symbols of a look, placed on the faces of a crate of size s (+ the lid). */
function symbols(look, s) {
    const parts = [];
    const d = 0.025;
    const make = () => {
        if (look === 'health') return [badge(heartShape(), s * 0.56, d, '#e5384f')];
        if (look === 'support') return [badge(starShape(), s * 0.6, d, '#ffd34d')];
        return carrotParts(s * 0.62, d);
    };
    for (let i = 0; i < 4; i++) {
        for (const g of make()) {
            g.translate(0, 0, s / 2 + 0.004);
            g.rotateY((i * Math.PI) / 2);
            parts.push(g);
        }
    }
    for (const g of make()) {
        g.translate(0, 0, s / 2 + 0.004);
        g.rotateX(-Math.PI / 2);
        parts.push(g);
    }
    return parts;
}

/** The crate of a look: origin at the bottom centre. */
function crateGeometry(look) {
    return cached(`crate-${look}`, () => {
        const s = SIZE;
        const parts = [];
        const body = new THREE.BoxGeometry(s, s, s, 4, 4, 4);
        const wood = (x, y, z) => {
            // planks: stripes across the faces, a little uneven
            const band = Math.floor((y + s / 2) / (s / 4));
            return band % 2 ? '#c98d4f' : '#b57a3e';
        };
        paint(body, look === 'health' ? (x, y) => (Math.abs(y) > s * 0.42 ? '#e9dcc4' : '#fff6e6') : look === 'support' ? (x, y) => (Math.abs(y) > s * 0.42 ? '#1f5fae' : '#2f80ed') : wood);
        parts.push(body);
        // the frame along the edges and metal (or painted) corners
        const t = s * 0.1;
        const frame = look === 'health' ? '#d8c6a6' : look === 'support' ? '#174a8a' : '#7a4d24';
        const corner = look === 'weapon' ? '#8d969c' : look === 'health' ? '#e5384f' : '#ffd34d';
        for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
            const post = new THREE.BoxGeometry(t, s + 0.01, t);
            post.translate(sx * (s / 2 - t / 2 + 0.006), 0, sz * (s / 2 - t / 2 + 0.006));
            paint(post, frame);
            parts.push(post);
            for (const sy of [-1, 1]) {
                const cap = new THREE.BoxGeometry(t * 1.5, t * 1.2, t * 1.5);
                cap.translate(sx * (s / 2 - t / 2 + 0.01), sy * (s / 2 - t * 0.5), sz * (s / 2 - t / 2 + 0.01));
                paint(cap, corner);
                parts.push(cap);
            }
        }
        for (const sy of [-1, 1]) {
            for (const [w, dpt, x, z] of [[s, t, 0, s / 2], [s, t, 0, -s / 2], [t, s, s / 2, 0], [t, s, -s / 2, 0]]) {
                const rail = new THREE.BoxGeometry(w + 0.012, t * 0.9, dpt + 0.012);
                rail.translate(x === 0 ? 0 : Math.sign(x) * (s / 2 - t / 2 + 0.006), sy * (s / 2 - t * 0.45), z === 0 ? 0 : Math.sign(z) * (s / 2 - t / 2 + 0.006));
                paint(rail, frame);
                parts.push(rail);
            }
        }
        parts.push(...symbols(look, s));
        const g = merge(parts);
        g.translate(0, s / 2, 0);
        return g;
    });
}

/** The parachute: a striped canopy and eight ropes down to the crate's lid (origin at the lid). */
function parachuteGeometry() {
    return cached('parachute', () => {
        const parts = [];
        const r = 1.25, lift = 1.9;
        const canopy = new THREE.SphereGeometry(r, 16, 6, 0, Math.PI * 2, 0, Math.PI * 0.42);
        canopy.scale(1, 0.62, 1);
        canopy.translate(0, lift, 0);
        paint(canopy, (x, y, z) => (Math.floor(((Math.atan2(z, x) + Math.PI) / (Math.PI * 2)) * 8) % 2 ? '#ffffff' : '#ef4444'));
        parts.push(canopy);
        const rimY = lift + Math.cos(Math.PI * 0.42) * r * 0.62;
        const rimR = Math.sin(Math.PI * 0.42) * r;
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            const top = new THREE.Vector3(Math.cos(a) * rimR, rimY, Math.sin(a) * rimR);
            const bottom = new THREE.Vector3(Math.cos(a) * SIZE * 0.42, 0, Math.sin(a) * SIZE * 0.42);
            const dir = top.clone().sub(bottom);
            const len = dir.length();
            const rope = new THREE.CylinderGeometry(0.008, 0.008, len, 3);
            rope.translate(0, len / 2, 0);
            rope.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()));
            rope.translate(bottom.x, bottom.y, bottom.z);
            paint(rope, '#3b2414');
            parts.push(rope);
        }
        return merge(parts);
    });
}

const crateMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.05 });
const chuteMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide, transparent: true });
const easeOutBack = t => 1 + 2.4 * Math.pow(t - 1, 3) + 1.4 * Math.pow(t - 1, 2);

export class Crates {
    constructor(group, particles) {
        this.group = new THREE.Group();
        this.group.name = 'crates';
        group.add(this.group);
        this.particles = particles;
        this.items = new Map(); // id → crate
        this.time = 0;
        this.ringGeometry = new THREE.PlaneGeometry(1.6, 1.6);
        this.ringGeometry.rotateX(-Math.PI / 2);
    }

    // ------------------------------------------------------------ the server's view

    sync(list, instant = false) {
        const seen = new Set();
        for (const dto of list ?? []) {
            seen.add(dto.id);
            const crate = this.items.get(dto.id);
            if (!crate) {
                this.add(dto, instant ? 'idle' : 'waiting');
                continue;
            }
            if (crate.state === 'idle' || crate.state === 'waiting') crate.groundY = dto.y;
        }
        for (const crate of this.items.values()) {
            if (!seen.has(crate.id) && (crate.state === 'idle' || crate.state === 'falling' || crate.state === 'waiting')) this.vanish(crate);
        }
    }

    drop(dto) {
        let crate = this.items.get(dto.id);
        if (!crate) crate = this.add(dto, 'falling');
        crate.groundY = dto.y;
        crate.state = 'falling';
        crate.t = 0;
        crate.root.visible = true;
        crate.chute.visible = true;
        crate.chute.material.opacity = 1;
        crate.chute.position.set(0, 0, 0);
        crate.chute.rotation.set(0, 0, 0);
        crate.chute.scale.setScalar(0.3);
    }

    pick(id) {
        const crate = this.items.get(id);
        if (!crate || crate.state === 'picked') return;
        this.land(crate, true);
        crate.state = 'picked';
        crate.t = 0;
        const at = crate.root.position.clone().add(new THREE.Vector3(0, SIZE * 0.8, 0));
        this.particles?.emit(at, { count: 34, speed: 3.4, up: 5, colors: LOOKS[crate.look]?.confetti ?? [0xffffff], life: 1.3, gravity: 0.6, size: 0.13, drag: 1.2 });
        this.particles?.emit(at, { count: 12, speed: 1.4, up: 2.5, colors: [0xffffff, 0xfff4c2], life: 0.7, gravity: -0.1, size: 0.24, additive: true });
    }

    destroy(id) {
        const crate = this.items.get(id);
        if (!crate) return;
        const at = crate.root.position.clone().add(new THREE.Vector3(0, SIZE * 0.5, 0));
        const planks = crate.look === 'health' ? [0xfff6e6, 0xe9dcc4, 0xe5384f] : crate.look === 'support' ? [0x2f80ed, 0x1f5fae, 0xffd34d] : [0xc98d4f, 0xb57a3e, 0x7a4d24];
        this.particles?.emit(at, { count: 26, speed: 5, up: 5, colors: planks, life: 1.5, gravity: 1, size: 0.2, drag: 0.8 });
        this.particles?.emit(at, { count: 10, speed: 1.6, up: 1.5, colors: [0xd9cbb2, 0xbfb29a], life: 1, gravity: 0, size: 0.5, grow: 2, drag: 2.5 });
        this.remove(crate);
    }

    move(id, y) {
        const crate = this.items.get(id);
        if (!crate) return;
        crate.groundY = y;
        if (crate.state === 'idle') crate.fallFrom = crate.root.position.y; // tumbles down onto the new ground
    }

    sink(id) {
        const crate = this.items.get(id);
        if (!crate) return;
        this.land(crate, true);
        crate.state = 'sinking';
        crate.t = 0;
    }

    positionOf(id) {
        const crate = this.items.get(id);
        return crate ? crate.root.position.clone() : null;
    }

    // ------------------------------------------------------------ inside

    add(dto, state) {
        const look = LOOKS[dto.look] ? dto.look : 'weapon';
        const root = new THREE.Group();
        root.position.set(dto.x, dto.y, dto.z);
        const yaw = ((dto.id * 2.39996) % (Math.PI * 2));
        const box = new THREE.Mesh(crateGeometry(look), crateMaterial);
        box.castShadow = true;
        box.receiveShadow = true;
        box.rotation.y = yaw;
        root.add(box);
        const chute = new THREE.Mesh(parachuteGeometry(), chuteMaterial.clone());
        chute.position.y = SIZE;
        chute.visible = false;
        const chuteHolder = new THREE.Group();
        chuteHolder.position.y = SIZE;
        chuteHolder.add(chute);
        chute.position.y = 0;
        root.add(chuteHolder);
        const ring = new THREE.Mesh(this.ringGeometry, new THREE.MeshBasicMaterial({ map: softRing(), color: LOOKS[look].glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.8 }));
        ring.position.y = 0.05;
        ring.renderOrder = 3;
        const spark = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot(), color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
        spark.scale.setScalar(0.45);
        spark.position.set(SIZE * 0.35, SIZE * 1.05, SIZE * 0.35);
        root.add(ring, spark);
        this.group.add(root);
        const crate = { id: dto.id, look, root, box, chute, chuteHolder, ring, spark, state, t: 0, groundY: dto.y, fallFrom: null, phase: Math.random() * 6, loose: null };
        root.visible = state !== 'waiting';
        this.items.set(dto.id, crate);
        if (state === 'falling') this.drop(dto);
        return crate;
    }

    /** The crate is on the ground now: the parachute lets go (drifts off and fades). */
    land(crate, quiet = false) {
        crate.root.position.y = crate.groundY;
        crate.box.scale.set(1, 1, 1);
        crate.box.rotation.x = crate.box.rotation.z = 0;
        if (crate.chute.visible && !crate.loose) {
            crate.loose = { t: 0, drift: new THREE.Vector3((Math.random() - 0.5) * 1.2, 0, (Math.random() - 0.5) * 1.2) };
        }
        if (!quiet) {
            const at = crate.root.position.clone().add(new THREE.Vector3(0, 0.05, 0));
            this.particles?.emit(at, { count: 18, speed: 2.4, up: 0.4, colors: [0xd9cbb2, 0xc4b496, 0xe8dcc6], life: 0.9, gravity: 0.1, size: 0.4, grow: 2, drag: 3, ring: true });
            crate.squash = 1;
        }
        crate.state = 'idle';
    }

    /** Gone without a reason we know (the list of the server lacks it): a puff. */
    vanish(crate) {
        const at = crate.root.position.clone().add(new THREE.Vector3(0, SIZE * 0.5, 0));
        if (crate.root.visible) this.particles?.emit(at, { count: 12, speed: 1.6, up: 1.4, colors: [0xffffff, 0xeeeeee], life: 0.8, gravity: -0.05, size: 0.4, grow: 2, drag: 2 });
        this.remove(crate);
    }

    remove(crate) {
        this.group.remove(crate.root);
        crate.chute.material.dispose();
        crate.ring.material.dispose();
        crate.spark.material.dispose();
        this.items.delete(crate.id);
    }

    update(dt, time) {
        this.time = time;
        for (const crate of [...this.items.values()]) {
            crate.t += dt;
            const root = crate.root;
            switch (crate.state) {
                case 'waiting':
                    // no CrateDrop came: it was there before (a reconnect, or a turn update without the message)
                    if (crate.t > WAIT_FOR_DROP) {
                        crate.state = 'idle';
                        root.visible = true;
                    }
                    break;
                case 'falling': {
                    const k = Math.min(1, crate.t / DROP_TIME);
                    // slows down as the canopy opens, a little sway
                    const fall = 1 - Math.pow(1 - k, 1.6);
                    root.position.y = crate.groundY + DROP_HEIGHT * (1 - fall);
                    const sway = Math.sin(crate.t * 2.6 + crate.phase) * 0.22 * (1 - k * 0.6);
                    crate.box.rotation.z = sway;
                    crate.box.rotation.x = Math.cos(crate.t * 2.1 + crate.phase) * 0.12;
                    crate.chuteHolder.rotation.z = sway * 0.6;
                    crate.chute.scale.setScalar(Math.min(1, 0.3 + crate.t * 2.2));
                    crate.ring.material.opacity = 0.3 + k * 0.5;
                    if (k >= 1) this.land(crate);
                    break;
                }
                case 'idle': {
                    if (crate.fallFrom !== null) {
                        // the ground below went away: it drops onto the new ground
                        root.position.y = Math.max(crate.groundY, root.position.y - dt * 6);
                        if (root.position.y <= crate.groundY + 1e-3) {
                            crate.fallFrom = null;
                            crate.squash = 0.7;
                        }
                    } else {
                        root.position.y = crate.groundY;
                    }
                    break;
                }
                case 'picked': {
                    // the lid pops: a squash, a jump, then it shrinks away
                    const k = crate.t / 0.55;
                    const s = k < 0.25 ? 1 - 0.25 * (k / 0.25) : Math.max(0.001, (1 - (k - 0.25) / 0.75) * 1.25);
                    crate.box.scale.set(s, k < 0.25 ? s * 0.8 : s, s);
                    root.position.y = crate.groundY + Math.max(0, Math.sin(Math.min(1, k) * Math.PI)) * 0.6;
                    crate.box.rotation.y += dt * 9;
                    crate.ring.material.opacity = Math.max(0, 0.8 - k);
                    if (k >= 1) this.remove(crate);
                    continue;
                }
                case 'sinking': {
                    root.position.y = crate.groundY - crate.t * 0.9;
                    crate.box.rotation.z = Math.sin(crate.t * 3) * 0.2;
                    crate.ring.visible = false;
                    if (Math.random() < dt * 14) {
                        this.particles?.emit(root.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.5, 0.2, (Math.random() - 0.5) * 0.5)), { count: 2, speed: 0.3, up: 1.2, colors: [0xffffff, 0xd6eefc], life: 0.6, gravity: -0.2, size: 0.12, fade: true });
                    }
                    if (crate.t > 1.4) this.remove(crate);
                    continue;
                }
            }
            // the landing squash
            if (crate.squash > 0) {
                crate.squash = Math.max(0, crate.squash - dt * 4);
                const q = crate.squash;
                crate.box.scale.set(1 + q * 0.18, 1 - q * 0.25, 1 + q * 0.18);
            }
            // the parachute let go: it drifts down beside the crate and fades
            if (crate.loose) {
                const l = crate.loose;
                l.t += dt;
                crate.chute.position.addScaledVector(l.drift, dt);
                crate.chute.position.y -= dt * 0.9;
                crate.chute.rotation.z = Math.min(1.3, l.t * 1.2);
                crate.chute.scale.y = Math.max(0.05, 1 - l.t * 0.8);
                crate.chute.material.opacity = Math.max(0, 1 - l.t / 1.1);
                if (l.t > 1.1) {
                    crate.chute.visible = false;
                    crate.loose = null;
                }
            }
            // seen from far: a pulsing ring of the look's colour and a twinkle on the lid
            if (crate.state === 'idle') {
                const pulse = 0.5 + 0.5 * Math.sin(time * 3 + crate.phase);
                crate.ring.material.opacity = 0.45 + pulse * 0.4;
                crate.ring.scale.setScalar(1 + pulse * 0.15);
                const tw = Math.max(0, Math.sin(time * 1.7 + crate.phase * 2));
                crate.spark.material.opacity = Math.pow(tw, 6);
                crate.spark.scale.setScalar(0.25 + Math.pow(tw, 6) * 0.35);
            } else {
                crate.spark.material.opacity = 0;
            }
        }
    }

    dispose() {
        for (const crate of [...this.items.values()]) this.remove(crate);
        this.group.parent?.remove(this.group);
        this.ringGeometry.dispose();
    }
}
