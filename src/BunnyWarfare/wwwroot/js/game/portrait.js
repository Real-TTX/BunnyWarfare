// Portraits (the avatars of the players) and the 3D preview of the wardrobe.
// CONTRACT (used by menu.js, hud.js):
//   look = { fur, outfit, face, frame, color }   keys from Business/Cosmetics.cs, color = team colour (#rrggbb)
//   lookOf(teamOrPlayer)                          picks these fields from a TeamDto / player / slot (missing ones: defaults)
//   portraitUrl(look, size = 128) → Promise<string>   a PNG data URL: the bunny's head and shoulders in its frame (cached per look and size)
//   new BunnyPreview(container) · .setLook(look) · .play(name) · .dispose()   a small turning 3D bunny for the wardrobe
// A real Bunny is drawn for both: one shared offscreen renderer for all portraits, one renderer per preview (at most one open at a time).
import * as THREE from 'three';
import { Bunny } from './bunny.js';

export function lookOf(source) {
    return {
        fur: source?.fur || 'snow',
        outfit: source?.outfit || 'helmet',
        face: source?.face || 'none',
        frame: source?.frame || 'wood',
        color: source?.color || source?.teamColor || '#c2410c',
    };
}

// ---------------------------------------------------------------- the little studio: lights and a camera on a bunny

function studio(transparent = true) {
    const scene = new THREE.Scene();
    if (!transparent) scene.background = new THREE.Color(0xf6ead2);
    scene.add(new THREE.HemisphereLight(0xfff6e6, 0x8a7a66, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(1.6, 2.6, 2.4);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xbfd8ff, 1.2);
    rim.position.set(-2, 1.6, -1.5);
    scene.add(rim);
    return scene;
}

function makeBunny(look, yaw = 0.32) {
    const bunny = new Bunny({ id: 1, team: 0, name: '', x: 0, y: 0, z: 0, yaw, health: 100, maxHealth: 100 }, { color: look.color, fur: look.fur, outfit: look.outfit, face: look.face });
    bunny.showLabel(false);
    bunny.labelHidden = true; // no chatter
    bunny.attachFx({ emit() {} }); // its dust and sweat stay out of the island behind the menu
    bunny.fidgetIn = 1e9;
    bunny.lookIn = 1e9;
    bunny.lookTarget = 0;
    bunny.gazeMode = 'camera';
    return bunny;
}

/** Brings a portrait bunny into a calm, friendly pose that looks at the camera (the springs settle, no blink). */
function settle(bunny, renderer, scene, camera) {
    bunny.blinkIn = 1e9;
    renderer.render(scene, camera); // the head records where the camera is
    for (let i = 0; i < 40; i++) {
        bunny.blinkIn = 1e9;
        bunny.update(1 / 30, i / 30);
    }
    bunny.eyes.scale.set(1, 1, 1);
}

// ---------------------------------------------------------------- portraits

let shared = null; // { renderer, scene, camera }
function sharedStudio() {
    if (shared) return shared;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.setClearColor(0x000000, 0);
    const scene = studio(true);
    const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 20);
    camera.position.set(0.42, 1.16, 2.35);
    camera.lookAt(0, 1.04, 0);
    shared = { renderer, scene, camera };
    return shared;
}

const portraits = new Map();
let queue = Promise.resolve();

/** A PNG data URL of the bunny's head and shoulders in its frame (cached; rendered one after the other so the page stays responsive). */
export function portraitUrl(look, size = 128) {
    const l = lookOf(look);
    const key = `${l.fur}|${l.outfit}|${l.face}|${l.frame}|${l.color}|${size}`;
    if (!portraits.has(key)) {
        const job = queue.then(() => new Promise(resolve => setTimeout(resolve, 0))).then(() => {
            try {
                return renderPortrait(l, size);
            } catch {
                return fallbackPortrait(l, size); // no WebGL: the frame with a disc in the team colour
            }
        });
        queue = job.catch(() => {});
        portraits.set(key, job);
    }
    return portraits.get(key);
}

function renderPortrait(look, size) {
    const { renderer, scene, camera } = sharedStudio();
    const px = Math.min(512, Math.max(128, size * 2));
    renderer.setSize(px, px, false);
    const bunny = makeBunny(look);
    scene.add(bunny.root);
    settle(bunny, renderer, scene, camera);
    renderer.render(scene, camera);
    const shot = renderer.domElement;

    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = px;
    const c = canvas.getContext('2d');
    drawFrame(c, px, look, shot);
    scene.remove(bunny.root);
    bunny.dispose();
    if (px !== size) {
        const small = document.createElement('canvas');
        small.width = small.height = size;
        const s = small.getContext('2d');
        s.imageSmoothingQuality = 'high';
        s.drawImage(canvas, 0, 0, size, size);
        return small.toDataURL('image/png');
    }
    return canvas.toDataURL('image/png');
}

function fallbackPortrait(look, size) {
    const shot = document.createElement('canvas');
    shot.width = shot.height = size;
    const s = shot.getContext('2d');
    s.fillStyle = look.color;
    s.beginPath();
    s.arc(size / 2, size * 0.58, size * 0.26, 0, Math.PI * 2);
    s.fill();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    drawFrame(canvas.getContext('2d'), size, look, shot);
    return canvas.toDataURL('image/png');
}

// ---------------------------------------------------------------- frames (canvas 2D): background, the bunny, the band, decorations

const INK = '#2a1a0e';

function rounded(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
}

function seeded(seed) {
    let a = seed >>> 0;
    return () => {
        a = (a + 0x6d2b79f5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), a | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function star(c, x, y, r, color, points = 5) {
    c.beginPath();
    for (let i = 0; i < points * 2; i++) {
        const a = -Math.PI / 2 + (i / (points * 2)) * Math.PI * 2;
        const rr = i % 2 ? r * 0.45 : r;
        c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    c.closePath();
    c.fillStyle = color;
    c.fill();
}

/** Per frame: the inside (behind the bunny), the band colours and what is drawn on top. */
const FRAMES = {
    wood: {
        inside: (c, s) => vertical(c, s, '#fbe9c8', '#e7c48f'),
        band: (c, s, b) => {
            c.fillStyle = '#9a6234';
            c.fill('evenodd');
            const rnd = seeded(3);
            c.save();
            c.clip('evenodd');
            c.strokeStyle = 'rgba(70,38,16,0.45)';
            c.lineWidth = s * 0.008;
            for (let i = 0; i < 14; i++) {
                c.beginPath();
                const y = rnd() * s;
                c.moveTo(0, y);
                c.bezierCurveTo(s * 0.3, y + (rnd() - 0.5) * s * 0.06, s * 0.6, y + (rnd() - 0.5) * s * 0.06, s, y);
                c.stroke();
            }
            c.restore();
        },
    },
    meadow: {
        inside: (c, s) => {
            vertical(c, s, '#bfe6ff', '#e8f7ff');
            c.fillStyle = '#7ccf52';
            c.beginPath();
            c.ellipse(s * 0.5, s * 1.02, s * 0.75, s * 0.32, 0, 0, Math.PI * 2);
            c.fill();
        },
        band: (c, s) => {
            c.fillStyle = '#4f9e2f';
            c.fill('evenodd');
        },
        top: (c, s, b) => {
            const rnd = seeded(7);
            for (let i = 0; i < 9; i++) {
                const a = rnd() * Math.PI * 2;
                const { x, y } = onBand(s, b, a);
                flower(c, x, y, s * 0.028, ['#ffffff', '#ffd23a', '#ff8fb8', '#9fd8ff'][i % 4]);
            }
        },
    },
    sky: {
        inside: (c, s) => {
            vertical(c, s, '#5ab4ff', '#cdeaff');
            cloud(c, s * 0.22, s * 0.3, s * 0.08);
            cloud(c, s * 0.8, s * 0.22, s * 0.06);
        },
        band: (c, s) => {
            const g = c.createLinearGradient(0, 0, 0, s);
            g.addColorStop(0, '#9fdcff');
            g.addColorStop(1, '#3d8fe0');
            c.fillStyle = g;
            c.fill('evenodd');
        },
    },
    carrot: {
        inside: (c, s) => {
            vertical(c, s, '#fff1d6', '#ffd29a');
            c.save();
            c.globalAlpha = 0.18;
            c.fillStyle = '#ff8a1f';
            for (let i = -4; i < 10; i++) {
                c.beginPath();
                c.moveTo(i * s * 0.14, 0);
                c.lineTo(i * s * 0.14 + s * 0.07, 0);
                c.lineTo(i * s * 0.14 + s * 0.07 + s * 0.4, s);
                c.lineTo(i * s * 0.14 + s * 0.4, s);
                c.fill();
            }
            c.restore();
        },
        band: (c, s) => {
            c.fillStyle = '#f07a1a';
            c.fill('evenodd');
            c.save();
            c.clip('evenodd');
            c.strokeStyle = 'rgba(150,60,10,0.5)';
            c.lineWidth = s * 0.01;
            for (let i = 0; i < 12; i++) {
                c.beginPath();
                c.moveTo(0, i * s * 0.09);
                c.lineTo(s, i * s * 0.09 + s * 0.02);
                c.stroke();
            }
            c.restore();
        },
        top: (c, s) => {
            // leaves on top of the frame
            for (const [dx, a, col] of [[-0.06, -0.5, '#3f9a24'], [0, 0, '#5fb83a'], [0.06, 0.5, '#3f9a24']]) {
                c.save();
                c.translate(s * (0.5 + dx), s * 0.06);
                c.rotate(a);
                c.beginPath();
                c.ellipse(0, -s * 0.07, s * 0.035, s * 0.09, 0, 0, Math.PI * 2);
                c.fillStyle = col;
                c.fill();
                c.lineWidth = s * 0.012;
                c.strokeStyle = INK;
                c.stroke();
                c.restore();
            }
        },
    },
    snow: {
        inside: (c, s) => {
            vertical(c, s, '#d8f0ff', '#f6fbff');
            const rnd = seeded(11);
            c.fillStyle = 'rgba(255,255,255,0.9)';
            for (let i = 0; i < 30; i++) {
                c.beginPath();
                c.arc(rnd() * s, rnd() * s, s * (0.005 + rnd() * 0.01), 0, Math.PI * 2);
                c.fill();
            }
        },
        band: (c, s) => {
            const g = c.createLinearGradient(0, 0, s, s);
            g.addColorStop(0, '#ffffff');
            g.addColorStop(0.5, '#cfe9fb');
            g.addColorStop(1, '#9fd0f2');
            c.fillStyle = g;
            c.fill('evenodd');
        },
        top: (c, s, b) => {
            // icicles under the bottom edge
            c.fillStyle = '#e8f6ff';
            c.strokeStyle = INK;
            c.lineWidth = s * 0.01;
            for (let i = 0; i < 6; i++) {
                const x = s * (0.22 + i * 0.11);
                const len = s * (0.04 + ((i * 37) % 5) * 0.012);
                c.beginPath();
                c.moveTo(x - s * 0.02, s - b * 0.45);
                c.lineTo(x + s * 0.02, s - b * 0.45);
                c.lineTo(x, s - b * 0.45 + len);
                c.closePath();
                c.fill();
                c.stroke();
            }
        },
    },
    silver: {
        inside: (c, s) => radial(c, s, '#ffffff', '#c9d2dc'),
        band: (c, s) => metal(c, s, ['#f4f7fa', '#9aa7b4', '#e3e9ef', '#7e8a96']),
        top: (c, s, b) => rivets(c, s, b, '#e9eef3'),
    },
    fire: {
        inside: (c, s) => {
            const g = c.createRadialGradient(s / 2, s * 0.75, s * 0.05, s / 2, s * 0.6, s * 0.7);
            g.addColorStop(0, '#ffd34a');
            g.addColorStop(0.45, '#ff7a1a');
            g.addColorStop(1, '#7a1205');
            c.fillStyle = g;
            c.fillRect(0, 0, s, s);
        },
        band: (c, s) => {
            const g = c.createLinearGradient(0, s, 0, 0);
            g.addColorStop(0, '#ffcf3a');
            g.addColorStop(0.5, '#ff5a1a');
            g.addColorStop(1, '#a81808');
            c.fillStyle = g;
            c.fill('evenodd');
        },
        top: (c, s, b) => {
            // flames licking up the sides and over the top
            const rnd = seeded(5);
            for (let i = 0; i < 16; i++) {
                const a = (i / 16) * Math.PI * 2;
                const { x, y, nx, ny } = onBand(s, b, a);
                const h = s * (0.05 + rnd() * 0.06) * (ny < 0 ? 1.3 : 0.8);
                flame(c, x, y, nx, ny, h, s);
            }
        },
    },
    gold: {
        inside: (c, s) => radial(c, s, '#fff8d6', '#f3c95a'),
        band: (c, s) => metal(c, s, ['#fff2a8', '#d39a1c', '#ffe27a', '#a8700c']),
        top: (c, s, b) => {
            rivets(c, s, b, '#fff4b8');
            shine(c, s);
        },
    },
    galaxy: {
        inside: (c, s) => {
            const g = c.createRadialGradient(s * 0.4, s * 0.35, s * 0.05, s / 2, s / 2, s * 0.75);
            g.addColorStop(0, '#5a3ab8');
            g.addColorStop(0.6, '#24135e');
            g.addColorStop(1, '#0b0626');
            c.fillStyle = g;
            c.fillRect(0, 0, s, s);
            c.save();
            c.globalAlpha = 0.35;
            const n = c.createRadialGradient(s * 0.75, s * 0.7, 0, s * 0.75, s * 0.7, s * 0.4);
            n.addColorStop(0, '#ff5fd0');
            n.addColorStop(1, 'rgba(255,95,208,0)');
            c.fillStyle = n;
            c.fillRect(0, 0, s, s);
            c.restore();
            const rnd = seeded(23);
            for (let i = 0; i < 40; i++) {
                c.fillStyle = `rgba(255,255,255,${0.4 + rnd() * 0.6})`;
                c.beginPath();
                c.arc(rnd() * s, rnd() * s, s * (0.002 + rnd() * 0.005), 0, Math.PI * 2);
                c.fill();
            }
        },
        band: (c, s) => {
            const g = c.createLinearGradient(0, 0, s, s);
            g.addColorStop(0, '#3b2aa0');
            g.addColorStop(0.5, '#140b3a');
            g.addColorStop(1, '#6a2a9a');
            c.fillStyle = g;
            c.fill('evenodd');
        },
        top: (c, s, b) => {
            const rnd = seeded(29);
            for (let i = 0; i < 10; i++) {
                const { x, y } = onBand(s, b, rnd() * Math.PI * 2);
                star(c, x, y, s * (0.012 + rnd() * 0.014), ['#ffffff', '#fff3a8', '#9fe8ff', '#ffb3f0'][i % 4], 4);
            }
        },
    },
    legend: {
        inside: (c, s) => {
            radial(c, s, '#a46bff', '#3a1477');
            c.save();
            c.globalAlpha = 0.25;
            c.translate(s / 2, s / 2);
            for (let i = 0; i < 12; i++) {
                c.rotate(Math.PI / 6);
                c.fillStyle = '#ffe27a';
                c.beginPath();
                c.moveTo(0, 0);
                c.lineTo(-s * 0.06, -s * 0.8);
                c.lineTo(s * 0.06, -s * 0.8);
                c.fill();
            }
            c.restore();
        },
        band: (c, s) => metal(c, s, ['#fff2a8', '#d39a1c', '#ffe27a', '#a8700c']),
        top: (c, s, b) => {
            laurel(c, s, b);
            for (const [x, y, col] of [[b * 0.5, b * 0.5, '#e8243c'], [s - b * 0.5, b * 0.5, '#2f7cff'], [b * 0.5, s - b * 0.5, '#28c76f'], [s - b * 0.5, s - b * 0.5, '#b44bff']]) gem(c, x, y, b * 0.42, col);
            gem(c, s / 2, b * 0.5, b * 0.5, '#e8243c');
            shine(c, s);
        },
    },
};

function vertical(c, s, top, bottom) {
    const g = c.createLinearGradient(0, 0, 0, s);
    g.addColorStop(0, top);
    g.addColorStop(1, bottom);
    c.fillStyle = g;
    c.fillRect(0, 0, s, s);
}

function radial(c, s, inner, outer) {
    const g = c.createRadialGradient(s / 2, s * 0.42, s * 0.05, s / 2, s / 2, s * 0.72);
    g.addColorStop(0, inner);
    g.addColorStop(1, outer);
    c.fillStyle = g;
    c.fillRect(0, 0, s, s);
}

function metal(c, s, stops) {
    const g = c.createLinearGradient(0, 0, s, s);
    stops.forEach((col, i) => g.addColorStop(i / (stops.length - 1), col));
    c.fillStyle = g;
    c.fill('evenodd');
}

function rivets(c, s, b, color) {
    for (const [x, y] of [[b * 0.5, b * 0.5], [s - b * 0.5, b * 0.5], [b * 0.5, s - b * 0.5], [s - b * 0.5, s - b * 0.5]]) {
        c.beginPath();
        c.arc(x, y, b * 0.22, 0, Math.PI * 2);
        c.fillStyle = color;
        c.fill();
        c.lineWidth = s * 0.008;
        c.strokeStyle = INK;
        c.stroke();
    }
}

function shine(c, s) {
    c.save();
    c.globalAlpha = 0.35;
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.moveTo(s * 0.08, s * 0.35);
    c.lineTo(s * 0.35, s * 0.08);
    c.lineTo(s * 0.43, s * 0.08);
    c.lineTo(s * 0.08, s * 0.43);
    c.fill();
    c.restore();
}

function gem(c, x, y, r, color) {
    c.beginPath();
    c.moveTo(x, y - r);
    c.lineTo(x + r * 0.8, y);
    c.lineTo(x, y + r);
    c.lineTo(x - r * 0.8, y);
    c.closePath();
    c.fillStyle = color;
    c.fill();
    c.lineWidth = r * 0.25;
    c.strokeStyle = INK;
    c.stroke();
    c.beginPath();
    c.arc(x - r * 0.2, y - r * 0.3, r * 0.18, 0, Math.PI * 2);
    c.fillStyle = 'rgba(255,255,255,0.75)';
    c.fill();
}

function laurel(c, s, b) {
    // two branches of leaves along the bottom
    for (const side of [-1, 1]) {
        for (let i = 0; i < 6; i++) {
            const t = i / 5;
            const x = s / 2 + side * (s * 0.08 + t * s * 0.36);
            const y = s - b * 0.5 - Math.sin(t * Math.PI * 0.9) * s * 0.06;
            c.save();
            c.translate(x, y);
            c.rotate(side * (0.9 - t * 0.9));
            c.beginPath();
            c.ellipse(0, 0, s * 0.022, s * 0.045, 0, 0, Math.PI * 2);
            c.fillStyle = i % 2 ? '#7ccf52' : '#4f9e2f';
            c.fill();
            c.lineWidth = s * 0.008;
            c.strokeStyle = INK;
            c.stroke();
            c.restore();
        }
    }
}

function flower(c, x, y, r, color) {
    for (let p = 0; p < 5; p++) {
        const a = (p / 5) * Math.PI * 2;
        c.beginPath();
        c.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, r * 0.75, 0, Math.PI * 2);
        c.fillStyle = color;
        c.fill();
    }
    c.beginPath();
    c.arc(x, y, r * 0.6, 0, Math.PI * 2);
    c.fillStyle = '#ffb800';
    c.fill();
}

function cloud(c, x, y, r) {
    c.fillStyle = 'rgba(255,255,255,0.9)';
    for (const [dx, dy, rr] of [[0, 0, 1], [0.9, 0.2, 0.75], [-0.9, 0.25, 0.7], [0.3, -0.4, 0.7]]) {
        c.beginPath();
        c.arc(x + dx * r, y + dy * r, rr * r, 0, Math.PI * 2);
        c.fill();
    }
}

function flame(c, x, y, nx, ny, h, s) {
    // a flame pointing outwards and up
    const ux = nx * 0.5, uy = ny * 0.5 - 0.85;
    const len = Math.hypot(ux, uy);
    const dx = ux / len, dy = uy / len;
    const w = h * 0.45;
    for (const [k, col] of [[1, '#ff5a1a'], [0.6, '#ffd34a']]) {
        c.beginPath();
        c.moveTo(x - dy * w * k, y + dx * w * k);
        c.quadraticCurveTo(x + dx * h * 0.5 * k - dy * w * k, y + dy * h * 0.5 * k + dx * w * k, x + dx * h * k, y + dy * h * k);
        c.quadraticCurveTo(x + dx * h * 0.5 * k + dy * w * k, y + dy * h * 0.5 * k - dx * w * k, x + dy * w * k, y - dx * w * k);
        c.closePath();
        c.fillStyle = col;
        c.fill();
        if (k === 1) {
            c.lineWidth = s * 0.006;
            c.strokeStyle = 'rgba(90,10,0,0.6)';
            c.stroke();
        }
    }
}

/** A point in the middle of the band at angle a (0 = right, going down), with the outward normal. */
function onBand(s, b, a) {
    const half = s / 2 - b / 2;
    const cx = Math.cos(a), cy = Math.sin(a);
    const k = 1 / Math.max(Math.abs(cx), Math.abs(cy));
    return { x: s / 2 + cx * k * half, y: s / 2 + cy * k * half, nx: Math.abs(cx) > Math.abs(cy) ? Math.sign(cx) : 0, ny: Math.abs(cy) >= Math.abs(cx) ? Math.sign(cy) : 0 };
}

function drawFrame(c, s, look, shot) {
    const frame = FRAMES[look.frame] ?? FRAMES.wood;
    const b = s * 0.085; // band width
    const r = s * 0.2;
    const lw = s * 0.022;
    c.clearRect(0, 0, s, s);
    c.lineJoin = 'round';

    // the inside with the bunny (clipped to the rounded square)
    c.save();
    rounded(c, lw / 2, lw / 2, s - lw, s - lw, r);
    c.clip();
    frame.inside(c, s);
    // a soft glow in the team colour behind the bunny
    const glow = c.createRadialGradient(s / 2, s * 0.55, s * 0.05, s / 2, s * 0.55, s * 0.45);
    glow.addColorStop(0, hexA(look.color, 0.45));
    glow.addColorStop(1, hexA(look.color, 0));
    c.fillStyle = glow;
    c.fillRect(0, 0, s, s);
    c.drawImage(shot, 0, 0, s, s);
    c.restore();

    // the band: the area between the outer and the inner rounded square (even-odd path)
    c.save();
    c.beginPath();
    pathRounded(c, lw / 2, lw / 2, s - lw, s - lw, r);
    pathRounded(c, b, b, s - 2 * b, s - 2 * b, r * 0.62);
    frame.band(c, s, b);
    c.restore();

    // a thin line in the team colour inside the band
    c.lineWidth = s * 0.018;
    c.strokeStyle = look.color;
    rounded(c, b - s * 0.004, b - s * 0.004, s - 2 * b + s * 0.008, s - 2 * b + s * 0.008, r * 0.64);
    c.stroke();
    // outlines
    c.lineWidth = lw;
    c.strokeStyle = INK;
    rounded(c, lw / 2, lw / 2, s - lw, s - lw, r);
    c.stroke();
    c.lineWidth = lw * 0.6;
    rounded(c, b + lw * 0.3, b + lw * 0.3, s - 2 * b - lw * 0.6, s - 2 * b - lw * 0.6, r * 0.6);
    c.stroke();
    // a little shine on the band
    c.save();
    c.globalAlpha = 0.25;
    c.lineWidth = s * 0.012;
    c.strokeStyle = '#ffffff';
    c.beginPath();
    c.arc(r + lw, r + lw, r * 0.7, Math.PI * 1.05, Math.PI * 1.45);
    c.stroke();
    c.restore();
    frame.top?.(c, s, b);
}

function pathRounded(p, x, y, w, h, r) {
    p.moveTo(x + r, y);
    p.arcTo(x + w, y, x + w, y + h, r);
    p.arcTo(x + w, y + h, x, y + h, r);
    p.arcTo(x, y + h, x, y, r);
    p.arcTo(x, y, x + w, y, r);
    p.closePath();
}

function hexA(hex, alpha) {
    const c = new THREE.Color(hex);
    return `rgba(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)},${alpha})`;
}

// ---------------------------------------------------------------- the wardrobe preview

/** A small 3D bunny in a transparent canvas: turns slowly, cheers when it gets something new. One at a time is enough. */
export class BunnyPreview {
    constructor(container) {
        this.container = container;
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.setClearColor(0x000000, 0);
        const canvas = this.renderer.domElement;
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.display = 'block';
        container.appendChild(canvas);
        this.scene = studio(true);
        // a soft round shadow on the floor
        const floor = new THREE.Mesh(new THREE.CircleGeometry(0.55, 32), new THREE.MeshBasicMaterial({ color: 0x2a1a0e, transparent: true, opacity: 0.18, depthWrite: false }));
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = 0.005;
        this.scene.add(floor);
        this.floor = floor;
        this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 30);
        this.camera.position.set(0, 1.25, 4.1);
        this.camera.lookAt(0, 0.85, 0);
        this.bunny = null;
        this.look = null;
        this.turn = 0;
        this.backToIdle = 0;
        this.last = performance.now();
        this.resize();
        this.observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => this.resize()) : null;
        this.observer?.observe(container);
        // drag to turn the bunny
        this.drag = null;
        canvas.addEventListener('pointerdown', e => {
            this.drag = e.clientX;
            canvas.setPointerCapture(e.pointerId);
        });
        canvas.addEventListener('pointermove', e => {
            if (this.drag === null) return;
            this.turn += (e.clientX - this.drag) * 0.012;
            this.drag = e.clientX;
            this.spinPause = 2;
        });
        canvas.addEventListener('pointerup', () => (this.drag = null));
        this.frame = this.frame.bind(this);
        this.raf = requestAnimationFrame(this.frame);
    }

    resize() {
        const w = this.container.clientWidth || 240, h = this.container.clientHeight || 260;
        this.renderer.setSize(w, h, false);
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
    }

    setLook(look) {
        const l = lookOf(look);
        const changed = !this.look || ['fur', 'outfit', 'face', 'color'].some(k => this.look[k] !== l[k]);
        this.look = l;
        if (!this.bunny) {
            this.bunny = makeBunny(l, 0);
            this.bunny.lookIn = 1.5;
            this.bunny.fidgetIn = 3;
            this.scene.add(this.bunny.root);
        } else if (changed) {
            this.bunny.setLook(l);
        }
        if (changed) this.play('cheer');
    }

    play(name) {
        if (!this.bunny) return;
        this.bunny.play(name);
        if (name === 'cheer' || name === 'dance' || name === 'wave') this.backToIdle = name === 'cheer' ? 1.5 : 3;
    }

    frame(now) {
        this.raf = requestAnimationFrame(this.frame);
        const dt = Math.min(0.05, (now - this.last) / 1000);
        this.last = now;
        const b = this.bunny;
        if (b) {
            if (this.backToIdle > 0) {
                this.backToIdle -= dt;
                if (this.backToIdle <= 0) b.play('idle');
            }
            if (this.spinPause > 0) this.spinPause -= dt;
            else this.turn += dt * 0.45;
            // turns slowly, but faces the front more often than the back
            b.yaw = b.goalYaw = Math.sin(this.turn) * 0.8;
            b.update(dt, now / 1000);
        }
        this.renderer.render(this.scene, this.camera);
    }

    dispose() {
        cancelAnimationFrame(this.raf);
        this.observer?.disconnect();
        this.bunny?.dispose();
        this.bunny = null;
        this.floor.geometry.dispose();
        this.floor.material.dispose();
        this.renderer.dispose();
        this.renderer.forceContextLoss?.();
        this.renderer.domElement.remove();
    }
}
