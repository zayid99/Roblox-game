import type { QualitySetting, QualityTier } from '../contracts';

/** Everything that differs between quality tiers (spec §6.3). */
export interface TierParams {
  tier: QualityTier;
  dprCap: number;
  shadows: boolean;
  shadowSize: number;
  /** Half extent of the shadow camera, in metres. */
  shadowHalf: number;
  /** Near water grid cells per side (160 m square). */
  waterCells: number;
  waterDetail: boolean;
  shoreRings: boolean;
  edgeLines: boolean;
  creatureOutlines: boolean;
  hookOutline: boolean;
  clouds: number;
  particleCap: number;
  outlineRange: number;
  billboardRange: number;
  speedLines: boolean;
  props: boolean;
  /** Minimum ms between rendered frames (0 = every rAF). */
  frameCapMs: number;
}

const DPR = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

export const TIERS: Record<QualityTier, TierParams> = {
  low: {
    tier: 'low', dprCap: 1, shadows: false, shadowSize: 512, shadowHalf: 18, waterCells: 64, waterDetail: false, shoreRings: false,
    edgeLines: false, creatureOutlines: false, hookOutline: false, clouds: 12, particleCap: 150, outlineRange: 0, billboardRange: 10,
    speedLines: false, props: false, frameCapMs: 15,
  },
  medium: {
    tier: 'medium', dprCap: 1.25, shadows: true, shadowSize: 1024, shadowHalf: 22, waterCells: 96, waterDetail: true, shoreRings: true,
    edgeLines: true, creatureOutlines: true, hookOutline: false, clouds: 24, particleCap: 300, outlineRange: 40, billboardRange: 15,
    speedLines: true, props: true, frameCapMs: 15,
  },
  high: {
    tier: 'high', dprCap: Math.min(DPR, 2), shadows: true, shadowSize: 2048, shadowHalf: 35, waterCells: 128, waterDetail: true, shoreRings: true,
    edgeLines: true, creatureOutlines: true, hookOutline: true, clouds: 40, particleCap: 500, outlineRange: 60, billboardRange: 20,
    speedLines: true, props: true, frameCapMs: 0,
  },
};

/** What the browser tells us about the device (any field may be unknown). */
export interface DeviceHints {
  /** Touch-first device (phone or tablet). */
  coarse: boolean;
  /** navigator.deviceMemory in GB (Chromium only), or null. */
  memoryGb: number | null;
  /** navigator.hardwareConcurrency, or null. */
  cores: number | null;
  /** WebGL renderer string (unmasked when the browser allows it), or ''. */
  gpu: string;
  userAgent: string;
}

const SOFTWARE_GPU = /swiftshader|llvmpipe|softpipe|software|basic render/i;
const STRONG_GPU = /nvidia|geforce|rtx|gtx|quadro|radeon rx|radeon pro|radeon\(tm\) rx|apple m\d|apple gpu|intel\(r\) arc|\barc\(tm\)/i;

/**
 * Starting tier for a device. The first minute decides whether a player stays, so it starts on a tier the
 * device is likely to run smoothly: High only with a clearly strong GPU, Low on weak or software-rendered
 * machines (school Chromebooks, old laptops, budget phones), Medium otherwise. The runtime check
 * (DprController.pendingTier) lowers it further within seconds if frames are still slow.
 */
export function tierForDevice(h: DeviceHints): QualityTier {
  if (SOFTWARE_GPU.test(h.gpu)) return 'low';
  const mem = h.memoryGb;
  const cores = h.cores;
  if ((mem !== null && mem <= 2) || (cores !== null && cores <= 2)) return 'low';
  if (h.coarse) return (mem !== null && mem <= 3) || (cores !== null && cores <= 4) ? 'low' : 'medium';
  const chromebook = /\bCrOS\b/.test(h.userAgent);
  if (chromebook) return mem !== null && mem <= 4 ? 'low' : 'medium';
  const weak = (mem !== null && mem <= 4) || (cores !== null && cores <= 4);
  if (STRONG_GPU.test(h.gpu) && !weak) return 'high';
  return 'medium';
}

export function readDeviceHints(gpu = ''): DeviceHints {
  const nav = (typeof navigator !== 'undefined' ? navigator : {}) as Navigator & { deviceMemory?: number };
  const coarse = typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches ?? false);
  return {
    coarse,
    memoryGb: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null,
    cores: typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : null,
    gpu,
    userAgent: nav.userAgent ?? '',
  };
}

/** Default tier for this device (see tierForDevice). `gpu` is the WebGL renderer string, when known. */
export function defaultTier(gpu = ''): QualityTier {
  return tierForDevice(readDeviceHints(gpu));
}

export function resolveTier(q: QualitySetting, autoTier: QualityTier | null, gpu = ''): QualityTier {
  if (q !== 'auto') return q;
  return autoTier ?? defaultTier(gpu);
}

const LOWER: Record<QualityTier, QualityTier | null> = { high: 'medium', medium: 'low', low: null };

/**
 * Time-based render cap (§6.1). Both sides use the rAF timestamp (the old cap compared it with a later
 * performance.now() and dropped every other frame at 60 Hz). rAF timestamps are vsync-aligned, so a 5 ms margin
 * only absorbs jitter: under the 15 ms cap a 60 Hz screen renders every frame, 120 Hz exactly every other one
 * (60 fps, even pacing), 90 Hz every frame, never 45.
 */
export class FrameCap {
  private last = -1e9;

  /** True when the frame at rAF time `nowMs` should render under a cap of `capMs` (0 = every frame). */
  ready(nowMs: number, capMs: number): boolean {
    if (capMs <= 0) return true;
    if (nowMs - this.last < capMs - 5) return false;
    this.last = nowMs;
    return true;
  }

  reset(): void {
    this.last = -1e9;
  }
}

/** Average frame interval that counts as "keeping up" for a raise: a 60 Hz screen (16.7 ms) qualifies. */
const GOOD_MS = 17.5;

/**
 * Runtime DPR adaptation (§6.1): only the DPR changes at runtime. Frame time is averaged over 2 s windows;
 * > 18 ms lowers DPR by .25 (floor .75), at most one change every 2 s. Keeping up with the screen (≤ 17.5 ms,
 * reachable at 60 Hz) for 6 s raises it again; a drop soon after a raise doubles that wait (up to 96 s),
 * so a device on the edge settles instead of flip-flopping.
 * Stuck at the floor for 4 s and still > 20 ms, or under ~30 fps (> 34 ms) for 4 s at any DPR: `pendingTier`
 * names the next lower tier. The renderer applies it in the same session (a new player on a slow machine
 * should not spend their first minutes at a low frame rate) and it is saved for the next load.
 */
export class DprController {
  dpr: number;
  pendingTier: QualityTier | null = null;
  private windowMs = 0;
  private windowFrames = 0;
  private sinceChange = 0;
  private goodFor = 0;
  private floorFor = 0;
  private slowFor = 0;
  private raiseWait = 6;
  private lastWasRaise = false;

  constructor(
    private cap: number,
    private tier: QualityTier,
    private readonly auto: boolean,
  ) {
    this.dpr = cap;
  }

  reset(cap: number, tier: QualityTier): void {
    this.cap = cap;
    this.tier = tier;
    this.dpr = cap;
    this.windowMs = this.windowFrames = this.sinceChange = this.goodFor = this.floorFor = this.slowFor = 0;
    this.pendingTier = null;
    this.raiseWait = 6;
    this.lastWasRaise = false;
  }

  /** Returns true when the DPR changed. */
  sample(frameMs: number, realDt: number): boolean {
    this.windowMs += frameMs;
    this.windowFrames++;
    this.sinceChange += realDt;
    if (this.windowMs < 2000 && this.windowFrames < 600) return false;
    const avg = this.windowMs / Math.max(1, this.windowFrames);
    const span = this.windowMs / 1000;
    this.windowMs = 0;
    this.windowFrames = 0;
    const floor = 0.75;
    if (this.dpr <= floor + 1e-3 && avg > 20) {
      this.floorFor += span;
      if (this.auto && this.floorFor >= 4 && !this.pendingTier) this.pendingTier = LOWER[this.tier];
    } else this.floorFor = 0;
    if (avg > 34) {
      this.slowFor += span;
      if (this.auto && this.slowFor >= 4 && !this.pendingTier) this.pendingTier = LOWER[this.tier];
    } else this.slowFor = 0;
    if (avg <= GOOD_MS) this.goodFor += span;
    else this.goodFor = 0;
    if (this.sinceChange < 2) return false;
    if (avg > 18 && this.dpr > floor + 1e-3) {
      // The last raise didn't hold (dropped again within 12 s): wait longer before the next one.
      if (this.lastWasRaise && this.sinceChange < 12) this.raiseWait = Math.min(96, this.raiseWait * 2);
      this.lastWasRaise = false;
      this.dpr = Math.max(floor, this.dpr - 0.25);
      this.sinceChange = 0;
      this.goodFor = 0;
      return true;
    }
    if (this.goodFor >= this.raiseWait && this.dpr < this.cap - 1e-3) {
      this.dpr = Math.min(this.cap, this.dpr + 0.25);
      this.sinceChange = 0;
      this.goodFor = 0;
      this.lastWasRaise = true;
      return true;
    }
    return false;
  }
}
