import { COMBO } from './config';
import type { ReleaseQuality } from '../contracts';

export type ChainEndReason = 'timeout' | 'sea' | 'splash' | 'home';

/**
 * Hook Chain (§9.4). +1 per grab, +1 extra when the release before it was Perfect.
 * The timer refills on grab and release and only drains on the ground on a course island.
 * Timeout and home keep the chain for the trip (tripBest); sea and splash lose it.
 */
export class ComboTracker {
  chain = 0;
  /** Seconds left on the chain timer. */
  timer = 0;
  /** Best kept chain since the last delivery. */
  tripBest = 0;
  private perfectPending = false;

  /** A grab. Returns the new chain count. */
  grab(): number {
    this.chain += this.perfectPending ? 2 : 1;
    this.perfectPending = false;
    this.timer = COMBO.chainTime;
    return this.chain;
  }

  /** A release (or a landing while attached, rated 'good'). */
  release(quality: ReleaseQuality): void {
    this.perfectPending = quality === 'perfect';
    if (this.chain > 0) this.timer = COMBO.chainTime;
  }

  /** Drains the timer while grounded on a course island. Returns the kept count on timeout, else 0. */
  update(dt: number, onCourseIsland: boolean): number {
    if (this.chain <= 0 || !onCourseIsland) return 0;
    this.timer -= dt;
    if (this.timer > 0) return 0;
    return this.end('timeout');
  }

  /** Ends the chain. Returns the count that ended (0 if there was none). */
  end(reason: ChainEndReason): number {
    const count = this.chain;
    if (count > 0 && (reason === 'timeout' || reason === 'home')) this.tripBest = Math.max(this.tripBest, count);
    this.chain = 0;
    this.timer = 0;
    this.perfectPending = false;
    return count;
  }

  /** The trip best including the chain in progress (for the HUD chip). */
  get liveTripBest(): number {
    return Math.max(this.tripBest, this.chain);
  }

  /** Fraction of the chain timer left (0..1). */
  get timerFrac(): number {
    return this.chain > 0 ? Math.max(0, Math.min(1, this.timer / COMBO.chainTime)) : 0;
  }

  /** Delivery multiplier from a trip best: min(2, 1 + 0.1 × max(0, tripBest − 1)). */
  static chainMult(tripBest: number): number {
    return Math.min(2, 1 + 0.1 * Math.max(0, tripBest - 1));
  }

  /** Uses up the trip best at a delivery. Returns the trip best that was used. */
  consumeTrip(): number {
    const t = this.tripBest;
    this.tripBest = 0;
    return t;
  }

  reset(): void {
    this.chain = 0;
    this.timer = 0;
    this.tripBest = 0;
    this.perfectPending = false;
  }
}

/** HUD chip value: "+" + round((chainMult − 1) × 100) + "%", 0 when tripBest < 2. */
export function tripBonusPct(tripBest: number): number {
  return tripBest < 2 ? 0 : Math.round((ComboTracker.chainMult(tripBest) - 1) * 100);
}
