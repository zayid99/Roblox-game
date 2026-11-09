// FREE panel (§9.2, §9.3): streak and Lucky Tide header; DAILY calendar and GIFTS tabs.
import type { DailyTile, PanelTab, Reward } from '../../contracts';
import { COSMETICS } from '../../game/cosmetics';
import { getSpecies } from '../../game/creatures';
import { formatCash, formatPearls } from '../../game/economy';
import { porthole, ropeSwatch } from '../art';
import { el, fmtClock, fmtDuration, pressable, replay } from '../dom';
import { icon } from '../icons';
import type { PanelEnv } from './env';
import type { PanelContent, PanelShell } from './panel';

/** Big reward art plus a short amount label for tiles and boxes. */
export function rewardArt(r: Reward, size = 48): { art: string; text: string } {
  if (r.cosmetic) {
    // The week's own rope colours (week 2 is Seafoam, not Coral).
    const c = COSMETICS.find((x) => x.id === r.cosmetic)?.colors ?? ['#FF8C7A', '#FFD1C2'];
    return { art: `<div class="rw-rope">${ropeSwatch(c, 8, size + 10, 16)}${ropeSwatch(c, 8, size + 10, 16)}</div>`, text: 'RARE ROPE' };
  }
  if (r.creature) return { art: porthole(`<span class="myst">${icon('creature', size * 0.62)}<b class="t-stroke">?</b></span>`, size + 6, 'gold-ph'), text: 'MYSTERY' };
  if (r.luckyTide && !r.cash && !r.pearls) return { art: icon('lucky-tide', size), text: 'LUCKY TIDE' };
  if (r.cash && r.pearls) return { art: `<span class="rw-duo">${icon('cash', size * 0.86)}${icon('pearl', size * 0.6)}</span>`, text: formatCash(r.cash) };
  if (r.cash) return { art: icon('cash', size), text: formatCash(r.cash) };
  if (r.pearls) return { art: icon('pearl', size), text: formatPearls(r.pearls) };
  return { art: icon('gift', size), text: '' };
}

export function smallIcon(r: Reward): string {
  const id = r.creature ? 'creature' : r.cosmetic ? 'locker' : r.luckyTide && !r.cash ? 'lucky-tide' : r.pearls && !r.cash ? 'pearl' : 'cash';
  return icon(id, 20);
}

export function rewardLabel(r: Reward): string {
  if (r.cosmetic) return 'a rare rope';
  if (r.creature) return 'Mystery Creature';
  if (r.luckyTide) return 'Lucky Tide';
  if (r.cash) return formatCash(r.cash);
  if (r.pearls) return `${formatPearls(r.pearls)} Pearls`;
  return 'a gift';
}

/** A Mystery Creature reward plays the reveal card (it was granted silently otherwise). */
export function revealReward(env: PanelEnv, r: Reward, chip: string): void {
  const c = r.creature;
  if (!c) return;
  const rarity = getSpecies(c.speciesId).rarity;
  // Species found, like the catch and hatch reveals (the Index header counts mutations too).
  const ix = env.deps.data.index();
  const found = ix.entries.filter((e) => e.mask > 0).length;
  void env.reveal(c, rarity >= 4 ? 'big' : 'compact', `${found}/${ix.entries.length}`, { stamp: 'MYSTERY', chip });
}

/** What the open panel shows; a change re-renders it (gift timers run out while it is open). */
function freeSig(v: ReturnType<PanelEnv['deps']['data']['free']>): string {
  return `${v.daily.claimable}|${v.daily.tiles.map((t) => t.state).join('')}|${v.gifts.gifts.map((g) => g.state).join('')}|${v.luckyTide}|${v.streak}`;
}

export class FreePanel implements PanelContent {
  tab: PanelTab = 'daily';
  private sig = '';
  private timer = 0;
  /** No re-render until then (a claim's lid pop and coin fly play first). */
  private holdUntil = 0;

  constructor(private readonly shell: PanelShell, private readonly env: PanelEnv, tab: PanelTab = 'daily') {
    this.setTab(tab === 'gifts' ? 'gifts' : 'daily', false);
    this.timer = window.setInterval(() => this.tick(), 1000);
  }

  setTab(tab: string, animate = true): void {
    this.tab = tab as PanelTab;
    this.env.deps.actions.panelChanged('free', this.tab);
    this.setTabs();
    this.shell.swapBody(() => this.render(), animate);
  }

  private setTabs(): void {
    const v = this.env.deps.data.free();
    const readyGifts = v.gifts.gifts.filter((g) => g.state === 'ready').length;
    this.shell.setTabs(
      [
        { id: 'daily', label: 'DAILY', icon: 'flame', hue: 'sun', dot: v.daily.claimable },
        { id: 'gifts', label: 'GIFTS', icon: 'gift', hue: 'sun', dot: readyGifts > 0 },
      ],
      this.tab,
      (id) => this.setTab(id),
    );
  }

  refresh(): void {
    this.setTabs();
    this.render();
  }

  /** Once a second: count the locked gift timers down, re-render when a gift or the day turns over. */
  private tick(): void {
    if (!this.shell.el.isConnected || performance.now() < this.holdUntil) return;
    const v = this.env.deps.data.free();
    if (freeSig(v) !== this.sig) {
      this.refresh();
      return;
    }
    for (const e of this.shell.body.querySelectorAll<HTMLElement>('.gf-amt[data-i]')) {
      const g = v.gifts.gifts[Number(e.dataset.i)];
      if (g && g.state === 'locked') e.textContent = fmtClock(g.secondsLeft);
    }
    const next = this.shell.body.querySelector<HTMLElement>('.fr-next');
    if (next) next.textContent = `Next reward in ${fmtDuration(v.daily.resetIn)}`;
  }

  destroy(): void {
    window.clearInterval(this.timer);
  }

  private header(): void {
    const v = this.env.deps.data.free();
    const head = this.shell.head;
    head.innerHTML =
      `<span class="chip chip--sun fr-streak">${icon('flame', 26)}<span class="t-stroke">${v.streak} DAY STREAK</span></span><span class="sp"></span>` +
      `<span class="fr-tide"><span class="chip">${icon('lucky-tide', 26)}<span class="t-stroke">${v.luckyTide}</span></span></span>`;
    if (v.luckyTide > 0) {
      const use = el('button', 'btn btn--grass btn--s', '<span class="label">USE</span>');
      pressable(use, () => {
        this.env.deps.actions.useLuckyTide();
        this.refresh();
      });
      head.querySelector('.fr-tide')?.appendChild(use);
    }
  }

  private render(): void {
    this.sig = freeSig(this.env.deps.data.free());
    this.header();
    const body = this.shell.body;
    body.innerHTML = '';
    const well = el('div', 'well');
    body.appendChild(well);
    if (this.tab === 'daily') this.renderDaily(well, body);
    else this.renderGifts(well, body);
  }

  private dailyTile(t: DailyTile): HTMLElement {
    const { art, text } = rewardArt(t.reward, t.day === 7 ? 56 : 48);
    const tile = el('div', `dt card st-${t.state}${t.day === 7 ? ' d7' : ''}`);
    tile.innerHTML =
      `<span class="dt-day t-d">DAY ${t.day}</span><span class="dt-art">${art}</span><span class="dt-amt t-d">${text}</span>` +
      (t.state === 'claimed' ? `<span class="dt-stamp">${icon('check', 44)}</span>` : '') +
      (t.state === 'tomorrow' ? '<span class="dt-rib">TOMORROW</span>' : '');
    return tile;
  }

  private renderDaily(well: HTMLElement, body: HTMLElement): void {
    const v = this.env.deps.data.free().daily;
    const row = el('div', 'dt-row stagger');
    for (const t of v.tiles) {
      const cell = el('div', 'dt-cell');
      cell.appendChild(this.dailyTile(t));
      if (t.state === 'today' && v.claimable) {
        const b = el('button', 'btn btn--grass btn--s dt-claim', '<span class="label">CLAIM</span>');
        b.dataset.anchor = 'free:claim';
        pressable(b, () => {
          if (!this.env.deps.data.free().daily.claimable) return;
          const from = this.env.centerOf(b);
          this.env.deps.actions.claimDaily();
          if (t.reward.cash) void this.env.coinFly(from, t.reward.cash, 'cash');
          if (t.reward.pearls) void this.env.coinFly(from, t.reward.pearls, 'pearl', 6);
          this.env.confetti(from, 30, '#FFC92E');
          revealReward(this.env, t.reward, `Day ${t.day} reward`);
          // (claimDaily toasts "Tomorrow: ..." itself.)
          this.refresh();
        });
        cell.appendChild(b);
      }
      row.appendChild(cell);
    }
    well.appendChild(row);
    const foot = el('div', 'panel-foot fr-foot', `<span class="t-sm fr-next">Next reward in ${fmtDuration(v.resetIn)}</span>`);
    body.appendChild(foot);
    requestAnimationFrame(() => {
      const today = row.querySelector('.st-today') as HTMLElement | null;
      today?.scrollIntoView({ block: 'nearest', inline: 'center' });
    });
  }

  private renderGifts(well: HTMLElement, body: HTMLElement): void {
    const v = this.env.deps.data.free().gifts;
    const strip = el('div', 'gf-strip stagger');
    v.gifts.forEach((g, i) => {
      const cell = el('div', 'gf-cell');
      const mega = i === v.gifts.length - 1;
      const box = el('div', `gf card st-${g.state}${mega ? ' mega' : ''}`);
      const { text } = rewardArt(g.reward, 34);
      box.innerHTML =
        `<span class="gf-box">${icon('gift', mega ? 60 : 52)}</span>` +
        `<span class="gf-amt t-d"${g.state === 'locked' ? ` data-i="${i}"` : ''}>${g.state === 'locked' ? fmtClock(g.secondsLeft) : `${smallIcon(g.reward)}${text.length > 7 ? '' : text}`}</span>` +
        (g.state === 'claimed' ? `<span class="dt-stamp">${icon('check', 40)}</span>` : '') +
        (mega ? '<span class="gf-mega">MEGA</span>' : '');
      cell.appendChild(box);
      if (g.state === 'ready') {
        pressable(box, () => this.claimGift(i, box, box));
        const b = el('button', 'btn btn--grass btn--s gf-claim', '<span class="label">CLAIM</span>');
        pressable(b, () => this.claimGift(i, box, b));
        cell.appendChild(b);
      }
      strip.appendChild(cell);
    });
    well.appendChild(strip);
    const ready = v.gifts.filter((g) => g.state === 'ready').length;
    const foot = el('div', 'panel-foot');
    if (ready >= 2) {
      const all = el('button', 'btn btn--grass btn--l btn--shine', `${icon('gift', 36)}<span class="label">CLAIM ALL</span>`);
      pressable(all, () => {
        const from = this.env.centerOf(all);
        const rewards = this.env.deps.data.free().gifts.gifts.filter((g) => g.state === 'ready').map((g) => g.reward);
        if (!rewards.length) return;
        this.env.deps.actions.claimGift('all');
        const cash = rewards.reduce((s, r) => s + (r.cash ?? 0), 0);
        const pearls = rewards.reduce((s, r) => s + (r.pearls ?? 0), 0);
        if (cash) void this.env.coinFly(from, cash, 'cash', 10);
        if (pearls) void this.env.coinFly(from, pearls, 'pearl', 6);
        this.env.confetti(from, 40, '#FFC92E');
        for (const r of rewards) revealReward(this.env, r, 'Gift reward');
        this.refresh();
      });
      foot.appendChild(all);
    } else foot.innerHTML = `<span class="t-sm">Play to unlock more gifts</span>`;
    body.appendChild(foot);
  }

  private claimGift(i: number, box: HTMLElement, btn: HTMLElement): void {
    const g = this.env.deps.data.free().gifts.gifts[i];
    // A second tap before the 260 ms refresh would re-run the effects (denied buzz, phantom coin fly).
    if (!g || g.state !== 'ready') return;
    const from = this.env.centerOf(btn);
    this.env.deps.actions.claimGift(i);
    box.classList.replace('st-ready', 'st-claimed');
    box.parentElement?.querySelector('.gf-claim')?.remove();
    replay(box.querySelector('.gf-box') as HTMLElement, 'lid-pop');
    if (g.reward.cash) void this.env.coinFly(from, g.reward.cash, 'cash');
    if (g.reward.pearls) void this.env.coinFly(from, g.reward.pearls, 'pearl', 5);
    this.env.confetti(from, 16, '#FFC92E');
    revealReward(this.env, g.reward, i === this.env.deps.data.free().gifts.gifts.length - 1 ? 'MEGA gift' : 'Gift reward');
    this.holdUntil = performance.now() + 400;
    window.setTimeout(() => this.refresh(), 260);
  }
}
