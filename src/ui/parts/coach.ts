// C21 coach cards (first-open explainers) and the Controls card (Settings Help, FTUE ready).
import type { IconId } from '../../contracts';
import { el } from '../dom';
import { icon } from '../icons';
import type { HudDeps } from '../types';

export const COACH: Record<string, { icon: IconId; text: string }> = {
  'coach:index': { icon: 'index', text: 'Catch every creature. Gaps show where.' },
  'coach:free': { icon: 'gift', text: 'Come back daily. Rewards stack up.' },
  'coach:locker': { icon: 'locker', text: 'Spend Pearls on ropes. Looks only.' },
  'coach:rebirth': { icon: 'rebirth', text: 'Lose cash and upgrades. Keep Pearls, Index, Locker.' },
};

/** Show the coach card for `id` over `host` once (tracked by deps.coach). */
export function maybeCoach(deps: HudDeps, host: HTMLElement, id: string): void {
  const c = COACH[id];
  if (!c || deps.coach.seen(id)) return;
  deps.coach.markSeen(id);
  const scrim = el('div', 'coach-scrim');
  const card = el('div', 'coach', `${icon(c.icon, 64)}<span>${c.text}</span>`);
  const close = () => {
    card.classList.add('out');
    scrim.remove();
    window.setTimeout(() => card.remove(), 160);
  };
  scrim.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    close();
  });
  card.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    close();
  });
  host.append(scrim, card);
}

/** Controls card content: keycaps on desktop, pictograms on touch. */
export function controlsCardHtml(touch: boolean): string {
  if (touch) {
    return (
      `<div class="ctl-grid touch">` +
      `<div class="ctl"><span class="pict joy-pict"><i></i></span><span>Move</span></div>` +
      `<div class="ctl"><span class="pict act-pict">${icon('arrow-up', 22)}</span><span>Jump, hold to swing</span></div>` +
      `<div class="ctl"><span class="pict">${icon('hand', 34)}</span><span>Drag right side to look</span></div>` +
      `</div>`
    );
  }
  const k = (s: string, cls = '') => `<span class="key ${cls}">${s}</span>`;
  return (
    `<div class="ctl-grid">` +
    `<div class="ctl"><span class="keys wasd">${k('W')}<br>${k('A')}${k('S')}${k('D')}</span><span>Move</span></div>` +
    `<div class="ctl"><span class="keys">${k('SPACE', 'key--space')}</span><span>Jump, hold to swing</span></div>` +
    `<div class="ctl"><span class="keys">${icon('hand', 30)}</span><span>Drag to look</span></div>` +
    `<div class="ctl small"><span class="keys">${k('U')}</span><span>Shop</span></div>` +
    `<div class="ctl small"><span class="keys">${k('G')}</span><span>Free</span></div>` +
    `<div class="ctl small"><span class="keys">${k('I')}</span><span>Index</span></div>` +
    `<div class="ctl small"><span class="keys">${k('L')}</span><span>Locker</span></div>` +
    `<div class="ctl small"><span class="keys">${k('P')}</span><span>Settings</span></div>` +
    `<div class="ctl small"><span class="keys">${k('M')}</span><span>Mute</span></div>` +
    `<div class="ctl small"><span class="keys">${k('Esc')}</span><span>Close</span></div>` +
    `</div>`
  );
}
