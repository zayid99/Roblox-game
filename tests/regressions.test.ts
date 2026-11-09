// Regression tests for verified game-logic bugs (rolls, saves, offline time, gifts, waves, views).
import { describe, expect, it } from 'vitest';
import { TimeScale } from '../src/core/timeScale';
import { ManualClock } from '../src/game/clock';
import { RARITIES, getSpecies, rollCreature } from '../src/game/creatures';
import { dailyClaimable } from '../src/game/daily';
import { ECONOMY } from '../src/game/config';
import { formatBalance, formatCash, formatNumber, rebirthCost } from '../src/game/economy';
import { readyGifts } from '../src/game/gifts';
import { EGGS, buildHatcheryView, hatchEgg } from '../src/game/hatchery';
import { trackSimEvent } from '../src/game/progress';
import { Progression, type ProgressEvent } from '../src/game/progression';
import { DISCOVERY_PEARLS } from '../src/game/rewards';
import { Rng } from '../src/game/rng';
import { buildRebirthView } from '../src/game/shopView';
import { GameSim } from '../src/game/sim';
import { GameState } from '../src/game/state';
import { ZONES } from '../src/game/zones';

const T0 = new Date(2026, 10, 5, 12).getTime();
const TOP = RARITIES.length - 1;

function progression(state: GameState, t = T0) {
  const clock = new ManualClock(t);
  const p = new Progression(state, clock);
  const sim = new GameSim(state, { rngSeed: 1 });
  const events: ProgressEvent[] = [];
  const tick = (sec: number, ftueDone = state.ftue.done) => {
    for (let i = 0; i < sec; i++) {
      clock.advance(1000);
      p.update(1, { active: true, sim, ftueDone });
      events.push(...p.events);
    }
  };
  return { clock, p, sim, events, tick };
}

/** Saves and loads into a fresh state, as a reload does. */
function reload(state: GameState, at: number): GameState {
  const s = new GameState();
  expect(s.load(JSON.parse(JSON.stringify(state.toSave(at))))).toBe(true);
  return s;
}

describe('creature rolls', () => {
  it('a golden wave never downgrades the top rarity', () => {
    const rng = new Rng(7);
    for (let i = 0; i < 4000; i++) expect(getSpecies(rollCreature(TOP, true, rng).speciesId).rarity).toBe(TOP);
  });

  it('a normal wave downgrades the top rarity 15% of the time, not 21%', () => {
    const rng = new Rng(9);
    let down = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) if (getSpecies(rollCreature(TOP, false, rng).speciesId).rarity < TOP) down++;
    expect(down / n).toBeGreaterThan(0.13);
    expect(down / n).toBeLessThan(0.17);
  });
});

describe('hatchery', () => {
  it('pays the first-discovery Pearls for a species found in an egg, once', () => {
    const s = new GameState();
    s.cash = EGGS[0].price * 2;
    const out = hatchEgg(s, 0, new Rng(1));
    if (typeof out === 'string') throw new Error(out);
    expect(out.isNewSpecies).toBe(true);
    expect(out.pearls).toBe(DISCOVERY_PEARLS);
    expect(s.pearls).toBe(DISCOVERY_PEARLS);
    // The same species again is not new.
    s.index = { [out.ref.speciesId]: 1 };
    s.pearls = 0;
    const again = hatchEgg(s, 0, new Rng(1)); // same seed, same species
    if (typeof again === 'string') throw new Error(again);
    expect(again.ref.speciesId).toBe(out.ref.speciesId);
    expect(again.pearls).toBe(0);
    expect(s.pearls).toBe(0);
  });

  it('Buddy option income includes the streak bonus, like the HUD income', () => {
    const s = new GameState();
    s.base[0] = { speciesId: 'crab_dj', mutation: 0 };
    s.daily.streak = 7;
    const v = buildHatcheryView(s);
    expect(v.options[0].income).toBeCloseTo(s.incomePerSec());
  });
});

describe('save loading', () => {
  it('clamps bestZone to the zone table, and a Big Wave with a huge bestZone does not throw', () => {
    const s = new GameState();
    expect(s.load({ ...new GameState().toSave(T0), bestZone: 9 })).toBe(true);
    expect(s.bestZone).toBe(ZONES.length - 1);
    expect(s.load({ ...new GameState().toSave(T0), bestZone: -7 })).toBe(true);
    expect(s.bestZone).toBe(-1);

    const state = new GameState();
    state.bestZone = 99; // set directly: the sim must clamp too
    const sim = new GameSim(state, { rngSeed: 2 });
    sim.wave.count = 4; // the next surge is wave 5, a Big Wave
    sim.wave.forceSurge();
    const input = { moveX: 0, moveZ: 0, jumpHeld: false, jumpPressed: false };
    let ended = false;
    for (let i = 0; i < 120 * 60 && !ended; i++) {
      sim.step(1 / 120, input);
      ended = sim.events.some((e) => e.type === 'surgeEnd');
    }
    expect(ended).toBe(true);
  });

  it('drops out-of-range gift indices so boot and claims never crash', () => {
    const s = new GameState();
    const save = new GameState().toSave(T0);
    expect(s.load({ ...save, gifts: { day: '2026-11-05', activeSec: 0, claimed: [1, 40], pending: [2, 8, 99] } })).toBe(true);
    expect(s.gifts.pending).toEqual([2]);
    expect(s.gifts.claimed).toEqual([1]);
    s.ftue.done = true;
    s.gifts.pending.push(12); // even if one slips in later
    const { p } = progression(s);
    expect(() => p.welcome()).not.toThrow();
    expect(p.claimPendingGifts()).toEqual({ pearls: 10 });
  });

  it('a malformed lastClaimDay does not lock the Daily calendar', () => {
    const s = new GameState();
    expect(s.load({ ...new GameState().toSave(T0), daily: { lastClaimDay: '', count: 3, week: 1, streak: 3 } })).toBe(true);
    expect(s.daily.lastClaimDay).toBeNull();
    expect(dailyClaimable({ lastClaimDay: 'garbage', count: 1, week: 1, streak: 1 }, '2026-11-05', true)).toBe(true);
  });
});

describe('offline time', () => {
  /** Offline time earns this share of base income. */
  const R = ECONOMY.offlineRate;
  function returning(awaySec: number): GameState {
    const s = new GameState();
    s.ftue.done = true;
    s.base[0] = { speciesId: 'crab_dj', mutation: 0 }; // $3/s
    s.savedAt = T0 - awaySec * 1000;
    s.lastSeen = s.savedAt;
    return s;
  }

  it('an uncollected Welcome Back survives a reload', () => {
    const s = returning(600);
    const p = new Progression(s, new ManualClock(T0));
    expect(p.offline).toBeCloseTo(1800 * R);
    // The card is open (paused, autosaves run), then the tab is reloaded 10 s later.
    const s2 = reload(s, T0 + 5000);
    const p2 = new Progression(s2, new ManualClock(T0 + 10_000));
    expect(p2.offline).toBeCloseTo(3 * 610 * R);
    p2.collectWelcome(false);
    // Once collected, the next session starts from the save again.
    const s3 = reload(s2, T0 + 20_000);
    const p3 = new Progression(s3, new ManualClock(T0 + 30_000));
    expect(p3.offline).toBeCloseTo(10 * s3.baseIncomePerSec() * R); // the claimed Daily added +1% streak income
  });

  it('keeps the 1 h cap across reloads', () => {
    const s = returning(3 * 3600);
    const p = new Progression(s, new ManualClock(T0));
    expect(p.offline).toBeCloseTo(3 * ECONOMY.offlineCapSeconds * R);
    const p2 = new Progression(reload(s, T0 + 60_000), new ManualClock(T0 + 120_000));
    expect(p2.offline).toBeCloseTo(3 * ECONOMY.offlineCapSeconds * R);
  });

  it('a background tab earns its time away on return (1 h cap)', () => {
    const s = returning(0);
    s.savedAt = 0; // a new player this session
    const { p, clock } = progression(s);
    const cash0 = s.cash;
    p.markAway();
    clock.advance(30 * 60_000);
    expect(p.creditAway()).toBeCloseTo(3 * 1800 * R);
    expect(s.cash - cash0).toBeCloseTo(3 * 1800 * R);
    expect(p.creditAway()).toBe(0); // paid once
    p.markAway();
    clock.advance(5 * 3600_000);
    expect(p.creditAway()).toBeCloseTo(3 * ECONOMY.offlineCapSeconds * R);
  });

  it('closing a hidden tab still pays the hidden time next session', () => {
    const s = returning(0);
    s.savedAt = 0;
    const { p, clock } = progression(s);
    p.markAway(); // hidden at T0
    clock.advance(20 * 60_000);
    const s2 = reload(s, clock.now()); // pagehide save 20 min later
    const p2 = new Progression(s2, new ManualClock(clock.now() + 10 * 60_000));
    expect(p2.offline).toBeCloseTo(3 * 30 * 60 * R);
  });

  it('a pending Welcome Back keeps its own start while the tab is hidden', () => {
    const s = returning(600);
    const clock = new ManualClock(T0);
    const p = new Progression(s, clock);
    p.markAway();
    clock.advance(60_000);
    expect(p.creditAway()).toBe(0);
    expect(p.offline).toBeCloseTo(1800 * R);
  });
});

describe('gifts and the FTUE', () => {
  it('no "Free gift ready" or gift claims while the FTUE runs; no burst when it ends', () => {
    const s = new GameState();
    const { p, events, tick } = progression(s);
    tick(4 * 60, false);
    expect(readyGifts(s.gifts)).toEqual([0, 1]);
    expect(events.filter((e) => e.type === 'giftReady')).toEqual([]);
    expect(p.claimGift('all')).toBeNull();
    tick(1, true); // FTUE done: the FREE unlock toast covers the ready gifts
    tick(1, true);
    expect(events.some((e) => e.type === 'unlock' && e.what === 'free')).toBe(true);
    expect(events.filter((e) => e.type === 'giftReady')).toEqual([]);
    tick(60, true); // gift 3 at minute 5 toasts as usual
    expect(events.filter((e) => e.type === 'giftReady')).toEqual([{ type: 'giftReady', index: 2 }]);
    expect(p.claimGift('all')).not.toBeNull();
  });

  it('pending gifts wait for the end of the FTUE', () => {
    const s = new GameState();
    s.gifts = { day: '2026-11-05', activeSec: 0, claimed: [], pending: [2] };
    const { p } = progression(s);
    expect(p.claimPendingGifts()).toBeNull();
    expect(p.welcome().pendingGifts).toEqual([]);
    expect(s.gifts.pending).toEqual([2]);
  });
});

describe('Lucky Tide during a surge', () => {
  it('spends one token for the wave after, and none when that wave is golden anyway', () => {
    const s = new GameState();
    s.ftue.done = true;
    s.tokens.luckyTide = 3;
    const { p, sim } = progression(s);
    sim.wave.forceSurge();
    sim.wave.update(0.01);
    expect(sim.wave.phase).toBe('surge');
    expect(p.useLuckyTide(sim)).toBe(true);
    expect(p.useLuckyTide(sim)).toBe(false);
    expect(s.tokens.luckyTide).toBe(2);
    expect(sim.wave.nextGolden).toBe(true);

    const s2 = new GameState();
    s2.tokens.luckyTide = 1;
    const t = progression(s2);
    t.sim.wave.count = 2; // surge of wave 3; wave 4 is golden by number
    t.sim.wave.forceSurge();
    t.sim.wave.update(0.01);
    expect(t.sim.wave.nextGolden).toBe(true);
    expect(t.p.useLuckyTide(t.sim)).toBe(false);
    expect(s2.tokens.luckyTide).toBe(1);
  });
});

describe('stats', () => {
  it('a delivery that replaces a base creature counts as one creature delivered', () => {
    const s = new GameState();
    s.base = s.base.map(() => ({ speciesId: 'toastopus', mutation: 0 }));
    s.pickUp({ speciesId: 'big_cheese', mutation: 0 });
    const result = s.deliver();
    expect(result.placed.length).toBe(1);
    expect(result.sold).toEqual([expect.objectContaining({ displaced: true })]);
    trackSimEvent(s, { type: 'deliver', result, bonusCash: 0, chainMult: 1, tripBest: 0, closeCall: false }, '2026-11-05');
    expect(s.counters.creaturesDelivered).toBe(1);
  });
});

describe('panels and HUD', () => {
  it('a claimed Day 7 tile keeps showing the rope it gave', () => {
    const s = new GameState();
    s.ftue.done = true;
    s.daily = { lastClaimDay: '2026-11-04', count: 6, week: 1, streak: 6 };
    const { p } = progression(s);
    expect(p.claimDaily()?.cosmetic).toBe('rope_coral');
    const tile = p.free().daily.tiles[6];
    expect(tile.state).toBe('claimed');
    expect(tile.reward.cosmetic).toBe('rope_coral');
  });

  it('the Rebirth tile and tab stay once unlocked', () => {
    const s = new GameState();
    s.ftue.done = true;
    const cost = rebirthCost(0);
    s.cash = cost * 0.3;
    const { p, tick } = progression(s);
    tick(1);
    expect(p.railState(s.cash).rebirth.visible).toBe(true);
    s.cash = cost * 0.1; // spent on upgrades
    expect(p.railState(s.cash).rebirth.visible).toBe(true);
    expect(buildRebirthView(s).visible).toBe(true);
  });

  it('Rebirth LOSE lines line up with the tab icons (cash, shop, creature, pedestal)', () => {
    const v = buildRebirthView(new GameState());
    expect(v.lose.length).toBe(4);
    expect(v.lose[2]).toMatch(/creature/i);
    expect(v.lose[3]).toMatch(/^Pedestals back to \d+$/);
  });

  it('a balance is rounded down, so it never reads as a price it cannot pay', () => {
    expect(formatBalance(999_600)).toBe('$999K');
    expect(formatBalance(7_996)).toBe('$7.99K');
    expect(formatBalance(2_340)).toBe('$2.34K');
    expect(formatBalance(1_000_000)).toBe('$1M');
    expect(formatBalance(12.9)).toBe('$12');
    expect(formatCash(999_600)).toBe('$1M'); // prices and the rest keep nearest rounding
    expect(formatNumber(1250, 'down')).toBe('1.25K');
  });

  it('safeSpot: home island, and nothing out on the course', () => {
    const sim = new GameSim(new GameState(), { rngSeed: 1 });
    const input = { moveX: 0, moveZ: 0, jumpHeld: false, jumpPressed: false };
    for (let i = 0; i < 30; i++) sim.step(1 / 120, input);
    expect(sim.isOnHome()).toBe(true);
    expect(sim.safeSpot()).toBe('home');
    sim.player.reset(sim.course.islands[0].checkpoint);
    for (let i = 0; i < 30; i++) sim.step(1 / 120, input);
    expect(sim.safeSpot()).toBeNull();
  });

  it('TimeScale.isActive reports live slow-mo requests only', () => {
    const ts = new TimeScale();
    expect(ts.isActive('reveal')).toBe(false);
    ts.request('reveal', 0.15, 1800);
    expect(ts.isActive('reveal')).toBe(true);
    ts.update(2);
    expect(ts.isActive('reveal')).toBe(false);
  });
});
