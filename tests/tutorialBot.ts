// FTUE bot (§7.5): plays the tutorial start to finish in sim (no DOM), driving TutorialCore the way
// Game.ts does (§10.7 frame order), with a simple scripted player.
import { HOME_FRONT_Z } from '../src/game/config';
import { ManualClock } from '../src/game/clock';
import { Progression, type ProgressEvent } from '../src/game/progression';
import { applyReward } from '../src/game/rewards';
import { GameSim, type SimEvent } from '../src/game/sim';
import { GameState } from '../src/game/state';
import type { PlayerInput } from '../src/game/player';
import type { BannerSpec, FtueStepId, PanelKind, TutorialCommand, TutorialFrame } from '../src/contracts';
import { TutorialCore, type Device, type TutorialEffect } from '../src/tutorial/core';

const SDT = 1 / 120;

export interface HarnessOptions {
  device?: Device;
  rngSeed?: number;
  state?: GameState;
  reduceMotion?: boolean;
}

/** Emulates the lead's per-frame integration (Game.ts §10.7) around GameSim + TutorialCore. */
export class FtueHarness {
  readonly state: GameState;
  readonly sim: GameSim;
  readonly core: TutorialCore;
  readonly progression: Progression;
  readonly clock = new ManualClock(Date.UTC(2026, 10, 5, 12));
  panel: PanelKind | null = null;
  realTime = 0;
  device: Device;
  lookAt = 0;
  /** Everything that happened, for assertions. */
  readonly simEvents: SimEvent[] = [];
  readonly effects: TutorialEffect[] = [];
  readonly commands: TutorialCommand[] = [];
  readonly banners: { spec: BannerSpec; at: number }[] = [];
  readonly stepAt: Partial<Record<FtueStepId, number>> = {};
  readonly progressEvents: ProgressEvent[] = [];
  lastFrame: TutorialFrame | null = null;
  private acc = 0;

  constructor(opts: HarnessOptions = {}) {
    this.state = opts.state ?? new GameState();
    this.sim = new GameSim(this.state, { rngSeed: opts.rngSeed ?? 7 });
    this.device = opts.device ?? 'keyboard';
    this.progression = new Progression(this.state, this.clock);
    this.core = new TutorialCore({ reduceMotion: () => !!opts.reduceMotion, device: () => this.device, lastLookAt: () => this.lookAt });
    // New sessions spawn at the FTUE spawn (lead duty, §10.7).
    this.respawnFtue();
    this.core.start(this.state, this.sim);
  }

  respawnFtue(): void {
    this.sim.player.reset(this.sim.course.ftueSpawn);
    this.sim.checkpoint.copy(this.sim.course.ftueSpawn);
  }

  setPanel(kind: PanelKind | null): void {
    this.panel = kind;
    this.core.onUi({ type: 'panel', kind, tab: kind === 'shop' ? 'upgrades' : undefined });
  }

  private apply(c: TutorialCommand): void {
    this.commands.push(c);
    switch (c.type) {
      case 'setWaveTimer':
        if (c.mode === 'set') this.sim.wave.setTimer(c.seconds);
        else this.sim.wave.capTimer(c.seconds);
        break;
      case 'forceSpawn':
        this.sim.forceSpawn(c.islandOrder, c.point, c.speciesId, c.mutation);
        break;
      case 'grant':
        applyReward(this.state, c.reward);
        break;
      case 'closePanel':
        this.setPanel(null);
        break;
      case 'respawnFtue':
        this.respawnFtue();
        break;
    }
  }

  /** One rendered frame of realDt seconds with the given player input. */
  frame(realDt: number, input: PlayerInput): TutorialFrame {
    this.realTime += realDt;
    this.clock.advance(realDt * 1000);
    const tf = this.core.update(realDt, this.sim, this.state, this.state.settings);
    for (const c of tf.commands) this.apply(c);
    this.sim.overrides = tf.sim;
    for (const fx of this.core.effects) {
      this.effects.push(fx);
      if (fx.type === 'banner') this.banners.push({ spec: fx.spec, at: this.realTime });
    }
    if (tf.step) this.stepAt[tf.step] ??= this.sim.time;

    const simDt = this.panel ? 0 : realDt * tf.timeScale;
    this.acc += simDt;
    let first = true;
    while (this.acc >= SDT) {
      this.acc -= SDT;
      this.sim.step(SDT, input);
      if (first) {
        input = { ...input, jumpPressed: false };
        first = false;
      }
      for (const e of this.sim.events) {
        this.simEvents.push(e);
        this.progression.onSimEvent(e, this.sim);
        this.core.onSimEvent(e, this.sim);
      }
    }
    this.progression.update(realDt, { active: true, sim: this.sim, ftueDone: this.state.ftue.done });
    for (const e of this.progression.events) {
      this.progressEvents.push(e);
      this.core.onProgressEvent(e);
    }
    this.lastFrame = tf;
    return tf;
  }
}

export interface BotOptions extends HarnessOptions {
  /** Do not open the Shop until the first wave is over (slow player: the interrupted-shop path). */
  interruptShop?: boolean;
  /** Real seconds per frame (default 1/60). */
  frameDt?: number;
  /** Give up after this much sim time. */
  maxSimSec?: number;
  /** Called after every frame (assertions). */
  onFrame?: (tf: TutorialFrame, h: FtueHarness) => void;
}

export interface BotResult {
  done: boolean;
  simTime: number;
  realTime: number;
  harness: FtueHarness;
}

/** Scripted player: reads the tutorial frame like a player reads the pill, and plays the step. */
export function runFtueBot(opts: BotOptions = {}): BotResult {
  return playFtue(new FtueHarness(opts), opts);
}

/** Plays the FTUE on an existing harness (also used after core.replay()). */
export function playFtue(h: FtueHarness, opts: BotOptions = {}): BotResult {
  const { sim, state, core } = h;
  const simStart = sim.time;
  const dt = opts.frameDt ?? 1 / 60;
  const maxSim = opts.maxSimSec ?? 150;
  const course = sim.course;
  const gap1 = course.gaps[0].anchors[0];
  const island1 = course.islands.find((i) => i.order === 1)!;
  const input: PlayerInput = { moveX: 0, moveZ: 0, jumpHeld: false, jumpPressed: false };
  let swingT = 0;
  let wasSwing = false;
  let letGone = false;
  let shopAsk = 0;
  let lastJump = -1;
  let tf = h.frame(dt, input);

  const steer = (tx: number, tz: number) => {
    const dx = tx - sim.player.pos.x;
    const dz = tz - sim.player.pos.z;
    const l = Math.hypot(dx, dz);
    if (l < 0.3) {
      input.moveX = input.moveZ = 0;
    } else {
      input.moveX = dx / l;
      input.moveZ = dz / l;
    }
  };

  /** Run at the edge toward `dir` (−1 = out to sea, +1 = back home), jump, hold, let go on LET GO. */
  const crossGap = (dir: -1 | 1, edgeZ: number) => {
    const p = sim.player;
    input.jumpPressed = false;
    if (p.mode === 'swing') {
      swingT += dt * tf.timeScale;
      steer(gap1.pos.x, p.pos.z + dir * 20);
      const pitchOk = p.vel.y > 0 && p.vel.z * dir > 0 && Math.atan2(p.vel.y, Math.hypot(p.vel.x, p.vel.z)) > 0.6;
      const letGo = tf.jumpLabel === 'LET GO' || tf.prompt?.id === 'letGo' || (swingT > 4 && pitchOk);
      input.jumpHeld = !letGo;
      if (letGo) letGone = true;
      return;
    }
    swingT = 0;
    if (p.mode === 'ground') {
      letGone = false;
      steer(gap1.pos.x, edgeZ + dir * 3);
      const atEdge = dir < 0 ? p.pos.z < edgeZ + 0.5 : p.pos.z > edgeZ - 0.5;
      if (atEdge && h.realTime - lastJump > 0.3) {
        input.jumpPressed = true;
        input.jumpHeld = true;
        lastJump = h.realTime;
      } else input.jumpHeld = false;
    } else {
      steer(gap1.pos.x, p.pos.z + dir * 20);
      // Hold after the jump to grab the hook; after letting go, keep the button up until landing.
      input.jumpHeld = !letGone;
    }
  };

  while (sim.time - simStart < maxSim && (core.active || !state.ftue.done)) {
    const p = sim.player;
    const step = tf.step;
    input.jumpPressed = false;
    if (p.mode !== 'swing' && wasSwing) swingT = 0;
    wasSwing = p.mode === 'swing';

    switch (step) {
      case 'grab':
      case 'release':
        if (p.groundSolid?.kind === 'home' || p.pos.z > HOME_FRONT_Z || p.mode !== 'ground') crossGap(-1, HOME_FRONT_Z);
        break;
      case 'collect': {
        const w = sim.wild.filter((c) => c.island.order === 1).sort((a, b) => a.pos.distanceTo(p.pos) - b.pos.distanceTo(p.pos))[0];
        if (p.groundSolid === island1.solid && w) {
          steer(w.pos.x, w.pos.z);
          input.jumpHeld = false;
        } else if (p.groundSolid?.kind === 'home') crossGap(-1, HOME_FRONT_Z);
        else {
          input.moveX = input.moveZ = 0;
          input.jumpHeld = false;
        }
        break;
      }
      case 'home':
        if (p.mode === 'ground' && p.groundSolid?.kind === 'home') {
          const ped = course.pedestals[0];
          steer(ped.x, ped.z);
          input.jumpHeld = false;
        } else crossGap(1, island1.solid.max.z);
        break;
      case 'shop':
        input.moveX = input.moveZ = 0;
        input.jumpHeld = false;
        if (opts.interruptShop && !h.simEvents.some((e) => e.type === 'surgeEnd')) break;
        if (!h.panel) {
          shopAsk += dt;
          if (shopAsk > 0.8) {
            h.setPanel('shop');
            shopAsk = 0;
          }
        } else if (tf.spotlight === 'shop:buy:reach') {
          if (state.buyMany('reach', 1) > 0) core.onUi({ type: 'buy', key: 'reach' });
        }
        break;
      default:
        // earn, wave, ready: stay safe at home and watch.
        input.moveX = input.moveZ = 0;
        input.jumpHeld = false;
        break;
    }
    tf = h.frame(dt, input);
    opts.onFrame?.(tf, h);
  }
  return { done: state.ftue.done && !core.active, simTime: sim.time - simStart, realTime: h.realTime, harness: h };
}
