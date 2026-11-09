// A fast pacing simulator for tests/pacing.test.ts. Everything economic is the real game code: GameState (deliver,
// place, sell, income, tick, buy, rebirth), rollCreature, the upgrade/rebirth/offline formulas, the delivery bonus,
// First Voyage quests (their real `done` predicates and rewards), playtime gifts, the Daily calendar and the FTUE
// step rewards. Only the player is abstracted: a trip to a zone takes the measured time of the "typical" profile of
// the full pacing model (real PlayerSim crossings, sea falls, wave waits; 3 h of play per run), and the player
// follows a simple, human-like shopping rule. It runs a whole first climb plus several rebirths in well under a
// second, so it can guard the pacing bands.
import { COMBO, ECONOMY, WAVE } from '../src/game/config';
import { ComboTracker } from '../src/game/combo';
import { creatureIncome, getSpecies, rollCreature, type CreatureRef } from '../src/game/creatures';
import { dailySpec, recordDailyClaim } from '../src/game/daily';
import {
  UPGRADES, baseSlots, bulkCost, carryCapacity, offlineEarnings, reachGateLevel, type UpgradeKey,
} from '../src/game/economy';
import { GIFTS } from '../src/game/gifts';
import { eggCost, eggUnlocked } from '../src/game/hatchery';
import { VOYAGE } from '../src/game/quests';
import { applyReward, minutes, resolveReward } from '../src/game/rewards';
import { Rng } from '../src/game/rng';
import { GameState } from '../src/game/state';
import { ZONES } from '../src/game/zones';
import { STEPS } from '../src/tutorial/steps';

/**
 * Typical player. TYPICAL_TRIP_SEC is measured with the full model: seconds of one round trip to the far end of each
 * zone (crossings, island running, sea falls and lighthouse waits included). TYPICAL_TRIP_SHARE (share of play spent
 * on trips; the rest is waves, shopping, looking around; never more than one trip per wave cycle) and
 * TYPICAL_GOLDEN_SHARE are calibrated so this sim's zone and rebirth times match the full model within a session.
 */
export const TYPICAL_TRIP_SEC: readonly number[] = [15, 35, 62, 113, 167, 222, 261];
export const TYPICAL_TRIP_SHARE = 0.75;
/**
 * How well the typical player times trips to bring home a Golden Wave's batch: a trip spanning a whole golden
 * cycle (WAVE.goldenEvery waves) catches one this often; shorter trips proportionally less.
 */
export const TYPICAL_GOLDEN_SHARE = 0.5;
/** FTUE of the typical player (tutorial bot + human overhead): first delivery and end of the tutorial, in seconds. */
export const TYPICAL_FTUE = { firstDeliverSec: 43, doneSec: 108 };

export interface PacingOptions {
  seed?: number;
  /** Minutes per session; sessions are a day apart (Welcome Back, Daily, fresh gifts). 0 (default) = one sitting. */
  sessionMin?: number;
  maxPlayMin?: number;
  /** Stop after this many rebirths. */
  maxRebirths?: number;
  /** Debug log (play seconds, message). */
  log?: (t: number, msg: string) => void;
  /** Player model overrides (calibration). */
  tripShare?: number;
  goldenShare?: number;
  /** Trip time multiplier: about 1.5 for a casual player (slower, more sea falls), 0.75 for a skilled one. */
  tripTimeMult?: number;
}

export interface Purchase {
  /** Seconds of play. */
  t: number;
  item: string;
  cost: number;
}

export interface PacingResult {
  /** Seconds of play when each zone's gate was bought (index = zone; zone 0 = start). */
  gate: number[];
  /** Base income ($/s) right after each zone's gate was bought. */
  incomeAtGate: number[];
  /** Base income ($/s) when each zone was first reached (the first trip into it set off). */
  incomeAtVisit: number[];
  /** Seconds of play at each rebirth. */
  rebirths: number[];
  purchases: Purchase[];
  /** Levels of each upgrade bought before the first rebirth. */
  levelsBeforeRebirth: Record<UpgradeKey, number>;
  firstDeliverSec: number;
  endSec: number;
  /** Base income ($/s) at the end of each minute of play. */
  incomeByMinute: number[];
  /** Most zone gates bought with one Welcome Back (right at a session start) during the first climb. */
  maxGatesPerWelcome: number;
  /**
   * Longest stretches (seconds) with nothing worthwhile affordable and nothing bought, in the first hour and from
   * then to the first rebirth. Worthwhile: the next Rope Reach level, Run Speed / Swing Power while a level costs
   * <= 5 min of income, the best reachable zone's egg while it costs <= 6 min of income, or any upgrade level the
   * shopping rule would buy (payback <= 15 min).
   */
  nothingAffordableFirstHour: number;
  nothingAffordableLater: number;
}

const LAST_ZONE = ZONES.length - 1;

/** Highest zone the current Rope Reach can grab. */
function reachableZone(s: GameState): number {
  let z = 0;
  for (let i = 0; i < ZONES.length; i++) if (UPGRADES.reach.value(s.levels.reach) + 1e-6 >= ZONES[i].minReach) z = i;
  return z;
}

/** Sorted sample of wild-creature incomes per zone (normal batch), from the real roll. */
const zoneSample = (() => {
  const rng = new Rng(99);
  return ZONES.map((z) => {
    const xs: number[] = [];
    for (let i = 0; i < 2000; i++) xs.push(creatureIncome(rollCreature(z.rarity, false, rng)));
    return xs.sort((a, b) => a - b);
  });
})();
const zoneMean = zoneSample.map((xs) => xs.reduce((a, b) => a + b, 0) / xs.length);
/** E[max(0, X - t)] for a wild creature X of the zone: what one more catch adds over the weakest pedestal. */
const tailGain = (z: number, t: number) => zoneSample[z].reduce((a, x) => a + Math.max(0, x - t), 0) / zoneSample[z].length;

export function simulatePacing(opts: PacingOptions = {}): PacingResult {
  const seed = opts.seed ?? 1;
  const sessionSec = (opts.sessionMin ?? 0) * 60 || Infinity;
  const maxPlay = (opts.maxPlayMin ?? 12 * 60) * 60;
  const maxRebirths = opts.maxRebirths ?? 6;
  const daily = sessionSec < Infinity;
  /** Income-seconds per play second: daily sessions also bring the Welcome Back. */
  const k = daily ? (sessionSec + ECONOMY.offlineRate * ECONOMY.offlineCapSeconds) / sessionSec : 1;
  const rng = new Rng(seed * 7919 + 13);
  const s = new GameState();
  const res: PacingResult = {
    gate: ZONES.map((_, i) => (i === 0 ? 0 : NaN)),
    incomeAtGate: ZONES.map(() => NaN),
    incomeAtVisit: ZONES.map((_, i) => (i === 0 ? 0 : NaN)),
    rebirths: [],
    purchases: [],
    levelsBeforeRebirth: { speed: 0, reach: 0, power: 0, carry: 0, slots: 0 },
    firstDeliverSec: TYPICAL_FTUE.firstDeliverSec,
    endSec: 0,
    incomeByMinute: [],
    maxGatesPerWelcome: 0,
    nothingAffordableFirstHour: 0,
    nothingAffordableLater: 0,
  };
  /** Last moment something worthwhile was affordable or bought. */
  let lastOk = 0;
  const noteStretch = (until: number) => {
    const len = until - lastOk;
    if (lastOk < 3600) res.nothingAffordableFirstHour = Math.max(res.nothingAffordableFirstHour, len);
    else if (s.rebirths === 0) res.nothingAffordableLater = Math.max(res.nothingAffordableLater, len);
  };
  let welcomeAt = -1;
  let welcomeGates = 0;
  let play = 0;
  let sessionStart = 0;
  let session = 1;
  let giftsClaimed = 0;

  const advance = (sec: number) => {
    s.tick(sec);
    play += sec;
    while (res.incomeByMinute.length < Math.floor(play / 60)) res.incomeByMinute.push(s.incomePerSec());
    const active = play - sessionStart;
    while (giftsClaimed < GIFTS.length && active >= GIFTS[giftsClaimed].atMin * 60) {
      const before = s.cash;
      applyReward(s, resolveReward(s, GIFTS[giftsClaimed].spec, rng));
      log?.(play, `gift ${giftsClaimed} +${Math.round(s.cash - before)}`);
      giftsClaimed++;
    }
  };
  const record = (item: string, cost: number) => {
    res.purchases.push({ t: play, item, cost });
    noteStretch(play);
    lastOk = play;
    if (play === welcomeAt && s.rebirths === 0 && item.includes('gate')) res.maxGatesPerWelcome = Math.max(res.maxGatesPerWelcome, ++welcomeGates);
    const z = reachableZone(s);
    for (let i = 1; i <= z; i++) {
      if (Number.isNaN(res.gate[i])) {
        res.gate[i] = play;
        res.incomeAtGate[i] = s.incomePerSec();
      }
    }
  };
  const log = opts.log;
  const quests = () => {
    while (s.voyage.step < VOYAGE.length && VOYAGE[s.voyage.step].done(s)) {
      const before = s.cash;
      applyReward(s, resolveReward(s, VOYAGE[s.voyage.step].reward, rng));
      log?.(play, `quest ${VOYAGE[s.voyage.step].n} +${Math.round(s.cash - before)}`);
      s.voyage.step++;
    }
  };
  const claimDaily = () => {
    const day = new Date(Date.UTC(2026, 0, session)).toISOString().slice(0, 10);
    const d = recordDailyClaim(s.daily, day);
    applyReward(s, resolveReward(s, dailySpec(d, s.daily.week, s.cosmetics.owned), rng));
  };

  // ---- FTUE: two Commons delivered, the step rewards, and the tutorial's Rope Reach purchase (Coral Reef gate).
  s.pickUp({ speciesId: 'toastopus', mutation: 0 });
  s.pickUp({ speciesId: 'toastopus', mutation: 0 });
  s.deliver();
  s.counters.grabs = 2;
  s.counters.collects = 2;
  s.counters.deliveries = 1;
  s.bestZone = 0;
  for (const st of Object.values(STEPS)) {
    if (st.reward === 'min2') s.earn(minutes(s, 2));
    else if (st.reward?.cash) s.earn(st.reward.cash);
  }
  advance(TYPICAL_FTUE.doneSec - TYPICAL_FTUE.firstDeliverSec);
  play = TYPICAL_FTUE.doneSec;
  s.buy('reach');
  record('reach->1 (tutorial)', UPGRADES.reach.costs?.[0] ?? 0);
  s.ftue.done = true;
  s.voyage.step = 6;
  claimDaily();

  // Short trips still have to fit between waves: at most one per wave cycle.
  const tripShare = opts.tripShare ?? TYPICAL_TRIP_SHARE;
  const goldenShare = opts.goldenShare ?? TYPICAL_GOLDEN_SHARE;
  const tripMult = opts.tripTimeMult ?? 1;
  const tripPlaySec = (z: number) => Math.max(WAVE.interval, (TYPICAL_TRIP_SEC[z] * tripMult) / tripShare);

  /** One step of the shopping rule. Returns true if something was bought. */
  const shopOnce = (): boolean => {
    // The First Voyage tracker asks for Carry Slots (quest 10): people follow it.
    if (VOYAGE[s.voyage.step]?.n === 10 && s.levels.carry === 0 && s.canBuy('carry')) {
      const c = s.upgradeCost('carry');
      s.buy('carry');
      record('carry->1 (quest)', c);
      quests();
      return true;
    }
    const inc = Math.max(1e-9, s.incomePerSec());
    const mult = s.multiplier * s.streakBonus;
    const zMax = reachableZone(s);
    // 1. The next zone gate, or a Rope Reach step toward it.
    let gateCost = Infinity;
    if (zMax < LAST_ZONE) {
      const gl = reachGateLevel(zMax + 1);
      gateCost = bulkCost('reach', s.levels.reach, gl - s.levels.reach);
      if (gateCost <= s.cash) {
        const n = gl - s.levels.reach;
        s.buyMany('reach', n);
        record(`reach->${gl} (zone ${zMax + 2} gate)`, gateCost);
        return true;
      }
      if (gl - s.levels.reach >= 2 && s.upgradeCost('reach') <= s.cash) {
        const c = s.upgradeCost('reach');
        s.buy('reach');
        record(`reach->${s.levels.reach} (step)`, c);
        return true;
      }
    }
    // 2. Carry Slots / Base Pedestals that pay back within 15 min of play (income-seconds / k); while saving for a
    //    gate, only those that pay back before the gate is affordable.
    const wait = Number.isFinite(gateCost) ? Math.max(0, gateCost - s.cash) / (inc * k) : Infinity;
    const limit = Math.min(900, Number.isFinite(wait) && wait > 0 ? wait : 900);
    const zoneE = zoneMean[zMax] * mult;
    const options: { key: UpgradeKey; cost: number; payback: number }[] = [];
    if (!s.isMaxed('slots')) {
      const added = baseSlots({ ...s.levels, slots: s.levels.slots + 1 }) - s.slotCount;
      options.push({ key: 'slots', cost: s.upgradeCost('slots'), payback: s.upgradeCost('slots') / (added * zoneE) / k });
    }
    if (!s.isMaxed('carry')) {
      // One more creature per trip: its chance to beat the weakest pedestal (valued over 10 min), else it is sold
      // for sellSeconds of income; plus its delivery bonus.
      const weakest = Math.min(...s.base.map((c) => (c ? creatureIncome(c) : 0)));
      const perTrip = zoneE * (ECONOMY.sellSeconds + COMBO.deliverySeconds * 1.5) + tailGain(zMax, weakest) * mult * 600;
      options.push({ key: 'carry', cost: s.upgradeCost('carry'), payback: s.upgradeCost('carry') / (perTrip / tripPlaySec(zMax)) / k });
    }
    options.sort((a, b) => a.payback - b.payback);
    for (const o of options) {
      if (o.cost <= s.cash && o.payback <= limit) {
        s.buy(o.key);
        record(`${o.key}->${s.levels[o.key]}`, o.cost);
        return true;
      }
    }
    // 3. "Feel" levels (Run Speed, Swing Power) while they cost at most 1.5 min of income and a quarter of the cash.
    for (const key of ['speed', 'power'] as UpgradeKey[]) {
      if (s.isMaxed(key)) continue;
      const c = s.upgradeCost(key);
      if (c <= s.cash * 0.25 && c <= inc * 90) {
        s.buy(key);
        record(`${key}->${s.levels[key]}`, c);
        return true;
      }
    }
    // 4. Rebirth once the last zone is open and nothing left pays back within 15 min of play.
    const pending = options.some((o) => o.payback <= 900);
    if (zMax === LAST_ZONE && !pending && s.canRebirth() && s.rebirths < maxRebirths) {
      if (s.rebirths === 0) for (const key of Object.keys(res.levelsBeforeRebirth) as UpgradeKey[]) res.levelsBeforeRebirth[key] = s.levels[key];
      const c = s.rebirthCost();
      s.rebirth();
      res.rebirths.push(play);
      res.purchases.push({ t: play, item: `rebirth ${s.rebirths}`, cost: c });
      return true;
    }
    return false;
  };

  /** Cheapest worthwhile item on sale now (see nothingAffordable*), or Infinity. */
  const cheapestWorthwhile = (): number => {
    const inc = Math.max(1e-9, s.incomePerSec());
    let best = Infinity;
    if (!s.isMaxed('reach')) best = Math.min(best, s.upgradeCost('reach'));
    for (const key of ['speed', 'power'] as UpgradeKey[]) if (!s.isMaxed(key) && s.upgradeCost(key) <= inc * 300) best = Math.min(best, s.upgradeCost(key));
    const z = reachableZone(s);
    if (eggUnlocked(s, z) && eggCost(s, z) <= inc * 360) best = Math.min(best, eggCost(s, z));
    for (const key of ['slots', 'carry'] as UpgradeKey[]) {
      if (s.isMaxed(key)) continue;
      const mean = zoneMean[z] * s.multiplier * s.streakBonus;
      const perSec = key === 'slots' ? 2 * mean : (mean * (ECONOMY.sellSeconds + COMBO.deliverySeconds * 1.5)) / tripPlaySec(z);
      if (s.upgradeCost(key) / perSec / k <= 900) best = Math.min(best, s.upgradeCost(key));
    }
    return best;
  };
  /** Marks when, during the next `sec` seconds of income, something worthwhile becomes affordable. */
  const watchAffordable = (sec: number) => {
    const need = cheapestWorthwhile() - s.cash;
    const inc = s.incomePerSec();
    if (need <= 0) {
      noteStretch(play);
      lastOk = play + sec;
    } else if (inc > 0 && need / inc <= sec) {
      noteStretch(play + need / inc);
      lastOk = play + sec;
    }
  };

  const trip = () => {
    const z = reachableZone(s);
    // Golden batch (every WAVE.goldenEvery-th wave of a session): players time their trips to bring some home.
    const waves = Math.floor((play - sessionStart - WAVE.firstInterval) / WAVE.interval) + 1;
    const goldenOdds = Math.min(1, tripPlaySec(z) / (WAVE.interval * WAVE.goldenEvery)) * goldenShare;
    const golden = waves >= 1 && rng.next() < goldenOdds;
    // The batch on the target zone's islands and the zone before it (picked up on the way).
    const batch: { c: CreatureRef; zone: number }[] = [];
    for (const zz of z > 0 ? [z - 1, z] : [z]) {
      const spots = ZONES[zz].islands * ZONES[zz].spawns;
      for (let i = 0; i < spots; i++) if (rng.next() < ECONOMY.spawnChance) batch.push({ c: rollCreature(ZONES[zz].rarity, golden, rng), zone: zz });
    }
    batch.sort((a, b) => creatureIncome(b.c) - creatureIncome(a.c));
    const take = batch.slice(0, carryCapacity(s.levels));
    for (const { c } of take) {
      s.pickUp(c);
      s.counters.collects++;
      s.counters.collectsByRarity[getSpecies(c.speciesId).rarity]++;
      if (golden) s.counters.goldenBatchCollects++;
    }
    s.counters.grabs += 2 * (z + 1);
    if (z >= 1) s.counters.padLaunchesInWave = Math.max(1, s.counters.padLaunchesInWave);
    if (Number.isNaN(res.incomeAtVisit[z])) res.incomeAtVisit[z] = s.incomePerSec();
    s.bestZone = Math.max(s.bestZone, z);
    watchAffordable(tripPlaySec(z));
    advance(tripPlaySec(z));
    let income = 0;
    for (const c of s.carried) income += creatureIncome(c);
    const chainMult = ComboTracker.chainMult(Math.round(2 * (z + 1) * 1.25 * 0.8));
    const before = s.cash;
    s.deliver();
    s.counters.deliveries++;
    s.earn(income * s.multiplier * COMBO.deliverySeconds * chainMult);
    log?.(play, `trip z${z}${golden ? ' golden' : ''} +${Math.round(s.cash - before)} cash ${Math.round(s.cash)} income ${s.incomePerSec().toFixed(1)}`);
    quests();
  };

  quests();
  while (play < maxPlay && s.rebirths < maxRebirths) {
    while (shopOnce());
    const z = reachableZone(s);
    if (play - sessionStart + tripPlaySec(z) > sessionSec) {
      // End of the session: the next one starts a day later with the offline hour, the Daily and fresh gifts.
      s.earn(offlineEarnings(s.baseIncomePerSec(), 23 * 3600));
      session++;
      sessionStart = play;
      giftsClaimed = 0;
      claimDaily();
      welcomeAt = play;
      welcomeGates = 0;
      continue;
    }
    trip();
  }
  noteStretch(play);
  res.endSec = play;
  return res;
}
