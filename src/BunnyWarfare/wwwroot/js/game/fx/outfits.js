// What the bunnies wear (keys from Business/Cosmetics.cs): outfits on the head and things on the face. Chunky cartoon pieces from primitives,
// painted with vertex colours (the team colour is painted in, so the geometries are cached per outfit and colour) and a few shared materials.
//
//   outfitParts(key, color) → [{ geometry, material, shadow }]   in the space of the bunny's hat node (Bunny.helmet: its origin sits on top
//                                                                  of the head, tilted back a little; the head's centre is at HAT_HEAD)
//   faceParts(key, color)   → { parts: [{ geometry, material }], lasers: bool }   in the space of the head (centre of the head, the face looks along +z)
import * as THREE from 'three';
import { paint, merge, sphere, fluffySphere } from './shapes.js';

/** A point of the head space in the space of the hat node (Bunny: the hat sits at (0, 0.23, -0.05) of the head, tilted back by 0.22). */
const HAT_TILT = 0.22;
function headToHat(x, y, z) {
    return new THREE.Vector3(x, y - 0.23, z + 0.05).applyAxisAngle(new THREE.Vector3(1, 0, 0), HAT_TILT);
}

/** The centre of the head in the space of the hat node. */
export const HAT_HEAD = headToHat(0, 0, 0);
const HEAD_R = 0.33;

export const clothMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75 });
export const metalMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.4, emissive: 0x1a1408 });
export const glossMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.22 });
const glassMaterial = new THREE.MeshStandardMaterial({ color: 0xd8f2ff, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.24, depthWrite: false });
const amberGlass = new THREE.MeshStandardMaterial({ color: 0xffb347, roughness: 0.1, transparent: true, opacity: 0.55, depthWrite: false });
const lensGlass = new THREE.MeshStandardMaterial({ color: 0xeaf6ff, roughness: 0.05, transparent: true, opacity: 0.18, depthWrite: false });
export const laserPupilMaterial = new THREE.MeshBasicMaterial({ color: 0xff2a3a });
export const laserBeamMaterial = new THREE.MeshBasicMaterial({ color: 0xff1a2a, transparent: true, opacity: 0.9, depthWrite: false });

const cache = new Map();
function cached(key, make) {
    if (!cache.has(key)) cache.set(key, make());
    return cache.get(key);
}

const darker = (hex, k) => '#' + new THREE.Color(hex).multiplyScalar(k).getHexString();
const lighter = (hex, k) => '#' + new THREE.Color(hex).lerp(new THREE.Color('#ffffff'), k).getHexString();

/** A tapered tube along points (horns): thick at the start, a point at the end. */
function hornGeometry(points, radius, base, tip) {
    const curve = new THREE.CatmullRomCurve3(points);
    const tubular = 14, radial = 8;
    const g = new THREE.TubeGeometry(curve, tubular, radius, radial, false);
    const pos = g.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
        const ring = Math.floor(i / (radial + 1));
        const t = ring / tubular;
        const c = curve.getPointAt(t);
        v.fromBufferAttribute(pos, i).sub(c).multiplyScalar(1 - 0.92 * t).add(c);
        pos.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    // close the base with a ball
    const cap = sphere(radius * 1.02, 10, 8);
    cap.translate(points[0].x, points[0].y, points[0].z);
    paint(g, (x, y, z) => {
        const d = new THREE.Vector3(x, y, z).distanceTo(points[points.length - 1]);
        return d < radius * 3 ? tip : base;
    });
    paint(cap, base);
    return merge([g, cap]);
}

/** A disc lying flat (a brim) whose rim is lifted by lift(angle, share of the radius) → y. */
function brim(radius, thickness, segments, lift) {
    const g = new THREE.CylinderGeometry(radius, radius, thickness, segments, 1, false);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), z = pos.getZ(i);
        const r = Math.hypot(x, z) / radius;
        pos.setY(i, pos.getY(i) + lift(Math.atan2(x, z), r));
    }
    g.computeVertexNormals();
    return g;
}

/** A point on the surface of the head (head space) above (x, y) on the front, pushed out by lift. */
function onFace(x, y, lift = 0.006) {
    const sx = x / 1.08, sy = y / 0.95;
    const z = Math.sqrt(Math.max(0.0004, HEAD_R * HEAD_R - sx * sx - sy * sy)) * 0.98;
    return new THREE.Vector3(x, y, z + lift);
}

/** A flat little bar on the face at (x, y), turned in the face plane by angle, following the round head. */
function faceBar(x, y, w, h, angle, color) {
    const bar = new THREE.BoxGeometry(w, h, 0.012);
    bar.rotateZ(angle);
    const p = onFace(x, y);
    const n = new THREE.Vector3(p.x / 1.08, p.y / 0.95, p.z).normalize();
    bar.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), n));
    bar.translate(p.x, p.y, p.z);
    paint(bar, color);
    return bar;
}

// ---------------------------------------------------------------- outfits

const OUTFITS = {
    helmet: color => {
        const dome = new THREE.SphereGeometry(0.345, 24, 10, 0, Math.PI * 2, 0, Math.PI * 0.47);
        dome.scale(1.02, 0.8, 1.04);
        paint(dome, (x, y) => (y < 0.035 ? darker(color, 0.55) : color));
        const rim = new THREE.CylinderGeometry(0.37, 0.38, 0.035, 26);
        rim.scale(1, 1, 1.08);
        paint(rim, darker(color, 0.78));
        const band = new THREE.TorusGeometry(0.342, 0.02, 5, 28);
        band.rotateX(Math.PI / 2);
        band.scale(1.02, 1, 1.05);
        band.translate(0, 0.045, 0);
        paint(band, darker(color, 0.7));
        const rivet = sphere(0.02, 6, 4);
        rivet.translate(0, 0.08, 0.355);
        paint(rivet, lighter(color, 0.6));
        const parts = [dome, rim, band, rivet];
        // a camouflage sprig and a little flower stuck in the band
        for (let i = 0; i < 3; i++) {
            const leaf = sphere(0.05, 7, 5);
            leaf.scale(0.45, 1.6, 0.18);
            leaf.translate(0, 0.08, 0);
            leaf.rotateZ(-0.5 + i * 0.45);
            leaf.translate(-0.22, 0.14, -0.14);
            paint(leaf, i === 1 ? '#86c84a' : '#4f9e2f');
            parts.push(leaf);
        }
        for (let p = 0; p < 5; p++) {
            const a = (p / 5) * Math.PI * 2;
            const petal = sphere(0.022, 6, 4);
            petal.scale(1, 1, 0.4);
            petal.translate(0.24 + Math.cos(a) * 0.026, 0.1 + Math.sin(a) * 0.026, 0.25);
            paint(petal, '#ffffff');
            parts.push(petal);
        }
        const heart = sphere(0.016, 6, 4);
        heart.translate(0.24, 0.1, 0.258);
        paint(heart, '#ffd23a');
        parts.push(heart);
        return [{ geometry: merge(parts), material: clothMaterial }];
    },

    beret: color => {
        const top = sphere(0.3, 22, 12);
        top.scale(1.22, 0.3, 1.16);
        top.rotateZ(-0.28);
        top.translate(0.07, 0.07, -0.02);
        paint(top, (x, y) => (y > 0.1 ? lighter(color, 0.08) : color));
        const rim = new THREE.TorusGeometry(0.255, 0.04, 6, 26);
        rim.rotateX(Math.PI / 2);
        rim.translate(0, 0.02, 0);
        paint(rim, darker(color, 0.6));
        const stalk = new THREE.CylinderGeometry(0.012, 0.02, 0.07, 6);
        stalk.translate(0.05, 0.16, -0.02);
        paint(stalk, darker(color, 0.6));
        const cloth = merge([top, rim, stalk]);
        // a golden badge with a carrot
        const badge = new THREE.CylinderGeometry(0.055, 0.055, 0.02, 14);
        badge.rotateX(Math.PI / 2);
        badge.translate(-0.08, 0.06, 0.255);
        paint(badge, '#ffcf3a');
        const mark = new THREE.ConeGeometry(0.018, 0.06, 6);
        mark.rotateZ(Math.PI);
        mark.translate(-0.08, 0.06, 0.27);
        paint(mark, '#f07a1a');
        return [{ geometry: cloth, material: clothMaterial }, { geometry: merge([badge, mark]), material: metalMaterial, shadow: false }];
    },

    cap: color => {
        const dome = new THREE.SphereGeometry(0.335, 22, 10, 0, Math.PI * 2, 0, Math.PI / 2);
        dome.scale(1.04, 0.72, 1.06);
        paint(dome, (x, y, z) => (Math.abs(x) < 0.012 || Math.abs(z) < 0.012 ? darker(color, 0.7) : color));
        const button = sphere(0.035, 8, 6);
        button.translate(0, 0.24, 0);
        paint(button, darker(color, 0.7));
        const visor = new THREE.CylinderGeometry(0.3, 0.3, 0.028, 22, 1, false, -Math.PI / 2, Math.PI);
        visor.scale(1, 1, 1.45);
        visor.rotateX(0.14);
        visor.translate(0, 0.0, 0.18);
        paint(visor, darker(color, 0.62));
        const g = merge([dome, button, visor]);
        g.rotateY(0.55); // worn cheekily to the side
        return [{ geometry: g, material: clothMaterial }];
    },

    bandana: color => {
        const band = new THREE.TorusGeometry(0.305, 0.042, 8, 32);
        band.rotateX(Math.PI / 2);
        band.scale(1.08, 1.4, 1.04);
        band.translate(0, HAT_HEAD.y + 0.08, 0);
        const dots = (x, y, z) => (Math.sin(x * 60) * Math.sin(y * 60 + 1) * Math.sin(z * 60 + 2) > 0.35 ? '#ffffff' : color);
        paint(band, dots);
        const knot = sphere(0.065, 10, 8);
        knot.translate(0, HAT_HEAD.y + 0.08, -0.33);
        paint(knot, darker(color, 0.85));
        const parts = [band, knot];
        for (const s of [-1, 1]) {
            const tail = new THREE.BoxGeometry(0.07, 0.3, 0.025, 1, 4, 1);
            tail.translate(0, -0.15, 0);
            tail.rotateZ(s * 0.35);
            tail.rotateX(0.5);
            tail.translate(s * 0.03, HAT_HEAD.y + 0.07, -0.35);
            paint(tail, dots);
            parts.push(tail);
        }
        return [{ geometry: merge(parts), material: clothMaterial }];
    },

    pirate: color => {
        const crown = new THREE.CylinderGeometry(0.24, 0.3, 0.22, 22);
        crown.scale(1, 1, 0.9);
        crown.translate(0, 0.11, 0);
        paint(crown, '#2b2320');
        const hat = brim(0.5, 0.035, 48, (a, r) => Math.pow(Math.max(0, Math.cos(3 * a)), 1.4) * 0.2 * r * r);
        hat.scale(1, 1, 0.9);
        hat.translate(0, 0.02, 0);
        paint(hat, '#2b2320');
        const trim = brim(0.5, 0.012, 48, (a, r) => Math.pow(Math.max(0, Math.cos(3 * a)), 1.4) * 0.2 * r * r + 0.022);
        trim.scale(1.005, 1, 0.905);
        trim.translate(0, 0.02, 0);
        // only the outer ring of the trim is gold
        paint(trim, (x, y, z) => (Math.hypot(x, z / 0.9) > 0.44 ? '#e2b33a' : '#2b2320'));
        // a skull with crossed bones in front
        const skull = sphere(0.055, 10, 8);
        skull.scale(1, 0.95, 0.5);
        skull.translate(0, 0.13, 0.27);
        paint(skull, (x, y) => (y < 0.115 ? '#e9e4d8' : '#ffffff'));
        const eyes = [-1, 1].map(s => {
            const e = sphere(0.014, 6, 4);
            e.translate(s * 0.02, 0.135, 0.297);
            paint(e, '#111111');
            return e;
        });
        const bones = [-1, 1].map(s => {
            const b = new THREE.CapsuleGeometry(0.009, 0.12, 2, 5);
            b.rotateZ(Math.PI / 2 + s * 0.6);
            b.translate(0, 0.1, 0.268);
            paint(b, '#ffffff');
            return b;
        });
        const cloth = merge([crown, hat, trim, skull, ...eyes, ...bones]);
        // a feather in the team colour
        const feather = sphere(0.06, 10, 6);
        feather.scale(0.5, 3.2, 0.14);
        feather.rotateZ(-0.7);
        feather.rotateY(0.6);
        feather.translate(0.24, 0.22, -0.08);
        paint(feather, (x, y) => (Math.sin(y * 90) > 0.6 ? lighter(color, 0.4) : color));
        cloth.rotateY(-0.25);
        feather.rotateY(-0.25);
        return [{ geometry: cloth, material: clothMaterial }, { geometry: merge([feather]), material: clothMaterial, shadow: false }];
    },

    viking: color => {
        const dome = new THREE.SphereGeometry(0.34, 22, 10, 0, Math.PI * 2, 0, Math.PI * 0.5);
        dome.scale(1.04, 0.86, 1.06);
        paint(dome, (x, y) => (Math.abs(x) < 0.03 && y > 0.05 ? '#c9d1d9' : '#9aa4ae'));
        const ridge = new THREE.TorusGeometry(0.3, 0.025, 5, 24, Math.PI);
        ridge.rotateY(Math.PI / 2);
        ridge.scale(1, 0.95, 1.05);
        paint(ridge, '#c7ced6');
        const studs = [];
        for (let i = 0; i < 12; i++) {
            const a = (i / 12) * Math.PI * 2;
            const s = sphere(0.022, 6, 4);
            s.translate(Math.sin(a) * 0.352, 0.03, Math.cos(a) * 0.37);
            paint(s, '#e0e6ec');
            studs.push(s);
        }
        const guard = new THREE.BoxGeometry(0.05, 0.16, 0.03);
        guard.translate(0, -0.04, 0.36);
        paint(guard, '#9aa4ae');
        const metal = merge([dome, ridge, guard, ...studs]);
        const band = new THREE.TorusGeometry(0.345, 0.035, 6, 30);
        band.rotateX(Math.PI / 2);
        band.scale(1.03, 1, 1.06);
        band.translate(0, 0.03, 0);
        paint(band, color);
        const horns = [-1, 1].map(s => hornGeometry([
            new THREE.Vector3(s * 0.3, 0.06, 0),
            new THREE.Vector3(s * 0.43, 0.12, 0),
            new THREE.Vector3(s * 0.5, 0.27, -0.02),
            new THREE.Vector3(s * 0.45, 0.42, -0.05),
        ], 0.062, '#f4ecd6', '#c9b994'));
        return [{ geometry: metal, material: metalMaterial }, { geometry: merge([band]), material: clothMaterial }, { geometry: merge(horns), material: glossMaterial }];
    },

    cowboy: color => {
        const crown = new THREE.CylinderGeometry(0.21, 0.26, 0.26, 22, 3);
        const pos = crown.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            const x = pos.getX(i), y = pos.getY(i);
            if (y > 0.1 && Math.abs(x) < 0.09) pos.setY(i, y - 0.05 * (1 - Math.abs(x) / 0.09)); // the dent on top
        }
        crown.computeVertexNormals();
        crown.scale(1, 1, 0.86);
        crown.translate(0, 0.14, 0);
        paint(crown, '#8a5a2b');
        const hat = brim(0.58, 0.03, 44, (a, r) => Math.pow(Math.abs(Math.sin(a)) * r, 2) * 0.2 - Math.max(0, Math.cos(a)) * r * 0.05);
        hat.scale(1, 1, 0.92);
        hat.translate(0, 0.02, 0);
        paint(hat, (x, y, z) => (Math.hypot(x, z) > 0.53 ? '#6f4520' : '#8a5a2b'));
        const band = new THREE.CylinderGeometry(0.262, 0.262, 0.06, 22, 1, true);
        band.scale(1, 1, 0.87);
        band.translate(0, 0.045, 0);
        paint(band, color);
        const star = new THREE.CylinderGeometry(0.035, 0.035, 0.012, 5);
        star.rotateX(Math.PI / 2);
        star.translate(0, 0.045, 0.23);
        paint(star, '#ffd23a');
        return [{ geometry: merge([crown, hat, band]), material: clothMaterial }, { geometry: merge([star]), material: metalMaterial, shadow: false }];
    },

    chef: () => {
        const band = new THREE.CylinderGeometry(0.27, 0.28, 0.14, 22);
        band.translate(0, 0.07, 0);
        paint(band, (x, y) => (Math.abs(y - 0.07) > 0.05 ? '#e9e9e9' : '#ffffff'));
        const parts = [band];
        const puffs = [[0, 0.36, 0, 0.2], [0.13, 0.3, 0.06, 0.15], [-0.13, 0.3, 0.05, 0.15], [0.05, 0.3, -0.13, 0.15], [-0.07, 0.31, -0.11, 0.14], [0, 0.48, 0.02, 0.15]];
        puffs.forEach(([x, y, z, r], i) => {
            const puff = fluffySphere(r, 0.1, i * 3, 14, 10);
            puff.translate(x, y, z);
            paint(puff, (px, py) => (py < y - r * 0.5 ? '#e6e6e6' : '#ffffff'));
            parts.push(puff);
        });
        return [{ geometry: merge(parts), material: clothMaterial }];
    },

    party: color => {
        const cone = new THREE.ConeGeometry(0.17, 0.5, 18, 6);
        paint(cone, (x, y, z) => (Math.sin(y * 28 + Math.atan2(x, z) * 2) > 0 ? color : '#ffd23a'));
        cone.translate(0, 0.25, 0);
        const pom = fluffySphere(0.075, 0.25, 4, 12, 9);
        pom.translate(0, 0.52, 0);
        paint(pom, '#ffffff');
        const frill = new THREE.TorusGeometry(0.17, 0.03, 6, 20);
        frill.rotateX(Math.PI / 2);
        frill.translate(0, 0.02, 0);
        paint(frill, (x, y, z) => (Math.sin(Math.atan2(x, z) * 10) > 0 ? '#ff5fb0' : '#4fd2ff'));
        const g = merge([cone, pom, frill]);
        g.rotateZ(-0.3);
        g.translate(0.08, 0.02, 0);
        return [{ geometry: g, material: clothMaterial }];
    },

    tophat: color => {
        const tube = new THREE.CylinderGeometry(0.2, 0.19, 0.5, 22);
        tube.translate(0, 0.27, 0);
        paint(tube, (x, y) => (y > 0.51 ? '#2c2930' : '#1c1a20'));
        const band = new THREE.CylinderGeometry(0.198, 0.196, 0.09, 22, 1, true);
        band.scale(1.04, 1, 1.04);
        band.translate(0, 0.08, 0);
        paint(band, color);
        const hat = brim(0.36, 0.03, 32, (a, r) => Math.pow(Math.sin(a) * r, 2) * 0.09);
        hat.translate(0, 0.02, 0);
        paint(hat, '#1c1a20');
        // a flower on the band
        const flower = [];
        for (let p = 0; p < 6; p++) {
            const a = (p / 6) * Math.PI * 2;
            const petal = sphere(0.03, 6, 4);
            petal.scale(1, 1, 0.4);
            petal.translate(0.13 + Math.cos(a) * 0.035, 0.09 + Math.sin(a) * 0.035, 0.17);
            paint(petal, '#ff6fa8');
            flower.push(petal);
        }
        const middle = sphere(0.022, 6, 4);
        middle.translate(0.13, 0.09, 0.18);
        paint(middle, '#ffe14a');
        const g = merge([tube, band, hat, ...flower, middle]);
        g.rotateZ(0.18);
        return [{ geometry: g, material: glossMaterial }];
    },

    mohawk: color => {
        const parts = [];
        const n = 9;
        for (let i = 0; i < n; i++) {
            const k = i / (n - 1);
            const a = -0.6 + k * 1.7; // from the back over the top to the forehead (in front of the ears)
            const len = 0.18 + Math.sin(Math.min(1, k * 1.25) * Math.PI * 0.5) * 0.22;
            const spike = new THREE.ConeGeometry(0.085, len * 1.25, 7);
            spike.translate(0, len * 0.625, 0);
            spike.scale(0.55, 1, 1.25); // flat fins: a ridge seen from the side
            paint(spike, (x, y) => (y > len * 0.78 ? '#ffe14a' : y > len * 0.3 ? lighter(color, 0.25) : color));
            spike.rotateX(a);
            const dir = new THREE.Vector3(0, Math.cos(a), Math.sin(a));
            spike.translate(HAT_HEAD.x + dir.x * 0.29, HAT_HEAD.y + dir.y * 0.29, HAT_HEAD.z + dir.z * 0.29);
            parts.push(spike);
        }
        return [{ geometry: merge(parts), material: glossMaterial }];
    },

    astronaut: color => {
        const bubble = sphere(0.5, 28, 20);
        bubble.scale(1.06, 1.22, 1.06);
        bubble.rotateX(HAT_TILT);
        const bubbleAt = headToHat(0, 0.13, 0.02);
        bubble.translate(bubbleAt.x, bubbleAt.y, bubbleAt.z);
        const collar = new THREE.TorusGeometry(0.3, 0.065, 10, 30);
        collar.rotateX(Math.PI / 2);
        paint(collar, (x, y, z) => (Math.abs(Math.atan2(x, z)) < 0.3 && y > 0 ? color : '#e9edf2'));
        collar.rotateX(HAT_TILT);
        const collarAt = headToHat(0, -0.34, 0.02);
        collar.translate(collarAt.x, collarAt.y, collarAt.z);
        const antenna = new THREE.CylinderGeometry(0.01, 0.01, 0.2, 5);
        antenna.translate(0.18, bubbleAt.y + 0.66, bubbleAt.z - 0.08);
        paint(antenna, '#c9cfd6');
        const ball = sphere(0.04, 8, 6);
        ball.translate(0.18, bubbleAt.y + 0.77, bubbleAt.z - 0.08);
        paint(ball, color);
        return [
            { geometry: merge([collar, antenna, ball]), material: metalMaterial },
            { geometry: merge([paint(bubble, '#ffffff')]), material: glassMaterial, shadow: false },
        ];
    },

    crown: () => {
        const ring = new THREE.CylinderGeometry(0.26, 0.24, 0.13, 40, 1, true);
        const pos = ring.attributes.position;
        for (let i = 0; i < pos.count; i++) {
            if (pos.getY(i) <= 0) continue;
            const a = Math.atan2(pos.getX(i), pos.getZ(i));
            const k = (a / (Math.PI * 2)) * 8 + 8;
            const tri = 1 - Math.abs((k % 1) * 2 - 1);
            pos.setY(i, 0.065 + tri * 0.14);
        }
        ring.computeVertexNormals();
        ring.translate(0, 0.07, 0);
        paint(ring, (x, y) => (y < 0.05 ? '#e2a91c' : '#ffd24a'));
        const inner = ring.clone();
        inner.scale(0.97, 1, 0.97);
        const parts = [ring, inner];
        for (let i = 0; i < 8; i++) {
            const a = ((i + 0.5) / 8) * Math.PI * 2;
            const tip = sphere(0.022, 6, 4);
            tip.translate(Math.sin(a) * 0.25, 0.29, Math.cos(a) * 0.25);
            paint(tip, '#fff1a8');
            parts.push(tip);
        }
        const gems = [[0, 0.07, 0.262, '#e8243c'], [0.19, 0.07, 0.18, '#2f7cff'], [-0.19, 0.07, 0.18, '#28c76f'], [0, 0.07, -0.262, '#b44bff']].map(([x, y, z, c]) => {
            const g = sphere(0.035, 8, 6);
            g.scale(1, 1.2, 0.6);
            g.translate(x, y, z);
            paint(g, c);
            return g;
        });
        const g = merge([...parts, ...gems]);
        g.rotateZ(-0.32);
        g.translate(0.06, 0.0, 0);
        return [{ geometry: g, material: metalMaterial }];
    },

    carrot: () => {
        const body = new THREE.ConeGeometry(0.3, 0.78, 16, 8);
        paint(body, (x, y) => (Math.abs(Math.sin(y * 38)) < 0.12 ? '#d45f0e' : '#f58a1f'));
        body.translate(0, 0.37, 0);
        const leaves = [];
        for (let i = 0; i < 4; i++) {
            const leaf = sphere(0.05, 8, 6);
            leaf.scale(0.5, 3, 0.25);
            leaf.translate(0, 0.14, 0);
            leaf.rotateZ(-0.55 + i * 0.37);
            leaf.rotateY(i * 0.8);
            leaf.translate(0, 0.74, 0);
            paint(leaf, i % 2 ? '#5fb83a' : '#3f9a24');
            leaves.push(leaf);
        }
        const g = merge([body, ...leaves]);
        g.rotateZ(0.12);
        return [{ geometry: g, material: clothMaterial }];
    },

    horns: () => {
        const horns = [-1, 1].map(s => hornGeometry([
            new THREE.Vector3(s * 0.15, 0.0, 0.1),
            new THREE.Vector3(s * 0.22, 0.13, 0.08),
            new THREE.Vector3(s * 0.27, 0.27, 0.0),
            new THREE.Vector3(s * 0.22, 0.38, -0.1),
        ], 0.06, '#d4212a', '#5a0a0f'));
        return [{ geometry: merge(horns), material: glossMaterial }];
    },
};

export const OUTFIT_KEYS = Object.keys(OUTFITS);

/** The pieces of an outfit (unknown keys: the helmet). */
export function outfitParts(key, color) {
    const k = OUTFITS[key] ? key : 'helmet';
    return cached(`outfit-${k}-${color}`, () => OUTFITS[k](color));
}

// ---------------------------------------------------------------- faces

const EX = 0.112, EY = 0.035, EZ = 0.345;

function temples(color) {
    return [-1, 1].map(s => {
        const t = new THREE.CylinderGeometry(0.009, 0.009, 0.3, 5);
        t.rotateX(Math.PI / 2);
        t.rotateY(-s * 0.35);
        t.translate(s * 0.27, EY + 0.01, 0.2);
        paint(t, color);
        return t;
    });
}

const FACES = {
    none: () => ({ parts: [] }),

    blush: () => {
        const parts = [];
        for (const s of [-1, 1]) {
            const disc = sphere(0.075, 12, 8);
            disc.scale(1.25, 0.8, 0.3);
            const p = onFace(s * 0.19, -0.07, 0.0);
            disc.translate(p.x, p.y, p.z);
            paint(disc, '#ff5f86');
            parts.push(disc);
            for (const [dx, dy] of [[-0.03, 0.02], [0.02, 0.03], [0.0, -0.01], [0.04, -0.02]]) {
                const f = sphere(0.009, 5, 4);
                const q = onFace(s * 0.17 + dx, -0.04 + dy, 0.02);
                f.translate(q.x, q.y, q.z);
                paint(f, '#a8553a');
                parts.push(f);
            }
        }
        return { parts: [{ geometry: merge(parts), material: clothMaterial }] };
    },

    glasses: () => {
        const parts = [];
        for (const s of [-1, 1]) {
            const rim = new THREE.TorusGeometry(0.1, 0.014, 6, 20);
            rim.scale(0.95, 1.05, 1);
            rim.translate(s * EX, EY, EZ);
            paint(rim, '#3a2a20');
            parts.push(rim);
        }
        const bridge = new THREE.TorusGeometry(0.03, 0.01, 4, 10, Math.PI);
        bridge.translate(0, EY + 0.03, EZ + 0.01);
        paint(bridge, '#3a2a20');
        parts.push(bridge, ...temples('#3a2a20'));
        const lenses = [-1, 1].map(s => {
            const l = new THREE.CircleGeometry(0.095, 18);
            l.translate(s * EX, EY, EZ + 0.004);
            return paint(l, '#ffffff');
        });
        return { parts: [{ geometry: merge(parts), material: glossMaterial }, { geometry: merge(lenses), material: lensGlass }] };
    },

    sunglasses: () => {
        const parts = [];
        for (const s of [-1, 1]) {
            const lens = sphere(0.11, 16, 10);
            lens.scale(1.2, 0.86, 0.26);
            lens.translate(s * (EX + 0.008), EY + 0.005, EZ + 0.012);
            paint(lens, (x, y) => (y > EY + 0.045 && x * s > s * (s * EX) - 0.02 && x * s < EX + 0.03 ? '#5a6a8a' : '#101016'));
            parts.push(lens);
            const shine = new THREE.BoxGeometry(0.06, 0.012, 0.01);
            shine.rotateZ(0.6);
            shine.translate(s * EX - 0.03, EY + 0.04, EZ + 0.04);
            paint(shine, '#ffffff');
            parts.push(shine);
        }
        const bridge = new THREE.BoxGeometry(0.06, 0.018, 0.02);
        bridge.translate(0, EY + 0.04, EZ + 0.02);
        paint(bridge, '#101016');
        parts.push(bridge, ...temples('#101016'));
        return { parts: [{ geometry: merge(parts), material: glossMaterial }], coversEyes: true };
    },

    mustache: () => {
        const parts = [];
        for (const s of [-1, 1]) {
            const half = new THREE.CapsuleGeometry(0.032, 0.11, 4, 8);
            half.rotateZ(Math.PI / 2 + s * 0.35);
            half.translate(s * 0.07, -0.11, 0.372);
            paint(half, '#4a2c18');
            const curl = new THREE.TorusGeometry(0.03, 0.016, 6, 12, Math.PI * 1.4);
            curl.rotateZ(s > 0 ? -0.3 : Math.PI + 0.3);
            curl.translate(s * 0.14, -0.08, 0.36);
            paint(curl, '#4a2c18');
            parts.push(half, curl);
        }
        return { parts: [{ geometry: merge(parts), material: clothMaterial }] };
    },

    eyepatch: () => {
        const patch = new THREE.CylinderGeometry(0.1, 0.1, 0.02, 18);
        patch.rotateX(Math.PI / 2);
        patch.scale(1, 1.08, 1);
        patch.translate(EX, EY, EZ + 0.005);
        paint(patch, '#141214');
        const strap = new THREE.TorusGeometry(HEAD_R * 1.04, 0.011, 4, 40);
        strap.rotateY(Math.PI / 2);
        strap.rotateX(0.0);
        strap.rotateZ(0.75);
        strap.scale(1.08, 0.97, 1.02);
        paint(strap, '#141214');
        const skull = sphere(0.02, 6, 4);
        skull.translate(EX, EY + 0.005, EZ + 0.02);
        paint(skull, '#ffffff');
        return { parts: [{ geometry: merge([patch, strap, skull]), material: clothMaterial }], hidesEye: 1 };
    },

    warpaint: color => {
        const parts = [];
        for (const s of [-1, 1]) {
            parts.push(faceBar(s * 0.19, -0.03, 0.13, 0.026, s * 0.15, '#d42a1f'));
            parts.push(faceBar(s * 0.19, -0.08, 0.13, 0.026, s * 0.15, '#141414'));
        }
        parts.push(faceBar(0, 0.2, 0.05, 0.13, 0, color));
        return { parts: [{ geometry: merge(parts), material: clothMaterial }] };
    },

    monocle: () => {
        const rim = new THREE.TorusGeometry(0.105, 0.015, 6, 22);
        rim.translate(-EX, EY, EZ + 0.01);
        paint(rim, '#ffcf3a');
        const chain = new THREE.TubeGeometry(new THREE.CatmullRomCurve3([
            new THREE.Vector3(-EX - 0.08, EY - 0.07, EZ),
            new THREE.Vector3(-0.22, -0.2, 0.28),
            new THREE.Vector3(-0.2, -0.33, 0.2),
        ]), 10, 0.007, 4, false);
        paint(chain, '#ffcf3a');
        const glass = new THREE.CircleGeometry(0.1, 18);
        glass.translate(-EX, EY, EZ + 0.012);
        paint(glass, '#ffffff');
        return { parts: [{ geometry: merge([rim, chain]), material: metalMaterial }, { geometry: merge([glass]), material: lensGlass }] };
    },

    scar: () => {
        const parts = [];
        const pts = [[-0.2, 0.22], [-0.13, 0.12], [-0.17, 0.06], [-0.08, -0.06]];
        for (let i = 1; i < pts.length; i++) {
            const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
            const len = Math.hypot(x1 - x0, y1 - y0);
            const a = Math.atan2(y1 - y0, x1 - x0);
            parts.push(faceBar((x0 + x1) / 2, (y0 + y1) / 2, len + 0.014, 0.03, a, '#d8465e'));
            // stitches across
            parts.push(faceBar((x0 + x1) / 2, (y0 + y1) / 2, 0.012, 0.06, a, '#5a1a22'));
        }
        return { parts: [{ geometry: merge(parts), material: clothMaterial }] };
    },

    goggles: () => {
        const parts = [];
        for (const s of [-1, 1]) {
            const rim = new THREE.TorusGeometry(0.1, 0.03, 8, 22);
            rim.translate(s * EX, EY, EZ + 0.02);
            paint(rim, '#b8862e');
            parts.push(rim);
        }
        const bridge = new THREE.BoxGeometry(0.06, 0.03, 0.03);
        bridge.translate(0, EY, EZ + 0.02);
        paint(bridge, '#b8862e');
        const strap = new THREE.TorusGeometry(HEAD_R * 1.05, 0.03, 4, 40);
        strap.rotateX(Math.PI / 2);
        strap.scale(1.08, 1, 1.0);
        strap.translate(0, EY, -0.02);
        paint(strap, '#6a4425');
        const glass = [-1, 1].map(s => {
            const g = new THREE.CircleGeometry(0.095, 18);
            g.translate(s * EX, EY, EZ + 0.025);
            return paint(g, '#ffffff');
        });
        return { parts: [{ geometry: merge([...parts, bridge, strap]), material: metalMaterial }, { geometry: merge(glass), material: amberGlass }] };
    },

    lasers: () => ({ parts: [], lasers: true }),
};

export const FACE_KEYS = Object.keys(FACES);

/** The pieces of a face (unknown keys: nothing). */
export function faceParts(key, color) {
    const k = FACES[key] ? key : 'none';
    return cached(`face-${k}-${color}`, () => FACES[k](color));
}

/** A laser beam along +z (length 1, scaled by the bunny). */
export const laserGeometry = (() => {
    const g = new THREE.CylinderGeometry(0.022, 0.022, 1, 6, 1, true);
    g.rotateX(Math.PI / 2);
    g.translate(0, 0, 0.5);
    return g;
})();
