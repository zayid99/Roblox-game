import { HOME_FRONT_Z, WAVE, WAVE_CREST } from './config';

export type WavePhase = 'calm' | 'warning' | 'surge';
export type WaveEvent = 'warning' | 'surgeStart' | 'surgeEnd';

/**
 * The wave cycle: a calm countdown, a short warning, then a wall of water that
 * sweeps from the far end of the course back to the home island.
 */
export class WaveSim {
  phase: WavePhase = 'calm';
  /** Seconds until the next surge starts (calm and warning phases). */
  timer: number;
  /** z of the wave front during a surge. It moves toward +z (toward home). */
  frontZ: number;
  /** Whether the next (or current) wave is a Golden Wave. */
  golden = false;
  /** How many surges have finished. */
  count = 0;
  readonly events: WaveEvent[] = [];

  constructor(
    readonly startZ: number,
    readonly speed = WAVE.speed,
  ) {
    this.timer = WAVE.firstInterval;
    this.frontZ = startZ;
    this.golden = this.isGoldenNumber(0);
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
        this.golden = this.isGoldenNumber(this.count);
        this.events.push('surgeEnd');
      }
      return;
    }
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
    if (y >= WAVE_CREST) return false;
    return z <= this.frontZ + 0.5 && z >= this.frontZ - WAVE.thickness;
  }

  /** Skip straight to the surge (used by tests and debug keys). */
  forceSurge(): void {
    this.timer = 0;
    this.phase = 'warning';
  }
}
