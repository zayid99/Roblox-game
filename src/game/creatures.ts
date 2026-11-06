import type { Rng } from './rng';

export interface Rarity {
  name: string;
  color: string;
  /** Cash per second for a normal creature of this rarity. */
  income: number;
}

export const RARITIES: readonly Rarity[] = [
  { name: 'Common', color: '#A9B8C9', income: 1 },
  { name: 'Uncommon', color: '#59D36A', income: 3 },
  { name: 'Rare', color: '#3AA8FF', income: 10 },
  { name: 'Epic', color: '#B065FF', income: 30 },
  { name: 'Legendary', color: '#FFB52E', income: 100 },
  { name: 'Mythic', color: '#FF4F7B', income: 300 },
  { name: 'Secret', color: '#22F0FF', income: 1000 },
];

export interface Mutation {
  name: string;
  mult: number;
  color: string;
}

export const MUTATIONS: readonly Mutation[] = [
  { name: 'Normal', mult: 1, color: '#ffffff' },
  { name: 'Gold', mult: 2, color: '#ffd23f' },
  { name: 'Diamond', mult: 4, color: '#8ef3ff' },
  { name: 'Rainbow', mult: 10, color: '#ff6bf2' },
];

export type BodyPlan = 'blob' | 'fish' | 'octo' | 'crab' | 'whale' | 'clam' | 'turtle' | 'shrimp' | 'jelly' | 'star' | 'puffer';
export type Accessory =
  | 'none' | 'tophat' | 'crown' | 'shades' | 'headphones' | 'helmet' | 'bandana' | 'flower' | 'pirate' | 'horn'
  | 'propeller' | 'partyhat' | 'halo';

export interface CreatureLook {
  plan: BodyPlan;
  body: string;
  accent: string;
  extra?: string;
  acc: Accessory;
  scale?: number;
}

export interface Species {
  id: string;
  name: string;
  rarity: number;
  /** Multiplier on the rarity's base income. */
  incomeMult: number;
  look: CreatureLook;
}

export const SPECIES: readonly Species[] = [
  // Common
  { id: 'toastopus', name: 'Toastopus', rarity: 0, incomeMult: 1, look: { plan: 'octo', body: '#d9a05b', accent: '#fff1a8', acc: 'none' } },
  { id: 'pickle_puff', name: 'Pickle Puff', rarity: 0, incomeMult: 1.15, look: { plan: 'blob', body: '#7bbf3a', accent: '#3f7d1e', acc: 'none' } },
  { id: 'soggy_sock', name: 'Soggy Sock', rarity: 0, incomeMult: 1.3, look: { plan: 'fish', body: '#eef0f6', accent: '#e04f5f', acc: 'none' } },
  { id: 'cookie_star', name: 'Cookie Starfish', rarity: 0, incomeMult: 0.95, look: { plan: 'star', body: '#d99a52', accent: '#4a2a17', acc: 'none' } },
  { id: 'gum_puffer', name: 'Bubblegum Puffer', rarity: 0, incomeMult: 1.4, look: { plan: 'puffer', body: '#ff8fd0', accent: '#ffd1ec', acc: 'none' } },
  // Uncommon
  { id: 'crab_dj', name: 'Crab DJ', rarity: 1, incomeMult: 1, look: { plan: 'crab', body: '#ff6b4a', accent: '#2a2a35', acc: 'headphones' } },
  { id: 'boba_turtle', name: 'Boba Turtle', rarity: 1, incomeMult: 1.15, look: { plan: 'turtle', body: '#8fd18a', accent: '#d8b48a', extra: '#3a2618', acc: 'none' } },
  { id: 'sir_shrimp', name: 'Sir Shrimpington', rarity: 1, incomeMult: 1.3, look: { plan: 'shrimp', body: '#ff9e80', accent: '#ffffff', acc: 'tophat' } },
  { id: 'sushi_seal', name: 'Sushi Seal', rarity: 1, incomeMult: 0.95, look: { plan: 'blob', body: '#f7f4ec', accent: '#ff8a5c', extra: '#1f3b2c', acc: 'propeller' } },
  { id: 'cupcake_crab', name: 'Cupcake Crab', rarity: 1, incomeMult: 1.4, look: { plan: 'crab', body: '#ffa8cf', accent: '#c98a4b', extra: '#fff3fa', acc: 'partyhat' } },
  // Rare
  { id: 'banana_shark', name: 'Banana Shark', rarity: 2, incomeMult: 1, look: { plan: 'fish', body: '#ffe14d', accent: '#7a5c1e', acc: 'shades', scale: 1.15 } },
  { id: 'disco_clam', name: 'Disco Clam', rarity: 2, incomeMult: 1.15, look: { plan: 'clam', body: '#c7a6ff', accent: '#e8f4ff', acc: 'none' } },
  { id: 'waffle_walrus', name: 'Waffle Walrus', rarity: 2, incomeMult: 1.3, look: { plan: 'blob', body: '#d79b4a', accent: '#fff7e8', acc: 'none', scale: 1.15 } },
  { id: 'popcorn_puffer', name: 'Popcorn Puffer', rarity: 2, incomeMult: 0.95, look: { plan: 'puffer', body: '#fff6d6', accent: '#ffd23f', extra: '#e8413c', acc: 'none' } },
  { id: 'spaghetti_squid', name: 'Spaghetti Squid', rarity: 2, incomeMult: 1.4, look: { plan: 'octo', body: '#ffd36b', accent: '#d9352b', extra: '#7a3b1e', acc: 'none' } },
  // Epic
  { id: 'burger_whale', name: 'Burger Whale', rarity: 3, incomeMult: 1, look: { plan: 'whale', body: '#d0893f', accent: '#6b3a1e', extra: '#79c94a', acc: 'none' } },
  { id: 'cactus_jelly', name: 'Cactus Jelly', rarity: 3, incomeMult: 1.15, look: { plan: 'jelly', body: '#6fdc8c', accent: '#ff7eb6', acc: 'flower' } },
  { id: 'ninja_narwhal', name: 'Ninja Narwhal', rarity: 3, incomeMult: 1.3, look: { plan: 'whale', body: '#3b3f58', accent: '#ff3b3b', extra: '#f2f2f2', acc: 'bandana' } },
  { id: 'hotdog_hammerhead', name: 'Hotdog Hammerhead', rarity: 3, incomeMult: 0.95, look: { plan: 'fish', body: '#e8a85a', accent: '#c4432f', extra: '#ffd23f', acc: 'propeller', scale: 1.15 } },
  { id: 'lollipop_star', name: 'Lollipop Starfish', rarity: 3, incomeMult: 1.4, look: { plan: 'star', body: '#ff5ea8', accent: '#ffffff', extra: '#f2f2f2', acc: 'partyhat', scale: 1.1 } },
  // Legendary
  { id: 'king_krill', name: 'King Krill', rarity: 4, incomeMult: 1, look: { plan: 'shrimp', body: '#ff7a59', accent: '#ffd23f', acc: 'crown', scale: 1.2 } },
  { id: 'lava_lobster', name: 'Lava Lobster', rarity: 4, incomeMult: 1.15, look: { plan: 'crab', body: '#ff4a1c', accent: '#ffcc00', acc: 'horn', scale: 1.15 } },
  { id: 'astro_otter', name: 'Astro Otter', rarity: 4, incomeMult: 1.3, look: { plan: 'blob', body: '#8b5a3c', accent: '#d9f4ff', acc: 'helmet', scale: 1.1 } },
  { id: 'pineapple_puffer', name: 'Pineapple Puffer', rarity: 4, incomeMult: 0.95, look: { plan: 'puffer', body: '#ffc93a', accent: '#c98a1c', extra: '#3fae49', acc: 'shades', scale: 1.15 } },
  { id: 'gelato_orca', name: 'Gelato Orca', rarity: 4, incomeMult: 1.4, look: { plan: 'whale', body: '#ff9ec4', accent: '#c98a4b', extra: '#9df2d0', acc: 'propeller', scale: 1.1 } },
  // Mythic
  { id: 'thunder_tuna', name: 'Thunder Tuna', rarity: 5, incomeMult: 1, look: { plan: 'fish', body: '#3a6cf4', accent: '#ffe600', acc: 'none', scale: 1.3 } },
  { id: 'ghost_galleon', name: 'Ghost Galleon', rarity: 5, incomeMult: 1.15, look: { plan: 'jelly', body: '#e9f3ff', accent: '#7cc4ff', acc: 'pirate', scale: 1.25 } },
  { id: 'pizza_kraken', name: 'Pizza Kraken', rarity: 5, incomeMult: 1.3, look: { plan: 'octo', body: '#ffcf5a', accent: '#d9452b', acc: 'none', scale: 1.35 } },
  { id: 'nova_star', name: 'Supernova Starfish', rarity: 5, incomeMult: 0.95, look: { plan: 'star', body: '#ff7a1a', accent: '#ffe600', extra: '#fff7c2', acc: 'halo', scale: 1.3 } },
  { id: 'sharkcuterie', name: 'Sharkcuterie Board', rarity: 5, incomeMult: 1.4, look: { plan: 'fish', body: '#b9824a', accent: '#d9455a', extra: '#ffd84a', acc: 'tophat', scale: 1.3 } },
  // Secret
  { id: 'big_cheese', name: 'The Big Cheese', rarity: 6, incomeMult: 1, look: { plan: 'whale', body: '#ffd84a', accent: '#e0a800', extra: '#fff3b0', acc: 'crown', scale: 1.3 } },
  { id: 'cosmic_sunfish', name: 'Cosmic Sunfish', rarity: 6, incomeMult: 1.15, look: { plan: 'blob', body: '#2a1a5e', accent: '#ff9cf0', extra: '#5ef3ff', acc: 'shades', scale: 1.35 } },
  { id: 'captain_splash', name: 'Captain Splash', rarity: 6, incomeMult: 1.3, look: { plan: 'crab', body: '#39b8ff', accent: '#ffffff', acc: 'pirate', scale: 1.35 } },
  { id: 'angel_puffer', name: 'Angel Cake Puffer', rarity: 6, incomeMult: 0.95, look: { plan: 'puffer', body: '#fff8f0', accent: '#ffd6e8', extra: '#ffe27a', acc: 'halo', scale: 1.35 } },
  { id: 'ramen_turtle', name: 'Emperor Ramen Turtle', rarity: 6, incomeMult: 1.4, look: { plan: 'turtle', body: '#9be07a', accent: '#d94a2b', extra: '#ffe08a', acc: 'crown', scale: 1.35 } },
];

const SPECIES_BY_ID = new Map(SPECIES.map((s) => [s.id, s]));

export function getSpecies(id: string): Species {
  const s = SPECIES_BY_ID.get(id);
  if (!s) throw new Error(`Unknown species: ${id}`);
  return s;
}

export function hasSpecies(id: string): boolean {
  return SPECIES_BY_ID.has(id);
}

export interface CreatureRef {
  speciesId: string;
  mutation: number;
}

export function creatureIncome(c: CreatureRef): number {
  const s = getSpecies(c.speciesId);
  return RARITIES[s.rarity].income * s.incomeMult * MUTATIONS[c.mutation].mult;
}

export function creatureLabel(c: CreatureRef): string {
  const s = getSpecies(c.speciesId);
  return c.mutation > 0 ? `${MUTATIONS[c.mutation].name} ${s.name}` : s.name;
}

/** Weight of this week's Featured Creature within its rarity roll (§9.0). */
export const FEATURED_WEIGHT = 2;

/** Picks a species of a rarity with one RNG draw; the featured species (if in the pool) weighs FEATURED_WEIGHT. */
export function pickSpecies(rarity: number, rng: Rng, featured: string | null = null): Species {
  const pool = SPECIES.filter((s) => s.rarity === rarity);
  const fi = featured ? pool.findIndex((s) => s.id === featured) : -1;
  if (fi < 0) return rng.pick(pool);
  const total = pool.length - 1 + FEATURED_WEIGHT;
  let u = rng.next() * total;
  for (let i = 0; i < pool.length; i++) {
    u -= i === fi ? FEATURED_WEIGHT : 1;
    if (u < 0) return pool[i];
  }
  return pool[pool.length - 1];
}

/** Rolls a creature for a zone. Golden waves push rarities and mutations up. */
export function rollCreature(zoneRarity: number, golden: boolean, rng: Rng, featured: string | null = null): CreatureRef {
  let rarity = zoneRarity;
  const u = rng.next();
  const up = golden ? 0.3 : 0.06;
  const down = zoneRarity > 0 && !golden ? 0.15 : 0;
  if (u < up && rarity < RARITIES.length - 1) rarity++;
  else if (u < up + down) rarity--;

  const species = pickSpecies(rarity, rng, featured);

  const m = rng.next();
  const [rainbow, diamond, gold] = golden ? [0.03, 0.1, 0.35] : [0.004, 0.015, 0.05];
  let mutation = 0;
  if (m < rainbow) mutation = 3;
  else if (m < rainbow + diamond) mutation = 2;
  else if (m < rainbow + diamond + gold) mutation = 1;

  return { speciesId: species.id, mutation };
}
