import type { ScreenPt, ToastSpec } from '../../contracts';
import type { HudCtx } from '../types';

/** Services a panel may use besides data and actions. */
export interface PanelEnv extends HudCtx {
  confetti(at: ScreenPt | 'center', count: number, hue?: string): void;
  coinFly(from: ScreenPt, amount: number, currency: 'cash' | 'pearl', coins?: number): Promise<void>;
  flash(color: string, ms?: number): void;
  banner(title: string, sub: string, hue: 'gold' | 'grass' | 'sun'): void;
  reduce(): boolean;
  toast(t: ToastSpec): void;
  /** Re-pull data for the open panel. */
  refresh(): void;
}
