// One island with everything on it: ground (island and skirt), sea, plants and props, ambient life, bunnies, the marker of the turn,
// particles and effects. Also the background of the menu (a showcase island with idle bunnies, no turn needed).
import * as THREE from 'three';
import { TerrainData, TerrainMesh, SkirtMesh, createGroundMaterial, decodeHeights } from './terrain.js';
import { Bunny, TurnMarker } from './bunny.js';
import { Particles, Effects } from './effects.js';
import { Water } from './world/water.js';
import { Vegetation } from './world/vegetation.js';
import { Life } from './world/life.js';
import { createWindUniforms } from './world/util.js';

/** The same seed in every browser: from the island itself (size, theme, a few heights), not from time or chance. */
function seedOf(data, theme) {
    let h = 2166136261 ^ data.size ^ (theme.length * 7919);
    const step = Math.max(1, Math.floor(data.heights.length / 64));
    for (let i = 0; i < data.heights.length; i += step) {
        h ^= Math.round(data.heights[i] * 100);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

export class World {
    constructor(stage, game) {
        const w = game.world;
        this.stage = stage;
        this.theme = w.theme;
        this.data = new TerrainData(w.size, decodeHeights(w.heights), w.waterLevel);
        this.group = stage.setup(w.theme, this.data.width, w.waterLevel);
        this.uniforms = createWindUniforms();
        this.windGoal = new THREE.Vector2(0.6, 0.3);
        const seed = seedOf(this.data, w.theme);

        this.groundMaterial = createGroundMaterial(w.theme, w.waterLevel, this.data.top);
        this.terrain = new TerrainMesh(this.data, w.theme, this.groundMaterial);
        this.group.add(this.terrain.mesh);
        this.skirt = new SkirtMesh(this.data, w.theme, this.groundMaterial, seed ^ 0x51ed);
        this.group.add(this.skirt.mesh);

        this.water = new Water(this.data, w.theme, this.uniforms, stage.sunDirection, this.skirt.reach);
        this.group.add(this.water.group);
        stage.water = this.water.mesh;

        this.vegetation = new Vegetation(this.data, w.theme, game.bunnies ?? [], this.uniforms, seed);
        this.group.add(this.vegetation.group);
        this.life = new Life(this.data, w.theme, this.uniforms, seed ^ 0x2a2a, stage.scene);
        this.group.add(this.life.group);
        // smoke from the chimneys and the volcano, spray at the waterfall
        this.life.smoke(this.vegetation.chimneys);
        this.life.mist(this.vegetation.fallsBase);

        this.particles = new Particles();
        this.group.add(this.particles.points);
        this.effects = new Effects(this.group, this.particles, w.theme);
        this.marker = new TurnMarker();
        this.group.add(this.marker.mesh);
        this.teams = new Map();
        this.bunnies = new Map();
        this.setTeams(game.teams ?? []);
        this.setBunnies(game.bunnies ?? []);
        this.time = 0;
    }

    get width() {
        return this.data.width;
    }

    heightAt(x, z) {
        return this.data.heightAt(x, z);
    }

    /** The wind of the turn (the same vector as the server's, m/s²): grass, trees, clouds, dust and waves follow it. */
    setWind(x, z) {
        this.windGoal.set(x || 0, z || 0);
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
        const region = this.terrain.crater(x, y, z, radius);
        this.water.crater(region);
        // plants and props in the blast are gone, those at the rim sink onto the new ground
        this.vegetation.crater(x, z, radius);
        // graves and the dead follow the ground
        for (const b of this.bunnies.values()) {
            if (!b.alive && b.grave?.visible) b.snap(b.position.x, this.heightAt(b.position.x, b.position.z), b.position.z);
        }
    }

    update(dt, time) {
        this.time = time;
        this.uniforms.uTime.value = time;
        this.uniforms.uWind.value.lerp(this.windGoal, 1 - Math.exp(-dt * 0.8));
        for (const b of this.bunnies.values()) b.update(dt, time);
        this.vegetation.update(dt, this.uniforms.uWind.value, this.bunnies.values());
        this.marker.update(dt);
        this.particles.update(dt);
        this.effects.update(dt);
        this.life.update(dt, time, this.stage.camera);
        this.stage.sky?.update(dt, time, this.uniforms.uWind.value);
    }

    dispose() {
        for (const b of this.bunnies.values()) b.dispose();
        this.effects.clear();
        this.terrain.dispose();
        this.skirt.dispose();
        this.water.dispose();
        this.vegetation.dispose();
        this.life.dispose();
        this.groundMaterial.dispose();
        this.stage.sky?.dispose();
    }
}
