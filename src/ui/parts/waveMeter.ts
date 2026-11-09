// C15 wave meter: barber-pole timer with phases paused / calm / warning / surge.
import type { HudView } from '../../contracts';
import { el, fmtClock, replay, setText, uiSound } from '../dom';
import { icon } from '../icons';

type Phase = 'paused' | 'calm' | 'calm-big' | 'calm-gold' | 'warning' | 'surge' | 'safe' | 'hit';

export class WaveMeterPart {
  readonly el: HTMLElement;
  private readonly label: HTMLElement;
  private readonly digits: HTMLElement;
  private readonly chip: HTMLElement;
  private readonly fill: HTMLElement;
  private readonly chains: HTMLElement;
  private last = { phase: '' as Phase | '', label: '', digits: '', chip: '', fill: -1, sec: -1 };

  constructor() {
    this.el = el('div', 'wave-meter');
    this.el.dataset.anchor = 'wave';
    this.el.innerHTML =
      `<div class="wm-disc">${icon('wave', 40)}<span class="wm-lock">${icon('lock', 26)}</span></div>` +
      `<div class="wm-text"><span class="wm-label t-d">WAVE IN</span><span class="wm-digits t-stroke"></span></div>` +
      `<span class="wm-chip chip">#1</span>` +
      `<div class="wm-bar bar"><div class="fill"><div class="stripes"></div></div>` +
      `<span class="wm-spark l">${icon('sparkle', 16)}</span><span class="wm-spark r">${icon('sparkle', 16)}</span></div>` +
      `<div class="wm-chains">${Array.from({ length: 6 }, () => icon('chain', 16)).join('')}</div>`;
    this.label = this.el.querySelector('.wm-label') as HTMLElement;
    this.digits = this.el.querySelector('.wm-digits') as HTMLElement;
    this.chip = this.el.querySelector('.wm-chip') as HTMLElement;
    this.fill = this.el.querySelector('.fill') as HTMLElement;
    this.chains = this.el.querySelector('.wm-chains') as HTMLElement;
  }

  update(w: HudView['wave'], reduce: boolean): void {
    let phase: Phase;
    if (w.frozen) phase = 'paused';
    else if (w.phase === 'calm') phase = w.big ? 'calm-big' : w.golden ? 'calm-gold' : 'calm';
    else if (w.phase === 'warning') phase = 'warning';
    else phase = w.caught ? 'hit' : w.safe ? 'safe' : 'surge';

    if (phase !== this.last.phase) {
      const prev = this.last.phase;
      this.last.phase = phase;
      this.el.dataset.phase = phase;
      this.el.classList.toggle('golden', w.golden);
      // Back to paused (Replay tutorial): the chains must show again, not stay at the dropped end frame.
      if (phase === 'paused') this.chains.classList.remove('drop');
      if (prev === 'paused' && !reduce) {
        // Unlock: the chain drops away.
        replay(this.chains, 'drop');
        uiSound('ui.open');
      }
    }

    let label = 'WAVE IN';
    let digits = fmtClock(w.timer);
    if (phase === 'paused') label = 'WAVE PAUSED';
    else if (phase === 'calm-big') label = 'BIG WAVE IN';
    else if (phase === 'calm-gold') label = 'GOLDEN WAVE IN';
    else if (phase === 'surge') {
      label = 'HITS YOU IN';
      digits = w.hitsPlayerIn === null ? '' : `${Math.max(0, Math.ceil(w.hitsPlayerIn))}s`;
    } else if (phase === 'hit') {
      label = 'WAVE HIT YOU';
      digits = '';
    } else if (phase === 'safe') {
      label = "YOU'RE SAFE";
      digits = '';
    }
    if (label !== this.last.label) {
      this.last.label = label;
      setText(this.label, label);
    }
    if (digits !== this.last.digits) {
      this.last.digits = digits;
      this.digits.innerHTML = [...digits].map((ch) => `<span${ch === ':' ? ' class="c"' : ''}>${ch}</span>`).join('');
    }
    const chip = w.big ? `BIG #${w.number}` : `#${w.number}`;
    if (chip !== this.last.chip) {
      this.last.chip = chip;
      setText(this.chip, chip);
      this.chip.classList.toggle('chip--coral', w.big);
    }
    if (phase === 'warning') {
      const sec = Math.ceil(w.timer);
      if (sec !== this.last.sec) {
        this.last.sec = sec;
        if (!reduce) replay(this.el, 'tick');
      }
    } else this.last.sec = -1;

    const f = w.phase === 'surge' ? w.progress : w.duration > 0 ? 1 - w.timer / w.duration : 0;
    const fill = Math.round(Math.max(0, Math.min(1, f)) * 1000) / 1000;
    if (fill !== this.last.fill) {
      this.last.fill = fill;
      this.fill.style.transform = `scaleX(${fill})`;
    }
  }
}
