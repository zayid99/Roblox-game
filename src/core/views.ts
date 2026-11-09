// Per-frame views the lead hands to the HUD, audio and graphics (§10.7 steps 6–8).
// Pure functions of the sim, state and a few lead-owned flags; no side effects.
import { Vector3 } from 'three';
import type {
  AudioFrame, HudPart, HudView, IconId, LayoutMode, Surface, TrackerView, TutorialFrame,
} from '../contracts';
import { tripBonusPct } from '../game/combo';
import { HOME_FRONT_Z } from '../game/config';
import { getSpecies } from '../game/creatures';
import { nearbyLockedAnchor } from '../game/player';
import type { Progression } from '../game/progression';
import type { GameSim } from '../game/sim';
import type { GameState } from '../game/state';
import type { GameRenderer, RenderFrame } from '../render/gameRenderer';

const tmp = new Vector3();
const grip = new Vector3();

/** Course progress 0 (home edge) .. 1 (course end) for a z position. */
export function courseT(sim: GameSim, z: number): number {
  const len = HOME_FRONT_Z - sim.course.endZ;
  return Math.max(0, Math.min(1, (HOME_FRONT_Z - z) / len));
}

export interface HudViewInput {
  sim: GameSim;
  state: GameState;
  progression: Progression;
  gfx: GameRenderer;
  tf: TutorialFrame;
  layout: LayoutMode;
  touch: boolean;
  panelOpen: boolean;
  /** Desktop keyboard player (SPACE keycap under the reticle for the first grabs). */
  keyboard: boolean;
  /** Edge arrow to home requested by the handsFull hint. */
  homeArrow: boolean;
  /** Overrides the tracker (a just-completed Voyage row playing its check). */
  tracker: TrackerView | null | undefined;
  viewport: { w: number; h: number };
}

/** Screen point of the last reticle (tutorial grant coins fly from it). */
export const lastReticle = { x: 0, y: 0, valid: false };

function edgeArrow(i: HudViewInput, target: { pos: Vector3; icon: IconId; label: string } | null): HudView['edgeArrow'] {
  if (!target || i.panelOpen) return null;
  const s = i.gfx.project(target.pos);
  if (s.onScreen) return null;
  const cx = i.viewport.w / 2;
  const cy = i.viewport.h / 2;
  let dx = s.x - cx;
  let dy = s.y - cy;
  if (s.behind) {
    dx = -dx;
    dy = Math.abs(dy) + i.viewport.h; // behind the camera: point down toward the bottom edge
  }
  if (dx === 0 && dy === 0) dx = 1;
  // Keep the arrow off the bottom-centre carry hotbar: slide it to the lower side.
  const k = 1 / Math.sqrt((dx * dx) / (cx * cx) + (dy * dy) / (cy * cy));
  if (dy > 0 && Math.abs(dx * k) < i.viewport.w * 0.22) dx = (dx < 0 ? -1 : 1) * Math.max(Math.abs(dx), (dy * cx * 0.9) / cy);
  return { x: cx + dx, y: cy + dy, angle: Math.atan2(dy, dx), icon: target.icon, label: target.label };
}

export function buildHudView(i: HudViewInput): HudView {
  const { sim, state, progression, gfx, tf } = i;
  const p = sim.player;
  const w = sim.wave;
  const surge = w.phase === 'surge';
  const len = HOME_FRONT_Z - w.startZ;
  const progress = surge ? Math.max(0, Math.min(1, (w.frontZ - w.startZ) / len)) : 0;
  const hits = w.timeUntilReaches(p.pos.z);
  const hide: Partial<Record<HudPart, boolean>> = { ...tf.hide };
  const speedH = Math.hypot(p.vel.x, p.vel.z);
  const action = p.mode !== 'ground' || speedH > 6;

  // Reticle: the hook the player would grab, a locked hook nearby, or the Perfect release ring.
  let reticle: HudView['reticle'] = null;
  const splashed = sim.splashTime > 0 || sim.seaRespawnTime > 0;
  if (!i.panelOpen && !splashed) {
    if (p.mode === 'swing') {
      if (sim.perfectWindow) {
        const s = gfx.project(p.gripPos(grip));
        if (s.onScreen) reticle = { kind: 'release', x: s.x, y: s.y };
      }
    } else if (p.target) {
      const s = gfx.project(p.target.pos);
      if (s.onScreen) reticle = { kind: 'hook', x: s.x, y: s.y, locked: false, keyHint: i.keyboard && state.counters.grabs < 3 };
    } else if (p.mode !== 'ground') {
      const a = nearbyLockedAnchor(p.gripPos(grip), sim.course.anchors, state.stats.reach, 10);
      if (a) {
        const s = gfx.project(a.pos);
        if (s.onScreen) reticle = { kind: 'hook', x: s.x, y: s.y, locked: true, reach: a.minReach, keyHint: false };
      }
    }
  }
  if (reticle) {
    lastReticle.x = reticle.x;
    lastReticle.y = reticle.y;
    lastReticle.valid = true;
  }

  // Edge arrow: tutorial target, or home while the handsFull hint runs.
  let target = tf.edgeTarget;
  if (!target && i.homeArrow) {
    const home = sim.course.homeSpawn;
    target = { pos: home, icon: 'home', label: `${Math.round(Math.hypot(home.x - p.pos.x, home.z - p.pos.z))} m` };
  }

  const vigTutorial = tf.vignette;
  let vignette: HudView['vignette'] = { kind: 'none', strength: 0 };
  if (vigTutorial > 0) vignette = { kind: 'slowmo', strength: vigTutorial };
  else if (w.phase !== 'calm' && !sim.playerSafe()) vignette = { kind: 'danger', strength: surge ? 0.8 : 0.5 };

  const chain = sim.combo.chain >= 2 ? { count: sim.combo.chain, timerFrac: sim.combo.timerFrac } : null;
  const jumpLabel = tf.jumpLabel ?? (p.mode === 'swing' ? 'LET GO' : p.target ? 'SWING' : 'JUMP');

  return {
    layout: i.layout,
    touch: i.touch,
    cash: state.cash,
    pearls: state.pearls,
    income: state.incomePerSec(),
    multiplier: state.multiplier,
    rebirths: state.rebirths,
    streak: state.daily.streak,
    wave: {
      phase: w.phase,
      frozen: w.frozen && w.phase !== 'surge',
      timer: w.timer,
      duration: w.duration,
      golden: w.golden,
      big: w.big,
      number: w.number,
      progress,
      hitsPlayerIn: Number.isFinite(hits) ? hits : null,
      safe: sim.playerSafe(),
      caught: sim.splashTime > 0,
    },
    course: {
      playerT: courseT(sim, p.pos.z),
      waveT: surge ? courseT(sim, w.frontZ) : null,
      zone: sim.zone,
      visible: !hide.course,
    },
    carried: state.carried,
    capacity: state.carryCapacity,
    tripBonusPct: tripBonusPct(sim.combo.liveTripBest),
    chain,
    action,
    rail: progression.railState(state.cash, sim.isOnHome()),
    tracker: i.tracker !== undefined ? i.tracker : progression.tracker(),
    jumpLabel,
    jumpGoldRim: sim.perfectWindow,
    reticle,
    edgeArrow: edgeArrow(i, target),
    vignette,
    hide,
  };
}

function surfaceOf(sim: GameSim): Surface {
  const s = sim.player.groundSolid;
  if (!s) return 'grass';
  if (s.kind === 'home') return 'grass';
  if (s.kind === 'island') return 'sand';
  return 'wood';
}

export interface AudioFrameInput {
  sim: GameSim;
  state: GameState;
  realDt: number;
  panelOpen: boolean;
  slowmo: boolean;
  ftueStep: TutorialFrame['step'];
  lowTier: boolean;
}

export function buildAudioFrame(i: AudioFrameInput): AudioFrame {
  const { sim, state } = i;
  const p = sim.player;
  let maxR = -1;
  for (const c of state.carried) maxR = Math.max(maxR, getSpecies(c.speciesId).rarity);
  const ground = p.mode === 'ground';
  return {
    dt: i.realDt,
    onHome: sim.isOnHome(),
    carried: state.carried.length,
    carriedMaxRarity: maxR,
    wavePhase: sim.wave.phase,
    waveTimer: sim.wave.timer,
    golden: sim.wave.golden,
    big: sim.wave.big,
    speed: Math.hypot(p.vel.x, p.vel.z),
    altitude: Math.max(0, p.pos.y),
    nearIsland: ground || sim.zone < 0 || p.pos.y > 4,
    bestZone: Math.max(0, state.bestZone),
    grounded: ground,
    surface: surfaceOf(sim),
    swing: p.mode === 'swing' && p.anchor ? { theta: sim.swingTheta, speed: tmp.copy(p.vel).length() } : null,
    perfectWindow: sim.perfectWindow,
    panelOpen: i.panelOpen,
    slowmo: i.slowmo,
    ftueStep: i.ftueStep,
    lowTier: i.lowTier,
  };
}

export interface RenderFrameInput {
  sim: GameSim;
  state: GameState;
  realDt: number;
  simDt: number;
  time: number;
  tf: TutorialFrame;
  reduceMotion: boolean;
  beatPhase: number;
}

export function buildRenderFrame(i: RenderFrameInput): RenderFrame {
  return {
    realDt: i.realDt,
    simDt: i.simDt,
    time: i.time,
    sim: i.sim,
    state: i.state,
    cosmetics: i.state.cosmetics.equipped,
    guides: i.tf.guides,
    reduceMotion: i.reduceMotion,
    beatPhase: i.beatPhase,
  };
}
