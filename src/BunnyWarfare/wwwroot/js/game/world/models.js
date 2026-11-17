// The models of the decoration: small low-poly pieces with vertex colours, each one merged into a single geometry (one draw call per kind).
// The origin of every model is the point where it stands on the ground; +y is up.
import * as THREE from 'three';
import { merge, paint, jitter, seeded } from './util.js';

const c = new THREE.Color();
const lerpHex = (a, b, t) => '#' + c.set(a).lerp(new THREE.Color(b), t).getHexString();

// ---------------------------------------------------------------- grass and flowers

export function grassTuft(base, mid, tip, blades = 7, height = 0.42, seed = 1) {
    const random = seeded(seed);
    const pos = [], col = [];
    const cb = new THREE.Color(base), cm = new THREE.Color(mid), ct = new THREE.Color(tip);
    for (let i = 0; i < blades; i++) {
        const a = (i / blades) * Math.PI * 2 + random() * 0.6;
        const lean = 0.06 + random() * 0.16;
        const h = height * (0.6 + random() * 0.6);
        const w = 0.03 + random() * 0.02;
        const ox = Math.cos(a) * 0.05, oz = Math.sin(a) * 0.05;
        const px = -Math.sin(a) * w, pz = Math.cos(a) * w;
        const tx = ox + Math.cos(a) * lean, tz = oz + Math.sin(a) * lean;
        const mx = ox + Math.cos(a) * lean * 0.35, mz = oz + Math.sin(a) * lean * 0.35, mh = h * 0.55;
        const v = [
            [ox - px, 0, oz - pz], [ox + px, 0, oz + pz], [mx + px * 0.6, mh, mz + pz * 0.6],
            [ox - px, 0, oz - pz], [mx + px * 0.6, mh, mz + pz * 0.6], [mx - px * 0.6, mh, mz - pz * 0.6],
            [mx - px * 0.6, mh, mz - pz * 0.6], [mx + px * 0.6, mh, mz + pz * 0.6], [tx, h, tz],
        ];
        const cs = [cb, cb, cm, cb, cm, cm, cm, cm, ct];
        v.forEach((p, k) => { pos.push(...p); col.push(cs[k].r, cs[k].g, cs[k].b); });
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    // normals pointing up: grass lit like the ground it stands on, from both sides
    const n = g.attributes.normal;
    for (let i = 0; i < n.count; i++) n.setXYZ(i, n.getX(i) * 0.25, 1, n.getZ(i) * 0.25);
    return g;
}

export function flower(petal, center = '#ffd23a', petals = 6) {
    const parts = [];
    const stem = new THREE.CylinderGeometry(0.012, 0.016, 0.36, 4);
    stem.translate(0, 0.18, 0);
    parts.push(paint(stem, '#3f8a2a'));
    const leaf = new THREE.SphereGeometry(0.06, 5, 3);
    leaf.scale(1, 0.2, 0.42);
    leaf.translate(0.06, 0.1, 0);
    leaf.rotateY(0.6);
    parts.push(paint(leaf, '#4f9c34'));
    for (let i = 0; i < petals; i++) {
        const p = new THREE.SphereGeometry(0.05, 6, 3);
        p.scale(1, 0.28, 0.6);
        p.translate(0.055, 0, 0);
        p.rotateY((i / petals) * Math.PI * 2);
        p.rotateX(-0.25);
        p.translate(0, 0.37, 0);
        parts.push(paint(p, petal));
    }
    const ctr = new THREE.SphereGeometry(0.035, 6, 4);
    ctr.translate(0, 0.38, 0);
    parts.push(paint(ctr, center));
    return merge(parts);
}

/** A little patch of clover: round three-leafed sprigs close to the ground. */
export function clover() {
    const parts = [];
    const random = seeded(77);
    for (let s = 0; s < 5; s++) {
        const ox = (random() - 0.5) * 0.35, oz = (random() - 0.5) * 0.35, h = 0.05 + random() * 0.06;
        for (let i = 0; i < 3; i++) {
            const leaf = new THREE.CircleGeometry(0.045, 6);
            leaf.rotateX(-Math.PI / 2 + 0.35);
            leaf.translate(0, 0, 0.04);
            leaf.rotateY((i / 3) * Math.PI * 2 + s);
            leaf.translate(ox, h, oz);
            parts.push(paint(leaf, i % 2 ? '#4f9e36' : '#5fae3e'));
        }
    }
    return merge(parts);
}

// ---------------------------------------------------------------- shrubs and trees

/**
 * A soft round blob of leaves (or snow, or a cloud): a jittered icosphere with radial normals, so it shades round like a cartoon, not faceted.
 * Its centre is at (cx, cy, cz); squash scales y.
 */
export function blob(r, cx, cy, cz, random, { detail = 2, lumps = 0.14, squash = 1 } = {}) {
    const g = new THREE.IcosahedronGeometry(r, detail);
    const pos = g.attributes.position;
    const moved = new Map();
    const normals = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        const key = `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
        let k = moved.get(key);
        if (k === undefined) {
            k = 1 + (random() - 0.5) * lumps * 2;
            moved.set(key, k);
        }
        const len = Math.hypot(x, y, z) || 1;
        normals[i * 3] = x / len;
        normals[i * 3 + 1] = y / len;
        normals[i * 3 + 2] = z / len;
        pos.setXYZ(i, x * k + cx, y * k * squash + cy, z * k + cz);
    }
    g.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    return g;
}

/** Colours a canopy blob: light on top, dark below and inside, with brighter leaf clusters. */
function leafy(g, tone, light, dark, canopyCentre, canopyRadius) {
    return paint(g, (x, y, z, nx, ny) => {
        const top = Math.max(0, ny), bottom = Math.max(0, -ny);
        const inner = 1 - Math.min(1, Math.hypot(x - canopyCentre.x, y - canopyCentre.y, z - canopyCentre.z) / canopyRadius);
        const cluster = Math.sin(x * 9.1 + y * 3.7) * Math.sin(z * 8.3 - y * 4.1) > 0.35 ? 0.18 : 0;
        let col = lerpHex(tone, light, Math.min(1, top * 0.7 + cluster));
        col = lerpHex(col, dark, Math.min(0.7, bottom * 0.6 + Math.max(0, inner - 0.35) * 0.7));
        return col;
    });
}

export function bush(seed, greens = ['#3f8a2c', '#4f9a33', '#5fae3c'], berries = '#d6303a', light = '#9ed36a') {
    const random = seeded(seed);
    const parts = [];
    const centre = new THREE.Vector3(0, 0.4, 0);
    for (let i = 0; i < 6; i++) {
        const r = 0.24 + random() * 0.2;
        const a = random() * Math.PI * 2, d = i === 0 ? 0 : 0.2 + random() * 0.15;
        const g = blob(r, Math.cos(a) * d, r * 0.85 + random() * 0.18, Math.sin(a) * d, random, { detail: 1, lumps: 0.1 });
        parts.push(leafy(g, greens[i % greens.length], light, '#1f4a18', centre, 0.75));
    }
    if (berries) {
        for (let i = 0; i < 9; i++) {
            const b = new THREE.SphereGeometry(0.045, 6, 4);
            const a = random() * Math.PI * 2;
            b.translate(Math.cos(a) * 0.4, 0.22 + random() * 0.4, Math.sin(a) * 0.4);
            parts.push(paint(b, (x, y, z, nx, ny) => (ny > 0.5 ? '#ff8a8a' : berries)));
        }
    }
    return merge(parts);
}

/** A bark-coloured trunk with root flares at the foot. */
function trunkWithRoots(random, height, bottom, top, color = '#7a4f2a', dark = '#5a381c') {
    const parts = [];
    const trunk = new THREE.CylinderGeometry(top, bottom, height, 9, 4);
    const p = trunk.attributes.position;
    for (let i = 0; i < p.count; i++) {
        const y = p.getY(i), a = Math.atan2(p.getZ(i), p.getX(i));
        const k = 1 + Math.sin(a * 3 + y * 2.0) * 0.06;
        p.setX(i, p.getX(i) * k);
        p.setZ(i, p.getZ(i) * k);
    }
    trunk.computeVertexNormals();
    trunk.translate(0, height / 2, 0);
    parts.push(paint(trunk, (x, y, z) => {
        const a = Math.atan2(z, x);
        return Math.sin(a * 7 + Math.sin(y * 3) * 1.5) > 0.55 ? dark : color;
    }));
    for (let i = 0; i < 4; i++) {
        const root = new THREE.ConeGeometry(0.09, 0.5, 5);
        root.rotateZ(Math.PI / 2 - 0.45);
        root.translate(bottom + 0.08, 0.08, 0);
        root.rotateY((i / 4) * Math.PI * 2 + random() * 0.6);
        parts.push(paint(root, dark));
    }
    return parts;
}

export function oak(seed, greens = ['#4f9a33', '#5fae3c', '#3f8a2c', '#6dbb45'], fruit = null) {
    const random = seeded(seed);
    const parts = trunkWithRoots(random, 1.8, 0.22, 0.13);
    // three branches into the crown
    for (let i = 0; i < 3; i++) {
        const b = new THREE.CylinderGeometry(0.045, 0.08, 0.85, 6);
        b.translate(0, 0.42, 0);
        b.rotateZ(0.75);
        b.rotateY((i / 3) * Math.PI * 2 + random());
        b.translate(0, 1.3, 0);
        parts.push(paint(b, '#6e4627'));
    }
    // the crown: a big core and a ring of smaller blobs, like a cartoon cloud
    const centre = new THREE.Vector3(0, 2.45, 0);
    parts.push(leafy(blob(0.95, 0, 2.4, 0, random, { detail: 3, lumps: 0.05 }), greens[0], '#a6da6e', '#2a5a1e', centre, 1.6));
    const blobs = 7 + Math.floor(random() * 3);
    const spots = [];
    for (let i = 0; i < blobs; i++) {
        const a = (i / blobs) * Math.PI * 2 + random() * 0.5;
        const up = i % 3 === 0 ? 0.55 + random() * 0.35 : (random() - 0.4) * 0.5;
        const r = 0.45 + random() * 0.3;
        const d = 0.75 + random() * 0.25;
        const x = Math.cos(a) * d, y = 2.4 + up, z = Math.sin(a) * d;
        spots.push([x, y, z, r]);
        parts.push(leafy(blob(r, x, y, z, random, { lumps: 0.06 }), greens[(i + 1) % greens.length], '#b4e27a', '#2a5a1e', centre, 1.6));
    }
    if (fruit) {
        for (let i = 0; i < 9; i++) {
            const [x, y, z, r] = spots[i % spots.length];
            const a = random() * Math.PI * 2;
            const f = new THREE.SphereGeometry(0.075, 7, 5);
            f.translate(x + Math.cos(a) * r * 0.85, y - r * 0.35 + random() * 0.3, z + Math.sin(a) * r * 0.85);
            parts.push(paint(f, (vx, vy, vz, nx, ny) => (ny > 0.5 ? '#ff7a6a' : fruit)));
        }
    }
    return merge(parts);
}

export function birch(seed) {
    const random = seeded(seed);
    const parts = [];
    const trunk = new THREE.CylinderGeometry(0.08, 0.12, 2.6, 8, 8);
    trunk.translate(0, 1.3, 0);
    parts.push(paint(trunk, (x, y, z) => {
        const a = Math.atan2(z, x);
        return (Math.sin(y * 9 + a * 2) > 0.55 && Math.sin(a * 3 + y * 2) > -0.2) || Math.sin(y * 23 + a) > 0.93 ? '#2b2a28' : '#f6f1e6';
    }));
    const centre = new THREE.Vector3(0, 2.8, 0);
    for (let i = 0; i < 6; i++) {
        const r = 0.38 + random() * 0.25;
        const g = blob(r, (random() - 0.5) * 0.7, 2.1 + i * 0.28 + random() * 0.2, (random() - 0.5) * 0.7, random, { squash: 1.3, lumps: 0.1 });
        parts.push(leafy(g, i % 2 ? '#8cc152' : '#7db546', '#c6e57a', '#3f6f22', centre, 1.2));
    }
    return merge(parts);
}

/** A pine with tiers; snowy = white on top of every tier. */
export function pine(seed, snowy) {
    const random = seeded(seed);
    const parts = [];
    const trunk = new THREE.CylinderGeometry(0.1, 0.16, 1.0, 6);
    trunk.translate(0, 0.5, 0);
    parts.push(paint(trunk, '#6a4426'));
    const tiers = 4;
    for (let i = 0; i < tiers; i++) {
        const r = 1.05 - i * 0.22, h = 1.05 - i * 0.12;
        const cone = jitter(new THREE.ConeGeometry(r, h, 8, 1), 0.06, random);
        const base = 1.0 + i * 0.62;
        cone.translate(0, base + h / 2, 0);
        const green = ['#24543a', '#2c6342', '#33704a', '#3c7d52'][i];
        parts.push(paint(cone, (x, y, z, nx, ny) => {
            // snow lies on the upper half of every tier, ragged at its lower edge
            if (snowy && ny > 0.3 && y > base + h * (0.42 + Math.sin(x * 11 + z * 7) * 0.12)) return '#f6fbff';
            return ny < 0.1 ? lerpHex(green, '#123020', 0.35) : green;
        }));
    }
    return merge(parts);
}

export function palm(seed) {
    const random = seeded(seed);
    const parts = [];
    const segments = 7;
    let x = 0, y = 0;
    const bend = 0.12 + random() * 0.1;
    for (let i = 0; i < segments; i++) {
        const seg = new THREE.CylinderGeometry(0.13 - i * 0.008, 0.16 - i * 0.008, 0.48, 7);
        seg.rotateZ(-bend * i * 0.5);
        seg.translate(x, y + 0.24, 0);
        parts.push(paint(seg, i % 2 ? '#9c7445' : '#87613a'));
        x += Math.sin(bend * i * 0.5) * 0.48;
        y += Math.cos(bend * i * 0.5) * 0.46;
    }
    const top = new THREE.Vector3(x, y, 0);
    for (let i = 0; i < 8; i++) {
        const frond = new THREE.ConeGeometry(0.22, 1.6, 4, 3);
        // flatten and droop: a long leaf hanging outwards
        frond.scale(1, 1, 0.18);
        const p = frond.attributes.position;
        for (let k = 0; k < p.count; k++) {
            const t = (p.getY(k) + 0.8) / 1.6;
            p.setY(k, p.getY(k) - Math.pow(t, 2) * 0.55);
        }
        frond.rotateZ(-Math.PI / 2 + 0.25);
        frond.translate(0.75, 0, 0);
        frond.rotateY((i / 8) * Math.PI * 2 + random() * 0.3);
        frond.translate(top.x, top.y, top.z);
        parts.push(paint(frond, (vx, vy, vz, nx, ny) => (ny > 0 ? '#5aa83a' : '#3c7f2a')));
    }
    for (let i = 0; i < 3; i++) {
        const nut = new THREE.SphereGeometry(0.09, 6, 4);
        nut.translate(top.x + Math.cos(i * 2.1) * 0.12, top.y - 0.12, Math.sin(i * 2.1) * 0.12);
        parts.push(paint(nut, '#5a3d22'));
    }
    return merge(parts);
}

// ---------------------------------------------------------------- rocks

export function rock(seed, colors, mossy = false, snowy = false) {
    const random = seeded(seed);
    const g = jitter(new THREE.DodecahedronGeometry(0.5, 1), 0.22, random);
    g.scale(1, 0.62, 0.85);
    g.translate(0, 0.18, 0);
    return paint(g, (x, y, z, nx, ny) => {
        if (snowy && ny > 0.45) return '#f4f8fc';
        if (mossy && ny > 0.55 && Math.sin(x * 9 + z * 5) > -0.3) return '#5f9a3a';
        const t = Math.sin(y * 18 + x * 3) * 0.5 + 0.5;
        return lerpHex(colors[0], colors[1], t * 0.6 + (ny < 0 ? 0.4 : 0));
    });
}

export function sandstone(seed) {
    const random = seeded(seed);
    const parts = [];
    let y = 0;
    const layers = 3 + Math.floor(random() * 3);
    const tones = ['#c27a45', '#d8955a', '#b8693d', '#e0a66a', '#a85d34'];
    for (let i = 0; i < layers; i++) {
        const w = 1.1 - i * 0.14 + random() * 0.2, h = 0.28 + random() * 0.18;
        const b = jitter(new THREE.BoxGeometry(w, h, w * (0.7 + random() * 0.3), 2, 1, 2), 0.1, random);
        b.rotateY(random() * 0.6);
        b.translate((random() - 0.5) * 0.2, y + h / 2, (random() - 0.5) * 0.2);
        parts.push(paint(b, tones[i % tones.length]));
        y += h * 0.92;
    }
    return merge(parts);
}

export function arch() {
    const random = seeded(31);
    const g = jitter(new THREE.TorusGeometry(1.6, 0.42, 6, 14, Math.PI), 0.12, random);
    const parts = [paint(g, (x, y) => (Math.sin(y * 9) > 0.3 ? '#c27a45' : '#d8955a'))];
    for (const side of [-1, 1]) {
        const foot = jitter(new THREE.BoxGeometry(0.9, 0.5, 0.9, 2, 1, 2), 0.12, random);
        foot.translate(side * 1.6, 0.1, 0);
        parts.push(paint(foot, '#b8693d'));
    }
    return merge(parts);
}

// ---------------------------------------------------------------- cacti and dry things

export function saguaro(seed) {
    const random = seeded(seed);
    const green = (x, y, z, nx, ny, nz) => (Math.sin(Math.atan2(nz, nx) * 8) > 0.2 ? '#4f9a46' : '#3d7f38');
    const parts = [];
    const trunk = new THREE.CapsuleGeometry(0.2, 1.6, 4, 12);
    trunk.translate(0, 1.0, 0);
    parts.push(paint(trunk, green));
    for (const side of [-1, 1]) {
        if (random() < 0.2) continue;
        const h = 0.5 + random() * 0.4, at = 0.7 + random() * 0.5;
        const out = new THREE.CapsuleGeometry(0.12, 0.35, 3, 10);
        out.rotateZ(Math.PI / 2);
        out.translate(side * 0.35, at, 0);
        parts.push(paint(out, green));
        const up = new THREE.CapsuleGeometry(0.12, h, 3, 10);
        up.translate(side * 0.52, at + h / 2 + 0.05, 0);
        parts.push(paint(up, green));
    }
    const flowerTop = new THREE.SphereGeometry(0.07, 6, 4);
    flowerTop.translate(0, 1.95, 0);
    parts.push(paint(flowerTop, '#f2a7c8'));
    return merge(parts);
}

export function barrelCactus() {
    const g = new THREE.SphereGeometry(0.32, 16, 8);
    g.scale(1, 1.15, 1);
    g.translate(0, 0.3, 0);
    const parts = [paint(g, (x, y, z) => (Math.sin(Math.atan2(z, x) * 12) > 0 ? '#5aa14a' : '#3f8236'))];
    for (let i = 0; i < 4; i++) {
        const f = new THREE.SphereGeometry(0.05, 5, 3);
        f.translate(Math.cos(i * 1.6) * 0.08, 0.66, Math.sin(i * 1.6) * 0.08);
        parts.push(paint(f, '#ffd23a'));
    }
    return merge(parts);
}

export function pricklyPear(seed) {
    const random = seeded(seed);
    const parts = [];
    const pads = [[0, 0.3, 0, 0], [0.22, 0.68, 0.05, -0.5], [-0.25, 0.62, -0.05, 0.6], [0.05, 0.98, 0, 0.15]];
    for (const [x, y, z, rot] of pads) {
        const p = new THREE.SphereGeometry(0.26, 8, 6);
        p.scale(1, 1.2, 0.3);
        p.rotateZ(rot);
        p.rotateY(random() * 0.6);
        p.translate(x, y, z);
        parts.push(paint(p, '#6aab4a'));
        const fruit = new THREE.SphereGeometry(0.05, 5, 3);
        fruit.translate(x + 0.08, y + 0.28, z);
        parts.push(paint(fruit, '#c8315a'));
    }
    return merge(parts);
}

export function dryBush(seed) {
    const random = seeded(seed);
    const parts = [];
    for (let i = 0; i < 9; i++) {
        const len = 0.3 + random() * 0.3;
        const twig = new THREE.CylinderGeometry(0.006, 0.014, len, 3);
        twig.translate(0, len / 2, 0);
        twig.rotateZ((random() - 0.5) * 1.4);
        twig.rotateY(random() * Math.PI * 2);
        parts.push(paint(twig, random() < 0.5 ? '#8a6a44' : '#a58457'));
    }
    const core = jitter(new THREE.IcosahedronGeometry(0.07, 0), 0.03, random);
    core.translate(0, 0.04, 0);
    parts.push(paint(core, '#7d6a3e'));
    return merge(parts);
}

export function bones() {
    const parts = [];
    for (const [rot, off] of [[0.4, 0], [-0.7, 0.18]]) {
        const b = new THREE.CapsuleGeometry(0.035, 0.42, 2, 6);
        b.rotateZ(Math.PI / 2);
        b.rotateY(rot);
        b.translate(off, 0.04, off * 0.5);
        parts.push(paint(b, '#efe6d2'));
    }
    const skull = new THREE.SphereGeometry(0.13, 8, 6);
    skull.scale(1, 0.85, 1.2);
    skull.translate(-0.3, 0.1, 0.1);
    parts.push(paint(skull, '#f3ead8'));
    for (const s of [-1, 1]) {
        const eye = new THREE.SphereGeometry(0.035, 5, 3);
        eye.translate(-0.3 + s * 0.05, 0.13, 0.24);
        parts.push(paint(eye, '#2a2018'));
    }
    return merge(parts);
}

// ---------------------------------------------------------------- the meadow's own: carrots, mushrooms, a fence, haystacks, reeds, lily pads

/** A carrot in the ground: the orange shoulder peeks out of a little mound, with a tuft of fronds. */
export function carrot(seed) {
    const random = seeded(seed);
    const parts = [];
    const mound = new THREE.SphereGeometry(0.16, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2);
    mound.scale(1, 0.35, 1);
    parts.push(paint(mound, '#6b4a2f'));
    const top = new THREE.CylinderGeometry(0.055, 0.07, 0.09, 8);
    top.translate(0, 0.05, 0);
    parts.push(paint(top, '#f07a1c'));
    for (let i = 0; i < 5; i++) {
        const frond = new THREE.ConeGeometry(0.03, 0.34 + random() * 0.12, 4);
        frond.translate(0, 0.18, 0);
        frond.rotateZ((random() - 0.5) * 0.7);
        frond.rotateY((i / 5) * Math.PI * 2);
        frond.translate(0, 0.08, 0);
        parts.push(paint(frond, i % 2 ? '#3f9a2f' : '#5ab840'));
    }
    return merge(parts);
}

export function mushroom(cap = '#d63a2e') {
    const parts = [];
    const stem = new THREE.CylinderGeometry(0.035, 0.05, 0.16, 6);
    stem.translate(0, 0.08, 0);
    parts.push(paint(stem, '#f3ead8'));
    const hat = new THREE.SphereGeometry(0.11, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2);
    hat.scale(1, 0.7, 1);
    hat.translate(0, 0.15, 0);
    parts.push(paint(hat, (x, y, z) => (Math.sin(x * 60) * Math.sin(z * 60) > 0.55 ? '#ffffff' : cap)));
    return merge(parts);
}

export function fence() {
    const parts = [];
    const wood = (x, y) => (Math.sin(y * 40 + x * 10) > 0.6 ? '#8a5a33' : '#9c6b3f');
    for (const x of [-0.9, 0, 0.9]) {
        const post = new THREE.BoxGeometry(0.09, 0.75, 0.09);
        post.translate(x, 0.33, 0);
        parts.push(paint(post, wood));
    }
    for (const y of [0.28, 0.55]) {
        const rail = new THREE.BoxGeometry(1.95, 0.07, 0.045);
        rail.rotateZ((y - 0.4) * 0.05);
        rail.translate(0, y, 0.06);
        parts.push(paint(rail, wood));
    }
    return merge(parts);
}

export function haystack() {
    const parts = [];
    const body = new THREE.CylinderGeometry(0.55, 0.65, 0.7, 12, 3);
    body.translate(0, 0.35, 0);
    parts.push(paint(body, (x, y, z) => (Math.sin(Math.atan2(z, x) * 20 + y * 8) > 0.4 ? '#d9b44a' : '#e8c65c')));
    const top = new THREE.ConeGeometry(0.58, 0.5, 12);
    top.translate(0, 0.95, 0);
    parts.push(paint(top, '#f0d26a'));
    return merge(parts);
}

export function reeds(seed) {
    const random = seeded(seed);
    const parts = [];
    for (let i = 0; i < 7; i++) {
        const h = 0.7 + random() * 0.6;
        const x = (random() - 0.5) * 0.45, z = (random() - 0.5) * 0.45;
        const stalk = new THREE.CylinderGeometry(0.008, 0.014, h, 3);
        stalk.translate(x, h / 2, z);
        parts.push(paint(stalk, '#6f9a3e'));
        if (i % 2 === 0) {
            const head = new THREE.CapsuleGeometry(0.03, 0.12, 2, 5);
            head.translate(x, h - 0.05, z);
            parts.push(paint(head, '#6b4226'));
        } else {
            const leaf = new THREE.ConeGeometry(0.02, h * 0.8, 3);
            leaf.translate(0, h * 0.4, 0);
            leaf.rotateZ(0.35);
            leaf.translate(x, 0, z);
            parts.push(paint(leaf, '#7fae4a'));
        }
    }
    return merge(parts);
}

export function lilyPad(withFlower) {
    const parts = [];
    const pad = new THREE.CircleGeometry(0.28, 12, 0.35, Math.PI * 2 - 0.5);
    pad.rotateX(-Math.PI / 2);
    parts.push(paint(pad, (x, y, z) => (Math.hypot(x, z) > 0.2 ? '#4f9a3a' : '#5fae44')));
    if (withFlower) {
        for (let i = 0; i < 7; i++) {
            const p = new THREE.SphereGeometry(0.05, 5, 3);
            p.scale(0.5, 0.4, 1);
            p.translate(0, 0.05, 0.05);
            p.rotateX(-0.6);
            p.rotateY((i / 7) * Math.PI * 2);
            parts.push(paint(p, '#f3a6c8'));
        }
        const ctr = new THREE.SphereGeometry(0.03, 5, 3);
        ctr.translate(0, 0.06, 0);
        parts.push(paint(ctr, '#ffd23a'));
    }
    return merge(parts);
}

// ---------------------------------------------------------------- snow

export function snowman() {
    const parts = [];
    const white = (x, y, z, nx, ny) => (ny < -0.3 ? '#d9e4ef' : '#ffffff');
    for (const [r, y] of [[0.42, 0.36], [0.31, 0.95], [0.22, 1.38]]) {
        const s = new THREE.SphereGeometry(r, 12, 9);
        s.translate(0, y, 0);
        parts.push(paint(s, white));
    }
    const nose = new THREE.ConeGeometry(0.045, 0.24, 6);
    nose.rotateX(Math.PI / 2);
    nose.translate(0, 1.38, 0.3);
    parts.push(paint(nose, '#f07a1c'));
    for (const [x, y, z] of [[-0.08, 1.46, 0.19], [0.08, 1.46, 0.19], [0, 1.05, 0.3], [0, 0.92, 0.31], [0, 0.79, 0.29]]) {
        const coal = new THREE.SphereGeometry(0.03, 5, 3);
        coal.translate(x, y, z);
        parts.push(paint(coal, '#1d1d22'));
    }
    for (const side of [-1, 1]) {
        const arm = new THREE.CylinderGeometry(0.015, 0.025, 0.6, 4);
        arm.rotateZ(side * 1.0);
        arm.translate(side * 0.48, 1.1, 0);
        parts.push(paint(arm, '#5a3d22'));
    }
    const hat = new THREE.CylinderGeometry(0.15, 0.15, 0.22, 10);
    hat.translate(0, 1.66, 0);
    parts.push(paint(hat, '#2a2a33'));
    const brim = new THREE.CylinderGeometry(0.24, 0.24, 0.03, 12);
    brim.translate(0, 1.56, 0);
    parts.push(paint(brim, '#2a2a33'));
    const scarf = new THREE.TorusGeometry(0.22, 0.05, 5, 12);
    scarf.rotateX(Math.PI / 2);
    scarf.translate(0, 1.2, 0);
    parts.push(paint(scarf, '#d6303a'));
    return merge(parts);
}

export function iceCrystals(seed) {
    const random = seeded(seed);
    const parts = [];
    for (let i = 0; i < 5; i++) {
        const h = 0.4 + random() * 0.6;
        const g = new THREE.OctahedronGeometry(0.12, 0);
        g.scale(1, h / 0.24, 1);
        g.translate(0, h / 2, 0);
        g.rotateZ((random() - 0.5) * 0.9);
        g.rotateY(random() * Math.PI * 2);
        g.translate((random() - 0.5) * 0.3, 0, (random() - 0.5) * 0.3);
        parts.push(paint(g, (x, y, z, nx, ny) => (ny > 0.2 ? '#e8fbff' : '#9fd8f0')));
    }
    return merge(parts);
}

/** A flat floe of ice that drifts on the sea. */
export function iceFloe(seed) {
    const random = seeded(seed);
    const g = jitter(new THREE.CylinderGeometry(0.9, 1.0, 0.22, 7, 1), 0.25, random);
    g.scale(1, 1, 0.7 + random() * 0.4);
    return paint(g, (x, y, z, nx, ny) => (ny > 0.5 ? '#f4fbff' : '#a9d6ea'));
}

export function icicles(seed) {
    const random = seeded(seed);
    const parts = [];
    for (let i = 0; i < 6; i++) {
        const h = 0.2 + random() * 0.45;
        const g = new THREE.ConeGeometry(0.04 + random() * 0.03, h, 5);
        g.rotateX(Math.PI);
        g.translate((i - 3) * 0.12 + random() * 0.05, -h / 2, random() * 0.05);
        parts.push(paint(g, '#cfeefc'));
    }
    const cap = new THREE.BoxGeometry(0.85, 0.08, 0.16);
    parts.push(paint(cap, '#ffffff'));
    return merge(parts);
}

// ---------------------------------------------------------------- moon

export function moonCrystals(seed) {
    const random = seeded(seed);
    const parts = [];
    for (let i = 0; i < 6; i++) {
        const h = 0.35 + random() * 0.9;
        const g = new THREE.CylinderGeometry(0, 0.1, h * 0.35, 6);
        g.translate(0, h * 0.82, 0);
        const body = new THREE.CylinderGeometry(0.1, 0.1, h * 0.65, 6);
        body.translate(0, h * 0.33, 0);
        const piece = merge([paint(g, i % 2 ? '#b9f6ff' : '#e0c4ff'), paint(body, i % 2 ? '#5ad8f0' : '#a77cf0')]);
        piece.rotateZ((random() - 0.5) * 1.0);
        piece.rotateY(random() * Math.PI * 2);
        piece.translate((random() - 0.5) * 0.35, 0, (random() - 0.5) * 0.35);
        parts.push(piece);
    }
    return merge(parts);
}

export function lander() {
    const parts = [];
    const body = new THREE.CylinderGeometry(0.5, 0.6, 0.6, 8);
    body.translate(0, 1.0, 0);
    parts.push(paint(body, (x, y, z) => (Math.sin(Math.atan2(z, x) * 4 + y * 10) > 0 ? '#d9a63a' : '#f0c75a')));
    const top = new THREE.CylinderGeometry(0.32, 0.45, 0.45, 8);
    top.translate(0, 1.5, 0);
    parts.push(paint(top, '#d6d8de'));
    const window_ = new THREE.BoxGeometry(0.22, 0.14, 0.05);
    window_.translate(0, 1.55, 0.36);
    parts.push(paint(window_, '#1d2a44'));
    for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const leg = new THREE.CylinderGeometry(0.035, 0.035, 1.2, 5);
        leg.rotateZ(0.55);
        leg.translate(0.55, 0.5, 0);
        leg.rotateY(a);
        parts.push(paint(leg, '#9a9ca6'));
        const foot = new THREE.CylinderGeometry(0.14, 0.16, 0.05, 8);
        foot.translate(Math.cos(a) * 0.86, 0.025, -Math.sin(a) * 0.86);
        parts.push(paint(foot, '#8a8c96'));
    }
    const dish = new THREE.SphereGeometry(0.22, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2.5);
    dish.rotateX(-0.6);
    dish.translate(0.3, 1.9, -0.1);
    parts.push(paint(dish, '#eef0f4'));
    return merge(parts);
}

export function antenna() {
    const parts = [];
    const mast = new THREE.CylinderGeometry(0.04, 0.06, 1.6, 6);
    mast.translate(0, 0.8, 0);
    parts.push(paint(mast, '#a0a3ad'));
    const dish = new THREE.SphereGeometry(0.5, 12, 5, 0, Math.PI * 2, 0, Math.PI / 3);
    dish.scale(1, 0.6, 1);
    dish.rotateX(Math.PI / 2 + 0.6);
    dish.translate(0, 1.6, 0.05);
    parts.push(paint(dish, '#eceef3'));
    const tip = new THREE.SphereGeometry(0.05, 6, 4);
    tip.translate(0, 1.75, 0.45);
    parts.push(paint(tip, '#ff4a3a'));
    for (let i = 0; i < 3; i++) {
        const leg = new THREE.CylinderGeometry(0.02, 0.02, 0.7, 4);
        leg.rotateZ(0.5);
        leg.translate(0.2, 0.3, 0);
        leg.rotateY((i / 3) * Math.PI * 2);
        parts.push(paint(leg, '#8a8d96'));
    }
    return merge(parts);
}

/** The flag of the bunnies on the moon: a carrot on orange. */
export function flag() {
    const parts = [];
    const pole = new THREE.CylinderGeometry(0.025, 0.025, 1.8, 6);
    pole.translate(0, 0.9, 0);
    parts.push(paint(pole, '#d8dbe2'));
    const cloth = new THREE.PlaneGeometry(0.9, 0.55, 6, 2);
    const p = cloth.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 6) * 0.04);
    cloth.translate(0.45, 1.5, 0);
    parts.push(paint(cloth, (x, y) => (Math.abs(y - 1.5) < 0.07 && x > 0.2 && x < 0.75 ? '#ffffff' : '#c2410c')));
    const back = cloth.clone();
    back.rotateY(Math.PI);
    back.translate(0.9, 0, 0);
    parts.push(paint(back, '#a8380a'));
    return merge(parts);
}

// ---------------------------------------------------------------- small things on the ground (all themes)

/** A few flat stones lying together in a patch of about half a metre. */
export function pebbles(seed, colors = ['#9a9286', '#7d766c', '#b3ab9e']) {
    const random = seeded(seed);
    const parts = [];
    for (let i = 0; i < 6; i++) {
        const r = 0.04 + random() * 0.07;
        const g = jitter(new THREE.DodecahedronGeometry(r, 0), r * 0.45, random);
        g.scale(1, 0.5 + random() * 0.25, 0.8 + random() * 0.4);
        g.rotateY(random() * Math.PI);
        g.translate((random() - 0.5) * 0.5, r * 0.25, (random() - 0.5) * 0.5);
        const tone = colors[i % colors.length];
        parts.push(paint(g, (x, y, z, nx, ny) => (ny > 0.5 ? lerpHex(tone, '#ffffff', 0.18) : tone)));
    }
    return merge(parts);
}

/** A rock outcrop for steep slopes: two or three chunky blocks with strata, half sunk into the ground. */
export function cliffRock(seed, colors, { moss = null, snow = false } = {}) {
    const random = seeded(seed);
    const parts = [];
    const count = 2 + Math.floor(random() * 2);
    for (let i = 0; i < count; i++) {
        const r = 0.45 + random() * 0.35;
        const g = jitter(new THREE.DodecahedronGeometry(r, 0), r * 0.35, random);
        g.scale(1.2 + random() * 0.4, 0.7 + random() * 0.3, 0.9 + random() * 0.3);
        g.rotateY(random() * Math.PI);
        g.translate((i - (count - 1) / 2) * 0.55 + (random() - 0.5) * 0.2, r * 0.35 + i * 0.12, (random() - 0.5) * 0.4);
        parts.push(paint(g, (x, y, z, nx, ny) => {
            if (snow && ny > 0.5) return '#f4f8fc';
            if (moss && ny > 0.8 && Math.sin(x * 7 + z * 5) > 0) return lerpHex(moss, colors[0], 0.35);
            const band = Math.sin(y * 11 + x * 1.5) * 0.5 + 0.5;
            return lerpHex(lerpHex(colors[0], colors[1], band * 0.55), '#ffffff', ny > 0.75 ? 0.12 : 0);
        }));
    }
    return merge(parts);
}

/** Twigs sticking out of the ground (dry bush, dead twigs in the snow). */
export function twigs(seed, colors = ['#5a4030', '#6e5038']) {
    const random = seeded(seed);
    const parts = [];
    for (let i = 0; i < 6; i++) {
        const len = 0.25 + random() * 0.35;
        const twig = new THREE.CylinderGeometry(0.006, 0.016, len, 3);
        twig.translate(0, len / 2, 0);
        twig.rotateZ((random() - 0.5) * 1.1);
        twig.rotateY(random() * Math.PI * 2);
        parts.push(paint(twig, colors[i % colors.length]));
        const side = new THREE.CylinderGeometry(0.004, 0.008, len * 0.4, 3);
        side.translate(0, len * 0.2, 0);
        side.rotateZ(0.9);
        side.translate(0, len * 0.6, 0);
        side.rotateY(random() * Math.PI * 2);
        parts.push(paint(side, colors[(i + 1) % colors.length]));
    }
    return merge(parts);
}

/** One footprint (two oval pads and toes) flat on the ground; trails are many of them. */
export function footprint(color) {
    const parts = [];
    const sole = new THREE.CircleGeometry(0.07, 10);
    sole.scale(0.75, 1.3, 1);
    sole.rotateX(-Math.PI / 2);
    parts.push(paint(sole, color));
    for (let i = 0; i < 3; i++) {
        const toe = new THREE.CircleGeometry(0.025, 6);
        toe.rotateX(-Math.PI / 2);
        toe.translate((i - 1) * 0.04, 0, 0.12 - Math.abs(i - 1) * 0.015);
        parts.push(paint(toe, color));
    }
    return merge(parts);
}

// ---------------------------------------------------------------- meadow: stumps, logs, dandelions, ferns, a signpost, a burrow, leaves, a stone wall

export function stump(seed) {
    const random = seeded(seed);
    const parts = trunkWithRoots(random, 0.42, 0.26, 0.22, '#7a4f2a', '#5a381c');
    const top = new THREE.CircleGeometry(0.235, 14);
    top.rotateX(-Math.PI / 2);
    top.translate(0, 0.425, 0);
    parts.push(paint(top, (x, y, z) => (Math.sin(Math.hypot(x, z) * 70) > 0.4 ? '#c99a62' : '#e0b67a')));
    const cap = new THREE.SphereGeometry(0.07, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2);
    cap.scale(1, 0.6, 1);
    cap.translate(0.2, 0.25, 0.1);
    parts.push(paint(cap, '#e8a23a'));
    return merge(parts);
}

/** A fallen log with moss on its back and rings at its ends. */
export function log(seed) {
    const random = seeded(seed);
    const parts = [];
    const len = 1.5 + random() * 0.5;
    const body = new THREE.CylinderGeometry(0.17, 0.2, len, 10, 3);
    body.rotateZ(Math.PI / 2);
    body.translate(0, 0.17, 0);
    parts.push(paint(body, (x, y, z, nx, ny) => (ny > 0.65 && Math.sin(x * 6) > -0.5 ? '#5f9a3a' : Math.sin(Math.atan2(z, y - 0.17) * 9 + x * 2) > 0.5 ? '#5e3d22' : '#7a4f2a')));
    for (const s of [-1, 1]) {
        const end = new THREE.CircleGeometry(s < 0 ? 0.2 : 0.17, 12);
        end.rotateY(s * Math.PI / 2);
        end.translate(s * len / 2 + s * 0.002, 0.17, 0);
        parts.push(paint(end, (x, y, z) => (Math.sin(Math.hypot(y - 0.17, z) * 60) > 0.3 ? '#c99a62' : '#e0b67a')));
    }
    const branch = new THREE.CylinderGeometry(0.025, 0.045, 0.45, 5);
    branch.translate(0, 0.22, 0);
    branch.rotateZ(-0.6);
    branch.translate(0.3, 0.25, 0.05);
    parts.push(paint(branch, '#6e4627'));
    return merge(parts);
}

/** Dandelions: yellow flowers and white seed balls on thin stems. */
export function dandelions(seed) {
    const random = seeded(seed);
    const parts = [];
    for (let i = 0; i < 5; i++) {
        const h = 0.22 + random() * 0.2;
        const x = (random() - 0.5) * 0.35, z = (random() - 0.5) * 0.35;
        const stem = new THREE.CylinderGeometry(0.006, 0.009, h, 3);
        stem.translate(x, h / 2, z);
        parts.push(paint(stem, '#5a9a34'));
        const puff = i % 2 === 0;
        const head = new THREE.IcosahedronGeometry(puff ? 0.06 : 0.04, 1);
        if (!puff) head.scale(1, 0.55, 1);
        head.translate(x, h + 0.02, z);
        parts.push(paint(head, (vx, vy, vz, nx, ny) => (puff ? (ny > -0.3 ? '#ffffff' : '#e6e6dc') : ny > 0 ? '#ffd23a' : '#e8a81c')));
    }
    for (let i = 0; i < 4; i++) {
        const leaf = new THREE.ConeGeometry(0.035, 0.26, 3);
        leaf.scale(1, 1, 0.25);
        leaf.translate(0, 0.13, 0);
        leaf.rotateZ(1.15);
        leaf.rotateY((i / 4) * Math.PI * 2 + random());
        parts.push(paint(leaf, '#4f8f2e'));
    }
    return merge(parts);
}

/** A fern: arched fronds from one point. */
export function fern(seed) {
    const random = seeded(seed);
    const parts = [];
    for (let i = 0; i < 7; i++) {
        const len = 0.45 + random() * 0.2;
        const frond = new THREE.PlaneGeometry(0.11, len, 1, 6);
        const p = frond.attributes.position;
        for (let k = 0; k < p.count; k++) {
            const t = (p.getY(k) + len / 2) / len;
            p.setX(k, p.getX(k) * Math.sin(Math.PI * Math.min(1, t * 1.1)) * (1 - t * 0.4));
            p.setZ(k, -t * t * len * 0.55);
        }
        frond.translate(0, len / 2, 0);
        frond.rotateX(-0.25);
        frond.rotateY((i / 7) * Math.PI * 2 + random() * 0.4);
        parts.push(paint(frond, (x, y) => (y > len * 0.6 ? '#7fbf4a' : '#4f9a33')));
    }
    const g = merge(parts);
    const n = g.attributes.normal;
    for (let i = 0; i < n.count; i++) n.setXYZ(i, n.getX(i) * 0.3, 1, n.getZ(i) * 0.3);
    return g;
}

/** A signpost with two boards, one of them shaped like a carrot. */
export function signpost() {
    const parts = [];
    const wood = (x, y) => (Math.sin(y * 50 + x * 8) > 0.6 ? '#8a5a33' : '#a2703f');
    const post = new THREE.BoxGeometry(0.09, 1.25, 0.09);
    post.translate(0, 0.62, 0);
    parts.push(paint(post, wood));
    const board = new THREE.BoxGeometry(0.62, 0.17, 0.04);
    board.translate(0.24, 1.05, 0.06);
    parts.push(paint(board, wood));
    const tip = new THREE.ConeGeometry(0.085, 0.16, 4);
    tip.rotateZ(-Math.PI / 2);
    tip.rotateX(Math.PI / 4);
    tip.translate(0.62, 1.05, 0.06);
    parts.push(paint(tip, wood));
    const carrot = new THREE.ConeGeometry(0.09, 0.6, 7);
    carrot.rotateZ(Math.PI / 2);
    carrot.translate(-0.24, 0.78, 0.06);
    parts.push(paint(carrot, (x) => (Math.sin(x * 60) > 0.7 ? '#d8661a' : '#f07a1c')));
    for (let i = 0; i < 3; i++) {
        const leaf = new THREE.ConeGeometry(0.03, 0.18, 4);
        leaf.rotateZ(-Math.PI / 2 + (i - 1) * 0.5);
        leaf.translate(0.15, 0.78 + (i - 1) * 0.04, 0.06);
        parts.push(paint(leaf, '#4f9e2f'));
    }
    return merge(parts);
}

/** The entrance of a bunny burrow: a dark hole in a ring of dug earth. */
export function burrow() {
    const random = seeded(55);
    const parts = [];
    const hole = new THREE.CircleGeometry(0.3, 16);
    hole.scale(1, 0.75, 1);
    hole.rotateX(-Math.PI / 2);
    hole.translate(0, 0.045, 0.03);
    parts.push(paint(hole, (x, y, z) => (Math.hypot(x, z) < 0.18 ? '#120a05' : '#2a1a0e')));
    const mound = new THREE.TorusGeometry(0.36, 0.13, 6, 16);
    mound.rotateX(Math.PI / 2);
    mound.scale(1, 1, 0.8);
    mound.translate(0, 0.02, 0.02);
    parts.push(paint(jitter(mound, 0.05, random), (x, y, z, nx, ny) => (ny > 0.5 ? '#8a6038' : '#6b4a2f')));
    const back = new THREE.SphereGeometry(0.36, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    back.scale(0.9, 0.38, 0.55);
    back.translate(0, 0, -0.5);
    parts.push(paint(jitter(back, 0.04, random), (x, y, z, nx, ny) => (ny > 0.7 ? '#6fa83c' : '#7a5634')));
    return merge(parts);
}

/** Fallen leaves around the foot of a tree. */
export function fallenLeaves(seed) {
    const random = seeded(seed);
    const parts = [];
    const colors = ['#e0902a', '#c8641e', '#e8c03a', '#9a5a2a', '#7fae3c'];
    for (let i = 0; i < 16; i++) {
        const leaf = new THREE.CircleGeometry(0.05, 5);
        leaf.scale(0.55, 1, 1);
        leaf.rotateX(-Math.PI / 2 + (random() - 0.5) * 0.4);
        leaf.rotateY(random() * Math.PI * 2);
        const a = random() * Math.PI * 2, d = 0.35 + random() * 0.9;
        leaf.translate(Math.cos(a) * d, 0.012 + random() * 0.01, Math.sin(a) * d);
        parts.push(paint(leaf, colors[i % colors.length]));
    }
    return merge(parts);
}

/** A piece of dry stone wall, about two metres long. */
export function stoneWall(seed) {
    const random = seeded(seed);
    const parts = [];
    for (let row = 0; row < 3; row++) {
        let x = -1 + (row % 2) * 0.12;
        while (x < 0.95) {
            const w = 0.22 + random() * 0.14;
            const h = 0.17 - row * 0.02;
            const g = jitter(new THREE.BoxGeometry(w, h, 0.28 - row * 0.03, 1, 1, 1), 0.035, random);
            g.translate(x + w / 2, 0.08 + row * 0.15, (random() - 0.5) * 0.03);
            const tone = ['#9a9286', '#8a8276', '#aaa294', '#7d766c'][Math.floor(random() * 4)];
            parts.push(paint(g, (vx, vy, vz, nx, ny) => (ny > 0.6 && random() < 0.5 ? '#6a9a3a' : tone)));
            x += w + 0.02;
        }
    }
    return merge(parts);
}

// ---------------------------------------------------------------- snow: drifts, an igloo, penguins

export function snowDrift(seed) {
    const random = seeded(seed);
    const parts = [];
    for (let i = 0; i < 3; i++) {
        const r = 0.35 + random() * 0.3;
        parts.push(paint(blob(r, (i - 1) * 0.4, 0, (random() - 0.5) * 0.3, random, { detail: 1, squash: 0.3, lumps: 0.06 }), (x, y, z, nx, ny) => (ny > 0.2 ? '#ffffff' : '#d4e2ee')));
    }
    return merge(parts);
}

export function igloo() {
    const parts = [];
    const dome = new THREE.SphereGeometry(1.0, 18, 9, 0, Math.PI * 2, 0, Math.PI / 2);
    parts.push(paint(dome, (x, y, z) => {
        const ring = Math.abs(Math.sin(y * 9.5)) < 0.12;
        const a = Math.atan2(z, x) * 6 + Math.floor(y * 3) * 0.7;
        return ring || Math.abs(Math.sin(a)) < 0.08 ? '#c9dceb' : '#f6fbff';
    }));
    const tunnel = new THREE.CylinderGeometry(0.42, 0.42, 0.7, 12, 1, true, 0, Math.PI);
    tunnel.rotateX(Math.PI / 2);
    tunnel.rotateZ(Math.PI / 2);
    tunnel.rotateY(Math.PI / 2);
    tunnel.translate(0, 0, 1.0);
    parts.push(paint(tunnel, (x, y, z, nx, ny) => (ny > 0 ? '#f2f8fd' : '#d0e0ec')));
    const door = new THREE.CircleGeometry(0.34, 12, 0, Math.PI);
    door.translate(0, 0, 1.36);
    parts.push(paint(door, '#1d2a3a'));
    return merge(parts);
}

export function penguin() {
    const parts = [];
    const body = new THREE.CapsuleGeometry(0.13, 0.2, 4, 10);
    body.translate(0, 0.25, 0);
    parts.push(paint(body, (x, y, z, nx, ny, nz) => (nz > 0.35 && y < 0.38 ? '#ffffff' : '#1f2430')));
    const head = new THREE.SphereGeometry(0.1, 10, 8);
    head.translate(0, 0.47, 0.01);
    parts.push(paint(head, (x, y, z, nx, ny, nz) => (nz > 0.55 && ny < 0.3 ? '#ffffff' : '#1f2430')));
    const beak = new THREE.ConeGeometry(0.03, 0.09, 5);
    beak.rotateX(Math.PI / 2);
    beak.translate(0, 0.46, 0.12);
    parts.push(paint(beak, '#f29a1c'));
    for (const s of [-1, 1]) {
        const eye = new THREE.SphereGeometry(0.018, 6, 4);
        eye.translate(s * 0.04, 0.5, 0.085);
        parts.push(paint(eye, '#ffffff'));
        const foot = new THREE.SphereGeometry(0.045, 6, 3);
        foot.scale(0.8, 0.3, 1.4);
        foot.translate(s * 0.06, 0.02, 0.05);
        parts.push(paint(foot, '#f29a1c'));
        const wing = new THREE.SphereGeometry(0.07, 6, 4);
        wing.scale(0.3, 1.4, 0.8);
        wing.rotateZ(s * 0.25);
        wing.translate(s * 0.14, 0.27, 0);
        parts.push(paint(wing, '#1f2430'));
    }
    return merge(parts);
}

// ---------------------------------------------------------------- desert: a cattle skull, pots, a dead tree

export function cattleSkull() {
    const parts = [];
    const skull = new THREE.SphereGeometry(0.16, 10, 8);
    skull.scale(0.9, 0.75, 1.3);
    skull.translate(0, 0.1, 0);
    parts.push(paint(skull, '#f3ead8'));
    const snout = new THREE.SphereGeometry(0.09, 8, 6);
    snout.scale(1, 0.75, 1.1);
    snout.translate(0, 0.07, 0.2);
    parts.push(paint(snout, '#ebe0ca'));
    for (const s of [-1, 1]) {
        const eye = new THREE.SphereGeometry(0.035, 6, 4);
        eye.translate(s * 0.07, 0.15, 0.15);
        parts.push(paint(eye, '#2a2018'));
        const horn = new THREE.TorusGeometry(0.14, 0.03, 5, 8, Math.PI * 0.6);
        horn.rotateZ(s > 0 ? -0.3 : Math.PI + 0.3);
        horn.translate(s * 0.13, 0.12, -0.05);
        parts.push(paint(horn, '#e0d2b4'));
    }
    return merge(parts);
}

/** Clay pots: two whole ones and a broken one with shards. */
export function pots(seed) {
    const random = seeded(seed);
    const parts = [];
    const profile = [[0.0, 0], [0.1, 0.0], [0.17, 0.08], [0.19, 0.18], [0.15, 0.3], [0.07, 0.36], [0.08, 0.42]].map(([r, y]) => new THREE.Vector2(r, y));
    for (let i = 0; i < 2; i++) {
        const pot = new THREE.LatheGeometry(profile, 12);
        const k = 0.8 + random() * 0.5;
        pot.scale(k, k, k);
        pot.translate(i * 0.38 - 0.2, 0, (random() - 0.5) * 0.15);
        parts.push(paint(pot, (x, y) => (Math.abs(Math.sin(y * 30)) < 0.15 ? '#7a3a1c' : '#c26a3a')));
    }
    const broken = new THREE.LatheGeometry(profile.slice(0, 4), 10, 0, Math.PI * 1.2);
    broken.rotateX(Math.PI / 2 - 0.2);
    broken.translate(0.15, 0.12, 0.35);
    parts.push(paint(broken, '#b45e32'));
    for (let i = 0; i < 4; i++) {
        const shard = new THREE.CircleGeometry(0.05 + random() * 0.03, 3);
        shard.rotateX(-Math.PI / 2);
        shard.translate((random() - 0.3) * 0.6, 0.01, 0.3 + random() * 0.3);
        parts.push(paint(shard, '#b45e32'));
    }
    return merge(parts);
}

/** A bare, bleached tree with crooked branches. */
export function deadTree(seed) {
    const random = seeded(seed);
    const parts = [];
    const color = '#cdb89a', dark = '#9a8466';
    const branch = (x, y, z, len, radius, tiltZ, rotY, depth) => {
        const g = new THREE.CylinderGeometry(radius * 0.6, radius, len, 6);
        g.translate(0, len / 2, 0);
        g.rotateZ(tiltZ);
        g.rotateY(rotY);
        g.translate(x, y, z);
        parts.push(paint(g, (vx, vy) => (Math.sin(vy * 20) > 0.6 ? dark : color)));
        if (depth <= 0) return;
        const tip = new THREE.Vector3(0, len, 0).applyAxisAngle(new THREE.Vector3(0, 0, 1), tiltZ).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
        for (let i = 0; i < 2; i++) {
            branch(x + tip.x, y + tip.y, z + tip.z, len * (0.55 + random() * 0.2), radius * 0.6, tiltZ + (i ? 0.6 : -0.5) + (random() - 0.5) * 0.3, rotY + random() * 1.5, depth - 1);
        }
    };
    branch(0, 0, 0, 1.2, 0.13, 0.1, 0, 3);
    return merge(parts);
}

// ---------------------------------------------------------------- moon: crater rims, a rover

/** The raised rim of a small crater (the hole itself is the ground). */
export function craterRim(seed) {
    const random = seeded(seed);
    const g = jitter(new THREE.TorusGeometry(0.8, 0.16, 5, 18), 0.08, random);
    g.rotateX(Math.PI / 2);
    g.scale(1, 0.55, 1);
    const parts = [paint(g, (x, y, z, nx, ny) => (ny > 0.4 ? '#c4c4ca' : '#7e7e86'))];
    const floor = new THREE.CircleGeometry(0.78, 16);
    floor.rotateX(-Math.PI / 2);
    floor.translate(0, -0.02, 0);
    parts.push(paint(floor, (x, y, z) => (Math.hypot(x, z) < 0.4 ? '#4e4e57' : '#62626b')));
    return merge(parts);
}

/** A little moon rover of the bunnies: six wheels, a solar panel and a carrot antenna. */
export function rover() {
    const parts = [];
    const body = new THREE.BoxGeometry(1.0, 0.3, 0.6);
    body.translate(0, 0.45, 0);
    parts.push(paint(body, (x, y, z, nx, ny) => (ny > 0.5 ? '#f0c75a' : '#d9a63a')));
    const panel = new THREE.BoxGeometry(0.9, 0.04, 0.75);
    panel.rotateZ(0.12);
    panel.translate(-0.05, 0.72, 0);
    parts.push(paint(panel, (x, y, z) => (Math.sin(x * 30) > 0.85 || Math.sin(z * 30) > 0.85 ? '#9aa6c8' : '#2b3a6e')));
    const strut = new THREE.CylinderGeometry(0.03, 0.03, 0.2, 5);
    strut.translate(0, 0.62, 0);
    parts.push(paint(strut, '#9a9ca6'));
    for (let i = 0; i < 3; i++) {
        for (const s of [-1, 1]) {
            const wheel = new THREE.CylinderGeometry(0.15, 0.15, 0.1, 12);
            wheel.rotateX(Math.PI / 2);
            wheel.translate((i - 1) * 0.38, 0.15, s * 0.36);
            parts.push(paint(wheel, (x, y, z) => (Math.hypot(x - (i - 1) * 0.38, y - 0.15) < 0.07 ? '#b8bac4' : '#3a3a42')));
        }
    }
    const mast = new THREE.CylinderGeometry(0.015, 0.015, 0.5, 4);
    mast.translate(0.4, 0.85, 0.2);
    parts.push(paint(mast, '#c8cad2'));
    const carrot = new THREE.ConeGeometry(0.05, 0.22, 6);
    carrot.rotateX(Math.PI);
    carrot.translate(0.4, 1.15, 0.2);
    parts.push(paint(carrot, '#f07a1c'));
    const leaf = new THREE.ConeGeometry(0.03, 0.1, 4);
    leaf.translate(0.4, 1.3, 0.2);
    parts.push(paint(leaf, '#4f9e2f'));
    const cam = new THREE.BoxGeometry(0.12, 0.1, 0.14);
    cam.translate(0.45, 0.66, -0.15);
    parts.push(paint(cam, '#e6e8ee'));
    const lens = new THREE.CylinderGeometry(0.035, 0.035, 0.03, 8);
    lens.rotateZ(Math.PI / 2);
    lens.translate(0.52, 0.66, -0.15);
    parts.push(paint(lens, '#1d2a44'));
    return merge(parts);
}

// ---------------------------------------------------------------- the windmill of the meadow (the sails are a mesh of their own: they turn)

export const WINDMILL_HUB = new THREE.Vector3(0, 2.75, 0.74);

export function windmillTower() {
    const parts = [];
    const tower = new THREE.CylinderGeometry(0.55, 0.85, 2.6, 8, 3);
    tower.rotateY(Math.PI / 8); // a flat side to the front
    tower.translate(0, 1.3, 0);
    parts.push(paint(tower, (x, y, z, nx, ny) => (y < 0.25 ? '#9a9286' : Math.abs(Math.sin(y * 7)) < 0.05 ? '#e2d8c6' : '#f6efe2')));
    const roof = new THREE.ConeGeometry(0.75, 0.9, 8);
    roof.rotateY(Math.PI / 8);
    roof.translate(0, 3.05, 0);
    parts.push(paint(roof, (x, y, z) => (Math.sin(Math.atan2(z, x) * 8) > 0.6 ? '#9a3a22' : '#b8482a')));
    const door = new THREE.BoxGeometry(0.4, 0.7, 0.06);
    door.translate(0, 0.35, 0.82);
    door.rotateX(-0.11);
    parts.push(paint(door, (x) => (Math.abs(x) < 0.015 ? '#4a2c18' : '#7a4f2a')));
    for (const y of [1.3, 2.05]) {
        const win = new THREE.BoxGeometry(0.22, 0.26, 0.05);
        win.translate(0, y, 0.82 - y * 0.115);
        parts.push(paint(win, (x, wy) => (Math.abs(x) < 0.012 || Math.abs(wy - y) < 0.012 ? '#f6efe2' : '#2a3a54')));
    }
    const hub = new THREE.CylinderGeometry(0.1, 0.12, 0.3, 8);
    hub.rotateX(Math.PI / 2);
    hub.translate(0, 2.75, 0.55);
    parts.push(paint(hub, '#5a3a22'));
    return merge(parts);
}

export function windmillSails() {
    const parts = [];
    for (let i = 0; i < 4; i++) {
        const arm = new THREE.BoxGeometry(0.07, 1.55, 0.05);
        arm.translate(0, 0.85, 0);
        const sail = new THREE.BoxGeometry(0.36, 1.15, 0.02);
        sail.translate(0.2, 1.0, -0.02);
        const pieces = [paint(arm, '#6e4627'), paint(sail, (x, y, z, nx, ny, nz) => (nz > 0.5 ? '#f4ecd8' : '#d8ccb4'))];
        for (let k = 0; k < 5; k++) {
            const bar = new THREE.BoxGeometry(0.4, 0.03, 0.035);
            bar.translate(0.2, 0.47 + k * 0.265, 0.005);
            pieces.push(paint(bar, '#7a4f2a'));
        }
        const edge = new THREE.BoxGeometry(0.03, 1.15, 0.035);
        edge.translate(0.39, 1.0, 0.005);
        pieces.push(paint(edge, '#7a4f2a'));
        const blade = merge(pieces);
        blade.rotateZ((i / 4) * Math.PI * 2);
        parts.push(blade);
    }
    const cap = new THREE.SphereGeometry(0.11, 8, 6);
    parts.push(paint(cap, '#5a3a22'));
    return merge(parts);
}
