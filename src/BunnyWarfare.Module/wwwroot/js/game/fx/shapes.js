// Small helpers to build stylised low-poly models from primitives: vertex colours, merging, lumpy "fluffy" spheres, a seeded random.
// Every model of the game is made from these (no model files): one merged geometry per moving part keeps the draw calls low.
import * as THREE from 'three';

const tmp = new THREE.Color();

/** Paints a geometry with a vertex colour: a colour, or a function (x, y, z) => colour in the geometry's own space. */
export function paint(geometry, color) {
    const fn = typeof color === 'function' ? color : () => color;
    const pos = geometry.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
        tmp.set(fn(pos.getX(i), pos.getY(i), pos.getZ(i)));
        colors[i * 3] = tmp.r;
        colors[i * 3 + 1] = tmp.g;
        colors[i * 3 + 2] = tmp.b;
    }
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return geometry;
}

/** Merges painted geometries into one (non-indexed: position, normal, color). */
export function merge(parts) {
    const flat = parts.map(g => (g.index ? g.toNonIndexed() : g));
    let count = 0;
    for (const g of flat) count += g.attributes.position.count;
    const position = new Float32Array(count * 3);
    const normal = new Float32Array(count * 3);
    const color = new Float32Array(count * 3);
    let offset = 0;
    for (const g of flat) {
        if (!g.attributes.normal) g.computeVertexNormals();
        const n = g.attributes.position.count;
        position.set(g.attributes.position.array, offset * 3);
        normal.set(g.attributes.normal.array, offset * 3);
        if (g.attributes.color) color.set(g.attributes.color.array, offset * 3);
        else color.fill(1, offset * 3, (offset + n) * 3);
        offset += n;
    }
    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(position, 3));
    merged.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
    merged.setAttribute('color', new THREE.BufferAttribute(color, 3));
    merged.computeBoundingSphere();
    merged.computeBoundingBox();
    return merged;
}

export const sphere = (r, w = 14, h = 10) => new THREE.SphereGeometry(r, w, h);

/** A deterministic pseudo noise in [-1, 1] for a point (cheap, smooth enough for lumps). */
export function lumpNoise(x, y, z, seed = 0) {
    return (
        Math.sin(x * 7.1 + seed) * Math.cos(y * 6.3 - seed * 0.7) * 0.5 +
        Math.sin(z * 8.7 + y * 3.1 + seed * 1.3) * 0.35 +
        Math.cos(x * 13.3 - z * 11.9 + seed) * 0.15
    );
}

/**
 * A fluffy sphere: radius r, each vertex pushed out a little by a noise and by "tufts" (the fur looks soft and a bit lumpy).
 * Smooth normals; the seam of the sphere sits at the back (-z).
 */
export function fluffySphere(r, amount = 0.06, seed = 0, w = 22, h = 16) {
    const g = new THREE.SphereGeometry(r, w, h, -Math.PI / 2, Math.PI * 2);
    const pos = g.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i);
        const n = lumpNoise(v.x / r, v.y / r, v.z / r, seed);
        const tuft = Math.pow(Math.max(0, Math.sin(v.x * 31 / r) * Math.sin(v.y * 27 / r) * Math.sin(v.z * 29 / r)), 3) * 0.6;
        v.multiplyScalar(1 + (n * 0.5 + tuft) * amount);
        pos.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    return g;
}

/** A capsule-like ear/limb: a capsule of radius r and length len standing on y = 0 (its base) and going up. */
export function limb(r, len, radial = 8) {
    const g = new THREE.CapsuleGeometry(r, len, 4, radial);
    g.translate(0, len / 2 + r * 0.6, 0);
    return g;
}

/** A seeded random (mulberry32). */
export function rng(seed) {
    let a = seed >>> 0;
    const r = () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    r.range = (lo, hi) => lo + r() * (hi - lo);
    return r;
}

/** Mixes two hex colours (t = 0 .. 1) and returns a THREE.Color. */
export function mix(a, b, t) {
    return new THREE.Color(a).lerp(new THREE.Color(b), t);
}

/** A soft round dot texture (particles, glows). */
let dotTexture = null;
export function softDot() {
    if (dotTexture) return dotTexture;
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.45, 'rgba(255,255,255,0.75)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    dotTexture = new THREE.CanvasTexture(canvas);
    dotTexture.colorSpace = THREE.SRGBColorSpace;
    return dotTexture;
}

/** A soft ring texture (the glow under the bunny of the turn, shockwaves). */
let ringTexture = null;
export function softRing() {
    if (ringTexture) return ringTexture;
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.08)');
    g.addColorStop(0.78, 'rgba(255,255,255,0.95)');
    g.addColorStop(0.88, 'rgba(255,255,255,0.55)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    ringTexture = new THREE.CanvasTexture(canvas);
    ringTexture.colorSpace = THREE.SRGBColorSpace;
    return ringTexture;
}
