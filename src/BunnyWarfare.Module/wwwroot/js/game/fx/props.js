// Props: the weapons in the paws of a bunny, the projectiles in flight, the carrot to munch, the gravestone and the little ghost.
// Weapons look along +z (held at the chest); projectiles fly along their local +y (the caller orients them).
import * as THREE from 'three';
import { paint, merge, sphere, fluffySphere } from './shapes.js';

// ---------------------------------------------------------------- colours
export const PALETTE = {
    carrot: '#f07a1a', carrotDark: '#c9550c', carrotLight: '#ffa04a',
    leaf: '#4f9e2f', leafDark: '#2f6e1c', leafLight: '#86c84a',
    beet: '#8a1f5e', beetDark: '#5a103c', beetLight: '#c0457f',
    cabbage: '#9fd06a', cabbageDark: '#5f9e35', cabbageLight: '#d6f0a8',
    olive: '#5d6b3a', oliveDark: '#3e4826', wood: '#8a5a2b', woodDark: '#5e3b1a', metal: '#7d8790', metalDark: '#4a525a',
    stone: '#9a9da3', stoneDark: '#6f727a', dirt: '#6b4a2f', grass: '#5aa83a',
    white: '#ffffff', black: '#1b1410', red: '#e23b3b', yellow: '#ffd23a',
};

/** A vertex-coloured standard material (shared). */
export const propMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.02 });
const glossyMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.05 });

function mesh(geometry, material = propMaterial) {
    const m = new THREE.Mesh(geometry, material);
    m.castShadow = true;
    return m;
}

// ---------------------------------------------------------------- parts

/** A carrot along +y: the tip at +len/2, the leaves at -len/2; ridges and a colour that darkens in the grooves. */
export function carrotGeometry(len = 0.5, radius = 0.1, leaves = 4) {
    const profile = [];
    const steps = 14;
    for (let i = 0; i <= steps; i++) {
        const t = i / steps; // 0 tip .. 1 top
        const groove = i > 1 && i < steps && i % 3 === 0 ? 0.88 : 1;
        const r = Math.max(0.004, radius * Math.pow(t, 0.62) * groove * (t > 0.92 ? 1 - (t - 0.92) * 3 : 1));
        profile.push(new THREE.Vector2(r, len / 2 - t * len));
    }
    profile.push(new THREE.Vector2(0.001, -len / 2));
    // a lathe profile must go upwards (ascending y), else the faces and normals point inwards
    profile.reverse();
    const body = new THREE.LatheGeometry(profile, 12);
    paint(body, (x, y) => {
        const t = (len / 2 - y) / len;
        const ring = Math.abs(Math.sin(t * 34)) > 0.93 ? PALETTE.carrotDark : t < 0.12 ? PALETTE.carrotLight : PALETTE.carrot;
        return ring;
    });
    const parts = [body];
    for (let i = 0; i < leaves; i++) {
        // a flat cone growing out of the top (away from the tip), splayed outwards
        const h = len * 0.55;
        const leaf = new THREE.ConeGeometry(radius * 0.38, h, 5);
        leaf.scale(1, 1, 0.35);
        leaf.translate(0, h / 2, 0);
        leaf.rotateX(Math.PI);
        leaf.rotateZ(0.32 + (i % 2) * 0.12);
        leaf.rotateY((i / leaves) * Math.PI * 2);
        leaf.translate(0, -len / 2 + 0.02, 0);
        paint(leaf, (x, y) => (y < -len / 2 - h * 0.6 ? PALETTE.leafLight : PALETTE.leaf));
        parts.push(leaf);
    }
    return merge(parts);
}

/** A beet: a purple bulb with a little root and leaves, along +y (root at +y). */
function beetGeometry(r = 0.15) {
    const bulb = fluffySphere(r, 0.04, 3, 16, 12);
    bulb.scale(1, 1.08, 1);
    paint(bulb, (x, y) => (y > r * 0.6 ? PALETTE.beetLight : y < -r * 0.7 ? PALETTE.beetDark : PALETTE.beet));
    const root = new THREE.ConeGeometry(r * 0.22, r * 1.1, 6);
    root.translate(0, r * 1.45, 0);
    paint(root, PALETTE.beet);
    const parts = [bulb, root];
    for (let i = 0; i < 3; i++) {
        const stem = new THREE.CylinderGeometry(r * 0.06, r * 0.08, r * 0.9, 5);
        stem.translate(0, -r * 1.3, 0);
        stem.rotateZ((i - 1) * 0.45);
        paint(stem, PALETTE.beetLight);
        const leaf = sphere(r * 0.45, 8, 6);
        leaf.scale(0.55, 1.2, 0.18);
        leaf.translate(0, -r * 2, 0);
        leaf.rotateZ((i - 1) * 0.5);
        paint(leaf, PALETTE.leaf);
        parts.push(stem, leaf);
    }
    return merge(parts);
}

/** A cabbage: layers of leaves around a pale heart. */
function cabbageGeometry(r = 0.17) {
    const parts = [];
    const heart = fluffySphere(r * 0.72, 0.08, 9, 14, 10);
    paint(heart, PALETTE.cabbageLight);
    parts.push(heart);
    for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        const leaf = new THREE.SphereGeometry(r, 10, 8, 0, Math.PI * 0.95, 0, Math.PI * 0.8);
        leaf.rotateY(a);
        leaf.rotateX(0.3 * Math.sin(a * 2));
        paint(leaf, (x, y) => (Math.abs(x * 31 + z0(x, y)) % 1 < 0.08 ? PALETTE.cabbageLight : y > r * 0.3 ? PALETTE.cabbage : PALETTE.cabbageDark));
        parts.push(leaf);
    }
    return merge(parts);
}

function z0(x, y) {
    return y * 17;
}

/** A curled cabbage leaf (the bomblets). */
function leafBombletGeometry(r = 0.1) {
    const shell = new THREE.SphereGeometry(r, 9, 7, 0, Math.PI * 1.3, 0, Math.PI * 0.75);
    shell.scale(1, 0.8, 1);
    paint(shell, (x, y) => (y > 0 ? PALETTE.cabbage : PALETTE.cabbageDark));
    const core = sphere(r * 0.55, 8, 6);
    paint(core, PALETTE.cabbageLight);
    const vein = new THREE.CylinderGeometry(r * 0.06, r * 0.06, r * 1.8, 4);
    vein.rotateZ(Math.PI / 2);
    paint(vein, PALETTE.cabbageLight);
    return merge([shell, core, vein]);
}

/** Fins for the falling carrot of the airstrike. */
function finGeometry(len) {
    const parts = [];
    for (let i = 0; i < 3; i++) {
        const fin = new THREE.BoxGeometry(0.014, len * 0.18, len * 0.1);
        fin.translate(0, -len * 0.3, len * 0.15);
        fin.rotateY((i / 3) * Math.PI * 2 + 0.5);
        paint(fin, PALETTE.carrotDark);
        parts.push(fin);
    }
    return merge(parts);
}

/** A small parachute (dome + strings) behind a falling carrot: at -y. */
function parachuteGeometry() {
    const dome = new THREE.SphereGeometry(0.42, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.42);
    dome.rotateX(Math.PI); // open towards +y (the carrot)
    dome.translate(0, -0.95, 0);
    paint(dome, (x, y, z) => (Math.floor((Math.atan2(z, x) + Math.PI) / (Math.PI / 4)) % 2 ? '#ffffff' : '#e23b3b'));
    const parts = [dome];
    for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const s = new THREE.CylinderGeometry(0.005, 0.005, 0.75, 3);
        const from = new THREE.Vector3(Math.cos(a) * 0.4, -0.78, Math.sin(a) * 0.4);
        const to = new THREE.Vector3(0, -0.28, 0);
        const mid = from.clone().add(to).multiplyScalar(0.5);
        const dir = to.clone().sub(from).normalize();
        s.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir));
        s.translate(mid.x, mid.y, mid.z);
        paint(s, '#f3efe6');
        parts.push(s);
    }
    return merge(parts);
}

const cache = new Map();
function cached(key, make) {
    if (!cache.has(key)) cache.set(key, make());
    return cache.get(key);
}

// ---------------------------------------------------------------- projectiles

/**
 * A projectile model; its local +y axis is the direction of flight (oriented by the caller). The returned group carries
 * userData.spin (radians per second around the flight axis) and userData.wobble (tumbling of round things).
 */
export function projectileModel(look) {
    const g = new THREE.Group();
    switch (look) {
        case 'beet': {
            const m = mesh(cached('beet', () => beetGeometry(0.16)), glossyMaterial);
            g.add(m);
            g.userData.wobble = 9;
            break;
        }
        case 'cabbage': {
            g.add(mesh(cached('cabbage', () => cabbageGeometry(0.2))));
            g.userData.wobble = 5;
            break;
        }
        case 'leaf': {
            g.add(mesh(cached('leaf', () => leafBombletGeometry(0.11))));
            g.userData.wobble = 14;
            break;
        }
        case 'carrot-drop': {
            g.add(mesh(cached('carrot-big', () => carrotGeometry(0.85, 0.16, 5))));
            g.add(mesh(cached('fins', () => finGeometry(0.85))));
            g.add(mesh(cached('chute', () => parachuteGeometry())));
            g.userData.spin = 2.5;
            break;
        }
        default: // carrot: tip forward, it spins like a rocket
            g.add(mesh(cached('carrot', () => carrotGeometry(0.58, 0.11, 4))));
            g.userData.spin = 14;
            break;
    }
    return g;
}

// ---------------------------------------------------------------- weapons in the paws

/** The carrot bazooka: an olive tube on the shoulder with a carrot rocket peeking out. Along +z. */
function bazookaGeometry() {
    const parts = [];
    const tube = new THREE.CylinderGeometry(0.075, 0.075, 0.82, 14, 1);
    tube.rotateX(Math.PI / 2);
    paint(tube, (x, y, z) => (Math.abs(z) > 0.3 && Math.abs(z) < 0.34 ? PALETTE.oliveDark : Math.abs(z + 0.05) < 0.03 ? PALETTE.oliveDark : PALETTE.olive));
    parts.push(tube);
    const bell = new THREE.CylinderGeometry(0.1, 0.075, 0.12, 14, 1, true);
    bell.rotateX(-Math.PI / 2);
    bell.translate(0, 0, -0.46);
    paint(bell, PALETTE.oliveDark);
    parts.push(bell);
    const rim = new THREE.TorusGeometry(0.078, 0.014, 6, 16);
    rim.translate(0, 0, 0.41);
    paint(rim, PALETTE.oliveDark);
    parts.push(rim);
    const rocket = carrotGeometry(0.3, 0.06, 0);
    rocket.rotateX(Math.PI / 2);
    rocket.translate(0, 0, 0.5);
    parts.push(rocket);
    const grip = new THREE.BoxGeometry(0.04, 0.13, 0.05);
    grip.translate(0, -0.12, 0.06);
    paint(grip, PALETTE.woodDark);
    const grip2 = grip.clone().translate(0, 0, -0.2);
    const scope = new THREE.CylinderGeometry(0.025, 0.025, 0.2, 8);
    scope.rotateX(Math.PI / 2);
    scope.translate(0.06, 0.09, 0.02);
    paint(scope, PALETTE.metalDark);
    const lens = new THREE.CylinderGeometry(0.02, 0.02, 0.01, 8);
    lens.rotateX(Math.PI / 2);
    lens.translate(0.06, 0.09, 0.125);
    paint(lens, '#8fd3ff');
    parts.push(grip, grip2, scope, lens);
    // a leaf sticker for luck
    const sticker = sphere(0.035, 6, 4);
    sticker.scale(1, 0.4, 1.8);
    sticker.translate(-0.075, 0.02, -0.15);
    paint(sticker, PALETTE.leaf);
    parts.push(sticker);
    return merge(parts);
}

/** The dandelion shotgun: a wooden stock, two barrels and a puffball at the muzzle. Along +z. */
function shotgunGeometry() {
    const parts = [];
    const stock = new THREE.BoxGeometry(0.07, 0.11, 0.32);
    stock.translate(0, -0.03, -0.18);
    paint(stock, (x, y) => (y < -0.06 ? PALETTE.woodDark : PALETTE.wood));
    parts.push(stock);
    for (const s of [-1, 1]) {
        const barrel = new THREE.CylinderGeometry(0.03, 0.03, 0.55, 8);
        barrel.rotateX(Math.PI / 2);
        barrel.translate(s * 0.032, 0.02, 0.22);
        paint(barrel, PALETTE.metal);
        parts.push(barrel);
    }
    const band = new THREE.BoxGeometry(0.08, 0.06, 0.04);
    band.translate(0, 0.01, 0.05);
    paint(band, PALETTE.metalDark);
    parts.push(band);
    // the dandelion: a white puff with seeds and a yellow heart
    const puff = new THREE.IcosahedronGeometry(0.09, 1);
    puff.translate(0, 0.03, 0.55);
    paint(puff, (x, y, z) => ((x * 41 + y * 37) % 1 > 0.6 ? '#f2f0e6' : '#ffffff'));
    const heart = sphere(0.035, 8, 6);
    heart.translate(0, 0.03, 0.52);
    paint(heart, PALETTE.yellow);
    parts.push(puff, heart);
    return merge(parts);
}

/** The radio of the airstrike (with a blinking light, the antenna up). */
function radioGeometry() {
    const parts = [];
    const box = new THREE.BoxGeometry(0.1, 0.17, 0.06);
    paint(box, (x, y) => (y > 0.05 ? PALETTE.oliveDark : PALETTE.olive));
    const grille = new THREE.BoxGeometry(0.07, 0.05, 0.005);
    grille.translate(0, -0.03, 0.032);
    paint(grille, PALETTE.black);
    const antenna = new THREE.CylinderGeometry(0.006, 0.008, 0.22, 4);
    antenna.translate(0.03, 0.19, 0);
    paint(antenna, PALETTE.metalDark);
    const knob = sphere(0.014, 6, 4);
    knob.translate(0.03, 0.3, 0);
    paint(knob, PALETTE.red);
    const light = sphere(0.012, 6, 4);
    light.translate(-0.025, 0.06, 0.032);
    paint(light, PALETTE.red);
    parts.push(box, grille, antenna, knob, light);
    return merge(parts);
}

/** The Hasenloch: a digging shovel with a wooden handle and a carrot-orange blade (the bunny digs in and pops out elsewhere). Along +z. */
function shovelGeometry() {
    const parts = [];
    const handle = new THREE.CylinderGeometry(0.022, 0.026, 0.62, 8);
    handle.rotateX(Math.PI / 2);
    handle.translate(0, 0, 0.02);
    paint(handle, PALETTE.wood);
    parts.push(handle);
    const grip = new THREE.TorusGeometry(0.055, 0.016, 6, 12);
    grip.translate(0, 0, -0.33);
    paint(grip, PALETTE.woodDark);
    parts.push(grip);
    // the blade: a rounded, slightly cupped carrot shape
    const blade = new THREE.SphereGeometry(0.12, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.6);
    blade.scale(1, 0.35, 1.5);
    blade.rotateX(Math.PI / 2);
    blade.translate(0, 0, 0.42);
    paint(blade, (x, y, z) => (z > 0.52 ? '#e8590c' : '#f97316'));
    parts.push(blade);
    const collar = new THREE.CylinderGeometry(0.035, 0.03, 0.06, 8);
    collar.rotateX(Math.PI / 2);
    collar.translate(0, 0, 0.32);
    paint(collar, PALETTE.metal);
    parts.push(collar);
    for (const s of [-1, 0, 1]) {
        const leaf = sphere(0.03, 6, 4);
        leaf.scale(0.5, 0.3, 1.8);
        leaf.rotateY(s * 0.5);
        leaf.translate(s * 0.03, 0.02, -0.38);
        paint(leaf, PALETTE.leaf);
        parts.push(leaf);
    }
    return merge(parts);
}

/** The model of a weapon kind in the paws (a group, origin = between the paws, looking along +z). */
export function weaponModel(kind) {
    const g = new THREE.Group();
    switch (kind) {
        case 'Grenade': {
            const m = mesh(cached('beet-hand', () => beetGeometry(0.11)), glossyMaterial);
            m.position.set(0.17, 0.02, 0.05);
            m.rotation.x = Math.PI; // leaves up
            g.add(m);
            break;
        }
        case 'Cluster': {
            const m = mesh(cached('cabbage-hand', () => cabbageGeometry(0.13)));
            m.position.set(0, 0.02, 0.1);
            g.add(m);
            break;
        }
        case 'Hitscan': {
            const m = mesh(cached('shotgun', shotgunGeometry));
            m.position.set(0.08, 0.04, 0.2);
            g.add(m);
            break;
        }
        case 'Airstrike': {
            const m = mesh(cached('radio', radioGeometry));
            m.position.set(0.4, 0.15, -0.06); // in the raised paw, next to the big head
            m.rotation.z = -0.25;
            g.add(m);
            break;
        }
        case 'Teleport': {
            const m = mesh(cached('shovel', shovelGeometry));
            m.position.set(0.1, 0.0, 0.12);
            m.rotation.x = 0.35; // the blade down, ready to dig
            g.add(m);
            break;
        }
        default: { // Projectile: the bazooka on the right shoulder
            const m = mesh(cached('bazooka', bazookaGeometry));
            m.position.set(0.17, 0.17, 0.08);
            g.add(m);
            break;
        }
    }
    g.userData.kind = kind;
    return g;
}

/** A carrot to munch (menu): along +y, the tip down. */
export function snackModel() {
    const m = mesh(cached('snack', () => carrotGeometry(0.26, 0.05, 3)));
    m.rotation.x = Math.PI;
    return m;
}

// ---------------------------------------------------------------- after death

/** The gravestone: a rounded stone with a carved carrot, a small mound of earth, flowers and grass. */
export function gravestoneGeometry() {
    return cached('grave', () => {
        const parts = [];
        const mound = sphere(0.42, 14, 6);
        mound.scale(1, 0.22, 0.75);
        mound.translate(0, 0.0, 0.18);
        paint(mound, (x, y, z) => (y > 0.06 ? '#7b5a3a' : PALETTE.dirt));
        parts.push(mound);
        const slab = new THREE.BoxGeometry(0.46, 0.5, 0.13, 3, 3, 1);
        slab.translate(0, 0.3, 0);
        // the round top: half a disc (theta from 90° to 270° ends up above after turning the axis to z)
        const top = new THREE.CylinderGeometry(0.23, 0.23, 0.13, 16, 1, false, Math.PI / 2, Math.PI);
        top.rotateX(Math.PI / 2);
        top.translate(0, 0.55, 0);
        const stoneColor = (x, y, z) => {
            const n = Math.sin(x * 37 + y * 23) * Math.cos(z * 41 + y * 17);
            return n > 0.55 ? PALETTE.stoneDark : n < -0.7 ? '#b4b7bd' : PALETTE.stone;
        };
        paint(slab, stoneColor);
        paint(top, stoneColor);
        parts.push(slab, top);
        // two stone bunny ears on top (one bent)
        for (const s of [-1, 1]) {
            const ear = new THREE.CapsuleGeometry(0.05, 0.16, 3, 8);
            ear.scale(1, 1, 0.55);
            ear.translate(0, 0.1, 0);
            if (s > 0) {
                ear.rotateZ(-0.9);
                ear.translate(0.02, 0.06, 0);
            }
            ear.rotateZ(-s * 0.18);
            ear.translate(s * 0.1, 0.72, 0);
            paint(ear, stoneColor);
            parts.push(ear);
        }
        // the carved carrot on the front
        const carved = carrotGeometry(0.34, 0.07, 3);
        carved.scale(1, 1, 0.45);
        carved.rotateZ(0.5);
        carved.translate(0.01, 0.45, 0.075);
        parts.push(carved);
        // flowers at the foot
        const colors = ['#ff6fa5', '#ffd23a', '#8fb6ff', '#ffffff'];
        const spots = [[-0.28, 0.32], [0.3, 0.26], [-0.12, 0.42], [0.16, 0.45], [0.36, 0.05]];
        spots.forEach(([x, z], i) => {
            const stem = new THREE.CylinderGeometry(0.008, 0.008, 0.16, 4);
            stem.translate(x, 0.1, z);
            paint(stem, PALETTE.leafDark);
            parts.push(stem);
            for (let p = 0; p < 5; p++) {
                const a = (p / 5) * Math.PI * 2;
                const petal = sphere(0.03, 6, 4);
                petal.scale(1, 0.4, 1);
                petal.translate(x + Math.cos(a) * 0.035, 0.19, z + Math.sin(a) * 0.035);
                paint(petal, colors[i % colors.length]);
                parts.push(petal);
            }
            const heart = sphere(0.02, 6, 4);
            heart.translate(x, 0.2, z);
            paint(heart, i % 4 === 1 ? '#ff8a1c' : PALETTE.yellow);
            parts.push(heart);
        });
        // grass tufts
        for (let i = 0; i < 9; i++) {
            const a = (i / 9) * Math.PI * 2;
            const blade = new THREE.ConeGeometry(0.018, 0.14, 3);
            blade.rotateZ(Math.cos(a) * 0.4);
            blade.translate(Math.cos(a) * 0.36, 0.06, 0.12 + Math.sin(a) * 0.26);
            paint(blade, i % 2 ? PALETTE.grass : PALETTE.leafDark);
            parts.push(blade);
        }
        return merge(parts);
    });
}

export function gravestoneModel() {
    const m = mesh(gravestoneGeometry());
    m.receiveShadow = true;
    return m;
}

const ghostMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75, depthWrite: false });
const haloMaterial = new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.95, depthWrite: false });

/** A little ghost that rises from a bunny that was knocked out (a bunny head with ears, a wavy tail and a halo). */
export function ghostModel() {
    const g = new THREE.Group();
    const body = cached('ghost', () => {
        const head = sphere(0.2, 14, 10);
        const tail = new THREE.ConeGeometry(0.17, 0.4, 12, 1, true);
        tail.rotateX(Math.PI);
        tail.translate(0, -0.25, 0);
        const ears = [-1, 1].map(s => {
            const ear = new THREE.CapsuleGeometry(0.045, 0.22, 3, 6);
            ear.rotateZ(-s * 0.2);
            ear.translate(s * 0.08, 0.28, 0);
            return ear;
        });
        const merged = merge([head, tail, ...ears]);
        merged.deleteAttribute('color');
        return merged;
    });
    const ghost = new THREE.Mesh(body, ghostMaterial.clone());
    const eyes = new THREE.Mesh(cached('ghost-eyes', () => {
        const e = [-1, 1].map(s => {
            const eye = sphere(0.028, 6, 4);
            eye.scale(1, 1.3, 0.5);
            eye.translate(s * 0.07, 0.03, 0.18);
            return eye;
        });
        const merged = merge(e);
        merged.deleteAttribute('color');
        return merged;
    }), new THREE.MeshBasicMaterial({ color: 0x2a2a3a, transparent: true, opacity: 0.8 }));
    const halo = new THREE.Mesh(cached('halo', () => new THREE.TorusGeometry(0.13, 0.022, 6, 18)), haloMaterial.clone());
    halo.rotation.x = Math.PI / 2;
    halo.position.y = 0.48;
    // two little flapping wings (the bunny flaps them: userData.wings, each with userData.side)
    const wingGeometry = cached('ghost-wing', () => {
        const wing = sphere(0.1, 10, 6);
        wing.scale(1.25, 0.75, 0.22);
        wing.translate(0.12, 0.02, 0);
        wing.rotateZ(0.35);
        const merged = merge([wing]);
        merged.deleteAttribute('color');
        return merged;
    });
    const wings = [-1, 1].map(s => {
        const pivot = new THREE.Group();
        pivot.position.set(s * 0.12, -0.02, -0.1);
        pivot.scale.x = s;
        pivot.userData.side = s;
        pivot.add(new THREE.Mesh(wingGeometry, ghost.material));
        return pivot;
    });
    g.add(ghost, eyes, halo, ...wings);
    g.userData.materials = [ghost.material, eyes.material, halo.material];
    g.userData.wings = wings;
    return g;
}
