import {
  BufferGeometry,
  CanvasTexture,
  DoubleSide,
  DynamicDrawUsage,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  ShaderMaterial,
  UniformsLib,
  UniformsUtils,
  Vector3,
  type Object3D,
} from 'three';
import { HOME_FRONT_Z } from '../game/config';
import type { WaveSim } from '../game/wave';
import { SUN_DIR } from './environment';
import { sharedTime } from './materials';
import type { Particles } from './particles';
import { setSwell } from './water';

// Side profile (z offset from the front, height): back, up over the crest, out along a lip that pitches forward
// and curls back under itself (the barrel), then down the concave face. Peak ≈ 11.6 → scaled to the crest.
const PROFILE: [number, number][] = [
  [-26, -1.5], [-18, 2], [-12, 5.4], [-7.5, 8.4], [-4, 10.5], [-1.5, 11.4], [0.8, 11.6], [3.0, 11.2], [4.9, 10.2],
  [6.0, 8.8], [6.0, 7.6], [5.1, 7.0], [3.8, 7.1], [2.7, 7.6], [1.8, 7.2], [1.1, 5.6], [1.0, 3.6], [1.6, 1.6], [3.2, -1.5],
];
const PEAK = 11.6;
/** Profile fraction where the lip's underside starts (the barrel) and where the face below it starts. */
const LIP_UNDER = 10 / (PROFILE.length - 1);
const FACE = 14 / (PROFILE.length - 1);
/** Visual crest heights (m): the sim's is lower, but the wall must tower over a player on an island. */
const CREST = 13;
const CREST_BIG = 13.8;
export const WAVE_WIDTH = 260;
const SEGMENTS = 64;

function buildGeometry(): BufferGeometry {
  const pos: number[] = [];
  const prof: number[] = [];
  const idx: number[] = [];
  for (let s = 0; s <= SEGMENTS; s++) {
    const x = -WAVE_WIDTH / 2 + (WAVE_WIDTH * s) / SEGMENTS;
    PROFILE.forEach(([z, y], i) => {
      pos.push(x, y, z);
      prof.push(i / (PROFILE.length - 1));
    });
  }
  const n = PROFILE.length;
  for (let s = 0; s < SEGMENTS; s++) {
    for (let i = 0; i < n - 1; i++) {
      const a = s * n + i;
      const b = (s + 1) * n + i;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('aProf', new Float32BufferAttribute(prof, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  return g;
}

let sharedGeo: BufferGeometry | null = null;

/**
 * The wave wall material (G11): a dark, saturated face that brightens toward a pitching white lip with a
 * scalloped foam edge, a shadowed barrel under the lip, foam streaks running down the face, toon-banded light
 * and an ink line where the silhouette turns away (it must read as a wall against the sea, not a foam strip).
 */
export function waveMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    side: DoubleSide,
    fog: true,
    uniforms: UniformsUtils.merge([
      UniformsLib.fog,
      {
        uCrest: { value: CREST / PEAK },
        uGrow: { value: 1 },
        uGolden: { value: 0 },
        uSun: { value: SUN_DIR.clone() },
      },
    ]),
    vertexShader: /* glsl */ `
      uniform float uTime; uniform float uCrest; uniform float uGrow;
      attribute float aProf;
      varying float vH; varying vec3 vWorld; varying float vProf;
      #include <fog_pars_vertex>
      void main() {
        vec3 p = position;
        float lip = smoothstep(6.5, 10.5, p.y) * step(0.4, aProf);
        float crest = smoothstep(7.0, 11.0, p.y);
        // The lip surges and pulls back in travelling sections, so the curl reads as alive.
        p.z += lip * (sin(p.x * 0.15 + uTime * 2.0) * 0.9 + sin(p.x * 0.41 - uTime * 3.1) * 0.35);
        p.y += crest * sin(p.x * 0.23 - uTime * 1.7) * 0.45;
        vH = p.y / ${PEAK.toFixed(2)};
        vProf = aProf;
        p.y *= uCrest * uGrow;
        vec4 w = modelMatrix * vec4(p, 1.0);
        vWorld = w.xyz;
        vec4 mvPosition = viewMatrix * w;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform float uGolden; uniform vec3 uSun; uniform float uTime;
      varying float vH; varying vec3 vWorld; varying float vProf;
      #include <fog_pars_fragment>
      void main() {
        // Linear colours: darker and more saturated than the sea so the wall stands out against it.
        vec3 deep = mix(vec3(0.006, 0.05, 0.2), vec3(0.35, 0.16, 0.0), uGolden);
        vec3 mid = mix(vec3(0.012, 0.2, 0.55), vec3(0.8, 0.45, 0.03), uGolden);
        vec3 glass = mix(vec3(0.12, 0.62, 0.88), vec3(1.0, 0.8, 0.3), uGolden);
        vec3 foam = mix(vec3(1.0), vec3(1.0, 0.97, 0.78), uGolden);
        vec3 N = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
        vec3 V = normalize(cameraPosition - vWorld);
        if (dot(N, V) < 0.0) N = -N;
        // Face: deep at the foot, saturated blue, then glassy turquoise just under the lip (light through it).
        vec3 col = mix(deep, mid, smoothstep(0.0, 0.5, vH));
        col = mix(col, glass, smoothstep(0.5, 0.85, vH));
        col *= 0.94 + 0.06 * sin(vWorld.x * 0.45 + vH * 14.0);
        // Barrel: the underside of the lip sits in its own shadow.
        float under = step(${LIP_UNDER.toFixed(3)}, vProf) * (1.0 - step(${FACE.toFixed(3)}, vProf));
        col = mix(col, deep * 1.3, under * 0.75);
        // Foam streaks raking down the face from the lip.
        float face = step(${FACE.toFixed(3)}, vProf);
        float streak = smoothstep(0.82, 0.97, sin(vWorld.x * 0.9 + sin(vWorld.x * 0.13) * 3.0)) * smoothstep(0.25, 0.6, vH);
        col = mix(col, foam, streak * face * 0.35);
        // White lip and crest with a scalloped edge running down the back.
        float edge = 0.83 + 0.035 * sin(vWorld.x * 1.3 + uTime * 3.0) + 0.02 * sin(vWorld.x * 3.1 - uTime * 2.0);
        float foamy = smoothstep(edge, edge + 0.015, vH) * step(0.25, vProf) * (1.0 - under);
        col = mix(col, foam, foamy);
        // Toon light: two bands.
        float l = dot(N, uSun);
        col *= l > 0.15 ? 1.0 : 0.82;
        float rim = 1.0 - abs(dot(N, V));
        col += pow(rim, 2.0) * 0.12 * (1.0 - foamy);
        // Ink where the silhouette turns away (lip edge and the top of the crest).
        col = mix(col, vec3(0.106, 0.09, 0.21), smoothstep(0.9, 0.97, rim) * 0.85);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #ifdef USE_FOG
          float fogFactor = smoothstep(fogNear, fogFar * 1.6, vFogDepth) * 0.45;
          gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
        #endif
      }`,
  });
}

export function waveMesh(mat: ShaderMaterial): Mesh {
  sharedGeo ??= buildGeometry();
  mat.uniforms.uTime = sharedTime;
  const m = new Mesh(sharedGeo, mat);
  m.frustumCulled = false;
  return m;
}

function sprayTexture(): CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d')!;
  // A crisp toon foam blob (solid core, short soft rim), not a soft haze.
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.62, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.8, 'rgba(255,255,255,0.25)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new CanvasTexture(cv);
}

const SPRAY_MAX = 160;

/**
 * Foam puffs: normal blending, per-instance alpha in instanceColor.r and golden tint in .g. Puffs within a few
 * metres of the camera fade out (they read as smudges on the lens).
 */
function sprayMaterial(): MeshBasicMaterial {
  const m = new MeshBasicMaterial({ map: sprayTexture(), transparent: true, depthWrite: false, toneMapped: false });
  m.onBeforeCompile = (s) => {
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vSprayDepth;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvSprayDepth = -mvPosition.z;');
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vSprayDepth;')
      .replace(
        '#include <color_fragment>',
        `#ifdef USE_INSTANCING_COLOR
          diffuseColor.a *= vColor.r;
          diffuseColor.rgb *= mix(vec3(1.0), vec3(1.0, 0.9, 0.62), vColor.g);
        #endif
        diffuseColor.a *= smoothstep(3.0, 9.0, vSprayDepth);`,
      );
  };
  return m;
}
const m4 = new Matrix4();
const v3 = new Vector3();
const s3 = new Vector3();

/** Per puff: position (3), velocity (3), age, life, size (sizes are fractional, so they get their own slot). */
const STRIDE = 9;

/** Foam spray puffs (instanced, camera-facing). */
export class Spray {
  readonly mesh: InstancedMesh;
  private readonly d = new Float32Array(SPRAY_MAX * STRIDE);
  private n = 0;

  constructor(parent: Object3D) {
    this.mesh = new InstancedMesh(
      new PlaneGeometry(1, 1),
      sprayMaterial(),
      SPRAY_MAX,
    );
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(SPRAY_MAX * 3), 3);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    this.mesh.count = 0;
    parent.add(this.mesh);
  }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, size: number, life: number): void {
    if (this.n >= SPRAY_MAX) return;
    const o = this.n++ * STRIDE;
    const d = this.d;
    d[o] = x;
    d[o + 1] = y;
    d[o + 2] = z;
    d[o + 3] = vx;
    d[o + 4] = vy;
    d[o + 5] = vz;
    d[o + 6] = 0;
    d[o + 7] = life;
    d[o + 8] = size;
  }

  update(dt: number, camQ: Quaternion, tint: number): void {
    const d = this.d;
    let i = 0;
    while (i < this.n) {
      const o = i * STRIDE;
      const life = d[o + 7];
      const size = d[o + 8];
      d[o + 6] += dt;
      if (d[o + 6] >= life) {
        this.n--;
        if (i !== this.n) d.copyWithin(o, this.n * STRIDE, this.n * STRIDE + STRIDE);
        continue;
      }
      d[o + 4] -= 9 * dt;
      d[o] += d[o + 3] * dt;
      d[o + 1] += d[o + 4] * dt;
      d[o + 2] += d[o + 5] * dt;
      const k = d[o + 6] / life;
      // Pops out, then shrinks away (a growing puff read as haze on the lens).
      s3.setScalar(size * (k < 0.2 ? 0.5 + 2.5 * k : 1 - 0.6 * (k - 0.2)));
      m4.compose(v3.set(d[o], d[o + 1], d[o + 2]), camQ, s3);
      this.mesh.setMatrixAt(i, m4);
      const a = Math.min(1, k * 8) * (1 - k * k) * 0.9;
      this.mesh.instanceColor!.setXYZ(i, a, tint, 0);
      i++;
    }
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor!.needsUpdate = true;
  }
}

/** The big wave (G11): rises on the horizon during the warning, sweeps in during the surge, throws spray. */
export class WaveVisual {
  readonly mesh: Mesh;
  readonly mat: ShaderMaterial;
  readonly spray: Spray;
  private readonly foam: Mesh;
  private sprayT = 0;
  private big = false;

  constructor(parent: Object3D) {
    this.mat = waveMaterial();
    this.mesh = waveMesh(this.mat);
    this.mesh.visible = false;
    this.foam = new Mesh(
      new PlaneGeometry(WAVE_WIDTH, 8, 32, 2).rotateX(-Math.PI / 2).translate(0, 0.35, 4),
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: { uTime: sharedTime },
        vertexShader: /* glsl */ `
          varying vec2 vUv; varying vec3 vW;
          void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
        fragmentShader: /* glsl */ `
          uniform float uTime; varying vec2 vUv; varying vec3 vW;
          float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
          void main() {
            float edge = smoothstep(0.0, 0.25, vUv.y) * smoothstep(1.0, 0.55, vUv.y);
            float n = hash(floor(vW.xz * 0.8 + vec2(uTime * 2.0, 0.0)));
            float a = edge * (0.55 + 0.45 * step(0.35, n));
            gl_FragColor = vec4(vec3(1.0), a * 0.75);
            #include <colorspace_fragment>
          }`,
      }),
    );
    this.foam.visible = false;
    this.foam.renderOrder = 2;
    this.spray = new Spray(parent);
    parent.add(this.mesh, this.foam);
  }

  setVariant(golden: boolean, big: boolean): void {
    this.big = big;
    this.mat.uniforms.uGolden.value = golden ? 1 : 0;
    this.mat.uniforms.uCrest.value = (big ? CREST_BIG : CREST) / PEAK;
  }

  update(dt: number, wave: WaveSim, playerX: number, camQ: Quaternion, particles: Particles, warningLen: number): void {
    const golden = this.mat.uniforms.uGolden.value > 0.5;
    if (wave.phase === 'warning') {
      // Rises on the horizon at startZ: scale y .15 → 1 over the warning.
      const k = 1 - Math.max(0, wave.timer) / warningLen;
      this.mesh.visible = true;
      this.foam.visible = false;
      this.mesh.position.set(playerX * 0.3, 0, wave.startZ);
      this.mat.uniforms.uGrow.value = 0.15 + 0.85 * k;
      setSwell(-1e5, 0);
    } else if (wave.phase === 'surge') {
      const toHome = HOME_FRONT_Z - wave.frontZ;
      // Full height until the last ~16 m, then it breaks down onto the home shore.
      const u = Math.min(1, Math.max(0, toHome / 16));
      const crash = 0.25 + 0.75 * u * u * (3 - 2 * u);
      this.mesh.visible = true;
      this.foam.visible = true;
      this.mesh.position.set(playerX * 0.3, 0, wave.frontZ);
      this.foam.position.set(playerX * 0.3, 0, wave.frontZ);
      this.mat.uniforms.uGrow.value = crash;
      setSwell(wave.frontZ, crash);
      // Small, short-lived spray thrown off the pitching lip (and a second row on a Big Wave).
      this.sprayT += dt;
      const crestY = (this.big ? CREST_BIG : CREST) * crash;
      while (this.sprayT > 0.025) {
        this.sprayT -= 0.025;
        const x = playerX + (Math.random() - 0.5) * 110;
        this.spray.emit(x, crestY * 0.9, wave.frontZ + 5, (Math.random() - 0.5) * 2, 2 + Math.random() * 2.5, 4 + Math.random() * 3, 1.1 + Math.random() * 0.9, 0.35 + Math.random() * 0.25);
        if (this.big) this.spray.emit(x + 5, crestY, wave.frontZ + 2, 0, 3 + Math.random() * 2, 3, 0.9 + Math.random() * 0.7, 0.45);
        if (golden && Math.random() < 0.4) particles.emit(x, crestY, wave.frontZ + 2, (Math.random() - 0.5) * 3, 3 + Math.random() * 3, 4, '#FFE27A', 0.4, 0.9, 6, true);
      }
    } else {
      this.mesh.visible = false;
      this.foam.visible = false;
      setSwell(-1e5, 0);
    }
    this.spray.update(dt, camQ, golden ? 1 : 0);
  }
}
