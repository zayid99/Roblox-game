// C19 REBIRTH tab: multiplier header, KEEP / LOSE cards, cost bar, hold-to-confirm.
import type { IconId } from '../../contracts';
import { formatCash } from '../../game/economy';
import { deny, el, escapeHtml, gradText, uiSound } from '../dom';
import { icon } from '../icons';
import type { PanelEnv } from './env';

const KEEP_ICON: IconId[] = ['pearl', 'locker', 'index', 'rebirth', 'flame'];
const LOSE_ICON: IconId[] = ['cash', 'shop', 'creature', 'pedestal'];
const HOLD_MS = 1000;
const RING_LEN = 1000;

export class RebirthTab {
  private readonly root: HTMLElement;
  private btn!: HTMLButtonElement;
  private ring!: SVGRectElement;
  private holdT = 0;
  private holding = false;
  private raf = 0;
  private lastTs = 0;

  constructor(private readonly env: PanelEnv, well: HTMLElement) {
    this.root = el('div', 'rebirth stagger');
    well.appendChild(this.root);
    this.refresh();
  }

  refresh(): void {
    const v = this.env.deps.data.shop().rebirth;
    const fmt = (m: number) => `×${+m.toFixed(2)}`;
    const line = (ic: IconId, t: string) => `<li>${icon(ic, 24)}<span>${escapeHtml(t)}</span></li>`;
    this.root.innerHTML =
      `<div class="rb-head">${icon('rebirth', 64)}<div><div class="rb-mult">${gradText(`${fmt(v.multNow)} → ${fmt(v.multNext)}`, 't-num num-gold')}</div><div class="rb-sub">Cash earned forever</div></div></div>` +
      `<div class="rb-cols">` +
      `<div class="card rb-col"><span class="chip chip--grass">${icon('check', 18)}<span class="t-stroke">KEEP</span></span><ul>${v.keep.map((t, i) => line(KEEP_ICON[i] ?? 'check', t)).join('')}</ul></div>` +
      `<div class="card rb-col"><span class="chip chip--coral">${icon('close', 16)}<span class="t-stroke">LOSE</span></span><ul>${v.lose.map((t, i) => line(LOSE_ICON[i] ?? 'close', t)).join('')}</ul></div>` +
      `</div>` +
      `<div class="bar bar--gold rb-bar"><div class="fill" style="transform:scaleX(${Math.min(1, v.progress)})"></div><span class="bl">${formatCash(Math.min(v.cost, v.progress * v.cost))} / ${formatCash(v.cost)}</span></div>` +
      `<div class="rb-btnwrap"><svg class="rb-ring" viewBox="0 0 330 82" preserveAspectRatio="none"><rect x="3" y="3" width="324" height="76" rx="24" pathLength="${RING_LEN}" fill="none" stroke="#1B1736" stroke-width="8"/><rect class="rb-prog" x="3" y="3" width="324" height="76" rx="24" pathLength="${RING_LEN}" fill="none" stroke="#FFF07A" stroke-width="5" stroke-dasharray="${RING_LEN}" stroke-dashoffset="${RING_LEN}"/></svg>` +
      `<button class="btn btn--l ${v.can ? 'btn--gold btn--shine' : 'btn--cant keep-white'} rb-go">${icon('rebirth', 34)}<span class="label">HOLD TO REBIRTH</span></button></div>`;
    this.btn = this.root.querySelector('.rb-go') as HTMLButtonElement;
    this.ring = this.root.querySelector('.rb-prog') as SVGRectElement;
    this.btn.dataset.anchor = 'shop:rebirth';
    this.btn.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      this.btn.setPointerCapture?.(e.pointerId);
      if (!this.env.deps.data.shop().rebirth.can) {
        deny(this.btn);
        return;
      }
      uiSound('ui.click');
      this.btn.classList.add('is-down');
      this.holding = true;
      this.loop();
    });
    const up = () => {
      this.holding = false;
      this.btn.classList.remove('is-down');
    };
    this.btn.addEventListener('pointerup', up);
    this.btn.addEventListener('pointercancel', up);
    // Capture is lost when the button leaves the DOM (panel closed, tab switched) or a context menu opens.
    this.btn.addEventListener('lostpointercapture', up);
    this.btn.addEventListener('contextmenu', up);
  }

  /** Stops a hold in progress: closing the panel or switching tabs must never complete a rebirth. */
  destroy(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.holding = false;
    this.holdT = 0;
  }

  private loop(): void {
    if (this.raf) return;
    this.lastTs = performance.now();
    const step = (now: number) => {
      if (!this.btn.isConnected) {
        this.destroy();
        return;
      }
      const dt = now - this.lastTs;
      this.lastTs = now;
      if (this.holding) this.holdT += dt / HOLD_MS;
      else this.holdT -= dt / 200;
      this.holdT = Math.max(0, Math.min(1, this.holdT));
      this.ring.style.strokeDashoffset = String(RING_LEN * (1 - this.holdT));
      if (this.holdT >= 1) {
        this.raf = 0;
        this.holding = false;
        this.holdT = 0;
        this.complete();
        return;
      }
      if (this.holdT > 0 || this.holding) this.raf = requestAnimationFrame(step);
      else this.raf = 0;
    };
    this.raf = requestAnimationFrame(step);
  }

  private complete(): void {
    const v = this.env.deps.data.shop().rebirth;
    this.env.deps.actions.rebirth();
    this.env.flash('#FFC92E', 150);
    this.env.banner('REBIRTH', `×${+v.multNext.toFixed(2)} cash forever`, 'gold');
    this.env.confetti('center', 80, '#FFB52E');
    this.env.closePanel();
  }
}
