import { ECONOMY } from './config';
import type { PlayerStats } from './player';

export type UpgradeKey = 'speed' | 'reach' | 'power' | 'carry' | 'slots';

export interface UpgradeDef {
  key: UpgradeKey;
  name: string;
  icon: string;
  desc: string;
  maxLevel: number;
  baseCost: number;
  growth: number;
  value(level: number): number;
  format(value: number): string;
}

export const UPGRADES: Record<UpgradeKey, UpgradeDef> = {
  speed: {
    key: 'speed',
    name: 'Run Speed',
    icon: '👟',
    desc: 'Run faster on islands',
    maxLevel: 16,
    baseCost: 20,
    growth: 1.6,
    value: (l) => 10 + 0.75 * l,
    format: (v) => `${v.toFixed(1)} m/s`,
  },
  reach: {
    key: 'reach',
    name: 'Rope Reach',
    icon: '🪢',
    desc: 'Grab hooks from farther away',
    maxLevel: 14,
    baseCost: 40,
    growth: 2.0,
    value: (l) => 9.5 + 0.8 * l,
    format: (v) => `${v.toFixed(1)} m`,
  },
  power: {
    key: 'power',
    name: 'Swing Power',
    icon: '💪',
    desc: 'Pump harder and fling farther',
    maxLevel: 12,
    baseCost: 30,
    growth: 1.7,
    value: (l) => 1 + 0.1 * l,
    format: (v) => `×${v.toFixed(1)}`,
  },
  carry: {
    key: 'carry',
    name: 'Carry Slots',
    icon: '🎒',
    desc: 'Carry more creatures per run',
    maxLevel: 6,
    baseCost: 100,
    growth: 3.0,
    value: (l) => 2 + l,
    format: (v) => `${v}`,
  },
  slots: {
    key: 'slots',
    name: 'Base Pedestals',
    icon: '🏝️',
    desc: 'Room for more creatures at home',
    maxLevel: 8,
    baseCost: 150,
    growth: 2.5,
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
  return Math.round(def.baseCost * Math.pow(def.growth, level));
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

export function rebirthCost(rebirths: number): number {
  return 1_000_000 * Math.pow(8, rebirths);
}

export function rebirthMultiplier(rebirths: number): number {
  return 1 + 0.5 * rebirths;
}

export function offlineEarnings(incomePerSec: number, elapsedSec: number): number {
  if (!(elapsedSec > 0) || !(incomePerSec > 0)) return 0;
  return incomePerSec * Math.min(elapsedSec, ECONOMY.offlineCapSeconds);
}

const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi'];

/** 1234 -> "1.23K", 5 -> "5", 0.5 -> "0.5". */
export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return '∞';
  const sign = n < 0 ? '-' : '';
  let v = Math.abs(n);
  if (v < 1000) return sign + (v < 10 && v % 1 !== 0 ? v.toFixed(1) : Math.floor(v).toString());
  let i = 0;
  while (v >= 1000 && i < SUFFIXES.length - 1) {
    v /= 1000;
    i++;
  }
  const digits = v >= 100 ? 0 : v >= 10 ? 1 : 2;
  return `${sign}${v.toFixed(digits)}${SUFFIXES[i]}`;
}

export function formatCash(n: number): string {
  return `$${formatNumber(n)}`;
}
