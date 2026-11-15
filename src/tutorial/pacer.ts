// Calm-moment pacing for the messages that follow the tutorial (r1 F7, F9). No DOM; runs in vitest.
// The hand-over used to fire ~6 toasts, two rail tiles and the Controls card within 3 s. Messages now wait
// in a queue and come out one at a time, only while the player stands still on solid ground with no wave,
// banner, panel or other toast on screen, at least PACE.gapSec apart. The same calm moments drive the
// "you have something to claim" nudges for FREE gifts and new Index entries.
import type { ToastSpec } from '../contracts';

export interface PaceContext {
  /** Nothing else is going on: tutorial over, on the ground, wave calm, no banner, panel or toast. */
  calm: boolean;
  /** Standing on the home island. */
  home: boolean;
  /** Ready FREE rewards (timed gifts + the Daily) and Index entries not looked at yet. */
  freeReady: number;
  indexNew: number;
}

export interface PaceMakers {
  /** The gentle "gift waiting" toast (with a working CLAIM button). */
  free: () => ToastSpec;
  /** The "new in your Index" toast. */
  index: () => ToastSpec;
}

export interface PaceResult {
  /** At most one toast per call. */
  toast: ToastSpec | null;
  /** Rail tiles whose badge should pulse: something has waited unclaimed for a while. */
  nag: { free: boolean; index: boolean };
}

export const PACE = {
  /** Minimum time between two paced toasts. */
  gapSec: 3.5,
  /** Calm has to last this long first (a landing, then a breath). */
  settleSec: 0.3,
  /** Queued messages older than this are dropped (they describe a moment long gone). */
  maxAgeSec: 150,
  /** Badge pulse once a reward has waited this long. */
  freeNagSec: 20,
  indexNagSec: 45,
  /** One reminder toast after this long unclaimed, at home, then not again for the cooldown. */
  freeRemindSec: 60,
  indexRemindSec: 90,
  remindCooldownSec: 240,
};

interface Queued {
  spec: ToastSpec;
  at: number;
  /** Drop the message if this turns false while it waits (a gift claimed from the rail meanwhile). */
  valid?: () => boolean;
  /** 'free' messages count as the gift reminder. */
  topic?: 'free' | 'index';
}

export class MessagePacer {
  private t = 0;
  private calmFor = 0;
  private lastShown = -Infinity;
  private readonly queue: Queued[] = [];
  private freeFor = 0;
  private indexFor = 0;
  private lastFree = -Infinity;
  private lastIndex = -Infinity;

  /** Messages waiting for a calm moment. */
  get pending(): number {
    return this.queue.length;
  }

  push(spec: ToastSpec, opts: { valid?: () => boolean; topic?: 'free' | 'index' } = {}): void {
    if (this.queue.some((q) => q.spec.text === spec.text)) return;
    this.queue.push({ spec, at: this.t, valid: opts.valid, topic: opts.topic });
  }

  update(dt: number, ctx: PaceContext, makers: PaceMakers): PaceResult {
    this.t += dt;
    this.calmFor = ctx.calm ? this.calmFor + dt : 0;
    this.freeFor = ctx.freeReady > 0 ? this.freeFor + dt : 0;
    this.indexFor = ctx.indexNew > 0 ? this.indexFor + dt : 0;
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const q = this.queue[i];
      if (this.t - q.at > PACE.maxAgeSec || (q.valid && !q.valid())) this.queue.splice(i, 1);
    }
    const nag = { free: this.freeFor >= PACE.freeNagSec, index: this.indexFor >= PACE.indexNagSec };
    if (this.calmFor < PACE.settleSec || this.t - this.lastShown < PACE.gapSec) return { toast: null, nag };

    let toast: ToastSpec | null = null;
    const q = this.queue.shift();
    if (q) {
      toast = q.spec;
      if (q.topic === 'free') this.lastFree = this.t;
      if (q.topic === 'index') this.lastIndex = this.t;
    } else if (ctx.home && this.freeFor >= PACE.freeRemindSec && this.t - this.lastFree >= PACE.remindCooldownSec) {
      toast = makers.free();
      this.lastFree = this.t;
    } else if (ctx.home && this.indexFor >= PACE.indexRemindSec && this.t - this.lastIndex >= PACE.remindCooldownSec) {
      toast = makers.index();
      this.lastIndex = this.t;
    }
    if (toast) this.lastShown = this.t;
    return { toast, nag };
  }
}
