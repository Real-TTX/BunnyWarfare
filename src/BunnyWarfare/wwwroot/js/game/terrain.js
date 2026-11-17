// The island: the height map the server sends (base64 float32), its mesh with a procedural ground shader, the craters,
// and the "skirt" around the map that carries the island on into the sea floor and the horizon (so the map has no visible edge).
// HeightAt and Crater are the same formulas as Game/Terrain.cs, so the browser digs exactly what the server dug.
import * as THREE from 'three';
import { GLSL_NOISE, fbm2, noise2, seeded } from './world/util.js';

export const CELL = 0.5;
export const BEDROCK = -6;
export const ABYSS = -12;

/** Reads the base64 of little-endian float32 values into a Float32Array. */
export function decodeHeights(base64) {
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    const view = new DataView(bytes.buffer);
    const heights = new Float32Array(bytes.length / 4);
    for (let i = 0; i < heights.length; i++) heights[i] = view.getFloat32(i * 4, true);
    return heights;
}

/** The height map and its queries. */
export class TerrainData {
    constructor(size, heights, waterLevel) {
        this.size = size;
        this.heights = heights;
        this.original = heights.slice();
        this.waterLevel = waterLevel;
        this.width = (size - 1) * CELL;
        let top = waterLevel + 1;
        for (const h of heights) if (h > top) top = h;
        this.top = top;
    }

    inside(x, z) {
        return x >= 0 && z >= 0 && x <= this.width && z <= this.width;
    }

    heightAt(x, z) {
        if (!this.inside(x, z)) return ABYSS;
        const s = this.size;
        const gx = x / CELL, gz = z / CELL;
        const ix = Math.min(Math.floor(gx), s - 2), iz = Math.min(Math.floor(gz), s - 2);
        const fx = gx - ix, fz = gz - iz;
        const h = this.heights;
        const h00 = h[iz * s + ix], h10 = h[iz * s + ix + 1];
        const h01 = h[(iz + 1) * s + ix], h11 = h[(iz + 1) * s + ix + 1];
        return (h00 * (1 - fx) + h10 * fx) * (1 - fz) + (h01 * (1 - fx) + h11 * fx) * fz;
    }

    /** Steepness like the server: 0 flat, 1 = 45°. */
    slopeAt(x, z) {
        const e = CELL;
        const dx = this.heightAt(x + e, z) - this.heightAt(x - e, z);
        const dz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
        const n = new THREE.Vector3(-dx, 2 * e, -dz).normalize();
        return Math.sqrt(n.x * n.x + n.z * n.z) / Math.max(0.05, n.y);
    }

    /** Digs a spherical crater (Terrain.Crater) and returns the touched grid region. */
    crater(cx, cy, cz, radius) {
        const s = this.size;
        const minX = Math.max(0, Math.floor((cx - radius) / CELL));
        const maxX = Math.min(s - 1, Math.ceil((cx + radius) / CELL));
        const minZ = Math.max(0, Math.floor((cz - radius) / CELL));
        const maxZ = Math.min(s - 1, Math.ceil((cz + radius) / CELL));
        const r2 = radius * radius;
        for (let iz = minZ; iz <= maxZ; iz++) {
            for (let ix = minX; ix <= maxX; ix++) {
                const dx = ix * CELL - cx, dz = iz * CELL - cz;
                const d2 = dx * dx + dz * dz;
                if (d2 >= r2) continue;
                const bottom = Math.fround(Math.max(BEDROCK, cy - Math.sqrt(r2 - d2)));
                const i = iz * s + ix;
                if (this.heights[i] > bottom) this.heights[i] = bottom;
            }
        }
        return { minX, maxX, minZ, maxZ };
    }
}

// ---------------------------------------------------------------- the ground shader

/** The colours of the ground of each theme (the shader mixes them with noise by height, slope and water). */
const PALETTES = {
    Meadow: {
        grassA: '#5fa83a', grassB: '#86bf45', grassDry: '#a9b84e', dirt: '#7a5634', sand: '#e6d29a', wetSand: '#b39a63', seabed: '#c2ad78',
        rock: '#8a8276', rockDark: '#5e574f', snow: '#f4f8fb', scorch: '#2b1d14',
    },
    Snow: {
        grassA: '#eef4f9', grassB: '#dde8f1', grassDry: '#c9d6e2', dirt: '#8a8f95', sand: '#c9d0d6', wetSand: '#8d98a2', seabed: '#6f7f8c',
        rock: '#6f7b88', rockDark: '#47505b', snow: '#ffffff', scorch: '#2a2a2e',
    },
    Desert: {
        grassA: '#e8c27c', grassB: '#f0cf8e', grassDry: '#d9a965', dirt: '#b77d45', sand: '#f3dca4', wetSand: '#c09a5f', seabed: '#d9c28c',
        rock: '#b8693d', rockDark: '#8a4a2a', snow: '#fff3dc', scorch: '#3a2414',
    },
    Moon: {
        grassA: '#9c9ca4', grassB: '#b4b4ba', grassDry: '#86868e', dirt: '#6a6a72', sand: '#8e8e96', wetSand: '#5d5d66', seabed: '#3b3b44',
        rock: '#6c6d76', rockDark: '#4a4b53', snow: '#d6d6dc', scorch: '#1c1c22',
    },
};

const THEME_INDEX = { Meadow: 0, Snow: 1, Desert: 2, Moon: 3 };

export function paletteOf(theme) {
    const p = PALETTES[theme] ?? PALETTES.Meadow;
    const out = {};
    for (const [k, v] of Object.entries(p)) out[k] = new THREE.Color(v);
    return out;
}

/**
 * The material of the ground (island and skirt): MeshStandardMaterial with a procedural world-space colour in the fragment shader
 * (grass patches, dirt, sand ripples, rock strata on slopes, snow, wet sand, moon regolith), a fine noise bump and the vertex colour as
 * a multiplier (white, or dark where a crater scorched the ground).
 */
export function createGroundMaterial(theme, waterLevel, top) {
    const p = paletteOf(theme);
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.93, metalness: 0 });
    const uniforms = {
        uWater: { value: waterLevel },
        uTop: { value: Math.max(waterLevel + 2, top) },
    };
    for (const [k, c] of Object.entries(p)) uniforms['c_' + k] = { value: c };
    material.userData.uniforms = uniforms;
    material.onBeforeCompile = shader => {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nvarying vec3 vBwWorld;\nvarying vec3 vBwNormal;')
            .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
                vBwWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;
                vBwNormal = normalize(mat3(modelMatrix) * objectNormal);`);
        const colorUniforms = Object.keys(p).map(k => `uniform vec3 c_${k};`).join('\n');
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', `#include <common>
                #define BW_THEME ${THEME_INDEX[theme] ?? 0}
                varying vec3 vBwWorld;
                varying vec3 vBwNormal;
                uniform float uWater;
                uniform float uTop;
                ${colorUniforms}
                ${GLSL_NOISE}
                vec3 bwGround(vec3 wp, vec3 n, out float bump) {
                    float a = wp.y - uWater;                       // height above the water
                    float slope = 1.0 - clamp(n.y, 0.0, 1.0);      // 0 flat, ~0.3 = 45 degrees
                    float t = clamp(a / max(1.0, uTop - uWater), 0.0, 1.0);
                    float big = bwFbm(wp.xz * 0.045);
                    float mid = bwFbm(wp.xz * 0.21 + 3.1);
                    float fine = bwNoise(wp.xz * 2.7);
                    bump = fine * 0.6 + bwNoise(wp.xz * 7.3) * 0.4;
                    vec3 c;
                #if BW_THEME == 0
                    // meadow: two greens in big patches, dry yellowish spots, little dirt paths
                    c = mix(c_grassA, c_grassB, smoothstep(0.35, 0.7, big));
                    c = mix(c, c_grassDry, smoothstep(0.62, 0.8, mid) * 0.55);
                    float path = smoothstep(0.035, 0.0, abs(bwFbm(wp.xz * 0.06 + 11.0) - 0.5));
                    c = mix(c, c_dirt, path * 0.75 * (1.0 - smoothstep(0.3, 0.5, slope)));
                    c *= 0.9 + fine * 0.18;
                #elif BW_THEME == 1
                    // snow: soft blue shadows in drifts and sparkles
                    c = mix(c_grassB, c_grassA, smoothstep(0.3, 0.75, big));
                    c = mix(c, c_grassDry, smoothstep(0.55, 0.85, mid) * 0.4);
                    c += vec3(step(0.985, bwHash(floor(wp.xz * 22.0)))) * 0.25;
                #elif BW_THEME == 2
                    // desert: sand with wind ripples and darker dune flanks
                    float ripple = sin((wp.x * 0.83 + wp.z * 0.42) * 5.5 + mid * 7.0) * 0.5 + 0.5;
                    c = mix(c_grassA, c_grassB, smoothstep(0.3, 0.7, big));
                    c = mix(c, c_grassDry, ripple * 0.22 + smoothstep(0.6, 0.85, mid) * 0.3);
                    bump += ripple * 0.8;
                #else
                    // moon: regolith with dark maria and bright little impact spots
                    c = mix(c_grassDry, c_grassB, smoothstep(0.25, 0.75, big));
                    c = mix(c, c_dirt, smoothstep(0.6, 0.8, mid) * 0.6);
                    vec2 cell = floor(wp.xz * 0.35);
                    vec2 f = fract(wp.xz * 0.35) - 0.5;
                    float r = 0.15 + 0.25 * bwHash(cell + 7.0);
                    float d = length(f + (vec2(bwHash(cell), bwHash(cell + 3.0)) - 0.5) * 0.4);
                    float rim = smoothstep(r + 0.06, r, d) * smoothstep(r - 0.08, r, d);
                    float hole = smoothstep(r, r - 0.08, d);
                    float used = step(0.55, bwHash(cell + 11.0));
                    c = mix(c, c_snow, rim * used * 0.45);
                    c = mix(c, c_rockDark, hole * used * 0.35);
                    bump += (rim - hole) * used * 1.5;
                    c *= 0.9 + fine * 0.15;
                #endif
                    // rock where it is steep, with strata (noise projected onto the walls, not stretched down from above)
                    float side = abs(n.x) / (abs(n.x) + abs(n.z) + 1e-4);
                    float wall = mix(bwFbm(vec2(wp.z, wp.y * 1.6) * 0.45), bwFbm(vec2(wp.x, wp.y * 1.6) * 0.45), side);
                    float wallFine = mix(bwNoise(vec2(wp.z, wp.y) * 3.1), bwNoise(vec2(wp.x, wp.y) * 3.1), side);
                    float strata = sin(wp.y * 5.0 + wall * 5.0) * 0.5 + 0.5;
                    vec3 rock = mix(c_rockDark, c_rock, 0.35 + strata * 0.3 + wallFine * 0.35);
                    float rocky = smoothstep(0.22, 0.42, slope + (wall - 0.5) * 0.2);
                    c = mix(c, rock, rocky);
                    bump = mix(bump, strata * 0.8 + wallFine * 1.2, rocky);
                #if BW_THEME == 1
                    // snow stays on everything that is not too steep
                    c = mix(c, c_snow, smoothstep(0.45, 0.3, slope) * smoothstep(0.1, 0.4, a) * 0.85);
                #else
                #endif
                    // beach, wet sand at the waterline, the sea floor below
                    float beach = smoothstep(0.55 + mid * 0.3, 0.2, a);
                #if BW_THEME == 3
                    beach *= 0.0;
                #endif
                    c = mix(c, c_sand, beach * (1.0 - rocky * 0.7));
                #if BW_THEME != 3
                    c = mix(c, c_wetSand, smoothstep(0.18, 0.0, a) * (1.0 - rocky * 0.5));
                    c = mix(c, c_seabed * (0.85 + 0.25 * mid), smoothstep(-0.05, -0.9, a));
                    c *= mix(1.0, 0.72, smoothstep(-0.5, -4.0, a));
                #else
                    c *= mix(1.0, 0.12, smoothstep(-0.5, -14.0, a));
                #endif
                    return c;
                }`)
            .replace('#include <color_fragment>', `#include <color_fragment>
                float bwBump;
                vec3 bwN = normalize(vBwNormal);
                diffuseColor.rgb *= bwGround(vBwWorld, bwN, bwBump);`)
            .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
                {
                    // a fine bump from the noise (like a bump map, from the screen derivatives)
                    vec3 dpdx = dFdx(-vViewPosition), dpdy = dFdy(-vViewPosition);
                    float bx = dFdx(bwBump), by = dFdy(bwBump);
                    vec3 r1 = cross(dpdy, normal), r2 = cross(normal, dpdx);
                    float det = dot(dpdx, r1);
                    vec3 grad = sign(det) * (bx * r1 + by * r2) * 0.05;
                    normal = normalize(abs(det) * normal - grad);
                }`);
    };
    material.customProgramCacheKey = () => `bw-ground-${theme}`;
    return material;
}

// ---------------------------------------------------------------- the island mesh

/** The mesh of the island; updates itself where a crater was dug (positions, normals, scorch tint). */
/**
 * The height a point is drawn at. On the moon everything below the "water" level is the void: it is drawn far deeper, so the island
 * stands on cliffs above the abyss (only the look: the server lets nothing touch ground down there).
 */
export function visualHeight(h, waterLevel, theme) {
    if (theme !== 'Moon' || h >= waterLevel - 0.2) return h;
    const below = waterLevel - 0.2 - h;
    return waterLevel - 0.2 - Math.min(38, below * 6 + below * below * 3);
}

export class TerrainMesh {
    constructor(data, theme, material) {
        this.data = data;
        this.theme = theme;
        const s = data.size;
        const positions = new Float32Array(s * s * 3);
        const colors = new Float32Array(s * s * 3).fill(1);
        for (let iz = 0; iz < s; iz++) {
            for (let ix = 0; ix < s; ix++) {
                const i = iz * s + ix;
                positions[i * 3] = ix * CELL;
                positions[i * 3 + 1] = visualHeight(data.heights[i], data.waterLevel, theme);
                positions[i * 3 + 2] = iz * CELL;
            }
        }
        const indices = new Uint32Array((s - 1) * (s - 1) * 6);
        let k = 0;
        for (let iz = 0; iz < s - 1; iz++) {
            for (let ix = 0; ix < s - 1; ix++) {
                const a = iz * s + ix, b = a + s, c = a + 1, d = b + 1;
                // alternate the diagonal for a less regular look
                if ((ix + iz) % 2 === 0) {
                    indices[k++] = a; indices[k++] = b; indices[k++] = c;
                    indices[k++] = c; indices[k++] = b; indices[k++] = d;
                } else {
                    indices[k++] = a; indices[k++] = b; indices[k++] = d;
                    indices[k++] = a; indices[k++] = d; indices[k++] = c;
                }
            }
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setIndex(new THREE.BufferAttribute(indices, 1));
        geometry.computeVertexNormals();
        geometry.computeBoundingSphere();
        this.geometry = geometry;
        this.scorch = paletteOf(theme).scorch;

        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.receiveShadow = true;
        this.mesh.castShadow = true;
        this.mesh.name = 'terrain';
    }

    /** Darkens the ground where it was dug (the deeper, the darker), with a ragged burnt edge. */
    tint(minX, maxX, minZ, maxZ) {
        const d = this.data, s = d.size;
        const colors = this.geometry.attributes.color.array;
        const white = new THREE.Color(1, 1, 1), c = new THREE.Color();
        for (let iz = Math.max(0, minZ); iz <= Math.min(s - 1, maxZ); iz++) {
            for (let ix = Math.max(0, minX); ix <= Math.min(s - 1, maxX); ix++) {
                const i = iz * s + ix;
                const dug = d.original[i] - d.heights[i];
                // the rim around the hole gets a little soot too
                let soot = Math.min(0.85, dug * 0.7);
                if (soot < 0.05) {
                    let near = 0;
                    for (let oz = -2; oz <= 2; oz++) {
                        for (let ox = -2; ox <= 2; ox++) {
                            const jx = ix + ox, jz = iz + oz;
                            if (jx < 0 || jz < 0 || jx >= s || jz >= s) continue;
                            const j = jz * s + jx;
                            if (d.original[j] - d.heights[j] > 0.1) near++;
                        }
                    }
                    soot = Math.min(0.45, near * 0.05) * (0.6 + 0.4 * noise2(ix * 1.7, iz * 1.7));
                }
                c.copy(white).lerp(this.scorch, soot);
                colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
            }
        }
        this.geometry.attributes.color.needsUpdate = true;
    }

    /** Digs a crater in the data and the mesh; returns the touched grid region. */
    crater(x, y, z, radius) {
        const r = this.data.crater(x, y, z, radius);
        const s = this.data.size;
        const pos = this.geometry.attributes.position.array;
        for (let iz = r.minZ; iz <= r.maxZ; iz++) {
            for (let ix = r.minX; ix <= r.maxX; ix++) {
                const i = iz * s + ix;
                pos[i * 3 + 1] = visualHeight(this.data.heights[i], this.data.waterLevel, this.theme);
            }
        }
        this.geometry.attributes.position.needsUpdate = true;
        this.updateNormals(r.minX - 1, r.maxX + 1, r.minZ - 1, r.maxZ + 1);
        this.tint(r.minX - 3, r.maxX + 3, r.minZ - 3, r.maxZ + 3);
        return r;
    }

    /** Recomputes the normals of a region only (central differences, the same look as the smooth normals). */
    updateNormals(minX, maxX, minZ, maxZ) {
        const s = this.data.size;
        const p = this.geometry.attributes.position.array;
        const at = i => p[i * 3 + 1];
        const n = this.geometry.attributes.normal.array;
        const v = new THREE.Vector3();
        for (let iz = Math.max(0, minZ); iz <= Math.min(s - 1, maxZ); iz++) {
            for (let ix = Math.max(0, minX); ix <= Math.min(s - 1, maxX); ix++) {
                const l = at(iz * s + Math.max(0, ix - 1)), r = at(iz * s + Math.min(s - 1, ix + 1));
                const d = at(Math.max(0, iz - 1) * s + ix), u = at(Math.min(s - 1, iz + 1) * s + ix);
                v.set(l - r, 2 * CELL, d - u).normalize();
                const i = (iz * s + ix) * 3;
                n[i] = v.x; n[i + 1] = v.y; n[i + 2] = v.z;
            }
        }
        this.geometry.attributes.normal.needsUpdate = true;
    }

    dispose() {
        this.geometry.dispose();
    }
}

// ---------------------------------------------------------------- the skirt: sea floor, coast and islets around the map

/**
 * A large ground mesh around the map: it starts exactly at the border heights of the map (no crack), sinks to a rolling sea floor
 * (sand dunes, rock ridges) and rises again into a few islets and cliffs on the horizon. The inner square of the map is left out.
 */
export class SkirtMesh {
    constructor(data, theme, material, seed) {
        const W = data.width, s = data.size;
        const random = seeded(seed);
        const reach = Math.max(140, W * 4.2);
        // the grid lines: the map lines (0.5 m) inside, then growing steps outwards
        const lines = [];
        for (let i = 0; i < s; i++) lines.push(i * CELL);
        let step = CELL, x = W;
        while (x < W + reach) {
            step = Math.min(10, step * 1.12);
            x += step;
            lines.push(x);
        }
        step = CELL;
        x = 0;
        const before = [];
        while (x > -reach) {
            step = Math.min(10, step * 1.12);
            x -= step;
            before.unshift(x);
        }
        const xs = before.concat(lines);
        const n = xs.length;
        const floor = theme === 'Moon' ? data.waterLevel - 38 : data.waterLevel - 5.5;
        const center = W / 2;

        // islets on the horizon: a few round hills with steep flanks
        this.islets = [];
        if (theme !== 'Moon') {
            const count = 4 + Math.floor(random() * 3);
            for (let i = 0; i < count; i++) {
                const angle = (i / count) * Math.PI * 2 + random() * 0.8;
                const dist = W * (1.5 + random() * 1.4) + 25;
                this.islets.push({
                    x: center + Math.cos(angle) * dist, z: center + Math.sin(angle) * dist,
                    r: 5 + random() * (6 + W * 0.08), h: 1.5 + random() * 4 + (i === 0 ? 3 : 0),
                });
            }
        } else {
            // the moon: far ridges of the crater rim
            for (let i = 0; i < 7; i++) {
                const angle = (i / 7) * Math.PI * 2 + random() * 0.5;
                const dist = W * (1.5 + random() * 1.3) + 25;
                this.islets.push({ x: center + Math.cos(angle) * dist, z: center + Math.sin(angle) * dist, r: 16 + random() * 26, h: -24 + random() * 14 });
            }
        }

        const vis = h => visualHeight(h, data.waterLevel, theme);
        const borderHeight = (bx, bz) => vis(data.heightAt(Math.min(W, Math.max(0, bx)), Math.min(W, Math.max(0, bz))));
        const heightOf = (px, pz) => {
            const inside = px >= 0 && pz >= 0 && px <= W && pz <= W;
            if (inside) return vis(data.heightAt(px, pz));
            const dx = px < 0 ? -px : px > W ? px - W : 0;
            const dz = pz < 0 ? -pz : pz > W ? pz - W : 0;
            const out = Math.hypot(dx, dz);
            const edge = borderHeight(px, pz);
            const k = THREE.MathUtils.smoothstep(out, 0, theme === 'Moon' ? 10 : 22);
            let ground = floor + (fbm2(px * 0.03, pz * 0.03) - 0.5) * 3 + (noise2(px * 0.15, pz * 0.15) - 0.5) * 0.6;
            for (const isle of this.islets) {
                const d = Math.hypot(px - isle.x, pz - isle.z) / isle.r;
                if (d < 1.6) {
                    const shape = Math.pow(Math.max(0, 1 - d * d / 2.56), 1.3);
                    const lumps = 0.75 + 0.5 * fbm2(px * 0.12 + isle.x, pz * 0.12);
                    ground = Math.max(ground, floor + (data.waterLevel - floor + isle.h * lumps) * Math.min(1, shape * 1.25));
                }
            }
            return edge * (1 - k) + ground * k;
        };

        const positions = new Float32Array(n * n * 3);
        for (let j = 0; j < n; j++) {
            for (let i = 0; i < n; i++) {
                const o = (j * n + i) * 3;
                positions[o] = xs[i];
                positions[o + 1] = heightOf(xs[i], xs[j]);
                positions[o + 2] = xs[j];
            }
        }
        // the cells of the map itself are left out (the island mesh covers them)
        const first = before.length, last = before.length + s - 1;
        const indices = [];
        for (let j = 0; j < n - 1; j++) {
            for (let i = 0; i < n - 1; i++) {
                if (i >= first && i < last && j >= first && j < last) continue;
                const a = j * n + i, b = a + n, c = a + 1, d = b + 1;
                indices.push(a, b, c, c, b, d);
            }
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * n * 3).fill(1), 3));
        geometry.setIndex(indices);
        geometry.computeVertexNormals();
        geometry.computeBoundingSphere();
        this.geometry = geometry;
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.receiveShadow = true;
        this.mesh.name = 'skirt';
        this.heightOf = heightOf;
        this.reach = reach;
    }

    dispose() {
        this.geometry.dispose();
    }
}
