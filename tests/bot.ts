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

export interface LegResult {
  ok: boolean;
  /** Seconds from the start (5 m before the take-off edge) to touching down on the far island. */
  t: number;
  /** Where the bot touched down (z), NaN if it did not. */
  landZ: number;
  /** How it ended when not ok. */
  fail: '' | 'sea' | 'back' | 'other' | 'timeout';
}

/**
 * Like tryCrossGap, in either direction (toward home too): runs from 5 m before the take-off edge facing the
 * far island, jumps, holds, releases once the climb reaches policy.releasePitch, grabs the gap's next hook after
 * policy.regrabDelay. The stick points at the far island's centre all the way (players hold it).
 */
export function crossLeg(course: Course, gap: Gap, homeward: boolean, stats: PlayerStats, policy: BotPolicy, opts: BotOptions = {}): LegResult {
  const fromI = homeward ? gap.to : gap.from;
  const toI = homeward ? gap.from : gap.to;
  const dir = homeward ? 1 : -1;
  const fs = fromI.solid;
  const ts = toI.solid;
  const sim = new PlayerSim();
  const drifting = course.anchors.filter((a) => a.drift || a.sway);
  sim.time = opts.startTime ?? 0;
  const fromX = fromI.zone < 0 ? 0 : (fs.min.x + fs.max.x) / 2;
  const edge = dir < 0 ? fs.min.z : fs.max.z;
  sim.reset(new Vector3(fromX, fs.max.y, edge - dir * 5), dir);
  const tx = toI.zone < 0 ? 0 : (ts.min.x + ts.max.x) / 2;
  const tz = toI.zone < 0 ? ts.min.z + 8 : (ts.min.z + ts.max.z) / 2;
  const ids = new Set(gap.anchors.map((a) => a.id));
  const input: PlayerInput = { moveX: 0, moveZ: 0, jumpHeld: false, jumpPressed: false };
  let phase: 'run' | 'jump' | 'swing' | 'fly' = 'run';
  let since = 0;
  const res: LegResult = { ok: false, t: 0, landZ: NaN, fail: 'timeout' };
  for (let t = 0; t < 14; t += DT) {
    const dx = tx - sim.pos.x;
    const dz = tz - sim.pos.z;
    const dl = Math.hypot(dx, dz) || 1;
    input.moveX = dx / dl;
    input.moveZ = dz / dl;
    input.jumpPressed = false;
    if (phase === 'run') {
      input.jumpHeld = false;
      if (sim.mode === 'ground' && (dir < 0 ? sim.pos.z < fs.min.z + 0.4 : sim.pos.z > fs.max.z - 0.4)) {
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
      const toward = sim.vel.x * input.moveX + sim.vel.z * input.moveZ > 0;
      const pitch = (Math.atan2(sim.vel.y, hs) * 180) / Math.PI;
      if (toward && sim.vel.y > 0 && pitch >= policy.releasePitch) {
        input.jumpHeld = false;
        phase = 'fly';
        since = 0;
      }
      if (sim.mode !== 'swing') phase = 'fly';
    } else {
      since += DT;
      input.jumpHeld = false;
      if (sim.mode === 'air' && since >= policy.regrabDelay && sim.target && ids.has(sim.target.id) && (sim.target.pos.z - sim.pos.z) * dir > 1) {
        input.jumpPressed = true;
        input.jumpHeld = true;
        phase = 'swing';
      }
    }
    for (const a of drifting) anchorPosAt(a, sim.time + DT, a.pos);
    sim.step(DT, input, stats, course);
    if (opts.perfectBoost && sim.events.includes('release') && sim.lastRelease) {
      if (rateRelease(sim.lastRelease.theta, sim.lastRelease.vel.y) === 'perfect') {
        sim.vel.x *= COMBO.perfectBoost;
        sim.vel.z *= COMBO.perfectBoost;
      }
    }
    if (sim.events.includes('sea')) {
      res.fail = 'sea';
      res.t = t;
      return res;
    }
    if (sim.mode === 'ground' && sim.groundSolid && phase !== 'run') {
      const g = sim.groundSolid;
      res.t = t;
      const owned = g === ts || ((g.kind === 'tower' || g.kind === 'platform') && g.min.z >= ts.min.z - 0.01 && g.max.z <= ts.max.z + 0.01);
      if (owned) {
        res.ok = true;
        res.fail = '';
        res.landZ = sim.pos.z;
      } else res.fail = g === fs ? 'back' : 'other';
      return res;
    }
  }
  return res;
}
