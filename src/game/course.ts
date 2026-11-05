import { Vector3 } from 'three';
import { HOME_FRONT_Z, HOME_TOP } from './config';
import { Rng } from './rng';
import { ZONES, type ZoneDef } from './zones';

export interface AABB {
  min: Vector3;
  max: Vector3;
}

export type SolidKind = 'home' | 'island' | 'tower' | 'platform';

export interface Solid extends AABB {
  id: number;
  kind: SolidKind;
  /** Zone index, or -1 for the home island. */
  zone: number;
}

export interface Anchor {
  id: number;
  zone: number;
  pos: Vector3;
  /** Rope Reach needed before this hook can be grabbed (zone gate). */
  minReach: number;
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
  };
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
    if (x < s.min.x || x > s.max.x || z < s.min.z || z > s.max.z) continue;
    if (s.max.y <= maxY + 0.01 && s.max.y > best) best = s.max.y;
  }
  return best;
}
