// C8 toasts: top-centre stack, FIFO queue, ×2 merge, surge suppression.
import type { IconId, LayoutMode, ToastSpec } from '../../contracts';
import { el, escapeHtml, pressable, replay, uiSound } from '../dom';
import { icon } from '../icons';

const DEFAULT_ICON: Record<ToastSpec['kind'], IconId> = { info: 'sparkle', good: 'check', warn: 'warning', bad: 'wave' };
const WAVE_ICONS = new Set<IconId>(['wave', 'warning', 'lighthouse', 'home']);
/** A queued warning ("Hands full. Head home.") describes a moment; it is dropped if it can't show soon. */
const WARN_MAX_WAIT = 4;

interface Live {
  spec: ToastSpec;
  node: HTMLElement;
  left: number;
  count: number;
  shownAt: number;
}

interface Queued {
  spec: ToastSpec;
  /** Seconds spent in the queue. */
  age: number;
  /** Queued while the surge held non-wave toasts back. */
  inSurge: boolean;
}

export class ToastsPart {
  readonly el: HTMLElement;
  private queue: Queued[] = [];
  private live: Live[] = [];
  private surge = false;

  constructor(private readonly layout: () => LayoutMode) {
    this.el = el('div', 'toasts');
  }

  setSurge(on: boolean): void {
    if (this.surge && !on) {
      // Warnings held back by the surge are stale once it is over (the wave may have taken what they talk about).
      this.queue = this.queue.filter((q) => !(q.inSurge && q.spec.kind === 'warn' && !this.isWave(q.spec)));
    }
    this.surge = on;
  }

  private isWave(t: ToastSpec): boolean {
    return t.kind === 'bad' || (t.icon !== undefined && WAVE_ICONS.has(t.icon));
  }

  push(t: ToastSpec): void {
    const now = performance.now();
    const same = this.live.find((l) => l.spec.text === t.text && now - l.shownAt < 3000);
    if (same) {
      same.count++;
      same.left = this.hold(t);
      same.shownAt = now;
      const x = same.node.querySelector('.x2') as HTMLElement;
      x.textContent = `×${same.count}`;
      replay(same.node, 'repop');
      return;
    }
    if (this.queue.some((q) => q.spec.text === t.text)) return;
    this.queue.push({ spec: t, age: 0, inSurge: this.surge });
    this.pump();
  }

  private hold(t: ToastSpec): number {
    // An action (the KEEP THEM rewarded offer) gets its 6 s even on a 'bad' toast (§10.7).
    return t.action ? 6 : t.kind === 'bad' ? 1.8 : 2.2;
  }

  private max(): number {
    return this.layout() === 'desktop' ? 2 : 1;
  }

  private pump(): void {
    while (this.live.length < this.max()) {
      const i = this.queue.findIndex((q) => !this.surge || this.isWave(q.spec));
      if (i < 0) return;
      const q = this.queue.splice(i, 1)[0];
      this.show(q.spec);
    }
  }

  private show(t: ToastSpec): void {
    const node = el('div', `toast toast--${t.kind}`);
    node.innerHTML = `<span class="tdisc">${icon(t.icon ?? DEFAULT_ICON[t.kind], 26)}</span><span class="tx">${escapeHtml(t.text)}</span><span class="x2"></span>`;
    if (t.action) {
      const b = el('button', 'btn btn--sky btn--s', `${icon(t.action.icon, 22)}<span class="label">${escapeHtml(t.action.label)}</span>`);
      // Dismiss first: the node stays hit-testable during its 160 ms exit, and a second tap must not
      // run the action again (two rewarded-ad requests).
      pressable(b, () => {
        if (!this.live.includes(live)) return;
        this.dismiss(live);
        t.action?.onTap();
      });
      node.appendChild(b);
    }
    if (t.onTap) {
      node.classList.add('tappable');
      pressable(node, () => {
        if (!this.live.includes(live)) return;
        this.dismiss(live);
        t.onTap?.();
      }, { sound: 'ui.click' });
    }
    const live: Live = { spec: t, node, left: this.hold(t), count: 1, shownAt: performance.now() };
    this.live.push(live);
    this.el.appendChild(node);
    if (t.kind === 'bad') {
      uiSound('ui.denied');
      window.setTimeout(() => replay(node, 'fx-shake'), 240);
    } else uiSound('toast');
  }

  private dismiss(l: Live): void {
    if (!this.live.includes(l)) return;
    this.live = this.live.filter((x) => x !== l);
    l.node.classList.add('out');
    window.setTimeout(() => {
      l.node.remove();
      this.pump();
    }, 160);
  }

  update(dt: number): void {
    if (this.queue.length) {
      for (const q of this.queue) q.age += dt;
      this.queue = this.queue.filter((q) => !(q.spec.kind === 'warn' && !q.spec.action && q.age > WARN_MAX_WAIT));
    }
    for (const l of [...this.live]) {
      l.left -= dt;
      if (l.left <= 0) this.dismiss(l);
    }
    if (this.queue.length && this.live.length < this.max()) this.pump();
  }
}
