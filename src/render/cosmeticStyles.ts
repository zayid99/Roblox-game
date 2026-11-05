// Visual styles for cosmetics (§9.5), keyed by the same ids as src/game/cosmetics.ts.

export type RopeKind = 'stripe' | 'twist' | 'neon' | 'aurora' | 'lightning' | 'chain';

export interface RopeStyle {
  kind: RopeKind;
  /** Stripe colours (hex). */
  a: string;
  b: string;
  /** Stripes per metre. */
  perM: number;
  /** Emissive, not tone mapped. */
  glow: boolean;
}

export const ROPE_STYLES: Record<string, RopeStyle> = {
  rope_hemp: { kind: 'stripe', a: '#D9A35F', b: '#B07A3A', perM: 6, glow: false },
  rope_sailor: { kind: 'twist', a: '#F2F2F2', b: '#2B4C9B', perM: 8, glow: false },
  rope_kelp: { kind: 'stripe', a: '#3FA34D', b: '#1F6B3A', perM: 6, glow: false },
  rope_candy: { kind: 'twist', a: '#FF4D5E', b: '#FFFFFF', perM: 10, glow: false },
  rope_neon: { kind: 'neon', a: '#2EE6FF', b: '#BFFAFF', perM: 4, glow: true },
  // P1 looks fall back to stripe skins (gold/amber chain, emissive yellow lightning) with the same ids.
  rope_chain: { kind: 'chain', a: '#FFC92E', b: '#B8860B', perM: 7, glow: false },
  rope_lightning: { kind: 'lightning', a: '#FFF07A', b: '#FFFFFF', perM: 9, glow: true },
  rope_coral: { kind: 'stripe', a: '#FF8C7A', b: '#FFD1C2', perM: 8, glow: false },
  rope_seafoam: { kind: 'stripe', a: '#7FF3E8', b: '#FFFFFF', perM: 8, glow: false },
  rope_aurora: { kind: 'aurora', a: '#7FF3E8', b: '#B065FF', perM: 1, glow: true },
};

export const DEFAULT_ROPE = 'rope_hemp';

export function ropeStyle(id: string | undefined): RopeStyle {
  return (id && ROPE_STYLES[id]) || ROPE_STYLES[DEFAULT_ROPE];
}

/** Swing ribbon colour (v2.0 ships only the white "Breeze"; trail cosmetics are v2.1). */
export const TRAIL_COLORS: Record<string, string> = { trail_none: '#FFFFFF' };
