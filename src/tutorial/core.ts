// TutorialCore: the FTUE state machine and director (§7, §10.6). No DOM; runs in vitest's node env.
import { Vector3 } from 'three';
import { HOME_FRONT_Z, HOME_TOP } from '../game/config';
import type { Solid } from '../game/course';
import { getSpecies } from '../game/creatures';
import { predictRelease } from '../game/predict';
import type { ProgressEvent } from '../game/progression';
import { voyageRewardKey } from '../game/quests';
import { minutes } from '../game/rewards';
import type { GameSim } from '../game/sim';
import { FTUE_STEPS, type GameState } from '../game/state';
import type { UpgradeKey } from '../game/economy';
import type {
  BannerSpec,
  FtueStepId,
  GuideSpec,
  HudFocus,
  IconId,
  PanelKind,
  PanelTab,
  PromptSpec,
  Reward,
  Settings,
  SimEvent,
  TutorialCommand,
  TutorialFrame,
} from '../contracts';
import { NO_GUIDES } from '../contracts';
import { COPY, type Line } from './copy';
import { FtueLog, type LogStorage } from './debugLog';
import { ASSIST, NO_SUPPORT, SKIP_PAYS, STEPS, STRUGGLE, SWING_SUPPORT, TIMING, type SwingSupport } from './steps';

export type Device = 'keyboard' | 'touch' | 'mouse';

export interface TutorialCoreDeps {
  reduceMotion: () => boolean;
  device: () => Device;
  /** Timestamp (any monotonic unit, 0 = never) of the last camera input. Only changes are compared. */
  lastLookAt: () => number;
  /** Optional: where the §7.5 log is mirrored (localStorage in the browser). */
  storage?: LogStorage | null;
}

/** Side effects the lead forwards to the HUD, graphics and audio (drained like Progression.events). */
export type TutorialEffect =
  | { type: 'banner'; spec: BannerSpec }
  | { type: 'confetti'; count: number }
  | { type: 'cheer' }
  /** Step 3 stuck hint: nudge the camera yaw toward a world point (skipped with reduce motion). */
  | { type: 'cameraNudge'; toward: Vector3; degrees: number; ms: number }
  | { type: 'stepDone'; step: FtueStepId }
  | { type: 'finished'; skipped: boolean };

export type TutorialUiEvent =
  | { type: 'panel'; kind: PanelKind | null; tab?: PanelTab }
  | { type: 'buy'; key: UpgradeKey }
  /** The Controls card (ready step) was tapped. */
  | { type: 'controlsClosed' };

const idx = (s: FtueStepId) => FTUE_STEPS.indexOf(s);
const HIDE_NONE = {};

interface Timed {
  line: Line;
  id: string;
  until: number;
  glyph?: PromptSpec['glyph'];
  stamp?: string;
}

export class TutorialCore {
  /** True while the FTUE runs (from start until the Controls card closes). */
  active = false;
  step: FtueStepId | null = null;
  /** Effects since the last update(); cleared at the start of update(). */
  readonly effects: TutorialEffect[] = [];
  readonly log: FtueLog;

  private state: GameState | null = null;
  private sim: GameSim | null = null;
  private settings: Settings | null = null;
  private readonly pendingFx: TutorialEffect[] = [];
  private cmds: TutorialCommand[] = [];

  private now = 0;
  private stepStart = 0;
  private lastSimTime = 0;
  private bannerUntil = -1;
  private fail: Timed | null = null;
  private stamp: Timed | null = null;
  private splashUntil = -1;

  // grab
  private readonly startPos = new Vector3();
  private moved = false;
  private edgeIdle = 0;
  // swing tracking (persisted per session)
  private completedSwings = 0;
  private grabbedSolid: Solid | null = null;
  private releasedThisSwing = false;
  /** A jump (or double jump) since the last landing or respawn: tells "did not hold" from "never jumped". */
  private jumpedSinceGround = false;
  private passes = 0;
  private lastSign = 0;
  private windowEver = false;
  private pumpShown = false;
  private inWindow = false;
  private windowAcc = 1;
  private windowHeld = 0;
  private scale = 1;
  private arcOk = false;
  private arcValid = false;
  private readonly arcPts: Vector3[] = [];
  // struggle assist
  private seaStreakSolid = -1;
  private seaStreak = 0;
  private struggleLeft = 0;
  private struggleSolid = -1;
  // collect
  private firstCollectAt = -1;
  private lastProgressAt = 0;
  private nudged = false;
  // home
  private homeBest = Infinity;
  private homeBestAt = 0;
  private homeRepop = 0;
  // shop
  private panel: PanelKind | null = null;
  private shopDone = false;
  private waveDone = false;
  private practiceOver = false;
  private boughtBaseline = -1;
  private lastBuyKey: UpgradeKey | null = null;
  private closeAt = -1;
  // ready
  private controlsUntil = -1;
  private controlsClosed = false;
  /** True while a Settings → Replay run is in progress. */
  replaying = false;

  // scratch
  private readonly trail: Vector3[] = Array.from({ length: 6 }, () => new Vector3());
  private readonly v1 = new Vector3();
  private readonly v2 = new Vector3();
  private readonly v3 = new Vector3();
  private readonly edgePos = new Vector3();

  constructor(private readonly deps: TutorialCoreDeps) {
    this.log = new FtueLog(deps.storage ?? null);
    for (let i = 0; i < ASSIST.arcPoints; i++) this.arcPts.push(new Vector3());
  }

  // ---------------------------------------------------------------- lifecycle

  /** Resumes ftue.step (§7.1 migration rule included); no-op (inactive) if the FTUE is done. */
  start(state: GameState, sim: GameSim): void {
    this.state = state;
    this.sim = sim;
    this.lastSimTime = sim.time;
    const f = state.ftue;
    if (!f.done && (state.flags.delivered || state.flags.bought)) f.done = true; // old players skip
    if (f.done) {
      this.active = false;
      this.step = null;
      return;
    }
    // Resume where the player can actually continue (carried creatures and the swing are not saved).
    let step = f.step;
    if (step === 'release') step = 'grab';
    else if (step === 'home') step = 'collect';
    else if (step === 'earn') step = 'shop';
    else if (step === 'ready') {
      f.done = true;
      this.active = false;
      this.step = null;
      return;
    }
    this.shopDone = step === 'wave' && f.rewarded.includes(voyageRewardKey(5));
    this.practiceOver = f.rewarded.includes(voyageRewardKey(6)) && idx(step) >= idx('shop');
    // V6 is paid at the first surgeEnd: resuming the interrupted shop step must not replay the wave step.
    this.waveDone = this.practiceOver;
    this.begin(step, false);
  }

  private begin(step: FtueStepId, replay: boolean): void {
    this.active = true;
    this.replaying = replay;
    this.boughtBaseline = -1;
    this.bannerUntil = -1;
    this.fail = this.stamp = null;
    this.controlsClosed = false;
    this.controlsUntil = -1;
    this.log.begin(replay);
    if (idx(step) <= idx('collect')) {
      this.cmds.push({ type: 'respawnFtue' });
      this.spawnIsland1();
    }
    this.enter(step);
  }

  /** Settings → Replay tutorial: back to `grab` at the FTUE spawn. No reward is paid twice (ftue.rewarded). */
  replay(): void {
    const state = this.state;
    if (!state) return;
    state.ftue.done = false;
    state.ftue.skipped = false;
    state.ftue.step = 'grab';
    this.completedSwings = 0;
    this.shopDone = this.waveDone = this.practiceOver = false;
    this.firstCollectAt = -1;
    this.begin('grab', true);
  }

  /** "Skip tutorial ›" (§7.1). */
  skip(): void {
    const state = this.state;
    const sim = this.sim;
    if (!state || !sim || !this.active) return;
    state.ftue.done = true;
    state.ftue.skipped = true;
    for (const s of SKIP_PAYS) this.grantFor(s);
    if (sim.wave.phase !== 'surge') {
      this.cmds.push({ type: 'setWaveTimer', seconds: Math.max(sim.wave.timer, TIMING.skipMinTimer), mode: 'set' });
    }
    this.practiceOver = true;
    this.finish(true);
  }

  private finish(skipped: boolean): void {
    if (this.state) this.state.ftue.done = true;
    this.active = false;
    this.step = null;
    this.bannerUntil = -1;
    this.log.finish(skipped ? 'skipped' : 'done');
    this.pendingFx.push({ type: 'finished', skipped });
  }

  // ---------------------------------------------------------------- inputs

  onSimEvent(e: SimEvent, sim: GameSim): void {
    this.sim = sim;
    switch (e.type) {
      case 'player':
        if (e.event === 'grab') this.onGrab(sim);
        else if (e.event === 'release') this.onRelease();
        else if (e.event === 'sea') this.onSea(sim);
        else if (e.event === 'jump' || e.event === 'doubleJump') this.jumpedSinceGround = true;
        break;
      case 'landed':
        // Landing while still on the rope ends the swing like a release (no 'release' event).
        if (sim.player.landedAttached && this.grabbedSolid) this.releasedThisSwing = true;
        this.onLanded(e.solid, e.islandOrder);
        break;
      case 'respawn':
        this.jumpedSinceGround = false;
        break;
      case 'collect':
        if (!this.active) break;
        if (this.firstCollectAt < 0) this.firstCollectAt = this.now;
        this.lastProgressAt = this.now;
        if (this.step === 'collect' && this.state && this.state.carried.length >= this.carryGoal()) this.complete('collect');
        break;
      case 'deliver':
        if (!this.active) break;
        if (this.step === 'collect') this.complete('collect');
        if (this.step === 'home') this.complete('home');
        break;
      case 'waveWarning':
        if (this.active && this.step === 'shop') this.enter('wave'); // interrupted shop step (§7.2)
        break;
      case 'surgeEnd':
        this.onSurgeEnd(e.survived);
        break;
      case 'splash':
        if (this.active && e.practice) this.splashUntil = this.now + TIMING.splashPillMs / 1000;
        break;
      case 'padLaunch':
        if (this.active && this.step === 'wave') this.showStamp(COPY.launch, 'stamp:launch');
        break;
      default:
        break;
    }
  }

  onProgressEvent(_e: ProgressEvent): void {
    // Progression pays FTUE quests with an empty reward while the FTUE runs; nothing to do here.
  }

  onUi(e: TutorialUiEvent): void {
    if (e.type === 'panel') {
      this.panel = e.kind;
    } else if (e.type === 'buy') {
      this.lastBuyKey = e.key;
      if (this.active && this.shopEligible()) this.onPurchase(e.key);
    } else if (e.type === 'controlsClosed') {
      this.controlsClosed = true;
    }
  }

  private shopEligible(): boolean {
    return !!this.step && !this.shopDone && idx(this.step) >= idx('shop') && this.step !== 'ready';
  }

  private onGrab(sim: GameSim): void {
    this.grabbedSolid = sim.player.groundSolid;
    this.releasedThisSwing = false;
    this.passes = 0;
    this.lastSign = 0;
    this.windowEver = false;
    this.pumpShown = false;
    this.windowAcc = 1; // evaluate on the next update
    this.log.swing();
    if (!this.active) return;
    this.fail = null;
    if (this.step === 'grab') this.complete('grab');
  }

  private onRelease(): void {
    this.releasedThisSwing = true;
    this.inWindow = false;
    if (this.struggleLeft > 0 && this.grabbedSolid?.id === this.struggleSolid) this.struggleLeft--;
  }

  private onSea(sim: GameSim): void {
    const solid = sim.player.groundSolid;
    const id = solid ? solid.id : -1;
    if (id === this.seaStreakSolid) this.seaStreak++;
    else {
      this.seaStreakSolid = id;
      this.seaStreak = 1;
    }
    if (this.seaStreak >= STRUGGLE.falls && (this.settings?.swingAssist ?? true)) {
      this.struggleLeft = STRUGGLE.swings;
      this.struggleSolid = id;
      this.seaStreak = 0;
    }
    this.log.seaFall();
    if (!this.active) return;
    if (this.step === 'grab' || (this.step === 'release' && !this.releasedThisSwing)) {
      const touch = this.isTouch();
      // Walked off the edge without jumping: "keep holding" would be the wrong lesson.
      if (this.jumpedSinceGround) this.setFail(touch ? COPY.grabFail : COPY.grabFailDesktop, 'fail:hold');
      else this.setFail(touch ? COPY.jumpFail : COPY.jumpFailDesktop, 'fail:jump');
    } else if (this.step === 'release') {
      this.setFail(COPY.soClose, 'fail:soClose');
      this.log.hint('soClose');
    }
    this.releasedThisSwing = false;
  }

  private onLanded(solid: Solid, islandOrder: number): void {
    if (this.seaStreakSolid !== -1 && solid.id !== this.seaStreakSolid) {
      this.seaStreak = 0;
      this.seaStreakSolid = -1;
    }
    const crossed = this.releasedThisSwing && this.grabbedSolid !== null && solid !== this.grabbedSolid;
    if (crossed) this.completedSwings++;
    this.releasedThisSwing = false;
    this.jumpedSinceGround = false;
    if (!this.active) return;
    if (this.step === 'release' && crossed && islandOrder >= 1) {
      this.complete('release');
    } else if (this.step === 'grab' && islandOrder >= 1) {
      // Landed ahead without a swing (cannot happen on gap 1, but never block the flow).
      this.complete('grab');
      this.complete('release');
    }
  }

  private onSurgeEnd(survived: boolean): void {
    if (!this.active || !this.step || idx(this.step) < idx('home')) return;
    this.practiceOver = true;
    if (!this.waveDone) {
      this.waveDone = true;
      this.grantFor('wave');
      if (survived) {
        this.banner(COPY.survivedBanner, 'sun', TIMING.bannerMs);
        this.pendingFx.push({ type: 'confetti', count: 60 }, { type: 'cheer' });
      }
    }
    if (this.step === 'wave') {
      this.pendingFx.push({ type: 'stepDone', step: 'wave' });
      this.enter(this.shopDone ? 'ready' : 'shop');
    }
  }

  private onPurchase(key: UpgradeKey | null): void {
    this.shopDone = true;
    this.grantFor('shop');
    this.banner(key === 'reach' || key === null ? COPY.reachBanner : COPY.boughtBanner, 'grass', TIMING.bannerMs);
    if (this.panel) this.closeAt = this.now + TIMING.shopCloseMs / 1000;
    if (this.step === 'shop') {
      this.pendingFx.push({ type: 'stepDone', step: 'shop' });
      this.enter(this.waveDone ? 'ready' : 'wave');
    }
  }

  // ---------------------------------------------------------------- step flow

  private enter(step: FtueStepId): void {
    const state = this.state;
    const sim = this.sim;
    this.step = step;
    if (state) state.ftue.step = step;
    this.stepStart = this.now;
    this.lastProgressAt = this.now;
    this.log.enter(step);
    switch (step) {
      case 'grab':
        if (sim) this.startPos.copy(sim.player.pos);
        this.moved = false;
        this.edgeIdle = 0;
        break;
      case 'collect':
        this.nudged = false;
        this.firstCollectAt = -1;
        if (sim && !sim.wild.some((w) => w.island.order === 1)) this.spawnIsland1();
        break;
      case 'home':
        this.cmds.push({ type: 'setWaveTimer', seconds: TIMING.homeWaveTimer, mode: 'set' });
        this.homeBest = Infinity;
        this.homeBestAt = this.now;
        break;
      case 'earn':
        this.banner(COPY.earnBanner, 'sun', TIMING.earnBannerMs);
        break;
      case 'shop':
        if (this.boughtBaseline < 0 && state) this.boughtBaseline = state.counters.upgradesBought;
        break;
      case 'wave':
        if (this.boughtBaseline < 0 && state) this.boughtBaseline = state.counters.upgradesBought;
        this.cmds.push({ type: 'setWaveTimer', seconds: TIMING.waveCapTimer, mode: 'cap' });
        this.spawnNearPad();
        break;
      case 'ready':
        if (state) state.ftue.done = true; // Progression shows the tracker and pops Index + FREE
        this.banner(COPY.readyBanner, 'sun', TIMING.readyBannerMs);
        this.controlsUntil = this.bannerUntil + TIMING.controlsMs / 1000;
        break;
    }
  }

  /** Completes `step` (immediately, even before its prompt showed) and advances. */
  private complete(step: FtueStepId): void {
    if (this.step !== step) return;
    this.pendingFx.push({ type: 'stepDone', step });
    this.grantFor(step);
    switch (step) {
      case 'grab':
        this.enter('release');
        break;
      case 'release':
        this.showStamp(COPY.niceSwing, 'stamp:nice');
        this.pendingFx.push({ type: 'confetti', count: 30 });
        this.enter('collect');
        break;
      case 'collect':
        this.enter('home');
        break;
      case 'home':
        this.pendingFx.push({ type: 'confetti', count: 40 });
        this.enter('earn');
        break;
      case 'earn':
        this.enter(this.shopDone ? (this.waveDone ? 'ready' : 'wave') : 'shop');
        break;
      default:
        break;
    }
  }

  /** Pays a step's Voyage reward once (records voyageRewardKey so Progression never pays it again). */
  private grantFor(step: FtueStepId): void {
    const state = this.state;
    const def = STEPS[step];
    if (!state || def.voyage === null || def.reward === null) return;
    const key = voyageRewardKey(def.voyage);
    if (state.ftue.rewarded.includes(key)) return;
    state.ftue.rewarded.push(key);
    const reward: Reward = def.reward === 'min2' ? { cash: minutes(state, 2) } : { ...def.reward };
    this.cmds.push({ type: 'grant', reward, source: `ftue:${step}`, from: def.rewardFrom });
  }

  private spawnIsland1(): void {
    const sim = this.sim;
    if (!sim) return;
    const island = sim.course.islands.find((i) => i.order === 1);
    if (!island || island.spawnPoints.length === 0) return;
    // The point nearest the gap-1 landing (the island's home-facing edge) gets a Toastopus.
    const land = this.v1.set((island.solid.min.x + island.solid.max.x) / 2, island.solid.max.y, island.solid.max.z - 3);
    let best = 0;
    island.spawnPoints.forEach((p, i) => {
      if (p.distanceToSquared(land) < island.spawnPoints[best].distanceToSquared(land)) best = i;
    });
    island.spawnPoints.forEach((_, i) => {
      this.cmds.push(i === best ? { type: 'forceSpawn', islandOrder: 1, point: i, speciesId: 'toastopus' } : { type: 'forceSpawn', islandOrder: 1, point: i });
    });
  }

  private spawnNearPad(): void {
    const sim = this.sim;
    if (!sim) return;
    const lh = sim.course.lighthouses.find((l) => l.zone === 0);
    if (!lh) return;
    const pc = this.v1.set((lh.pad.min.x + lh.pad.max.x) / 2, lh.pad.min.y, (lh.pad.min.z + lh.pad.max.z) / 2);
    const island = sim.course.islands.find((i) => pc.z >= i.solid.min.z && pc.z <= i.solid.max.z && i.zone === 0);
    if (!island || !island.spawnPoints.length) return;
    let best = 0;
    island.spawnPoints.forEach((p, i) => {
      if (p.distanceToSquared(pc) < island.spawnPoints[best].distanceToSquared(pc)) best = i;
    });
    this.cmds.push({ type: 'forceSpawn', islandOrder: island.order, point: best });
  }

  private carryGoal(): number {
    return Math.min(2, this.state?.carryCapacity ?? 2);
  }

  private banner(line: Line, hue: BannerSpec['hue'], ms: number): void {
    this.pendingFx.push({ type: 'banner', spec: { title: line.headline, sub: line.sub, hue, priority: 'tutorial', ms } });
    this.bannerUntil = Math.max(this.bannerUntil, this.now) + ms / 1000;
  }

  private setFail(line: Line, id: string): void {
    this.fail = { line, id, until: this.now + TIMING.failMs / 1000 };
  }

  private showStamp(text: string, id: string): void {
    this.stamp = { line: { headline: text }, id, until: this.now + TIMING.stampMs / 1000, stamp: text };
  }

  // ---------------------------------------------------------------- per frame

  update(realDt: number, sim: GameSim, state: GameState, settings: Settings): TutorialFrame {
    if (!this.state) this.start(state, sim);
    this.sim = sim;
    this.state = state;
    this.settings = settings;
    this.now += realDt;
    this.effects.length = 0;
    const simDt = Math.max(0, sim.time - this.lastSimTime);
    this.lastSimTime = sim.time;
    if (this.active) this.log.tick(realDt, simDt);

    if (this.active) this.tickStep(realDt, sim, state);
    this.updateWindow(realDt, sim);

    for (const fx of this.pendingFx) this.effects.push(fx);
    this.pendingFx.length = 0;

    if (this.closeAt >= 0 && this.now >= this.closeAt) {
      this.closeAt = -1;
      if (this.panel) this.cmds.push({ type: 'closePanel' });
    }
    const commands = this.cmds;
    this.cmds = [];
    return this.buildFrame(sim, state, commands);
  }

  private tickStep(realDt: number, sim: GameSim, state: GameState): void {
    const p = sim.player;
    // Purchases made by any path (UI event or a hotkey the lead handled) complete the shop step.
    if (this.shopEligible() && this.boughtBaseline >= 0 && state.counters.upgradesBought > this.boughtBaseline) {
      this.onPurchase(this.lastBuyKey);
    }
    const inStep = this.now - this.stepStart;
    switch (this.step) {
      case 'grab': {
        if (!this.moved && Math.hypot(p.pos.x - this.startPos.x, p.pos.z - this.startPos.z) > 0.6) this.moved = true;
        const nearEdge = sim.isOnHome() && p.pos.z < HOME_FRONT_Z + 3;
        this.edgeIdle = nearEdge ? this.edgeIdle + realDt : 0;
        if (this.edgeIdle * 1000 >= TIMING.grabEdgeIdleMs) this.log.hint('edgeIdle');
        if (!this.moved && inStep * 1000 >= TIMING.grabNoMoveMs) this.log.hint('noMove');
        break;
      }
      case 'collect': {
        if (state.carried.length >= this.carryGoal()) this.complete('collect');
        else if (state.carried.length > 0 && this.firstCollectAt >= 0 && (this.now - this.firstCollectAt) * 1000 >= TIMING.collectAutoAfterFirstMs) {
          this.complete('collect');
        }
        else if (!this.nudged && (this.now - this.lastProgressAt) * 1000 >= TIMING.collectStuckMs && p.mode === 'ground') {
          this.nudged = true;
          this.log.hint('collectStuck');
          const target = this.collectTarget(sim);
          if (target && !this.deps.reduceMotion()) this.pendingFx.push({ type: 'cameraNudge', toward: target.clone(), degrees: 15, ms: 600 });
        }
        break;
      }
      case 'home': {
        // Nothing left to deliver (a real wave took it after the practice wave ended): fetch more first.
        if (state.carried.length === 0 && sim.splashTime <= 0) {
          this.enter('collect');
          break;
        }
        const d = this.homeDistance(sim, state);
        if (d < this.homeBest - 0.5) {
          this.homeBest = d;
          this.homeBestAt = this.now;
        } else if ((this.now - this.homeBestAt) * 1000 >= TIMING.homeStuckMs) {
          this.homeBestAt = this.now;
          this.homeRepop++;
          this.log.hint('homeStuck');
        }
        break;
      }
      case 'earn':
        if (inStep * 1000 >= TIMING.earnBannerMs) this.complete('earn');
        break;
      case 'shop':
        if (state.isMaxed('reach')) {
          // Replay with a maxed rope: the step teaches buying Rope Reach and could never complete.
          this.shopDone = true;
          this.enter(this.waveDone ? 'ready' : 'wave');
          break;
        }
        if (inStep * 1000 >= TIMING.shopSpotlightMs && this.panel !== 'shop') this.log.hint('shopSpotlight');
        break;
      case 'ready':
        if (this.now >= this.bannerUntil && (this.controlsClosed || this.now >= this.controlsUntil)) this.finish(false);
        break;
      default:
        break;
    }
  }

  // ---------------------------------------------------------------- §7.3 release timing assist

  private support(): SwingSupport {
    if (this.struggleLeft > 0 && this.grabbedSolid?.id === this.struggleSolid && (this.settings?.swingAssist ?? true)) {
      return STRUGGLE.support;
    }
    if (this.active) return SWING_SUPPORT[this.completedSwings] ?? NO_SUPPORT;
    return NO_SUPPORT;
  }

  private updateWindow(realDt: number, sim: GameSim): void {
    const p = sim.player;
    const support = this.support();
    const swinging = p.mode === 'swing' && !!p.anchor;
    const evaluate = swinging && (support.arc || support.scale < 1 || (this.active && this.step === 'release'));
    if (!evaluate) {
      this.inWindow = false;
      this.arcValid = false;
      this.windowAcc = 1;
    } else {
      this.windowAcc += realDt;
      if (this.windowAcc >= 1 / ASSIST.hz) {
        this.windowAcc = 0;
        this.evaluateWindow(sim, support);
      }
      // Pass counting and the AGAIN / PUMP failures (release step only).
      const th = sim.swingTheta;
      const sign = th > 2 ? 1 : th < -2 ? -1 : 0;
      if (sign !== 0) {
        if (this.lastSign !== 0 && sign !== this.lastSign) this.passes++;
        this.lastSign = sign;
      }
      if (this.active && this.step === 'release' && !this.windowEver && !this.pumpShown && this.passes >= 2) {
        this.pumpShown = true;
        this.setFail(this.isTouch() ? COPY.pumpTouch : COPY.pumpDesktop, 'fail:pump');
        this.fail!.glyph = this.isTouch() ? 'thumbPush' : 'keyW';
        this.log.hint('pump');
      }
    }

    // Time scale: ease in over 120 ms, hold at most 1200 ms real, out over 100 ms.
    if (this.inWindow) this.windowHeld += realDt;
    else this.windowHeld = 0;
    const target = this.inWindow && support.scale < 1 && this.windowHeld * 1000 < ASSIST.maxHoldMs ? support.scale : 1;
    if (this.scale > target) {
      this.scale = Math.max(target, this.scale - ((1 - target) / (ASSIST.easeInMs / 1000)) * realDt);
    } else if (this.scale < target) {
      this.scale = Math.min(target, this.scale + (0.75 / (ASSIST.easeOutMs / 1000)) * realDt);
    }
  }

  private evaluateWindow(sim: GameSim, support: SwingSupport): void {
    const p = sim.player;
    const g = p.groundSolid;
    const a = p.anchorPos(this.v1);
    let forward = false;
    if (a) {
      const cx = g ? (g.min.x + g.max.x) / 2 : p.pos.x;
      const cz = g ? (g.min.z + g.max.z) / 2 : p.pos.z + 1;
      forward = p.vel.x * (a.x - cx) + p.vel.z * (a.z - cz) > 0;
    }
    // Rising on the upswing: also past the bottom of the arc (θ > 5°), so the window never opens on the
    // run-up right after the grab (the jump is still carrying the player up toward the hook).
    const rising = p.vel.y > 0 && sim.swingTheta > 5;
    const pred = predictRelease(sim, ASSIST.arcPoints);
    const lands = pred.landsOn;
    const landOk = !!lands && lands !== g && (lands.kind !== 'tower');
    const was = this.inWindow;
    this.inWindow = forward && rising && landOk;
    if (this.inWindow) this.windowEver = true;
    if (support.arc) {
      for (let i = 0; i < ASSIST.arcPoints; i++) this.arcPts[i].copy(pred.points[Math.min(i, pred.points.length - 1)]);
      this.arcValid = true;
      this.arcOk = landOk;
    } else this.arcValid = false;
    if (was && !this.inWindow && this.active && this.step === 'release' && p.mode === 'swing') {
      this.setFail(COPY.again, 'fail:again');
      this.log.hint('again');
    }
  }

  // ---------------------------------------------------------------- frame building

  private isTouch(): boolean {
    return this.deps.device() === 'touch';
  }

  private buildFrame(sim: GameSim, state: GameState, commands: TutorialCommand[]): TutorialFrame {
    const support = this.support();
    const slowed = this.scale < 0.999;
    const guides: GuideSpec = { ...NO_GUIDES };
    if (this.arcValid) guides.landingArc = { points: this.arcPts, ok: this.arcOk };
    const base: TutorialFrame = {
      active: this.active,
      step: this.active ? this.step : null,
      timeScale: this.scale,
      guides,
      sim: { waveFrozen: false, practiceWave: false },
      hide: HIDE_NONE,
      jumpLabel: this.inWindow && support.pill ? 'LET GO' : null,
      edgeTarget: null,
      prompt: null,
      spotlight: null,
      focus: null,
      controlsCard: false,
      skipVisible: false,
      musicLowpass: slowed,
      vignette: slowed ? Math.min(1, (1 - this.scale) / 0.75) : 0,
      commands,
    };
    if (!this.active || !this.step) return base;

    const step = this.step;
    const def = STEPS[step];
    base.sim = { waveFrozen: def.waveFrozen, practiceWave: idx(step) >= idx('home') && !this.practiceOver };
    const hide = { ...def.hide };
    if (!state.ftue.rewarded.includes(voyageRewardKey(1)) && idx(step) < idx('home')) hide.cash = true;
    base.hide = hide;
    base.skipVisible = step !== 'ready';
    base.controlsCard = step === 'ready' && this.now >= this.bannerUntil && !this.controlsClosed;

    this.buildGuides(sim, state, base, guides);
    base.prompt = this.buildPrompt(sim, state, support);
    this.buildShopUi(sim, base);
    return base;
  }

  private buildPrompt(sim: GameSim, state: GameState, support: SwingSupport): PromptSpec | null {
    const step = this.step!;
    const touch = this.isTouch();
    const p = sim.player;
    if (this.now < this.bannerUntil) return null; // never a prompt and a banner together
    if (this.panel && !(step === 'shop' && this.panel === 'shop')) return null;
    if (this.stamp && this.now < this.stamp.until) {
      return { id: this.stamp.id, headline: this.stamp.line.headline, size: 'normal', fail: false, glyph: 'none', stamp: this.stamp.stamp };
    }
    if (this.inWindow && support.pill) {
      return { id: 'letGo', headline: COPY.letGo.headline, size: support.pill, fail: false, glyph: touch ? 'thumbHold' : 'spaceHold' };
    }
    if (this.fail && this.now < this.fail.until) {
      const f = this.fail;
      return { id: f.id, headline: f.line.headline, sub: f.line.sub, size: 'normal', fail: true, glyph: f.glyph ?? (f.id === 'fail:hold' || f.id === 'fail:jump' ? (touch ? 'thumbHold' : 'spaceHold') : 'none') };
    }
    if (this.now < this.splashUntil) {
      return { id: 'splash', headline: COPY.splash.headline, sub: COPY.splash.sub, size: 'normal', fail: false, glyph: 'none' };
    }
    const warn = sim.wave.phase !== 'calm' && idx(step) >= idx('home') && idx(step) <= idx('wave');
    if (warn) return this.warnPrompt(sim, state);

    switch (step) {
      case 'grab':
        return this.grabPrompt(sim);
      case 'release':
        if (p.mode === 'swing') {
          return { id: 'release:wait', headline: COPY.wait.headline, size: 'small', fail: false, glyph: 'none' };
        }
        if (p.mode === 'air' && this.releasedThisSwing) return null;
        return this.grabPrompt(sim);
      case 'collect': {
        const n = state.carried.length;
        if (n === 0) {
          const target = this.collectCreature(sim);
          const name = target ? getSpecies(target.speciesId).name : 'Toastopus';
          const line = COPY.collect(name);
          return { id: 'collect', headline: line.headline, sub: line.sub, size: 'normal', fail: false, glyph: 'none', portrait: target?.speciesId ?? 'toastopus' };
        }
        const line = COPY.collectMore(n, this.carryGoal());
        return { id: 'collect:more', headline: line.headline, size: 'normal', fail: false, glyph: 'none' };
      }
      case 'home': {
        const d = this.homeDistance(sim, state);
        return {
          id: this.homeRepop ? `home#${this.homeRepop}` : 'home',
          headline: COPY.home.headline,
          size: 'normal',
          fail: false,
          glyph: 'none',
          chip: { icon: 'home', text: COPY.meters(d) },
        };
      }
      case 'shop':
        if (this.panel === 'shop') return { id: 'shop:buy', headline: COPY.buyReach.headline, size: 'normal', fail: false, glyph: 'none' };
        return { id: 'shop:open', headline: COPY.openShop.headline, size: 'normal', fail: false, glyph: touch ? 'none' : 'keyU' };
      case 'wave':
        return { id: 'wave', headline: COPY.wave.headline, size: 'normal', fail: false, glyph: 'none' };
      default:
        return null;
    }
  }

  private grabPrompt(sim: GameSim): PromptSpec {
    const touch = this.isTouch();
    const line = touch ? COPY.grabTouch : COPY.grabDesktop;
    const inStep = (this.now - this.stepStart) * 1000;
    const noMove = !this.moved && inStep >= TIMING.grabNoMoveMs && sim.player.mode === 'ground';
    const big = this.edgeIdle * 1000 >= TIMING.grabEdgeIdleMs;
    return {
      id: 'grab',
      headline: line.headline,
      sub: line.sub,
      size: big ? 'big' : 'normal',
      fail: false,
      // No movement after 2 s: the WASD cluster / joystick ghost joins the glyph area (overlay draws both for id 'grab').
      glyph: noMove ? (touch ? 'thumbDrag' : 'wasd') : touch ? 'thumbHold' : 'spaceHold',
    };
  }

  private warnPrompt(sim: GameSim, state: GameState): PromptSpec {
    // Same test as the wave meter's YOU'RE SAFE, so the pill never says GET SAFE next to it.
    if (sim.playerSafe()) {
      return { id: 'wave:safe', headline: COPY.waveSafe.headline, sub: COPY.waveSafe.sub, size: 'normal', fail: false, glyph: 'none' };
    }
    const safe = this.safeTarget(sim, state);
    return {
      id: 'wave:warn',
      headline: COPY.waveWarn.headline,
      size: 'normal',
      fail: false,
      glyph: 'none',
      chip: safe ? { icon: safe.icon, text: safe.icon === 'home' ? COPY.etaHome(safe.eta) : COPY.etaPad(safe.eta) } : undefined,
    };
  }

  private buildShopUi(sim: GameSim, f: TutorialFrame): void {
    if (this.step !== 'shop' || this.shopDone) return;
    if (this.panel === 'shop') {
      f.spotlight = 'shop:buy:reach';
      const focus: HudFocus = { panel: 'shop', tab: 'upgrades', rowKey: 'reach', note: COPY.focusNote, sub: COPY.focusSub, dimOthers: true };
      f.focus = focus;
    } else if (!this.panel && (this.now - this.stepStart) * 1000 >= TIMING.shopSpotlightMs && sim.isOnHome() && this.now >= this.bannerUntil) {
      // Step 6 fallback: off home, the spotlight drops (the Shop tile's upgrade arrow stays).
      f.spotlight = 'rail:shop';
    }
  }

  private buildGuides(sim: GameSim, state: GameState, f: TutorialFrame, g: GuideSpec): void {
    const p = sim.player;
    const step = this.step!;
    const gap1 = sim.course.gaps[0]?.anchors[0];
    const swinging = p.mode === 'swing';
    switch (step) {
      case 'grab':
      case 'release': {
        if (swinging || !gap1) break;
        if (step === 'release' && p.mode === 'air' && this.releasedThisSwing) break;
        g.ring = { pos: this.v2.set(gap1.pos.x, HOME_TOP, HOME_FRONT_Z + 0.8), radius: 1.6, label: COPY.jumpHere };
        g.hookTag = { anchorId: gap1.id, text: COPY.hookTag };
        if (this.edgeIdle * 1000 >= TIMING.grabEdgeIdleMs) g.arrow = { pos: gap1.pos };
        break;
      }
      case 'collect': {
        const target = this.collectTarget(sim);
        if (!target || swinging) break;
        g.arrow = { pos: this.v2.copy(target).setY(target.y + 2.4) };
        g.trail = this.makeTrail([p.pos, target]);
        f.edgeTarget = { pos: target, icon: 'creature', label: COPY.meters(p.pos.distanceTo(target)) };
        break;
      }
      case 'home': {
        const ped = this.pedestalTarget(sim, state);
        g.arrow = { pos: this.v2.copy(ped).setY(ped.y + 2.2) };
        f.edgeTarget = { pos: ped, icon: 'home', label: COPY.meters(this.homeDistance(sim, state)) };
        if (swinging) break;
        if (sim.isOnHome() || !gap1) g.trail = this.makeTrail([p.pos, ped]);
        else {
          const isl = p.groundSolid;
          const edge = this.v3.set(isl ? (isl.min.x + isl.max.x) / 2 : p.pos.x, p.pos.y, isl ? isl.max.z - 0.5 : p.pos.z);
          g.trail = this.makeTrail([p.pos, edge, gap1.pos, this.edgePos.set(gap1.pos.x, HOME_TOP, HOME_FRONT_Z + 1), ped]);
        }
        break;
      }
      case 'wave': {
        const lh = sim.course.lighthouses.find((l) => l.zone === 0);
        if (sim.wave.phase === 'calm') {
          if (lh) {
            g.beam = this.v2.set((lh.platform.min.x + lh.platform.max.x) / 2, lh.platform.max.y, (lh.platform.min.z + lh.platform.max.z) / 2);
            g.ring = {
              pos: this.v3.set((lh.pad.min.x + lh.pad.max.x) / 2, lh.pad.max.y, (lh.pad.min.z + lh.pad.max.z) / 2),
              radius: 1.6,
              label: COPY.launch,
            };
          }
        } else if (!sim.playerSafe()) {
          const safe = this.safeTarget(sim, state);
          if (safe) {
            g.arrow = { pos: safe.pos };
            f.edgeTarget = { pos: safe.pos, icon: safe.icon, label: safe.icon === 'home' ? COPY.etaHome(safe.eta) : COPY.etaPad(safe.eta) };
          }
        }
        break;
      }
      default:
        break;
    }
  }

  private makeTrail(pts: Vector3[]): Vector3[] {
    const out: Vector3[] = [];
    pts.forEach((v, i) => out.push(this.trail[i].copy(v)));
    return out;
  }

  private collectCreature(sim: GameSim) {
    const p = sim.player.pos;
    let best = null as (typeof sim.wild)[number] | null;
    let bd = Infinity;
    for (const w of sim.wild) {
      if (w.island.order < 1 || w.island.order > 2) continue;
      const d = w.pos.distanceToSquared(p) + (w.speciesId === 'toastopus' ? 0 : 4);
      if (d < bd) {
        bd = d;
        best = w;
      }
    }
    return best;
  }

  private collectTarget(sim: GameSim): Vector3 | null {
    return this.collectCreature(sim)?.pos ?? null;
  }

  private pedestalTarget(sim: GameSim, state: GameState): Vector3 {
    const peds = sim.course.pedestals;
    let i = state.base.findIndex((c) => !c);
    if (i < 0 || i >= peds.length) i = 0;
    return peds[i];
  }

  private homeDistance(sim: GameSim, state: GameState): number {
    const ped = this.pedestalTarget(sim, state);
    const p = sim.player.pos;
    return Math.hypot(ped.x - p.x, ped.z - p.z);
  }

  /** The nearer safe spot during a warning: home, or a lighthouse pad (§7.2 step 7). */
  private safeTarget(sim: GameSim, state: GameState): { pos: Vector3; icon: IconId; eta: number } | null {
    const p = sim.player.pos;
    const speed = Math.max(1, state.stats.runSpeed);
    const homeD = p.z > HOME_FRONT_Z ? 0 : HOME_FRONT_Z + 2 - p.z;
    let best: { pos: Vector3; icon: IconId; eta: number } = {
      pos: this.edgePos.set(p.x, HOME_TOP, HOME_FRONT_Z + 2),
      icon: 'home',
      eta: homeD / speed,
    };
    for (const lh of sim.course.lighthouses) {
      const c = lh.pad;
      const cx = (c.min.x + c.max.x) / 2;
      const cz = (c.min.z + c.max.z) / 2;
      if (Math.abs(cz - p.z) > 40) continue;
      const eta = Math.hypot(cx - p.x, cz - p.z) / speed;
      if (eta < best.eta) best = { pos: this.v3.set(cx, c.max.y, cz), icon: 'lighthouse', eta };
    }
    return best;
  }
}
