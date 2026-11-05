import { describe, expect, it } from 'vitest';
import { ManualClock, dayKey } from '../src/game/clock';
import { SPECIES } from '../src/game/creatures';
import { dailyClaimable, dailySpec, recordDailyClaim } from '../src/game/daily';
import { Progression } from '../src/game/progression';
import { minutes, rollMysteryCreature } from '../src/game/rewards';
import { Rng } from '../src/game/rng';
import { GameSim } from '../src/game/sim';
import { GameState, defaultDaily } from '../src/game/state';
import { ZONES } from '../src/game/zones';

const DAY = 86_400_000;
const T0 = new Date(2026, 10, 5, 12).getTime();

function setup(opts: { ftueDone?: boolean; lastSeen?: number; savedAt?: number } = {}) {
  const state = new GameState();
  state.ftue.done = opts.ftueDone ?? true;
  state.lastSeen = opts.lastSeen ?? 0;
  state.savedAt = opts.savedAt ?? 0;
  const clock = new ManualClock(T0);
  const p = new Progression(state, clock);
  const sim = new GameSim(state, { rngSeed: 1 });
  return { state, clock, p, sim };
}

describe('daily calendar', () => {
  it('is cumulative: missing days never resets the calendar', () => {
    const { state, clock, p } = setup();
    const days: number[] = [];
    for (let i = 0; i < 9; i++) {
      const before = state.daily.count;
      expect(p.claimDaily()).not.toBeNull();
      days.push((before % 7) + 1);
      expect(p.claimDaily()).toBeNull(); // once per day
      clock.advance(i % 3 === 0 ? 3 * DAY : DAY); // skip days now and then
    }
    expect(days).toEqual([1, 2, 3, 4, 5, 6, 7, 1, 2]);
    expect(state.daily.week).toBe(2);
  });

  it('streak: +1 per consecutive day, −2 per missed day, never below 1 before the claim', () => {
    const d = defaultDaily();
    recordDailyClaim(d, '2026-11-01');
    expect(d.streak).toBe(1);
    recordDailyClaim(d, '2026-11-02');
    recordDailyClaim(d, '2026-11-03');
    recordDailyClaim(d, '2026-11-04');
    expect(d.streak).toBe(4);
    recordDailyClaim(d, '2026-11-06'); // missed 1 day: max(1, 4 − 2) + 1
    expect(d.streak).toBe(3);
    recordDailyClaim(d, '2026-11-12'); // missed 5 days
    expect(d.streak).toBe(2);
    expect(d.count).toBe(6);
  });

  it('day rewards match §9.2', () => {
    const s = new GameState();
    s.base[0] = { speciesId: 'crab_dj', mutation: 0 };
    expect(dailySpec(1, 1, [])).toEqual({ min: 3, pearls: 10 });
    expect(dailySpec(2, 1, [])).toEqual({ luckyTide: 1 });
    expect(dailySpec(5, 1, [])).toEqual({ mystery: true });
    expect(dailySpec(7, 1, [])).toEqual({ cosmetic: 'rope_coral', pearls: 50, luckyTide: 1 });
    expect(dailySpec(7, 2, [])).toEqual({ cosmetic: 'rope_seafoam', pearls: 50, luckyTide: 1 });
    expect(dailySpec(7, 3, [])).toEqual({ pearls: 150, luckyTide: 1 });
    expect(dailySpec(7, 1, ['rope_coral'])).toEqual({ pearls: 150, luckyTide: 1 });
    expect(minutes(s, 3)).toBe(Math.max(50, Math.round(3 * 60 * 3)));
    expect(minutes(new GameState(), 3)).toBe(50);
  });

  it('Day 1 is claimable only after the FTUE', () => {
    const { p, state } = setup({ ftueDone: false });
    expect(p.claimDaily()).toBeNull();
    expect(dailyClaimable(state.daily, dayKey(T0), false)).toBe(false);
    state.ftue.done = true;
    expect(p.claimDaily()).toEqual(expect.objectContaining({ pearls: 10 }));
    expect(state.pearls).toBe(10);
  });

  it('the rollback guard blocks time-based rewards for the session', () => {
    const { p, state, sim } = setup({ lastSeen: T0 + 10 * 60 * 1000, savedAt: T0 - DAY });
    expect(p.rollbackBlocked).toBe(true);
    expect(p.claimDaily()).toBeNull();
    state.gifts.activeSec = 0;
    for (let i = 0; i < 70; i++) p.update(1, { active: true, sim, ftueDone: true });
    expect(state.gifts.activeSec).toBe(0);
    expect(p.claimGift('all')).toBeNull();
    expect(p.offline).toBe(0);
    // A small skew (under 5 minutes) is fine.
    expect(setup({ lastSeen: T0 + 4 * 60 * 1000 }).p.rollbackBlocked).toBe(false);
  });

  it('Mystery Creature uses max(0, bestZone): rarity +1, Gold 70% or Diamond 30%', () => {
    const s = new GameState();
    expect(s.bestZone).toBe(-1);
    const rng = new Rng(5);
    let gold = 0;
    for (let i = 0; i < 2000; i++) {
      const c = rollMysteryCreature(s, rng);
      expect(SPECIES.find((x) => x.id === c.speciesId)!.rarity).toBe(ZONES[0].rarity + 1);
      expect([1, 2]).toContain(c.mutation);
      if (c.mutation === 1) gold++;
    }
    expect(gold / 2000).toBeGreaterThan(0.66);
    expect(gold / 2000).toBeLessThan(0.74);
    s.bestZone = 6;
    const top = rollMysteryCreature(s, rng);
    expect(SPECIES.find((x) => x.id === top.speciesId)!.rarity).toBe(6);
  });

  it('Day 5 delivers the previewed mystery creature to the base', () => {
    const { p, state } = setup();
    state.daily = { lastClaimDay: '2026-11-04', count: 4, week: 1, streak: 4 };
    const tile = p.free().daily.tiles[4];
    expect(tile.state).toBe('today');
    expect(tile.teaser).toBe(true);
    const r = p.claimDaily()!;
    expect(r.creature).toEqual(tile.reward.creature);
    expect(state.base).toContainEqual(r.creature);
    const after = p.free().daily.tiles;
    expect(after.slice(0, 5).every((t) => t.state === 'claimed')).toBe(true);
    expect(after[5].state).toBe('tomorrow');
  });
});
