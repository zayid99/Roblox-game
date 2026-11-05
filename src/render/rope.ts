import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Quaternion,
  ShaderMaterial,
  Sprite,
  SpriteMaterial,
  Vector3,
  type Object3D,
} from 'three';
import { ropeStyle, type RopeKind } from './cosmeticStyles';
import { SUN_DIR } from './environment';
import { sharedTime } from './materials';
import type { Particles } from './particles';

const SEGMENTS = 10;
const UP = new Vector3(0, 1, 0);
const KIND: Record<RopeKind, number> = { stripe: 0, twist: 1, neon: 2, aurora: 3, lightning: 4, chain: 5 };

const p0 = new Vector3();
const p1 = new Vector3();
const ctrl = new Vector3();
const dir = new Vector3();
const side = new Vector3();
const m = new Matrix4();
const q = new Quaternion();
const s = new Vector3();

function bezier(out: Vector3, a: Vector3, c: Vector3, b: Vector3, t: number): Vector3 {
  const u = 1 - t;
  return out.set(u * u * a.x + 2 * u * t * c.x + t * t * b.x, u * u * a.y + 2 * u * t * c.y + t * t * b.y, u * u * a.z + 2 * u * t * c.z + t * t * b.z);
}

/** The swing rope (§5.2): 10 instanced segments on a quadratic curve hand → hook, with sag, twang and skins. */
export class Rope {
  readonly mesh: InstancedMesh;
  private readonly mat: ShaderMaterial;
  private readonly seg: InstancedBufferAttribute;
  private readonly glow: Sprite;
  private styleId = '';
  private kind: RopeKind = 'stripe';
  private twangT = 99;
  private sparkT = 0;

  constructor(parent: Object3D) {
    const geo = new CylinderGeometry(0.045, 0.045, 1, 6, 1, true).translate(0, 0.5, 0);
    this.mat = new ShaderMaterial({
      uniforms: {
        uA: { value: new Color() },
        uB: { value: new Color() },
        uPerM: { value: 6 },
        uKind: { value: 0 },
        uSun: { value: SUN_DIR.clone() },
        uTime: sharedTime,
      },
      vertexShader: /* glsl */ `
        attribute vec2 aSeg;
        varying float vD;
        varying float vAng;
        varying vec3 vN;
        void main() {
          vD = aSeg.x + position.y * aSeg.y;
          vAng = atan(position.z, position.x);
          vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * vec3(position.x, 0.0, position.z));
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uA; uniform vec3 uB; uniform float uPerM; uniform float uKind; uniform vec3 uSun; uniform float uTime;
        varying float vD; varying float vAng; varying vec3 vN;
        vec3 hue(float h) { return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
        void main() {
          float k = uKind;
          float f = vD * uPerM;
          if (k > 0.5 && k < 1.5) f += vAng / 6.2832 * 2.0;
          float st = step(0.5, fract(f));
          vec3 col = mix(uA, uB, st);
          float light = 0.72 + 0.4 * max(dot(normalize(vN), uSun), 0.0);
          if (k > 1.5 && k < 2.5) { col = mix(uA, uB, 0.25 + 0.25 * sin(vD * 6.0 - uTime * 8.0)) * 1.4; light = 1.0; }
          else if (k > 2.5 && k < 3.5) { col = hue(fract(vD * 0.12 - uTime * 0.25)) * 0.8 + 0.25; light = 1.0; }
          else if (k > 3.5 && k < 4.5) { col = mix(uA, uB, st * 0.6) * 1.3; light = 1.0; }
          gl_FragColor = vec4(col * light, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new InstancedMesh(geo, this.mat, SEGMENTS);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.seg = new InstancedBufferAttribute(new Float32Array(SEGMENTS * 2), 2);
    this.seg.setUsage(DynamicDrawUsage);
    geo.setAttribute('aSeg', this.seg);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.castShadow = false;

    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const g = cv.getContext('2d')!;
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    this.glow = new Sprite(new SpriteMaterial({ map: new CanvasTexture(cv), color: '#2EE6FF', transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false }));
    this.glow.scale.setScalar(1.6);
    this.glow.visible = false;
    parent.add(this.mesh, this.glow);
    this.setStyle('rope_hemp');
  }

  setStyle(id: string): void {
    if (id === this.styleId) return;
    this.styleId = id;
    const st = ropeStyle(id);
    this.kind = st.kind;
    (this.mat.uniforms.uA.value as Color).set(st.a);
    (this.mat.uniforms.uB.value as Color).set(st.b);
    this.mat.uniforms.uPerM.value = st.perM;
    this.mat.uniforms.uKind.value = KIND[st.kind];
    (this.glow.material.color as Color).set(st.a);
  }

  /** Twang on grab: lateral control-point offset .3 m at 8 Hz, decaying τ 100 ms. */
  twang(): void {
    this.twangT = 0;
  }

  hide(): void {
    this.mesh.visible = false;
    this.glow.visible = false;
  }

  update(dt: number, hand: Vector3, hook: Vector3, slack: number, time: number, particles: Particles | null): void {
    this.twangT += dt;
    dir.copy(hook).sub(hand);
    const len = dir.length();
    ctrl.copy(hand).add(hook).multiplyScalar(0.5);
    ctrl.y -= 0.04 * len * slack;
    side.crossVectors(dir, UP);
    if (side.lengthSq() < 1e-6) side.set(1, 0, 0);
    side.normalize();
    const tw = 0.3 * Math.sin(this.twangT * Math.PI * 2 * 8) * Math.exp(-this.twangT / 0.1);
    ctrl.addScaledVector(side, tw);
    if (this.kind === 'lightning') {
      const j = Math.floor(time * 10);
      ctrl.x += (Math.sin(j * 12.9898) * 0.5) * 0.5;
      ctrl.y += (Math.sin(j * 78.233) * 0.5) * 0.4;
    }
    let dist = 0;
    for (let i = 0; i < SEGMENTS; i++) {
      bezier(p0, hand, ctrl, hook, i / SEGMENTS);
      bezier(p1, hand, ctrl, hook, (i + 1) / SEGMENTS);
      dir.copy(p1).sub(p0);
      const l = dir.length();
      q.setFromUnitVectors(UP, dir.divideScalar(Math.max(l, 1e-5)));
      s.set(1, l + 0.01, 1);
      m.compose(p0, q, s);
      this.mesh.setMatrixAt(i, m);
      this.seg.setXY(i, dist, l);
      dist += l;
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    this.seg.needsUpdate = true;
    this.mesh.visible = true;
    this.glow.visible = this.kind === 'neon' || this.kind === 'lightning';
    if (this.glow.visible) this.glow.position.copy(hand);
    if (this.kind === 'lightning' && particles) {
      this.sparkT += dt;
      while (this.sparkT > 1 / 6) {
        this.sparkT -= 1 / 6;
        bezier(p0, hand, ctrl, hook, Math.random());
        particles.emit(p0.x, p0.y, p0.z, (Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3, '#FFF07A', 0.35, 0.35, 4, true);
      }
    }
  }
}
