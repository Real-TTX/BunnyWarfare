// The bunnies: chubby cartoon bunnies from primitives (a big head with googly eyes, eyebrows and a buck-tooth mouth, big feet),
// procedural animations with faces, idle fidgets and slapstick (dizzy stars, soot, a helmet that pops off, plasters), speech bubbles,
// a label with name and health, the marker of the turn, the gravestone and the little ghost of a knocked-out bunny.
//
// Public API (used by world.js, main.js, playback.js, match.js and the menu):
//   new Bunny(dto, team)            dto = BunnyDto ({ id, team, name, x, y, z, yaw, health, maxHealth }), team = TeamDto ({ color, fur, outfit, face })
//                                   fur / outfit / face are keys of Business/Cosmetics.cs (fx/furs.js, fx/outfits.js); missing: a classic fur by id, the helmet
//   setLook({ fur, outfit, face, color })   dresses the bunny anew (the wardrobe preview, portraits); .look is what it wears
//   .root .position .goal .yaw .goalYaw .moving .alive .grave .color .id .team .name
//   setHealth(health)               the label's bar animates to it (low health shows plasters)
//   snap(x, y, z, yaw?)             puts the bunny there at once
//   walkTo(x, y, z, yaw)            walks smoothly (hops) to a position
//   die(animate = true)             falls over, a ghost rises, the gravestone grows (animate = false: just the gravestone)
//   sink()                          drowned: sinks with bubbles, no gravestone
//   setAim(points)                  the aim pose for a while (null ends it), the weapon tilts with the line; the line itself is AimGuide (aim.js)
//   update(dt, time) sync() dispose()
//   play(name)                      'idle' | 'walk' | 'aim' | 'cheer' | 'dance' | 'wave' | 'eat' (loops) · 'fire' | 'hurt' (once, then back)
//                                   'hurt' also brings the slapstick: soot, dizzy stars, maybe the helmet pops off; idle bunnies fidget by themselves
//   setWeapon(kind | null)          holds a weapon: 'Projectile' (carrot bazooka), 'Grenade' (beet), 'Cluster' (cabbage), 'Hitscan' (dandelion shotgun),
//                                   'Airstrike' (radio); null puts it away (it still shows while aiming)
//   setAimPitch(rad)                tilts the weapon and the arms (setAim does it from the line by itself)
//   lookAt(x, z)                    turns the bunny towards a point
//   hurt(amount?)                   flinch, a red flash and the slapstick of 'hurt', stronger for big hits (the playback calls it on damage)
//   setFlight(vx, vy, vz) / land()  tumbling through the air along a knockback track (screaming), the landing squash
//   say(text, seconds = 2.2)        a cartoon speech bubble above the head (replaces the one shown); the bunny also quips by itself
//                                   now and then when it is hit, flies, fires, sneezes or is knocked out
//   attachFx(particles)             where the dust of the hops and the bubbles go (default: the Particles created last)
//   showLabel(visible)              the name and health above the head (the menu hides them)
// TurnMarker: new TurnMarker() · .mesh · attach(bunny | null) · update(dt)
import * as THREE from 'three';
import { paint, merge, sphere, fluffySphere, limb, softRing } from './fx/shapes.js';
import { weaponModel, snackModel, gravestoneModel, ghostModel } from './fx/props.js';
import { furOf, CLASSIC_FURS, dressFur, tickFurs } from './fx/furs.js';
import { outfitParts, faceParts, laserPupilMaterial, laserBeamMaterial, laserGeometry } from './fx/outfits.js';
import { activeParticles } from './effects.js';

// ---------------------------------------------------------------- looks

const C = { nose: '#ff6f8e', teeth: '#ffffff', whisker: '#3b302a', blush: '#ff8fa6', pad: '#f6a7b5', pack: '#7b6a3c', packDark: '#544826', strap: '#3e4826' };

// the face in head space (origin at the centre of the head, the face looks along +z)
const HEAD_R = 0.33;
const EYE_X = 0.112, EYE_Y = 0.035, EYE_Z = 0.272;
const BROW_Y = 0.168;

const geometryCache = new Map();
function cached(key, make) {
    if (!geometryCache.has(key)) geometryCache.set(key, make());
    return geometryCache.get(key);
}

/** Body: a round little body with a belly, haunches, big floppy feet with pink beans, the cotton tail and a backpack with a carrot. Origin at the feet. */
function bodyGeometry(f) {
    return cached(`body-${f.key}`, () => {
        const parts = [];
        const r = 0.27;
        const body = fluffySphere(r, 0.08, 1.7, 24, 18);
        body.scale(1.04, 1.02, 0.96);
        paint(body, (x, y, z) => (z > r * 0.28 && y < r * 0.5 && Math.abs(x) < r * 0.72 ? f.belly : y < -r * 0.6 ? f.shade : f.fur));
        body.translate(0, 0.35, 0);
        parts.push(body);
        for (const s of [-1, 1]) {
            const haunch = fluffySphere(0.15, 0.09, 4 + s, 14, 10);
            haunch.scale(0.9, 1, 1.15);
            haunch.translate(s * 0.17, 0.19, -0.05);
            paint(haunch, (x, y) => (y < 0.1 ? f.shade : f.fur));
            parts.push(haunch);
            // big cartoon feet
            const foot = sphere(0.12, 14, 10);
            foot.scale(0.95, 0.5, 2.1);
            foot.translate(s * 0.15, 0.06, 0.13);
            paint(foot, (x, y, z) => (z > 0.3 ? f.belly : y < 0.035 ? f.shade : f.fur));
            parts.push(foot);
            for (let t = -1; t <= 1; t++) {
                const toe = sphere(0.04, 8, 6);
                toe.scale(1, 0.8, 1);
                toe.translate(s * 0.15 + t * 0.045, 0.075, 0.355);
                paint(toe, f.belly);
                parts.push(toe);
                // the beans under the toes (they show when the bunny tumbles)
                const bean = sphere(0.022, 6, 4);
                bean.scale(1, 0.4, 1);
                bean.translate(s * 0.15 + t * 0.045, 0.012, 0.33);
                paint(bean, C.pad);
                parts.push(bean);
            }
            const pad = sphere(0.06, 8, 6);
            pad.scale(1, 0.3, 1.3);
            pad.translate(s * 0.15, 0.008, 0.18);
            paint(pad, C.pad);
            parts.push(pad);
        }
        // the cotton tail: a cluster of puffs
        for (const [x, y, z, rr] of [[0, 0.3, -0.3, 0.09], [0.05, 0.34, -0.28, 0.065], [-0.05, 0.33, -0.29, 0.07], [0, 0.25, -0.28, 0.06], [0.02, 0.37, -0.25, 0.05]]) {
            const puff = fluffySphere(rr, 0.14, x * 40, 10, 8);
            puff.translate(x, y, z);
            paint(puff, f.belly);
            parts.push(puff);
        }
        // the backpack with a carrot
        const pack = new THREE.BoxGeometry(0.2, 0.18, 0.1, 2, 2, 1);
        pack.translate(0, 0.42, -0.27);
        paint(pack, (x, y) => (y > 0.5 ? C.packDark : C.pack));
        const flap = new THREE.BoxGeometry(0.21, 0.05, 0.11);
        flap.translate(0, 0.51, -0.27);
        paint(flap, C.packDark);
        const carrot = new THREE.ConeGeometry(0.03, 0.2, 7);
        carrot.rotateX(Math.PI);
        carrot.rotateZ(0.35);
        carrot.translate(0.06, 0.56, -0.28);
        paint(carrot, '#f07a1a');
        const top = new THREE.ConeGeometry(0.03, 0.08, 4);
        top.rotateZ(0.35);
        top.translate(0.095, 0.69, -0.28);
        paint(top, '#4f9e2f');
        parts.push(pack, flap, carrot, top);
        for (const s of [-1, 1]) {
            const strap = new THREE.TorusGeometry(0.17, 0.013, 4, 12, Math.PI * 0.9);
            strap.rotateY(Math.PI / 2);
            strap.rotateX(-0.25);
            strap.translate(s * 0.115, 0.42, -0.08);
            paint(strap, C.strap);
            parts.push(strap);
        }
        return merge(parts);
    });
}

/** Head (origin at its centre): a big fluffy head, puffy cheeks, the muzzle, two huge buck teeth, whiskers, blush and the chin strap. */
function headGeometry(f) {
    return cached(`head-${f.key}`, () => {
        const parts = [];
        const head = fluffySphere(HEAD_R, 0.045, 2.3, 26, 18);
        head.scale(1.08, 0.95, 0.98);
        paint(head, (x, y, z) => (z > 0.2 && y < -0.03 ? f.belly : y > 0.25 ? f.shade : f.fur));
        parts.push(head);
        for (const s of [-1, 1]) {
            const cheek = fluffySphere(0.14, 0.1, s * 3, 12, 9);
            cheek.translate(s * 0.15, -0.1, 0.17);
            paint(cheek, f.belly);
            const blush = sphere(0.05, 8, 6);
            blush.scale(1.25, 0.7, 0.4);
            blush.translate(s * 0.205, -0.05, 0.255);
            paint(blush, C.blush);
            parts.push(cheek, blush);
            for (let w = 0; w < 3; w++) {
                const whisker = new THREE.CylinderGeometry(0.004, 0.002, 0.24, 3);
                whisker.rotateZ(s * (Math.PI / 2 - 0.14 + w * 0.14));
                whisker.rotateY(-s * 0.25);
                whisker.translate(s * 0.21, -0.08 - w * 0.022 + 0.022, 0.3);
                paint(whisker, C.whisker);
                parts.push(whisker);
            }
        }
        const muzzle = sphere(0.1, 12, 8);
        muzzle.scale(1.2, 0.8, 0.9);
        muzzle.translate(0, -0.11, 0.27);
        paint(muzzle, f.belly);
        parts.push(muzzle);
        // two big buck teeth hanging over the mouth
        for (const s of [-1, 1]) {
            const tooth = new THREE.BoxGeometry(0.042, 0.056, 0.016, 1, 2, 1);
            tooth.translate(s * 0.023, -0.196, 0.336);
            paint(tooth, (x, y) => (y < -0.215 ? '#f1ece2' : C.teeth));
            parts.push(tooth);
        }
        return merge(parts);
    });
}

/** The two big white eyeballs (googly: the pupils are their own meshes and wobble inside). Origin between the eyes. */
function eyeballsGeometry() {
    return cached('eyeballs', () => {
        const parts = [];
        for (const s of [-1, 1]) {
            const eye = sphere(0.105, 18, 14);
            eye.scale(0.86, 1.06, 0.55);
            eye.translate(s * EYE_X, 0, EYE_Z);
            paint(eye, (x, y) => (y < -0.075 ? '#e3e9f2' : '#ffffff'));
            parts.push(eye);
        }
        return merge(parts);
    });
}

/** A pupil: a black disc with a big and a small highlight. Origin at its centre. */
function pupilGeometry() {
    return cached('pupil', () => {
        const pupil = sphere(0.046, 14, 10);
        pupil.scale(1, 1.12, 0.38);
        paint(pupil, (x, y) => (y < -0.025 ? '#3a2416' : '#120b07'));
        const big = sphere(0.016, 8, 6);
        big.translate(0.014, 0.02, 0.016);
        paint(big, '#ffffff');
        const small = sphere(0.007, 6, 4);
        small.translate(-0.016, -0.018, 0.016);
        paint(small, '#ffffff');
        return merge([pupil, big, small]);
    });
}

/** An eyebrow: a thick fuzzy bar (origin at its middle). */
function browGeometry(f) {
    return cached(`brow-${f.brow}`, () => {
        const brow = new THREE.CapsuleGeometry(0.018, 0.075, 3, 6);
        brow.rotateZ(Math.PI / 2);
        brow.scale(1, 1, 0.7);
        paint(brow, f.brow);
        return merge([brow]);
    });
}

/** The mouth: a dark half-disc (origin at its top edge) with a pink tongue; it opens by scaling y. */
function mouthGeometry() {
    return cached('mouth', () => {
        const hole = new THREE.SphereGeometry(0.085, 18, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
        hole.scale(1, 1, 0.42);
        paint(hole, '#5c1622');
        const tongue = sphere(0.05, 10, 8);
        tongue.scale(1.15, 0.6, 0.55);
        tongue.translate(0, -0.062, 0.014);
        paint(tongue, (x) => (Math.abs(x) < 0.006 ? '#e85a72' : '#ff7d93'));
        return merge([hole, tongue]);
    });
}

function noseGeometry() {
    return cached('nose', () => {
        const nose = sphere(0.046, 12, 8);
        nose.scale(1.4, 0.9, 0.8);
        paint(nose, (x, y) => (y > 0.016 ? '#ffb2c2' : C.nose));
        return merge([nose]);
    });
}

/** An ear segment: the outer fur and the pink inside; origin at its base. */
function earGeometry(f, tip) {
    return cached(`ear-${f.key}-${tip}`, () => {
        const len = tip ? 0.2 : 0.23;
        const r = tip ? 0.066 : 0.072;
        const outer = limb(r, len, 10);
        outer.scale(1, 1, 0.55);
        paint(outer, (x, y) => (tip && y > len * 0.85 ? f.shade : f.fur));
        const inner = limb(r * 0.58, len * 0.86, 8);
        inner.scale(1, 1, 0.4);
        inner.translate(0, r * 0.25, 0.024);
        paint(inner, f.inner);
        return merge([outer, inner]);
    });
}

/** A short stubby arm hanging down from the shoulder, with a big round paw. */
function armGeometry(f) {
    return cached(`arm-${f.key}`, () => {
        const arm = limb(0.05, 0.09, 8);
        arm.rotateX(Math.PI);
        paint(arm, f.fur);
        const paw = sphere(0.075, 10, 8);
        paw.scale(1, 0.9, 1.05);
        paw.translate(0, -0.21, 0.01);
        paint(paw, f.belly);
        return merge([arm, paw]);
    });
}

/** The chin strap of helmets (head space). */
function chinStrapGeometry() {
    return cached('chinstrap', () => {
        const strap = new THREE.TorusGeometry(HEAD_R * 1.04, 0.012, 4, 24, Math.PI);
        strap.rotateZ(Math.PI);
        strap.translate(0, 0.07, 0.02);
        paint(strap, C.strap);
        return merge([strap]);
    });
}

/** The knitted scarf around the neck (team colour; stripes by vertex colour) with a tail that hangs down. */
function scarfGeometry() {
    return cached('scarf', () => {
        const ring = new THREE.TorusGeometry(0.17, 0.055, 8, 24);
        ring.rotateX(Math.PI / 2);
        ring.scale(1.05, 1, 1.05);
        ring.translate(0, 0.6, 0.02);
        paint(ring, (x, y, z) => (Math.floor((Math.atan2(z - 0.02, x) + Math.PI) / (Math.PI / 8)) % 2 ? '#ffffff' : '#d8d8d8'));
        const knot = sphere(0.058, 8, 6);
        knot.translate(0.11, 0.58, 0.15);
        paint(knot, '#e6e6e6');
        const tail = new THREE.BoxGeometry(0.085, 0.22, 0.03, 1, 4, 1);
        tail.translate(0, -0.11, 0);
        tail.rotateZ(0.3);
        tail.rotateX(-0.3);
        tail.translate(0.14, 0.58, 0.16);
        paint(tail, (x, y) => (Math.floor(y * 30) % 2 ? '#ffffff' : '#d0d0d0'));
        const fringe = new THREE.BoxGeometry(0.085, 0.04, 0.032);
        fringe.translate(0, -0.24, 0);
        fringe.rotateZ(0.3);
        fringe.rotateX(-0.3);
        fringe.translate(0.14, 0.58, 0.16);
        paint(fringe, '#bdbdbd');
        return merge([ring, knot, tail, fringe]);
    });
}

/** A crossed plaster (origin at its middle, facing +z). */
function plasterGeometry() {
    return cached('plaster', () => {
        const parts = [];
        for (const a of [-0.65, 0.65]) {
            const strip = new THREE.BoxGeometry(0.15, 0.045, 0.012);
            strip.rotateZ(a);
            paint(strip, '#efbf8a');
            parts.push(strip);
        }
        const pad = new THREE.BoxGeometry(0.045, 0.045, 0.018);
        pad.rotateZ(Math.PI / 4);
        paint(pad, '#fff0da');
        parts.push(pad);
        return merge(parts);
    });
}

/** A gauze bandage wrapped around the base of an ear, with a little bow. */
function bandageGeometry() {
    return cached('bandage', () => {
        const wrap = new THREE.CylinderGeometry(0.082, 0.085, 0.09, 12, 2, true);
        wrap.scale(1, 1, 0.62);
        paint(wrap, (x, y) => (Math.abs(y) < 0.008 ? '#e6e0d2' : '#fbf8f0'));
        const bowL = sphere(0.03, 6, 4);
        bowL.scale(1.4, 0.8, 0.5);
        bowL.translate(-0.03, 0.02, 0.06);
        const bowR = bowL.clone();
        bowR.translate(0.06, 0, 0);
        paint(bowL, '#fbf8f0');
        paint(bowR, '#fbf8f0');
        return merge([wrap, bowL, bowR]);
    });
}

/** A five-pointed star (flat, extruded), origin at its centre. */
function starShape(r) {
    const s = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
        const a = Math.PI / 2 + (i / 10) * Math.PI * 2;
        const rr = i % 2 ? r * 0.45 : r;
        if (i === 0) s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
        else s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    s.closePath();
    return s;
}

/** The dizzy ring: four little stars circling the head. */
function starsGeometry() {
    return cached('stars', () => {
        const parts = [];
        for (let i = 0; i < 4; i++) {
            const star = new THREE.ExtrudeGeometry(starShape(i % 2 ? 0.06 : 0.075), { depth: 0.02, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 1 });
            star.translate(0, 0, -0.01);
            const a = (i / 4) * Math.PI * 2;
            star.rotateY(a + Math.PI / 2);
            star.translate(Math.cos(a) * 0.34, (i % 2) * 0.05, Math.sin(a) * 0.34);
            paint(star, (x, y, z) => (y > (i % 2) * 0.05 + 0.02 ? '#fff6a8' : '#ffcf2e'));
            parts.push(star);
        }
        return merge(parts);
    });
}

const eyeMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.18, metalness: 0.05 });
const noseMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4 });
const plainMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
const starMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });

const teamMaterials = new Map();
function teamMaterial(color) {
    if (!teamMaterials.has(color)) teamMaterials.set(color, new THREE.MeshStandardMaterial({ color, vertexColors: true, roughness: 0.55, metalness: 0.05 }));
    return teamMaterials.get(color);
}

function part(geometry, material, parent, x = 0, y = 0, z = 0, shadow = true) {
    const m = new THREE.Mesh(geometry, material);
    m.position.set(x, y, z);
    m.castShadow = shadow;
    parent?.add(m);
    return m;
}

// ---------------------------------------------------------------- what bunnies say (German, short; the game is German)

const QUIPS = {
    hurt: ['Aua!', 'Meine Löffel!', 'Das gibt Rache!', 'Nicht ins Fell!', 'Autsch!', 'Uff!', 'Das kitzelt nur!', 'Hey, ich war frisch gekämmt!', 'Mein schöner Helm!', 'Sterne … so viele Sterne …'],
    fly: ['Aaaaah!', 'Ich kann fliegen!', 'Huiii!', 'Mamaaa!', 'Nicht schon wieder!', 'Wo ist unten?', 'Hilfeee!'],
    land: ['Uff!', 'Gelandet!', 'Alles noch dran?', 'Zehn Punkte!'],
    fire: ['Fang!', 'Möhre frei!', 'Iss dein Gemüse!', 'Für die Möhre!', 'Hoppla hopp!', 'Achtung, Vitamine!', 'Frisch vom Feld!'],
    die: ['Ich komm wieder …', 'Tschüss, Möhrchen …', 'Sagt meiner Mama …', 'Das war\'s mit mir', 'Bis gleich im Hasenhimmel!', 'Unfair …'],
    sink: ['Blubb!', 'Ich kann nicht schwimmen!', 'Blubb … blubb …', 'Zu nass!'],
    greet: ['Huhu!', 'Na, du?', 'Ich seh dich!', 'Möhre gefällig?', 'Hoppel hoppel!', 'Alles klar?'],
    yawn: ['Gääähn …', 'Wann bin ich dran?', 'Langweilig …'],
    sneeze: ['Hatschi!', 'Hatschuuu!'],
    hiccup: ['Hicks!', 'Hick!'],
    cheer: ['Juhuu!', 'Gewonnen!', 'Wer ist hier der Boss?', 'Möhren für alle!'],
};

const pick = list => list[Math.floor(Math.random() * list.length)];

// ---------------------------------------------------------------- animation helpers

const KINDS = ['Projectile', 'Grenade', 'Cluster', 'Hitscan', 'Airstrike'];
const LOOPS = new Set(['idle', 'walk', 'aim', 'cheer', 'dance', 'wave', 'eat']);
const ONCE = { fire: 0.55, hurt: 0.6 };
const FIDGETS = ['yawn', 'scratch', 'hiccup', 'lookcam', 'lookcam', 'polish', 'sneeze', 'raspberry', 'stretch'];
const FIDGET_SECONDS = { yawn: 1.9, scratch: 1.7, hiccup: 1.7, lookcam: 2.3, polish: 1.8, sneeze: 1.5, raspberry: 1.4, stretch: 1.6 };
const smooth = (current, target, rate, dt) => current + (target - current) * (1 - Math.exp(-rate * dt));
const easeOutBack = t => 1 + 2.4 * Math.pow(t - 1, 3) + 1.4 * Math.pow(t - 1, 2);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

/** Where the camera is (the head of every bunny records it when it is drawn): the googly eyes look at the player. */
const viewer = new THREE.Vector3(0, 6, 14);
function recordViewer(renderer, scene, camera) {
    if (camera.isPerspectiveCamera) viewer.copy(camera.position);
}

/** A soft ear: a spring for the tip (angle around x) that lags behind the motion of the head. */
class EarSpring {
    constructor() {
        this.x = 0;
        this.v = 0;
    }

    step(dt, target, push) {
        const k = 140, damping = 10;
        // small steps: one big step of a stiff spring at a low frame rate would swing up
        for (let left = dt; left > 1e-6; left -= 1 / 120) {
            const h = Math.min(left, 1 / 120);
            this.v += (-(this.x - target) * k - this.v * damping + push) * h;
            this.x += this.v * h;
            this.x = Math.max(-1.6, Math.min(1.2, this.x));
        }
        return this.x;
    }
}

/** A googly pupil: a 2D spring inside the eyeball (−1 .. 1), shaken by the hops. */
class PupilSpring {
    constructor() {
        this.x = 0;
        this.y = 0;
        this.vx = 0;
        this.vy = 0;
    }

    step(dt, tx, ty, push) {
        const k = 230, damping = 9;
        for (let left = dt; left > 1e-6; left -= 1 / 120) {
            const h = Math.min(left, 1 / 120);
            this.vx += (-(this.x - tx) * k - this.vx * damping) * h;
            this.vy += (-(this.y - ty) * k - this.vy * damping + push) * h;
            this.x += this.vx * h;
            this.y += this.vy * h;
            const r = Math.hypot(this.x, this.y);
            if (r > 1) {
                this.x /= r;
                this.y /= r;
                this.vx *= 0.4;
                this.vy *= 0.4;
            }
        }
    }
}

/** A bunny of a team. Its root stands with the feet at y = 0 and looks along +z (turned by yaw). */
export class Bunny {
    constructor(dto, team) {
        this.id = dto.id;
        this.team = dto.team;
        this.name = dto.name;
        this.color = team?.color ?? '#888888';
        this.health = dto.health;
        this.maxHealth = dto.maxHealth ?? 100;
        this.alive = dto.health > 0;
        this.position = new THREE.Vector3(dto.x, dto.y, dto.z);
        this.goal = this.position.clone();
        this.yaw = dto.yaw ?? 0;
        this.goalYaw = this.yaw;
        this.moving = 0; // seconds the walking still lasts (main.js and walkTo set it)
        this.clock = Math.random() * 10;
        this.classicFur = CLASSIC_FURS[Math.abs((dto.id ?? 0) * 7 + (dto.team ?? 0) * 3) % CLASSIC_FURS.length];
        this.look = { fur: team?.fur || this.classicFur, outfit: team?.outfit || 'helmet', face: team?.face || 'none' };
        this.fur = furOf(this.look.fur);
        this.flopEar = ((dto.id ?? 0) % 3) !== 1; // most bunnies have one cheeky bent ear

        this.anim = 'idle';
        this.animTime = 0;
        this.once = null; // { name, t, duration }
        this.weaponKind = null;
        this.weaponHeld = false;
        this.aimPitch = 0.4;
        this.aimUntil = -1;
        this.flight = null; // { spin, axis } while tumbling
        this.dying = null; // { t } while falling over / rising as a ghost
        this.sinking = null;
        this.flash = 0;
        this.squash = 0; // a landing squash that decays
        this.hop = 0; // phase of the walking hops
        this.lastHopCycle = 0;
        this.prevY = 0;
        this.prevV = 0;
        this.blinkIn = 1 + Math.random() * 3;
        this.blink = 0;
        this.twitchIn = 2 + Math.random() * 4;
        this.twitch = 0;
        this.twitchSide = 0;
        this.wiggleIn = 3 + Math.random() * 4;
        this.wiggle = 0;
        this.lookIn = 2 + Math.random() * 3;
        this.lookYaw = 0;
        this.lookTarget = 0;
        this.headYaw = 0;
        this.gazeMode = 'camera';
        this.glanceX = 0;
        this.glanceY = 0;
        this.ears = [new EarSpring(), new EarSpring()];
        this.pupilSprings = [new PupilSpring(), new PupilSpring()];
        this.fidget = null; // { name, t, d } an idle fidget
        this.fidgetIn = 2.5 + Math.random() * 5;
        this.soot = 0; // a sooty face after a blast, fades
        this.dizzy = 0; // seconds of stars around the head
        this.helmetPop = null; // { t, height } the helmet jumps off and lands again
        this.lastSlap = -10;
        this.lastQuip = -10;
        this.bubble = null;
        this.fx = null;

        this.root = new THREE.Group();
        this.root.name = `bunny-${this.id}`;
        this.spinner = new THREE.Group(); // tumbles around the middle of the body
        this.spinner.position.y = 0.5;
        this.root.add(this.spinner);
        this.createModel();

        this.label = new Label(this.name, this.color);
        this.label.sprite.position.y = 1.92;
        this.root.add(this.label.sprite);
        this.label.set(this.health, this.maxHealth, true);

        this.grave = null;
        this.ghost = null;
        this.updatePlasters();
        this.sync();
        if (!this.alive) this.die(false);
    }

    createModel() {
        this.model = new THREE.Group();
        this.model.position.y = -0.5;
        this.model.rotation.order = 'YXZ';
        this.spinner.add(this.model);
        this.buildModel();
    }

    /** Dresses the bunny anew: { fur, outfit, face } keys (missing ones stay), color = a new team colour. */
    setLook(look = {}) {
        if (look.color) this.color = look.color;
        this.look = {
            fur: look.fur || this.look.fur,
            outfit: look.outfit || this.look.outfit,
            face: look.face || this.look.face,
        };
        this.fur = furOf(this.look.fur);
        const old = this.model;
        this.spinner.remove(old);
        this.furMaterial.dispose();
        this.weapon = null;
        this.createModel();
        this.model.visible = old.visible;
        this.updatePlasters();
        this.sync();
    }

    buildModel() {
        const f = this.fur;
        this.furMaterial = dressFur(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, emissive: 0x000000 }), f);
        const team = teamMaterial(this.color);
        this.body = part(bodyGeometry(f), this.furMaterial, this.model);
        this.body.receiveShadow = true;
        this.scarf = part(scarfGeometry(), team, this.model);

        this.neck = new THREE.Group(); // turns and tilts the head
        this.neck.position.set(0, 0.62, 0.04);
        this.neck.rotation.order = 'YXZ';
        this.model.add(this.neck);
        this.head = new THREE.Group();
        this.head.position.set(0, 0.27, 0.02);
        this.neck.add(this.head);
        const headMesh = part(headGeometry(f), this.furMaterial, this.head);
        headMesh.receiveShadow = true;
        headMesh.onBeforeRender = recordViewer;

        // googly eyes: the eyeballs blink by scaling y, the pupils wobble inside
        this.eyes = new THREE.Group();
        this.eyes.position.y = EYE_Y;
        this.head.add(this.eyes);
        part(eyeballsGeometry(), eyeMaterial, this.eyes, 0, 0, 0, false);
        const face = faceParts(this.look.face, this.color);
        this.pupils = [-1, 1].map(s => part(pupilGeometry(), face.lasers ? laserPupilMaterial : eyeMaterial, this.eyes, s * EYE_X, 0, EYE_Z + 0.052, false));
        // laser eyes: two beams out of the pupils (aiming and cheering)
        this.beams = face.lasers ? this.pupils.map(pupil => {
            const beam = part(laserGeometry, laserBeamMaterial, pupil, 0, 0, 0.01, false);
            beam.visible = false;
            return beam;
        }) : null;
        for (const piece of face.parts) part(piece.geometry, piece.material, this.head, 0, 0, 0, false);
        this.brows = [-1, 1].map(s => {
            const brow = part(browGeometry(f), plainMaterial, this.head, s * EYE_X, BROW_Y, 0.3, false);
            brow.userData.side = s;
            return brow;
        });
        this.nose = part(noseGeometry(), noseMaterial, this.head, 0, -0.055, 0.35, false);
        this.mouth = part(mouthGeometry(), noseMaterial, this.head, 0, -0.172, 0.31, false);
        this.mouth.scale.set(1, 0.3, 1);

        this.helmet = new THREE.Group();
        this.helmet.position.set(0, 0.23, -0.05);
        this.helmet.rotation.order = 'ZXY';
        this.head.add(this.helmet);
        for (const piece of outfitParts(this.look.outfit, this.color)) part(piece.geometry, piece.material, this.helmet, 0, 0, 0, piece.shadow !== false);
        if (this.look.outfit === 'helmet' || this.look.outfit === 'viking') part(chinStrapGeometry(), plainMaterial, this.head, 0, 0, 0, false);

        // the ears: a base and a tip each, the tips are springs
        this.earNodes = [-1, 1].map(s => {
            const base = new THREE.Group();
            base.position.set(s * 0.12, 0.26, -0.05);
            base.rotation.order = 'ZXY';
            this.head.add(base);
            part(earGeometry(f, false), this.furMaterial, base);
            const tip = new THREE.Group();
            tip.position.y = 0.28;
            tip.rotation.order = 'ZXY';
            base.add(tip);
            part(earGeometry(f, true), this.furMaterial, tip);
            return { base, tip, side: s };
        });

        // slapstick: plasters for a battered bunny, the dizzy stars
        this.plaster = part(plasterGeometry(), plainMaterial, this.head, -0.205, -0.085, 0.285, false);
        this.plaster.rotation.set(-0.1, -0.5, 0.3);
        this.bandage = part(bandageGeometry(), plainMaterial, this.earNodes[1].base, 0, 0.12, 0, false);
        this.stars = part(starsGeometry(), starMaterial, this.head, 0, 0.52, -0.02, false);
        this.stars.visible = false;

        this.arms = [-1, 1].map(s => {
            const shoulder = new THREE.Group();
            shoulder.position.set(s * 0.2, 0.52, 0.08);
            shoulder.rotation.order = 'XZY';
            this.model.add(shoulder);
            part(armGeometry(f), this.furMaterial, shoulder);
            return shoulder;
        });

        this.weaponPivot = new THREE.Group(); // between the paws, tilts with the aim
        this.weaponPivot.position.set(0, 0.47, 0.22);
        this.model.add(this.weaponPivot);
        this.weapon = null;
        this.snack = snackModel();
        this.snack.position.set(0, 0.66, 0.36);
        this.snack.visible = false;
        this.model.add(this.snack);
    }

    // ------------------------------------------------------------ state from the game

    /** Health from the server; the label's bar animates. */
    setHealth(health) {
        if (health === this.health) return;
        this.health = health;
        this.label.set(Math.max(0, health), this.maxHealth);
        this.updatePlasters();
    }

    /** A plaster on the cheek below 60 % health, a bandaged ear below 30 %. */
    updatePlasters() {
        const share = this.health / Math.max(1, this.maxHealth);
        this.plaster.visible = this.alive && share < 0.6;
        this.bandage.visible = this.alive && share < 0.3;
    }

    /** Puts the bunny where the server says, at once. */
    snap(x, y, z, yaw) {
        this.position.set(x, y, z);
        this.goal.set(x, y, z);
        if (yaw !== undefined && yaw !== null) {
            this.yaw = yaw;
            this.goalYaw = yaw;
        }
        this.sync();
    }

    /** Walks smoothly towards a position (moves of other players). */
    walkTo(x, y, z, yaw) {
        this.goal.set(x, y, z);
        if (yaw !== undefined && yaw !== null) this.goalYaw = yaw;
        this.moving = Math.max(this.moving, 0.3);
    }

    lookAt(x, z) {
        this.goalYaw = Math.atan2(x - this.position.x, z - this.position.z);
    }

    attachFx(particles) {
        this.fx = particles;
    }

    particles() {
        return this.fx ?? activeParticles();
    }

    showLabel(visible) {
        this.labelHidden = !visible;
        this.label.sprite.visible = visible && this.alive;
    }

    // ------------------------------------------------------------ speech

    /** A speech bubble above the head for a few seconds (replaces the one shown). */
    say(text, seconds = 2.2) {
        if (!text) return;
        if (!this.bubble) {
            this.bubble = new Bubble(this);
            this.root.add(this.bubble.sprite);
        }
        this.bubble.show(String(text), seconds);
        this.lastQuip = this.clock;
    }

    /** Says something of a list now and then (chance 0..1); never while another bubble is up, right after one or without labels (menu). */
    quip(kind, chance = 0.5, force = false) {
        const list = QUIPS[kind];
        if (!list) return;
        // the menu hides the labels and blurs the island: no chatter there
        if (!force && (this.labelHidden || Math.random() > chance || this.bubble?.active || this.clock - this.lastQuip < 2.5)) return;
        this.say(pick(list), kind === 'die' ? 2.6 : 1.8);
    }

    // ------------------------------------------------------------ animations

    play(name) {
        if (!this.alive) return;
        if (ONCE[name]) {
            this.once = { name, t: 0, duration: name === 'fire' && this.weaponKind === 'Airstrike' ? 1.1 : ONCE[name] };
            if (name === 'hurt') {
                this.flash = 1;
                this.slapstick(this.pendingHurt ?? 20);
                this.pendingHurt = null;
            }
            if (name === 'fire') this.quip('fire', 0.3);
            this.fidget = null;
            return;
        }
        if (LOOPS.has(name) && name !== this.anim) {
            this.anim = name;
            this.animTime = 0;
            this.fidget = null;
            if (name === 'cheer') this.quip('cheer', 0.4);
        }
    }

    hurt(amount) {
        this.pendingHurt = amount ?? 20;
        this.play('hurt');
    }

    /** Soot on the face, stars around the head, maybe the helmet pops off, and a word about it (once per hit, even when two callers report it). */
    slapstick(amount) {
        if (this.clock - this.lastSlap < 0.3) return;
        this.lastSlap = this.clock;
        this.soot = Math.min(1, this.soot + 0.55 + amount / 90);
        this.dizzy = Math.max(this.dizzy, 2.2 + Math.min(2, amount / 30));
        if (amount >= 25 || Math.random() < 0.45) this.helmetPop = { t: 0, height: 0.35 + Math.min(0.35, amount / 140) };
        const at = this.position.clone();
        at.y += 1.0;
        this.particles()?.emit(at, { count: 5, speed: 0.9, up: 1, colors: [0x8a847e, 0xa49d96, 0x6a6560], life: 0.7, gravity: -0.2, spread: 0.3, size: 0.2, grow: 1.6, fade: true, drag: 2 });
        this.quip('hurt', 0.55);
    }

    setWeapon(kind) {
        if (typeof kind === 'number') kind = KINDS[kind];
        this.weaponHeld = !!kind;
        if (kind) this.showWeapon(kind);
    }

    showWeapon(kind) {
        if (this.weaponKind === kind && this.weapon) return;
        if (this.weapon) this.weaponPivot.remove(this.weapon);
        this.weaponKind = kind;
        this.weapon = weaponModel(kind);
        this.weaponPivot.add(this.weapon);
    }

    setAimPitch(rad) {
        this.aimPitch = Math.max(-0.6, Math.min(1.5, rad));
    }

    setFlight(vx, vy, vz) {
        const speed = Math.hypot(vx, vy, vz);
        if (!this.flight) {
            this.flight = { angle: 0, axis: new THREE.Vector3(1, 0, 0) };
            this.quip('fly', 0.55);
        }
        if (vx * vx + vz * vz > 1e-4) this.flight.axis.set(vz, 0, -vx).normalize();
        this.flight.speed = speed;
    }

    land() {
        if (!this.flight) return;
        this.flight = null;
        this.spinner.quaternion.identity();
        this.squash = 1;
        this.dizzy = Math.max(this.dizzy, 1.6);
        this.dust(10);
        this.quip('land', 0.3);
    }

    die(animate = true) {
        if (!this.alive && (this.grave || this.sinking)) return;
        this.alive = false;
        this.label.sprite.visible = false;
        this.setAim(null);
        this.flight = null;
        this.spinner.quaternion.identity();
        this.stars.visible = false;
        this.updatePlasters();
        if (!this.grave) {
            this.grave = gravestoneModel();
            this.grave.rotation.y = this.yaw;
            this.root.add(this.grave);
        }
        if (animate) {
            this.dying = { t: 0 };
            this.grave.scale.setScalar(0.001);
            this.grave.visible = true;
            this.quip('die', 0.85, !this.labelHidden && Math.random() < 0.85);
        } else {
            this.model.visible = false;
            this.grave.scale.setScalar(1);
        }
    }

    /** Drowned: the bunny goes under with bubbles; nothing is left above the water. */
    sink() {
        if (!this.alive && this.sinking) return;
        this.alive = false;
        this.label.sprite.visible = false;
        this.setAim(null);
        this.flight = null;
        this.stars.visible = false;
        if (!this.grave) {
            this.grave = gravestoneModel();
            this.root.add(this.grave);
        }
        this.grave.visible = false;
        this.dying = null;
        this.sinking = { t: 0 };
        this.quip('sink', 0.9, !this.labelHidden);
    }

    /**
     * Puts the bunny into its aim pose for a while (points: the start of the flight as Vector3, null ends it); the weapon tilts with the line.
     * The visible aim line and the impact marker are drawn by AimGuide (aim.js), not here.
     */
    setAim(points) {
        if (!points || points.length < 2) {
            this.aimUntil = -1;
            return;
        }
        this.aimUntil = this.clock + 0.3;
        const a = points[0], b = points[Math.min(points.length - 1, 2)];
        const horizontal = Math.hypot(b.x - a.x, b.z - a.z);
        if (horizontal > 1e-4 || Math.abs(b.y - a.y) > 1e-4) this.setAimPitch(Math.atan2(b.y - a.y, horizontal));
    }

    dust(count = 6) {
        const particles = this.particles();
        if (!particles) return;
        const at = this.position.clone();
        at.y += 0.05;
        particles.emit(at, { count, speed: 1.1, up: 0.6, colors: [0xd9cbb2, 0xc4b496, 0xe8dcc6], life: 0.6, gravity: 0.15, spread: 0.3, size: 0.32, grow: 1.6, fade: true, drag: 3 });
    }

    // ------------------------------------------------------------ per frame

    sync() {
        this.root.position.copy(this.position);
        this.model.rotation.y = this.yaw;
    }

    update(dt, time) {
        dt = Math.max(0, Math.min(dt, 0.1)); // a negative step would make every smoothing explode
        this.clock += dt;
        tickFurs(performance.now() / 1000);
        const wasMoving = this.position.distanceToSquared(this.goal) > 1e-6;
        if (wasMoving) {
            this.position.lerp(this.goal, 1 - Math.exp(-dt * 12));
            this.moving = Math.max(this.moving, 0.1);
        }
        let d = this.goalYaw - this.yaw;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        this.yaw += d * (1 - Math.exp(-dt * 14));
        this.sync();
        this.label.update(dt);
        this.bubble?.update(dt);

        if (!this.alive) {
            this.updateDead(dt);
            return;
        }

        const pose = this.pose(dt);
        this.apply(pose, dt);
    }

    /** The angle from where the bunny (plus extra yaw) looks to the camera, −π .. π (0: it looks right at it). */
    viewerAngle(extra = 0) {
        return wrap(Math.atan2(viewer.x - this.position.x, viewer.z - this.position.z) - this.yaw - extra);
    }

    /** Computes the pose of this frame: the loop, a one-shot on top, the hops, the flight, the face. */
    pose(dt) {
        const t = (this.animTime += dt);
        const c = this.clock;
        const p = {
            y: 0, sx: 1, sy: 1, lean: 0, roll: 0, twist: 0, headX: 0, headY: 0, headZ: 0,
            armL: { x: -0.2, z: -0.2 }, armR: { x: -0.2, z: 0.2 }, earBack: -0.12, earSpread: 0.18, earPush: 0,
            weapon: false, weaponPitch: 0, kick: 0, snack: false, eyes: 1,
            // the face: brows up/down and tilted (+ angry, − worried), the mouth open 0 .. 1.3 and its width, where the pupils look, their size
            browY: 0, browTilt: 0, browSkew: 0, mouth: 0.3, mouthW: 1, mouthRot: 0, mouthX: 0, gaze: this.gazeMode, gazeY: 0, pupil: 1, helmetRub: 0,
        };

        // breathing, looking around
        const breath = Math.sin(c * 1.9) * 0.02;
        p.sy += breath;
        p.sx -= breath * 0.5;
        this.lookIn -= dt;
        if (this.lookIn <= 0) {
            this.lookIn = 2 + Math.random() * 3.5;
            this.lookTarget = Math.random() < 0.35 ? 0 : (Math.random() - 0.5) * 1.1;
            this.gazeMode = Math.random() < 0.5 ? 'camera' : 'free';
            this.glanceX = (Math.random() - 0.5) * 1.6;
            this.glanceY = (Math.random() - 0.5) * 0.9;
        }
        this.lookYaw = smooth(this.lookYaw, this.lookTarget, 4, dt);

        const aiming = this.clock < this.aimUntil;
        const walking = this.moving > 0;
        if (walking) this.moving -= dt;

        // 'walk' hops only while the bunny moves, 'aim' holds only while it aims or holds a weapon: a loop never sticks after a turn
        let loop = this.anim;
        if (loop === 'walk' && !walking) loop = 'idle';
        if (loop === 'aim' && !aiming && !this.weaponHeld) loop = 'idle';
        if (walking && (loop === 'idle' || loop === 'aim')) loop = 'walk';
        if (aiming && loop === 'idle') loop = 'aim';

        switch (loop) {
            case 'walk': {
                this.hop += dt / 0.32;
                const ph = this.hop % 1;
                const air = Math.sin(Math.PI * ph);
                p.y = air * 0.2;
                p.sy *= ph < 0.12 || ph > 0.92 ? 0.8 : 1 + air * 0.12;
                p.sx *= ph < 0.12 || ph > 0.92 ? 1.12 : 1 - air * 0.06;
                p.lean = 0.18;
                p.armL.x = p.armR.x = 0.6 - air * 0.9;
                p.armL.z = -0.35 - air * 0.4;
                p.armR.z = 0.35 + air * 0.4;
                p.earBack = -0.4;
                p.headY = 0;
                p.mouth = 0.4;
                p.gaze = 'forward';
                const cycle = Math.floor(this.hop);
                if (cycle !== this.lastHopCycle) {
                    this.lastHopCycle = cycle;
                    this.dust(4);
                }
                break;
            }
            case 'aim':
                // concentrating: angry brows, squinting, the tongue in the corner of the mouth
                p.weapon = true;
                p.lean = -0.05;
                p.headY = 0;
                p.headX = -this.aimPitch * 0.35;
                p.browTilt = 0.42;
                p.browY = -0.012;
                p.browSkew = 0.012;
                p.eyes = 0.78;
                p.mouth = 0.34;
                p.mouthW = 0.68;
                p.mouthRot = 0.38;
                p.mouthX = 0.035;
                p.gaze = 'forward';
                p.gazeY = clamp(this.aimPitch * 0.9, -0.6, 0.8);
                break;
            case 'cheer': {
                const ph = (t / 0.7) % 1;
                const air = Math.max(0, Math.sin(Math.PI * Math.min(1, ph / 0.75)));
                p.y = air * 0.42;
                p.sy *= ph > 0.9 ? 0.8 : 1 + air * 0.14;
                p.armL = { x: -0.3, z: -2.5 + Math.sin(t * 14) * 0.25 };
                p.armR = { x: -0.3, z: 2.5 - Math.sin(t * 14) * 0.25 };
                p.twist = Math.floor(t / 0.7) % 3 === 2 ? ph * Math.PI * 2 : 0;
                p.headX = -0.25;
                p.earBack = 0.05;
                p.eyes = 0.45; // happy squint
                p.mouth = 1.05;
                p.browY = 0.035;
                p.browTilt = -0.15;
                break;
            }
            case 'dance': {
                const beat = t * 2.4;
                const side = Math.sin(beat * Math.PI);
                p.y = Math.abs(Math.sin(beat * Math.PI)) * 0.14;
                p.roll = side * 0.24;
                p.twist = Math.sin(beat * Math.PI * 0.5) * 0.5;
                p.armL = { x: -0.4, z: Math.floor(beat) % 2 ? -2.6 : -0.6 };
                p.armR = { x: -0.4, z: Math.floor(beat) % 2 ? 0.6 : 2.6 };
                p.headZ = -side * 0.28;
                p.headX = Math.sin(beat * Math.PI * 2) * 0.12;
                p.earSpread = 0.3 + side * 0.2;
                p.mouth = 0.6 + Math.abs(side) * 0.3;
                p.eyes = Math.floor(beat / 2) % 2 ? 0.45 : 1;
                p.browY = 0.03;
                p.browSkew = side * 0.02;
                break;
            }
            case 'wave':
                p.armR = { x: -0.4, z: 2.45 + Math.sin(t * 9) * 0.35 };
                p.armL = { x: -0.2, z: -0.25 };
                p.headZ = 0.18;
                p.roll = Math.sin(t * 3) * 0.05;
                p.headY = clamp(this.viewerAngle(), -0.9, 0.9) * 0.6;
                p.gaze = 'camera';
                p.mouth = 0.65;
                p.browY = 0.025;
                break;
            case 'eat': {
                const munch = Math.sin(t * 18);
                p.armL = { x: -1.95, z: 0.4 };
                p.armR = { x: -1.95, z: -0.4 };
                p.snack = true;
                p.headX = 0.12 + munch * 0.04;
                p.sy += munch * 0.012;
                p.earBack = -0.05;
                p.eyes = Math.sin(t * 0.8) > 0.6 ? 0.45 : 1;
                p.mouth = 0.18 + Math.abs(munch) * 0.32;
                p.mouthW = 0.8;
                p.browY = 0.015;
                break;
            }
            default: // idle
                p.headY = this.lookYaw;
                break;
        }

        // idle bunnies fidget now and then
        if (loop === 'idle' && !this.weaponHeld && !this.once && !this.flight && this.dizzy <= 0) {
            if (!this.fidget) {
                this.fidgetIn -= dt;
                if (this.fidgetIn <= 0) {
                    const name = pick(FIDGETS);
                    this.fidget = { name, t: 0, d: FIDGET_SECONDS[name] };
                }
            }
            if (this.fidget) this.fidgetPose(p, dt);
        } else if (this.fidget) {
            this.fidget = null;
        }

        if (this.weaponHeld && !aiming && loop === 'idle') {
            p.weapon = true; // carrying it, the barrel a little down
            p.weaponPitch = -0.25;
        }
        if (p.weapon) {
            const pitch = loop === 'aim' ? this.aimPitch : p.weaponPitch;
            p.weaponPitch = pitch;
            this.weaponArms(p, pitch);
        }

        // dizzy after a hit: stars, wobbly head, pupils rolling around
        if (this.dizzy > 0) {
            this.dizzy -= dt;
            p.gaze = 'dizzy';
            p.roll += Math.sin(c * 5) * 0.07;
            p.headZ += Math.sin(c * 5 + 1) * 0.15;
            p.mouth = 0.32;
            p.mouthRot = Math.sin(c * 3) * 0.25;
            p.browTilt = -0.3;
            p.browSkew = Math.sin(c * 4) * 0.02;
        }

        // a one-shot on top
        if (this.once) {
            const o = this.once;
            o.t += dt;
            const k = o.t / o.duration;
            if (o.name === 'fire') this.firePose(p, k);
            if (o.name === 'hurt') {
                const shake = Math.sin(o.t * 50) * (1 - k);
                p.lean -= 0.4 * (1 - k);
                p.roll += shake * 0.14;
                p.earBack = -0.9 * (1 - k);
                p.sy *= 1 - 0.14 * (1 - k);
                p.sx *= 1 + 0.08 * (1 - k);
                p.armL = { x: -0.9, z: -1.1 };
                p.armR = { x: -0.9, z: 1.1 };
                if (k < 0.45) {
                    // squeezed shut, teeth gritted
                    p.eyes = 0.08;
                    p.mouth = 0.55;
                    p.mouthW = 1.25;
                    p.browTilt = 0.35;
                } else {
                    // then wide eyes and an "O"
                    p.eyes = 1.25;
                    p.pupil = 0.7;
                    p.mouth = 1;
                    p.mouthW = 0.6;
                    p.browTilt = -0.45;
                    p.browY = 0.04;
                }
            }
            if (o.t >= o.duration) this.once = null;
        }

        // the landing squash
        if (this.squash > 0) {
            this.squash = Math.max(0, this.squash - dt * 4);
            p.sy *= 1 - 0.3 * this.squash;
            p.sx *= 1 + 0.22 * this.squash;
        }

        // tumbling through the air: screaming, flailing
        if (this.flight) {
            p.armL = { x: -0.5 + Math.sin(c * 22) * 0.7, z: -2.3 + Math.cos(c * 19) * 0.4 };
            p.armR = { x: -0.5 - Math.sin(c * 22) * 0.7, z: 2.3 - Math.cos(c * 19) * 0.4 };
            p.eyes = 1.3;
            p.pupil = 0.6;
            p.gaze = 'free';
            p.mouth = 1.3;
            p.mouthW = 1.1;
            p.browTilt = -0.4;
            p.browY = 0.045;
            p.earBack = -1.1;
        }

        // blinking, ear twitches, a wiggling nose
        this.blinkIn -= dt;
        if (this.blinkIn <= 0) {
            this.blink = 0.16;
            this.blinkIn = 1.8 + Math.random() * 3.5;
        }
        if (this.blink > 0) {
            this.blink -= dt;
            p.eyes = Math.min(p.eyes, Math.abs(this.blink - 0.08) / 0.08 * 0.9 + 0.08);
        }
        this.twitchIn -= dt;
        if (this.twitchIn <= 0) {
            this.twitch = 0.25;
            this.twitchSide = Math.random() < 0.5 ? 0 : 1;
            this.twitchIn = 2 + Math.random() * 5;
        }
        if (this.twitch > 0) this.twitch -= dt;
        this.wiggleIn -= dt;
        if (this.wiggleIn <= 0) {
            this.wiggle = 0.6;
            this.wiggleIn = 2.5 + Math.random() * 5;
        }
        if (this.wiggle > 0) this.wiggle -= dt;
        return p;
    }

    /** The idle fidgets: yawning, scratching, hiccups, a look at the player, polishing the helmet, sneezing, a raspberry, a big stretch. */
    fidgetPose(p, dt) {
        const f = this.fidget;
        f.t += dt;
        const k = Math.min(1, f.t / f.d);
        const env = Math.sin(Math.PI * k);
        switch (f.name) {
            case 'yawn':
                p.mouth = 0.26 + 1.15 * env;
                p.mouthW = 0.85;
                p.eyes = 1 - 0.9 * env;
                p.headX = -0.35 * env;
                p.armL = { x: -0.3, z: -0.4 - 2.2 * env };
                p.armR = { x: -0.3, z: 0.4 + 2.2 * env };
                p.sy *= 1 + 0.07 * env;
                p.browY = 0.025 * env;
                p.earBack = -0.12 - 0.35 * env;
                if (!f.said && k > 0.3) {
                    f.said = true;
                    this.quip('yawn', 0.2);
                }
                break;
            case 'scratch': {
                // a good scratch behind the ear: blissful face, the leg would do it too if it could
                const s = Math.sin(f.t * 34);
                p.armR = { x: -0.5, z: 2.55 + s * 0.22 };
                p.headZ = -0.32 * env;
                p.roll = -0.1 * env;
                p.eyes = 0.4;
                p.mouth = 0.4;
                p.mouthRot = 0.2;
                p.browY = 0.03;
                p.browTilt = -0.15;
                if (s > 0.9) this.twitch = 0.1;
                break;
            }
            case 'hiccup':
                for (const h of [0.12, 0.5, 0.86]) {
                    const d = (k - h) / 0.09;
                    if (d > 0 && d < 1) {
                        const bump = Math.sin(Math.PI * d);
                        p.y += bump * 0.14;
                        p.sy *= 1 + 0.1 * bump;
                        p.armL = { x: -0.3, z: -0.6 * bump - 0.2 };
                        p.armR = { x: -0.3, z: 0.6 * bump + 0.2 };
                    }
                }
                p.eyes = 1.2;
                p.pupil = 0.8;
                p.browY = 0.04;
                p.mouth = 0.35;
                p.mouthW = 0.5;
                if (!f.said && k > 0.12) {
                    f.said = true;
                    this.quip('hiccup', 0.45);
                }
                break;
            case 'lookcam':
                p.gaze = 'camera';
                p.headY = clamp(this.viewerAngle(), -1.1, 1.1) * env;
                p.headZ = 0.12 * env;
                p.mouth = 0.6;
                p.browY = 0.025;
                p.browSkew = 0.015;
                if (k > 0.25 && k < 0.85) p.armR = { x: -0.4, z: 2.4 + Math.sin(f.t * 10) * 0.35 };
                if (!f.said && k > 0.3) {
                    f.said = true;
                    if (Math.abs(this.viewerAngle()) < 1.4) this.quip('greet', 0.3);
                }
                break;
            case 'polish': {
                const s = Math.sin(f.t * 22);
                p.armL = { x: -0.9, z: -2.45 + s * 0.22 };
                p.headZ = 0.18 * env;
                p.eyes = 0.5;
                p.mouth = 0.35;
                p.helmetRub = s * 0.06 * env;
                p.browY = 0.02;
                break;
            }
            case 'sneeze':
                if (k < 0.6) {
                    const w = k / 0.6;
                    p.headX = -0.4 * w;
                    p.eyes = 1 - 0.85 * w;
                    p.mouth = 0.26 + 0.45 * w;
                    p.browY = 0.03 * w;
                    p.browTilt = -0.3 * w;
                    p.sy *= 1 + 0.05 * w;
                } else {
                    const w = Math.max(0, 1 - (k - 0.6) / 0.4);
                    p.headX = 0.4 * w;
                    p.lean = 0.22 * w;
                    p.eyes = 0.1 + 0.9 * (1 - w);
                    p.mouth = 0.9 * w;
                    p.sy *= 1 - 0.08 * w;
                    if (!f.sneezed) {
                        f.sneezed = true;
                        const at = this.position.clone();
                        at.x += Math.sin(this.yaw) * 0.55;
                        at.z += Math.cos(this.yaw) * 0.55;
                        at.y += 0.75;
                        this.particles()?.emit(at, { count: 10, speed: 1.3, up: 0.2, colors: [0xffffff, 0xeef4ff], life: 0.5, gravity: 0, spread: 0.12, size: 0.18, grow: 1.4, fade: true, drag: 4 });
                        if (Math.random() < 0.5) this.helmetPop = { t: 0, height: 0.22 };
                        this.quip('sneeze', 0.6);
                    }
                }
                break;
            case 'raspberry':
                // tongue out at the player, cross-eyed
                p.gaze = 'cross';
                p.headY = clamp(this.viewerAngle(), -0.9, 0.9) * 0.7 * env;
                p.mouth = 0.75 * env + 0.15;
                p.mouthW = 0.75;
                p.browSkew = 0.03 * env;
                p.browY = 0.02;
                p.headZ = Math.sin(f.t * 16) * 0.08 * env;
                p.earSpread = 0.18 + 0.25 * env;
                break;
            case 'stretch':
                p.armL = { x: -3.0 * env, z: -0.3 };
                p.armR = { x: -3.0 * env, z: 0.3 };
                p.sy *= 1 + 0.12 * env;
                p.sx *= 1 - 0.05 * env;
                p.lean = -0.18 * env;
                p.eyes = 1 - 0.85 * env;
                p.mouth = 0.26 + 0.4 * env;
                p.earBack = -0.12 - 0.3 * env;
                break;
        }
        if (f.t >= f.d) {
            this.fidget = null;
            this.fidgetIn = 3.5 + Math.random() * 6;
        }
    }

    /** Arms holding the weapon of the bunny, the weapon tilted by the pitch. */
    weaponArms(p, pitch) {
        switch (this.weaponKind) {
            case 'Grenade':
                p.armR = { x: -1.1 - pitch * 0.5, z: 0.25 };
                p.armL = { x: -0.5, z: -0.35 };
                break;
            case 'Airstrike':
                p.armR = { x: -0.6, z: 2.1 };
                p.armL = { x: -0.4, z: -0.3 };
                p.headZ = 0.22;
                break;
            case 'Cluster':
                p.armL = { x: -1.45 - pitch * 0.4, z: 0.4 };
                p.armR = { x: -1.45 - pitch * 0.4, z: -0.4 };
                break;
            default: // bazooka and shotgun: both paws on it
                p.armR = { x: -1.35 - pitch * 0.85, z: 0.12 };
                p.armL = { x: -1.45 - pitch * 0.85, z: -0.5 };
                break;
        }
    }

    firePose(p, k) {
        switch (this.weaponKind) {
            case 'Grenade':
            case 'Cluster': {
                // a throw: wind up, swing, follow through; the projectile leaves the paw at the swing
                const swing = k < 0.3 ? -k / 0.3 : Math.min(1, (k - 0.3) / 0.25);
                const arm = k < 0.3 ? 1.0 + 1.6 * (k / 0.3) : 2.6 - 4.4 * swing;
                p.armR = { x: -arm, z: 0.2 };
                if (this.weaponKind === 'Cluster') p.armL = { x: -arm, z: -0.2 };
                p.lean = k < 0.3 ? -0.2 : 0.25 * swing;
                p.weapon = k < 0.32;
                p.weaponPitch = 0.9;
                p.mouth = k < 0.3 ? 0.3 : 0.95;
                p.browTilt = 0.45;
                p.eyes = k < 0.3 ? 0.7 : 1.1;
                break;
            }
            case 'Airstrike':
                p.weapon = true;
                p.armR = { x: -0.6, z: 2.1 };
                p.headZ = 0.25 + Math.sin(k * 30) * 0.05;
                p.headX = -0.1;
                p.armL = { x: -0.3, z: -1.6 + Math.sin(k * 25) * 0.4 }; // pointing and calling
                p.mouth = 0.3 + Math.abs(Math.sin(k * 32)) * 0.6;
                p.browY = 0.02;
                break;
            default: {
                // a kick back
                const kick = Math.max(0, 1 - k * 2.5);
                p.weapon = true;
                p.kick = kick;
                p.lean -= 0.3 * kick;
                p.sy *= 1 - 0.1 * kick;
                p.sx *= 1 + 0.06 * kick;
                p.weaponPitch = this.aimPitch + 0.3 * kick;
                this.weaponArms(p, p.weaponPitch);
                p.earBack = -0.7 * kick - 0.1;
                p.eyes = kick > 0.2 ? 0.25 : 1.15;
                p.mouth = 0.4 + 0.7 * kick;
                p.mouthW = 1.2;
                p.browTilt = 0.5;
                break;
            }
        }
    }

    apply(p, dt) {
        const m = this.model;
        m.position.y = -0.5 + p.y;
        m.scale.set(p.sx, p.sy, p.sx);
        m.rotation.x = smooth(m.rotation.x, p.lean, 14, dt);
        m.rotation.z = smooth(m.rotation.z, p.roll, 14, dt);
        m.rotation.y = this.yaw + p.twist;

        this.neck.rotation.x = smooth(this.neck.rotation.x, p.headX, 10, dt);
        this.headYaw = smooth(this.headYaw, p.headY, 6, dt);
        this.neck.rotation.y = this.headYaw;
        this.neck.rotation.z = smooth(this.neck.rotation.z, p.headZ, 10, dt);

        const [armL, armR] = this.arms;
        armL.rotation.x = smooth(armL.rotation.x, p.armL.x, 16, dt);
        armL.rotation.z = smooth(armL.rotation.z, p.armL.z, 16, dt);
        armR.rotation.x = smooth(armR.rotation.x, p.armR.x, 16, dt);
        armR.rotation.z = smooth(armR.rotation.z, p.armR.z, 16, dt);

        if (p.weapon && !this.weapon) this.showWeapon(this.weaponKind ?? 'Projectile');
        if (this.weapon) {
            this.weapon.visible = p.weapon;
            this.weaponPivot.rotation.x = smooth(this.weaponPivot.rotation.x, -p.weaponPitch, 16, dt);
            this.weaponPivot.position.z = 0.22 - p.kick * 0.12;
        }
        this.snack.visible = p.snack;
        if (p.snack) this.snack.scale.setScalar(0.85 + 0.15 * Math.abs(Math.sin(this.animTime * 0.7)));

        // the vertical acceleration shakes the ear tips and the pupils
        const v = (m.position.y - this.prevY) / Math.max(dt, 1e-3);
        const accel = (v - this.prevV) / Math.max(dt, 1e-3);
        this.prevY = m.position.y;
        this.prevV = v;
        for (const ear of this.earNodes) {
            const i = ear.side < 0 ? 0 : 1;
            const twitch = this.twitch > 0 && this.twitchSide === i ? Math.sin(this.twitch * 40) * 0.25 : 0;
            ear.base.rotation.x = smooth(ear.base.rotation.x, p.earBack + twitch, 12, dt);
            ear.base.rotation.z = -ear.side * p.earSpread;
            const flop = this.flopEar && i === 1;
            const target = flop ? 0.35 : 0.05;
            const push = Math.max(-40, Math.min(40, -accel * 0.9)) - (this.flight ? 30 : 0);
            ear.tip.rotation.x = this.ears[i].step(dt, target, push);
            ear.tip.rotation.z = flop ? -1.05 : -ear.side * 0.05;
        }

        this.applyFace(p, dt, accel);

        // the helmet: askew, rubbed, or popping off after a hit
        let hy = 0.23, hrx = -0.22, hrz = 0.09 + p.helmetRub;
        if (this.helmetPop) {
            const hp = this.helmetPop;
            hp.t += dt;
            const k = hp.t / 0.95;
            if (k < 0.62) {
                const u = k / 0.62;
                hy += Math.sin(Math.PI * u) * hp.height;
                hrx -= u * Math.PI * 2; // a full flip
            } else {
                const u = (k - 0.62) / 0.38;
                hy += Math.abs(Math.sin(u * Math.PI * 2)) * 0.05 * (1 - u);
                hrz += Math.sin(u * 20) * 0.35 * (1 - u);
            }
            if (k >= 1) this.helmetPop = null;
        }
        this.helmet.position.y = hy;
        this.helmet.rotation.x = hrx;
        this.helmet.rotation.z = hrz;

        // laser eyes fire while aiming, cheering and dancing (flickering)
        if (this.beams) {
            const on = this.clock < this.aimUntil || this.weaponHeld || this.anim === 'cheer' || this.anim === 'dance';
            const len = 1.6 + Math.sin(this.clock * 40) * 0.25;
            for (const beam of this.beams) {
                beam.visible = on;
                beam.scale.set(1 + Math.sin(this.clock * 55) * 0.3, 1 + Math.sin(this.clock * 55) * 0.3, len);
            }
        }

        // dizzy stars
        const dizzy = this.dizzy > 0 || this.once?.name === 'hurt';
        this.stars.visible = dizzy;
        if (dizzy) {
            this.stars.rotation.y += dt * 5;
            this.stars.position.y = 0.52 + Math.sin(this.clock * 6) * 0.03;
            const s = Math.min(1, this.dizzy * 1.5 + 0.2);
            this.stars.scale.setScalar(s);
        }

        // soot fades, the red flash of a hit
        if (this.soot > 0) this.soot = Math.max(0, this.soot - dt * 0.12);
        const soot = this.soot * 0.7;
        this.furMaterial.color.setRGB(1 - soot, 1 - soot * 1.02, 1 - soot * 1.05);
        if (this.flash > 0) {
            this.flash = Math.max(0, this.flash - dt * 2.2);
            this.furMaterial.emissive.setRGB(0.9 * this.flash, 0.05 * this.flash, 0.05 * this.flash);
        }

        if (this.flight) {
            this.flight.angle += dt * Math.min(16, 4 + this.flight.speed * 1.2);
            this.spinner.quaternion.setFromAxisAngle(this.flight.axis, this.flight.angle);
        }
    }

    /** Eyes (blink, wide, googly pupils that look somewhere), brows, mouth and nose. */
    applyFace(p, dt, accel) {
        const open = p.eyes;
        this.eyes.scale.y = smooth(this.eyes.scale.y, Math.min(open, 1.3), 30, dt);
        this.eyes.scale.x = smooth(this.eyes.scale.x, open > 1 ? 1 + (open - 1) * 0.5 : 1, 20, dt);

        // where the pupils want to be (−1 .. 1 in the eyeball)
        let tx = this.glanceX, ty = this.glanceY;
        let tx2 = null, ty2 = null;
        switch (p.gaze) {
            case 'forward':
                tx = 0;
                ty = p.gazeY;
                break;
            case 'camera': {
                const rel = this.viewerAngle(p.twist + this.headYaw);
                if (Math.cos(rel) > 0.05) {
                    tx = clamp(Math.sin(rel) * 1.5, -1, 1);
                    const dx = viewer.x - this.position.x, dz = viewer.z - this.position.z;
                    ty = clamp(Math.atan2(viewer.y - this.position.y - 0.9, Math.hypot(dx, dz)) * 1.4, -0.9, 0.9);
                }
                break;
            }
            case 'dizzy': {
                const a = this.clock * 11;
                tx = Math.cos(a) * 0.85;
                ty = Math.sin(a) * 0.85;
                tx2 = Math.cos(-a + 1) * 0.85;
                ty2 = Math.sin(-a + 1) * 0.85;
                break;
            }
            case 'cross':
                tx = 0.85;
                tx2 = -0.85;
                ty = ty2 = -0.1;
                break;
            default:
                if (this.flight) {
                    tx = Math.sin(this.clock * 17) * 0.8;
                    ty = Math.cos(this.clock * 13) * 0.8;
                }
                break;
        }
        const push = clamp(-accel * 1.8, -120, 120);
        for (let i = 0; i < 2; i++) {
            const spring = this.pupilSprings[i];
            spring.step(dt, i === 0 ? tx : tx2 ?? tx, i === 0 ? ty : ty2 ?? ty, push);
            const pupil = this.pupils[i];
            pupil.position.x = (i === 0 ? -EYE_X : EYE_X) + spring.x * 0.034;
            pupil.position.y = spring.y * 0.04;
            const size = smooth(pupil.scale.x, p.pupil, 12, dt);
            pupil.scale.set(size, size, 1);
        }

        for (const brow of this.brows) {
            const s = brow.userData.side;
            brow.position.y = smooth(brow.position.y, BROW_Y + p.browY + (open > 1 ? (open - 1) * 0.06 : 0) + s * p.browSkew, 14, dt);
            brow.rotation.z = smooth(brow.rotation.z, s * p.browTilt, 14, dt);
        }

        this.mouth.scale.y = smooth(this.mouth.scale.y, Math.max(0.26, p.mouth), 18, dt);
        this.mouth.scale.x = smooth(this.mouth.scale.x, p.mouthW, 14, dt);
        this.mouth.rotation.z = smooth(this.mouth.rotation.z, p.mouthRot, 12, dt);
        this.mouth.position.x = smooth(this.mouth.position.x, p.mouthX, 12, dt);
        this.nose.scale.setScalar(this.wiggle > 0 ? 1 + Math.abs(Math.sin(this.wiggle * 26)) * 0.2 : 1);
    }

    updateDead(dt) {
        if (this.dying) {
            const d = this.dying;
            d.t += dt;
            const fall = Math.min(1, d.t / 0.45);
            this.model.rotation.z = (Math.PI / 2) * easeOutBack(fall) * 0.95;
            this.model.position.y = -0.5 - fall * 0.12;
            this.eyes.scale.y = 0.08;
            this.mouth.scale.set(0.9, 0.6, 1); // the tongue hangs out
            this.mouth.rotation.z = 0.3;
            this.furMaterial.emissive.setRGB(0, 0, 0);
            if (d.t > 0.6 && !this.ghost) {
                this.ghost = ghostModel();
                this.ghost.position.set(0, 0.6, 0);
                this.root.add(this.ghost);
                const particles = this.particles();
                particles?.emit(this.position.clone().add(new THREE.Vector3(0, 0.5, 0)), { count: 14, speed: 1.4, up: 1, colors: [0xffffff, 0xfff4c2], life: 0.8, gravity: -0.1, size: 0.25, fade: true, additive: true });
            }
            if (d.t > 0.6) {
                const s = Math.max(0, 1 - (d.t - 0.6) / 0.3);
                this.model.scale.setScalar(Math.max(0.001, s));
                if (s <= 0) this.model.visible = false;
                const g = Math.min(1, (d.t - 0.65) / 0.45);
                if (g > 0) this.grave.scale.setScalar(Math.max(0.001, easeOutBack(g)));
            }
            if (this.ghost) {
                const k = (d.t - 0.6) / 1.8;
                this.ghost.position.y = 0.6 + k * 1.9;
                this.ghost.position.x = Math.sin(k * 9) * 0.15;
                this.ghost.rotation.y += dt * 1.5;
                const wings = this.ghost.userData.wings;
                if (wings) for (const w of wings) w.rotation.y = w.userData.side * (0.3 + Math.sin(d.t * 18) * 0.5);
                for (const mat of this.ghost.userData.materials) mat.opacity = Math.max(0, (1 - k) * (mat === this.ghost.userData.materials[2] ? 0.95 : 0.75));
                if (k >= 1) {
                    this.root.remove(this.ghost);
                    for (const mat of this.ghost.userData.materials) mat.dispose();
                    this.ghost = null;
                    this.dying = null;
                    this.grave.scale.setScalar(1);
                }
            }
        }
        if (this.sinking) {
            const s = this.sinking;
            s.t += dt;
            this.model.position.y = -0.5 - s.t * 1.2;
            this.model.rotation.y += dt * 3;
            this.eyes.scale.y = 1.25;
            this.mouth.scale.set(0.6, 1, 1);
            if (s.t < 1.2 && Math.random() < dt * 14) {
                this.particles()?.emit(this.position.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.4, 0.05, (Math.random() - 0.5) * 0.4)), { count: 2, speed: 0.3, up: 1.2, colors: [0xffffff, 0xd6eefc], life: 0.6, gravity: -0.2, size: 0.12, fade: true });
            }
            if (s.t > 1.2) {
                this.model.visible = false;
                this.sinking = null;
            }
        }
    }

    dispose() {
        if (this.ghost) for (const mat of this.ghost.userData.materials) mat.dispose();
        this.root.parent?.remove(this.root);
        this.label.dispose();
        this.bubble?.dispose();
        this.furMaterial.dispose();
    }
}

// ---------------------------------------------------------------- the speech bubble

/** A cartoon speech bubble: a canvas texture on a sprite above the head (above the label when it shows), pops in and fades out. */
class Bubble {
    constructor(bunny) {
        this.bunny = bunny;
        this.canvas = document.createElement('canvas');
        this.canvas.width = 512;
        this.canvas.height = 256;
        this.texture = new THREE.CanvasTexture(this.canvas);
        this.texture.colorSpace = THREE.SRGBColorSpace;
        this.texture.anisotropy = 4;
        this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.texture, depthTest: false, transparent: true }));
        this.sprite.renderOrder = 11;
        this.sprite.center.set(0.14, 0);
        this.sprite.visible = false;
        this.base = new THREE.Vector2(2.5, 2.5 * 256 / 512);
        this.active = false;
        this.time = 0;
        this.duration = 0;
        this.text = '';
        this.sprite.onBeforeRender = (renderer, scene, camera) => {
            const d = camera.position.distanceTo(this.sprite.getWorldPosition(tmpVector));
            // keeps nearly the same size on the screen, so a quip is readable from the aim camera too
            const k = Math.max(0.8, Math.min(4, d / 10));
            const t = this.time;
            const pop = t < 0.22 ? Math.max(0.01, easeOutBack(t / 0.22)) : 1;
            this.sprite.scale.set(this.base.x * k * pop, this.base.y * k * pop, 1);
            const b = this.bunny;
            const labelShown = b.alive && !b.labelHidden;
            this.sprite.position.set(0.1, labelShown ? 1.92 + 0.46 * k : 1.55 + 0.15 * k, 0);
            this.sprite.updateMatrixWorld();
        };
        labels.add(this);
    }

    show(text, seconds) {
        this.text = text;
        this.time = 0;
        this.duration = Math.max(0.8, seconds);
        this.active = true;
        this.sprite.visible = true;
        this.sprite.material.opacity = 1;
        this.draw();
    }

    update(dt) {
        if (!this.active) return;
        this.time += dt;
        const left = this.duration - this.time;
        this.sprite.material.opacity = Math.max(0, Math.min(1, left / 0.3));
        if (left <= 0) {
            this.active = false;
            this.sprite.visible = false;
        }
    }

    /** Wraps the text into at most three lines that fit the bubble. */
    lines(c, text, width) {
        const words = text.split(/\s+/);
        const lines = [];
        let line = '';
        for (const w of words) {
            const next = line ? `${line} ${w}` : w;
            if (c.measureText(next).width > width && line) {
                lines.push(line);
                line = w;
            } else {
                line = next;
            }
        }
        if (line) lines.push(line);
        return lines.slice(0, 3);
    }

    draw() {
        if (!this.text) return;
        const c = this.canvas.getContext('2d');
        const W = 512, H = 256;
        c.clearRect(0, 0, W, H);
        c.lineJoin = 'round';
        let size = 44;
        c.font = `${size}px ${FONT}`;
        let lines = this.lines(c, this.text, 400);
        if (lines.length > 2) {
            size = 36;
            c.font = `${size}px ${FONT}`;
            lines = this.lines(c, this.text, 420);
        }
        const lh = size * 1.08;
        const tw = Math.max(...lines.map(l => c.measureText(l).width));
        const bw = Math.min(W - 16, tw + 60), bh = lines.length * lh + 34;
        const tail = 34;
        const bx = 8, by = H - tail - bh - 6;
        // the shadow, the bubble with its tail (down to the anchor at x = 14 % of the canvas)
        const ax = W * 0.14;
        const path = () => {
            const r = Math.min(34, bh / 2);
            c.beginPath();
            c.moveTo(bx + r, by);
            c.arcTo(bx + bw, by, bx + bw, by + bh, r);
            c.arcTo(bx + bw, by + bh, bx, by + bh, r);
            c.lineTo(ax + 30, by + bh);
            c.lineTo(ax - 8, H - 6);
            c.lineTo(ax + 4, by + bh);
            c.arcTo(bx, by + bh, bx, by, r);
            c.arcTo(bx, by, bx + bw, by, r);
            c.closePath();
        };
        c.save();
        c.translate(0, 5);
        path();
        c.fillStyle = 'rgba(40,24,10,0.35)';
        c.fill();
        c.restore();
        path();
        c.fillStyle = '#fff7e2';
        c.fill();
        c.lineWidth = 7;
        c.strokeStyle = '#4a2c14';
        c.stroke();
        // a gloss on top
        c.beginPath();
        c.ellipse(bx + bw * 0.32, by + 14, bw * 0.22, 6, 0, 0, Math.PI * 2);
        c.fillStyle = 'rgba(255,255,255,0.8)';
        c.fill();
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillStyle = '#4a2c14';
        lines.forEach((l, i) => c.fillText(l, bx + bw / 2, by + 17 + lh * (i + 0.5) + 2));
        this.texture.needsUpdate = true;
    }

    dispose() {
        labels.delete(this);
        this.sprite.parent?.remove(this.sprite);
        this.texture.dispose();
        this.sprite.material.dispose();
    }
}

// ---------------------------------------------------------------- the marker of the turn

function arrowGeometry() {
    return cached('arrow', () => {
        const s = new THREE.Shape();
        s.moveTo(0, 0);
        s.lineTo(0.3, 0.32);
        s.lineTo(0.12, 0.32);
        s.lineTo(0.12, 0.62);
        s.lineTo(-0.12, 0.62);
        s.lineTo(-0.12, 0.32);
        s.lineTo(-0.3, 0.32);
        s.closePath();
        const g = new THREE.ExtrudeGeometry(s, { depth: 0.1, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.035, bevelSegments: 2 });
        g.translate(0, 0, -0.05);
        return g;
    });
}

/** The marker of the bunny whose turn it is: a bouncing chunky arrow in the team colour and a glowing ring on the ground. */
export class TurnMarker {
    constructor() {
        this.mesh = new THREE.Group();
        this.material = new THREE.MeshStandardMaterial({ color: 0xc2410c, emissive: 0x401000, roughness: 0.35, metalness: 0.1 });
        this.arrow = new THREE.Mesh(arrowGeometry(), this.material);
        this.arrow.castShadow = true;
        this.outline = new THREE.Mesh(arrowGeometry(), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide }));
        this.outline.scale.setScalar(1.12);
        this.outline.position.set(0, -0.03, 0);
        this.pointer = new THREE.Group();
        this.pointer.add(this.arrow, this.outline);
        this.ringMaterial = new THREE.MeshBasicMaterial({ map: softRing(), color: 0xc2410c, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.9 });
        this.ring = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), this.ringMaterial);
        this.ring.rotation.x = -Math.PI / 2;
        this.ring.renderOrder = 3;
        this.mesh.add(this.pointer, this.ring);
        this.mesh.visible = false;
        this.time = 0;
    }

    attach(bunny) {
        if (!bunny || !bunny.alive) {
            this.mesh.visible = false;
            this.bunny = null;
            return;
        }
        this.bunny = bunny;
        this.material.color.set(bunny.color);
        this.material.emissive.set(bunny.color).multiplyScalar(0.35);
        this.ringMaterial.color.set(bunny.color);
        this.mesh.visible = true;
        this.time = 0;
    }

    update(dt) {
        if (!this.bunny || !this.bunny.alive) {
            this.mesh.visible = false;
            return;
        }
        this.time += dt;
        const p = this.bunny.position;
        const bounce = Math.abs(Math.sin(this.time * 3.4));
        // a speech bubble of the bunny pushes the arrow up
        this.lift = smooth(this.lift ?? 0, this.bunny.bubble?.active ? 1.0 : 0, 6, dt);
        this.pointer.position.set(p.x, p.y + 2.55 + this.lift + bounce * 0.32, p.z);
        this.pointer.rotation.y += dt * 1.8;
        const squash = bounce < 0.15 ? 1 - (0.15 - bounce) * 1.5 : 1;
        this.pointer.scale.set(1 / squash, squash, 1 / squash);
        this.ring.position.set(p.x, p.y + 0.06, p.z);
        const pulse = 1 + Math.sin(this.time * 4) * 0.08;
        this.ring.scale.setScalar(pulse);
        this.ringMaterial.opacity = 0.65 + Math.sin(this.time * 4) * 0.2;
    }
}

// ---------------------------------------------------------------- the label

const labels = new Set();
if (typeof document !== 'undefined' && document.fonts) {
    // the cartoon font may arrive after the first labels were drawn
    document.fonts.addEventListener?.('loadingdone', () => labels.forEach(l => l.draw()));
    document.fonts.ready?.then(() => labels.forEach(l => l.draw()));
}

const FONT = '"Lilita One", "Trebuchet MS", "Segoe UI", sans-serif';

/** Name and health above a bunny: a canvas texture on a sprite that keeps a readable size from far away. */
class Label {
    constructor(name, color) {
        this.name = name;
        this.color = color;
        this.canvas = document.createElement('canvas');
        this.canvas.width = 512;
        this.canvas.height = 176;
        this.texture = new THREE.CanvasTexture(this.canvas);
        this.texture.colorSpace = THREE.SRGBColorSpace;
        this.texture.anisotropy = 4;
        this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.texture, depthTest: false, transparent: true }));
        this.base = new THREE.Vector2(1.55, 1.55 * 176 / 512);
        this.sprite.scale.set(this.base.x, this.base.y, 1);
        this.sprite.renderOrder = 10;
        this.sprite.center.set(0.5, 0.2);
        // grows a little with the distance so it stays readable
        this.sprite.onBeforeRender = (renderer, scene, camera) => {
            const d = camera.position.distanceTo(this.sprite.getWorldPosition(tmpVector));
            const k = Math.max(0.85, Math.min(2.6, d / 13));
            this.sprite.scale.set(this.base.x * k, this.base.y * k, 1);
            this.sprite.updateMatrixWorld();
        };
        this.health = 0;
        this.max = 1;
        this.shown = 0; // the bar as drawn (animates to health)
        this.ghost = 0; // the white part that follows later
        this.hold = 0;
        labels.add(this);
    }

    set(health, max, now = false) {
        if (health < this.health) this.hold = 0.45;
        this.health = health;
        this.max = Math.max(1, max);
        if (now) {
            this.shown = health;
            this.ghost = health;
        }
        this.draw();
    }

    update(dt) {
        if (Math.abs(this.shown - this.health) < 0.05 && Math.abs(this.ghost - this.health) < 0.05) return;
        this.shown = smooth(this.shown, this.health, 8, dt);
        if (this.hold > 0) this.hold -= dt;
        else this.ghost = smooth(this.ghost, this.health, 5, dt);
        if (this.ghost < this.shown) this.ghost = this.shown;
        this.draw();
    }

    draw() {
        const c = this.canvas.getContext('2d');
        const W = 512;
        c.clearRect(0, 0, W, 176);
        c.lineJoin = 'round';
        // the name in a pill of the team colour
        c.font = `48px ${FONT}`;
        const text = this.name;
        const tw = Math.min(400, c.measureText(text).width);
        const pw = tw + 56, ph = 66, px = (W - pw) / 2, py = 6;
        roundRect(c, px, py + 5, pw, ph, 33, 'rgba(40,24,10,0.45)');
        roundRect(c, px, py, pw, ph, 33, this.color, 'rgba(40,24,10,0.9)', 6);
        roundRect(c, px + 8, py + 6, pw - 16, ph * 0.38, 18, 'rgba(255,255,255,0.22)');
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.lineWidth = 9;
        c.strokeStyle = 'rgba(40,24,10,0.85)';
        c.strokeText(text, W / 2, py + ph / 2 + 3, 400);
        c.fillStyle = '#ffffff';
        c.fillText(text, W / 2, py + ph / 2 + 3, 400);
        // the health bar
        const bx = 106, by = 92, bw = 300, bh = 46;
        roundRect(c, bx, by + 5, bw, bh, 23, 'rgba(40,24,10,0.45)');
        roundRect(c, bx, by, bw, bh, 23, '#2a1c10', 'rgba(40,24,10,0.95)', 5);
        const share = Math.max(0, Math.min(1, this.shown / this.max));
        const ghost = Math.max(0, Math.min(1, this.ghost / this.max));
        const inner = bw - 12;
        if (ghost > share) roundRect(c, bx + 6, by + 6, Math.max(18, inner * ghost), bh - 12, 17, '#fff2c4');
        if (share > 0) {
            const col = share > 0.55 ? ['#7ee05a', '#3fae2a'] : share > 0.28 ? ['#ffe066', '#f0a800'] : ['#ff7a6a', '#d92b1f'];
            const grad = c.createLinearGradient(0, by, 0, by + bh);
            grad.addColorStop(0, col[0]);
            grad.addColorStop(1, col[1]);
            roundRect(c, bx + 6, by + 6, Math.max(18, inner * share), bh - 12, 17, grad);
            roundRect(c, bx + 12, by + 9, Math.max(8, inner * share - 12), (bh - 12) * 0.32, 8, 'rgba(255,255,255,0.35)');
        }
        c.font = `34px ${FONT}`;
        c.lineWidth = 7;
        c.strokeStyle = 'rgba(40,24,10,0.9)';
        const hp = String(Math.max(0, Math.round(this.health)));
        c.strokeText(hp, W / 2, by + bh / 2 + 2);
        c.fillStyle = '#ffffff';
        c.fillText(hp, W / 2, by + bh / 2 + 2);
        // a little heart at the left
        heart(c, bx - 4, by + bh / 2, 26);
        this.texture.needsUpdate = true;
    }

    dispose() {
        labels.delete(this);
        this.texture.dispose();
        this.sprite.material.dispose();
    }
}

const tmpVector = new THREE.Vector3();

function heart(c, x, y, s) {
    c.save();
    c.translate(x, y);
    c.beginPath();
    c.moveTo(0, s * 0.35);
    c.bezierCurveTo(-s * 0.9, -s * 0.2, -s * 0.45, -s * 0.85, 0, -s * 0.38);
    c.bezierCurveTo(s * 0.45, -s * 0.85, s * 0.9, -s * 0.2, 0, s * 0.35);
    c.closePath();
    c.fillStyle = '#ff4d6d';
    c.lineWidth = 5;
    c.strokeStyle = 'rgba(40,24,10,0.95)';
    c.stroke();
    c.fill();
    c.beginPath();
    c.arc(-s * 0.22, -s * 0.3, s * 0.12, 0, Math.PI * 2);
    c.fillStyle = 'rgba(255,255,255,0.7)';
    c.fill();
    c.restore();
}

function roundRect(c, x, y, w, h, r, fill, stroke, lineWidth) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
    if (fill) {
        c.fillStyle = fill;
        c.fill();
    }
    if (stroke) {
        c.lineWidth = lineWidth ?? 4;
        c.strokeStyle = stroke;
        c.stroke();
    }
}
