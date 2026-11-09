// Pacing regression test: the zone ladder, rebirth cycles and egg prices must stay where the balance pass put them.
// tests/pacingSim.ts plays the real economy (GameState, rolls, rewards, offline earnings) with the measured trip
// times of a typical player in 12-minute daily sessions. Bands are minutes of play; see the balance spec for targets.
import { describe, expect, it } from 'vitest';
import { REBIRTH, UPGRADES, UPGRADE_ORDER, bulkCost, formatNumber, reachGateLevel, rebirthCost, rebirthMultiplier } from '../src/game/economy';
import { EGGS, EGG_MINUTES, STAGE_INCOME, eggCost, eggPrice } from '../src/game/hatchery';
import { ZONES } from '../src/game/zones';
import { TYPICAL_FTUE, simulatePacing } from './pacingSim';

const SEEDS = [1, 2, 3, 4, 5, 6, 7];
const runs = SEEDS.map((seed) => simulatePacing({ seed }));
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};
/** Median minutes of play at which zone z's gate was bought. */
const gateMin = (z: number) => median(runs.map((r) => r.gate[z] / 60));
const LAST = ZONES.length - 1;
/** Cost of the Rope Reach levels from zone z's gate to zone z + 1's gate. */
const nextGateCost = (z: number) => bulkCost('reach', reachGateLevel(z), reachGateLevel(z + 1) - reachGateLevel(z));

describe('pacing: typical player, 12-minute daily sessions', () => {
  it('delivers the first creature within 90 s and opens Coral Reef in the tutorial', () => {
    expect(TYPICAL_FTUE.firstDeliverSec).toBeLessThanOrEqual(90);
    expect(gateMin(1)).toBeLessThanOrEqual(5);
  });

  it('opens Lagoon in the first session and Stormy Seas by the second', () => {
    expect(gateMin(2)).toBeLessThanOrEqual(12);
    expect(gateMin(3)).toBeLessThanOrEqual(24);
    for (const r of runs) expect(r.gate[3] / 60).toBeLessThanOrEqual(30);
  });

  it('spreads the later zones over the first week', () => {
    const z5 = gateMin(4);
    const z6 = gateMin(5);
    const z7 = gateMin(LAST);
    expect(z5).toBeGreaterThanOrEqual(36);
    expect(z5).toBeLessThanOrEqual(60);
    expect(z6).toBeGreaterThanOrEqual(66);
    expect(z6).toBeLessThanOrEqual(100);
    expect(z7).toBeGreaterThanOrEqual(115);
    expect(z7).toBeLessThanOrEqual(165);
  });

  it('reaches the first rebirth after about 2.5 to 3.5 hours of play', () => {
    const r1 = median(runs.map((r) => (r.rebirths[0] ?? Infinity) / 60));
    expect(r1).toBeGreaterThanOrEqual(150);
    expect(r1).toBeLessThanOrEqual(220);
  });

  it('offers a purchase every couple of minutes in the first 15 minutes', () => {
    const gaps = runs.map((r) => {
      const ts = [...new Set(r.purchases.filter((p) => p.t <= 900).map((p) => Math.round(p.t)))].sort((a, b) => a - b);
      let g = 0;
      for (let i = 1; i < ts.length; i++) g = Math.max(g, ts[i] - ts[i - 1]);
      return g / 60;
    });
    expect(median(gaps)).toBeLessThanOrEqual(2.5);
    for (const g of gaps) expect(g).toBeLessThanOrEqual(4);
  });

  it('buys every upgrade level before the first rebirth (no dead levels)', () => {
    for (const r of runs) {
      for (const key of UPGRADE_ORDER) expect(`${key} ${r.levelsBeforeRebirth[key]}`).toBe(`${key} ${UPGRADES[key].maxLevel}`);
    }
  });

  it('makes each rebirth cycle shorter for five cycles without making it trivial', () => {
    const cycles = [0, 1, 2, 3, 4].map((n) => median(runs.map((r) => (r.rebirths[n] - (n ? r.rebirths[n - 1] : 0)) / 60)));
    for (let n = 1; n < cycles.length; n++) expect(cycles[n]).toBeLessThan(cycles[n - 1]);
    // About 30% faster each cycle on average (0.7^4 = 0.24), and the fifth still takes a few sessions.
    expect(cycles[4] / cycles[0]).toBeGreaterThan(0.12);
    expect(cycles[4] / cycles[0]).toBeLessThan(0.45);
    expect(cycles[4]).toBeGreaterThanOrEqual(24);
  });

  it('opens Stormy Seas within about half an hour of one long first session too', () => {
    const long = SEEDS.map((seed) => simulatePacing({ seed, sessionMin: 0, maxPlayMin: 60 }));
    expect(median(long.map((r) => r.gate[3] / 60))).toBeLessThanOrEqual(30);
  });
});

describe('eggs and zone gates', () => {
  it('prices each egg at 3 to 6 minutes of the income a typical player has when its zone opens', () => {
    for (let z = 0; z < EGGS.length; z++) {
      const minutes = eggPrice(z) / STAGE_INCOME[z] / 60;
      expect(minutes).toBeGreaterThanOrEqual(3);
      expect(minutes).toBeLessThanOrEqual(6);
    }
    expect(EGG_MINUTES).toBeGreaterThanOrEqual(3);
    // STAGE_INCOME must track the simulated income when each zone is first reached, within a factor of 3 (income
    // grows fast right then: the first Coral Reef trip alone takes it from $2/s to about $15/s).
    for (let z = 1; z < ZONES.length; z++) {
      const income = median(runs.map((r) => r.incomeAtVisit[z]));
      expect(STAGE_INCOME[z] / income).toBeGreaterThan(1 / 3);
      expect(STAGE_INCOME[z] / income).toBeLessThan(3);
    }
  });

  it('never prices an egg above twice the next zone gate', () => {
    // When zone z opens, the next gate is zone z + 1's. The Shallows Egg goes on sale after the tutorial, which
    // already bought the Coral Reef gate, so it is compared with the Lagoon gate.
    for (let z = 0; z < LAST; z++) expect(EGGS[z].price).toBeLessThanOrEqual(2 * nextGateCost(Math.max(1, z)));
  });

  it('keeps hatching behind swinging', () => {
    // An egg brings one creature for >= 3 minutes of income; a trip to the same zone brings several in a minute or
    // two. Eggs also follow the rebirth multiplier so they cost the same minutes of income in every cycle.
    for (let z = 0; z < EGGS.length; z++) expect(EGGS[z].price).toBeGreaterThanOrEqual(3 * 60 * STAGE_INCOME[z]);
    expect(eggCost({ rebirths: 3 }, 6)).toBeGreaterThanOrEqual(EGGS[6].price * rebirthMultiplier(3) * 0.9);
  });

  it('caps Rope Reach at the last zone gate and gates every zone below it', () => {
    expect(UPGRADES.reach.maxLevel).toBe(reachGateLevel(LAST));
    for (let z = 1; z < ZONES.length; z++) expect(reachGateLevel(z)).toBeGreaterThan(reachGateLevel(z - 1));
    expect(UPGRADES.reach.value(UPGRADES.reach.maxLevel) + 1e-6).toBeGreaterThanOrEqual(ZONES[LAST].minReach);
  });

  it('gives every upgrade a price and a value that rise with each level', () => {
    for (const key of UPGRADE_ORDER) {
      const def = UPGRADES[key];
      if (def.costs) expect(def.costs.length).toBe(def.maxLevel);
      for (let l = 1; l < def.maxLevel; l++) {
        expect(bulkCost(key, l, 1)).toBeGreaterThan(bulkCost(key, l - 1, 1));
        expect(def.value(l + 1)).toBeGreaterThan(def.value(l));
      }
    }
  });

  it('keeps late-game numbers finite and readable', () => {
    expect(REBIRTH.multGrowth).toBeGreaterThan(REBIRTH.costGrowth);
    for (let n = 0; n <= 25; n++) {
      expect(Number.isFinite(rebirthCost(n))).toBe(true);
      expect(rebirthCost(n + 1)).toBeGreaterThanOrEqual(rebirthCost(n));
    }
    expect(rebirthCost(25)).toBeLessThan(1e18);
    expect(formatNumber(rebirthCost(25))).toMatch(/^\d+(\.\d+)?(K|M|B|T|Qa|Qi)$/);
  });
});
