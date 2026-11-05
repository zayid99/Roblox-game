import { BufferGeometry, Color, Float32BufferAttribute, Mesh, ShaderMaterial, UniformsLib, UniformsUtils, Uint32BufferAttribute, Vector3 } from 'three';
import { SUN_DIR } from './environment';
import { sharedTime } from './materials';

// ---------- Wave field (G4). JS mirror and GLSL share these numbers. ----------

const DEG = Math.PI / 180;
const WAVES = [
  { k: 0.349, w: 1.85, a: 0.35, dir: 20 * DEG },
  { k: 0.698, w: 2.62, a: 0.18, dir: -35 * DEG },
  { k: 1.396, w: 3.7, a: 0.08, dir: 75 * DEG },
].map((o) => ({ ...o, dx: Math.cos(o.dir), dz: Math.sin(o.dir) }));
export const WAVE_AMP = WAVES.reduce((s, w) => s + w.a, 0);
const Q = 0.35;

/** Surge swell (raised 1.5 m around 30 m ahead of the surge front). Shared by the JS mirror and shaders. */
export const swell = { z: { value: -1e5 }, amt: { value: 0 } };

export function setSwell(frontZ: number, amount: number): void {
  swell.z.value = frontZ;
  swell.amt.value = amount;
}

function swellAt(z: number): number {
  if (swell.amt.value <= 0) return 0;
  const d = (z - (swell.z.value + 30)) / 14;
  return swell.amt.value * 1.5 * Math.exp(-d * d);
}

/** Sea surface height at (x, z) and time t (seconds). Use it to float buoys, foam and creatures. */
export function waveHeight(x: number, z: number, t: number): number {
  let h = 0;
  for (const w of WAVES) h += w.a * Math.sin(w.k * (w.dx * x + w.dz * z) - w.w * t);
  return h + swellAt(z);
}

const glslVec = (n: number) => n.toFixed(5);
/** GLSL: `float seaHeight(vec2 xz)` using uniforms uTime, uSwellZ, uSwellAmt (declared here). */
export const SEA_GLSL = /* glsl */ `
uniform float uTime;
uniform float uSwellZ;
uniform float uSwellAmt;
float seaSwell(float z) {
  float d = (z - (uSwellZ + 30.0)) / 14.0;
  return uSwellAmt * 1.5 * exp(-d * d);
}
float seaHeight(vec2 p) {
  float h = 0.0;
  ${WAVES.map((w) => `h += ${glslVec(w.a)} * sin(${glslVec(w.k)} * dot(vec2(${glslVec(w.dx)}, ${glslVec(w.dz)}), p) - ${glslVec(w.w)} * uTime);`).join('\n  ')}
  return h + seaSwell(p.y);
}
vec3 seaDisplace(vec2 p, float amp) {
  vec3 o = vec3(0.0);
  ${WAVES.map((w) => `{ float ph = ${glslVec(w.k)} * dot(vec2(${glslVec(w.dx)}, ${glslVec(w.dz)}), p) - ${glslVec(w.w)} * uTime;
    o.y += ${glslVec(w.a)} * sin(ph); o.xz += ${glslVec(Q * w.a)} * vec2(${glslVec(w.dx)}, ${glslVec(w.dz)}) * cos(ph); }`).join('\n  ')}
  o *= amp;
  o.y += seaSwell(p.y) * amp;
  return o;
}`;

export const seaUniforms = () => ({ uTime: sharedTime, uSwellZ: swell.z, uSwellAmt: swell.amt });

// ---------- Mesh: world-locked near grid + flat far skirt, one draw call ----------

const HALF = 80;
const FAR = 1400;

function buildGeometry(cells: number): BufferGeometry {
  const pos: number[] = [];
  const amp: number[] = [];
  const idx: number[] = [];
  const n = cells;
  const step = (HALF * 2) / n;
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const x = -HALF + i * step;
      const z = -HALF + j * step;
      pos.push(x, 0, z);
      const edge = HALF - Math.max(Math.abs(x), Math.abs(z));
      amp.push(smooth(edge / 20));
    }
  }
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * (n + 1) + i;
      const b = a + 1;
      const c = a + n + 1;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }
  // Far skirt: 3 rings of points around the square hole (square → bigger squares), 8 segments per side.
  const rings = [HALF, 300, FAR];
  const seg = 8;
  const ringStart: number[] = [];
  for (const r of rings) {
    ringStart.push(pos.length / 3);
    for (let side = 0; side < 4; side++) {
      for (let s = 0; s < seg; s++) {
        const t = -1 + (2 * s) / seg;
        let x = 0;
        let z = 0;
        if (side === 0) [x, z] = [t * r, -r];
        else if (side === 1) [x, z] = [r, t * r];
        else if (side === 2) [x, z] = [-t * r, r];
        else [x, z] = [-r, -t * r];
        pos.push(x, 0, z);
        amp.push(0);
      }
    }
  }
  const per = seg * 4;
  for (let r = 0; r < rings.length - 1; r++) {
    for (let k = 0; k < per; k++) {
      const a = ringStart[r] + k;
      const b = ringStart[r] + ((k + 1) % per);
      const c = ringStart[r + 1] + k;
      const d = ringStart[r + 1] + ((k + 1) % per);
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('aAmp', new Float32BufferAttribute(amp, 1));
  g.setIndex(new Uint32BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}

function smooth(t: number): number {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
}

/** G4 toon sea. Vertices never slide across the wave field: the grid snaps to whole cells. */
export class Water {
  readonly mesh: Mesh;
  private readonly mat: ShaderMaterial;
  private cell = 1;

  constructor(cells: number, detail: boolean) {
    this.mat = new ShaderMaterial({
      fog: true,
      defines: detail ? { DETAIL: '' } : {},
      uniforms: UniformsUtils.merge([
        UniformsLib.fog,
        {
          uDeep: { value: new Color('#0E63C9') },
          uShallow: { value: new Color('#25C4EC') },
          uHorizon: { value: new Color('#BFE9FF') },
          uSunDir: { value: SUN_DIR.clone() },
          uAmp: { value: WAVE_AMP },
          uMood: { value: 0 },
        },
      ]),
      vertexShader: /* glsl */ `
        ${SEA_GLSL}
        attribute float aAmp;
        varying vec3 vWorld;
        varying float vH;
        varying float vAmp;
        #include <fog_pars_vertex>
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0);
          vec3 d = seaDisplace(w.xz, aAmp);
          float sw = seaSwell(w.z) * aAmp;
          w.xyz += d;
          vWorld = w.xyz;
          vH = d.y - sw;
          vAmp = aAmp;
          vec4 mvPosition = viewMatrix * w;
          gl_Position = projectionMatrix * mvPosition;
          #include <fog_vertex>
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uDeep; uniform vec3 uShallow; uniform vec3 uHorizon; uniform vec3 uSunDir;
        uniform float uAmp; uniform float uMood; uniform float uTime;
        varying vec3 vWorld; varying float vH; varying float vAmp;
        #include <fog_pars_fragment>
        float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        void main() {
          vec3 N = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
          if (N.y < 0.0) N = -N;
          vec3 V = normalize(cameraPosition - vWorld);
          float t = smoothstep(-uAmp, uAmp, vH);
          vec3 col = mix(uDeep, uShallow, t);
          col *= 0.86 + 0.22 * max(dot(N, uSunDir), 0.0);
          float f = pow(1.0 - max(dot(N, V), 0.0), 4.0);
          f = floor(f * 3.0 + 0.5) / 3.0;
          col = mix(col, uHorizon, f * 0.6);
          #ifdef DETAIL
            vec3 H = normalize(uSunDir + V);
            float near = 1.0 - smoothstep(35.0, 70.0, length(cameraPosition.xz - vWorld.xz));
            col += step(0.5, pow(max(dot(N, H), 0.0), 180.0)) * 0.85 * (1.0 - uMood) * near;
            float crest = smoothstep(0.75, 1.0, vH / uAmp) * step(0.45, hash(floor(vWorld.xz * 1.5)));
            col = mix(col, vec3(1.0), crest * 0.85 * vAmp * (0.4 + 0.6 * near));
          #endif
          col = mix(col, col * vec3(0.62, 0.72, 0.85), uMood);
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
    });
    Object.assign(this.mat.uniforms, seaUniforms());
    this.mesh = new Mesh(buildGeometry(cells), this.mat);
    this.mesh.frustumCulled = false;
    this.cell = (HALF * 2) / cells;
  }

  setMood(t: number): void {
    this.mat.uniforms.uMood.value = t;
  }

  /** Centre the near grid ahead of the camera, snapped to whole cells. */
  update(cam: Vector3, forward: Vector3): void {
    const cx = cam.x + forward.x * 45;
    const cz = cam.z + forward.z * 45;
    this.mesh.position.set(Math.round(cx / this.cell) * this.cell, 0, Math.round(cz / this.cell) * this.cell);
  }
}
