// What flies and bursts: projectile models, pooled particles (soft sprites with size, colour and alpha over life), explosions
// (flash, noisy fireball, smoke, sparks, flying dirt chunks, a shockwave), water splashes, hitscan streaks and floating damage numbers.
//
// Public API:
//   projectileModel(look)                 the model of a projectile (+y = direction of flight; userData.spin / userData.wobble)
//   new Particles(capacity)               .points (an Object3D to add to the scene) · emit(at, opts) · update(dt)
//       opts: count, speed, up, colors [hex], life (s), gravity (× 9.81, negative rises), spread (m), size (m), grow (end size factor),
//             fade (alpha to 0, default true), drag, additive (glowing), ring (horizontal burst), dir (Vector3 bias), colorEnd (hex)
//   activeParticles()                     the Particles created last (the bunnies put their dust there) · setActiveParticles(p) puts one back
//   new Effects(group, particles, theme)  explosion(at, radius) · splash(at) · ray(from, to) · trail(at, look?) · muzzle(at) · update(dt) · clear()
//                                         setGround((x, z) => height) lets dirt chunks bounce on the terrain
//   new Floaters(container, camera)       add(position, text, kind: 'damage' | 'ko' | 'water' | 'heal') · update(dt) · clear()
import * as THREE from 'three';
import { softDot, softRing } from './fx/shapes.js';

export { projectileModel } from './fx/props.js';

// ---------------------------------------------------------------- particles

let lastParticles = null;

/** The particle pool created last (one per island). */
export function activeParticles() {
    return lastParticles;
}

/** Puts back the pool the bunnies use by default (an offscreen island, e.g. a level screenshot, must not take it away). */
export function setActiveParticles(particles) {
    lastParticles = particles;
}

const PARTICLE_VERTEX = /* glsl */ `
attribute vec3 aColor;
attribute float aAlpha;
attribute float aSize;
uniform float uScale;
varying vec3 vColor;
varying float vAlpha;
void main() {
    vColor = aColor;
    vAlpha = aAlpha;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale / max(0.1, -mv.z);
    gl_Position = projectionMatrix * mv;
}`;

const PARTICLE_FRAGMENT = /* glsl */ `
uniform sampler2D uMap;
varying vec3 vColor;
varying float vAlpha;
void main() {
    float a = texture2D(uMap, gl_PointCoord).a * vAlpha;
    if (a < 0.01) discard;
    gl_FragColor = vec4(vColor, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}`;

/** One pool of particles drawn in one call (normal or additive blending). */
class Pool {
    constructor(capacity, additive) {
        this.capacity = capacity;
        this.position = new Float32Array(capacity * 3).fill(-9999);
        this.color = new Float32Array(capacity * 3);
        this.alpha = new Float32Array(capacity);
        this.size = new Float32Array(capacity);
        this.velocity = new Float32Array(capacity * 3);
        this.life = new Float32Array(capacity);
        this.maxLife = new Float32Array(capacity);
        this.gravity = new Float32Array(capacity);
        this.drag = new Float32Array(capacity);
        this.size0 = new Float32Array(capacity);
        this.grow = new Float32Array(capacity);
        this.fade = new Uint8Array(capacity);
        this.from = new Float32Array(capacity * 3);
        this.to = new Float32Array(capacity * 3);
        this.next = 0;
        this.alive = 0;
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(this.position, 3).setUsage(THREE.DynamicDrawUsage));
        geometry.setAttribute('aColor', new THREE.BufferAttribute(this.color, 3).setUsage(THREE.DynamicDrawUsage));
        geometry.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
        geometry.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
        this.material = new THREE.ShaderMaterial({
            uniforms: { uMap: { value: softDot() }, uScale: { value: 600 } },
            vertexShader: PARTICLE_VERTEX,
            fragmentShader: PARTICLE_FRAGMENT,
            transparent: true,
            depthWrite: false,
            blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
        });
        this.points = new THREE.Points(geometry, this.material);
        this.points.frustumCulled = false;
        this.points.renderOrder = additive ? 6 : 4;
        const size = new THREE.Vector2();
        this.points.onBeforeRender = (renderer, scene, camera) => {
            renderer.getDrawingBufferSize(size);
            const fov = camera.isPerspectiveCamera ? camera.fov : 50;
            this.material.uniforms.uScale.value = size.y / (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2));
        };
    }

    spawn() {
        const i = this.next;
        this.next = (this.next + 1) % this.capacity;
        return i;
    }

    update(dt) {
        let alive = 0;
        for (let i = 0; i < this.capacity; i++) {
            if (this.life[i] <= 0) continue;
            this.life[i] -= dt;
            if (this.life[i] <= 0) {
                this.position[i * 3 + 1] = -9999;
                this.alpha[i] = 0;
                continue;
            }
            alive++;
            const i3 = i * 3;
            this.velocity[i3 + 1] -= 9.81 * this.gravity[i] * dt;
            const drag = Math.exp(-dt * this.drag[i]);
            this.velocity[i3] *= drag;
            this.velocity[i3 + 1] *= this.gravity[i] < 0 ? drag : 1;
            this.velocity[i3 + 2] *= drag;
            this.position[i3] += this.velocity[i3] * dt;
            this.position[i3 + 1] += this.velocity[i3 + 1] * dt;
            this.position[i3 + 2] += this.velocity[i3 + 2] * dt;
            const age = 1 - this.life[i] / this.maxLife[i]; // 0 .. 1
            this.size[i] = this.size0[i] * (1 + (this.grow[i] - 1) * Math.sqrt(age));
            this.color[i3] = this.from[i3] + (this.to[i3] - this.from[i3]) * age;
            this.color[i3 + 1] = this.from[i3 + 1] + (this.to[i3 + 1] - this.from[i3 + 1]) * age;
            this.color[i3 + 2] = this.from[i3 + 2] + (this.to[i3 + 2] - this.from[i3 + 2]) * age;
            this.alpha[i] = this.fade[i] ? Math.min(1, (1 - age) * 1.6) * Math.min(1, age * 12 + 0.3) : 1;
        }
        this.alive = alive;
        const a = this.points.geometry.attributes;
        a.position.needsUpdate = true;
        a.aColor.needsUpdate = true;
        a.aAlpha.needsUpdate = true;
        a.aSize.needsUpdate = true;
    }
}

const c1 = new THREE.Color();
const c2 = new THREE.Color();

/** Soft round particles: smoke, sparks, dirt, spray, dust. Two pools (normal and glowing), each one draw call. */
export class Particles {
    constructor(capacity = 1400) {
        this.normal = new Pool(capacity, false);
        this.glow = new Pool(Math.round(capacity * 0.5), true);
        this.points = new THREE.Group();
        this.points.add(this.normal.points, this.glow.points);
        lastParticles = this;
    }

    emit(at, opts = {}) {
        const {
            count = 20, speed = 4, up = 2, colors = [0xffffff], life = 1, gravity = 1, spread = 0.2, size = 0.42, grow = 1,
            fade = true, drag = 1.2, additive = false, ring = false, dir = null, colorEnd = null,
        } = opts;
        const pool = additive ? this.glow : this.normal;
        for (let n = 0; n < count; n++) {
            const i = pool.spawn();
            const i3 = i * 3;
            const theta = Math.random() * Math.PI * 2;
            const u = ring ? (Math.random() - 0.5) * 0.15 : Math.random() * 2 - 1;
            const s = Math.sqrt(1 - u * u);
            const v = speed * (0.35 + Math.random() * 0.65);
            pool.position[i3] = at.x + (Math.random() - 0.5) * spread;
            pool.position[i3 + 1] = at.y + (Math.random() - 0.5) * spread * (ring ? 0.2 : 1);
            pool.position[i3 + 2] = at.z + (Math.random() - 0.5) * spread;
            pool.velocity[i3] = s * Math.cos(theta) * v + (dir ? dir.x : 0);
            pool.velocity[i3 + 1] = Math.abs(u) * v + up * Math.random() + (dir ? dir.y : 0);
            pool.velocity[i3 + 2] = s * Math.sin(theta) * v + (dir ? dir.z : 0);
            pool.maxLife[i] = pool.life[i] = life * (0.6 + Math.random() * 0.6);
            pool.gravity[i] = gravity;
            pool.drag[i] = drag;
            pool.size0[i] = size * (0.7 + Math.random() * 0.6);
            pool.size[i] = pool.size0[i];
            pool.grow[i] = grow;
            pool.fade[i] = fade ? 1 : 0;
            c1.setHex(colors[(Math.random() * colors.length) | 0]);
            c2.copy(colorEnd !== null ? c1.clone().lerp(new THREE.Color(colorEnd), 1) : fade ? c1 : c1.clone().multiplyScalar(0.15));
            pool.from[i3] = c1.r; pool.from[i3 + 1] = c1.g; pool.from[i3 + 2] = c1.b;
            pool.to[i3] = c2.r; pool.to[i3 + 1] = c2.g; pool.to[i3 + 2] = c2.b;
            pool.color[i3] = c1.r; pool.color[i3 + 1] = c1.g; pool.color[i3 + 2] = c1.b;
            pool.alpha[i] = fade ? 0.3 : 1;
        }
    }

    update(dt) {
        this.normal.update(dt);
        this.glow.update(dt);
    }
}

// ---------------------------------------------------------------- the fireball

const FIREBALL_VERTEX = /* glsl */ `
uniform float uTime;
uniform float uProgress;
varying vec3 vPos;
varying float vNoise;
varying vec3 vNormal;
varying vec3 vView;
float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise(vec3 x) {
    vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p) { return noise(p) * 0.55 + noise(p * 2.1) * 0.3 + noise(p * 4.3) * 0.15; }
void main() {
    vec3 p = position;
    float n = fbm(normalize(p) * 2.6 + vec3(0.0, -uTime * 2.2, uTime * 0.7));
    vNoise = n;
    p += normal * (n - 0.45) * 0.55;
    p.y += uProgress * uProgress * 0.6;
    vPos = p;
    vNormal = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vView = normalize(-mv.xyz);
    gl_Position = projectionMatrix * mv;
}`;

const FIREBALL_FRAGMENT = /* glsl */ `
uniform float uProgress;
varying vec3 vPos;
varying float vNoise;
varying vec3 vNormal;
varying vec3 vView;
void main() {
    float rim = 1.0 - abs(dot(vNormal, vView));
    float heat = clamp(1.15 - uProgress * 1.9 + (vNoise - 0.5) * 1.1 - rim * 0.45, 0.0, 1.0);
    vec3 smoke = vec3(0.24, 0.21, 0.19);
    vec3 red = vec3(0.78, 0.12, 0.02);
    vec3 orange = vec3(1.0, 0.42, 0.04);
    vec3 yellow = vec3(1.0, 0.85, 0.35);
    vec3 col = heat < 0.33 ? mix(smoke, red, heat / 0.33) : heat < 0.66 ? mix(red, orange, (heat - 0.33) / 0.33) : mix(orange, yellow, (heat - 0.66) / 0.34);
    float glow = smoothstep(0.35, 1.0, heat);
    col *= 1.0 + glow * 0.75;
    // it dissolves from the edges with the noise
    float alpha = smoothstep(uProgress * 1.3 - 0.15, uProgress * 1.3 + 0.08, vNoise + 0.22 - rim * 0.25);
    if (alpha < 0.02) discard;
    gl_FragColor = vec4(col, alpha);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
}`;

const fireballGeometry = new THREE.IcosahedronGeometry(1, 4);

function fireballMaterial() {
    return new THREE.ShaderMaterial({
        uniforms: { uTime: { value: Math.random() * 10 }, uProgress: { value: 0 } },
        vertexShader: FIREBALL_VERTEX,
        fragmentShader: FIREBALL_FRAGMENT,
        transparent: true,
        depthWrite: false,
    });
}

// ---------------------------------------------------------------- dirt chunks

const MAX_CHUNKS = 160;

/** Flying chunks of dirt and rock (one instanced mesh): they spin, fall and bounce on the ground, then sink away. */
class Chunks {
    constructor(group) {
        const geometry = new THREE.DodecahedronGeometry(0.08, 0);
        this.mesh = new THREE.InstancedMesh(geometry, new THREE.MeshStandardMaterial({ roughness: 0.95, flatShading: true }), MAX_CHUNKS);
        this.mesh.castShadow = true;
        this.mesh.frustumCulled = false;
        this.mesh.count = MAX_CHUNKS;
        this.items = Array.from({ length: MAX_CHUNKS }, () => ({ life: 0, p: new THREE.Vector3(), v: new THREE.Vector3(), r: new THREE.Euler(), w: new THREE.Vector3(), s: 1 }));
        const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
        for (let i = 0; i < MAX_CHUNKS; i++) {
            this.mesh.setMatrixAt(i, hidden);
            this.mesh.setColorAt(i, new THREE.Color(0x6b4a2f));
        }
        this.next = 0;
        this.ground = null;
        group.add(this.mesh);
        this.m = new THREE.Matrix4();
        this.q = new THREE.Quaternion();
        this.scale = new THREE.Vector3();
    }

    burst(at, radius, colors) {
        const count = Math.min(40, Math.round(8 + radius * 6));
        const color = new THREE.Color();
        for (let n = 0; n < count; n++) {
            const i = this.next;
            this.next = (this.next + 1) % MAX_CHUNKS;
            const it = this.items[i];
            const a = Math.random() * Math.PI * 2;
            const out = 2 + Math.random() * (3 + radius * 1.5);
            it.p.set(at.x + Math.cos(a) * 0.3, at.y + 0.2, at.z + Math.sin(a) * 0.3);
            it.v.set(Math.cos(a) * out, 4 + Math.random() * (4 + radius * 1.5), Math.sin(a) * out);
            it.w.set((Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18, (Math.random() - 0.5) * 18);
            it.r.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
            it.s = 0.45 + Math.random() * 0.8 * Math.min(1.5, radius / 2);
            it.life = 2.2 + Math.random() * 0.8;
            it.bounces = 0;
            color.setHex(colors[(Math.random() * colors.length) | 0]).multiplyScalar(0.75 + Math.random() * 0.4);
            this.mesh.setColorAt(i, color);
        }
        this.mesh.instanceColor.needsUpdate = true;
    }

    update(dt) {
        let any = false;
        for (let i = 0; i < MAX_CHUNKS; i++) {
            const it = this.items[i];
            if (it.life <= 0) continue;
            any = true;
            it.life -= dt;
            it.v.y -= 9.81 * dt;
            it.p.addScaledVector(it.v, dt);
            const ground = this.ground ? this.ground(it.p.x, it.p.z) : -Infinity;
            if (it.p.y < ground + 0.04 && it.v.y < 0) {
                it.p.y = ground + 0.04;
                it.bounces++;
                it.v.y *= -0.35;
                it.v.x *= 0.55;
                it.v.z *= 0.55;
                it.w.multiplyScalar(0.5);
                if (it.bounces > 3) it.v.set(0, 0, 0);
            }
            it.r.x += it.w.x * dt;
            it.r.y += it.w.y * dt;
            it.r.z += it.w.z * dt;
            const shrink = it.life < 0.6 ? Math.max(0, it.life / 0.6) : 1;
            this.q.setFromEuler(it.r);
            this.scale.setScalar(it.s * shrink);
            this.m.compose(it.p, this.q, this.scale);
            this.mesh.setMatrixAt(i, this.m);
        }
        if (any) this.mesh.instanceMatrix.needsUpdate = true;
    }

    clear() {
        const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
        for (let i = 0; i < MAX_CHUNKS; i++) {
            this.items[i].life = 0;
            this.mesh.setMatrixAt(i, hidden);
        }
        this.mesh.instanceMatrix.needsUpdate = true;
    }
}

// ---------------------------------------------------------------- effects

const GROUND = {
    Meadow: [0x5fa83a, 0x6b4a2f, 0x8a6a45, 0x4c8a2c],
    Snow: [0xffffff, 0xe6eef5, 0xb9c6d2, 0x8e99a6],
    Desert: [0xe8c27a, 0xd4a75f, 0xc9964f, 0xb07a3c],
    Moon: [0xc2c2c8, 0x9a9aa2, 0x7d7e86, 0x5a5a62],
    Autumn: [0xb8a43e, 0x6a4628, 0xe8742a, 0x8a5a30],
    Volcano: [0x3a3236, 0x1e1a1e, 0xff6a1a, 0x4a4044],
    Jungle: [0x3f8a2c, 0x6a4a2a, 0x4a301c, 0x5aa83a],
};

const ringGeometry = new THREE.PlaneGeometry(1, 1);
const flashGeometry = new THREE.PlaneGeometry(1, 1);
const streakGeometry = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
const columnGeometry = new THREE.CylinderGeometry(0.6, 1, 1, 14, 3, true);
columnGeometry.translate(0, 0.5, 0);

/** Short-lived things: fireballs, flashes, rings, rays, splashes. Each item has an update(dt) that returns false when it is over. */
export class Effects {
    constructor(group, particles, theme) {
        this.group = group;
        this.particles = particles;
        this.theme = theme;
        this.items = [];
        this.chunks = new Chunks(group);
        this.ground = null;
        // two flash lights live all the time (intensity 0 when idle): adding lights later would make three compile every material again
        this.lights = [0, 1].map(() => {
            const light = new THREE.PointLight(0xffb060, 0, 12, 2);
            light.position.set(0, -999, 0);
            group.add(light);
            return light;
        });
        this.nextLight = 0;
    }

    /** A function (x, z) => height of the ground, so dirt chunks bounce on the terrain. */
    setGround(fn) {
        this.ground = fn;
        this.chunks.ground = fn;
    }

    groundAt(at) {
        return this.ground ? this.ground(at.x, at.z) : at.y;
    }

    add(object, duration, step) {
        this.group.add(object);
        let t = 0;
        this.items.push({
            update: dt => {
                t += dt;
                const k = Math.min(1, t / duration);
                step(k, t);
                if (t >= duration) {
                    this.group.remove(object);
                    object.traverse(o => {
                        if (o.material && !o.material.userData.shared) o.material.dispose();
                    });
                    return false;
                }
                return true;
            },
        });
    }

    explosion(at, radius = 2) {
        const r = Math.max(0.6, radius);
        const dirt = GROUND[this.theme] ?? GROUND.Meadow;
        const ground = this.groundAt(at);

        // the flash: a light and a bright billboard
        const light = this.lights[this.nextLight++ % this.lights.length];
        light.position.copy(at).add(new THREE.Vector3(0, 0.8, 0));
        light.distance = r * 7;
        let lt = 0;
        this.items.push({
            update: dt => {
                lt += dt;
                const k = Math.min(1, lt / 0.45);
                light.intensity = 40 * r * Math.pow(1 - k, 2);
                return k < 1;
            },
        });
        const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot(), color: 0xfff1c0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
        flash.position.copy(at).add(new THREE.Vector3(0, 0.3, 0));
        flash.renderOrder = 7;
        this.add(flash, 0.22, k => {
            flash.scale.setScalar(r * (2.5 + k * 2.5));
            flash.material.opacity = 1 - k;
        });

        // the fireball (and a smaller hot core)
        for (const [size, life, lift] of [[1, 0.95, 0.2], [0.55, 0.6, 0.35]]) {
            const fire = new THREE.Mesh(fireballGeometry, fireballMaterial());
            fire.position.copy(at).add(new THREE.Vector3(0, r * lift, 0));
            fire.renderOrder = 5;
            this.add(fire, life, (k, t) => {
                const grow = 1 - Math.pow(1 - Math.min(1, t / 0.2), 3);
                fire.scale.setScalar(r * size * (0.15 + 0.5 * grow + k * 0.25));
                fire.material.uniforms.uProgress.value = k;
                fire.material.uniforms.uTime.value += 0.016;
                fire.position.y += 0.012 * size;
            });
        }

        // the shockwave on the ground
        const wave = new THREE.Mesh(ringGeometry, new THREE.MeshBasicMaterial({ map: softRing(), color: 0xfff6e6, transparent: true, depthWrite: false }));
        wave.rotation.x = -Math.PI / 2;
        wave.position.set(at.x, Math.max(ground, at.y - r) + 0.1, at.z);
        wave.renderOrder = 4;
        this.add(wave, 0.5, k => {
            wave.scale.setScalar(0.5 + r * 3.4 * Math.sqrt(k));
            wave.material.opacity = (1 - k) * 0.7;
        });

        // sparks, embers, smoke, dirt, a dust ring and the chunks
        const p = this.particles;
        p.emit(at, { count: Math.round(26 + r * 10), speed: 7 + r * 3, up: 3, colors: [0xffe08a, 0xffb02e, 0xff7a1a], life: 0.55, gravity: 0.7, size: 0.13, additive: true, drag: 1.5 });
        p.emit(at, { count: Math.round(10 + r * 4), speed: 2.5, up: 4, colors: [0xff9a3a, 0xff5a1f], life: 1.4, gravity: -0.05, size: 0.09, additive: true, drag: 1 });
        p.emit(at.clone().add(new THREE.Vector3(0, r * 0.4, 0)), { count: Math.round(8 + r * 4), speed: 1.2, up: 1.6, colors: [0x4a4542, 0x5d5753, 0x3a3634], life: 2.2, gravity: -0.06, size: 0.42 * r, grow: 2.3, drag: 1.8, spread: r * 0.5, colorEnd: 0xa09a94 });
        p.emit(at, { count: Math.round(24 + r * 8), speed: 4 + r * 1.5, up: 4, colors: dirt, life: 1.3, gravity: 1, size: 0.16, drag: 1 });
        p.emit({ x: at.x, y: Math.max(ground, at.y - r * 0.5) + 0.15, z: at.z }, { count: Math.round(18 + r * 6), speed: 4 + r * 1.6, up: 0.3, colors: [0xcfc3ad, 0xb8ab94, dirt[2]], life: 1.1, gravity: 0.05, size: 0.5, grow: 2.2, drag: 3, ring: true, spread: r * 0.4 });
        this.chunks.burst(at, r, dirt);
    }

    splash(at) {
        const level = at.y;
        // a column of water that shoots up and falls back
        const lava = this.theme === 'Volcano';
        const column = new THREE.Mesh(columnGeometry, new THREE.MeshStandardMaterial({ color: lava ? 0xff7a1a : 0xe6f6ff, emissive: lava ? 0xff4a00 : 0x000000, transparent: true, opacity: 0.85, roughness: 0.2, depthWrite: false }));
        column.position.set(at.x, level, at.z);
        this.add(column, 1.0, k => {
            const h = Math.sin(Math.min(1, k * 1.4) * Math.PI) * 2.4;
            column.scale.set(0.3 + k * 0.5, Math.max(0.01, h), 0.3 + k * 0.5);
            column.material.opacity = 0.85 * (1 - k);
        });
        // rings of ripples
        for (let n = 0; n < 3; n++) {
            const ripple = new THREE.Mesh(ringGeometry, new THREE.MeshBasicMaterial({ map: softRing(), color: 0xffffff, transparent: true, depthWrite: false }));
            ripple.rotation.x = -Math.PI / 2;
            ripple.position.set(at.x, level + 0.03, at.z);
            ripple.visible = false;
            this.add(ripple, 1.4 + n * 0.25, (k, t) => {
                const local = t - n * 0.22;
                ripple.visible = local > 0;
                const q = Math.max(0, local) / 1.4;
                ripple.scale.setScalar(0.4 + q * (3.5 + n));
                ripple.material.opacity = Math.max(0, 0.9 * (1 - q));
            });
        }
        this.particles.emit(at, { count: 50, speed: 2.8, up: 6.5, colors: lava ? [0xffd06a, 0xff7a1a, 0xff3a0a] : [0xffffff, 0xd6eefc, 0x9fd3f5], life: 1.2, gravity: 1, size: 0.16, drag: 0.4, additive: lava });
        this.particles.emit(at, { count: 24, speed: 2.4, up: 0.2, colors: lava ? [0x4a4044, 0x2a2226] : [0xffffff, 0xeaf6ff], life: 1.2, gravity: 0, size: 0.4, grow: 2, ring: true, drag: 2.5 });
    }

    /** A muzzle flash (a quick glowing star) at a point. */
    muzzle(at) {
        const flash = new THREE.Sprite(new THREE.SpriteMaterial({ map: softDot(), color: 0xfff0a0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
        flash.position.copy(at);
        this.add(flash, 0.12, k => {
            flash.scale.setScalar(0.9 * (1 - k * 0.5));
            flash.material.opacity = 1 - k;
        });
        this.particles.emit(at, { count: 6, speed: 1.5, up: 0.5, colors: [0xdedede, 0xbdbdbd], life: 0.7, gravity: -0.05, size: 0.25, grow: 2.2, drag: 2 });
    }

    ray(from, to) {
        const dir = to.clone().sub(from);
        const len = dir.length();
        const mid = from.clone().add(to).multiplyScalar(0.5);
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
        const group = new THREE.Group();
        const core = new THREE.Mesh(streakGeometry, new THREE.MeshBasicMaterial({ color: 0xfffbe0, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
        const glow = new THREE.Mesh(streakGeometry, new THREE.MeshBasicMaterial({ color: 0xffc04a, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending }));
        for (const m of [core, glow]) {
            m.position.copy(mid);
            m.quaternion.copy(q);
            group.add(m);
        }
        this.add(group, 0.28, k => {
            core.scale.set(0.025 * (1 - k), len, 0.025 * (1 - k));
            glow.scale.set(0.09 * (1 - k * 0.5), len, 0.09 * (1 - k * 0.5));
            core.material.opacity = 1 - k;
            glow.material.opacity = 0.45 * (1 - k);
        });
        this.muzzle(from);
        // seeds of the dandelion drift away from the muzzle
        this.particles.emit(from, { count: 8, speed: 1.2, up: 0.4, colors: [0xffffff, 0xf4f0e0], life: 1.6, gravity: -0.03, size: 0.07, drag: 1.5, dir: dir.clone().normalize().multiplyScalar(1.5) });
        this.particles.emit(to, { count: 10, speed: 2.5, up: 1.5, colors: [0xffe08a, 0xffffff], life: 0.35, gravity: 0.5, size: 0.09, additive: true });
        this.particles.emit(to, { count: 8, speed: 1.2, up: 1, colors: [0xcfc3ad, 0xb8ab94], life: 0.8, gravity: 0.1, size: 0.3, grow: 2, drag: 2.5 });
    }

    /** A trail behind a flying projectile (by its look). */
    trail(at, look) {
        const p = this.particles;
        switch (look) {
            case 'beet':
                p.emit(at, { count: 1, speed: 0.3, up: 0.1, colors: [0xff7ac0, 0xd04a9a, 0xffc2e0], life: 0.5, gravity: 0, size: 0.09, additive: true, spread: 0.08 });
                break;
            case 'cabbage':
            case 'leaf':
                p.emit(at, { count: 1, speed: 0.4, up: 0.1, colors: [0x9fd06a, 0x5f9e35], life: 0.6, gravity: 0.2, size: 0.08, spread: 0.1 });
                p.emit(at, { count: 1, speed: 0.15, up: 0.15, colors: [0xe8e8e8], life: 0.5, gravity: -0.02, size: 0.18, grow: 2, drag: 2 });
                break;
            case 'carrot-drop':
                p.emit(at, { count: 1, speed: 0.1, up: 0, colors: [0xffffff, 0xeeeeee], life: 0.4, gravity: 0, size: 0.16, grow: 1.6, drag: 3 });
                break;
            default: // the carrot rocket: smoke and a few sparks
                p.emit(at, { count: 1, speed: 0.2, up: 0.2, colors: [0xe6e6e6, 0xcfcfcf, 0xbdbdbd], life: 0.9, gravity: -0.04, size: 0.22, grow: 3, drag: 2 });
                if (Math.random() < 0.6) p.emit(at, { count: 1, speed: 0.6, up: 0, colors: [0xffc04a, 0xff7a1a], life: 0.25, gravity: 0, size: 0.12, additive: true });
                break;
        }
    }

    update(dt) {
        this.items = this.items.filter(item => item.update(dt));
        this.chunks.update(dt);
    }

    clear() {
        for (const item of this.items) item.update(99);
        this.items = [];
        this.chunks.clear();
        for (const light of this.lights) light.intensity = 0;
    }
}

// ---------------------------------------------------------------- floating numbers

/** Cartoon numbers that pop out of a bunny and float up (damage, K.O., a splash), drawn as HTML on top of the canvas (css/effects.css). */
export class Floaters {
    constructor(container, camera) {
        this.container = container;
        this.camera = camera;
        this.items = [];
        this.v = new THREE.Vector3();
    }

    add(position, text, kind = 'damage') {
        const value = Math.abs(parseInt(String(text).replace(/[^\d]/g, ''), 10));
        if (kind === 'ko' && /plumps|platsch|splash/i.test(text)) kind = 'water';
        const el = document.createElement('div');
        el.className = `bw-floater bw-floater--${kind}${kind === 'damage' && value >= 35 ? ' bw-floater--big' : ''}`;
        const inner = document.createElement('span');
        inner.textContent = text;
        el.appendChild(inner);
        this.container?.appendChild(el);
        // floaters at the same spot spread out sideways
        const near = this.items.filter(i => i.position.distanceToSquared(position) < 1 && i.t < 0.6).length;
        this.items.push({
            el, position: position.clone(), t: 0, life: kind === 'damage' ? 1.6 : 2.1,
            dx: (near % 2 ? 1 : -1) * Math.ceil(near / 2) * 54 + (Math.random() - 0.5) * 14,
            dy: -near * 30 - (kind === 'damage' ? 0 : 52),
        });
    }

    update(dt) {
        if (!this.container) return;
        const w = this.container.clientWidth || window.innerWidth;
        const h = this.container.clientHeight || window.innerHeight;
        this.items = this.items.filter(item => {
            item.t += dt;
            if (item.t > item.life) {
                item.el.remove();
                return false;
            }
            this.v.copy(item.position);
            this.v.y += 1.9 + item.t * 0.7;
            this.v.project(this.camera);
            const hidden = this.v.z > 1;
            const x = ((this.v.x + 1) / 2) * w + item.dx * Math.min(1, item.t * 3);
            const y = ((1 - this.v.y) / 2) * h - item.t * 18 + item.dy;
            item.el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
            item.el.style.opacity = hidden ? '0' : String(Math.min(1, (item.life - item.t) * 2.2));
            return true;
        });
    }

    clear() {
        for (const item of this.items) item.el.remove();
        this.items = [];
    }
}
