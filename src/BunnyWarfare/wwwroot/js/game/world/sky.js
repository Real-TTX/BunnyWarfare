// The sky of a theme: a gradient dome with the sun, drifting puffy clouds, and for the moon a starfield and the Earth.
import * as THREE from 'three';
import { merge, paint, seeded, jitter } from './util.js';

export const SKIES = {
    Meadow: { top: '#3b8be0', horizon: '#c9e6fb', bottom: '#c9e6fb', sun: '#fff1c9', glow: '#ffe3a0', fog: '#c9e6fb', clouds: true },
    Snow: { top: '#5f92c8', horizon: '#dfe9f3', bottom: '#dfe9f3', sun: '#ffffff', glow: '#e9f2ff', fog: '#dfe9f3', clouds: true },
    Desert: { top: '#3f94d8', horizon: '#f7e1b8', bottom: '#f7e1b8', sun: '#fff0c0', glow: '#ffc773', fog: '#f7e1b8', clouds: true },
    Moon: { top: '#020208', horizon: '#0d0c1c', bottom: '#050510', sun: '#ffffff', glow: '#7a86b8', fog: '#07070f', clouds: false },
};

export function skyOf(theme) {
    return SKIES[theme] ?? SKIES.Meadow;
}

function cloudGeometry(random) {
    const parts = [];
    const puffs = 5 + Math.floor(random() * 4);
    for (let i = 0; i < puffs; i++) {
        const r = 1.6 + random() * 1.8;
        const g = jitter(new THREE.IcosahedronGeometry(r, 1), 0.35, random);
        g.scale(1, 0.72, 1);
        g.translate((i - puffs / 2) * 1.9 + random(), random() * 0.9, (random() - 0.5) * 2.2);
        parts.push(paint(g, (x, y, z, nx, ny) => (ny < -0.3 ? '#d9e3ee' : ny < 0.2 ? '#f1f5fa' : '#ffffff')));
    }
    return merge(parts);
}

/** Planet Earth for the moon sky: a sphere with blue oceans, green-brown land and white clouds (vertex colours from noise). */
function earthMesh() {
    const g = new THREE.IcosahedronGeometry(1, 4);
    const random = seeded(4711);
    const blobs = [];
    for (let i = 0; i < 14; i++) blobs.push(new THREE.Vector3(random() - 0.5, random() - 0.5, random() - 0.5).normalize());
    const painted = paint(g, (x, y, z) => {
        const p = new THREE.Vector3(x, y, z).normalize();
        let land = 0;
        for (const b of blobs) land = Math.max(land, p.dot(b));
        if (Math.abs(p.y) > 0.86) return '#f4f8ff';
        if ((Math.sin(p.x * 13 + p.z * 7) + Math.sin(p.y * 17)) > 1.35) return '#ffffff';
        return land > 0.9 ? (land > 0.95 ? '#a08a52' : '#4f9a42') : '#2f6fd1';
    });
    const m = new THREE.Mesh(painted, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false }));
    const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(1.08, 32, 16),
        new THREE.MeshBasicMaterial({ color: 0x6fb0ff, transparent: true, opacity: 0.22, fog: false, depthWrite: false }));
    m.add(atmosphere);
    return m;
}

function starField(center, radius, count, random) {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
        const u = random() * 1.9 - 0.9, a = random() * Math.PI * 2;
        const s = Math.sqrt(1 - u * u);
        positions[i * 3] = center.x + radius * s * Math.cos(a);
        positions[i * 3 + 1] = radius * u;
        positions[i * 3 + 2] = center.z + radius * s * Math.sin(a);
        c.setHSL(0.55 + random() * 0.15, 0.4, 0.65 + random() * 0.35);
        colors.set([c.r, c.g, c.b], i * 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const stars = new THREE.Points(geometry, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, fog: false, transparent: true, depthWrite: false }));
    stars.name = 'stars';
    stars.renderOrder = -1;
    return stars;
}

export class Sky {
    constructor(theme, center, radius, sunDirection, seed) {
        const style = skyOf(theme);
        this.group = new THREE.Group();
        this.radius = radius;
        this.center = center.clone();
        const random = seeded(seed);

        const dome = new THREE.Mesh(
            new THREE.SphereGeometry(radius, 48, 24),
            new THREE.ShaderMaterial({
                side: THREE.BackSide,
                depthWrite: false,
                fog: false,
                toneMapped: false,
                uniforms: {
                    uTop: { value: new THREE.Color(style.top) },
                    uHorizon: { value: new THREE.Color(style.horizon) },
                    uBottom: { value: new THREE.Color(style.bottom) },
                    uSunColor: { value: new THREE.Color(style.sun) },
                    uGlow: { value: new THREE.Color(style.glow) },
                    uSun: { value: sunDirection.clone().normalize() },
                    uMoon: { value: theme === 'Moon' ? 1 : 0 },
                },
                vertexShader: /* glsl */ `
                    varying vec3 vDir;
                    void main() {
                        vDir = normalize(position);
                        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                    }`,
                fragmentShader: /* glsl */ `
                    uniform vec3 uTop, uHorizon, uBottom, uSunColor, uGlow, uSun;
                    uniform float uMoon;
                    varying vec3 vDir;
                    void main() {
                        vec3 d = normalize(vDir);
                        float h = d.y;
                        vec3 c = h > 0.0 ? mix(uHorizon, uTop, pow(min(1.0, h * 1.5), 0.6)) : mix(uHorizon, uBottom, min(1.0, -h * 5.0));
                        float s = max(dot(d, normalize(uSun)), 0.0);
                        c += uGlow * pow(s, 8.0) * (0.35 - uMoon * 0.2);
                        c += uGlow * pow(s, 64.0) * 0.5;
                        c = mix(c, uSunColor * 1.6, smoothstep(0.9975, 0.9988, s) * (1.0 - uMoon * 0.0));
                        gl_FragColor = vec4(c, 1.0);
                        #include <colorspace_fragment>
                    }`,
            }));
        dome.position.copy(center);
        dome.renderOrder = -2;
        dome.frustumCulled = false;
        this.group.add(dome);
        this.dome = dome;

        this.clouds = null;
        if (style.clouds) {
            const geometries = [cloudGeometry(random), cloudGeometry(random), cloudGeometry(random)];
            const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true, transparent: true, opacity: 0.94, fog: true });
            this.cloudSets = [];
            const perSet = theme === 'Snow' ? 7 : theme === 'Desert' ? 3 : 6;
            for (const geometry of geometries) {
                const mesh = new THREE.InstancedMesh(geometry, material, perSet);
                mesh.frustumCulled = false;
                const items = [];
                for (let i = 0; i < perSet; i++) {
                    const angle = random() * Math.PI * 2;
                    const dist = radius * (0.25 + random() * 0.5);
                    items.push({
                        x: center.x + Math.cos(angle) * dist, z: center.z + Math.sin(angle) * dist,
                        y: 26 + random() * 22, s: 1.2 + random() * 1.6, rot: random() * Math.PI, speed: 0.6 + random() * 0.8,
                    });
                }
                this.cloudSets.push({ mesh, items });
                this.group.add(mesh);
            }
            this.cloudMaterial = material;
            this.clouds = true;
            this.updateClouds(0, new THREE.Vector2(1, 0.4));
        }

        if (theme === 'Moon') {
            this.group.add(starField(center, radius * 0.9, 2600, random));
            const earth = earthMesh();
            earth.scale.setScalar(radius * 0.07);
            const dir = new THREE.Vector3(-0.55, 0.42, 0.72).normalize();
            earth.position.copy(center).addScaledVector(dir, radius * 0.8);
            this.earth = earth;
            this.group.add(earth);
        }
    }

    updateClouds(dt, wind) {
        if (!this.clouds) return;
        const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3();
        const up = new THREE.Vector3(0, 1, 0);
        const limit = this.radius * 0.8;
        for (const set of this.cloudSets) {
            set.items.forEach((c, i) => {
                c.x += (wind.x * 0.4 + 0.5) * c.speed * dt;
                c.z += (wind.y * 0.4 + 0.2) * c.speed * dt;
                // wrap around the island
                const dx = c.x - this.center.x, dz = c.z - this.center.z;
                if (Math.hypot(dx, dz) > limit) {
                    c.x = this.center.x - dx * 0.95;
                    c.z = this.center.z - dz * 0.95;
                }
                q.setFromAxisAngle(up, c.rot);
                s.set(c.s, c.s, c.s);
                p.set(c.x, c.y, c.z);
                m.compose(p, q, s);
                set.mesh.setMatrixAt(i, m);
            });
            set.mesh.instanceMatrix.needsUpdate = true;
        }
    }

    update(dt, time, wind) {
        this.updateClouds(dt, wind);
        if (this.earth) this.earth.rotation.y += dt * 0.02;
    }

    dispose() {
        this.group.traverse(o => {
            o.geometry?.dispose?.();
            if (o.material) o.material.dispose();
        });
    }
}
