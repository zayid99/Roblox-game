import type { CreatureRef } from '../game/creatures';
import type { LayoutMode, PanelData, PanelKind, PanelTab, RequestTimeScale, UiActions } from '../contracts';
import type { UiSoundId } from './dom';

export interface HudDeps {
  portraits: { get(c: CreatureRef): string /* '' while pending */; request(c: CreatureRef): void };
  data: PanelData;
  actions: UiActions;
  sound: (id: UiSoundId, i?: number) => void;
  /** Index card tap. */
  voice: (speciesId: string) => void;
  /** Big reveal slow-mo. */
  requestTimeScale: RequestTimeScale;
  /** Backed by state.hintsSeen (ids are 'coach:<panel>'). */
  coach: { seen(id: string): boolean; markSeen(id: string): void };
}

/** What parts and panels get from the Hud facade. */
export interface HudCtx {
  deps: HudDeps;
  layout(): LayoutMode;
  touch(): boolean;
  openPanel(kind: PanelKind, tab?: PanelTab): void;
  closePanel(): void;
  /** Screen rect centre of an element. */
  centerOf(e: Element): { x: number; y: number };
}

/** Portrait <img> markup for a creature ('' src shows the pending porthole pulse). */
export function portraitImg(deps: HudDeps, c: CreatureRef): string {
  const src = deps.portraits.get(c);
  if (!src) deps.portraits.request(c);
  return src ? `<img src="${src}" alt="" draggable="false">` : '';
}

/**
 * Porthole content for a creature: the <img> when the portrait is cached, otherwise a placeholder
 * that fillPortraits() swaps for the image once the PortraitFactory has rendered it (a few frames).
 */
export function portraitSlot(deps: HudDeps, c: CreatureRef): { html: string; pending: boolean } {
  const src = deps.portraits.get(c);
  if (src) return { html: `<img src="${src}" alt="" draggable="false">`, pending: false };
  deps.portraits.request(c);
  return { html: `<span class="p-fill" data-sp="${c.speciesId.replace(/"/g, '')}" data-m="${c.mutation}"></span>`, pending: true };
}

/**
 * Swaps the placeholders under `root` for their portraits as they finish rendering. Polls every
 * 120 ms; stops when none are left, when `root` leaves the page, or after `maxMs`. Returns a cancel.
 */
export function fillPortraits(deps: HudDeps, root: HTMLElement, maxMs = 60000): () => void {
  const t0 = performance.now();
  let id = 0;
  const run = (): boolean => {
    const left = root.querySelectorAll<HTMLElement>('.p-fill');
    let remaining = 0;
    for (const e of left) {
      const src = deps.portraits.get({ speciesId: e.dataset.sp ?? '', mutation: Number(e.dataset.m) || 0 });
      if (!src) {
        remaining++;
        continue;
      }
      e.closest('.porthole')?.classList.remove('pending');
      e.outerHTML = `<img src="${src}" alt="" draggable="false">`;
    }
    return remaining > 0;
  };
  const stop = () => {
    window.clearInterval(id);
    id = 0;
  };
  if (!root.querySelector('.p-fill')) return stop;
  id = window.setInterval(() => {
    const started = root.isConnected || performance.now() - t0 < 500;
    if (!started || !run() || performance.now() - t0 > maxMs) stop();
  }, 120);
  return stop;
}
