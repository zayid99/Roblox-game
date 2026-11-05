// TutorialOverlay: the DOM side of the FTUE (§7.1): objective pill, glyphs, spotlight, stamps,
// skip link and the Controls card. It only draws TutorialFrame data; all decisions live in core.ts.
import './tutorial.css';
import type { IconId, PromptSpec, ScreenPt, TutorialFrame } from '../contracts';
import { arrowSvg, tutorialIcon } from './art';
import { COPY } from './copy';
import type { Device } from './core';

export type TutorialSound = 'tutorialStep' | 'tutorialDone' | 'slowIn' | 'slowOut';

export interface TutorialOverlayDeps {
  root: HTMLElement;
  anchor: (id: string) => HTMLElement | null;
  anchorPoint: (id: string) => ScreenPt | null;
  sound: (id: TutorialSound) => void;
  onSkip: () => void;
  /** Optional extensions (all have fallbacks). */
  onControlsClosed?: () => void;
  /** The UI team's icon() (SVG markup); defaults to the tutorial's own fallback art. */
  icon?: (id: IconId, size: number) => string;
  /** Creature portrait for "GRAB TOASTOPUS" (markup or element). */
  portrait?: (speciesId: string, size: number) => string | HTMLElement;
  /** True while a HUD banner shows: the pill hides (§7.1, never a pill and a banner together). */
  bannerUp?: () => boolean;
  reduceMotion?: () => boolean;
  device?: () => Device;
}

const CHECK_MS = 360; // check stamp 200 ms + exit 160 ms
const STAMP_MS = 1000;

function layoutOf(w: number, h: number): 'desktop' | 'landscape' | 'portrait' {
  if (h > w) return 'portrait';
  if (Math.min(w, h) < 500) return 'landscape';
  return 'desktop';
}

function div(cls: string, parent?: HTMLElement): HTMLDivElement {
  const d = document.createElement('div');
  d.className = cls;
  parent?.appendChild(d);
  return d;
}

/** Sets text for the layered stroke style (textContent + data-text, like ui/dom.ts setText). */
function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) {
    el.textContent = text;
    el.dataset.text = text;
  }
}

function restart(el: HTMLElement, cls: string): void {
  el.classList.remove(cls);
  void el.offsetWidth; // reflow so the animation restarts
  el.classList.add(cls);
}

export class TutorialOverlay {
  readonly el: HTMLDivElement;
  private readonly pillWrap: HTMLDivElement;
  private readonly pill: HTMLDivElement;
  private readonly glyph: HTMLDivElement;
  private readonly head: HTMLDivElement;
  private readonly sub: HTMLDivElement;
  private readonly chip: HTMLDivElement;
  private readonly check: HTMLDivElement;
  private readonly stamp: HTMLDivElement;
  private readonly spot: HTMLDivElement;
  private readonly spotRing: HTMLDivElement;
  private readonly hand: HTMLDivElement;
  private readonly jumpGhost: HTMLDivElement;
  private readonly drag: HTMLDivElement;
  private readonly skip: HTMLButtonElement;
  private readonly controls: HTMLDivElement;

  private shownId: string | null = null;
  private shownGlyphKey = '';
  private lastStep: string | null = null;
  private exitLeft = 0;
  private stampLeft = 0;
  private stampText = '';
  private slow = false;
  private spotId: string | null = null;
  private controlsShown = false;
  private readonly icon: (id: IconId, size: number) => string;

  constructor(private readonly deps: TutorialOverlayDeps) {
    this.icon = deps.icon ?? tutorialIcon;
    this.el = div('tut');
    deps.root.appendChild(this.el);

    this.spot = div('tut-spot', this.el);
    this.spotRing = div('tut-spot-ring', this.el);
    this.hand = div('tut-hand', this.el);
    this.hand.innerHTML = `<i class="tut-hand-art">${this.icon('hand', 64)}</i><span class="tut-key tut-hand-key">U</span>`;

    this.pillWrap = div('tut-pill-wrap', this.el);
    this.pill = div('tut-pill', this.pillWrap);
    this.glyph = div('tut-glyph', this.pill);
    const text = div('tut-text', this.pill);
    this.head = div('tut-head tut-t', text);
    this.sub = div('tut-sub', text);
    this.chip = div('tut-chip', this.pill);
    this.check = div('tut-check', this.pillWrap);
    this.check.innerHTML = this.icon('check', 56);

    this.stamp = div('tut-stamp tut-t', this.el);
    this.jumpGhost = div('tut-jump-ghost', this.el);
    this.jumpGhost.innerHTML = `<i class="tut-ring"></i><i class="tut-ghost-art">${this.icon('thumb', 72)}</i>`;
    this.drag = div('tut-drag', this.el);
    this.drag.innerHTML = `<i class="tut-drag-art">${this.icon('hand', 88)}</i>`;

    this.skip = document.createElement('button');
    this.skip.type = 'button';
    this.skip.className = 'tut-skip';
    this.skip.textContent = COPY.skip;
    this.skip.addEventListener('click', () => deps.onSkip());
    this.el.appendChild(this.skip);

    this.controls = div('tut-controls', this.el);
    this.controls.addEventListener('pointerdown', () => deps.onControlsClosed?.());
  }

  private device(f: TutorialFrame): Device {
    if (this.deps.device) return this.deps.device();
    const g = f.prompt?.glyph ?? '';
    return g.startsWith('thumb') ? 'touch' : 'keyboard';
  }

  render(f: TutorialFrame, realDt: number): void {
    const ms = realDt * 1000;
    const el = this.el;
    el.dataset.layout = layoutOf(innerWidth, innerHeight);
    el.classList.toggle('tut--rm', !!this.deps.reduceMotion?.());

    // Slow-mo sound twins.
    const slow = f.timeScale < 0.999;
    if (slow !== this.slow) {
      this.slow = slow;
      this.deps.sound(slow ? 'slowIn' : 'slowOut');
    }

    this.renderPill(f, ms);
    this.renderSpot(f);
    this.renderTouchGhosts(f);
    this.skip.classList.toggle('is-on', f.skipVisible);
    this.renderControls(f);
  }

  // ------------------------------------------------------------ pill and stamps

  private renderPill(f: TutorialFrame, ms: number): void {
    const banner = !!this.deps.bannerUp?.();
    const p = f.prompt;
    const stepChanged = this.lastStep !== null && f.step !== this.lastStep;
    this.lastStep = f.step;

    // Stamps ("NICE SWING", "LAUNCH") play once, then exit; the pill stays hidden meanwhile.
    if (p?.stamp && p.stamp !== this.stampText) {
      this.stampText = p.stamp;
      this.stampLeft = STAMP_MS;
      setText(this.stamp, p.stamp);
      restart(this.stamp, 'is-on');
      this.deps.sound('tutorialDone');
      this.hidePill(false);
    } else if (!p?.stamp) {
      this.stampText = '';
    }
    if (this.stampLeft > 0) {
      this.stampLeft -= ms;
      if (this.stampLeft <= 0) this.stamp.classList.remove('is-on');
      return;
    }

    // Step complete: a green check over the pill, then the pill exits.
    if (stepChanged && this.shownId && !p?.stamp) {
      this.exitLeft = CHECK_MS;
      restart(this.check, 'is-on');
      this.pillWrap.classList.add('is-done');
      this.deps.sound('tutorialDone');
    }
    if (this.exitLeft > 0) {
      this.exitLeft -= ms;
      if (this.exitLeft > 0) return;
      this.check.classList.remove('is-on');
      this.pillWrap.classList.remove('is-done');
      this.hidePill(true);
    }

    if (!p || p.stamp || banner) {
      this.hidePill(false);
      this.drag.classList.remove('is-on');
      return;
    }
    if (p.id !== this.shownId) {
      this.shownId = p.id;
      this.shownGlyphKey = '';
      this.pillWrap.classList.add('is-on');
      restart(this.pill, 'is-pop');
      this.deps.sound('tutorialStep');
    }
    this.fillPill(p, f);
  }

  private hidePill(instant: boolean): void {
    if (!this.shownId && !this.pillWrap.classList.contains('is-on')) return;
    this.shownId = null;
    this.pillWrap.classList.remove('is-on');
    this.pillWrap.classList.toggle('is-instant', instant);
  }

  private fillPill(p: PromptSpec, f: TutorialFrame): void {
    const pill = this.pill;
    pill.dataset.size = p.size;
    if (pill.classList.contains('is-fail') !== p.fail) {
      pill.classList.toggle('is-fail', p.fail);
      if (p.fail) restart(pill, 'is-shake');
    }
    setText(this.head, p.headline);
    setText(this.sub, p.sub ?? '');
    this.sub.hidden = !p.sub;
    if (p.chip) {
      this.chip.hidden = false;
      const key = `${p.chip.icon}|${p.chip.text}`;
      if (this.chip.dataset.key !== key) {
        this.chip.dataset.key = key;
        this.chip.innerHTML = `${this.icon(p.chip.icon, 22)}<span></span>`;
        (this.chip.lastChild as HTMLElement).textContent = p.chip.text;
      }
    } else this.chip.hidden = true;

    const glyphKey = `${p.id}|${p.glyph}|${p.portrait ?? ''}`;
    if (glyphKey !== this.shownGlyphKey) {
      this.shownGlyphKey = glyphKey;
      this.glyph.innerHTML = '';
      this.glyph.appendChild(this.glyphFor(p));
      this.glyph.hidden = this.glyph.childElementCount === 0 || (this.glyph.firstChild as HTMLElement).childElementCount === 0;
    }
    const touch = this.device(f) === 'touch';
    this.drag.classList.toggle('is-on', p.glyph === 'dragLook');
    this.drag.classList.toggle('is-touch', touch);
  }

  private glyphFor(p: PromptSpec): HTMLElement {
    const box = document.createElement('div');
    box.className = 'tut-glyphs';
    const add = (html: string) => box.insertAdjacentHTML('beforeend', html);
    const space = (cls: string) => `<span class="tut-key tut-key--space ${cls}"><b>SPACE</b></span>`;
    const thumb = (cls: string) => `<span class="tut-thumb ${cls}"><i class="tut-ring"></i>${this.icon('thumb', 48)}</span>`;
    switch (p.glyph) {
      case 'wasd':
        add(this.wasd());
        if (p.id === 'grab') add(space('tut-hold'));
        break;
      case 'spaceHold':
        add(space(p.id === 'letGo' ? 'tut-letgo' : 'tut-hold'));
        break;
      case 'keyU':
        add('<span class="tut-key tut-tap">U</span>');
        break;
      case 'keyW':
        add(`<span class="tut-key tut-tap">W${arrowSvg(0)}</span>`);
        break;
      case 'thumbDrag':
        add(thumb('tut-thumb--drag'));
        break;
      case 'thumbHold':
        add(thumb(p.id === 'letGo' ? 'tut-thumb--lift' : 'tut-thumb--hold'));
        break;
      case 'thumbPush':
        add(thumb('tut-thumb--drag'));
        break;
      case 'dragLook':
        add(`<span class="tut-mini-hand">${this.icon('hand', 44)}</span>`);
        break;
      default:
        break;
    }
    if (p.portrait) {
      const por = this.deps.portrait?.(p.portrait, 52);
      const wrap = document.createElement('span');
      wrap.className = 'tut-portrait';
      if (por instanceof HTMLElement) wrap.appendChild(por);
      else wrap.innerHTML = por ?? this.icon('creature', 40);
      box.appendChild(wrap);
    }
    return box;
  }

  private wasd(): string {
    const k = (c: string, rot: number, cls = '') => `<span class="tut-key tut-key--sm ${cls}">${arrowSvg(rot)}<b>${c}</b></span>`;
    return `<span class="tut-wasd">${k('W', 0, 'tut-tap')}<span class="tut-wasd-row">${k('A', -90)}${k('S', 180)}${k('D', 90)}</span></span>`;
  }

  // ------------------------------------------------------------ spotlight

  private renderSpot(f: TutorialFrame): void {
    const id = f.spotlight;
    const target = id ? this.deps.anchor(id) : null;
    const on = !!target;
    this.spot.classList.toggle('is-on', on);
    this.spotRing.classList.toggle('is-on', on);
    this.hand.classList.toggle('is-on', on);
    if (!target || !id) {
      this.spotId = null;
      return;
    }
    const r = target.getBoundingClientRect();
    const pad = 10;
    const x = r.left - pad;
    const y = r.top - pad;
    const w = r.width + pad * 2;
    const h = r.height + pad * 2;
    if (id !== this.spotId) {
      this.spotId = id;
      const radius = parseFloat(getComputedStyle(target).borderTopLeftRadius) || 14;
      const rad = `${Math.min(radius + 8, Math.max(w, h) / 2)}px`;
      this.spot.style.borderRadius = rad;
      this.spotRing.style.borderRadius = rad;
      // Targets inside an open panel sit above the panel's backdrop.
      const inPanel = !id.startsWith('rail:') && id !== 'jump';
      this.el.classList.toggle('tut--spot-panel', inPanel);
      this.hand.classList.toggle('has-key', id === 'rail:shop' && this.device(f) !== 'touch');
    }
    for (const s of [this.spot, this.spotRing]) {
      s.style.left = `${x}px`;
      s.style.top = `${y}px`;
      s.style.width = `${w}px`;
      s.style.height = `${h}px`;
    }
    this.hand.style.left = `${x + w - 18}px`;
    this.hand.style.top = `${y + h - 18}px`;
  }

  // ------------------------------------------------------------ touch: ghost thumb on the real JUMP button

  private renderTouchGhosts(f: TutorialFrame): void {
    const p = f.prompt;
    const touchPrompt = !!p && !p.stamp && (p.glyph === 'thumbHold' || (p.id === 'grab' && p.glyph === 'thumbDrag'));
    const pt = touchPrompt ? this.deps.anchorPoint('jump') : null;
    this.jumpGhost.classList.toggle('is-on', !!pt && this.exitLeft <= 0);
    if (!pt || !p) return;
    this.jumpGhost.style.left = `${pt.x}px`;
    this.jumpGhost.style.top = `${pt.y}px`;
    this.jumpGhost.classList.toggle('is-lift', p.id === 'letGo');
  }

  // ------------------------------------------------------------ Controls card (ready step)

  private renderControls(f: TutorialFrame): void {
    if (f.controlsCard === this.controlsShown) return;
    this.controlsShown = f.controlsCard;
    if (f.controlsCard) {
      const touch = this.device(f) === 'touch';
      const rows = touch ? COPY.controlsTouch : COPY.controlsDesktop;
      const c = this.controls;
      c.innerHTML = '';
      const title = div('tut-controls-title tut-t', c);
      setText(title, COPY.controlsTitle);
      const grid = div('tut-controls-grid', c);
      for (const r of rows) {
        const row = div('tut-controls-row', grid);
        const keys = div('tut-controls-keys', row);
        for (const k of r.keys) {
          const cap = document.createElement('span');
          cap.className = `tut-key tut-key--sm${k.length > 2 ? ' tut-key--wide' : ''}`;
          cap.textContent = k;
          keys.appendChild(cap);
        }
        const t = div('tut-controls-text', row);
        t.textContent = r.text;
      }
      restart(c, 'is-on');
    } else {
      this.controls.classList.remove('is-on');
    }
  }

  destroy(): void {
    this.el.remove();
  }
}
