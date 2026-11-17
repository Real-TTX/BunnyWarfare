// Ambient life: butterflies, seagulls, jumping fish, snowfall, desert dust and tumbleweed, shooting stars on the moon.
// Purely for the look; everything is cheap (a few instanced meshes and point clouds).
import * as THREE from 'three';
import { seeded, paint, merge, jitter } from './util.js';

const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), s = new THREE.Vector3();

function wingGeometry(width, length, color, tip) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -length * 0.35, width, 0, 0, 0, 0, length * 0.45, width * 0.85, 0, -length * 0.4, width, 0, 0, 0, 0, -length * 0.35], 3));
    g.computeVertexNormals();
    return paint(g, (x) => (x > width * 0.7 && tip ? tip : color));
}

class Flock {
    /** wings: InstancedMesh with 2 instances per animal (left, right); body optional. */
    constructor(count, wing, body, material) {
        this.count = count;
        this.wings = new THREE.InstancedMesh(wing, material, count * 2);
        this.wings.frustumCulled = false;
        this.body = body ? new THREE.InstancedMesh(body, material, count) : null;
        if (this.body) this.body.frustumCulled = false;
    }

    set(i, position, yaw, flap, pitch = 0) {
        // the right wing points along +x and lifts with +flap; the left one is its mirror image
        for (const side of [1, -1]) {
            e.set(pitch, yaw, flap * side, 'YXZ');
            q.setFromEuler(e);
            m4.compose(position, q, s.set(side, 1, 1));
            this.wings.setMatrixAt(i * 2 + (side > 0 ? 0 : 1), m4);
        }
        if (this.body) {
            e.set(pitch, yaw, 0, 'YXZ');
            q.setFromEuler(e);
            m4.compose(position, q, s.set(1, 1, 1));
            this.body.setMatrixAt(i, m4);
        }
    }

    commit() {
        this.wings.instanceMatrix.needsUpdate = true;
        if (this.body) this.body.instanceMatrix.needsUpdate = true;
    }
}

export class Life {
    constructor(data, theme, uniforms, seed, scene) {
        this.data = data;
        this.theme = theme;
        this.uniforms = uniforms;
        this.random = seeded(seed);
        this.group = new THREE.Group();
        this.group.name = 'life';
        this.disposables = [];
        this.time = 0;
        this.rings = [];
        const W = data.width;
        this.center = new THREE.Vector3(W / 2, data.waterLevel, W / 2);

        const material = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.8 });
        this.disposables.push(material);

        if (theme === 'Meadow') {
            this.butterflies(material);
            this.bees(material);
            this.dragonflies(material);
            this.ducks();
            this.motes(260, 0xfff2b0, 0.05, 0.75, 2.5);
        }
        if (theme === 'Meadow' || theme === 'Desert') this.gulls(material);
        if (theme !== 'Moon') this.fish(material);
        if (theme === 'Snow') { this.snowfall(); this.ducks(true); }
        if (theme === 'Desert') { this.dust(); this.tumbleweeds(); }
        if (theme === 'Moon') { this.shootingStars(); this.motes(200, 0x9f8cff, 0.07, 0.8, 3, true); }
    }

    // ---------------------------------------------------------------- bees, dragonflies

    bees(material) {
        const count = 8;
        const wing = wingGeometry(0.035, 0.04, '#eef6ff');
        const body = merge([
            paint(new THREE.SphereGeometry(0.03, 8, 6).scale(0.8, 0.8, 1.3), (x, y, z) => (Math.sin(z * 120) > 0 ? '#2a2018' : '#ffc21a')),
        ]);
        this.beeFlock = new Flock(count, wing, body, material);
        this.beeState = [];
        for (let i = 0; i < count; i++) this.beeState.push({ home: this.landSpot(), phase: this.random() * 10, speed: 1.4 + this.random() * 0.8 });
        this.group.add(this.beeFlock.wings, this.beeFlock.body);
    }

    /** A spot at the water's edge (the pond or the coast), or null. */
    shoreSpot() {
        for (let t = 0; t < 200; t++) {
            const x = 2 + this.random() * (this.data.width - 4), z = 2 + this.random() * (this.data.width - 4);
            const a = this.data.heightAt(x, z) - this.data.waterLevel;
            if (a > -0.6 && a < 0.1) return new THREE.Vector3(x, this.data.waterLevel, z);
        }
        return null;
    }

    dragonflies(material) {
        const wing = wingGeometry(0.13, 0.05, '#dff4ff', '#9ad0f0');
        const body = paint(new THREE.CylinderGeometry(0.012, 0.008, 0.2, 5).rotateX(Math.PI / 2), (x, y, z) => (z > 0.07 ? '#1a6fb0' : '#2fa8e0'));
        this.dflyState = [];
        for (let i = 0; i < 4; i++) {
            const home = this.shoreSpot();
            if (home) this.dflyState.push({ home, at: home.clone().setY(home.y + 0.6), goal: home.clone(), wait: 0, yaw: 0 });
        }
        if (this.dflyState.length === 0) return;
        this.dflies = new Flock(this.dflyState.length, wing, body, material);
        this.group.add(this.dflies.wings, this.dflies.body);
    }

    // ---------------------------------------------------------------- ducks (penguins would stand on the floes; on the snow island these are dark eiders)

    ducks(snowy = false) {
        const d = this.data;
        const homes = [];
        for (let t = 0; t < 600 && homes.length < 4; t++) {
            const x = 2 + this.random() * (d.width - 4), z = 2 + this.random() * (d.width - 4);
            const r = 0.8 + this.random() * 0.8;
            let ok = true;
            for (let k = 0; k < 8 && ok; k++) {
                const a = (k / 8) * Math.PI * 2;
                const depth = d.waterLevel - d.heightAt(x + Math.cos(a) * r, z + Math.sin(a) * r);
                ok = depth > 0.25 && depth < 3;
            }
            if (ok && !homes.some(h => Math.hypot(h.x - x, h.z - z) < 3)) homes.push({ x, z, r, phase: this.random() * 10, speed: (0.25 + this.random() * 0.2) * (this.random() < 0.5 ? 1 : -1) });
        }
        if (homes.length === 0) return;
        const parts = [];
        const body = new THREE.SphereGeometry(0.14, 10, 8);
        body.scale(0.85, 0.65, 1.25);
        body.translate(0, 0.06, 0);
        parts.push(paint(body, (x, y, z, nx, ny) => (snowy ? (ny > 0.2 ? '#f4f4f0' : '#2a2a30') : ny > 0.45 ? '#8a6a48' : z < -0.08 ? '#3a3028' : '#d8cbb4')));
        const tail = new THREE.ConeGeometry(0.05, 0.12, 5);
        tail.rotateX(-Math.PI / 2 - 0.5);
        tail.translate(0, 0.12, -0.17);
        parts.push(paint(tail, snowy ? '#2a2a30' : '#3a3028'));
        const head = new THREE.SphereGeometry(0.075, 10, 8);
        head.translate(0, 0.22, 0.12);
        parts.push(paint(head, snowy ? '#f4f4f0' : '#2f7a3a'));
        const neck = new THREE.TorusGeometry(0.055, 0.012, 4, 10);
        neck.rotateX(Math.PI / 2);
        neck.translate(0, 0.16, 0.11);
        parts.push(paint(neck, '#ffffff'));
        const beak = new THREE.BoxGeometry(0.05, 0.022, 0.08);
        beak.translate(0, 0.21, 0.22);
        parts.push(paint(beak, '#f2a01c'));
        for (const s of [-1, 1]) {
            const eye = new THREE.SphereGeometry(0.014, 5, 4);
            eye.translate(s * 0.05, 0.24, 0.16);
            parts.push(paint(eye, '#111111'));
        }
        const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 });
        this.disposables.push(material);
        this.duckMesh = new THREE.InstancedMesh(merge(parts), material, homes.length);
        this.duckMesh.castShadow = true;
        this.duckMesh.frustumCulled = false;
        this.duckState = homes;
        this.group.add(this.duckMesh);
    }

    // ---------------------------------------------------------------- motes: pollen in the sun, glowing dust on the moon

    motes(count, color, size, opacity, height, additive = false) {
        const d = this.data;
        const positions = new Float32Array(count * 3);
        this.moteBase = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            let x = 0, z = 0, y = d.waterLevel;
            for (let t = 0; t < 20; t++) {
                x = this.random() * d.width;
                z = this.random() * d.width;
                y = d.heightAt(x, z);
                if (y > d.waterLevel + 0.3) break;
            }
            this.moteBase[i * 3] = x;
            this.moteBase[i * 3 + 1] = Math.max(y, d.waterLevel) + 0.3 + this.random() * height;
            this.moteBase[i * 3 + 2] = z;
        }
        positions.set(this.moteBase);
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 32;
        const ctx = canvas.getContext('2d');
        const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(0.4, 'rgba(255,255,255,0.6)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 32, 32);
        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.PointsMaterial({ color, size, map: texture, transparent: true, opacity, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending });
        this.moteCloud = new THREE.Points(geometry, material);
        this.moteCloud.frustumCulled = false;
        this.disposables.push(material, texture);
        this.group.add(this.moteCloud);
    }

    // ---------------------------------------------------------------- butterflies

    butterflies(material) {
        const count = 12;
        const colors = ['#ffcf3a', '#f25a7a', '#7fb6ff', '#ffffff', '#ff8f3a', '#b98cf5'];
        const wing = wingGeometry(0.09, 0.14, '#ffffff', '#3a2a20');
        this.bflies = new Flock(count, wing, null, material);
        const c = new THREE.Color();
        this.bflyState = [];
        for (let i = 0; i < count; i++) {
            c.set(colors[i % colors.length]);
            this.bflies.wings.setColorAt(i * 2, c);
            this.bflies.wings.setColorAt(i * 2 + 1, c);
            const home = this.landSpot();
            this.bflyState.push({ home, phase: this.random() * 10, speed: 0.6 + this.random() * 0.5, radius: 1 + this.random() * 2.5 });
        }
        this.group.add(this.bflies.wings);
    }

    landSpot() {
        for (let t = 0; t < 60; t++) {
            const x = this.random() * this.data.width, z = this.random() * this.data.width;
            const y = this.data.heightAt(x, z);
            if (y > this.data.waterLevel + 0.5) return new THREE.Vector3(x, y, z);
        }
        return this.center.clone();
    }

    // ---------------------------------------------------------------- seagulls

    gulls(material) {
        // seagulls; over the desert vultures circle instead
        const vulture = this.theme === 'Desert';
        const count = vulture ? 4 : 6;
        const wing = vulture ? wingGeometry(0.75, 0.4, '#5a4636', '#1e1812') : wingGeometry(0.55, 0.32, '#f4f6f8', '#3a3f48');
        const body = paint(new THREE.CapsuleGeometry(0.08, 0.35, 2, 6).rotateX(Math.PI / 2), vulture ? '#3a2e24' : '#ffffff');
        this.gullFlock = new Flock(count, wing, body, material);
        this.gullState = [];
        for (let i = 0; i < count; i++) {
            this.gullState.push({
                phase: this.random() * Math.PI * 2, radius: this.data.width * (0.45 + this.random() * 0.5),
                height: this.data.waterLevel + 9 + this.random() * 8, speed: (0.08 + this.random() * 0.06) * (i % 2 ? 1 : -1),
            });
        }
        this.group.add(this.gullFlock.wings, this.gullFlock.body);
    }

    // ---------------------------------------------------------------- fish

    fish(material) {
        const body = new THREE.SphereGeometry(0.12, 8, 5);
        body.scale(0.6, 0.8, 1.6);
        const tail = new THREE.ConeGeometry(0.1, 0.16, 4);
        tail.rotateX(-Math.PI / 2);
        tail.scale(0.3, 1, 1);
        tail.translate(0, 0, -0.26);
        const color = this.theme === 'Snow' ? '#9fb3c4' : this.theme === 'Desert' ? '#f2a53a' : '#9cc0d8';
        this.fishMesh = new THREE.Mesh(merge([paint(body, (x, y) => (y > 0.03 ? color : '#ffffff')), paint(tail, color)]), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.2 }));
        this.fishMesh.visible = false;
        this.disposables.push(this.fishMesh.material);
        this.fishJump = null;
        this.nextFish = 3 + this.random() * 5;
        this.ringGeometry = new THREE.RingGeometry(0.15, 0.22, 20).rotateX(-Math.PI / 2);
        this.group.add(this.fishMesh);
    }

    ring(x, z) {
        const material = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false });
        const ring = new THREE.Mesh(this.ringGeometry, material);
        ring.position.set(x, this.data.waterLevel + 0.04, z);
        ring.renderOrder = 3;
        this.group.add(ring);
        this.rings.push({ mesh: ring, age: 0 });
    }

    // ---------------------------------------------------------------- particles: snow, dust

    volume(count, color, size, opacity) {
        const W = this.data.width;
        const positions = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
            positions[i * 3] = -W * 0.2 + this.random() * W * 1.4;
            positions[i * 3 + 1] = this.data.waterLevel + this.random() * 22;
            positions[i * 3 + 2] = -W * 0.2 + this.random() * W * 1.4;
        }
        const geometry = new THREE.BufferGeometry();
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 32;
        const ctx = canvas.getContext('2d');
        const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 32, 32);
        const texture = new THREE.CanvasTexture(canvas);
        const points = new THREE.Points(geometry, new THREE.PointsMaterial({ color, size, map: texture, transparent: true, opacity, depthWrite: false }));
        points.frustumCulled = false;
        this.disposables.push(points.material, texture);
        this.group.add(points);
        return points;
    }

    snowfall() {
        this.snow = this.volume(Math.round(Math.min(4000, this.data.width * this.data.width * 1.2)), 0xffffff, 0.11, 0.9);
    }

    dust() {
        this.dustCloud = this.volume(500, 0xf3d9a8, 0.09, 0.5);
    }

    tumbleweeds() {
        const parts = [];
        const random = seeded(99);
        for (let i = 0; i < 14; i++) {
            const t = new THREE.TorusGeometry(0.22 + random() * 0.06, 0.012, 3, 10);
            t.rotateX(random() * Math.PI);
            t.rotateY(random() * Math.PI);
            parts.push(paint(t, random() < 0.5 ? '#9a7a4a' : '#7d6238'));
        }
        const core = jitter(new THREE.IcosahedronGeometry(0.12, 0), 0.05, random);
        parts.push(paint(core, '#8a6a3c'));
        const geometry = merge(parts);
        const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
        this.disposables.push(material);
        this.weeds = [];
        for (let i = 0; i < 3; i++) {
            const mesh = new THREE.Mesh(geometry, material);
            mesh.castShadow = true;
            this.group.add(mesh);
            this.weeds.push({ mesh, x: this.random() * this.data.width, z: this.random() * this.data.width, y: 0, vy: 0, roll: 0 });
        }
    }

    shootingStars() {
        const geometry = new THREE.PlaneGeometry(1, 1);
        const material = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, fog: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
        this.star = new THREE.Mesh(geometry, material);
        this.star.visible = false;
        this.disposables.push(material, geometry);
        this.group.add(this.star);
        this.nextStar = 2 + this.random() * 3;
    }

    // ---------------------------------------------------------------- update

    update(dt, time, camera) {
        this.time = time;
        const wind = this.uniforms.uWind.value;
        if (this.bflies) {
            this.bflyState.forEach((b, i) => {
                const t = time * b.speed + b.phase;
                v.set(b.home.x + Math.sin(t) * b.radius + Math.sin(t * 2.3) * 0.4, 0, b.home.z + Math.cos(t * 0.8) * b.radius);
                const ground = this.data.heightAt(v.x, v.z);
                v.y = Math.max(ground, this.data.waterLevel) + 0.6 + Math.sin(t * 3.1) * 0.25;
                const yaw = Math.atan2(Math.cos(t), -Math.sin(t * 0.8) * 0.8);
                this.bflies.set(i, v, yaw, Math.sin(time * 22 + i) * 0.9 + 0.2);
            });
            this.bflies.commit();
        }
        if (this.gullFlock) {
            this.gullState.forEach((g, i) => {
                const a = g.phase + time * g.speed;
                v.set(this.center.x + Math.cos(a) * g.radius, g.height + Math.sin(time * 0.6 + i) * 1.2, this.center.z + Math.sin(a) * g.radius);
                const yaw = Math.atan2(-Math.sin(a), Math.cos(a)) + (g.speed > 0 ? 0 : Math.PI);
                const glide = Math.sin(time * 0.5 + i) > 0.2;
                this.gullFlock.set(i, v, yaw + Math.PI / 2, glide ? 0.12 : Math.sin(time * 7 + i) * 0.5, 0);
            });
            this.gullFlock.commit();
        }
        if (this.beeFlock) {
            this.beeState.forEach((b, i) => {
                const t = time * b.speed + b.phase;
                // figure eights over the flowers, now and then a quick dart
                v.set(b.home.x + Math.sin(t) * 0.9, 0, b.home.z + Math.sin(t * 2) * 0.45);
                v.y = Math.max(this.data.heightAt(v.x, v.z), this.data.waterLevel) + 0.35 + Math.sin(t * 5.3) * 0.08;
                const yaw = Math.atan2(Math.cos(t) * 0.9, Math.cos(t * 2) * 0.9);
                this.beeFlock.set(i, v, yaw, Math.sin(time * 70 + i) * 0.7);
            });
            this.beeFlock.commit();
        }
        if (this.dflies) this.updateDragonflies(dt, time);
        if (this.duckMesh) {
            this.duckState.forEach((d, i) => {
                const a = d.phase + time * d.speed;
                v.set(d.x + Math.cos(a) * d.r, this.data.waterLevel - 0.04 + Math.sin(time * 2.1 + i) * 0.015, d.z + Math.sin(a) * d.r);
                const yaw = Math.atan2(-Math.sin(a), Math.cos(a)) * 1 + (d.speed > 0 ? 0 : Math.PI);
                e.set(Math.sin(time * 1.7 + i) * 0.05, yaw, Math.sin(time * 2.3 + i) * 0.06, 'YXZ');
                q.setFromEuler(e);
                m4.compose(v, q, s.set(1, 1, 1));
                this.duckMesh.setMatrixAt(i, m4);
            });
            this.duckMesh.instanceMatrix.needsUpdate = true;
        }
        if (this.moteCloud) {
            const p = this.moteCloud.geometry.attributes.position.array, b = this.moteBase;
            for (let i = 0; i < p.length; i += 3) {
                const k = i * 0.37;
                p[i] = b[i] + Math.sin(time * 0.31 + k) * 0.6 + wind.x * 0.25;
                p[i + 1] = b[i + 1] + Math.sin(time * 0.53 + k * 1.3) * 0.3;
                p[i + 2] = b[i + 2] + Math.cos(time * 0.27 + k) * 0.6 + wind.y * 0.25;
            }
            this.moteCloud.geometry.attributes.position.needsUpdate = true;
        }
        if (this.fishMesh) this.updateFish(dt);
        if (this.snow) {
            const p = this.snow.geometry.attributes.position.array;
            for (let i = 0; i < p.length; i += 3) {
                p[i + 1] -= dt * (0.9 + (i % 7) * 0.08);
                p[i] += dt * (wind.x * 0.25 + Math.sin(time + i) * 0.15);
                p[i + 2] += dt * (wind.y * 0.25 + Math.cos(time * 0.8 + i) * 0.15);
                if (p[i + 1] < this.data.waterLevel - 1) p[i + 1] += 22;
            }
            this.snow.geometry.attributes.position.needsUpdate = true;
        }
        if (this.dustCloud) {
            const p = this.dustCloud.geometry.attributes.position.array;
            const W = this.data.width;
            for (let i = 0; i < p.length; i += 3) {
                p[i] += dt * (wind.x * 0.8 + 0.3);
                p[i + 2] += dt * (wind.y * 0.8 + 0.1);
                p[i + 1] += dt * Math.sin(time * 0.7 + i) * 0.1;
                if (p[i] > W * 1.2) p[i] -= W * 1.4;
                if (p[i] < -W * 0.2) p[i] += W * 1.4;
                if (p[i + 2] > W * 1.2) p[i + 2] -= W * 1.4;
                if (p[i + 2] < -W * 0.2) p[i + 2] += W * 1.4;
                if (p[i + 1] > this.data.waterLevel + 6) p[i + 1] = this.data.waterLevel + 0.3;
            }
            this.dustCloud.geometry.attributes.position.needsUpdate = true;
        }
        if (this.weeds) this.updateWeeds(dt, wind);
        if (this.star) this.updateStar(dt, camera);
        for (let i = this.rings.length - 1; i >= 0; i--) {
            const r = this.rings[i];
            r.age += dt;
            r.mesh.scale.setScalar(1 + r.age * 6);
            r.mesh.material.opacity = Math.max(0, 0.8 - r.age * 0.8);
            if (r.age > 1) {
                this.group.remove(r.mesh);
                r.mesh.material.dispose();
                this.rings.splice(i, 1);
            }
        }
    }

    /** Dragonflies hover, then dart to a new spot along the shore. */
    updateDragonflies(dt, time) {
        this.dflyState.forEach((f, i) => {
            f.wait -= dt;
            if (f.wait <= 0) {
                f.wait = 0.8 + this.random() * 1.6;
                f.goal.set(f.home.x + (this.random() - 0.5) * 3, this.data.waterLevel + 0.35 + this.random() * 0.6, f.home.z + (this.random() - 0.5) * 3);
            }
            const dx = f.goal.x - f.at.x, dz = f.goal.z - f.at.z;
            if (Math.hypot(dx, dz) > 0.05) f.yaw = Math.atan2(dx, dz);
            f.at.lerp(f.goal, 1 - Math.exp(-dt * 4));
            v.copy(f.at);
            v.y = Math.max(v.y, this.data.heightAt(v.x, v.z) + 0.3) + Math.sin(time * 9 + i) * 0.02;
            this.dflies.set(i, v, f.yaw, Math.sin(time * 60 + i) * 0.35);
        });
        this.dflies.commit();
    }

    updateFish(dt) {
        if (!this.fishJump) {
            this.nextFish -= dt;
            if (this.nextFish > 0) return;
            this.nextFish = 5 + this.random() * 9;
            // somewhere deep, not too far from the coast
            for (let t = 0; t < 40; t++) {
                const a = this.random() * Math.PI * 2, d = this.data.width * (0.3 + this.random() * 0.5);
                const x = this.center.x + Math.cos(a) * d, z = this.center.z + Math.sin(a) * d;
                if (this.data.waterLevel - this.data.heightAt(x, z) > 1.5) {
                    const dir = this.random() * Math.PI * 2;
                    this.fishJump = { x, z, dir, t: 0, len: 1.4 + this.random() * 0.8 };
                    this.ring(x, z);
                    this.fishMesh.visible = true;
                    break;
                }
            }
            return;
        }
        const f = this.fishJump;
        f.t += dt;
        const k = f.t / 0.9;
        if (k >= 1) {
            this.ring(f.x + Math.sin(f.dir) * f.len, f.z + Math.cos(f.dir) * f.len);
            this.fishMesh.visible = false;
            this.fishJump = null;
            return;
        }
        const x = f.x + Math.sin(f.dir) * f.len * k, z = f.z + Math.cos(f.dir) * f.len * k;
        const y = this.data.waterLevel + Math.sin(k * Math.PI) * 0.8;
        this.fishMesh.position.set(x, y, z);
        this.fishMesh.rotation.set(-Math.cos(k * Math.PI) * 0.9, f.dir, 0, 'YXZ');
    }

    updateWeeds(dt, wind) {
        const W = this.data.width;
        const speed = 0.8 + Math.hypot(wind.x, wind.y) * 0.5;
        const dir = Math.atan2(wind.x + 0.4, wind.y + 0.2);
        for (const w of this.weeds) {
            w.x += Math.sin(dir) * speed * dt;
            w.z += Math.cos(dir) * speed * dt;
            const ground = this.data.heightAt(w.x, w.z);
            if (!this.data.inside(w.x, w.z) || ground < this.data.waterLevel + 0.1) {
                // a new one blows in from the other side
                w.x = W / 2 - Math.sin(dir) * W * 0.45 + (this.random() - 0.5) * W * 0.6;
                w.z = W / 2 - Math.cos(dir) * W * 0.45 + (this.random() - 0.5) * W * 0.6;
                w.y = this.data.heightAt(w.x, w.z);
                continue;
            }
            // little hops
            w.vy -= 9.81 * dt;
            w.y += w.vy * dt;
            if (w.y < ground + 0.25) {
                w.y = ground + 0.25;
                w.vy = 1.2 + this.random() * 1.6;
            }
            w.roll += speed * dt * 4;
            w.mesh.position.set(w.x, w.y, w.z);
            w.mesh.rotation.set(w.roll, dir, 0, 'YXZ');
        }
    }

    updateStar(dt, camera) {
        const st = this.star;
        if (!st.visible) {
            this.nextStar -= dt;
            if (this.nextStar > 0) return;
            this.nextStar = 3 + this.random() * 6;
            const a = this.random() * Math.PI * 2;
            const r = this.data.width * 3;
            st.userData = {
                from: new THREE.Vector3(this.center.x + Math.cos(a) * r, 60 + this.random() * 40, this.center.z + Math.sin(a) * r),
                dir: new THREE.Vector3(-Math.cos(a + 0.6), -0.25, -Math.sin(a + 0.6)).normalize(),
                t: 0,
            };
            st.visible = true;
        }
        const d = st.userData;
        d.t += dt;
        const pos = d.from.clone().addScaledVector(d.dir, d.t * 90);
        st.position.copy(pos);
        st.scale.set(0.25, 9, 1);
        // face the camera, stretched along the flight
        if (camera) {
            st.quaternion.copy(camera.quaternion);
            const screen = d.dir.clone().transformDirection(camera.matrixWorldInverse);
            st.rotateZ(Math.atan2(screen.y, screen.x) - Math.PI / 2);
        }
        st.material.opacity = Math.sin(Math.min(1, d.t / 1.1) * Math.PI) * 0.9;
        if (d.t > 1.1) st.visible = false;
    }

    dispose() {
        this.group.traverse(o => {
            if (o.geometry) o.geometry.dispose();
        });
        for (const d of this.disposables) d.dispose();
        for (const r of this.rings) r.mesh.material.dispose();
        this.ringGeometry?.dispose();
    }
}
