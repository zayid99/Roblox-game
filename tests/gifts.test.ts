import { describe, expect, it } from 'vitest';
import { ManualClock } from '../src/game/clock';
import { GIFTS, readyGifts, rolloverGifts } from '../src/game/gifts';
import { Progression, type ProgressEvent } from '../src/game/progression';
import { GameSim } from '../src/game/sim';
import { GameState } from '../src/game/state';

const T0 = new Date(2026, 10, 5, 23, 50).getTime();

function setup() {
  const state = new GameState();
  state.ftue.done = true;
  const clock = new ManualClock(T0);
  const p = new Progression(state, clock);
  const sim = new GameSim(state, { rngSeed: 1 });
  const events: ProgressEvent[] = [];
  const tick = (sec: number, active = true) => {
    for (let i = 0; i < sec; i++) {
      clock.advance(1000);
      p.update(1, { active, sim, ftueDone: true });
      events.push(...p.events);
    }
  };
  return { state, clock, p, sim, events, tick };
}

describe('playtime gifts', () => {
  it('unlock by active minutes and match §9.3', () => {
    expect(GIFTS.map((g) => g.atMin)).toEqual([1, 3, 5, 7, 10, 13, 16, 20]);
    expect(GIFTS[2].spec).toEqual({ pearls: 10 });
    expect(GIFTS[4].spec).toEqual({ luckyTide: 1 });
    expect(GIFTS[7].spec).toEqual({ mystery: true });
    const { state, events, tick } = setup();
    tick(59);
    expect(readyGifts(state.gifts)).toEqual([]);
    tick(1);
    expect(readyGifts(state.gifts)).toEqual([0]);
    expect(events.filter((e) => e.type === 'giftReady')).toEqual([{ type: 'giftReady', index: 0 }]);
    tick(60, false); // inactive time does not count
    expect(readyGifts(state.gifts)).toEqual([0]);
  });

  it('claims one or all, once', () => {
    const { state, p, tick } = setup();
    tick(5 * 60);
    expect(readyGifts(state.gifts)).toEqual([0, 1, 2]);
    expect(p.claimGift(1)).toEqual({ cash: 50 });
    expect(p.claimGift(1)).toBeNull();
    expect(p.claimGift(4)).toBeNull();
    const all = p.claimGift('all')!;
    expect(all.pearls).toBe(10);
    expect(state.pearls).toBe(10);
    expect(state.counters.giftsClaimed).toBe(3);
    expect(p.free().gifts.gifts.map((g) => g.state).slice(0, 4)).toEqual(['claimed', 'claimed', 'claimed', 'locked']);
  });

  it('ready gifts left at midnight carry over as pending, then reset the strip', () => {
    const { state, p, tick, clock } = setup();
    tick(5 * 60); // 23:50 → 23:55
    p.claimGift(0);
    expect(state.gifts.pending).toEqual([]);
    clock.t = new Date(2026, 10, 6, 0, 1).getTime();
    tick(1);
    expect(state.gifts.day).toBe('2026-11-06');
    expect(state.gifts.pending).toEqual([1, 2]);
    expect(state.gifts.claimed).toEqual([]);
    expect(state.gifts.activeSec).toBeLessThan(2);
    const w = p.welcome();
    expect(w.pendingGifts.length).toBe(2);
    const r = p.claimPendingGifts()!;
    expect(r.pearls).toBe(10);
    expect(state.gifts.pending).toEqual([]);
  });

  it('rolloverGifts ignores a clock that went backwards', () => {
    const g = { day: '2026-11-06', activeSec: 100, claimed: [0], pending: [] };
    expect(rolloverGifts(g, '2026-11-05')).toBe(false);
    expect(g.activeSec).toBe(100);
  });
});
