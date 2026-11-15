// Sea Events (src/game/seaEvents.ts and its GameSim hooks): timing, tutorial, wave interplay, effects.
import { describe, expect, it } from 'vitest';
import type { SeaEventId, SimEvent } from '../src/contracts';
import { WAVE } from '../src/game/config';
import { NO_INPUT } from '../src/game/player';
import { SEA, SEA_EVENT_IDS, SeaEventSim, type SeaContext } from '../src/game/seaEvents';
import { GameSim } from '../src/game/sim';
import { GameState } from '../src/game/state';

const DT = 1 / 30;

function readySim(seed = 5): GameSim {
  const s = new GameState();
  s.ftue.done = true;
  s.bestZone = 1;
  const sim = new GameSim(s, { rngSeed: seed });
  sim.player.reset(sim.course.homeSpawn.clone());
  return sim;
}

interface Log {
  t: number;
  id: SeaEventId;
  phase: string;
  wavePhase: string;
}

/** Plays `minutes` of session at home and logs every sea event (and the wave phase at that moment). */
function play(sim: GameSim, minutes: number, each?: (sim: GameSim) => void): Log[] {
  const log: Log[] = [];
  for (let t = 0; t < minutes * 60; t += DT) {
    sim.step(DT, NO_INPUT);
    for (const e of sim.events) if (e.type === 'seaEvent') log.push({ t: sim.time, id: e.id, phase: e.phase, wavePhase: sim.wave.phase });
    each?.(sim);
  }
  return log;
}

describe('sea events: schedule', () => {
  const sim = readySim(5);
  const overlaps: string[] = [];
  const log = play(sim, 45, (s) => {
    if (s.sea.phase === 'headsUp' && s.wave.phase !== 'calm') overlaps.push(`${s.time.toFixed(1)} ${s.wave.phase}`);
  });
  const heads = log.filter((l) => l.phase === 'headsUp');
  const starts = log.filter((l) => l.phase === 'start');
  const ends = log.filter((l) => l.phase === 'end');

  it('starts from minute 6 and comes every 4 to 6 minutes', () => {
    expect(heads.length).toBeGreaterThanOrEqual(6);
    expect(heads[0].t).toBeGreaterThanOrEqual(SEA.firstAt);
    expect(heads[0].t).toBeLessThan(SEA.firstAt + WAVE.interval + 1);
    for (let i = 1; i < heads.length; i++) {
      const gap = heads[i].t - heads[i - 1].t;
      expect(gap).toBeGreaterThanOrEqual(SEA.gapMin - 0.1);
      // A heads-up waits for a clear wave window (at most one wave cycle, longer if Calm Seas froze it).
      expect(gap).toBeLessThanOrEqual(SEA.gapMax + WAVE.interval + SEA.durMax + 1);
    }
  });

  it('gives a 15 s heads-up and lasts 60 to 90 s', () => {
    for (let i = 0; i < starts.length; i++) {
      expect(starts[i].t - heads[i].t).toBeCloseTo(SEA.headsUp, 0);
      const len = ends[i].t - starts[i].t;
      expect(len).toBeGreaterThanOrEqual(SEA.durMin - 0.1);
      expect(len).toBeLessThanOrEqual(SEA.durMax + 0.1);
    }
  });

  it('never overlaps a wave warning: the heads-up and the start banner fall in calm phases', () => {
    expect(overlaps).toEqual([]);
    for (const l of [...heads, ...starts]) expect(l.wavePhase).toBe('calm');
  });

  it('never repeats the same event twice in a row and uses every event', () => {
    for (let i = 1; i < starts.length; i++) expect(starts[i].id).not.toBe(starts[i - 1].id);
    const big = play(readySim(8), 60).filter((l) => l.phase === 'start');
    expect(new Set([...starts, ...big].map((l) => l.id)).size).toBe(SEA_EVENT_IDS.length);
  }, 30000);

  it('is deterministic for a seed', () => {
    const again = play(readySim(5), 25);
    const prefix = log.filter((l) => l.t <= 25 * 60);
    expect(again.map((l) => [l.id, l.phase, l.t.toFixed(2)])).toEqual(prefix.map((l) => [l.id, l.phase, l.t.toFixed(2)]));
  }, 30000);
});

describe('sea events: tutorial', () => {
  it('never runs while the tutorial is unfinished or replaying', () => {
    const s = new GameState();
    const sim = new GameSim(s, { rngSeed: 3 });
    expect(play(sim, 12)).toEqual([]);
    s.ftue.done = true;
    sim.tutorialActive = true;
    expect(play(sim, 12)).toEqual([]);
  });

  it('waits a minute after the tutorial ends', () => {
    const sea = new SeaEventSim(1);
    const calm: SeaContext = { blocked: false, wavePhase: 'calm', waveTimer: 60, waveFrozen: false };
    sea.update(SEA.firstAt + 10, { ...calm, blocked: true });
    sea.update(30, calm);
    expect(sea.phase).toBe('idle');
    sea.update(31, calm);
    expect(sea.phase).toBe('headsUp');
  });

  it('a tutorial replay cancels a running event', () => {
    const sim = readySim();
    sim.forceSeaEvent('calmSeas', true);
    sim.step(DT, NO_INPUT);
    expect(sim.sea.active).toBe('calmSeas');
    sim.tutorialActive = true;
    sim.step(DT, NO_INPUT);
    expect(sim.events.some((e) => e.type === 'seaEvent' && e.phase === 'end')).toBe(true);
    expect(sim.sea.phase).toBe('idle');
    expect(sim.wave.frozen).toBe(false);
  });

  it('only opens the heads-up in a window clear of the wave warning', () => {
    const base: SeaContext = { blocked: false, wavePhase: 'calm', waveTimer: 60, waveFrozen: false };
    expect(SeaEventSim.clearWindow(base)).toBe(true);
    expect(SeaEventSim.clearWindow({ ...base, waveTimer: SEA.headsUp + WAVE.warning })).toBe(false);
    expect(SeaEventSim.clearWindow({ ...base, wavePhase: 'warning' })).toBe(false);
    expect(SeaEventSim.clearWindow({ ...base, wavePhase: 'surge' })).toBe(false);
    expect(SeaEventSim.clearWindow({ ...base, waveFrozen: true })).toBe(false);
  });
});

describe('sea events: effects', () => {
  function startEvent(id: SeaEventId, seed = 5): { sim: GameSim; events: SimEvent[] } {
    const sim = readySim(seed);
    sim.forceSeaEvent(id, true);
    sim.step(DT, NO_INPUT);
    return { sim, events: [...sim.events] };
  }

  it('Calm Seas freezes the wave countdown and speeds up running', () => {
    const { sim } = startEvent('calmSeas');
    const timer = sim.wave.timer;
    const runSpeed = sim.state.stats.runSpeed;
    for (let i = 0; i < 30 * 20; i++) sim.step(DT, NO_INPUT);
    expect(sim.wave.timer).toBeCloseTo(timer, 3);
    expect(sim.sea.runSpeedMult).toBe(SEA.calmRunSpeed);
    expect(sim.state.stats.runSpeed).toBe(runSpeed); // the save's stats are untouched
    // After the event the countdown runs again.
    for (let i = 0; i < 30 * 95 && sim.sea.active; i++) sim.step(DT, NO_INPUT);
    sim.step(DT, NO_INPUT);
    expect(sim.wave.timer).toBeLessThan(timer);
  });

  it('Feeding Frenzy fills every spawn point', () => {
    const { sim } = startEvent('feedingFrenzy');
    const points = sim.course.islands.reduce((a, i) => a + i.spawnPoints.length, 0);
    expect(sim.wild.length).toBe(points);
  });

  it('Treasure Fleet washes up three bottles', () => {
    const { sim, events } = startEvent('treasureFleet');
    expect(events.filter((e) => e.type === 'bottleSpawn' && e.reason === 'fleet').length).toBe(3);
    expect(sim.treasure.world.length).toBe(3);
  });

  it('Rainbow Rain roughly triples the mutation chance', () => {
    const sea = new SeaEventSim(2);
    const N = 60000;
    let base = 0;
    let boosted = 0;
    for (let i = 0; i < N; i++) if (sea.boostMutation(0, false) > 0) boosted++;
    base = 0.004 + 0.015 + 0.05;
    // max(base roll, extra roll at 2× the odds) ≈ 3× for small odds; here only the extra roll is sampled.
    expect(boosted / N).toBeGreaterThan(base * 1.8);
    expect(boosted / N).toBeLessThan(base * 2.2);
    // Never downgrades.
    for (let i = 0; i < 1000; i++) expect(sea.boostMutation(3, false)).toBe(3);
  });

  it('Rainbow Rain upgrades some creatures already out', () => {
    let upgraded = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const sim = readySim(seed);
      const before = sim.wild.reduce((a, c) => a + c.mutation, 0);
      sim.forceSeaEvent('rainbowRain', true);
      sim.step(DT, NO_INPUT);
      upgraded += sim.wild.reduce((a, c) => a + c.mutation, 0) - before;
    }
    expect(upgraded).toBeGreaterThan(0);
  });
});
