// FTUE step definitions in data form (§7.2). TutorialCore (core.ts) runs them.
import type { FtueStepId, HudPart, Reward } from '../contracts';

export interface StepDef {
  id: FtueStepId;
  /** SimOverrides.waveFrozen while this step runs. */
  waveFrozen: boolean;
  /** HUD parts hidden in this step ('cash' is also hidden until the first reward, see core). */
  hide: Partial<Record<HudPart, boolean>>;
  /** First Voyage quest this step pays (the tutorial grants it and records voyageRewardKey(n)). */
  voyage: number | null;
  /** Fixed reward; V6 is "2 min" and is resolved when granted. */
  reward: Reward | 'min2' | null;
  /** Coin-fly source anchor id for the grant (the lead resolves it to a screen point). */
  rewardFrom?: string;
}

const EARLY: Partial<Record<HudPart, boolean>> = { rail: true, course: true, tracker: true, pearls: true };
const MID: Partial<Record<HudPart, boolean>> = { rail: true, tracker: true, pearls: true };
const LATE: Partial<Record<HudPart, boolean>> = { tracker: true, pearls: true };

export const STEPS: Record<FtueStepId, StepDef> = {
  grab: { id: 'grab', waveFrozen: true, hide: EARLY, voyage: 1, reward: { cash: 20 }, rewardFrom: 'reticle' },
  release: { id: 'release', waveFrozen: true, hide: EARLY, voyage: 2, reward: { cash: 20 }, rewardFrom: 'player' },
  collect: { id: 'collect', waveFrozen: true, hide: EARLY, voyage: null, reward: null },
  home: { id: 'home', waveFrozen: false, hide: MID, voyage: 4, reward: { cash: 50 }, rewardFrom: 'pedestals' },
  earn: { id: 'earn', waveFrozen: false, hide: MID, voyage: null, reward: null },
  shop: { id: 'shop', waveFrozen: false, hide: LATE, voyage: 5, reward: { cash: 40 }, rewardFrom: 'shop:buy:reach' },
  wave: { id: 'wave', waveFrozen: false, hide: LATE, voyage: 6, reward: 'min2', rewardFrom: 'wave' },
  ready: { id: 'ready', waveFrozen: false, hide: {}, voyage: null, reward: null },
};

/** Step rewards a skip pays if they were not received yet (§7.1: $20 + $20 + $50). */
export const SKIP_PAYS: readonly FtueStepId[] = ['grab', 'release', 'home'];

/** Timed hints and step timings, in milliseconds of real time (§7.2). */
export const TIMING = {
  grabNoMoveMs: 2000,
  grabEdgeIdleMs: 6000,
  failMs: 2600,
  stampMs: 1000,
  collectAutoAfterFirstMs: 8000,
  collectStuckMs: 8000,
  homeStuckMs: 10000,
  earnBannerMs: 2500,
  shopSpotlightMs: 3000,
  shopCloseMs: 1200,
  bannerMs: 2000,
  splashPillMs: 3500,
  readyBannerMs: 1800,
  controlsMs: 4000,
  homeWaveTimer: 60,
  waveCapTimer: 30,
  skipMinTimer: 45,
};

/** Release timing assist (§7.3): support by swing number (1-based). */
export interface SwingSupport {
  scale: number;
  arc: boolean;
  pill: 'big' | 'normal' | 'small' | null;
}
export const SWING_SUPPORT: readonly SwingSupport[] = [
  { scale: 0.25, arc: true, pill: 'big' },
  { scale: 0.5, arc: true, pill: 'normal' },
  { scale: 1, arc: true, pill: 'small' },
];
export const NO_SUPPORT: SwingSupport = { scale: 1, arc: false, pill: null };
/** Struggle assist: 3 sea falls in a row on one gap → arc + 0.5× for the next 2 swings there. */
export const STRUGGLE = { falls: 3, swings: 2, support: { scale: 0.5, arc: true, pill: 'normal' } as SwingSupport };

export const ASSIST = {
  /** Window evaluation rate (real time). */
  hz: 20,
  easeInMs: 120,
  easeOutMs: 100,
  maxHoldMs: 1200,
  arcPoints: 20,
};
