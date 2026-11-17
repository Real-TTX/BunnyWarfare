// One island with everything on it: terrain, decoration, bunnies, the marker of the turn, particles and effects.
import * as THREE from 'three';
import { TerrainData, TerrainMesh, decodeHeights } from './terrain.js';
import { Bunny, TurnMarker } from './bunny.js';
import { Particles, Effects } from './effects.js';

export class World {
    constructor(stage, game) {
        const w = game.world;
        this.stage = stage;
        this.theme = w.theme;
        this.data = new TerrainData(w.size, decodeHeights(w.heights), w.waterLevel);
        this.group = stage.setup(w.theme, this.data.width, w.waterLevel);
        this.terrain = new TerrainMesh(this.data, w.theme);
        this.group.add(this.terrain.mesh);
        this.particles = new Particles();
        this.group.add(this.particles.points);
        this.effects = new Effects(this.group, this.particles, w.theme);
        this.marker = new TurnMarker();
        this.group.add(this.marker.mesh);
        this.teams = new Map();
        this.bunnies = new Map();
        this.setTeams(game.teams);
        this.setBunnies(game.bunnies);
        this.decorations = decorate(this.group, this.data, w.theme, w.size, game.bunnies);
    }

    get width() {
        return this.data.width;
    }

    heightAt(x, z) {
        return this.data.heightAt(x, z);
    }

    setTeams(teams) {
        for (const t of teams) this.teams.set(t.index, t);
    }

    /** Brings every bunny to the state of the server (positions, health, alive). */
    setBunnies(list) {
        for (const dto of list) {
            let b = this.bunnies.get(dto.id);
            if (!b) {
                b = new Bunny(dto, this.teams.get(dto.team));
                this.bunnies.set(dto.id, b);
                this.group.add(b.root);
                continue;
            }
            b.snap(dto.x, dto.y, dto.z, dto.yaw);
            b.setHealth(dto.health);
            if (dto.health <= 0 && b.alive) b.die(false);
        }
    }

    crater(x, y, z, radius) {
        this.terrain.crater(x, y, z, radius);
        // decoration in the blast is gone
        for (const d of this.decorations) {
            if (d.visible && Math.hypot(d.position.x - x, d.position.z - z) < radius + 0.3) d.visible = false;
        }
        // graves and the dead follow the ground
        for (const b of this.bunnies.values()) {
            if (!b.alive && b.grave?.visible) b.snap(b.position.x, this.heightAt(b.position.x, b.position.z), b.position.z);
        }
    }

    update(dt, time) {
        for (const b of this.bunnies.values()) b.update(dt, time);
        this.marker.update(dt);
        this.particles.update(dt);
        this.effects.update(dt);
        if (this.stage.water) this.stage.water.position.y = this.data.waterLevel + Math.sin(time * 0.8) * 0.03;
    }

    dispose() {
        for (const b of this.bunnies.values()) b.dispose();
        this.effects.clear();
        this.terrain.dispose();
    }
}

// ---------------------------------------------------------------- decoration (purely for the look; the server knows nothing of it)

const deco = {
    trunk: new THREE.CylinderGeometry(0.08, 0.12, 0.7, 6),
    pine: new THREE.ConeGeometry(0.55, 1.4, 7),
    bush: new THREE.IcosahedronGeometry(0.45, 0),
    rock: new THREE.DodecahedronGeometry(0.35, 0),
    cactus: new THREE.CapsuleGeometry(0.14, 0.9, 3, 8),
    arm: new THREE.CapsuleGeometry(0.09, 0.35, 3, 6),
};

const decoMaterials = {
    trunk: new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 1 }),
    pine: new THREE.MeshStandardMaterial({ color: 0x2f6b2a, roughness: 0.9, flatShading: true }),
    snowPine: new THREE.MeshStandardMaterial({ color: 0x4f7d5c, roughness: 0.9, flatShading: true }),
    bush: new THREE.MeshStandardMaterial({ color: 0x4f9a35, roughness: 0.9, flatShading: true }),
    rock: new THREE.MeshStandardMaterial({ color: 0x8a8378, roughness: 1, flatShading: true }),
    moonRock: new THREE.MeshStandardMaterial({ color: 0x6f7078, roughness: 1, flatShading: true }),
    sandRock: new THREE.MeshStandardMaterial({ color: 0xa0643a, roughness: 1, flatShading: true }),
    cactus: new THREE.MeshStandardMaterial({ color: 0x4f8a3a, roughness: 0.8 }),
    snowCap: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, flatShading: true }),
};

function mulberry32(seed) {
    return () => {
        seed |= 0;
        seed = (seed + 0x6d2b79f5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function mesh(geometry, material, x, y, z, scale = 1) {
    const m = new THREE.Mesh(geometry, material);
    m.position.set(x, y, z);
    m.scale.setScalar(scale);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
}

function makeDecoration(theme, random) {
    const g = new THREE.Group();
    const kind = random();
    const s = 0.7 + random() * 0.6;
    if (theme === 'Moon' || (theme !== 'Desert' && kind < 0.25)) {
        const rock = mesh(deco.rock, theme === 'Moon' ? decoMaterials.moonRock : decoMaterials.rock, 0, 0.15, 0, s);
        rock.rotation.set(random() * 3, random() * 3, random() * 3);
        g.add(rock);
    } else if (theme === 'Desert') {
        if (kind < 0.5) {
            g.add(mesh(deco.cactus, decoMaterials.cactus, 0, 0.55, 0, s));
            const arm = mesh(deco.arm, decoMaterials.cactus, 0.2 * s, 0.75 * s, 0, s);
            arm.rotation.z = -0.4;
            g.add(arm);
        } else {
            const rock = mesh(deco.rock, decoMaterials.sandRock, 0, 0.12, 0, s * 1.2);
            rock.rotation.set(random() * 3, random() * 3, 0);
            g.add(rock);
        }
    } else if (kind < 0.7) {
        g.add(mesh(deco.trunk, decoMaterials.trunk, 0, 0.35, 0, s));
        g.add(mesh(deco.pine, theme === 'Snow' ? decoMaterials.snowPine : decoMaterials.pine, 0, 1.2 * s, 0, s));
        if (theme === 'Snow') g.add(mesh(deco.pine, decoMaterials.snowCap, 0, 1.55 * s, 0, s * 0.5));
    } else {
        g.add(mesh(deco.bush, theme === 'Snow' ? decoMaterials.snowCap : decoMaterials.bush, 0, 0.25, 0, s));
    }
    g.rotation.y = random() * Math.PI * 2;
    return g;
}

function decorate(group, data, theme, size, bunnies) {
    const random = mulberry32(size * 7919 + theme.length * 104729);
    const count = Math.round((data.width * data.width) / 45);
    const items = [];
    for (let attempt = 0; attempt < count * 6 && items.length < count; attempt++) {
        const x = 1 + random() * (data.width - 2), z = 1 + random() * (data.width - 2);
        const y = data.heightAt(x, z);
        if (y < data.waterLevel + 0.4 || data.slopeAt(x, z) > 0.8) continue;
        if (bunnies.some(b => Math.hypot(b.x - x, b.z - z) < 2.5)) continue;
        if (items.some(d => Math.hypot(d.position.x - x, d.position.z - z) < 2)) continue;
        const d = makeDecoration(theme, random);
        d.position.set(x, y - 0.05, z);
        group.add(d);
        items.push(d);
    }
    return items;
}
