// C13 touch action button and the floating joystick visuals (behaviour lives in src/input).
import type { HudView } from '../../contracts';
import { el, setText } from '../dom';
import { icon } from '../icons';

export class TouchPart {
  readonly el: HTMLElement;
  readonly jumpButton: HTMLButtonElement;
  readonly joyBase: HTMLElement;
  readonly joyKnob: HTMLElement;
  private readonly label: HTMLElement;
  private last = { label: '', gold: false };

  constructor() {
    this.el = el('div', 'touch-ctl');
    this.joyBase = el('div', 'joy');
    this.joyKnob = el('div', 'joy-knob');
    this.joyBase.appendChild(this.joyKnob);
    this.jumpButton = el('button', 'act') as HTMLButtonElement;
    this.jumpButton.dataset.anchor = 'jump';
    this.jumpButton.innerHTML =
      `<svg class="act-ring" viewBox="0 0 100 100"><circle cx="50" cy="50" r="47" fill="none" stroke="#1B1736" stroke-width="6" stroke-dasharray="10 8"/><circle cx="50" cy="50" r="47" fill="none" stroke="#FFE680" stroke-width="3" stroke-dasharray="10 8"/></svg>` +
      `<span class="act-in">${icon('arrow-up', 40)}<span class="act-lbl t-stroke">JUMP</span></span>`;
    this.label = this.jumpButton.querySelector('.act-lbl') as HTMLElement;
    this.el.append(this.joyBase, this.jumpButton);
  }

  update(v: Pick<HudView, 'jumpLabel' | 'jumpGoldRim'>): void {
    if (v.jumpLabel !== this.last.label) {
      this.last.label = v.jumpLabel;
      setText(this.label, v.jumpLabel);
      this.jumpButton.dataset.mode = v.jumpLabel === 'LET GO' ? 'letgo' : v.jumpLabel === 'SWING' ? 'swing' : 'jump';
    }
    if (v.jumpGoldRim !== this.last.gold) {
      this.last.gold = v.jumpGoldRim;
      this.jumpButton.classList.toggle('gold-rim', v.jumpGoldRim);
    }
  }
}
