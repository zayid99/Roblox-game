import { dayKey, formatClock, hashKey, msUntilNextDay, systemClock, weekKey, type Clock } from './clock';
import { buyCosmetic, equipCosmetic, lockerItems, markCosmeticSeen } from './cosmetics';
import { RARITIES, SPECIES } from './creatures';
import { claimedToday, dailyClaimable, dailySpec, nextDailyDay, recordDailyClaim } from './daily';
import { cheapestUpgradeCost, offlineEarnings, rebirthCost } from './economy';
import { featuredSpeciesFor } from './featured';
import { GIFTS, giftState, readyGifts, rolloverGifts, secondsToNextGift } from './gifts';
import { rollStatsDay, trackSimEvent } from './progress';
import { VOYAGE_LENGTH, currentQuest, voyageDone, voyageRewardKey } from './quests';
import { DISCOVERY_PEARLS, applyReward, isEmptyReward, mergeRewards, resolveReward, type RewardSpec } from './rewards';
import { Rng } from './rng';
import { REBIRTH_VISIBLE_AT } from './shopView';
import { FTUE_STEPS, type GameState } from './state';
import { ZONES } from './zones';
import type {
  DailyTile,
  FreeView,
  IndexEntry,
  IndexView,
  LockerView,
  PanelData,
  RailId,
  RailTileState,
  Reward,
  SimEvent,
  TrackerView,
  WelcomeView,
} from '../contracts';
import type { GameSim } from './sim';

export type ProgressEvent =
  | { type: 'questDone'; index: number; reward: Reward }
  | { type: 'voyageDone' }
  | { type: 'giftReady'; index: number }
  | { type: 'dailyReady' }
  | { type: 'unlock'; what: RailId | 'locker' }
  | { type: 'rewardApplied'; reward: Reward; source: string }
  | { type: 'featured'; speciesId: string }
  | { type: 'discovery'; speciesId: string; pearls: number };

/** §9 clock-rollback guard: a session whose clock is this far behind the last save grants no time-based rewards. */
export const ROLLBACK_GUARD_MS = 5 * 60 * 1000;

export interface ProgressionContext {
  /** Visible and the last input was within 120 s (the lead decides). */
  active: boolean;
  sim: GameSim;
  ftueDone: boolean;
}

/**
 * Retention features facade (§10.5): stats, First Voyage, Daily calendar, Playtime gifts,
 * Locker, Index, Lucky Tide, Featured Creature, Welcome Back. Pure: no DOM, injected clock.
 */
export class Progression implements Pick<PanelData, 'free' | 'locker' | 'index'> {
  /** Events from the last update() (and actions taken since). Cleared at the start of update(). */
  readonly events: ProgressEvent[] = [];
  /** True when the clock went backwards since the last save: no time-based rewards this session. */
  readonly rollbackBlocked: boolean;
  /** Offline earnings at load (base income, capped at 1 h); 0 once collected. */
  offline: number;

  private readonly pending: ProgressEvent[] = [];
  private readonly giftsNotified = new Set<number>();
  private dailyWasClaimable: boolean;
  private ftueDoneSeen: boolean;
  private shopUnlocked: boolean;
  private lockerUnlocked: boolean;
  private readonly returning: boolean;
  private inUpdate = false;

  constructor(
    readonly state: GameState,
    readonly clock: Clock = systemClock,
  ) {
    const now = clock.now();
    this.rollbackBlocked = state.lastSeen > 0 && now < state.lastSeen - ROLLBACK_GUARD_MS;
    this.returning = state.savedAt > 0;
    this.offline =
      this.returning && !this.rollbackBlocked ? offlineEarnings(state.baseIncomePerSec(), (now - state.savedAt) / 1000) : 0;
    const today = dayKey(now);
    if (!this.rollbackBlocked) rolloverGifts(state.gifts, today);
    for (const i of readyGifts(state.gifts)) this.giftsNotified.add(i);
    this.dailyWasClaimable = this.dailyClaimable();
    this.ftueDoneSeen = state.ftue.done;
    this.shopUnlocked = this.shopVisible();
    this.lockerUnlocked = voyageDone(state);
    if (state.cash >= rebirthCost(state.rebirths) * REBIRTH_VISIBLE_AT) state.flags['unlock:rebirth'] = true;
  }

  private get today(): string {
    return dayKey(this.clock.now());
  }

  private get ftueDone(): boolean {
    return this.state.ftue.done;
  }

  private shopVisible(): boolean {
    return this.state.ftue.done || FTUE_STEPS.indexOf(this.state.ftue.step) >= FTUE_STEPS.indexOf('shop');
  }

  dailyClaimable(): boolean {
    return !this.rollbackBlocked && dailyClaimable(this.state.daily, this.today, this.ftueDone);
  }

  // ---------- sim events ----------

  /** Updates stats and event flags. Quest checks and events happen in update(). */
  onSimEvent(e: SimEvent, _sim: GameSim): void {
    const discovered = trackSimEvent(this.state, e, this.today);
    if (discovered) {
      this.state.pearls += DISCOVERY_PEARLS;
      this.pending.push({ type: 'discovery', speciesId: discovered, pearls: DISCOVERY_PEARLS });
    }
  }

  // ---------- per frame ----------

  /** Runs every frame, also while paused (gift time counts with panels open). */
  update(realDt: number, ctx: ProgressionContext): void {
    this.events.length = 0;
    for (const e of this.pending) this.events.push(e);
    this.pending.length = 0;

    const state = this.state;
    if (ctx.ftueDone && !state.ftue.done) state.ftue.done = true;
    const now = this.clock.now();
    const today = dayKey(now);
    state.lastSeen = Math.max(state.lastSeen, now);
    rollStatsDay(state, today);

    if (!this.rollbackBlocked) {
      if (rolloverGifts(state.gifts, today)) this.giftsNotified.clear();
      if (ctx.active) state.gifts.activeSec += realDt;
      for (const i of readyGifts(state.gifts)) {
        if (this.giftsNotified.has(i)) continue;
        this.giftsNotified.add(i);
        this.events.push({ type: 'giftReady', index: i });
      }
    }
    if (ctx.active) state.counters.playSec += realDt;

    const claimable = this.dailyClaimable();
    if (claimable && !this.dailyWasClaimable) this.events.push({ type: 'dailyReady' });
    this.dailyWasClaimable = claimable;

    // Featured Creature of the week.
    const wk = weekKey(now);
    const featured = featuredSpeciesFor(wk);
    ctx.sim.featuredSpecies = featured;
    if (this.ftueDone && state.featuredWeekSeen !== wk) {
      state.featuredWeekSeen = wk;
      this.events.push({ type: 'featured', speciesId: featured });
    }

    this.inUpdate = true;
    this.checkQuest();
    this.inUpdate = false;
    this.checkUnlocks();
  }

  private checkQuest(): void {
    const state = this.state;
    const q = currentQuest(state);
    if (!q || !q.done(state)) return;
    if (!q.ftue && !this.ftueDone) return;
    let reward: Reward = {};
    const key = voyageRewardKey(q.n);
    const paidByFtue = q.ftue && !this.ftueDone;
    if (!paidByFtue && !state.ftue.rewarded.includes(key)) {
      reward = this.grant(q.reward, `quest:${q.n}`, `voyage:${q.n}`);
      state.ftue.rewarded.push(key);
    }
    state.voyage.step++;
    this.events.push({ type: 'questDone', index: q.n, reward });
    if (state.voyage.step >= VOYAGE_LENGTH) this.events.push({ type: 'voyageDone' });
  }

  private checkUnlocks(): void {
    const state = this.state;
    if (!this.shopUnlocked && this.shopVisible()) {
      this.shopUnlocked = true;
      this.events.push({ type: 'unlock', what: 'shop' });
    }
    if (!this.ftueDoneSeen && this.ftueDone) {
      this.ftueDoneSeen = true;
      this.events.push({ type: 'unlock', what: 'index' }, { type: 'unlock', what: 'free' });
    }
    if (!this.lockerUnlocked && voyageDone(state)) {
      this.lockerUnlocked = true;
      this.events.push({ type: 'unlock', what: 'locker' });
    }
    if (!state.flags['unlock:rebirth'] && state.cash >= rebirthCost(state.rebirths) * REBIRTH_VISIBLE_AT) {
      state.flags['unlock:rebirth'] = true;
      this.events.push({ type: 'unlock', what: 'rebirth' });
    }
  }

  /** Resolves, applies and announces a reward. */
  private grant(spec: RewardSpec, seed: string, source: string): Reward {
    const reward = resolveReward(this.state, spec, new Rng(hashKey(seed)));
    this.apply(reward, source);
    return reward;
  }

  private apply(reward: Reward, source: string): void {
    if (isEmptyReward(reward)) return;
    const { discovery } = applyReward(this.state, reward);
    // Inside update() events go out this frame; actions between frames go out with the next update().
    const out = this.inUpdate ? this.events : this.pending;
    out.push({ type: 'rewardApplied', reward, source });
    if (discovery) out.push({ type: 'discovery', speciesId: discovery, pearls: DISCOVERY_PEARLS });
  }

  // ---------- Daily ----------

  private dailySeed(count: number): string {
    return `daily:${count}`;
  }

  /** Claims today's calendar reward. Null when not claimable (already claimed, FTUE running, clock rollback). */
  claimDaily(): Reward | null {
    if (!this.dailyClaimable()) return null;
    const d = this.state.daily;
    const spec = dailySpec(nextDailyDay(d), d.week, this.state.cosmetics.owned);
    const reward = resolveReward(this.state, spec, new Rng(hashKey(this.dailySeed(d.count))));
    recordDailyClaim(d, this.today);
    this.apply(reward, 'daily');
    this.dailyWasClaimable = false;
    return reward;
  }

  private dailyTiles(): DailyTile[] {
    const d = this.state.daily;
    const today = this.today;
    const done = claimedToday(d, today) ? ((d.count - 1) % 7) + 1 : d.count % 7;
    const cycleStart = d.count - done;
    // The week a tile belongs to: if Day 7 was just claimed today, the row shows the finished week.
    const week = claimedToday(d, today) && done === 7 ? d.week - 1 : d.week;
    const tiles: DailyTile[] = [];
    for (let i = 0; i < 7; i++) {
      const day = i + 1;
      let state: DailyTile['state'];
      if (i < done) state = 'claimed';
      else if (i === done && !claimedToday(d, today)) state = 'today';
      else if (i === done) state = 'tomorrow';
      else if (i === done + 1 && !claimedToday(d, today)) state = 'tomorrow';
      else state = 'later';
      const spec = dailySpec(day, week, this.state.cosmetics.owned);
      const reward = resolveReward(this.state, spec, new Rng(hashKey(this.dailySeed(cycleStart + i))));
      tiles.push({ day, reward, state, teaser: day === 5 || day === 7 });
    }
    return tiles;
  }

  // ---------- Gifts ----------

  /** Claims one ready gift, or all of them. Null when nothing was claimable. */
  claimGift(i: number | 'all'): Reward | null {
    if (this.rollbackBlocked) return null;
    const g = this.state.gifts;
    const list = i === 'all' ? readyGifts(g) : giftState(g, i) === 'ready' ? [i] : [];
    if (!list.length) return null;
    let total: Reward = {};
    for (const idx of list) {
      const reward = resolveReward(this.state, GIFTS[idx].spec, new Rng(hashKey(`gift:${g.day}:${idx}`)));
      g.claimed.push(idx);
      this.state.counters.giftsClaimed++;
      this.apply(reward, 'gift');
      total = mergeRewards(total, reward);
    }
    return total;
  }

  private pendingGiftRewards(): Reward[] {
    const g = this.state.gifts;
    return g.pending.map((idx, k) => resolveReward(this.state, GIFTS[idx].spec, new Rng(hashKey(`pending:${idx}:${k}`))));
  }

  /** Grants gifts left unclaimed before midnight (when no Welcome Back card shows: toast "Gifts from yesterday"). */
  claimPendingGifts(): Reward | null {
    if (this.rollbackBlocked || !this.state.gifts.pending.length) return null;
    let total: Reward = {};
    for (const reward of this.pendingGiftRewards()) {
      this.apply(reward, 'pendingGifts');
      this.state.counters.giftsClaimed++;
      total = mergeRewards(total, reward);
    }
    this.state.gifts.pending = [];
    return total;
  }

  // ---------- Welcome Back ----------

  /** Returning session with offline earnings ≥ $1 or a claimable Daily. */
  shouldShowWelcome(): boolean {
    return this.returning && (this.offline >= 1 || this.dailyClaimable());
  }

  welcome(): WelcomeView {
    const daily = this.dailyClaimable() ? (this.dailyTiles().find((t) => t.state === 'today') ?? null) : null;
    return {
      offline: this.offline,
      daily,
      pendingGifts: this.rollbackBlocked ? [] : this.pendingGiftRewards(),
      // The lead also requires platform.hasSdk.
      canDouble: this.offline > 0 && this.offline >= 60 * this.state.baseIncomePerSec(),
    };
  }

  /** CLAIM on the Welcome Back card: offline cash (×2 after a rewarded ad), today's Daily and pending gifts. */
  collectWelcome(double = false): Reward {
    let total: Reward = {};
    if (this.offline > 0) {
      const cash = this.offline * (double ? 2 : 1);
      this.offline = 0;
      this.apply({ cash }, 'offline');
      total = mergeRewards(total, { cash });
    }
    const daily = this.claimDaily();
    if (daily) total = mergeRewards(total, daily);
    const gifts = this.claimPendingGifts();
    if (gifts) total = mergeRewards(total, gifts);
    return total;
  }

  // ---------- Locker, Lucky Tide ----------

  buyCosmetic(id: string): boolean {
    return buyCosmetic(this.state, id);
  }

  equipCosmetic(id: string): boolean {
    return equipCosmetic(this.state, id);
  }

  /** Clears the NEW stickers (call when the Locker tab closes). */
  markLockerSeen(): void {
    for (const id of this.state.cosmetics.owned) markCosmeticSeen(this.state, id);
  }

  /** Spends a token to make the next wave Golden. False with no tokens or when it is already golden. */
  useLuckyTide(sim: GameSim): boolean {
    const w = sim.wave;
    if (this.state.tokens.luckyTide <= 0) return false;
    if (w.golden && w.phase !== 'surge') return false;
    this.state.tokens.luckyTide--;
    w.forceGoldenNext();
    return true;
  }

  // ---------- Hints (HudDeps.coach is backed by hintsSeen) ----------

  hintSeen(id: string): boolean {
    return this.state.hintsSeen.includes(id);
  }

  markHintSeen(id: string): void {
    if (!this.hintSeen(id)) this.state.hintsSeen.push(id);
  }

  // ---------- HUD ----------

  railState(cash: number, atHome = false): Record<RailId, RailTileState> {
    const state = this.state;
    const ftueDone = this.ftueDone;
    const shopVisible = this.shopVisible();
    const affordable = shopVisible && cash >= cheapestUpgradeCost(state.levels);
    const freeCount = this.rollbackBlocked ? 0 : readyGifts(state.gifts).length + (this.dailyClaimable() ? 1 : 0);
    const nextGift = this.rollbackBlocked ? null : secondsToNextGift(state.gifts);
    const indexNew = this.newSpecies().length;
    const rCost = rebirthCost(state.rebirths);
    const rebirthVisible = cash >= rCost * REBIRTH_VISIBLE_AT;
    const canRebirth = cash >= rCost;

    // Badge cap: at most 2, priority FREE > Rebirth > Index.
    const badges: Partial<Record<RailId, number | '!'>> = {};
    let shown = 0;
    if (ftueDone && freeCount > 0 && shown < 2) (badges.free = freeCount), shown++;
    if (rebirthVisible && canRebirth && shown < 2) (badges.rebirth = '!'), shown++;
    if (ftueDone && indexNew > 0 && shown < 2) (badges.index = indexNew), shown++;

    // One wiggle: FREE claimable > Shop affordable (at home) > Index NEW.
    let wiggle: RailId | null = null;
    if (ftueDone && freeCount > 0) wiggle = 'free';
    else if (affordable && atHome) wiggle = 'shop';
    else if (ftueDone && indexNew > 0) wiggle = 'index';

    return {
      shop: { visible: shopVisible, badge: null, arrow: affordable, wiggle: wiggle === 'shop' },
      free: {
        visible: ftueDone,
        badge: badges.free ?? null,
        arrow: false,
        wiggle: wiggle === 'free',
        label: 'FREE',
        timer: freeCount === 0 && nextGift !== null ? formatClock(nextGift) : undefined,
      },
      index: { visible: ftueDone, badge: badges.index ?? null, arrow: false, wiggle: wiggle === 'index' },
      rebirth: { visible: rebirthVisible, badge: badges.rebirth ?? null, arrow: false, wiggle: false },
    };
  }

  /** First Voyage tracker (C16): the current quest; null during the FTUE and after the Voyage. */
  tracker(): TrackerView | null {
    const q = currentQuest(this.state);
    if (!q || !this.ftueDone) return null;
    const reward = q.ftue && this.state.ftue.rewarded.includes(voyageRewardKey(q.n)) ? {} : resolveReward(this.state, q.reward, new Rng(0));
    return {
      title: 'FIRST VOYAGE',
      count: `${q.n}/${VOYAGE_LENGTH}`,
      rows: [{ icon: q.icon, text: q.text, progress: q.progress(this.state), reward, done: false }],
    };
  }

  // ---------- Panels ----------

  free(): FreeView {
    const state = this.state;
    const now = this.clock.now();
    const resetIn = Math.ceil(msUntilNextDay(now) / 1000);
    const g = state.gifts;
    return {
      daily: { tiles: this.dailyTiles(), streak: state.daily.streak, claimable: this.dailyClaimable(), resetIn },
      gifts: {
        gifts: GIFTS.map((gift, i) => ({
          atMin: gift.atMin,
          reward: resolveReward(state, gift.spec, new Rng(hashKey(`gift:${g.day}:${i}`))),
          state: giftState(g, i),
          secondsLeft: Math.max(0, gift.atMin * 60 - g.activeSec),
        })),
        resetIn,
      },
      luckyTide: state.tokens.luckyTide,
      streak: state.daily.streak,
    };
  }

  locker(): LockerView {
    return { pearls: this.state.pearls, items: lockerItems(this.state) };
  }

  private newSpecies(): string[] {
    const s = this.state;
    return Object.keys(s.index).filter((id) => s.index[id] > 0 && !s.indexSeen.includes(id));
  }

  /** Clears the Index NEW badges (call when the Index panel closes). */
  markIndexSeen(): void {
    for (const id of this.newSpecies()) this.state.indexSeen.push(id);
  }

  index(): IndexView {
    const s = this.state;
    let found = 0;
    const entries: IndexEntry[] = SPECIES.map((sp) => {
      const mask = s.index[sp.id] ?? 0;
      for (let b = 0; b < 4; b++) if (mask & (1 << b)) found++;
      const zone = ZONES.find((z) => z.rarity === sp.rarity);
      return {
        id: sp.id,
        name: sp.name,
        rarity: sp.rarity,
        income: RARITIES[sp.rarity].income * sp.incomeMult,
        mask,
        isNew: mask > 0 && !s.indexSeen.includes(sp.id),
        foundIn: zone ? zone.name : '',
      };
    });
    return { found, total: SPECIES.length * 4, entries, featured: featuredSpeciesFor(weekKey(this.clock.now())) };
  }
}
