import { PerspectiveCamera, Vector3 } from 'three';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * Third-person orbit camera. Drag to rotate, wheel to zoom. When you're moving
 * and not touching the camera, it swings around behind you on its own.
 */
export class FollowCamera {
  yaw = 0;
  pitch = 0.36;
  distance = 13;
  private readonly target = new Vector3();
  private lastManual = -10;
  private initialized = false;

  constructor(readonly camera: PerspectiveCamera) {}

  rotate(dx: number, dy: number, time: number): void {
    if (dx === 0 && dy === 0) return;
    this.yaw -= dx * 0.006;
    this.pitch = clamp(this.pitch + dy * 0.005, -0.1, 1.25);
    this.lastManual = time;
  }

  zoom(delta: number): void {
    this.distance = clamp(this.distance * (1 + delta * 0.0012), 6, 26);
  }

  /** Unit vectors for camera-relative movement: forward and right on the ground plane. */
  basis(forward: Vector3, right: Vector3): void {
    forward.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    right.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
  }

  snapBehind(dirX: number, dirZ: number): void {
    this.yaw = Math.atan2(-dirX, -dirZ);
  }

  /** True if the player turned the camera by hand in the last moment. */
  manualRecently(time: number, window = 0.05): boolean {
    return time - this.lastManual < window;
  }

  /**
   * @param follow how strongly to swing behind the player's motion (0 = never, e.g. mid-swing
   *   where velocity flips back and forth).
   */
  update(dt: number, focus: Vector3, vel: Vector3, time: number, airborne: boolean, follow: number): void {
    const desired = new Vector3(focus.x, focus.y + 2.2, focus.z);
    if (!this.initialized) {
      this.target.copy(desired);
      this.initialized = true;
    }
    this.target.lerp(desired, 1 - Math.exp(-dt * (airborne ? 9 : 14)));

    const hs = Math.hypot(vel.x, vel.z);
    if (follow > 0 && time - this.lastManual > 1.0 && hs > 4) {
      const want = Math.atan2(-vel.x, -vel.z);
      const rate = (airborne ? 2.0 : 1.5) * Math.min(1, hs / 12) * follow;
      this.yaw += wrap(want - this.yaw) * Math.min(1, dt * rate);
    }

    const cp = Math.cos(this.pitch);
    const pos = new Vector3(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp).multiplyScalar(this.distance).add(this.target);
    pos.y = Math.max(pos.y, 0.8);
    this.camera.position.copy(pos);
    this.camera.lookAt(this.target);
  }
}
