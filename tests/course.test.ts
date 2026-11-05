import { describe, expect, it } from 'vitest';
import { HOME_FRONT_Z, WAVE_CREST } from '../src/game/config';
import { LIGHTHOUSE_TOP, generateCourse, zoneAtZ } from '../src/game/course';
import { UPGRADES } from '../src/game/economy';
import { ZONES } from '../src/game/zones';
import { crossable } from './bot';

const course = generateCourse();

/** Reach level that matches each zone's hook gate. */
function gateLevel(zone: number): number {
  const need = ZONES[zone].minReach;
  for (let l = 0; l <= UPGRADES.reach.maxLevel; l++) if (UPGRADES.reach.value(l) + 1e-6 >= need) return l;
  throw new Error('gate above max reach');
}

describe('course generation', () => {
  it('is deterministic for a seed', () => {
    const again = generateCourse();
    expect(again.anchors.map((a) => a.pos.toArray())).toEqual(course.anchors.map((a) => a.pos.toArray()));
    expect(generateCourse(7).anchors[0].pos.toArray()).not.toEqual(course.anchors[0].pos.toArray());
  });

  it('has every zone, in order, running away from home', () => {
    expect(course.zones.map((z) => z.def.name)).toEqual(ZONES.map((z) => z.name));
    for (const z of course.zones) expect(z.endZ).toBeLessThan(z.startZ);
    expect(course.zones[0].startZ).toBe(HOME_FRONT_Z);
    expect(course.endZ).toBe(course.zones[course.zones.length - 1].endZ);
  });

  it('gives every gap hooks, every island spawn points, every zone a lighthouse', () => {
    for (const gap of course.gaps) expect(gap.anchors.length).toBe(ZONES[gap.zone].anchors);
    for (const island of course.islands) expect(island.spawnPoints.length).toBeGreaterThan(0);
    expect(course.lighthouses.length).toBe(ZONES.length);
    for (const lh of course.lighthouses) {
      expect(lh.platform.max.y).toBe(LIGHTHOUSE_TOP);
      expect(LIGHTHOUSE_TOP).toBeGreaterThan(WAVE_CREST);
    }
  });

  it('maps z positions to zones', () => {
    expect(zoneAtZ(course, HOME_FRONT_Z + 5)).toBe(-1);
    for (const z of course.zones) expect(zoneAtZ(course, (z.startZ + z.endZ) / 2)).toBe(z.index);
  });

  it('keeps hooks above the islands and gates them by zone', () => {
    for (const gap of course.gaps) {
      for (const a of gap.anchors) {
        expect(a.pos.y).toBeGreaterThan(Math.max(gap.from.solid.max.y, gap.to.solid.max.y) + 8);
        expect(a.minReach).toBe(ZONES[gap.zone].minReach);
      }
    }
  });
});

describe('every gap can be crossed', () => {
  // With exactly the rope needed to unlock the zone and modest other upgrades,
  // the bot must be able to swing across every gap. This keeps progression beatable.
  course.gaps.forEach((gap, i) => {
    it(`gap ${i} (zone ${gap.zone})`, () => {
      const stats = {
        runSpeed: UPGRADES.speed.value(gap.zone),
        reach: UPGRADES.reach.value(gateLevel(gap.zone)),
        power: UPGRADES.power.value(0),
      };
      expect(crossable(course, gap, stats)).not.toBeNull();
    });
  });

  course.gaps.forEach((gap, i) => {
    it(`gap ${i} (zone ${gap.zone}) with Perfect boosts on`, () => {
      const stats = {
        runSpeed: UPGRADES.speed.value(gap.zone),
        reach: UPGRADES.reach.value(gateLevel(gap.zone)),
        power: UPGRADES.power.value(0),
      };
      expect(crossable(course, gap, stats, { perfectBoost: true })).not.toBeNull();
    });
  });

  it('drifting hooks are crossable at every phase', () => {
    const drifting = course.gaps.filter((g) => g.anchors.some((a) => a.drift));
    expect(drifting.length).toBe(5);
    for (const gap of drifting) {
      const a = gap.anchors.find((x) => x.drift)!;
      const stats = {
        runSpeed: UPGRADES.speed.value(gap.zone),
        reach: UPGRADES.reach.value(gateLevel(gap.zone)),
        power: UPGRADES.power.value(0),
      };
      for (let k = 0; k < 8; k++) {
        const startTime = (k / 8) * a.drift!.period;
        expect(crossable(course, gap, stats, { startTime }), `zone ${gap.zone} phase ${k}/8`).not.toBeNull();
      }
    }
  });

  it('every gap of zones 2–5 has a buoy', () => {
    for (const gap of course.gaps) {
      const has = course.buoys.some((b) => b.pos.z < gap.from.solid.min.z && b.pos.z > gap.to.solid.max.z);
      expect(has).toBe(gap.zone >= 1 && gap.zone <= 4);
    }
  });

  it('cannot swing into a zone before the rope is long enough', () => {
    const gap = course.gaps.find((g) => g.zone === 3)!;
    const stats = { runSpeed: UPGRADES.speed.value(4), reach: UPGRADES.reach.value(gateLevel(3) - 1), power: UPGRADES.power.value(4) };
    expect(crossable(course, gap, stats)).toBeNull();
  });
});
