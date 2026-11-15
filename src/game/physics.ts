import type { Vector3 } from 'three';
import { PHYS } from './config';
import type { Solid } from './course';

export interface SweepResult {
  hitX: boolean;
  hitZ: boolean;
  hitY: 'none' | 'floor' | 'ceiling';
  floor: Solid | null;
  /** True when a horizontal move stepped up onto an island top (ledge grab) this call. */
  stepped: boolean;
}

/** Ledge grab: only island and home tops can be stepped up onto (not stones, towers or lighthouse platforms). */
function steppable(s: Solid): boolean {
  return s.kind === 'island' || s.kind === 'home';
}

/** True if the player box at (x, y, z) overlaps no solid. */
function clearAt(x: number, y: number, z: number, solids: readonly Solid[]): boolean {
  for (const s of solids) if (playerOverlaps(x, y, z, s)) return false;
  return true;
}

/**
 * Ledge grab: the player ran into solid s with the feet at most `stepUp` below its top. If the box fits
 * on top, lifts the feet onto the top (the move goes on) and returns true.
 */
function tryStepUp(pos: Vector3, s: Solid, stepUp: number, solids: readonly Solid[]): boolean {
  if (stepUp <= 0 || !steppable(s)) return false;
  const below = s.max.y - pos.y;
  if (below <= 0 || below > stepUp) return false;
  if (!clearAt(pos.x, s.max.y + EPS, pos.z, solids)) return false;
  pos.y = s.max.y + EPS;
  return true;
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
 * With stepUp > 0, running into the side of an island (or home) with the feet at most stepUp below
 * its top lifts the player onto it instead (ledge grab); the y move then lands them.
 */
export function moveAndCollide(
  pos: Vector3,
  dx: number,
  dy: number,
  dz: number,
  solids: readonly Solid[],
  out: SweepResult,
  stepUp = 0,
): SweepResult {
  out.hitX = false;
  out.hitZ = false;
  out.hitY = 'none';
  out.floor = null;
  out.stepped = false;
  const hw = PHYS.halfWidth;

  if (dx !== 0) {
    pos.x += dx;
    for (const s of solids) {
      if (!playerOverlaps(pos.x, pos.y, pos.z, s)) continue;
      if (tryStepUp(pos, s, stepUp, solids)) {
        out.stepped = true;
        continue;
      }
      pos.x = dx > 0 ? s.min.x - hw - EPS : s.max.x + hw + EPS;
      out.hitX = true;
    }
  }

  if (dz !== 0) {
    pos.z += dz;
    for (const s of solids) {
      if (!playerOverlaps(pos.x, pos.y, pos.z, s)) continue;
      if (tryStepUp(pos, s, stepUp, solids)) {
        out.stepped = true;
        continue;
      }
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
