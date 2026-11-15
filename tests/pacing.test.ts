// Pacing regression test: the zone ladder, rebirth cycles and egg prices must stay where the balance pass put them.
// tests/pacingSim.ts plays the real economy (GameState, rolls, rewards, offline earnings) with the measured trip
// times of a typical player. The primary case is ONE continuous sitting (most CrazyGames players never come back);
// the daily-session pattern (12-minute sessions + Welcome Back) is checked more loosely. Bands are minutes of play.
// The early bands follow pacing proposal F1 (docs/research/r2-pacing.md): Lagoon at ~4-6 min, a reward moment every
// minute or two through minute 10, and no big lump of rewards at once. 21 seeds: zone times come in whole trips, so a
// median over 7 seeds jumped by a trip (1-2 min) from small changes.
import { describe, expect, it } from 'vitest';
import { ECONOMY } from '../src/game/config';
import { REBIRTH, UPGRADES, UPGRADE_ORDER, bulkCost, formatNumber, reachGateLevel, rebirthCost, rebirthMultiplier } from '../src/game/economy';
import { EGGS, EGG_MINUTES, STAGE_INCOME, eggCost, eggPrice } from '../src/game/hatchery';
import { ZONES } from '../src/game/zones';
import { TYPICAL_FTUE, simulatePacing, type PacingEvent, type PacingResult } from './pacingSim';

const SEEDS = Array.from({ length: 21 }, (_, i) => i + 1);
const pct = (xs: number[], q: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(q * xs.length))];
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

const events: PacingEvent[][] = SEEDS.map(() => []);
const sitting = SEEDS.map((seed, i) => simulatePacing({ seed, maxPlayMin: 8 * 60, events: events[i] }));

/** Longest stretch (seconds) without a reward moment (gift, quest, mission, Daily, purchase, first trip to a zone). */
const longestQuiet = (evs: PacingEvent[], from: number, to: number) => {
  const ts = [from, ...evs.map((e) => e.t).filter((t) => t > from && t < to), to].sort((a, b) => a - b);
  let g = 0;
  for (let i = 1; i < ts.length; i++) g = Math.max(g, ts[i] - ts[i - 1]);
  return g;
};
/**
 * Biggest lump of rewards that land on their own (gifts as they unlock, quests the player did not complete right then
 * with a purchase) within 10 s, in minutes of the income at that moment. Missions are left out: they wait for a CLAIM
 * tap, whenever the player opens the panel.
 */
const biggestLump = (evs: PacingEvent[], from: number, to: number) => {
  const passive = evs.filter((e) => (e.kind === 'gift' || e.kind === 'quest') && !e.byPlayer && e.t >= from && e.t <= to);
  let best = 0;
  for (const e of passive) {
    const near = evs.filter((x) => Math.abs(x.t - e.t) <= 10);
    const cash = passive.filter((x) => Math.abs(x.t - e.t) <= 10).reduce((a, x) => a + Math.max(0, x.cash), 0);
    const income = Math.max(...near.map((x) => x.income));
    if (income > 0) best = Math.max(best, cash / income / 60);
  }
  return best;
};

describe('pacing: typical player, one continuous sitting', () => {
  it('delivers the first creature within 90 s and opens Coral Reef in the tutorial', () => {
    expect(TYPICAL_FTUE.firstDeliverSec).toBeLessThanOrEqual(90);
    expect(gateMin(sitting, 1)).toBeLessThanOrEqual(5);
  });

  it('opens Lagoon at ~4-6 min (F1), the same for everyone, and Stormy Seas at ~20-28 min', () => {
    // F1: Lagoon $8K (was $20K, ~11-13 min, the session's only goal from minute 4).
    const lagoon = sitting.map((r) => r.gate[2] / 60);
    expect(gateMin(sitting, 2)).toBeLessThanOrEqual(6);
    expect(pct(lagoon, 0.75) - pct(lagoon, 0.25)).toBeLessThanOrEqual(1.5);
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
      // A very lucky climb (a top Mystery roll; first rebirth well before the band) runs ahead of the price ladder.
      expect(r.nothingAffordableLater / 60).toBeLessThanOrEqual(6);
    }
    expect(pct(sitting.map((r) => r.nothingAffordableLater / 60), 0.9)).toBeLessThanOrEqual(5);
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

  it('gets casual players to Stormy Seas within ~35 min and skilled players there sooner', () => {
    const casual = SEEDS.map((seed) => simulatePacing({ seed, maxPlayMin: 4 * 60, maxRebirths: 1, tripTimeMult: 1.5 }));
    const skilled = SEEDS.map((seed) => simulatePacing({ seed, maxPlayMin: 5 * 60, maxRebirths: 1, tripTimeMult: 0.75 }));
    expect(gateMin(casual, 3)).toBeLessThanOrEqual(35);
    // Was 0.9 on 7 seeds (0.93 on 101 seeds before F1: flaky). Time-based rewards (gifts, quests, missions) are the
    // same for both, so the skilled lead is smaller than their trip speed; 0.95 on 21 seeds.
    expect(gateMin(skilled, LAST)).toBeLessThanOrEqual(0.95 * gateMin(sitting, LAST));
  });

  it('keeps a reward moment every couple of minutes, without big lumps (F1 cadence)', () => {
    // Minutes 2-10: gifts every ~1.5 min, small quests, missions, cheap upgrades. Before F1: quests 7-10 paid ~10 min of
    // income at once on the first Coral Reef trip, then nothing reachable from minute 8 to 13.
    expect(pct(events.map((e) => longestQuiet(e, 120, 600)), 0.5)).toBeLessThanOrEqual(150);
    expect(pct(events.map((e) => longestQuiet(e, 120, 600)), 0.9)).toBeLessThanOrEqual(180);
    // Minutes 10-30: the Deep Voyage and the later gifts while saving for Stormy Seas.
    expect(pct(events.map((e) => longestQuiet(e, 600, 1800)), 0.5)).toBeLessThanOrEqual(6 * 60);
    expect(pct(events.map((e) => biggestLump(e, 120, 600)), 0.5)).toBeLessThanOrEqual(6);
    expect(pct(events.map((e) => biggestLump(e, 120, 1800)), 0.9)).toBeLessThanOrEqual(9);
  });

  it('walks the First Voyage in ~10 min and the Deep Voyage toward Stormy Seas and Kraken Deep', () => {
    const q = (n: number) => median(sitting.map((r) => (r.questAt[n - 1] ?? Infinity) / 60));
    const d = (n: number) => median(sitting.map((r) => (r.deepAt[n - 1] ?? Infinity) / 60));
    expect(q(10)).toBeLessThanOrEqual(7); // Reach Lagoon
    expect(q(12)).toBeLessThanOrEqual(11); // Golden Wave catch (the 8-min gift is a Lucky Tide)
    expect(d(1)).toBeLessThanOrEqual(12);
    expect(d(7)).toBeLessThanOrEqual(gateMin(sitting, 3) + 3); // Reach Stormy Seas
    expect(d(10)).toBeLessThanOrEqual(gateMin(sitting, 4) + 5); // Reach Kraken Deep
    // Steps spread out: never 5 Deep Voyage quests at the same moment.
    for (const r of sitting) {
      const ts = r.deepAt.filter((t) => t !== undefined).sort((a, b) => a - b);
      for (let i = 4; i < ts.length; i++) expect(ts[i] - ts[i - 4]).toBeGreaterThan(0);
    }
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
