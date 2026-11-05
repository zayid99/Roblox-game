// Welcome Back card (§9.2): offline earnings count-up, today's Day tile, pending gifts, CLAIM.
import { formatCash } from '../../game/economy';
import { el, gradText, pressable, setText } from '../dom';
import { icon } from '../icons';
import type { PanelEnv } from './env';
import { rewardArt } from './free';
import type { PanelContent, PanelShell } from './panel';

export class WelcomePanel implements PanelContent {
  readonly tab = null;
  private raf = 0;

  constructor(private readonly shell: PanelShell, private readonly env: PanelEnv) {
    this.refresh();
  }

  refresh(): void {
    const v = this.env.deps.data.welcome();
    this.shell.head.innerHTML = '';
    const body = this.shell.body;
    body.innerHTML = '';
    const well = el('div', 'well wb-well');
    const left = el('div', 'wb-left', `<div class="wb-cash">${icon('cash', 96)}</div><div class="wb-l t-stroke">WHILE YOU WERE AWAY</div><div class="wb-amt">${gradText('$0', 't-num num-cash')}</div>`);
    const right = el('div', 'wb-right');
    if (v.daily) {
      const { art, text } = rewardArt(v.daily.reward, 48);
      right.insertAdjacentHTML('beforeend', `<div class="wb-sub t-d">TODAY</div><div class="dt card st-today wb-day"><span class="dt-day t-d">DAY ${v.daily.day}</span><span class="dt-art">${art}</span><span class="dt-amt t-d">${text}</span></div>`);
    }
    if (v.pendingGifts.length) {
      right.insertAdjacentHTML(
        'beforeend',
        `<div class="wb-sub t-d">GIFTS FROM YESTERDAY</div><div class="wb-gifts">${v.pendingGifts.map((r) => `<span class="wb-g card">${rewardArt(r, 30).art}</span>`).join('')}</div>`,
      );
    }
    well.append(left);
    if (right.childElementCount) well.append(right);
    else well.classList.add('solo');
    body.appendChild(well);
    const foot = el('div', 'panel-foot');
    const claim = el('button', 'btn btn--grass btn--xl btn--shine', '<span class="label">CLAIM</span>');
    claim.dataset.anchor = 'welcome:claim';
    pressable(claim, () => this.collect(false, claim));
    foot.appendChild(claim);
    if (v.canDouble) {
      const dbl = el('button', 'btn btn--sky btn--l', `${icon('play', 30)}<span class="label">×2</span>`);
      pressable(dbl, () => this.collect(true, dbl));
      foot.appendChild(dbl);
    }
    body.appendChild(foot);
    // Count up from 0 over 900 ms.
    const amt = left.querySelector('.t-grad') as HTMLElement;
    const t0 = performance.now();
    cancelAnimationFrame(this.raf);
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / 900);
      setText(amt, formatCash(v.offline * (1 - Math.pow(1 - t, 3))));
      if (t < 1) this.raf = requestAnimationFrame(step);
    };
    this.raf = requestAnimationFrame(step);
  }

  /** The life-ring close collects without the ad (the card never closes empty-handed). */
  collectFromClose(): void {
    this.collect(false, this.shell.el.querySelector('.btn-close') as HTMLElement);
  }

  private collect(double: boolean, btn: HTMLElement): void {
    const v = this.env.deps.data.welcome();
    const from = this.env.centerOf(btn);
    this.env.deps.actions.collectWelcome(double);
    if (!double && v.offline >= 1) void this.env.coinFly(from, v.offline, 'cash', 10);
    this.env.confetti(from, 40, '#3FCB4B');
    this.env.closePanel();
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
  }
}
