import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { COMBO, HOME_FRONT_Z } from '../src/game/config';
import { ComboTracker, tripBonusPct } from '../src/game/combo';
import { NO_INPUT, type PlayerInput } from '../src/game/player';
import { GameSim, type SimEvent } from '../src/game/sim';
import { GameState } from '../src/game/state';

const DT = 1 / 120;

function run(sim: GameSim, seconds: number, input: PlayerInput | ((i: number) => PlayerInput) = NO_INPUT): SimEvent[] {
  const out: SimEvent[] = [];
  const n = Math.round(seconds / DT);
  for (let i = 0; i < n; i++) {
    sim.step(DT, typeof input === 'function' ? input(i) : input);
    out.push(...sim.events);
  }
  return out;
}

describe('ComboTracker', () => {
  it('+1 per grab, +1 extra after a Perfect release', () => {
    const c = new ComboTracker();
    expect(c.grab()).toBe(1);
    c.release('good');
    expect(c.grab()).toBe(2);
    c.release('perfect');
    expect(c.grab()).toBe(4);
    c.release('late');
    expect(c.grab()).toBe(5);
  });

  it('the timer drains only on a course island; timeout keeps the chain for the trip', () => {
    const c = new ComboTracker();
    c.grab();
    c.grab();
    expect(c.update(100, false)).toBe(0);
    expect(c.chain).toBe(2);
    expect(c.update(COMBO.chainTime - 0.1, true)).toBe(0);
    c.release('good'); // refills
    expect(c.timer).toBe(COMBO.chainTime);
    expect(c.update(COMBO.chainTime + 0.01, true)).toBe(2);
    expect(c.chain).toBe(0);
    expect(c.tripBest).toBe(2);
  });

  it('sea and splash lose the chain; home banks it', () => {
    const c = new ComboTracker();
    for (let i = 0; i < 6; i++) c.grab();
    c.end('sea');
    expect(c.tripBest).toBe(0);
    for (let i = 0; i < 3; i++) c.grab();
    c.end('home');
    expect(c.tripBest).toBe(3);
    for (let i = 0; i < 2; i++) c.grab();
    c.end('splash');
    expect(c.tripBest).toBe(3);
    expect(c.consumeTrip()).toBe(3);
    expect(c.tripBest).toBe(0);
  });

  it('chain multiplier and HUD percentage', () => {
    expect(ComboTracker.chainMult(0)).toBe(1);
    expect(ComboTracker.chainMult(1)).toBe(1);
    expect(ComboTracker.chainMult(4)).toBeCloseTo(1.3);
    expect(ComboTracker.chainMult(50)).toBe(2);
    expect(tripBonusPct(1)).toBe(0);
    expect(tripBonusPct(2)).toBe(10);
    expect(tripBonusPct(4)).toBe(30);
  });
});

describe('combo in the sim', () => {
  it('grab emits chain, release is rated, perfectWindow opens on the upswing', () => {
    const sim = new GameSim(new GameState(), { rngSeed: 1 });
    sim.player.reset(new Vector3(0, sim.course.home.max.y, sim.course.home.min.z + 0.6));
    run(sim, 0.2);
    let sawWindow = false;
    let windowAt = -1;
    const events: SimEvent[] = [];
    for (let i = 0; i < 400; i++) {
      sim.step(DT, { moveX: 0, moveZ: -1, jumpHeld: true, jumpPressed: i === 0 });
      events.push(...sim.events);
      if (sim.perfectWindow) {
        sawWindow = true;
        windowAt = i;
        break;
      }
    }
    expect(events.some((e) => e.type === 'chain' && e.count === 1)).toBe(true);
    expect(sawWindow).toBe(true);
    expect(windowAt).toBeGreaterThan(0);
    const vz = sim.player.vel.z;
    sim.step(DT, { moveX: 0, moveZ: 0, jumpHeld: false, jumpPressed: false });
    const rated = sim.events.find((e) => e.type === 'releaseRated');
    expect(rated).toEqual(expect.objectContaining({ quality: 'perfect' }));
    expect(Math.abs(sim.player.vel.z)).toBeGreaterThan(Math.abs(vz));
    expect(sim.perfectWindow).toBe(false);
  });

  it('landing while still attached counts as a good release and refills the timer', () => {
    const sim = new GameSim(new GameState(), { rngSeed: 1 });
    const gap = sim.course.gaps[0];
    const anchor = gap.anchors[0];
    const top = gap.to.solid;
    const p = sim.player;
    p.reset(new Vector3(anchor.pos.x, top.max.y + 0.005, top.max.z - 1));
    p.mode = 'swing';
    p.anchor = anchor;
    p.vel.set(0, -2, -1);
    p.ropeLength = p.gripPos(new Vector3()).distanceTo(anchor.pos) + 0.5;
    sim.combo.grab();
    sim.combo.timer = 1;
    sim.step(DT, { moveX: 0, moveZ: 0, jumpHeld: true, jumpPressed: false });
    expect(p.landedAttached).toBe(true);
    expect(sim.events.some((e) => e.type === 'landed' && e.islandOrder === 1)).toBe(true);
    expect(sim.events.some((e) => e.type === 'releaseRated')).toBe(false);
    expect(sim.combo.timer).toBeCloseTo(COMBO.chainTime, 1);
    expect(p.anchor).toBeNull();
  });

  it('a sea fall ends the chain and respawns 0.6 s later', () => {
    const sim = new GameSim(new GameState(), { rngSeed: 1 });
    sim.combo.grab();
    sim.combo.grab();
    sim.player.reset(new Vector3(0, 3, sim.course.home.min.z - 3));
    const events: SimEvent[] = [];
    for (let i = 0; i < 240 && !events.some((e) => e.type === 'player' && e.event === 'sea'); i++) {
      sim.step(DT, NO_INPUT);
      events.push(...sim.events);
    }
    expect(events).toContainEqual({ type: 'chainEnd', count: 2, reason: 'sea' });
    expect(events.some((e) => e.type === 'respawn')).toBe(false);
    expect(run(sim, 0.55).some((e) => e.type === 'respawn')).toBe(false);
    const later = run(sim, 0.1);
    expect(later).toContainEqual({ type: 'respawn', reason: 'sea' });
  });

  it('delivery pays a chain bonus, and a close call adds 25%', () => {
    const state = new GameState();
    const sim = new GameSim(state, { rngSeed: 1 });
    state.carried = [{ speciesId: 'crab_dj', mutation: 0 }]; // income 3
    for (let i = 0; i < 4; i++) sim.combo.grab();
    sim.player.reset(sim.course.homeSpawn.clone().add(new Vector3(0, 0.5, 0)));
    const events = run(sim, 0.3);
    const d = events.find((e) => e.type === 'deliver');
    expect(d).toBeDefined();
    if (d?.type !== 'deliver') return;
    expect(events).toContainEqual({ type: 'chainEnd', count: 4, reason: 'home' });
    expect(d.tripBest).toBe(4);
    expect(d.chainMult).toBeCloseTo(1.3);
    expect(d.closeCall).toBe(false);
    expect(d.bonusCash).toBeCloseTo(3 * 10 * 1.3);
    expect(sim.combo.tripBest).toBe(0);

    // Close call: the surge is about to reach the home line.
    state.carried = [{ speciesId: 'crab_dj', mutation: 0 }];
    sim.player.reset(new Vector3(0, 30, sim.course.homeSpawn.z));
    sim.wave.forceSurge();
    sim.step(DT, NO_INPUT);
    sim.wave.frontZ = HOME_FRONT_Z - 42 * 2;
    const ev2 = run(sim, 2);
    const d2 = ev2.find((e) => e.type === 'deliver');
    expect(d2?.type === 'deliver' && d2.closeCall).toBe(true);
    if (d2?.type === 'deliver') expect(d2.bonusCash).toBeCloseTo(3 * 10 * 1.25);
    expect(ev2).toContainEqual({ type: 'closeCall', where: 'home' });
  });
});
