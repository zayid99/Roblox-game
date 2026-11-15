// Treasure Bottles (src/game/treasure.ts and its GameSim hooks): spawn rules, odds, carry slot, wave, opening,
// and the economy impact measured with the pacing model.
import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import type { SimEvent } from '../src/contracts';
import { getSpecies } from '../src/game/creatures';
import { NO_INPUT } from '../src/game/player';
import { minutes } from '../src/game/rewards';
import { Rng } from '../src/game/rng';
import { GameSim } from '../src/game/sim';
import { GameState } from '../src/game/state';
import { BOTTLE_TABLES, openBottle, oddsText, rollPrizeRow, rollWaveBottle, TREASURE } from '../src/game/treasure';
import { ZONES } from '../src/game/zones';
import { simulatePacing } from './pacingSim';

const DT = 1 / 60;

function readySim(seed = 5, bestZone = 1): GameSim {
  const s = new GameState();
  s.ftue.done = true;
  s.bestZone = bestZone;
  return new GameSim(s, { rngSeed: seed });
}

/** Runs the next wave to its end with the player safe at home. Returns the events of the run. */
function runWave(sim: GameSim): SimEvent[] {
  const seen: SimEvent[] = [];
  sim.player.reset(sim.course.homeSpawn.clone());
  sim.wave.forceSurge();
  const before = sim.wave.count;
  for (let i = 0; i < 60 * 40 && sim.wave.count === before; i++) {
    sim.step(DT, NO_INPUT);
    seen.push(...sim.events);
  }
  return seen;
}

describe('treasure: which waves leave a bottle', () => {
  it('Big Waves always leave a Legendary bottle, Golden Waves a normal one, other waves 30%', () => {
    const rng = new Rng(1);
    expect(rollWaveBottle(false, true, rng)).toBe('legendary');
    expect(rollWaveBottle(true, true, rng)).toBe('legendary');
    expect(rollWaveBottle(true, false, rng)).toBe('normal');
    let n = 0;
    for (let i = 0; i < 20000; i++) if (rollWaveBottle(false, false, rng)) n++;
    expect(n / 20000).toBeCloseTo(TREASURE.normalWaveChance, 1);
  });

  it('prize tables sum to 100% and roll at their odds', () => {
    for (const kind of ['normal', 'legendary'] as const) {
      const table = BOTTLE_TABLES[kind];
      expect(table.reduce((a, r) => a + r.weight, 0)).toBe(100);
      const rng = new Rng(7);
      const counts = new Map<string, number>();
      const N = 40000;
      for (let i = 0; i < N; i++) {
        const k = rollPrizeRow(kind, rng).kind;
        counts.set(k, (counts.get(k) ?? 0) + 1);
      }
      for (const r of table) expect(Math.abs((counts.get(r.kind) ?? 0) / N - r.weight / 100)).toBeLessThan(0.01);
      expect(oddsText(kind)).toContain(`${table[0].weight}% Cash`);
    }
  });

  it('r4 odds for a normal bottle: 50 cash · 20 pearls · 12 boost · 10 Lucky Tide · 7 creature · 1 Rainbow', () => {
    expect(BOTTLE_TABLES.normal.map((r) => [r.kind, r.weight])).toEqual([
      ['cash', 50], ['pearls', 20], ['boost', 12], ['luckyTide', 10], ['creature', 7], ['rainbow', 1],
    ]);
  });
});

describe('treasure: opening', () => {
  it('resolves every prize kind against the state (minutes of income, zone rarity + 1)', () => {
    const s = new GameState();
    s.bestZone = 1;
    s.base[0] = { speciesId: 'toastopus', mutation: 0 };
    const rng = new Rng(11);
    const seen = new Set<string>();
    for (let i = 0; i < 4000; i++) {
      const { prize, reward } = openBottle(s, 'normal', rng);
      seen.add(prize);
      if (prize === 'cash') {
        expect(reward.cash).toBeGreaterThanOrEqual(minutes(s, 1));
        expect(reward.cash).toBeLessThanOrEqual(minutes(s, 2));
      } else if (prize === 'boost') expect(reward.boost2xSec).toBe(TREASURE.boostSec);
      else if (prize === 'luckyTide') expect(reward.luckyTide).toBe(1);
      else if (prize === 'pearls') expect(reward.pearls).toBeGreaterThanOrEqual(15);
      else if (prize === 'creature') {
        expect(getSpecies(reward.creature!.speciesId).rarity).toBe(ZONES[1].rarity + 1);
        expect([1, 2]).toContain(reward.creature!.mutation);
      } else {
        expect(reward.creature!.mutation).toBe(3);
        expect(getSpecies(reward.creature!.speciesId).rarity).toBe(ZONES[1].rarity);
      }
    }
    expect(seen.size).toBe(6);
  });

  it('is deterministic for a seed', () => {
    const s = new GameState();
    const a = Array.from({ length: 50 }, ((r) => () => openBottle(s, 'legendary', r))(new Rng(3)));
    const b = Array.from({ length: 50 }, ((r) => () => openBottle(s, 'legendary', r))(new Rng(3)));
    expect(a).toEqual(b);
  });
});

describe('treasure: in the sim', () => {
  it('a Golden Wave leaves a bottle on the farthest island the player can reach', () => {
    const sim = readySim(5, 1);
    while (!sim.wave.golden) runWave(sim);
    const ev = runWave(sim).find((e) => e.type === 'bottleSpawn');
    expect(ev).toBeDefined();
    const b = sim.treasure.world[0];
    const farthest = Math.max(...sim.course.islands.filter((i) => i.zone <= 1).map((i) => i.order));
    expect(b.islandOrder).toBe(farthest);
    expect(b.zone).toBeLessThanOrEqual(1);
  });

  it('never washes up a bottle during the tutorial', () => {
    const s = new GameState(); // ftue not done
    const sim = new GameSim(s, { rngSeed: 2 });
    for (let i = 0; i < 6; i++) expect(runWave(sim).some((e) => e.type === 'bottleSpawn')).toBe(false);
    s.ftue.done = true;
    sim.tutorialActive = true; // a replay
    for (let i = 0; i < 6; i++) expect(runWave(sim).some((e) => e.type === 'bottleSpawn')).toBe(false);
  });

  it('uses a carry slot, and the next wave washes away a bottle nobody picked up', () => {
    const sim = readySim();
    const b = sim.spawnBottle('normal')!;
    sim.step(DT, NO_INPUT);
    expect(sim.events.some((e) => e.type === 'bottleSpawn' && e.reason === 'debug')).toBe(true);
    const free = sim.carryFree();
    sim.player.reset(b.pos.clone().add(new Vector3(0, 0.1, 0)));
    sim.step(DT, NO_INPUT);
    expect(sim.events.some((e) => e.type === 'bottlePickup')).toBe(true);
    expect(sim.carryFree()).toBe(free - 1);

    const sim2 = readySim();
    sim2.spawnBottle('normal');
    const ev = runWave(sim2);
    expect(ev.some((e) => e.type === 'bottleLost' && e.how === 'washed')).toBe(true);
    expect(sim2.treasure.world.length).toBeLessThanOrEqual(1); // at most the new wave's own bottle
  });

  it('a full carry blocks the pick-up (Hands full)', () => {
    const sim = readySim();
    while (sim.state.canCarryMore()) sim.state.pickUp({ speciesId: 'toastopus', mutation: 0 });
    const b = sim.spawnBottle('normal')!;
    sim.player.reset(b.pos.clone().add(new Vector3(0, 0.1, 0)));
    sim.step(DT, NO_INPUT);
    expect(sim.events.some((e) => e.type === 'carryFull')).toBe(true);
    expect(sim.treasure.carried.length).toBe(0);
  });

  it('the wave takes a carried bottle like a creature', () => {
    const sim = readySim();
    const b = sim.spawnBottle('legendary')!;
    sim.player.reset(b.pos.clone().add(new Vector3(0, 0.1, 0)));
    sim.step(DT, NO_INPUT);
    expect(sim.treasure.carried.length).toBe(1);
    sim.wave.forceSurge();
    const seen: SimEvent[] = [];
    for (let i = 0; i < 60 * 30 && !seen.some((e) => e.type === 'splash'); i++) {
      sim.step(DT, NO_INPUT);
      seen.push(...sim.events);
    }
    expect(seen.some((e) => e.type === 'bottleLost' && e.how === 'splash' && e.kinds[0] === 'legendary')).toBe(true);
    expect(sim.treasure.carried.length).toBe(0);
  });

  it('delivered home it opens and its prize goes into the state', () => {
    const sim = readySim(9);
    sim.state.base[0] = { speciesId: 'toastopus', mutation: 0 };
    const b = sim.spawnBottle('normal')!;
    sim.player.reset(b.pos.clone().add(new Vector3(0, 0.1, 0)));
    sim.step(DT, NO_INPUT);
    const before = { cash: sim.state.cash, pearls: sim.state.pearls, lt: sim.state.tokens.luckyTide, boost: sim.state.tokens.boost2xSec };
    sim.player.reset(sim.course.homeSpawn.clone().add(new Vector3(0, 0.5, 0)));
    let open: Extract<SimEvent, { type: 'bottleOpen' }> | undefined;
    for (let i = 0; i < 60 && !open; i++) {
      sim.step(DT, NO_INPUT);
      open = sim.events.find((e): e is Extract<SimEvent, { type: 'bottleOpen' }> => e.type === 'bottleOpen');
    }
    expect(open).toBeDefined();
    const r = open!.reward;
    if (r.cash) expect(sim.state.cash - before.cash).toBeGreaterThanOrEqual(r.cash);
    if (r.pearls) expect(sim.state.pearls - before.pearls).toBeGreaterThanOrEqual(r.pearls);
    if (r.luckyTide) expect(sim.state.tokens.luckyTide).toBe(before.lt + 1);
    if (r.boost2xSec) expect(sim.state.tokens.boost2xSec).toBe(before.boost + r.boost2xSec);
    expect(sim.treasure.carried.length).toBe(0);
  });

  it('keeps the creature rolls of a seed unchanged (own Rng)', () => {
    const a = readySim(4);
    const b = readySim(4);
    b.spawnBottle('normal');
    for (let i = 0; i < 3; i++) {
      runWave(a);
      runWave(b);
    }
    expect(b.wild.map((c) => [c.speciesId, c.mutation])).toEqual(a.wild.map((c) => [c.speciesId, c.mutation]));
  });
});

describe('treasure: economy impact (tests/pacingSim.ts, treasureShare)', () => {
  const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const gates = (share: number) => {
    const rs = SEEDS.map((seed) => simulatePacing({ seed, maxPlayMin: 6 * 60, treasureShare: share }));
    return [2, 3, 4, 5, 6].map((z) => mean(rs.map((r) => r.gate[z] / 60)));
  };

  it('off by default: the pacing bands are measured without bottles', () => {
    expect(simulatePacing({ seed: 3, maxPlayMin: 60 })).toEqual(simulatePacing({ seed: 3, maxPlayMin: 60, treasureShare: 0 }));
  });

  it('brings zone gates forward by a bounded share when the player brings home half the bottles', () => {
    // Measured: Lagoon -12%, Stormy Seas to Secret Reef -19 to -22% at a 50% pick-up rate (see src/game/treasure.ts).
    const base = gates(0);
    const withBottles = gates(0.5);
    for (let i = 0; i < base.length; i++) {
      const shift = (withBottles[i] - base[i]) / base[i];
      expect(shift).toBeLessThanOrEqual(0.01);
      expect(shift).toBeGreaterThan(-0.27);
    }
  });
});
