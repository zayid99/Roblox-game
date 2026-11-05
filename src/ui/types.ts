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
