// Top-down maps of the islands for the cards (new match, open matches, lobby): water, beach, land by height in the colours of the theme, with hill shading.
import { worldTerrain, worlds } from './api.js';

const PALETTES = {
    Meadow: { deep: [22, 74, 128], shallow: [64, 170, 200], beach: [232, 210, 150], low: [110, 180, 72], high: [56, 120, 48], peak: [138, 128, 112] },
    Snow: { deep: [30, 66, 98], shallow: [96, 156, 186], beach: [196, 206, 214], low: [226, 234, 242], high: [242, 247, 252], peak: [255, 255, 255] },
    Desert: { deep: [18, 92, 120], shallow: [70, 196, 196], beach: [240, 220, 160], low: [232, 190, 122], high: [204, 146, 84], peak: [168, 112, 70] },
    Moon: { deep: [10, 10, 22], shallow: [22, 22, 40], beach: [96, 96, 104], low: [132, 132, 140], high: [170, 170, 178], peak: [206, 206, 212] },
};

const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export function decode(base64) {
    const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    return new Float32Array(bytes.buffer);
}

/** Draws a terrain dto ({ size, heights, waterLevel, theme }) onto a canvas (any size; drawn at the canvas' pixel size). */
export function drawMap(canvas, terrain) {
    const heights = terrain._decoded ?? (terrain._decoded = decode(terrain.heights));
    const size = terrain.size;
    const p = PALETTES[terrain.theme] ?? PALETTES.Meadow;
    let top = 1;
    for (const h of heights) top = Math.max(top, h - terrain.waterLevel);
    const image = new ImageData(size, size);
    for (let z = 0; z < size; z++) {
        for (let x = 0; x < size; x++) {
            const i = z * size + x;
            const h = heights[i] - terrain.waterLevel;
            let c;
            if (h < 0) {
                c = mix(p.shallow, p.deep, Math.min(1, -h / 3));
            } else {
                const t = Math.min(1, h / top);
                c = h < 0.35 ? p.beach : t < 0.5 ? mix(p.low, p.high, t / 0.5) : mix(p.high, p.peak, (t - 0.5) / 0.5);
                // light from the north-west
                const hx = heights[z * size + Math.min(size - 1, x + 1)] - heights[z * size + Math.max(0, x - 1)];
                const hz = heights[Math.min(size - 1, z + 1) * size + x] - heights[Math.max(0, z - 1) * size + x];
                const shade = Math.max(0.6, Math.min(1.25, 1 - (hx + hz) * 0.35));
                c = [c[0] * shade, c[1] * shade, c[2] * shade];
            }
            image.data[i * 4] = c[0];
            image.data[i * 4 + 1] = c[1];
            image.data[i * 4 + 2] = c[2];
            image.data[i * 4 + 3] = 255;
        }
    }
    const off = document.createElement('canvas');
    off.width = size;
    off.height = size;
    off.getContext('2d').putImageData(image, 0, 0);
    const rect = canvas.getBoundingClientRect();
    const px = Math.max(96, Math.round((rect.width || 160) * Math.min(2, devicePixelRatio || 1)));
    canvas.width = px;
    canvas.height = px;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(off, 0, 0, px, px);
}

/** A canvas that fills itself with the map of a world (by id), quietly empty when it fails. */
export function mapCanvas(worldId) {
    const canvas = document.createElement('canvas');
    if (worldId !== null && worldId !== undefined) {
        worldTerrain(worldId).then(t => requestAnimationFrame(() => drawMap(canvas, t))).catch(() => {});
    }
    return canvas;
}

/** The same by the name of a world (open matches and the lobby only know the name). */
export function mapCanvasByName(worldName) {
    const canvas = document.createElement('canvas');
    worlds()
        .then(list => list.find(w => w.name === worldName))
        .then(w => (w ? worldTerrain(w.id) : null))
        .then(t => t && requestAnimationFrame(() => drawMap(canvas, t)))
        .catch(() => {});
    return canvas;
}
