// Contextual hints after the tutorial (§7.4). No DOM: emits toasts through deps and returns the
// DRAG TO LOOK prompt (drawn by TutorialOverlay when the tutorial has no prompt of its own).
import { Vector3 } from 'three';
import { groundHeightAt } from '../game/course';
import { MUTATIONS } from '../game/creatures';
import { nearbyLockedAnchor } from '../game/player';
import type { GameSim } from '../game/sim';
import type { GameState } from '../game/state';
import type { FtueStepId, PanelTab, PromptSpec, SimEvent, ToastSpec } from '../contracts';
import { COPY } from './copy';
import type { Device } from './core';

export interface HintsDeps {
  toast: (t: ToastSpec) => void;
  seen: (id: string) => boolean;
  markSeen: (id: string) => void;
  openShop: (tab?: PanelTab) => void;
  /** Optional: picks the desktop or touch wording (default keyboard). */
  device?: () => Device;
}

export interface HintsContext {
  /** A surge is running: only wave-related hints may show. */
  surge: boolean;
  /** Another toast is on screen: wait. */
  toastBusy: boolean;
  /** Timestamp (any monotonic unit, 0 = never) of the last camera input; only changes are compared. */
  lastLookAt: number;
  ftueStep: FtueStepId | null;
}

export const HINT = {
  lockedRadius: 16,
  handsFullSec: 5,
  handsFullCooldownSec: 120,
  homeArrowSec: 5,
  dragAfterSec: 20,
  dragShowSec: 4,
  doubleJumpHeight: 1.5,
  lighthouseRadius: 12,
  seaFalls: 3,
  queueTtlSec: 15,
};

interface Pending {
  id: string;
  spec: ToastSpec;
  at: number;
  wave: boolean;
}

const grip = new Vector3();

export class Hints {
  private t = 0;
  private readonly queue: Pending[] = [];
  private handsFull = 0;
  private handsFullReadyAt = 0;
  private homeArrowUntil = -1;
  private prevStep: FtueStepId | null | undefined = undefined;
  private releaseDoneAt = -1;
  private lookRef = 0;
  private dragUntil = -1;
  private seaSolid = -1;
  private seaStreak = 0;

  constructor(private readonly deps: HintsDeps) {}

  /** True while the handsFull hint wants the edge arrow to point home (§7.4, 5000 ms). */
  get homeArrow(): boolean {
    return this.t < this.homeArrowUntil;
  }

  private touch(): boolean {
    return this.deps.device?.() === 'touch';
  }

  update(realDt: number, sim: GameSim, state: GameState, ctx: HintsContext): PromptSpec | null {
    this.t += realDt;
    const step = ctx.ftueStep;
    if (this.prevStep === 'release' && step !== 'release' && this.releaseDoneAt < 0) this.markReleaseDone(ctx.lastLookAt);
    this.prevStep = step;

    const prompt = this.dragToLook(ctx);
    if (step !== null) return prompt; // toasts start after the tutorial

    for (let i = this.queue.length - 1; i >= 0; i--) if (this.t - this.queue[i].at > HINT.queueTtlSec) this.queue.splice(i, 1);
    this.checkState(realDt, sim, state);
    if (ctx.toastBusy) return prompt;
    const i = this.queue.findIndex((q) => !ctx.surge || q.wave);
    if (i >= 0) {
      const [q] = this.queue.splice(i, 1);
      this.deps.toast(q.spec);
    }
    return prompt;
  }

  onSimEvent(e: SimEvent, sim: GameSim): void {
    switch (e.type) {
      case 'landed':
        if (e.islandOrder >= 1 && this.releaseDoneAt < 0 && this.prevStep === null) this.markReleaseDone(null);
        if (this.seaSolid !== -1 && e.solid.id !== this.seaSolid) {
          this.seaSolid = -1;
          this.seaStreak = 0;
        }
        break;
      case 'player':
        if (e.event === 'sea') {
          const id = sim.player.groundSolid?.id ?? -1;
          this.seaStreak = id === this.seaSolid ? this.seaStreak + 1 : 1;
          this.seaSolid = id;
          if (this.seaStreak >= HINT.seaFalls) {
            this.seaStreak = 0;
            this.once('seaFalls', { text: COPY.hints.seaFalls, kind: 'info' });
          }
        }
        break;
      case 'deliver':
        if (e.result.sold.length > 0) this.once('baseFull', { text: COPY.hints.baseFull, kind: 'info', icon: 'pedestal' });
        break;
      case 'bounce':
        this.once('bounce', { text: COPY.hints.bounce, kind: 'good' });
        break;
      case 'collect': {
        const m = e.creature.mutation;
        if (m >= 1) this.once('firstMutation', { text: COPY.hints.firstMutation(MUTATIONS[m].name, MUTATIONS[m].mult), kind: 'good', icon: 'gem' });
        break;
      }
      case 'chain':
        if (e.count >= 3) this.once('chainIntro', { text: COPY.hints.chainIntro, kind: 'info', icon: 'chain' });
        break;
      default:
        break;
    }
  }

  /** Queues a once-only hint (marked seen when queued, so it can never show twice). */
  private once(id: string, spec: ToastSpec, wave = false): void {
    if (this.deps.seen(id) || this.queue.some((q) => q.id === id)) return;
    this.deps.markSeen(id);
    this.queue.push({ id, spec, at: this.t, wave });
  }

  private checkState(realDt: number, sim: GameSim, state: GameState): void {
    const p = sim.player;

    if (!this.deps.seen('lockedHook')) {
      const a = nearbyLockedAnchor(p.gripPos(grip), sim.course.anchors, state.stats.reach, HINT.lockedRadius);
      if (a) {
        this.once('lockedHook', {
          text: COPY.hints.lockedHook(a.minReach),
          kind: 'warn',
          icon: 'lock',
          onTap: () => this.deps.openShop('upgrades'),
        });
      }
    }

    const full = state.carried.length > 0 && state.carried.length >= state.carryCapacity && !sim.isOnHome();
    this.handsFull = full ? this.handsFull + realDt : 0;
    if (this.handsFull >= HINT.handsFullSec && this.t >= this.handsFullReadyAt) {
      this.handsFullReadyAt = this.t + HINT.handsFullCooldownSec;
      this.homeArrowUntil = this.t + HINT.homeArrowSec;
      this.queue.push({ id: 'handsFull', spec: { text: COPY.hints.handsFull, kind: 'warn', icon: 'home' }, at: this.t, wave: false });
    }

    if (!this.deps.seen('doubleJump') && p.mode === 'air' && p.vel.y < 0) {
      const ground = groundHeightAt(sim.course, p.pos.x, p.pos.z, p.pos.y);
      if (p.pos.y - ground > HINT.doubleJumpHeight) {
        this.once('doubleJump', { text: this.touch() ? COPY.hints.doubleJumpTouch : COPY.hints.doubleJumpDesktop, kind: 'info' });
      }
    }

    if (!this.deps.seen('lighthouse') && sim.wave.phase === 'calm') {
      for (const pad of sim.course.pads) {
        const cx = (pad.min.x + pad.max.x) / 2;
        const cz = (pad.min.z + pad.max.z) / 2;
        if (Math.hypot(cx - p.pos.x, cz - p.pos.z) <= HINT.lighthouseRadius) {
          this.once('lighthouse', { text: COPY.hints.lighthouse, kind: 'info', icon: 'lighthouse' });
          break;
        }
      }
    }

    if (!this.deps.seen('goldenNext') && sim.wave.golden && sim.wave.phase === 'calm') {
      this.once('goldenNext', { text: COPY.hints.goldenNext, kind: 'info', icon: 'sparkle' }, true);
    }

    if (!this.deps.seen('rebirthReady') && state.canRebirth()) {
      this.once('rebirthReady', { text: COPY.hints.rebirthReady, kind: 'good', icon: 'rebirth', onTap: () => this.deps.openShop('rebirth') });
    }
  }

  private markReleaseDone(look: number | null): void {
    this.releaseDoneAt = this.t;
    this.lookRef = look ?? NaN;
  }

  /** DRAG TO LOOK: 20 s after step `release` completes with no camera input yet (FTUE or not). */
  private dragToLook(ctx: HintsContext): PromptSpec | null {
    if (Number.isNaN(this.lookRef) && this.releaseDoneAt >= 0) this.lookRef = ctx.lastLookAt;
    const looked = this.releaseDoneAt >= 0 && ctx.lastLookAt !== this.lookRef;
    if (this.dragUntil > this.t) {
      if (looked) this.dragUntil = -1;
      else return { id: 'dragToLook', headline: COPY.dragToLook.headline, size: 'normal', fail: false, glyph: 'dragLook' };
      return null;
    }
    if (this.releaseDoneAt < 0 || this.deps.seen('dragToLook')) return null;
    if (looked) {
      this.deps.markSeen('dragToLook');
      return null;
    }
    if (this.t - this.releaseDoneAt >= HINT.dragAfterSec) {
      this.deps.markSeen('dragToLook');
      this.dragUntil = this.t + HINT.dragShowSec;
      return { id: 'dragToLook', headline: COPY.dragToLook.headline, size: 'normal', fail: false, glyph: 'dragLook' };
    }
    return null;
  }
}
