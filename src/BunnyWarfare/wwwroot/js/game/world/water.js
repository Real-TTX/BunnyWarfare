// The sea: animated waves, colour by depth (shallow turquoise to deep blue, from a height texture of the island), moving foam at the coast,
// sun glint and a fresnel sky reflection. The moon has no sea but a faint violet haze at the "water level" (below it is the void).
import * as THREE from 'three';
import { GLSL_NOISE } from './util.js';

const STYLES = {
    Meadow: { shallow: '#5fd6c8', deep: '#1f6fa6', far: '#2b7cb5', foam: '#ffffff', sky: '#bfe4fb', opacity: 0.86 },
    Snow: { shallow: '#7fb9c9', deep: '#24526f', far: '#33607c', foam: '#f2fbff', sky: '#dfecf6', opacity: 0.9 },
    Desert: { shallow: '#5ef0dc', deep: '#1a8aa5', far: '#2894ae', foam: '#ffffff', sky: '#f6e3bb', opacity: 0.84 },
    Autumn: { shallow: '#6ac2b4', deep: '#245e7a', far: '#336a86', foam: '#fff6e6', sky: '#f2d8b0', opacity: 0.88 },
    Jungle: { shallow: '#4fd8a8', deep: '#14685e', far: '#1f7a70', foam: '#f2fff8', sky: '#cfeedd', opacity: 0.86 },
};

/**
 * Lava: crust plates drifting on glowing rivers, bright cracks, popping bubbles (unlit, it is its own light). For the sea of the volcano
 * (mesh at the level of the sea) and the pool in the caldera (pool = true: a little brighter, faster).
 */
export function lavaMaterial(uniforms, pool = false) {
    return new THREE.ShaderMaterial({
        uniforms: { ...THREE.UniformsUtils.merge([THREE.UniformsLib.fog]), uTime: uniforms.uTime, uPool: { value: pool ? 1 : 0 } },
        fog: true,
        vertexShader: /* glsl */ `
            #include <common>
            #include <fog_pars_vertex>
            uniform float uTime;
            varying vec3 vW;
            void main() {
                vec4 world = modelMatrix * vec4(position, 1.0);
                world.y += sin(world.x * 0.4 + uTime * 0.6) * 0.04 + sin(world.z * 0.33 - uTime * 0.45) * 0.04;
                vW = world.xyz;
                vec4 mvPosition = viewMatrix * world;
                gl_Position = projectionMatrix * mvPosition;
                #include <fog_vertex>
            }`,
        fragmentShader: /* glsl */ `
            #include <common>
            #include <fog_pars_fragment>
            uniform float uTime;
            uniform float uPool;
            varying vec3 vW;
            ${GLSL_NOISE}
            void main() {
                vec2 p = vW.xz;
                float t = uTime * (1.0 + uPool);
                vec2 flow = vec2(t * 0.05, t * 0.03);
                float warp = bwFbm(p * 0.09 + flow * 0.5);
                // big slow rivers of molten rock between dark crust; the crust breaks into plates of different sizes
                float river = smoothstep(0.42, 0.62, bwFbm(p * 0.05 + warp * 1.2 - flow * 0.6));
                vec3 v = bwVoronoi(p * (0.35 + 0.25 * warp) + flow + warp * 2.4);
                float crack = smoothstep(0.07 + 0.08 * river, 0.0, v.y - v.x);
                float heat = bwFbm(p * 0.21 - flow * 2.0);
                vec3 crust = mix(vec3(0.05, 0.022, 0.02), vec3(0.16, 0.05, 0.03), heat) * (0.7 + 0.6 * v.z);
                vec3 hot = mix(vec3(1.4, 0.36, 0.05), vec3(1.7, 0.95, 0.3), smoothstep(0.45, 0.95, heat));
                float glow = max(crack * (0.35 + 0.5 * river), river * smoothstep(0.45, 0.85, heat) * 0.85) * (0.82 + 0.18 * sin(t * 2.2 + heat * 11.0));
                glow = max(glow, uPool * 0.45);
                vec3 col = mix(crust, hot, glow);
                vec3 b = bwVoronoi(p * 1.8 + vec2(0.0, t * 0.15));
                float pop = smoothstep(0.12, 0.04, b.x) * step(0.96, fract(b.z * 13.0 + t * 0.25)) * river;
                col = mix(col, vec3(1.9, 1.3, 0.55), pop);
                gl_FragColor = vec4(col, 1.0);
                #include <tonemapping_fragment>
                #include <colorspace_fragment>
                #include <fog_fragment>
            }`,
    });
}

/** The falling water of the jungle's waterfall: streaks rushing down, foam at the foot. */
export function waterfallMaterial(uniforms) {
    return new THREE.ShaderMaterial({
        uniforms: { uTime: uniforms.uTime },
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: /* glsl */ `
            uniform float uTime;
            varying vec2 vUv;
            ${GLSL_NOISE}
            void main() {
                float streak = bwNoise(vec2(vUv.x * 9.0, vUv.y * 3.0 + uTime * 2.6)) * 0.6 + bwNoise(vec2(vUv.x * 23.0, vUv.y * 7.0 + uTime * 4.1)) * 0.4;
                vec3 col = mix(vec3(0.45, 0.78, 0.86), vec3(1.0), smoothstep(0.45, 0.85, streak));
                float foam = smoothstep(0.18, 0.0, vUv.y);
                col = mix(col, vec3(1.0), foam);
                float edge = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
                gl_FragColor = vec4(col, (0.62 + 0.3 * streak + foam * 0.3) * edge);
                #include <colorspace_fragment>
            }`,
    });
}

/** A height texture of the map (half floats, linear filtering) for the depth of the water; update() after a crater. */
class HeightTexture {
    constructor(data) {
        this.data = data;
        const s = data.size;
        this.array = new Uint16Array(s * s);
        this.texture = new THREE.DataTexture(this.array, s, s, THREE.RedFormat, THREE.HalfFloatType);
        this.texture.minFilter = THREE.LinearFilter;
        this.texture.magFilter = THREE.LinearFilter;
        this.texture.wrapS = this.texture.wrapT = THREE.ClampToEdgeWrapping;
        this.update(0, s - 1, 0, s - 1);
    }

    update(minX, maxX, minZ, maxZ) {
        const s = this.data.size, h = this.data.heights;
        for (let iz = Math.max(0, minZ); iz <= Math.min(s - 1, maxZ); iz++) {
            for (let ix = Math.max(0, minX); ix <= Math.min(s - 1, maxX); ix++) {
                this.array[iz * s + ix] = THREE.DataUtils.toHalfFloat(h[iz * s + ix]);
            }
        }
        this.texture.needsUpdate = true;
    }

    dispose() {
        this.texture.dispose();
    }
}

/** A flat disc (y = 0) of concentric rings whose spacing grows outwards. */
function ringDisc(cx, cz, radius, segments) {
    const radii = [0];
    let r = 0, step = 0.7;
    while (r < radius) {
        r += step;
        step *= 1.045;
        radii.push(Math.min(r, radius));
    }
    const positions = [cx, 0, cz];
    for (let i = 1; i < radii.length; i++) {
        for (let k = 0; k < segments; k++) {
            const a = (k / segments) * Math.PI * 2;
            positions.push(cx + Math.cos(a) * radii[i], 0, cz + Math.sin(a) * radii[i]);
        }
    }
    const index = [];
    const at = (ring, k) => 1 + (ring - 1) * segments + (k % segments);
    for (let k = 0; k < segments; k++) index.push(0, at(1, k + 1), at(1, k));
    for (let ring = 1; ring < radii.length - 1; ring++) {
        for (let k = 0; k < segments; k++) {
            const a = at(ring, k), b = at(ring, k + 1), c = at(ring + 1, k), d = at(ring + 1, k + 1);
            index.push(a, b, c, b, d, c);
        }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    g.setIndex(index);
    g.computeBoundingSphere();
    return g;
}

export class Water {
    /** sun: direction towards the sun (normalised). */
    constructor(data, theme, uniforms, sunDirection, reach) {
        this.data = data;
        this.theme = theme;
        this.group = new THREE.Group();
        const W = data.width;
        if (theme === 'Volcano') {
            // the sea of the volcano is lava: same level, same rule (falling in ends a bunny), its own glow
            this.heights = null;
            const lava = new THREE.Mesh(ringDisc(W / 2, W / 2, reach * 2.3, 128), lavaMaterial(uniforms));
            lava.position.y = data.waterLevel;
            lava.name = 'lava';
            lava.renderOrder = 2;
            lava.frustumCulled = false;
            this.mesh = lava;
            this.group.add(lava);
            // the glow of the lava lights the island from below
            const light = new THREE.HemisphereLight(0x3a2a40, 0xff5a1a, 0.55);
            this.group.add(light);
            return;
        }
        if (theme === 'Moon') {
            this.heights = null;
            // the void below the island: a glowing violet mist at the level where bunnies are lost, thicker away from the island
            const haze = new THREE.Mesh(
                ringDisc(W / 2, W / 2, reach * 2.3, 96),
                new THREE.ShaderMaterial({
                    transparent: true, depthWrite: false, fog: false,
                    uniforms: { uTime: uniforms.uTime, uCenter: { value: new THREE.Vector2(W / 2, W / 2) }, uWidth: { value: W } },
                    vertexShader: 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
                    fragmentShader: `uniform float uTime; uniform vec2 uCenter; uniform float uWidth; varying vec3 vW; ${GLSL_NOISE}
                        void main(){ float d = length(vW.xz - uCenter) / uWidth; float n = bwFbm(vW.xz * 0.05 + uTime * 0.03);
                        float a = (0.1 + 0.16 * n) * smoothstep(0.3, 0.75, d) * (1.0 - smoothstep(2.0, 4.5, d));
                        gl_FragColor = vec4(mix(vec3(0.16, 0.09, 0.3), vec3(0.42, 0.28, 0.75), n), a); }`,
                }));
            haze.position.y = data.waterLevel - 3.5;
            haze.renderOrder = 2;
            this.mesh = haze;
            this.group.add(haze);
            return;
        }
        const style = STYLES[theme] ?? STYLES.Meadow;
        this.heights = new HeightTexture(data);
        // a disc of rings around the island, fine in the middle and coarse far out, that reaches the sky (the fog hides its rim)
        const geometry = ringDisc(W / 2, W / 2, reach * 2.3, 128);

        this.uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog]);
        Object.assign(this.uniforms, {
            uTime: uniforms.uTime,
            uWind: uniforms.uWind,
            uLevel: { value: data.waterLevel },
            uHeights: { value: this.heights.texture },
            uMapWidth: { value: W },
            uSun: { value: sunDirection.clone().normalize() },
            uShallow: { value: new THREE.Color(style.shallow) },
            uDeep: { value: new THREE.Color(style.deep) },
            uFar: { value: new THREE.Color(style.far) },
            uFoam: { value: new THREE.Color(style.foam) },
            uSky: { value: new THREE.Color(style.sky) },
            uOpacity: { value: style.opacity },
        });
        const material = new THREE.ShaderMaterial({
            uniforms: this.uniforms,
            transparent: true,
            depthWrite: false,
            fog: true,
            vertexShader: /* glsl */ `
                #include <common>
                #include <fog_pars_vertex>
                uniform float uTime;
                uniform vec2 uWind;
                uniform float uLevel;
                varying vec3 vWorld;
                varying vec3 vNormalW;
                vec3 wave(vec2 p, vec2 dir, float freq, float amp, float speed, inout vec3 n) {
                    float ph = dot(p, dir) * freq + uTime * speed;
                    float s = sin(ph), c = cos(ph);
                    n.xz -= dir * (amp * freq * c);
                    return vec3(0.0, amp * s, 0.0);
                }
                void main() {
                    vec4 world = modelMatrix * vec4(position, 1.0);
                    vec3 n = vec3(0.0, 1.0, 0.0);
                    float storm = 0.6 + length(uWind) * 0.12;
                    vec3 d = vec3(0.0);
                    d += wave(world.xz, normalize(vec2(0.8, 0.6)), 0.35, 0.07 * storm, 1.2, n);
                    d += wave(world.xz, normalize(vec2(-0.5, 0.85)), 0.62, 0.04 * storm, 1.9, n);
                    d += wave(world.xz, normalize(vec2(0.2, -1.0)), 1.15, 0.02 * storm, 2.7, n);
                    world.xyz += d;
                    world.y = uLevel + d.y;
                    vWorld = world.xyz;
                    vNormalW = normalize(n);
                    vec4 mvPosition = viewMatrix * world;
                    gl_Position = projectionMatrix * mvPosition;
                    #include <fog_vertex>
                }`,
            fragmentShader: /* glsl */ `
                #include <common>
                #include <fog_pars_fragment>
                uniform float uTime;
                uniform float uLevel;
                uniform sampler2D uHeights;
                uniform float uMapWidth;
                uniform vec3 uSun;
                uniform vec3 uShallow, uDeep, uFar, uFoam, uSky;
                uniform float uOpacity;
                varying vec3 vWorld;
                varying vec3 vNormalW;
                ${GLSL_NOISE}
                float groundAt(vec2 p) {
                    vec2 uv = p / uMapWidth;
                    if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) {
                        // outside the map: the sea floor sinks away from the border
                        vec2 q = clamp(uv, 0.0, 1.0);
                        float edge = texture2D(uHeights, q).r;
                        float out_ = length((uv - q) * uMapWidth);
                        return mix(edge, uLevel - 5.5, smoothstep(0.0, 22.0, out_));
                    }
                    return texture2D(uHeights, uv).r;
                }
                void main() {
                    float depth = uLevel - groundAt(vWorld.xz);
                    vec3 n = normalize(vNormalW + vec3(bwNoise(vWorld.xz * 1.7 + uTime * 0.6) - 0.5, 0.0, bwNoise(vWorld.zx * 1.9 - uTime * 0.5) - 0.5) * 0.16);
                    vec3 view = normalize(cameraPosition - vWorld);
                    float distance = length(cameraPosition.xz - vWorld.xz);

                    vec3 col = mix(uShallow, uDeep, smoothstep(0.0, 3.2, depth));
                    col = mix(col, uFar, smoothstep(uMapWidth * 0.8, uMapWidth * 2.5, distance) * 0.6);
                    // caustics-like light ripples in the shallows
                    float ripple = bwNoise(vWorld.xz * 2.2 + vec2(uTime * 0.35, uTime * 0.21)) * bwNoise(vWorld.xz * 2.9 - vec2(uTime * 0.28, 0.0));
                    col += vec3(0.55, 0.75, 0.7) * smoothstep(0.35, 0.6, ripple) * (1.0 - smoothstep(0.2, 2.0, depth)) * 0.35;

                    // fresnel towards the sky, sun glint
                    float fresnel = pow(1.0 - max(dot(n, view), 0.0), 4.0);
                    col = mix(col, uSky, fresnel * 0.55);
                    vec3 h = normalize(uSun + view);
                    float spec = pow(max(dot(n, h), 0.0), 180.0);
                    col += vec3(1.0, 0.95, 0.8) * spec * 1.6;

                    // foam: a bright rim at the coast and bands that roll towards it
                    float wobble = bwNoise(vWorld.xz * 0.9 + uTime * 0.2);
                    float rim = 1.0 - smoothstep(0.0, 0.16 + wobble * 0.12, depth);
                    float bands = smoothstep(0.86, 0.97, fract(depth * 3.0 - uTime * 0.32 + wobble * 0.6)) * (1.0 - smoothstep(0.05, 0.45, depth));
                    float breakup = smoothstep(0.45, 0.75, bwNoise(vWorld.xz * 4.5 + uTime * 0.4));
                    float foam = max(rim, bands * breakup * 0.7);
                    col = mix(col, uFoam, foam * 0.9);

                    float alpha = mix(0.38, uOpacity, smoothstep(0.0, 2.2, depth));
                    alpha = max(alpha, foam * 0.95);
                    alpha = mix(alpha, 1.0, smoothstep(uMapWidth, uMapWidth * 2.0, distance));
                    // the water ends softly at the coast
                    alpha *= smoothstep(-0.05, 0.03, depth + foam * 0.05);
                    gl_FragColor = vec4(col, alpha);
                    #include <tonemapping_fragment>
                    #include <colorspace_fragment>
                    #include <fog_fragment>
                }`,
        });
        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.name = 'water';
        this.mesh.renderOrder = 2;
        this.mesh.frustumCulled = false;
        this.group.add(this.mesh);
    }

    /** After a crater: the depth changes where the ground was dug. */
    crater(region) {
        this.heights?.update(region.minX - 1, region.maxX + 1, region.minZ - 1, region.maxZ + 1);
    }

    dispose() {
        this.heights?.dispose();
        this.mesh.geometry.dispose();
        this.mesh.material.dispose();
    }
}
