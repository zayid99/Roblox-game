import type { GameState } from './state';
import type { LockerItemView } from '../contracts';

/** Locker catalogue (§9.5). Visuals live in src/render/cosmeticStyles.ts, keyed by the same ids. */
export interface CosmeticDef {
  id: string;
  kind: 'rope';
  name: string;
  /** Pearl price, or null for items that are earned. */
  price: number | null;
  /** Where an earned item comes from ("Day 7 reward"), or null. */
  source: string | null;
  /** Card rarity frame: 60 Uncommon, 150 Rare, 300 Epic, 600 Legendary, 1200 Mythic, exclusive Secret. */
  rarity: number;
  colors: string[];
  stripesPerM: number;
}

export const COSMETICS: readonly CosmeticDef[] = [
  { id: 'rope_hemp', kind: 'rope', name: 'Hemp Rope', price: null, source: 'Default', rarity: 0, colors: ['#D9A35F', '#B07A3A'], stripesPerM: 6 },
  { id: 'rope_sailor', kind: 'rope', name: 'Sailor Rope', price: null, source: 'First Voyage reward', rarity: 6, colors: ['#F2F2F2', '#2B4C9B'], stripesPerM: 8 },
  { id: 'rope_kelp', kind: 'rope', name: 'Kelp Rope', price: 60, source: null, rarity: 1, colors: ['#3FA34D', '#1F6B3A'], stripesPerM: 6 },
  { id: 'rope_candy', kind: 'rope', name: 'Candy Stripe', price: 150, source: null, rarity: 2, colors: ['#FF4D5E', '#FFFFFF'], stripesPerM: 10 },
  { id: 'rope_neon', kind: 'rope', name: 'Neon Rope', price: 300, source: null, rarity: 3, colors: ['#2EE6FF', '#2EE6FF'], stripesPerM: 0 },
  { id: 'rope_chain', kind: 'rope', name: 'Golden Chain', price: 600, source: null, rarity: 4, colors: ['#FFC92E', '#C98A12'], stripesPerM: 8 },
  { id: 'rope_lightning', kind: 'rope', name: 'Lightning Rope', price: 1200, source: null, rarity: 5, colors: ['#FFF07A', '#FFF07A'], stripesPerM: 0 },
  { id: 'rope_coral', kind: 'rope', name: 'Coral Rope', price: null, source: 'Day 7 reward', rarity: 6, colors: ['#FF8C7A', '#FFD1C2'], stripesPerM: 8 },
  { id: 'rope_seafoam', kind: 'rope', name: 'Seafoam Rope', price: null, source: 'Day 7 reward', rarity: 6, colors: ['#7FF3E8', '#FFFFFF'], stripesPerM: 8 },
  { id: 'rope_aurora', kind: 'rope', name: 'Aurora Rope', price: null, source: 'Rebirth reward', rarity: 6, colors: ['#7CFFB2', '#6AA8FF', '#C77DFF'], stripesPerM: 0 },
];

const BY_ID = new Map(COSMETICS.map((c) => [c.id, c]));

export function getCosmetic(id: string): CosmeticDef | undefined {
  return BY_ID.get(id);
}

export function ownsCosmetic(state: GameState, id: string): boolean {
  return state.cosmetics.owned.includes(id);
}

/** Buys a priced item with Pearls. False if unknown, not for sale, owned or unaffordable. */
export function buyCosmetic(state: GameState, id: string): boolean {
  const def = BY_ID.get(id);
  if (!def || def.price === null || ownsCosmetic(state, id) || state.pearls < def.price) return false;
  state.pearls -= def.price;
  state.cosmetics.owned.push(id);
  return true;
}

/** Equips an owned rope (and marks it seen). */
export function equipCosmetic(state: GameState, id: string): boolean {
  const def = BY_ID.get(id);
  if (!def || !ownsCosmetic(state, id)) return false;
  if (def.kind === 'rope') state.cosmetics.equipped.rope = id;
  markCosmeticSeen(state, id);
  return true;
}

export function markCosmeticSeen(state: GameState, id: string): void {
  if (!state.cosmetics.seen.includes(id)) state.cosmetics.seen.push(id);
}

/** Owned but not yet looked at: the NEW sticker. */
export function isNewCosmetic(state: GameState, id: string): boolean {
  return ownsCosmetic(state, id) && !state.cosmetics.seen.includes(id);
}

export function lockerItems(state: GameState): LockerItemView[] {
  return COSMETICS.map((c) => ({
    id: c.id,
    kind: c.kind,
    name: c.name,
    rarity: c.rarity,
    price: c.price,
    source: c.price === null ? c.source : null,
    owned: ownsCosmetic(state, c.id),
    equipped: state.cosmetics.equipped.rope === c.id,
    isNew: isNewCosmetic(state, c.id),
    colors: [...c.colors],
    stripesPerM: c.stripesPerM,
  }));
}
