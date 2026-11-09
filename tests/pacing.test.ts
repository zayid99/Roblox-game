// Pacing regression test: the zone ladder, rebirth cycles and egg prices must stay where the balance pass put them.
// tests/pacingSim.ts plays the real economy (GameState, rolls, rewards, offline earnings) with the measured trip
// times of a typical player. The primary case is ONE continuous sitting (most CrazyGames players never come back);
// the daily-session pattern (12-minute sessions + Welcome Back) is checked more loosely. Bands are minutes of play.
import { describe, expect, it } from 'vitest';
import { ECONOMY } from '../src/game/config';
import { REBIRTH, UPGRADES, UPGRADE_ORDER, bulkCost, formatNumber, reachGateLevel, rebirthCost, rebirthMultiplier } from '../src/game/economy';
import { EGGS, EGG_MINUTES, STAGE_INCOME, eggCost, eggPrice } from '../src/game/hatchery';
import { ZONES } from '../src/game/zones';
import { TYPICAL_FTUE, simulatePacing, type PacingResult } from './pacingSim';

const SEEDS = [1, 2, 3, 4, 5, 6, 7];
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};
const LAST = ZONES.length - 1;
/** Median minutes of play at which zone z's gate was bought. */
const gateMin = (rs: PacingResult[], z: number) => median(rs.map((r) => r.gate[z] / 60));
/** Cost of the Rope Reach levels from zone z's gate to zone z + 1's gate. */
const nextGateCost = (z: number) => bulkCost('reach', reachGateLevel(z), reachGateLevel(z + 1) - reachGateLevel(z));
/** Longest gap (minutes) between purchase moments within the first `limitMin` minutes. */
const longestGap = (r: PacingResult, fromMin: number, limitMin: number) => {
  const ts = [fromMin * 60, ...new Set(r.purchases.filter((p) => p.t >= fromMin * 60 && p.t <= limitMin * 60).map((p) => Math.round(p.t)))].sort((a, b) => a - b);
  let g = 0;
  for (let i = 1; i < ts.length; i++) g = Math.max(g, ts[i] - ts[i - 1]);
  return g / 60;
};

const sitting = SEEDS.map((seed) => simulatePacing({ seed, maxPlayMin: 8 * 60 }));

describe('pacing: typical player, one continuous sitting', () => {
  it('delivers the first creature within 90 s and opens Coral Reef in the tutorial', () => {
    expect(TYPICAL_FTUE.firstDeliverSec).toBeLessThanOrEqual(90);
    expect(gateMin(sitting, 1)).toBeLessThanOrEqual(5);
  });

  it('opens Lagoon by ~12 min and Stormy Seas at ~20-28 min', () => {
    expect(gateMin(sitting, 2)).toBeLessThanOrEqual(12);
    expect(gateMin(sitting, 3)).toBeGreaterThanOrEqual(18);
    expect(gateMin(sitting, 3)).toBeLessThanOrEqual(28);
  });

  it('opens Kraken Deep at ~40-55, Volcano Bay at ~70-90 and Secret Reef at ~120-150 min', () => {
    const bands: [number, number, number][] = [[4, 40, 58], [5, 70, 95], [LAST, 115, 155]];
    for (const [z, lo, hi] of bands) {
      expect(gateMin(sitting, z)).toBeGreaterThanOrEqual(lo);
      expect(gateMin(sitting, z)).toBeLessThanOrEqual(hi);
    }
  });

  it('reaches the first rebirth after about 2.5 to 3.5 hours', () => {
    const r1 = median(sitting.map((r) => (r.rebirths[0] ?? Infinity) / 60));
    expect(r1).toBeGreaterThanOrEqual(150);
    expect(r1).toBeLessThanOrEqual(215);
  });

  it('always has something worthwhile affordable: gaps <= 3 min in the first hour, <= 5 min until the first rebirth', () => {
    expect(median(sitting.map((r) => longestGap(r, 0, 15)))).toBeLessThanOrEqual(3);
    for (const r of sitting) {
      expect(r.nothingAffordableFirstHour / 60).toBeLessThanOrEqual(3);
      expect(r.nothingAffordableLater / 60).toBeLessThanOrEqual(5);
    }
  });

  it('buys every upgrade level before the first rebirth (no dead levels)', () => {
    for (const r of sitting) {
      for (const key of UPGRADE_ORDER) expect(`${key} ${r.levelsBeforeRebirth[key]}`).toBe(`${key} ${UPGRADES[key].maxLevel}`);
    }
  });

  it('makes the next climb clearly faster after a rebirth', () => {
    const long = SEEDS.map((seed) => simulatePacing({ seed, maxPlayMin: 10 * 60, maxRebirths: 3 }));
    const c1 = median(long.map((r) => r.rebirths[0] / 60));
    const c2 = median(long.map((r) => (r.rebirths[1] - r.rebirths[0]) / 60));
    const c3 = median(long.map((r) => (r.rebirths[2] - r.rebirths[1]) / 60));
    expect(c2 / c1).toBeLessThan(0.85);
    expect(c3 / c2).toBeLessThan(0.9);
    expect(c3).toBeGreaterThanOrEqual(30);
  });

  it('gets casual players to Stormy Seas within ~35 min and skilled players there clearly sooner', () => {
    const casual = SEEDS.map((seed) => simulatePacing({ seed, maxPlayMin: 4 * 60, maxRebirths: 1, tripTimeMult: 1.5 }));
    const skilled = SEEDS.map((seed) => simulatePacing({ seed, maxPlayMin: 5 * 60, maxRebirths: 1, tripTimeMult: 0.75 }));
    expect(gateMin(casual, 3)).toBeLessThanOrEqual(35);
    expect(gateMin(skilled, LAST)).toBeLessThanOrEqual(0.9 * gateMin(sitting, LAST));
  });
});

describe('pacing: 12-minute daily sessions with Welcome Back', () => {
  const daily = SEEDS.map((seed) => simulatePacing({ seed, sessionMin: 12, maxPlayMin: 6 * 60, maxRebirths: 2 }));

  it('is a bonus, not the main income: offline earns a fraction of base income, capped', () => {
    expect(ECONOMY.offlineRate).toBeGreaterThan(0);
    expect(ECONOMY.offlineRate).toBeLessThanOrEqual(0.25);
  });

  it('is somewhat faster per minute played, but never lets one Welcome Back open two zones', () => {
    for (const r of daily) expect(r.maxGatesPerWelcome).toBeLessThanOrEqual(1);
    expect(gateMin(daily, 3)).toBeLessThanOrEqual(24);
    expect(gateMin(daily, LAST)).toBeLessThanOrEqual(gateMin(sitting, LAST));
    expect(gateMin(daily, LAST)).toBeGreaterThanOrEqual(0.35 * gateMin(sitting, LAST));
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
      const income = median(sitting.map((r) => r.incomeAtVisit[z]));
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
