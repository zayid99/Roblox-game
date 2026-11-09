// The lead integration (spec §10.7): owns the frame loop and wires the v2 modules together.
// Sim and progression (src/game), HUD (src/ui), input, graphics (src/render), audio,
// tutorial (src/tutorial) and the CrazyGames platform. Every module talks through src/contracts.ts.
import { Vector3 } from 'three';
import { AudioDirector } from './audio/director';
import type {
  PanelData, PanelKind, PanelTab, Reward, ScreenPt, SimEvent, ToastSpec, TrackerView, TutorialCommand, UiActions,
} from './contracts';
import { TimeScale } from './core/timeScale';
import { buildAudioFrame, buildHudView, buildRenderFrame, lastReticle } from './core/views';
import { weekKey } from './game/clock';
import { HOME_FRONT_Z, HOME_TOP, WAVE } from './game/config';
import { creatureIncome, getSpecies, RARITIES, SPECIES, type CreatureRef } from './game/creatures';
import { formatCash, formatIncome, type UpgradeKey } from './game/economy';
import { featuredSpeciesFor } from './game/featured';
import type { PlayerInput } from './game/player';
import { Progression, type ProgressEvent } from './game/progression';
import { VOYAGE, VOYAGE_LENGTH } from './game/quests';
import { applyReward } from './game/rewards';
import { buildShopView } from './game/shopView';
import { activeBuddy, buildHatcheryView, buddyBonus, hatchEgg, inHatcheryZone, setBuddy } from './game/hatchery';
import { Rng } from './game/rng';
import { GameSim } from './game/sim';
import { GameState } from './game/state';
import { Input } from './input/input';
import { Platform } from './platform/crazygames';
import { GameRenderer } from './render/gameRenderer';
import { TutorialCore } from './tutorial/core';
import { Hints } from './tutorial/hints';
import { TutorialOverlay } from './tutorial/overlay';
import { Hud, icon, type HudDeps } from './ui/hud';
import { pickLayout } from './ui/layout';

const SAVE_KEY = 'swing-or-splash-save';
const FIXED_DT = 1 / 120;
const MAX_STEPS = 12;
const SAVE_EVERY = 5;
const AD_GAP_MS = 3 * 60 * 1000;
const PARAMS = new URLSearchParams(location.search);
const DEBUG = import.meta.env.DEV || PARAMS.has('debug');

const tmpV = new Vector3();

/** A short label for a reward ("$1.2K", "+20 Pearls", "Lucky Tide"). */
function rewardText(r: Reward): string {
  const parts: string[] = [];
  if (r.cash) parts.push(formatCash(r.cash));
  if (r.pearls) parts.push(`${r.pearls} Pearls`);
  if (r.luckyTide) parts.push(r.luckyTide > 1 ? `${r.luckyTide} Lucky Tides` : 'Lucky Tide');
  if (r.creature) parts.push('Mystery Creature');
  if (r.cosmetic) parts.push('a new rope');
  return parts.join(' + ');
}

export class Game {
  readonly state = new GameState();
  sim!: GameSim;
  progression!: Progression;
  readonly timeScale = new TimeScale();
  readonly audio = new AudioDirector();
  readonly platform = new Platform();
  gfx!: GameRenderer;
  hud!: Hud;
  input!: Input;
  tutorial!: TutorialCore;
  private overlay!: TutorialOverlay;
  private hints!: Hints;


  private accumulator = 0;
  private lastFrame = 0;
  private time = 0;
  private renderDt = 0;
  private renderSimDt = 0;
  private saveTimer = 0;
  private firstFrame = true;
  private paused = false;
  private gestured = false;
  private resumeShown = false;
  private adPlaying = false;
  /** An ad was requested and has not finished: the game stays paused (gameplayStop) until it does. */
  private adPending = false;
  private hiddenAt = 0;
  private lastAdAt = 0;
  private lastCountdown = 0;
  private keepOfferedWave = -1;
  private appliedQuality = '';
  private prefersReduced = false;
  private prevPanel: PanelKind | null = null;
  private prevTab: PanelTab | undefined;
  /** Completed Voyage rows, each held for 1.6 s in turn so every check and coin fly plays. */
  private doneRow: { view: TrackerView; until: number } | null = null;
  private readonly doneQueue: TrackerView[] = [];
  private nudge: { left: number; perSec: number } | null = null;
  private pillUp = false;
  /** Hatchery: egg rolls, and whether the player is inside the stand's zone (it opens once per visit). */
  private readonly hatchRng = new Rng((Math.random() * 0x100000000) >>> 0);
  private atHatchery = false;
  /** Set by the sim's 'shopZone' event: the player walked into the Shop stall (opens the Shop). */
  private shopWalkUp = false;
  /** A jump press waiting for the next fixed step (frames can run zero steps: high refresh, slow-mo). */
  private jumpLatch = false;
  /** Cash paid for a hidden-tab absence, toasted once the player is back in the game. */
  private awayCash = 0;
  /** Render interpolation: player position and wave front before the last fixed step. */
  private readonly prevPos = new Vector3();
  private prevFront = 0;
  private hasPrev = false;
  private readonly curPos = new Vector3();

  /** Movement is camera-relative, but while a direction is held we keep the camera angle from when it
   *  was pressed, so the camera can swing behind the player without bending the run (v0.1 behaviour). */
  private inputYaw = 0;
  private heldAngle: number | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly uiRoot: HTMLElement,
    private readonly progress: (f: number) => void = () => {},
  ) {}

  // ================================================================ boot

  async start(): Promise<void> {
    await this.platform.init();
    this.platform.loadingStart();
    this.progress(0.2);
    this.loadSave();
    // The first batch of creatures already weighs and flags this week's Featured Creature.
    this.sim = new GameSim(this.state, { featuredSpecies: featuredSpeciesFor(weekKey(Date.now())) });
    this.progression = new Progression(this.state);
    this.prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

    this.gfx = new GameRenderer(this.canvas, { requestTimeScale: this.timeScale.request });
    this.resize();
    this.progress(0.35);
    await this.gfx.init(this.sim.course, this.state.settings.quality, this.state.settings.autoTier);
    this.appliedQuality = this.state.settings.quality;
    this.progress(0.85);

    this.hud = new Hud(this.uiRoot, this.hudDeps());
    this.hud.setCourseLayout(this.courseLayout());
    this.input = new Input(this.canvas, this.hud.joyBase, this.hud.joyKnob);
    this.input.bindJumpButton(this.hud.jumpButton);
    this.input.onFirstGesture = () => this.onFirstGesture();
    this.input.onKey = (e) => this.onKey(e.code, e.key);
    this.input.onTap = (p) => this.onTap(p);
    this.input.setMouseLook(this.state.settings.mouseLook);

    const device = () => this.input.lastDevice;
    const reduce = () => this.reduceMotion;
    this.tutorial = new TutorialCore({
      reduceMotion: reduce,
      device,
      lastLookAt: () => this.input.lastLookAt,
      storage: DEBUG ? safeStorage() : null,
    });
    this.overlay = new TutorialOverlay({
      root: this.uiRoot,
      anchor: (id) => this.hud.anchor(id),
      anchorPoint: (id) => this.anchorPoint(id),
      sound: (id) => this.audio.play(id),
      onSkip: () => this.tutorial.skip(),
      onControlsClosed: () => this.tutorial.onUi({ type: 'controlsClosed' }),
      icon: (id, size) => icon(id, size),
      portrait: (id, size) => this.portraitEl(id, size),
      bannerUp: () => !!this.uiRoot.querySelector('.hud-root.banner-up'),
      reduceMotion: reduce,
      device,
      hotkeyOn: (k) => this.hud.hotkeyOn(k),
    });
    this.hints = new Hints({
      toast: (t) => this.hud.toast(t),
      seen: (id) => this.progression.hintSeen(id),
      markSeen: (id) => this.progression.markHintSeen(id),
      openShop: (tab) => this.openPanel('shop', tab),
      device,
    });

    this.platform.onMuteChange = () => this.applySettings();
    this.applySettings();

    // Every session spawns at the FTUE spawn facing the gap-1 hook (§7.2), with the cold open.
    this.respawnAtFtue();
    this.tutorial.start(this.state, this.sim);
    if (this.tutorial.active) this.gfx.portraits.request({ speciesId: 'toastopus', mutation: 0 });

    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => this.onVisibility());
    window.addEventListener('pagehide', () => this.save());
    // Audio unlock (§8.4). Browsers only resume an AudioContext inside a user activation, and a touch
    // pointerdown is not one (touchend / pointerup / click are). Every later gesture retries until the
    // context runs, and UI buttons that stop propagation still count (capture phase on window).
    for (const type of ['pointerup', 'touchend', 'click', 'keydown'] as const) {
      window.addEventListener(type, (e) => this.onUserGesture(e), { capture: true, passive: true });
    }

    if (this.progression.shouldShowWelcome()) this.openPanel('welcome');
    else {
      const gifts = this.progression.claimPendingGifts();
      if (gifts) this.hud.toast({ text: `Gifts from yesterday: ${rewardText(gifts)}`, kind: 'good', icon: 'gift' });
    }

    if (DEBUG) (window as unknown as { __game: Game }).__game = this;
    this.lastAdAt = performance.now();
    this.lastFrame = performance.now();
    this.frame(this.lastFrame);
    this.progress(1);
    this.platform.loadingStop();
  }

  private get reduceMotion(): boolean {
    return this.state.settings.reduceMotion || this.prefersReduced;
  }

  /** A portrait <img> that fills in once the portrait factory has rendered it (pumped by gfx.render). */
  private portraitEl(speciesId: string, size: number): HTMLElement {
    const c = { speciesId, mutation: 0 };
    const img = document.createElement('img');
    img.width = img.height = size;
    img.alt = '';
    img.draggable = false;
    const fill = (): boolean => {
      const src = this.gfx.portraits.get(c);
      if (src) img.src = src;
      return !!src;
    };
    if (!fill()) {
      this.gfx.portraits.request(c);
      const timer = window.setInterval(() => {
        if (fill() || !img.isConnected) window.clearInterval(timer);
      }, 100);
    }
    return img;
  }

  private courseLayout(): { zones: number[]; lighthouses: number[] } {
    const sim = this.sim;
    const total = HOME_FRONT_Z - sim.course.endZ;
    let prev = HOME_FRONT_Z;
    const zones = sim.course.zones.map((z) => {
      const w = (prev - z.endZ) / total;
      prev = z.endZ;
      return w;
    });
    const lighthouses = sim.course.lighthouses.map((l) => (HOME_FRONT_Z - (l.tower.min.z + l.tower.max.z) / 2) / total);
    return { zones, lighthouses };
  }

  private respawnAtFtue(): void {
    const sim = this.sim;
    const spawn = sim.course.ftueSpawn;
    sim.player.reset(spawn);
    sim.checkpoint.copy(spawn);
    const hook = sim.course.gaps[0]?.anchors[0];
    if (hook) this.gfx.snapBehind(hook.pos.x - spawn.x, hook.pos.z - spawn.z);
    else this.gfx.snapBehind(0, -1);
    this.heldAngle = null;
    this.inputYaw = this.gfx.cameraYaw();
  }

  // ================================================================ save

  private loadSave(): void {
    const raws = [this.platform.getItem(SAVE_KEY)];
    if (this.platform.hasDataModule) raws.push(safeStorage()?.getItem(SAVE_KEY) ?? null);
    let best: { savedAt?: unknown } | null = null;
    for (const raw of raws) {
      if (!raw) continue;
      try {
        const d = JSON.parse(raw) as { savedAt?: unknown };
        const at = typeof d?.savedAt === 'number' ? d.savedAt : 0;
        const bestAt = best && typeof best.savedAt === 'number' ? best.savedAt : -1;
        if (at > bestAt) best = d;
      } catch {
        console.warn('Save data was unreadable; starting fresh.');
      }
    }
    if (best && !this.state.load(best)) console.warn('Save data had an unknown version; starting fresh.');
  }

  save(): void {
    if (!this.sim) return;
    const tier = this.gfx?.pendingAutoTier();
    if (tier) this.state.settings.autoTier = tier;
    const json = JSON.stringify(this.state.toSave());
    this.platform.setItem(SAVE_KEY, json);
    // Mirror to localStorage so a failed SDK init never loses progress (§9.8).
    if (this.platform.hasDataModule) {
      try {
        window.localStorage.setItem(SAVE_KEY, json);
      } catch {
        /* storage blocked */
      }
    }
  }

  // ================================================================ settings, platform, visibility

  private applySettings(): void {
    const s = this.state.settings;
    const platformMuted = this.platform.platformMuted;
    this.audio.setVolumes(s.music, s.sound);
    this.audio.setUserMuted(s.muted);
    this.audio.setPlatformMuted(platformMuted);
    this.hud.setMuted(s.muted || platformMuted);
    this.input.setCameraPrefs(s.camSens, s.invertY);
    this.input.setMouseLook(s.mouseLook);
    this.hud.setReduceMotion(this.reduceMotion);
    this.gfx.setReduceMotion(this.reduceMotion);
    if (s.quality !== this.appliedQuality) {
      this.appliedQuality = s.quality;
      this.gfx.setQuality(s.quality);
    }
  }

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.gfx.resize(w, h, pickLayout(w, h));
  }

  private onFirstGesture(): void {
    this.audio.unlock();
    if (this.gestured) return;
    this.gestured = true;
    if (!this.paused) this.platform.gameplayStart();
  }

  /** Any trusted gesture anywhere on the page: (re)try the audio unlock until the context runs. */
  private onUserGesture(e: Event): void {
    if (!e.isTrusted || !this.hud) return;
    if (!this.audio.unlocked || this.audio.needsGesture) this.audio.unlock();
    if (!this.gestured) {
      this.gestured = true;
      if (!this.paused) this.platform.gameplayStart();
    }
  }

  private onVisibility(): void {
    if (document.hidden) {
      this.hiddenAt = performance.now();
      this.audio.setHidden(true);
      this.platform.gameplayStop();
      // Time in a background tab counts as offline time; saved now so closing the hidden tab keeps it.
      this.progression.markAway();
      this.save();
      return;
    }
    this.audio.setHidden(false);
    const away = performance.now() - this.hiddenAt;
    this.lastFrame = performance.now();
    const cash = this.progression.creditAway();
    // Short blips pay silently; a real absence gets a toast once the player is back in the game.
    if (cash >= 1 && away >= 60_000) this.awayCash += cash;
    if (this.gestured && (away > 1000 || this.audio.needsGesture)) this.showResume();
    else {
      if (!this.paused && this.gestured) this.platform.gameplayStart();
      this.toastAwayCash();
    }
  }

  private toastAwayCash(): void {
    if (this.awayCash < 1) return;
    this.hud.toast({ text: `Earned while away: ${formatCash(this.awayCash)}`, kind: 'good', icon: 'cash' });
    this.awayCash = 0;
  }

  private showResume(): void {
    if (this.resumeShown) return;
    this.resumeShown = true;
    this.syncPause();
    this.hud.showResume(() => {
      this.resumeShown = false;
      this.audio.unlock();
      this.gestured = true;
      this.syncPause();
      this.toastAwayCash();
    });
  }

  /** Pause = panel open, resume overlay, ad, or hidden tab. Only the sim stops (§10.7). */
  private syncPause(): void {
    const paused = this.hud.openPanelKind !== null || this.resumeShown || this.adPlaying || this.adPending || document.hidden;
    this.input.setEnabled(!paused);
    if (paused === this.paused) return;
    this.paused = paused;
    if (paused) {
      this.platform.gameplayStop();
      this.save();
    } else {
      this.accumulator = 0;
      if (this.gestured) this.platform.gameplayStart();
    }
  }

  /**
   * Requests an ad. The game pauses (gameplayStop) from the request until the ad is done, so a
   * panel that closes to start the ad (Welcome x2) never resumes play in between. Only one ad at a
   * time: a second request while one is in flight is answered "not rewarded" right away. If the SDK
   * neither starts nor finishes the ad within 10 s, play resumes without it.
   */
  private runAd(type: 'midgame' | 'rewarded', done: (rewarded: boolean) => void): void {
    if (!this.platform.hasSdk || this.adPending || this.adPlaying) {
      done(false);
      return;
    }
    this.lastAdAt = performance.now();
    this.adPending = true;
    this.syncPause();
    let settled = false;
    const finish = (rewarded: boolean) => {
      if (settled) return;
      settled = true;
      this.adPending = false;
      this.syncPause();
      done(rewarded);
    };
    const guard = window.setTimeout(() => {
      if (!this.adPlaying) finish(false);
    }, 10_000);
    this.platform.requestAd(type, {
      onStart: () => {
        window.clearTimeout(guard);
        this.adPlaying = true;
        this.audio.setAdPlaying(true);
        this.syncPause();
      },
      onDone: (rewarded) => {
        window.clearTimeout(guard);
        const wasPlaying = this.adPlaying;
        this.adPlaying = false;
        this.audio.setAdPlaying(false);
        if (wasPlaying) this.showResume();
        finish(rewarded);
      },
    });
  }

  // ================================================================ HUD deps, panel data, actions

  private hudDeps(): HudDeps {
    return {
      portraits: {
        get: (c) => this.gfx.portraits.get(c),
        request: (c) => this.gfx.portraits.request(c),
      },
      data: this.panelData(),
      actions: this.uiActions(),
      sound: (id, i) => this.audio.play(id, i !== undefined ? { i } : undefined),
      voice: (id) => this.audio.voice(id, 'tap'),
      requestTimeScale: this.timeScale.request,
      coach: {
        seen: (id) => this.progression.hintSeen(id),
        markSeen: (id) => this.progression.markHintSeen(id),
      },
    };
  }

  private panelData(): PanelData {
    return {
      shop: () => buildShopView(this.state),
      index: () => this.progression.index(),
      free: () => this.progression.free(),
      locker: () => this.progression.locker(),
      settings: () => ({ ...this.state.settings, platformMuted: this.platform.platformMuted, autoTier: this.gfx.tier }),
      welcome: () => {
        const v = this.progression.welcome();
        return { ...v, canDouble: v.canDouble && this.platform.hasSdk };
      },
      hatchery: () => buildHatcheryView(this.state),
    };
  }

  private uiActions(): UiActions {
    const state = this.state;
    return {
      buyUpgrade: (key: UpgradeKey, n) => {
        const bought = state.buyMany(key, n);
        if (bought <= 0) {
          this.audio.play('ui.denied');
          return false;
        }
        this.audio.play(state.isMaxed(key) ? 'maxed' : 'buy');
        this.tutorial.onUi({ type: 'buy', key });
        this.save();
        return true;
      },
      rebirth: () => {
        if (!state.rebirth()) {
          this.audio.play('ui.denied');
          return;
        }
        this.audio.play('rebirth');
        this.platform.happytime();
        this.sim.player.reset(this.sim.course.homeSpawn);
        this.sim.checkpoint.copy(this.sim.course.homeSpawn);
        this.save();
      },
      claimDaily: () => {
        const r = this.progression.claimDaily();
        if (!r) {
          this.audio.play('ui.denied');
          return;
        }
        // The FREE panel's CLAIM shows the "Tomorrow:" teaser itself (with the reward's icon).
        this.audio.play('claim');
        this.save();
      },
      claimGift: (i) => {
        if (this.progression.claimGift(i)) this.audio.play('claim');
        else this.audio.play('ui.denied');
        this.save();
      },
      useLuckyTide: () => {
        if (this.progression.useLuckyTide(this.sim)) {
          this.audio.play('claim');
          this.hud.toast({ text: 'The next wave is Golden', kind: 'good', icon: 'lucky-tide' });
          this.save();
        } else this.audio.play('ui.denied');
      },
      buyCosmetic: (id) => {
        if (this.progression.buyCosmetic(id)) {
          this.audio.play('buy');
          this.save();
        } else this.audio.play('ui.denied');
      },
      equipCosmetic: (id) => {
        if (this.progression.equipCosmetic(id)) this.save();
      },
      setSettings: (patch) => {
        Object.assign(state.settings, patch);
        this.applySettings();
        this.save();
      },
      replayTutorial: () => {
        this.tutorial.replay();
        this.save();
      },
      collectWelcome: (double) => {
        if (!double || !this.platform.hasSdk) {
          this.progression.collectWelcome(false);
          this.audio.play('claim');
          this.save();
          return;
        }
        const amount = this.progression.offline;
        this.runAd('rewarded', (rewarded) => {
          this.progression.collectWelcome(rewarded);
          this.audio.play('claim');
          const from = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
          if (amount >= 1) void this.hud.coinFly(from, amount * (rewarded ? 2 : 1), 'cash', 12);
          this.save();
        });
      },
      toggleMute: () => this.toggleMute(),
      skipTutorial: () => this.tutorial.skip(),
      panelChanged: (kind, tab) => this.panelChanged(kind, tab),
      hatchEgg: (zone) => this.hatch(zone),
      setBuddy: (c) => {
        if (!setBuddy(state, c)) return;
        this.audio.play(c ? 'claim' : 'ui.close');
        if (c) this.hud.toast({ text: `Buddy: +${Math.round(buddyBonus(c) * 100)}% delivery cash`, kind: 'good', icon: 'buddy' });
        this.save();
      },
    };
  }

  /** Hatchery: buy and hatch an egg (the panel plays the wobble, crack and reveal). */
  private hatch(zone: number): ReturnType<UiActions['hatchEgg']> {
    const out = hatchEgg(this.state, zone, this.hatchRng, this.sim.featuredSpecies);
    if (typeof out === 'string') {
      this.audio.play('ui.denied');
      return null;
    }
    this.audio.play('buy');
    const rarity = getSpecies(out.ref.speciesId).rarity;
    const pearls = out.pearls ?? 0;
    // The reveal card opens after the panel's wobble and crack (panels/hatchery.ts timings).
    window.setTimeout(() => {
      // The reveal only plays if the Hatchery is still open (closing it mid-hatch skips the card).
      if (this.hud.openPanelKind === 'hatchery') this.audio.play('reveal', { rarity });
      // hatchEgg already paid the first-discovery Pearls; say so with the reveal.
      if (pearls > 0) this.hud.toast({ text: `New species: +${pearls} Pearls`, kind: 'good', icon: 'pearl' });
    }, this.reduceMotion ? 630 : 2170);
    if (out.isNewSpecies && rarity >= 4) this.platform.happytime();
    this.save();
    return out;
  }

  private toggleMute(): void {
    this.state.settings.muted = !this.state.settings.muted;
    this.audio.unlock();
    this.applySettings();
    this.save();
  }

  private panelChanged(kind: PanelKind | null, tab?: PanelTab): void {
    if (this.prevPanel === 'index' && kind !== 'index') this.progression.markIndexSeen();
    if (this.prevPanel === 'shop' && this.prevTab === 'locker' && (kind !== 'shop' || tab !== 'locker')) this.progression.markLockerSeen();
    this.prevPanel = kind;
    this.prevTab = tab;
    this.tutorial.onUi({ type: 'panel', kind, tab });
    this.syncPause();
  }

  private openPanel(kind: PanelKind, tab?: PanelTab): void {
    // Opening another panel would destroy the Welcome Back card without collecting it (toast taps,
    // walk-ups, hints). The card closes only through CLAIM, ×2 or Esc.
    if (this.hud.openPanelKind === 'welcome' && kind !== 'welcome') return;
    this.hud.openPanel(kind, tab);
    this.syncPause();
  }

  // ================================================================ input

  private onKey(code: string, key: string): void {
    const k = key.toLowerCase();
    const open = this.hud.openPanelKind;
    const rail = this.progression.railState(this.state.cash, this.sim.isOnHome());
    const toggle = (kind: PanelKind, tab?: PanelTab) => {
      if (open === kind && (!tab || this.hud.openPanelTab === tab)) this.hud.closePanel();
      else if (open === 'welcome') return;
      else this.openPanel(kind, tab);
    };
    if (code === 'Escape') {
      if (open === 'welcome') {
        this.uiActions().collectWelcome(false);
        this.hud.closePanel();
      } else if (open) this.hud.closePanel();
    } else if (k === 'u') {
      if (rail.shop.visible) toggle('shop', open === 'shop' ? undefined : 'upgrades');
    } else if (k === 'g') {
      if (rail.free.visible) toggle('free');
    } else if (k === 'i') {
      if (rail.index.visible) toggle('index');
    } else if (k === 'l') {
      if (rail.shop.visible && buildShopView(this.state).lockerUnlocked) toggle('shop', 'locker');
    } else if (k === 'h') {
      if (rail.hatchery.visible) toggle('hatchery', open === 'hatchery' ? undefined : 'eggs');
    } else if (k === 'p') {
      toggle('settings');
    } else if (k === 'm') {
      this.toggleMute();
    } else if (DEBUG && code === 'F2') {
      this.state.earn(Math.max(1000, this.state.cash));
    } else if (DEBUG && code === 'F3') {
      // Calm: skip to the warning (horn, banner, countdown). Warning: start the surge now.
      const w = this.sim.wave;
      if (w.phase === 'calm') w.setTimer(WAVE.warning + 0.05);
      else w.forceSurge();
    }
  }

  private onTap(p: ScreenPt): void {
    if (this.paused) return;
    let hit = this.gfx.pick(p);
    if (!hit) return;
    const state = this.state;
    // Tapping your character opens the Locker on touch only (§9.5). With a mouse, clicks while looking
    // around (pointer lock picks the screen centre, where the character stands) must not open it,
    // and a pedestal under the cursor still gets picked.
    if (hit.kind === 'player' && this.input.lastDevice !== 'touch') {
      const i = this.pickPedestal(p);
      if (i < 0) return;
      hit = { kind: 'pedestal', index: i };
    }
    if (hit.kind === 'pedestal') {
      const c = state.base[hit.index];
      if (!c) return;
      this.gfx.tapPedestal(hit.index);
      this.audio.voice(c.speciesId, 'tap');
      const buddy = activeBuddy(state);
      // Offer it as the Buddy when that would raise the delivery bonus.
      if (state.ftue.done && (!buddy || buddyBonus(c) > buddyBonus(buddy))) {
        const ref = { ...c };
        this.hud.toast({
          text: `${getSpecies(c.speciesId).name} as Buddy: +${Math.round(buddyBonus(c) * 100)}% delivery cash`, kind: 'info', icon: 'buddy',
          action: { label: 'BUDDY', icon: 'buddy', onTap: () => this.uiActions().setBuddy(ref) },
        });
      }
    } else if (buildShopView(this.state).lockerUnlocked) {
      this.openPanel('shop', 'locker');
    }
  }

  /** The filled pedestal nearest to a screen point (the pedestal half of gfx.pick), or -1. */
  private pickPedestal(p: ScreenPt): number {
    const maxD = (60 * Math.min(window.innerWidth, window.innerHeight)) / 720;
    let best = -1;
    let bestD = maxD;
    for (let i = 0; i < this.state.base.length; i++) {
      if (!this.state.base[i]) continue;
      const s = this.gfx.pedestalScreen(i);
      if (!s) continue;
      const d = Math.hypot(s.x - p.x, s.y - p.y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  private updateInputYaw(): void {
    const x = this.input.moveX;
    const y = this.input.moveY;
    if (Math.hypot(x, y) < 0.15) {
      this.heldAngle = null;
      this.inputYaw = this.gfx.cameraYaw();
      return;
    }
    const angle = Math.atan2(x, y);
    const turned =
      this.heldAngle === null || Math.abs(Math.atan2(Math.sin(angle - this.heldAngle), Math.cos(angle - this.heldAngle))) > 0.5;
    if (turned || this.gfx.manualRecently(this.time)) {
      this.heldAngle = angle;
      this.inputYaw = this.gfx.cameraYaw();
    }
  }

  // ================================================================ frame (§10.7)

  private frame(now: number): void {
    requestAnimationFrame((t) => this.frame(t));
    const realDt = Math.min(0.1, Math.max(0, (now - this.lastFrame) / 1000));
    this.lastFrame = now;
    this.time += realDt;
    const sim = this.sim;
    const state = this.state;

    // 0. Pause state.
    this.syncPause();
    const paused = this.paused;

    // 1. Input and camera look.
    this.input.update();
    const look = this.input.consumeLook();
    this.hud.setMouseHint(
      this.input.touchMode || this.input.lastDevice === 'touch' || !state.settings.mouseLook ? 'off' : this.input.locked ? 'locked' : paused ? 'off' : 'free',
    );
    if (!paused) this.gfx.look(look.dx, look.dy, look.zoom, this.time);
    this.updateNudge(realDt);

    // 2. Tutorial.
    const tf = this.tutorial.update(realDt, sim, state, state.settings);
    for (const c of tf.commands) this.runCommand(c);
    sim.overrides = tf.sim;
    this.hud.setFocus(tf.focus);
    this.timeScale.request('tutorial', tf.timeScale, tf.timeScale < 1 ? 250 : 0);
    this.drainTutorialEffects();

    // 3. Time scale.
    const scale = this.timeScale.update(realDt);
    const simDt = paused ? 0 : realDt * scale;

    // 4. Fixed-step sim.
    if (!paused) {
      // Latch the press until a fixed step takes it: a frame can run zero steps (high refresh rate,
      // hit-stops, slow-mo), and the press would be lost.
      if (this.input.consumeJumpPressed()) this.jumpLatch = true;
      this.updateInputYaw();
      const fx = -Math.sin(this.inputYaw);
      const fz = -Math.cos(this.inputYaw);
      const rx = Math.cos(this.inputYaw);
      const rz = -Math.sin(this.inputYaw);
      const input: PlayerInput = {
        moveX: rx * this.input.moveX + fx * this.input.moveY,
        moveZ: rz * this.input.moveX + fz * this.input.moveY,
        jumpHeld: this.input.jumpHeld,
        jumpPressed: this.jumpLatch,
      };
      this.accumulator += simDt;
      let steps = 0;
      while (this.accumulator >= FIXED_DT && steps < MAX_STEPS) {
        this.prevPos.copy(sim.player.pos);
        this.prevFront = sim.wave.frontZ;
        this.hasPrev = true;
        sim.step(FIXED_DT, input);
        input.jumpPressed = false;
        this.jumpLatch = false;
        for (const e of sim.events) this.onSimEvent(e);
        this.accumulator -= FIXED_DT;
        steps++;
      }
      if (steps === MAX_STEPS) this.accumulator = 0;
      // Walking up to the Hatchery stand opens it once per visit. Only leaving the zone re-arms it,
      // so a hop inside the zone does not count as a new visit.
      const p = sim.player.pos;
      // Walk-ups only open panels at calm moments: not while carrying creatures home or with a wave coming.
      const calmWalkUp = state.carried.length === 0 && sim.wave.phase === 'calm';
      const inZone = state.ftue.done && !this.tutorial.active && inHatcheryZone(p.x, p.z) && p.y >= HOME_TOP - 0.5;
      if (!inZone) this.atHatchery = false;
      else if (!this.atHatchery && sim.isOnHome() && calmWalkUp) {
        this.atHatchery = true;
        this.openPanel('hatchery', 'eggs');
      }
      // Walking into the Shop stall opens the Shop (G8), once the Shop is unlocked. During the FTUE
      // only at its "open the Shop" step.
      if (this.shopWalkUp) {
        this.shopWalkUp = false;
        const shopOk =
          this.progression.railState(state.cash, true).shop.visible && (this.tutorial.active ? tf.step === 'shop' : calmWalkUp);
        if (shopOk && !this.paused && this.hud.openPanelKind === null) this.openPanel('shop', 'upgrades');
      }
    } else {
      this.input.consumeJumpPressed();
      this.jumpLatch = false;
      this.shopWalkUp = false;
    }

    // 5. Progression (every frame, also while paused) and hints.
    const active = !document.hidden && now - this.input.lastInputAt < 120_000;
    this.progression.update(realDt, { active, sim, ftueDone: state.ftue.done });
    for (const e of this.progression.events) this.onProgressEvent(e);
    const toastBusy = !!this.uiRoot.querySelector('.toasts .toast');
    const hintPrompt = this.hints.update(realDt, sim, state, {
      surge: sim.wave.phase === 'surge',
      toastBusy,
      lastLookAt: this.input.lastLookAt,
      ftueStep: tf.step,
    });
    this.countdown();

    // 6. Render.
    this.renderDt += realDt;
    this.renderSimDt += simDt;
    if (this.firstFrame || this.gfx.shouldRender(now)) {
      if (this.firstFrame) {
        this.firstFrame = false;
        this.gfx.playColdOpen();
      }
      // The sim runs at 120 Hz, so a frame can hold 0 to 3 steps. Draw the player (and the camera that
      // follows it) and the wave front between the last two steps, so motion stays smooth on any
      // refresh rate. The real state is put back right after the draw.
      const restore = this.interpolateForRender();
      try {
        this.gfx.render(
          buildRenderFrame({
            sim, state, realDt: this.renderDt, simDt: this.renderSimDt, time: this.time, tf, reduceMotion: this.reduceMotion,
            beatPhase: this.audio.beatPhase(),
          }),
        );
      } finally {
        if (restore) {
          sim.player.pos.copy(this.curPos);
          sim.wave.frontZ = restore.front;
        }
      }
      this.renderDt = 0;
      this.renderSimDt = 0;
    }

    // 7. HUD and tutorial overlay.
    const panelOpen = this.hud.openPanelKind !== null;
    const tracker = this.trackerView();
    this.hud.update(
      realDt,
      buildHudView({
        sim, state, progression: this.progression, gfx: this.gfx, tf, layout: this.hud.layout, touch: this.input.touchMode,
        panelOpen, keyboard: this.input.lastDevice !== 'touch' && !this.input.touchMode, homeArrow: this.hints.homeArrow,
        tracker, viewport: { w: window.innerWidth, h: window.innerHeight },
      }),
    );
    this.overlay.render(tf.prompt || !hintPrompt ? tf : { ...tf, prompt: hintPrompt }, realDt);
    const pillUp = !!this.uiRoot.querySelector('.tut-pill-wrap.is-on');
    if (pillUp !== this.pillUp) {
      this.pillUp = pillUp;
      this.uiRoot.querySelector('.hud-root')?.classList.toggle('objective-up', pillUp);
    }

    // 8. Audio. The music lowpass is for tutorial slow-mo and the big reveal only (§8), not for the short
    // hit-stops of pickups, fast grabs and Perfect releases.
    const slowmo = tf.musicLowpass || tf.timeScale < 1 || this.timeScale.isActive('reveal');
    this.audio.update(
      // Any pause (panel, resume card, ad) reads as a panel to the audio: the frozen sim must not keep stepping.
      buildAudioFrame({ sim, state, realDt, panelOpen: panelOpen || paused, slowmo, ftueStep: tf.step, lowTier: this.gfx.tier === 'low' }),
    );

    this.saveTimer += realDt;
    if (this.saveTimer >= SAVE_EVERY) {
      this.saveTimer = 0;
      this.save();
    }
  }

  /**
   * Render interpolation: moves the player and the wave front to where they were `accumulator` into
   * the current fixed step (between the last two steps). Returns the real wave front to restore (the
   * real position is in curPos), or null when nothing moved. Teleports and a new surge draw as is.
   */
  private interpolateForRender(): { front: number } | null {
    if (!this.hasPrev) return null;
    const alpha = Math.max(0, Math.min(1, this.accumulator / FIXED_DT));
    if (alpha >= 1) return null;
    const sim = this.sim;
    const pos = sim.player.pos;
    const front = sim.wave.frontZ;
    this.curPos.copy(pos);
    if (this.prevPos.distanceToSquared(pos) < 4) pos.lerpVectors(this.prevPos, this.curPos, alpha);
    if (Math.abs(front - this.prevFront) < 5) sim.wave.frontZ = this.prevFront + (front - this.prevFront) * alpha;
    return { front };
  }

  /** The Voyage tracker. Completed rows are held for 1.6 s each, in turn, so each plays its check and coin fly. */
  private trackerView(): TrackerView | null | undefined {
    if (this.doneRow && this.time < this.doneRow.until) return this.doneRow.view;
    this.doneRow = null;
    const next = this.doneQueue.shift();
    if (next) {
      this.doneRow = { view: next, until: this.time + 1.6 };
      return next;
    }
    return this.progression.tracker();
  }

  /** 3-2-1 centre countdown in the last seconds of the warning. */
  private countdown(): void {
    const w = this.sim.wave;
    if (w.phase !== 'warning' || w.frozen) {
      this.lastCountdown = 0;
      return;
    }
    const n = Math.ceil(w.timer);
    if (n >= 1 && n <= 3 && n !== this.lastCountdown) {
      this.lastCountdown = n;
      this.hud.countdown(n as 1 | 2 | 3);
    }
  }

  private updateNudge(realDt: number): void {
    const n = this.nudge;
    if (!n) return;
    const d = Math.min(realDt, n.left);
    n.left -= d;
    // CameraRig.rotate: yaw -= dx × 0.006.
    this.gfx.look((-n.perSec * d) / 0.006, 0, 0, this.time);
    if (n.left <= 0) this.nudge = null;
  }

  // ================================================================ tutorial plumbing

  private runCommand(c: TutorialCommand): void {
    const sim = this.sim;
    switch (c.type) {
      case 'setWaveTimer':
        if (c.mode === 'set') sim.wave.setTimer(c.seconds);
        else sim.wave.capTimer(c.seconds);
        break;
      case 'forceSpawn':
        sim.forceSpawn(c.islandOrder, c.point, c.speciesId, c.mutation);
        break;
      case 'grant': {
        applyReward(this.state, c.reward);
        const from = typeof c.from === 'string' ? this.anchorPoint(c.from) : (c.from ?? null);
        const at = from ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 };
        if (c.reward.cash) void this.hud.coinFly(at, c.reward.cash, 'cash');
        if (c.reward.pearls) void this.hud.coinFly(at, c.reward.pearls, 'pearl', 5);
        this.save();
        break;
      }
      case 'closePanel':
        this.hud.closePanel();
        break;
      case 'respawnFtue':
        this.respawnAtFtue();
        break;
    }
  }

  private drainTutorialEffects(): void {
    for (const fx of this.tutorial.effects) {
      switch (fx.type) {
        case 'banner':
          this.hud.banner(fx.spec);
          break;
        case 'confetti':
          this.hud.confetti('center', fx.count);
          break;
        case 'cameraNudge': {
          if (this.reduceMotion) break;
          const p = this.sim.player.pos;
          const want = Math.atan2(-(fx.toward.x - p.x), -(fx.toward.z - p.z));
          const yaw = this.gfx.cameraYaw();
          let delta = Math.atan2(Math.sin(want - yaw), Math.cos(want - yaw));
          const max = (fx.degrees * Math.PI) / 180;
          delta = Math.max(-max, Math.min(max, delta));
          const secs = Math.max(0.05, fx.ms / 1000);
          this.nudge = { left: secs, perSec: delta / secs };
          break;
        }
        case 'stepDone':
        case 'finished':
          this.save();
          break;
        case 'cheer':
          break;
      }
    }
  }

  /** Screen points for anchors, including the world ones the tutorial uses for reward coins. */
  private anchorPoint(id: string): ScreenPt | null {
    if (id === 'reticle') {
      if (lastReticle.valid) return { x: lastReticle.x, y: lastReticle.y };
      return this.playerScreen();
    }
    if (id === 'player') return this.playerScreen();
    if (id === 'pedestals') {
      const i = this.state.base.findIndex((c) => c !== null);
      return this.gfx.pedestalScreen(Math.max(0, i)) ?? this.playerScreen();
    }
    return this.hud.anchorPoint(id);
  }

  private playerScreen(dy = 1.4): ScreenPt {
    const p = this.sim.player.pos;
    const s = this.gfx.project(tmpV.set(p.x, p.y + dy, p.z));
    if (s.behind) return { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    return { x: s.x, y: s.y };
  }

  // ================================================================ §5.3 feedback

  private onSimEvent(e: SimEvent): void {
    const sim = this.sim;
    this.progression.onSimEvent(e, sim);
    this.tutorial.onSimEvent(e, sim);
    this.hints.onSimEvent(e, sim);
    this.gfx.onSimEvent(e);
    this.audio.onSimEvent(e);
    this.feedback(e);
  }

  private feedback(e: SimEvent): void {
    const hud = this.hud;
    const state = this.state;
    const tutorialOn = this.tutorial.active;
    switch (e.type) {
      case 'releaseRated':
        if (e.quality === 'perfect') hud.float(this.playerScreen(2), 'PERFECT', 'perfect', 'perfect');
        break;
      case 'collect':
        this.onCollect(e.creature, e.isNewSpecies, e.isNewMutation);
        break;
      case 'carryFull':
        hud.toast({ text: 'Hands full. Head home.', kind: 'warn', icon: 'carry' });
        break;
      case 'deliver': {
        const placed = e.result.placed;
        if (e.bonusCash > 0) {
          const from = this.pedestalOf(placed[0]) ?? this.playerScreen();
          void hud.coinFly(from, e.bonusCash, 'cash');
        }
        const buddy = activeBuddy(state);
        if (buddy && e.bonusCash > 0) hud.float(this.playerScreen(2.6), `BUDDY +${Math.round(buddyBonus(buddy) * 100)}%`, 'bonus', 'buddy');
        if (placed.length) {
          // Net change: base creatures pushed off by better ones (and sold) no longer earn.
          const pushedOff = e.result.sold.reduce((s, x) => s + (x.displaced ? creatureIncome(x.creature) : 0), 0);
          const gain = (placed.reduce((s, c) => s + creatureIncome(c), 0) - pushedOff) * state.multiplier * state.streakBonus;
          if (gain > 0) hud.toast({ text: `+${formatIncome(gain)} added`, kind: 'good', icon: 'pedestal' });
        }
        for (const s of e.result.sold) hud.toast({ text: `Base full: sold ${getSpecies(s.creature.speciesId).name} for ${formatCash(s.cash)}`, kind: 'info', icon: 'cash' });
        this.save();
        break;
      }
      case 'chainEnd':
        if ((e.reason === 'sea' || e.reason === 'splash') && e.count >= 2) hud.float(this.playerScreen(2), 'CHAIN LOST', 'bonus', 'chainLost');
        break;
      case 'closeCall':
        // Only a home delivery pays the +25%; a lighthouse-pad close call is a stat and a banner (§9.4).
        hud.float(this.playerScreen(2), e.where === 'home' ? 'CLOSE CALL +25%' : 'CLOSE CALL', 'bonus', 'closeCall');
        hud.banner({ title: 'CLOSE CALL', hue: 'coral', priority: 'info', ms: 1400 });
        break;
      case 'splash':
        hud.flash('#1E88FF', 250);
        if (e.practice) break; // the tutorial pill explains the practice wave
        if (e.lost.length) {
          const n = e.lost.length;
          const spec: ToastSpec = { text: `The wave took ${n} creature${n > 1 ? 's' : ''}`, kind: 'bad', icon: 'wave' };
          const lost = e.lost.map((c) => ({ ...c }));
          if (this.platform.hasSdk && this.keepOfferedWave !== this.sim.wave.number) {
            this.keepOfferedWave = this.sim.wave.number;
            spec.action = {
              label: 'KEEP THEM',
              icon: 'play',
              onTap: () =>
                this.runAd('rewarded', (ok) => {
                  if (!ok) return;
                  this.sim.restoreCarried(lost);
                  hud.toast({ text: 'Creatures saved', kind: 'good', icon: 'creature' });
                }),
            };
          }
          hud.toast(spec);
        } else hud.toast({ text: 'Splash!', kind: 'info', icon: 'wave' });
        break;
      case 'respawn':
        if (e.reason === 'sea') hud.flash('#2EC5E8', 250);
        break;
      case 'zone': {
        if (!e.first || tutorialOn) break;
        const zone = this.sim.course.zones[e.zone];
        const r = zone.def.rarity;
        hud.banner({ title: zone.def.name.toUpperCase(), sub: `${RARITIES[r].name} creatures`, hue: `r${r as 0 | 1 | 2 | 3 | 4 | 5 | 6}`, priority: 'zone' });
        break;
      }
      case 'waveWarning': {
        const spot = this.sim.safeSpot();
        hud.banner({
          title: e.golden ? 'GOLDEN WAVE' : e.big ? 'BIG WAVE' : 'WAVE INCOMING',
          sub: spot === 'home' ? "You're safe at home" : spot === 'lighthouse' ? "You're safe up here" : 'Get home or launch up a lighthouse',
          hue: e.golden ? 'gold' : e.big ? 'grape' : 'coral',
          priority: 'wave',
        });
        break;
      }
      case 'shopZone':
        this.shopWalkUp = true;
        break;
      case 'surgeEnd':
        hud.toast({ text: e.golden ? 'Golden creatures washed up' : 'Fresh creatures washed up', kind: 'info', icon: e.golden ? 'sparkle' : 'creature' });
        if (e.survived && !hud.bannerUp && !this.tutorial.active) hud.float(this.playerScreen(2), 'SURVIVED', 'perfect', 'survived');
        this.maybeMidgameAd();
        break;
      default:
        break;
    }
  }

  private onCollect(c: CreatureRef & { pos: Vector3 }, isNewSpecies: boolean, isNewMutation: boolean): void {
    const hud = this.hud;
    const rarity = getSpecies(c.speciesId).rarity;
    const s = this.gfx.project(tmpV.set(c.pos.x, c.pos.y + 1, c.pos.z));
    const from = s.behind ? this.playerScreen() : { x: s.x, y: s.y };
    const slot = this.state.carried.length - 1;
    if (slot >= 0) hud.creatureToSlot(from, c, slot);
    if (isNewSpecies || isNewMutation) {
      const ref = { speciesId: c.speciesId, mutation: c.mutation };
      const big =
        this.sim.wave.phase === 'calm' && !this.tutorial.active && ((isNewSpecies && rarity >= 4) || (isNewMutation && c.mutation === 3));
      const found = SPECIES.filter((sp) => (this.state.index[sp.id] ?? 0) > 0).length;
      this.audio.play('reveal', { rarity });
      void hud.reveal(ref, big ? 'big' : 'compact', `${found}/${SPECIES.length}`);
    }
    if (isNewSpecies && rarity >= 4) this.platform.happytime();
  }

  private pedestalOf(c: CreatureRef | undefined): ScreenPt | null {
    if (!c) return null;
    const base = this.state.base;
    for (let i = base.length - 1; i >= 0; i--) {
      const b = base[i];
      if (b && b.speciesId === c.speciesId && b.mutation === c.mutation) return this.gfx.pedestalScreen(i);
    }
    return null;
  }

  private maybeMidgameAd(): void {
    if (!this.platform.hasSdk || !this.state.ftue.done || this.tutorial.active) return;
    if (performance.now() - this.lastAdAt < AD_GAP_MS) return;
    this.runAd('midgame', () => {});
  }

  private onProgressEvent(e: ProgressEvent): void {
    const hud = this.hud;
    this.tutorial.onProgressEvent(e);
    switch (e.type) {
      case 'questDone': {
        // The tracker is shown after the FTUE only. Build the row from the quest that was completed
        // (not the tracker's last view), so quests completed back to back each get their own row.
        const q = VOYAGE[e.index - 1];
        if (q && this.state.ftue.done) {
          this.doneQueue.push({
            title: 'FIRST VOYAGE',
            count: `${q.n}/${VOYAGE_LENGTH}`,
            rows: [{ icon: q.icon, text: q.text, progress: 1, reward: e.reward, done: true }],
          });
        }
        this.audio.play('claim');
        break;
      }
      case 'voyageDone':
        this.platform.happytime();
        hud.banner({ title: 'VOYAGE COMPLETE', sub: 'The Locker is open', hue: 'gold', priority: 'info' });
        break;
      case 'giftReady':
        this.audio.play('giftReady');
        hud.toast({ text: 'Free gift ready', kind: 'info', icon: 'gift', onTap: () => this.openPanel('free', 'gifts') });
        break;
      case 'unlock': {
        this.audio.play('ui.open');
        const text =
          e.what === 'locker' ? 'Locker unlocked: spend Pearls on ropes' :
          e.what === 'rebirth' ? 'Rebirth unlocked in the Shop' :
          e.what === 'free' ? 'Free rewards unlocked' :
          e.what === 'index' ? 'Index unlocked' : null;
        if (text && e.what !== 'index') {
          const tab: PanelTab | undefined = e.what === 'locker' ? 'locker' : e.what === 'rebirth' ? 'rebirth' : undefined;
          const kind: PanelKind = e.what === 'free' ? 'free' : 'shop';
          hud.toast({ text, kind: 'good', icon: e.what === 'locker' ? 'locker' : e.what === 'rebirth' ? 'rebirth' : 'gift', onTap: () => this.openPanel(kind, tab) });
        }
        break;
      }
      case 'featured':
        hud.toast({ text: `Featured this week: ${getSpecies(e.speciesId).name}`, kind: 'info', icon: 'sparkle', onTap: () => this.openPanel('index') });
        break;
      case 'discovery':
        void hud.coinFly(this.playerScreen(), e.pearls, 'pearl', 5);
        break;
      default:
        break;
    }
  }
}

function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
