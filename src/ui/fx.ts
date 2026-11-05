// Floating text and coin fly (spec §5.1). Pooled DOM nodes driven by one rAF loop.
import type { FloatKind, ScreenPt } from '../contracts';
import { el, isReducedMotion, replay, setText, uiSound } from './dom';
import { icon } from './icons';

interface FloatNode {
  root: HTMLElement;
  inner: HTMLElement;
  key: string | null;
  at: number;
  busy: boolean;
  timer: number;
}

export class FloatText {
  private readonly pool: FloatNode[] = [];

  constructor(layer: HTMLElement) {
    for (let i = 0; i < 24; i++) {
      const root = el('div', 'flt');
      const inner = el('div', 'flt-in t-grad');
      inner.innerHTML = '<span></span>';
      root.appendChild(inner);
      layer.appendChild(root);
      this.pool.push({ root, inner, key: null, at: 0, busy: false, timer: 0 });
    }
  }

  show(at: ScreenPt, text: string, kind: FloatKind, mergeKey?: string): void {
    const now = performance.now();
    if (mergeKey) {
      const m = this.pool.find((n) => n.busy && n.key === mergeKey && now - n.at < 250);
      if (m) {
        m.at = now;
        setText(m.inner, text);
        replay(m.inner, 'remerge');
        return;
      }
    }
    const n = this.pool.find((p) => !p.busy) ?? this.pool.reduce((a, b) => (a.at < b.at ? a : b));
    window.clearTimeout(n.timer);
    n.busy = true;
    n.key = mergeKey ?? null;
    n.at = now;
    n.inner.className = `flt-in t-grad k-${kind}`;
    setText(n.inner, text);
    const drift = (Math.random() * 2 - 1) * 12;
    n.root.style.transform = `translate(${at.x.toFixed(1)}px, ${at.y.toFixed(1)}px)`;
    n.root.style.setProperty('--dx', `${drift.toFixed(1)}px`);
    replay(n.root, 'go');
    n.timer = window.setTimeout(() => {
      n.busy = false;
      n.root.classList.remove('go');
    }, 950);
  }
}

interface Coin {
  node: HTMLElement;
  from: ScreenPt;
  ctrl: ScreenPt;
  to: () => ScreenPt;
  t0: number;
  dur: number;
  delay: number;
  done: boolean;
  onLand: () => void;
}

/** Coin fly: pooled 28px coins along quadratic Béziers into the currency pill. */
export class CoinFly {
  private readonly pool: HTMLElement[] = [];
  private active: Coin[] = [];
  private raf = 0;

  constructor(private readonly layer: HTMLElement) {
    for (let i = 0; i < 24; i++) {
      const n = el('div', 'coin');
      layer.appendChild(n);
      this.pool.push(n);
    }
  }

  /** Coin count by amount relative to income (§5.1). */
  static coinsFor(amount: number, income: number): number {
    const sec = income > 0 ? amount / income : 999;
    return sec < 10 ? 4 : sec < 60 ? 7 : 10;
  }

  fly(from: ScreenPt, to: () => ScreenPt, currency: 'cash' | 'pearl', count: number, onCoin: (i: number) => void): Promise<void> {
    count = Math.max(1, Math.min(12, Math.round(count)));
    if (isReducedMotion()) count = Math.min(count, 4);
    return new Promise((resolve) => {
      let landed = 0;
      const now = performance.now();
      for (let i = 0; i < count; i++) {
        const node = this.pool.find((p) => !p.dataset.busy);
        const land = () => {
          onCoin(landed);
          uiSound('coinTick', landed);
          landed++;
          if (landed >= count) resolve();
        };
        if (!node) {
          window.setTimeout(land, 400 + i * 35);
          continue;
        }
        node.dataset.busy = '1';
        node.innerHTML = icon(currency === 'cash' ? 'cash' : 'pearl', 28);
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * 30;
        const f = { x: from.x + Math.cos(a) * r, y: from.y + Math.sin(a) * r };
        const t = to();
        const ctrl = { x: (f.x + t.x) / 2 + (Math.random() * 240 - 120), y: (f.y + t.y) / 2 - 160 };
        this.active.push({ node, from: f, ctrl, to, t0: now, dur: 520 + (Math.random() * 160 - 80), delay: i * 35, done: false, onLand: land });
        node.style.opacity = '0';
      }
      if (!this.raf) this.raf = requestAnimationFrame(this.tick);
    });
  }

  private tick = (now: number): void => {
    this.raf = 0;
    for (const c of this.active) {
      const el2 = now - c.t0 - c.delay;
      if (el2 < 0) continue;
      const pop = Math.min(1, el2 / 120);
      const t = Math.min(1, el2 / c.dur);
      const tt = t * t;
      const to = c.to();
      const x = (1 - tt) * (1 - tt) * c.from.x + 2 * (1 - tt) * tt * c.ctrl.x + tt * tt * to.x;
      const y = (1 - tt) * (1 - tt) * c.from.y + 2 * (1 - tt) * tt * c.ctrl.y + tt * tt * to.y;
      let s = pop;
      let o = 1;
      if (t > 0.9) {
        const k = (t - 0.9) / 0.1;
        s = 1 - 0.4 * k;
        o = 1 - k;
      }
      c.node.style.opacity = String(o);
      c.node.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${s.toFixed(3)})`;
      if (t >= 1 && !c.done) {
        c.done = true;
        delete c.node.dataset.busy;
        c.node.style.opacity = '0';
        c.onLand();
      }
    }
    this.active = this.active.filter((c) => !c.done);
    if (this.active.length) this.raf = requestAnimationFrame(this.tick);
  };

  /** A portrait arcing into a hotbar slot over 350 ms (control point 120px above). */
  arcNode(node: HTMLElement, from: ScreenPt, to: ScreenPt, ms: number, done: () => void): void {
    this.layer.appendChild(node);
    const ctrl = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - 120 };
    const t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / ms);
      const x = (1 - t) * (1 - t) * from.x + 2 * (1 - t) * t * ctrl.x + t * t * to.x;
      const y = (1 - t) * (1 - t) * from.y + 2 * (1 - t) * t * ctrl.y + t * t * to.y;
      node.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${(1 - 0.15 * t).toFixed(3)})`;
      if (t < 1) requestAnimationFrame(step);
      else {
        node.remove();
        done();
      }
    };
    requestAnimationFrame(step);
  }
}
