// C24 compact reveal card and the big reveal (spec §5.1).
import type { BannerSpec } from '../contracts';
import { RARITIES, creatureIncome, getSpecies, type CreatureRef } from '../game/creatures';
import { formatIncome } from '../game/economy';
import { porthole } from './art';
import { RARITY_LETTER } from './parts/carry';
import { el, escapeHtml, isReducedMotion } from './dom';
import { icon } from './icons';
import { fillPortraits, portraitSlot, type HudDeps } from './types';

export interface RevealHooks {
  banner(b: BannerSpec): void;
  confetti(count: number, hue: string): void;
  flash(color: string, ms: number): void;
  /** Hide everything except the currency pills while the big reveal plays. */
  setBigReveal(on: boolean): void;
  multiplier(): number;
}

/** Optional copy for a reveal that isn't a first find (the Hatchery). */
export interface RevealOpts {
  /** Sticker text instead of NEW. */
  stamp?: string;
  /** Chip text instead of "Added to Index n/m". */
  chip?: string;
  /** Banner sub instead of "<Rarity> catch". */
  sub?: string;
}

export function rarityPill(r: number): string {
  return `<span class="rpill" data-r="${r}"><b>${RARITY_LETTER[r]}</b>${RARITIES[r].name.toUpperCase()}</span>`;
}

export class Reveal {
  readonly el: HTMLElement;
  private compactQueue: (() => Promise<void>)[] = [];
  private compactBusy = false;

  constructor(
    private readonly deps: HudDeps,
    private readonly hooks: RevealHooks,
    private readonly compactHost: HTMLElement,
  ) {
    this.el = el('div', 'reveal-layer');
  }

  play(c: CreatureRef, mode: 'compact' | 'big', indexCount: string, opts: RevealOpts = {}): Promise<void> {
    if (mode === 'big') return this.big(c, indexCount, opts);
    return new Promise((resolve) => {
      this.compactQueue.push(() => this.compact(c, indexCount, opts).then(resolve));
      this.pumpCompact();
    });
  }

  private pumpCompact(): void {
    if (this.compactBusy) return;
    const next = this.compactQueue.shift();
    if (!next) return;
    this.compactBusy = true;
    void next().then(() => {
      this.compactBusy = false;
      this.pumpCompact();
    });
  }

  private compact(c: CreatureRef, indexCount: string, opts: RevealOpts = {}): Promise<void> {
    const sp = getSpecies(c.speciesId);
    const r = sp.rarity;
    const card = el('div', `reveal-c${r >= 4 ? ' legend' : ''}`);
    card.dataset.r = String(r);
    const isMut = c.mutation > 0;
    const name = isMut ? `${['', 'Gold', 'Diamond', 'Rainbow'][c.mutation]} ${sp.name}` : sp.name;
    // A first catch is usually not rendered yet (it was only queued this frame): fill it in when ready.
    const ph = portraitSlot(this.deps, c);
    card.innerHTML =
      porthole(ph.html, 96, `rc-ph${ph.pending ? ' pending' : ''}`) +
      `<div class="rc-info"><span class="rc-st ${isMut ? 'mut' : ''}">${escapeHtml(opts.stamp ?? (isMut ? 'NEW MUTATION' : 'NEW'))}</span>` +
      `<span class="rc-name t-d">${escapeHtml(name)}</span>${rarityPill(r)}` +
      `<span class="rc-line"><b class="t-d">+${formatIncome(creatureIncome(c) * this.hooks.multiplier())}</b><span>Index ${escapeHtml(indexCount)}</span></span></div>` +
      (r >= 4 ? '<span class="shine-sweep once"></span>' : '');
    this.compactHost.appendChild(card);
    fillPortraits(this.deps, card, 3000);
    return new Promise((resolve) => {
      window.setTimeout(() => {
        card.classList.add('out');
        window.setTimeout(() => {
          card.remove();
          resolve();
        }, 200);
      }, 260 + 1800);
    });
  }

  private big(c: CreatureRef, indexCount: string, opts: RevealOpts = {}): Promise<void> {
    const sp = getSpecies(c.speciesId);
    const r = sp.rarity;
    const hue = RARITIES[r].color;
    this.deps.requestTimeScale('reveal', 0.15, 1800);
    this.hooks.setBigReveal(true);
    const wrap = el('div', 'reveal-big');
    wrap.dataset.r = String(r);
    const ph = portraitSlot(this.deps, c);
    wrap.innerHTML =
      `<div class="rb-dim"></div><div class="rb-burst"></div>` +
      `<div class="rb-por">${porthole(ph.html, 160, ph.pending ? 'pending' : '')}</div>` +
      `<div class="rb-tags"><span class="new-st">${escapeHtml(opts.stamp ?? 'NEW')}</span><span class="chip">${icon('index', 22)}${escapeHtml(opts.chip ?? `Added to Index ${indexCount}`)}</span></div>`;
    this.el.appendChild(wrap);
    fillPortraits(this.deps, wrap, 3000);
    const confetti = r >= 5 ? 80 : r === 4 ? 60 : 40;
    const t1 = window.setTimeout(() => {
      this.hooks.banner({ title: sp.name.toUpperCase(), sub: opts.sub ?? `${RARITIES[r].name} catch`, hue: `r${r}` as BannerSpec['hue'], priority: 'reveal', ms: 1400 });
      this.hooks.confetti(confetti, hue);
      if (r >= 5) this.hooks.flash('#ffffff', 120);
    }, 300);
    return new Promise((resolve) => {
      let ended = false;
      const end = () => {
        if (ended) return;
        ended = true;
        window.clearTimeout(t1);
        window.clearTimeout(t2);
        wrap.classList.add('out');
        this.deps.requestTimeScale('reveal', 1, 0);
        this.hooks.setBigReveal(false);
        window.setTimeout(() => {
          wrap.remove();
          resolve();
        }, 220);
      };
      const t2 = window.setTimeout(end, isReducedMotion() ? 1400 : 1800);
      wrap.addEventListener('pointerdown', (e) => {
        e.stopPropagation();
        end();
      });
    });
  }
}
