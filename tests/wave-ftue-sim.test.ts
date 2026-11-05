import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { WAVE } from '../src/game/config';
import { SPECIES } from '../src/game/creatures';
import { NO_INPUT } from '../src/game/player';
import { GameSim, type SimEvent } from '../src/game/sim';
import { GameState } from '../src/game/state';
import { ZONES } from '../src/game/zones';

const SDT = 1 / 120;

function stepUntil(sim: GameSim, pred: (e: SimEvent) => boolean, maxSec = 40): SimEvent[] {
  const all: SimEvent[] = [];
  for (let t = 0; t < maxSec; t += SDT) {
    sim.step(SDT, NO_INPUT);
    all.push(...sim.events);
    if (sim.events.some(pred)) return all;
  }
  return all;
}

function standOnIsland(sim: GameSim, i: number) {
  sim.player.reset(sim.course.islands[i].checkpoint.clone());
}

describe('practice wave and survival (sim)', () => {
  it('waveFrozen override freezes the sim wave', () => {
    const sim = new GameSim(new GameState(), { rngSeed: 2 });
    sim.overrides = { waveFrozen: true, practiceWave: false };
    for (let i = 0; i < 600; i++) sim.step(SDT, NO_INPUT);
    expect(sim.wave.timer).toBe(WAVE.firstInterval);
    expect(sim.wave.frozen).toBe(true);
    sim.overrides = { waveFrozen: false, practiceWave: false };
    sim.step(SDT, NO_INPUT);
    expect(sim.wave.timer).toBeLessThan(WAVE.firstInterval);
  });

  it('a practice wave keeps what you carry; the next wave does not', () => {
    const state = new GameState();
    const sim = new GameSim(state, { rngSeed: 4 });
    sim.overrides = { waveFrozen: false, practiceWave: true };
    standOnIsland(sim, 4);
    state.carried = [{ speciesId: 'crab_dj', mutation: 0 }];
    sim.wave.forceSurge();
    let ev = stepUntil(sim, (e) => e.type === 'splash');
    expect(ev.find((e) => e.type === 'splash')).toEqual({ type: 'splash', lost: [{ speciesId: 'crab_dj', mutation: 0 }], practice: true });
    expect(state.carried.length).toBe(1);
    ev = stepUntil(sim, (e) => e.type === 'surgeEnd');
    expect(ev.find((e) => e.type === 'surgeEnd')).toEqual(expect.objectContaining({ survived: false, number: 1 }));

    // Wave 2: practice is over.
    sim.overrides = { waveFrozen: false, practiceWave: false };
    standOnIsland(sim, 4);
    state.carried = [{ speciesId: 'crab_dj', mutation: 0 }];
    sim.wave.forceSurge();
    ev = stepUntil(sim, (e) => e.type === 'splash');
    expect(ev.find((e) => e.type === 'splash')).toEqual(expect.objectContaining({ practice: false }));
    expect(state.carried.length).toBe(0);
  });

  it('surgeEnd says survived on a lighthouse top or at home', () => {
    for (const where of ['lighthouse', 'home'] as const) {
      const sim = new GameSim(new GameState(), { rngSeed: 5 });
      if (where === 'lighthouse') {
        const lh = sim.course.lighthouses[1];
        sim.player.reset(new Vector3((lh.platform.min.x + lh.platform.max.x) / 2, lh.platform.max.y, (lh.platform.min.z + lh.platform.max.z) / 2));
      } else {
        sim.player.reset(sim.course.homeSpawn.clone());
      }
      sim.wave.forceSurge();
      const ev = stepUntil(sim, (e) => e.type === 'surgeEnd');
      expect(ev.find((e) => e.type === 'surgeEnd')).toEqual(expect.objectContaining({ survived: true }));
    }
  });

  it('playerSafe: home, above the crest, or the wave already passed', () => {
    const sim = new GameSim(new GameState(), { rngSeed: 6 });
    sim.player.reset(sim.course.homeSpawn.clone());
    sim.step(SDT, NO_INPUT);
    expect(sim.playerSafe()).toBe(true);
    standOnIsland(sim, 2);
    sim.step(SDT, NO_INPUT);
    expect(sim.playerSafe()).toBe(false);
    sim.wave.forceSurge();
    sim.step(SDT, NO_INPUT);
    sim.wave.frontZ = sim.player.pos.z + 20;
    expect(sim.playerSafe()).toBe(true);
  });

  it('forceSpawn places a chosen creature on an island spawn point', () => {
    const sim = new GameSim(new GameState(), { rngSeed: 7 });
    const w = sim.forceSpawn(1, 0, 'toastopus', 0)!;
    const island = sim.course.islands.find((i) => i.order === 1)!;
    expect(w.pos.equals(island.spawnPoints[0])).toBe(true);
    expect(sim.wild.filter((c) => c.island === island && c.pos.equals(island.spawnPoints[0])).length).toBe(1);
    const r = sim.forceSpawn(1, 1)!;
    expect(SPECIES.find((s) => s.id === r.speciesId)!.rarity).toBe(ZONES[0].rarity);
    expect(sim.forceSpawn(99, 0)).toBeNull();
  });

  it('a pad launch reports inWave; entering the shop stall emits shopZone once', () => {
    const sim = new GameSim(new GameState(), { rngSeed: 8 });
    const pad = sim.course.pads[0];
    sim.wave.setTimer(5);
    sim.player.reset(new Vector3((pad.min.x + pad.max.x) / 2, pad.min.y + 0.3, (pad.min.z + pad.max.z) / 2));
    const ev = stepUntil(sim, (e) => e.type === 'padLaunch', 2);
    expect(ev.find((e) => e.type === 'padLaunch')).toEqual({ type: 'padLaunch', padId: pad.id, inWave: true });

    const sz = sim.course.shopZone;
    sim.player.reset(new Vector3((sz.min.x + sz.max.x) / 2, sz.min.y, (sz.min.z + sz.max.z) / 2));
    const ev2: SimEvent[] = [];
    for (let i = 0; i < 60; i++) {
      sim.step(SDT, NO_INPUT);
      ev2.push(...sim.events);
    }
    expect(ev2.filter((e) => e.type === 'shopZone').length).toBe(1);
  });

  it('wave events carry big and number; a Big Wave leaves a rarer creature in the best zone', () => {
    const state = new GameState();
    state.bestZone = 1;
    const sim = new GameSim(state, { rngSeed: 9 });
    sim.player.reset(sim.course.homeSpawn.clone());
    sim.wave.count = 4;
    sim.wave.setTimer(9);
    const ev = stepUntil(sim, (e) => e.type === 'surgeEnd', 60);
    expect(ev.find((e) => e.type === 'waveWarning')).toEqual({ type: 'waveWarning', golden: false, big: true, number: 5 });
    expect(ev.find((e) => e.type === 'surgeStart')).toEqual({ type: 'surgeStart', golden: false, big: true, number: 5 });
    expect(ev.find((e) => e.type === 'surgeEnd')).toEqual(expect.objectContaining({ big: true, number: 5 }));
    const want = ZONES[1].rarity + 1;
    const rare = sim.wild.filter((c) => c.zone === 1 && SPECIES.find((s) => s.id === c.speciesId)!.rarity >= want);
    expect(rare.length).toBeGreaterThanOrEqual(1);
  });

  it('collect reports new species and new mutations', () => {
    const state = new GameState();
    const sim = new GameSim(state, { rngSeed: 3 });
    const w = sim.forceSpawn(1, 0, 'toastopus', 0)!;
    sim.player.reset(w.pos.clone().add(new Vector3(0, 0.1, 0)));
    sim.step(SDT, NO_INPUT);
    expect(sim.events.find((e) => e.type === 'collect')).toEqual(expect.objectContaining({ isNewSpecies: true, isNewMutation: true }));
    const w2 = sim.forceSpawn(1, 0, 'toastopus', 1)!;
    sim.player.reset(w2.pos.clone().add(new Vector3(0, 0.1, 0)));
    sim.step(SDT, NO_INPUT);
    expect(sim.events.find((e) => e.type === 'collect')).toEqual(expect.objectContaining({ isNewSpecies: false, isNewMutation: true }));
  });
});
