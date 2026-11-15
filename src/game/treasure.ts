// Treasure Bottles (docs/research/r4-retention.md, proposal 7). Pure logic: no rendering, no DOM.
//
// After a wave a glowing bottle can wash up on the farthest island the player can reach. Picking it up uses a
// carry slot, the wave takes it like a creature, and delivering it home opens it (prize table below).
//
// Economy ("N min" = N minutes of base income, rewards.ts minutes()). Spawn rule and odds are r4's; the amounts
// are scaled down from r4 (cash 3–8 min → 1–2 min, 2× boost 5 → 2 min) because bottles come often: about 58% of
// waves leave one (every Golden and Big Wave, 30% of the rest), roughly one every 2 minutes. A normal bottle is
// worth about 1 min of income in cash and boost on average, plus a 7% + 1% chance of a mutated or Rainbow creature.
// Measured with tests/pacingSim.ts (treasureShare = share of bottles brought home), mean over 12 seeds:
//   30% brought home: zone gates and the first rebirth about 7–13% earlier;
//   50% brought home: Lagoon 12%, Stormy Seas to Secret Reef 19–22%, first rebirth 20% earlier.
// The pacing bands (tests/pacing.test.ts) are measured without bottles (treasureShare 0, the default).
// To lower the impact, lower TREASURE.normalWaveChance or the `min` ranges below.
import { Vector3 } from 'three';
import type { BottleKind, Reward, TreasurePrizeKind } from '../contracts';
import type { Course, Island } from './course';
import { pickSpecies, RARITIES, type CreatureRef } from './creatures';
import { minutes, rollMysteryCreature } from './rewards';
import type { Rng } from './rng';
import type { GameSim } from './sim';
import type { GameState } from './state';
import { ZONES } from './zones';

export const TREASURE = {
  /** Chance that a normal wave leaves a bottle. Golden and Big Waves always do (a Big Wave's is Legendary). */
  normalWaveChance: 0.15, // halved from the design's 0.3: bottles were pulling the long-term zone gates 13-20% earlier
  /** Bottles a Treasure Fleet sea event washes up. */
  fleetCount: 3,
  /** Most bottles lying in the world at once. */
  maxInWorld: 4,
  /** Pick-up distance (m), as for creatures. */
  pickupRadius: 1.7,
  /** Length of a 2× Cash boost prize (s); granted through Reward.boost2xSec. */
  boostSec: 120,
};

/** One row of a bottle's prize table. `min` is minutes of base income (a random whole number in the range). */
export interface PrizeRow {
  kind: TreasurePrizeKind;
  /** Percent; each table sums to 100. */
  weight: number;
  min?: readonly [number, number];
  pearls?: readonly [number, number];
  boostSec?: number;
  luckyTide?: number;
}

/**
 * Prize tables. The odds are r4's (50/20/12/10/7/1); the cash is lower than r4's 3–8 min, so that bottles after
 * 30% of normal waves and every Golden/Big Wave stay a modest share of income (see the header).
 * - creature: a Mystery Creature (rarity of the best zone + 1, Gold 70% / Diamond 30%).
 * - rainbow: a Rainbow creature of the best zone's rarity (+1 in a Legendary bottle).
 */
export const BOTTLE_TABLES: Record<BottleKind, readonly PrizeRow[]> = {
  normal: [
    { kind: 'cash', weight: 50, min: [1, 2] },
    { kind: 'pearls', weight: 20, pearls: [15, 40] },
    { kind: 'boost', weight: 12, boostSec: TREASURE.boostSec },
    { kind: 'luckyTide', weight: 10, luckyTide: 1 },
    { kind: 'creature', weight: 7 },
    { kind: 'rainbow', weight: 1 },
  ],
  // Big Wave: a "Legendary bottle". Fewer cash rolls, bigger everything.
  legendary: [
    { kind: 'cash', weight: 35, min: [2, 4] },
    { kind: 'pearls', weight: 20, pearls: [40, 80] },
    { kind: 'boost', weight: 15, boostSec: 300 },
    { kind: 'luckyTide', weight: 12, luckyTide: 1 },
    { kind: 'creature', weight: 15 },
    { kind: 'rainbow', weight: 3 },
  ],
};

/** Odds text for the reveal card, e.g. "50% Cash · 20% Pearls · …". */
export function oddsText(kind: BottleKind): string {
  const label: Record<TreasurePrizeKind, string> = {
    cash: 'Cash', pearls: 'Pearls', boost: '2× Cash', luckyTide: 'Lucky Tide', creature: 'Mutated creature', rainbow: 'Rainbow creature',
  };
  return BOTTLE_TABLES[kind].map((r) => `${r.weight}% ${label[r.kind]}`).join(' · ');
}

/** Which bottle (if any) a finished wave leaves. Uses one roll of rng for a normal wave, none otherwise. */
export function rollWaveBottle(golden: boolean, big: boolean, rng: Rng): BottleKind | null {
  if (big) return 'legendary';
  if (golden) return 'normal';
  return rng.chance(TREASURE.normalWaveChance) ? 'normal' : null;
}

/** Picks a row of the table (weights in percent). */
export function rollPrizeRow(kind: BottleKind, rng: Rng): PrizeRow {
  const table = BOTTLE_TABLES[kind];
  let u = rng.next() * 100;
  for (const row of table) {
    u -= row.weight;
    if (u < 0) return row;
  }
  return table[table.length - 1];
}

export interface OpenedBottle {
  prize: TreasurePrizeKind;
  reward: Reward;
}

/** Opens a bottle: rolls the prize and resolves it against the current state (income, best zone). Pure. */
export function openBottle(state: GameState, kind: BottleKind, rng: Rng): OpenedBottle {
  const row = rollPrizeRow(kind, rng);
  const reward: Reward = {};
  switch (row.kind) {
    case 'cash': {
      const [lo, hi] = row.min ?? [1, 1];
      reward.cash = minutes(state, rng.int(lo, hi));
      break;
    }
    case 'pearls': {
      const [lo, hi] = row.pearls ?? [10, 10];
      reward.pearls = rng.int(lo, hi);
      break;
    }
    case 'boost':
      reward.boost2xSec = row.boostSec ?? TREASURE.boostSec;
      break;
    case 'luckyTide':
      reward.luckyTide = row.luckyTide ?? 1;
      break;
    case 'creature':
      reward.creature = rollMysteryCreature(state, rng);
      break;
    case 'rainbow':
      reward.creature = rainbowCreature(state, kind === 'legendary' ? 1 : 0, rng);
      break;
  }
  return { prize: row.kind, reward };
}

function rainbowCreature(state: GameState, up: number, rng: Rng): CreatureRef {
  const z = Math.max(0, Math.min(ZONES.length - 1, state.bestZone));
  const rarity = Math.min(RARITIES.length - 1, ZONES[z].rarity + up);
  return { speciesId: pickSpecies(rarity, rng).id, mutation: 3 };
}

export interface Bottle {
  uid: number;
  kind: BottleKind;
  pos: Vector3;
  islandOrder: number;
  zone: number;
  /** Sim time it washed up (the renderer bobs and pops it in from this). */
  bornAt: number;
}

/**
 * Bottles in the world and in the player's hands. GameSim owns one and calls it at the wave's surge end, every
 * surge step (wash), on pick-up, on a splash and at home. It has its own Rng, so creature rolls stay the same.
 */
export class TreasureSim {
  world: Bottle[] = [];
  carried: Bottle[] = [];
  private nextUid = 1;

  constructor(
    private readonly course: Course,
    readonly rng: Rng,
  ) {}

  /** Islands in zones the player has reached (at least the first zone), farthest first. */
  reachableIslands(bestZone: number): Island[] {
    const z = Math.max(0, bestZone);
    return this.course.islands.filter((i) => i.zone <= z && i.spawnPoints.length > 0).sort((a, b) => b.order - a.order);
  }

  /**
   * Puts a bottle on `island` (default: the farthest reachable one), on a spawn point no creature or bottle
   * stands on (else beside the island's checkpoint). Null when the world already holds TREASURE.maxInWorld.
   */
  spawn(kind: BottleKind, bestZone: number, time: number, occupied: readonly Vector3[], island?: Island): Bottle | null {
    if (this.world.length >= TREASURE.maxInWorld) return null;
    const isl = island ?? this.reachableIslands(bestZone)[0];
    if (!isl) return null;
    const taken = (p: Vector3) =>
      occupied.some((o) => o.distanceToSquared(p) < 1) || this.world.some((b) => b.pos.distanceToSquared(p) < 1);
    const free = isl.spawnPoints.filter((p) => !taken(p));
    const pos = free.length ? this.rng.pick(free).clone() : isl.checkpoint.clone().add(new Vector3(1.2, 0, 0));
    const b: Bottle = { uid: this.nextUid++, kind, pos, islandOrder: isl.order, zone: isl.zone, bornAt: time };
    this.world.push(b);
    return b;
  }

  /** End of a surge: maybe one bottle on the farthest reachable island (see rollWaveBottle). */
  afterWave(golden: boolean, big: boolean, bestZone: number, time: number, occupied: readonly Vector3[]): Bottle | null {
    const kind = rollWaveBottle(golden, big, this.rng);
    return kind ? this.spawn(kind, bestZone, time, occupied) : null;
  }

  /** Treasure Fleet: TREASURE.fleetCount bottles, the farthest reachable island first, the rest on other islands. */
  fleet(bestZone: number, time: number, occupied: readonly Vector3[]): Bottle[] {
    const islands = this.reachableIslands(bestZone);
    const out: Bottle[] = [];
    if (!islands.length) return out;
    const rest = islands.slice(1);
    const picks: Island[] = [islands[0]];
    while (picks.length < TREASURE.fleetCount && rest.length) picks.push(rest.splice(Math.floor(this.rng.next() * rest.length), 1)[0]);
    while (picks.length < TREASURE.fleetCount) picks.push(islands[0]);
    for (const isl of picks) {
      const b = this.spawn('normal', bestZone, time, occupied, isl);
      if (b) out.push(b);
    }
    return out;
  }

  /** The wave front passed these bottles: they are gone. Returns the washed ones (empty array most steps). */
  wash(frontZ: number): Bottle[] {
    if (!this.world.length) return NONE;
    const gone = this.world.filter((b) => b.pos.z < frontZ);
    if (gone.length) this.world = this.world.filter((b) => b.pos.z >= frontZ);
    return gone.length ? gone : NONE;
  }

  /** Picks up the first bottle within reach if a carry slot is free. */
  tryPickUp(pos: Vector3, freeSlots: number): Bottle | null {
    if (freeSlots <= 0) return null;
    for (let i = 0; i < this.world.length; i++) {
      const b = this.world[i];
      if (Math.abs(b.pos.y - pos.y) > 2.5) continue;
      if (Math.hypot(b.pos.x - pos.x, b.pos.z - pos.z) > TREASURE.pickupRadius) continue;
      this.world.splice(i, 1);
      this.carried.push(b);
      return b;
    }
    return null;
  }

  /** Is a bottle within reach (for the "hands full" message)? */
  near(pos: Vector3): boolean {
    return this.world.some((b) => Math.abs(b.pos.y - pos.y) <= 2.5 && Math.hypot(b.pos.x - pos.x, b.pos.z - pos.z) <= TREASURE.pickupRadius);
  }

  /** Empties the player's hands (the wave got them, or they reached home). */
  takeCarried(): Bottle[] {
    const c = this.carried;
    this.carried = [];
    return c;
  }
}

const NONE: Bottle[] = [];

const homeTarget = new Vector3();

/**
 * Edge-arrow target for bottles (after the tutorial, calm phase only, so the wave-safety arrow wins): home while
 * carrying one, else the nearest bottle while a carry slot is free. Null otherwise.
 */
export function treasureTarget(sim: GameSim): { pos: Vector3; icon: 'gift' | 'home'; label: string } | null {
  if (sim.wave.phase !== 'calm' || sim.splashTime > 0 || sim.seaRespawnTime > 0 || !sim.state.ftue.done) return null;
  const p = sim.player.pos;
  if (sim.treasure.carried.length) {
    if (sim.isOnHome()) return null;
    const h = homeTarget.copy(sim.course.homeSpawn);
    return { pos: h, icon: 'home', label: `Open ${Math.round(Math.hypot(h.x - p.x, h.z - p.z))} m` };
  }
  if (!sim.treasure.world.length || sim.carryFree() <= 0) return null;
  let best: Bottle | null = null;
  let bestD = Infinity;
  for (const b of sim.treasure.world) {
    const d = Math.hypot(b.pos.x - p.x, b.pos.z - p.z);
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return best ? { pos: best.pos, icon: 'gift', label: `Treasure ${Math.round(bestD)} m` } : null;
}
