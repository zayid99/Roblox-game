// Treasure Bottles and Sea Events on the HUD: the event chip under the wave meter (heads-up countdown, then
// time left), the event's screen tint, the bottle slot beside the carry hotbar, and the bottle-opening card.
import './sea.css';
import type { BottleKind, Reward, SeaEventId, SeaHudView, TreasurePrizeKind } from '../../contracts';
import { formatCash } from '../../game/economy';
import { el, setText } from '../dom';
import { icon } from '../icons';

/** The bottle drawn in the HUD's ink-outlined style (tinted by `kind`). */
export function bottleSvg(kind: BottleKind, size = 40): string {
  const glass = kind === 'legendary' ? '#FFD54A' : '#8FF0E2';
  const hi = kind === 'legendary' ? '#FFF1A8' : '#D8FFF8';
  return (
    `<svg class="bottle-svg" width="${size}" height="${size}" viewBox="0 0 48 48" aria-hidden="true">` +
    `<g stroke="#1B1736" stroke-width="3" stroke-linejoin="round">` +
    `<rect x="19" y="4" width="10" height="7" rx="2" fill="#A0703F"/>` +
    `<path d="M20 11h8v6l6 5v19q0 4-4 4H18q-4 0-4-4V22l6-5z" fill="${glass}"/></g>` +
    `<rect x="18" y="25" width="12" height="11" rx="1.5" fill="#FFF3CF" stroke="#C9A35E" stroke-width="1.5"/>` +
    `<path d="M20 29h8M20 32h6" stroke="#C9A35E" stroke-width="1.5" stroke-linecap="round"/>` +
    `<path d="M17.5 23v13" stroke="${hi}" stroke-width="2.5" stroke-linecap="round"/></svg>`
  );
}

const EVENT_ICON: Record<SeaEventId, string> = {
  rainbowRain: icon('gem', 24, 'rainbow'),
  treasureFleet: bottleSvg('legendary', 24),
  calmSeas: icon('speed', 24),
  feedingFrenzy: icon('creature', 24),
};

/** Text for an opened bottle's prize (title, small line). */
export function prizeText(prize: TreasurePrizeKind, r: Reward, creatureName: string | null): { title: string; sub: string } {
  switch (prize) {
    case 'cash':
      return { title: `+${formatCash(r.cash ?? 0)}`, sub: 'Cash' };
    case 'pearls':
      return { title: `+${r.pearls ?? 0} Pearls`, sub: 'For the Locker' };
    case 'boost': {
      const m = Math.round((r.boost2xSec ?? 0) / 60);
      return { title: '2× CASH', sub: `${m} min boost` };
    }
    case 'luckyTide':
      return { title: 'LUCKY TIDE', sub: 'Makes a wave Golden' };
    case 'creature':
      return { title: creatureName ?? 'MYSTERY CREATURE', sub: 'Mutated creature' };
    case 'rainbow':
      return { title: creatureName ?? 'RAINBOW CREATURE', sub: 'Rainbow creature!' };
  }
}

const PRIZE_ICON: Record<TreasurePrizeKind, string> = {
  cash: icon('cash', 52),
  pearls: icon('pearl', 52),
  boost: icon('flame', 52),
  luckyTide: icon('lucky-tide', 52),
  creature: icon('creature', 52),
  rainbow: icon('gem', 52, 'rainbow'),
};

export class SeaPart {
  /** Event chip, appended under the wave meter. */
  readonly chip: HTMLElement;
  /** Full-screen tint, appended to the unzoomed overlay. */
  readonly tint: HTMLElement;
  /** Bottle slot, appended inside the carry hotbar. */
  readonly slot: HTMLElement;
  /** Opening cards, appended to the HUD layer. */
  readonly cards: HTMLElement;
  private readonly chipIcon: HTMLElement;
  private readonly chipName: HTMLElement;
  private readonly chipTime: HTMLElement;
  private readonly chipBar: HTMLElement;
  private last = { ev: '', phase: '', time: '', slot: '', tint: '' };
  private queue: (() => Promise<void>)[] = [];
  private busy = false;

  constructor() {
    this.chip = el('div', 'sea-chip off');
    this.chip.innerHTML = '<span class="sc-ic"></span><span class="sc-name t-stroke"></span><span class="sc-time t-stroke"></span><span class="sc-bar"><i></i></span>';
    this.chipIcon = this.chip.querySelector('.sc-ic') as HTMLElement;
    this.chipName = this.chip.querySelector('.sc-name') as HTMLElement;
    this.chipTime = this.chip.querySelector('.sc-time') as HTMLElement;
    this.chipBar = this.chip.querySelector('.sc-bar i') as HTMLElement;
    this.tint = el('div', 'sea-tint');
    this.slot = el('div', 'slot bottle-slot off');
    this.cards = el('div', 'sea-cards');
  }

  update(v: SeaHudView | undefined): void {
    const ev = v?.event ?? null;
    const evKey = ev ? ev.id : '';
    if (evKey !== this.last.ev || (ev?.phase ?? '') !== this.last.phase) {
      this.last.ev = evKey;
      this.last.phase = ev?.phase ?? '';
      this.chip.classList.toggle('off', !ev);
      if (ev) {

        this.chip.dataset.ev = ev.id;
        this.chip.classList.toggle('heads-up', ev.phase === 'headsUp');
        this.chipIcon.innerHTML = EVENT_ICON[ev.id];
        setText(this.chipName, ev.name.toUpperCase());
        this.chip.title = ev.sub;
      }
    }
    if (ev) {
      const s = Math.max(0, Math.ceil(ev.secondsLeft));
      const t = ev.phase === 'headsUp' ? `in ${s}` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      if (t !== this.last.time) {
        this.last.time = t;
        setText(this.chipTime, t);
      }
      this.chipBar.style.transform = `scaleX(${Math.max(0, Math.min(1, ev.frac)).toFixed(3)})`;
    }
    const tint = ev && ev.phase === 'active' ? ev.id : '';
    if (tint !== this.last.tint) {
      this.last.tint = tint;
      if (tint) this.tint.dataset.ev = tint;
      this.tint.classList.toggle('on', !!tint);
    }
    const kinds = v?.carriedBottles ?? [];
    const slotKey = kinds.join(',');
    if (slotKey !== this.last.slot) {
      this.last.slot = slotKey;
      this.slot.classList.toggle('off', kinds.length === 0);
      if (kinds.length) {
        const best: BottleKind = kinds.includes('legendary') ? 'legendary' : 'normal';
        this.slot.dataset.kind = best;
        this.slot.innerHTML = `<span class="bs-b">${bottleSvg(best, 44)}</span>${kinds.length > 1 ? `<span class="bs-n t-stroke">×${kinds.length}</span>` : ''}`;
        this.slot.classList.remove('pop');
        void this.slot.offsetWidth;
        this.slot.classList.add('pop');
      }
    }
  }

  /** Bottle-opening card: the bottle shakes, the cork pops, the prize shows with the odds. Queued. */
  open(kind: BottleKind, prize: TreasurePrizeKind, reward: Reward, creatureName: string | null, odds: string, reduce: boolean): Promise<void> {
    return new Promise((resolve) => {
      this.queue.push(() => this.play(kind, prize, reward, creatureName, odds, reduce).then(resolve));
      this.pump();
    });
  }

  private pump(): void {
    if (this.busy) return;
    const next = this.queue.shift();
    if (!next) return;
    this.busy = true;
    void next().then(() => {
      this.busy = false;
      this.pump();
    });
  }

  private play(kind: BottleKind, prize: TreasurePrizeKind, reward: Reward, creatureName: string | null, odds: string, reduce: boolean): Promise<void> {
    const { title, sub } = prizeText(prize, reward, creatureName);
    const card = el('div', `sea-card k-${kind} p-${prize}`);
    card.innerHTML =
      `<div class="scd-stage"><span class="scd-bottle">${bottleSvg(kind, 84)}</span><span class="scd-prize">${PRIZE_ICON[prize]}</span></div>` +
      `<div class="scd-info"><span class="scd-st">${kind === 'legendary' ? 'LEGENDARY BOTTLE' : 'TREASURE'}</span>` +
      `<span class="scd-title t-stroke"></span><span class="scd-sub"></span><span class="scd-odds"></span></div>`;
    setText(card.querySelector('.scd-title') as HTMLElement, title);
    setText(card.querySelector('.scd-sub') as HTMLElement, sub);
    setText(card.querySelector('.scd-odds') as HTMLElement, odds);
    this.cards.appendChild(card);
    const wait = (ms: number) => new Promise<void>((r) => window.setTimeout(r, reduce ? Math.min(ms, 200) : ms));
    return wait(650)
      .then(() => {
        card.classList.add('popped');
        return wait(2600);
      })
      .then(() => {
        card.classList.add('out');
        return wait(220);
      })
      .then(() => card.remove());
  }
}
