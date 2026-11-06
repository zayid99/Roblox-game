import type { Vector3 } from 'three';
import { PHYS } from './config';
import type { Solid } from './course';

export interface SweepResult {
  hitX: boolean;
  hitZ: boolean;
  hitY: 'none' | 'floor' | 'ceiling';
  floor: Solid | null;
}

/** Player is an upright box: feet at (x, y, z), PHYS.height tall, PHYS.halfWidth wide each way. */
export function playerOverlaps(x: number, y: number, z: number, s: Solid): boolean {
  const hw = PHYS.halfWidth;
  if (s.off) return false;
  return (
    x - hw < s.max.x &&
    x + hw > s.min.x &&
    y < s.max.y &&
    y + PHYS.height > s.min.y &&
    z - hw < s.max.z &&
    z + hw > s.min.z
  );
}

const EPS = 1e-4;

/**
 * Moves the player by (dx, dy, dz) one axis at a time (x, z, then y) and pushes it
 * back out of any solid it ends up inside. Keep each move smaller than the thinnest solid.
 */
export function moveAndCollide(
  pos: Vector3,
  dx: number,
  dy: number,
  dz: number,
  solids: readonly Solid[],
  out: SweepResult,
): SweepResult {
  out.hitX = false;
  out.hitZ = false;
  out.hitY = 'none';
  out.floor = null;
  const hw = PHYS.halfWidth;

  if (dx !== 0) {
    pos.x += dx;
    for (const s of solids) {
      if (!playerOverlaps(pos.x, pos.y, pos.z, s)) continue;
      pos.x = dx > 0 ? s.min.x - hw - EPS : s.max.x + hw + EPS;
      out.hitX = true;
    }
  }

  if (dz !== 0) {
    pos.z += dz;
    for (const s of solids) {
      if (!playerOverlaps(pos.x, pos.y, pos.z, s)) continue;
      pos.z = dz > 0 ? s.min.z - hw - EPS : s.max.z + hw + EPS;
      out.hitZ = true;
    }
  }

  if (dy !== 0) {
    pos.y += dy;
    for (const s of solids) {
      if (!playerOverlaps(pos.x, pos.y, pos.z, s)) continue;
      if (dy < 0) {
        pos.y = s.max.y;
        out.hitY = 'floor';
        out.floor = s;
      } else {
        pos.y = s.min.y - PHYS.height - EPS;
        out.hitY = 'ceiling';
      }
    }
  }

  return out;
}
