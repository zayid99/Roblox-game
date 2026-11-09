import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Euler,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  RingGeometry,
  ShaderMaterial,
  Sprite,
  SpriteMaterial,
  Vector3,
  type Camera,
} from 'three';
import type { WildCreature } from '../contracts';
import { HOME_TOP } from '../game/config';
import { groundHeightAt, MAX_PEDESTALS, type Course } from '../game/course';
import { creatureIncome, getSpecies, RARITIES, type CreatureRef } from '../game/creatures';
import { formatIncome } from '../game/economy';
import type { BlobShadows } from './blobShadows';
import { PedestalLabels, wildBillboard } from './billboards';
import { creatureOutline, makeCreatureMesh, speciesHeight, speciesScale } from './creatureMesh';
import { clamp, easeBack, easeInOut, easeOut } from './juice';
import { inkMaterial, sharedTime, type CreatureMaterial } from './materials';
import type { Particles } from './particles';

type Body = Mesh & { material: CreatureMaterial };

/** Offsets a signature idle or hop applies on top of the rest pose. */
interface Pose {
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  rz: number;
  sx: number;
  sy: number;
  sz: number;
  opacity: number;
}
const resetPose = (p: Pose): Pose => {
  p.x = p.y = p.z = p.rx = p.ry = p.rz = 0;
  p.sx = p.sy = p.sz = 1;
  p.opacity = 1;
  return p;
};
const squashY = (p: Pose, s: number) => {
  p.sy *= s;
  const side = 1 / Math.sqrt(s);
  p.sx *= side;
  p.sz *= side;
};
const DEG = Math.PI / 180;
const TAU = Math.PI * 2;

type SigFn = (k: number, p: Pose, t: number) => void;
interface Signature {
  ms: number;
  fn: SigFn;
  /** Particles at the start: [colour, count, additive]. */
  fx?: [string, number, boolean];
}

/** §5.2b signature idles (whole-body approximations of the per-part tweens). */
const SIGNATURES: Record<string, Signature> = {
  toastopus: { ms: 700, fn: (k, p) => {
    if (k < 0.3) { p.y = -0.25 * easeInOut(k / 0.3); squashY(p, 0.85); }
    else { const u = (k - 0.3) / 0.7; p.y = -0.25 * (1 - u) + 0.85 * Math.sin(Math.PI * u); p.ry = TAU * easeOut(u); squashY(p, 1 + 0.12 * Math.sin(Math.PI * u)); }
  } },
  pickle_puff: { ms: 600, fn: (k, p) => {
    const s = k < 0.6 ? 1 + 0.25 * Math.sin((Math.PI / 2) * (k / 0.6)) : 1 + 0.25 * (1 - (k - 0.6) / 0.4) + 0.06 * Math.sin((k - 0.6) * 60) * (1 - k) / 0.4;
    p.sx *= s; p.sy *= s; p.sz *= s;
  } },
  soggy_sock: { ms: 800, fn: (k, p) => { p.rz = 50 * DEG * Math.sin(TAU * k) * (1 - k * 0.4); } },
  crab_dj: { ms: 900, fn: (k, p) => { p.x = 0.15 * Math.sin(TAU * 3 * k); p.rx = 12 * DEG * Math.abs(Math.sin(TAU * 3 * k)); } },
  boba_turtle: { ms: 1000, fn: (k, p) => { const s = Math.sin(Math.PI * k); squashY(p, 1 - 0.4 * s); p.y = -0.05 * s; } },
  sir_shrimp: { ms: 700, fn: (k, p) => { const s = Math.sin(Math.PI * k); p.rx = 15 * DEG * s; p.y = 0.1 * s; } },
  banana_shark: { ms: 500, fn: (k, p) => { p.rx = -25 * DEG * Math.abs(Math.sin(TAU * k)) * 0.6; squashY(p, 1 + 0.08 * Math.abs(Math.sin(TAU * k))); } },
  disco_clam: { ms: 900, fn: (k, p) => { p.ry = TAU * easeInOut(k); p.y = 0.2 * Math.sin(Math.PI * k); }, fx: ['#7FE7FF', 4, true] },
  waffle_walrus: { ms: 900, fn: (k, p) => {
    if (k < 0.35) p.rx = 80 * DEG * easeInOut(k / 0.35);
    else if (k < 0.55) { p.rx = 80 * DEG; squashY(p, 0.7 + 0.3 * ((k - 0.35) / 0.2)); }
    else p.rx = 80 * DEG * (1 - easeOut((k - 0.55) / 0.45));
    p.y = 0.25 * Math.sin(Math.PI * Math.min(1, k / 0.35)) * (k < 0.35 ? 1 : 0);
  } },
  burger_whale: { ms: 800, fn: (k, p) => { squashY(p, 1 + 0.14 * Math.sin(k * 28) * (1 - k)); p.y = 0.08 * Math.sin(Math.PI * k); }, fx: ['#FFFFFF', 2, false] },
  cactus_jelly: { ms: 1200, fn: (k, p) => { p.rz = 20 * DEG * Math.sin(TAU * 2 * k) * Math.sin(Math.PI * k); p.ry = TAU * 0.25 * Math.sin(Math.PI * k); } },
  ninja_narwhal: { ms: 400, fn: (k, p) => { p.x = k > 0.1 && k < 0.6 ? 0.8 : 0; p.rz = k > 0.1 && k < 0.6 ? -8 * DEG : 0; }, fx: ['#3A3A48', 3, false] },
  king_krill: { ms: 1000, fn: (k, p) => { p.rz = 35 * DEG * 0.35 * Math.sin(TAU * 4 * k) * Math.sin(Math.PI * k); p.y = 0.1 * Math.abs(Math.sin(TAU * 2 * k)); } },
  lava_lobster: { ms: 600, fn: (k, p) => { const h = Math.abs(Math.sin(TAU * k)); p.y = 0.2 * h; squashY(p, 1 + 0.15 * h); p.rx = -40 * DEG * 0.3 * h; }, fx: ['#FF7A1A', 3, true] },
  astro_otter: { ms: 1600, fn: (k, p) => { p.y = 0.5 * Math.sin(Math.PI * k); p.rz = TAU * easeInOut(k); } },
  thunder_tuna: { ms: 500, fn: (k, p, t) => { const a = 0.04 * (1 - k); p.x = a * Math.sin(t * TAU * 30); p.z = a * Math.cos(t * TAU * 30 + 1); }, fx: ['#FFF07A', 3, true] },
  ghost_galleon: { ms: 1400, fn: (k, p) => { p.opacity = 1 - 0.6 * Math.sin(Math.PI * k); p.rz = 15 * DEG * Math.sin(TAU * k); } },
  pizza_kraken: { ms: 900, fn: (k, p) => { p.y = 0.4 * Math.sin(Math.PI * k); p.ry = 2 * TAU * easeOut(k); } },
  big_cheese: { ms: 1200, fn: (k, p) => { p.ry = 90 * DEG * Math.sin(Math.PI * k); }, fx: ['#FFF6B0', 1, true] },
  cosmic_sunfish: { ms: 1500, fn: (k, p) => { p.y = 0.15 - 0.15 * Math.cos(TAU * k); p.z = 0.3 * Math.sin(TAU * k); p.rx = -0.3 * Math.sin(TAU * k); }, fx: ['#FFF07A', 4, true] },
  captain_splash: { ms: 900, fn: (k, p) => { const s = Math.sin(Math.PI * k); p.rz = 15 * DEG * s; p.rx = -10 * DEG * s; p.y = 0.08 * s; } },
};
const DEFAULT_SIG: Signature = { ms: 600, fn: (k, p) => { p.ry = TAU * easeInOut(k); } };

/** Shared hop: squash .85 (60 ms) → rise .5 m stretched 1.12 → land squash .88 → settle. */
function hop(t: number, p: Pose): boolean {
  if (t < 0.06) squashY(p, 1 - 0.15 * (t / 0.06));
  else if (t < 0.48) {
    const u = (t - 0.06) / 0.42;
    p.y = 0.5 * Math.sin(Math.PI * u);
    squashY(p, u < 0.5 ? 1.12 : 1.12 - 0.12 * ((u - 0.5) / 0.5));
  } else if (t < 0.56) squashY(p, 1 - 0.12 * Math.sin(Math.PI * ((t - 0.48) / 0.08)));
  else if (t < 0.7) squashY(p, 1 + 0.03 * Math.sin(Math.PI * ((t - 0.56) / 0.14)));
  else return false;
  return true;
}

interface Anim {
  body: Body;
  speciesId: string;
  mutation: number;
  rarity: number;
  scale: number;
  height: number;
  yaw: number;
  yawTarget: number;
  lookAt: number;
  idleAt: number;
  idleStart: number;
  idleSig: boolean;
  nextSig: boolean;
  blinkAt: number;
  blinkStart: number;
}

function newAnim(body: Body, c: CreatureRef, scaleK: number, now: number): Anim {
  const sp = getSpecies(c.speciesId);
  const scale = speciesScale(c.speciesId) * scaleK;
  body.geometry.computeBoundingBox();
  const height = (body.geometry.boundingBox?.max.y ?? 1) * scale;
  return {
    body,
    speciesId: c.speciesId,
    mutation: c.mutation,
    rarity: sp.rarity,
    scale,
    height,
    yaw: Math.random() * TAU,
    yawTarget: 0,
    lookAt: now + 1 + Math.random() * 3,
    idleAt: now + 0.5 + Math.random() * 3,
    idleStart: -1,
    idleSig: false,
    nextSig: Math.random() < 0.5,
    blinkAt: now + 1 + Math.random() * 3,
    blinkStart: -1,
  };
}

const pose: Pose = resetPose({} as Pose);
const animV = new Vector3();
const animQ = new Quaternion();
const tmpV = new Vector3();
const tmpV2 = new Vector3();
const tmpM = new Matrix4();
const tmpQ = new Quaternion();
const tmpS = new Vector3();
const tmpC = new Color();
const UP = new Vector3(0, 1, 0);
const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Animates blink + idle + the given pose and writes the body transform at `base`. Returns false if the pose is done. */
function animate(a: Anim, base: Vector3, t: number, dt: number, reduceMotion: boolean, particles: Particles | null): void {
  animateBlink(a, t);
  resetPose(pose);
  if (a.idleStart < 0 && t >= a.idleAt) {
    a.idleStart = t;
    a.idleSig = a.nextSig && !reduceMotion;
    a.nextSig = !a.nextSig;
    if (a.idleSig) {
      const sig = SIGNATURES[a.speciesId] ?? DEFAULT_SIG;
      if (sig.fx && particles) particles.burst(animV.copy(base).setY(base.y + a.height * 0.9), sig.fx[0], sig.fx[1], { speed: 2.5, up: 2, size: sig.fx[2] ? 0.35 : 0.22, life: 0.6, gravity: sig.fx[2] ? 0 : 6, additive: sig.fx[2] });
    }
  }
  if (a.idleStart >= 0) {
    const it = t - a.idleStart;
    let running: boolean;
    if (a.idleSig) {
      const sig = SIGNATURES[a.speciesId] ?? DEFAULT_SIG;
      const k = it / (sig.ms / 1000);
      running = k < 1;
      if (running) sig.fn(k, pose, t);
    } else running = hop(it, pose);
    if (!running) {
      a.idleStart = -1;
      a.idleAt = t + 2 + Math.random() * 2;
      resetPose(pose);
    }
  }
  // Yaw toward its target (4 rad/s).
  const dy = wrapAngle(a.yawTarget - a.yaw);
  a.yaw += clamp(dy, -4 * dt, 4 * dt);
  const yaw = a.yaw + pose.ry;
  animQ.setFromAxisAngle(UP, yaw);
  animV.set(pose.x, 0, pose.z).applyQuaternion(animQ);
  a.body.position.set(base.x + animV.x, base.y + pose.y * a.scale, base.z + animV.z);
  a.body.rotation.set(pose.rx, yaw, pose.rz, 'YXZ');
  a.body.scale.set(a.scale * pose.sx, a.scale * pose.sy, a.scale * pose.sz);
  if (pose.opacity < 1 || a.body.material.transparent) {
    const m = a.body.material;
    // Switching to transparent needs a new program (the opaque one forces alpha to 1).
    if (!m.transparent) m.needsUpdate = true;
    m.transparent = true;
    m.opacity = pose.opacity;
  }
}

/** Tap on a pedestal: the signature idle, or the plain hop with Reduce motion (§5.2b). */
function startSignature(a: Anim, t: number, reduceMotion: boolean): void {
  a.idleStart = t;
  a.idleSig = !reduceMotion;
}

// ---------- Shared instanced FX: glow discs, rare beams, legendary rings ----------

function glowTexture(): CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 4, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.55)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new CanvasTexture(cv);
}

class Instances {
  readonly mesh: InstancedMesh;
  n = 0;
  constructor(mesh: InstancedMesh) {
    this.mesh = mesh;
    mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(mesh.count * 3), 3);
    mesh.instanceColor.setUsage(DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.count = 0;
  }
  private get max(): number {
    return this.mesh.instanceMatrix.count;
  }
  add(m: Matrix4, c: Color): void {
    if (this.n >= this.max) return;
    this.mesh.setMatrixAt(this.n, m);
    this.mesh.setColorAt(this.n, c);
    this.n++;
  }
  begin(): void {
    this.n = 0;
  }
  end(): void {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor!.needsUpdate = true;
  }
}

function beamMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
    uniforms: { uTime: sharedTime },
    vertexShader: /* glsl */ `
      varying float vY;
      varying float vA;
      varying vec3 vCol;
      void main() {
        vY = position.y;
        vA = atan(position.z, position.x);
        vCol = instanceColor;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying float vY; varying float vA; varying vec3 vCol;
      void main() {
        float a = pow(1.0 - vY, 1.8) * (0.7 + 0.3 * sin(vA * 3.0 + uTime * 1.5)) * 0.42;
        gl_FragColor = vec4(vCol * a, a);
        #include <colorspace_fragment>
      }`,
  });
}

/** A delivered creature's hop from the head stack onto its pedestal (staggered by duration, never frozen). */
interface Fly {
  from: Vector3;
  t: number;
  dur: number;
  /** Carried scale and yaw at the hand-off, eased into the pedestal ones. */
  s0: number;
  yaw0: number;
}
const tmpE = new Euler();

const rarityColors = RARITIES.map((r) => new Color(r.color));
const RAINBOW = ['#FF5A5F', '#FFC92E', '#59D36A', '#3AA8FF', '#B065FF'];

export interface CreatureFrame {
  time: number;
  dt: number;
  camera: Camera;
  player: Vector3;
  reduceMotion: boolean;
  outlineRange: number;
  billboardRange: number;
  /** Beat phase 0..1 from the audio clock, NaN when music is off. */
  beatPhase: number;
  shadows: boolean;
}

/** Wild, carried and pedestal creature visuals (moved out of Game.ts), with the draw-call plan of §6.1. */
export class CreatureVisuals {
  readonly group = new Group();
  private readonly wild = new Map<number, Anim & { stamp: number; base: Vector3; born: number; featured: boolean }>();
  private readonly pendingPickups = new Map<number, Anim>();
  private readonly glow: Instances;
  private readonly beams: Instances;
  private readonly rings: Instances;
  private readonly outlines: Mesh[] = [];
  private readonly sprites: Sprite[] = [];
  private stamp = 0;

  // Carried stack.
  private readonly carried: (Anim & { key: string; flyFrom: Vector3 | null; flyT: number; wobX: number; wobXv: number; wobZ: number; wobZv: number; land: number })[] = [];
  private delivering: { a: Anim; from: Vector3 }[] = [];
  private deliverPending = false;
  private readonly lastVel = new Vector3();
  private readonly accel = new Vector3();

  // Base.
  private readonly base: ({ key: string; ref: CreatureRef; a: Anim; fly: Fly | null; pulse: number } | null)[] = [];
  readonly labels = new PedestalLabels();
  private labelMult = -1;
  private coinTimer = 0;
  private sparkleT = 0;
  private tapped = -1;
  private tappedUntil = 0;
  private practiceT = -1;
  private practicePop = -1;
  private readonly coinSlots = new Uint8Array(MAX_PEDESTALS);

  constructor(
    private readonly course: Course,
    private readonly particles: Particles,
    private readonly blobs: BlobShadows,
  ) {
    const disc = new PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    this.glow = new Instances(new InstancedMesh(disc, new MeshBasicMaterial({ map: glowTexture(), transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false }), 96));
    this.glow.mesh.renderOrder = 3;
    this.beams = new Instances(new InstancedMesh(new CylinderGeometry(0.35, 0.35, 1, 12, 1, true).translate(0, 0.5, 0), beamMaterial(), 64));
    this.beams.mesh.renderOrder = 6;
    this.rings = new Instances(new InstancedMesh(new RingGeometry(0.9, 1.05, 32).rotateX(-Math.PI / 2), new MeshBasicMaterial({ transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false }), 48));
    this.rings.mesh.renderOrder = 3;
    this.group.add(this.glow.mesh, this.beams.mesh, this.rings.mesh, this.labels.mesh);
    for (let i = 0; i < 8; i++) {
      const o = new Mesh(undefined, inkMaterial);
      o.matrixAutoUpdate = false;
      o.visible = false;
      this.outlines.push(o);
      this.group.add(o);
    }
    for (let i = 0; i < 6; i++) {
      const s = new Sprite(new SpriteMaterial({ transparent: true, depthWrite: false, toneMapped: false }));
      s.visible = false;
      s.scale.set(3.2, 1.28, 1);
      s.renderOrder = 9;
      this.sprites.push(s);
      this.group.add(s);
    }
  }

  /** World position of a wild creature visual (for wash-away bursts). */
  wildPosition(uid: number, out: Vector3): Vector3 | null {
    const w = this.wild.get(uid);
    return w ? out.copy(w.body.position) : null;
  }

  /** A wild creature was collected: its visual pops and flies onto the head stack. */
  onCollect(c: WildCreature): void {
    const w = this.wild.get(c.uid);
    if (!w) return;
    this.wild.delete(c.uid);
    this.pendingPickups.set(c.uid, w);
    w.body.material.userData.flash.value = 1;
  }

  onDeliver(): void {
    this.deliverPending = true;
  }

  /** Play a pedestal creature's signature idle (tap). Its label opens in full for a few seconds. */
  tapPedestal(i: number, t: number, reduceMotion = false): void {
    const b = this.base[i];
    if (!b) return;
    startSignature(b.a, t, reduceMotion);
    this.tapped = i;
    this.tappedUntil = t + 4;
  }

  /** FTUE practice wave (spec §7): the carried stack floats off for 0.9 s, then snaps back with a pop. */
  practiceSplash(t: number): void {
    if (this.carried.length) this.practiceT = t;
  }

  pedestalWorld(i: number, out: Vector3): Vector3 | null {
    const b = this.base[i];
    return b ? out.copy(b.a.body.position).setY(b.a.body.position.y + b.a.height * 0.6) : null;
  }

  // ---------- Per frame ----------

  update(f: CreatureFrame, wild: readonly WildCreature[], simTime: number, carried: readonly CreatureRef[], baseSlots: readonly (CreatureRef | null)[], multiplier: number, headTop: Matrix4, playerQuat: Quaternion, playerVel: Vector3, slotCount: number): void {
    this.glow.begin();
    this.beams.begin();
    this.rings.begin();
    this.updateWild(f, wild, simTime);
    this.updateCarried(f, carried, headTop, playerQuat, playerVel);
    this.updateBase(f, baseSlots, multiplier, slotCount);
    this.glow.end();
    this.beams.end();
    this.rings.end();
  }

  private updateWild(f: CreatureFrame, wild: readonly WildCreature[], simTime: number): void {
    const t = f.time;
    const stamp = ++this.stamp;
    const p = f.player;
    for (const c of wild) {
      let w = this.wild.get(c.uid);
      if (!w) {
        const body = makeCreatureMesh(c);
        body.castShadow = f.shadows;
        const a = newAnim(body, c, 1.5, t);
        w = Object.assign(a, { stamp, base: c.pos.clone(), born: t - Math.max(0, simTime - c.bornAt), featured: c.featured });
        this.wild.set(c.uid, w);
        this.group.add(body);
      }
      w.stamp = stamp;
      w.base.copy(c.pos);
    }
    // Remove creatures no longer in the sim (collected ones were moved to pendingPickups already).
    for (const [uid, w] of this.wild) {
      if (w.stamp === stamp) continue;
      this.group.remove(w.body);
      w.body.material.dispose();
      this.wild.delete(uid);
    }

    this.sparkleT -= f.dt;
    const sparkle = this.sparkleT <= 0 && !f.reduceMotion;
    if (sparkle) this.sparkleT = 0.18;
    // Nearest-first assignment of outlines and billboards (no sorting: a few passes over a small map).
    let outlineN = 0;
    let spriteN = 0;
    for (const w of this.wild.values()) {
      const dx = w.base.x - p.x;
      const dz = w.base.z - p.z;
      const dist = Math.hypot(dx, dz);
      const visible = dist < 170;
      w.body.visible = visible;
      if (!visible) continue;
      // Face the player within 8 m, otherwise look around ±40° every 3–5 s.
      if (dist < 8) w.yawTarget = Math.atan2(p.x - w.base.x, p.z - w.base.z);
      else if (t > w.lookAt) {
        w.lookAt = t + 3 + Math.random() * 2;
        w.yawTarget = w.yaw + (Math.random() * 2 - 1) * 40 * DEG;
      }
      animate(w, w.base, t, f.dt, f.reduceMotion, dist < 40 ? this.particles : null);
      // Pop in after a spawn.
      const age = t - w.born;
      if (age < 0.45) {
        const k = easeBack(age / 0.45);
        w.body.scale.multiplyScalar(Math.max(0.01, k));
      }
      // Grow in over 170 → 150 m instead of popping at the cut-off.
      if (dist > 150) w.body.scale.multiplyScalar(Math.max(0.01, (170 - dist) / 20));
      const mat = w.body.material;
      if (mat.userData.flash.value > 0) mat.userData.flash.value = Math.max(0, mat.userData.flash.value - f.dt / 0.06);
      if (dist > 80) continue;
      // Glow disc, rare beam, legendary ring (additive: the colour is the alpha, faded in over 80 → 68 m).
      const fade = clamp((80 - dist) / 12, 0, 1);
      const rc = rarityColors[w.rarity];
      tmpS.setScalar(1.9 * w.scale);
      tmpS.y = 1;
      tmpQ.identity();
      tmpM.compose(tmpV.set(w.base.x, w.base.y + 0.04, w.base.z), tmpQ, tmpS);
      this.glow.add(tmpM, tmpC.copy(rc).multiplyScalar(0.85 * fade));
      if (w.rarity >= 2 || w.mutation > 0) {
        tmpQ.setFromAxisAngle(UP, t * 0.5 + w.yaw);
        tmpS.set(1.1 * w.scale, 6 + w.rarity * 3, 1.1 * w.scale);
        tmpM.compose(tmpV.set(w.base.x, w.base.y, w.base.z), tmpQ, tmpS);
        this.beams.add(tmpM, tmpC.copy(rc).multiplyScalar(fade));
      }
      if (w.rarity >= 4) {
        const k = ((t + w.yaw) % 1.2) / 1.2;
        tmpQ.identity();
        tmpS.setScalar(Math.min(1.6, w.scale) * (0.8 + 1.2 * k));
        tmpM.compose(tmpV.set(w.base.x, w.base.y + 0.06, w.base.z), tmpQ, tmpS);
        this.rings.add(tmpM, tmpC.copy(rc).multiplyScalar((1 - k) * fade));
      }
      // G13: Diamond twinkles and Rainbow sparkle trail, near the player only.
      if (sparkle && dist < 40 && (w.mutation === 2 || w.mutation === 3)) {
        const a = Math.random() * TAU;
        const r = 0.5 * w.scale;
        const y = w.body.position.y + Math.random() * w.height;
        const col = w.mutation === 2 ? '#9FF6FF' : RAINBOW[(Math.random() * RAINBOW.length) | 0];
        this.particles.emit(w.body.position.x + Math.cos(a) * r, y, w.body.position.z + Math.sin(a) * r, 0, 0.6, 0, col, 0.22, 0.5, w.mutation === 3 ? 1.5 : 0, true);
      }
      if (dist < 60) this.blobs.add(w.body.position.x, w.base.y, w.body.position.z, w.body.position.y - w.base.y, 1.6 * w.scale);
      if (dist < f.outlineRange && outlineN < this.outlines.length) {
        const o = this.outlines[outlineN++];
        o.geometry = creatureOutline(w.speciesId);
        w.body.updateMatrix();
        o.matrix.copy(w.body.matrix);
        o.visible = true;
      }
      if (dist < f.billboardRange && spriteN < this.sprites.length) {
        const s = this.sprites[spriteN++];
        const tex = wildBillboard(w, w.featured);
        if (s.material.map !== tex) {
          s.material.map = tex;
          s.material.needsUpdate = true;
        }
        s.material.opacity = clamp((f.billboardRange - dist) / 3, 0, 1);
        s.position.set(w.base.x, w.base.y + w.height + 0.9, w.base.z);
        // Keep the name tag about the size it has at 14 m when the camera gets closer (it filled the view).
        const k = clamp(f.camera.position.distanceTo(s.position) / 14, 0.5, 1);
        s.scale.set(3.2 * k, 1.28 * k, 1);
        s.position.y += 0.64 * (k - 1);
        s.visible = true;
      }
    }
    for (let i = outlineN; i < this.outlines.length; i++) this.outlines[i].visible = false;
    for (let i = spriteN; i < this.sprites.length; i++) this.sprites[i].visible = false;
  }

  private updateCarried(f: CreatureFrame, carried: readonly CreatureRef[], headTop: Matrix4, playerQuat: Quaternion, vel: Vector3): void {
    const t = f.time;
    // Acceleration for the stack wobble (local to the player).
    if (f.dt > 0) {
      tmpV.copy(vel).sub(this.lastVel).divideScalar(Math.max(f.dt, 1 / 240));
      this.accel.lerp(tmpV, 1 - Math.exp(-f.dt * 20));
    }
    this.lastVel.copy(vel);

    // Sync with the sim's carried list.
    if (this.deliverPending || carried.length < this.carried.length) {
      const toDeliver = this.deliverPending;
      this.deliverPending = false;
      while (this.carried.length > carried.length) {
        const it = this.carried.pop()!;
        if (toDeliver) this.delivering.push({ a: it, from: it.body.position.clone() });
        else {
          this.particles.burst(it.body.position, '#FFFFFF', 10, { speed: 5, up: 3, size: 0.25, life: 0.5 });
          this.group.remove(it.body);
          it.body.material.dispose();
        }
      }
    }
    while (this.carried.length < carried.length) {
      const c = carried[this.carried.length];
      let a: Anim | null = null;
      let from: Vector3 | null = null;
      for (const [uid, pick] of this.pendingPickups) {
        if (pick.speciesId === c.speciesId && pick.mutation === c.mutation) {
          a = pick;
          from = pick.body.position.clone();
          this.pendingPickups.delete(uid);
          break;
        }
      }
      if (!a) {
        const body = makeCreatureMesh(c);
        this.group.add(body);
        a = newAnim(body, c, 1, t);
      }
      a.body.castShadow = f.shadows;
      this.carried.push(Object.assign(a, { key: `${c.speciesId}:${c.mutation}`, flyFrom: from, flyT: 0, wobX: 0, wobXv: 0, wobZ: 0, wobZv: 0, land: 0 }));
    }
    // Unclaimed pickups (e.g. hands full) just poof.
    for (const [uid, pick] of this.pendingPickups) {
      this.group.remove(pick.body);
      pick.body.material.dispose();
      this.pendingPickups.delete(uid);
    }

    // Local acceleration in the player's frame.
    tmpQ.copy(playerQuat).invert();
    tmpV2.copy(this.accel).applyQuaternion(tmpQ);
    // FTUE practice wave: float off (0.9 s), then snap back with a pop.
    let float = 0;
    if (this.practiceT >= 0) {
      const pk = (t - this.practiceT) / 0.9;
      if (pk >= 1) {
        this.practiceT = -1;
        this.practicePop = t;
        for (const it of this.carried) {
          this.particles.burst(it.body.position, '#FFFFFF', 6, { speed: 4, up: 2, size: 0.3, life: 0.4, additive: true, gravity: 0, drag: 3 });
        }
      } else float = easeOut(Math.min(1, pk / 0.6)) * (pk > 0.85 ? 1 - (pk - 0.85) / 0.15 : 1);
    }
    let stackY = 0;
    for (let i = 0; i < this.carried.length; i++) {
      const it = this.carried[i];
      const scale = 0.62 * speciesScale(it.speciesId);
      // Stack step from the real model height (tall species no longer sink into the one below).
      const step = Math.max(0.62, speciesHeight(it.speciesId) * 0.9) * scale;
      // Wobble spring: rot = −k × accel (k .015, clamp .35), spring k 120, damping 10, amplitude × (1 + .35 i).
      const amp = 1 + 0.35 * i;
      const tx = clamp(-0.015 * tmpV2.z * amp, -0.35, 0.35);
      const tz = clamp(0.015 * tmpV2.x * amp, -0.35, 0.35);
      const h = Math.min(f.dt, 0.05);
      it.wobXv += (-120 * (it.wobX - tx) - 10 * it.wobXv) * h;
      it.wobX += it.wobXv * h;
      it.wobZv += (-120 * (it.wobZ - tz) - 10 * it.wobZv) * h;
      it.wobZ += it.wobZv * h;
      tmpM.copy(headTop);
      tmpV.set(0, stackY, 0).applyMatrix4(tmpM);
      const target = tmpV;
      it.body.quaternion.setFromRotationMatrix(tmpM);
      tmpQ.setFromAxisAngle(tmpS.set(1, 0, 0), it.wobX);
      it.body.quaternion.multiply(tmpQ);
      tmpQ.setFromAxisAngle(tmpS.set(0, 0, 1), it.wobZ);
      it.body.quaternion.multiply(tmpQ);
      tmpQ.setFromAxisAngle(UP, Math.sin(t * 2 + i) * 0.25);
      it.body.quaternion.multiply(tmpQ);
      let s = scale;
      if (it.flyFrom) {
        // Pop 1 → 1.35 → 1 over 180 ms, then a 300 ms arc (apex +2 m) onto the stack.
        it.flyT += f.dt;
        const popK = it.flyT / 0.18;
        if (popK < 1) {
          const ws = 1.5 * speciesScale(it.speciesId);
          it.body.scale.setScalar(ws * (1 + 0.35 * Math.sin(Math.PI * popK)));
          it.body.position.copy(it.flyFrom);
          it.body.material.userData.flash.value = Math.max(0, 1 - it.flyT / 0.06);
          stackY += step;
          continue;
        }
        const k = Math.min(1, (it.flyT - 0.18) / 0.3);
        const e = easeInOut(k);
        it.body.position.lerpVectors(it.flyFrom, target, e);
        it.body.position.y += 2 * Math.sin(Math.PI * k);
        const ws = 1.5 * speciesScale(it.speciesId);
        s = ws + (scale - ws) * e;
        if (k >= 1) {
          it.flyFrom = null;
          it.land = t;
        }
      } else it.body.position.copy(target);
      if (float > 0) {
        // Up and outward, spread by stack index, with a slow spin.
        const a = i * 2.1 + t * 1.5;
        it.body.position.x += Math.cos(a) * (0.6 + 0.3 * i) * float;
        it.body.position.z += Math.sin(a) * (0.6 + 0.3 * i) * float;
        it.body.position.y += (1.6 + 0.25 * i) * float;
        tmpQ.setFromAxisAngle(UP, float * 2.5);
        it.body.quaternion.multiply(tmpQ);
      }
      const lk = (t - it.land) / 0.08;
      const sq = it.land > 0 && lk < 1 ? 1 - 0.15 * Math.sin(Math.PI * lk) : 1;
      // The 1.35 → 1 pop when the stack snaps back after the practice wave.
      const pk = t - this.practicePop;
      const pop = this.practicePop >= 0 && pk < 0.25 ? 1 + 0.35 * (1 - pk / 0.25) : 1;
      it.body.scale.set((s * pop) / Math.sqrt(sq), s * sq * pop, (s * pop) / Math.sqrt(sq));
      it.body.material.userData.flash.value = 0;
      stackY += step;
      // Blink.
      animateBlink(it, t);
    }
  }

  private updateBase(f: CreatureFrame, slots: readonly (CreatureRef | null)[], multiplier: number, slotCount: number): void {
    const t = f.time;
    const n = Math.min(MAX_PEDESTALS, slots.length, slotCount);
    let changed = multiplier !== this.labelMult;
    this.labelMult = multiplier;
    for (let i = 0; i < Math.max(n, this.base.length); i++) {
      const c = i < n ? slots[i] : null;
      const cur = this.base[i] ?? null;
      // Same object: nothing changed (no string keys per frame).
      if ((cur?.ref ?? null) === c) continue;
      const key = c ? `${c.speciesId}:${c.mutation}` : '';
      if ((cur?.key ?? '') === key) {
        if (cur && c) cur.ref = c;
        continue;
      }
      changed = true;
      if (cur) {
        this.group.remove(cur.a.body);
        cur.a.body.material.dispose();
        this.base[i] = null;
      }
      if (!c) continue;
      const p = this.course.pedestals[i];
      // Reuse a delivering creature that matches, flying it from the head.
      let fly: Fly | null = null;
      let a: Anim | null = null;
      const di = this.delivering.findIndex((d) => d.a.speciesId === c.speciesId && d.a.mutation === c.mutation);
      if (di >= 0) {
        const d = this.delivering.splice(di, 1)[0];
        a = d.a;
        let stagger = 0;
        for (const b of this.base) if (b?.fly) stagger++;
        tmpE.setFromQuaternion(a.body.quaternion, 'YXZ');
        fly = { from: d.from, t: 0, dur: 0.35 + stagger * 0.1, s0: a.body.scale.y, yaw0: tmpE.y };
        const fresh = newAnim(a.body, c, 1.3, t);
        a = Object.assign(a, { scale: fresh.scale, height: fresh.height });
      } else {
        const body = makeCreatureMesh(c);
        this.group.add(body);
        a = newAnim(body, c, 1.3, t);
        this.particles.burst(tmpV.set(p.x, HOME_TOP + 1, p.z), RARITIES[a.rarity].color, 10, { speed: 4, up: 3, size: 0.22, life: 0.5 });
      }
      a.body.castShadow = f.shadows;
      a.yaw = a.yawTarget = Math.PI + Math.atan2(-p.x, 12) * 0.4;
      this.base[i] = { key, ref: c, a, fly, pulse: -1 };
    }
    // Sold or unmatched deliveries poof.
    for (const d of this.delivering) {
      this.particles.burst(d.from, '#FFC92E', 10, { speed: 5, up: 3, size: 0.22, life: 0.5 });
      this.group.remove(d.a.body);
      d.a.body.material.dispose();
    }
    this.delivering.length = 0;

    // Beat bob: y = .08 × (1 − |sin(π × beatPhase)|); neighbours alternate by half a beat. Fallback 112 BPM.
    const beat = Number.isFinite(f.beatPhase) ? f.beatPhase : (t * 112) / 60;
    const nearHome = f.player.z > this.course.home.min.z - 30;
    this.coinTimer += f.dt;
    for (let i = 0; i < this.base.length; i++) {
      const b = this.base[i];
      if (!b) continue;
      const p = this.course.pedestals[i];
      const topY = HOME_TOP + 0.4;
      tmpV.set(p.x, topY, p.z);
      if (b.fly) {
        const fl = b.fly;
        fl.t += f.dt;
        const k = clamp(fl.t / fl.dur, 0, 1);
        const e = easeInOut(k);
        b.a.body.position.lerpVectors(fl.from, tmpV, e);
        b.a.body.position.y += 2.5 * Math.sin(Math.PI * k);
        b.a.body.scale.setScalar(fl.s0 + (b.a.scale - fl.s0) * e);
        b.a.body.rotation.set(0, fl.yaw0 + wrapAngle(b.a.yawTarget - fl.yaw0) * e, 0, 'YXZ');
        if (k >= 1) {
          b.fly = null;
          b.pulse = t;
          this.particles.burst(tmpV2.set(p.x, topY + 0.6, p.z), RARITIES[b.a.rarity].color, 14, { speed: 5, up: 3, size: 0.24, life: 0.6 });
          this.particles.burst(tmpV2, '#FFFFFF', 4, { speed: 3, up: 2, size: 0.4, life: 0.5, additive: true, gravity: 0 });
        }
        continue;
      }
      // Face the player while they are on the home island (like pets watching you), else the default pose.
      {
        const dx = f.player.x - p.x;
        const dz = f.player.z - p.z;
        const d = Math.hypot(dx, dz);
        b.a.yawTarget = d > 1.2 && d < 22 ? Math.atan2(dx, dz) : Math.PI + Math.atan2(-p.x, 12) * 0.4;
      }
      const ph = (beat + (i % 2) * 0.5) % 1;
      const bob = 0.08 * (1 - Math.abs(Math.sin(Math.PI * ph)));
      const land = b.pulse >= 0 ? (t - b.pulse) / 0.12 : 1;
      animate(b.a, tmpV.set(p.x, topY + (f.reduceMotion ? 0 : bob), p.z), t, f.dt, f.reduceMotion, null);
      if (land < 1) {
        const sq = 1 - 0.15 * Math.sin(Math.PI * land);
        b.a.body.scale.multiply(tmpS.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq)));
      }
      // Glow disc on the podium and the deliver ring pulse (1 → 1.6, fade 400 ms).
      const rc = rarityColors[b.a.rarity];
      tmpQ.identity();
      tmpS.set(2.6, 1, 2.6);
      tmpM.compose(tmpV2.set(p.x, topY + 0.02, p.z), tmpQ, tmpS);
      this.glow.add(tmpM, tmpC.copy(rc).multiplyScalar(0.7));
      if (b.pulse >= 0 && t - b.pulse < 0.4) {
        const k = (t - b.pulse) / 0.4;
        tmpS.setScalar(1.1 * (1 + 0.6 * k));
        tmpM.compose(tmpV2, tmpQ, tmpS);
        this.rings.add(tmpM, tmpC.copy(rc).multiplyScalar(1 - k));
      }
      // Coin pops every 2 s per pedestal, phase-offset by i × 370 ms, near home.
      if (nearHome && f.dt > 0) {
        const period = 2;
        const prev = (this.coinTimer - f.dt + i * 0.37) % period;
        const now = (this.coinTimer + i * 0.37) % period;
        if (now < prev && this.coinSlots[i]) this.particles.emit(p.x, topY + b.a.height + 0.3, p.z, 0, 1.6, 0, '#FFC92E', 0.25, 0.5, 0);
      }
    }

    if (changed) {
      const entries: { slot: number; pos: Vector3; c: CreatureRef; income: string }[] = [];
      for (let i = 0; i < this.base.length; i++) {
        const b = this.base[i];
        const c = i < n ? slots[i] : null;
        if (!b || !c) continue;
        const p = this.course.pedestals[i];
        entries.push({ slot: i, pos: new Vector3(p.x, HOME_TOP + 0.4 + b.a.height + 0.55, p.z), c, income: formatIncome(creatureIncome(c) * multiplier) });
      }
      this.labels.set(entries);
      // Coin pops: every filled pedestal, or only the 6 best earners once more than 10 are filled.
      this.coinSlots.fill(0);
      const ranked = entries.map((e) => ({ i: e.slot, v: creatureIncome(e.c) })).sort((x, y) => y.v - x.v);
      ranked.forEach((r, k) => {
        if (ranked.length <= 10 || k < 6) this.coinSlots[r.i] = 1;
      });
    }
    this.updateLabelFocus(f);
  }

  /** Full label for the pedestal the player stands at (or a tapped one); the rest show the income tag only. */
  private updateLabelFocus(f: CreatureFrame): void {
    const cam = f.camera;
    const pd = -tmpV.copy(f.player).applyMatrix4(cam.matrixWorldInverse).z;
    this.labels.setPlayerDepth(pd);
    let best = -1;
    if (this.tapped >= 0 && f.time < this.tappedUntil && this.base[this.tapped]) best = this.tapped;
    else {
      let bestD = 6.5;
      for (let i = 0; i < this.base.length; i++) {
        if (!this.base[i]) continue;
        const p = this.course.pedestals[i];
        const d = Math.hypot(p.x - f.player.x, p.z - f.player.z);
        if (d >= bestD) continue;
        // Not one between the camera and the player (its label would cover the player).
        if (-tmpV.set(p.x, p.y + 2, p.z).applyMatrix4(cam.matrixWorldInverse).z < pd - 2) continue;
        bestD = d;
        best = i;
      }
    }
    this.labels.setFocus(best, f.dt);
  }
}

function animateBlink(a: Anim, t: number): void {
  const u = a.body.material.userData;
  if (a.blinkStart < 0 && t >= a.blinkAt) a.blinkStart = t;
  if (a.blinkStart >= 0) {
    const bt = t - a.blinkStart;
    u.blink.value = bt < 0.045 ? bt / 0.045 : bt < 0.09 ? 1 - (bt - 0.045) / 0.045 : 0;
    if (bt >= 0.09) {
      a.blinkStart = -1;
      a.blinkAt = t + 2.5 + Math.random() * 2.5;
    }
  }
}

/** Ground height under a point (island top or sea level). */
export function groundUnder(course: Course, x: number, z: number, y: number): number {
  return groundHeightAt(course, x, z, y + 0.05);
}
