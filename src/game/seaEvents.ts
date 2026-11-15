// Sea Events (docs/research/r4-retention.md, proposal 10). Pure logic: no rendering, no DOM.
//
// From minute 6 of a session, every 4–6 min, a random 60–90 s event, announced by a 15 s heads-up:
// - Rainbow Rain: mutation chance ×3 (creatures already out get one extra roll when it starts).
// - Treasure Fleet: 3 Treasure Bottles wash up at once (src/game/treasure.ts).
// - Calm Seas: the wave countdown stops for the whole event, and the player runs 25% faster.
// - Feeding Frenzy: every spawn point is filled at the start and again every 25 s (about double the spawns).
//
// Scheduling rules: never during the tutorial (an event in progress is cancelled if a tutorial starts), and the
// 15 s heads-up only starts in a calm phase whose countdown leaves it fully clear of the wave warning, so the
// event banners never overlap the wave's banner and horn. Economy: no direct cash; the events only change spawns,
// mutation odds, bottle count and wave timing, so the pacing bands are unaffected (tests/seaEvents.test.ts).
import type { SeaEventId } from '../contracts';
import { WAVE } from './config';
import { Rng } from './rng';
import type { WavePhase } from './wave';

export interface SeaEventDef {
  name: string;
  /** One-line effect, shown under the banner and on the chip's tooltip. */
  sub: string;
  hue: 'grass' | 'sun' | 'coral' | 'sky' | 'grape' | 'gold' | 'r6';
}

export const SEA_EVENTS: Record<SeaEventId, SeaEventDef> = {
  rainbowRain: { name: 'Rainbow Rain', sub: 'Mutation chance ×3', hue: 'r6' },
  treasureFleet: { name: 'Treasure Fleet', sub: '3 treasure bottles washed up', hue: 'gold' },
  calmSeas: { name: 'Calm Seas', sub: 'No waves · +25% run speed', hue: 'sky' },
  feedingFrenzy: { name: 'Feeding Frenzy', sub: 'Double creature spawns', hue: 'coral' },
};
export const SEA_EVENT_IDS = Object.keys(SEA_EVENTS) as SeaEventId[];

export const SEA = {
  /** First event: this many seconds into the session (sim time)… */
  firstAt: 360,
  /** …and at least this long after the tutorial ended. */
  afterTutorial: 60,
  /** From one heads-up to the next (uniform; a late clear-wave window pushes it back a little). */
  gapMin: 240,
  gapMax: 360,
  headsUp: 15,
  durMin: 60,
  durMax: 90,
  /** The heads-up must end at least this long before the wave warning starts. */
  waveMargin: 3,
  mutationMult: 3,
  calmRunSpeed: 1.25,
  frenzyRefillSec: 25,
};

export type SeaPhase = 'idle' | 'headsUp' | 'active';

export interface SeaContext {
  /** The tutorial is running (or not finished): no events. */
  blocked: boolean;
  wavePhase: WavePhase;
  waveTimer: number;
  /** The wave countdown is frozen by someone else (tutorial). */
  waveFrozen: boolean;
}

export interface SeaSignal {
  id: SeaEventId;
  phase: 'headsUp' | 'start' | 'end' | 'refill';
}

/** Base mutation odds of rollCreature (creatures.ts): [rainbow, diamond, gold]. */
const BASE_MUT: Record<'normal' | 'golden', readonly [number, number, number]> = {
  normal: [0.004, 0.015, 0.05],
  golden: [0.03, 0.1, 0.35],
};

/** The session's event clock and the current event. Deterministic for a seed. */
export class SeaEventSim {
  phase: SeaPhase = 'idle';
  id: SeaEventId | null = null;
  /** Seconds left in the current phase (heads-up or event). */
  left = 0;
  /** Length of the current phase (for the chip's bar). */
  length = 1;
  /** Session seconds (sim time while the game runs). */
  clock = 0;
  /** Seconds since the tutorial last ended (counts while not blocked). */
  freeFor = 0;
  /** Session second at which the next heads-up may start (it waits for a clear wave window). */
  nextAt = SEA.firstAt;
  /** Filled by update() and force(); GameSim handles them and empties the list. */
  readonly signals: SeaSignal[] = [];
  readonly rng: Rng;
  private last: SeaEventId | null = null;
  private refillIn = 0;
  private headsUpAt = 0;

  constructor(seed: number) {
    this.rng = new Rng(seed);
  }

  /** The running event (not during the heads-up). */
  get active(): SeaEventId | null {
    return this.phase === 'active' ? this.id : null;
  }

  /** Calm Seas: the wave countdown stops. */
  get freezesWave(): boolean {
    return this.active === 'calmSeas';
  }

  get runSpeedMult(): number {
    return this.active === 'calmSeas' ? SEA.calmRunSpeed : 1;
  }

  /** A heads-up may start now: calm phase, not frozen, and the heads-up ends before the wave warning. */
  static clearWindow(ctx: SeaContext): boolean {
    return !ctx.blocked && !ctx.waveFrozen && ctx.wavePhase === 'calm' && ctx.waveTimer > SEA.headsUp + WAVE.warning + SEA.waveMargin;
  }

  update(dt: number, ctx: SeaContext): void {
    this.clock += dt;
    if (ctx.blocked) {
      this.freeFor = 0;
      if (this.phase !== 'idle') this.cancel();
      return;
    }
    this.freeFor += dt;
    if (this.phase === 'idle') {
      if (this.clock >= this.nextAt && this.freeFor >= SEA.afterTutorial && SeaEventSim.clearWindow(ctx)) this.beginHeadsUp(this.pick());
      return;
    }
    this.left -= dt;
    if (this.phase === 'headsUp') {
      if (this.left <= 0) this.start();
      return;
    }
    if (this.id === 'feedingFrenzy') {
      this.refillIn -= dt;
      if (this.refillIn <= 0 && this.left > 5) {
        this.refillIn = SEA.frenzyRefillSec;
        this.signals.push({ id: 'feedingFrenzy', phase: 'refill' });
      }
    }
    if (this.left <= 0) this.end();
  }

  /** Debug / tests: start `id` (random if omitted) now: with its heads-up, or straight away. */
  force(id?: SeaEventId, skipHeadsUp = false): void {
    if (this.phase !== 'idle') this.end();
    this.beginHeadsUp(id ?? this.pick());
    if (skipHeadsUp) this.start();
  }

  /** Ends any event at once (a tutorial started). */
  cancel(): void {
    if (this.phase === 'idle' || !this.id) return;
    this.end();
  }

  /** Mutation roll for a creature spawned while Rainbow Rain runs: an extra roll at (mult − 1)× the base odds. */
  boostMutation(mutation: number, golden: boolean): number {
    const [r, d, g] = BASE_MUT[golden ? 'golden' : 'normal'];
    const k = SEA.mutationMult - 1;
    const u = this.rng.next();
    let m = 0;
    if (u < r * k) m = 3;
    else if (u < (r + d) * k) m = 2;
    else if (u < (r + d + g) * k) m = 1;
    return Math.max(mutation, m);
  }

  private pick(): SeaEventId {
    const pool = SEA_EVENT_IDS.filter((i) => i !== this.last);
    return pool[Math.floor(this.rng.next() * pool.length)];
  }

  private beginHeadsUp(id: SeaEventId): void {
    this.id = id;
    this.headsUpAt = this.clock;
    this.phase = 'headsUp';
    this.left = SEA.headsUp;
    this.length = SEA.headsUp;
    this.signals.push({ id, phase: 'headsUp' });
  }

  private start(): void {
    const id = this.id!;
    this.phase = 'active';
    this.length = Math.round(this.rng.range(SEA.durMin, SEA.durMax));
    this.left = this.length;
    this.refillIn = SEA.frenzyRefillSec;
    this.signals.push({ id, phase: 'start' });
  }

  private end(): void {
    const id = this.id!;
    this.signals.push({ id, phase: 'end' });
    this.last = id;
    this.id = null;
    this.phase = 'idle';
    this.left = 0;
    this.nextAt = Math.max(this.clock + 60, this.headsUpAt + this.rng.range(SEA.gapMin, SEA.gapMax));
  }
}
