// Daily Missions, 2× Cash Boost, the FREE tile's prize, the delivery toast and save compatibility (economy package).
import { describe, expect, it } from 'vitest';
import { ManualClock } from '../src/game/clock';
import { BOOST } from '../src/game/economy';
import { DAILY_REWARDS } from '../src/game/daily';
import { GIFTS } from '../src/game/gifts';
import { deliveryMult } from '../src/game/hatchery';
import {
  MISSION_BONUS, MISSION_REWARDS, MISSION_TEMPLATES, ensureMissions, missionProgress, missionText, rerollMission, rollMissions,
} from '../src/game/missions';
import { Progression, type ProgressEvent } from '../src/game/progression';
import { GameSim } from '../src/game/sim';
import { GameState, deliveryMessage } from '../src/game/state';

const T0 = new Date(2026, 10, 5, 12).getTime();

function setup(ftueDone = true) {
  const state = new GameState();
  state.ftue.done = ftueDone;
  const clock = new ManualClock(T0);
  const p = new Progression(state, clock);
  const sim = new GameSim(state, { rngSeed: 1 });
  const log: ProgressEvent[] = [];
  const frame = (dt = 1 / 60, playing = true) => {
    clock.advance(dt * 1000);
    p.update(dt, { active: true, playing, sim, ftueDone: state.ftue.done });
    log.push(...p.events);
  };
  return { state, clock, p, sim, log, frame };
}

describe('Daily Missions', () => {
  it('rolls one easy, one medium and one hard mission per day, the same for the same day', () => {
    const s = new GameState();
    const a = rollMissions(s, '2026-11-05');
    expect(a.map((m) => m.tier)).toEqual(['easy', 'medium', 'hard']);
    expect(rollMissions(s, '2026-11-05')).toEqual(a);
    // Over a few weeks every template comes up.
    const seen = new Set<string>();
    for (let d = 1; d <= 28; d++) for (const m of rollMissions(s, `2026-12-${String(d).padStart(2, '0')}`)) seen.add(m.tpl);
    expect(seen.size).toBe(MISSION_TEMPLATES.length);
    for (const m of a) expect(missionText(m).length).toBeGreaterThan(3);
  });

  it('measures progress from when the mission was rolled (best-today stats directly)', () => {
    const s = new GameState();
    s.counters.grabs = 40;
    s.missions = { day: '2026-11-05', list: [{ tpl: 'e_grabs', tier: 'easy', target: 15, stat: 'grabs', start: 40, claimed: false, rerolled: false }], bonusClaimed: false };
    expect(missionProgress(s, s.missions.list[0])).toEqual({ value: 0, target: 15, frac: 0, done: false });
    s.counters.grabs = 55;
    expect(missionProgress(s, s.missions.list[0]).done).toBe(true);
    const chain = { tpl: 'm_chain', tier: 'medium' as const, target: 6, stat: 'bestChainToday' as const, start: 0, claimed: false, rerolled: false };
    s.counters.bestChainToday = 6;
    expect(missionProgress(s, chain).done).toBe(true);
  });

  it('unlock at the end of the tutorial, announce once, pay on CLAIM, then the bonus chest', () => {
    const { state, p, log, frame } = setup(false);
    frame();
    expect(state.missions.list).toEqual([]);
    expect(p.free().missions.unlocked).toBe(false);
    state.ftue.done = true;
    frame();
    expect(state.missions.list).toHaveLength(3);
    expect(state.missions.day).toBe('2026-11-05');
    expect(p.free().missions.unlocked).toBe(true);
    // Force known missions.
    state.missions.list = [
      { tpl: 'e_grabs', tier: 'easy', target: 15, stat: 'grabs', start: 0, claimed: false, rerolled: false },
      { tpl: 'm_hatch', tier: 'medium', target: 1, stat: 'eggsHatched', start: 0, claimed: false, rerolled: false },
      { tpl: 'h_mutation', tier: 'hard', target: 1, stat: 'mutatedCollects', start: 0, claimed: false, rerolled: false },
    ];
    expect(p.claimMission(0)).toBeNull();
    state.counters.grabs = 15;
    frame();
    frame();
    expect(log.filter((e) => e.type === 'missionDone')).toEqual([{ type: 'missionDone', index: 0, text: 'Grab 15 hooks' }]);
    // The FREE tile counts it (the Daily is claimable too).
    expect(p.railState(0).free.badge).toBe(2);
    const v = p.free().missions;
    expect(v.rows[0]).toEqual(expect.objectContaining({ claimable: true, claimed: false, value: 15, target: 15 }));
    expect(v.rows[1].canReroll).toBe(true);
    const r = p.claimMission(0)!;
    expect(r.cash).toBe(50); // 2 min with no income → the $50 floor
    expect(r.pearls).toBe(MISSION_REWARDS.easy.pearls);
    expect(p.claimMission(0)).toBeNull();
    state.counters.eggsHatched = 1;
    state.counters.mutatedCollects = 1;
    frame();
    expect(p.claimMission('bonus')).toBeNull();
    p.claimMission(1);
    const hard = p.claimMission(2)!;
    expect(hard.boost2xSec).toBe((MISSION_REWARDS.hard.boostMin ?? 0) * 60);
    expect(p.free().missions.bonus.claimable).toBe(true);
    const bonus = p.claimMission('bonus')!;
    expect(bonus.creature).toBeDefined();
    expect(bonus.pearls).toBe(MISSION_BONUS.pearls);
    expect(p.claimMission('bonus')).toBeNull();
  });

  it('a new local day brings new missions; a clock that went backwards keeps them', () => {
    const { state, clock, frame } = setup(true);
    frame();
    const first = state.missions.list.map((m) => m.tpl);
    state.missions.list[0].claimed = true;
    clock.t = new Date(2026, 10, 6, 9).getTime();
    frame();
    expect(state.missions.day).toBe('2026-11-06');
    expect(state.missions.list.every((m) => !m.claimed)).toBe(true);
    expect(ensureMissions(state, '2026-11-04')).toBe(false);
    expect(state.missions.day).toBe('2026-11-06');
    expect(first).toHaveLength(3);
  });

  it('one free reroll per mission: a different template of the same tier', () => {
    const s = new GameState();
    ensureMissions(s, '2026-11-05');
    const before = s.missions.list[1];
    expect(rerollMission(s, 1, 'x')).toBe(true);
    const after = s.missions.list[1];
    expect(after.tier).toBe('medium');
    expect(after.tpl).not.toBe(before.tpl);
    expect(rerollMission(s, 1, 'y')).toBe(false);
  });

  it('saves and loads, dropping malformed entries', () => {
    const s = new GameState();
    ensureMissions(s, '2026-11-05');
    s.missions.list[0].claimed = true;
    const t = new GameState();
    t.load(JSON.parse(JSON.stringify(s.toSave(T0))));
    expect(t.missions).toEqual(s.missions);
    const bad = { ...s.toSave(T0), missions: { day: 5, list: [{ tpl: 'e_grabs', tier: 'easy', stat: 'nope' }, 3, { tpl: 'x', tier: 'hard', stat: 'grabs', target: 2 }], bonusClaimed: 'no' } };
    t.load(bad);
    expect(t.missions.day).toBe('');
    expect(t.missions.list).toEqual([{ tpl: 'x', tier: 'hard', target: 2, stat: 'grabs', start: 0, claimed: false, rerolled: false }]);
    // An unknown template is rolled over on the next update.
    expect(ensureMissions(t, '2026-11-05')).toBe(true);
    expect(t.missions.list).toHaveLength(3);
  });
});

describe('2× Cash Boost', () => {
  it('doubles income and delivery cash, not the base income used for rewards and offline', () => {
    const s = new GameState();
    s.base[0] = { speciesId: 'crab_dj', mutation: 0 };
    const base = s.incomePerSec();
    expect(deliveryMult(s)).toBe(1);
    s.tokens.boost2xSec = 60;
    expect(s.incomePerSec()).toBeCloseTo(base * BOOST.factor);
    expect(s.baseIncomePerSec()).toBeCloseTo(base);
    expect(deliveryMult(s)).toBe(BOOST.factor);
  });

  it('counts down only while playing and says when it ends', () => {
    const { state, log, frame } = setup(true);
    state.tokens.boost2xSec = 2;
    frame(1, false); // paused, hidden or idle
    expect(state.tokens.boost2xSec).toBe(2);
    frame(1);
    expect(state.tokens.boost2xSec).toBe(1);
    frame(1.5);
    expect(state.tokens.boost2xSec).toBe(0);
    expect(log.filter((e) => e.type === 'boostEnd')).toHaveLength(1);
    frame(1);
    expect(log.filter((e) => e.type === 'boostEnd')).toHaveLength(1);
  });

  it('a rewarded ad adds 5 min, up to 30 min stored', () => {
    const { state, p } = setup(true);
    expect(p.canAdBoost()).toBe(true);
    expect(p.addAdBoost()).toBe(BOOST.adSec);
    state.tokens.boost2xSec = BOOST.capSec - 100;
    expect(p.canAdBoost()).toBe(false);
    expect(p.addAdBoost()).toBe(100);
    expect(state.tokens.boost2xSec).toBe(BOOST.capSec);
    expect(p.free().boost).toEqual({ sec: BOOST.capSec, canAd: false, adSec: BOOST.adSec, capSec: BOOST.capSec });
    expect(setup(false).p.addAdBoost()).toBe(0);
  });

  it('comes from the 2.5-min gift and Daily day 3', () => {
    expect(GIFTS.find((g) => g.atMin === 2.5)?.spec.boostMin).toBe(3);
    expect(DAILY_REWARDS[2].boostMin).toBeGreaterThan(0);
  });
});

describe('FREE tile prize', () => {
  it('shows the next gift prize while nothing is claimable', () => {
    const { state, p } = setup(true);
    p.claimDaily();
    state.missions.list = [];
    expect(p.railState(0).free.prize).toEqual({ icon: 'cash', text: '$50' });
    state.gifts.activeSec = 60;
    p.claimGift(0);
    expect(p.railState(0).free.prize).toEqual({ icon: 'boost', text: '2× 3 MIN' });
    state.gifts.activeSec = 9 * 60;
    p.claimGift('all');
    expect(p.railState(0).free.prize).toEqual({ icon: 'creature', text: 'CREATURE' });
    state.gifts.activeSec = 9.5 * 60;
    expect(p.railState(0).free.prize).toEqual({ icon: 'creature', text: 'CREATURE' });
    expect(p.railState(0).free.timer).toBe('0:30');
  });
});

describe('delivery toast', () => {
  const toast = { speciesId: 'toastopus', mutation: 0 };
  const crab = { speciesId: 'crab_dj', mutation: 0 };
  it('leads with the income gained, as an upgrade when a weaker creature was replaced', () => {
    expect(deliveryMessage({ placed: [crab], sold: [{ creature: toast, cash: 30, displaced: true }] }, 1)?.text).toBe('+$2/s (replaced Toastopus)');
    expect(deliveryMessage({ placed: [crab], sold: [] }, 1)?.text).toBe('+$3/s added');
    const full = deliveryMessage({ placed: [], sold: [{ creature: toast, cash: 30 }] }, 1)!;
    expect(full).toEqual({ text: 'Base full: sold Toastopus for $30', good: false, soldExtra: 1 });
    expect(deliveryMessage({ placed: [crab], sold: [{ creature: toast, cash: 30 }, { creature: toast, cash: 30 }] }, 1)?.text).toBe('+$3/s added · sold 2 for $60');
    expect(deliveryMessage({ placed: [], sold: [] }, 1)).toBeNull();
  });
});

describe('save compatibility', () => {
  it('older saves start the Deep Voyage at 0 and get zeroed new stats', () => {
    const s = new GameState();
    const save = s.toSave(T0) as unknown as Record<string, unknown>;
    const old = { ...save, voyage: { step: 12 }, stats: { grabs: 3 } };
    const t = new GameState();
    expect(t.load(old)).toBe(true);
    expect(t.voyage).toEqual({ step: 12, deep: 0 });
    expect(t.counters.bigWavesSurvived).toBe(0);
    expect(t.counters.lighthouseWaves).toBe(0);
    expect(t.counters.grabs).toBe(3);
    t.voyage.deep = 4;
    const u = new GameState();
    u.load(JSON.parse(JSON.stringify(t.toSave(T0))));
    expect(u.voyage).toEqual({ step: 12, deep: 4 });
    u.load({ ...save, voyage: { step: 99, deep: 99 } });
    expect(u.voyage).toEqual({ step: 12, deep: 10 });
  });
});
