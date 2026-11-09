// C17 reticle (hook target and Perfect release ring) and C23 edge arrow.
import type { HudView } from '../../contracts';
import { el, replay, setText } from '../dom';
import { icon } from '../icons';

const BRACKETS = (() => {
  const L = 'M4 18V4H18';
  const corners = [0, 90, 180, 270].map((a) => `<path d="${L}" transform="rotate(${a} 28 28)"/>`).join('');
  return (
    `<svg class="rt-br" viewBox="0 0 56 56"><g fill="none" stroke-linecap="round" stroke-linejoin="round">` +
    `<g stroke="#1B1736" stroke-width="9">${corners}</g><g class="rt-c" stroke-width="4.5">${corners}</g></g></svg>`
  );
})();

export class ReticlePart {
  readonly el: HTMLElement;
  private readonly hook: HTMLElement;
  private readonly ring: HTMLElement;
  private readonly chip: HTMLElement;
  private readonly key: HTMLElement;
  // hint starts unknown so the first keyHint:false hides the SPACE keycap (touch, returning players).
  private last = { key: '', x: -999, y: -999, reach: '', hint: null as boolean | null };

  constructor() {
    this.el = el('div', 'reticle hud-hide');
    this.hook = el('div', 'rt-hook', `${BRACKETS}<span class="rt-lock">${icon('lock', 20)}</span><span class="rt-chip chip"></span><span class="rt-key key key--space">SPACE</span>`);
    this.ring = el('div', 'rt-ring', `<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="27" fill="none" stroke="#1B1736" stroke-width="10"/><circle cx="32" cy="32" r="27" fill="none" stroke="#FFC92E" stroke-width="5"/></svg><span class="rt-bolt">${icon('perfect', 18)}</span>`);
    this.el.append(this.hook, this.ring);
    this.chip = this.hook.querySelector('.rt-chip') as HTMLElement;
    this.key = this.hook.querySelector('.rt-key') as HTMLElement;
  }

  update(r: HudView['reticle'], reduce: boolean): void {
    const key = r ? (r.kind === 'hook' ? `hook:${r.locked}` : 'release') : '';
    const moved = r ? Math.hypot(r.x - this.last.x, r.y - this.last.y) : 0;
    if (key !== this.last.key || (r && moved > 80)) {
      const was = this.last.key;
      this.last.key = key;
      this.el.classList.toggle('hud-hide', !r);
      if (r) {
        this.el.dataset.kind = r.kind;
        this.el.classList.toggle('locked', r.kind === 'hook' && r.locked);
        if (!reduce || (was === '' && r.kind !== 'release')) replay(r.kind === 'hook' ? this.hook : this.ring, 'snap');
      }
    }
    if (!r) return;
    if (r.x !== this.last.x || r.y !== this.last.y) {
      this.last.x = r.x;
      this.last.y = r.y;
      this.el.style.transform = `translate(${r.x.toFixed(1)}px, ${r.y.toFixed(1)}px)`;
    }
    if (r.kind === 'hook') {
      const reach = r.locked && r.reach ? `${r.reach.toFixed(1)} m` : '';
      if (reach !== this.last.reach) {
        this.last.reach = reach;
        setText(this.chip, reach);
      }
      if (r.keyHint !== this.last.hint) {
        this.last.hint = r.keyHint;
        this.key.style.display = r.keyHint ? '' : 'none';
      }
    }
  }
}

export class EdgeArrowPart {
  readonly el: HTMLElement;
  private readonly disc: HTMLElement;
  private readonly chip: HTMLElement;
  private readonly arrow: HTMLElement;
  private last = { on: false, icon: '', label: '', x: 0, y: 0, a: 0 };

  constructor() {
    this.el = el('div', 'edge off');
    this.el.innerHTML =
      `<div class="eg-arrow"><svg viewBox="0 0 44 44"><path d="M8 10Q8 4 14 6.5L38 18Q44 22 38 26L14 37.5Q8 40 8 34Z" fill="#1B1736" transform="translate(0 3)"/><path d="M8 10Q8 4 14 6.5L38 18Q44 22 38 26L14 37.5Q8 40 8 34Z" fill="#FFC92E" stroke="#1B1736" stroke-width="4" stroke-linejoin="round"/><path d="M13 12L30 19" stroke="#FFF07A" stroke-width="3" stroke-linecap="round"/></svg></div>` +
      `<div class="eg-disc"></div><span class="eg-chip chip"></span>`;
    this.arrow = this.el.querySelector('.eg-arrow') as HTMLElement;
    this.disc = this.el.querySelector('.eg-disc') as HTMLElement;
    this.chip = this.el.querySelector('.eg-chip') as HTMLElement;
  }

  update(e: HudView['edgeArrow'], w: number, h: number): void {
    const on = !!e;
    if (on !== this.last.on) {
      this.last.on = on;
      this.el.classList.toggle('off', !on);
    }
    if (!e) return;
    if (e.icon !== this.last.icon) {
      this.last.icon = e.icon;
      this.disc.innerHTML = icon(e.icon, 24);
    }
    if (e.label !== this.last.label) {
      this.last.label = e.label;
      setText(this.chip, e.label);
    }
    // Clamp onto an ellipse inset 64px from the edges, along the direction from screen centre.
    const cx = w / 2;
    const cy = h / 2;
    const rx = Math.max(40, cx - 64);
    const ry = Math.max(40, cy - 64);
    let dx = e.x - cx;
    let dy = e.y - cy;
    if (dx === 0 && dy === 0) dx = 1;
    const k = 1 / Math.sqrt((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry));
    const x = cx + dx * Math.min(1, k);
    const y = cy + dy * Math.min(1, k);
    const a = e.angle;
    if (Math.abs(x - this.last.x) > 0.5 || Math.abs(y - this.last.y) > 0.5 || Math.abs(a - this.last.a) > 0.005) {
      this.last.x = x;
      this.last.y = y;
      this.last.a = a;
      this.el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      this.arrow.style.transform = `rotate(${a.toFixed(3)}rad)`;
    }
  }
}
