import { HOME_FRONT_Z, WAVE, WAVE_CREST } from './config';

export type WavePhase = 'calm' | 'warning' | 'surge';
export type WaveEvent = 'warning' | 'surgeStart' | 'surgeEnd';

/**
 * The wave cycle: a calm countdown, a short warning, then a wall of water that
 * sweeps from the far end of the course back to the home island.
 *
 * `golden`, `big`, `number`, `crest` and `speed` describe the current wave during a surge,
 * and the next one during calm and warning.
 */
export class WaveSim {
  phase: WavePhase = 'calm';
  /** Seconds until the next surge starts (calm and warning phases). */
  timer: number;
  /** Length of the current countdown (for the meter fill: 1 − timer / duration). */
  duration: number;
  /** z of the wave front during a surge. It moves toward +z (toward home). */
  frontZ: number;
  /** Whether the next (or current) wave is a Golden Wave. */
  golden = false;
  /** How many surges have finished. */
  count = 0;
  /** While true the countdown does not run (FTUE steps 1–3). A surge in progress still finishes. */
  frozen = false;
  readonly events: WaveEvent[] = [];

  private goldenPending = false;

  constructor(
    readonly startZ: number,
    readonly baseSpeed = WAVE.speed,
  ) {
    this.timer = WAVE.firstInterval;
    this.duration = WAVE.firstInterval;
    this.frontZ = startZ;
    this.golden = this.isGoldenNumber(0);
  }

  /** Wave number shown on the meter: count + 1. */
  get number(): number {
    return this.count + 1;
  }

  /** Every 5th wave is a Big Wave. */
  get big(): boolean {
    return this.number % WAVE.bigEvery === 0;
  }

  /** Sim crest height of the current/next wave (12 for Big Waves, else 10). */
  get crest(): number {
    return this.big ? WAVE.bigCrest : WAVE_CREST;
  }

  /** Front speed of the current/next wave (52 for Big Waves, else the base 42). */
  get speed(): number {
    return this.big ? WAVE.bigSpeed : this.baseSpeed;
  }

  private isGoldenNumber(n: number): boolean {
    return n % WAVE.goldenEvery === WAVE.goldenEvery - 1;
  }

  update(dt: number): void {
    this.events.length = 0;
    if (this.phase === 'surge') {
      this.frontZ += this.speed * dt;
      if (this.frontZ >= HOME_FRONT_Z) {
        this.phase = 'calm';
        this.count++;
        this.timer = WAVE.interval;
        this.duration = WAVE.interval;
        this.golden = this.goldenPending || this.isGoldenNumber(this.count);
        this.goldenPending = false;
        this.events.push('surgeEnd');
      }
      return;
    }
    if (this.frozen) return;
    this.timer -= dt;
    if (this.phase === 'calm' && this.timer <= WAVE.warning) {
      this.phase = 'warning';
      this.events.push('warning');
    }
    if (this.timer <= 0) {
      this.phase = 'surge';
      this.frontZ = this.startZ;
      this.events.push('surgeStart');
    }
  }

  /** Sets the countdown to s seconds (and the meter's duration). Ignored during a surge. */
  setTimer(s: number): void {
    if (this.phase === 'surge') return;
    this.timer = Math.max(0, s);
    this.duration = Math.max(this.timer, 1e-6);
    if (this.timer > WAVE.warning) this.phase = 'calm';
  }

  /** Lowers the countdown to s seconds if it is longer; never raises it. Ignored during a surge. */
  capTimer(s: number): void {
    if (this.phase === 'surge' || this.timer <= s) return;
    this.timer = Math.max(0, s);
    if (this.timer > WAVE.warning) this.phase = 'calm';
  }

  /** Makes the next wave Golden (Lucky Tide). During a surge it applies to the wave after. */
  forceGoldenNext(): void {
    if (this.phase === 'surge') this.goldenPending = true;
    else this.golden = true;
  }

  /** Seconds until the wave front reaches z (Infinity if it never will this cycle). */
  timeUntilReaches(z: number): number {
    if (z > HOME_FRONT_Z) return Infinity;
    if (this.phase === 'surge') return z <= this.frontZ ? Infinity : (z - this.frontZ) / this.speed;
    return Math.max(0, this.timer) + (z - this.startZ) / this.speed;
  }

  /** True if a point at (y, z) is inside the moving wall of water right now. */
  hits(y: number, z: number): boolean {
    if (this.phase !== 'surge') return false;
    if (z > HOME_FRONT_Z) return false;
    if (y >= this.crest) return false;
    return z <= this.frontZ + 0.5 && z >= this.frontZ - WAVE.thickness;
  }

  /** Skip straight to the surge (used by tests and debug keys). */
  forceSurge(): void {
    this.timer = 0;
    this.phase = 'warning';
  }
}
