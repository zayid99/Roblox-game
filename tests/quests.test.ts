import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import type { SimEvent, WildCreature } from '../src/contracts';
import { ManualClock } from '../src/game/clock';
import { Progression, type ProgressEvent } from '../src/game/progression';
import { VOYAGE, voyageRewardKey } from '../src/game/quests';
import { GameSim } from '../src/game/sim';
import { GameState } from '../src/game/state';

const T0 = new Date(2026, 10, 5, 12).getTime();

function setup(ftueDone = false) {
  const state = new GameState();
  state.ftue.done = ftueDone;
  const clock = new ManualClock(T0);
  const p = new Progression(state, clock);
  const sim = new GameSim(state, { rngSeed: 1 });
  const log: ProgressEvent[] = [];
  const frame = () => {
    clock.advance(16);
    p.update(1 / 60, { active: true, sim, ftueDone: state.ftue.done });
    log.push(...p.events);
  };
  const send = (e: SimEvent) => p.onSimEvent(e, sim);
  return { state, p, sim, log, frame, send };
}

function wild(speciesId: string, golden = false, mutation = 0): WildCreature {
  const sim = new GameSim(new GameState(), { rngSeed: 1 });
  return { speciesId, mutation, uid: 1, pos: new Vector3(), zone: 0, island: sim.course.islands[0], bornAt: 0, golden, featured: false };
}

describe('First Voyage', () => {
  it('has 12 quests with the §9.1 rewards', () => {
    expect(VOYAGE.length).toBe(12);
    expect(VOYAGE.map((q) => q.reward)).toEqual([
      { cash: 20 }, { cash: 20 }, {}, { cash: 50 }, { cash: 40 }, { min: 2 },
      { min: 2 }, { min: 2 }, { min: 3 }, { min: 3 }, { min: 5, pearls: 10 }, { min: 5, pearls: 25, cosmetic: 'rope_sailor' },
    ]);
  });

  it('quests 1–6 complete during the FTUE without paying (the tutorial grants them)', () => {
    const { state, log, frame, send, sim } = setup(false);
    send({ type: 'player', event: 'grab' });
    frame();
    expect(state.voyage.step).toBe(1);
    expect(log).toContainEqual({ type: 'questDone', index: 1, reward: {} });
    expect(state.cash).toBe(0);
    expect(state.flags.landedIsland).toBeUndefined();
    send({ type: 'landed', solid: sim.course.islands[0].solid, islandOrder: 1 });
    frame();
    expect(state.voyage.step).toBe(2);
    expect(state.cash).toBe(0);
  });

  it('after the FTUE, quests pay out and satisfied ones complete one per frame', () => {
    const { state, log, frame, send, p } = setup(true);
    state.voyage.step = 6;
    expect(p.tracker()).toEqual(expect.objectContaining({ title: 'FIRST VOYAGE', count: '7/12' }));
    state.bestZone = 1;
    frame();
    expect(state.voyage.step).toBe(7);
    expect(state.cash).toBe(50); // 2 min with no income → the $50 floor
    expect(log.find((e) => e.type === 'questDone')).toEqual({ type: 'questDone', index: 7, reward: { cash: 50 } });
    expect(log).toContainEqual({ type: 'rewardApplied', reward: { cash: 50 }, source: 'voyage:7' });

    send({ type: 'padLaunch', padId: 1, inWave: true });
    for (let i = 0; i < 4; i++) state.base[i] = { speciesId: 'toastopus', mutation: 0 };
    state.levels.carry = 1;
    frame();
    frame();
    frame();
    expect(state.voyage.step).toBe(10);
    expect(p.tracker()!.rows[0].text).toBe('Catch a Rare');
    expect(p.tracker()!.rows[0].reward.pearls).toBe(10);

    send({ type: 'collect', creature: wild('banana_shark'), isNewSpecies: true, isNewMutation: true });
    frame();
    expect(state.voyage.step).toBe(11);
    expect(state.pearls).toBe(5 + 10); // discovery + quest 11
    expect(log).toContainEqual({ type: 'discovery', speciesId: 'banana_shark', pearls: 5 });

    send({ type: 'collect', creature: wild('toastopus', true), isNewSpecies: false, isNewMutation: false });
    frame();
    expect(state.voyage.step).toBe(12);
    expect(state.cosmetics.owned).toContain('rope_sailor');
    expect(state.pearls).toBe(5 + 10 + 25);
    expect(log).toContainEqual({ type: 'voyageDone' });
    expect(log).toContainEqual({ type: 'unlock', what: 'locker' });
    expect(p.tracker()).toBeNull();
    frame();
    expect(state.voyage.step).toBe(12);
  });

  it('a skipped FTUE pays a quest 1–6 reward only if it was not paid yet', () => {
    const { state, frame, send } = setup(true);
    state.ftue.rewarded = [voyageRewardKey(1)];
    send({ type: 'player', event: 'grab' });
    frame();
    expect(state.voyage.step).toBe(1);
    expect(state.cash).toBe(0);
    state.flags.landedIsland = true;
    frame();
    expect(state.voyage.step).toBe(2);
    expect(state.cash).toBe(20);
    expect(state.ftue.rewarded).toContain('V2');
  });

  it('tracks stats from sim events', () => {
    const { state, send } = setup(true);
    send({ type: 'player', event: 'grab' });
    send({ type: 'releaseRated', quality: 'perfect', theta: 40 });
    send({ type: 'chain', count: 3 });
    send({ type: 'deliver', result: { placed: [{ speciesId: 'toastopus', mutation: 0 }], sold: [] }, bonusCash: 1, chainMult: 1, tripBest: 0, closeCall: false });
    send({ type: 'surgeEnd', golden: false, big: false, number: 1, survived: true });
    send({ type: 'closeCall', where: 'pad' });
    send({ type: 'bounce', buoyId: 1 });
    send({ type: 'splash', lost: [], practice: false });
    send({ type: 'collect', creature: wild('crab_dj', false, 1), isNewSpecies: true, isNewMutation: true });
    const c = state.counters;
    expect([c.grabs, c.perfects, c.bestChain, c.bestChainToday, c.deliveries, c.creaturesDelivered]).toEqual([1, 1, 3, 3, 1, 1]);
    expect([c.wavesSurvived, c.closeCalls, c.bounces, c.splashes, c.collects, c.mutatedCollects]).toEqual([1, 1, 1, 1, 1, 1]);
    expect(c.collectsByRarity[1]).toBe(1);
    expect(state.flags.firstSurgeEnd).toBe(true);
  });
});

describe('Progression facade', () => {
  it('unlocks Index and FREE when the FTUE finishes, and announces the Featured Creature once a week', () => {
    const { state, log, frame, sim } = setup(false);
    frame();
    expect(log.some((e) => e.type === 'featured')).toBe(false);
    state.ftue.done = true;
    frame();
    expect(log).toContainEqual({ type: 'unlock', what: 'index' });
    expect(log).toContainEqual({ type: 'unlock', what: 'free' });
    expect(log.filter((e) => e.type === 'featured').length).toBe(1);
    expect(sim.featuredSpecies).not.toBeNull();
    frame();
    expect(log.filter((e) => e.type === 'featured').length).toBe(1);
  });

  it('rail state: visibility, badges, wiggle', () => {
    const { state, p, frame } = setup(false);
    let rail = p.railState(0);
    expect(rail.shop.visible).toBe(false);
    expect(rail.free.visible).toBe(false);
    state.ftue.step = 'shop';
    rail = p.railState(100, true);
    expect(rail.shop.visible).toBe(true);
    expect(rail.shop.arrow).toBe(true);
    expect(rail.shop.wiggle).toBe(true);
    state.ftue.done = true;
    frame();
    rail = p.railState(0);
    expect(rail.free.badge).toBe(1); // Daily claimable
    expect(rail.free.wiggle).toBe(true);
    p.claimDaily();
    rail = p.railState(0);
    expect(rail.free.badge).toBeNull();
    expect(rail.free.timer).toMatch(/^\d+:\d\d$/);
    state.index.toastopus = 1;
    expect(p.railState(0).index.badge).toBe(1);
    p.markIndexSeen();
    expect(p.railState(0).index.badge).toBeNull();
    const cost = state.rebirthCost();
    expect(p.railState(cost * 0.2).rebirth.visible).toBe(false);
    expect(p.railState(cost * 0.3).rebirth.visible).toBe(true);
    expect(p.railState(cost).rebirth.badge).toBe('!');
  });

  it('index view counts species × mutations', () => {
    const { state, p } = setup(true);
    state.index = { toastopus: 0b11, crab_dj: 0b1 };
    const v = p.index();
    expect(v.total).toBe(140);
    expect(v.found).toBe(3);
    expect(v.entries.length).toBe(35);
    const t = v.entries.find((e) => e.id === 'toastopus')!;
    expect(t.mask).toBe(3);
    expect(t.isNew).toBe(true);
    expect(t.foundIn).toBe('Shallows');
    expect(v.featured).not.toBeNull();
  });

  it('Lucky Tide makes the next wave golden', () => {
    const { state, p, sim } = setup(true);
    expect(p.useLuckyTide(sim)).toBe(false);
    state.tokens.luckyTide = 2;
    expect(sim.wave.golden).toBe(false);
    expect(p.useLuckyTide(sim)).toBe(true);
    expect(sim.wave.golden).toBe(true);
    expect(state.tokens.luckyTide).toBe(1);
    expect(p.useLuckyTide(sim)).toBe(false);
  });

  it('Welcome Back: offline earnings, the Daily and pending gifts in one claim', () => {
    const state = new GameState();
    state.ftue.done = true;
    state.base[0] = { speciesId: 'crab_dj', mutation: 0 }; // $3/s
    state.savedAt = T0 - 600_000;
    state.lastSeen = T0 - 600_000;
    state.gifts = { day: '2026-11-05', activeSec: 0, claimed: [], pending: [2] };
    const p = new Progression(state, new ManualClock(T0));
    expect(p.shouldShowWelcome()).toBe(true);
    const w = p.welcome();
    expect(w.offline).toBeCloseTo(1800);
    expect(w.daily?.day).toBe(1);
    expect(w.pendingGifts).toEqual([{ pearls: 10 }]);
    expect(w.canDouble).toBe(true);
    const r = p.collectWelcome(true);
    expect(r.cash).toBeCloseTo(3600 + Math.round(3 * 60 * 3));
    expect(r.pearls).toBe(20);
    expect(p.offline).toBe(0);
    expect(p.shouldShowWelcome()).toBe(false);
    expect(new Progression(new GameState(), new ManualClock(T0)).shouldShowWelcome()).toBe(false);
  });
});
