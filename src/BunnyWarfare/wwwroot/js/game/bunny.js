// The bunnies: a fluffy stylised model from primitives with procedural animations, a label with name and health,
// the marker of the turn, the gravestone and the little ghost of a knocked-out bunny.
//
// Public API (used by world.js, main.js, playback.js and the menu):
//   new Bunny(dto, team)            dto = BunnyDto ({ id, team, name, x, y, z, yaw, health, maxHealth }), team = TeamDto ({ color })
//   .root .position .goal .yaw .goalYaw .moving .alive .grave .color .id .team .name
//   setHealth(health)               the label's bar animates to it
//   snap(x, y, z, yaw?)             puts the bunny there at once
//   walkTo(x, y, z, yaw)            walks smoothly (hops) to a position
//   die(animate = true)             falls over, a ghost rises, the gravestone grows (animate = false: just the gravestone)
//   sink()                          drowned: sinks with bubbles, no gravestone
//   setAim(points, color)           the dotted aim line (null hides it); also puts the bunny into its aim pose and tilts the weapon
//   update(dt, time) sync() dispose()
//   play(name)                      'idle' | 'walk' | 'aim' | 'cheer' | 'dance' | 'wave' | 'eat' (loops) · 'fire' | 'hurt' (once, then back)
//   setWeapon(kind | null)          holds a weapon: 'Projectile' (carrot bazooka), 'Grenade' (beet), 'Cluster' (cabbage), 'Hitscan' (dandelion shotgun),
//                                   'Airstrike' (radio); null puts it away (it still shows while aiming)
//   setAimPitch(rad)                tilts the weapon and the arms (setAim does it from the line by itself)
//   lookAt(x, z)                    turns the bunny towards a point
//   hurt(amount?)                   flinch and a red flash (the playback calls it on damage)
//   setFlight(vx, vy, vz) / land()  tumbling through the air along a knockback track, the landing squash
//   attachFx(particles)             where the dust of the hops and the bubbles go (default: the Particles created last)
//   showLabel(visible)              the name and health above the head (the menu hides them)
// TurnMarker: new TurnMarker() · .mesh · attach(bunny | null) · update(dt)
import * as THREE from 'three';
import { paint, merge, sphere, fluffySphere, limb, softRing } from './fx/shapes.js';
import { weaponModel, snackModel, gravestoneModel, ghostModel } from './fx/props.js';
import { activeParticles } from './effects.js';

// ---------------------------------------------------------------- looks

/** Fur colours: every bunny gets one (by its id), the team shows on the helmet and the scarf. */
const FURS = [
    { fur: '#f4efe7', shade: '#d8cdbf', belly: '#fffaf3', inner: '#f5a9b8' }, // snow white
    { fur: '#d9a46c', shade: '#b07a46', belly: '#f8e6cc', inner: '#f2a0a8' }, // caramel
    { fur: '#b3aca6', shade: '#8a827c', belly: '#ebe6e1', inner: '#eea2b1' }, // grey
    { fur: '#efdfc0', shade: '#cdb48a', belly: '#fffaf0', inner: '#f5aab4' }, // cream
    { fur: '#9a7253', shade: '#6f4f37', belly: '#e2cbb0', inner: '#e79aa4' }, // brown
    { fur: '#6b6460', shade: '#4a4441', belly: '#b9b1aa', inner: '#e3909e' }, // dark
];

const C = { nose: '#ff7c96', teeth: '#ffffff', whisker: '#3b302a', blush: '#ff9cad', pad: '#f6a7b5', pack: '#7b6a3c', packDark: '#544826', strap: '#3e4826' };

const geometryCache = new Map();
function cached(key, make) {
    if (!geometryCache.has(key)) geometryCache.set(key, make());
    return geometryCache.get(key);
}

/** Body: fluffy belly, haunches, feet with pink pads, the cotton tail and a little backpack with a carrot in it. Origin at the feet. */
function bodyGeometry(f) {
    return cached(`body-${f.fur}`, () => {
        const parts = [];
        const r = 0.33;
        const body = fluffySphere(r, 0.07, 1.7, 24, 18);
        body.scale(1, 1.06, 0.98);
        paint(body, (x, y, z) => (z > r * 0.32 && y < r * 0.55 && Math.abs(x) < r * 0.7 ? f.belly : y < -r * 0.62 ? f.shade : f.fur));
        body.translate(0, 0.42, 0);
        parts.push(body);
        for (const s of [-1, 1]) {
            const haunch = fluffySphere(0.17, 0.08, 4 + s, 14, 10);
            haunch.scale(0.9, 1, 1.15);
            haunch.translate(s * 0.2, 0.22, -0.06);
            paint(haunch, (x, y) => (y < 0.12 ? f.shade : f.fur));
            parts.push(haunch);
            const foot = sphere(0.1, 12, 8);
            foot.scale(0.85, 0.5, 1.75);
            foot.translate(s * 0.16, 0.05, 0.1);
            paint(foot, (x, y, z) => (z > 0.24 && y < 0.06 ? f.belly : f.shade));
            parts.push(foot);
            const pad = sphere(0.04, 8, 6);
            pad.scale(1, 0.35, 1);
            pad.translate(s * 0.16, 0.015, 0.2);
            paint(pad, C.pad);
            parts.push(pad);
        }
        // the cotton tail: a cluster of puffs
        for (const [x, y, z, rr] of [[0, 0.34, -0.36, 0.09], [0.05, 0.38, -0.34, 0.06], [-0.05, 0.37, -0.35, 0.065], [0, 0.29, -0.33, 0.06], [0.02, 0.4, -0.31, 0.05]]) {
            const puff = fluffySphere(rr, 0.12, x * 40, 10, 8);
            puff.translate(x, y, z);
            paint(puff, f.belly);
            parts.push(puff);
        }
        // the backpack with a carrot
        const pack = new THREE.BoxGeometry(0.24, 0.22, 0.11, 2, 2, 1);
        pack.translate(0, 0.52, -0.33);
        paint(pack, (x, y) => (y > 0.6 ? C.packDark : C.pack));
        const flap = new THREE.BoxGeometry(0.25, 0.06, 0.12);
        flap.translate(0, 0.62, -0.33);
        paint(flap, C.packDark);
        const carrot = new THREE.ConeGeometry(0.032, 0.2, 7);
        carrot.rotateX(Math.PI);
        carrot.rotateZ(0.3);
        carrot.translate(0.07, 0.66, -0.34);
        paint(carrot, '#f07a1a');
        const top = new THREE.ConeGeometry(0.03, 0.08, 4);
        top.rotateZ(0.3);
        top.translate(0.1, 0.79, -0.34);
        paint(top, '#4f9e2f');
        parts.push(pack, flap, carrot, top);
        for (const s of [-1, 1]) {
            const strap = new THREE.TorusGeometry(0.2, 0.014, 4, 12, Math.PI * 0.9);
            strap.rotateY(Math.PI / 2);
            strap.rotateX(-0.25);
            strap.translate(s * 0.13, 0.5, -0.1);
            paint(strap, C.strap);
            parts.push(strap);
        }
        return merge(parts);
    });
}

/** Head (origin at its centre): fluffy head, cheeks, muzzle, buck teeth, whiskers, blush and the chin strap of the helmet. */
function headGeometry(f) {
    return cached(`head-${f.fur}`, () => {
        const parts = [];
        const head = fluffySphere(0.26, 0.05, 2.3, 22, 16);
        head.scale(1.05, 0.95, 1);
        paint(head, (x, y, z) => (z > 0.17 && y < 0.02 ? f.belly : y > 0.18 ? f.shade : f.fur));
        parts.push(head);
        for (const s of [-1, 1]) {
            const cheek = fluffySphere(0.115, 0.1, s * 3, 12, 9);
            cheek.translate(s * 0.12, -0.08, 0.13);
            paint(cheek, f.belly);
            const blush = sphere(0.045, 8, 6);
            blush.scale(1.2, 0.7, 0.4);
            blush.translate(s * 0.16, -0.045, 0.205);
            paint(blush, C.blush);
            parts.push(cheek, blush);
            for (let w = 0; w < 3; w++) {
                const whisker = new THREE.CylinderGeometry(0.0035, 0.002, 0.2, 3);
                whisker.rotateZ(s * (Math.PI / 2 - 0.12 + w * 0.12));
                whisker.rotateY(-s * 0.25);
                whisker.translate(s * 0.15, -0.06 - w * 0.02 + 0.02, 0.24);
                paint(whisker, C.whisker);
                parts.push(whisker);
            }
        }
        const muzzle = sphere(0.085, 12, 8);
        muzzle.scale(1.15, 0.85, 0.9);
        muzzle.translate(0, -0.075, 0.2);
        paint(muzzle, f.belly);
        parts.push(muzzle);
        for (const s of [-1, 1]) {
            const tooth = new THREE.BoxGeometry(0.024, 0.045, 0.014);
            tooth.translate(s * 0.013, -0.145, 0.248);
            paint(tooth, C.teeth);
            parts.push(tooth);
        }
        const mouth = new THREE.BoxGeometry(0.06, 0.008, 0.01);
        mouth.translate(0, -0.118, 0.262);
        paint(mouth, '#7a3b3b');
        parts.push(mouth);
        // the chin strap of the helmet
        const strap = new THREE.TorusGeometry(0.262, 0.012, 4, 24, Math.PI);
        strap.rotateZ(Math.PI);
        strap.translate(0, 0.02, 0.04);
        paint(strap, C.strap);
        parts.push(strap);
        return merge(parts);
    });
}

/** The eyes: big glossy irises with two highlights each (origin between the eyes, so they blink by scaling y). */
function eyesGeometry() {
    return cached('eyes', () => {
        const parts = [];
        for (const s of [-1, 1]) {
            const eye = sphere(0.068, 14, 10);
            eye.scale(0.78, 1, 0.55);
            eye.translate(s * 0.105, 0, 0.2);
            paint(eye, (x, y) => (y < -0.03 ? '#3a2416' : '#1a110b'));
            const big = sphere(0.022, 8, 6);
            big.translate(s * 0.105 + 0.018, 0.026, 0.235);
            paint(big, '#ffffff');
            const small = sphere(0.01, 6, 4);
            small.translate(s * 0.105 - 0.016, -0.022, 0.236);
            paint(small, '#ffffff');
            parts.push(eye, big, small);
        }
        return merge(parts);
    });
}

function noseGeometry() {
    return cached('nose', () => {
        const nose = sphere(0.036, 10, 8);
        nose.scale(1.35, 0.85, 0.8);
        paint(nose, (x, y) => (y > 0.012 ? '#ffb2c2' : C.nose));
        return merge([nose]);
    });
}

/** An ear segment: the outer fur and the pink inside; origin at its base. */
function earGeometry(f, tip) {
    return cached(`ear-${f.fur}-${tip}`, () => {
        const len = tip ? 0.17 : 0.2;
        const r = tip ? 0.058 : 0.066;
        const outer = limb(r, len, 10);
        outer.scale(1, 1, 0.55);
        paint(outer, (x, y) => (tip && y > len * 0.85 ? f.shade : f.fur));
        const inner = limb(r * 0.58, len * 0.86, 8);
        inner.scale(1, 1, 0.4);
        inner.translate(0, r * 0.25, 0.022);
        paint(inner, f.inner);
        return merge([outer, inner]);
    });
}

/** An arm hanging down from the shoulder, with a round paw. */
function armGeometry(f) {
    return cached(`arm-${f.fur}`, () => {
        const arm = limb(0.055, 0.13, 8);
        arm.rotateX(Math.PI);
        paint(arm, f.fur);
        const paw = sphere(0.07, 10, 8);
        paw.scale(1, 0.9, 1.05);
        paw.translate(0, -0.25, 0.01);
        paint(paw, f.belly);
        return merge([arm, paw]);
    });
}

/** The army helmet (tinted by the team colour; the vertex colours make the band darker), with a camouflage sprig. */
function helmetGeometry() {
    return cached('helmet', () => {
        const dome = new THREE.SphereGeometry(0.29, 22, 10, 0, Math.PI * 2, 0, Math.PI * 0.47);
        dome.scale(1, 0.84, 1.06);
        paint(dome, (x, y) => (y < 0.035 ? '#8a8a8a' : '#ffffff'));
        const brim = new THREE.CylinderGeometry(0.315, 0.32, 0.03, 24);
        brim.scale(1, 1, 1.08);
        paint(brim, '#c4c4c4');
        const band = new THREE.TorusGeometry(0.287, 0.018, 5, 26);
        band.rotateX(Math.PI / 2);
        band.scale(1, 1, 1.06);
        band.translate(0, 0.04, 0);
        paint(band, '#b0b0b0');
        const rivet = sphere(0.018, 6, 4);
        rivet.translate(0, 0.07, 0.3);
        paint(rivet, '#d9d9d9');
        return merge([dome, brim, band, rivet]);
    });
}

function sprigGeometry() {
    return cached('sprig', () => {
        const parts = [];
        for (let i = 0; i < 3; i++) {
            const leaf = sphere(0.045, 7, 5);
            leaf.scale(0.45, 1.6, 0.18);
            leaf.translate(0, 0.07, 0);
            leaf.rotateZ(-0.5 + i * 0.45);
            leaf.translate(-0.18, 0.12, -0.12);
            paint(leaf, i === 1 ? '#86c84a' : '#4f9e2f');
            parts.push(leaf);
        }
        return merge(parts);
    });
}

/** The knitted scarf around the neck (team colour; stripes by vertex colour) with a tail that hangs down. */
function scarfGeometry() {
    return cached('scarf', () => {
        const ring = new THREE.TorusGeometry(0.2, 0.058, 8, 24);
        ring.rotateX(Math.PI / 2);
        ring.scale(1, 1, 1.05);
        ring.translate(0, 0.69, 0.03);
        paint(ring, (x, y, z) => (Math.floor((Math.atan2(z - 0.03, x) + Math.PI) / (Math.PI / 8)) % 2 ? '#ffffff' : '#d8d8d8'));
        const knot = sphere(0.06, 8, 6);
        knot.translate(0.12, 0.66, 0.16);
        paint(knot, '#e6e6e6');
        const tail = new THREE.BoxGeometry(0.09, 0.26, 0.03, 1, 4, 1);
        tail.translate(0, -0.13, 0);
        tail.rotateZ(0.25);
        tail.rotateX(-0.25);
        tail.translate(0.15, 0.66, 0.17);
        paint(tail, (x, y) => (Math.floor(y * 30) % 2 ? '#ffffff' : '#d0d0d0'));
        const fringe = new THREE.BoxGeometry(0.09, 0.04, 0.032);
        fringe.translate(0, -0.28, 0);
        fringe.rotateZ(0.25);
        fringe.rotateX(-0.25);
        fringe.translate(0.15, 0.66, 0.17);
        paint(fringe, '#bdbdbd');
        return merge([ring, knot, tail, fringe]);
    });
}

const eyeMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.18, metalness: 0.05 });
const noseMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4 });
const plainMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });

const teamMaterials = new Map();
function teamMaterial(color) {
    if (!teamMaterials.has(color)) teamMaterials.set(color, new THREE.MeshStandardMaterial({ color, vertexColors: true, roughness: 0.55, metalness: 0.05 }));
    return teamMaterials.get(color);
}

function part(geometry, material, parent, x = 0, y = 0, z = 0) {
    const m = new THREE.Mesh(geometry, material);
    m.position.set(x, y, z);
    m.castShadow = true;
    parent?.add(m);
    return m;
}

const KINDS = ['Projectile', 'Grenade', 'Cluster', 'Hitscan', 'Airstrike'];
const LOOPS = new Set(['idle', 'walk', 'aim', 'cheer', 'dance', 'wave', 'eat']);
const ONCE = { fire: 0.55, hurt: 0.55 };
const smooth = (current, target, rate, dt) => current + (target - current) * (1 - Math.exp(-rate * dt));
const easeOutBack = t => 1 + 2.4 * Math.pow(t - 1, 3) + 1.4 * Math.pow(t - 1, 2);

/** A soft ear: a spring for the tip (angle around x) that lags behind the motion of the head. */
class EarSpring {
    constructor() {
        this.x = 0;
        this.v = 0;
    }

    step(dt, target, push) {
        const k = 140, damping = 10;
        this.v += (-(this.x - target) * k - this.v * damping + push) * dt;
        this.x += this.v * dt;
        this.x = Math.max(-1.6, Math.min(1.2, this.x));
        return this.x;
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
        this.fur = FURS[Math.abs((dto.id ?? 0) * 7 + (dto.team ?? 0) * 3) % FURS.length];
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
        this.ears = [new EarSpring(), new EarSpring()];
        this.fx = null;

        this.root = new THREE.Group();
        this.root.name = `bunny-${this.id}`;
        this.spinner = new THREE.Group(); // tumbles around the middle of the body
        this.spinner.position.y = 0.45;
        this.root.add(this.spinner);
        this.model = new THREE.Group();
        this.model.position.y = -0.45;
        this.model.rotation.order = 'YXZ';
        this.spinner.add(this.model);
        this.buildModel();

        this.label = new Label(this.name, this.color);
        this.label.sprite.position.y = 1.78;
        this.root.add(this.label.sprite);
        this.label.set(this.health, this.maxHealth, true);

        this.aimDots = null;
        this.grave = null;
        this.ghost = null;
        this.sync();
        if (!this.alive) this.die(false);
    }

    buildModel() {
        const f = this.fur;
        this.furMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, emissive: 0x000000 });
        const team = teamMaterial(this.color);
        this.body = part(bodyGeometry(f), this.furMaterial, this.model);
        this.body.receiveShadow = true;
        this.scarf = part(scarfGeometry(), team, this.model);

        this.neck = new THREE.Group(); // turns and tilts the head
        this.neck.position.set(0, 0.76, 0.05);
        this.neck.rotation.order = 'YXZ';
        this.model.add(this.neck);
        this.head = new THREE.Group();
        this.head.position.set(0, 0.13, 0.02);
        this.neck.add(this.head);
        part(headGeometry(f), this.furMaterial, this.head).receiveShadow = true;
        this.eyes = part(eyesGeometry(), eyeMaterial, this.head, 0, 0.035, 0);
        this.eyes.castShadow = false;
        this.nose = part(noseGeometry(), noseMaterial, this.head, 0, -0.02, 0.272);
        this.helmet = part(helmetGeometry(), team, this.head, 0, 0.075, -0.015);
        this.helmet.rotation.x = -0.12;
        part(sprigGeometry(), plainMaterial, this.helmet);

        // the ears: a base and a tip each, the tips are springs
        this.earNodes = [-1, 1].map(s => {
            const base = new THREE.Group();
            base.position.set(s * 0.1, 0.19, -0.04);
            base.rotation.order = 'ZXY';
            this.head.add(base);
            part(earGeometry(f, false), this.furMaterial, base);
            const tip = new THREE.Group();
            tip.position.y = 0.24;
            tip.rotation.order = 'ZXY';
            base.add(tip);
            part(earGeometry(f, true), this.furMaterial, tip);
            return { base, tip, side: s };
        });

        this.arms = [-1, 1].map(s => {
            const shoulder = new THREE.Group();
            shoulder.position.set(s * 0.215, 0.62, 0.09);
            shoulder.rotation.order = 'XZY';
            this.model.add(shoulder);
            part(armGeometry(f), this.furMaterial, shoulder);
            return shoulder;
        });

        this.weaponPivot = new THREE.Group(); // between the paws, tilts with the aim
        this.weaponPivot.position.set(0, 0.56, 0.2);
        this.model.add(this.weaponPivot);
        this.weapon = null;
        this.snack = snackModel();
        this.snack.position.set(0, 0.73, 0.33);
        this.snack.visible = false;
        this.model.add(this.snack);
    }

    // ------------------------------------------------------------ state from the game

    /** Health from the server; the label's bar animates. */
    setHealth(health) {
        if (health === this.health) return;
        this.health = health;
        this.label.set(Math.max(0, health), this.maxHealth);
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

    // ------------------------------------------------------------ animations

    play(name) {
        if (!this.alive) return;
        if (ONCE[name]) {
            this.once = { name, t: 0, duration: name === 'fire' && this.weaponKind === 'Airstrike' ? 1.1 : ONCE[name] };
            if (name === 'hurt') this.flash = 1;
            return;
        }
        if (LOOPS.has(name) && name !== this.anim) {
            this.anim = name;
            this.animTime = 0;
        }
    }

    hurt() {
        this.play('hurt');
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
        if (!this.flight) this.flight = { angle: 0, axis: new THREE.Vector3(1, 0, 0) };
        const horizontal = new THREE.Vector3(vx, 0, vz);
        if (horizontal.lengthSq() > 1e-4) this.flight.axis.set(vz, 0, -vx).normalize();
        this.flight.speed = speed;
    }

    land() {
        if (!this.flight) return;
        this.flight = null;
        this.spinner.quaternion.identity();
        this.squash = 1;
        this.dust(10);
    }

    die(animate = true) {
        if (!this.alive && (this.grave || this.sinking)) return;
        this.alive = false;
        this.label.sprite.visible = false;
        this.setAim(null);
        this.flight = null;
        this.spinner.quaternion.identity();
        if (!this.grave) {
            this.grave = gravestoneModel();
            this.grave.rotation.y = this.yaw;
            this.root.add(this.grave);
        }
        if (animate) {
            this.dying = { t: 0 };
            this.grave.scale.setScalar(0.001);
            this.grave.visible = true;
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
        if (!this.grave) {
            this.grave = gravestoneModel();
            this.root.add(this.grave);
        }
        this.grave.visible = false;
        this.dying = null;
        this.sinking = { t: 0 };
    }

    /** The dotted aim line (an array of Vector3, null hides it); puts the bunny into its aim pose. */
    setAim(points, color) {
        if (!points || points.length < 2) {
            if (this.aimDots) this.aimDots.visible = false;
            this.aimUntil = -1;
            return;
        }
        this.aimUntil = this.clock + 0.3;
        const a = points[0], b = points[Math.min(points.length - 1, 2)];
        const horizontal = Math.hypot(b.x - a.x, b.z - a.z);
        if (horizontal > 1e-4 || Math.abs(b.y - a.y) > 1e-4) this.setAimPitch(Math.atan2(b.y - a.y, horizontal));
        if (!this.root.parent) return;
        if (!this.aimDots) {
            this.aimDots = new THREE.InstancedMesh(dotGeometry, new THREE.MeshBasicMaterial({ color: color ?? this.color, transparent: true, opacity: 0.92, depthWrite: false }), MAX_DOTS);
            this.aimDots.frustumCulled = false;
            this.aimDots.renderOrder = 5;
        }
        if (this.aimDots.parent !== this.root.parent) this.root.parent.add(this.aimDots);
        if (color) this.aimDots.material.color.set(color);
        this.aimDots.visible = true;
        // dots at equal steps along the polyline, smaller towards the end
        const step = 0.2;
        let count = 0, carry = 0;
        const m = new THREE.Matrix4();
        const p = new THREE.Vector3();
        let total = 0;
        for (let i = 1; i < points.length; i++) total += points[i].distanceTo(points[i - 1]);
        let walked = 0;
        for (let i = 1; i < points.length && count < MAX_DOTS; i++) {
            const from = points[i - 1], to = points[i];
            const len = from.distanceTo(to);
            let d = carry;
            while (d <= len && count < MAX_DOTS) {
                p.copy(from).lerp(to, len > 0 ? d / len : 0);
                const k = 1 - (walked + d) / Math.max(total, 0.01);
                const s = 0.35 + 0.65 * k;
                m.makeScale(s, s, s).setPosition(p);
                this.aimDots.setMatrixAt(count++, m);
                d += step;
            }
            carry = d - len;
            walked += len;
        }
        this.aimDots.count = count;
        this.aimDots.instanceMatrix.needsUpdate = true;
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
        dt = Math.min(dt, 0.1);
        this.clock += dt;
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

        if (!this.alive) {
            this.updateDead(dt);
            return;
        }

        const pose = this.pose(dt);
        this.apply(pose, dt);
    }

    /** Computes the pose of this frame: the loop, a one-shot on top, the hops, the flight. */
    pose(dt) {
        const t = (this.animTime += dt);
        const c = this.clock;
        const p = {
            y: 0, sx: 1, sy: 1, lean: 0, roll: 0, twist: 0, headX: 0, headY: 0, headZ: 0,
            armL: { x: -0.2, z: -0.18 }, armR: { x: -0.2, z: 0.18 }, earBack: -0.12, earSpread: 0.16, earPush: 0,
            weapon: false, weaponPitch: 0, kick: 0, snack: false, eyes: 1,
        };

        // breathing, looking around
        const breath = Math.sin(c * 1.9) * 0.018;
        p.sy += breath;
        p.sx -= breath * 0.5;
        this.lookIn -= dt;
        if (this.lookIn <= 0) {
            this.lookIn = 2.5 + Math.random() * 4;
            this.lookTarget = Math.random() < 0.35 ? 0 : (Math.random() - 0.5) * 1.1;
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
                this.hop += dt / 0.34;
                const ph = this.hop % 1;
                const air = Math.sin(Math.PI * ph);
                p.y = air * 0.16;
                p.sy *= ph < 0.12 || ph > 0.92 ? 0.86 : 1 + air * 0.08;
                p.sx *= ph < 0.12 || ph > 0.92 ? 1.08 : 1 - air * 0.04;
                p.lean = 0.16;
                p.armL.x = p.armR.x = 0.5 - air * 0.6;
                p.earBack = -0.35;
                p.headY = 0;
                const cycle = Math.floor(this.hop);
                if (cycle !== this.lastHopCycle) {
                    this.lastHopCycle = cycle;
                    this.dust(4);
                }
                break;
            }
            case 'aim':
                p.weapon = true;
                p.lean = -0.05;
                p.headY = 0;
                p.headX = -this.aimPitch * 0.35;
                break;
            case 'cheer': {
                const ph = (t / 0.7) % 1;
                const air = Math.max(0, Math.sin(Math.PI * Math.min(1, ph / 0.75)));
                p.y = air * 0.38;
                p.sy *= ph > 0.9 ? 0.85 : 1 + air * 0.1;
                p.armL = { x: -0.3, z: -2.5 + Math.sin(t * 14) * 0.25 };
                p.armR = { x: -0.3, z: 2.5 - Math.sin(t * 14) * 0.25 };
                p.twist = Math.floor(t / 0.7) % 3 === 2 ? ph * Math.PI * 2 : 0;
                p.headX = -0.25;
                p.earBack = 0.05;
                p.eyes = 0.55; // happy squint
                break;
            }
            case 'dance': {
                const beat = t * 2.4;
                const side = Math.sin(beat * Math.PI);
                p.y = Math.abs(Math.sin(beat * Math.PI)) * 0.12;
                p.roll = side * 0.22;
                p.twist = Math.sin(beat * Math.PI * 0.5) * 0.5;
                p.armL = { x: -0.4, z: Math.floor(beat) % 2 ? -2.6 : -0.6 };
                p.armR = { x: -0.4, z: Math.floor(beat) % 2 ? 0.6 : 2.6 };
                p.headZ = -side * 0.25;
                p.headX = Math.sin(beat * Math.PI * 2) * 0.12;
                p.earSpread = 0.3 + side * 0.2;
                break;
            }
            case 'wave':
                p.armR = { x: -0.4, z: 2.45 + Math.sin(t * 9) * 0.35 };
                p.armL = { x: -0.2, z: -0.25 };
                p.headZ = 0.18;
                p.roll = Math.sin(t * 3) * 0.05;
                p.headY = this.lookYaw * 0.3;
                break;
            case 'eat': {
                const munch = Math.sin(t * 18);
                p.armL = { x: -1.85, z: 0.42 };
                p.armR = { x: -1.85, z: -0.42 };
                p.snack = true;
                p.headX = 0.12 + munch * 0.04;
                p.sy += munch * 0.01;
                p.earBack = -0.05;
                p.eyes = Math.sin(t * 0.8) > 0.6 ? 0.45 : 1;
                break;
            }
            default: // idle
                p.headY = this.lookYaw;
                break;
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

        // a one-shot on top
        if (this.once) {
            const o = this.once;
            o.t += dt;
            const k = o.t / o.duration;
            if (o.name === 'fire') this.firePose(p, k);
            if (o.name === 'hurt') {
                const shake = Math.sin(o.t * 50) * (1 - k);
                p.lean -= 0.35 * (1 - k);
                p.roll += shake * 0.12;
                p.eyes = Math.min(p.eyes, k < 0.6 ? 0.08 : 1);
                p.earBack = -0.9 * (1 - k);
                p.sy *= 1 - 0.1 * (1 - k);
                p.armL = { x: -0.9, z: -0.9 };
                p.armR = { x: -0.9, z: 0.9 };
            }
            if (o.t >= o.duration) this.once = null;
        }

        // the landing squash
        if (this.squash > 0) {
            this.squash = Math.max(0, this.squash - dt * 4);
            p.sy *= 1 - 0.25 * this.squash;
            p.sx *= 1 + 0.18 * this.squash;
        }

        // tumbling through the air
        if (this.flight) {
            p.armL = { x: -0.5 + Math.sin(c * 20) * 0.5, z: -2.2 };
            p.armR = { x: -0.5 - Math.sin(c * 20) * 0.5, z: 2.2 };
            p.eyes = 0.1;
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
                break;
            }
            case 'Airstrike':
                p.weapon = true;
                p.armR = { x: -0.6, z: 2.1 };
                p.headZ = 0.25 + Math.sin(k * 30) * 0.05;
                p.headX = -0.1;
                p.armL = { x: -0.3, z: -1.6 + Math.sin(k * 25) * 0.4 }; // pointing and calling
                break;
            default: {
                // a kick back
                const kick = Math.max(0, 1 - k * 2.5);
                p.weapon = true;
                p.kick = kick;
                p.lean -= 0.22 * kick;
                p.sy *= 1 - 0.06 * kick;
                p.weaponPitch = this.aimPitch + 0.25 * kick;
                this.weaponArms(p, p.weaponPitch);
                p.earBack = -0.6 * kick - 0.1;
                break;
            }
        }
    }

    apply(p, dt) {
        const m = this.model;
        m.position.y = -0.45 + p.y;
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
            this.weaponPivot.position.z = 0.2 - p.kick * 0.12;
        }
        this.snack.visible = p.snack;
        if (p.snack) this.snack.scale.setScalar(0.85 + 0.15 * Math.abs(Math.sin(this.animTime * 0.7)));

        // ears: the bases follow the pose, the tips are springs pushed by the vertical acceleration
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

        this.eyes.scale.y = smooth(this.eyes.scale.y, p.eyes, 30, dt);
        this.nose.scale.setScalar(this.wiggle > 0 ? 1 + Math.abs(Math.sin(this.wiggle * 26)) * 0.18 : 1);

        // the red flash of a hit
        if (this.flash > 0) {
            this.flash = Math.max(0, this.flash - dt * 2.2);
            this.furMaterial.emissive.setRGB(0.9 * this.flash, 0.05 * this.flash, 0.05 * this.flash);
        }

        if (this.flight) {
            this.flight.angle += dt * Math.min(16, 4 + this.flight.speed * 1.2);
            this.spinner.quaternion.setFromAxisAngle(this.flight.axis, this.flight.angle);
        }
    }

    updateDead(dt) {
        if (this.dying) {
            const d = this.dying;
            d.t += dt;
            const fall = Math.min(1, d.t / 0.45);
            this.model.rotation.z = (Math.PI / 2) * easeOutBack(fall) * 0.95;
            this.model.position.y = -0.45 - fall * 0.12;
            this.eyes.scale.y = 0.08;
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
            this.model.position.y = -0.45 - s.t * 1.2;
            this.model.rotation.y += dt * 3;
            this.eyes.scale.y = 0.08;
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
        if (this.aimDots) {
            this.aimDots.parent?.remove(this.aimDots);
            this.aimDots.material.dispose();
            this.aimDots.dispose();
            this.aimDots = null;
        }
        if (this.ghost) for (const mat of this.ghost.userData.materials) mat.dispose();
        this.root.parent?.remove(this.root);
        this.label.dispose();
        this.furMaterial.dispose();
    }
}

const MAX_DOTS = 48;
const dotGeometry = new THREE.SphereGeometry(0.055, 8, 6);

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
        this.pointer.position.set(p.x, p.y + 2.5 + bounce * 0.32, p.z);
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
