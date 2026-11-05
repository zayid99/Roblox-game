// Legacy name kept for v0.1 callers (src/ui/hud.ts, src/Game.ts). New code uses `PortraitFactory` from ./portraits.
import type { WebGLRenderer } from 'three';
import type { CreatureRef } from '../game/creatures';
import { PortraitFactory } from './portraits';

/** @deprecated Use PortraitFactory (lazy, pumped). This wrapper renders synchronously. */
export class IconFactory {
  readonly portraits: PortraitFactory;

  constructor(renderer: WebGLRenderer) {
    this.portraits = new PortraitFactory(renderer);
  }

  get(c: CreatureRef): string {
    return this.portraits.getNow(c);
  }
}
