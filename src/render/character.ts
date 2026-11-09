import {
  Bone,
  Group,
  Matrix4,
  Mesh,
  MeshToonMaterial,
  Object3D,
  PlaneGeometry,
  Quaternion,
  Skeleton,
  SkinnedMesh,
  Vector3,
} from 'three';
import type { PlayerSim } from '../game/player';
import { BoxBuilder } from './boxes';
import { faceAtlas, faceOffset, type Expression } from './faces';
import { clamp, easeInOut, easeOut, Spring } from './juice';
import { inkMaterial, toonGradient, toonVertexMaterial } from './materials';

const SKIN = '#F6C9A0';
const SHIRT = '#FF7B39';
const SHIRT_DARK = '#D9542A';
const PANTS = '#2E4C7D';
const SHOES = '#20232B';
const CAP = '#19B5A5';
const CAP_DARK = '#118A7E';

// Bones.
const B_ROOT = 0;
const B_HIPS = 1;
const B_SPINE = 2;
const B_HEAD = 3;
const B_ARM_L = 4;
const B_ARM_R = 5;
const B_LEG_L = 6;
const B_LEG_R = 7;

// Pose channels.
const HIP_Y = 0;
const LEAN = 1;
const ROLL = 2;
const HEAD_YAW = 3;
const HEAD_PITCH = 4;
const AL_X = 5;
const AL_Z = 6;
const AR_X = 7;
const AR_Z = 8;
const LL_X = 9;
const LR_X = 10;
const CH = 11;

type PoseId = 'idle' | 'run' | 'swing' | 'air' | 'fall' | 'sit';
const POSES: PoseId[] = ['idle', 'run', 'swing', 'air', 'fall', 'sit'];

export type Celebration = 'deliver' | 'legendary' | 'cheer';
const CELEBRATION_MS: Record<Celebration, number> = { deliver: 600, legendary: 700, cheer: 900 };

export interface CharacterContext {
  time: number;
  splashed: boolean;
  carrying: boolean;
  /** Wave front within 40 m (panic face). */
  panic: boolean;
  reduceMotion: boolean;
}

const UP = new Vector3(0, 1, 0);
const X_AXIS = new Vector3(1, 0, 0);
const tmpQ = new Quaternion();
const tmpQ2 = new Quaternion();
const tmpV = new Vector3();
const tmpV2 = new Vector3();
const tmpM = new Matrix4();
const tmpX = new Vector3();
const tmpZ = new Vector3();

function buildBody(b: BoxBuilder): void {
  // Legs (pivot at hips, y .8).
  for (const [side, bone] of [[-1, B_LEG_L], [1, B_LEG_R]] as const) {
    b.box(side * 0.21, 0.46, 0, 0.38, 0.68, 0.38, PANTS, { bone, shadeBottom: 0.15 });
    b.box(side * 0.21, 0.06, 0.04, 0.4, 0.12, 0.48, SHOES, { bone });
  }
  // Torso.
  b.box(0, 1.2, 0, 0.84, 0.8, 0.46, SHIRT, { bone: B_SPINE, shadeBottom: 0.12 });
  b.box(0, 0.86, 0, 0.86, 0.12, 0.48, PANTS, { bone: B_SPINE, noOutline: true });
  b.box(0, 1.25, 0.235, 0.3, 0.5, 0.02, SHIRT_DARK, { bone: B_SPINE, noOutline: true });
  // Arms (pivot at shoulders y 1.55), darker sleeve band.
  for (const [side, bone] of [[-1, B_ARM_L], [1, B_ARM_R]] as const) {
    b.box(side * 0.57, 1.37, 0, 0.3, 0.36, 0.3, SHIRT, { bone });
    b.box(side * 0.57, 1.15, 0, 0.31, 0.08, 0.31, SHIRT_DARK, { bone, noOutline: true });
    b.box(side * 0.57, 0.96, 0, 0.28, 0.34, 0.28, SKIN, { bone });
  }
  // Head .78 with a cap (pivot at the neck, y 1.6).
  b.box(0, 1.99, 0, 0.78, 0.78, 0.78, SKIN, { bone: B_HEAD });
  b.box(0, 2.42, 0, 0.82, 0.14, 0.82, CAP, { bone: B_HEAD });
  b.box(0, 2.37, 0.52, 0.66, 0.06, 0.3, CAP_DARK, { bone: B_HEAD });
  b.box(0, 2.52, 0, 0.12, 0.06, 0.12, CAP_DARK, { bone: B_HEAD, noOutline: true });
}

/**
 * The blocky player (G12): one skinned toon mesh, an ink outline hull and a face decal (3 draws).
 * Poses are joint targets cross-faded linearly (§5.2), with celebrations, squash/stretch and the release flip on top.
 */
export class Character {
  readonly root = new Group();
  /** Carried creatures stack on this (follows the head). */
  readonly headTop = new Object3D();
  readonly body: SkinnedMesh;
  private readonly outline: SkinnedMesh;
  private readonly face: Mesh;
  private readonly faceMat: MeshToonMaterial;
  private readonly pivot = new Group();
  private readonly bones: Bone[] = [];
  private readonly rest: Vector3[] = [];

  private readonly weights = new Float32Array(POSES.length);
  private readonly values = new Float32Array(POSES.length * CH);
  private readonly blended = new Float32Array(CH);
  private pose: PoseId = 'idle';
  private fadeRate = 1 / 0.12;
  private runPhase = 0;
  private windmill = 0;
  private fallTime = 0;
  private idleTime = 0;
  private carryW = 0;
  private flipT = -1;
  private splashSpin = 0;
  private xEyesUntil = -1;
  private expression: Expression | null = null;
  private readonly squash = new Spring(1, 400, 18);
  private stretchUntil = -1;
  private celebration: Celebration | null = null;
  private celebrationT = 0;
  private readonly targetQuat = new Quaternion();
  private lastTime = 0;

  constructor() {
    const b = new BoxBuilder();
    buildBody(b);
    const geo = b.build();
    const outlineGeo = b.outline(0.04);

    const pivots: [number, number, number, number][] = [
      [B_ROOT, 0, 0, 0],
      [B_HIPS, 0, 0.8, 0],
      [B_SPINE, 0, 0.8, 0],
      [B_HEAD, 0, 1.6, 0],
      [B_ARM_L, -0.57, 1.55, 0],
      [B_ARM_R, 0.57, 1.55, 0],
      [B_LEG_L, -0.21, 0.8, 0],
      [B_LEG_R, 0.21, 0.8, 0],
    ];
    const parent = [-1, B_ROOT, B_HIPS, B_SPINE, B_SPINE, B_SPINE, B_HIPS, B_HIPS];
    for (const [i, x, y, z] of pivots) {
      const bone = new Bone();
      const pi = parent[i];
      const p = pi >= 0 ? pivots[pi] : [0, 0, 0, 0];
      bone.position.set(x - p[1], y - p[2], z - p[3]);
      this.rest[i] = bone.position.clone();
      if (pi >= 0) this.bones[pi].add(bone);
      this.bones[i] = bone;
    }
    this.root.add(this.pivot);
    this.pivot.position.y = 1;
    const holder = new Group();
    holder.position.y = -1;
    this.pivot.add(holder);
    holder.add(this.bones[B_ROOT]);
    holder.updateMatrixWorld(true);
    const skeleton = new Skeleton(this.bones);

    this.body = new SkinnedMesh(geo, toonVertexMaterial);
    this.body.add(this.bones[B_ROOT]);
    this.body.bind(skeleton);
    this.body.castShadow = true;
    this.body.receiveShadow = true;
    this.body.frustumCulled = false;
    holder.add(this.body);

    this.outline = new SkinnedMesh(outlineGeo, inkMaterial);
    this.outline.bind(skeleton, this.body.bindMatrix);
    this.outline.frustumCulled = false;
    holder.add(this.outline);

    this.faceMat = new MeshToonMaterial({ map: faceAtlas().clone(), alphaTest: 0.5, gradientMap: toonGradient });
    this.faceMat.map!.repeat.set(1 / 6, 1);
    this.faceMat.map!.needsUpdate = true;
    this.face = new Mesh(new PlaneGeometry(0.74, 0.74), this.faceMat);
    this.face.position.set(0, 0.36, 0.396);
    this.bones[B_HEAD].add(this.face);
    this.headTop.position.set(0, 0.92, 0);
    this.bones[B_HEAD].add(this.headTop);
    this.weights[0] = 1;
    this.setExpression('smirk');
  }

  private setExpression(e: Expression): void {
    if (e === this.expression) return;
    this.expression = e;
    this.faceMat.map!.offset.x = faceOffset(e);
  }

  // ---------- Events ----------

  onJump(time: number): void {
    this.stretchUntil = time + 0.1;
    this.fadeRate = 1 / 0.06;
  }

  onLand(vyImpact: number): void {
    this.squash.set(1 - clamp(vyImpact / 30, 0, 0.3));
    this.fadeRate = 1 / 0.12;
  }

  onRelease(speed: number, reduceMotion: boolean): void {
    if (speed > 16 && !reduceMotion) this.flipT = 0;
  }

  onSplash(time: number): void {
    this.xEyesUntil = time + 1.6;
  }

  celebrate(kind: Celebration): void {
    this.celebration = kind;
    this.celebrationT = 0;
  }

  /** World position between the raised hands (where the rope attaches). */
  handPosition(out: Vector3): Vector3 {
    tmpV.set(0, -0.78, 0).applyMatrix4(this.bones[B_ARM_L].matrixWorld);
    out.set(0, -0.78, 0).applyMatrix4(this.bones[B_ARM_R].matrixWorld);
    return out.add(tmpV).multiplyScalar(0.5);
  }

  // ---------- Per frame ----------

  update(dt: number, sim: PlayerSim, c: CharacterContext): void {
    const t = c.time;
    this.lastTime = t;
    this.root.position.copy(sim.pos);
    const hs = Math.hypot(sim.vel.x, sim.vel.z);
    const speed = sim.vel.length();
    const yaw = Math.atan2(sim.facing.x, sim.facing.z);

    // Which base pose.
    let next: PoseId;
    if (sim.mode === 'ground') {
      this.fallTime = 0;
      if (hs > 0.6) {
        this.idleTime = 0;
        next = 'run';
      } else {
        this.idleTime += dt;
        next = this.idleTime > 15 && !c.carrying ? 'sit' : 'idle';
      }
    } else {
      this.idleTime = 0;
      if (sim.mode === 'swing') {
        this.fallTime = 0;
        next = 'swing';
      } else {
        this.fallTime = sim.vel.y < -8 ? this.fallTime + dt : 0;
        next = this.fallTime > 0.8 ? 'fall' : 'air';
      }
    }
    if (next !== this.pose) {
      if (this.pose === 'sit') this.fadeRate = 1 / 0.2;
      this.pose = next;
    }
    const rate = this.fadeRate * dt;
    for (let i = 0; i < POSES.length; i++) {
      const w = this.weights[i];
      this.weights[i] = POSES[i] === this.pose ? Math.min(1, w + rate) : Math.max(0, w - rate);
    }
    if (this.weights[POSES.indexOf(this.pose)] >= 1) this.fadeRate = this.pose === 'sit' ? 1 / 0.3 : 1 / 0.12;

    // Pose values.
    const carryAmp = c.carrying ? 0.25 : 1;
    this.runPhase += dt * hs * 0.9 * 1.5;
    this.windmill += dt * 9;
    const v = this.values;
    v.fill(0);
    let o = 0; // idle
    const breath = Math.sin(Math.PI * 2 * 1.5 * t);
    v[o + HIP_Y] = 0.03 * breath;
    v[o + AL_X] = 0.04 * breath;
    v[o + AR_X] = 0.04 * breath;
    v[o + AL_Z] = -0.08;
    v[o + AR_Z] = 0.08;
    if (this.idleTime > 5) {
      // Look-around fidget: 0 → +35° → −35° → 0 over 1.8 s, every 8 s.
      const ph = (this.idleTime - 5) % 8;
      if (ph < 1.8) {
        const k = ph / 1.8;
        const deg = k < 0.33 ? easeInOut(k / 0.33) * 35 : k < 0.66 ? 35 - easeInOut((k - 0.33) / 0.33) * 70 : -35 + easeInOut((k - 0.66) / 0.34) * 35;
        v[o + HEAD_YAW] = (deg * Math.PI) / 180;
      }
    }
    o = CH; // run
    const amt = Math.min(1, hs / 7);
    const legs = Math.sin(this.runPhase) * 0.9 * amt;
    v[o + HIP_Y] = Math.abs(Math.sin(this.runPhase)) * 0.07 * amt;
    v[o + LEAN] = 0.18 * Math.min(1, hs / 12);
    v[o + LL_X] = legs;
    v[o + LR_X] = -legs;
    v[o + AL_X] = -legs * 1.0 * carryAmp;
    v[o + AR_X] = legs * 1.0 * carryAmp;
    v[o + AL_Z] = -0.1;
    v[o + AR_Z] = 0.1;
    o = CH * 2; // swing: both arms straight up, hands together over the cap gripping the rope (arms stretch below)
    v[o + AL_X] = -(Math.PI - 0.08);
    v[o + AR_X] = -(Math.PI - 0.08);
    v[o + AL_Z] = 0.24;
    v[o + AR_Z] = -0.24;
    const apex = speed < 4 ? 1 - speed / 4 : 0;
    const down = sim.vel.y < -2 ? Math.min(1, -sim.vel.y / 10) : 0;
    v[o + LL_X] = -0.6 * apex + 0.5 * down - 0.15;
    v[o + LR_X] = -0.6 * apex + 0.5 * down + 0.05;
    o = CH * 3; // air
    const rising = sim.vel.y > 0;
    v[o + AL_X] = rising ? -0.5 : -0.9;
    v[o + AR_X] = rising ? -0.5 : -0.9;
    v[o + AL_Z] = -0.9;
    v[o + AR_Z] = 0.9;
    v[o + LL_X] = rising ? -0.5 : 0.2;
    v[o + LR_X] = rising ? 0.3 : -0.25;
    o = CH * 4; // fall: windmill arms
    v[o + AL_X] = this.windmill % (Math.PI * 2);
    v[o + AR_X] = (this.windmill + Math.PI) % (Math.PI * 2);
    v[o + AL_Z] = -0.5;
    v[o + AR_Z] = 0.5;
    v[o + LL_X] = Math.sin(t * 12) * 0.5;
    v[o + LR_X] = -Math.sin(t * 12) * 0.5;
    o = CH * 5; // sit
    v[o + HIP_Y] = -0.5;
    v[o + LL_X] = -1.4;
    v[o + LR_X] = -1.4;
    v[o + AL_X] = 0.5;
    v[o + AR_X] = 0.5;
    v[o + AL_Z] = -0.25;
    v[o + AR_Z] = 0.25;
    v[o + LEAN] = -0.12;

    let wsum = 0;
    const out = this.blended;
    out.fill(0);
    for (let i = 0; i < POSES.length; i++) {
      const w = this.weights[i];
      if (w <= 0) continue;
      wsum += w;
      for (let k = 0; k < CH; k++) out[k] += v[i * CH + k] * w;
    }
    if (wsum > 0) for (let k = 0; k < CH; k++) out[k] /= wsum;

    // Carry: arms raised to 2.6 rad, holding the stack (not while swinging, where the arms hold the rope).
    const carryW = c.carrying && this.pose !== 'swing' && this.pose !== 'fall' ? 1 : 0;
    this.carryW += ((carryW ? 1 : 0) - this.carryW) * Math.min(1, dt / 0.12);
    const cw = this.carryW;
    if (cw > 0.001) {
      out[AL_X] = out[AL_X] * (1 - cw) + (-2.6 + out[AL_X] * 0.25) * cw;
      out[AR_X] = out[AR_X] * (1 - cw) + (-2.6 + out[AR_X] * 0.25) * cw;
      out[AL_Z] = out[AL_Z] * (1 - cw) + 0.25 * cw;
      out[AR_Z] = out[AR_Z] * (1 - cw) - 0.25 * cw;
    }

    // Celebration layer.
    let hop = 0;
    let celebrating = false;
    if (this.celebration) {
      this.celebrationT += dt;
      const dur = CELEBRATION_MS[this.celebration] / 1000;
      const k = this.celebrationT / dur;
      if (k >= 1) this.celebration = null;
      else {
        celebrating = true;
        const w = k < 0.15 ? k / 0.15 : k > 0.8 ? (1 - k) / 0.2 : 1;
        const lerpCh = (ch: number, target: number) => (out[ch] = out[ch] * (1 - w) + target * w);
        if (this.celebration === 'deliver') {
          lerpCh(AL_X, -Math.PI);
          lerpCh(AR_X, -Math.PI);
          lerpCh(AL_Z, 0.15);
          lerpCh(AR_Z, -0.15);
          hop = c.reduceMotion ? 0 : Math.sin(Math.PI * k) * 0.4;
        } else if (this.celebration === 'legendary') {
          lerpCh(AR_X, -2.8 + Math.sin(this.celebrationT * Math.PI * 2 * 5) * 0.3);
          lerpCh(AR_Z, -0.1);
        } else {
          lerpCh(AL_X, -Math.PI + 0.2);
          lerpCh(AR_X, -Math.PI + 0.2);
          lerpCh(AL_Z, 0.35);
          lerpCh(AR_Z, -0.35);
          hop = c.reduceMotion ? 0 : Math.abs(Math.sin(Math.PI * 2 * k)) * 0.3;
        }
      }
    }

    // Apply to bones.
    const bn = this.bones;
    bn[B_HIPS].position.y = this.rest[B_HIPS].y + out[HIP_Y] + hop;
    bn[B_SPINE].rotation.set(out[LEAN], 0, out[ROLL]);
    bn[B_HEAD].rotation.set(out[HEAD_PITCH], out[HEAD_YAW], 0, 'YXZ');
    bn[B_ARM_L].rotation.set(out[AL_X], 0, out[AL_Z]);
    bn[B_ARM_R].rotation.set(out[AR_X], 0, out[AR_Z]);
    // Toon stretch on the rope: the arms reach 1.5× so the hands (and the rope) sit above the cap, where the
    // camera behind the player can see the grip. Without it the hands stop at ear height and the rope seems
    // to come out of the head.
    const stretch = 1 + 0.5 * this.weights[2];
    bn[B_ARM_L].scale.set(1, stretch, 1);
    bn[B_ARM_R].scale.set(1, stretch, 1);
    bn[B_LEG_L].rotation.set(out[LL_X], 0, 0);
    bn[B_LEG_R].rotation.set(out[LR_X], 0, 0);

    // Orientation: upright facing travel, or hanging toward the anchor while swinging.
    const k = 1 - Math.exp(-dt * 14);
    if (sim.mode === 'swing' && sim.anchor) {
      const ropeDir = tmpV2.copy(sim.anchor.pos).sub(sim.pos);
      ropeDir.y -= 1.2;
      ropeDir.normalize();
      tmpZ.set(sim.facing.x, 0, sim.facing.z);
      tmpX.crossVectors(ropeDir, tmpZ);
      // Rope along the facing (a hook level with the player, straight ahead): the basis is undefined and a NaN
      // quaternion would hide the player for good (slerp never recovers). Keep last frame's target.
      if (tmpX.lengthSq() > 1e-8) {
        tmpX.normalize();
        tmpZ.crossVectors(tmpX, ropeDir).normalize();
        tmpM.makeBasis(tmpX, ropeDir, tmpZ);
        this.targetQuat.setFromRotationMatrix(tmpM);
      }
    } else {
      this.targetQuat.setFromAxisAngle(UP, yaw);
    }
    if (c.splashed) {
      this.splashSpin += dt * 9;
      tmpQ.setFromAxisAngle(UP, yaw);
      tmpQ2.setFromAxisAngle(X_AXIS, this.splashSpin);
      this.root.quaternion.copy(tmpQ.multiply(tmpQ2));
    } else {
      this.splashSpin = 0;
      this.root.quaternion.slerp(this.targetQuat, k);
    }

    // Release flip: a forward somersault of 360° over 450 ms.
    if (this.flipT >= 0) {
      this.flipT += dt;
      const f = this.flipT / 0.45;
      if (f >= 1 || sim.mode === 'ground' || sim.mode === 'swing') {
        this.flipT = -1;
        this.pivot.rotation.x = 0;
      } else this.pivot.rotation.x = easeOut(f) * Math.PI * 2;
    } else this.pivot.rotation.x = 0;

    // Squash and stretch.
    let s = this.squash.step(dt);
    if (t < this.stretchUntil) s = Math.max(s, 1.15);
    else if (this.stretchUntil > 0 && t - this.stretchUntil < dt * 1.5) this.squash.set(1.15);
    if (sim.mode !== 'ground' && speed > 15 && !c.splashed) s *= 1 + clamp(speed / 60, 0, 0.25) * 0.6;
    const side = 1 / Math.sqrt(s);
    this.pivot.scale.set(side, s, side);
    // Squash around the feet, not the pivot.
    this.pivot.position.y = s * 1;

    // Face.
    let e: Expression = 'smirk';
    if (t < this.xEyesUntil) e = 'xEyes';
    else if (celebrating) e = 'bigGrin';
    else if (this.pose === 'fall') e = 'oh';
    else if (c.panic) e = 'panic';
    else if (this.pose === 'swing') e = 'bigGrin';
    else if (sim.mode === 'ground' && hs > 8) e = 'grin';
    this.setExpression(e);
  }

  get time(): number {
    return this.lastTime;
  }
}
