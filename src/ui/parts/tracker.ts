// C16 quest tracker: sun header chip plus cream quest rows.
import type { LayoutMode, Reward, TrackerView } from '../../contracts';
import { formatCash, formatPearls } from '../../game/economy';
import { el, escapeHtml, pressable, replay, setText } from '../dom';
import { icon } from '../icons';

export function rewardChip(r: Reward, size = 16): string {
  const parts: string[] = [];
  if (r.cash) parts.push(`${icon('cash', size)}<span>${formatCash(r.cash)}</span>`);
  if (r.pearls) parts.push(`${icon('pearl', size)}<span>${formatPearls(r.pearls)}</span>`);
  if (r.luckyTide) parts.push(`${icon('lucky-tide', size)}<span>${r.luckyTide > 1 ? r.luckyTide : ''}</span>`);
  if (r.creature) parts.push(`${icon('creature', size)}`);
  if (r.cosmetic) parts.push(`${icon('locker', size)}`);
  return parts.join('');
}

export class TrackerPart {
  readonly el: HTMLElement;
  private readonly head: HTMLElement;
  private readonly title: HTMLElement;
  private readonly body: HTMLElement;
  private collapsed = false;
  private userCollapsed: boolean | null = null;
  private autoTimer = 0;
  private lastKey = '';
  private lastProgress = new Map<string, number>();
  private doneSeen = new Set<string>();
  private last = { visible: null as boolean | null, surge: false, layout: '' as LayoutMode | '' };
  /** The row turned done (the reward is already in the state): called in the same frame. */
  onRowHold: ((reward: Reward) => void) | null = null;
  /** The coin burst 300 ms later, from the reward chip (or the header chip while collapsed). */
  onRowDone: ((rowEl: HTMLElement, reward: Reward) => void) | null = null;

  constructor() {
    this.el = el('div', 'tracker');
    this.el.dataset.anchor = 'tracker';
    this.head = el('button', 'tr-head', `<span class="t-stroke tr-title"></span><span class="tr-caret">${icon('chevron', 18)}</span>`);
    this.title = this.head.querySelector('.tr-title') as HTMLElement;
    this.body = el('div', 'tr-body');
    this.el.append(this.head, this.body);
    pressable(this.head, () => {
      this.userCollapsed = !this.collapsed;
      this.setCollapsed(!this.collapsed);
      if (!this.collapsed && this.last.layout !== 'desktop') {
        window.clearTimeout(this.autoTimer);
        this.autoTimer = window.setTimeout(() => {
          this.userCollapsed = true;
          this.setCollapsed(true);
        }, 4000);
      }
    });
  }

  private setCollapsed(c: boolean): void {
    this.collapsed = c;
    this.el.classList.toggle('collapsed', c);
  }

  update(v: TrackerView | null, surge: boolean, layout: LayoutMode): void {
    const visible = !!v && v.rows.length > 0;
    if (visible !== this.last.visible) {
      this.last.visible = visible;
      this.el.classList.toggle('hud-hide', !visible);
    }
    if (layout !== this.last.layout || surge !== this.last.surge) {
      this.last.layout = layout;
      this.last.surge = surge;
      const def = layout !== 'desktop';
      this.setCollapsed(surge || (this.userCollapsed ?? def));
    }
    if (!v) return;
    setText(this.title, `${v.title} ${v.count}`);
    const key = v.rows.map((r) => r.text).join('|');
    if (key !== this.lastKey) {
      const hadRows = this.lastKey !== '';
      this.lastKey = key;
      this.body.innerHTML = '';
      for (const r of v.rows) {
        const row = el('div', `tr-row card${hadRows ? ' slide-in' : ''}`);
        row.innerHTML =
          `<span class="tr-ic">${icon(r.icon, 28)}</span>` +
          `<span class="tr-mid"><span class="tr-tx">${escapeHtml(r.text)}</span><span class="tr-bar"><i></i></span></span>` +
          `<span class="tr-rw t-d">${rewardChip(r.reward)}</span>`;
        row.dataset.key = r.text;
        this.body.appendChild(row);
      }
      this.lastProgress.clear();
    }
    const rows = this.body.children;
    v.rows.forEach((r, i) => {
      const row = rows[i] as HTMLElement | undefined;
      if (!row) return;
      const p = Math.round(Math.max(0, Math.min(1, r.done ? 1 : r.progress)) * 100) / 100;
      if (this.lastProgress.get(r.text) !== p) {
        this.lastProgress.set(r.text, p);
        (row.querySelector('.tr-bar i') as HTMLElement).style.transform = `scaleX(${p})`;
      }
      if (r.done && !this.doneSeen.has(r.text)) {
        this.doneSeen.add(r.text);
        const stamp = el('span', 'tr-stamp', icon('check', 40));
        row.appendChild(stamp);
        this.onRowHold?.(r.reward);
        window.setTimeout(() => {
          // A collapsed tracker hides the row (its rect is 0,0): burst from the header chip instead.
          const rw = row.querySelector('.tr-rw') as HTMLElement;
          this.onRowDone?.(this.collapsed || !rw.getClientRects().length ? this.head : rw, r.reward);
          (row.querySelector('.tr-rw') as HTMLElement).style.opacity = '0';
        }, 300);
        window.setTimeout(() => replay(row, 'slide-out'), 700);
      }
    });
  }
}
