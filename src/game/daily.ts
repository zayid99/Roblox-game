import { daysBetween } from './clock';
import type { RewardSpec } from './rewards';
import type { DailySave } from './state';

/** Daily calendar (§9.2). Days 1–6; Day 7 depends on the week (see daily7Spec). */
export const DAILY_REWARDS: readonly RewardSpec[] = [
  { min: 3, pearls: 10 },
  { luckyTide: 1 },
  { min: 5, pearls: 20 },
  { min: 10 },
  { mystery: true },
  { min: 15, pearls: 30 },
];

/** Weekly exclusive rope by week number (1-based). */
export const WEEKLY_ROPES: readonly string[] = ['rope_coral', 'rope_seafoam'];

/** Day 7: the week's exclusive rope (or 100 Pearls if none or already owned) + 50 Pearls + Lucky Tide. */
export function daily7Spec(week: number, owned: readonly string[]): RewardSpec {
  const rope = WEEKLY_ROPES[week - 1];
  if (rope && !owned.includes(rope)) return { cosmetic: rope, pearls: 50, luckyTide: 1 };
  return { pearls: 150, luckyTide: 1 };
}

/** The spec for calendar day 1..7. */
export function dailySpec(day: number, week: number, owned: readonly string[]): RewardSpec {
  return day === 7 ? daily7Spec(week, owned) : DAILY_REWARDS[day - 1];
}

/** The calendar day (1..7) the next claim gives. */
export function nextDailyDay(d: DailySave): number {
  return (d.count % 7) + 1;
}

export function claimedToday(d: DailySave, today: string): boolean {
  return d.lastClaimDay === today;
}

/**
 * Claimable once per local day, after the FTUE, and never when the clock went backwards
 * (today earlier than the last claim).
 */
export function dailyClaimable(d: DailySave, today: string, ftueDone: boolean): boolean {
  if (!ftueDone) return false;
  if (d.lastClaimDay === null) return true;
  const n = daysBetween(d.lastClaimDay, today);
  // A malformed day key (NaN) must not lock the calendar for good.
  return !Number.isFinite(n) || n > 0;
}

/**
 * Records a claim. The calendar is cumulative (missed days never reset it). The streak adds 1 for
 * a claim on the next day; each missed day subtracts 2 instead: max(1, streak − 2 × missed) + 1.
 * Returns the calendar day (1..7) that was claimed.
 */
export function recordDailyClaim(d: DailySave, today: string): number {
  const day = nextDailyDay(d);
  if (d.lastClaimDay === null) d.streak = 1;
  else {
    const missed = Math.max(0, daysBetween(d.lastClaimDay, today) - 1);
    d.streak = missed === 0 ? d.streak + 1 : Math.max(1, d.streak - 2 * missed) + 1;
  }
  d.count++;
  d.lastClaimDay = today;
  if (day === 7) d.week++;
  return day;
}
