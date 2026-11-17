// Renderer, light, sky, water and the camera that follows the action.
import * as THREE from 'three';

const THEMES = {
    Meadow: { sky: 0x9fd3f5, fog: 0xbfe2f7, water: 0x2f7fb8, seabed: 0x8c7b52, sun: 0xfff4dc, hemiSky: 0xcfe8ff, hemiGround: 0x5a7d3a, stars: false },
    Snow: { sky: 0xcfe1ef, fog: 0xdde9f2, water: 0x3d6f8f, seabed: 0x55606a, sun: 0xf2f6ff, hemiSky: 0xe8f2ff, hemiGround: 0x8090a0, stars: false },
    Desert: { sky: 0xf3d9a4, fog: 0xf5e2bb, water: 0x3a8fa3, seabed: 0xa98348, sun: 0xffe9c0, hemiSky: 0xfff0d0, hemiGround: 0xb08850, stars: false },
    Moon: { sky: 0x05060c, fog: 0x05060c, water: null, seabed: null, sun: 0xffffff, hemiSky: 0x9aa0b8, hemiGround: 0x202028, stars: true },
};

export function themeOf(name) {
    return THEMES[name] ?? THEMES.Meadow;
}

/** The renderer and the parts of the scene that do not change during a match. */
export class Stage {
    constructor(container) {
        this.container = container;
        this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
        this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFShadowMap;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.05;
        container.appendChild(this.renderer.domElement);

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 600);
        this.rig = new CameraRig(this.camera);
        this.world = null; // the group of the current island (built per match)

        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        const w = this.container.clientWidth || window.innerWidth;
        const h = this.container.clientHeight || window.innerHeight;
        this.renderer.setSize(w, h);
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
    }

    /** Sky, fog, lights, water for a theme and an island of <width> metres. Returns the group everything is in. */
    setup(themeName, width, waterLevel) {
        if (this.world) {
            this.scene.remove(this.world);
            this.world.traverse(o => {
                o.geometry?.dispose?.();
                if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose());
            });
        }
        const t = themeOf(themeName);
        const group = new THREE.Group();
        this.world = group;
        this.scene.add(group);
        this.scene.background = new THREE.Color(t.sky);
        this.scene.fog = t.stars ? new THREE.Fog(t.fog, width * 2.5, width * 6) : new THREE.Fog(t.fog, width * 1.1, width * 3.2);

        const mid = width / 2;
        group.add(new THREE.HemisphereLight(t.hemiSky, t.hemiGround, t.stars ? 0.8 : 1.4));
        const sun = new THREE.DirectionalLight(t.sun, t.stars ? 2.4 : 2.2);
        sun.position.set(mid + width * 0.35, width * 0.8, mid - width * 0.45);
        sun.target.position.set(mid, 0, mid);
        sun.castShadow = true;
        sun.shadow.mapSize.set(2048, 2048);
        const half = width * 0.62;
        Object.assign(sun.shadow.camera, { left: -half, right: half, top: half, bottom: -half, near: 1, far: width * 3 });
        sun.shadow.bias = -0.0008;
        sun.shadow.normalBias = 0.03;
        group.add(sun, sun.target);

        if (t.water !== null) {
            const water = new THREE.Mesh(
                new THREE.PlaneGeometry(width * 8, width * 8),
                new THREE.MeshStandardMaterial({ color: t.water, transparent: true, opacity: 0.78, roughness: 0.25, metalness: 0.1 }));
            water.rotation.x = -Math.PI / 2;
            water.position.set(mid, waterLevel, mid);
            water.receiveShadow = true;
            water.name = 'water';
            group.add(water);
            this.water = water;

            const seabed = new THREE.Mesh(new THREE.PlaneGeometry(width * 8, width * 8), new THREE.MeshLambertMaterial({ color: t.seabed }));
            seabed.rotation.x = -Math.PI / 2;
            seabed.position.set(mid, waterLevel - 4.2, mid);
            group.add(seabed);
        } else {
            this.water = null;
            group.add(starField(mid));
        }
        return group;
    }

    render() {
        this.renderer.render(this.scene, this.camera);
    }
}

function starField(mid) {
    const count = 1500;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        // points on a big sphere around the island
        const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2;
        const r = 260;
        const s = Math.sqrt(1 - u * u);
        positions[i * 3] = mid + r * s * Math.cos(a);
        positions[i * 3 + 1] = r * u;
        positions[i * 3 + 2] = mid + r * s * Math.sin(a);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const stars = new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xffffff, size: 1.3, sizeAttenuation: false, fog: false }));
    stars.name = 'stars';
    return stars;
}

/**
 * A third-person orbit camera. Yaw uses the game's convention: the camera looks along (sin yaw, 0, cos yaw), so the yaw of the camera is the yaw of the aim.
 * Pitch lifts the camera above the target; distance is the zoom. Everything moves smoothly towards its goal.
 */
export class CameraRig {
    constructor(camera) {
        this.camera = camera;
        this.yaw = 0;
        this.pitch = 0.42;
        this.distance = 10;
        this.goal = new THREE.Vector3();
        this.target = new THREE.Vector3();
        this.shakeAmount = 0;
        this.snapNext = true;
    }

    /** Where to look; snap = jump there at once. */
    focus(point, snap = false) {
        this.goal.copy(point);
        if (snap) this.snapNext = true;
    }

    rotate(dx, dy) {
        this.yaw -= dx * 0.0055;
        this.pitch = Math.min(1.35, Math.max(0.05, this.pitch + dy * 0.004));
    }

    zoom(delta) {
        this.distance = Math.min(45, Math.max(3.5, this.distance * (1 + delta * 0.0012)));
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
        if (this.snapNext) {
            this.target.copy(this.goal);
            this.snapNext = false;
        } else {
            this.target.lerp(this.goal, 1 - Math.exp(-dt * 5));
        }
        const back = this.forward.multiplyScalar(-this.distance * Math.cos(this.pitch));
        const pos = this.target.clone().add(back);
        pos.y += this.distance * Math.sin(this.pitch);
        // never below the ground
        if (heightAt) pos.y = Math.max(pos.y, heightAt(pos.x, pos.z) + 0.8);
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
