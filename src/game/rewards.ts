import { pickSpecies, RARITIES, type CreatureRef } from './creatures';
import type { Rng } from './rng';
import type { GameState } from './state';
import { ZONES } from './zones';
import type { Reward } from '../contracts';

/** Pearls for the first discovery of each species (§9.7). */
export const DISCOVERY_PEARLS = 5;

/**
 * A reward as written in the spec tables. `min` is "N min" of base income (resolved at claim time),
 * `mystery` is a Mystery Creature (§9 shared mechanics).
 */
export interface RewardSpec {
  min?: number;
  cash?: number;
  pearls?: number;
  luckyTide?: number;
  mystery?: boolean;
  cosmetic?: string;
}

/** "N min" = max(50, round(N × 60 × baseIncomePerSec())). */
export function minutes(state: GameState, n: number): number {
  return Math.max(50, Math.round(n * 60 * state.baseIncomePerSec()));
}

/** Mystery Creature: rarity min(6, ZONES[max(0, bestZone)].rarity + 1); Gold 70%, Diamond 30%. */
export function rollMysteryCreature(state: GameState, rng: Rng): CreatureRef {
  const z = Math.max(0, Math.min(ZONES.length - 1, state.bestZone));
  const rarity = Math.min(RARITIES.length - 1, ZONES[z].rarity + 1);
  const species = pickSpecies(rarity, rng);
  return { speciesId: species.id, mutation: rng.next() < 0.7 ? 1 : 2 };
}

/** Turns a spec into concrete amounts (minutes use the current income; the mystery roll uses rng). */
export function resolveReward(state: GameState, spec: RewardSpec, rng: Rng): Reward {
  const r: Reward = {};
  const cash = (spec.cash ?? 0) + (spec.min ? minutes(state, spec.min) : 0);
  if (cash > 0) r.cash = cash;
  if (spec.pearls) r.pearls = spec.pearls;
  if (spec.luckyTide) r.luckyTide = spec.luckyTide;
  if (spec.mystery) r.creature = rollMysteryCreature(state, rng);
  if (spec.cosmetic) r.cosmetic = spec.cosmetic;
  return r;
}

export interface AppliedReward {
  /** Species discovered for the first time by a reward creature (it also earned DISCOVERY_PEARLS). */
  discovery: string | null;
}

/** Applies a reward to the state. A creature goes to the base with the deliver() rules. */
export function applyReward(state: GameState, r: Reward): AppliedReward {
  let discovery: string | null = null;
  if (r.cash) state.earn(r.cash);
  if (r.pearls) state.pearls += r.pearls;
  if (r.luckyTide) state.tokens.luckyTide += r.luckyTide;
  if (r.boost2xSec) state.tokens.boost2xSec += r.boost2xSec;
  if (r.creature) {
    const g = state.grantCreature(r.creature);
    if (g.isNewSpecies) {
      discovery = r.creature.speciesId;
      state.pearls += DISCOVERY_PEARLS;
    }
  }
  if (r.cosmetic && !state.cosmetics.owned.includes(r.cosmetic)) state.cosmetics.owned.push(r.cosmetic);
  return { discovery };
}

/** Adds two rewards together (a creature or cosmetic in both keeps the first). */
export function mergeRewards(a: Reward, b: Reward): Reward {
  const out: Reward = { ...a };
  for (const k of ['cash', 'pearls', 'luckyTide', 'boost2xSec'] as const) {
    const v = (a[k] ?? 0) + (b[k] ?? 0);
    if (v) out[k] = v;
  }
  if (!out.creature && b.creature) out.creature = b.creature;
  if (!out.cosmetic && b.cosmetic) out.cosmetic = b.cosmetic;
  return out;
}

export function isEmptyReward(r: Reward): boolean {
  return !r.cash && !r.pearls && !r.luckyTide && !r.boost2xSec && !r.creature && !r.cosmetic;
}
