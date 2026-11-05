import { Vector3 } from 'three';
import { PHYS, SEA_LEVEL } from './config';
import { anchorPosAt, geyserStateAt, type Anchor, type Buoy, type Geyser, type Pad, type Solid } from './course';
import { moveAndCollide, type SweepResult } from './physics';

export interface PlayerStats {
  runSpeed: number;
  /** Max distance to an anchor you can latch onto. */
  reach: number;
  /** Swing power multiplier (1 = base). */
  power: number;
}

/** Movement is in world space (already rotated by the camera), length 0..1. */
export interface PlayerInput {
  moveX: number;
  moveZ: number;
  jumpHeld: boolean;
  jumpPressed: boolean;
}

export type PlayerEvent = 'jump' | 'doubleJump' | 'grab' | 'release' | 'land' | 'pad' | 'sea';
export type PlayerMode = 'ground' | 'air' | 'swing' | 'launch';

export interface PlayerWorld {
  solids: readonly Solid[];
  anchors: readonly Anchor[];
  pads: readonly Pad[];
  /** Bounce Buoys (§9.0). Optional so bare test worlds still work. */
  buoys?: readonly Buoy[];
  /** Volcano geysers (§9.0, P1). */
  geysers?: readonly Geyser[];
}

/** Recorded by release() before the boost, so the sim can rate the release (§9.4). theta is in degrees. */
export interface ReleaseRecord {
  anchorId: number;
  anchorPos: Vector3;
  theta: number;
  vel: Vector3;
}

export const BUOY = { bounceVel: 19, keepHorizontal: 0.8, reflect: 0.9 };
export const GEYSER_LAUNCH = { vel: 26, time: 0.4, surface: 1 };

export const NO_INPUT: PlayerInput = { moveX: 0, moveZ: 0, jumpHeld: false, jumpPressed: false };

/**
 * Picks the anchor the player would latch onto: within reach, above the grip,
 * and roughly in the direction of travel. Returns null if none qualifies.
 */
export function pickAnchor(
  grip: Vector3,
  vel: Vector3,
  facing: Vector3,
  anchors: readonly Anchor[],
  reach: number,
  excludeId: number,
): Anchor | null {
  const hs = Math.hypot(vel.x, vel.z);
  const fx = hs > 2 ? vel.x / hs : facing.x;
  const fz = hs > 2 ? vel.z / hs : facing.z;
  let best: Anchor | null = null;
  let bestScore = -Infinity;
  for (const a of anchors) {
    if (a.id === excludeId || a.minReach > reach + 1e-6) continue;
    const dz = a.pos.z - grip.z;
    if (Math.abs(dz) > reach + 1) continue;
    const dx = a.pos.x - grip.x;
    const dy = a.pos.y - grip.y;
    if (dy < 1.2) continue;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist > reach || dist < 2.5) continue;
    const hd = Math.hypot(dx, dz);
    const ahead = hd < 1.5 ? 0.6 : (dx * fx + dz * fz) / hd;
    if (ahead < 0.15) continue;
    const score = ahead * 2 - Math.abs(dist - reach * 0.65) / reach + dy * 0.02;
    if (score > bestScore) {
      bestScore = score;
      best = a;
    }
  }
  return best;
}

/** A hook near the player that their rope isn't long enough for yet (zone gate), or null. */
export function nearbyLockedAnchor(grip: Vector3, anchors: readonly Anchor[], reach: number, radius = 16): Anchor | null {
  let best: Anchor | null = null;
  let bestDist = radius;
  for (const a of anchors) {
    if (a.minReach <= reach + 1e-6) continue;
    const dist = a.pos.distanceTo(grip);
    if (dist < bestDist) {
      bestDist = dist;
      best = a;
    }
  }
  return best;
}

const tmpGrip = new Vector3();
const tmpAnchor = new Vector3();
const tmpFwd = new Vector3();
const RAD = 180 / Math.PI;

export class PlayerSim {
  readonly pos = new Vector3();
  readonly vel = new Vector3();
  /** Horizontal facing direction (unit). */
  readonly facing = new Vector3(0, 0, -1);
  mode: PlayerMode = 'air';
  anchor: Anchor | null = null;
  ropeLength = 0;
  /** Best anchor in reach right now (null while swinging). */
  target: Anchor | null = null;
  airTime = 0;
  /** Last solid the player stood on. */
  groundSolid: Solid | null = null;
  readonly events: PlayerEvent[] = [];
  /** Sim time at the end of the last step (drives drifting hooks and geysers). */
  time = 0;
  /** The last real release, recorded before the boost (null until the first one). */
  lastRelease: ReleaseRecord | null = null;
  /** Pad that launched the player this step (valid when events has 'pad'), else -1. */
  padId = -1;
  /** Buoy bounced on this step, else -1. */
  bouncedOn = -1;
  /** Geyser that launched the player this step, else -1. */
  geyserLaunched = -1;
  /** True on the step a swing ended by landing while still attached (no 'release' event). */
  landedAttached = false;

  private ropeGoal = 0;
  private coyote = 0;
  private jumpBuffer = 0;
  private canDoubleJump = true;
  private lastAnchorId = -1;
  private sinceRelease = 99;
  private launchTime = 0;
  private readonly sweep: SweepResult = { hitX: false, hitZ: false, hitY: 'none', floor: null };

  reset(at: Vector3, facingZ = -1): void {
    this.pos.copy(at);
    this.vel.set(0, 0, 0);
    this.facing.set(0, 0, facingZ);
    this.mode = 'air';
    this.anchor = null;
    this.target = null;
    this.airTime = 0;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.canDoubleJump = true;
    this.lastAnchorId = -1;
    this.sinceRelease = 99;
    this.launchTime = 0;
    this.groundSolid = null;
    this.padId = -1;
    this.bouncedOn = -1;
    this.geyserLaunched = -1;
    this.landedAttached = false;
  }

  /** Copies every field (including the private ones) from another player. No allocation. */
  copyFrom(o: PlayerSim): void {
    this.pos.copy(o.pos);
    this.vel.copy(o.vel);
    this.facing.copy(o.facing);
    this.mode = o.mode;
    this.anchor = o.anchor;
    this.ropeLength = o.ropeLength;
    this.target = o.target;
    this.airTime = o.airTime;
    this.groundSolid = o.groundSolid;
    this.events.length = 0;
    for (const e of o.events) this.events.push(e);
    this.time = o.time;
    this.lastRelease = o.lastRelease;
    this.padId = o.padId;
    this.bouncedOn = o.bouncedOn;
    this.geyserLaunched = o.geyserLaunched;
    this.landedAttached = o.landedAttached;
    this.ropeGoal = o.ropeGoal;
    this.coyote = o.coyote;
    this.jumpBuffer = o.jumpBuffer;
    this.canDoubleJump = o.canDoubleJump;
    this.lastAnchorId = o.lastAnchorId;
    this.sinceRelease = o.sinceRelease;
    this.launchTime = o.launchTime;
  }

  /** Where the current anchor is right now (drifting hooks move), or null when not attached. */
  anchorPos(out: Vector3): Vector3 | null {
    return this.anchor ? anchorPosAt(this.anchor, this.time, out) : null;
  }

  /**
   * The forward direction of the current swing (§7.3): horizontal, from the centre of the last solid
   * stood on toward the anchor. Falls back to -z (the course direction).
   */
  swingForward(out: Vector3): Vector3 {
    out.set(0, 0, -1);
    const g = this.groundSolid;
    if (!this.anchor || !g) return out;
    const a = anchorPosAt(this.anchor, this.time, tmpAnchor);
    const dx = a.x - (g.min.x + g.max.x) / 2;
    const dz = a.z - (g.min.z + g.max.z) / 2;
    const l = Math.hypot(dx, dz);
    if (l > 1e-6) out.set(dx / l, 0, dz / l);
    return out;
  }

  /**
   * Rope angle (anchor → grip) from straight down, in degrees. Positive when the player is past
   * the anchor in the forward direction. 0 when not attached.
   */
  swingAngle(forward: Vector3): number {
    if (!this.anchor) return 0;
    const a = anchorPosAt(this.anchor, this.time, tmpAnchor);
    const gx = this.pos.x - a.x;
    const gy = this.pos.y + PHYS.gripHeight - a.y;
    const gz = this.pos.z - a.z;
    const fl = Math.hypot(forward.x, forward.z) || 1;
    const h = (gx * forward.x + gz * forward.z) / fl;
    return Math.atan2(h, -gy) * RAD;
  }

  /** The same physics as letting go, but records nothing and pushes no event (for predictions). */
  forceRelease(stats: PlayerStats): void {
    this.applyRelease(stats);
  }

  gripPos(out: Vector3): Vector3 {
    return out.set(this.pos.x, this.pos.y + PHYS.gripHeight, this.pos.z);
  }

  step(dt: number, input: PlayerInput, stats: PlayerStats, world: PlayerWorld): void {
    this.events.length = 0;
    this.padId = -1;
    this.bouncedOn = -1;
    this.geyserLaunched = -1;
    this.landedAttached = false;
    this.time += dt;
    this.sinceRelease += dt;
    this.jumpBuffer = input.jumpPressed ? PHYS.jumpBuffer : Math.max(0, this.jumpBuffer - dt);

    if (this.mode === 'swing') {
      this.target = null;
    } else {
      const exclude = this.sinceRelease < PHYS.regrabCooldown ? this.lastAnchorId : -1;
      this.target = pickAnchor(this.gripPos(tmpGrip), this.vel, this.facing, world.anchors, stats.reach, exclude);
    }

    switch (this.mode) {
      case 'launch':
        this.launchTime -= dt;
        this.vel.y -= PHYS.gravity * dt;
        break;
      case 'swing':
        this.updateSwing(dt, input, stats);
        // Letting go hands the rest of the step to air movement, exactly like
        // forceRelease() followed by a step (so predictRelease matches the real flight).
        if (this.mode !== 'swing') this.updateMove(dt, input, stats);
        break;
      default:
        this.updateMove(dt, input, stats);
        break;
    }

    this.integrate(dt, world);

    if (this.mode === 'ground') this.checkPads(world.pads);
    if (world.buoys && this.mode === 'air') this.checkBuoys(world.buoys);
    if (world.geysers && this.mode !== 'launch' && this.mode !== 'swing') this.checkGeysers(world.geysers);

    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (hs > 0.5 && this.mode !== 'launch') this.facing.set(this.vel.x / hs, 0, this.vel.z / hs);

    if (this.pos.y < SEA_LEVEL - 0.4) this.events.push('sea');
  }

  private updateMove(dt: number, input: PlayerInput, stats: PlayerStats): void {
    const grounded = this.mode === 'ground';
    const wx = input.moveX;
    const wz = input.moveZ;

    if (grounded) {
      const tx = wx * stats.runSpeed;
      const tz = wz * stats.runSpeed;
      const dx = tx - this.vel.x;
      const dz = tz - this.vel.z;
      const dl = Math.hypot(dx, dz);
      const hasInput = wx * wx + wz * wz > 0.01;
      const rate = (hasInput ? PHYS.groundAccel : PHYS.groundFriction) * dt;
      if (dl <= rate) {
        this.vel.x = tx;
        this.vel.z = tz;
      } else {
        this.vel.x += (dx / dl) * rate;
        this.vel.z += (dz / dl) * rate;
      }
      this.coyote = PHYS.coyoteTime;
    } else {
      // Air control steers without killing the speed a swing gave you.
      const before = Math.hypot(this.vel.x, this.vel.z);
      const cap = Math.max(before, stats.runSpeed);
      this.vel.x += wx * PHYS.airAccel * dt;
      this.vel.z += wz * PHYS.airAccel * dt;
      let speed = Math.hypot(this.vel.x, this.vel.z);
      if (speed > cap) {
        this.vel.x *= cap / speed;
        this.vel.z *= cap / speed;
        speed = cap;
      }
      if (speed > stats.runSpeed) {
        const slowed = Math.max(stats.runSpeed, speed - (speed - stats.runSpeed) * PHYS.airDrag * dt);
        this.vel.x *= slowed / speed;
        this.vel.z *= slowed / speed;
      }
      this.coyote = Math.max(0, this.coyote - dt);
      this.airTime += dt;
    }

    if (this.jumpBuffer > 0 && (grounded || this.coyote > 0)) {
      this.vel.y = PHYS.jumpVelocity;
      this.mode = 'air';
      this.coyote = 0;
      this.jumpBuffer = 0;
      this.airTime = 0;
      this.canDoubleJump = true;
      this.events.push('jump');
      return;
    }

    if (!grounded) {
      const wantsGrab = input.jumpPressed || (input.jumpHeld && this.airTime > PHYS.grabDelay);
      if (this.target && wantsGrab) {
        this.attach(this.target);
        return;
      }
      if (input.jumpPressed && this.canDoubleJump) {
        this.vel.y = Math.max(this.vel.y, PHYS.doubleJumpVelocity);
        this.canDoubleJump = false;
        this.jumpBuffer = 0;
        this.events.push('doubleJump');
      }
    }

    this.vel.y = Math.max(-PHYS.maxFallSpeed, this.vel.y - PHYS.gravity * dt);
  }

  private attach(anchor: Anchor): void {
    const dist = this.gripPos(tmpGrip).distanceTo(anchorPosAt(anchor, this.time, tmpAnchor));
    this.anchor = anchor;
    this.mode = 'swing';
    this.ropeLength = Math.max(PHYS.ropeMin, dist);
    this.ropeGoal = Math.max(PHYS.ropeMin, dist * PHYS.reelFraction);
    this.canDoubleJump = true;
    this.events.push('grab');
  }

  private updateSwing(dt: number, input: PlayerInput, stats: PlayerStats): void {
    const anchor = this.anchor;
    if (!anchor || !input.jumpHeld) {
      this.release(stats);
      return;
    }
    if (this.ropeLength > this.ropeGoal) {
      this.ropeLength = Math.max(this.ropeGoal, this.ropeLength - PHYS.reelSpeed * dt);
    }

    this.vel.y -= PHYS.swingGravity * dt;

    // Pump: push along the swing (perpendicular to the rope) in the direction of the stick.
    const grip = this.gripPos(tmpGrip);
    const ap = anchorPosAt(anchor, this.time, tmpAnchor);
    const rx = ap.x - grip.x;
    const ry = ap.y - grip.y;
    const rz = ap.z - grip.z;
    const rl = Math.hypot(rx, ry, rz) || 1;
    const ux = rx / rl;
    const uy = ry / rl;
    const uz = rz / rl;
    const wx = input.moveX;
    const wz = input.moveZ;
    const amount = Math.min(1, Math.hypot(wx, wz));
    if (amount > 0.01) {
      const d = wx * ux + wz * uz;
      const px = wx - ux * d;
      const py = -uy * d;
      const pz = wz - uz * d;
      const pl = Math.hypot(px, py, pz);
      if (pl > 1e-3) {
        const k = (PHYS.pumpAccel * stats.power * amount * dt) / pl;
        this.vel.x += px * k;
        this.vel.y += py * k;
        this.vel.z += pz * k;
      }
    }
    this.vel.multiplyScalar(1 - PHYS.swingDamping * dt);
    this.airTime += dt;
  }

  private release(stats: PlayerStats): void {
    if (this.anchor) {
      const ap = anchorPosAt(this.anchor, this.time, new Vector3());
      this.lastRelease = {
        anchorId: this.anchor.id,
        anchorPos: ap,
        theta: this.swingAngle(this.swingForward(tmpFwd)),
        vel: this.vel.clone(),
      };
    }
    this.applyRelease(stats);
    this.events.push('release');
  }

  private applyRelease(stats: PlayerStats): void {
    const boost = 1 + 0.1 * stats.power;
    this.vel.x *= boost;
    this.vel.z *= boost;
    this.vel.y = this.vel.y * boost + PHYS.releaseLift;
    this.lastAnchorId = this.anchor ? this.anchor.id : -1;
    this.sinceRelease = 0;
    this.anchor = null;
    this.mode = 'air';
    this.airTime = 0;
    this.canDoubleJump = true;
  }

  private integrate(dt: number, world: PlayerWorld): void {
    const speed = this.vel.length();
    if (speed > PHYS.maxSpeed) this.vel.multiplyScalar(PHYS.maxSpeed / speed);
    const steps = Math.min(10, Math.max(1, Math.ceil((Math.min(speed, PHYS.maxSpeed) * dt) / 0.3)));
    const h = dt / steps;
    let landed = false;
    let floor: Solid | null = null;

    for (let i = 0; i < steps; i++) {
      let dx = this.vel.x * h;
      let dy = this.vel.y * h;
      let dz = this.vel.z * h;

      if (this.mode === 'swing' && this.anchor) {
        const a = anchorPosAt(this.anchor, this.time, tmpAnchor);
        const ex = this.pos.x + dx - a.x;
        const ey = this.pos.y + dy + PHYS.gripHeight - a.y;
        const ez = this.pos.z + dz - a.z;
        const el = Math.hypot(ex, ey, ez);
        if (el > this.ropeLength) {
          const k = this.ropeLength / el;
          dx = a.x + ex * k - this.pos.x;
          dy = a.y + ey * k - PHYS.gripHeight - this.pos.y;
          dz = a.z + ez * k - this.pos.z;
          const ux = ex / el;
          const uy = ey / el;
          const uz = ez / el;
          const vr = this.vel.x * ux + this.vel.y * uy + this.vel.z * uz;
          if (vr > 0) {
            this.vel.x -= ux * vr;
            this.vel.y -= uy * vr;
            this.vel.z -= uz * vr;
          }
        }
      }

      moveAndCollide(this.pos, dx, dy, dz, world.solids, this.sweep);
      if (this.sweep.hitX) this.vel.x = 0;
      if (this.sweep.hitZ) this.vel.z = 0;
      if (this.sweep.hitY === 'floor') {
        if (this.vel.y < 0) this.vel.y = 0;
        landed = true;
        floor = this.sweep.floor;
      } else if (this.sweep.hitY === 'ceiling' && this.vel.y > 0) {
        this.vel.y = 0;
      }
    }

    if (landed) {
      if (this.mode === 'swing' && this.anchor) {
        this.lastAnchorId = this.anchor.id;
        this.sinceRelease = 0;
        this.anchor = null;
        this.landedAttached = true;
      }
      if (this.mode !== 'ground') this.events.push('land');
      this.mode = 'ground';
      this.groundSolid = floor;
      this.airTime = 0;
      this.canDoubleJump = true;
    } else if (this.mode === 'ground') {
      this.mode = 'air';
    } else if (this.mode === 'launch' && this.launchTime <= 0) {
      this.mode = 'air';
    }
  }

  private checkPads(pads: readonly Pad[]): void {
    for (const pad of pads) {
      if (this.pos.x < pad.min.x || this.pos.x > pad.max.x) continue;
      if (this.pos.z < pad.min.z || this.pos.z > pad.max.z) continue;
      if (Math.abs(this.pos.y - pad.min.y) > 0.6) continue;
      const t = PHYS.padFlightTime;
      this.vel.set(
        (pad.target.x - this.pos.x) / t,
        (pad.target.y - this.pos.y + 0.5 * PHYS.gravity * t * t) / t,
        (pad.target.z - this.pos.z) / t,
      );
      this.mode = 'launch';
      this.launchTime = t;
      this.padId = pad.id;
      this.events.push('pad');
      return;
    }
  }

  /** Falling onto a buoy's top bounces you back up (§9.0). The collider is static. */
  private checkBuoys(buoys: readonly Buoy[]): void {
    if (this.vel.y >= 0) return;
    for (const b of buoys) {
      if (this.pos.y > b.pos.y + 0.05 || this.pos.y < b.pos.y - 1.2) continue;
      const dx = this.pos.x - b.pos.x;
      const dz = this.pos.z - b.pos.z;
      if (dx * dx + dz * dz > b.radius * b.radius) continue;
      this.pos.y = b.pos.y;
      this.vel.y = Math.max(BUOY.bounceVel, -this.vel.y * BUOY.reflect);
      this.vel.x *= BUOY.keepHorizontal;
      this.vel.z *= BUOY.keepHorizontal;
      this.mode = 'air';
      this.airTime = 0;
      this.canDoubleJump = true;
      this.bouncedOn = b.id;
      return;
    }
  }

  /** An erupting geyser launches a player standing in (or just above) its vent (§9.0, P1). */
  private checkGeysers(geysers: readonly Geyser[]): void {
    for (const g of geysers) {
      if (Math.abs(this.pos.y - g.pos.y) > GEYSER_LAUNCH.surface) continue;
      const dx = this.pos.x - g.pos.x;
      const dz = this.pos.z - g.pos.z;
      if (dx * dx + dz * dz > g.radius * g.radius) continue;
      if (geyserStateAt(g, this.time) !== 'erupting') continue;
      this.vel.y = GEYSER_LAUNCH.vel;
      this.mode = 'launch';
      this.launchTime = GEYSER_LAUNCH.time;
      this.geyserLaunched = g.id;
      return;
    }
  }
}
