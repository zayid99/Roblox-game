// Diagnostic, not a pass/fail test: prints the cheapest upgrade levels that let the bot cross each gap.
// Run with: DIAG=1 npx vitest run tests/diag.test.ts --silent=false
import { describe, it } from 'vitest';

declare const process: { env: Record<string, string | undefined> };
import { generateCourse } from '../src/game/course';
import { UPGRADES } from '../src/game/economy';
import { crossable } from './bot';

function minReach(course: ReturnType<typeof generateCourse>, gapIndex: number, powerL: number, speedL: number): number {
  const gap = course.gaps[gapIndex];
  for (let reachL = 0; reachL <= UPGRADES.reach.maxLevel; reachL++) {
    const stats = {
      runSpeed: UPGRADES.speed.value(speedL),
      reach: UPGRADES.reach.value(reachL),
      power: UPGRADES.power.value(powerL),
    };
    if (crossable(course, gap, stats)) return reachL;
  }
  return Infinity;
}

describe.runIf(process.env.DIAG)('diagnostics', () => {
  it('minimum reach per gap', () => {
    const course = generateCourse();
    const rows: string[] = [];
    const zoneMax: number[] = [];
    const zoneMaxPow: number[] = [];
    course.gaps.forEach((gap, i) => {
      const r0 = minReach(course, i, 0, 0);
      const r6 = minReach(course, i, 6, 8);
      zoneMax[gap.zone] = Math.max(zoneMax[gap.zone] ?? 0, r0);
      zoneMaxPow[gap.zone] = Math.max(zoneMaxPow[gap.zone] ?? 0, r6);
      rows.push(`gap ${String(i).padStart(2)} zone ${gap.zone} len ${gap.length.toFixed(1).padStart(4)} anchors ${gap.anchors.length}  minReachL(power0,speed0)=${r0}  minReachL(power6,speed8)=${r6}`);
    });
    rows.push(`zone max reachL (power0): ${zoneMax.join(', ')}`);
    rows.push(`zone max reachL (power6): ${zoneMaxPow.join(', ')}`);
    rows.push(`course length ${(-course.endZ).toFixed(0)} m, solids ${course.solids.length}, anchors ${course.anchors.length}`);
    console.log(rows.join('\n'));
  });
});
