// C9 centre banners: ribbon slam, priority queue with preemption.
import type { BannerSpec } from '../../contracts';
import { ribbonSvg } from '../art';
import { el, setText } from '../dom';

const PRIO: Record<BannerSpec['priority'], number> = { wave: 5, reveal: 4, zone: 3, tutorial: 2, info: 1 };
const HOLD: Partial<Record<BannerSpec['priority'], number>> = { zone: 1.6, wave: 1.8 };

interface Live {
  spec: BannerSpec;
  node: HTMLElement;
  left: number;
}

export class BannersPart {
  readonly el: HTMLElement;
  private queue: BannerSpec[] = [];
  private cur: Live | null = null;
  private surge = false;
  /** Zone banners wait while the player is in the air (at most 2 s). */
  private action = false;
  private zoneWait = 0;
  onShow: ((b: BannerSpec) => void) | null = null;
  onBusyChange: ((busy: boolean) => void) | null = null;

  constructor() {
    this.el = el('div', 'banners');
  }

  get busy(): boolean {
    return this.cur !== null;
  }

  setState(surge: boolean, action: boolean): void {
    this.surge = surge;
    this.action = action;
  }

  push(b: BannerSpec): void {
    if (b.priority === 'zone' && this.surge) return;
    if (this.cur && PRIO[b.priority] > PRIO[this.cur.spec.priority]) {
      this.exit(this.cur);
      this.cur = null;
    }
    this.queue.push(b);
    this.queue.sort((a, c) => PRIO[c.priority] - PRIO[a.priority]);
    this.pump();
  }

  private pump(): void {
    if (this.cur || !this.queue.length) return;
    const next = this.queue[0];
    if (next.priority === 'zone' && this.action && this.zoneWait < 2) return;
    this.queue.shift();
    this.zoneWait = 0;
    const node = el('div', `banner hue-${next.hue} in`);
    node.innerHTML = `<div class="bn-body">${ribbonSvg()}<span class="bn-title t-stroke"></span></div>${next.sub ? '<div class="bn-sub"></div>' : ''}`;
    setText(node.querySelector('.bn-title') as HTMLElement, next.title);
    if (next.sub) setText(node.querySelector('.bn-sub') as HTMLElement, next.sub);
    this.el.appendChild(node);
    const hold = (next.ms ?? (HOLD[next.priority] ?? 1.4) * 1000) / 1000;
    this.cur = { spec: next, node, left: 0.2 + hold };
    this.onShow?.(next);
    this.onBusyChange?.(true);
  }

  private exit(l: Live): void {
    l.node.classList.remove('in');
    l.node.classList.add('out');
    window.setTimeout(() => l.node.remove(), 230);
  }

  update(dt: number): void {
    if (this.queue.length && !this.cur && this.queue[0].priority === 'zone' && this.action) this.zoneWait += dt;
    if (this.cur) {
      this.cur.left -= dt;
      if (this.cur.left <= 0) {
        this.exit(this.cur);
        this.cur = null;
        if (!this.queue.length) this.onBusyChange?.(false);
      }
    }
    this.pump();
  }
}
