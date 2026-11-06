// Shared types between modules (design spec §10.1). Changes go through Game.ts integration.
import type { Vector3 } from 'three';
import type { CreatureRef } from './game/creatures';
import type { UpgradeKey } from './game/economy';
import type { WavePhase } from './game/wave';
import type { Solid, Island } from './game/course';
import type { PlayerEvent } from './game/player';
import type { DeliveryResult } from './game/state';
import type { HatcheryView, HatchOutcome } from './game/hatchery';

export type LayoutMode = 'desktop' | 'landscape' | 'portrait';
export type QualityTier = 'low' | 'medium' | 'high';
export type QualitySetting = 'auto' | QualityTier;
export type RailId = 'shop' | 'free' | 'index' | 'rebirth' | 'hatchery';
export type PanelKind = 'shop' | 'index' | 'free' | 'settings' | 'welcome' | 'hatchery';
export type PanelTab = 'upgrades' | 'locker' | 'rebirth' /* shop */ | 'daily' | 'gifts' /* free */ | 'eggs' | 'buddy' /* hatchery */;
export type HudPart = 'cash' | 'pearls' | 'rail' | 'wave' | 'course' | 'tracker' | 'carry' | 'chain' | 'topRight';
export type FtueStepId = 'grab' | 'release' | 'collect' | 'home' | 'earn' | 'shop' | 'wave' | 'ready';
export type Surface = 'grass' | 'sand' | 'wood';
export type IconId =
  | 'cash' | 'pearl' | 'shop' | 'index' | 'rebirth' | 'gift' | 'locker' | 'settings' | 'sound-on' | 'sound-off'
  | 'speed' | 'reach' | 'power' | 'carry' | 'pedestal' | 'wave' | 'lighthouse' | 'home' | 'lock' | 'check' | 'close'
  | 'play' | 'arrow-up' | 'chevron' | 'chain' | 'perfect' | 'sparkle' | 'flame' | 'lucky-tide' | 'gem' | 'creature'
  | 'warning' | 'hand' | 'thumb' | 'egg' | 'buddy';

export interface Settings {
  music: number; sound: number; muted: boolean; quality: QualitySetting; autoTier: QualityTier | null;
  reduceMotion: boolean; camSens: number; invertY: boolean; swingAssist: boolean;
}
export interface Reward { cash?: number; pearls?: number; luckyTide?: number; boost2xSec?: number /* v2.1 */; creature?: CreatureRef; cosmetic?: string }

// ---------- Time scale (one arbiter, owned by the lead: src/core/timeScale.ts) ----------
/** Ask for a sim time scale. The arbiter applies the minimum of all live requests.
 *  ms > 0: the request expires after ms of real time. ms = 0: release the id now. Ease in 80 ms, out 100 ms. */
export type RequestTimeScale = (id: 'hitstop' | 'perfect' | 'tutorial' | 'reveal', scale: number, ms: number) => void;

// ---------- Sim (re-exported by src/game/sim.ts) ----------
export interface WildCreature extends CreatureRef {
  uid: number; pos: Vector3; zone: number; island: Island; bornAt: number;
  golden: boolean;      // spawned from a Golden-wave batch
  featured: boolean;    // this week's Featured Creature (§9.0)
}
export type ReleaseQuality = 'perfect' | 'good' | 'early' | 'late';
export type SimEvent =
  | { type: 'player'; event: PlayerEvent }                                   // v0.1, unchanged
  | { type: 'landed'; solid: Solid; islandOrder: number /* -1 home, -2 lighthouse */ }
  | { type: 'releaseRated'; quality: ReleaseQuality; theta: number }
  | { type: 'padLaunch'; padId: number; inWave: boolean }
  | { type: 'bounce'; buoyId: number }
  | { type: 'geyser'; geyserId: number }
  | { type: 'collect'; creature: WildCreature; isNewSpecies: boolean; isNewMutation: boolean }
  | { type: 'carryFull' }
  | { type: 'deliver'; result: DeliveryResult; bonusCash: number; chainMult: number; tripBest: number; closeCall: boolean }
  | { type: 'chain'; count: number }
  | { type: 'chainEnd'; count: number; reason: 'timeout' | 'sea' | 'splash' | 'home' }
  | { type: 'closeCall'; where: 'home' | 'pad' }
  | { type: 'splash'; lost: CreatureRef[]; practice: boolean }
  | { type: 'respawn'; reason: 'sea' | 'wave' }
  | { type: 'zone'; zone: number; first: boolean }
  | { type: 'waveWarning'; golden: boolean; big: boolean; number: number }
  | { type: 'surgeStart'; golden: boolean; big: boolean; number: number }
  | { type: 'surgeEnd'; golden: boolean; big: boolean; number: number; survived: boolean }
  | { type: 'washed'; uids: number[] }
  | { type: 'spawned'; golden: boolean }
  | { type: 'shopZone' };
export interface SimOverrides { waveFrozen: boolean; practiceWave: boolean }

// ---------- HUD ----------
export interface RailTileState { visible: boolean; badge: number | '!' | null; arrow: boolean; timer?: string; wiggle: boolean; label?: string }
export interface TrackerRow { icon: IconId; text: string; progress: number /* 0..1 */; reward: Reward; done: boolean }
export interface TrackerView { title: string; count: string; rows: TrackerRow[] }
export interface HudView {
  layout: LayoutMode; touch: boolean;
  cash: number; pearls: number; income: number; multiplier: number; rebirths: number; streak: number;
  wave: { phase: WavePhase; frozen: boolean; timer: number; duration: number; golden: boolean; big: boolean; number: number;
          progress: number; hitsPlayerIn: number | null /* null if not finite */; safe: boolean };
  course: { playerT: number; waveT: number | null; zone: number /* -1 home */; visible: boolean };
  carried: CreatureRef[]; capacity: number; tripBonusPct: number /* 0 when tripBest < 2 */;
  chain: { count: number; timerFrac: number } | null;
  action: boolean;                                  // §4.4 fade
  rail: Record<RailId, RailTileState>;
  tracker: TrackerView | null;
  jumpLabel: 'JUMP' | 'SWING' | 'LET GO'; jumpGoldRim: boolean;
  reticle: { kind: 'hook'; x: number; y: number; locked: boolean; reach?: number; keyHint: boolean }
         | { kind: 'release'; x: number; y: number }   // shown only while sim.perfectWindow (C17)
         | null;
  edgeArrow: { x: number; y: number; angle: number; icon: IconId; label: string } | null;
  vignette: { kind: 'none' | 'danger' | 'slowmo' | 'speed'; strength: number };
  hide: Partial<Record<HudPart, boolean>>;
}
export interface ToastSpec { text: string; kind: 'info' | 'good' | 'warn' | 'bad'; icon?: IconId; onTap?: () => void; action?: { label: string; icon: IconId; onTap: () => void } /* ad slot */ }
export interface BannerSpec { title: string; sub?: string; hue: 'grass' | 'sun' | 'coral' | 'sky' | 'grape' | 'gold' | `r${0|1|2|3|4|5|6}`; priority: 'wave' | 'reveal' | 'zone' | 'tutorial' | 'info'; ms?: number }
export type FloatKind = 'cash' | 'income' | 'pearl' | 'perfect' | 'chain' | 'bonus';
export interface ScreenPt { x: number; y: number }
/** Tutorial focus inside a panel (set by the lead from TutorialFrame.focus). */
export interface HudFocus { panel: PanelKind; tab?: PanelTab; rowKey: UpgradeKey | string; note?: string; sub?: string; dimOthers: boolean }

// ---------- Panel data (pulled by the UI when a panel opens or after an action) ----------
export interface ShopRow { key: UpgradeKey; name: string; icon: IconId; level: number; max: number; now: string; next: string | null; cost: number; cost5: number; maxAffordable: number; costMax: number; affordable: boolean; maxed: boolean }
export interface RebirthView { cost: number; progress: number; multNow: number; multNext: number; can: boolean; visible: boolean; keep: string[]; lose: string[] }
export interface ShopView { cash: number; income: number; rows: ShopRow[]; rebirth: RebirthView; lockerUnlocked: boolean }
export interface IndexEntry { id: string; name: string; rarity: number; income: number; mask: number /* mutation bits */; isNew: boolean; foundIn: string /* zone name hint */ }
export interface IndexView { found: number; total: number; entries: IndexEntry[]; featured: string | null }
export interface DailyTile { day: number; reward: Reward; state: 'claimed' | 'today' | 'tomorrow' | 'later'; teaser: boolean }
export interface DailyView { tiles: DailyTile[]; streak: number; claimable: boolean; resetIn: number }
export interface GiftsView { gifts: { atMin: number; reward: Reward; state: 'locked' | 'ready' | 'claimed'; secondsLeft: number }[]; resetIn: number }
export interface FreeView { daily: DailyView; gifts: GiftsView; luckyTide: number; streak: number }
export interface LockerItemView { id: string; kind: 'rope'; name: string; rarity: number; price: number | null; source: string | null; owned: boolean; equipped: boolean; isNew: boolean; colors: string[]; stripesPerM: number }
export interface LockerView { pearls: number; items: LockerItemView[] }
export interface WelcomeView { offline: number; daily: DailyTile | null; pendingGifts: Reward[]; canDouble: boolean }
export interface PanelData {
  shop(): ShopView; index(): IndexView; free(): FreeView; locker(): LockerView;
  settings(): Settings & { platformMuted: boolean; autoTier: QualityTier };
  welcome(): WelcomeView;
  hatchery(): HatcheryView;
}
export interface UiActions {
  buyUpgrade(key: UpgradeKey, n: 1 | 5 | 'max'): boolean /* false = can't afford or maxed (stops hold-repeat) */; rebirth(): void;
  claimDaily(): void; claimGift(i: number | 'all'): void; useLuckyTide(): void;
  buyCosmetic(id: string): void; equipCosmetic(id: string): void;
  setSettings(patch: Partial<Settings>): void; replayTutorial(): void;
  collectWelcome(double: boolean): void;            // double = watch a rewarded ad first (lead runs it)
  toggleMute(): void; skipTutorial(): void;
  panelChanged(kind: PanelKind | null, tab?: PanelTab): void;   // pause/unpause, SDK gameplayStop/Start, tutorial
  hatchEgg(zone: number): HatchOutcome | null;      // null = locked or can't afford
  setBuddy(c: CreatureRef | null): void;
}

// ---------- Guides (tutorial → graphics) ----------
export interface GuideSpec {
  arrow: { pos: Vector3; color?: string } | null;
  trail: Vector3[] | null;
  ring: { pos: Vector3; radius: number; label?: string } | null;
  beam: Vector3 | null;
  landingArc: { points: Vector3[]; ok: boolean } | null;
  hookTag: { anchorId: number; text: string } | null;
}
export const NO_GUIDES: GuideSpec = { arrow: null, trail: null, ring: null, beam: null, landingArc: null, hookTag: null };

// ---------- Tutorial output (pure data; TutorialCore produces it, TutorialOverlay draws it) ----------
export type TutorialCommand =
  | { type: 'setWaveTimer'; seconds: number; mode: 'set' | 'cap' }   // cap = only lower it
  | { type: 'forceSpawn'; islandOrder: number; point: number; speciesId?: string; mutation?: number }
  | { type: 'grant'; reward: Reward; source: string; from?: ScreenPt | string /* anchor id */ }
  | { type: 'closePanel' }
  | { type: 'respawnFtue' };
export interface PromptSpec {
  id: string; headline: string; sub?: string; size: 'big' | 'normal' | 'small'; fail: boolean;
  glyph: 'none' | 'wasd' | 'spaceHold' | 'keyU' | 'keyW' | 'thumbDrag' | 'thumbHold' | 'thumbPush' | 'dragLook';
  chip?: { icon: IconId; text: string };            // e.g. distance "24 m", ETA "Pad 2 s"
  portrait?: string;                                // species id
  stamp?: string;                                   // "NICE SWING", "LAUNCH": plays the stamp, then exits
}
export interface TutorialFrame {
  active: boolean; step: FtueStepId | null;
  timeScale: number; guides: GuideSpec; sim: SimOverrides;
  hide: Partial<Record<HudPart, boolean>>; jumpLabel: 'JUMP' | 'SWING' | 'LET GO' | null;
  edgeTarget: { pos: Vector3; icon: IconId; label: string } | null;
  prompt: PromptSpec | null;                        // also used for hint prompts like DRAG TO LOOK
  spotlight: string | null;                         // Hud anchor id, e.g. 'rail:shop', 'shop:buy:reach'
  focus: HudFocus | null;                           // forwarded to Hud.setFocus
  controlsCard: boolean;                            // ready step (§7.2)
  skipVisible: boolean;
  musicLowpass: boolean; vignette: number;
  commands: TutorialCommand[];                      // drained by the lead each frame
}

// ---------- Audio input ----------
export interface AudioFrame {
  dt: number; onHome: boolean; carried: number; carriedMaxRarity: number;
  wavePhase: WavePhase; waveTimer: number; golden: boolean; big: boolean;
  speed: number; altitude: number; nearIsland: boolean; bestZone: number;
  grounded: boolean; surface: Surface;              // footsteps (§8.6)
  swing: { theta: number; speed: number } | null;   // rope creak and whoosh
  perfectWindow: boolean;                           // entry tick
  panelOpen: boolean; slowmo: boolean; ftueStep: FtueStepId | null; lowTier: boolean;
}
