import { Euler, PerspectiveCamera, Quaternion, Vector3 } from 'three';
import { clamp, smoothstep } from './juice';

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
const DEG = Math.PI / 180;

function hash(n: number): number {
  const s = Math.sin(n * 127.1) * 43758.5453;
  return s - Math.floor(s);
}
/** Smooth 1D value noise in [-1, 1]. */
function noise(seed: number, t: number): number {
  const i = Math.floor(t);
  const f = t - i;
  const u = f * f * (3 - 2 * f);
  return (hash(i + seed * 57.3) * (1 - u) + hash(i + 1 + seed * 57.3) * u) * 2 - 1;
}
function octaves(seed: number, t: number): number {
  return noise(seed, t) * 0.65 + noise(seed + 11, t * 2.1) * 0.35;
}

const tmpDesired = new Vector3();
const tmpAhead = new Vector3();
const tmpPos = new Vector3();
const shakeQ = new Quaternion();
const shakeE = new Euler();
const right = new Vector3();
const up = new Vector3();

/**
 * Third-person orbit camera with speed FOV, release kicks, look-ahead and trauma shake (§5.2).
 * Drag to rotate, wheel to zoom; while moving it swings behind the player on its own.
 */
export class CameraRig {
  yaw = 0;
  pitch = 0.36;
  distance = 13;
  baseFov = 62;
  reduceMotion = false;
  private readonly target = new Vector3();
  private readonly ahead = new Vector3();
  private lastManual = -10;
  private initialized = false;
  private trauma = 0;
  private speedFov = 0;
  private kickA = 0;
  private kickTau = 0.25;
  private kickB = 0;
  private kickBTau = 0.15;
  private lastFov = 0;
  private shakeT = 0;

  constructor(readonly camera: PerspectiveCamera) {}

  rotate(dx: number, dy: number, time: number): void {
    if (dx === 0 && dy === 0) return;
    this.yaw -= dx * 0.006;
    this.pitch = clamp(this.pitch + dy * 0.005, -0.1, 1.25);
    this.lastManual = time;
  }

  zoom(delta: number): void {
    if (delta) this.distance = clamp(this.distance * (1 + delta * 0.0012), 6, 26);
  }

  snapBehind(dirX: number, dirZ: number): void {
    this.yaw = Math.atan2(-dirX, -dirZ);
  }

  manualRecently(time: number, window = 0.05): boolean {
    return time - this.lastManual < window;
  }

  /** Add camera trauma (0..1). Shake = trauma². */
  addTrauma(t: number): void {
    this.trauma = Math.min(1, this.trauma + t * (this.reduceMotion ? 0.25 : 1));
  }

  /** Keep at least this much trauma this frame (continuous rumble near the surge). */
  holdTrauma(t: number): void {
    const v = t * (this.reduceMotion ? 0.25 : 1);
    if (this.trauma < v) this.trauma = v;
  }

  /** FOV kick in degrees that decays with time constant tau (s). Negative for a landing dip. */
  kickFov(deg: number, tau: number): void {
    if (this.reduceMotion) return;
    if (deg >= 0) {
      this.kickA = Math.max(this.kickA, deg);
      this.kickTau = tau;
    } else {
      this.kickB = Math.min(this.kickB, deg);
      this.kickBTau = tau;
    }
  }

  /** Place the camera without smoothing (sandbox shots, respawn). */
  reset(focus: Vector3): void {
    this.target.set(focus.x, focus.y + 2.2, focus.z);
    this.ahead.set(0, 0, 0);
    this.initialized = true;
  }

  /**
   * @param follow how strongly to swing behind the player's motion (0 = never, e.g. mid-swing).
   * @param swinging smaller look-ahead while on the rope.
   */
  update(dt: number, focus: Vector3, vel: Vector3, time: number, airborne: boolean, follow: number, swinging: boolean): void {
    tmpDesired.set(focus.x, focus.y + 2.2, focus.z);
    if (!this.initialized) {
      this.target.copy(tmpDesired);
      this.initialized = true;
    }
    this.target.lerp(tmpDesired, 1 - Math.exp(-dt * (airborne ? 9 : 14)));

    // Look-ahead: vel × .12 (swinging .06), clamped to 4 m, smoothed τ 200 ms.
    const la = this.reduceMotion ? 0 : swinging ? 0.06 : 0.12;
    tmpAhead.copy(vel).multiplyScalar(la);
    tmpAhead.y *= 0.4;
    if (tmpAhead.length() > 4) tmpAhead.setLength(4);
    this.ahead.lerp(tmpAhead, 1 - Math.exp(-dt / 0.2));

    const hs = Math.hypot(vel.x, vel.z);
    if (follow > 0 && time - this.lastManual > 1.0 && hs > 4) {
      const want = Math.atan2(-vel.x, -vel.z);
      const rate = (airborne ? 2.0 : 1.5) * Math.min(1, hs / 12) * follow;
      this.yaw += wrap(want - this.yaw) * Math.min(1, dt * rate);
    }

    const cp = Math.cos(this.pitch);
    tmpPos.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp).multiplyScalar(this.distance).add(this.target).add(this.ahead);
    tmpPos.y = Math.max(tmpPos.y, 0.8);
    this.camera.position.copy(tmpPos);
    tmpDesired.copy(this.target).add(this.ahead);
    this.camera.lookAt(tmpDesired);

    // FOV: speed widening plus decaying kicks, capped at +15° over base.
    const speed = vel.length();
    const want = 12 * smoothstep(8, 30, speed) * (this.reduceMotion ? 0.5 : 1);
    this.speedFov += (want - this.speedFov) * (1 - Math.exp(-6 * dt));
    this.kickA *= Math.exp(-dt / this.kickTau);
    this.kickB *= Math.exp(-dt / this.kickBTau);
    const fov = this.baseFov + Math.min(15, this.speedFov + this.kickA + this.kickB);
    if (Math.abs(fov - this.lastFov) > 0.01) {
      this.lastFov = fov;
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }

    // Trauma shake after lookAt.
    this.trauma = Math.max(0, this.trauma - 1.3 * dt);
    if (this.trauma > 0.001) {
      this.shakeT += dt * 22;
      const sh = this.trauma * this.trauma;
      shakeE.set(octaves(1, this.shakeT) * 1.5 * DEG * sh, octaves(2, this.shakeT) * 1.5 * DEG * sh, octaves(3, this.shakeT) * 2.5 * DEG * sh, 'YXZ');
      shakeQ.setFromEuler(shakeE);
      this.camera.quaternion.multiply(shakeQ);
      right.set(1, 0, 0).applyQuaternion(this.camera.quaternion);
      up.set(0, 1, 0).applyQuaternion(this.camera.quaternion);
      this.camera.position.addScaledVector(right, octaves(4, this.shakeT) * 0.15 * sh).addScaledVector(up, octaves(5, this.shakeT) * 0.15 * sh);
    }
  }

  /** Re-apply base FOV after a resize. */
  setBaseFov(fov: number): void {
    this.baseFov = fov;
    this.lastFov = 0;
  }
}
