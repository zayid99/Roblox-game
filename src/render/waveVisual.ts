import {
  AdditiveBlending,
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

// Side profile (z offset from the front, height): back, up over the curl, down the face. Peak ≈ 11.4 → scaled to the crest.
const PROFILE: [number, number][] = [
  [-26, -1.5], [-18, 2], [-12, 5.2], [-7.5, 8], [-4, 10.2], [-1.5, 11.2], [0.6, 11.4], [2.6, 10.9], [3.6, 9.8],
  [3.4, 8.6], [2.4, 8.0], [1.2, 7.8], [0.6, 6.6], [0.9, 4.2], [1.8, 1.6], [3.0, -1.5],
];
const PEAK = 11.4;
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

/** The wave wall material (G11): vertex gradient deep → mid → white crest, faceted light, rim lighten, curling lip. */
export function waveMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    side: DoubleSide,
    fog: true,
    uniforms: UniformsUtils.merge([
      UniformsLib.fog,
      {
        uCrest: { value: 12.5 / PEAK },
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
        float lip = smoothstep(6.0, 10.5, p.y) * step(0.45, aProf);
        float crest = smoothstep(7.0, 11.0, p.y);
        p.z += lip * (sin(p.x * 0.15 + uTime * 2.0) * 0.8 + sin(p.x * 0.41 - uTime * 3.1) * 0.3);
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
      uniform float uGolden; uniform vec3 uSun;
      varying float vH; varying vec3 vWorld; varying float vProf;
      #include <fog_pars_fragment>
      void main() {
        vec3 deep = mix(vec3(0.043, 0.31, 0.66), vec3(0.62, 0.38, 0.0), uGolden);
        vec3 mid = mix(vec3(0.25, 0.85, 1.0), vec3(1.0, 0.78, 0.2), uGolden);
        vec3 foam = mix(vec3(1.0), vec3(1.0, 0.97, 0.78), uGolden);
        vec3 N = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
        vec3 V = normalize(cameraPosition - vWorld);
        if (dot(N, V) < 0.0) N = -N;
        vec3 col = mix(deep, mid, smoothstep(-0.05, 0.7, vH));
        col = mix(col, foam, smoothstep(0.84, 0.97, vH) * step(0.3, vProf));
        col *= 0.78 + 0.32 * max(dot(N, uSun), 0.0);
        float rim = pow(1.0 - abs(dot(N, V)), 2.0);
        col += rim * 0.28;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #ifdef USE_FOG
          float fogFactor = smoothstep(fogNear, fogFar, vFogDepth) * 0.7;
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
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.45)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new CanvasTexture(cv);
}

const SPRAY_MAX = 160;
const m4 = new Matrix4();
const v3 = new Vector3();
const s3 = new Vector3();

/** Soft additive spray puffs (instanced, camera-facing). */
export class Spray {
  readonly mesh: InstancedMesh;
  private readonly d = new Float32Array(SPRAY_MAX * 8);
  private n = 0;

  constructor(parent: Object3D) {
    this.mesh = new InstancedMesh(
      new PlaneGeometry(1, 1),
      new MeshBasicMaterial({ map: sprayTexture(), transparent: true, depthWrite: false, blending: AdditiveBlending, toneMapped: false }),
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
    const o = this.n++ * 8;
    const d = this.d;
    d[o] = x;
    d[o + 1] = y;
    d[o + 2] = z;
    d[o + 3] = vx;
    d[o + 4] = vy;
    d[o + 5] = vz;
    d[o + 6] = 0;
    d[o + 7] = life + size * 1000;
  }

  update(dt: number, camQ: Quaternion, tint: number): void {
    const d = this.d;
    let i = 0;
    while (i < this.n) {
      const o = i * 8;
      const size = Math.floor(d[o + 7] / 1000);
      const life = d[o + 7] - size * 1000;
      d[o + 6] += dt;
      if (d[o + 6] >= life) {
        this.n--;
        if (i !== this.n) d.copyWithin(o, this.n * 8, this.n * 8 + 8);
        continue;
      }
      d[o + 4] -= 9 * dt;
      d[o] += d[o + 3] * dt;
      d[o + 1] += d[o + 4] * dt;
      d[o + 2] += d[o + 5] * dt;
      const k = d[o + 6] / life;
      s3.setScalar(size * (0.6 + k * 0.9));
      m4.compose(v3.set(d[o], d[o + 1], d[o + 2]), camQ, s3);
      this.mesh.setMatrixAt(i, m4);
      const a = (1 - k) * 0.75;
      this.mesh.instanceColor!.setXYZ(i, a, a * (1 - 0.15 * tint), a * (1 - 0.6 * tint));
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
      new PlaneGeometry(WAVE_WIDTH, 12, 32, 2).rotateX(-Math.PI / 2).translate(0, 0.35, 5),
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
            gl_FragColor = vec4(vec3(1.0), a * 0.9);
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
    this.mat.uniforms.uCrest.value = (big ? 13.2 : 12.5) / PEAK;
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
      const crash = Math.min(1, Math.max(0.15, toHome / 25));
      this.mesh.visible = true;
      this.foam.visible = true;
      this.mesh.position.set(playerX * 0.3, 0, wave.frontZ);
      this.foam.position.set(playerX * 0.3, 0, wave.frontZ);
      this.mat.uniforms.uGrow.value = crash;
      setSwell(wave.frontZ, crash);
      // Spray along the crest (and a second row on a Big Wave).
      this.sprayT += dt;
      const crestY = 12.5 * crash * (this.big ? 13.2 / 12.5 : 1);
      while (this.sprayT > 0.025) {
        this.sprayT -= 0.025;
        const x = playerX + (Math.random() - 0.5) * 120;
        this.spray.emit(x, crestY - 0.5, wave.frontZ + 2.5, (Math.random() - 0.5) * 2, 3 + Math.random() * 4, 4 + Math.random() * 6, 3 + Math.random() * 2.5, 0.8 + Math.random() * 0.5);
        if (this.big) this.spray.emit(x + 5, crestY + 1.2, wave.frontZ + 1, 0, 5 + Math.random() * 3, 3, 4 + Math.random() * 2, 0.9);
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
