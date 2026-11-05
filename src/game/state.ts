import { ECONOMY } from './config';
import { creatureIncome, hasSpecies, type CreatureRef } from './creatures';
import {
  UPGRADES,
  UPGRADE_ORDER,
  baseSlots,
  carryCapacity,
  emptyLevels,
  playerStats,
  rebirthCost,
  rebirthMultiplier,
  upgradeCost,
  type UpgradeKey,
  type UpgradeLevels,
} from './economy';
import type { PlayerStats } from './player';
import type { Settings } from '../contracts';

export const SAVE_VERSION = 1;

export function defaultSettings(): Settings {
  return { music: 50, sound: 80, muted: false, quality: 'auto', autoTier: null, reduceMotion: false, camSens: 1, invertY: false, swingAssist: true };
}

export interface SaveData {
  v: number;
  cash: number;
  totalEarned: number;
  rebirths: number;
  levels: UpgradeLevels;
  base: (CreatureRef | null)[];
  /** speciesId -> bitmask of mutations seen (bit n = mutation n). */
  index: Record<string, number>;
  flags: Record<string, boolean>;
  bestZone: number;
  /** v1 field; v2 saves use settings. */
  sound?: boolean;
  settings?: Partial<Settings>;
  /** Epoch ms when the save was written (for offline earnings). */
  savedAt: number;
}

export interface DeliveryResult {
  placed: CreatureRef[];
  sold: { creature: CreatureRef; cash: number }[];
}

/** Everything that persists between sessions: money, upgrades, the base, the index. */
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

  /** Pedestal income with the rebirth multiplier, before any temporary boosts. */
  baseIncomePerSec(): number {
    let total = 0;
    for (const c of this.base) if (c) total += creatureIncome(c);
    return total * this.multiplier;
  }

  incomePerSec(): number {
    return this.baseIncomePerSec();
  }

  earn(amount: number): void {
    this.cash += amount;
    this.totalEarned += amount;
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

  pickUp(c: CreatureRef): boolean {
    if (!this.canCarryMore()) return false;
    this.carried.push({ speciesId: c.speciesId, mutation: c.mutation });
    this.index[c.speciesId] = (this.index[c.speciesId] ?? 0) | (1 << c.mutation);
    return true;
  }

  /**
   * Puts carried creatures on pedestals. If the base is full, a better creature
   * replaces the weakest one, and whatever doesn't fit is sold for 30 seconds of its income.
   */
  deliver(): DeliveryResult {
    const result: DeliveryResult = { placed: [], sold: [] };
    const incoming = [...this.carried].sort((a, b) => creatureIncome(b) - creatureIncome(a));
    this.carried = [];
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
    if (key === 'slots') this.syncBaseSize();
    return true;
  }

  rebirthCost(): number {
    return rebirthCost(this.rebirths);
  }

  canRebirth(): boolean {
    return this.cash >= this.rebirthCost();
  }

  /** Resets cash and upgrades for a permanent income multiplier. Creatures and the index stay. */
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
    return true;
  }

  toSave(now = Date.now()): SaveData {
    return {
      v: SAVE_VERSION,
      cash: this.cash,
      totalEarned: this.totalEarned,
      rebirths: this.rebirths,
      levels: { ...this.levels },
      base: this.base.map((c) => (c ? { ...c } : null)),
      index: { ...this.index },
      flags: { ...this.flags },
      bestZone: this.bestZone,
      settings: { ...this.settings },
      savedAt: now,
    };
  }

  /** Loads a save, ignoring anything malformed. Returns false if the save was unusable. */
  load(data: unknown): boolean {
    if (!data || typeof data !== 'object') return false;
    const d = data as Partial<SaveData>;
    if (d.v !== SAVE_VERSION) return false;
    const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback);
    this.cash = num(d.cash, 0);
    this.totalEarned = num(d.totalEarned, 0);
    this.rebirths = Math.floor(num(d.rebirths, 0));
    this.levels = emptyLevels();
    if (d.levels && typeof d.levels === 'object') {
      for (const key of UPGRADE_ORDER) {
        this.levels[key] = Math.min(UPGRADES[key].maxLevel, Math.floor(num(d.levels[key], 0)));
      }
    }
    this.base = [];
    this.syncBaseSize();
    if (Array.isArray(d.base)) {
      d.base.slice(0, this.base.length).forEach((c, i) => {
        if (c && typeof c === 'object' && hasSpecies(c.speciesId) && Number.isInteger(c.mutation) && c.mutation >= 0 && c.mutation <= 3) {
          this.base[i] = { speciesId: c.speciesId, mutation: c.mutation };
        }
      });
    }
    this.index = {};
    if (d.index && typeof d.index === 'object') {
      for (const [k, v] of Object.entries(d.index)) if (hasSpecies(k) && typeof v === 'number') this.index[k] = v & 0b1111;
    }
    this.flags = {};
    if (d.flags && typeof d.flags === 'object') {
      for (const [k, v] of Object.entries(d.flags)) if (typeof v === 'boolean') this.flags[k] = v;
    }
    this.bestZone = typeof d.bestZone === 'number' ? d.bestZone : -1;
    this.settings = defaultSettings();
    if (d.sound === false) this.settings.muted = true;
    if (d.settings && typeof d.settings === 'object') {
      const t = d.settings as Record<string, unknown>;
      const def = this.settings as unknown as Record<string, unknown>;
      for (const k of Object.keys(def)) {
        if (k in t && (typeof t[k] === typeof def[k] || (k === 'autoTier' && (t[k] === null || typeof t[k] === 'string')))) def[k] = t[k];
      }
    }
    return true;
  }
}
