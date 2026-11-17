// Houses, cave mouths, the temple and the props of the newer themes (autumn, volcano, jungle). Like models.js: low-poly pieces with vertex
// colours, each merged into one geometry; the origin is where the model stands on the ground, +y up, +z the front (door, mouth).
import * as THREE from 'three';
import { merge, paint, jitter, seeded } from './util.js';
import { blob } from './models.js';

const c = new THREE.Color();
const lerpHex = (a, b, t) => '#' + c.set(a).lerp(new THREE.Color(b), t).getHexString();

/** A box with its bottom at y0. */
function box(w, h, d, x, y0, z, color) {
    const g = new THREE.BoxGeometry(w, h, d);
    g.translate(x, y0 + h / 2, z);
    return paint(g, color);
}

/** A gable roof (a triangular prism along x) with eaves, its ridge at y = top. */
function gable(width, depth, rise, top, color, under = '#4a2c18') {
    const shape = new THREE.Shape();
    shape.moveTo(-depth / 2, 0);
    shape.lineTo(0, rise);
    shape.lineTo(depth / 2, 0);
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: width, bevelEnabled: false });
    g.translate(0, 0, -width / 2);
    g.rotateY(Math.PI / 2);
    g.translate(0, top - rise, 0);
    return paint(g, (x, y, z, nx, ny) => (ny < -0.2 ? under : typeof color === 'function' ? color(x, y, z, nx, ny) : color));
}

/** A glowing window (warm light) with a cross and a frame, on the face z = zFace. */
function windowPane(x, y, zFace, w = 0.36, h = 0.36, frame = '#f2e6cf', glass = '#ffd77a', facing = 1) {
    const parts = [];
    parts.push(box(w + 0.08, h + 0.08, 0.04, x, y - 0.04, zFace + facing * 0.01, frame));
    const pane = new THREE.BoxGeometry(w, h, 0.05);
    pane.translate(x, y + h / 2, zFace + facing * 0.02);
    parts.push(paint(pane, (vx, vy) => (Math.abs(vx - x) < 0.02 || Math.abs(vy - y - h / 2) < 0.02 ? frame : glass)));
    return parts;
}

function door(x, zFace, w = 0.5, h = 0.95, color = '#7a4f2a', facing = 1) {
    const g = new THREE.BoxGeometry(w, h, 0.06);
    g.translate(x, h / 2, zFace + facing * 0.02);
    const knob = new THREE.SphereGeometry(0.035, 6, 4);
    knob.translate(x + w * 0.32, h * 0.48, zFace + facing * 0.06);
    return [paint(g, (vx, vy) => (Math.abs(vx - x) < 0.012 || Math.abs(vy - h * 0.55) < 0.012 ? lerpHex(color, '#000000', 0.35) : color)), paint(knob, '#e8c25a')];
}

// ---------------------------------------------------------------- houses (one per island; the chimney smokes where there is one)

/** Where the smoke leaves the chimney of each house (relative to its origin). */
export const CHIMNEYS = {
    farmhouse: new THREE.Vector3(0.7, 2.75, -0.3),
    cottage: new THREE.Vector3(-0.75, 2.6, -0.25),
    cabin: new THREE.Vector3(0.75, 2.55, -0.2),
    hut: new THREE.Vector3(0.0, 1.95, 0.0),
};

/** The meadow: a white farmhouse with timber frames, a red roof, flower boxes. */
export function farmhouse() {
    const parts = [];
    const W = 2.4, D = 1.8, H = 1.45;
    parts.push(box(W, H, D, 0, 0, 0, '#f6efe0'));
    // the timber frame: posts at the corners and beside the door, beams at the foot, the middle and the top, braces on the sides
    const wood = '#6a3f22';
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) parts.push(box(0.12, H, 0.12, sx * W / 2, 0, sz * D / 2, wood));
    for (const y of [0, H * 0.48, H - 0.1]) {
        for (const sz of [-1, 1]) parts.push(box(W + 0.04, 0.1, 0.06, 0, y, sz * (D / 2 + 0.01), wood));
        for (const sx of [-1, 1]) parts.push(box(0.06, 0.1, D + 0.04, sx * (W / 2 + 0.01), y, 0, wood));
    }
    for (const sx of [-1, 1]) {
        parts.push(box(0.08, H, 0.06, sx * 0.4, 0, D / 2 + 0.01, wood));
        const brace = new THREE.BoxGeometry(0.06, 0.08, D * 0.62);
        brace.rotateX(0.62 * sx);
        brace.translate(sx * (W / 2 + 0.02), H * 0.74, 0);
        parts.push(paint(brace, wood));
    }    parts.push(box(W + 0.12, 0.18, D + 0.12, 0, -0.08, 0, '#8a8276'));
    parts.push(gable(W + 0.4, D + 0.5, 1.05, H + 1.05, (x, y, z) => (Math.sin(y * 18) > 0.75 ? '#8e2f1c' : '#b8452a')));
    parts.push(box(0.26, 0.9, 0.26, CHIMNEYS.farmhouse.x, H + 0.3, CHIMNEYS.farmhouse.z, (x, y) => (Math.sin(y * 20) > 0.8 ? '#6a3a2a' : '#8a4a32')));
    parts.push(...door(0, D / 2));
    for (const x of [-0.8, 0.8]) {
        parts.push(...windowPane(x, 0.55, D / 2));
        parts.push(box(0.46, 0.1, 0.14, x, 0.42, D / 2 + 0.07, '#7a4f2a'));
        for (let i = 0; i < 4; i++) {
            const f = new THREE.SphereGeometry(0.05, 5, 4);
            f.translate(x - 0.15 + i * 0.1, 0.55, D / 2 + 0.09);
            parts.push(paint(f, ['#f25a7a', '#ffd23a', '#ffffff', '#ff8f3a'][i]));
        }
    }
    for (const x of [-0.8, 0.8]) parts.push(...windowPane(x, 0.55, -D / 2, 0.36, 0.36, '#f2e6cf', '#ffd77a', -1));
    parts.push(...windowPane(0, H + 0.25, D / 2 + 0.02, 0.3, 0.3));
    return merge(parts);
}

/** The autumn wood: a crooked wooden cottage with a mossy roof, a lantern and a stack of firewood. */
export function cottage() {
    const parts = [];
    const W = 2.2, D = 1.7, H = 1.35;
    const walls = new THREE.BoxGeometry(W, H, D, 8, 6, 6);
    walls.translate(0, H / 2, 0);
    parts.push(paint(walls, (x, y) => (Math.abs(Math.sin(y * 22)) < 0.18 ? '#5a381c' : Math.sin(x * 3 + y) > 0.6 ? '#9a6a3a' : '#8a5a30')));
    for (const [x, z] of [[-W / 2, -D / 2], [W / 2, -D / 2], [-W / 2, D / 2], [W / 2, D / 2]]) parts.push(box(0.16, H + 0.05, 0.16, x, 0, z, '#5a381c'));
    parts.push(gable(W + 0.5, D + 0.6, 1.0, H + 1.0, (x, y, z, nx, ny) => (Math.sin(x * 5 + z * 4) > 0.3 ? '#5f8a3a' : ny > 0.5 ? '#7a5a3a' : '#6a4a2a')));
    parts.push(box(0.28, 0.85, 0.28, CHIMNEYS.cottage.x, H + 0.35, CHIMNEYS.cottage.z, (x, y) => (Math.sin(y * 16 + x * 9) > 0.7 ? '#6f6a62' : '#8f877a')));
    parts.push(...door(0.35, D / 2, 0.48, 0.92, '#6a3a1e'));
    parts.push(...windowPane(-0.55, 0.55, D / 2, 0.34, 0.34, '#4a2c18', '#ffc860'));
    parts.push(...windowPane(0.5, 0.55, -D / 2, 0.34, 0.34, '#4a2c18', '#ffc860', -1));
    // the lantern beside the door, the firewood at the side
    parts.push(box(0.12, 0.16, 0.12, -0.05, 1.0, D / 2 + 0.12, '#ffcf5a'));
    for (let row = 0; row < 3; row++) {
        for (let i = 0; i < 4 - row; i++) {
            const log = new THREE.CylinderGeometry(0.07, 0.07, 0.6, 7);
            log.rotateX(Math.PI / 2);
            log.translate(W / 2 + 0.2, 0.08 + row * 0.13, -0.5 + i * 0.15 + row * 0.07);
            parts.push(paint(log, (x, y, z, nx, ny, nz) => (Math.abs(nz) > 0.8 ? '#e2b882' : '#6a4426')));
        }
    }
    return merge(parts);
}

/** The snow: a log cabin with snow on the roof and warm light inside. */
export function logCabin() {
    const parts = [];
    const W = 2.3, D = 1.8, H = 1.3;
    for (let i = 0; i < 7; i++) {
        const y = 0.1 + i * 0.18;
        for (const z of [-D / 2, D / 2]) {
            const log = new THREE.CylinderGeometry(0.1, 0.1, W + 0.3, 8);
            log.rotateZ(Math.PI / 2);
            log.translate(0, y, z);
            parts.push(paint(log, (x, vy, vz, nx, ny, nz) => (Math.abs(nx) > 0.8 ? '#d9b07a' : '#7a4f2a')));
        }
        for (const x of [-W / 2, W / 2]) {
            const log = new THREE.CylinderGeometry(0.1, 0.1, D + 0.3, 8);
            log.rotateX(Math.PI / 2);
            log.translate(x, y + 0.09, 0);
            parts.push(paint(log, (vx, vy, vz, nx, ny, nz) => (Math.abs(nz) > 0.8 ? '#d9b07a' : '#6a4426')));
        }
    }
    parts.push(box(W - 0.05, H, D - 0.05, 0, 0, 0, '#5a3a20'));
    parts.push(gable(W + 0.6, D + 0.7, 1.0, H + 1.05, (x, y, z, nx, ny) => (ny > 0.3 ? '#f6fbff' : '#5a3a20'), '#4a2c18'));
    parts.push(box(0.26, 0.8, 0.26, CHIMNEYS.cabin.x, H + 0.35, CHIMNEYS.cabin.z, (x, y) => (y > H + 1.05 ? '#f6fbff' : '#7d766c')));
    parts.push(...door(-0.4, D / 2 + 0.08, 0.5, 0.95, '#6a3a1e'));
    parts.push(...windowPane(0.5, 0.5, D / 2 + 0.08, 0.38, 0.34, '#4a2c18', '#ffc860'));
    // icicles along the eaves
    for (let i = 0; i < 9; i++) {
        const ice = new THREE.ConeGeometry(0.035, 0.18 + (i % 3) * 0.06, 4);
        ice.rotateX(Math.PI);
        ice.translate(-1.2 + i * 0.3, H + 0.04, D / 2 + 0.32);
        parts.push(paint(ice, '#cfe9f7'));
    }
    return merge(parts);
}

/** The desert: an adobe house with round edges, beams sticking out under the flat roof, a blue door. */
export function adobe() {
    const random = seeded(61);
    const parts = [];
    const W = 2.2, D = 1.8, H = 1.6;
    const body = jitter(new THREE.BoxGeometry(W, H, D, 4, 3, 4), 0.05, random);
    body.translate(0, H / 2, 0);
    parts.push(paint(body, (x, y, z, nx, ny) => (ny > 0.7 ? '#c98a55' : Math.sin(x * 4 + y * 7) > 0.85 ? '#c58250' : '#d9a06a')));
    parts.push(box(W + 0.1, 0.14, D + 0.1, 0, H, 0, '#c58250'));
    for (let i = 0; i < 5; i++) {
        const beam = new THREE.CylinderGeometry(0.05, 0.05, 0.5, 6);
        beam.rotateX(Math.PI / 2);
        beam.translate(-0.8 + i * 0.4, H - 0.12, D / 2 + 0.1);
        parts.push(paint(beam, '#6a4426'));
    }
    parts.push(...door(-0.35, D / 2, 0.52, 1.0, '#2f7fc4'));
    parts.push(...windowPane(0.5, 0.75, D / 2, 0.34, 0.34, '#2f7fc4', '#ffcf7a'));
    // a smaller second storey and a ladder
    const top = jitter(new THREE.BoxGeometry(1.0, 0.8, 1.0, 2, 2, 2), 0.04, random);
    top.translate(-0.45, H + 0.4 + 0.07, -0.3);
    parts.push(paint(top, '#d39a62'));
    parts.push(...windowPane(-0.45, H + 0.35, 0.21, 0.26, 0.26, '#2f7fc4', '#ffcf7a'));
    for (const x of [0.62, 0.92]) parts.push(box(0.05, 1.9, 0.05, x, 0, D / 2 + 0.15, '#7a4f2a'));
    for (let i = 0; i < 6; i++) parts.push(box(0.32, 0.04, 0.05, 0.77, 0.2 + i * 0.3, D / 2 + 0.15, '#8a5a30'));
    // chili strings
    for (let i = 0; i < 6; i++) {
        const chili = new THREE.ConeGeometry(0.035, 0.14, 5);
        chili.rotateX(Math.PI);
        chili.translate(-0.75, 1.25 - i * 0.12, D / 2 + 0.06);
        parts.push(paint(chili, '#d62a1c'));
    }
    return merge(parts);
}

/** The moon: a base dome with a ring of windows, an airlock and a solar panel. */
export function moonDome() {
    const parts = [];
    const dome = new THREE.SphereGeometry(1.15, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2);
    parts.push(paint(dome, (x, y, z) => {
        const band = y > 0.32 && y < 0.5;
        const a = Math.atan2(z, x);
        if (band) return Math.abs(Math.sin(a * 6)) < 0.25 ? '#c9ccd6' : '#7fd3ff';
        return Math.abs(Math.sin(a * 8)) < 0.05 || Math.abs(Math.sin(y * 12)) < 0.06 ? '#aeb2bd' : '#e9ecf2';
    }));
    parts.push(box(2.5, 0.14, 2.5, 0, -0.06, 0, '#8a8d96'));
    const lock = new THREE.CylinderGeometry(0.42, 0.42, 0.8, 12);
    lock.rotateX(Math.PI / 2);
    lock.translate(0, 0.42, 1.25);
    parts.push(paint(lock, (x, y, z, nx, ny, nz) => (nz > 0.9 ? '#f29a1c' : '#d6d9e0')));
    parts.push(box(0.4, 0.5, 0.04, 0, 0.18, 1.66, '#3a4458'));
    // the solar panel on a mast
    parts.push(box(0.06, 1.6, 0.06, 1.25, 0, -0.6, '#9aa0aa'));
    const panel = new THREE.BoxGeometry(1.0, 0.04, 0.6, 4, 1, 2);
    panel.rotateX(-0.6);
    panel.translate(1.25, 1.65, -0.6);
    parts.push(paint(panel, (x, y, z) => (Math.abs(Math.sin(x * 12.5)) < 0.12 || Math.abs(Math.sin(z * 10)) < 0.1 ? '#cfd3dc' : '#2a4a9a')));
    const lamp = new THREE.SphereGeometry(0.08, 8, 6);
    lamp.translate(0, 1.18, 0);
    parts.push(paint(lamp, '#ff5a3a'));
    return merge(parts);
}

/** The volcano: a hut of black obsidian blocks with glowing cracks and a bone fence. */
export function obsidianHut() {
    const random = seeded(73);
    const parts = [];
    for (let row = 0; row < 5; row++) {
        const r = 1.0 - row * 0.12;
        const blocks = 10 - row;
        for (let i = 0; i < blocks; i++) {
            const a = (i / blocks) * Math.PI * 2 + row * 0.3;
            if (row < 3 && Math.abs(Math.atan2(Math.sin(a), Math.cos(a)) - Math.PI / 2) < 0.35) continue; // the door opening (front = +z)
            const g = jitter(new THREE.BoxGeometry(0.55 - row * 0.04, 0.34, 0.36), 0.05, random);
            g.rotateY(-a + Math.PI / 2);
            g.translate(Math.cos(a) * r, 0.17 + row * 0.33, Math.sin(a) * r);
            parts.push(paint(g, (x, y, z, nx, ny) => (Math.abs(ny) > 0.7 ? '#3a3540' : random() < 0.08 ? '#ff7a1a' : '#1e1b24')));
        }
    }
    const roof = new THREE.ConeGeometry(0.85, 0.7, 8);
    roof.translate(0, 1.95, 0);
    parts.push(paint(roof, (x, y, z) => (Math.sin(Math.atan2(z, x) * 8) > 0.7 ? '#ff8a2a' : '#2a2630')));
    const glow = new THREE.CircleGeometry(0.32, 10, 0, Math.PI);
    glow.translate(0, 0.02, 0.9);
    parts.push(paint(glow, '#ffb04a'));
    for (let i = 0; i < 5; i++) {
        const bone = new THREE.CylinderGeometry(0.03, 0.03, 0.5, 5);
        bone.translate(-1.4 + i * 0.12, 0.25, 1.1 + i * 0.05);
        parts.push(paint(bone, '#efe6d0'));
        const knob = new THREE.SphereGeometry(0.05, 5, 4);
        knob.translate(-1.4 + i * 0.12, 0.52, 1.1 + i * 0.05);
        parts.push(paint(knob, '#efe6d0'));
    }
    return merge(parts);
}

// ---------------------------------------------------------------- the cave mouth (a rock frame around the notch, a roof over its inner part)

const ROCK = {
    Meadow: ['#9a9286', '#625a50', '#5f9a3a'], Snow: ['#7f8b98', '#4a535e', '#f4f8fc'], Desert: ['#c27a45', '#8a4a2a', null], Moon: ['#7c7d86', '#4a4b53', null],
    Autumn: ['#8f857a', '#5a5048', '#b8742a'], Volcano: ['#4a4450', '#1e1b24', '#6a3a2a'], Jungle: ['#7d8a72', '#48523f', '#3f8a2c'],
};

/** The frame of a cave mouth: boulders left and right and a big lintel stone; the cave runs along +z, width w, its floor at y = 0. */
export function caveFrame(theme, w = 2.4) {
    const random = seeded(91);
    const [rock, dark, top] = ROCK[theme] ?? ROCK.Meadow;
    const parts = [];
    const tint = (x, y, z, nx, ny) => (top && ny > 0.55 && Math.sin(x * 7 + z * 5) > -0.2 ? top : ny < -0.3 ? dark : lerpHex(rock, dark, Math.max(0, Math.sin(x * 3 + y * 5 + z) * 0.4)));
    for (const side of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
            const r = 0.55 + random() * 0.25;
            const g = jitter(new THREE.DodecahedronGeometry(r, 1), 0.2, random);
            g.scale(0.8, 1.1, 0.9);
            g.translate(side * (w / 2 + 0.25 + random() * 0.15), 0.35 + i * 0.75, 0.15 + random() * 0.35);
            parts.push(paint(g, tint));
        }
    }
    const lintel = jitter(new THREE.DodecahedronGeometry(1, 1), 0.25, random);
    lintel.scale(w * 0.75, 0.42, 0.65);
    lintel.translate(0, 2.35, 0.35);
    parts.push(paint(lintel, tint));
    return merge(parts);
}

/** The roof over the inner part of a cave: a lumpy rock slab (it fades out while a bunny is inside, see Vegetation.update). */
export function caveRoof(theme, w = 2.4, length = 3.6) {
    const random = seeded(93);
    const [rock, dark, top] = ROCK[theme] ?? ROCK.Meadow;
    const parts = [];
    for (let i = 0; i < 4; i++) {
        const g = blob(1, 0, 0, 0, random, { detail: 1, lumps: 0.18 });
        g.scale(w * 0.75, 0.55, length / 3.2);
        g.translate((random() - 0.5) * 0.4, 2.55 + random() * 0.2, 1.0 + i * (length / 4));
        parts.push(paint(g, (x, y, z, nx, ny) => (top && ny > 0.4 && Math.sin(x * 6 + z * 4) > 0 ? top : ny < -0.2 ? '#0c0a08' : lerpHex(rock, dark, 0.3 + Math.sin(x * 4 + z * 3) * 0.2))));
    }
    return merge(parts);
}

/** Glowing things inside a cave: blue mushrooms (or crystals on the snow and the moon, embers in the volcano). */
export function caveGlow(theme) {
    const random = seeded(95);
    const parts = [];
    const crystal = theme === 'Snow' || theme === 'Moon';
    const colour = theme === 'Volcano' ? '#ff7a1a' : crystal ? '#9fe8ff' : '#6af0ff';
    for (let i = 0; i < 9; i++) {
        const side = i % 2 ? 1 : -1;
        const x = side * (0.85 + random() * 0.2), z = 0.6 + random() * 2.6, s = 0.6 + random() * 0.7;
        if (crystal || theme === 'Volcano') {
            const g = new THREE.OctahedronGeometry(0.12 * s, 0);
            g.scale(0.6, 2, 0.6);
            g.rotateZ(-side * (0.3 + random() * 0.4));
            g.translate(x, 0.15 * s, z);
            parts.push(paint(g, colour));
        } else {
            const stem = new THREE.CylinderGeometry(0.02 * s, 0.03 * s, 0.14 * s, 5);
            stem.translate(x, 0.07 * s, z);
            parts.push(paint(stem, '#d8f6ff'));
            const cap = new THREE.SphereGeometry(0.08 * s, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2);
            cap.translate(x, 0.13 * s, z);
            parts.push(paint(cap, colour));
        }
    }
    return merge(parts);
}

// ---------------------------------------------------------------- the temple ruins of the jungle (around the terrace; its middle stays free)

export function templePillar(seed) {
    const random = seeded(seed);
    const parts = [];
    const height = 1.2 + random() * 1.3;
    parts.push(box(0.62, 0.22, 0.62, 0, 0, 0, '#8a8670'));
    const drums = Math.ceil(height / 0.42);
    for (let i = 0; i < drums; i++) {
        const g = jitter(new THREE.CylinderGeometry(0.24, 0.26, 0.4, 9), 0.03, random);
        g.rotateY(random());
        g.translate((random() - 0.5) * 0.04, 0.42 + i * 0.41, (random() - 0.5) * 0.04);
        parts.push(paint(g, (x, y, z, nx, ny) => (ny > 0.7 && random() < 0.5 ? '#4f8a32' : Math.abs(Math.sin(Math.atan2(z, x) * 5)) < 0.18 ? '#7a765f' : '#a29d82')));
    }
    if (random() < 0.5) parts.push(box(0.7, 0.2, 0.7, 0, 0.42 + drums * 0.41, 0, '#958f74'));
    // vines down the pillar
    for (let i = 0; i < 6; i++) {
        const leaf = new THREE.SphereGeometry(0.07, 5, 3);
        leaf.scale(1, 0.4, 0.6);
        leaf.translate(Math.cos(i) * 0.26, 0.5 + i * height / 6, Math.sin(i) * 0.26);
        parts.push(paint(leaf, i % 2 ? '#3f8a2c' : '#5fae3c'));
    }
    return merge(parts);
}

export function templeWall(seed) {
    const random = seeded(seed);
    const parts = [];
    for (let row = 0; row < 4; row++) {
        let x = -1.4 + (row % 2) * 0.2;
        const end = 1.4 - row * (0.3 + random() * 0.4); // broken at one end
        while (x < end) {
            const w = 0.4 + random() * 0.2;
            const g = jitter(new THREE.BoxGeometry(w, 0.3, 0.45), 0.03, random);
            g.translate(x + w / 2, 0.15 + row * 0.31, 0);
            const glyph = row === 1 && random() < 0.35;
            parts.push(paint(g, (vx, vy, vz, nx, ny, nz) => (ny > 0.7 && random() < 0.4 ? '#4f8a32' : glyph && Math.abs(nz) > 0.8 ? '#6f6a52' : '#a29d82')));
            x += w + 0.03;
        }
    }
    return merge(parts);
}

/** A big stone bunny head (an idol) with mossy ears. */
export function templeStatue() {
    const random = seeded(97);
    const parts = [];
    parts.push(box(1.0, 0.4, 1.0, 0, 0, 0, '#8a8670'));
    parts.push(box(0.8, 0.25, 0.8, 0, 0.4, 0, '#958f74'));
    const head = jitter(new THREE.SphereGeometry(0.55, 10, 8), 0.04, random);
    head.scale(1, 0.95, 0.9);
    head.translate(0, 1.15, 0);
    parts.push(paint(head, (x, y, z, nx, ny) => (ny > 0.75 ? '#5f9a3a' : '#a29d82')));
    for (const s of [-1, 1]) {
        const ear = jitter(new THREE.CapsuleGeometry(0.13, 0.7, 3, 6), 0.03, random);
        ear.rotateZ(-s * 0.18);
        ear.translate(s * 0.25, 1.95, -0.05);
        parts.push(paint(ear, (x, y, z, nx, ny) => (ny > 0.3 ? '#4f8a32' : '#9a957a')));
        const eye = new THREE.SphereGeometry(0.09, 7, 5);
        eye.translate(s * 0.2, 1.25, 0.45);
        parts.push(paint(eye, '#3ad6ff'));
    }
    const nose = new THREE.SphereGeometry(0.07, 6, 4);
    nose.translate(0, 1.08, 0.5);
    parts.push(paint(nose, '#7a765f'));
    for (const s of [-1, 1]) parts.push(box(0.1, 0.16, 0.05, s * 0.06, 0.82, 0.47, '#d6d0b4'));
    return merge(parts);
}

/** Old paving stones lying in the terrace (flat; drawn just above the ground). */
export function paving(seed) {
    const random = seeded(seed);
    const parts = [];
    for (let i = 0; i < 9; i++) {
        const g = new THREE.BoxGeometry(0.5 + random() * 0.2, 0.05, 0.5 + random() * 0.2);
        g.rotateY((random() - 0.5) * 0.3);
        g.translate((i % 3 - 1) * 0.7 + (random() - 0.5) * 0.1, 0.0, (Math.floor(i / 3) - 1) * 0.7 + (random() - 0.5) * 0.1);
        if (random() < 0.2) continue;
        parts.push(paint(g, random() < 0.25 ? '#7f8a62' : ['#a29d82', '#958f74', '#8a8670'][i % 3]));
    }
    return merge(parts);
}

// ---------------------------------------------------------------- autumn

/** A deciduous tree in autumn colours (orange, red or yellow crown, some leaves already on the ground). */
export function autumnTree(seed, colours) {
    const random = seeded(seed);
    const parts = [];
    const trunk = new THREE.CylinderGeometry(0.12, 0.2, 1.7, 8, 3);
    trunk.translate(0, 0.85, 0);
    parts.push(paint(trunk, (x, y, z) => (Math.sin(Math.atan2(z, x) * 6 + y * 2) > 0.6 ? '#4a2e18' : '#6a4426')));
    for (let i = 0; i < 3; i++) {
        const b = new THREE.CylinderGeometry(0.04, 0.07, 0.8, 5);
        b.translate(0, 0.4, 0);
        b.rotateZ(0.8);
        b.rotateY((i / 3) * Math.PI * 2 + random());
        b.translate(0, 1.3, 0);
        parts.push(paint(b, '#5a381c'));
    }
    const blobs = 8;
    for (let i = 0; i < blobs; i++) {
        const a = (i / blobs) * Math.PI * 2 + random() * 0.4;
        const d = i === 0 ? 0 : 0.6 + random() * 0.3;
        const r = i === 0 ? 0.9 : 0.42 + random() * 0.25;
        const g = blob(r, Math.cos(a) * d, 2.3 + (i === 0 ? 0 : (random() - 0.3) * 0.6), Math.sin(a) * d, random, { lumps: 0.08 });
        const tone = colours[i % colours.length];
        parts.push(paint(g, (x, y, z, nx, ny) => (ny > 0.5 ? lerpHex(tone, '#ffe9a0', 0.25) : ny < -0.3 ? lerpHex(tone, '#3a1a08', 0.45) : tone)));
    }
    return merge(parts);
}

export function pumpkin(seed) {
    const random = seeded(seed);
    const parts = [];
    const s = 0.8 + random() * 0.5;
    const g = new THREE.SphereGeometry(0.22 * s, 14, 8);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
        const a = Math.atan2(p.getZ(i), p.getX(i));
        const k = 1 + Math.cos(a * 8) * 0.07;
        p.setXYZ(i, p.getX(i) * k, p.getY(i) * 0.78, p.getZ(i) * k);
    }
    g.computeVertexNormals();
    g.translate(0, 0.16 * s, 0);
    parts.push(paint(g, (x, y, z) => (Math.cos(Math.atan2(z, x) * 8) < -0.8 ? '#c8561a' : '#f28a24')));
    const stem = new THREE.CylinderGeometry(0.025, 0.035, 0.1, 5);
    stem.rotateZ(0.3);
    stem.translate(0.01, 0.34 * s, 0);
    parts.push(paint(stem, '#5a6a2a'));
    const leaf = new THREE.SphereGeometry(0.08, 5, 3);
    leaf.scale(1, 0.2, 0.6);
    leaf.translate(0.12, 0.3 * s, 0.04);
    parts.push(paint(leaf, '#4f8a2c'));
    return merge(parts);
}

/** A grinning carved pumpkin (it glows a little in its own material). */
export function jackOLantern() {
    const parts = [pumpkin(5)];
    for (const s of [-1, 1]) {
        const eye = new THREE.ConeGeometry(0.045, 0.06, 3);
        eye.rotateX(Math.PI / 2);
        eye.translate(s * 0.07, 0.2, 0.21);
        parts.push(paint(eye, '#ffe36a'));
    }
    const mouth = new THREE.BoxGeometry(0.16, 0.035, 0.03);
    mouth.translate(0, 0.12, 0.215);
    parts.push(paint(mouth, '#ffe36a'));
    return merge(parts);
}

export function scarecrow() {
    const parts = [];
    parts.push(box(0.07, 1.7, 0.07, 0, 0, 0, '#6a4426'));
    parts.push(box(1.1, 0.06, 0.06, 0, 1.15, 0, '#6a4426'));
    const coat = new THREE.CylinderGeometry(0.2, 0.28, 0.6, 8);
    coat.translate(0, 1.0, 0);
    parts.push(paint(coat, (x, y) => (Math.abs(Math.sin(y * 20)) < 0.2 ? '#3a5a8a' : '#4a6fa5')));
    for (const s of [-1, 1]) {
        const sleeve = new THREE.CylinderGeometry(0.07, 0.09, 0.42, 6);
        sleeve.rotateZ(Math.PI / 2);
        sleeve.translate(s * 0.38, 1.15, 0);
        parts.push(paint(sleeve, '#4a6fa5'));
        for (let i = 0; i < 3; i++) {
            const straw = new THREE.ConeGeometry(0.02, 0.16, 3);
            straw.rotateZ(-s * Math.PI / 2 + (i - 1) * 0.4);
            straw.translate(s * 0.64, 1.15, 0);
            parts.push(paint(straw, '#e8c45a'));
        }
    }
    const head = new THREE.SphereGeometry(0.17, 10, 8);
    head.translate(0, 1.5, 0);
    parts.push(paint(head, (x, y, z, nx, ny, nz) => (nz > 0.6 && y < 1.5 && Math.abs(x) < 0.08 ? '#3a2416' : '#e8cf8a')));
    for (const s of [-1, 1]) {
        const eye = new THREE.SphereGeometry(0.025, 5, 4);
        eye.translate(s * 0.06, 1.54, 0.15);
        parts.push(paint(eye, '#1a1410'));
    }
    const brim = new THREE.CylinderGeometry(0.3, 0.3, 0.03, 12);
    brim.translate(0, 1.64, 0);
    parts.push(paint(brim, '#8a6a3a'));
    const hat = new THREE.ConeGeometry(0.17, 0.32, 10);
    hat.rotateZ(0.15);
    hat.translate(0.02, 1.8, 0);
    parts.push(paint(hat, '#8a6a3a'));
    // a crow on the arm
    const crow = new THREE.SphereGeometry(0.07, 7, 5);
    crow.scale(1, 0.9, 1.4);
    crow.translate(0.45, 1.26, 0);
    parts.push(paint(crow, '#1a1a22'));
    const beak = new THREE.ConeGeometry(0.02, 0.06, 4);
    beak.rotateX(Math.PI / 2);
    beak.translate(0.45, 1.28, 0.11);
    parts.push(paint(beak, '#f2a21c'));
    return merge(parts);
}

/** A big brown/red toadstool cluster for the autumn floor. */
export function toadstools(seed) {
    const random = seeded(seed);
    const parts = [];
    for (let i = 0; i < 4; i++) {
        const s = 0.6 + random() * 0.8;
        const x = (random() - 0.5) * 0.5, z = (random() - 0.5) * 0.5;
        const stem = new THREE.CylinderGeometry(0.03 * s, 0.045 * s, 0.22 * s, 6);
        stem.translate(x, 0.11 * s, z);
        parts.push(paint(stem, '#f2ead6'));
        const cap = new THREE.SphereGeometry(0.12 * s, 9, 5, 0, Math.PI * 2, 0, Math.PI / 2);
        cap.scale(1, 0.7, 1);
        cap.translate(x, 0.2 * s, z);
        const red = i % 2 === 0;
        parts.push(paint(cap, (vx, vy, vz, nx, ny) => (red && ny > 0.4 && Math.sin(vx * 60) * Math.sin(vz * 60) > 0.6 ? '#ffffff' : red ? '#d6302a' : '#9a5a2a')));
    }
    return merge(parts);
}

// ---------------------------------------------------------------- volcano

/** Black basalt columns (hexagonal prisms) in a cluster. */
export function basalt(seed) {
    const random = seeded(seed);
    const parts = [];
    for (let i = 0; i < 7; i++) {
        const a = random() * Math.PI * 2, d = i === 0 ? 0 : 0.25 + random() * 0.3;
        const h = 0.4 + random() * 1.3;
        const g = new THREE.CylinderGeometry(0.17, 0.18, h, 6);
        g.translate(Math.cos(a) * d, h / 2, Math.sin(a) * d);
        parts.push(paint(g, (x, y, z, nx, ny) => (ny > 0.7 ? '#5a5260' : i % 3 === 0 ? '#2e2a36' : '#3a3542')));
    }
    return merge(parts);
}

/** A charred, leafless tree with glowing embers in the cracks. */
export function charredTree(seed) {
    const random = seeded(seed);
    const parts = [];
    const trunk = jitter(new THREE.CylinderGeometry(0.08, 0.17, 1.6, 6, 4), 0.03, random);
    trunk.translate(0, 0.8, 0);
    parts.push(paint(trunk, (x, y, z) => (Math.sin(y * 13 + Math.atan2(z, x) * 3) > 0.92 ? '#ff7a1a' : '#1f1a18')));
    for (let i = 0; i < 4; i++) {
        const b = new THREE.CylinderGeometry(0.025, 0.06, 0.7 + random() * 0.4, 5);
        b.translate(0, 0.35, 0);
        b.rotateZ(0.6 + random() * 0.5);
        b.rotateY((i / 4) * Math.PI * 2 + random());
        b.translate(0, 1.0 + random() * 0.5, 0);
        parts.push(paint(b, '#2a2420'));
    }
    return merge(parts);
}

/** A lump of obsidian with sharp shiny faces. */
export function obsidian(seed) {
    const random = seeded(seed);
    const g = jitter(new THREE.OctahedronGeometry(0.5, 0), 0.25, random);
    g.scale(1, 0.8, 0.9);
    g.translate(0, 0.25, 0);
    return paint(g, (x, y, z, nx, ny) => (ny > 0.6 ? '#4a4258' : nx > 0.5 ? '#2a2236' : '#120f18'));
}

// ---------------------------------------------------------------- jungle

/** A tall jungle tree with a wide umbrella crown and lianas hanging down. */
export function jungleTree(seed) {
    const random = seeded(seed);
    const parts = [];
    const height = 3.0 + random() * 0.8;
    const trunk = jitter(new THREE.CylinderGeometry(0.14, 0.26, height, 8, 5), 0.03, random);
    trunk.translate(0, height / 2, 0);
    parts.push(paint(trunk, (x, y, z) => (Math.sin(Math.atan2(z, x) * 5 + y * 4) > 0.7 ? '#4a3a26' : y < 0.6 ? '#3f4a2a' : '#6a5438')));
    for (let i = 0; i < 4; i++) {
        const root = new THREE.ConeGeometry(0.1, 0.8, 4);
        root.rotateZ(Math.PI / 2 - 0.5);
        root.translate(0.32, 0.18, 0);
        root.rotateY((i / 4) * Math.PI * 2);
        parts.push(paint(root, '#4a3a26'));
    }
    const crownY = height + 0.3;
    for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const d = i === 0 ? 0 : 0.9 + random() * 0.4;
        const g = blob(i === 0 ? 1.0 : 0.6, Math.cos(a) * d, crownY + (i === 0 ? 0.25 : random() * 0.2), Math.sin(a) * d, random, { squash: 0.55, lumps: 0.1 });
        parts.push(paint(g, (x, y, z, nx, ny) => (ny > 0.5 ? '#4fae3a' : ny < -0.3 ? '#1f4a1c' : i % 2 ? '#2f7f2a' : '#3a8f30')));
    }
    // lianas: thin hanging strands with leaves
    for (let i = 0; i < 6; i++) {
        const a = random() * Math.PI * 2, d = 0.6 + random() * 0.9;
        const len = 1.2 + random() * 1.4;
        const strand = new THREE.CylinderGeometry(0.012, 0.012, len, 3);
        strand.translate(Math.cos(a) * d, crownY - 0.3 - len / 2, Math.sin(a) * d);
        parts.push(paint(strand, '#3f6a2a'));
        for (let k = 0; k < 4; k++) {
            const leaf = new THREE.SphereGeometry(0.05, 4, 3);
            leaf.scale(1, 0.3, 0.6);
            leaf.translate(Math.cos(a) * d + 0.03, crownY - 0.4 - k * len / 4, Math.sin(a) * d);
            parts.push(paint(leaf, '#4f9e36'));
        }
    }
    return merge(parts);
}

/** A big-leafed jungle plant (like a monstera): wide leaves on long stalks. */
export function bigLeaf(seed) {
    const random = seeded(seed);
    const parts = [];
    for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + random() * 0.4;
        const len = 0.5 + random() * 0.35;
        const stalk = new THREE.CylinderGeometry(0.012, 0.018, len, 4);
        stalk.translate(0, len / 2, 0);
        stalk.rotateZ(0.5);
        stalk.rotateY(a);
        parts.push(paint(stalk, '#3f7a2a'));
        const leaf = new THREE.SphereGeometry(0.24, 8, 4);
        leaf.scale(1, 0.1, 0.5);
        leaf.translate(0.2, 0, 0);
        leaf.rotateZ(0.45 + random() * 0.4); // the big leaves stand up and out, not flat on the ground
        leaf.translate(Math.sin(0.5) * len, Math.cos(0.5) * len, 0);
        leaf.rotateY(a + Math.PI / 2);
        parts.push(paint(leaf, (x, y, z, nx, ny) => (Math.sin(x * 40 + z * 40) > 0.85 ? '#1f5a1c' : ny > 0 ? '#3fa03a' : '#2a7a2a')));
    }
    return merge(parts);
}

export function bamboo(seed) {
    const random = seeded(seed);
    const parts = [];
    for (let i = 0; i < 6; i++) {
        const x = (random() - 0.5) * 0.6, z = (random() - 0.5) * 0.6, h = 1.6 + random() * 1.2;
        const stalk = new THREE.CylinderGeometry(0.035, 0.04, h, 6, Math.round(h * 3));
        stalk.translate(x, h / 2, z);
        parts.push(paint(stalk, (vx, vy) => (Math.abs(Math.sin(vy * 9.4)) < 0.12 ? '#6f8a2a' : '#9ab83a')));
        for (let k = 0; k < 3; k++) {
            const leaf = new THREE.ConeGeometry(0.04, 0.32, 3);
            leaf.scale(1, 1, 0.2);
            leaf.rotateZ(1.2 + random() * 0.6);
            leaf.rotateY(random() * Math.PI * 2);
            leaf.translate(x, h * (0.55 + k * 0.17), z);
            parts.push(paint(leaf, '#5fae3c'));
        }
    }
    return merge(parts);
}

/** A rocky ledge at the pond the waterfall drops from (the water itself is a mesh of its own). Front = +z towards the pond. */
export function waterfallRocks(theme) {
    const random = seeded(99);
    const [rock, dark, top] = ROCK[theme] ?? ROCK.Jungle;
    const parts = [];
    for (let i = 0; i < 9; i++) {
        const r = 0.5 + random() * 0.4;
        const g = jitter(new THREE.DodecahedronGeometry(r, 1), 0.2, random);
        const col = i % 3, row = Math.floor(i / 3);
        g.translate((col - 1) * 0.8 + (random() - 0.5) * 0.2, 0.3 + row * 0.75, -0.3 - row * 0.15 + (col === 1 ? -0.25 : 0));
        parts.push(paint(g, (x, y, z, nx, ny) => (top && ny > 0.5 ? top : ny < -0.3 ? dark : rock)));
    }
    return merge(parts);
}
