import { ECONOMY } from './config';
import { creatureIncome, hasSpecies, type CreatureRef } from './creatures';
import {
  UPGRADES,
  UPGRADE_ORDER,
  baseSlots,
  bulkCost,
  carryCapacity,
  emptyLevels,
  maxAffordable,
  playerStats,
  rebirthCost,
  rebirthMultiplier,
  upgradeCost,
  type UpgradeKey,
  type UpgradeLevels,
} from './economy';
import type { PlayerStats } from './player';
import type { FtueStepId, Settings } from '../contracts';

export const SAVE_VERSION = 2;

export function defaultSettings(): Settings {
  return { music: 50, sound: 80, muted: false, quality: 'auto', autoTier: null, reduceMotion: false, camSens: 1, invertY: false, swingAssist: true };
}

export const FTUE_STEPS: readonly FtueStepId[] = ['grab', 'release', 'collect', 'home', 'earn', 'shop', 'wave', 'ready'];

/** Cumulative player stats (§9.8). Saved under the `stats` key; in memory it is `GameState.counters`. */
export interface Stats {
  grabs: number; perfects: number; bestChain: number; bestChainToday: number; chainDay: string;
  deliveries: number; creaturesDelivered: number;
  wavesSurvived: number; padLaunches: number; padLaunchesInWave: number;
  closeCalls: number; collects: number; collectsByRarity: number[] /* 7 */;
  mutatedCollects: number; goldenBatchCollects: number; cashEarned: number; upgradesBought: number;
  seaFalls: number; splashes: number; bounces: number; giftsClaimed: number; playSec: number;
  eggsHatched: number;
}
export type StatKey = { [K in keyof Stats]: Stats[K] extends number ? K : never }[keyof Stats];

export function emptyStats(): Stats {
  return {
    grabs: 0, perfects: 0, bestChain: 0, bestChainToday: 0, chainDay: '',
    deliveries: 0, creaturesDelivered: 0, wavesSurvived: 0, padLaunches: 0, padLaunchesInWave: 0,
    closeCalls: 0, collects: 0, collectsByRarity: [0, 0, 0, 0, 0, 0, 0],
    mutatedCollects: 0, goldenBatchCollects: 0, cashEarned: 0, upgradesBought: 0,
    seaFalls: 0, splashes: 0, bounces: 0, giftsClaimed: 0, playSec: 0,
    eggsHatched: 0,
  };
}

/** v2.1 Daily Missions (saved empty in v2.0). */
export interface MissionInstance {
  tpl: string; tier: 'easy' | 'medium' | 'hard'; target: number; stat: StatKey;
  start: number; param?: number; claimed: boolean; rerolled: boolean;
}

export interface FtueSave { step: FtueStepId; done: boolean; skipped: boolean; rewarded: string[] }
export interface DailySave { lastClaimDay: string | null; count: number /* total claims */; week: number; streak: number }
export interface GiftsSave { day: string; activeSec: number; claimed: number[]; pending: number[] }
export interface TokensSave { luckyTide: number; boost2xSec: number }
export interface CosmeticsSave { owned: string[]; equipped: { rope: string; trail: string }; seen: string[] }
export interface MissionsSave { day: string; list: MissionInstance[]; bonusClaimed: boolean }

export interface SaveDataV2 {
  v: 2;
  cash: number; totalEarned: number; rebirths: number; levels: UpgradeLevels;
  base: (CreatureRef | null)[]; index: Record<string, number>; flags: Record<string, boolean>;
  bestZone: number; savedAt: number; lastSeen: number;
  pearls: number;
  settings: Settings;
  ftue: FtueSave;
  voyage: { step: number };
  missions: MissionsSave;
  daily: DailySave;
  gifts: GiftsSave;
  tokens: TokensSave;
  cosmetics: CosmeticsSave;
  stats: Stats;
  indexClaims: string[]; indexSeen: string[]; hintsSeen: string[];
  featuredWeekSeen: string;
  /** Hatchery Buddy (a base creature that follows the player); missing in older v2 saves. */
  buddy?: CreatureRef | null;
}

/** The v0.1 save shape. */
export interface SaveDataV1 {
  v: 1;
  cash: number; totalEarned: number; rebirths: number; levels: UpgradeLevels;
  base: (CreatureRef | null)[]; index: Record<string, number>; flags: Record<string, boolean>;
  bestZone: number; sound?: boolean; settings?: Partial<Settings>; savedAt: number;
}

export type SaveData = SaveDataV2;

export interface DeliveryResult {
  placed: CreatureRef[];
  sold: { creature: CreatureRef; cash: number }[];
}

export const DEFAULT_ROPE = 'rope_hemp';
export const DEFAULT_TRAIL = 'trail_none';

export function defaultFtue(): FtueSave {
  return { step: 'grab', done: false, skipped: false, rewarded: [] };
}
export function defaultDaily(): DailySave {
  return { lastClaimDay: null, count: 0, week: 1, streak: 0 };
}
export function defaultGifts(): GiftsSave {
  return { day: '', activeSec: 0, claimed: [], pending: [] };
}
export function defaultCosmetics(): CosmeticsSave {
  return { owned: [DEFAULT_ROPE], equipped: { rope: DEFAULT_ROPE, trail: DEFAULT_TRAIL }, seen: [DEFAULT_ROPE] };
}

// ---------- sanitizers ----------
type Rec = Record<string, unknown>;
const isObj = (v: unknown): v is Rec => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback);
const int = (v: unknown, fallback: number) => Math.floor(num(v, fallback));
const str = (v: unknown, fallback: string) => (typeof v === 'string' ? v : fallback);
const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const intArr = (v: unknown): number[] =>
  Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number' && Number.isInteger(x) && x >= 0) : [];
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);

function sanitizeSettings(raw: unknown, base: Settings): Settings {
  const out = { ...base };
  if (!isObj(raw)) return out;
  const def = out as unknown as Rec;
  for (const k of Object.keys(def)) {
    if (!(k in raw)) continue;
    const v = raw[k];
    if (k === 'autoTier') {
      if (v === null || v === 'low' || v === 'medium' || v === 'high') def[k] = v;
    } else if (k === 'quality') {
      if (v === 'auto' || v === 'low' || v === 'medium' || v === 'high') def[k] = v;
    } else if (typeof v === typeof def[k] && (typeof v !== 'number' || Number.isFinite(v))) def[k] = v;
  }
  return out;
}

function sanitizeStats(raw: unknown): Stats {
  const s = emptyStats();
  if (!isObj(raw)) return s;
  const out = s as unknown as Rec;
  for (const k of Object.keys(out)) {
    if (k === 'chainDay') out[k] = str(raw[k], '');
    else if (k === 'collectsByRarity') {
      const arr = Array.isArray(raw[k]) ? (raw[k] as unknown[]) : [];
      s.collectsByRarity = s.collectsByRarity.map((_, i) => int(arr[i], 0));
    } else out[k] = num(raw[k], 0);
  }
  return s;
}

/** v1 → v2 (§9.8). The result still goes through the field-by-field v2 loader. */
export function migrateV1(raw: object): SaveDataV2 {
  const d = raw as Partial<SaveDataV1> & Rec;
  const flags = isObj(d.flags) ? (d.flags as Record<string, boolean>) : {};
  const done = !!(flags.delivered || flags.bought);
  const settings = sanitizeSettings(d.settings, defaultSettings());
  settings.music = 50;
  settings.sound = 80;
  if (d.sound === false) settings.muted = true;
  const savedAt = num(d.savedAt, 0);
  return {
    v: 2,
    cash: num(d.cash, 0),
    totalEarned: num(d.totalEarned, 0),
    rebirths: int(d.rebirths, 0),
    levels: (isObj(d.levels) ? d.levels : emptyLevels()) as UpgradeLevels,
    base: Array.isArray(d.base) ? d.base : [],
    index: isObj(d.index) ? (d.index as Record<string, number>) : {},
    flags,
    bestZone: typeof d.bestZone === 'number' ? d.bestZone : -1,
    savedAt,
    lastSeen: savedAt,
    pearls: 0,
    settings,
    ftue: { step: done ? 'ready' : 'grab', done, skipped: false, rewarded: [] },
    voyage: { step: done ? 6 : 0 },
    missions: { day: '', list: [], bonusClaimed: false },
    daily: defaultDaily(),
    gifts: defaultGifts(),
    tokens: { luckyTide: 0, boost2xSec: 0 },
    cosmetics: defaultCosmetics(),
    stats: emptyStats(),
    indexClaims: [],
    indexSeen: [],
    hintsSeen: [],
    featuredWeekSeen: '',
    buddy: null,
  };
}

/** Everything that persists between sessions: money, upgrades, the base, the index, progression. */
export class GameState {
  cash = 0;
  totalEarned = 0;
  rebirths = 0;
  levels: UpgradeLevels = emptyLevels();
  base: (CreatureRef | null)[] = [];
  carried: CreatureRef[] = [];
  index: Record<string, number> = {};
  flags: Record<string, boolean> = {};
  bestZone = -1;
  settings: Settings = defaultSettings();

  pearls = 0;
  ftue: FtueSave = defaultFtue();
  voyage = { step: 0 };
  missions: MissionsSave = { day: '', list: [], bonusClaimed: false };
  daily: DailySave = defaultDaily();
  gifts: GiftsSave = defaultGifts();
  tokens: TokensSave = { luckyTide: 0, boost2xSec: 0 };
  cosmetics: CosmeticsSave = defaultCosmetics();
  /** Cumulative stats (saved as `stats`; `stats` here is the player's movement stats). */
  counters: Stats = emptyStats();
  indexClaims: string[] = [];
  indexSeen: string[] = [];
  hintsSeen: string[] = [];
  featuredWeekSeen = '';
  /** Hatchery Buddy (game/hatchery.ts); only active while that creature is on the base. */
  buddy: CreatureRef | null = null;
  /** savedAt and lastSeen of the loaded save (0 for a new player). */
  savedAt = 0;
  lastSeen = 0;

  constructor() {
    this.syncBaseSize();
  }

  get stats(): PlayerStats {
    return playerStats(this.levels);
  }

  get carryCapacity(): number {
    return carryCapacity(this.levels);
  }

  get slotCount(): number {
    return baseSlots(this.levels);
  }

  get multiplier(): number {
    return rebirthMultiplier(this.rebirths);
  }

  /** Daily streak income bonus: +1% per streak day, up to 7 (§9.2). */
  get streakBonus(): number {
    return 1 + 0.01 * Math.min(this.daily.streak, 7);
  }

  /** Pedestal income × rebirth multiplier × streak bonus (no temporary boosts). */
  baseIncomePerSec(): number {
    let total = 0;
    for (const c of this.base) if (c) total += creatureIncome(c);
    return total * this.multiplier * this.streakBonus;
  }

  /** baseIncomePerSec × boost factor (always 1 in v2.0). */
  incomePerSec(): number {
    return this.baseIncomePerSec();
  }

  earn(amount: number): void {
    this.cash += amount;
    this.totalEarned += amount;
    this.counters.cashEarned += amount;
  }

  tick(dt: number): void {
    const income = this.incomePerSec();
    if (income > 0) this.earn(income * dt);
  }

  /** Grows the base array to match the current pedestal count (never shrinks creatures away). */
  syncBaseSize(): void {
    const n = this.slotCount;
    while (this.base.length < n) this.base.push(null);
  }

  canCarryMore(): boolean {
    return this.carried.length < this.carryCapacity;
  }

  /** Records a creature in the Index. Returns what was new about it. */
  registerIndex(c: CreatureRef): { isNewSpecies: boolean; isNewMutation: boolean } {
    const mask = this.index[c.speciesId];
    const isNewSpecies = mask === undefined || mask === 0;
    const isNewMutation = ((mask ?? 0) & (1 << c.mutation)) === 0;
    this.index[c.speciesId] = (mask ?? 0) | (1 << c.mutation);
    return { isNewSpecies, isNewMutation };
  }

  pickUp(c: CreatureRef): boolean {
    if (!this.canCarryMore()) return false;
    this.carried.push({ speciesId: c.speciesId, mutation: c.mutation });
    this.registerIndex(c);
    return true;
  }

  /**
   * Puts carried creatures on pedestals. If the base is full, a better creature
   * replaces the weakest one, and whatever doesn't fit is sold for 30 seconds of its income.
   */
  deliver(): DeliveryResult {
    const incoming = this.carried;
    this.carried = [];
    return this.place(incoming);
  }

  /** A reward creature (Mystery Creature) goes straight to the base with the deliver() rules. */
  grantCreature(c: CreatureRef): { result: DeliveryResult; isNewSpecies: boolean; isNewMutation: boolean } {
    const ref = { speciesId: c.speciesId, mutation: c.mutation };
    const news = this.registerIndex(ref);
    return { result: this.place([ref]), ...news };
  }

  /** Gives back creatures the wave took (rewarded ad), up to the carry capacity. */
  restoreCarried(refs: readonly CreatureRef[]): void {
    for (const c of refs) {
      if (!this.canCarryMore()) break;
      this.carried.push({ speciesId: c.speciesId, mutation: c.mutation });
    }
  }

  private place(list: readonly CreatureRef[]): DeliveryResult {
    const result: DeliveryResult = { placed: [], sold: [] };
    const incoming = [...list].sort((a, b) => creatureIncome(b) - creatureIncome(a));
    const slots = this.slotCount;
    for (const c of incoming) {
      let placed = false;
      for (let i = 0; i < slots; i++) {
        if (!this.base[i]) {
          this.base[i] = c;
          placed = true;
          break;
        }
      }
      if (!placed) {
        let weakest = -1;
        for (let i = 0; i < slots; i++) {
          const b = this.base[i];
          if (b && (weakest < 0 || creatureIncome(b) < creatureIncome(this.base[weakest]!))) weakest = i;
        }
        const old = weakest >= 0 ? this.base[weakest] : null;
        if (old && creatureIncome(c) > creatureIncome(old)) {
          this.base[weakest] = c;
          placed = true;
          const cash = creatureIncome(old) * ECONOMY.sellSeconds * this.multiplier;
          this.earn(cash);
          result.sold.push({ creature: old, cash });
        } else {
          const cash = creatureIncome(c) * ECONOMY.sellSeconds * this.multiplier;
          this.earn(cash);
          result.sold.push({ creature: c, cash });
        }
      }
      if (placed) result.placed.push(c);
    }
    return result;
  }

  /** Drops everything being carried (the wave got you). */
  loseCarried(): CreatureRef[] {
    const lost = this.carried;
    this.carried = [];
    return lost;
  }

  upgradeCost(key: UpgradeKey): number {
    return upgradeCost(key, this.levels[key]);
  }

  /** Cost of the next n levels (capped at the max level). */
  bulkCost(key: UpgradeKey, n: number): number {
    return bulkCost(key, this.levels[key], n);
  }

  /** How many levels the current cash buys in a row. */
  maxAffordable(key: UpgradeKey): number {
    return maxAffordable(key, this.levels[key], this.cash);
  }

  isMaxed(key: UpgradeKey): boolean {
    return this.levels[key] >= UPGRADES[key].maxLevel;
  }

  canBuy(key: UpgradeKey): boolean {
    return !this.isMaxed(key) && this.cash >= this.upgradeCost(key);
  }

  buy(key: UpgradeKey): boolean {
    if (!this.canBuy(key)) return false;
    this.cash -= this.upgradeCost(key);
    this.levels[key]++;
    this.counters.upgradesBought++;
    if (key === 'slots') this.syncBaseSize();
    return true;
  }

  /** Buys 1, 5 or as many levels as affordable. Buys nothing unless all n are affordable ('max' buys ≥ 1). Returns levels bought. */
  buyMany(key: UpgradeKey, n: number | 'max'): number {
    const want = n === 'max' ? this.maxAffordable(key) : Math.min(n, UPGRADES[key].maxLevel - this.levels[key]);
    if (want <= 0 || this.bulkCost(key, want) > this.cash) return 0;
    let bought = 0;
    while (bought < want && this.buy(key)) bought++;
    return bought;
  }

  rebirthCost(): number {
    return rebirthCost(this.rebirths);
  }

  canRebirth(): boolean {
    return this.cash >= this.rebirthCost();
  }

  /**
   * Resets cash and upgrades for a permanent income multiplier. Creatures that fit and the index stay.
   * The first rebirth grants the Aurora Rope, later ones 200 Pearls (§9.5).
   */
  rebirth(): boolean {
    if (!this.canRebirth()) return false;
    this.rebirths++;
    this.cash = 0;
    const kept = this.base.filter((c): c is CreatureRef => c !== null);
    this.levels = emptyLevels();
    this.base = [];
    this.syncBaseSize();
    kept.sort((a, b) => creatureIncome(b) - creatureIncome(a));
    // Keep the best creatures that fit; sell the rest.
    kept.forEach((c, i) => {
      if (i < this.base.length) this.base[i] = c;
      else this.earn(creatureIncome(c) * ECONOMY.sellSeconds * this.multiplier);
    });
    if (this.rebirths === 1 && !this.cosmetics.owned.includes('rope_aurora')) this.cosmetics.owned.push('rope_aurora');
    else this.pearls += 200;
    return true;
  }

  toSave(now = Date.now()): SaveDataV2 {
    return {
      v: 2,
      cash: this.cash,
      totalEarned: this.totalEarned,
      rebirths: this.rebirths,
      levels: { ...this.levels },
      base: this.base.map((c) => (c ? { ...c } : null)),
      index: { ...this.index },
      flags: { ...this.flags },
      bestZone: this.bestZone,
      savedAt: now,
      lastSeen: Math.max(now, this.lastSeen),
      pearls: this.pearls,
      settings: { ...this.settings },
      ftue: { ...this.ftue, rewarded: [...this.ftue.rewarded] },
      voyage: { ...this.voyage },
      missions: { day: this.missions.day, list: this.missions.list.map((m) => ({ ...m })), bonusClaimed: this.missions.bonusClaimed },
      daily: { ...this.daily },
      gifts: { ...this.gifts, claimed: [...this.gifts.claimed], pending: [...this.gifts.pending] },
      tokens: { ...this.tokens },
      cosmetics: {
        owned: [...this.cosmetics.owned],
        equipped: { ...this.cosmetics.equipped },
        seen: [...this.cosmetics.seen],
      },
      stats: { ...this.counters, collectsByRarity: [...this.counters.collectsByRarity] },
      indexClaims: [...this.indexClaims],
      indexSeen: [...this.indexSeen],
      hintsSeen: [...this.hintsSeen],
      featuredWeekSeen: this.featuredWeekSeen,
      buddy: this.buddy ? { ...this.buddy } : null,
    };
  }

  /** Loads a v1 or v2 save, ignoring anything malformed field by field. Returns false if the save was unusable. */
  load(data: unknown): boolean {
    if (!isObj(data)) return false;
    let d: Rec;
    if (data.v === 1) d = migrateV1(data) as unknown as Rec;
    else if (data.v === 2) d = data;
    else return false;

    this.cash = num(d.cash, 0);
    this.totalEarned = num(d.totalEarned, 0);
    this.rebirths = int(d.rebirths, 0);
    this.levels = emptyLevels();
    if (isObj(d.levels)) {
      const lv = d.levels;
      for (const key of UPGRADE_ORDER) this.levels[key] = Math.min(UPGRADES[key].maxLevel, int(lv[key], 0));
    }
    this.base = [];
    this.carried = [];
    this.syncBaseSize();
    if (Array.isArray(d.base)) {
      d.base.slice(0, this.base.length).forEach((c, i) => {
        if (isValidRef(c)) this.base[i] = { speciesId: c.speciesId, mutation: c.mutation };
      });
    }
    this.index = {};
    if (isObj(d.index)) {
      for (const [k, v] of Object.entries(d.index)) if (hasSpecies(k) && typeof v === 'number') this.index[k] = v & 0b1111;
    }
    this.flags = {};
    if (isObj(d.flags)) {
      for (const [k, v] of Object.entries(d.flags)) if (typeof v === 'boolean') this.flags[k] = v;
    }
    this.bestZone = typeof d.bestZone === 'number' && Number.isFinite(d.bestZone) ? Math.floor(d.bestZone) : -1;
    this.savedAt = num(d.savedAt, 0);
    this.lastSeen = Math.max(this.savedAt, num(d.lastSeen, 0));
    this.pearls = int(d.pearls, 0);
    this.settings = sanitizeSettings(d.settings, defaultSettings());

    const f = isObj(d.ftue) ? d.ftue : {};
    this.ftue = {
      step: FTUE_STEPS.includes(f.step as FtueStepId) ? (f.step as FtueStepId) : 'grab',
      done: bool(f.done, false),
      skipped: bool(f.skipped, false),
      rewarded: strArr(f.rewarded),
    };
    this.voyage = { step: Math.min(12, int(isObj(d.voyage) ? d.voyage.step : 0, 0)) };
    const m = isObj(d.missions) ? d.missions : {};
    this.missions = { day: str(m.day, ''), list: Array.isArray(m.list) ? (m.list as MissionInstance[]) : [], bonusClaimed: bool(m.bonusClaimed, false) };

    const dl = isObj(d.daily) ? d.daily : {};
    this.daily = {
      lastClaimDay: typeof dl.lastClaimDay === 'string' ? dl.lastClaimDay : null,
      count: int(dl.count, 0),
      week: Math.max(1, int(dl.week, 1)),
      streak: int(dl.streak, 0),
    };
    const g = isObj(d.gifts) ? d.gifts : {};
    this.gifts = { day: str(g.day, ''), activeSec: num(g.activeSec, 0), claimed: intArr(g.claimed), pending: intArr(g.pending) };
    const t = isObj(d.tokens) ? d.tokens : {};
    this.tokens = { luckyTide: int(t.luckyTide, 0), boost2xSec: num(t.boost2xSec, 0) };

    const c = isObj(d.cosmetics) ? d.cosmetics : {};
    const owned = strArr(c.owned);
    if (!owned.includes(DEFAULT_ROPE)) owned.unshift(DEFAULT_ROPE);
    const eq = isObj(c.equipped) ? c.equipped : {};
    const rope = str(eq.rope, DEFAULT_ROPE);
    this.cosmetics = {
      owned,
      equipped: { rope: owned.includes(rope) ? rope : DEFAULT_ROPE, trail: str(eq.trail, DEFAULT_TRAIL) },
      seen: isObj(d.cosmetics) ? strArr(c.seen) : [DEFAULT_ROPE],
    };
    this.counters = sanitizeStats(d.stats);
    this.indexClaims = strArr(d.indexClaims);
    this.indexSeen = strArr(d.indexSeen);
    this.hintsSeen = strArr(d.hintsSeen);
    this.featuredWeekSeen = str(d.featuredWeekSeen, '');
    this.buddy = isValidRef(d.buddy) ? { speciesId: d.buddy.speciesId, mutation: d.buddy.mutation } : null;
    return true;
  }
}

function isValidRef(c: unknown): c is CreatureRef {
  return isObj(c) && typeof c.speciesId === 'string' && hasSpecies(c.speciesId) && Number.isInteger(c.mutation) && (c.mutation as number) >= 0 && (c.mutation as number) <= 3;
}
