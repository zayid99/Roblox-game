import type { RequestTimeScale } from '../contracts';

/** Damped spring toward `target` (squash and stretch). Substeps so big frame times stay stable. */
export class Spring {
  x: number;
  v = 0;

  constructor(
    public target = 1,
    public k = 400,
    public damping = 18,
  ) {
    this.x = target;
  }

  /** Jump to a value (e.g. squash .8) and let the spring bring it back. */
  set(x: number, v = 0): void {
    this.x = x;
    this.v = v;
  }

  step(dt: number): number {
    let left = Math.min(dt, 0.1);
    while (left > 1e-6) {
      const h = Math.min(left, 1 / 240);
      const a = -this.k * (this.x - this.target) - this.damping * this.v;
      this.v += a * h;
      this.x += this.v * h;
      left -= h;
    }
    return this.x;
  }
}

/** Hit-stop lengths (§5.2): sim time scale .05. */
export function collectHitStop(request: RequestTimeScale, rarity: number): void {
  const ms = rarity >= 4 ? 110 : rarity >= 2 ? 70 : 40;
  request('hitstop', 0.05, ms);
}

export function grabHitStop(request: RequestTimeScale, speed: number): void {
  if (speed > 20) request('hitstop', 0.05, 35);
}

export function perfectSlowMo(request: RequestTimeScale): void {
  request('perfect', 0.6, 100);
}

/** Camera trauma per event (§5.2). */
export const TRAUMA = {
  hardLand: 0.25,
  rare: 0.1,
  epic: 0.15,
  legendary: 0.3,
  pad: 0.35,
  waveBanner: 0.1,
  splash: 0.8,
  rebirth: 0.4,
  perfect: 0.08,
  closeCall: 0.2,
  coldOpen: 0.15,
};

export const smoothstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
/** cubic-bezier(.22,1,.36,1)-like ease out. */
export const easeOut = (t: number): number => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
export const easeInOut = (t: number): number => {
  const x = clamp(t, 0, 1);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};
/** Overshoot ease (~5%). */
export const easeBack = (t: number): number => {
  const x = clamp(t, 0, 1);
  const c1 = 1.2;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};
