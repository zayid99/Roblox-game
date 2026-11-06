// Egg Hatchery and Buddy pet (pure logic, unit-tested in tests/hatchery.test.ts).
// Eggs: one per zone the player has reached, bought with cash, each rolls a creature that goes to the
// base with the delivery rules (state.grantCreature). Buddy: one base creature follows the player and
// adds a small bonus to delivery cash.
import { MUTATIONS, RARITIES, SPECIES, creatureIncome, getSpecies, hasSpecies, pickSpecies, type CreatureRef } from './creatures';
import type { Rng } from './rng';
import type { DeliveryResult, GameState } from './state';
import { ZONES } from './zones';

/** Where the hatchery stand sits on the home island (top-centre of its base, facing the sea, -z). */
export const HATCHERY = { x: 6.4, z: 10.1, halfW: 1.9, halfD: 1.15 } as const;
/** Walking into this box (in front of the stand) opens the Hatchery panel. */
export const HATCHERY_ZONE = { minX: 4.2, maxX: 8.6, minZ: 7.4, maxZ: 9.2 } as const;

export function inHatcheryZone(x: number, z: number): boolean {
  return x >= HATCHERY_ZONE.minX && x <= HATCHERY_ZONE.maxX && z >= HATCHERY_ZONE.minZ && z <= HATCHERY_ZONE.maxZ;
}

/**
 * Typical pedestal income ($/s) while the player is working through each zone, before rebirths.
 * Estimated from the economy: about 4 → 20 pedestals filled mostly with the previous zone's rarity
 * (rarity incomes ×3–3.3 per tier) plus the first few of the zone's own. Used only to tune prices.
 */
export const STAGE_INCOME: readonly number[] = [4, 10, 30, 100, 400, 1500, 5000];
/** Egg price in minutes of the stage income above (spec: 3 to 6 minutes). */
export const EGG_MINUTES = 4.5;

/** Chance an egg hatches one rarity above its zone's rarity (none for the top rarity). */
export const EGG_UP_CHANCE = 0.1;
/** Mutation chances per hatch: Gold, Diamond, Rainbow (wild creatures: 5%, 1.5%, 0.4%). */
export const EGG_MUTATION: readonly number[] = [0, 0.04, 0.01, 0.002];

export interface EggDef {
  zone: number;
  name: string;
  rarity: number;
  price: number;
  /** Shell colour, spot colour. */
  colors: [string, string];
}

const EGG_NAMES = ['Shallows Egg', 'Reef Egg', 'Lagoon Egg', 'Storm Egg', 'Kraken Egg', 'Volcano Egg', 'Secret Egg'];
export const EGG_COLORS: readonly [string, string][] = [
  ['#FFF3D6', '#7ED957'],
  ['#FFD1DC', '#FF7A59'],
  ['#C9F5EE', '#2EB8A6'],
  ['#C3CEDD', '#3B4A66'],
  ['#D2C2FF', '#6A3FD1'],
  ['#FFB08A', '#B8361A'],
  ['#3A2A7E', '#5EF3FF'],
];

/** Rounds to a "shop" number: 2 significant digits, the second one 0 or 5 (1K, 2.5K, 8K, 25K...). */
function nicePrice(v: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(v)) - 1);
  const m = v / p;
  const step = m >= 50 ? 10 : 5;
  return Math.round(m / step) * step * p;
}

export function eggPrice(zone: number): number {
  return nicePrice(STAGE_INCOME[zone] * EGG_MINUTES * 60);
}

export const EGGS: readonly EggDef[] = ZONES.map((z, i) => ({
  zone: i,
  name: EGG_NAMES[i] ?? `${z.name} Egg`,
  rarity: z.rarity,
  price: eggPrice(Math.min(i, STAGE_INCOME.length - 1)),
  colors: EGG_COLORS[i % EGG_COLORS.length],
}));

/** An egg is for sale once its zone has been reached (bestZone ≥ zone); the Shallows Egg always is. */
export function eggUnlocked(state: Pick<GameState, 'bestZone'>, zone: number): boolean {
  return zone >= 0 && zone < EGGS.length && (zone === 0 || state.bestZone >= zone);
}

export interface Odds {
  rarity: number;
  p: number;
}

/** Rarity odds of an egg (they sum to 1). */
export function eggOdds(zone: number): Odds[] {
  const r = EGGS[zone].rarity;
  if (r >= RARITIES.length - 1) return [{ rarity: r, p: 1 }];
  return [
    { rarity: r, p: 1 - EGG_UP_CHANCE },
    { rarity: r + 1, p: EGG_UP_CHANCE },
  ];
}

/** Rolls an egg's creature with two RNG draws (rarity, species) plus one for the mutation. */
export function rollEgg(zone: number, rng: Rng, featured: string | null = null): CreatureRef {
  const odds = eggOdds(zone);
  let u = rng.next();
  let rarity = odds[odds.length - 1].rarity;
  for (const o of odds) {
    if (u < o.p) {
      rarity = o.rarity;
      break;
    }
    u -= o.p;
  }
  const species = pickSpecies(rarity, rng, featured);
  const m = rng.next();
  let mutation = 0;
  let acc = 0;
  for (let k = MUTATIONS.length - 1; k >= 1; k--) {
    acc += EGG_MUTATION[k] ?? 0;
    if (m < acc) {
      mutation = k;
      break;
    }
  }
  return { speciesId: species.id, mutation };
}

export interface HatchOutcome {
  ref: CreatureRef;
  zone: number;
  eggName: string;
  isNewSpecies: boolean;
  isNewMutation: boolean;
  result: DeliveryResult;
}

export type HatchError = 'locked' | 'cash';

/** Can the player hatch this egg now? null = yes. */
export function hatchBlocker(state: GameState, zone: number): HatchError | null {
  if (!eggUnlocked(state, zone)) return 'locked';
  if (state.cash < EGGS[zone].price) return 'cash';
  return null;
}

/** Buys and hatches an egg: pays, rolls, sends the creature to the base (delivery rules), counts it. */
export function hatchEgg(state: GameState, zone: number, rng: Rng, featured: string | null = null): HatchOutcome | HatchError {
  const blocked = hatchBlocker(state, zone);
  if (blocked) return blocked;
  state.cash -= EGGS[zone].price;
  const ref = rollEgg(zone, rng, featured);
  const g = state.grantCreature(ref);
  state.counters.eggsHatched++;
  return { ref, zone, eggName: EGGS[zone].name, isNewSpecies: g.isNewSpecies, isNewMutation: g.isNewMutation, result: g.result };
}

// ---------------------------------------------------------------- Buddy

/** Delivery cash bonus of a Buddy by rarity: +5% (Common) to +35% (Secret). */
export const BUDDY_BONUS: readonly number[] = [0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35];

export function buddyBonus(c: CreatureRef): number {
  return BUDDY_BONUS[getSpecies(c.speciesId).rarity] ?? 0;
}

const same = (a: CreatureRef, b: CreatureRef) => a.speciesId === b.speciesId && a.mutation === b.mutation;

/** The equipped Buddy if that creature is still on a pedestal, else null. */
export function activeBuddy(state: Pick<GameState, 'buddy' | 'base'>): CreatureRef | null {
  const b = state.buddy;
  if (!b || !hasSpecies(b.speciesId)) return null;
  return state.base.some((c) => c && same(c, b)) ? b : null;
}

/** Multiplier on delivery cash (1 without a Buddy). */
export function deliveryMult(state: Pick<GameState, 'buddy' | 'base'>): number {
  const b = activeBuddy(state);
  return b ? 1 + buddyBonus(b) : 1;
}

/** Equips a base creature as the Buddy (null unequips). Returns false if it isn't on the base. */
export function setBuddy(state: GameState, c: CreatureRef | null): boolean {
  if (!c) {
    state.buddy = null;
    return true;
  }
  if (!state.base.some((b) => b && same(b, c))) return false;
  state.buddy = { speciesId: c.speciesId, mutation: c.mutation };
  return true;
}

// ---------------------------------------------------------------- panel view

export interface EggView {
  zone: number;
  name: string;
  zoneName: string;
  rarity: number;
  price: number;
  unlocked: boolean;
  affordable: boolean;
  odds: Odds[];
  /** Species of the egg's main rarity, with whether the Index has them. */
  species: { id: string; name: string; found: boolean }[];
  colors: [string, string];
}

export interface BuddyOption {
  ref: CreatureRef;
  name: string;
  rarity: number;
  income: number;
  bonus: number;
  equipped: boolean;
}

export interface HatcheryView {
  cash: number;
  hatched: number;
  eggs: EggView[];
  mutations: { mutation: number; name: string; p: number }[];
  buddy: BuddyOption | null;
  /** One entry per distinct creature on the base, best bonus first. */
  options: BuddyOption[];
}

function option(c: CreatureRef, equipped: boolean, mult: number): BuddyOption {
  const s = getSpecies(c.speciesId);
  const name = c.mutation > 0 ? `${MUTATIONS[c.mutation].name} ${s.name}` : s.name;
  return { ref: { ...c }, name, rarity: s.rarity, income: creatureIncome(c) * mult, bonus: buddyBonus(c), equipped };
}

export function buildHatcheryView(state: GameState): HatcheryView {
  const eggs = EGGS.map((e): EggView => ({
    zone: e.zone,
    name: e.name,
    zoneName: ZONES[e.zone].name,
    rarity: e.rarity,
    price: e.price,
    unlocked: eggUnlocked(state, e.zone),
    affordable: state.cash >= e.price,
    odds: eggOdds(e.zone),
    species: SPECIES.filter((s) => s.rarity === e.rarity).map((s) => ({ id: s.id, name: s.name, found: (state.index[s.id] ?? 0) > 0 })),
    colors: e.colors,
  }));
  const buddy = activeBuddy(state);
  const mult = state.multiplier;
  const seen = new Set<string>();
  const options: BuddyOption[] = [];
  for (const c of state.base) {
    if (!c) continue;
    const key = `${c.speciesId}:${c.mutation}`;
    if (seen.has(key)) continue;
    seen.add(key);
    options.push(option(c, !!buddy && same(buddy, c), mult));
  }
  options.sort((a, b) => b.bonus - a.bonus || b.income - a.income);
  return {
    cash: state.cash,
    hatched: state.counters.eggsHatched,
    eggs,
    mutations: [1, 2, 3].map((m) => ({ mutation: m, name: MUTATIONS[m].name, p: EGG_MUTATION[m] })),
    buddy: buddy ? option(buddy, true, mult) : null,
    options,
  };
}

/** "10%", "0.2%" */
export function formatPct(p: number): string {
  const v = p * 100;
  return `${v >= 1 ? Math.round(v) : Number(v.toFixed(1))}%`;
}
