import { Vector3 } from 'three';
import { HOME_FRONT_Z, HOME_TOP } from './config';
import { Rng } from './rng';
import { ZONES, type ZoneDef } from './zones';

export interface AABB {
  min: Vector3;
  max: Vector3;
}

export type SolidKind = 'home' | 'island' | 'tower' | 'platform' | 'stone';

export interface Solid extends AABB {
  id: number;
  kind: SolidKind;
  /** Zone index, or -1 for the home island. */
  zone: number;
  /** True while the solid is gone (a sunk crumble stone): no collision, no ground. */
  off?: boolean;
}

export interface AnchorDrift {
  baseX: number;
  /** Metres either side of baseX. */
  amp: number;
  /** Seconds per full cycle. */
  period: number;
  /** Phase offset in radians. */
  phase: number;
}

export interface Anchor {
  id: number;
  zone: number;
  /** Current position. For drifting hooks the sim keeps x up to date (anchorPosAt gives any time). */
  pos: Vector3;
  /** Rope Reach needed before this hook can be grabbed (zone gate). */
  minReach: number;
  /** Drifting Hooks (§9.0, P1): pos.x = baseX + amp × sin(2π t / period + phase). */
  drift?: AnchorDrift;
  /** Swaying Hooks: the hook hangs from a pivot and swings back and forth along the course. */
  sway?: AnchorSway;
}

/**
 * A pendulum hook: θ = angle × sin(2π t / period + phase); the hook sits at
 * pivot + length × (0, −cos θ, −sin θ), so at θ = 0 it hangs straight below the pivot (its base position)
 * and positive θ carries it forward (toward −z, away from home).
 */
export interface AnchorSway {
  pivot: Vector3;
  length: number;
  /** Max swing angle in radians. */
  angle: number;
  period: number;
  phase: number;
}

/** Spring Coral: a bouncy pad on an island top that launches you high (Coral Reef and later). pos is the pad centre. */
export interface Spring {
  id: number;
  zone: number;
  pos: Vector3;
  radius: number;
}

/**
 * Crumble Stone: a small rock poking out of the sea mid-gap (Stormy Seas to Volcano Bay). It holds you for
 * CRUMBLE.shake seconds after you land on it, then sinks for CRUMBLE.sunk seconds and rises again.
 */
export interface Stone {
  id: number;
  zone: number;
  solid: Solid;
}

/** Bounce Buoy (§9.0): a static collider in the sea under the middle of a gap. pos is the top centre. */
export interface Buoy {
  id: number;
  zone: number;
  pos: Vector3;
  radius: number;
}

/** Volcano geyser vent (§9.0, P1). pos is the vent centre on the island top. phase is in seconds. */
export interface Geyser {
  id: number;
  zone: number;
  pos: Vector3;
  radius: number;
  phase: number;
}

export type GeyserState = 'idle' | 'warning' | 'erupting';

export const GEYSER = { idle: 4, warning: 1, erupt: 2, radius: 1.5 };
export const GEYSER_PERIOD = GEYSER.idle + GEYSER.warning + GEYSER.erupt;
export const DRIFT = { amp: 2.5, period: 4 };
export const SWAY = { length: 7, angle: 0.34, period: 3.6 };
/** Spring coral launch: straight up at launchVel; your run carries over, capped at maxHorizontal so a bounce stays readable. */
export const SPRING = { radius: 1.1, launchVel: 22, maxHorizontal: 6 };
export const CRUMBLE = { shake: 1.2, sunk: 3.2, rise: 0.8, size: 2.4, top: 2.4 };

/** Where an anchor is at sim time t (drifting hooks move along x). */
export function anchorPosAt(a: Anchor, t: number, out: Vector3): Vector3 {
  out.copy(a.pos);
  if (a.drift) out.x = a.drift.baseX + a.drift.amp * Math.sin((2 * Math.PI * t) / a.drift.period + a.drift.phase);
  if (a.sway) {
    const w = a.sway;
    const th = w.angle * Math.sin((2 * Math.PI * t) / w.period + w.phase);
    out.set(w.pivot.x, w.pivot.y - w.length * Math.cos(th), w.pivot.z - w.length * Math.sin(th));
  }
  return out;
}

/** Geyser cycle at sim time t: 4 s idle, 1 s warning, 2 s eruption. */
export function geyserStateAt(g: Geyser, t: number): GeyserState {
  const c = (((t + g.phase) % GEYSER_PERIOD) + GEYSER_PERIOD) % GEYSER_PERIOD;
  if (c < GEYSER.idle) return 'idle';
  if (c < GEYSER.idle + GEYSER.warning) return 'warning';
  return 'erupting';
}

export interface Island {
  id: number;
  zone: number;
  /** Position along the course (home = 0). */
  order: number;
  solid: Solid;
  spawnPoints: Vector3[];
  checkpoint: Vector3;
}

export interface Pad {
  id: number;
  zone: number;
  min: Vector3;
  max: Vector3;
  /** Where the pad throws you (top of the lighthouse). */
  target: Vector3;
}

export interface Lighthouse {
  id: number;
  zone: number;
  tower: Solid;
  platform: Solid;
  pad: Pad;
}

export interface Gap {
  zone: number;
  from: Island;
  to: Island;
  anchors: Anchor[];
  length: number;
}

export interface ZoneInfo {
  index: number;
  def: ZoneDef;
  /** z where the zone starts (closer to home, larger z). */
  startZ: number;
  /** z where the zone ends (farther out, smaller z). */
  endZ: number;
}

export interface Course {
  seed: number;
  solids: Solid[];
  islands: Island[];
  anchors: Anchor[];
  gaps: Gap[];
  lighthouses: Lighthouse[];
  pads: Pad[];
  zones: ZoneInfo[];
  home: Solid;
  homeIsland: Island;
  homeSpawn: Vector3;
  /** Top-center positions of the base pedestals, in unlock order. */
  pedestals: Vector3[];
  /** Far end of the course (most negative z). */
  endZ: number;
  /** Where new sessions and the FTUE spawn (§7.2): 4 m from the home front edge. */
  ftueSpawn: Vector3;
  /** Walking into this opens the Shop (the stall beside the home path, G8). */
  shopZone: AABB;
  buoys: Buoy[];
  geysers: Geyser[];
  springs: Spring[];
  stones: Stone[];
}

export const LIGHTHOUSE_TOP = 14;
export const MAX_PEDESTALS = 20;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/**
 * Builds the whole course from a seed: a home island, then a chain of islands
 * running toward -z, with anchors hanging over every gap.
 */
export function generateCourse(seed = 20261105): Course {
  const rng = new Rng(seed);
  let nextId = 1;
  const solids: Solid[] = [];
  const islands: Island[] = [];
  const anchors: Anchor[] = [];
  const gaps: Gap[] = [];
  const lighthouses: Lighthouse[] = [];
  const pads: Pad[] = [];
  const zones: ZoneInfo[] = [];

  const addSolid = (kind: SolidKind, zone: number, min: Vector3, max: Vector3): Solid => {
    const solid: Solid = { id: nextId++, kind, zone, min, max };
    solids.push(solid);
    return solid;
  };

  const home = addSolid('home', -1, new Vector3(-17, -4, HOME_FRONT_Z), new Vector3(17, HOME_TOP, HOME_FRONT_Z + 30));
  const homeSpawn = new Vector3(0, HOME_TOP, HOME_FRONT_Z + 7);
  const homeIsland: Island = {
    id: nextId++,
    zone: -1,
    order: 0,
    solid: home,
    spawnPoints: [],
    checkpoint: homeSpawn.clone(),
  };

  const pedestals: Vector3[] = [];
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 5; col++) {
      // Fill from the middle column outward so early slots sit near the path.
      const colOrder = [2, 1, 3, 0, 4][col];
      pedestals.push(new Vector3(-10 + colOrder * 5, HOME_TOP, HOME_FRONT_Z + 13 + row * 4.5));
    }
  }

  let prev = homeIsland;
  let prevX = 0;
  let prevTop = HOME_TOP;
  let cursorZ = HOME_FRONT_Z;
  let order = 1;

  ZONES.forEach((def, zi) => {
    const startZ = cursorZ;
    const lighthouseAt = Math.floor(def.islands / 2);

    for (let i = 0; i < def.islands; i++) {
      const edge = rng.range(def.edge[0], def.edge[1]);
      const spacing = rng.range(def.spacing[0], def.spacing[1]);
      const gapLen = 2 * edge + (def.anchors - 1) * spacing;
      const len = rng.range(def.len[0], def.len[1]);
      const width = rng.range(def.width[0], def.width[1]);
      const top = rng.range(3.5, 5.5);
      const x = clamp(prevX + rng.range(-def.wander, def.wander), -9, 9);
      const maxZ = cursorZ - gapLen;
      const minZ = maxZ - len;

      const solid = addSolid('island', zi, new Vector3(x - width / 2, -4, minZ), new Vector3(x + width / 2, top, maxZ));
      const island: Island = {
        id: nextId++,
        zone: zi,
        order: order++,
        solid,
        spawnPoints: [],
        checkpoint: new Vector3(x, top, (minZ + maxZ) / 2),
      };

      const gapAnchors: Anchor[] = [];
      const baseTop = Math.max(prevTop, top);
      for (let k = 0; k < def.anchors; k++) {
        const along = edge + k * spacing;
        const t = along / gapLen;
        const anchor: Anchor = {
          id: nextId++,
          zone: zi,
          minReach: def.minReach,
          pos: new Vector3(
            lerp(prevX, x, t) + rng.range(-0.6, 0.6),
            baseTop + rng.range(def.rise[0], def.rise[1]),
            cursorZ - along,
          ),
        };
        anchors.push(anchor);
        gapAnchors.push(anchor);
      }
      gaps.push({ zone: zi, from: prev, to: island, anchors: gapAnchors, length: gapLen });

      const blocked: Rect[] = [];
      if (i === lighthouseAt) {
        const side = rng.chance(0.5) ? 1 : -1;
        const towerX = x + side * (width / 2 - 1.6);
        const towerZ = (minZ + maxZ) / 2;
        const tower = addSolid(
          'tower',
          zi,
          new Vector3(towerX - 1.5, top, towerZ - 1.5),
          new Vector3(towerX + 1.5, LIGHTHOUSE_TOP - 0.5, towerZ + 1.5),
        );
        const platform = addSolid(
          'platform',
          zi,
          new Vector3(towerX - 2, LIGHTHOUSE_TOP - 0.5, towerZ - 2),
          new Vector3(towerX + 2, LIGHTHOUSE_TOP, towerZ + 2),
        );
        const padX = towerX - side * 5;
        const pad: Pad = {
          id: nextId++,
          zone: zi,
          min: new Vector3(padX - 1.2, top, towerZ - 1.2),
          max: new Vector3(padX + 1.2, top + 0.3, towerZ + 1.2),
          target: new Vector3(towerX, LIGHTHOUSE_TOP + 0.5, towerZ),
        };
        pads.push(pad);
        lighthouses.push({ id: nextId++, zone: zi, tower, platform, pad });
        blocked.push(
          { x0: towerX - 2.6, x1: towerX + 2.6, z0: towerZ - 2.6, z1: towerZ + 2.6 },
          { x0: padX - 2, x1: padX + 2, z0: towerZ - 2, z1: towerZ + 2 },
        );
      }

      for (let s = 0; s < def.spawns; s++) {
        for (let attempt = 0; attempt < 30; attempt++) {
          const px = rng.range(x - width / 2 + 1.5, x + width / 2 - 1.5);
          const pz = rng.range(minZ + 1.5, maxZ - 1.5);
          if (blocked.some((b) => px > b.x0 && px < b.x1 && pz > b.z0 && pz < b.z1)) continue;
          if (island.spawnPoints.some((p) => Math.hypot(p.x - px, p.z - pz) < 2.6)) continue;
          island.spawnPoints.push(new Vector3(px, top, pz));
          break;
        }
      }

      islands.push(island);
      prev = island;
      prevX = x;
      prevTop = top;
      cursorZ = minZ;
    }

    zones.push({ index: zi, def, startZ, endZ: cursorZ });
  });

  // Features use their own RNG stream so the islands and hooks stay exactly as before.
  const frng = new Rng((seed ^ 0x5eed_b0e7) >>> 0);
  const buoys: Buoy[] = [];
  for (const gap of gaps) {
    if (gap.zone < 1 || gap.zone > 4) continue;
    const z = (gap.from.solid.min.z + gap.to.solid.max.z) / 2;
    const x = (anchorMidX(gap) + (frng.chance(0.5) ? 2 : -2));
    buoys.push({ id: nextId++, zone: gap.zone, pos: new Vector3(x, 1.2, z), radius: 1.4 });
  }

  // Drifting hooks (P1): zones 3–7 (index 2..6), the last gap of each zone, the middle anchor.
  for (let zi = 2; zi < ZONES.length; zi++) {
    const zoneGaps = gaps.filter((g) => g.zone === zi);
    const last = zoneGaps[zoneGaps.length - 1];
    if (!last) continue;
    const a = last.anchors[Math.floor((last.anchors.length - 1) / 2)];
    a.drift = { baseX: a.pos.x, amp: DRIFT.amp, period: DRIFT.period, phase: frng.range(0, Math.PI * 2) };
  }

  // Volcano geysers (P1): one vent on each Volcano Bay island top, clear of the lighthouse.
  const geysers: Geyser[] = [];
  const volcano = ZONES.findIndex((z) => z.name === 'Volcano Bay');
  for (const island of islands) {
    if (island.zone !== volcano) continue;
    const s = island.solid;
    const lh = lighthouses.find((l) => l.tower.min.z >= s.min.z && l.tower.max.z <= s.max.z);
    const cx = (s.min.x + s.max.x) / 2;
    // Put the vent on the side away from the lighthouse (if any), near the back edge.
    const side = lh ? (lh.tower.min.x + lh.tower.max.x) / 2 > cx ? -1 : 1 : 1;
    const pos = new Vector3(cx + side * Math.min(2.5, (s.max.x - s.min.x) / 2 - 2), s.max.y, s.min.z + 2.2);
    geysers.push({ id: nextId++, zone: island.zone, pos, radius: GEYSER.radius, phase: frng.range(0, GEYSER_PERIOD) });
  }

  // Later features (swaying hooks, spring coral, crumble stones) draw from a third stream for the same reason.
  const lrng = new Rng((seed ^ 0x51ab_c0de) >>> 0);

  // Swaying hooks: zones 3–7 (index 2..6), the middle gap of each zone, its first anchor.
  for (let zi = 2; zi < ZONES.length; zi++) {
    const zoneGaps = gaps.filter((g) => g.zone === zi);
    const mid = zoneGaps[Math.floor(zoneGaps.length / 2)];
    if (!mid || mid === zoneGaps[zoneGaps.length - 1]) continue;
    const a = mid.anchors[0];
    a.sway = {
      pivot: new Vector3(a.pos.x, a.pos.y + SWAY.length, a.pos.z),
      length: SWAY.length,
      angle: SWAY.angle,
      period: SWAY.period,
      phase: lrng.range(0, Math.PI * 2),
    };
  }

  // Spring coral: one pad per island from the Coral Reef on (lighthouse islands have their launch pad instead),
  // toward a side edge and clear of creatures and geysers.
  const springs: Spring[] = [];
  for (const island of islands) {
    if (island.zone < 1) continue;
    const s = island.solid;
    if (lighthouses.some((l) => l.tower.min.z >= s.min.z && l.tower.max.z <= s.max.z)) continue;
    const cx = (s.min.x + s.max.x) / 2;
    const half = (s.max.x - s.min.x) / 2;
    const clear = (x: number, z: number) =>
      island.spawnPoints.every((p) => Math.hypot(p.x - x, p.z - z) > 2.2) &&
      geysers.every((g) => Math.hypot(g.pos.x - x, g.pos.z - z) > 3.4) &&
      lighthouses.every((l) => Math.hypot((l.tower.min.x + l.tower.max.x) / 2 - x, (l.tower.min.z + l.tower.max.z) / 2 - z) > 3.6) &&
      pads.every((p) => Math.hypot((p.min.x + p.max.x) / 2 - x, (p.min.z + p.max.z) / 2 - z) > 3.2);
    let side = lrng.chance(0.5) ? 1 : -1;
    for (let attempt = 0; attempt < 40; attempt++) {
      if (attempt === 20) side = -side;
      const x = cx + side * (half - SPRING.radius - lrng.range(0.4, 2.2));
      const z = lrng.range(s.min.z + 2.2, s.max.z - 2.2);
      if (!clear(x, z)) continue;
      springs.push({ id: nextId++, zone: island.zone, pos: new Vector3(x, s.max.y, z), radius: SPRING.radius });
      break;
    }
  }

  // Crumble stones: one in every gap of Stormy Seas, Kraken Deep and Volcano Bay, beside the gap's buoy (if any).
  const stones: Stone[] = [];
  for (const gap of gaps) {
    if (gap.zone < 3 || gap.zone > 5) continue;
    const z = (gap.from.solid.min.z + gap.to.solid.max.z) / 2;
    const mx = anchorMidX(gap);
    const buoy = buoys.find((b) => b.zone === gap.zone && Math.abs(b.pos.z - z) < 0.5);
    const side = buoy ? (buoy.pos.x > mx ? -1 : 1) : lrng.chance(0.5) ? 1 : -1;
    const x = mx + side * 2.6;
    const h = CRUMBLE.size / 2;
    const solid = addSolid('stone', gap.zone, new Vector3(x - h, -4, z - h), new Vector3(x + h, CRUMBLE.top, z + h));
    stones.push({ id: nextId++, zone: gap.zone, solid });
  }

  return {
    seed,
    solids,
    islands,
    anchors,
    gaps,
    lighthouses,
    pads,
    zones,
    home,
    homeIsland,
    homeSpawn,
    pedestals,
    endZ: cursorZ,
    ftueSpawn: new Vector3(0, HOME_TOP, HOME_FRONT_Z + 4),
    shopZone: { min: new Vector3(9, HOME_TOP, HOME_FRONT_Z + 3), max: new Vector3(13, HOME_TOP + 3, HOME_FRONT_Z + 7) },
    buoys,
    geysers,
    springs,
    stones,
  };
}

function anchorMidX(gap: Gap): number {
  let x = 0;
  for (const a of gap.anchors) x += a.pos.x;
  return x / gap.anchors.length;
}

/** Zone index at a z position: -1 on the home side, otherwise 0..zones-1. */
export function zoneAtZ(course: Course, z: number): number {
  if (z > HOME_FRONT_Z) return -1;
  for (const zone of course.zones) {
    if (z > zone.endZ) return zone.index;
  }
  return course.zones.length - 1;
}

/** Height of the highest solid top under (x, z) that is at or below maxY; sea level if none. */
export function groundHeightAt(course: Course, x: number, z: number, maxY: number): number {
  let best = 0;
  for (const s of course.solids) {
    if (s.off || x < s.min.x || x > s.max.x || z < s.min.z || z > s.max.z) continue;
    if (s.max.y <= maxY + 0.01 && s.max.y > best) best = s.max.y;
  }
  return best;
}
