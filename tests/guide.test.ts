import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { HOME_FRONT_Z, WAVE } from '../src/game/config';
import { chooseSafeTarget, GUIDE_UNTIL_ZONE, GUIDE_WAVE_SECONDS, guideTarget } from '../src/game/guide';
import { ManualClock } from '../src/game/clock';
import { Progression } from '../src/game/progression';
import { GameSim } from '../src/game/sim';
import { GameState } from '../src/game/state';
import { ZONES } from '../src/game/zones';

function setup() {
  const state = new GameState();
  state.ftue.done = true;
  const sim = new GameSim(state, { rngSeed: 3 });
  return { state, sim };
}

/** Puts the player on the first course island, standing on the ground. */
function onFirstIsland(sim: GameSim): void {
  const isl = sim.course.islands.find((i) => i.order === 1)!;
  sim.player.pos.set((isl.solid.min.x + isl.solid.max.x) / 2, isl.solid.max.y, (isl.solid.min.z + isl.solid.max.z) / 2);
  sim.player.mode = 'ground';
}

describe('post-tutorial guide arrow', () => {
  it('stays off during the tutorial', () => {
    const { state, sim } = setup();
    state.ftue.done = false;
    expect(guideTarget(sim, state)).toBeNull();
  });

  it('points a new player at the nearest creature their rope can reach', () => {
    const { state, sim } = setup();
    sim.player.mode = 'ground'; // standing at home
    expect(sim.wild.length).toBeGreaterThan(0);
    const t = guideTarget(sim, state)!;
    expect(t.icon).toBe('creature');
    const target = sim.wild.find((c) => c.pos.distanceTo(t.pos) < 1e-6)!;
    expect(target).toBeDefined();
    expect(ZONES[target.zone].minReach).toBeLessThanOrEqual(state.stats.reach + 1e-6);
    expect(t.label).toMatch(/^Catch \d+ m$/);
  });

  it('points home when the hands are full', () => {
    const { state, sim } = setup();
    onFirstIsland(sim);
    while (state.carried.length < state.carryCapacity) state.carried.push({ speciesId: 'toastopus', mutation: 0 });
    const t = guideTarget(sim, state)!;
    expect(t.icon).toBe('home');
  });

  it('points at safety when a wave is coming and the player is out on the course', () => {
    const { state, sim } = setup();
    onFirstIsland(sim);
    sim.wave.track(sim.player.pos.z, WAVE.warningEarly);
    sim.wave.forceSurge();
    expect(sim.wave.phase).not.toBe('calm');
    const t = guideTarget(sim, state)!;
    expect(['home', 'lighthouse']).toContain(t.icon);
  });

  it('keeps pointing at creatures while the wave is still more than 10 s away', () => {
    const { state, sim } = setup();
    onFirstIsland(sim);
    sim.wave.track(sim.player.pos.z, WAVE.warningLate);
    sim.wave.setTimer(WAVE.warningLate - 0.1);
    sim.wave.update(0.01);
    expect(sim.wave.phase).toBe('warning');
    expect(sim.wave.timeUntilReaches(sim.player.pos.z)).toBeGreaterThan(GUIDE_WAVE_SECONDS);
    expect(guideTarget(sim, state)!.icon).toBe('creature');
    sim.wave.setTimer(GUIDE_WAVE_SECONDS - 4);
    expect(sim.wave.timeUntilReaches(sim.player.pos.z)).toBeLessThanOrEqual(GUIDE_WAVE_SECONDS);
    expect(['home', 'lighthouse']).toContain(guideTarget(sim, state)!.icon);
  });

  it('sticks with its safe spot unless another is at least 1 s quicker (no Home/Pad flicker)', () => {
    const { sim } = setup();
    const lh = sim.course.lighthouses[0];
    const padZ = (lh.pad.min.z + lh.pad.max.z) / 2;
    const padX = (lh.pad.min.x + lh.pad.max.x) / 2;
    const speed = 10;
    const at = new Vector3();
    // Find a spot on the straight line home where home and the pad are about as quick.
    let z = HOME_FRONT_Z;
    while (z > padZ && Math.abs(HOME_FRONT_Z + 2 - z - Math.hypot(padX, padZ - z)) > 1) z -= 0.25;
    sim.player.pos.set(0, 4, z);
    const first = chooseSafeTarget(sim, speed, null, at);
    // Wobble around that spot: the choice must not flip back and forth.
    const picks = new Set<number>();
    let key: number | null = first.key;
    for (let i = 0; i < 40; i++) {
      sim.player.pos.set(Math.sin(i) * 0.6, 4, z + Math.cos(i * 1.7) * 0.6);
      key = chooseSafeTarget(sim, speed, key, at).key;
      picks.add(key);
    }
    expect(picks.size).toBe(1);
    // Far quicker elsewhere: it does switch.
    sim.player.pos.set(padX, 4, padZ + 3);
    expect(chooseSafeTarget(sim, speed, -1, at).icon).toBe('lighthouse');
    sim.player.pos.set(0, 4, HOME_FRONT_Z - 3);
    expect(chooseSafeTarget(sim, speed, lh.id, at).icon).toBe('home');
  });

  it('stays quiet while the player is already safe at home during a wave', () => {
    const { state, sim } = setup();
    sim.player.pos.set(sim.course.homeSpawn.x, sim.course.homeSpawn.y, HOME_FRONT_Z + 6);
    sim.wave.forceSurge();
    expect(guideTarget(sim, state)).toBeNull();
  });

  it('stops pointing at creatures once the player has reached Lagoon', () => {
    const { state, sim } = setup();
    state.bestZone = GUIDE_UNTIL_ZONE;
    expect(guideTarget(sim, state)).toBeNull();
  });

  it('hides while the player is in the air', () => {
    const { state, sim } = setup();
    sim.player.mode = 'air';
    expect(guideTarget(sim, state)).toBeNull();
  });
});

describe('next-zone goal in the tracker', () => {
  it('shows the next locked zone and its remaining Rope Reach cost', () => {
    const state = new GameState();
    state.ftue.done = true;
    state.levels.reach = 1;
    const p = new Progression(state, new ManualClock(Date.now()));
    const g = p.nextZoneGoal()!;
    expect(g.text).toMatch(/^Unlock Lagoon: \$/);
    expect(g.progress).toBe(0);
    state.cash = 1e9;
    const ready = p.nextZoneGoal()!;
    expect(ready.progress).toBe(1);
    expect(ready.text).toBe('Buy Rope Reach to unlock Lagoon');
  });

  it('disappears once every zone is open', () => {
    const state = new GameState();
    state.levels.reach = 99;
    const p = new Progression(state, new ManualClock(Date.now()));
    expect(p.nextZoneGoal()).toBeNull();
  });
});
