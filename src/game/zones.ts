/** One stretch of the course. Zones get wider-spaced hooks and rarer creatures. */
export interface ZoneDef {
  name: string;
  /** Rarity tier that mostly spawns here (index into RARITIES). */
  rarity: number;
  islands: number;
  /** Anchors (hooks) hanging over each gap. */
  anchors: number;
  /** Distance between neighbouring anchors in a gap. */
  spacing: [number, number];
  /** Distance from an island's edge to the nearest anchor. Gap = 2 * edge + (anchors - 1) * spacing. */
  edge: [number, number];
  /** How high anchors hang above the higher of the two islands. */
  rise: [number, number];
  /** Rope Reach (meters) needed before this zone's hooks can be grabbed. */
  minReach: number;
  len: [number, number];
  width: [number, number];
  spawns: number;
  /** How far each island can drift sideways from the previous one. */
  wander: number;
  grass: string;
  rock: string;
}

export const ZONES: readonly ZoneDef[] = [
  { name: 'Shallows', rarity: 0, islands: 3, anchors: 1, spacing: [0, 0], edge: [4.5, 5], rise: [8.5, 9.5], minReach: 0, len: [11, 13], width: [10, 12], spawns: 2, wander: 3, grass: '#7ed957', rock: '#e9d49c' },
  { name: 'Coral Reef', rarity: 1, islands: 3, anchors: 1, spacing: [0, 0], edge: [5.5, 6.5], rise: [9.5, 10.5], minReach: 10.3, len: [10, 12], width: [10, 12], spawns: 2, wander: 4, grass: '#ff9fb8', rock: '#f0c9a8' },
  { name: 'Lagoon', rarity: 2, islands: 3, anchors: 1, spacing: [0, 0], edge: [7, 8], rise: [10.5, 11.5], minReach: 11.9, len: [10, 12], width: [9.5, 11], spawns: 2, wander: 4, grass: '#47d6c4', rock: '#d8c7a0' },
  { name: 'Stormy Seas', rarity: 3, islands: 3, anchors: 2, spacing: [10, 11], edge: [6.5, 7.5], rise: [11, 12], minReach: 13.5, len: [9, 11], width: [9.5, 11], spawns: 2, wander: 5, grass: '#93a7bd', rock: '#66758a' },
  { name: 'Kraken Deep', rarity: 4, islands: 3, anchors: 2, spacing: [12, 13], edge: [7.5, 8.5], rise: [12, 13], minReach: 15.1, len: [9, 11], width: [9.5, 10.5], spawns: 2, wander: 5, grass: '#8a6bff', rock: '#4b3f72' },
  { name: 'Volcano Bay', rarity: 5, islands: 3, anchors: 2, spacing: [13.5, 14.5], edge: [8.5, 9.5], rise: [13, 14], minReach: 16.7, len: [8.5, 10], width: [9.5, 10.5], spawns: 2, wander: 5, grass: '#ff7a45', rock: '#5a3a32' },
  { name: 'Secret Reef', rarity: 6, islands: 3, anchors: 3, spacing: [14.5, 15.5], edge: [9, 10], rise: [13.5, 14.5], minReach: 18.3, len: [8.5, 10], width: [9.5, 10.5], spawns: 3, wander: 4, grass: '#54f2ff', rock: '#3a4a7a' },
];
