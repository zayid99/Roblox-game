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
  /** What the quest asks the player to buy, if anything (pacing simulator: players follow the tracker). */
  buy?: 'slots' | 'carry' | 'egg' | 'buddy';
  /** For buy 'egg': the lowest egg zone that counts. */
  eggZone?: number;
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
const caughtAtLeast = (s: GameState, rarity: number) => s.counters.collectsByRarity.slice(rarity).reduce((a, b) => a + b, 0);
/** A lighthouse launch during a wave, or a wave ridden out on top of a lighthouse. */
const lighthouseDone = (s: GameState) => s.counters.padLaunchesInWave >= 1 || s.counters.lighthouseWaves >= 1;

export const VOYAGE: readonly QuestDef[] = [
  { n: 1, text: 'Grab a hook', icon: 'hand', reward: { cash: 20 }, ftue: true, done: (s) => s.counters.grabs >= 1, progress: (s) => frac(s.counters.grabs, 1) },
  { n: 2, text: 'Swing to the next island', icon: 'chevron', reward: { cash: 20 }, ftue: true, done: (s) => !!s.flags[FLAG_LANDED_ISLAND], progress: (s) => bool(!!s.flags[FLAG_LANDED_ISLAND]) },
  { n: 3, text: 'Grab a creature', icon: 'creature', reward: {}, ftue: true, done: (s) => s.counters.collects >= 1, progress: (s) => frac(s.counters.collects, 1) },
  { n: 4, text: 'Bring it home', icon: 'home', reward: { cash: 50 }, ftue: true, done: (s) => s.counters.deliveries >= 1, progress: (s) => frac(s.counters.deliveries, 1) },
  { n: 5, text: 'Buy Rope Reach', icon: 'reach', reward: { cash: 40 }, ftue: true, done: (s) => s.levels.reach >= 1, progress: (s) => frac(s.levels.reach, 1) },
  { n: 6, text: 'Survive your first wave', icon: 'wave', reward: { min: 2 }, ftue: true, done: (s) => !!s.flags[FLAG_FIRST_SURGE_END], progress: (s) => bool(!!s.flags[FLAG_FIRST_SURGE_END]) },
  // Quests 7-12 (pacing proposal F1, docs/research/r2-pacing.md): small, frequent rewards that walk the player to
  // Lagoon at about 5-6 min. The lighthouse quest comes after Lagoon and is also done by riding out a wave on a
  // lighthouse (it used to sit at 8 and stall the tracker: every wave tells new players to stay home).
  { n: 7, text: 'Reach Coral Reef', icon: 'chevron', reward: { min: 1 }, ftue: false, done: (s) => s.bestZone >= 1, progress: (s) => bool(s.bestZone >= 1) },
  { n: 8, text: 'Fill 6 pedestals', icon: 'pedestal', reward: { min: 2 }, ftue: false, done: (s) => filled(s) >= 6, progress: (s) => frac(filled(s), 6), buy: 'slots' },
  // Lagoon is a fallback so a player who never visits the Hatchery is not stuck here.
  { n: 9, text: 'Hatch an egg', icon: 'egg', reward: { min: 2 }, ftue: false, done: (s) => s.counters.eggsHatched >= 1 || s.bestZone >= 2, progress: (s) => frac(s.counters.eggsHatched, 1), buy: 'egg' },
  { n: 10, text: 'Reach Lagoon', icon: 'chevron', reward: { min: 3, pearls: 10 }, ftue: false, done: (s) => s.bestZone >= 2, progress: (s) => bool(s.bestZone >= 2) },
  { n: 11, text: 'Ride out a wave on a lighthouse', icon: 'lighthouse', reward: { min: 1 }, ftue: false, done: lighthouseDone, progress: (s) => bool(lighthouseDone(s)) },
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

/**
 * Deep Voyage: the follow-up quest line after the First Voyage (docs/research/r2-pacing.md, r4-retention.md). It
 * walks the player through the systems the first ten minutes leave hidden (Buddy, mutations, Big Waves, eggs of
 * the new zones) on the way to Stormy Seas and Kraken Deep. Saved as `voyage.deep` (steps done); old saves start
 * it at 0 once their First Voyage is complete. Rewards are sized like the Voyage's: minutes of income plus Pearls.
 */
export const DEEP_VOYAGE: readonly QuestDef[] = [
  // Ordered by when a typical player gets there (tests/pacingSim.ts), each one a step past what the First Voyage
  // already made them do, so the line does not collapse into one burst of rewards when it starts.
  { n: 1, text: 'Pick a Buddy in the Hatchery', icon: 'buddy', reward: { min: 1 }, ftue: false, done: (s) => s.buddy !== null, progress: (s) => bool(s.buddy !== null), buy: 'buddy' },
  { n: 2, text: 'Hatch a Lagoon Egg', icon: 'egg', reward: { min: 2 }, ftue: false, done: (s) => s.counters.bestEggZone >= 3, progress: (s) => bool(s.counters.bestEggZone >= 3), buy: 'egg', eggZone: 2 },
  { n: 3, text: 'Carry 6 creatures', icon: 'carry', reward: { min: 2 }, ftue: false, done: (s) => s.levels.carry >= 4, progress: (s) => frac(s.levels.carry, 4), buy: 'carry' },
  { n: 4, text: 'Survive 2 Big Waves', icon: 'wave', reward: { min: 2, pearls: 10 }, ftue: false, done: (s) => s.counters.bigWavesSurvived >= 2, progress: (s) => frac(s.counters.bigWavesSurvived, 2) },
  { n: 5, text: 'Fill 12 pedestals', icon: 'pedestal', reward: { min: 3 }, ftue: false, done: (s) => filled(s) >= 12, progress: (s) => frac(filled(s), 12), buy: 'slots' },
  { n: 6, text: 'Catch 7 mutated creatures', icon: 'gem', reward: { min: 2 }, ftue: false, done: (s) => s.counters.mutatedCollects >= 7, progress: (s) => frac(s.counters.mutatedCollects, 7) },
  { n: 7, text: 'Reach Stormy Seas', icon: 'chevron', reward: { min: 3, pearls: 15 }, ftue: false, done: (s) => s.bestZone >= 3, progress: (s) => bool(s.bestZone >= 3) },
  { n: 8, text: 'Catch 20 Epics', icon: 'gem', reward: { min: 3 }, ftue: false, done: (s) => caughtAtLeast(s, 3) >= 20, progress: (s) => frac(caughtAtLeast(s, 3), 20) },
  { n: 9, text: 'Fill 14 pedestals', icon: 'pedestal', reward: { min: 4, pearls: 15 }, ftue: false, done: (s) => filled(s) >= 14, progress: (s) => frac(filled(s), 14), buy: 'slots' },
  { n: 10, text: 'Reach Kraken Deep', icon: 'chevron', reward: { min: 5, pearls: 50, luckyTide: 1 }, ftue: false, done: (s) => s.bestZone >= 4, progress: (s) => bool(s.bestZone >= 4) },
];

export const DEEP_LENGTH = DEEP_VOYAGE.length;

export type QuestLine = 'first' | 'deep';

/** The tracker title of a quest line. */
export function questLineTitle(line: QuestLine): string {
  return line === 'deep' ? 'DEEP VOYAGE' : 'FIRST VOYAGE';
}

/** The quest list of a line. */
export function questLine(line: QuestLine): readonly QuestDef[] {
  return line === 'deep' ? DEEP_VOYAGE : VOYAGE;
}

/** The current Deep Voyage quest: null before the First Voyage is complete and after the Deep Voyage. */
export function currentDeepQuest(s: GameState): QuestDef | null {
  if (!voyageDone(s)) return null;
  return s.voyage.deep < DEEP_VOYAGE.length ? DEEP_VOYAGE[s.voyage.deep] : null;
}

/** The quest the tracker shows (and the player works on): First Voyage, then Deep Voyage. */
export function activeQuest(s: GameState): { line: QuestLine; q: QuestDef } | null {
  const q = currentQuest(s);
  if (q) return { line: 'first', q };
  const d = currentDeepQuest(s);
  return d ? { line: 'deep', q: d } : null;
}
