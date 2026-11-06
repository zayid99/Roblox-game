import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { CRUMBLE, SPRING, anchorPosAt, generateCourse, type Course, type Gap, type Stone } from '../src/game/course';
import { UPGRADES } from '../src/game/economy';
import { PlayerSim, type PlayerInput, type PlayerStats } from '../src/game/player';
import { GameSim, type SimEvent } from '../src/game/sim';
import { GameState } from '../src/game/state';
import { ZONES } from '../src/game/zones';
import { POLICIES, crossable } from './bot';

const course = generateCourse();
const NONE: PlayerInput = { moveX: 0, moveZ: 0, jumpHeld: false, jumpPressed: false };

function gateLevel(zone: number): number {
  const need = ZONES[zone].minReach;
  for (let l = 0; l <= UPGRADES.reach.maxLevel; l++) if (UPGRADES.reach.value(l) + 1e-6 >= need) return l;
  throw new Error('gate above max reach');
}

function gateStats(zone: number): PlayerStats {
  return { runSpeed: UPGRADES.speed.value(zone), reach: UPGRADES.reach.value(gateLevel(zone)), power: UPGRADES.power.value(0) };
}

describe('new obstacles are deterministic', () => {
  it('generates the same swaying hooks, springs and stones for a seed', () => {
    const again = generateCourse();
    const sway = (c: Course) => c.anchors.filter((a) => a.sway).map((a) => [a.id, a.sway!.pivot.toArray(), a.sway!.phase]);
    expect(sway(again)).toEqual(sway(course));
    expect(again.springs.map((s) => s.pos.toArray())).toEqual(course.springs.map((s) => s.pos.toArray()));
    expect(again.stones.map((s) => [s.solid.min.toArray(), s.solid.max.toArray()])).toEqual(course.stones.map((s) => [s.solid.min.toArray(), s.solid.max.toArray()]));
    const other = generateCourse(7);
    expect(other.springs.map((s) => s.pos.toArray())).not.toEqual(course.springs.map((s) => s.pos.toArray()));
  });
});

describe('Swaying hooks', () => {
  const swaying = course.anchors.filter((a) => a.sway);

  it('one per zone from the Lagoon on, never on a drifting hook', () => {
    expect(swaying.map((a) => a.zone)).toEqual([2, 3, 4, 5, 6]);
    for (const a of swaying) expect(a.drift).toBeUndefined();
  });

  it('swings back and forth along the course from its pivot', () => {
    const a = swaying[0];
    const w = a.sway!;
    const p = new Vector3();
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let t = 0; t < w.period; t += 0.01) {
      anchorPosAt(a, t, p);
      expect(p.x).toBeCloseTo(w.pivot.x, 6);
      expect(p.distanceTo(w.pivot)).toBeCloseTo(w.length, 6);
      minZ = Math.min(minZ, p.z);
      maxZ = Math.max(maxZ, p.z);
    }
    expect(maxZ - minZ).toBeGreaterThan(4);
    expect(anchorPosAt(a, 1.234, new Vector3()).distanceTo(anchorPosAt(a, 1.234 + w.period, new Vector3()))).toBeLessThan(1e-9);
  });

  it('the sim moves the hook, and a rope on it follows the hook', () => {
    const sim = new GameSim(new GameState(), { rngSeed: 3 });
    const a = sim.course.anchors.find((x) => x.sway)!;
    const z0 = a.pos.z;
    let moved = 0;
    for (let i = 0; i < 120; i++) {
      sim.step(1 / 60, NONE);
      moved = Math.max(moved, Math.abs(a.pos.z - z0));
    }
    expect(moved).toBeGreaterThan(0.5);
    const expected = anchorPosAt(a, sim.time, new Vector3());
    expect(a.pos.distanceTo(expected)).toBeLessThan(1e-9);
  });

  it('is crossable at every phase with the zone-gate rope', () => {
    for (const a of swaying) {
      const gap = course.gaps.find((g) => g.anchors.includes(a))!;
      for (let k = 0; k < 8; k++) {
        const startTime = (k / 8) * a.sway!.period;
        expect(crossable(course, gap, gateStats(gap.zone), { startTime }), `zone ${gap.zone} phase ${k}/8`).not.toBeNull();
      }
    }
  });

  it('is always within grab reach of the take-off edge at some phase of every cycle', () => {
    for (const a of swaying) {
      const gap = course.gaps.find((g) => g.anchors.includes(a))!;
      const edge = new Vector3((gap.from.solid.min.x + gap.from.solid.max.x) / 2, gap.from.solid.max.y + 2.1 + 2, gap.from.solid.min.z);
      let best = Infinity;
      const p = new Vector3();
      for (let t = 0; t < a.sway!.period; t += 0.05) best = Math.min(best, anchorPosAt(a, t, p).distanceTo(edge));
      expect(best).toBeLessThan(gateStats(gap.zone).reach);
    }
  });
});

describe('Spring coral', () => {
  it('one pad on every island from the Coral Reef on (not lighthouse islands), on the island top and clear of creatures', () => {
    const hasLighthouse = (i: (typeof course.islands)[number]) => course.lighthouses.some((l) => l.tower.min.z >= i.solid.min.z && l.tower.max.z <= i.solid.max.z);
    const islands = course.islands.filter((i) => i.zone >= 1 && !hasLighthouse(i));
    expect(course.springs.length).toBe(islands.length);
    for (const sp of course.springs) {
      const isl = course.islands.find((i) => sp.pos.x > i.solid.min.x && sp.pos.x < i.solid.max.x && sp.pos.z > i.solid.min.z && sp.pos.z < i.solid.max.z)!;
      expect(isl).toBeDefined();
      expect(isl.zone).toBe(sp.zone);
      expect(sp.pos.y).toBe(isl.solid.max.y);
      expect(sp.pos.x - sp.radius).toBeGreaterThan(isl.solid.min.x);
      expect(sp.pos.x + sp.radius).toBeLessThan(isl.solid.max.x);
      for (const p of isl.spawnPoints) expect(Math.hypot(p.x - sp.pos.x, p.z - sp.pos.z)).toBeGreaterThan(2.2);
    }
  });

  it('walking onto a pad launches you high and emits spring; you land back on the island', () => {
    const sim = new GameSim(new GameState(), { rngSeed: 5 });
    const sp = sim.course.springs[0];
    sim.player.reset(new Vector3(sp.pos.x, sp.pos.y + 0.5, sp.pos.z + sp.radius + 1.2));
    const events: SimEvent[] = [];
    let peak = 0;
    const walk: PlayerInput = { moveX: 0, moveZ: -0.2, jumpHeld: false, jumpPressed: false };
    let sprung = false;
    for (let i = 0; i < 300; i++) {
      sim.step(1 / 120, sprung ? NONE : walk);
      if (sim.events.some((e) => e.type === 'spring')) sprung = true;
      events.push(...sim.events);
      peak = Math.max(peak, sim.player.pos.y - sp.pos.y);
    }
    expect(events).toContainEqual({ type: 'spring', springId: sp.id });
    expect(peak).toBeGreaterThan(6);
    expect(peak).toBeLessThan((SPRING.launchVel * SPRING.launchVel) / (2 * 34) + 0.2);
    expect(events.some((e) => e.type === 'respawn')).toBe(false);
  });
});

/** Stands on a stone, jumps, double jumps, grabs the gap's last hook and swings for the far island. */
function crossFromStone(c: Course, gap: Gap, stone: Stone, stats: PlayerStats, releasePitch: number, doubleAt: number): boolean {
  const sim = new PlayerSim();
  const s = stone.solid;
  sim.reset(new Vector3((s.min.x + s.max.x) / 2, s.max.y + 0.2, (s.min.z + s.max.z) / 2));
  const to = gap.to.solid;
  const target = new Vector3((to.min.x + to.max.x) / 2, to.max.y, (to.min.z + to.max.z) / 2);
  const input: PlayerInput = { moveX: 0, moveZ: 0, jumpHeld: false, jumpPressed: false };
  let phase: 'settle' | 'jump' | 'swing' | 'fly' = 'settle';
  let t = 0;
  let jumpT = 0;
  let landedAt = -1;
  let leftAt = -1;
  for (; t < 12; t += 1 / 120) {
    const dx = target.x - sim.pos.x;
    const dz = target.z - sim.pos.z;
    const dl = Math.hypot(dx, dz) || 1;
    input.jumpPressed = false;
    input.moveX = phase === 'settle' ? 0 : dx / dl;
    input.moveZ = phase === 'settle' ? 0 : dz / dl;
    if (phase === 'settle') {
      if (sim.mode === 'ground') {
        landedAt = t;
        phase = 'jump';
        input.jumpPressed = true;
        input.jumpHeld = true;
        jumpT = 0;
      }
    } else if (phase === 'jump') {
      jumpT += 1 / 120;
      input.jumpHeld = true;
      if (Math.abs(jumpT - doubleAt) < 1 / 240) input.jumpPressed = true;
      if (sim.mode === 'swing') phase = 'swing';
    } else if (phase === 'swing') {
      input.jumpHeld = true;
      const hs = Math.hypot(sim.vel.x, sim.vel.z);
      const pitch = (Math.atan2(sim.vel.y, hs) * 180) / Math.PI;
      if (sim.anchor && sim.pos.z < sim.anchor.pos.z && sim.vel.z < 0 && sim.vel.y > 0 && pitch >= releasePitch) {
        input.jumpHeld = false;
        phase = 'fly';
      }
    } else input.jumpHeld = false;
    sim.step(1 / 120, input, stats, c);
    if (leftAt < 0 && landedAt >= 0 && sim.mode !== 'ground') leftAt = t;
    if (sim.events.includes('sea')) return false;
    if (phase !== 'settle' && sim.mode === 'ground' && sim.groundSolid === to) return leftAt - landedAt < CRUMBLE.shake;
  }
  return false;
}

describe('Crumble stones', () => {
  it('one stone in every gap of Stormy Seas, Kraken Deep and Volcano Bay, apart from the buoys', () => {
    const gaps = course.gaps.filter((g) => g.zone >= 3 && g.zone <= 5);
    expect(course.stones.length).toBe(gaps.length);
    for (const st of course.stones) {
      expect(course.solids).toContain(st.solid);
      expect(st.solid.kind).toBe('stone');
      expect(st.solid.max.y).toBe(CRUMBLE.top);
      const cx = (st.solid.min.x + st.solid.max.x) / 2;
      const cz = (st.solid.min.z + st.solid.max.z) / 2;
      for (const b of course.buoys) expect(Math.hypot(b.pos.x - cx, b.pos.z - cz)).toBeGreaterThan(b.radius + CRUMBLE.size / 2);
    }
  });

  it('holds you, shakes, sinks under you, then comes back', () => {
    const sim = new GameSim(new GameState(), { rngSeed: 9 });
    const st = sim.course.stones[0];
    const s = st.solid;
    sim.player.reset(new Vector3((s.min.x + s.max.x) / 2, s.max.y + 0.3, (s.min.z + s.max.z) / 2));
    const events: SimEvent[] = [];
    for (let i = 0; i < 60; i++) {
      sim.step(1 / 120, NONE);
      events.push(...sim.events);
    }
    expect(sim.player.mode).toBe('ground');
    expect(sim.stoneState(st.id).phase).toBe('shaking');
    expect(events).toContainEqual({ type: 'crumble', stoneId: st.id, phase: 'shake' });
    for (let i = 0; i < 180; i++) {
      sim.step(1 / 120, NONE);
      events.push(...sim.events);
    }
    expect(events).toContainEqual({ type: 'crumble', stoneId: st.id, phase: 'sink' });
    expect(s.off).toBe(true);
    expect(events.some((e) => e.type === 'player' && e.event === 'sea')).toBe(true);
    for (let i = 0; i < 120 * (CRUMBLE.sunk + CRUMBLE.rise + 3); i++) sim.step(1 / 120, NONE);
    expect(s.off).toBe(false);
    expect(sim.stoneState(st.id).phase).toBe('solid');
  });

  it('from every stone you can jump to the next hook and swing to the far island before it sinks', () => {
    for (const st of course.stones) {
      const gap = course.gaps.find((g) => g.zone === st.zone && st.solid.max.z < g.from.solid.min.z && st.solid.min.z > g.to.solid.max.z)!;
      const stats = gateStats(gap.zone);
      let ok = false;
      for (const p of POLICIES) {
        for (const doubleAt of [0.25, 0.4]) {
          if (crossFromStone(course, gap, st, stats, p.releasePitch, doubleAt)) ok = true;
          if (ok) break;
        }
        if (ok) break;
      }
      expect(ok, `stone in zone ${st.zone}`).toBe(true);
    }
  });
});
