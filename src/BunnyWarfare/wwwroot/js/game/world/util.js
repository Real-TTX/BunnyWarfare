// Small helpers for the world: a seeded random, merging of geometries (three/addons is not vendored), vertex colours, value noise (JS and GLSL).
import * as THREE from 'three';

/** A seeded random in [0, 1) with range() and pick(). The same seed gives the same island decoration in every browser. */
export function seeded(seed) {
    let a = seed >>> 0;
    const r = () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    r.range = (min, max) => min + r() * (max - min);
    r.pick = list => list[Math.floor(r() * list.length) % list.length];
    return r;
}

const tmpColor = new THREE.Color();

/** Gives every vertex of a geometry a colour (a value, or a function of the vertex position and normal). */
export function paint(geometry, color) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    if (!g.attributes.normal) g.computeVertexNormals();
    const pos = g.attributes.position, nor = g.attributes.normal;
    const colors = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
        if (typeof color === 'function') {
            tmpColor.set(color(pos.getX(i), pos.getY(i), pos.getZ(i), nor.getX(i), nor.getY(i), nor.getZ(i)));
        } else {
            tmpColor.set(color);
        }
        colors[i * 3] = tmpColor.r;
        colors[i * 3 + 1] = tmpColor.g;
        colors[i * 3 + 2] = tmpColor.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return g;
}

/** Merges non-indexed geometries with position, normal and color into one (attributes others than these are dropped). */
export function merge(parts) {
    let count = 0;
    const list = parts.map(p => {
        const g = p.index ? p.toNonIndexed() : p;
        if (!g.attributes.normal) g.computeVertexNormals();
        if (!g.attributes.color) paint(g, 0xffffff);
        count += g.attributes.position.count;
        return g;
    });
    const position = new Float32Array(count * 3), normal = new Float32Array(count * 3), color = new Float32Array(count * 3);
    let offset = 0;
    for (const g of list) {
        position.set(g.attributes.position.array, offset * 3);
        normal.set(g.attributes.normal.array, offset * 3);
        color.set(g.attributes.color.array, offset * 3);
        offset += g.attributes.position.count;
    }
    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(position, 3));
    merged.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
    merged.setAttribute('color', new THREE.BufferAttribute(color, 3));
    merged.computeBoundingSphere();
    merged.computeBoundingBox();
    return merged;
}

/** Moves the vertices of a geometry a little (a hand-made, less perfect look for rocks and blobs). */
export function jitter(geometry, amount, random) {
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    const pos = g.attributes.position;
    // the same corner must move the same way in every triangle: key by rounded position
    const moved = new Map();
    for (let i = 0; i < pos.count; i++) {
        const key = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
        let d = moved.get(key);
        if (!d) {
            d = [(random() - 0.5) * amount, (random() - 0.5) * amount, (random() - 0.5) * amount];
            moved.set(key, d);
        }
        pos.setXYZ(i, pos.getX(i) + d[0], pos.getY(i) + d[1], pos.getZ(i) + d[2]);
    }
    g.computeVertexNormals();
    return g;
}

function hash2(x, z) {
    let h = Math.imul(x | 0, 374761393) + Math.imul(z | 0, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Smooth value noise in [0, 1]. */
export function noise2(x, z) {
    const x0 = Math.floor(x), z0 = Math.floor(z);
    const fx = x - x0, fz = z - z0;
    const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
    const a = hash2(x0, z0), b = hash2(x0 + 1, z0), c = hash2(x0, z0 + 1), d = hash2(x0 + 1, z0 + 1);
    return (a * (1 - sx) + b * sx) * (1 - sz) + (c * (1 - sx) + d * sx) * sz;
}

export function fbm2(x, z, octaves = 4) {
    let sum = 0, amp = 0.5, norm = 0, f = 1;
    for (let i = 0; i < octaves; i++) {
        sum += amp * noise2(x * f, z * f);
        norm += amp;
        amp *= 0.5;
        f *= 2.03;
    }
    return sum / norm;
}

/** The same noise in GLSL (for the shaders of the ground and the water). */
export const GLSL_NOISE = /* glsl */ `
float bwHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float bwNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(bwHash(i), bwHash(i + vec2(1.0, 0.0)), u.x), mix(bwHash(i + vec2(0.0, 1.0)), bwHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float bwFbm(vec2 p) {
    float s = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) { s += a * bwNoise(p); p = p * 2.03 + vec2(17.1, 9.7); a *= 0.5; }
    return s / 0.9375;
}
`;

/** Shared uniforms of everything that moves with time and wind (grass, flowers, leaves, water). */
export function createWindUniforms() {
    return { uTime: { value: 0 }, uWind: { value: new THREE.Vector2(0.6, 0.3) } };
}

/**
 * Lets an instanced (or plain) material sway in the wind: the higher a vertex above the origin of the instance, the more it moves.
 * strength = metres at a height of one metre.
 */
export function windify(material, uniforms, strength = 0.18) {
    const previous = material.onBeforeCompile;
    material.onBeforeCompile = (shader, renderer) => {
        previous?.(shader, renderer);
        shader.uniforms.uTime = uniforms.uTime;
        shader.uniforms.uWind = uniforms.uWind;
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform vec2 uWind;')
            .replace('#include <begin_vertex>', `#include <begin_vertex>
            {
                float hgt = max(position.y, 0.0);
                vec4 wp = vec4(0.0, 0.0, 0.0, 1.0);
                #ifdef USE_INSTANCING
                    wp = instanceMatrix * wp;
                #endif
                wp = modelMatrix * wp;
                float gust = 0.55 + 0.45 * sin(uTime * 0.7 + wp.x * 0.08 + wp.z * 0.05);
                float sway = sin(uTime * 1.9 + wp.x * 0.55 + wp.z * 0.37) + 0.45 * sin(uTime * 3.3 + wp.z * 0.9);
                float k = hgt * hgt * ${strength.toFixed(3)};
                vec2 push = uWind * 0.35 * gust + vec2(sway, sway * 0.6) * (0.35 + length(uWind) * 0.25);
                transformed.x += push.x * k;
                transformed.z += push.y * k;
                transformed.y -= length(push) * k * 0.15;
            }`);
    };
    material.customProgramCacheKey = () => `wind-${strength}`;
    return material;
}

/** Disposes geometries and materials below an object. */
export function disposeTree(root) {
    root.traverse(o => {
        o.geometry?.dispose?.();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => {
            for (const v of Object.values(m)) if (v && v.isTexture) v.dispose();
            m.dispose();
        });
    });
}
