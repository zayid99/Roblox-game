// Fairness checks for the wave, the swing physics and the island hazards (QA report r5).
import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { COMBO, HOME_FRONT_Z, PHYS, WAVE } from '../src/game/config';
import { generateCourse, GEYSER, GEYSER_CLEAR, geyserStateAt, runLine, SPRING, type Gap, type Island } from '../src/game/course';
import { UPGRADES, reachGateLevel } from '../src/game/economy';
import { PlayerSim, type PlayerInput, type PlayerStats } from '../src/game/player';
import { moveAndCollide, type SweepResult } from '../src/game/physics';
import { predictRelease } from '../src/game/predict';
import { crossLeg, POLICIES, type BotPolicy } from './bot';

const course = generateCourse();
/** Speed / Power levels a typical player owns when each zone opens (tests/pacingSim.ts, as measured in QA r5). */
const TYPICAL = [[0, 0], [2, 2], [6, 5], [10, 8], [12, 10], [13, 11], [15, 12]];
const typical = (zone: number): PlayerStats => ({
  runSpeed: UPGRADES.speed.value(TYPICAL[zone][0]),
  reach: UPGRADES.reach.value(reachGateLevel(zone)),
  power: UPGRADES.power.value(TYPICAL[zone][1]),
});
const DT = 1 / 120;
const phasesOf = (gap: Gap) => (gap.anchors.some((a) => a.drift || a.sway) ? [0, 1.8] : [0]);

interface LegStats {
  rate: number;
  sea: number;
  best: number;
  landZ: number;
}

function legStats(gap: Gap, homeward: boolean, stats: PlayerStats): LegStats {
  let ok = 0;
  let sea = 0;
  let n = 0;
  let best = Infinity;
  let landZ = NaN;
  for (const startTime of phasesOf(gap)) {
    for (const p of POLICIES) {
      const r = crossLeg(course, gap, homeward, stats, p, { perfectBoost: true, startTime });
      n++;
      if (r.ok) {
        ok++;
        if (r.t < best) {
          best = r.t;
          landZ = r.landZ;
        }
      } else if (r.fail === 'sea') sea++;
    }
  }
  return { rate: ok / n, sea: sea / n, best, landZ };
}

describe('crossing at typical upgrade levels (upgrades must not make gaps harder)', () => {
  for (const [gi, gap] of course.gaps.entries()) {
    if (gap.zone < 3) continue;
    it(`gap ${gi} (zone ${gap.zone}): most release timings land, few end in the sea`, () => {
      const s = legStats(gap, false, typical(gap.zone));
      expect(s.rate).toBeGreaterThanOrEqual(0.75);
      expect(s.sea).toBeLessThanOrEqual(0.25);
    });
  }

  it('the early islands still catch a fast player heading home (no overshoot at Stormy-level Speed and Power)', () => {
    const st = typical(3);
    for (const gap of course.gaps.filter((g) => g.zone < 3)) {
      const s = legStats(gap, true, st);
      expect(s.rate, `gap to island ${gap.from.order}`).toBeGreaterThanOrEqual(0.7);
    }
  });

  it('air control only pushes up to PHYS.airMaxSpeed, whatever the Run Speed', () => {
    const p = new PlayerSim();
    p.reset(new Vector3(0, 50, 0));
    const fast: PlayerStats = { runSpeed: 21, reach: 10, power: 1 };
    for (let t = 0; t < 1.5; t += DT) p.step(DT, { moveX: 0, moveZ: -1, jumpHeld: false, jumpPressed: false }, fast, { solids: [], anchors: [], pads: [] });
    expect(Math.hypot(p.vel.x, p.vel.z)).toBeCloseTo(PHYS.airMaxSpeed, 3);
  });
});

describe('wave escape: from every island there is time to reach home or a lighthouse', () => {
  const lhIsland = course.lighthouses.map((lh) => course.islands.find((i) => lh.tower.min.z >= i.solid.min.z && lh.tower.max.z <= i.solid.max.z)!);
  const gapTo = (isl: Island) => course.gaps.find((g) => g.to === isl)!;
  const warningFor = (zone: number) => (zone < 3 ? WAVE.warningEarly : zone < 5 ? WAVE.warning : WAVE.warningLate);

  for (const isl of course.islands) {
    it(`island ${isl.order} (zone ${isl.zone})`, () => {
      const st = typical(isl.zone);
      const legs = new Map<string, LegStats>();
      const leg = (gap: Gap, homeward: boolean) => {
        const key = `${course.gaps.indexOf(gap)}:${homeward}`;
        if (!legs.has(key)) legs.set(key, legStats(gap, homeward, st));
        return legs.get(key)!;
      };
      const run = (a: number, b: number) => Math.abs(a - b) / st.runSpeed;
      const cz = (isl.solid.min.z + isl.solid.max.z) / 2;
      // The surge rises WAVE.lead beyond the player standing here at the horn (it only moves farther out after).
      const startZ = cz - WAVE.lead;
      const avail = (z: number) => warningFor(isl.zone) + (z - startZ) / WAVE.bigSpeed;
      /** Seconds and success odds of walking + swinging from this island's centre to island `to` (either way). */
      const route = (to: Island): { t: number; p: number; z: number } => {
        let t = 0;
        let p = 1;
        let z = cz;
        let at = isl;
        while (at !== to) {
          const home = to.order < at.order;
          const gap = home ? gapTo(at) : course.gaps.find((g) => g.from === at)!;
          const edgeZ = home ? at.solid.max.z - 5 : at.solid.min.z + 5;
          t += run(z, home ? Math.max(z, edgeZ) : Math.min(z, edgeZ));
          const l = leg(gap, home);
          t += l.best;
          p *= l.rate;
          z = Number.isFinite(l.landZ) ? l.landZ : (gap.from.solid.min.z + gap.from.solid.max.z) / 2;
          at = home ? gap.from : gap.to;
        }
        return { t, p, z };
      };
      const options: string[] = [];
      let bestSlack = -Infinity;
      // Home.
      const h = route(course.homeIsland);
      const homeSlack = avail(HOME_FRONT_Z) - h.t;
      options.push(`home need ${h.t.toFixed(1)}s of ${avail(HOME_FRONT_Z).toFixed(1)}s p=${h.p.toFixed(2)}`);
      if (h.p >= 0.5) bestSlack = Math.max(bestSlack, homeSlack);
      // This zone's lighthouse and the one before (both within the player's reach).
      for (const lz of [isl.zone, isl.zone - 1]) {
        if (lz < 0) continue;
        const lh = course.lighthouses[lz];
        const r = route(lhIsland[lz]);
        const pad = lh.pad;
        const ix = (lhIsland[lz].solid.min.x + lhIsland[lz].solid.max.x) / 2;
        const t = r.t + Math.hypot(r.z - (pad.min.z + pad.max.z) / 2, ix - (pad.min.x + pad.max.x) / 2) / st.runSpeed + PHYS.padFlightTime;
        const a = avail(lh.platform.min.z);
        options.push(`LH${lz} need ${t.toFixed(1)}s of ${a.toFixed(1)}s p=${r.p.toFixed(2)}`);
        if (r.p >= 0.5) bestSlack = Math.max(bestSlack, a - t);
      }
      // A safe spot whose route mostly works, with at least 3 s to spare (a stumble, a slow start).
      expect(bestSlack, options.join(' | ')).toBeGreaterThanOrEqual(3);
    });
  }
});

describe('ledge grab', () => {
  const island = { id: 1, kind: 'island' as const, zone: 0, min: new Vector3(-5, -4, -20), max: new Vector3(5, 4, -10) };
  const out: SweepResult = { hitX: false, hitZ: false, hitY: 'none', floor: null, stepped: false };

  it('feet within PHYS.ledgeStep below the top step up onto it; deeper, the wall stops you', () => {
    const pos = new Vector3(0, 4 - 0.7, -9.5);
    moveAndCollide(pos, 0, -0.01, -0.3, [island], out, PHYS.ledgeStep);
    expect(out.stepped).toBe(true);
    expect(out.hitY).toBe('floor');
    expect(pos.y).toBeCloseTo(4, 3);
    const low = new Vector3(0, 4 - 1.0, -9.5);
    moveAndCollide(low, 0, -0.01, -0.3, [island], out, PHYS.ledgeStep);
    expect(out.stepped).toBe(false);
    expect(out.hitZ).toBe(true);
    // Without a step height (plain collision) the wall always stops you.
    const off = new Vector3(0, 4 - 0.3, -9.5);
    moveAndCollide(off, 0, -0.01, -0.3, [island], out, 0);
    expect(out.hitZ).toBe(true);
  });

  it('a swing that comes up just short of the lip lands on the island; a plain jump does not get the help', () => {
    const anchor = { id: 7, zone: 0, minReach: 0, pos: new Vector3(0, 12, -6) };
    const world = { solids: [island], anchors: [anchor], pads: [] };
    const stats: PlayerStats = { runSpeed: 10, reach: 12, power: 1 };
    for (const swung of [true, false]) {
      const p = new PlayerSim();
      p.reset(new Vector3(0, 6, -4));
      if (swung) {
        p.step(DT, { moveX: 0, moveZ: -1, jumpHeld: true, jumpPressed: true }, stats, world);
        expect(p.mode).toBe('swing');
        p.step(DT, { moveX: 0, moveZ: 0, jumpHeld: false, jumpPressed: false }, stats, world);
      }
      // Flying at the island's face with the feet half a metre below its top.
      p.pos.set(0, 3.5, -9.2);
      p.vel.set(0, -1, -6);
      p.mode = 'air';
      let landed = false;
      for (let t = 0; t < 1.5 && !landed; t += DT) {
        p.step(DT, { moveX: 0, moveZ: -1, jumpHeld: false, jumpPressed: false }, stats, world);
        landed = (p.mode as string) === 'ground';
      }
      expect(landed, swung ? 'after a swing' : 'plain jump').toBe(swung);
    }
  });
});

describe('island hazards do not throw you into the sea', () => {
  const near = (isl: Island, x: number, z: number) => isl.solid.min.x <= x && x <= isl.solid.max.x && isl.solid.min.z <= z && z <= isl.solid.max.z;

  it('geyser vents sit off the running line, away from creatures and the lighthouse pad', () => {
    expect(course.geysers.length).toBeGreaterThan(0);
    for (const g of course.geysers) {
      const isl = course.islands.find((i) => near(i, g.pos.x, g.pos.z))!;
      const l = runLine(isl, course.gaps);
      const vx = l.bx - l.ax;
      const vz = l.bz - l.az;
      const t = Math.max(0, Math.min(1, ((g.pos.x - l.ax) * vx + (g.pos.z - l.az) * vz) / (vx * vx + vz * vz)));
      // The vent (radius 1.5) never overlaps a player on the running line, with room to spare.
      expect(Math.hypot(l.ax + vx * t - g.pos.x, l.az + vz * t - g.pos.z)).toBeGreaterThan(GEYSER.radius + PHYS.halfWidth + 0.5);
      for (const p of isl.spawnPoints) expect(Math.hypot(p.x - g.pos.x, p.z - g.pos.z)).toBeGreaterThan(GEYSER_CLEAR.spawn * 0.9);
      for (const pad of course.pads) expect(Math.hypot((pad.min.x + pad.max.x) / 2 - g.pos.x, (pad.min.z + pad.max.z) / 2 - g.pos.z)).toBeGreaterThan(GEYSER_CLEAR.pad * 0.9);
    }
  });

  it('caught by an eruption at full run, whatever you do with the stick, you come down on the same island', () => {
    for (const g of course.geysers) {
      const isl = course.islands.find((i) => near(i, g.pos.x, g.pos.z))!;
      const st = typical(g.zone);
      let te = 0;
      while (geyserStateAt(g, te) !== 'erupting') te += 0.05;
      for (const [mx, mz] of [[0, -1], [0, 1], [0, 0]]) {
        const p = new PlayerSim();
        p.reset(new Vector3(g.pos.x, g.pos.y, g.pos.z + 0.3));
        p.time = te;
        p.mode = 'ground';
        p.groundSolid = isl.solid;
        p.vel.set(0, 0, -st.runSpeed);
        let launched = false;
        let out = 'none';
        for (let k = 0; k < 600 && out === 'none'; k++) {
          p.step(DT, { moveX: mx, moveZ: mz, jumpHeld: false, jumpPressed: false }, st, course);
          if (p.geyserLaunched >= 0) launched = true;
          if (p.events.includes('sea')) out = 'sea';
          // The same island, or up on its lighthouse.
          else if (launched && p.mode === 'ground' && p.events.includes('land')) out = p.groundSolid === isl.solid || (p.groundSolid && near(isl, p.pos.x, p.pos.z)) ? 'same' : 'other';
        }
        expect(launched).toBe(true);
        expect(out, `geyser ${g.id} stick ${mx},${mz}`).toBe('same');
      }
    }
  });

  it('spring coral pads keep 3.5 m from creature spawns and bounce you back onto the same island', () => {
    expect(SPRING.maxHorizontal).toBeLessThanOrEqual(2);
    let holdTrials = 0;
    let holdSea = 0;
    for (const sp of course.springs) {
      const isl = course.islands.find((i) => near(i, sp.pos.x, sp.pos.z))!;
      for (const p of isl.spawnPoints) expect(Math.hypot(p.x - sp.pos.x, p.z - sp.pos.z)).toBeGreaterThanOrEqual(SPRING.spawnClear);
      const st = typical(sp.zone);
      // Run onto it along the island (toward the next gap or toward home), then: keep holding, let go, or steer back.
      for (const dz of [-1, 1]) {
        for (const reaction of ['hold', 'letGo', 'steer'] as const) {
          const p = new PlayerSim();
          p.reset(new Vector3(sp.pos.x, sp.pos.y, sp.pos.z - dz * 2.2));
          p.mode = 'ground';
          p.groundSolid = isl.solid;
          p.vel.set(0, 0, dz * st.runSpeed);
          let sprung = false;
          let out = 'none';
          for (let t = 0; t < 4 && out === 'none'; t += DT) {
            const cx = (isl.solid.min.x + isl.solid.max.x) / 2 - p.pos.x;
            const cz = (isl.solid.min.z + isl.solid.max.z) / 2 - p.pos.z;
            const cl = Math.hypot(cx, cz) || 1;
            const input: PlayerInput =
              !sprung || reaction === 'hold'
                ? { moveX: 0, moveZ: dz, jumpHeld: false, jumpPressed: false }
                : reaction === 'steer'
                  ? { moveX: cx / cl, moveZ: cz / cl, jumpHeld: false, jumpPressed: false }
                  : { moveX: 0, moveZ: 0, jumpHeld: false, jumpPressed: false };
            p.step(DT, input, st, course);
            if (p.sprungOn >= 0) sprung = true;
            if (p.events.includes('sea')) out = 'sea';
            else if (sprung && p.events.includes('land')) out = p.groundSolid === isl.solid ? 'same' : 'other';
          }
          expect(sprung).toBe(true);
          if (reaction === 'hold') {
            // Keeping the stick pushed toward the island's end can still carry you off a short island (as running would).
            holdTrials++;
            if (out !== 'same') holdSea++;
          } else expect(out, `spring ${sp.id} dir ${dz} ${reaction}`).toBe('same');
        }
      }
    }
    expect(holdSea / holdTrials).toBeLessThanOrEqual(0.1); // was 48 of 48 into the sea (QA r5)
  });

  it('Volcano Bay and Secret Reef have bounce buoys that throw you within reach of a hook', () => {
    for (const zone of [5, 6]) {
      const buoys = course.buoys.filter((b) => b.zone === zone);
      expect(buoys.length).toBe(course.gaps.filter((g) => g.zone === zone).length);
      for (const b of buoys) {
        const p = new PlayerSim();
        p.reset(new Vector3(b.pos.x, b.pos.y + 4, b.pos.z));
        p.vel.set(0, -8, 0);
        let bounced = false;
        let hook = false;
        for (let t = 0; t < 2 && !hook; t += DT) {
          p.step(DT, { moveX: 0, moveZ: -1, jumpHeld: false, jumpPressed: false }, typical(zone), course);
          if (p.bouncedOn >= 0) bounced = true;
          if (bounced && p.target && p.target.zone === zone) hook = true;
        }
        expect(bounced && hook, `buoy ${b.id}`).toBe(true);
      }
    }
  });
});

describe('Swing Assist predicts the flight the player will really have', () => {
  /** Swings from the first Stormy Seas gap with the stick held (one direction) toward the far island, and compares at release. */
  function swingAndCompare(release: (p: PlayerSim) => boolean): { predicted: string; actual: string } {
    const gap = course.gaps.find((g) => g.zone === 3)!;
    const st = typical(3);
    const fs = gap.from.solid;
    const ts = gap.to.solid;
    const p = new PlayerSim();
    p.reset(new Vector3((fs.min.x + fs.max.x) / 2, fs.max.y, fs.min.z + 5));
    const tx = (ts.min.x + ts.max.x) / 2;
    const tz = (ts.min.z + ts.max.z) / 2;
    const src = { player: p, course, state: { stats: st }, input: { moveX: 0, moveZ: 0 } };
    let phase: 'run' | 'swing' | 'done' = 'run';
    let predicted = '';
    const dx = tx - p.pos.x;
    const dz = tz - p.pos.z;
    const dl = Math.hypot(dx, dz) || 1;
    for (let t = 0; t < 10; t += DT) {
      const input: PlayerInput = { moveX: dx / dl, moveZ: dz / dl, jumpHeld: phase !== 'done', jumpPressed: false };
      src.input = { moveX: input.moveX, moveZ: input.moveZ };
      if (phase === 'run' && p.mode === 'ground' && p.pos.z < fs.min.z + 0.4) input.jumpPressed = true;
      if (p.mode === 'swing') phase = 'swing';
      if (phase === 'swing' && release(p)) {
        const pr = predictRelease(src);
        predicted = pr.landsOn ? pr.landsOn.kind + pr.landsOn.id : 'sea';
        input.jumpHeld = false;
        phase = 'done';
        p.step(DT, input, st, course);
        if (p.lastRelease && p.lastRelease.theta >= COMBO.perfectMin && p.lastRelease.theta <= COMBO.perfectMax && p.lastRelease.vel.y > 0) {
          p.vel.x *= COMBO.perfectBoost;
          p.vel.z *= COMBO.perfectBoost;
        }
        continue;
      }
      p.step(DT, input, st, course);
      if (phase === 'done' && (p.events.includes('sea') || p.events.includes('land'))) {
        return { predicted, actual: p.events.includes('sea') ? 'sea' : p.groundSolid!.kind + p.groundSolid!.id };
      }
    }
    return { predicted, actual: 'timeout' };
  }

  it('with the stick held and the Perfect boost, the predicted landing matches the real one', () => {
    let checked = 0;
    for (const climb of [5, 15, 25, 35, 45]) {
      const r = swingAndCompare((p) => p.vel.y > 0 && (Math.atan2(p.vel.y, Math.hypot(p.vel.x, p.vel.z)) * 180) / Math.PI >= climb);
      if (r.actual === 'timeout') continue;
      checked++;
      expect(r.predicted, `release at a ${climb}° climb`).toBe(r.actual);
    }
    expect(checked).toBeGreaterThan(2);
  });

  it('a crumble stone is not a landing', () => {
    const stone = course.stones[0];
    const p = new PlayerSim();
    p.reset(new Vector3((stone.solid.min.x + stone.solid.max.x) / 2, stone.solid.max.y + 3, (stone.solid.min.z + stone.solid.max.z) / 2));
    p.mode = 'air';
    const pr = predictRelease({ player: p, course, state: { stats: typical(3) } });
    expect(pr.landsOn).toBeNull();
    expect(pr.t).toBeLessThan(1);
  });
});

export type { BotPolicy };
