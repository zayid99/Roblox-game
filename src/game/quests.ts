import type { RewardSpec } from './rewards';
import type { GameState } from './state';
import type { IconId } from '../contracts';

/** First Voyage quest (§9.1). Quests 1–6 are completed by the FTUE, which grants their rewards itself. */
export interface QuestDef {
  /** 1..12 */
  n: number;
  text: string;
  icon: IconId;
  reward: RewardSpec;
  /** Completed by the FTUE: no reward from Progression while the FTUE runs (see voyageRewardKey). */
  ftue: boolean;
  done(s: GameState): boolean;
  /** 0..1 for the tracker bar. */
  progress(s: GameState): number;
}

/** state.flags keys set by the stat tracker for event-based quests. */
export const FLAG_LANDED_ISLAND = 'landedIsland';
export const FLAG_FIRST_SURGE_END = 'firstSurgeEnd';

/**
 * Key in `state.ftue.rewarded` marking that quest n's reward was paid (by the tutorial's `grant`
 * command or by Progression), so it is never paid twice. The tutorial should push the same key.
 */
export const voyageRewardKey = (n: number) => `V${n}`;

const frac = (v: number, target: number) => Math.max(0, Math.min(1, v / target));
const bool = (b: boolean) => (b ? 1 : 0);
const filled = (s: GameState) => s.base.filter((c) => c !== null).length;
const rareCatches = (s: GameState) => s.counters.collectsByRarity.slice(2).reduce((a, b) => a + b, 0);

export const VOYAGE: readonly QuestDef[] = [
  { n: 1, text: 'Grab a hook', icon: 'hand', reward: { cash: 20 }, ftue: true, done: (s) => s.counters.grabs >= 1, progress: (s) => frac(s.counters.grabs, 1) },
  { n: 2, text: 'Swing to the next island', icon: 'chevron', reward: { cash: 20 }, ftue: true, done: (s) => !!s.flags[FLAG_LANDED_ISLAND], progress: (s) => bool(!!s.flags[FLAG_LANDED_ISLAND]) },
  { n: 3, text: 'Grab a creature', icon: 'creature', reward: {}, ftue: true, done: (s) => s.counters.collects >= 1, progress: (s) => frac(s.counters.collects, 1) },
  { n: 4, text: 'Bring it home', icon: 'home', reward: { cash: 50 }, ftue: true, done: (s) => s.counters.deliveries >= 1, progress: (s) => frac(s.counters.deliveries, 1) },
  { n: 5, text: 'Buy Rope Reach', icon: 'reach', reward: { cash: 40 }, ftue: true, done: (s) => s.levels.reach >= 1, progress: (s) => frac(s.levels.reach, 1) },
  { n: 6, text: 'Survive your first wave', icon: 'wave', reward: { min: 2 }, ftue: true, done: (s) => !!s.flags[FLAG_FIRST_SURGE_END], progress: (s) => bool(!!s.flags[FLAG_FIRST_SURGE_END]) },
  { n: 7, text: 'Reach Coral Reef', icon: 'chevron', reward: { min: 2 }, ftue: false, done: (s) => s.bestZone >= 1, progress: (s) => bool(s.bestZone >= 1) },
  { n: 8, text: 'Launch from a lighthouse during a wave', icon: 'lighthouse', reward: { min: 2 }, ftue: false, done: (s) => s.counters.padLaunchesInWave >= 1, progress: (s) => frac(s.counters.padLaunchesInWave, 1) },
  { n: 9, text: 'Fill 4 pedestals', icon: 'pedestal', reward: { min: 3 }, ftue: false, done: (s) => filled(s) >= 4, progress: (s) => frac(filled(s), 4) },
  { n: 10, text: 'Buy Carry Slots', icon: 'carry', reward: { min: 3 }, ftue: false, done: (s) => s.levels.carry >= 1, progress: (s) => frac(s.levels.carry, 1) },
  { n: 11, text: 'Catch a Rare', icon: 'gem', reward: { min: 5, pearls: 10 }, ftue: false, done: (s) => rareCatches(s) >= 1, progress: (s) => frac(rareCatches(s), 1) },
  { n: 12, text: 'Catch one after a Golden Wave', icon: 'sparkle', reward: { min: 5, pearls: 25, cosmetic: 'rope_sailor' }, ftue: false, done: (s) => s.counters.goldenBatchCollects >= 1, progress: (s) => frac(s.counters.goldenBatchCollects, 1) },
];

export const VOYAGE_LENGTH = VOYAGE.length;

/** The current quest, or null when the Voyage is complete. */
export function currentQuest(s: GameState): QuestDef | null {
  return s.voyage.step < VOYAGE.length ? VOYAGE[s.voyage.step] : null;
}

export function voyageDone(s: GameState): boolean {
  return s.voyage.step >= VOYAGE.length;
}
