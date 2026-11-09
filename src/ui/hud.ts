// The v2 HUD facade (spec §10.2). One class the lead drives each frame with a HudView.
import './tokens.css';
import './components.css';
import './hud.css';
import './panels.css';
import './fx.css';
import type {
  BannerSpec, FloatKind, HudFocus, HudPart, HudView, LayoutMode, PanelKind, PanelTab, ScreenPt, ToastSpec,
} from '../contracts';
import { getSpecies, type CreatureRef } from '../game/creatures';
import { installArtVars, porthole } from './art';
import { Confetti } from './confetti';
import { el, isReducedMotion, pressable, replay, setReducedMotion, setText, setUiSound } from './dom';
import { CoinFly, FloatText } from './fx';
import { ensureIconSprite, icon } from './icons';
import { LayoutWatcher } from './layout';
import type { PanelEnv } from './panels/env';
import { FreePanel } from './panels/free';
import { HatcheryPanel } from './panels/hatchery';
import { IndexPanel } from './panels/index';
import { PanelShell, type PanelContent } from './panels/panel';
import { SettingsPanel } from './panels/settings';
import { ShopPanel } from './panels/shop';
import { WelcomePanel } from './panels/welcome';
import { BannersPart } from './parts/banners';
import { CarryPart } from './parts/carry';
import { CashPart } from './parts/cash';
import { ChainPart } from './parts/chain';
import { controlsCardHtml, maybeCoach } from './parts/coach';
import { CourseBarPart, type CourseLayout } from './parts/courseBar';
import { RailPart } from './parts/rail';
import { ResumePart } from './parts/resume';
import { EdgeArrowPart, ReticlePart } from './parts/reticle';
import { ToastsPart } from './parts/toasts';
import { TouchPart } from './parts/touch';
import { TrackerPart } from './parts/tracker';
import { WaveMeterPart } from './parts/waveMeter';
import { Reveal, type RevealOpts } from './reveal';
import type { HudCtx, HudDeps } from './types';

export type { HudDeps } from './types';
export { loadFonts } from './fonts';
export { icon, iconSvg } from './icons';
export { logoSvg } from './logo';
export type { CourseLayout } from './parts/courseBar';

const PANEL_HUE: Record<PanelKind, 'grass' | 'grape' | 'sun' | 'sky' | 'teal'> = { shop: 'grass', index: 'grape', free: 'sun', settings: 'sky', welcome: 'grass', hatchery: 'teal' };
const PANEL_TITLE: Record<PanelKind, string> = { shop: 'SHOP', index: 'INDEX', free: 'FREE', settings: 'SETTINGS', welcome: 'WELCOME BACK', hatchery: 'HATCHERY' };
const HIDEABLE: HudPart[] = ['cash', 'pearls', 'rail', 'wave', 'course', 'tracker', 'carry', 'chain', 'topRight'];

export class Hud {
  readonly jumpButton: HTMLButtonElement;
  readonly joyBase: HTMLElement;
  readonly joyKnob: HTMLElement;

  private readonly root: HTMLElement;
  private readonly layer: HTMLElement;
  private readonly ov: HTMLElement;
  private readonly aim: HTMLElement;
  private readonly fxLayer: HTMLElement;
  private readonly watcher: LayoutWatcher;
  private readonly ctx: HudCtx;
  private readonly env: PanelEnv;

  private readonly cash: CashPart;
  private readonly rail: RailPart;
  private readonly wave: WaveMeterPart;
  private readonly course: CourseBarPart;
  private readonly carry: CarryPart;
  private readonly tracker: TrackerPart;
  private readonly chain: ChainPart;
  private readonly reticle: ReticlePart;
  private readonly edge: EdgeArrowPart;
  private readonly toasts: ToastsPart;
  private readonly banners: BannersPart;
  private readonly touchPart: TouchPart;
  private readonly resume: ResumePart;
  private readonly floats: FloatText;
  private readonly coins: CoinFly;
  private readonly confettiFx: Confetti;
  private readonly revealFx: Reveal;
  private readonly topRight: HTMLElement;
  private readonly soundBtn: HTMLElement;
  private readonly vignette: HTMLElement;
  private readonly flashEl: HTMLElement;
  private readonly countEl: HTMLElement;
  private readonly topCenter: HTMLElement;

  private shell: PanelShell | null = null;
  private content: PanelContent | null = null;
  private kind: PanelKind | null = null;
  private focus: HudFocus | null = null;
  private lastView: HudView | null = null;
  private reduce = false;
  private last = {
    touch: null as boolean | null, action: null as boolean | null, hide: '', vig: '', muted: null as boolean | null, surge: false,
  };
  private actionUntil = 0;

  constructor(root: HTMLElement, private readonly deps: HudDeps) {
    setUiSound(deps.sound);
    ensureIconSprite();
    installArtVars();
    this.reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    setReducedMotion(this.reduce);

    this.root = el('div', 'sos hud-root');
    this.layer = el('div', 'hud-layer');
    this.ov = el('div', 'hud-ov');
    this.aim = el('div', 'hud-aim');
    this.fxLayer = el('div', 'hud-fx');
    this.root.append(this.ov, this.layer, this.aim, this.fxLayer);
    root.appendChild(this.root);
    this.watcher = new LayoutWatcher(this.root, this.layer);

    this.ctx = {
      deps,
      layout: () => this.watcher.mode,
      touch: () => this.root.classList.contains('touch'),
      openPanel: (k, t) => this.openPanel(k, t),
      closePanel: () => this.closePanel(),
      centerOf: (e) => {
        const r = e.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      },
    };
    this.env = {
      ...this.ctx,
      confetti: (at, n, hue) => this.confetti(at, n, hue),
      coinFly: (from, amount, cur, n) => this.coinFly(from, amount, cur, n),
      flash: (c, ms) => this.flash(c, ms),
      banner: (title, sub, hue) => this.banner({ title, sub, hue, priority: 'info' }),
      reduce: () => this.reduce,
      toast: (t) => this.toast(t),
      refresh: () => this.refreshPanel(),
      reveal: (c, mode, indexCount, opts) => this.reveal(c, mode, indexCount, opts),
    };

    // ----- HUD parts -----
    this.cash = new CashPart();
    this.cash.cashPill.dataset.anchor = 'cash';
    this.cash.pearlPill.dataset.anchor = 'pearls';
    this.rail = new RailPart(this.ctx);
    this.wave = new WaveMeterPart();
    this.course = new CourseBarPart();
    this.topCenter = el('div', 'tc');
    this.topCenter.append(this.wave.el, this.course.el);
    this.carry = new CarryPart(deps);
    this.tracker = new TrackerPart();
    // A quest reward is already in the state when its row turns done: hold it at once (so the pill
    // doesn't roll up, then down, then up again) and let the burst 300 ms later only release it.
    this.tracker.onRowHold = (reward) => {
      if (reward.cash) this.cash.heldCash += reward.cash;
      if (reward.pearls) this.cash.heldPearls += reward.pearls;
    };
    this.tracker.onRowDone = (rw, reward) => {
      const from = this.ctx.centerOf(rw);
      if (reward.cash) void this.flyCoins(from, reward.cash, 'cash', undefined, false);
      if (reward.pearls) void this.flyCoins(from, reward.pearls, 'pearl', 5, false);
    };
    this.chain = new ChainPart();
    this.toasts = new ToastsPart(() => this.watcher.mode);
    this.banners = new BannersPart();
    this.banners.onBusyChange = (busy) => this.root.classList.toggle('banner-up', busy);
    this.touchPart = new TouchPart();
    this.jumpButton = this.touchPart.jumpButton;
    this.joyBase = this.touchPart.joyBase;
    this.joyKnob = this.touchPart.joyKnob;
    this.resume = new ResumePart();

    this.topRight = el('div', 'tr');
    this.soundBtn = el('button', 'rbtn', `<span class="disc">${icon('sound-on', 26)}</span>`);
    this.soundBtn.dataset.anchor = 'sound';
    this.soundBtn.setAttribute('aria-label', 'Sound');
    pressable(this.soundBtn, () => deps.actions.toggleMute());
    const settingsBtn = el('button', 'rbtn', `<span class="disc">${icon('settings', 26)}</span>`);
    settingsBtn.dataset.anchor = 'settings';
    settingsBtn.setAttribute('aria-label', 'Settings');
    pressable(settingsBtn, () => this.openPanel('settings'));
    this.topRight.append(this.soundBtn, settingsBtn);

    this.layer.append(
      this.cash.el, this.rail.el, this.topCenter, this.topRight, this.tracker.el, this.chain.el,
      this.carry.el, this.touchPart.el, this.toasts.el, this.banners.el,
    );

    // ----- Unzoomed overlays -----
    this.vignette = el('div', 'vignette');
    this.reticle = new ReticlePart();
    this.edge = new EdgeArrowPart();
    this.ov.append(this.vignette);
    this.aim.append(this.reticle.el, this.edge.el);
    this.flashEl = el('div', 'flash');
    this.countEl = el('div', 'countdown');
    this.floats = new FloatText(this.fxLayer);
    this.coins = new CoinFly(this.fxLayer);
    this.confettiFx = new Confetti(this.fxLayer);
    const compactHost = el('div', 'reveal-host');
    this.revealFx = new Reveal(deps, {
      banner: (b) => this.banner(b),
      confetti: (n, hue) => this.confetti('center', n, hue),
      flash: (c, ms) => this.flash(c, ms),
      setBigReveal: (on) => this.root.classList.toggle('big-reveal', on),
      multiplier: () => this.lastView?.multiplier ?? 1,
    }, compactHost);
    this.layer.appendChild(compactHost);
    this.layer.appendChild(this.revealFx.el);
    this.fxLayer.append(this.countEl, this.flashEl, this.resume.el);

    this.watcher.onChange(() => this.onLayoutChange());
  }

  // ---------------------------------------------------------------- frame
  get layout(): LayoutMode {
    return this.watcher.mode;
  }

  update(realDt: number, v: HudView): void {
    this.lastView = v;
    const reduce = this.reduce;
    if (v.touch !== this.last.touch) {
      this.last.touch = v.touch;
      this.root.classList.toggle('touch', v.touch);
    }
    // Action fade: on immediately, off 600 ms after the action ends.
    const now = performance.now();
    if (v.action) this.actionUntil = now + 600;
    const action = v.action || now < this.actionUntil;
    if (action !== this.last.action) {
      this.last.action = action;
      for (const e of [this.rail.el, this.tracker.el, this.cash.pearlPill]) e.classList.toggle('hud-fade', action);
    }
    const hideKey = HIDEABLE.filter((p) => v.hide[p]).join(',');
    if (hideKey !== this.last.hide) {
      this.last.hide = hideKey;
      const map: Record<HudPart, HTMLElement[]> = {
        cash: [this.cash.cashPill, this.cash.el.querySelector('.income-chip') as HTMLElement],
        pearls: [this.cash.pearlPill],
        rail: [this.rail.el],
        wave: [this.wave.el],
        course: [this.course.el],
        tracker: [this.tracker.el],
        carry: [this.carry.el],
        chain: [this.chain.el],
        topRight: [this.topRight],
      };
      for (const p of HIDEABLE) for (const e of map[p]) e.classList.toggle('part-hidden', !!v.hide[p]);
    }
    const surge = v.wave.phase === 'surge';
    if (surge !== this.last.surge) {
      this.last.surge = surge;
      this.toasts.setSurge(surge);
    }
    this.banners.setState(surge, v.action);

    // The tracker first: a finished quest holds its reward before the pills read the new totals.
    this.tracker.update(v.tracker, surge, this.watcher.mode);
    this.cash.update(realDt, v.cash, v.income, v.multiplier, v.rebirths, v.pearls, reduce);
    this.rail.update(v.rail, reduce, realDt, this.banners.busy);
    this.wave.update(v.wave, reduce);
    this.course.update(v.course);
    this.carry.update(v.carried, v.capacity, v.tripBonusPct, reduce);
    this.chain.update(v.chain, reduce);
    this.reticle.update(v.reticle, reduce);
    this.reticle.el.classList.toggle('under-hud', !!v.reticle && this.underTopBand(v.reticle.x, v.reticle.y));
    this.edge.update(v.edgeArrow, window.innerWidth, window.innerHeight);
    this.touchPart.update(v);
    this.toasts.update(realDt);
    this.banners.update(realDt);

    const vig = v.vignette.kind === 'none' || v.vignette.strength <= 0 ? 'none' : `${v.vignette.kind}:${v.vignette.strength.toFixed(2)}`;
    if (vig !== this.last.vig) {
      this.last.vig = vig;
      this.vignette.dataset.kind = v.vignette.kind;
      this.vignette.style.opacity = vig === 'none' ? '0' : String(Math.min(1, v.vignette.strength));
    }
  }

  /** A centre banner is showing (floats that would land on it are skipped). */
  get bannerUp(): boolean {
    return this.root.classList.contains('banner-up');
  }

  private topBand = { l: 0, r: 0, b: 0, at: -1e9 };
  /** True when a screen point sits behind the wave meter / course bar (rect re-read at most twice a second). */
  private underTopBand(x: number, y: number): boolean {
    if (y > 260) return false;
    const now = performance.now();
    if (now - this.topBand.at > 500) {
      const r = this.topCenter.getBoundingClientRect();
      this.topBand = { l: r.left, r: r.right, b: r.bottom, at: now };
    }
    return y < this.topBand.b + 28 && x > this.topBand.l - 28 && x < this.topBand.r + 28;
  }

  private mouseHint: HTMLElement | null = null;
  /** Desktop mouse-look hint: 'locked' shows "Esc shows cursor", 'free' shows "Click to look", 'off' hides it. */
  setMouseHint(mode: 'locked' | 'free' | 'off'): void {
    if (!this.mouseHint) {
      this.mouseHint = el('div', 'mouse-hint');
      this.layer.appendChild(this.mouseHint);
    }
    const h = this.mouseHint;
    if (h.dataset.mode === mode) return;
    h.dataset.mode = mode;
    h.innerHTML =
      mode === 'locked'
        ? `<span class="key">ESC</span><span class="t-stroke">Show cursor</span>`
        : mode === 'free'
          ? `${icon('hand', 26)}<span class="t-stroke">Click to look around</span>` // short: clears an 8-slot hotbar
          : '';
  }

  /** Muted state for the sound buoy (lead calls it on change). Not in the §10.2 list; see report. */
  setMuted(muted: boolean): void {
    if (muted === this.last.muted) return;
    this.last.muted = muted;
    this.soundBtn.querySelector('.disc')!.innerHTML = icon(muted ? 'sound-off' : 'sound-on', 26);
  }

  /** Real zone widths and lighthouse positions for the course bar (optional; equal widths otherwise). */
  setCourseLayout(l: CourseLayout): void {
    this.course.setLayout(l);
  }

  // ---------------------------------------------------------------- feedback
  toast(t: ToastSpec): void {
    this.toasts.push(t);
  }

  banner(b: BannerSpec): void {
    this.banners.push(b);
  }

  float(at: ScreenPt, text: string, kind: FloatKind, mergeKey?: string): void {
    this.floats.show(at, text, kind, mergeKey);
  }

  coinFly(from: ScreenPt, amount: number, currency: 'cash' | 'pearl', coins?: number): Promise<void> {
    return this.flyCoins(from, amount, currency, coins, true);
  }

  /** `hold` false: the amount was already held (quest rewards); the coins only release it. */
  private flyCoins(from: ScreenPt, amount: number, currency: 'cash' | 'pearl', coins: number | undefined, hold: boolean): Promise<void> {
    const income = this.lastView?.income ?? 1;
    let n = Math.max(1, Math.min(12, coins ?? CoinFly.coinsFor(amount, income)));
    // CoinFly sends at most 4 coins with reduced motion: split the amount over what really flies.
    if (isReducedMotion()) n = Math.min(n, 4);
    const per = amount / n;
    if (hold) {
      if (currency === 'cash') this.cash.heldCash += amount;
      else this.cash.heldPearls += amount;
    }
    const target = currency === 'cash' ? this.cash.cashIcon : this.cash.pearlIcon;
    const to = () => this.ctx.centerOf(target);
    let released = 0;
    const release = (a: number) => {
      const r = Math.min(a, amount - released);
      if (r <= 0) return;
      released += r;
      this.cash.release(currency, r);
    };
    // The last coin releases whatever is left, so nothing stays held if fewer coins flew.
    return this.coins.fly(from, to, currency, n, () => release(per)).then(() => release(amount - released));
  }

  creatureToSlot(from: ScreenPt, c: CreatureRef, slot: number): void {
    const target = this.carry.slotEl(slot);
    if (!target) return;
    const src = this.deps.portraits.get(c);
    const r = getSpecies(c.speciesId).rarity;
    const node = el('div', 'fly-portrait', src ? `<img src="${src}" alt="">` : icon('creature', 56));
    node.dataset.r = String(r);
    target.style.visibility = 'hidden';
    this.coins.arcNode(node, from, this.ctx.centerOf(target), 350, () => {
      target.style.visibility = '';
      if (!this.reduce) replay(target, 'fx-pop');
    });
  }

  reveal(c: CreatureRef, mode: 'compact' | 'big', indexCount: string, opts?: RevealOpts): Promise<void> {
    return this.revealFx.play(c, mode, indexCount, opts);
  }

  confetti(at: ScreenPt | 'center', count: number, hue?: string): void {
    this.confettiFx.burst(at, count, hue);
  }

  countdown(n: 3 | 2 | 1): void {
    this.countEl.innerHTML = `<span class="t-stroke">${n}</span>`;
    replay(this.countEl, 'go');
  }

  flash(color: string, ms = 250): void {
    this.flashEl.style.background = color;
    this.flashEl.style.animationDuration = `${ms}ms`;
    replay(this.flashEl, 'go');
  }

  // ---------------------------------------------------------------- panels
  get openPanelKind(): PanelKind | null {
    return this.kind;
  }

  get openPanelTab(): PanelTab | null {
    return (this.content?.tab as PanelTab | null) ?? null;
  }

  openPanel(kind: PanelKind, tab?: PanelTab): void {
    if (this.kind === kind && this.content) {
      if (tab && this.content.setTab && tab !== this.content.tab) this.content.setTab(tab);
      return;
    }
    if (this.shell) {
      this.content?.destroy?.();
      this.shell.destroy();
    }
    this.kind = kind;
    this.root.classList.add('panel-open');
    const shell = new PanelShell(this.layer, {
      kind,
      title: PANEL_TITLE[kind],
      hue: PANEL_HUE[kind],
      backdropClose: kind !== 'welcome',
      onClose: () => (kind === 'welcome' ? (this.content as WelcomePanel | null)?.collectFromClose() : this.closePanel()),
    });
    this.shell = shell;
    switch (kind) {
      case 'shop':
        this.content = new ShopPanel(shell, this.env, tab ?? 'upgrades');
        break;
      case 'free':
        this.content = new FreePanel(shell, this.env, tab ?? 'daily');
        maybeCoach(this.deps, shell.el, 'coach:free');
        break;
      case 'index':
        this.content = new IndexPanel(shell, this.env);
        maybeCoach(this.deps, shell.el, 'coach:index');
        break;
      case 'settings':
        this.content = new SettingsPanel(shell, this.env);
        break;
      case 'welcome':
        this.content = new WelcomePanel(shell, this.env);
        break;
      case 'hatchery':
        this.content = new HatcheryPanel(shell, this.env, tab === 'buddy' ? 'buddy' : 'eggs');
        maybeCoach(this.deps, shell.el, 'coach:hatchery');
        break;
    }
    if (kind !== 'shop' && kind !== 'free' && kind !== 'hatchery') this.deps.actions.panelChanged(kind);
    if (this.focus) this.content?.setFocus?.(this.focus);
  }

  closePanel(): void {
    if (!this.shell) return;
    const shell = this.shell;
    this.content?.destroy?.();
    this.shell = null;
    this.content = null;
    this.kind = null;
    this.root.classList.remove('panel-open');
    void shell.close();
    this.deps.actions.panelChanged(null);
  }

  refreshPanel(): void {
    this.content?.refresh();
  }

  setFocus(f: HudFocus | null): void {
    const same = JSON.stringify(f) === JSON.stringify(this.focus);
    if (same) return;
    this.focus = f;
    this.content?.setFocus?.(f);
  }

  /** Whether a panel hotkey does something yet (u, g, i, h follow their rail tile; l needs the Locker). */
  hotkeyOn(key: string): boolean {
    const rail = this.lastView?.rail;
    switch (key.toLowerCase()) {
      case 'u': return rail?.shop.visible ?? true;
      case 'g': return rail?.free.visible ?? true;
      case 'i': return rail?.index.visible ?? true;
      case 'h': return rail?.hatchery.visible ?? true;
      case 'l': return (rail?.shop.visible ?? true) && this.deps.data.shop().lockerUnlocked;
      default: return true;
    }
  }

  showControlsCard(ms: number): void {
    const card = el('div', 'controls-card card', `<div class="cc-h t-d">CONTROLS</div>${controlsCardHtml(this.ctx.touch(), (k) => this.hotkeyOn(k))}`);
    const scrim = el('div', 'cc-wrap');
    scrim.appendChild(card);
    const close = () => {
      scrim.classList.add('out');
      window.setTimeout(() => scrim.remove(), 160);
    };
    scrim.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      close();
    });
    this.layer.appendChild(scrim);
    window.setTimeout(close, ms);
  }

  showResume(onResume: () => void): void {
    this.resume.show(onResume);
  }

  // ---------------------------------------------------------------- anchors
  anchor(id: string): HTMLElement | null {
    if (id === 'jump') return this.jumpButton;
    if (id.startsWith('rail:')) return this.rail.anchor(id.slice(5) as never);
    const fromPanel = this.content?.anchor?.(id);
    if (fromPanel) return fromPanel;
    return this.root.querySelector(`[data-anchor="${CSS.escape(id)}"]`) as HTMLElement | null;
  }

  anchorPoint(id: string): ScreenPt | null {
    const a = this.anchor(id);
    return a ? this.ctx.centerOf(a) : null;
  }

  setReduceMotion(on: boolean): void {
    this.reduce = on;
    setReducedMotion(on);
  }

  private onLayoutChange(): void {
    if (this.kind && this.content) this.content.refresh();
  }
}

// Re-exported so tree-shaking keeps helpers the lead may want (porthole for the loading screen).
export { porthole, setText, isReducedMotion };
