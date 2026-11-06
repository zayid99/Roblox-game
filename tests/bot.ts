import { Vector3 } from 'three';
import { COMBO } from '../src/game/config';
import { anchorPosAt, type Course, type Gap } from '../src/game/course';
import { PlayerSim, type PlayerInput, type PlayerStats } from '../src/game/player';
import { rateRelease } from '../src/game/predict';

export interface BotOptions {
  /** Apply the sim's Perfect-release boost (§9.4) when a release rates Perfect. */
  perfectBoost?: boolean;
  /** Sim time at the start (sets the phase of drifting hooks and geysers). */
  startTime?: number;
}

export interface BotPolicy {
  /** Release the rope once the swing's climb angle reaches this (degrees). */
  releasePitch: number;
  /** Seconds to wait after a release before grabbing the next anchor. */
  regrabDelay: number;
}

export const POLICIES: BotPolicy[] = [];
for (const releasePitch of [5, 15, 25, 35, 45, 55, 65]) {
  for (const regrabDelay of [0.02, 0.12, 0.25, 0.4]) POLICIES.push({ releasePitch, regrabDelay });
}

const DT = 1 / 120;

/**
 * Plays one gap: runs at the edge, jumps, holds to grab, releases on the way up,
 * grabs the next anchor if there is one. Returns true if it lands on the far island (or beyond).
 */
export function tryCrossGap(course: Course, gap: Gap, stats: PlayerStats, policy: BotPolicy, opts: BotOptions = {}): boolean {
  const from = gap.from.solid;
  const to = gap.to.solid;
  const sim = new PlayerSim();
  const drifting = course.anchors.filter((a) => a.drift || a.sway);
  sim.time = opts.startTime ?? 0;
  const fromX = gap.from.zone < 0 ? 0 : (from.min.x + from.max.x) / 2;
  sim.reset(new Vector3(fromX, from.max.y, from.min.z + 5));

  const target = new Vector3((to.min.x + to.max.x) / 2, to.max.y, (to.min.z + to.max.z) / 2);
  const input: PlayerInput = { moveX: 0, moveZ: 0, jumpHeld: false, jumpPressed: false };
  let phase: 'run' | 'jump' | 'swing' | 'fly' = 'run';
  let sinceRelease = 0;
  let wasGround = false;

  for (let t = 0; t < 14; t += DT) {
    const dx = target.x - sim.pos.x;
    const dz = target.z - sim.pos.z;
    const dl = Math.hypot(dx, dz) || 1;
    input.moveX = dx / dl;
    input.moveZ = dz / dl;
    input.jumpPressed = false;

    if (phase === 'run') {
      input.jumpHeld = false;
      if (sim.mode === 'ground' && sim.pos.z < from.min.z + 0.4) {
        input.jumpPressed = true;
        input.jumpHeld = true;
        phase = 'jump';
      }
    } else if (phase === 'jump') {
      input.jumpHeld = true;
      if (sim.mode === 'swing') phase = 'swing';
    } else if (phase === 'swing') {
      input.jumpHeld = true;
      const hs = Math.hypot(sim.vel.x, sim.vel.z);
      const towardTarget = sim.vel.x * input.moveX + sim.vel.z * input.moveZ > 0;
      const pitch = (Math.atan2(sim.vel.y, hs) * 180) / Math.PI;
      if (towardTarget && sim.vel.y > 0 && pitch >= policy.releasePitch) {
        input.jumpHeld = false;
        phase = 'fly';
        sinceRelease = 0;
      }
      if (sim.mode !== 'swing') phase = 'fly';
    } else {
      sinceRelease += DT;
      input.jumpHeld = false;
      if (sim.mode !== 'ground' && sinceRelease >= policy.regrabDelay && sim.target && sim.target.pos.z < sim.pos.z - 1) {
        input.jumpPressed = true;
        input.jumpHeld = true;
        phase = 'swing';
      }
    }

    // Keep drifting hooks where the sim would have them (pickAnchor reads anchor.pos).
    for (const a of drifting) anchorPosAt(a, sim.time + DT, a.pos);
    sim.step(DT, input, stats, course);
    if (opts.perfectBoost && sim.events.includes('release') && sim.lastRelease) {
      if (rateRelease(sim.lastRelease.theta, sim.lastRelease.vel.y) === 'perfect') {
        sim.vel.x *= COMBO.perfectBoost;
        sim.vel.z *= COMBO.perfectBoost;
      }
    }
    if (sim.events.includes('sea')) return false;

    if (sim.mode === 'ground' && sim.groundSolid) {
      const g = sim.groundSolid;
      if (g !== from && g.max.z <= to.max.z + 0.01) return true;
      if (g === from && phase !== 'run' && !wasGround) return false;
    }
    wasGround = sim.mode === 'ground' && sim.groundSolid === from;
  }
  return false;
}

export function crossable(course: Course, gap: Gap, stats: PlayerStats, opts: BotOptions = {}): BotPolicy | null {
  for (const p of POLICIES) if (tryCrossGap(course, gap, stats, p, opts)) return p;
  return null;
}
