// Hatchery panel: EGGS tab (buy and hatch an egg per reached zone) and BUDDY tab (pick the creature
// that follows you and boosts delivery cash). Logic lives in game/hatchery.ts.
import '../hatchery.css';
import type { PanelTab } from '../../contracts';
import { RARITIES, getSpecies, type CreatureRef } from '../../game/creatures';
import { formatCash, formatIncome } from '../../game/economy';
// Type-only: a runtime import of game/hatchery from the UI makes the bundler split a shared chunk off.
import type { BuddyOption, EggView, HatchOutcome, HatcheryView } from '../../game/hatchery';
import { porthole } from '../art';
import { deny, el, escapeHtml, pressable, replay, uiSound } from '../dom';
import { icon } from '../icons';
import { RARITY_LETTER, mutationGem, shapeCue } from '../parts/carry';
import { rarityPill } from '../reveal';
import type { PanelEnv } from './env';
import type { PanelContent, PanelShell, TabDef } from './panel';

const INK = '#1B1736';

/** "10%", "0.2%" */
function formatPct(p: number): string {
  const v = p * 100;
  return `${v >= 1 ? Math.round(v) : Number(v.toFixed(1))}%`;
}
let uid = 0;

/** Spot layout on the 100×120 egg (x, y, r). */
const SPOTS: [number, number, number][] = [[62, 30, 7], [32, 52, 6], [66, 64, 9], [42, 84, 5], [72, 90, 5], [26, 76, 4]];
const ZIG: [number, number][] = [[0, 64], [12, 64], [22, 55], [32, 66], [42, 54], [52, 67], [62, 55], [72, 66], [82, 56], [92, 64], [100, 62]];

/**
 * A toon egg in a straw nest (viewBox 100×124). The shell is split into a top and a bottom half along a
 * zigzag so the hatch can pop the top off; `crack` 0..3 draws the hairline cracks.
 */
export function eggSvg(colors: [string, string], size: number, opts: { locked?: boolean; nest?: boolean; secret?: boolean } = {}): string {
  const id = `egg${uid++}`;
  const [shell, spot] = opts.locked ? ['#5B7590', '#3F5670'] : colors;
  const egg = 'M50 6C72 6 88 40 88 68C88 94 71 112 50 112C29 112 12 94 12 68C12 40 28 6 50 6Z';
  const zig = ZIG.map(([x, y]) => `${x} ${y}`).join('L');
  const topClip = `M0 0H100V62L${ZIG.slice().reverse().map(([x, y]) => `${x} ${y}`).join('L')}Z`;
  const botClip = `M${zig}V124H0Z`;
  const spots = SPOTS.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${spot}"/>`).join('');
  const stars = opts.secret && !opts.locked
    ? `<path d="M30 30l2 5 5 2-5 2-2 5-2-5-5-2 5-2z M70 78l1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5z" fill="#FFF07A"/>`
    : '';
  const body = (clip: string) =>
    `<g clip-path="url(#${id}-${clip})"><g clip-path="url(#${id}-e)">` +
    `<rect x="0" y="0" width="100" height="124" fill="${shell}"/>${spots}${stars}` +
    `<rect width="100" height="124" fill="rgba(27,23,54,.24)" mask="url(#${id}-m)"/>` +
    `<ellipse cx="36" cy="32" rx="8" ry="14" fill="#fff" opacity=".55" transform="rotate(24 36 32)"/>` +
    `</g><path d="${egg}" fill="none" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/></g>`;
  const nestBack = opts.nest === false ? '' : `<ellipse cx="50" cy="106" rx="44" ry="11" fill="#B97E2A" stroke="${INK}" stroke-width="5"/>`;
  const nestFront =
    opts.nest === false
      ? ''
      : `<path d="M4 104Q50 124 96 104L91 114Q50 132 9 114Z" fill="#E9B44C" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>` +
        `<path d="M14 112L20 118M28 115L31 121M44 117L44 123M58 117L56 123M72 115L69 121M85 111L80 117" stroke="#B97E2A" stroke-width="3" stroke-linecap="round"/>`;
  return (
    `<svg class="egg-svg" width="${size}" height="${Math.round(size * 1.24)}" viewBox="0 0 100 124" aria-hidden="true">` +
    `<defs><clipPath id="${id}-e"><path d="${egg}"/></clipPath>` +
    `<clipPath id="${id}-t"><path d="${topClip}"/></clipPath><clipPath id="${id}-b"><path d="${botClip}"/></clipPath>` +
    `<mask id="${id}-m" maskUnits="userSpaceOnUse" x="0" y="0" width="100" height="124"><rect width="100" height="124" fill="#fff"/><path d="${egg}" fill="#000" transform="translate(-8 -9)"/></mask></defs>` +
    `<ellipse class="egg-shadow" cx="50" cy="112" rx="34" ry="7" fill="rgba(27,23,54,.35)"/>` +
    nestBack +
    `<g class="egg-shell"><path d="${egg}" fill="${INK}" transform="translate(0 4)"/>` +
    `<g class="egg-bot">${body('b')}</g><g class="egg-top">${body('t')}</g>` +
    `<g class="egg-cracks" fill="none" stroke="${INK}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round">` +
    `<path class="c1" d="M50 22L45 33L53 39L47 50"/><path class="c2" d="M74 42L67 50L73 57L66 62"/><path class="c3" d="M${ZIG.slice(1, -1).map(([x, y]) => `${x} ${y}`).join('L')}"/></g></g>` +
    nestFront +
    `</svg>`
  );
}

function oddsHtml(e: EggView): string {
  return e.odds
    .map((o) => `<span class="hx-o" data-r="${o.rarity}"><b>${RARITY_LETTER[o.rarity]}</b><span>${RARITIES[o.rarity].name}</span><i>${formatPct(o.p)}</i></span>`)
    .join('');
}

export class HatcheryPanel implements PanelContent {
  tab: PanelTab = 'eggs';
  private stage: HTMLElement | null = null;
  private timers: number[] = [];
  private busy = false;
  private portraitTimer = 0;

  constructor(private readonly shell: PanelShell, private readonly env: PanelEnv, tab: 'eggs' | 'buddy' = 'eggs') {
    this.setTab(tab, false);
  }

  private get view(): HatcheryView {
    return this.env.deps.data.hatchery();
  }

  private tabs(): TabDef[] {
    return [
      { id: 'eggs', label: 'EGGS', icon: 'egg', hue: 'teal' },
      { id: 'buddy', label: 'BUDDY', icon: 'buddy', hue: 'coral', dot: !this.view.buddy && this.view.options.length > 0 },
    ];
  }

  setTab(tab: string, animate = true): void {
    if (this.busy) return;
    this.tab = tab === 'buddy' ? 'buddy' : 'eggs';
    this.env.deps.actions.panelChanged('hatchery', this.tab);
    this.shell.setTitle(this.tab === 'buddy' ? 'BUDDY' : 'HATCHERY', this.tab === 'buddy' ? 'coral' : 'teal');
    this.shell.setTabs(this.tabs(), this.tab, (id) => this.setTab(id));
    this.shell.swapBody((body) => this.fill(body), animate);
  }

  refresh(): void {
    if (this.busy) return;
    this.shell.body.innerHTML = '';
    this.fill(this.shell.body, false);
  }

  private fill(body: HTMLElement, stagger = true): void {
    const v = this.view;
    if (this.tab === 'eggs') this.fillEggs(body, v, stagger);
    else this.fillBuddy(body, v, stagger);
  }

  // ---------------------------------------------------------------- EGGS
  private fillEggs(body: HTMLElement, v: HatcheryView, stagger: boolean): void {
    const muts = v.mutations.map((m) => `<span class="hx-mut">${mutationGem(m.mutation, 20)}<b>${formatPct(m.p)}</b></span>`).join('');
    this.shell.head.innerHTML =
      `<span class="chip hx-count">${icon('egg', 30)}<span class="t-stroke">HATCHED ${v.hatched}</span></span>` +
      (v.buddy ? `<span class="chip chip--coral hx-bchip">${icon('buddy', 26)}<span class="t-stroke">BUDDY +${Math.round(v.buddy.bonus * 100)}%</span></span>` : '') +
      `<span class="sp"></span><span class="hx-muts"><span class="hx-ml">Mutations</span>${muts}</span>`;
    const well = el('div', 'well hx-well');
    const grid = el('div', `hx-grid${stagger ? ' stagger' : ''}`);
    for (const e of v.eggs) grid.appendChild(this.eggCell(e));
    well.appendChild(grid);
    body.appendChild(well);
  }

  private eggCell(e: EggView): HTMLElement {
    const r = e.rarity;
    const cell = el('div', 'hx-cell');
    const card = el('div', `card-item hx-card${e.unlocked ? '' : ' unknown'}${e.unlocked && r >= 3 ? ' notch' : ''}`);
    card.dataset.r = String(r);
    card.dataset.anchor = `hatchery:egg:${e.zone}`;
    const sp = e.species
      .map((s) => {
        const ref = { speciesId: s.id, mutation: 0 };
        return `<span class="hx-sp${s.found ? '' : ' unknown'}" title="${s.found ? escapeHtml(s.name) : '???'}">${this.ph(ref, 34)}</span>`;
      })
      .join('');
    card.innerHTML =
      (e.unlocked && r >= 4 ? '<span class="sunburst"></span>' : '') +
      (e.unlocked ? shapeCue(r) : '') +
      `<div class="hx-art">${eggSvg(e.colors, 74, { locked: !e.unlocked, secret: r === 6 })}${e.unlocked ? '' : `<span class="hx-lock">${icon('lock', 34)}</span>`}</div>` +
      `<span class="ci-name t-stroke">${escapeHtml(e.name)}</span>` +
      (e.unlocked ? `<div class="hx-odds">${oddsHtml(e)}</div><div class="hx-sps">${sp}</div>` : `<span class="hint">Reach ${escapeHtml(e.zoneName)} to unlock</span>`);
    cell.appendChild(card);
    let foot: HTMLElement;
    if (!e.unlocked) foot = el('span', 'chip hx-locked', `${icon('lock', 18)}<span class="t-stroke">LOCKED</span>`);
    else {
      foot = el('button', `btn btn--s hx-btn ${e.affordable ? 'btn--grass' : 'btn--cant'}`, `${icon('cash', 26)}<span class="label">${formatCash(e.price)}</span>`);
      foot.dataset.anchor = `hatchery:buy:${e.zone}`;
      pressable(foot, () => this.hatch(e.zone, foot), { sound: null });
    }
    cell.appendChild(foot);
    return cell;
  }

  private hatch(zone: number, btn: HTMLElement): void {
    if (this.busy) return;
    const egg = this.view.eggs[zone];
    if (!egg || !egg.unlocked || !egg.affordable) {
      deny(btn);
      return;
    }
    const out = this.env.deps.actions.hatchEgg(zone);
    if (!out) {
      deny(btn);
      return;
    }
    uiSound('ui.click');
    this.playHatch(egg, out);
  }

  /** Wobble, crack, pop, then the big reveal card and a result card with HATCH AGAIN. */
  private playHatch(egg: EggView, out: HatchOutcome): void {
    this.busy = true;
    this.stage?.remove();
    const reduce = this.env.reduce();
    const stage = el('div', 'hx-stage');
    stage.dataset.r = String(getSpecies(out.ref.speciesId).rarity);
    stage.innerHTML =
      `<div class="hx-rays"></div><div class="hx-big" data-crack="0">${eggSvg(egg.colors, 170, { secret: egg.rarity === 6 })}</div>` +
      `<div class="hx-cap t-stroke">${escapeHtml(egg.name.toUpperCase())}</div>`;
    stage.addEventListener('pointerdown', (ev) => ev.stopPropagation());
    this.shell.el.appendChild(stage);
    this.stage = stage;
    const big = stage.querySelector('.hx-big') as HTMLElement;
    const at = (ms: number, fn: () => void) => this.timers.push(window.setTimeout(fn, ms));
    const wobbles = reduce ? 0 : 3;
    for (let k = 0; k < wobbles; k++) {
      at(380 + k * 430, () => {
        big.dataset.crack = String(k + 1);
        replay(big, 'wob');
        uiSound('eggWobble', k);
      });
    }
    const crackAt = reduce ? 250 : 380 + wobbles * 430 + 120;
    at(crackAt, () => {
      uiSound('eggCrack');
      big.dataset.crack = '3';
      big.classList.add('open');
      const r = getSpecies(out.ref.speciesId).rarity;
      this.env.confetti(this.env.centerOf(big), 30 + r * 8, RARITIES[r].color);
      this.env.flash('#FFFFFF', 140);
    });
    at(crackAt + 380, () => {
      const r = getSpecies(out.ref.speciesId).rarity;
      const ix = this.env.deps.data.index();
      const found = ix.entries.filter((x) => x.mask > 0).length;
      const isNew = out.isNewSpecies || out.isNewMutation;
      void this.env
        .reveal(out.ref, 'big', `${found}/${ix.entries.length}`, {
          stamp: isNew ? 'NEW' : 'HATCHED',
          chip: out.isNewSpecies ? undefined : out.isNewMutation ? 'New mutation in the Index' : `From the ${egg.name}`,
          sub: `${out.ref.mutation > 0 ? `${['', 'Gold', 'Diamond', 'Rainbow'][out.ref.mutation]} ` : ''}${RARITIES[r].name} from the ${egg.name}`,
        })
        .then(() => this.showResult(egg, out));
    });
  }

  private showResult(egg: EggView, out: HatchOutcome): void {
    const stage = this.stage;
    if (!stage) return;
    const v = this.view;
    const sp = getSpecies(out.ref.speciesId);
    const r = sp.rarity;
    const name = out.ref.mutation > 0 ? `${['', 'Gold', 'Diamond', 'Rainbow'][out.ref.mutation]} ${sp.name}` : sp.name;
    const placed = out.result.placed.some((c) => c.speciesId === out.ref.speciesId && c.mutation === out.ref.mutation);
    const soldSelf = out.result.sold.find((s) => s.creature.speciesId === out.ref.speciesId && s.creature.mutation === out.ref.mutation && !placed);
    const replaced = placed ? out.result.sold[0] : undefined;
    const where = !placed && soldSelf
      ? `Base full: sold for ${formatCash(soldSelf.cash)}`
      : replaced
        ? `Swapped for your ${escapeHtml(getSpecies(replaced.creature.speciesId).name)} (+${formatCash(replaced.cash)})`
        : 'Sent to your base';
    const opt = v.options.find((o) => o.ref.speciesId === out.ref.speciesId && o.ref.mutation === out.ref.mutation);
    const canBuddy = placed && opt && !opt.equipped && (!v.buddy || opt.bonus > v.buddy.bonus);
    const again = v.eggs[egg.zone];
    stage.innerHTML =
      `<div class="hx-rays"></div>` +
      `<div class="hx-res" data-r="${r}">` +
      `<div class="hx-res-ph">${this.ph(out.ref, 150)}${out.ref.mutation ? mutationGem(out.ref.mutation, 34) : ''}</div>` +
      `<div class="hx-res-name t-stroke">${escapeHtml(name)}</div>` +
      `<div class="hx-res-row">${rarityPill(r)}<span class="chip hx-inc">${icon('arrow-up', 14)}+${formatIncome(opt ? opt.income : 0)}</span></div>` +
      `<div class="hx-res-where">${icon(placed ? 'pedestal' : 'cash', 26)}<span>${where}</span></div>` +
      `<div class="hx-res-btns"></div></div>`;
    const btns = stage.querySelector('.hx-res-btns') as HTMLElement;
    const ok = el('button', 'btn btn--sky btn--s hx-ok', '<span class="label">DONE</span>');
    pressable(ok, () => this.closeStage());
    const more = el('button', `btn btn--s hx-again ${again.affordable ? 'btn--grass' : 'btn--cant'}`, `${icon('egg', 28)}<span class="label">AGAIN ${formatCash(again.price)}</span>`);
    more.dataset.anchor = 'hatchery:again';
    pressable(more, () => {
      const e = this.view.eggs[egg.zone];
      if (!e.affordable) {
        deny(more);
        return;
      }
      const o = this.env.deps.actions.hatchEgg(egg.zone);
      if (!o) {
        deny(more);
        return;
      }
      this.clearTimers();
      this.busy = false;
      this.playHatch(e, o);
    }, { sound: null });
    btns.append(more);
    if (canBuddy && opt) {
      const bud = el('button', 'btn btn--coral btn--s hx-mkbuddy', `${icon('buddy', 26)}<span class="label">BUDDY +${Math.round(opt.bonus * 100)}%</span>`);
      pressable(bud, () => {
        this.env.deps.actions.setBuddy(opt.ref);
        this.closeStage();
      });
      btns.append(bud);
    }
    btns.append(ok);
    this.busy = false;
  }

  private closeStage(): void {
    this.clearTimers();
    this.busy = false;
    const s = this.stage;
    this.stage = null;
    if (s) {
      s.classList.add('out');
      window.setTimeout(() => s.remove(), 160);
    }
    this.shell.setTabs(this.tabs(), this.tab, (id) => this.setTab(id));
    this.refresh();
  }

  // ---------------------------------------------------------------- BUDDY
  private fillBuddy(body: HTMLElement, v: HatcheryView, stagger: boolean): void {
    this.shell.head.innerHTML =
      `<span class="hx-scale t-sm">Rarer Buddies earn more: ${RARITY_LETTER.map((l, i) => `<span class="hx-o" data-r="${i}"><b>${l}</b><i>+${(i + 1) * 5}%</i></span>`).join('')}</span>`;
    const top = el('div', 'card hx-cur');
    const b = v.buddy;
    if (b) {
      top.innerHTML =
        `<div class="hx-cur-ph" data-r="${b.rarity}">${this.ph(b.ref, 104)}</div>` +
        `<div class="hx-cur-mid"><div class="hx-cur-l">YOUR BUDDY</div><div class="hx-cur-nm">${escapeHtml(b.name)}</div>${rarityPill(b.rarity)}</div>` +
        `<div class="hx-cur-bonus"><span class="t-grad hx-pct"><span>+${Math.round(b.bonus * 100)}%</span></span><span class="hx-cur-sub">cash from deliveries</span></div>`;
      const un = el('button', 'btn btn--cant keep-white btn--s hx-un', '<span class="label">UNEQUIP</span>');
      pressable(un, () => {
        this.env.deps.actions.setBuddy(null);
        this.shell.setTabs(this.tabs(), this.tab, (id) => this.setTab(id));
        this.refresh();
      });
      top.appendChild(un);
    } else {
      top.innerHTML =
        `<div class="hx-cur-ph empty">${porthole(`<span class="hx-empty">${icon('buddy', 64)}</span>`, 104)}</div>` +
        `<div class="hx-cur-mid"><div class="hx-cur-l">NO BUDDY YET</div><div class="hx-cur-txt">Pick a creature from your base. It follows you everywhere and boosts the cash you get for every delivery.</div></div>`;
    }
    const well = el('div', 'well hx-well');
    const list = el('div', `hx-bgrid${stagger ? ' stagger' : ''}`);
    if (!v.options.length) list.appendChild(el('div', 'hx-none t-sm', 'Bring creatures home to pick a Buddy.'));
    for (const o of v.options) list.appendChild(this.buddyCell(o));
    well.appendChild(list);
    body.append(top, well);
  }

  private buddyCell(o: BuddyOption): HTMLElement {
    const cell = el('div', 'lk-cell hx-bcell');
    const r = o.rarity;
    const card = el('div', `card-item hx-bcard${r >= 3 ? ' notch' : ''}${o.equipped ? ' sel' : ''}`);
    card.dataset.r = String(r);
    card.innerHTML =
      (r >= 4 ? '<span class="sunburst"></span>' : '') +
      shapeCue(r) +
      `<span class="ci-inc t-stroke hx-bon">+${Math.round(o.bonus * 100)}%</span>` +
      this.ph(o.ref, 84) +
      (o.ref.mutation ? `<span class="hx-mg">${mutationGem(o.ref.mutation, 22)}</span>` : '') +
      `<span class="ci-name t-stroke">${escapeHtml(o.name)}</span>` +
      rarityPill(r);
    pressable(card, () => {
      const ph = card.querySelector('.porthole') as HTMLElement;
      replay(ph, 'rock');
      this.env.deps.voice(o.ref.speciesId);
    }, { sound: null });
    cell.appendChild(card);
    let foot: HTMLElement;
    if (o.equipped) foot = el('span', 'chip chip--grass lk-eq', `${icon('check', 18)}<span class="t-stroke">BUDDY</span>`);
    else {
      foot = el('button', 'btn btn--coral btn--s lk-btn', '<span class="label">EQUIP</span>');
      pressable(foot, () => {
        this.env.deps.actions.setBuddy(o.ref as CreatureRef);
        this.env.confetti(this.env.centerOf(card), 14, RARITIES[r].color);
        this.shell.setTabs(this.tabs(), this.tab, (id) => this.setTab(id));
        this.refresh();
      });
    }
    cell.appendChild(foot);
    return cell;
  }

  /** A portrait porthole; pending portraits fill in when the portrait factory has rendered them. */
  private ph(c: CreatureRef, size: number): string {
    const src = this.env.deps.portraits.get(c);
    if (src) return porthole(`<img src="${src}" alt="" draggable="false">`, size);
    this.env.deps.portraits.request(c);
    this.schedulePortraits();
    return porthole(`<span class="hx-pimg" data-sp="${escapeHtml(c.speciesId)}" data-m="${c.mutation}"></span>`, size, 'pending');
  }

  private schedulePortraits(): void {
    if (this.portraitTimer) return;
    let tries = 0;
    this.portraitTimer = window.setInterval(() => {
      const left = this.shell.el.querySelectorAll<HTMLElement>('.hx-pimg');
      for (const e of left) {
        const src = this.env.deps.portraits.get({ speciesId: e.dataset.sp ?? '', mutation: Number(e.dataset.m) || 0 });
        if (!src) continue;
        e.closest('.porthole')?.classList.remove('pending');
        e.outerHTML = `<img src="${src}" alt="" draggable="false">`;
      }
      if (!left.length || ++tries > 60) {
        window.clearInterval(this.portraitTimer);
        this.portraitTimer = 0;
      }
    }, 120);
  }

  private clearTimers(): void {
    for (const t of this.timers) window.clearTimeout(t);
    this.timers = [];
  }

  anchor(id: string): HTMLElement | null {
    return this.shell.el.querySelector(`[data-anchor="${CSS.escape(id)}"]`) as HTMLElement | null;
  }

  destroy(): void {
    this.clearTimers();
    window.clearInterval(this.portraitTimer);
    this.stage?.remove();
    this.stage = null;
  }
}
