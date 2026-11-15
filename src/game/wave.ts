import { HOME_FRONT_Z, WAVE, WAVE_CREST } from './config';

export type WavePhase = 'calm' | 'warning' | 'surge';
export type WaveEvent = 'warning' | 'surgeStart' | 'surgeEnd';

/**
 * The wave cycle: a calm countdown, a short warning, then a wall of water that
 * sweeps back to the home island.
 *
 * Where the surge rises: the sim calls track() every step with the player's z, and the wall rises
 * WAVE.lead metres beyond the player (beyond home when the player is at home), not at the far end of
 * the course. During the warning that point only ever moves farther out (running deeper pushes it back;
 * running home leaves it where it was), so the time from the horn to the wall reaching the player is
 * at least the warning plus lead / speed from anywhere on the course.
 * Once the wall is WAVE.passGap past the player it speeds up (WAVE.passBoost) for the rest of the way home.
 * Without track() (bare tests) it rises at the constructor's startZ and keeps its speed.
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
  /** Where the surge rises (the next one during calm and warning, see track()). */
  startZ: number;
  /** Length of the warning phase for the coming wave (fixed once the warning sounds). */
  warningLen: number = WAVE.warning;
  /** Whether the next (or current) wave is a Golden Wave. */
  golden = false;
  /** How many surges have finished. */
  count = 0;
  /** While true the countdown does not run (FTUE steps 1–3). A surge in progress still finishes. */
  frozen = false;
  readonly events: WaveEvent[] = [];

  private goldenPending = false;
  /** The player's z (see track); +Infinity until tracked, so a bare WaveSim never speeds up. */
  private playerZ = Infinity;
  /** Wave index (count) of the first Golden Wave; then every WAVE.goldenEvery-th after it. */
  private firstGolden = WAVE.goldenEvery - 1;

  constructor(
    startZ: number,
    readonly baseSpeed = WAVE.speed,
  ) {
    this.timer = WAVE.firstInterval;
    this.duration = WAVE.firstInterval;
    this.startZ = startZ;
    this.frontZ = startZ;
    this.golden = this.isGoldenNumber(0);
  }

  /**
   * Called by the sim every step before update(): the player's z, and the warning length for where they are.
   * Calm: the coming surge rises WAVE.lead beyond the player. Warning: it only moves farther out. Surge: fixed.
   */
  track(playerZ: number, warningLen: number): void {
    this.playerZ = playerZ;
    if (this.phase === 'surge') return;
    const z = Math.min(HOME_FRONT_Z, playerZ) - WAVE.lead;
    if (this.phase === 'calm') {
      this.startZ = z;
      this.warningLen = warningLen;
    } else this.startZ = Math.min(this.startZ, z);
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
    return n >= this.firstGolden && (n - this.firstGolden) % WAVE.goldenEvery === 0;
  }

  /**
   * Makes wave index n (count, 0 = the session's first wave) the first Golden Wave, then every
   * WAVE.goldenEvery-th after it. A coming wave forced Golden (Lucky Tide) stays Golden.
   */
  setFirstGolden(n: number): void {
    const patterned = this.phase !== 'surge' && this.isGoldenNumber(this.count);
    this.firstGolden = Math.max(0, n);
    if (this.phase !== 'surge') this.golden = (this.golden && !patterned) || this.isGoldenNumber(this.count);
  }

  update(dt: number): void {
    this.events.length = 0;
    if (this.phase === 'surge') {
      // Once the wall is well past the player (they are behind it, safe), it rushes on home: no long wait for the
      // fresh creatures that wash up when it ends.
      const passed = this.frontZ > this.playerZ + WAVE.passGap;
      this.frontZ += this.speed * (passed ? WAVE.passBoost : 1) * dt;
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
    if (this.phase === 'calm' && this.timer <= this.warningLen) {
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
    if (this.timer > this.warningLen) this.phase = 'calm';
  }

  /** Lowers the countdown to s seconds if it is longer; never raises it. Ignored during a surge. */
  capTimer(s: number): void {
    if (this.phase === 'surge' || this.timer <= s) return;
    this.timer = Math.max(0, s);
    if (this.timer > this.warningLen) this.phase = 'calm';
  }

  /** Whether the next wave to come is Golden: during a surge the one after it, else the coming one. */
  get nextGolden(): boolean {
    return this.phase === 'surge' ? this.goldenPending || this.isGoldenNumber(this.count + 1) : this.golden;
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
