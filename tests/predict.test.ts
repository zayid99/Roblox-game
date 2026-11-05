import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { generateCourse } from '../src/game/course';
import { NO_INPUT, PlayerSim, type PlayerInput } from '../src/game/player';
import { inPerfectWindow, predictRelease, rateRelease, releaseQuality } from '../src/game/predict';

const DT = 1 / 120;
const stats = { runSpeed: 10, reach: 9.5, power: 1 };

/** Runs off the home edge, grabs the gap-1 hook and swings for `swingSec`. */
function swingFromHome(course = generateCourse(), swingSec = 0.7) {
  const player = new PlayerSim();
  player.reset(new Vector3(0, course.home.max.y, course.home.min.z + 0.6));
  for (let t = 0; t < 0.2; t += DT) player.step(DT, NO_INPUT, stats, course);
  const hold: PlayerInput = { moveX: 0, moveZ: -1, jumpHeld: true, jumpPressed: false };
  player.step(DT, { ...hold, jumpPressed: true }, stats, course);
  for (let t = 0; t < swingSec; t += DT) player.step(DT, hold, stats, course);
  return { player, course, hold };
}

/** Predicts, then really lets go; returns the max distance between them at equal times (up to 2 s). */
function compareWithReal(player: PlayerSim, course: ReturnType<typeof generateCourse>): { maxErr: number; compared: number } {
  const src = { player, course, state: { stats } };
  const first = predictRelease(src);
  const steps = Math.round(first.t / DT);
  // One sample per sim step: points[i] is the position i steps after the release.
  const points = predictRelease(src, steps + 1).points.map((p) => p.clone());
  player.step(DT, { moveX: 0, moveZ: 0, jumpHeld: false, jumpPressed: false }, stats, course);
  expect(player.events).toContain('release');
  let maxErr = player.pos.distanceTo(points[1]);
  let compared = 1;
  for (let i = 2; i <= Math.min(steps, 240); i++) {
    player.step(DT, NO_INPUT, stats, course);
    maxErr = Math.max(maxErr, player.pos.distanceTo(points[i]));
    compared++;
    if (player.mode === 'ground' || player.events.includes('sea')) break;
  }
  return { maxErr, compared };
}

describe('predictRelease', () => {
  it('matches the real release within 0.05 m (1/120 steps)', () => {
    const { player, course } = swingFromHome();
    expect(player.mode).toBe('swing');
    const { maxErr, compared } = compareWithReal(player, course);
    expect(compared).toBeGreaterThan(30);
    expect(maxErr).toBeLessThan(0.05);
  });

  it('first contact names the island it lands on', () => {
    const course = generateCourse();
    // Swing long enough that a release flies forward onto island 1.
    let found = false;
    for (let s = 0.4; s < 1.6 && !found; s += 0.05) {
      const { player } = swingFromHome(course, s);
      if (player.mode !== 'swing') continue;
      const pred = predictRelease({ player, course, state: { stats } });
      if (pred.landsOn === course.islands[0].solid) {
        found = true;
        expect(pred.points.length).toBe(20);
        expect(pred.t).toBeGreaterThan(0.2);
        expect(pred.t).toBeLessThan(3);
        // Last point is on the island top.
        expect(pred.points[19].y).toBeCloseTo(course.islands[0].solid.max.y, 1);
      }
    }
    expect(found).toBe(true);
  });

  it('follows a drifting hook while swinging', () => {
    const course = generateCourse();
    const a = course.gaps[0].anchors[0];
    a.drift = { baseX: a.pos.x, amp: 2.5, period: 4, phase: 0.3 };
    // Hold the swing for different times; the prediction must match the real flight each time.
    for (const s of [0.5, 0.8]) {
      const { player } = swingFromHome(course, s);
      if (player.mode !== 'swing') continue;
      const { maxErr, compared } = compareWithReal(player, course);
      expect(compared).toBeGreaterThan(30);
      expect(maxErr).toBeLessThan(0.05);
    }
  });

  it('does not change the real player', () => {
    const { player, course } = swingFromHome();
    const pos = player.pos.clone();
    const vel = player.vel.clone();
    predictRelease({ player, course, state: { stats } });
    expect(player.pos.equals(pos)).toBe(true);
    expect(player.vel.equals(vel)).toBe(true);
    expect(player.mode).toBe('swing');
  });
});

describe('release quality', () => {
  it('rates by angle and vertical speed', () => {
    expect(rateRelease(40, 3)).toBe('perfect');
    expect(rateRelease(28, 1)).toBe('perfect');
    expect(rateRelease(58, 1)).toBe('perfect');
    expect(rateRelease(20, 1)).toBe('good');
    expect(rateRelease(70, 1)).toBe('good');
    expect(rateRelease(5, 3)).toBe('early');
    expect(rateRelease(-20, 3)).toBe('early');
    expect(rateRelease(85, 3)).toBe('late');
    expect(rateRelease(40, -1)).toBe('late');
    expect(inPerfectWindow(40, 1)).toBe(true);
    expect(inPerfectWindow(40, -1)).toBe(false);
  });

  it('swingAngle is positive past the anchor going forward', () => {
    const { player } = swingFromHome(generateCourse(), 0.9);
    const fwd = player.swingForward(new Vector3());
    expect(fwd.z).toBeLessThan(-0.9);
    const theta = player.swingAngle(fwd);
    const anchor = player.anchorPos(new Vector3())!;
    expect(Math.sign(theta)).toBe(player.pos.z < anchor.z ? 1 : -1);
    expect(['perfect', 'good', 'early', 'late']).toContain(releaseQuality(player, fwd));
  });

  it('records lastRelease before the boost; forceRelease records nothing', () => {
    const { player, course } = swingFromHome(generateCourse(), 0.8);
    const velBefore = player.vel.clone();
    const ghost = new PlayerSim();
    ghost.copyFrom(player);
    ghost.forceRelease(stats);
    expect(ghost.lastRelease).toBeNull();
    expect(ghost.events).not.toContain('release');
    player.step(DT, NO_INPUT, stats, course);
    expect(player.lastRelease).not.toBeNull();
    expect(player.lastRelease!.anchorId).toBe(course.gaps[0].anchors[0].id);
    // Recorded velocity is pre-boost (roughly the swing velocity, not ×1.1 + lift).
    expect(player.lastRelease!.vel.z).toBeCloseTo(velBefore.z, 0);
    expect(Math.abs(player.vel.z)).toBeGreaterThan(Math.abs(player.lastRelease!.vel.z));
  });
});
