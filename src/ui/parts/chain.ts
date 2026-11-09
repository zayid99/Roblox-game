// Chain counter (§9.4): ring timer, "CHAIN" over "×4".
import type { HudView } from '../../contracts';
import { el, replay, setText } from '../dom';

const RING_R = 22;
const RING_C = 2 * Math.PI * RING_R;

export class ChainPart {
  readonly el: HTMLElement;
  private readonly num: HTMLElement;
  private readonly ring: SVGCircleElement;
  private readonly txt: HTMLElement;
  private last = { count: -1, frac: -1, show: null as boolean | null, tier: -1 };

  constructor() {
    this.el = el('div', 'chain hud-hide');
    this.el.innerHTML =
      `<svg class="ch-ring" viewBox="0 0 56 56"><circle cx="28" cy="28" r="${RING_R}" fill="#123A5C" stroke="#1B1736" stroke-width="10"/>` +
      `<circle class="ch-arc" cx="28" cy="28" r="${RING_R}" fill="none" stroke="#FFC92E" stroke-width="5" stroke-linecap="round" stroke-dasharray="${RING_C.toFixed(2)}" transform="rotate(-90 28 28)"/></svg>` +
      `<div class="ch-txt"><span class="t-stroke ch-lbl">CHAIN</span><span class="ch-num t-grad" data-text="×2"><span>×2</span></span></div>`;
    this.num = this.el.querySelector('.ch-num') as HTMLElement;
    this.ring = this.el.querySelector('.ch-arc') as SVGCircleElement;
    this.txt = this.el.querySelector('.ch-txt') as HTMLElement;
  }

  update(c: HudView['chain'], reduce: boolean): void {
    const show = !!c && c.count >= 2;
    if (show !== this.last.show) {
      this.last.show = show;
      this.el.classList.toggle('hud-hide', !show);
      if (!show) this.last.count = -1;
    }
    if (!c || !show) return;
    if (c.count !== this.last.count) {
      const up = this.last.count >= 0 && c.count > this.last.count;
      this.last.count = c.count;
      setText(this.num, `×${c.count}`);
      const tier = c.count >= 10 ? 2 : c.count >= 5 ? 1 : 0;
      if (tier !== this.last.tier) {
        this.last.tier = tier;
        this.el.dataset.tier = String(tier);
      }
      if (!reduce) {
        replay(this.num, 'ch-pop');
        // The text block shakes, not the root: portrait centres the root with `translate`.
        if (up) replay(this.txt, 'fx-shake');
      }
    }
    const f = Math.round(Math.max(0, Math.min(1, c.timerFrac)) * 200) / 200;
    if (f !== this.last.frac) {
      this.last.frac = f;
      this.ring.style.strokeDashoffset = String((RING_C * (1 - f)).toFixed(2));
    }
  }
}
