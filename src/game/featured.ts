import { hashKey } from './clock';
import { SPECIES } from './creatures';
import { Rng } from './rng';

/** Species that can be featured: rarity ≤ 4 (Common to Legendary). */
export const FEATURABLE = SPECIES.filter((s) => s.rarity <= 4).map((s) => s.id);

/** This week's Featured Creature, seeded by the ISO week key (§9.0). */
export function featuredSpeciesFor(weekKey: string): string {
  return new Rng(hashKey(`featured:${weekKey}`)).pick(FEATURABLE);
}
