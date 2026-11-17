// The island: the height map the server sends (base64 float32), its mesh, and the craters.
// HeightAt and Crater are the same formulas as Game/Terrain.cs, so the browser digs exactly what the server dug.
import * as THREE from 'three';

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

/** The colours of the ground of each theme. */
const PALETTES = {
    Meadow: { deep: '#b9a46c', shore: '#e4d29a', low: '#6fb444', high: '#3f7f2a', rock: '#7d7468', peak: '#9a9284', dirt: '#6b4a2f' },
    Snow: { deep: '#8796a3', shore: '#b9c4cc', low: '#e9f0f5', high: '#fbfdff', rock: '#7f8a96', peak: '#ffffff', dirt: '#5f6670' },
    Desert: { deep: '#a98348', shore: '#f0d49a', low: '#e8c27a', high: '#d9a65c', rock: '#a0643a', peak: '#c98a4b', dirt: '#8a5a33' },
    Moon: { deep: '#55565e', shore: '#7d7e86', low: '#9a9aa0', high: '#b5b5ba', rock: '#6c6d75', peak: '#d0d0d4', dirt: '#46474e' },
};

export function paletteOf(theme) {
    const p = PALETTES[theme] ?? PALETTES.Meadow;
    const out = {};
    for (const [k, v] of Object.entries(p)) out[k] = new THREE.Color(v);
    return out;
}

/** The mesh of the island; updates itself where a crater was dug. */
export class TerrainMesh {
    constructor(data, theme) {
        this.data = data;
        this.palette = paletteOf(theme);
        const s = data.size;
        let top = data.waterLevel + 1;
        for (const h of data.heights) top = Math.max(top, h);
        this.top = top;

        const positions = new Float32Array(s * s * 3);
        const colors = new Float32Array(s * s * 3);
        for (let iz = 0; iz < s; iz++) {
            for (let ix = 0; ix < s; ix++) {
                const i = iz * s + ix;
                positions[i * 3] = ix * CELL;
                positions[i * 3 + 1] = data.heights[i];
                positions[i * 3 + 2] = iz * CELL;
            }
        }
        const indices = new Uint32Array((s - 1) * (s - 1) * 6);
        let k = 0;
        for (let iz = 0; iz < s - 1; iz++) {
            for (let ix = 0; ix < s - 1; ix++) {
                const a = iz * s + ix, b = a + s, c = a + 1, d = b + 1;
                indices[k++] = a; indices[k++] = b; indices[k++] = c;
                indices[k++] = c; indices[k++] = b; indices[k++] = d;
            }
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geometry.setIndex(new THREE.BufferAttribute(indices, 1));
        this.geometry = geometry;
        this.recolor(0, s - 1, 0, s - 1);
        geometry.computeVertexNormals();

        const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, flatShading: false });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.receiveShadow = true;
        this.mesh.castShadow = true;
        this.mesh.name = 'terrain';
    }

    colorAt(ix, iz, target) {
        const d = this.data, s = d.size, p = this.palette;
        const h = d.heights[iz * s + ix];
        const above = h - d.waterLevel;
        const slope = d.slopeAt(ix * CELL, iz * CELL);
        const dug = d.original[iz * s + ix] - h;
        if (above < 0) {
            target.copy(p.deep).lerp(p.shore, Math.max(0, 1 + above / 2));
        } else if (above < 0.35) {
            target.copy(p.shore);
        } else {
            const t = Math.min(1, above / Math.max(1, this.top - d.waterLevel));
            target.copy(p.low).lerp(p.high, t);
            if (t > 0.8) target.lerp(p.peak, (t - 0.8) * 3);
        }
        if (slope > 0.9) target.lerp(p.rock, Math.min(1, (slope - 0.9) * 1.5));
        if (dug > 0.12) target.lerp(p.dirt, Math.min(0.85, dug * 0.8));
        // a little noise so large surfaces do not look flat
        const n = ((ix * 73856093) ^ (iz * 19349663)) & 255;
        target.multiplyScalar(0.94 + (n / 255) * 0.1);
        return target;
    }

    recolor(minX, maxX, minZ, maxZ) {
        const s = this.data.size;
        const colors = this.geometry.attributes.color.array;
        const c = new THREE.Color();
        for (let iz = Math.max(0, minZ); iz <= Math.min(s - 1, maxZ); iz++) {
            for (let ix = Math.max(0, minX); ix <= Math.min(s - 1, maxX); ix++) {
                const i = iz * s + ix;
                this.colorAt(ix, iz, c);
                colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
            }
        }
        this.geometry.attributes.color.needsUpdate = true;
    }

    /** Digs a crater in the data and the mesh. */
    crater(x, y, z, radius) {
        const r = this.data.crater(x, y, z, radius);
        const s = this.data.size;
        const pos = this.geometry.attributes.position.array;
        for (let iz = r.minZ; iz <= r.maxZ; iz++) {
            for (let ix = r.minX; ix <= r.maxX; ix++) {
                const i = iz * s + ix;
                pos[i * 3 + 1] = this.data.heights[i];
            }
        }
        this.geometry.attributes.position.needsUpdate = true;
        this.geometry.computeVertexNormals();
        this.recolor(r.minX - 2, r.maxX + 2, r.minZ - 2, r.maxZ + 2);
    }

    dispose() {
        this.geometry.dispose();
        this.mesh.material.dispose();
    }
}
