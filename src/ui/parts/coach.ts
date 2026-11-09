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
  'coach:hatchery': { icon: 'egg', text: 'Buy eggs for creatures. Pick a Buddy for bonus cash.' },
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

/** Controls card content: keycaps on desktop, pictograms on touch. `on(key)`: list a panel hotkey only once it works. */
export function controlsCardHtml(touch: boolean, on: (key: string) => boolean = () => true): string {
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
  const hot = (key: string, label: string) => (on(key.toLowerCase()) ? `<div class="ctl small"><span class="keys">${k(key)}</span><span>${label}</span></div>` : '');
  return (
    `<div class="ctl-grid">` +
    `<div class="ctl big"><span class="keys wasd">${k('W')}<br>${k('A')}${k('S')}${k('D')}</span><span>Move</span></div>` +
    `<div class="ctl big"><span class="keys">${k('Q')}${k('E')}</span><span>Turn camera</span></div>` +
    `<div class="ctl big"><span class="keys">${k('SPACE', 'key--space')}</span><span>Jump, hold to swing</span></div>` +
    `<div class="ctl big"><span class="keys">${icon('hand', 30)}</span><span>Click, then move to look</span></div>` +
    hot('U', 'Shop') +
    hot('G', 'Free') +
    hot('I', 'Index') +
    hot('H', 'Eggs') +
    hot('L', 'Locker') +
    hot('P', 'Settings') +
    hot('M', 'Mute') +
    hot('Esc', 'Close') +
    `</div>`
  );
}
