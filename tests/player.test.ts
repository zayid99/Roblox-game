import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { PHYS } from '../src/game/config';
import { generateCourse } from '../src/game/course';
import { PlayerSim, pickAnchor, type PlayerInput } from '../src/game/player';

const course = generateCourse();
const stats = { runSpeed: 10, reach: 9.5, power: 1 };
const DT = 1 / 120;
const idle: PlayerInput = { moveX: 0, moveZ: 0, jumpHeld: false, jumpPressed: false };

function settle(sim: PlayerSim, seconds = 0.5, input = idle) {
  for (let t = 0; t < seconds; t += DT) sim.step(DT, input, stats, course);
}

describe('player movement', () => {
  it('lands and stands on the home island', () => {
    const sim = new PlayerSim();
    sim.reset(new Vector3(0, 8, 10));
    settle(sim, 1);
    expect(sim.mode).toBe('ground');
    expect(sim.pos.y).toBeCloseTo(course.home.max.y, 3);
    expect(sim.groundSolid).toBe(course.home);
  });

  it('runs at run speed and jumps about 2.7 m high', () => {
    const sim = new PlayerSim();
    sim.reset(course.homeSpawn);
    settle(sim, 0.3);
    settle(sim, 0.5, { ...idle, moveX: 1 });
    expect(Math.abs(sim.vel.x - stats.runSpeed)).toBeLessThan(0.01);

    sim.step(DT, { ...idle, jumpPressed: true }, stats, course);
    expect(sim.events).toContain('jump');
    let peak = sim.pos.y;
    for (let t = 0; t < 1.2; t += DT) {
      sim.step(DT, idle, stats, course);
      peak = Math.max(peak, sim.pos.y);
    }
    const expected = (PHYS.jumpVelocity * PHYS.jumpVelocity) / (2 * PHYS.gravity);
    expect(peak - course.home.max.y).toBeGreaterThan(expected - 0.2);
    expect(peak - course.home.max.y).toBeLessThan(expected + 0.2);
    expect(sim.mode).toBe('ground');
  });

  it('cannot walk through a lighthouse tower', () => {
    const lh = course.lighthouses[0];
    const tower = lh.tower;
    const sim = new PlayerSim();
    const z = (tower.min.z + tower.max.z) / 2;
    const fromLeft = tower.min.x - 3 > lh.tower.min.x - 10;
    sim.reset(new Vector3(fromLeft ? tower.min.x - 2 : tower.max.x + 2, tower.min.y, z));
    settle(sim, 1.5, { ...idle, moveX: fromLeft ? 1 : -1 });
    if (fromLeft) expect(sim.pos.x).toBeLessThanOrEqual(tower.min.x - PHYS.halfWidth + 1e-3);
    else expect(sim.pos.x).toBeGreaterThanOrEqual(tower.max.x + PHYS.halfWidth - 1e-3);
  });

  it('falls into the sea off the edge', () => {
    const sim = new PlayerSim();
    sim.reset(new Vector3(0, course.home.max.y, course.home.min.z + 1));
    let sea = false;
    for (let t = 0; t < 4 && !sea; t += DT) {
      sim.step(DT, { ...idle, moveZ: -1 }, stats, course);
      sea = sim.events.includes('sea');
    }
    expect(sea).toBe(true);
  });
});

describe('swinging', () => {
  it('targets the hook ahead and never a locked one', () => {
    const first = course.gaps[0].anchors[0];
    const grip = new Vector3(first.pos.x, first.pos.y - 7, first.pos.z + 3);
    const found = pickAnchor(grip, new Vector3(0, 0, -10), new Vector3(0, 0, -1), course.anchors, 9.5, -1);
    expect(found).toBe(first);
    const locked = course.gaps.find((g) => g.zone === 2)!.anchors[0];
    const nearLocked = new Vector3(locked.pos.x, locked.pos.y - 6, locked.pos.z + 2);
    expect(pickAnchor(nearLocked, new Vector3(0, 0, -10), new Vector3(0, 0, -1), course.anchors, 9.5, -1)).toBeNull();
    expect(pickAnchor(nearLocked, new Vector3(0, 0, -10), new Vector3(0, 0, -1), course.anchors, 12, -1)).toBe(locked);
  });

  it('holding jump off an edge grabs the hook and the rope never stretches', () => {
    const gap = course.gaps[0];
    const sim = new PlayerSim();
    sim.reset(new Vector3(0, course.home.max.y, course.home.min.z + 0.6));
    settle(sim, 0.2);
    sim.step(DT, { moveX: 0, moveZ: -1, jumpHeld: true, jumpPressed: true }, stats, course);
    let grabbed = false;
    let maxStretch = 0;
    for (let t = 0; t < 1.5; t += DT) {
      sim.step(DT, { moveX: 0, moveZ: -1, jumpHeld: true, jumpPressed: false }, stats, course);
      if (sim.events.includes('grab')) grabbed = true;
      if (sim.mode === 'swing' && sim.anchor) {
        const grip = sim.gripPos(new Vector3());
        maxStretch = Math.max(maxStretch, grip.distanceTo(sim.anchor.pos) - sim.ropeLength);
      }
    }
    expect(grabbed).toBe(true);
    expect(sim.anchor ?? gap.anchors[0]).toBe(gap.anchors[0]);
    expect(maxStretch).toBeLessThan(0.05);
  });

  it('letting go flings you forward', () => {
    const sim = new PlayerSim();
    sim.reset(new Vector3(0, course.home.max.y, course.home.min.z + 0.6));
    settle(sim, 0.2);
    const hold = { moveX: 0, moveZ: -1, jumpHeld: true, jumpPressed: false };
    sim.step(DT, { ...hold, jumpPressed: true }, stats, course);
    for (let t = 0; t < 0.9; t += DT) sim.step(DT, hold, stats, course);
    expect(sim.mode).toBe('swing');
    sim.step(DT, { ...hold, jumpHeld: false }, stats, course);
    expect(sim.events).toContain('release');
    expect(sim.mode).toBe('air');
    expect(sim.vel.z).toBeLessThan(-5);
  });

  it('a lighthouse pad throws you on top of the lighthouse', () => {
    const lh = course.lighthouses[0];
    const sim = new PlayerSim();
    const padCenter = new Vector3((lh.pad.min.x + lh.pad.max.x) / 2, lh.pad.min.y + 0.5, (lh.pad.min.z + lh.pad.max.z) / 2);
    sim.reset(padCenter);
    let launched = false;
    for (let t = 0; t < 3; t += DT) {
      sim.step(DT, idle, stats, course);
      if (sim.events.includes('pad')) launched = true;
    }
    expect(launched).toBe(true);
    expect(sim.mode).toBe('ground');
    expect(sim.groundSolid).toBe(lh.platform);
  });
});
