import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { HOME_FRONT_Z, WAVE } from '../src/game/config';
import { NO_INPUT } from '../src/game/player';
import { GameSim } from '../src/game/sim';
import { GameState } from '../src/game/state';
import { WaveSim } from '../src/game/wave';

const DT = 1 / 60;

describe('wave cycle', () => {
  it('counts down, warns, surges to home, then repeats', () => {
    const w = new WaveSim(-700);
    const seen: string[] = [];
    for (let t = 0; t < WAVE.firstInterval + 30; t += DT) {
      w.update(DT);
      seen.push(...w.events);
    }
    expect(seen).toEqual(['warning', 'surgeStart', 'surgeEnd']);
    expect(w.phase).toBe('calm');
    expect(w.count).toBe(1);
  });

  it('makes every fourth wave golden', () => {
    const w = new WaveSim(-100);
    const golden: boolean[] = [];
    for (let i = 0; i < 8; i++) {
      golden.push(w.golden);
      w.forceSurge();
      while (w.phase !== 'calm' || w.count === i) w.update(DT);
    }
    expect(golden).toEqual([false, false, false, true, false, false, false, true]);
  });

  it('only hits things low and inside the wall', () => {
    const w = new WaveSim(-300);
    w.forceSurge();
    w.update(DT);
    w.frontZ = -100;
    expect(w.hits(5, -102)).toBe(true);
    expect(w.hits(12, -102)).toBe(false);
    expect(w.hits(5, -50)).toBe(false);
    expect(w.hits(5, HOME_FRONT_Z + 3)).toBe(false);
  });
});

describe('game loop', () => {
  it('collect a creature, carry it home, and earn from it', () => {
    const sim = new GameSim(new GameState(), { rngSeed: 3 });
    const creature = sim.wild[0];
    expect(creature).toBeDefined();
    sim.player.reset(creature.pos.clone().add(new Vector3(0, 0.1, 0)));
    sim.step(DT, NO_INPUT);
    expect(sim.events.some((e) => e.type === 'collect')).toBe(true);
    expect(sim.state.carried.length).toBe(1);

    sim.player.reset(sim.course.homeSpawn.clone().add(new Vector3(0, 0.5, 0)));
    for (let i = 0; i < 30; i++) sim.step(DT, NO_INPUT);
    expect(sim.state.carried.length).toBe(0);
    expect(sim.state.incomePerSec()).toBeGreaterThan(0);
  });

  it('the wave washes away carried creatures unless you are up high', () => {
    const sim = new GameSim(new GameState(), { rngSeed: 4 });
    const island = sim.course.islands[4];
    sim.player.reset(island.checkpoint.clone());
    sim.state.carried = [{ speciesId: 'crab_dj', mutation: 0 }];
    sim.wave.forceSurge();
    let splashed = false;
    for (let t = 0; t < 30 && !splashed; t += DT) {
      sim.step(DT, NO_INPUT);
      splashed = sim.events.some((e) => e.type === 'splash');
    }
    expect(splashed).toBe(true);
    expect(sim.state.carried.length).toBe(0);

    const safe = new GameSim(new GameState(), { rngSeed: 5 });
    const lh = safe.course.lighthouses[1];
    safe.player.reset(new Vector3((lh.platform.min.x + lh.platform.max.x) / 2, lh.platform.max.y, (lh.platform.min.z + lh.platform.max.z) / 2));
    safe.state.carried = [{ speciesId: 'crab_dj', mutation: 0 }];
    safe.wave.forceSurge();
    for (let t = 0; t < 30; t += DT) {
      safe.step(DT, NO_INPUT);
      expect(safe.events.some((e) => e.type === 'splash')).toBe(false);
    }
    expect(safe.state.carried.length).toBe(1);
  });

  it('washes up a fresh batch of creatures after each wave', () => {
    const sim = new GameSim(new GameState(), { rngSeed: 6 });
    sim.wild = [];
    sim.wave.forceSurge();
    let ended = false;
    for (let t = 0; t < 40 && !ended; t += DT) {
      sim.step(DT, NO_INPUT);
      ended = sim.events.some((e) => e.type === 'surgeEnd');
    }
    expect(ended).toBe(true);
    expect(sim.wild.length).toBeGreaterThan(10);
  });
});
