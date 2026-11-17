// What flies and bursts: projectile models, explosions, particles, rays, floating damage numbers.
import * as THREE from 'three';

const geo = {
    carrot: new THREE.ConeGeometry(0.11, 0.55, 10),
    leaf: new THREE.ConeGeometry(0.05, 0.2, 5),
    beet: new THREE.SphereGeometry(0.16, 12, 10),
    cabbage: new THREE.IcosahedronGeometry(0.2, 1),
    bomblet: new THREE.IcosahedronGeometry(0.1, 0),
    fireball: new THREE.IcosahedronGeometry(1, 2),
};

const mat = {
    carrot: new THREE.MeshStandardMaterial({ color: 0xe86a17, roughness: 0.6 }),
    leaf: new THREE.MeshStandardMaterial({ color: 0x3f8f2f, roughness: 0.7 }),
    beet: new THREE.MeshStandardMaterial({ color: 0x7a1f5c, roughness: 0.5 }),
    cabbage: new THREE.MeshStandardMaterial({ color: 0x8cc152, roughness: 0.8, flatShading: true }),
    bomblet: new THREE.MeshStandardMaterial({ color: 0x5f9e35, roughness: 0.8, flatShading: true }),
};

/** A projectile model; its local +y axis is the direction of flight (oriented by the caller). */
export function projectileModel(look) {
    const g = new THREE.Group();
    const add = (geometry, material, y = 0, rx = 0) => {
        const m = new THREE.Mesh(geometry, material);
        m.position.y = y;
        m.rotation.x = rx;
        m.castShadow = true;
        g.add(m);
        return m;
    };
    switch (look) {
        case 'beet':
            add(geo.beet, mat.beet);
            add(geo.leaf, mat.leaf, -0.2, Math.PI);
            break;
        case 'cabbage':
            add(geo.cabbage, mat.cabbage);
            break;
        case 'leaf':
            add(geo.bomblet, mat.bomblet);
            break;
        default: // carrot, carrot-drop: the tip points forward
            add(geo.carrot, mat.carrot, 0);
            for (const a of [-0.35, 0, 0.35]) {
                const leaf = add(geo.leaf, mat.leaf, -0.36, Math.PI);
                leaf.rotation.z = a;
            }
            break;
    }
    return g;
}

/** A pool of simple particles (one draw call): sparks, smoke, dirt, spray. */

/** A soft round dot (canvas texture) so particles are puffs, not squares. */
function softDot() {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d');
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.55, 'rgba(255,255,255,0.85)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
}
export class Particles {
    constructor(capacity = 900) {
        this.capacity = capacity;
        this.positions = new Float32Array(capacity * 3).fill(-9999);
        this.colors = new Float32Array(capacity * 3);
        this.velocity = new Float32Array(capacity * 3);
        this.life = new Float32Array(capacity);
        this.maxLife = new Float32Array(capacity);
        this.gravity = new Float32Array(capacity);
        this.base = new Float32Array(capacity * 3);
        this.next = 0;
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
        this.points = new THREE.Points(geometry, new THREE.PointsMaterial({ size: 0.42, map: softDot(), vertexColors: true, transparent: true, opacity: 0.95, depthWrite: false, alphaTest: 0.02 }));
        this.points.frustumCulled = false;
        this.points.renderOrder = 4;
    }

    /** count particles at a point: speed (m/s), up (extra upward speed), colors (hex list), life (s), gravity (factor of 9.81). */
    emit(at, { count = 20, speed = 4, up = 2, colors = [0xffffff], life = 1, gravity = 1, spread = 0.2 } = {}) {
        const c = new THREE.Color();
        for (let n = 0; n < count; n++) {
            const i = this.next;
            this.next = (this.next + 1) % this.capacity;
            const theta = Math.random() * Math.PI * 2, u = Math.random() * 2 - 1, s = Math.sqrt(1 - u * u);
            const v = speed * (0.35 + Math.random() * 0.65);
            this.positions[i * 3] = at.x + (Math.random() - 0.5) * spread;
            this.positions[i * 3 + 1] = at.y + (Math.random() - 0.5) * spread;
            this.positions[i * 3 + 2] = at.z + (Math.random() - 0.5) * spread;
            this.velocity[i * 3] = s * Math.cos(theta) * v;
            this.velocity[i * 3 + 1] = Math.abs(u) * v + up * Math.random();
            this.velocity[i * 3 + 2] = s * Math.sin(theta) * v;
            this.maxLife[i] = this.life[i] = life * (0.6 + Math.random() * 0.6);
            this.gravity[i] = gravity;
            c.setHex(colors[(Math.random() * colors.length) | 0]);
            this.base[i * 3] = c.r; this.base[i * 3 + 1] = c.g; this.base[i * 3 + 2] = c.b;
        }
    }

    update(dt) {
        for (let i = 0; i < this.capacity; i++) {
            if (this.life[i] <= 0) continue;
            this.life[i] -= dt;
            if (this.life[i] <= 0) {
                this.positions[i * 3 + 1] = -9999;
                continue;
            }
            this.velocity[i * 3 + 1] -= 9.81 * this.gravity[i] * dt;
            const drag = Math.exp(-dt * 1.2);
            this.velocity[i * 3] *= drag;
            this.velocity[i * 3 + 2] *= drag;
            this.positions[i * 3] += this.velocity[i * 3] * dt;
            this.positions[i * 3 + 1] += this.velocity[i * 3 + 1] * dt;
            this.positions[i * 3 + 2] += this.velocity[i * 3 + 2] * dt;
            const k = Math.sqrt(this.life[i] / this.maxLife[i]);
            this.colors[i * 3] = this.base[i * 3] * k;
            this.colors[i * 3 + 1] = this.base[i * 3 + 1] * k;
            this.colors[i * 3 + 2] = this.base[i * 3 + 2] * k;
        }
        this.points.geometry.attributes.position.needsUpdate = true;
        this.points.geometry.attributes.color.needsUpdate = true;
    }
}

/** Short-lived things: fireballs, flashes, rays. Each has an update(dt) that returns false when it is over. */
export class Effects {
    constructor(group, particles, theme) {
        this.group = group;
        this.particles = particles;
        this.theme = theme;
        this.items = [];
    }

    explosion(at, radius) {
        const fire = new THREE.Mesh(geo.fireball, new THREE.MeshBasicMaterial({ color: 0xffa02e, transparent: true, opacity: 1, depthWrite: false }));
        const core = new THREE.Mesh(geo.fireball, new THREE.MeshBasicMaterial({ color: 0xfff1a8, transparent: true, opacity: 1, depthWrite: false }));
        fire.position.copy(at);
        core.position.copy(at);
        const light = new THREE.PointLight(0xffa040, 40, radius * 6, 2);
        light.position.copy(at).add(new THREE.Vector3(0, 0.5, 0));
        this.group.add(fire, core, light);
        let t = 0;
        this.items.push({
            update: dt => {
                t += dt;
                const grow = Math.min(1, t / 0.22);
                fire.scale.setScalar(0.2 + radius * 0.9 * grow);
                core.scale.setScalar(0.1 + radius * 0.55 * grow);
                fire.material.opacity = Math.max(0, 1 - t / 0.55);
                core.material.opacity = Math.max(0, 1 - t / 0.3);
                light.intensity = Math.max(0, 40 * (1 - t / 0.4));
                if (t > 0.6) {
                    this.group.remove(fire, core, light);
                    fire.material.dispose();
                    core.material.dispose();
                    light.dispose();
                    return false;
                }
                return true;
            },
        });
        const dirt = this.theme === 'Snow' ? [0xffffff, 0xdfe8ef, 0x9aa5b0] : this.theme === 'Moon' ? [0xb5b5ba, 0x7d7e86] : this.theme === 'Desert' ? [0xe8c27a, 0xc9964f] : [0x6b4a2f, 0x5fa83a, 0x8a6a45];
        this.particles.emit(at, { count: 40, speed: 6 + radius * 2, up: 3, colors: [0xffd166, 0xff8c1a, 0xff5a1f], life: 0.5, gravity: 0.3 });
        this.particles.emit(at, { count: 40, speed: 4 + radius, up: 5, colors: dirt, life: 1.3, gravity: 1 });
        this.particles.emit(at, { count: 25, speed: 1.5, up: 2.5, colors: [0x666666, 0x888888, 0x444444], life: 1.8, gravity: -0.08, spread: radius * 0.6 });
    }

    splash(at) {
        this.particles.emit(at, { count: 45, speed: 2.5, up: 6, colors: [0xffffff, 0xd6eefc, 0x9fd3f5], life: 1.1, gravity: 1 });
    }

    ray(from, to) {
        const geometry = new THREE.BufferGeometry().setFromPoints([from, to]);
        const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0xfff3b0, transparent: true }));
        this.group.add(line);
        this.particles.emit(from, { count: 8, speed: 2, up: 0.5, colors: [0xffe08a, 0xffffff], life: 0.3, gravity: 0 });
        let t = 0;
        this.items.push({
            update: dt => {
                t += dt;
                line.material.opacity = Math.max(0, 1 - t / 0.3);
                if (t > 0.3) {
                    this.group.remove(line);
                    geometry.dispose();
                    line.material.dispose();
                    return false;
                }
                return true;
            },
        });
    }

    /** A trail of little puffs behind a flying projectile. */
    trail(at) {
        this.particles.emit(at, { count: 1, speed: 0.2, up: 0.2, colors: [0xdddddd, 0xbbbbbb], life: 0.6, gravity: -0.05, spread: 0.05 });
    }

    update(dt) {
        this.items = this.items.filter(item => item.update(dt));
    }

    clear() {
        for (const item of this.items) item.update(99);
        this.items = [];
    }
}

/** Numbers that float up from a bunny (damage), drawn as HTML on top of the canvas. */
export class Floaters {
    constructor(container, camera) {
        this.container = container;
        this.camera = camera;
        this.items = [];
    }

    add(position, text, kind = 'damage') {
        const el = document.createElement('div');
        el.className = `bw-floater bw-floater--${kind}`;
        el.textContent = text;
        this.container.appendChild(el);
        this.items.push({ el, position: position.clone(), t: 0 });
    }

    update(dt) {
        const w = this.container.clientWidth, h = this.container.clientHeight;
        const v = new THREE.Vector3();
        this.items = this.items.filter(item => {
            item.t += dt;
            if (item.t > 1.6) {
                item.el.remove();
                return false;
            }
            v.copy(item.position);
            v.y += 1.6 + item.t * 0.9;
            v.project(this.camera);
            const hidden = v.z > 1;
            item.el.style.transform = `translate(${((v.x + 1) / 2) * w}px, ${((1 - v.y) / 2) * h}px) translate(-50%, -50%)`;
            item.el.style.opacity = hidden ? '0' : String(Math.min(1, 2 - item.t * 1.25));
            return true;
        });
    }
}
