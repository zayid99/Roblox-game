import {
  BackSide,
  CanvasTexture,
  Color,
  DataTexture,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshToonMaterial,
  NearestFilter,
  RedFormat,
  SRGBColorSpace,
  type WebGLProgramParametersWithUniforms,
} from 'three';
import { MUTATIONS } from '../game/creatures';

/** Our ink colour (spec §1): outlines, faces, text strokes. */
export const INK = '#1B1736';

/** The one material almost everything static uses: flat-lit vertex colors. */
export const vertexMaterial = new MeshLambertMaterial({ vertexColors: true });

/** 3-texel toon ramp [.6, .85, 1] with nearest filtering (G12). */
export const toonGradient = (() => {
  const t = new DataTexture(new Uint8Array([153, 217, 255]), 3, 1, RedFormat);
  t.minFilter = NearestFilter;
  t.magFilter = NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
})();

/** Vertex-coloured toon material for characters, props that should pop, and gameplay objects. */
export const toonVertexMaterial = new MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient });

/** Ink outline hull material (render the grown hull with BackSide). */
export const inkMaterial = new MeshBasicMaterial({ color: INK, side: BackSide });

/** Shared time uniform for every animated shader in the render module. */
export const sharedTime = { value: 0 };

// ---------- Islands: Lambert + G7 edge lines + grass checker ----------

/** Terrain material. With `edgeLines` the geometry must carry the `aFace` attribute (BoxBuilder `faces: true`). */
export function islandMaterial(edgeLines: boolean): MeshLambertMaterial {
  const m = new MeshLambertMaterial({ vertexColors: true });
  if (edgeLines) m.defines = { EDGE_LINES: '' };
  m.onBeforeCompile = (s: WebGLProgramParametersWithUniforms) => {
    s.vertexShader = s.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        #ifdef EDGE_LINES
        attribute vec4 aFace;
        varying vec4 vFace;
        #endif
        varying vec3 vIslW;
        varying float vIslUp;`,
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        #ifdef EDGE_LINES
        vFace = aFace;
        #endif
        vIslW = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vIslUp = normalize(mat3(modelMatrix) * objectNormal).y;`,
      );
    s.fragmentShader = s.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        #ifdef EDGE_LINES
        varying vec4 vFace;
        #endif
        varying vec3 vIslW;
        varying float vIslUp;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        #ifdef EDGE_LINES
        {
          vec2 f = vFace.xy;
          float d = min(min(f.x, vFace.z - f.x), min(f.y, vFace.w - f.y));
          float line = 1.0 - smoothstep(0.0, fwidth(d) * 1.5, d - 0.03);
          diffuseColor.rgb *= 1.0 - 0.25 * line;
        }
        #endif
        if (vIslUp > 0.9) {
          float c = mod(floor(vIslW.x * 0.5) + floor(vIslW.z * 0.5), 2.0);
          diffuseColor.rgb *= 1.0 + (c - 0.5) * 0.07;
        }`,
      );
  };
  return m;
}

// ---------- Creatures: toon + vertex blink + mutation looks ----------

function goldMatcap(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(24, 20, 2, 32, 32, 34);
  grad.addColorStop(0, '#FFF8C8');
  grad.addColorStop(0.35, '#FFD55A');
  grad.addColorStop(0.75, '#E59A1C');
  grad.addColorStop(1, '#8C5410');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

let matcap: CanvasTexture | null = null;

export interface CreatureMaterial extends MeshToonMaterial {
  userData: { blink: { value: number }; flash: { value: number } };
}

/**
 * A creature material with its own blink and flash uniforms (vertex-shader blink, spec §5.2: no extra
 * draw calls). All clones share one compiled program per mutation.
 */
export function creatureMaterial(mutation: number): CreatureMaterial {
  matcap ??= typeof document !== 'undefined' ? goldMatcap() : null;
  const m = new MeshToonMaterial({ vertexColors: true, gradientMap: toonGradient }) as CreatureMaterial;
  m.defines = { MUT: String(Math.max(0, Math.min(3, mutation))) };
  const blink = { value: 0 };
  const flash = { value: 0 };
  m.userData = { blink, flash };
  m.onBeforeCompile = (s: WebGLProgramParametersWithUniforms) => {
    s.uniforms.uBlink = blink;
    s.uniforms.uFlash = flash;
    s.uniforms.uTime = sharedTime;
    s.uniforms.uMatcap = { value: matcap };
    s.vertexShader = s.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute vec2 aEye;
        uniform float uBlink;
        varying float vMutY;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        if (aEye.x > 0.5) transformed.y = aEye.y + (transformed.y - aEye.y) * (1.0 - 0.9 * uBlink);`,
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vMutY = (modelMatrix * vec4(transformed, 1.0)).y;`,
      );
    s.fragmentShader = s.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uFlash;
        uniform float uTime;
        uniform sampler2D uMatcap;
        varying float vMutY;
        vec3 mutHue(float h) { return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        #if MUT == 1
          { vec3 vn = normalize(vNormal); diffuseColor.rgb *= texture2D(uMatcap, vn.xy * 0.5 + 0.5).rgb * 1.55; }
        #elif MUT == 2
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.78, 0.96, 1.0), 0.4);
        #elif MUT == 3
          diffuseColor.rgb = mix(diffuseColor.rgb, mutHue(fract(vMutY * 0.45 - uTime * 0.35)), 0.55);
        #endif`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        #if MUT == 2
          { float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vViewPosition))), 2.5);
            totalEmissiveRadiance += vec3(0.35, 0.9, 1.0) * rim * 1.3; }
        #elif MUT == 3
          totalEmissiveRadiance += mutHue(fract(vMutY * 0.45 - uTime * 0.35)) * 0.18;
        #endif
        totalEmissiveRadiance += vec3(uFlash);`,
      );
  };
  return m;
}

// ---------- Legacy (v0.1 Game.ts) ----------

/** Creature materials by mutation (kept for v0.1 callers; new code uses `creatureMaterial`). */
export const mutationMaterials: MeshLambertMaterial[] = [
  vertexMaterial,
  new MeshLambertMaterial({ vertexColors: true, color: '#ffd84a', emissive: new Color('#ff9d00'), emissiveIntensity: 0.35 }),
  new MeshLambertMaterial({ vertexColors: true, color: '#c8f7ff', emissive: new Color('#38d9ff'), emissiveIntensity: 0.4 }),
  new MeshLambertMaterial({ vertexColors: true, color: '#ffffff', emissive: new Color(MUTATIONS[3].color), emissiveIntensity: 0.45 }),
];

const rainbow = new Color();

export function updateAnimatedMaterials(time: number): void {
  sharedTime.value = time;
  rainbow.setHSL((time * 0.25) % 1, 1, 0.55);
  mutationMaterials[3].emissive.copy(rainbow);
  mutationMaterials[3].color.setHSL((time * 0.25 + 0.5) % 1, 0.6, 0.85);
}
