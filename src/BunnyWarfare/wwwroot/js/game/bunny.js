// The bunnies: a small low-poly model from primitives, a label with name and health, the marker of the turn and the gravestone.
import * as THREE from 'three';

const shared = {
    body: new THREE.SphereGeometry(0.34, 14, 10),
    head: new THREE.SphereGeometry(0.24, 14, 10),
    ear: new THREE.CapsuleGeometry(0.06, 0.42, 4, 8),
    innerEar: new THREE.CapsuleGeometry(0.035, 0.34, 3, 6),
    eye: new THREE.SphereGeometry(0.04, 8, 6),
    nose: new THREE.SphereGeometry(0.035, 8, 6),
    tail: new THREE.IcosahedronGeometry(0.11, 1),
    foot: new THREE.SphereGeometry(0.1, 10, 6),
    helmet: new THREE.SphereGeometry(0.26, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2),
    brim: new THREE.CylinderGeometry(0.29, 0.29, 0.03, 16),
    arrow: new THREE.ConeGeometry(0.18, 0.4, 4),
    stone: new THREE.CylinderGeometry(0.22, 0.26, 0.6, 10),
    stoneTop: new THREE.SphereGeometry(0.22, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2),
    carrot: new THREE.ConeGeometry(0.07, 0.38, 8),
    leaf: new THREE.ConeGeometry(0.05, 0.16, 5),
    aim: null,
};

const materials = {
    fur: new THREE.MeshStandardMaterial({ color: 0xf2ece4, roughness: 0.9 }),
    furShade: new THREE.MeshStandardMaterial({ color: 0xd9cfc2, roughness: 0.9 }),
    inner: new THREE.MeshStandardMaterial({ color: 0xf2a7b5, roughness: 0.8 }),
    eye: new THREE.MeshStandardMaterial({ color: 0x1c140f, roughness: 0.3 }),
    nose: new THREE.MeshStandardMaterial({ color: 0xe0607a, roughness: 0.5 }),
    stone: new THREE.MeshStandardMaterial({ color: 0x8b8d93, roughness: 1 }),
    carrot: new THREE.MeshStandardMaterial({ color: 0xe86a17, roughness: 0.7 }),
    leaf: new THREE.MeshStandardMaterial({ color: 0x3f8f2f, roughness: 0.8 }),
};

const teamMaterials = new Map();
function teamMaterial(color) {
    if (!teamMaterials.has(color)) teamMaterials.set(color, new THREE.MeshStandardMaterial({ color, roughness: 0.6 }));
    return teamMaterials.get(color);
}

function part(geometry, material, x, y, z) {
    const m = new THREE.Mesh(geometry, material);
    m.position.set(x, y, z);
    m.castShadow = true;
    return m;
}

/** A bunny of a team. Its group stands with the feet at y = 0 and looks along +z. */
export class Bunny {
    constructor(dto, team) {
        this.id = dto.id;
        this.team = dto.team;
        this.name = dto.name;
        this.color = team?.color ?? '#888888';
        this.health = dto.health;
        this.maxHealth = dto.maxHealth;
        this.alive = dto.health > 0;
        this.position = new THREE.Vector3(dto.x, dto.y, dto.z);
        this.goal = this.position.clone();
        this.yaw = dto.yaw;
        this.goalYaw = dto.yaw;
        this.moving = 0; // seconds the hop still lasts
        this.phase = Math.random() * 10;

        this.root = new THREE.Group();
        this.model = this.buildModel();
        this.root.add(this.model);
        this.label = new Label(this.name, this.color);
        this.label.sprite.position.y = 1.75;
        this.root.add(this.label.sprite);
        this.label.draw(this.health, this.maxHealth);
        this.aimLine = null;
        this.grave = null;
        this.sync();
        if (!this.alive) this.die(false);
    }

    buildModel() {
        const g = new THREE.Group();
        const team = teamMaterial(this.color);
        const body = part(shared.body, materials.fur, 0, 0.42, 0);
        body.scale.set(1, 1.08, 1.12);
        const head = part(shared.head, materials.fur, 0, 0.86, 0.12);
        const earL = part(shared.ear, materials.fur, -0.1, 1.28, 0.06);
        earL.rotation.z = 0.12;
        const earR = part(shared.ear, materials.fur, 0.11, 1.24, 0.06);
        earR.rotation.z = -0.35; // the cheeky bent ear
        const inL = part(shared.innerEar, materials.inner, -0.1, 1.28, 0.1);
        inL.rotation.z = 0.12;
        const inR = part(shared.innerEar, materials.inner, 0.11, 1.24, 0.1);
        inR.rotation.z = -0.35;
        const eyeL = part(shared.eye, materials.eye, -0.09, 0.92, 0.32);
        const eyeR = part(shared.eye, materials.eye, 0.09, 0.92, 0.32);
        const nose = part(shared.nose, materials.nose, 0, 0.84, 0.36);
        const tail = part(shared.tail, materials.fur, 0, 0.36, -0.38);
        const footL = part(shared.foot, materials.furShade, -0.15, 0.06, 0.16);
        footL.scale.set(1, 0.6, 1.6);
        const footR = part(shared.foot, materials.furShade, 0.15, 0.06, 0.16);
        footR.scale.set(1, 0.6, 1.6);
        const helmet = part(shared.helmet, team, 0, 0.98, 0.1);
        helmet.rotation.x = -0.15;
        const brim = part(shared.brim, team, 0, 0.98, 0.12);
        brim.rotation.x = -0.15;
        g.add(body, head, earL, earR, inL, inR, eyeL, eyeR, nose, tail, footL, footR, helmet, brim);
        this.ears = [earL, earR, inL, inR];
        return g;
    }

    /** Health from the server (labels redraw only when it changed). */
    setHealth(health) {
        if (health === this.health) return;
        this.health = health;
        this.label.draw(Math.max(0, health), this.maxHealth);
    }

    /** Puts the bunny where the server says, at once. */
    snap(x, y, z, yaw) {
        this.position.set(x, y, z);
        this.goal.set(x, y, z);
        if (yaw !== undefined) { this.yaw = yaw; this.goalYaw = yaw; }
        this.sync();
    }

    /** Walks smoothly towards a position (moves of other players). */
    walkTo(x, y, z, yaw) {
        this.goal.set(x, y, z);
        this.goalYaw = yaw;
        this.moving = 0.25;
    }

    die(animate = true) {
        this.alive = false;
        this.model.visible = false;
        this.label.sprite.visible = false;
        this.setAim(null);
        if (!this.grave) {
            this.grave = gravestone();
            this.root.add(this.grave);
            if (animate) this.grave.scale.setScalar(0.01);
        }
    }

    /** Drowned: nothing is left above the water. */
    sink() {
        this.die(false);
        this.grave.visible = false;
    }

    /** Shows the aim of the bunny (a dashed line of points) or hides it (null). */
    setAim(points, color) {
        if (this.aimLine) {
            this.root.parent?.remove(this.aimLine);
            this.aimLine.geometry.dispose();
            this.aimLine = null;
        }
        if (!points || points.length < 2) return;
        const geometry = new THREE.BufferGeometry().setFromPoints(points);
        const line = new THREE.Line(geometry, new THREE.LineDashedMaterial({ color: color ?? this.color, dashSize: 0.25, gapSize: 0.18, transparent: true, opacity: 0.9 }));
        line.computeLineDistances();
        line.renderOrder = 5;
        this.aimLine = line;
        this.root.parent?.add(line);
    }

    sync() {
        this.root.position.copy(this.position);
        this.model.rotation.y = this.yaw;
    }

    update(dt, time) {
        if (this.position.distanceToSquared(this.goal) > 1e-6) {
            this.position.lerp(this.goal, 1 - Math.exp(-dt * 12));
            this.moving = Math.max(this.moving, 0.1);
        }
        let d = this.goalYaw - this.yaw;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        this.yaw += d * (1 - Math.exp(-dt * 14));
        this.sync();
        if (!this.alive) {
            if (this.grave && this.grave.scale.x < 1) this.grave.scale.setScalar(Math.min(1, this.grave.scale.x + dt * 3));
            return;
        }
        // idle: a soft breath and twitching ears; walking: hops
        this.phase += dt;
        if (this.moving > 0) {
            this.moving -= dt;
            this.model.position.y = Math.abs(Math.sin(time * 13)) * 0.14;
        } else {
            this.model.position.y = Math.sin(this.phase * 2.4) * 0.015;
        }
        this.ears[0].rotation.x = Math.sin(this.phase * 1.7) * 0.08;
        this.ears[2].rotation.x = this.ears[0].rotation.x;
    }

    dispose() {
        this.setAim(null);
        this.root.parent?.remove(this.root);
        this.label.dispose();
    }
}

function gravestone() {
    const g = new THREE.Group();
    const stone = part(shared.stone, materials.stone, 0, 0.3, 0);
    stone.scale.z = 0.45;
    const top = part(shared.stoneTop, materials.stone, 0, 0.6, 0);
    top.scale.z = 0.45;
    const carrot = part(shared.carrot, materials.carrot, 0.22, 0.2, 0.14);
    carrot.rotation.z = Math.PI + 0.5;
    const leaf = part(shared.leaf, materials.leaf, 0.33, 0.37, 0.14);
    leaf.rotation.z = -0.6;
    g.add(stone, top, carrot, leaf);
    return g;
}

/** The marker of the bunny whose turn it is: a bouncing arrow in the team colour. */
export class TurnMarker {
    constructor() {
        this.material = new THREE.MeshStandardMaterial({ color: 0xc2410c, emissive: 0x401000, roughness: 0.4 });
        this.mesh = new THREE.Mesh(shared.arrow, this.material);
        this.mesh.rotation.x = Math.PI;
        this.mesh.visible = false;
        this.time = 0;
    }

    attach(bunny) {
        if (!bunny || !bunny.alive) {
            this.mesh.visible = false;
            this.bunny = null;
            return;
        }
        this.bunny = bunny;
        this.material.color.set(bunny.color);
        this.material.emissive.set(bunny.color).multiplyScalar(0.3);
        this.mesh.visible = true;
    }

    update(dt) {
        if (!this.bunny || !this.bunny.alive) {
            this.mesh.visible = false;
            return;
        }
        this.time += dt;
        this.mesh.position.copy(this.bunny.position);
        this.mesh.position.y += 2.35 + Math.abs(Math.sin(this.time * 3.2)) * 0.3;
        this.mesh.rotation.y += dt * 2;
    }
}

/** Name and health above a bunny: a canvas texture on a sprite. */
class Label {
    constructor(name, color) {
        this.name = name;
        this.color = color;
        this.canvas = document.createElement('canvas');
        this.canvas.width = 256;
        this.canvas.height = 80;
        this.texture = new THREE.CanvasTexture(this.canvas);
        this.texture.colorSpace = THREE.SRGBColorSpace;
        this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.texture, depthTest: false, transparent: true }));
        this.sprite.scale.set(1.7, 0.53, 1);
        this.sprite.renderOrder = 10;
    }

    draw(health, max) {
        const c = this.canvas.getContext('2d');
        c.clearRect(0, 0, 256, 80);
        c.font = '600 28px "Segoe UI", system-ui, sans-serif';
        c.textAlign = 'center';
        c.lineWidth = 6;
        c.strokeStyle = 'rgba(0,0,0,0.65)';
        c.strokeText(this.name, 128, 30);
        c.fillStyle = '#ffffff';
        c.fillText(this.name, 128, 30);
        // the bar: background, health in the team colour, the number
        const share = Math.max(0, Math.min(1, health / Math.max(1, max)));
        roundRect(c, 38, 44, 180, 26, 13, 'rgba(0,0,0,0.6)');
        if (share > 0) roundRect(c, 41, 47, 174 * share, 20, 10, this.color);
        c.font = '700 20px "Segoe UI", system-ui, sans-serif';
        c.fillStyle = '#ffffff';
        c.fillText(String(health), 128, 64);
        this.texture.needsUpdate = true;
    }

    dispose() {
        this.texture.dispose();
        this.sprite.material.dispose();
    }
}

function roundRect(c, x, y, w, h, r, fill) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
    c.fillStyle = fill;
    c.fill();
}
