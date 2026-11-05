import { Vector3 } from 'three';
import { COMBO } from './config';
import type { Solid } from './course';
import { NO_INPUT, PlayerSim, type PlayerStats, type PlayerWorld } from './player';
import type { ReleaseQuality } from '../contracts';

/** Prediction of the flight after letting go now. */
export interface ReleasePrediction {
  /** Sampled at equal time steps from the release to the first contact (or the 3 s horizon). */
  points: Vector3[];
  /** The solid whose top the player lands on first, or null (sea, or nothing within 3 s). */
  landsOn: Solid | null;
  /** Seconds from the release to the first contact (3 when nothing is hit). */
  t: number;
}

/** What predictRelease needs from the sim (GameSim satisfies it). */
export interface PredictSource {
  readonly player: PlayerSim;
  readonly course: PlayerWorld;
  readonly state: { readonly stats: PlayerStats };
}

export const PREDICT_DT = 1 / 120;
export const PREDICT_HORIZON = 3;
const MAX_STEPS = Math.ceil(PREDICT_HORIZON / PREDICT_DT);

const ghost = new PlayerSim();
const track = new Float64Array((MAX_STEPS + 1) * 3);
const pool: Vector3[] = [];
const result: ReleasePrediction = { points: [], landsOn: null, t: PREDICT_HORIZON };

/**
 * Copies the player with copyFrom(), calls forceRelease(), then steps NO_INPUT at the sim step
 * (1/120 s) for up to 3 s. Drifting anchors and geysers are evaluated at simTime + t (the copy
 * carries the player's clock). Pushes no events and touches nothing in the sim.
 *
 * The returned object and its points are reused by the next call (no allocation after warm-up):
 * copy what you need to keep.
 */
export function predictRelease(sim: Readonly<PredictSource>, samples = 20): ReleasePrediction {
  const stats = sim.state.stats;
  ghost.copyFrom(sim.player);
  if (ghost.mode === 'swing') ghost.forceRelease(stats);

  track[0] = ghost.pos.x;
  track[1] = ghost.pos.y;
  track[2] = ghost.pos.z;
  let steps = 0;
  let landsOn: Solid | null = null;
  let contact = false;
  while (steps < MAX_STEPS) {
    ghost.step(PREDICT_DT, NO_INPUT, stats, sim.course);
    steps++;
    const o = steps * 3;
    track[o] = ghost.pos.x;
    track[o + 1] = ghost.pos.y;
    track[o + 2] = ghost.pos.z;
    if (ghost.events.includes('land')) {
      landsOn = ghost.groundSolid;
      contact = true;
      break;
    }
    if (ghost.events.includes('sea')) {
      contact = true;
      break;
    }
  }

  const n = Math.max(2, samples);
  while (pool.length < n) pool.push(new Vector3());
  result.points.length = n;
  for (let i = 0; i < n; i++) {
    const f = (i / (n - 1)) * steps;
    const a = Math.floor(f);
    const b = Math.min(steps, a + 1);
    const k = f - a;
    const v = pool[i];
    v.set(
      track[a * 3] + (track[b * 3] - track[a * 3]) * k,
      track[a * 3 + 1] + (track[b * 3 + 1] - track[a * 3 + 1]) * k,
      track[a * 3 + 2] + (track[b * 3 + 2] - track[a * 3 + 2]) * k,
    );
    result.points[i] = v;
  }
  result.landsOn = landsOn;
  result.t = contact ? steps * PREDICT_DT : PREDICT_HORIZON;
  return result;
}

/** Rates a release from the rope angle θ (degrees, §9.4) and the vertical velocity. */
export function rateRelease(theta: number, velY: number): ReleaseQuality {
  if (theta < COMBO.goodMin) return 'early';
  if (velY <= 0 || theta > COMBO.goodMax) return 'late';
  if (theta >= COMBO.perfectMin && theta <= COMBO.perfectMax) return 'perfect';
  return 'good';
}

/** True while a release right now would be Perfect (the sim's perfectWindow flag). */
export function inPerfectWindow(theta: number, velY: number): boolean {
  return velY > 0 && theta >= COMBO.perfectMin && theta <= COMBO.perfectMax;
}

/** The quality a release right now would get. */
export function releaseQuality(player: PlayerSim, forward: Vector3): ReleaseQuality {
  return rateRelease(player.swingAngle(forward), player.vel.y);
}
