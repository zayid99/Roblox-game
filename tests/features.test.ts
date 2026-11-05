import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { dayKey, weekKey } from '../src/game/clock';
import { GEYSER_PERIOD, generateCourse, geyserStateAt } from '../src/game/course';
import { FEATURED_WEIGHT, rollCreature, SPECIES } from '../src/game/creatures';
import { FEATURABLE, featuredSpeciesFor } from '../src/game/featured';
import { BUOY, NO_INPUT } from '../src/game/player';
import { Rng } from '../src/game/rng';
import { GameSim, type SimEvent } from '../src/game/sim';
import { GameState } from '../src/game/state';
import { ZONES } from '../src/game/zones';

const DT = 1 / 120;

describe('Bounce Buoys', () => {
  const course = generateCourse();

  it('one buoy in every gap of zones 2–5, none in the Shallows', () => {
    expect(course.buoys.length).toBe(12);
    for (const b of course.buoys) {
      expect(b.zone).toBeGreaterThanOrEqual(1);
      expect(b.zone).toBeLessThanOrEqual(4);
      expect(b.radius).toBe(1.4);
      expect(b.pos.y).toBe(1.2);
      const gap = course.gaps.find((g) => g.zone === b.zone && b.pos.z < g.from.solid.min.z && b.pos.z > g.to.solid.max.z);
      expect(gap).toBeDefined();
    }
  });

  it('falling onto a buoy bounces you up and emits bounce', () => {
    const sim = new GameSim(new GameState(), { rngSeed: 1 });
    const b = sim.course.buoys[0];
    sim.player.reset(new Vector3(b.pos.x, 4, b.pos.z));
    sim.player.vel.set(1, -5, -1);
    const events: SimEvent[] = [];
    for (let i = 0; i < 120 && !events.some((e) => e.type === 'bounce'); i++) {
      sim.step(DT, NO_INPUT);
      events.push(...sim.events);
    }
    expect(events).toContainEqual({ type: 'bounce', buoyId: b.id });
    expect(sim.player.vel.y).toBeGreaterThanOrEqual(BUOY.bounceVel - 1);
    expect(sim.player.mode).toBe('air');
    expect(events.some((e) => e.type === 'player' && e.event === 'sea')).toBe(false);
  });
});

describe('Volcano geysers', () => {
  it('three vents on Volcano Bay islands, cycling idle → warning → erupting', () => {
    const course = generateCourse();
    const volcano = ZONES.findIndex((z) => z.name === 'Volcano Bay');
    expect(course.geysers.length).toBe(3);
    for (const g of course.geysers) expect(g.zone).toBe(volcano);
    const g = { ...course.geysers[0], phase: 0 };
    expect(geyserStateAt(g, 1)).toBe('idle');
    expect(geyserStateAt(g, 4.5)).toBe('warning');
    expect(geyserStateAt(g, 6)).toBe('erupting');
    expect(geyserStateAt(g, 6 + GEYSER_PERIOD)).toBe('erupting');
  });

  it('an erupting geyser launches a player standing on the vent', () => {
    const sim = new GameSim(new GameState(), { rngSeed: 1 });
    const g = sim.course.geysers[0];
    sim.player.reset(g.pos.clone());
    // Start just before an eruption.
    sim.time = ((5.5 - g.phase) % GEYSER_PERIOD + GEYSER_PERIOD) % GEYSER_PERIOD;
    expect(sim.geyserState(g.id)).toBe('erupting');
    const events: SimEvent[] = [];
    for (let i = 0; i < 30; i++) {
      sim.step(DT, NO_INPUT);
      events.push(...sim.events);
    }
    expect(events).toContainEqual({ type: 'geyser', geyserId: g.id });
    expect(sim.player.pos.y).toBeGreaterThan(g.pos.y + 2);
  });
});

describe('Featured Creature', () => {
  it('is seeded by the week and comes from rarity ≤ 4', () => {
    expect(FEATURABLE.length).toBe(15);
    const a = featuredSpeciesFor('2026-W45');
    expect(featuredSpeciesFor('2026-W45')).toBe(a);
    expect(SPECIES.find((s) => s.id === a)!.rarity).toBeLessThanOrEqual(4);
    const seen = new Set<string>();
    for (let w = 1; w <= 52; w++) seen.add(featuredSpeciesFor(`2026-W${w}`));
    expect(seen.size).toBeGreaterThan(5);
  });

  it('spawns at 2× weight within its rarity', () => {
    const rng = new Rng(11);
    let featured = 0;
    let total = 0;
    for (let i = 0; i < 30000; i++) {
      const c = rollCreature(2, false, rng, 'banana_shark');
      if (SPECIES.find((s) => s.id === c.speciesId)!.rarity !== 2) continue;
      total++;
      if (c.speciesId === 'banana_shark') featured++;
    }
    const expected = FEATURED_WEIGHT / (FEATURED_WEIGHT + 2);
    expect(featured / total).toBeGreaterThan(expected - 0.02);
    expect(featured / total).toBeLessThan(expected + 0.02);
  });

  it('wild creatures carry the featured flag', () => {
    const sim = new GameSim(new GameState(), { rngSeed: 4, featuredSpecies: 'toastopus' });
    const toast = sim.wild.filter((c) => c.speciesId === 'toastopus');
    expect(toast.length).toBeGreaterThan(0);
    expect(toast.every((c) => c.featured)).toBe(true);
    expect(sim.wild.filter((c) => c.speciesId !== 'toastopus').every((c) => !c.featured)).toBe(true);
  });

  it('week and day keys', () => {
    const t = new Date(2026, 10, 5, 12).getTime(); // Thu 5 Nov 2026
    expect(dayKey(t)).toBe('2026-11-05');
    expect(weekKey(t)).toBe('2026-W45');
    expect(weekKey(new Date(2027, 0, 1, 12).getTime())).toBe('2026-W53');
  });
});
