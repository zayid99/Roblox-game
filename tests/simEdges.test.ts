// Edge cases of the sim, the player physics and the course (pre-release review).
import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { HOME_FRONT_Z, HOME_TOP, PHYS } from '../src/game/config';
import { generateCourse, GEYSER, geyserStateAt } from '../src/game/course';
import { NO_INPUT, PlayerSim, type PlayerInput } from '../src/game/player';
import { playerOverlaps } from '../src/game/physics';
import { GameSim, type SimEvent } from '../src/game/sim';
import { GameState } from '../src/game/state';

const DT = 1 / 120;

function run(sim: GameSim, sec: number, input: PlayerInput = NO_INPUT): SimEvent[] {
  const out: SimEvent[] = [];
  for (let t = 0; t < sec; t += DT) {
    sim.step(DT, input);
    out.push(...sim.events);
  }
  return out;
}

describe('course checkpoints', () => {
  it('no island checkpoint sits on a launch pad or inside another solid', () => {
    for (const seed of [20261105, 1, 2, 3, 4, 5, 6, 7, 8, 9]) {
      const c = generateCourse(seed);
      for (const isl of c.islands) {
        const cp = isl.checkpoint;
        for (const p of c.pads) {
          const on = cp.x >= p.min.x - PHYS.halfWidth && cp.x <= p.max.x + PHYS.halfWidth && cp.z >= p.min.z - PHYS.halfWidth && cp.z <= p.max.z + PHYS.halfWidth;
          expect(on, `seed ${seed} island ${isl.order}`).toBe(false);
        }
        for (const s of c.solids) {
          if (s === isl.solid) continue;
          expect(playerOverlaps(cp.x, cp.y + 0.01, cp.z, s), `seed ${seed} island ${isl.order} solid ${s.kind}`).toBe(false);
        }
        expect(cp.z).toBeGreaterThan(isl.solid.min.z + 1);
        expect(cp.z).toBeLessThan(isl.solid.max.z - 1);
      }
    }
  });

  it('a sea fall on a lighthouse island respawns there, not up the lighthouse', () => {
    const sim = new GameSim(new GameState(), { rngSeed: 1 });
    for (const lh of sim.course.lighthouses) {
      const isl = sim.course.islands.find((i) => i.zone === lh.zone && i.solid.min.z <= lh.tower.min.z && i.solid.max.z >= lh.tower.max.z)!;
      sim.checkpoint.copy(isl.checkpoint);
      sim.player.reset(new Vector3(isl.solid.max.x + 3, 1, isl.checkpoint.z));
      const ev = run(sim, 2);
      expect(ev.some((e) => e.type === 'respawn' && e.reason === 'sea')).toBe(true);
      expect(ev.some((e) => e.type === 'padLaunch'), `zone ${lh.zone}`).toBe(false);
      expect(sim.player.groundSolid).toBe(isl.solid);
    }
  });
});

describe('wave edge cases', () => {
  it('standing on the front lip of home is safe from the wave', () => {
    const sim = new GameSim(new GameState(), { rngSeed: 2 });
    sim.player.reset(new Vector3(0, HOME_TOP, HOME_FRONT_Z - PHYS.halfWidth + 0.1));
    run(sim, 0.2);
    expect(sim.isOnHome()).toBe(true);
    expect(sim.playerSafe()).toBe(true);
    sim.state.carried = [{ speciesId: 'toastopus', mutation: 0 }];
    sim.state.carried.length = 1;
    sim.wave.forceSurge();
    const ev = run(sim, 40);
    expect(ev.some((e) => e.type === 'splash')).toBe(false);
    const end = ev.find((e) => e.type === 'surgeEnd');
    expect(end && end.type === 'surgeEnd' && end.survived).toBe(true);
  });

  it('falling into the sea right in front of the wave does not escape it', () => {
    const sim = new GameSim(new GameState(), { rngSeed: 3 });
    const gap = sim.course.gaps[3];
    // Last stood on the far island (the checkpoint the respawn would use), fell in mid-gap on the way home.
    sim.checkpoint.copy(gap.to.checkpoint);
    const fallZ = (gap.from.solid.min.z + gap.to.solid.max.z) / 2;
    sim.wave.forceSurge();
    run(sim, DT);
    sim.wave.frontZ = fallZ - 12;
    sim.state.carried = [{ speciesId: 'toastopus', mutation: 0 }];
    sim.player.reset(new Vector3(gap.anchors[0].pos.x, 0.5, fallZ));
    const ev = run(sim, 1.5);
    expect(ev.some((e) => e.type === 'player' && e.event === 'sea')).toBe(true);
    expect(ev.some((e) => e.type === 'splash')).toBe(true);
    expect(sim.state.carried.length).toBe(0);
  });

  it('...nor by respawning on a checkpoint the wall has already swept', () => {
    const sim = new GameSim(new GameState(), { rngSeed: 3 });
    const gap = sim.course.gaps[3];
    sim.checkpoint.copy(gap.to.checkpoint);
    const fallZ = gap.from.solid.min.z - 2; // near the home-side island, far ahead of the front
    sim.wave.forceSurge();
    run(sim, DT);
    sim.wave.frontZ = gap.to.checkpoint.z + 1; // the far island is already swept
    sim.state.carried = [{ speciesId: 'toastopus', mutation: 0 }];
    sim.player.reset(new Vector3(gap.anchors[0].pos.x, 0.5, fallZ));
    const ev = run(sim, 1);
    expect(ev.some((e) => e.type === 'splash')).toBe(true);
    expect(ev.some((e) => e.type === 'respawn' && e.reason === 'sea')).toBe(false);
  });

  it('a sea fall with no wave around still respawns on the checkpoint and keeps the creatures', () => {
    const sim = new GameSim(new GameState(), { rngSeed: 3 });
    const gap = sim.course.gaps[3];
    sim.checkpoint.copy(gap.from.checkpoint);
    sim.state.carried = [{ speciesId: 'toastopus', mutation: 0 }];
    sim.player.reset(new Vector3(gap.anchors[0].pos.x, 0.5, (gap.from.solid.min.z + gap.to.solid.max.z) / 2));
    const ev = run(sim, 1);
    expect(ev.some((e) => e.type === 'respawn' && e.reason === 'sea')).toBe(true);
    expect(sim.state.carried.length).toBe(1);
  });

  it('washes creatures off the course in place (same array, one event per step with washed uids)', () => {
    const sim = new GameSim(new GameState(), { rngSeed: 4 });
    const arr = sim.wild;
    const before = arr.length;
    sim.wave.forceSurge();
    let washed = 0;
    for (let t = 0; t < 30 && sim.wave.phase === 'surge' || t === 0; t += DT) {
      sim.step(DT, NO_INPUT);
      for (const e of sim.events) if (e.type === 'washed') washed += e.uids.length;
      if (sim.events.some((e) => e.type === 'surgeEnd')) break;
    }
    expect(washed).toBe(before);
    expect(new Set(sim.wild.map((c) => c.uid)).size).toBe(sim.wild.length);
    expect(arr.length).toBe(0);
  });
});

describe('player physics edge cases', () => {
  const course = generateCourse();
  const stats = { runSpeed: 10, reach: 30, power: 1 };

  it('a geyser launch ends coyote time: a press after it is the double jump, not a free ground jump', () => {
    const g = course.geysers[0];
    expect(g).toBeDefined();
    const p = new PlayerSim();
    // Stand on the vent just before it erupts.
    let t0 = 0;
    while (geyserStateAt(g, t0) !== 'warning') t0 += 0.05;
    p.time = t0;
    p.reset(g.pos.clone().setY(g.pos.y + 0.01));
    const world = { ...course, anchors: [] };
    let launched = false;
    for (let i = 0; i < 400 && !launched; i++) {
      p.step(DT, NO_INPUT, stats, world);
      launched = p.mode === 'launch';
    }
    expect(launched).toBe(true);
    while (p.mode === 'launch') p.step(DT, NO_INPUT, stats, world);
    p.step(DT, { ...NO_INPUT, jumpPressed: true, jumpHeld: true }, stats, world);
    expect(p.events).toContain('doubleJump');
    expect(p.events).not.toContain('jump');
    expect(GEYSER.radius).toBeGreaterThan(0);
  });
});
