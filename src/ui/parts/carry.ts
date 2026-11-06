// C14 carry hotbar: counter chip plus one slot per carry capacity.
import { MUTATIONS, RARITIES, getSpecies, type CreatureRef } from '../../game/creatures';
import { el, replay, setText } from '../dom';
import { icon } from '../icons';
import { portraitImg, type HudDeps } from '../types';

export const RARITY_LETTER = ['C', 'U', 'R', 'E', 'L', 'M', 'S'];

/** Shape cue markup for Epic+ frames (§2.2): notches, crown tab, fins, star tab. */
export function shapeCue(r: number): string {
  let s = '';
  if (r >= 4 && r !== 6) s += `<svg class="crown-tab" viewBox="0 0 30 14"><path d="M2 13L5 3L11 9L15 1L19 9L25 3L28 13Z" fill="var(--rc)" stroke="#1B1736" stroke-width="2.5" stroke-linejoin="round"/></svg>`;
  if (r === 6) s += `<svg class="crown-tab" viewBox="0 0 30 16"><path d="M15 1L18.5 7.5L26 8.5L20.5 13L6 13L9.5 8.5L4 7.5L11.5 7.5Z" fill="#FFF07A" stroke="#1B1736" stroke-width="2.5" stroke-linejoin="round"/></svg>`;
  if (r === 5) s += `<i class="fin l"></i><i class="fin r"></i>`;
  return s;
}

export function mutationGem(m: number, size: number): string {
  if (m <= 0) return '';
  const color = m === 1 ? 'var(--mut-gold)' : m === 2 ? 'var(--mut-diamond)' : MUTATIONS[3].color;
  return `<span class="mgem m${m}" style="color:${color}">${icon('gem', size)}</span>`;
}

export class CarryPart {
  readonly el: HTMLElement;
  private readonly counter: HTMLElement;
  private readonly countTxt: HTMLElement;
  private readonly slotsEl: HTMLElement;
  private readonly bonus: HTMLElement;
  private slots: HTMLElement[] = [];
  private keys: string[] = [];
  private last = { cap: -1, count: -1, full: false, bonus: -1 };

  constructor(private readonly deps: HudDeps) {
    this.el = el('div', 'carry');
    this.el.dataset.anchor = 'carry';
    this.counter = el('div', 'carry-count', `${icon('carry', 34)}<span class="t-stroke cc"></span>`);
    this.countTxt = this.counter.querySelector('.cc') as HTMLElement;
    this.slotsEl = el('div', 'slots');
    this.bonus = el('div', 'trip-bonus chip chip--sun hud-hide');
    this.el.append(this.bonus, this.counter, this.slotsEl);
  }

  slotEl(i: number): HTMLElement | null {
    return this.slots[i] ?? null;
  }

  update(carried: CreatureRef[], capacity: number, tripBonusPct: number, reduce: boolean): void {
    if (capacity !== this.last.cap) {
      this.last.cap = capacity;
      this.last.count = -1; // re-render the n/capacity text
      this.slotsEl.innerHTML = '';
      this.slots = [];
      this.keys = [];
      for (let i = 0; i < capacity; i++) {
        const s = el('div', 'slot empty', icon('creature', 32, 'ghost'));
        this.slotsEl.appendChild(s);
        this.slots.push(s);
        this.keys.push('');
      }
      this.el.classList.toggle('many', capacity >= 6);
    }
    for (let i = 0; i < this.slots.length; i++) {
      const c = carried[i];
      const key = c ? `${c.speciesId}:${c.mutation}:${this.deps.portraits.get(c) ? 1 : 0}` : '';
      if (key === this.keys[i]) continue;
      const wasEmpty = !this.keys[i];
      this.keys[i] = key;
      const s = this.slots[i];
      if (!c) {
        s.className = 'slot empty';
        s.removeAttribute('data-r');
        s.innerHTML = icon('creature', 32, 'ghost');
        continue;
      }
      const r = getSpecies(c.speciesId).rarity;
      s.className = `slot filled${r >= 3 ? ' notch' : ''}`;
      s.dataset.r = String(r);
      s.title = `${RARITIES[r].name}`;
      s.innerHTML = `<span class="sp">${portraitImg(this.deps, c)}</span>${shapeCue(r)}<span class="rl">${RARITY_LETTER[r]}</span>${mutationGem(c.mutation, 18)}`;
      if (wasEmpty && !reduce) replay(s, 'fx-pop');
    }
    const count = Math.min(carried.length, capacity);
    const full = capacity > 0 && count >= capacity;
    if (count !== this.last.count || full !== this.last.full) {
      const becameFull = full && !this.last.full && this.last.count >= 0;
      this.last.count = count;
      this.last.full = full;
      setText(this.countTxt, full ? 'FULL' : `${count}/${capacity}`);
      this.counter.classList.toggle('full', full);
      if (becameFull && !reduce) replay(this.el, 'fx-shake');
    }
    if (tripBonusPct !== this.last.bonus) {
      this.last.bonus = tripBonusPct;
      this.bonus.classList.toggle('hud-hide', tripBonusPct <= 0);
      if (tripBonusPct > 0) {
        this.bonus.innerHTML = `${icon('chain', 18)}<span>+${Math.round(tripBonusPct)}%</span>`;
        if (!reduce) replay(this.bonus, 'fx-pop');
      }
    }
  }
}
