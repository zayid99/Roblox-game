import { describe, expect, it } from 'vitest';
import { HOME_FRONT_Z } from '../src/game/config';
import { GUIDE_UNTIL_ZONE, guideTarget } from '../src/game/guide';
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
    sim.wave.forceSurge();
    expect(sim.wave.phase).not.toBe('calm');
    const t = guideTarget(sim, state)!;
    expect(['home', 'lighthouse']).toContain(t.icon);
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
