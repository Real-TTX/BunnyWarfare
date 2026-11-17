// Renderer, light, sky and fog of a theme, and the camera that follows the action. The island itself (ground, water, plants) is built by World.
import * as THREE from 'three';
import { Sky, skyOf } from './world/sky.js';
import { disposeTree } from './world/util.js';

const THEMES = {
    Meadow: { sun: 0xfff1d6, sunIntensity: 2.6, hemiSky: 0xcfe8ff, hemiGround: 0x6a8a3a, hemiIntensity: 1.25, exposure: 1.02 },
    Snow: { sun: 0xf4f7ff, sunIntensity: 2.3, hemiSky: 0xe8f2ff, hemiGround: 0x8aa0b4, hemiIntensity: 1.35, exposure: 0.95 },
    Desert: { sun: 0xffe2b0, sunIntensity: 2.9, hemiSky: 0xfff0d0, hemiGround: 0xc09050, hemiIntensity: 1.15, exposure: 1.0 },
    Moon: { sun: 0xffffff, sunIntensity: 3.0, hemiSky: 0x8a90b8, hemiGround: 0x1c1c28, hemiIntensity: 0.65, exposure: 1.05 },
    Autumn: { sun: 0xffd9a0, sunIntensity: 2.7, hemiSky: 0xffe6c4, hemiGround: 0x8a5a2a, hemiIntensity: 1.2, exposure: 1.0 },
    Volcano: { sun: 0xffb07a, sunIntensity: 2.8, hemiSky: 0xb08080, hemiGround: 0x5a2a1c, hemiIntensity: 1.25, exposure: 1.1 },
    Jungle: { sun: 0xfff4d0, sunIntensity: 2.6, hemiSky: 0xd8f4e6, hemiGround: 0x3a6a2a, hemiIntensity: 1.3, exposure: 1.0 },
};

/** The look of a theme: sky colours (for fog, water reflection), light. */
export function themeOf(name) {
    const sky = skyOf(name);
    const light = THEMES[name] ?? THEMES.Meadow;
    return { ...light, sky: new THREE.Color(sky.horizon).getHex(), fog: new THREE.Color(sky.fog).getHex(), stars: name === 'Moon', water: name === 'Moon' ? null : true };
}

/** The renderer and the parts of the scene around an island: sky, lights, fog. */
export class Stage {
    constructor(container) {
        this.container = container;
        this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
        this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFShadowMap;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;
        container.appendChild(this.renderer.domElement);

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 900);
        this.rig = new CameraRig(this.camera);
        this.world = null; // the group of the current island (built per match)
        this.water = null; // set by World (the mesh of the sea, or null)
        this.sky = null;
        this.sun = null;
        this.sunDirection = new THREE.Vector3(0.45, 0.8, -0.4).normalize();

        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        const w = this.container.clientWidth || window.innerWidth;
        const h = this.container.clientHeight || window.innerHeight;
        this.renderer.setSize(w, h);
        this.camera.aspect = w / h;
        // the HUD covers the bottom of the screen in a match: the picture is moved up so the bunny and its aim stay in the free part
        if (this.centerShift) this.camera.setViewOffset(w, h, 0, h * this.centerShift, w, h);
        else this.camera.clearViewOffset();
        this.camera.updateProjectionMatrix();
    }

    /** Moves the centre of the picture up by a share of the height (0 = centred). */
    setCenterShift(share) {
        this.centerShift = share;
        this.resize();
    }

    /** Sky, fog and lights for a theme and an island of <width> metres. Returns the group everything of the island goes into. */
    setup(themeName, width, waterLevel) {
        if (this.world) {
            this.scene.remove(this.world);
            // the shadow map of the old sun is a render target of its own
            this.world.traverse(o => { if (o.isLight) o.dispose?.(); });
            disposeTree(this.world);
            this.sky = null;
        }
        const t = themeOf(themeName);
        const style = skyOf(themeName);
        const group = new THREE.Group();
        group.name = 'island';
        this.world = group;
        this.water = null;
        this.scene.add(group);
        this.theme = themeName;
        this.renderer.toneMappingExposure = t.exposure;

        const mid = width / 2;
        const center = new THREE.Vector3(mid, waterLevel, mid);
        const reach = Math.max(140, width * 4.2);
        this.reach = reach;
        this.camera.far = Math.max(900, reach * 3);
        this.camera.updateProjectionMatrix();

        // the sun: high in the south-west, a little warmer in the desert
        const sunDirection = themeName === 'Desert' ? new THREE.Vector3(0.55, 0.62, -0.5) : themeName === 'Moon' ? new THREE.Vector3(-0.6, 0.55, -0.45)
            : themeName === 'Autumn' ? new THREE.Vector3(0.6, 0.5, -0.45) : themeName === 'Volcano' ? new THREE.Vector3(-0.55, 0.42, -0.5) : new THREE.Vector3(0.45, 0.78, -0.42);
        this.sunDirection = sunDirection.normalize();

        this.scene.background = new THREE.Color(style.horizon);
        // the fog swallows the sea floor and the far islets, no hard horizon
        this.scene.fog = themeName === 'Moon' ? new THREE.Fog(style.fog, reach * 0.7, reach * 1.6) : new THREE.Fog(style.fog, width * 1.3, reach * 1.05);

        this.sky = new Sky(themeName, center, Math.min(this.camera.far * 0.9, reach * 2.4), this.sunDirection, Math.round(width * 31 + waterLevel * 7));
        group.add(this.sky.group);

        const hemi = new THREE.HemisphereLight(t.hemiSky, t.hemiGround, t.hemiIntensity);
        group.add(hemi);
        const sun = new THREE.DirectionalLight(t.sun, t.sunIntensity);
        sun.position.copy(center).addScaledVector(this.sunDirection, width * 1.4);
        sun.target.position.copy(center);
        sun.castShadow = true;
        sun.shadow.mapSize.set(2048, 2048);
        const half = width * 0.66;
        Object.assign(sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 1, far: width * 3.2 });
        sun.shadow.bias = -0.0006;
        sun.shadow.normalBias = 0.035;
        sun.shadow.radius = 2;
        group.add(sun, sun.target);
        this.sun = sun;
        // a soft fill from the other side so shadows are never black
        const fill = new THREE.DirectionalLight(themeName === 'Moon' ? 0x4a5288 : 0xbfd8ff, themeName === 'Moon' ? 0.35 : 0.45);
        fill.position.copy(center).add(new THREE.Vector3(-this.sunDirection.x, 0.5, -this.sunDirection.z).multiplyScalar(width));
        fill.target.position.copy(center);
        group.add(fill, fill.target);
        return group;
    }

    render() {
        this.renderer.render(this.scene, this.camera);
    }
}

/**
 * A third-person orbit camera. Yaw uses the game's convention: the camera looks along (sin yaw, 0, cos yaw), so the yaw of the camera is the yaw of the aim.
 * Pitch lifts the camera above the target; distance is the zoom. Everything moves smoothly towards its goal.
 * orbit(speed) lets it turn by itself (the menu): radians per second, 0 = off.
 */
export class CameraRig {
    constructor(camera) {
        this.camera = camera;
        this.yaw = 0;
        this.pitch = 0.42;
        this.distance = 10;
        this.maxDistance = 45;
        this.goal = new THREE.Vector3();
        this.target = new THREE.Vector3();
        this.shakeAmount = 0;
        this.snapNext = true;
        this.orbitSpeed = 0;
        this.followRate = 5; // how fast the camera catches up with its goal (higher = tighter)
        this.autoDistance = 0; // a distance the game wants at least (the aim camera keeps bunny and impact in view); the zoom of the player may go further
        this.shownDistance = null;
        this.autoPitch = 0; // a pitch the game wants at least (the aim camera looks a little more from above); dragging the camera wins
        this.shownPitch = null;
    }

    /** Where to look; snap = jump there at once. */
    focus(point, snap = false) {
        this.goal.copy(point);
        if (snap) this.snapNext = true;
    }

    /** Turns around the target by itself (radians per second); 0 stops. */
    orbit(speed) {
        this.orbitSpeed = speed;
    }

    rotate(dx, dy) {
        this.yaw -= dx * 0.0055;
        if (dy !== 0) {
            this.pitch = Math.min(1.35, Math.max(0.05, (this.shownPitch ?? this.pitch) + dy * 0.004));
            this.manualPitch = true;
        }
    }

    /** The zoom of the player: starts from what is shown and from then on wins over the aim camera (until the game resets manualZoom). */
    zoom(delta) {
        const from = this.shownDistance ?? this.distance;
        this.distance = Math.min(this.maxDistance, Math.max(3.5, from * (1 + delta * 0.0012)));
        this.manualZoom = true;
    }

    shake(amount) {
        this.shakeAmount = Math.min(1.2, this.shakeAmount + amount);
    }

    get forward() {
        return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    }

    get right() {
        return new THREE.Vector3(-Math.cos(this.yaw), 0, Math.sin(this.yaw));
    }

    update(dt, heightAt) {
        if (this.orbitSpeed) this.yaw += this.orbitSpeed * dt;
        if (this.snapNext) {
            this.target.copy(this.goal);
            this.snapNext = false;
            this.lift = null; // a jump to a new place takes the full lift at once
            this.shownDistance = null; // ... and the distance and pitch it should have
            this.shownPitch = null;
        } else {
            this.target.lerp(this.goal, 1 - Math.exp(-dt * this.followRate));
        }
        const wanted = Math.min(this.maxDistance, this.manualZoom ? this.distance : Math.max(this.distance, this.autoDistance));
        this.shownDistance = this.shownDistance == null ? wanted : this.shownDistance + (wanted - this.shownDistance) * (1 - Math.exp(-dt * 3));
        const distance = this.shownDistance;
        const wantedPitch = this.manualPitch ? this.pitch : Math.max(this.pitch, this.autoPitch);
        this.shownPitch = this.shownPitch == null ? wantedPitch : this.shownPitch + (wantedPitch - this.shownPitch) * (1 - Math.exp(-dt * 3));
        const pitch = this.shownPitch;
        const back = this.forward.multiplyScalar(-distance * Math.cos(pitch));
        const pos = this.target.clone().add(back);
        pos.y += distance * Math.sin(pitch);
        // never below the ground, and never behind a hill: sample the line of sight and lift the camera (smoothly) until it is free
        if (heightAt) {
            let lift = Math.max(0, heightAt(pos.x, pos.z) + 0.8 - pos.y);
            for (let i = 1; i <= 14; i++) {
                const t = i / 14;
                const x = this.target.x + (pos.x - this.target.x) * t;
                const z = this.target.z + (pos.z - this.target.z) * t;
                const y = this.target.y + (pos.y - this.target.y) * t;
                const need = heightAt(x, z) + 0.7 - y;
                if (need > 0) lift = Math.max(lift, need / t);
            }
            this.lift = this.lift == null ? lift : this.lift + (lift - this.lift) * (lift > this.lift ? 1 - Math.exp(-dt * 12) : 1 - Math.exp(-dt * 2.5));
            pos.y += Math.max(this.lift, heightAt(pos.x, pos.z) + 0.8 - pos.y);
        }
        if (this.shakeAmount > 0.001) {
            const s = this.shakeAmount * 0.35;
            pos.x += (Math.random() - 0.5) * s;
            pos.y += (Math.random() - 0.5) * s;
            pos.z += (Math.random() - 0.5) * s;
            this.shakeAmount *= Math.exp(-dt * 6);
        }
        this.camera.position.copy(pos);
        this.camera.lookAt(this.target);
    }
}
