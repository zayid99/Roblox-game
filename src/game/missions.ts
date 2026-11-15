// Daily Missions (DESIGN_V2 §9.1, docs/research/r4-retention.md #5). Pure logic: 3 missions per local day (one
// easy, one medium, one hard), drawn from template pools seeded by the day key. Progress is a stat delta since the
// mission was rolled (or, for "best today" stats, the stat itself). Unlocked at the end of the tutorial (a change from
// the spec, which unlocked them after the Voyage), so first-session players see tomorrow's reset.
import { daysBetween, hashKey } from './clock';
import { RARITIES } from './creatures';
import { formatCash } from './economy';
import { minutes, type RewardSpec } from './rewards';
import { Rng } from './rng';
import type { GameState, MissionInstance, StatKey } from './state';
import { ZONES } from './zones';
import type { IconId } from '../contracts';

export type MissionTier = MissionInstance['tier'];
export const MISSION_TIERS: readonly MissionTier[] = ['easy', 'medium', 'hard'];

interface MissionTemplate {
  id: string;
  tier: MissionTier;
  icon: IconId;
  stat: StatKey;
  /** 'delta': stat − start ≥ target. 'best': a today-best stat checked directly. */
  mode: 'delta' | 'best';
  /** Target and optional parameter for this player; null = not offered to them now. */
  make(s: GameState): { target: number; param?: number } | null;
  text(target: number, param?: number): string;
  /** The value progress is measured on (default: the stat). */
  value?(s: GameState, param?: number): number;
}

const z = (s: GameState) => Math.max(0, s.bestZone);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
/** Rarity a "Catch a ..." mission asks for: the best zone's, at least Uncommon. */
const huntRarity = (s: GameState) => Math.max(1, ZONES[Math.min(ZONES.length - 1, z(s))].rarity);

/** §9.1 pools. Templates that need stats the game does not track yet (zone catches, best trip) are left out. */
export const MISSION_TEMPLATES: readonly MissionTemplate[] = [
  { id: 'e_grabs', tier: 'easy', icon: 'hand', stat: 'grabs', mode: 'delta', make: () => ({ target: 15 }), text: (t) => `Grab ${t} hooks` },
  { id: 'e_deliver', tier: 'easy', icon: 'home', stat: 'creaturesDelivered', mode: 'delta', make: () => ({ target: 5 }), text: (t) => `Deliver ${plural(t, 'creature')}` },
  { id: 'e_perfect', tier: 'easy', icon: 'perfect', stat: 'perfects', mode: 'delta', make: () => ({ target: 3 }), text: (t) => `Land ${plural(t, 'Perfect Release')}` },
  { id: 'e_buy', tier: 'easy', icon: 'shop', stat: 'upgradesBought', mode: 'delta', make: () => ({ target: 3 }), text: (t) => `Buy ${plural(t, 'upgrade')}` },
  { id: 'e_waves', tier: 'easy', icon: 'wave', stat: 'wavesSurvived', mode: 'delta', make: () => ({ target: 2 }), text: (t) => `Survive ${plural(t, 'wave')}` },

  { id: 'm_chain', tier: 'medium', icon: 'chain', stat: 'bestChainToday', mode: 'best', make: (s) => ({ target: 6 + Math.floor(z(s) / 2) }), text: (t) => `Reach a ×${t} chain` },
  { id: 'm_catch', tier: 'medium', icon: 'creature', stat: 'collects', mode: 'delta', make: () => ({ target: 12 }), text: (t) => `Catch ${t} creatures` },
  { id: 'm_perfect', tier: 'medium', icon: 'perfect', stat: 'perfects', mode: 'delta', make: () => ({ target: 8 }), text: (t) => `Land ${t} Perfect Releases` },
  { id: 'm_hatch', tier: 'medium', icon: 'egg', stat: 'eggsHatched', mode: 'delta', make: () => ({ target: 1 }), text: () => 'Hatch an egg' },
  {
    id: 'm_cash', tier: 'medium', icon: 'cash', stat: 'cashEarned', mode: 'delta',
    // Frozen at generation: 10 minutes of the income the player has when the mission is rolled.
    make: (s) => ({ target: minutes(s, 10) }),
    text: (t) => `Earn ${formatCash(t)}`,
  },

  {
    id: 'h_rarity', tier: 'hard', icon: 'gem', stat: 'collects', mode: 'delta',
    make: (s) => ({ target: z(s) >= 1 ? 3 : 1, param: huntRarity(s) }),
    text: (t, r = 1) => (t === 1 ? `Catch ${/^[AEIOU]/.test(RARITIES[r].name) ? 'an' : 'a'} ${RARITIES[r].name}` : `Catch ${t} ${RARITIES[r].name}s`),
    value: (s, r = 1) => s.counters.collectsByRarity[r] ?? 0,
  },
  { id: 'h_mutation', tier: 'hard', icon: 'sparkle', stat: 'mutatedCollects', mode: 'delta', make: () => ({ target: 1 }), text: () => 'Catch a mutated creature' },
  { id: 'h_chain', tier: 'hard', icon: 'chain', stat: 'bestChainToday', mode: 'best', make: (s) => ({ target: 10 + z(s) }), text: (t) => `Reach a ×${t} chain` },
  { id: 'h_deliver', tier: 'hard', icon: 'home', stat: 'creaturesDelivered', mode: 'delta', make: () => ({ target: 15 }), text: (t) => `Deliver ${t} creatures` },
  { id: 'h_golden', tier: 'hard', icon: 'sparkle', stat: 'goldenBatchCollects', mode: 'delta', make: () => ({ target: 3 }), text: (t) => `Catch ${t} after a Golden Wave` },
  { id: 'h_close', tier: 'hard', icon: 'warning', stat: 'closeCalls', mode: 'delta', make: () => ({ target: 2 }), text: (t) => `Make ${t} Close Calls` },
];

const TEMPLATE_BY_ID = new Map(MISSION_TEMPLATES.map((t) => [t.id, t]));

/**
 * Rewards in minutes of income and Pearls (resolved at claim time). Smaller cash than §9.1 (3/6/10 min): missions
 * now start in the first session, and the pacing bands count them. The hard one is a 2× Cash Boost (it pays the most
 * to a player who keeps playing). All three claimed: a bonus chest.
 */
export const MISSION_REWARDS: Record<MissionTier, RewardSpec> = {
  easy: { min: 2, pearls: 5 },
  medium: { min: 3, pearls: 10 },
  hard: { boostMin: 5, pearls: 20 },
};
export const MISSION_BONUS: RewardSpec = { mystery: true, pearls: 25 };

function rollTemplate(s: GameState, tier: MissionTier, rng: Rng, exclude: readonly string[]): MissionInstance | null {
  const pool = MISSION_TEMPLATES.filter((t) => t.tier === tier && !exclude.includes(t.id) && t.make(s) !== null);
  if (!pool.length) return null;
  const t = pool[Math.floor(rng.next() * pool.length)];
  const made = t.make(s) as { target: number; param?: number };
  const m: MissionInstance = { tpl: t.id, tier, target: made.target, stat: t.stat, start: 0, claimed: false, rerolled: false };
  if (made.param !== undefined) m.param = made.param;
  m.start = t.mode === 'best' ? 0 : statValue(s, m);
  return m;
}

/** The value a mission's progress is measured on. */
function statValue(s: GameState, m: MissionInstance): number {
  const t = TEMPLATE_BY_ID.get(m.tpl);
  if (t?.value) return t.value(s, m.param);
  const v = (s.counters as unknown as Record<string, unknown>)[m.stat];
  return typeof v === 'number' ? v : 0;
}

/** Today's three missions (deterministic for a day key and the player's state at that moment). */
export function rollMissions(s: GameState, day: string): MissionInstance[] {
  const rng = new Rng(hashKey(`missions:${day}`));
  const out: MissionInstance[] = [];
  for (const tier of MISSION_TIERS) {
    const m = rollTemplate(s, tier, rng, []);
    if (m) out.push(m);
  }
  return out;
}

/**
 * Rolls a new day's missions when the local day changed (or the saved list is unusable). A clock that went
 * backwards keeps the current list. Returns true when it rolled.
 */
export function ensureMissions(s: GameState, today: string): boolean {
  const ms = s.missions;
  const valid = ms.list.length === MISSION_TIERS.length && ms.list.every((m) => TEMPLATE_BY_ID.has(m.tpl));
  if (valid && ms.day !== '') {
    const d = daysBetween(ms.day, today);
    if (!(d > 0) && Number.isFinite(d)) return false;
  }
  ms.day = today;
  ms.list = rollMissions(s, today);
  ms.bonusClaimed = false;
  return true;
}

export interface MissionProgress {
  value: number;
  target: number;
  frac: number;
  done: boolean;
}

export function missionProgress(s: GameState, m: MissionInstance): MissionProgress {
  const t = TEMPLATE_BY_ID.get(m.tpl);
  const raw = statValue(s, m);
  const value = Math.max(0, t?.mode === 'best' ? raw : raw - m.start);
  const v = Math.min(value, m.target);
  return { value: v, target: m.target, frac: m.target > 0 ? v / m.target : 1, done: value >= m.target };
}

export function missionText(m: MissionInstance): string {
  const t = TEMPLATE_BY_ID.get(m.tpl);
  return t ? t.text(m.target, m.param) : 'Mission';
}

export function missionIcon(m: MissionInstance): IconId {
  return TEMPLATE_BY_ID.get(m.tpl)?.icon ?? 'check';
}

/** Done and not claimed yet. */
export function missionClaimable(s: GameState, i: number): boolean {
  const m = s.missions.list[i];
  return !!m && !m.claimed && missionProgress(s, m).done;
}

/** All three claimed and the bonus chest not opened yet. */
export function missionBonusClaimable(s: GameState): boolean {
  const list = s.missions.list;
  return list.length > 0 && list.every((m) => m.claimed) && !s.missions.bonusClaimed;
}

/** How many CLAIM taps are waiting (missions plus the bonus chest). */
export function missionsClaimableCount(s: GameState): number {
  let n = 0;
  for (let i = 0; i < s.missions.list.length; i++) if (missionClaimable(s, i)) n++;
  // The bonus becomes claimable only after the last claim, so it never adds to a mission badge.
  return n + (missionBonusClaimable(s) ? 1 : 0);
}

/** One free reroll per mission per day: a different template of the same tier, measured from now. */
export function rerollMission(s: GameState, i: number, seed: string): boolean {
  const m = s.missions.list[i];
  if (!m || m.claimed || m.rerolled || missionProgress(s, m).done) return false;
  const used = s.missions.list.map((x) => x.tpl);
  const next = rollTemplate(s, m.tier, new Rng(hashKey(seed)), used);
  if (!next) return false;
  next.rerolled = true;
  s.missions.list[i] = next;
  return true;
}
