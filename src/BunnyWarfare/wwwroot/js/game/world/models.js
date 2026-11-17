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

export function bush(seed, greens = ['#3f8a2c', '#4f9a33', '#5fae3c'], berries = '#d6303a') {
    const random = seeded(seed);
    const parts = [];
    for (let i = 0; i < 5; i++) {
        const r = 0.28 + random() * 0.2;
        const g = jitter(new THREE.IcosahedronGeometry(r, 1), 0.08, random);
        g.translate((random() - 0.5) * 0.55, r * 0.8 + random() * 0.15, (random() - 0.5) * 0.55);
        parts.push(paint(g, (x, y, z, nx, ny) => lerpHex(greens[i % greens.length], '#2c5e20', ny < 0 ? 0.45 : 0)));
    }
    if (berries) {
        for (let i = 0; i < 7; i++) {
            const b = new THREE.SphereGeometry(0.045, 5, 3);
            const a = random() * Math.PI * 2;
            b.translate(Math.cos(a) * 0.42, 0.25 + random() * 0.35, Math.sin(a) * 0.42);
            parts.push(paint(b, berries));
        }
    }
    return merge(parts);
}

export function oak(seed, greens = ['#4f9a33', '#5fae3c', '#3f8a2c', '#6dbb45']) {
    const random = seeded(seed);
    const parts = [];
    const trunk = new THREE.CylinderGeometry(0.13, 0.22, 1.7, 7);
    trunk.translate(0, 0.85, 0);
    parts.push(paint(trunk, (x, y) => (y > 1.2 ? '#6e4627' : '#7a4f2a')));
    // two branches
    for (let i = 0; i < 2; i++) {
        const b = new THREE.CylinderGeometry(0.05, 0.08, 0.8, 5);
        b.translate(0, 0.4, 0);
        b.rotateZ((i ? 1 : -1) * 0.8);
        b.rotateY(random() * 3);
        b.translate(0, 1.2, 0);
        parts.push(paint(b, '#6e4627'));
    }
    const blobs = 5 + Math.floor(random() * 3);
    for (let i = 0; i < blobs; i++) {
        const r = 0.55 + random() * 0.45;
        const s = jitter(new THREE.IcosahedronGeometry(r, 1), 0.12, random);
        s.translate((random() - 0.5) * 1.3, 1.95 + random() * 0.9, (random() - 0.5) * 1.3);
        const tone = greens[i % greens.length];
        parts.push(paint(s, (x, y, z, nx, ny) => lerpHex(tone, ny > 0.5 ? '#9ed36a' : '#2f6a22', ny > 0.5 ? 0.25 : ny < -0.2 ? 0.4 : 0)));
    }
    return merge(parts);
}

export function birch(seed) {
    const random = seeded(seed);
    const parts = [];
    const trunk = new THREE.CylinderGeometry(0.08, 0.12, 2.6, 7, 6);
    trunk.translate(0, 1.3, 0);
    parts.push(paint(trunk, (x, y, z) => {
        const a = Math.atan2(z, x);
        return (Math.sin(y * 9 + a * 2) > 0.55 && Math.sin(a * 3 + y * 2) > -0.2) || Math.sin(y * 23 + a) > 0.93 ? '#2b2a28' : '#f6f1e6';
    }));
    for (let i = 0; i < 4; i++) {
        const r = 0.45 + random() * 0.3;
        const s = jitter(new THREE.IcosahedronGeometry(r, 1), 0.1, random);
        s.scale(0.8, 1.25, 0.8);
        s.translate((random() - 0.5) * 0.7, 2.2 + i * 0.35 + random() * 0.2, (random() - 0.5) * 0.7);
        parts.push(paint(s, (x, y, z, nx, ny) => (ny > 0.4 ? '#b5d86a' : ny < -0.2 ? '#5f8f2e' : '#8cc152')));
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
