// The decoration of an island: plants, rocks and props per theme as instanced meshes, placed with a seeded random (the same in every browser),
// away from the water, steep slopes and the start spots of the bunnies. Craters remove what stood in the blast and set the rest onto the new ground.
import * as THREE from 'three';
import * as M from './models.js';
import { seeded, windify, noise2, fbm2 } from './util.js';

const GRID = 4;
const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sc = new THREE.Vector3();
const hidden = new THREE.Matrix4().makeScale(0, 0, 0);

/** One kind of decoration: an InstancedMesh with its items and a spatial grid for the craters. */
class DecoLayer {
    constructor(geometry, material, items, { shadow = true, water = false, name = 'deco' } = {}) {
        this.items = items;
        this.water = water;
        this.mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, items.length));
        this.mesh.name = name;
        this.mesh.castShadow = shadow;
        this.mesh.receiveShadow = true;
        this.mesh.count = items.length;
        this.grid = new Map();
        const color = new THREE.Color();
        items.forEach((item, i) => {
            this.write(i);
            if (item.tint) this.mesh.setColorAt(i, color.set(item.tint));
            const key = `${Math.floor(item.x / GRID)},${Math.floor(item.z / GRID)}`;
            if (!this.grid.has(key)) this.grid.set(key, []);
            this.grid.get(key).push(i);
        });
        this.mesh.instanceMatrix.needsUpdate = true;
        if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
        this.mesh.computeBoundingSphere();
    }

    write(i) {
        const it = this.items[i];
        if (it.gone) {
            this.mesh.setMatrixAt(i, hidden);
            return;
        }
        e.set(it.tx ?? 0, it.rot, it.tz ?? 0);
        q.setFromEuler(e);
        sc.set(it.s * (it.sx ?? 1), it.s * (it.sy ?? 1), it.s * (it.sz ?? 1));
        v.set(it.x, it.y, it.z);
        m4.compose(v, q, sc);
        this.mesh.setMatrixAt(i, m4);
    }

    /** Removes what is inside the blast, puts what stands at its rim onto the new ground. */
    crater(x, z, radius, data) {
        const reach = radius * 1.9 + 2;
        let changed = false;
        for (let gz = Math.floor((z - reach) / GRID); gz <= Math.floor((z + reach) / GRID); gz++) {
            for (let gx = Math.floor((x - reach) / GRID); gx <= Math.floor((x + reach) / GRID); gx++) {
                const list = this.grid.get(`${gx},${gz}`);
                if (!list) continue;
                for (const i of list) {
                    const it = this.items[i];
                    if (it.gone) continue;
                    const d = Math.hypot(it.x - x, it.z - z);
                    if (d < radius + (it.r ?? 0.2) * it.s * 0.6) {
                        it.gone = true;
                    } else if (d < reach && !this.water) {
                        const ground = data.heightAt(it.x, it.z) + (it.dy ?? 0);
                        if (ground < it.y - 0.01) {
                            it.y = ground;
                            // fallen into the sea or tilted a lot: gone
                            if (ground < data.waterLevel + (it.wet ? -0.4 : 0.05)) it.gone = true;
                            else { it.tx = (it.tx ?? 0) + (Math.random() - 0.5) * 0.25; it.tz = (it.tz ?? 0) + (Math.random() - 0.5) * 0.25; }
                        }
                    }
                    this.write(i);
                    changed = true;
                }
            }
        }
        if (changed) this.mesh.instanceMatrix.needsUpdate = true;
    }

    dispose() {
        this.mesh.geometry.dispose();
        this.mesh.dispose?.();
    }
}

/** Finds spots on the island that fit a rule. */
class Scatter {
    constructor(data, bunnies, random) {
        this.data = data;
        this.bunnies = bunnies;
        this.random = random;
        this.taken = []; // big things keep apart from each other
    }

    sample(margin = 1) {
        const w = this.data.width;
        const x = margin + this.random() * (w - 2 * margin), z = margin + this.random() * (w - 2 * margin);
        const y = this.data.heightAt(x, z);
        return { x, z, y, a: y - this.data.waterLevel, slope: this.data.slopeAt(x, z) };
    }

    nearBunny(x, z, distance) {
        return this.bunnies.some(b => (b.x - x) ** 2 + (b.z - z) ** 2 < distance * distance);
    }

    free(x, z, distance) {
        return !this.taken.some(t => (t.x - x) ** 2 + (t.z - z) ** 2 < (distance + t.r) ** 2);
    }

    /** count items where accept(p) is true; big = keeps the others away (radius r). */
    place(count, accept, { tries = 12, bunnyGap = 1.6, big = 0 } = {}) {
        const out = [];
        for (let t = 0; t < count * tries && out.length < count; t++) {
            const p = this.sample();
            if (!accept(p)) continue;
            if (bunnyGap > 0 && this.nearBunny(p.x, p.z, bunnyGap)) continue;
            if (big > 0) {
                if (!this.free(p.x, p.z, big)) continue;
                this.taken.push({ x: p.x, z: p.z, r: big });
            }
            out.push(p);
        }
        return out;
    }

    /** Groups of items around a few centres (flowers, carrot patches, reeds). */
    clusters(centres, perCluster, spread, accept, bunnyGap = 1.2) {
        const out = [];
        for (const c of centres) {
            for (let i = 0; i < perCluster; i++) {
                const a = this.random() * Math.PI * 2, r = Math.sqrt(this.random()) * spread;
                const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r;
                if (!this.data.inside(x, z)) continue;
                const y = this.data.heightAt(x, z);
                const p = { x, z, y, a: y - this.data.waterLevel, slope: this.data.slopeAt(x, z) };
                if (!accept(p) || this.nearBunny(x, z, bunnyGap)) continue;
                out.push(p);
            }
        }
        return out;
    }
}

const item = (p, random, s, extra = {}) => ({ x: p.x, y: p.y + (extra.dy ?? 0), z: p.z, rot: random() * Math.PI * 2, s, ...extra });

export class Vegetation {
    constructor(data, theme, bunnies, uniforms, seed) {
        this.data = data;
        this.theme = theme;
        this.group = new THREE.Group();
        this.group.name = 'vegetation';
        this.layers = [];
        this.materials = [];
        this.clearings = []; // where props stand flat on the ground no grass grows through them
        const random = seeded(seed);
        const scatter = new Scatter(data, bunnies ?? [], random);

        // the materials: solid (flat shaded), soft (smooth, swaying), glowing
        const solid = this.material(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true }));
        const smooth = this.material(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
        const grass = this.material(windify(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide }), uniforms, 0.55));
        const plants = this.material(windify(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide }), uniforms, 0.22));
        const leaves = this.material(windify(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }), uniforms, 0.016));
        // flat things on the ground (footprints, crater floors): drawn just above it
        const decal = this.material(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
        this.mats = { solid, smooth, grass, plants, leaves, decal };

        // how much land there is decides how much grows on it
        let land = 0;
        const s = data.size;
        for (let i = 0; i < data.heights.length; i++) if (data.heights[i] > data.waterLevel + 0.3) land++;
        const area = land * 0.25; // m²
        this.area = area;
        const n = k => Math.max(1, Math.round(area * k));

        const dry = p => p.a > 0.45 && p.slope < 0.75;
        const flat = p => p.a > 0.5 && p.slope < 0.45;
        const shore = p => p.a > -0.15 && p.a < 0.35 && p.slope < 0.5;
        const centres = (count, accept) => scatter.place(count, accept, { bunnyGap: 0 });

        switch (theme) {
            case 'Snow': this.snow(scatter, random, n, dry, flat, shore, centres); break;
            case 'Desert': this.desert(scatter, random, n, dry, flat, shore, centres); break;
            case 'Moon': this.moon(scatter, random, n, dry, flat, centres); break;
            default: this.meadow(scatter, random, n, dry, flat, shore, centres); break;
        }
    }

    material(m) {
        this.materials.push(m);
        return m;
    }

    add(geometry, material, items, options) {
        if (items.length === 0) {
            geometry.dispose();
            return null;
        }
        if (options?.clear) for (const it of items) this.clearings.push({ x: it.x, z: it.z, r: (it.r ?? 0.3) * it.s + 0.15 });
        const layer = new DecoLayer(geometry, material, items, options);
        this.layers.push(layer);
        this.group.add(layer.mesh);
        return layer;
    }

    /** Thousands of tufts, in two looks (lush and dry), tinted in patches. */
    grassLayers(scatter, random, n, accept, looks, density) {
        const count = Math.min(12000, n(density));
        const spots = scatter.place(count, p => accept(p) && !this.clearings.some(c => (c.x - p.x) ** 2 + (c.z - p.z) ** 2 < c.r * c.r), { tries: 6, bunnyGap: 0.45 });
        const half = Math.ceil(spots.length / looks.length);
        looks.forEach((look, k) => {
            const items = spots.slice(k * half, (k + 1) * half).map(p => {
                const patch = fbm2(p.x * 0.08, p.z * 0.08);
                const t = 0.82 + patch * 0.36;
                const tint = new THREE.Color(t, t * (0.96 + noise2(p.x, p.z) * 0.08), t * 0.92);
                return item(p, random, 0.45 + random() * 0.45, { tint, r: 0.1, dy: -0.02 });
            });
            this.add(M.grassTuft(look[0], look[1], look[2], 7, look[3] ?? 0.42, 11 + k), this.mats.grass, items, { shadow: false, name: 'grass' });
        });
    }

    /** Rock outcrops half sunk into the steep slopes (they break up the bare walls). */
    cliffRocks(scatter, random, n, geometry, density = 1 / 28) {
        const spots = scatter.place(n(density), p => p.a > 0.15 && p.slope > 0.8, { tries: 50, bunnyGap: 1.1, big: 0.45 });
        this.add(geometry, this.mats.solid, spots.map(p => {
            const s = 0.7 + random() * 0.8;
            return item(p, random, s, { r: 0.8, dy: -0.32 * s, tx: (random() - 0.5) * 0.4, tz: (random() - 0.5) * 0.4 });
        }), { name: 'cliffrock' });
    }

    /** A few trails of footprints over flat ground. */
    trails(random, count, color, length = 22) {
        const d = this.data;
        const prints = [];
        for (let t = 0; t < count * 30 && prints.length < count * length; t++) {
            let x = 2 + random() * (d.width - 4), z = 2 + random() * (d.width - 4);
            if (d.heightAt(x, z) < d.waterLevel + 0.5 || d.slopeAt(x, z) > 0.35) continue;
            let heading = random() * Math.PI * 2;
            for (let i = 0; i < length; i++) {
                heading += (random() - 0.5) * 0.35;
                x += Math.sin(heading) * 0.34;
                z += Math.cos(heading) * 0.34;
                if (!d.inside(x, z) || d.slopeAt(x, z) > 0.4) break;
                const y = d.heightAt(x, z);
                if (y < d.waterLevel + 0.3) break;
                const side = i % 2 ? 1 : -1;
                prints.push({ x: x + Math.cos(heading) * 0.09 * side, y: y + 0.02, z: z - Math.sin(heading) * 0.09 * side, rot: heading, s: 0.9 + random() * 0.2, r: 0.05 });
            }
        }
        this.add(M.footprint(color), this.mats.decal, prints, { shadow: false, name: 'prints' });
    }

    meadow(scatter, random, n, dry, flat, shore, centres) {
        const { solid, smooth, plants, leaves } = this.mats;
        // a windmill on a hill (first: it needs the most room), its sails turn in the wind
        const mill = scatter.place(1, p => p.a > 1.2 && p.slope < 0.35, { big: 1.9, bunnyGap: 4, tries: 400 })
            .map(p => item(p, random, 1, { r: 0.9, dy: -0.1 }));
        const tower = this.add(M.windmillTower(), solid, mill, { name: 'windmill', clear: true });
        if (tower) {
            const it = mill[0];
            this.sails = new THREE.Mesh(M.windmillSails(), solid);
            this.sails.castShadow = true;
            this.sails.position.copy(M.WINDMILL_HUB).applyAxisAngle(new THREE.Vector3(0, 1, 0), it.rot).multiplyScalar(it.s).add(new THREE.Vector3(it.x, it.y, it.z));
            this.sails.rotation.set(0, it.rot, 0, 'YXZ');
            this.sails.scale.setScalar(it.s);
            this.sailsOf = it;
            this.group.add(this.sails);
        }
        // trees (they keep the most room)
        const treeSpots = scatter.place(n(1 / 20), p => dry(p) && p.slope < 0.55, { big: 2.2, bunnyGap: 2.4 });
        const oaks = [M.oak(1), M.oak(2, undefined, '#d6303a')], birch = M.birch(3);
        const oakItems = [[], []], birchItems = [];
        treeSpots.forEach(p => {
            const it = item(p, random, 0.8 + random() * 0.45, { r: 1.2, dy: -0.05 });
            if (random() < 0.3) birchItems.push(it); else oakItems[random() < 0.5 ? 0 : 1].push(it);
        });
        oakItems.forEach((items, k) => this.add(oaks[k], leaves, items, { name: 'oak' }));
        this.add(birch, leaves, birchItems, { name: 'birch' });
        // leaves on the ground under the trees that stand on the flat, ferns at their feet
        this.add(M.fallenLeaves(9), plants, treeSpots.filter(p => p.slope < 0.3).map(p => item(p, random, 0.8 + random() * 0.4, { r: 0.1, dy: 0.0 })), { shadow: false, name: 'leaves' });
        const fernSpots = [];
        for (const t of treeSpots) {
            for (let i = 0; i < 2; i++) {
                const a = random() * Math.PI * 2, d = 0.9 + random() * 0.6;
                const x = t.x + Math.cos(a) * d, z = t.z + Math.sin(a) * d;
                if (!this.data.inside(x, z) || scatter.nearBunny(x, z, 1.0)) continue;
                const y = this.data.heightAt(x, z);
                if (y > this.data.waterLevel + 0.4 && this.data.slopeAt(x, z) < 0.7) fernSpots.push({ x, y, z });
            }
        }
        this.add(M.fern(12), plants, fernSpots.map(p => item(p, random, 0.7 + random() * 0.5, { r: 0.1, dy: -0.02 })), { shadow: false, name: 'ferns' });

        const bushes = scatter.place(n(1 / 16), dry, { big: 0.8 });
        this.add(M.bush(4), smooth, bushes.filter((_, i) => i % 2 === 0).map(p => item(p, random, 0.8 + random() * 0.6, { r: 0.6, dy: -0.05 })), { name: 'bush' });
        this.add(M.bush(5, ['#4f9a33', '#5fae3c', '#6dbb45'], null), smooth, bushes.filter((_, i) => i % 2 === 1).map(p => item(p, random, 0.8 + random() * 0.6, { r: 0.6, dy: -0.05 })), { name: 'bush2' });

        const rocks = scatter.place(n(1 / 45), p => p.a > -0.3, { big: 0.6 });
        this.add(M.rock(6, ['#8a8276', '#6f685e'], true), solid, rocks.map(p => item(p, random, 0.6 + random() * 1.2, { r: 0.5, dy: -0.12, tx: (random() - 0.5) * 0.3 })), { name: 'rock' });
        this.cliffRocks(scatter, random, n, M.cliffRock(13, ['#9a9286', '#625a50'], { moss: '#5f9a3a' }));
        this.add(M.pebbles(14), solid, scatter.place(n(1 / 22), p => p.a > -0.2 && p.slope < 0.8, { tries: 3, bunnyGap: 0.5 }).map(p => item(p, random, 0.8 + random() * 0.6, { r: 0.2, dy: -0.01 })), { shadow: false, name: 'pebbles' });

        // stumps, fallen logs, a stone wall, bunny burrows, signposts
        this.add(M.stump(15), solid, scatter.place(Math.max(2, Math.round(this.area / 260)), p => dry(p) && p.slope < 0.45, { big: 0.6, bunnyGap: 1.6, tries: 80 }).map(p => item(p, random, 0.8 + random() * 0.5, { r: 0.35, dy: -0.04 })), { name: 'stump', clear: true });
        this.add(M.log(16), solid, scatter.place(Math.max(2, Math.round(this.area / 380)), p => dry(p) && p.slope < 0.38, { big: 1.1, bunnyGap: 2, tries: 120 }).map(p => item(p, random, 0.9 + random() * 0.3, { r: 0.9, dy: -0.06 })), { name: 'log', clear: true });
        this.add(M.stoneWall(17), solid, scatter.place(Math.max(2, Math.round(this.area / 330)), p => dry(p) && p.slope < 0.38, { big: 1.3, bunnyGap: 2.2, tries: 120 }).map(p => item(p, random, 1, { r: 1.0, dy: -0.16 })), { name: 'wall', clear: true });
        this.add(M.burrow(), solid, scatter.place(Math.max(2, Math.round(this.area / 300)), p => dry(p) && p.slope < 0.42, { big: 0.7, bunnyGap: 1.8, tries: 100 }).map(p => item(p, random, 0.9 + random() * 0.3, { r: 0.45, dy: -0.03 })), { name: 'burrow', clear: true });
        this.add(M.signpost(), solid, scatter.place(2, p => dry(p) && p.slope < 0.5, { big: 0.6, bunnyGap: 2.2, tries: 60 }).map(p => item(p, random, 1, { r: 0.4, dy: -0.05 })), { name: 'sign', clear: true });
        const puffs = scatter.clusters(centres(Math.max(3, Math.round(this.area / 200)), dry), 6, 1.4, dry);
        this.add(M.dandelions(18), plants, puffs.map(p => item(p, random, 0.8 + random() * 0.5, { r: 0.05 })), { shadow: false, name: 'dandelions' });

        // carrot patches: rows of carrots in a few fields
        const fields = centres(Math.max(2, Math.round(this.area / 260)), flat);
        const carrots = [];
        for (const f of fields) {
            const angle = random() * Math.PI;
            for (let row = -2; row <= 2; row++) {
                for (let col = -3; col <= 3; col++) {
                    if (random() < 0.15) continue;
                    const lx = col * 0.45 + (random() - 0.5) * 0.12, lz = row * 0.55 + (random() - 0.5) * 0.12;
                    const x = f.x + Math.cos(angle) * lx - Math.sin(angle) * lz, z = f.z + Math.sin(angle) * lx + Math.cos(angle) * lz;
                    if (!this.data.inside(x, z) || scatter.nearBunny(x, z, 0.9)) continue;
                    const y = this.data.heightAt(x, z);
                    if (y < this.data.waterLevel + 0.4 || this.data.slopeAt(x, z) > 0.6) continue;
                    carrots.push({ x, y: y - 0.02, z, rot: random() * Math.PI * 2, s: 0.85 + random() * 0.4, r: 0.15, dy: -0.02 });
                }
            }
        }
        this.add(M.carrot(7), plants, carrots, { name: 'carrots' });

        // a fence along one carrot field, and haystacks
        const fenceItems = fields.slice(0, 2).map(f => {
            const x = f.x + 2.0, z = f.z;
            return { x, y: this.data.heightAt(x, z) - 0.03, z, rot: Math.PI / 2 + random() * 0.4, s: 1, r: 1, dy: -0.03 };
        }).filter(it => it.y > this.data.waterLevel + 0.4);
        this.add(M.fence(), solid, fenceItems, { name: 'fence' });
        const hay = scatter.place(Math.max(1, Math.round(this.area / 500)), flat, { big: 1.2, bunnyGap: 2 });
        this.add(M.haystack(), solid, hay.map(p => item(p, random, 0.9 + random() * 0.4, { r: 0.7, dy: -0.05 })), { name: 'hay' });

        // flowers in meadows of their own colour
        const flowerColours = [['#f25a7a', '#ffd23a'], ['#ffe14a', '#e07a1c'], ['#ffffff', '#ffd23a'], ['#9b7cf0', '#fff3b0'], ['#ff8f3a', '#7a3a10']];
        flowerColours.forEach(([petal, centre], k) => {
            const spots = scatter.clusters(centres(Math.max(2, Math.round(this.area / 180)), dry), 14, 1.6, dry);
            this.add(M.flower(petal, centre, k === 2 ? 8 : 6), plants, spots.map(p => item(p, random, 0.7 + random() * 0.6, { r: 0.05 })), { shadow: false, name: 'flowers' });
        });
        this.add(M.clover(), plants, scatter.place(n(1 / 6), dry, { tries: 3, bunnyGap: 0.6 }).map(p => item(p, random, 0.9 + random() * 0.5, { r: 0.1, dy: -0.01 })), { shadow: false, name: 'clover' });
        const caps = ['#d63a2e', '#b8743a'];
        caps.forEach((cap, k) => {
            const spots = scatter.clusters(centres(3, p => dry(p) && p.slope < 0.5), 5, 0.7, dry);
            this.add(M.mushroom(cap), smooth, spots.map(p => item(p, random, 0.7 + random() * 0.8, { r: 0.08, dy: -0.01 })), { name: 'mushrooms' + k });
        });

        // the shore: reeds, lily pads on the water
        const reedSpots = scatter.clusters(centres(Math.max(3, Math.round(this.area / 160)), shore), 6, 1.4, shore);
        this.add(M.reeds(8), plants, reedSpots.map(p => item(p, random, 0.8 + random() * 0.5, { r: 0.2, wet: true, dy: -0.05 })), { shadow: false, name: 'reeds' });
        this.lilies(scatter, random);

        this.grassLayers(scatter, random, n, p => p.a > 0.35 && p.slope < 0.78, [
            ['#2f6b1f', '#5fae36', '#c8e86a', 0.42],
            ['#3a6f22', '#79b843', '#d9ec7a', 0.5],
            ['#4a6f20', '#9ab84a', '#e6e08a', 0.36],
        ], 16);
    }

    lilies(scatter, random) {
        const d = this.data;
        const spots = [];
        for (let t = 0; t < 1400 && spots.length < 40; t++) {
            const x = random() * d.width, z = random() * d.width;
            const depth = d.waterLevel - d.heightAt(x, z);
            if (depth < 0.3 || depth > 1.4) continue;
            spots.push({ x, y: d.waterLevel + 0.03, z, rot: random() * Math.PI * 2, s: 0.7 + random() * 0.6, r: 0.25 });
        }
        this.add(M.lilyPad(false), this.mats.smooth, spots.filter((_, i) => i % 4 !== 0), { shadow: false, water: true, name: 'lilies' });
        this.add(M.lilyPad(true), this.mats.smooth, spots.filter((_, i) => i % 4 === 0), { shadow: false, water: true, name: 'lilies2' });
    }

    snow(scatter, random, n, dry, flat, shore, centres) {
        const { solid, smooth, leaves } = this.mats;
        const trees = scatter.place(n(1 / 15), p => dry(p) && p.slope < 0.7, { big: 1.5, bunnyGap: 2.4 });
        const pines = [M.pine(21, true), M.pine(22, true)];
        pines.forEach((g, k) => this.add(g, leaves, trees.filter((_, i) => i % 2 === k).map(p => item(p, random, 0.75 + random() * 0.65, { r: 1.0, dy: -0.05 })), { name: 'pine' }));
        const rocks = scatter.place(n(1 / 40), p => p.a > -0.3, { big: 0.6 });
        this.add(M.rock(23, ['#6f7b88', '#4f5966'], false, true), solid, rocks.map(p => item(p, random, 0.6 + random() * 1.3, { r: 0.5, dy: -0.12, tx: (random() - 0.5) * 0.3 })), { name: 'rock' });
        const crystals = scatter.clusters(centres(Math.max(3, Math.round(this.area / 220)), dry), 3, 1.2, dry);
        const ice = this.material(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.15, metalness: 0.1, flatShading: true, transparent: true, opacity: 0.85, emissive: 0x3a7a9a, emissiveIntensity: 0.35 }));
        this.add(M.iceCrystals(24), ice, crystals.map(p => item(p, random, 0.7 + random() * 0.8, { r: 0.25, dy: -0.05 })), { name: 'ice' });
        const men = scatter.place(Math.max(1, Math.round(this.area / 600)), flat, { big: 1.0, bunnyGap: 2.5 });
        this.add(M.snowman(), smooth, men.map(p => item(p, random, 0.85 + random() * 0.3, { r: 0.5, dy: -0.08 })), { name: 'snowman' });
        // icicles where it is steep (hanging over the cliffs)
        const steep = scatter.place(n(1 / 70), p => p.a > 0.8 && p.slope > 1.1, { tries: 30, bunnyGap: 0 });
        this.add(M.icicles(25), ice, steep.map(p => {
            const e = 0.6;
            const gx = this.data.heightAt(p.x + e, p.z) - this.data.heightAt(p.x - e, p.z);
            const gz = this.data.heightAt(p.x, p.z + e) - this.data.heightAt(p.x, p.z - e);
            return { x: p.x, y: p.y + 0.1, z: p.z, rot: Math.atan2(gx, gz), s: 0.8 + random() * 0.5, r: 0.3 };
        }), { name: 'icicles' });
        // ice floes drift on the sea around the island
        const floes = [];
        for (let t = 0; t < 3000 && floes.length < 26; t++) {
            const x = random() * this.data.width, z = random() * this.data.width;
            const depth = this.data.waterLevel - this.data.heightAt(x, z);
            if (depth < 0.8) continue;
            floes.push({ x, y: this.data.waterLevel - 0.05, z, rot: random() * Math.PI * 2, s: 0.5 + random() * 1.3, sy: 1, r: 1, tx: (random() - 0.5) * 0.06 });
        }
        this.add(M.iceFloe(27), solid, floes, { shadow: false, water: true, name: 'floes' });
        // penguins stand on some of the floes (the top of a floe is 0.11 m above its middle)
        this.add(M.penguin(), smooth, floes.filter((f, i) => i % 4 === 0 && f.s > 0.8).map(f => ({ x: f.x, y: f.y + 0.1 * f.s, z: f.z, rot: random() * Math.PI * 2, s: 0.9 + random() * 0.3, r: 0.2 })), { water: true, name: 'penguins' });
        this.add(M.bush(26, ['#e8f0f6', '#d5e2ec', '#f4f8fb'], null, '#ffffff'), smooth, scatter.place(n(1 / 40), dry, { big: 0.5 }).map(p => item(p, random, 0.6 + random() * 0.5, { r: 0.5, dy: -0.1 })), { name: 'snowbush' });
        this.cliffRocks(scatter, random, n, M.cliffRock(28, ['#7f8b98', '#4a535e'], { snow: true }), 1 / 45);
        this.add(M.snowDrift(29), smooth, scatter.place(n(1 / 45), p => flat(p) && p.slope < 0.35, { big: 0.6, bunnyGap: 1.4, tries: 60 }).map(p => item(p, random, 0.8 + random() * 0.8, { r: 0.6, dy: -0.06, sx: 1.4 })), { shadow: false, name: 'drifts', clear: true });
        this.add(M.twigs(30), this.mats.plants, scatter.place(n(1 / 35), dry, { tries: 4, bunnyGap: 0.8 }).map(p => item(p, random, 0.7 + random() * 0.6, { r: 0.1, dy: -0.03 })), { shadow: false, name: 'twigs' });
        this.add(M.pebbles(38, ['#7f8b98', '#5f6a76', '#9aa6b2']), solid, scatter.place(n(1 / 40), p => p.a > -0.2 && p.slope < 0.8, { tries: 3, bunnyGap: 0.5 }).map(p => item(p, random, 0.8 + random() * 0.6, { r: 0.2, dy: -0.02 })), { shadow: false, name: 'pebbles' });
        this.add(M.igloo(), smooth, scatter.place(1, p => p.a > 0.5 && p.slope < 0.6, { big: 1.0, bunnyGap: 2.6, tries: 900 }).map(p => item(p, random, 0.85, { r: 1.2, dy: -0.25 })), { name: 'igloo', clear: true });
        this.trails(random, 4, '#b4c8da');
        this.grassLayers(scatter, random, n, p => p.a > 0.3 && p.slope < 0.5, [
            ['#8d8a6a', '#b9b48a', '#e8e6d0', 0.32],
            ['#7f93a3', '#a9bccb', '#e6f0f7', 0.28],
        ], 4);
    }

    desert(scatter, random, n, dry, flat, shore, centres) {
        const { solid, smooth, plants, leaves } = this.mats;
        const cactusSpots = scatter.place(n(1 / 20), p => dry(p) && p.slope < 0.6, { big: 1.0, bunnyGap: 2.2 });
        const saguaros = [M.saguaro(31), M.saguaro(32)];
        const sag = [[], []], barrels = [], pears = [];
        cactusSpots.forEach(p => {
            const r = random();
            const it = item(p, random, 0.75 + random() * 0.6, { r: 0.4, dy: -0.05 });
            if (r < 0.45) sag[r < 0.22 ? 0 : 1].push(it); else if (r < 0.75) barrels.push(it); else pears.push(it);
        });
        saguaros.forEach((g, k) => this.add(g, smooth, sag[k], { name: 'saguaro' }));
        this.add(M.barrelCactus(), smooth, barrels, { name: 'barrel' });
        this.add(M.pricklyPear(33), smooth, pears, { name: 'pear' });
        // palms where there is water close by
        const palms = scatter.place(Math.max(4, Math.round(this.area / 90)), p => p.a > 0.2 && p.a < 1.6 && p.slope < 0.5, { big: 1.4, bunnyGap: 2.2, tries: 40 });
        this.add(M.palm(34), leaves, palms.map(p => item(p, random, 0.8 + random() * 0.5, { r: 0.6, dy: -0.05 })), { name: 'palm' });
        const stones = scatter.place(n(1 / 50), p => p.a > -0.2, { big: 1.0 });
        this.add(M.sandstone(35), solid, stones.filter((_, i) => i % 2 === 0).map(p => item(p, random, 0.6 + random() * 1.1, { r: 0.7, dy: -0.15 })), { name: 'sandstone' });
        this.add(M.rock(36, ['#b8693d', '#8a4a2a']), solid, stones.filter((_, i) => i % 2 === 1).map(p => item(p, random, 0.5 + random() * 1.1, { r: 0.5, dy: -0.12 })), { name: 'rock' });
        const archSpot = scatter.place(1, p => p.a > 0.8 && p.slope < 0.25, { big: 2.5, bunnyGap: 3.5, tries: 200 });
        this.add(M.arch(), solid, archSpot.map(p => item(p, random, 1.0, { r: 2.0, dy: -0.2 })), { name: 'arch' });
        this.add(M.dryBush(37), plants, scatter.place(n(1 / 10), dry, { bunnyGap: 0.8 }).map(p => item(p, random, 0.45 + random() * 0.45, { r: 0.3 })), { shadow: false, name: 'drybush' });
        this.add(M.bones(), smooth, scatter.place(Math.max(1, Math.round(this.area / 350)), flat, { big: 0.5 }).map(p => item(p, random, 0.9 + random() * 0.4, { r: 0.3 })), { name: 'bones' });
        this.cliffRocks(scatter, random, n, M.cliffRock(39, ['#c27a45', '#8a4a2a']));
        this.add(M.pebbles(40, ['#c28a55', '#a86a3c', '#d9a96e']), solid, scatter.place(n(1 / 30), p => p.a > -0.2 && p.slope < 0.8, { tries: 3, bunnyGap: 0.5 }).map(p => item(p, random, 0.8 + random() * 0.7, { r: 0.2, dy: -0.02 })), { shadow: false, name: 'pebbles' });
        this.add(M.cattleSkull(), smooth, scatter.place(Math.max(2, Math.round(this.area / 300)), flat, { big: 0.5, bunnyGap: 1.6, tries: 80 }).map(p => item(p, random, 0.9 + random() * 0.4, { r: 0.3, dy: -0.03, tx: (random() - 0.5) * 0.3 })), { name: 'skulls', clear: true });
        this.add(M.pots(41), smooth, scatter.place(Math.max(1, Math.round(this.area / 450)), flat, { big: 0.7, bunnyGap: 2, tries: 100 }).map(p => item(p, random, 0.9 + random() * 0.3, { r: 0.4, dy: -0.02 })), { name: 'pots', clear: true });
        this.add(M.deadTree(42), solid, scatter.place(Math.max(2, Math.round(this.area / 320)), p => dry(p) && p.slope < 0.5, { big: 1.4, bunnyGap: 2.4, tries: 120 }).map(p => item(p, random, 0.8 + random() * 0.5, { r: 0.6, dy: -0.05 })), { name: 'deadtree', clear: true });
        this.trails(random, 2, '#c99c62', 18);
        this.grassLayers(scatter, random, n, p => p.a > 0.25 && p.a < 2.5 && p.slope < 0.5, [
            ['#8a7a3e', '#b9a35a', '#e8d58a', 0.36],
        ], 2.5);
    }

    moon(scatter, random, n, dry, flat, centres) {
        const { solid } = this.mats;
        const boulders = scatter.place(n(1 / 30), p => p.slope < 1.0, { big: 0.7 });
        this.add(M.rock(41, ['#6c6d76', '#4a4b53']), solid, boulders.map(p => item(p, random, 0.5 + random() * 1.5, { r: 0.5, dy: -0.15, tx: (random() - 0.5) * 0.4 })), { name: 'boulder' });
        this.add(M.rock(42, ['#8a8b93', '#5e5f68']), solid, scatter.place(n(1 / 6), p => p.slope < 1.0, { tries: 3, bunnyGap: 0.6 }).map(p => item(p, random, 0.12 + random() * 0.22, { r: 0.1, dy: -0.03 })), { shadow: false, name: 'pebbles' });
        const glow = this.material(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.2, flatShading: true, emissive: 0x6a5cff, emissiveIntensity: 0.55, transparent: true, opacity: 0.92 }));
        const crystals = scatter.clusters(centres(Math.max(4, Math.round(this.area / 160)), dry), 3, 1.4, dry);
        this.add(M.moonCrystals(43), glow, crystals.map(p => item(p, random, 0.6 + random() * 0.9, { r: 0.3, dy: -0.05 })), { name: 'crystals' });
        this.crystalSpots = crystals;
        const big = p => p.a > 0.6 && p.slope < 0.3;
        this.add(M.lander(), solid, scatter.place(1, big, { big: 2.2, bunnyGap: 3.5, tries: 200 }).map(p => item(p, random, 1, { r: 1.2, dy: -0.02 })), { name: 'lander' });
        this.add(M.antenna(), solid, scatter.place(2, big, { big: 1.0, bunnyGap: 2.5, tries: 200 }).map(p => item(p, random, 0.9 + random() * 0.3, { r: 0.6 })), { name: 'antenna' });
        this.add(M.flag(), this.mats.smooth, scatter.place(1, big, { big: 0.8, bunnyGap: 2.5, tries: 200 }).map(p => item(p, random, 1, { r: 0.3, dy: -0.05 })), { name: 'flag' });
        this.add(M.rover(), solid, scatter.place(1, big, { big: 1.2, bunnyGap: 3, tries: 400 }).map(p => item(p, random, 1, { r: 0.8, dy: -0.02 })), { name: 'rover', clear: true });
        this.cliffRocks(scatter, random, n, M.cliffRock(44, ['#7c7d86', '#4a4b53']));
        this.add(M.craterRim(45), solid, scatter.place(n(1 / 90), p => p.a > 0.3 && p.slope < 0.2, { big: 1.0, bunnyGap: 1.8, tries: 60 }).map(p => item(p, random, 0.6 + random() * 0.8, { r: 0.9, dy: -0.05, sy: 0.8 + random() * 0.5 })), { shadow: false, name: 'craters' });
        this.trails(random, 3, '#5a5a63', 26);
    }

    crater(x, z, radius) {
        for (const layer of this.layers) layer.crater(x, z, radius, this.data);
        if (this.sails) {
            const it = this.sailsOf;
            if (it.gone) this.sails.visible = false;
            else this.sails.position.y = it.y + M.WINDMILL_HUB.y * it.s; // the tower may have sunk onto a crater rim
        }
    }

    /** What moves: the sails of the windmill (faster with more wind). */
    update(dt, wind) {
        if (this.sails?.visible) this.sails.rotation.z -= dt * (0.5 + Math.min(2.5, wind.length() * 0.5));
    }

    dispose() {
        this.sails?.geometry.dispose();
        for (const layer of this.layers) layer.dispose();
        for (const m of this.materials) m.dispose();
    }
}
