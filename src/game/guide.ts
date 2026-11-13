// Post-tutorial guidance for new players: where to go next, shown as the HUD edge arrow
// (the arrow only appears while the target is off-screen). Pure: no DOM, no rendering.
import { Vector3 } from 'three';
import type { IconId } from '../contracts';
import { HOME_FRONT_Z, HOME_TOP } from './config';
import type { GameSim } from './sim';
import type { GameState } from './state';
import { ZONES } from './zones';

export interface GuideTarget {
  pos: Vector3;
  icon: IconId;
  label: string;
}

/** Arrows to creatures and home stop once the player has reached this zone (Lagoon): they know the loop by then. */
export const GUIDE_UNTIL_ZONE = 2;
/** The safety arrow during a wave stays a little longer (until Stormy Seas). */
export const GUIDE_WAVE_UNTIL_ZONE = 3;
/** Only lighthouses this close (along the course) count as a safe spot. */
const LIGHTHOUSE_RANGE = 40;

const out = new Vector3();
const meters = (d: number) => `${Math.max(1, Math.round(d))} m`;

/**
 * The next place a new player should head for, or null for no arrow:
 * 1. a wave is coming and the player is not safe: home or the nearest lighthouse pad, whichever is quicker;
 * 2. hands full away from home: home;
 * 3. otherwise, out on foot: the nearest wild creature in a zone the player's rope can reach.
 */
export function guideTarget(sim: GameSim, state: GameState): GuideTarget | null {
  if (!state.ftue.done) return null;
  const p = sim.player.pos;
  const w = sim.wave;
  if (sim.splashTime > 0 || sim.seaRespawnTime > 0) return null;

  if (w.phase !== 'calm' && state.bestZone < GUIDE_WAVE_UNTIL_ZONE) {
    if (sim.playerSafe() || sim.safeSpot() !== null) return null;
    const speed = Math.max(1, state.stats.runSpeed);
    const homeD = p.z > HOME_FRONT_Z ? 0 : HOME_FRONT_Z + 2 - p.z;
    let best: GuideTarget = { pos: out.set(p.x, HOME_TOP, HOME_FRONT_Z + 2), icon: 'home', label: `Safe ${meters(homeD)}` };
    let bestEta = homeD / speed;
    for (const lh of sim.course.lighthouses) {
      const c = lh.pad;
      const cx = (c.min.x + c.max.x) / 2;
      const cz = (c.min.z + c.max.z) / 2;
      if (Math.abs(cz - p.z) > LIGHTHOUSE_RANGE) continue;
      const d = Math.hypot(cx - p.x, cz - p.z);
      if (d / speed < bestEta) {
        bestEta = d / speed;
        best = { pos: out.set(cx, c.max.y, cz), icon: 'lighthouse', label: `Safe ${meters(d)}` };
      }
    }
    return best;
  }

  if (state.bestZone >= GUIDE_UNTIL_ZONE) return null;
  // Mid-jump or on the rope the player is busy; the arrow would only distract.
  if (sim.player.mode !== 'ground') return null;

  if (state.carried.length > 0 && state.carried.length >= state.carryCapacity && !sim.isOnHome()) {
    const peds = sim.course.pedestals;
    let i = state.base.findIndex((c) => !c);
    if (i < 0 || i >= peds.length) i = 0;
    const ped = peds[i];
    if (!ped) return null;
    return { pos: out.copy(ped), icon: 'home', label: `Home ${meters(Math.hypot(ped.x - p.x, ped.z - p.z))}` };
  }

  if (state.carried.length >= state.carryCapacity) return null;
  const reach = state.stats.reach;
  let best: (typeof sim.wild)[number] | null = null;
  let bd = Infinity;
  for (const c of sim.wild) {
    const z = ZONES[c.zone];
    if (!z || z.minReach > reach + 1e-6) continue;
    const d = c.pos.distanceToSquared(p);
    if (d < bd) {
      bd = d;
      best = c;
    }
  }
  if (!best) return null;
  return { pos: out.copy(best.pos), icon: 'creature', label: `Catch ${meters(Math.sqrt(bd))}` };
}
