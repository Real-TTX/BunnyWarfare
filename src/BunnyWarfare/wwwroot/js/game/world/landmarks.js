// Finds the landmarks of an island in its height map (the server sends only heights):
// - caves and the temple terrace: Terrain.CarveLandmarks makes their floors exactly flat (one float32 value over many cells), so they are
//   connected cells with the very same height (natural ground never is);
// - the caldera of the volcano: the ring of the highest cells;
// - inland ponds: water that is not connected to the sea.
// Everything works on the heights of the moment (after craters a damaged cave may not be found any more: then it is gone anyway).

const CELL = 0.5;

/** Connected cells (4 neighbours) of exactly the same height above the water: { kind: 'cave' | 'temple', ... } in metres. */
export function findLandmarks(data) {
    const s = data.size, h = data.heights;
    const low = data.waterLevel + 0.3, high = data.waterLevel + 21.9; // the clamp of the generator makes flat tops at +22
    const seen = new Uint8Array(s * s);
    const out = [];
    const stack = [];
    for (let i = 0; i < s * s; i++) {
        if (seen[i] || h[i] <= low || h[i] >= high) continue;
        const ix = i % s;
        // a cell of a flat floor has a neighbour of the same height
        if (!((ix < s - 1 && h[i + 1] === h[i]) || (i + s < s * s && h[i + s] === h[i]))) continue;
        const value = h[i];
        let count = 0, minX = s, minZ = s, maxX = 0, maxZ = 0;
        stack.length = 0;
        stack.push(i);
        seen[i] = 1;
        while (stack.length) {
            const j = stack.pop();
            const x = j % s, z = (j - x) / s;
            count++;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (z < minZ) minZ = z;
            if (z > maxZ) maxZ = z;
            for (const k of [x > 0 ? j - 1 : -1, x < s - 1 ? j + 1 : -1, z > 0 ? j - s : -1, z < s - 1 ? j + s : -1]) {
                if (k >= 0 && !seen[k] && h[k] === value) {
                    seen[k] = 1;
                    stack.push(k);
                }
            }
        }
        const w = maxX - minX + 1, d = maxZ - minZ + 1;
        if (count < 30 || count < w * d * 0.8) continue;
        const long = Math.max(w, d) / Math.min(w, d);
        const cx = (minX + maxX) / 2 * CELL, cz = (minZ + maxZ) / 2 * CELL;
        if (long > 1.5) {
            out.push(cave(data, value, minX, minZ, maxX, maxZ, cx, cz));
        } else if (count >= 120) {
            out.push({ kind: 'temple', x: cx, z: cz, floor: value, size: (Math.min(w, d) - 1) * CELL });
        }
    }
    return out;
}

/** A cave: its axis points from the mouth into the hill (the mouth is the end with level ground in front of it). */
function cave(data, floor, minX, minZ, maxX, maxZ, cx, cz) {
    const alongX = maxX - minX > maxZ - minZ;
    const length = ((alongX ? maxX - minX : maxZ - minZ)) * CELL;
    const width = ((alongX ? maxZ - minZ : maxX - minX)) * CELL;
    const ends = alongX
        ? [{ x: minX * CELL, z: cz, ax: 1, az: 0 }, { x: maxX * CELL, z: cz, ax: -1, az: 0 }]
        : [{ x: cx, z: minZ * CELL, ax: 0, az: 1 }, { x: cx, z: maxZ * CELL, ax: 0, az: -1 }];
    // in front of the mouth the ground is level with the floor, behind the back wall it is high
    const score = e => Math.abs(data.heightAt(e.x - e.ax * 1.0, e.z - e.az * 1.0) - floor);
    const mouth = score(ends[0]) <= score(ends[1]) ? ends[0] : ends[1];
    return { kind: 'cave', x: cx, z: cz, floor, length, width, mouthX: mouth.x, mouthZ: mouth.z, ax: mouth.ax, az: mouth.az, yaw: Math.atan2(mouth.ax, mouth.az) };
}

/**
 * The caldera of a volcano: near the highest point the lowest spot that is walled in on every side. Returns its centre, the height of its
 * floor and the rim, and the radius a pool may have there without poking out of the walls; null without a volcano.
 */
export function findVolcano(data) {
    const s = data.size, h = data.heights;
    let max = -Infinity;
    for (let i = 0; i < h.length; i++) if (h[i] > max) max = h[i];
    if (max < data.waterLevel + 6) return null;
    // how deep a spot lies in a bowl: the lowest of the highest walls around it (10 directions, up to 4.5 m)
    const depthIn = (x, z, y) => {
        let least = Infinity;
        for (let k = 0; k < 10 && least > 0.8; k++) {
            const a = (k / 10) * Math.PI * 2;
            let wall = -Infinity;
            for (let r = 0.8; r <= 4.5; r += 0.45) wall = Math.max(wall, data.heightAt(x + Math.cos(a) * r, z + Math.sin(a) * r));
            least = Math.min(least, wall - y);
        }
        return least;
    };
    let best = null;
    for (let iz = 4; iz < s - 4; iz++) {
        for (let ix = 4; ix < s - 4; ix++) {
            const y = h[iz * s + ix];
            if (y < data.waterLevel + 5) continue;
            const depth = depthIn(ix * CELL, iz * CELL, y);
            if (depth > 1.0 && (!best || depth > best.depth)) best = { x: ix * CELL, z: iz * CELL, floor: y, depth };
        }
    }
    if (!best) return null;    // the pool fills the bowl up to well below the rim; the disc reaches to the crest of the rim in the nearest direction
    // (inside the crest the ground hides what is above the lava, outside of it the cone would show a floating disc)
    const surface = best.floor + Math.min(1.2, best.depth * 0.45);
    let radius = 4.5;
    for (let k = 0; k < 24; k++) {
        const a = (k / 24) * Math.PI * 2;
        let top = -Infinity, crest = 0.5;
        for (let r = 0.3; r <= 4.5; r += 0.15) {
            const y = data.heightAt(best.x + Math.cos(a) * r, best.z + Math.sin(a) * r);
            if (y > top) { top = y; crest = r; }
        }
        radius = Math.min(radius, crest);
    }    return { x: best.x, z: best.z, rim: max, floor: best.floor, surface, radius: Math.max(0.5, radius) };
}
/** Water inside the island (not connected to the sea at the border): cells of the ponds and the land cells along their shore. */
export function findPonds(data) {
    const s = data.size, h = data.heights, wl = data.waterLevel;
    const sea = new Uint8Array(s * s);
    const stack = [];
    for (let i = 0; i < s; i++) for (const j of [i, (s - 1) * s + i, i * s, i * s + s - 1]) if (!sea[j] && h[j] < wl) { sea[j] = 1; stack.push(j); }
    while (stack.length) {
        const j = stack.pop();
        const x = j % s, z = (j - x) / s;
        for (const k of [x > 0 ? j - 1 : -1, x < s - 1 ? j + 1 : -1, z > 0 ? j - s : -1, z < s - 1 ? j + s : -1]) {
            if (k >= 0 && !sea[k] && h[k] < wl) {
                sea[k] = 1;
                stack.push(k);
            }
        }
    }
    const shore = [];
    let water = 0, wx = 0, wz = 0;
    for (let j = 0; j < s * s; j++) {
        if (h[j] >= wl || sea[j]) continue;
        water++;
        wx += j % s;
        wz += Math.floor(j / s);
    }
    if (water < 12) return null;
    for (let j = 0; j < s * s; j++) {
        if (h[j] < wl + 0.1) continue;
        const x = j % s, z = (j - x) / s;
        if (x < 1 || z < 1 || x > s - 2 || z > s - 2) continue;
        if ([j - 1, j + 1, j - s, j + s].some(k => h[k] < wl && !sea[k])) shore.push({ x: x * CELL, z: z * CELL, y: h[j] });
    }
    return { x: wx / water * CELL, z: wz / water * CELL, cells: water, shore };
}
