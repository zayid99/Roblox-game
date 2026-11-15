// FREE panel (§9.2, §9.3): streak, Lucky Tide and 2× Cash Boost header; DAILY calendar, GIFTS and MISSIONS tabs.
import '../economy.css';
import type { DailyTile, MissionRow, PanelTab, Reward } from '../../contracts';
import { COSMETICS } from '../../game/cosmetics';
import { getSpecies } from '../../game/creatures';
import { formatCash, formatPearls } from '../../game/economy';
import { porthole, ropeSwatch } from '../art';
import { el, escapeHtml, fmtClock, fmtDuration, pressable, replay } from '../dom';
import { rewardChip } from '../parts/tracker';
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
  if (r.boost2xSec && !r.cash) return { art: icon('boost', size), text: `2× ${Math.round(r.boost2xSec / 60)} MIN` };
  if (r.cash && r.pearls) return { art: `<span class="rw-duo">${icon('cash', size * 0.86)}${icon('pearl', size * 0.6)}</span>`, text: formatCash(r.cash) };
  if (r.cash) return { art: icon('cash', size), text: formatCash(r.cash) };
  if (r.pearls) return { art: icon('pearl', size), text: formatPearls(r.pearls) };
  return { art: icon('gift', size), text: '' };
}

export function smallIcon(r: Reward): string {
  const id = r.creature
    ? 'creature'
    : r.cosmetic
      ? 'locker'
      : r.luckyTide && !r.cash
        ? 'lucky-tide'
        : r.boost2xSec && !r.cash
          ? 'boost'
          : r.pearls && !r.cash
            ? 'pearl'
            : 'cash';
  return icon(id, 20);
}

export function rewardLabel(r: Reward): string {
  if (r.cosmetic) return 'a rare rope';
  if (r.creature) return 'Mystery Creature';
  if (r.luckyTide) return 'Lucky Tide';
  if (r.boost2xSec && !r.cash) return `${Math.round(r.boost2xSec / 60)} min of 2× cash`;
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
  const ms = v.missions;
  const missions = `${ms.unlocked}|${ms.rows.map((r) => `${r.text}${+r.claimable}${+r.claimed}${+r.canReroll}`).join(',')}|${+ms.bonus.claimable}${+ms.bonus.claimed}`;
  return `${v.daily.claimable}|${v.daily.tiles.map((t) => t.state).join('')}|${v.gifts.gifts.map((g) => g.state).join('')}|${v.luckyTide}|${v.streak}|${missions}|${v.boost.sec > 0}${v.boost.canAd}`;
}

export class FreePanel implements PanelContent {
  tab: PanelTab = 'daily';
  private sig = '';
  private timer = 0;
  /** No re-render until then (a claim's lid pop and coin fly play first). */
  private holdUntil = 0;

  constructor(private readonly shell: PanelShell, private readonly env: PanelEnv, tab: PanelTab = 'daily') {
    this.setTab(tab === 'gifts' || tab === 'missions' ? tab : 'daily', false);
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
    const missionDot = v.missions.rows.some((r) => r.claimable) || v.missions.bonus.claimable;
    this.shell.setTabs(
      [
        { id: 'daily', label: 'DAILY', icon: 'flame', hue: 'sun', dot: v.daily.claimable },
        { id: 'gifts', label: 'GIFTS', icon: 'gift', hue: 'sun', dot: readyGifts > 0 },
        { id: 'missions', label: 'MISSIONS', icon: 'check', hue: 'sky', dot: missionDot, hidden: !v.missions.unlocked },
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
    for (const e of this.shell.body.querySelectorAll<HTMLElement>('.gf-amt[data-i] .gf-t')) {
      const g = v.gifts.gifts[Number((e.parentElement as HTMLElement).dataset.i)];
      if (g && g.state === 'locked') e.textContent = fmtClock(g.secondsLeft);
    }
    const next = this.shell.body.querySelector<HTMLElement>('.fr-next');
    if (next) next.textContent = `Next reward in ${fmtDuration(v.daily.resetIn)}`;
    const mnext = this.shell.body.querySelector<HTMLElement>('.ms-next');
    if (mnext) mnext.textContent = `New missions in ${fmtDuration(v.missions.resetIn)}`;
    const boost = this.shell.head.querySelector<HTMLElement>('.fr-boost .bt');
    if (boost) boost.textContent = v.boost.sec > 0 ? fmtClock(Math.ceil(v.boost.sec)) : 'CASH';
  }

  destroy(): void {
    window.clearInterval(this.timer);
  }

  private header(): void {
    const v = this.env.deps.data.free();
    const head = this.shell.head;
    head.innerHTML =
      `<span class="chip chip--sun fr-streak">${icon('flame', 26)}<span class="t-stroke">${v.streak}<span class="fr-ds"> DAY STREAK</span></span></span><span class="sp"></span>` +
      `<span class="fr-tide"><span class="chip">${icon('lucky-tide', 26)}<span class="t-stroke">${v.luckyTide}</span></span></span>`;
    if (v.luckyTide > 0) {
      const use = el('button', 'btn btn--grass btn--s', '<span class="label">USE</span>');
      pressable(use, () => {
        this.env.deps.actions.useLuckyTide();
        this.refresh();
      });
      head.querySelector('.fr-tide')?.appendChild(use);
    }
    // 2× Cash Boost: what is stored (it runs while you play) and, with the SDK, a rewarded ad for +5 min.
    if (v.boost.sec > 0 || v.boost.canAd) {
      const box = el('span', 'fr-boost');
      box.innerHTML = `<span class="chip chip--sun">${icon('boost', 28)}<span class="t-stroke"><span class="bt-x">2× </span><span class="bt">${v.boost.sec > 0 ? fmtClock(Math.ceil(v.boost.sec)) : 'CASH'}</span></span></span>`;
      if (v.boost.canAd) {
        const ad = el('button', 'btn btn--grass btn--s fr-boost-ad', `${icon('play', 22)}<span class="label">+${Math.round(v.boost.adSec / 60)} MIN</span>`);
        ad.title = `Watch an ad: +${Math.round(v.boost.adSec / 60)} min of 2× cash (up to ${Math.round(v.boost.capSec / 60)} min)`;
        pressable(ad, () => this.env.deps.actions.watchBoostAd());
        box.appendChild(ad);
      }
      const tide = head.querySelector('.fr-tide');
      head.insertBefore(box, tide);
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
    else if (this.tab === 'missions') this.renderMissions(well, body);
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
        `<span class="gf-amt t-d"${g.state === 'locked' ? ` data-i="${i}"` : ''}>${g.state === 'locked' ? `${smallIcon(g.reward)}<span class="gf-t">${fmtClock(g.secondsLeft)}</span>` : `${smallIcon(g.reward)}${text.length > 7 ? '' : text}`}</span>` +
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

  // ---------- Daily Missions (economy) ----------

  private missionRow(r: MissionRow, i: number): HTMLElement {
    const row = el('div', `ms-row card tier-${r.tier}${r.claimed ? ' st-claimed' : ''}`);
    const count = r.target >= 1000 ? `${Math.round(r.progress * 100)}%` : `${r.value}/${r.target}`;
    row.innerHTML =
      `<span class="ms-ic">${icon(r.icon, 34)}</span>` +
      `<span class="ms-mid"><span class="ms-tier t-d">${r.tier.toUpperCase()}</span><span class="ms-tx">${escapeHtml(r.text)}</span>` +
      `<span class="ms-bar"><i style="transform:scaleX(${r.progress})"></i><b class="t-d">${count}</b></span></span>` +
      `<span class="ms-rw t-d">${rewardChip(r.reward, 20)}</span>`;
    const act = el('span', 'ms-act');
    if (r.claimed) act.innerHTML = icon('check', 40);
    else if (r.claimable) {
      const b = el('button', 'btn btn--grass btn--s ms-claim', '<span class="label">CLAIM</span>');
      pressable(b, () => this.claimMission(i, b, r.reward));
      act.appendChild(b);
    } else if (r.canReroll) {
      const b = el('button', 'btn btn--s ms-reroll', `${icon('rebirth', 22)}`);
      b.title = 'New mission (one free swap per day)';
      pressable(b, () => {
        this.env.deps.actions.rerollMission(i);
        this.refresh();
      });
      act.appendChild(b);
    }
    row.appendChild(act);
    return row;
  }

  private renderMissions(well: HTMLElement, body: HTMLElement): void {
    const v = this.env.deps.data.free().missions;
    const list = el('div', 'ms-list stagger');
    if (!v.unlocked) list.innerHTML = '<span class="t-sm">Missions unlock after the tutorial</span>';
    v.rows.forEach((r, i) => list.appendChild(this.missionRow(r, i)));
    const done = v.rows.filter((r) => r.claimed).length;
    const bonus = el('div', `ms-bonus card${v.bonus.claimed ? ' st-claimed' : ''}`);
    bonus.innerHTML =
      `<span class="ms-ic">${icon('gift', 40)}</span>` +
      `<span class="ms-mid"><span class="ms-tx">Finish all 3: ${rewardLabel(v.bonus.reward)}${v.bonus.reward.pearls ? ` + ${v.bonus.reward.pearls} Pearls` : ''}</span>` +
      `<span class="ms-bar"><i style="transform:scaleX(${done / Math.max(1, v.rows.length)})"></i><b class="t-d">${done}/${v.rows.length}</b></span></span>`;
    const act = el('span', 'ms-act');
    if (v.bonus.claimed) act.innerHTML = icon('check', 40);
    else if (v.bonus.claimable) {
      const b = el('button', 'btn btn--grass btn--s btn--shine ms-claim', '<span class="label">OPEN</span>');
      pressable(b, () => this.claimMission('bonus', b, v.bonus.reward));
      act.appendChild(b);
    }
    bonus.appendChild(act);
    list.appendChild(bonus);
    well.appendChild(list);
    body.appendChild(el('div', 'panel-foot fr-foot', `<span class="t-sm ms-next">New missions in ${fmtDuration(v.resetIn)}</span>`));
  }

  private claimMission(i: number | 'bonus', btn: HTMLElement, reward: Reward): void {
    const v = this.env.deps.data.free().missions;
    const ok = i === 'bonus' ? v.bonus.claimable : !!v.rows[i]?.claimable;
    if (!ok) return;
    const from = this.env.centerOf(btn);
    this.env.deps.actions.claimMission(i);
    if (reward.cash) void this.env.coinFly(from, reward.cash, 'cash');
    if (reward.pearls) void this.env.coinFly(from, reward.pearls, 'pearl', 5);
    this.env.confetti(from, i === 'bonus' ? 40 : 18, '#FFC92E');
    revealReward(this.env, reward, i === 'bonus' ? 'Missions bonus' : 'Mission reward');
    this.holdUntil = performance.now() + 400;
    window.setTimeout(() => this.refresh(), 260);
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
