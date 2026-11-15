import { describe, expect, it } from 'vitest';
import { HOME_FRONT_Z, WAVE } from '../src/game/config';
import { NO_INPUT } from '../src/game/player';
import { GameSim } from '../src/game/sim';
import { GameState } from '../src/game/state';
import { WaveSim } from '../src/game/wave';

const DT = 1 / 60;

/** Puts the player on the island with course order `order`, standing at its centre. */
function standOn(sim: GameSim, order: number): void {
  const isl = sim.course.islands.find((i) => i.order === order)!;
  const s = isl.solid;
  sim.player.reset(isl.checkpoint.clone().set((s.min.x + s.max.x) / 2, s.max.y, (s.min.z + s.max.z) / 2));
  sim.player.mode = 'ground';
  sim.player.groundSolid = s;
}

/** Steps the sim (standing still) until the surge ends; returns the seconds spent in warning and surge. */
function waitOutWave(sim: GameSim): { warning: number; surge: number; startZ: number } {
  let warning = 0;
  let surge = 0;
  let startZ = NaN;
  for (let t = 0; t < 200; t += DT) {
    sim.step(DT, NO_INPUT);
    if (sim.events.some((e) => e.type === 'surgeStart')) startZ = sim.wave.frontZ;
    if (sim.events.some((e) => e.type === 'surgeEnd')) break;
    if (sim.wave.phase === 'warning') warning += DT;
    if (sim.wave.phase === 'surge') surge += DT;
  }
  while (sim.splashTime > 0 || sim.seaRespawnTime > 0) sim.step(DT, NO_INPUT);
  return { warning, surge, startZ };
}

function doneState(): GameState {
  const state = new GameState();
  state.ftue.done = true;
  return state;
}

describe('wave surge starts near the player (no long idle wait)', () => {
  it('rises WAVE.lead beyond the player and only moves farther out during the warning', () => {
    const w = new WaveSim(-700);
    w.track(-50, 6);
    expect(w.startZ).toBe(-50 - WAVE.lead);
    w.setTimer(5);
    w.update(DT);
    expect(w.phase).toBe('warning');
    w.track(-10, 6); // running home: the wall stays where it rose
    expect(w.startZ).toBe(-50 - WAVE.lead);
    w.track(-90, 6); // running deeper: it rises farther out
    expect(w.startZ).toBe(-90 - WAVE.lead);
    w.forceSurge();
    w.update(DT);
    expect(w.phase).toBe('surge');
    w.track(-300, 6); // fixed once surging
    expect(w.frontZ).toBeGreaterThan(-90 - WAVE.lead - 1);
    // At home it rises beyond the home shore.
    const h = new WaveSim(-700);
    h.track(HOME_FRONT_Z + 10, 6);
    expect(h.startZ).toBe(HOME_FRONT_Z - WAVE.lead);
  });

  it('a player waiting at home waits about warning + 3 s per wave (was ~26 s)', () => {
    const sim = new GameSim(doneState(), { rngSeed: 2 });
    sim.player.reset(sim.course.homeSpawn);
    sim.wave.setTimer(20);
    const r = waitOutWave(sim);
    expect(r.warning).toBeCloseTo(WAVE.warningEarly, 1);
    expect(r.surge).toBeLessThan(3.5);
    expect(r.warning + r.surge).toBeLessThan(10);
  });

  it('the practice wave: about 5 s of warning, about 3 s of surge', () => {
    const sim = new GameSim(new GameState(), { rngSeed: 2 });
    sim.overrides = { waveFrozen: false, practiceWave: true };
    standOn(sim, 1);
    sim.wave.setTimer(12);
    const r = waitOutWave(sim);
    expect(r.warning).toBeCloseTo(WAVE.warningPractice, 1);
    expect(r.surge).toBeGreaterThan(2);
    expect(r.surge).toBeLessThan(4);
  });

  it('sheltering on a far lighthouse: once the wall has passed, it rushes home (fresh creatures sooner)', () => {
    const sim = new GameSim(doneState(), { rngSeed: 2 });
    const lh = sim.course.lighthouses[sim.course.lighthouses.length - 1];
    const top = lh.platform;
    sim.player.reset(top.max.clone().set((top.min.x + top.max.x) / 2, top.max.y, (top.min.z + top.max.z) / 2));
    sim.player.mode = 'ground';
    sim.player.groundSolid = top;
    sim.wave.setTimer(20);
    const z = sim.player.pos.z;
    const r = waitOutWave(sim);
    expect(sim.splashedThisSurge).toBe(false);
    // The old wave took (home - course end) / 42 ≈ 18 s to cross the course; now the lead, then 4× speed.
    const expected = (WAVE.lead + WAVE.passGap) / WAVE.speed + (HOME_FRONT_Z - (z + WAVE.passGap)) / (WAVE.speed * WAVE.passBoost);
    expect(r.surge).toBeCloseTo(expected, 0);
    expect(r.surge).toBeLessThan(9);
  });

  it('warns longer the deeper the player is: 6 s early zones, 8 s Stormy/Kraken, 12 s Volcano and Secret Reef', () => {
    const want = [WAVE.warningEarly, WAVE.warningEarly, WAVE.warningEarly, WAVE.warning, WAVE.warning, WAVE.warningLate, WAVE.warningLate];
    const sim = new GameSim(doneState(), { rngSeed: 2 });
    for (let zone = 0; zone < want.length; zone++) {
      const isl = sim.course.islands.find((i) => i.zone === zone)!;
      standOn(sim, isl.order);
      expect(sim.warningLength(), `zone ${zone}`).toBe(want[zone]);
    }
  });

  it('time from the horn to the wall reaching a player standing still is warning + lead / speed, everywhere', () => {
    const sim = new GameSim(doneState(), { rngSeed: 2 });
    for (const order of [1, 6, 12, 19, 21]) {
      standOn(sim, order);
      sim.wave.setTimer(15);
      sim.step(DT, NO_INPUT);
      const z = sim.player.pos.z;
      const w = sim.warningLength();
      // At the horn, the wave meter's "hits in" for the player.
      while (sim.wave.phase !== 'warning') sim.step(DT, NO_INPUT);
      expect(sim.wave.timeUntilReaches(z), `island ${order}`).toBeCloseTo(w + WAVE.lead / sim.wave.speed, 1);
      waitOutWave(sim);
    }
  });
});

describe('Golden Waves come early', () => {
  function goldens(sim: GameSim, n: number): boolean[] {
    const out: boolean[] = [];
    for (let i = 0; i < n; i++) {
      out.push(sim.wave.golden);
      sim.wave.forceSurge();
      const c = sim.wave.count;
      while (sim.wave.count === c) sim.step(1 / 30, NO_INPUT);
    }
    return out;
  }

  it('a returning session starts with a Golden Wave, then every 4th as before', () => {
    const sim = new GameSim(doneState(), { rngSeed: 4 });
    sim.player.reset(sim.course.homeSpawn);
    expect(goldens(sim, 9)).toEqual([true, false, false, false, true, false, false, false, true]);
  });

  it('a tutorial session: the practice wave is plain, the first wave after it is Golden', () => {
    const state = new GameState();
    const sim = new GameSim(state, { rngSeed: 4 });
    sim.player.reset(sim.course.homeSpawn);
    sim.overrides = { waveFrozen: false, practiceWave: true };
    expect(goldens(sim, 1)).toEqual([false]);
    sim.overrides = { waveFrozen: false, practiceWave: false };
    state.ftue.done = true;
    expect(goldens(sim, 5)).toEqual([true, false, false, false, true]);
  });

  it('Lucky Tide still forces a Golden Wave on top of the pattern', () => {
    const sim = new GameSim(doneState(), { rngSeed: 4 });
    sim.player.reset(sim.course.homeSpawn);
    goldens(sim, 1);
    expect(sim.wave.golden).toBe(false);
    sim.wave.forceGoldenNext();
    expect(goldens(sim, 2)).toEqual([true, false]);
  });
});
