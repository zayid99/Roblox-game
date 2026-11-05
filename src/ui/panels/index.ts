// Index panel (§9.7): found counter, featured species, one row of C7 cards per rarity.
import type { IndexEntry } from '../../contracts';
import { RARITIES, type CreatureRef } from '../../game/creatures';
import { formatIncome } from '../../game/economy';
import { porthole } from '../art';
import { el, escapeHtml, pressable, replay } from '../dom';
import { icon } from '../icons';
import { mutationGem, shapeCue } from '../parts/carry';
import { rarityPill } from '../reveal';
import type { PanelContent, PanelShell } from './panel';
import type { PanelEnv } from './env';

const GEM_COLORS = ['#FFFFFF', 'var(--mut-gold)', 'var(--mut-diamond)', '#FF6BF2'];

export function itemCard(env: PanelEnv, e: IndexEntry, found: boolean): HTMLElement {
  const r = e.rarity;
  const ref: CreatureRef = { speciesId: e.id, mutation: 0 };
  const src = env.deps.portraits.get(ref);
  if (!src) env.deps.portraits.request(ref);
  const card = el('div', `card-item${found ? '' : ' unknown'}${r >= 3 ? ' notch' : ''}${r === 5 && found ? ' glow-pulse' : ''}`);
  card.dataset.r = String(r);
  card.dataset.id = e.id;
  const gems = GEM_COLORS.map((c, i) => `<span style="color:${c}">${icon('gem', 16, (e.mask >> i) & 1 ? '' : 'off')}</span>`).join('');
  card.innerHTML =
    (found && r >= 4 ? '<span class="sunburst"></span><span class="shine-sweep"></span>' : '') +
    shapeCue(r) +
    (found ? `<span class="ci-inc t-stroke">+${formatIncome(e.income)}</span>` : '') +
    porthole(src ? `<img src="${src}" alt="" draggable="false">` : '', 96, src ? '' : 'pending') +
    `<span class="ci-name t-stroke">${found ? escapeHtml(e.name) : '???'}</span>` +
    (found ? `<span class="gems">${gems}</span>` : `<span class="hint">Found in ${escapeHtml(e.foundIn)}</span>`) +
    rarityPill(r) +
    (e.isNew ? '<span class="new-st bob">NEW</span>' : '');
  if (r === 6 && found) {
    const w = el('div', 'secret-wrap');
    w.appendChild(card);
    w.insertAdjacentHTML('beforeend', [[8, 30, 12], [116, 14, 14], [100, 120, 10]].map(([x, y, s], i) => `<span class="twinkle" style="left:${x}px;top:${y}px;animation-delay:${i * 300}ms">${icon('sparkle', s)}</span>`).join(''));
    return w;
  }
  return card;
}

export class IndexPanel implements PanelContent {
  readonly tab = null;

  constructor(private readonly shell: PanelShell, private readonly env: PanelEnv) {
    this.refresh();
  }

  refresh(): void {
    const v = this.env.deps.data.index();
    const feat = v.featured ? v.entries.find((e) => e.id === v.featured) : null;
    this.shell.head.innerHTML =
      `<div class="ix-count"><span class="t-stroke ix-num">${v.found}/${v.total} FOUND</span><div class="bar bar--grape"><div class="fill" style="transform:scaleX(${v.total ? v.found / v.total : 0})"></div></div></div>` +
      (feat ? `<div class="ix-feat">${porthole(this.portrait(feat.id), 44)}<span>Featured this week<b class="t-d">${escapeHtml(feat.name)}</b></span></div>` : '');
    this.shell.body.innerHTML = '';
    const well = el('div', 'well ix-well');
    const list = el('div', 'ix-rows stagger');
    for (let r = 0; r < RARITIES.length; r++) {
      const entries = v.entries.filter((e) => e.rarity === r);
      if (!entries.length) continue;
      const foundN = entries.filter((e) => e.mask > 0).length;
      const row = el('div', 'ix-row');
      row.innerHTML = `<div class="ix-rh">${rarityPill(r)}<span class="t-stroke">${foundN}/${entries.length}</span></div>`;
      const cards = el('div', 'ix-cards');
      for (const e of entries) {
        const c = itemCard(this.env, e, e.mask > 0);
        if (e.mask > 0) {
          pressable(c, () => {
            const ph = c.querySelector('.porthole') as HTMLElement;
            replay(ph, 'rock');
            this.env.deps.voice(e.id);
          }, { sound: null });
        }
        cards.appendChild(c);
      }
      row.appendChild(cards);
      list.appendChild(row);
    }
    well.appendChild(list);
    this.shell.body.appendChild(well);
  }

  private portrait(id: string): string {
    const ref = { speciesId: id, mutation: 0 };
    const src = this.env.deps.portraits.get(ref);
    if (!src) this.env.deps.portraits.request(ref);
    return src ? `<img src="${src}" alt="">` : '';
  }
}

export { mutationGem };
