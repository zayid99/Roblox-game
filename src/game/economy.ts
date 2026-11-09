import { ECONOMY } from './config';
import type { PlayerStats } from './player';
import type { IconId } from '../contracts';
import { ZONES } from './zones';

export type UpgradeKey = 'speed' | 'reach' | 'power' | 'carry' | 'slots';

export interface UpgradeDef {
  key: UpgradeKey;
  name: string;
  iconId: IconId;
  desc: string;
  maxLevel: number;
  /** Price of level L+1 = round(baseCost × growth^L), unless `costs` lists it. */
  baseCost?: number;
  growth?: number;
  /** Explicit price of each level (index = current level). */
  costs?: readonly number[];
  value(level: number): number;
  format(value: number): string;
}

/** Rope Reach at level L (meters). Every other level is the next zone's gate (ZONES[z].minReach). */
const reachAt = (l: number) => 9.5 + 0.8 * l;
/** The first Rope Reach level that grabs a zone's hooks. */
export function reachGateLevel(zone: number): number {
  const need = ZONES[zone]?.minReach ?? Infinity;
  for (let l = 0; l < 100; l++) if (reachAt(l) + 1e-6 >= need) return l;
  return Infinity;
}

/*
 * Prices follow the zone ladder of one continuous sitting (see tests/pacing.test.ts): Rope Reach pairs are the zone
 * gates (Coral Reef $40 is bought in the tutorial; Lagoon $20K, Stormy Seas $300K, Kraken Deep $1.6M, Volcano Bay
 * $6M, Secret Reef $40M). Carry Slots and Base Pedestals are priced by what one more creature earns in the zone where
 * they are bought, so every level pays for itself within about 15 minutes of play. Run Speed and Swing Power are cheap "feel" levels
 * spread across the whole climb (each costs about 1-2 minutes of the income a player has when it comes up).
 */
export const UPGRADES: Record<UpgradeKey, UpgradeDef> = {
  speed: {
    key: 'speed',
    name: 'Run Speed',
    iconId: 'speed',
    desc: 'Run faster on islands',
    maxLevel: 16,
    baseCost: 25,
    growth: 2.2,
    value: (l) => 10 + 0.75 * l,
    format: (v) => `${v.toFixed(1)} m/s`,
  },
  reach: {
    key: 'reach',
    name: 'Rope Reach',
    iconId: 'reach',
    desc: 'Grab hooks from farther away',
    // Capped at the last zone's gate: more reach would unlock nothing.
    maxLevel: reachGateLevel(ZONES.length - 1),
    costs: [40, 150, 20_000, 90_000, 210_000, 500_000, 1_100_000, 2_000_000, 4_000_000, 12_000_000, 28_000_000],
    value: reachAt,
    format: (v) => `${v.toFixed(1)} m`,
  },
  power: {
    key: 'power',
    name: 'Swing Power',
    iconId: 'power',
    desc: 'Pump harder and fling farther',
    maxLevel: 12,
    baseCost: 30,
    growth: 2.6,
    value: (l) => 1 + 0.1 * l,
    format: (v) => `×${v.toFixed(1)}`,
  },
  carry: {
    key: 'carry',
    name: 'Carry Slots',
    iconId: 'carry',
    desc: 'Carry more creatures per run',
    maxLevel: 6,
    costs: [150, 2_000, 10_000, 40_000, 100_000, 200_000],
    value: (l) => 2 + l,
    format: (v) => `${v}`,
  },
  slots: {
    key: 'slots',
    name: 'Base Pedestals',
    iconId: 'pedestal',
    desc: 'Room for more creatures at home',
    maxLevel: 8,
    costs: [100, 1_000, 25_000, 120_000, 300_000, 800_000, 1_500_000, 2_000_000],
    value: (l) => 4 + 2 * l,
    format: (v) => `${v}`,
  },
};

export const UPGRADE_ORDER: readonly UpgradeKey[] = ['speed', 'reach', 'power', 'carry', 'slots'];

export type UpgradeLevels = Record<UpgradeKey, number>;

export function emptyLevels(): UpgradeLevels {
  return { speed: 0, reach: 0, power: 0, carry: 0, slots: 0 };
}

export function upgradeCost(key: UpgradeKey, level: number): number {
  const def = UPGRADES[key];
  const fixed = def.costs?.[level];
  if (fixed !== undefined) return fixed;
  return Math.round((def.baseCost ?? 0) * Math.pow(def.growth ?? 1, level));
}

/** Total cost of the next n levels starting at `level` (stops at the max level). */
export function bulkCost(key: UpgradeKey, level: number, n: number): number {
  const end = Math.min(UPGRADES[key].maxLevel, level + Math.max(0, Math.floor(n)));
  let total = 0;
  for (let l = level; l < end; l++) total += upgradeCost(key, l);
  return total;
}

/** How many levels in a row `cash` buys, starting at `level`. */
export function maxAffordable(key: UpgradeKey, level: number, cash: number): number {
  let n = 0;
  let left = cash;
  for (let l = level; l < UPGRADES[key].maxLevel; l++) {
    const c = upgradeCost(key, l);
    if (c > left) break;
    left -= c;
    n++;
  }
  return n;
}

/** The cheapest next level across all upgrades (Infinity when everything is maxed). */
export function cheapestUpgradeCost(levels: UpgradeLevels): number {
  let best = Infinity;
  for (const key of UPGRADE_ORDER) {
    if (levels[key] >= UPGRADES[key].maxLevel) continue;
    best = Math.min(best, upgradeCost(key, levels[key]));
  }
  return best;
}

export function playerStats(levels: UpgradeLevels): PlayerStats {
  return {
    runSpeed: UPGRADES.speed.value(levels.speed),
    reach: UPGRADES.reach.value(levels.reach),
    power: UPGRADES.power.value(levels.power),
  };
}

export function carryCapacity(levels: UpgradeLevels): number {
  return UPGRADES.carry.value(levels.carry);
}

export function baseSlots(levels: UpgradeLevels): number {
  return UPGRADES.slots.value(levels.slots);
}

/**
 * Rebirth tuning. The income multiplier compounds: mult(n) = multGrowth^n. The cost of rebirth n+1 is
 * baseCost × costGrowth^n × costAccel^(n(n-1)/2), rounded to 2 significant digits: each rebirth costs costGrowth × more,
 * and that step itself grows by costAccel, so the first cycles get faster and later ones settle. `keep` = how many
 * of the best creatures stay on the base (the rest swim free, unpaid).
 */
export const REBIRTH = {
  baseCost: 150_000_000,
  costGrowth: 1.1,
  costAccel: 1.05,
  multGrowth: 2,
  keep: 0,
};

/** Rounds to 2 significant digits, the second one 0 or 5 (1K, 2.5K, 15M, 200M). */
export function shopRound(v: number): number {
  if (!(v > 0) || !Number.isFinite(v)) return v;
  const p = Math.pow(10, Math.floor(Math.log10(v)) - 1);
  const m = v / p;
  const step = m >= 50 ? 10 : 5;
  return Math.round(m / step) * step * p;
}

/** Rounds to 2 significant digits (1.2B, 1.3B, 25M). */
export function round2(v: number): number {
  if (!(v > 0) || !Number.isFinite(v)) return v;
  const p = Math.pow(10, Math.floor(Math.log10(v)) - 1);
  return Math.round(v / p) * p;
}

export function rebirthCost(rebirths: number): number {
  const n = Math.max(0, rebirths);
  return round2(REBIRTH.baseCost * Math.pow(REBIRTH.costGrowth, n) * Math.pow(REBIRTH.costAccel, (n * (n - 1)) / 2));
}

export function rebirthMultiplier(rebirths: number): number {
  return Math.pow(REBIRTH.multGrowth, rebirths);
}

export function offlineEarnings(incomePerSec: number, elapsedSec: number): number {
  if (!(elapsedSec > 0) || !(incomePerSec > 0)) return 0;
  return incomePerSec * ECONOMY.offlineRate * Math.min(elapsedSec, ECONOMY.offlineCapSeconds);
}

const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi'];

function trimZeros(t: string): string {
  return t.includes('.') ? t.replace(/\.?0+$/, '') : t;
}

/**
 * How a value at or above 1000 is cut to 3 significant digits: 'nearest' (default), or 'down' for
 * balances, so a balance never reads as much as a price it cannot pay yet ($999.6K shows "$999K", not "$1M").
 */
export type Rounding = 'nearest' | 'down';

/** Spec §2.1: integers below 1000, then 3 significant digits with K/M/B/T/Qa/Qi ("1.25K", "12.5K", "1M"). */
export function formatNumber(n: number, rounding: Rounding = 'nearest'): string {
  if (!Number.isFinite(n)) return '∞';
  const sign = n < 0 ? '-' : '';
  let v = Math.abs(n);
  if (v < 1000) return sign + Math.floor(v).toString();
  const down = rounding === 'down';
  let i = 0;
  while (v >= (down ? 1000 : 999.5) && i < SUFFIXES.length - 1) {
    v /= 1000;
    i++;
  }
  const digits = v >= 100 ? 0 : v >= 10 ? 1 : 2;
  const p = Math.pow(10, digits);
  // The epsilon keeps exact values exact (2340 / 1000 * 100 is 233.99999999999997).
  const text = down ? (Math.floor(v * p + 1e-6) / p).toFixed(digits) : v.toFixed(digits);
  return `${sign}${trimZeros(text)}${SUFFIXES[i]}`;
}

export function formatCash(n: number, rounding: Rounding = 'nearest'): string {
  return `$${formatNumber(n, rounding)}`;
}

/** A cash balance (the cash pill, the rebirth bar): rounded down, see Rounding. */
export function formatBalance(n: number): string {
  return formatCash(n, 'down');
}

/** Income per second: one decimal below 10 ("$1.2/s", "$3/s"), integers to 999, then suffixes. */
export function formatIncome(perSec: number): string {
  if (Number.isFinite(perSec) && Math.abs(perSec) < 10) return `$${trimZeros(perSec.toFixed(1))}/s`;
  return `${formatCash(perSec)}/s`;
}

/** Pearls: always a whole number with thousands separators ("1,250"). */
export function formatPearls(n: number): string {
  return Math.floor(Math.max(0, n)).toLocaleString('en-US');
}
