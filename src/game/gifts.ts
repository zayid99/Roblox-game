import { daysBetween } from './clock';
import type { RewardSpec } from './rewards';
import type { GiftsSave } from './state';

/**
 * Playtime gifts (§9.3), pacing proposal F1 (docs/research/r2-pacing.md): small and frequent early (a reward
 * moment every 1.5 min through minute 6), the showcase prizes at 8 (Lucky Tide) and 10 (Mystery Creature), then
 * 12.5 and 20. The 2.5-min gift is a 3-min 2× Cash Boost (it teaches the boost, r4 #4). Keep 8 gifts: the panel
 * strip has 8 columns.
 */
export const GIFTS: readonly { atMin: number; spec: RewardSpec }[] = [
  { atMin: 1, spec: { min: 1 } },
  { atMin: 2.5, spec: { boostMin: 3 } },
  { atMin: 4, spec: { min: 2 } },
  { atMin: 5.5, spec: { min: 2 } },
  { atMin: 8, spec: { luckyTide: 1 } },
  { atMin: 10, spec: { mystery: true } },
  { atMin: 12.5, spec: { min: 5, pearls: 10 } },
  { atMin: 20, spec: { mystery: true, pearls: 25 } },
];

export type GiftState = 'locked' | 'ready' | 'claimed';

export function giftState(g: GiftsSave, i: number): GiftState {
  if (g.claimed.includes(i)) return 'claimed';
  const gift = GIFTS[i];
  return gift && g.activeSec >= gift.atMin * 60 ? 'ready' : 'locked';
}

/** Indices of gifts that are ready and unclaimed. */
export function readyGifts(g: GiftsSave): number[] {
  const out: number[] = [];
  for (let i = 0; i < GIFTS.length; i++) if (giftState(g, i) === 'ready') out.push(i);
  return out;
}

/** The next locked gift's index, or null when none is left. */
export function nextGiftIndex(g: GiftsSave): number | null {
  for (let i = 0; i < GIFTS.length; i++) if (giftState(g, i) === 'locked') return i;
  return null;
}

/** Seconds of active time until the next locked gift, or null when none is left. */
export function secondsToNextGift(g: GiftsSave): number | null {
  for (let i = 0; i < GIFTS.length; i++) {
    if (giftState(g, i) === 'locked') return Math.max(0, GIFTS[i].atMin * 60 - g.activeSec);
  }
  return null;
}

/**
 * At a new local day: gifts that were ready but never claimed move to `pending` (never lost),
 * and the active-time counter and the strip reset. Returns true if it rolled over.
 */
export function rolloverGifts(g: GiftsSave, today: string): boolean {
  if (g.day === today || (g.day !== '' && daysBetween(g.day, today) < 0)) return false;
  if (g.day !== '') for (const i of readyGifts(g)) g.pending.push(i);
  g.day = today;
  g.activeSec = 0;
  g.claimed = [];
  return true;
}
