// Shop panel: UPGRADES tab (C6), LOCKER tab and REBIRTH tab (C19).
import type { HudFocus, PanelTab, ShopRow } from '../../contracts';
import type { UpgradeKey } from '../../game/economy';
import { formatCash } from '../../game/economy';
import { deny, el, escapeHtml, pressable, replay, shake } from '../dom';
import { icon } from '../icons';
import { maybeCoach } from '../parts/coach';
import type { PanelEnv } from './env';
import { LockerTab } from './locker';
import type { PanelContent, PanelShell, TabDef } from './panel';
import { RebirthTab } from './rebirth';

const TILE_HUE: Record<UpgradeKey, string> = { speed: 'sky', reach: 'sun', power: 'coral', carry: 'grape', slots: 'grass' };
let bulk: 1 | 5 | 'max' = 1;

interface RowEls {
  card: HTMLElement;
  pips: HTMLElement;
  stat: HTMLElement;
  btn: HTMLButtonElement;
  last: string;
  level: number;
}

export class UpgradesTab {
  readonly el: HTMLElement;
  private rows = new Map<UpgradeKey, RowEls>();
  private focus: HudFocus | null = null;

  constructor(private readonly env: PanelEnv) {
    this.el = el('div', 'up-list stagger');
  }

  build(head: HTMLElement): void {
    head.innerHTML = '';
    const lbl = el('span', 'ph-lbl t-stroke', 'BUY');
    const seg = el('div', 'seg');
    const opts: [1 | 5 | 'max', string][] = [[1, '×1'], [5, '×5'], ['max', 'MAX']];
    for (const [v, t] of opts) {
      const b = el('button', v === bulk ? 'on' : '', t);
      pressable(b, () => {
        bulk = v;
        seg.querySelectorAll('button').forEach((x) => x.classList.remove('on'));
        b.classList.add('on');
        this.refresh();
      }, { sound: 'ui.tab' });
      seg.appendChild(b);
    }
    head.append(lbl, seg);
    this.refresh();
  }

  anchor(id: string): HTMLElement | null {
    const m = /^shop:(buy|row):(\w+)$/.exec(id);
    if (!m) return null;
    const r = this.rows.get(m[2] as UpgradeKey);
    return r ? (m[1] === 'buy' ? r.btn : r.card) : null;
  }

  setFocus(f: HudFocus | null): void {
    this.focus = f && f.panel === 'shop' && (!f.tab || f.tab === 'upgrades') ? f : null;
    for (const [key, r] of this.rows) {
      const on = this.focus?.rowKey === key;
      r.card.classList.toggle('dim', !!this.focus && this.focus.dimOthers && !on);
      r.card.querySelector('.note')?.remove();
      r.card.querySelector('.sub')?.remove();
      if (on && this.focus) {
        if (this.focus.note) r.card.appendChild(el('span', 'note chip chip--sun', `<span>${escapeHtml(this.focus.note)}</span>`));
        if (this.focus.sub) r.stat.insertAdjacentElement('afterend', el('div', 'sub', escapeHtml(this.focus.sub)));
      }
    }
  }

  refresh(): void {
    const view = this.env.deps.data.shop();
    for (const row of view.rows) this.renderRow(row);
    if (this.focus) this.setFocus(this.focus);
  }

  private price(row: ShopRow): { cost: number; can: boolean; n: number } {
    if (bulk === 5) {
      const n = Math.min(5, row.max - row.level);
      return { cost: row.cost5, can: row.cost5 <= this.env.deps.data.shop().cash && n > 0, n };
    }
    if (bulk === 'max') {
      if (row.maxAffordable > 0) return { cost: row.costMax, can: true, n: row.maxAffordable };
      return { cost: row.cost, can: false, n: 1 };
    }
    return { cost: row.cost, can: row.affordable, n: 1 };
  }

  private renderRow(row: ShopRow): void {
    let r = this.rows.get(row.key);
    if (!r) {
      const card = el('div', 'card card-up');
      card.dataset.anchor = `shop:row:${row.key}`;
      card.innerHTML =
        `<div class="itile" style="--hi:var(--${TILE_HUE[row.key]}-hi);--c:var(--${TILE_HUE[row.key]});--lo:var(--${TILE_HUE[row.key]}-lo);--lip:var(--${TILE_HUE[row.key]}-lip)">${icon(row.icon, 46)}</div>` +
        `<div class="mid"><div class="nm">${escapeHtml(row.name)}</div><div class="pips"></div><div class="stat"></div></div>` +
        `<button class="btn btn--grass buy"></button><span class="flashov"></span>`;
      const btn = card.querySelector('.buy') as HTMLButtonElement;
      btn.dataset.anchor = `shop:buy:${row.key}`;
      r = { card, pips: card.querySelector('.pips') as HTMLElement, stat: card.querySelector('.stat') as HTMLElement, btn, last: '', level: row.level };
      const key = row.key;
      pressable(btn, () => this.buy(key), { repeat: true });
      this.rows.set(row.key, r);
      this.el.appendChild(card);
    }
    const p = this.price(row);
    const sig = `${row.level}|${row.max}|${row.now}|${row.next}|${p.cost}|${p.can}|${row.maxed}|${bulk}|${p.n}`;
    if (sig === r.last) return;
    const leveled = row.level > r.level;
    r.last = sig;
    // Pips
    if (row.max <= 16) {
      let html = '';
      for (let i = 0; i < row.max; i++) html += `<i class="${i < row.level ? 'on' : ''}${leveled && i === row.level - 1 ? ' new' : ''}"></i>`;
      r.pips.innerHTML = html + `<span class="lv">LV ${row.level}</span>`;
    } else r.pips.innerHTML = `<span class="lv">LV ${row.level}</span>`;
    // Stat
    r.stat.innerHTML = row.maxed || row.next === null
      ? `<span>${escapeHtml(row.now)}</span>`
      : `<span>${escapeHtml(row.now)}</span>${icon('chevron', 16)}<span class="nx">${escapeHtml(row.next)}</span>`;
    // Button
    const b = r.btn;
    b.className = 'btn buy';
    if (row.maxed) {
      b.classList.add('btn--max');
      b.innerHTML = `<span class="label">MAX</span>`;
    } else {
      b.classList.add(p.can ? 'btn--grass' : 'btn--cant');
      const n = p.n > 1 ? `<span class="bx">×${p.n}</span>` : '';
      b.innerHTML = `${icon('cash', 28)}<span class="label">${formatCash(p.cost)}</span>${n}`;
    }
    if (leveled) {
      const reduce = this.env.reduce();
      r.level = row.level;
      replay(r.card.querySelector('.flashov') as HTMLElement, 'go');
      if (!reduce) {
        replay(b, 'fx-squash');
        const nx = r.stat.querySelector('.nx') ?? r.stat.firstElementChild;
        if (nx) replay(nx, 'fx-punch');
      }
      this.env.confetti(this.env.centerOf(b), 12, '#3FCB4B');
      if (row.maxed) {
        r.card.querySelector('.max-stamp')?.remove();
        r.card.appendChild(el('span', 'max-stamp chip chip--gold', '<span class="t-d">MAX</span>'));
      }
    }
    r.level = row.level;
  }

  private buy(key: UpgradeKey): boolean {
    const row = this.env.deps.data.shop().rows.find((x) => x.key === key);
    const r = this.rows.get(key);
    if (!row || !r) return false;
    if (row.maxed) return false;
    const ok = this.env.deps.actions.buyUpgrade(key, bulk);
    if (!ok) {
      shake(r.btn); // buyUpgrade already played 'ui.denied'
      return false;
    }
    this.refresh();
    return true;
  }
}

export class ShopPanel implements PanelContent {
  tab: PanelTab = 'upgrades';
  private readonly upgrades: UpgradesTab;
  private locker: LockerTab | null = null;
  private rebirth: RebirthTab | null = null;
  private focus: HudFocus | null = null;
  /** Destroyed: a tab swap still in its 80 ms fade must not build a LockerTab (its RAF loop) afterwards. */
  private dead = false;

  constructor(private readonly shell: PanelShell, private readonly env: PanelEnv, tab: PanelTab = 'upgrades') {
    this.upgrades = new UpgradesTab(env);
    this.setTab(tab, false);
  }

  private tabs(): TabDef[] {
    const v = this.env.deps.data.shop();
    return [
      { id: 'upgrades', label: 'UPGRADES', icon: 'shop', hue: 'grass' },
      { id: 'locker', label: 'LOCKER', icon: 'locker', hue: 'teal', locked: !v.lockerUnlocked },
      { id: 'rebirth', label: 'REBIRTH', icon: 'rebirth', hue: 'gold', hidden: !v.rebirth.visible, dot: v.rebirth.can },
    ];
  }

  setTab(tab: string, animate = true): void {
    const v = this.env.deps.data.shop();
    if (tab === 'locker' && !v.lockerUnlocked) {
      const t = this.shell.tabsEl.querySelector('[data-anchor="tab:locker"]') as HTMLElement | null;
      if (t) deny(t);
      if (animate) return;
      tab = 'upgrades';
    }
    this.tab = tab as PanelTab;
    this.env.deps.actions.panelChanged('shop', this.tab);
    const title = tab === 'locker' ? 'LOCKER' : tab === 'rebirth' ? 'REBIRTH' : 'SHOP';
    this.shell.setTitle(title, tab === 'locker' ? 'teal' : tab === 'rebirth' ? 'gold' : 'grass');
    this.shell.setTabs(this.tabs(), tab, (id) => this.setTab(id));
    this.locker?.destroy();
    this.locker = null;
    this.rebirth?.destroy();
    this.rebirth = null;
    this.shell.head.innerHTML = '';
    this.shell.swapBody((body) => {
      if (this.dead) return;
      const well = el('div', 'well');
      body.appendChild(well);
      if (tab === 'upgrades') {
        this.upgrades.build(this.shell.head);
        well.appendChild(this.upgrades.el);
        this.upgrades.setFocus(this.focus);
      } else if (tab === 'locker') {
        this.locker = new LockerTab(this.env, well, this.shell.head);
        maybeCoach(this.env.deps, this.shell.el, 'coach:locker');
      } else {
        this.rebirth = new RebirthTab(this.env, well);
        maybeCoach(this.env.deps, this.shell.el, 'coach:rebirth');
      }
    }, animate);
  }

  refresh(): void {
    if (this.tab === 'upgrades') this.upgrades.refresh();
    else if (this.tab === 'locker') this.locker?.refresh();
    else this.rebirth?.refresh();
  }

  anchor(id: string): HTMLElement | null {
    return this.upgrades.anchor(id);
  }

  setFocus(f: HudFocus | null): void {
    this.focus = f;
    if (f && f.tab && f.tab !== this.tab) this.setTab(f.tab);
    this.upgrades.setFocus(f);
  }

  destroy(): void {
    this.dead = true;
    this.locker?.destroy();
    this.locker = null;
    this.rebirth?.destroy();
    this.rebirth = null;
  }
}

