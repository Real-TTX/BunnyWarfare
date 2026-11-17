// Level screenshots for the menus: every island is built once in a small hidden stage (the real world modules: ground, sea, sky, plants,
// houses, a few bunnies from /api/showcase), photographed from a 3/4 angle and kept as a JPEG data URL – in memory and in localStorage
// (keyed by the world and a hash of its height map, so an island changed in the administration gets a new picture).
// One shot after the other, so the menu stays responsive; until a shot is ready, the flat map (maps.js) stands in.
//
//   worldShot(worldId) → Promise<string>        the data URL of the screenshot
//   shotElement(worldId, className?) → element  a box with the flat map that turns into the screenshot when it is ready
import * as THREE from 'three';
import { Stage } from './scene.js';
import { World } from './world.js';
import { activeParticles, setActiveParticles } from './effects.js';
import { api, worldTerrain } from './api.js';
import { mapCanvas } from './maps.js';

const VERSION = 'v2';
const WIDTH = 640, HEIGHT = 400;
const memory = new Map();   // key → Promise<string>
let stage = null;
let queue = Promise.resolve();

function hashOf(text) {
    let h = 2166136261;
    const step = Math.max(1, Math.floor(text.length / 4096));
    for (let i = 0; i < text.length; i += step) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
    return ((h ^ text.length) >>> 0).toString(36);
}

function hiddenStage() {
    if (stage) return stage;
    const box = document.createElement('div');
    box.setAttribute('aria-hidden', 'true');
    box.style.cssText = `position:fixed;left:-${WIDTH * 2}px;top:0;width:${WIDTH}px;height:${HEIGHT}px;pointer-events:none;overflow:hidden`;
    document.body.append(box);
    stage = new Stage(box);
    stage.renderer.setPixelRatio(1);
    stage.renderer.setSize(WIDTH, HEIGHT);
    stage.camera.aspect = WIDTH / HEIGHT;
    stage.camera.updateProjectionMatrix();
    return stage;
}

/** Builds the island, takes the picture, takes the island down again. */
function render(dto) {
    const s = hiddenStage();
    const before = activeParticles();
    const world = new World(s, { world: dto.world, teams: dto.teams ?? [], bunnies: dto.bunnies ?? [] });
    setActiveParticles(before); // the bunnies of the menu and the match keep their dust
    try {
        for (const b of world.bunnies.values()) {
            b.showLabel(false);
            b.labelHidden = true;
            b.attachFx({ emit() {} });
            b.play?.(['wave', 'cheer', 'idle'][b.id % 3]);
        }
        const w = world.width;
        // a little haze far away, but the whole island clear
        if (s.scene.fog) {
            s.scene.fog.near = w * 2.4;
            s.scene.fog.far = w * 6;
        }
        const rig = s.rig;
        rig.yaw = Math.PI * 0.78 + (dto.world.size % 7) * 0.12;
        rig.pitch = 0.58;
        rig.distance = Math.max(20, w * 0.95);
        rig.maxDistance = 200;
        rig.focus(new THREE.Vector3(w / 2, dto.world.waterLevel + 0.6, w / 2), true);
        // let the plants, the water and the bunnies settle into a pose
        for (let i = 0; i < 8; i++) {
            world.update(1 / 30, 4 + i / 30);
            rig.update(1 / 30); // no line-of-sight lift: the focus is the middle of the island at sea level, not a bunny
        }
        s.render();
        const canvas = document.createElement('canvas');
        canvas.width = WIDTH;
        canvas.height = HEIGHT;
        canvas.getContext('2d').drawImage(s.renderer.domElement, 0, 0, WIDTH, HEIGHT);
        return canvas.toDataURL('image/jpeg', 0.84);
    } finally {
        world.dispose();
    }
}

/** The screenshot of a world (cached in memory and in localStorage). */
export function worldShot(worldId) {
    const id = String(worldId);
    if (memory.has(id)) return memory.get(id);
    const job = worldTerrain(worldId).then(terrain => {
        const key = `bw-shot-${VERSION}-${id}-${hashOf(terrain.heights)}`;
        try {
            const stored = localStorage.getItem(key);
            if (stored) return stored;
        } catch {
            // no storage: render every time
        }
        // one after the other; each waits for a free moment of the page
        const work = queue.then(() => new Promise(resolve => setTimeout(resolve, 30))).then(async () => {
            const dto = await api.get(`/api/showcase?worldId=${encodeURIComponent(worldId)}`);
            const url = render(dto);
            try {
                // old pictures of this world go
                for (let i = localStorage.length - 1; i >= 0; i--) {
                    const k = localStorage.key(i);
                    if (k?.startsWith(`bw-shot-`) && k.split('-')[3] === id && k !== key) localStorage.removeItem(k);
                }
                localStorage.setItem(key, url);
            } catch {
                // full: the memory cache still helps
            }
            return url;
        });
        queue = work.catch(() => {});
        return work;
    });
    job.catch(() => memory.delete(id));
    memory.set(id, job);
    return job;
}

/** A box with the flat map that becomes the screenshot when it is ready (the class is for the layout). */
export function shotElement(worldId, className = 'shot') {
    const box = document.createElement('div');
    box.className = `${className} is-loading`;
    if (worldId === null || worldId === undefined) return box;
    const map = mapCanvas(worldId);
    map.className = 'shot-map';
    box.append(map);
    worldShot(worldId).then(url => {
        const img = new Image();
        img.alt = '';
        img.decoding = 'async';
        img.onload = () => {
            box.classList.remove('is-loading');
            box.replaceChildren(img);
        };
        img.src = url;
    }).catch(() => box.classList.remove('is-loading'));
    return box;
}
