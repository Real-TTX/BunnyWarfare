// The furs of the bunnies (keys from Business/Cosmetics.cs): a palette for the vertex colours of every part and, for the wild ones,
// a small shader patch on the fur material (patterns in the space of each part, glow, metal). The fur material stays one per bunny
// (soot and the red flash of a hit change it), the programs are shared per fur (customProgramCacheKey).
import * as THREE from 'three';

// fur = most of the fur, shade = under the body and the tips, belly = belly/muzzle/paws, inner = inside of the ears, brow = eyebrows
const PALETTES = {
    snow: { fur: '#f4efe7', shade: '#d8cdbf', belly: '#fffaf3', inner: '#f5a9b8', brow: '#7a6656' },
    caramel: { fur: '#d9a46c', shade: '#b07a46', belly: '#f8e6cc', inner: '#f2a0a8', brow: '#5a3518' },
    grey: { fur: '#b3aca6', shade: '#8a827c', belly: '#ebe6e1', inner: '#eea2b1', brow: '#46403b' },
    cream: { fur: '#efdfc0', shade: '#cdb48a', belly: '#fffaf0', inner: '#f5aab4', brow: '#6f5532' },
    brown: { fur: '#9a7253', shade: '#6f4f37', belly: '#e2cbb0', inner: '#e79aa4', brow: '#3a2516' },
    dark: { fur: '#6b6460', shade: '#4a4441', belly: '#b9b1aa', inner: '#e3909e', brow: '#231d1a' },
    ginger: { fur: '#e57d36', shade: '#b8561f', belly: '#fde6cf', inner: '#f2a0a8', brow: '#6a2a10' },
    black: { fur: '#34313a', shade: '#211f25', belly: '#6a6470', inner: '#e0849a', brow: '#0d0c0e' },
    spotted: { fur: '#f6f1ea', shade: '#dcd2c6', belly: '#fffaf3', inner: '#f5a9b8', brow: '#4a3020', pattern: 'spots', ink: '#6b4630' },
    pink: { fur: '#ff9fd0', shade: '#e868aa', belly: '#ffe4f2', inner: '#ff4f97', brow: '#a0306a' },
    mint: { fur: '#90f0d0', shade: '#4fc7a4', belly: '#e6fff6', inner: '#ff9fc0', brow: '#1f7a62' },
    tiger: { fur: '#f28a22', shade: '#c66310', belly: '#fff3e0', inner: '#f7a3a3', brow: '#231610', pattern: 'tiger', ink: '#221510' },
    zebra: { fur: '#f7f7f2', shade: '#dadad2', belly: '#ffffff', inner: '#f3a6b6', brow: '#141414', pattern: 'zebra', ink: '#151515' },
    neon: { fur: '#86ff3e', shade: '#40d81c', belly: '#e8ffcf', inner: '#ff4fd8', brow: '#1d6a00', glow: '#3cff00', glowStrength: 0.42 },
    lava: { fur: '#2c1f1b', shade: '#170f0c', belly: '#463029', inner: '#ff6a1a', brow: '#000000', pattern: 'lava', ink: '#ff5a10' },
    galaxy: { fur: '#241a5a', shade: '#120c33', belly: '#45348c', inner: '#ff7ad9', brow: '#05030f', pattern: 'galaxy', ink: '#ff5fd0' },
    gold: { fur: '#f6c441', shade: '#c9901a', belly: '#ffe68f', inner: '#ffb0a0', brow: '#7a4d00', pattern: 'gold', metal: true },
    rainbow: { fur: '#ffffff', shade: '#e4e4e4', belly: '#ffffff', inner: '#ffb3c7', brow: '#5a4a5a', pattern: 'rainbow' },
};

/** The old furs (by bunny id) for teams without a chosen fur. */
export const CLASSIC_FURS = ['snow', 'caramel', 'grey', 'cream', 'brown', 'dark'];

/** The palette of a fur key (unknown keys: snow white). The object carries its key. */
export function furOf(key) {
    const k = PALETTES[key] ? key : 'snow';
    const p = PALETTES[k];
    if (!p.key) p.key = k;
    return p;
}

/** The time of the moving patterns (one uniform for every bunny); call tickFurs(seconds) once per frame. */
const time = { value: 0 };
export function tickFurs(seconds) {
    time.value = seconds;
}

const NOISE = /* glsl */ `
float bwFurHash(vec3 p) {
    p = fract(p * 0.3183099 + 0.1);
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float bwFurNoise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(bwFurHash(i + vec3(0, 0, 0)), bwFurHash(i + vec3(1, 0, 0)), f.x),
                   mix(bwFurHash(i + vec3(0, 1, 0)), bwFurHash(i + vec3(1, 1, 0)), f.x), f.y),
               mix(mix(bwFurHash(i + vec3(0, 0, 1)), bwFurHash(i + vec3(1, 0, 1)), f.x),
                   mix(bwFurHash(i + vec3(0, 1, 1)), bwFurHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
vec3 bwFurHue(float h) {
    vec3 k = clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0);
    return k * k * (3.0 - 2.0 * k);
}
`;

// per pattern: what happens to the colour (diffuseColor.rgb) and to the light it gives (totalEmissiveRadiance); mask = how much this is fur (not belly, ears, teeth)
const PATTERNS = {
    spots: {
        color: `float n = bwFurNoise(p * 7.0 + 3.1) * 0.7 + bwFurNoise(p * 15.0) * 0.3;
                diffuseColor.rgb = mix(diffuseColor.rgb, uInk * diffuse, smoothstep(0.6, 0.64, n) * mask);`,
    },
    tiger: {
        color: `float s = sin(p.y * 46.0 + p.x * 9.0 + bwFurNoise(p * 6.0) * 5.0);
                diffuseColor.rgb = mix(diffuseColor.rgb, uInk * diffuse, smoothstep(0.55, 0.72, s) * mask);`,
    },
    zebra: {
        color: `float s = sin(p.y * 34.0 + p.z * 6.0 + bwFurNoise(p * 4.0) * 4.0);
                diffuseColor.rgb = mix(diffuseColor.rgb, uInk * diffuse, smoothstep(0.05, 0.2, s) * mask);`,
    },
    lava: {
        color: `float n = bwFurNoise(p * 8.0);
                float crack = 1.0 - smoothstep(0.0, 0.055, abs(n - 0.5));
                diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.35, 0.05) * diffuse, crack * mask * 0.8);
                bwGlow = uInk * crack * mask * (1.1 + 0.6 * sin(uFurTime * 3.0 + p.y * 9.0));`,
    },
    galaxy: {
        color: `float n = bwFurNoise(p * 4.0 + uFurTime * 0.05);
                vec3 nebula = mix(vec3(0.14, 0.05, 0.42), vec3(0.75, 0.18, 0.65), smoothstep(0.45, 0.85, n));
                nebula = mix(nebula, vec3(0.1, 0.45, 0.85), smoothstep(0.55, 0.9, bwFurNoise(p * 6.0 + 7.0)) * 0.6);
                diffuseColor.rgb = mix(diffuseColor.rgb, nebula * diffuse, mask * 0.85);
                vec3 cell = floor(p * 48.0);
                float h = bwFurHash(cell);
                float twinkle = 0.5 + 0.5 * sin(uFurTime * 4.0 + h * 40.0);
                vec3 q = fract(p * 48.0) - 0.5;
                float star = step(0.93, h) * smoothstep(0.32, 0.0, length(q)) * twinkle;
                bwGlow = (vec3(1.0, 0.95, 1.0) * star * 2.2 + nebula * 0.18) * mask;`,
    },
    gold: {
        color: `vec3 cell = floor(p * 36.0);
                float h = bwFurHash(cell);
                vec3 q = fract(p * 36.0) - 0.5;
                float glint = step(0.95, h) * smoothstep(0.3, 0.0, length(q)) * pow(0.5 + 0.5 * sin(uFurTime * 3.0 + h * 50.0), 6.0);
                bwGlow = (vec3(1.0, 0.92, 0.6) * glint * 2.5 + vec3(0.16, 0.1, 0.0)) * mask;`,
    },
    rainbow: {
        color: `float hue = fract(p.y * 1.3 + p.x * 0.5 + p.z * 0.3 - uFurTime * 0.12);
                float shade = dot(vColor.rgb, vec3(0.333));
                diffuseColor.rgb = mix(diffuseColor.rgb, mix(bwFurHue(hue), vec3(1.0), 0.18) * shade * diffuse, mask);`,
    },
};

/** Settings and the shader patch of the fur on a material (MeshStandardMaterial with vertex colours). */
export function dressFur(material, fur) {
    material.metalness = fur.metal ? 0.55 : 0;
    material.roughness = fur.metal ? 0.3 : fur.key === 'neon' ? 0.6 : 0.92;
    const pattern = PATTERNS[fur.pattern];
    const glow = fur.glow ? new THREE.Color(fur.glow).multiplyScalar(fur.glowStrength ?? 0.3) : null;
    if (!pattern && !glow) return material;
    const uniforms = {
        uFurTime: time,
        uInk: { value: new THREE.Color(fur.ink ?? '#000000') },
        uFurA: { value: new THREE.Color(fur.fur) },
        uFurB: { value: new THREE.Color(fur.shade) },
        uBaseGlow: { value: glow ?? new THREE.Color(0, 0, 0) },
    };
    material.onBeforeCompile = shader => {
        Object.assign(shader.uniforms, uniforms);
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', '#include <common>\nvarying vec3 vFurPos;')
            .replace('#include <begin_vertex>', '#include <begin_vertex>\nvFurPos = position;');
        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', `#include <common>\nvarying vec3 vFurPos;\nuniform float uFurTime;\nuniform vec3 uInk;\nuniform vec3 uFurA;\nuniform vec3 uFurB;\nuniform vec3 uBaseGlow;\n${NOISE}`)
            .replace('#include <color_fragment>', `#include <color_fragment>
                vec3 bwGlow = vec3(0.0);
                {
                    vec3 p = vFurPos;
                    // only the fur itself (its two tones), not the belly, the ears inside, the teeth
                    float mask = 1.0 - smoothstep(0.03, 0.12, min(distance(vColor.rgb, uFurA), distance(vColor.rgb, uFurB)));
                    bwGlow += uBaseGlow * mask;
                    ${pattern?.color ?? ''}
                }`)
            .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += bwGlow;');
    };
    material.customProgramCacheKey = () => `bw-fur-${fur.key}`;
    material.needsUpdate = true;
    return material;
}
