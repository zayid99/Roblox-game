import { Matrix4, Mesh, type BufferGeometry } from 'three';
import { getSpecies, type CreatureRef, type Species } from '../game/creatures';
import { BoxBuilder } from './boxes';
import { creatureMaterial, type CreatureMaterial } from './materials';

// Every creature is built from boxes, facing +z, standing on y = 0, roughly 1 m across.

interface Head {
  /** Point on top of the head where hats go. */
  x: number;
  y: number;
  z: number;
  /** Head width, for sizing hats. */
  w: number;
  eyeY: number;
  eyeZ: number;
  eyeX: number;
}

const WHITE = '#ffffff';
const PUPIL = '#1b1b2a';
const DARK = '#1d1d24';

/** G13 eyes: bigger, with a 1-texel highlight and a brow box. Eye boxes carry the blink attribute. */
function eyes(b: BoxBuilder, h: Head, size = 1.18): void {
  const y = h.eyeY;
  for (const sx of [-1, 1]) {
    const x = sx * h.eyeX;
    b.box(x, y, h.eyeZ, 0.17 * size, 0.2 * size, 0.04, WHITE, { eye: y, noOutline: true });
    b.box(x + sx * 0.005, y - 0.02 * size, h.eyeZ + 0.025, 0.09 * size, 0.12 * size, 0.02, PUPIL, { eye: y, noOutline: true });
    b.box(x - 0.022 * size, y + 0.018 * size, h.eyeZ + 0.037, 0.035 * size, 0.035 * size, 0.01, WHITE, { eye: y, noOutline: true });
    const brow = new Matrix4().makeRotationZ(sx * -0.18);
    b.box(x, y + 0.15 * size, h.eyeZ + 0.02, 0.19 * size, 0.045 * size, 0.04, DARK, { matrix: brow, noOutline: true });
  }
}

function buildBody(b: BoxBuilder, s: Species): Head {
  const { body, accent } = s.look;
  const extra = s.look.extra ?? accent;
  switch (s.look.plan) {
    case 'blob': {
      b.box(0, 0.42, 0, 1.0, 0.8, 0.9, body, { shadeBottom: 0.25 });
      b.box(0, 0.34, 0.455, 0.56, 0.42, 0.02, accent);
      for (const sx of [-1, 1]) b.box(sx * 0.27, 0.05, 0.12, 0.26, 0.1, 0.34, body, { shadeBottom: 0.3 });
      return { x: 0, y: 0.82, z: 0, w: 1.0, eyeY: 0.62, eyeZ: 0.46, eyeX: 0.22 };
    }
    case 'fish': {
      b.box(0, 0.45, 0, 0.56, 0.62, 1.2, body, { shadeBottom: 0.25 });
      b.box(0, 0.5, -0.76, 0.12, 0.62, 0.34, accent);
      b.box(0, 0.86, -0.05, 0.08, 0.3, 0.42, accent);
      for (const sx of [-1, 1]) b.box(sx * 0.33, 0.33, 0.12, 0.12, 0.08, 0.32, accent);
      return { x: 0, y: 0.76, z: 0.3, w: 0.56, eyeY: 0.58, eyeZ: 0.61, eyeX: 0.15 };
    }
    case 'octo': {
      b.box(0, 0.86, 0, 0.92, 0.8, 0.86, body, { shadeBottom: 0.15 });
      const legs: [number, number][] = [[-0.3, 0.26], [0.3, 0.26], [-0.3, -0.26], [0.3, -0.26], [0, 0.32], [0, -0.32]];
      for (const [x, z] of legs) b.box(x, 0.25, z, 0.2, 0.5, 0.2, body, { shadeBottom: 0.35 });
      return { x: 0, y: 1.26, z: 0, w: 0.92, eyeY: 0.92, eyeZ: 0.44, eyeX: 0.2 };
    }
    case 'crab': {
      b.box(0, 0.44, 0, 1.1, 0.42, 0.78, body, { shadeBottom: 0.25 });
      for (const sx of [-1, 1]) {
        b.box(sx * 0.74, 0.55, 0.38, 0.36, 0.3, 0.44, body, { shadeBottom: 0.2 });
        b.box(sx * 0.74, 0.55, 0.64, 0.38, 0.14, 0.1, accent);
        for (const z of [-0.26, 0, 0.22]) b.box(sx * 0.64, 0.18, z, 0.32, 0.08, 0.08, body, { shadeBottom: 0.3 });
        b.box(sx * 0.2, 0.8, 0.26, 0.08, 0.32, 0.08, body);
      }
      return { x: 0, y: 0.66, z: 0, w: 1.0, eyeY: 1.0, eyeZ: 0.3, eyeX: 0.2 };
    }
    case 'whale': {
      if (s.id === 'burger_whale') {
        b.box(0, 0.26, 0, 0.92, 0.42, 1.5, body, { shadeBottom: 0.25 });
        b.box(0, 0.54, 0, 0.98, 0.16, 1.56, accent);
        b.box(0, 0.65, 0, 1.02, 0.07, 1.6, extra);
        b.box(0, 0.86, 0, 0.92, 0.36, 1.5, body);
        for (const [x, z] of [[-0.2, -0.4], [0.25, -0.1], [-0.1, 0.25], [0.2, 0.45], [-0.25, 0.55]]) b.box(x, 1.05, z, 0.1, 0.03, 0.06, '#fff6d8');
      } else {
        b.box(0, 0.5, 0, 0.92, 0.86, 1.5, body, { shadeBottom: 0.25 });
        b.box(0, 0.22, 0.05, 0.94, 0.26, 1.3, extra);
      }
      b.box(0, 0.62, -0.95, 0.16, 0.26, 0.46, body);
      b.box(0, 0.76, -1.2, 0.84, 0.1, 0.3, body);
      return { x: 0, y: 1.04, z: 0.25, w: 0.92, eyeY: 0.62, eyeZ: 0.76, eyeX: 0.25 };
    }
    case 'clam': {
      b.box(0, 0.17, 0, 1.12, 0.3, 0.92, body, { shadeBottom: 0.3 });
      const hinge = new Matrix4().makeTranslation(0, 0.32, -0.45);
      hinge.multiply(new Matrix4().makeRotationX(-0.75));
      hinge.multiply(new Matrix4().makeTranslation(0, 0.12, 0.46));
      b.box(0, 0, 0, 1.12, 0.24, 0.92, body, { matrix: hinge });
      b.box(0, 0.48, 0.08, 0.38, 0.38, 0.38, accent);
      for (const [x, y] of [[-0.1, 0.55], [0.1, 0.42], [0.05, 0.6], [-0.08, 0.4]]) b.box(x, y, 0.28, 0.08, 0.08, 0.02, '#7fe7ff');
      return { x: 0, y: 0.95, z: -0.2, w: 0.8, eyeY: 0.22, eyeZ: 0.47, eyeX: 0.25 };
    }
    case 'turtle': {
      for (const [x, z] of [[-0.36, 0.3], [0.36, 0.3], [-0.36, -0.3], [0.36, -0.3]]) b.box(x, 0.12, z, 0.22, 0.24, 0.22, body);
      b.box(0, 0.47, 0, 0.96, 0.42, 1.0, accent, { shadeBottom: 0.2 });
      b.box(0, 0.73, 0, 0.7, 0.12, 0.74, accent);
      b.box(0, 0.45, 0.64, 0.42, 0.38, 0.36, body);
      return { x: 0, y: 0.64, z: 0.64, w: 0.42, eyeY: 0.52, eyeZ: 0.83, eyeX: 0.11 };
    }
    case 'shrimp': {
      b.box(0, 0.33, -0.36, 0.4, 0.4, 0.36, body, { shadeBottom: 0.2 });
      b.box(0, 0.5, 0, 0.52, 0.52, 0.46, body, { shadeBottom: 0.2 });
      b.box(0, 0.62, 0.36, 0.46, 0.46, 0.4, body);
      b.box(0, 0.22, -0.64, 0.52, 0.08, 0.26, accent);
      for (const sx of [-1, 1]) b.box(sx * 0.12, 1.06, 0.5, 0.04, 0.5, 0.04, accent);
      for (const z of [-0.2, 0.05, 0.25]) b.box(0, 0.16, z, 0.36, 0.12, 0.05, body);
      return { x: 0, y: 0.85, z: 0.36, w: 0.46, eyeY: 0.72, eyeZ: 0.565, eyeX: 0.13 };
    }
    case 'jelly': {
      b.box(0, 1.05, 0, 0.96, 0.56, 0.96, body, { shadeBottom: 0.1 });
      b.box(0, 1.39, 0, 0.7, 0.14, 0.7, body);
      const legs: [number, number][] = [[-0.3, 0.3], [0.3, 0.3], [-0.3, -0.3], [0.3, -0.3], [0, 0.36], [0, -0.36]];
      legs.forEach(([x, z], i) => b.box(x, 0.48 - (i % 2) * 0.08, z, 0.1, 0.6, 0.1, accent));
      return { x: 0, y: 1.46, z: 0, w: 0.9, eyeY: 1.06, eyeZ: 0.49, eyeX: 0.18 };
    }
  }
}

function details(b: BoxBuilder, s: Species, h: Head): void {
  const { accent } = s.look;
  const extra = s.look.extra ?? accent;
  switch (s.id) {
    case 'toastopus':
      b.box(0, 1.29, 0, 0.36, 0.07, 0.36, accent);
      b.box(0, 0.86, 0.435, 0.94, 0.8, 0.01, '#b9783a');
      b.box(0, 0.86, 0.44, 0.78, 0.66, 0.01, s.look.body);
      break;
    case 'pickle_puff':
      for (const [x, y, z] of [[-0.52, 0.5, 0], [0.52, 0.5, 0], [0, 0.84, 0.1], [-0.3, 0.84, -0.2], [0.3, 0.84, -0.2], [0, 0.45, -0.47]]) b.box(x, y, z, 0.12, 0.12, 0.12, accent);
      b.box(0, 0.42, 0.46, 0.2, 0.06, 0.02, '#5a2330');
      break;
    case 'soggy_sock':
      for (const z of [-0.25, 0.12]) b.box(0, 0.45, z, 0.58, 0.64, 0.12, accent);
      break;
    case 'boba_turtle':
      for (const [x, z] of [[-0.25, 0.2], [0.2, 0.3], [0.3, -0.2], [-0.15, -0.3], [0.05, 0]]) b.box(x, 0.8, z, 0.12, 0.08, 0.12, extra);
      b.box(0.22, 1.08, -0.12, 0.07, 0.62, 0.07, '#ff7eb6');
      break;
    case 'sir_shrimp':
      b.box(0, 0.6, h.eyeZ + 0.01, 0.26, 0.05, 0.02, '#3a2618');
      break;
    case 'banana_shark':
      b.box(0, 0.45, 0.62, 0.3, 0.3, 0.05, accent);
      b.box(0, 0.5, -0.94, 0.08, 0.2, 0.06, accent);
      break;
    case 'waffle_walrus':
      for (const sx of [-1, 1]) b.box(sx * 0.12, 0.28, 0.47, 0.07, 0.3, 0.07, accent);
      for (const x of [-0.25, 0, 0.25]) b.box(x, 0.42, 0, 0.03, 0.81, 0.91, '#a86f2c');
      break;
    case 'cactus_jelly':
      for (const [x, z] of [[-0.49, 0.2], [0.49, -0.1], [0.2, 0.49], [-0.1, -0.49]]) b.box(x, 1.1, z, 0.06, 0.06, 0.06, '#ffffff');
      break;
    case 'ninja_narwhal':
      b.box(0, 0.74, 1.05, 0.08, 0.08, 0.6, extra);
      break;
    case 'lava_lobster':
      for (const [x, z] of [[-0.3, 0.1], [0.1, -0.2], [0.3, 0.25]]) b.box(x, 0.66, z, 0.28, 0.02, 0.05, accent);
      break;
    case 'thunder_tuna':
      for (const sx of [-1, 1]) {
        b.box(sx * 0.285, 0.6, 0.15, 0.02, 0.1, 0.3, accent);
        b.box(sx * 0.285, 0.48, 0.0, 0.02, 0.1, 0.25, accent);
        b.box(sx * 0.285, 0.36, -0.15, 0.02, 0.1, 0.3, accent);
      }
      break;
    case 'pizza_kraken':
      for (const [x, z] of [[-0.25, 0.2], [0.2, -0.15], [0.05, 0.25], [-0.15, -0.25], [0.3, 0.2]]) b.box(x, 1.265, z, 0.18, 0.02, 0.18, accent);
      b.box(0, 1.17, 0, 0.98, 0.08, 0.92, '#d98a2b');
      break;
    case 'big_cheese':
      for (const sx of [-1, 1]) for (const [y, z] of [[0.6, 0.3], [0.4, -0.3], [0.7, -0.5]]) b.box(sx * 0.465, y, z, 0.02, 0.14, 0.14, accent);
      break;
    case 'cosmic_sunfish':
      for (const [x, y, c] of [[-0.3, 0.7, accent], [0.32, 0.25, extra], [0.1, 0.78, extra], [-0.38, 0.3, accent]] as [number, number, string][]) b.box(x, y, 0.455, 0.08, 0.08, 0.02, c);
      break;
    case 'astro_otter':
      b.box(0, 0.62, -0.47, 0.5, 0.5, 0.06, '#c9ced6');
      break;
  }
}

function accessory(b: BoxBuilder, s: Species, h: Head): void {
  const { x, y, z, w } = h;
  switch (s.look.acc) {
    case 'tophat':
      b.box(x, y + 0.03, z, Math.min(0.62, w + 0.1), 0.06, 0.6, DARK);
      b.box(x, y + 0.28, z, 0.38, 0.44, 0.38, DARK);
      b.box(x, y + 0.12, z, 0.4, 0.08, 0.4, '#c0392b');
      break;
    case 'crown':
      b.box(x, y + 0.08, z, 0.5, 0.16, 0.5, '#ffd23f');
      for (const [dx, dz] of [[-0.19, -0.19], [0.19, -0.19], [-0.19, 0.19], [0.19, 0.19]]) b.box(x + dx, y + 0.24, z + dz, 0.1, 0.16, 0.1, '#ffd23f');
      b.box(x, y + 0.08, z + 0.26, 0.1, 0.1, 0.02, '#e0245e');
      break;
    case 'shades':
      b.box(0, h.eyeY, h.eyeZ + 0.035, h.eyeX * 2 + 0.3, 0.14, 0.03, '#111111');
      break;
    case 'headphones':
      b.box(x, y + 0.06, z, w * 0.9, 0.08, 0.1, '#2a2a35');
      for (const sx of [-1, 1]) b.box(x + sx * w * 0.47, y - 0.12, z, 0.14, 0.3, 0.3, '#ff3b6b');
      break;
    case 'helmet':
      b.box(x, y + 0.04, z, w + 0.16, 0.08, 0.98, '#e8eef5');
      b.box(x, y + 0.34, z, 0.05, 0.56, 0.05, '#e8eef5');
      b.box(x, y + 0.64, z, 0.13, 0.13, 0.13, '#ff3b3b');
      break;
    case 'bandana':
      b.box(x, y - 0.12, z, w + 0.04, 0.13, 0.55, s.look.accent);
      b.box(x + 0.12, y - 0.14, z - 0.36, 0.06, 0.08, 0.3, s.look.accent);
      break;
    case 'flower':
      for (const [dx, dz] of [[-0.12, 0], [0.12, 0], [0, -0.12], [0, 0.12]]) b.box(x + dx, y + 0.04, z + dz, 0.14, 0.06, 0.14, s.look.accent);
      b.box(x, y + 0.07, z, 0.1, 0.06, 0.1, '#ffd23f');
      break;
    case 'pirate':
      b.box(x, y + 0.07, z, w + 0.12, 0.12, 0.52, DARK);
      b.box(x, y + 0.24, z, w * 0.6, 0.24, 0.32, DARK);
      b.box(x, y + 0.24, z + 0.165, 0.12, 0.12, 0.02, '#ffffff');
      break;
    case 'horn':
      for (const sx of [-1, 1]) b.box(x + sx * 0.25, y + 0.12, z, 0.1, 0.26, 0.1, '#ffcc00');
      break;
    case 'none':
      break;
  }
}

const geometryCache = new Map<string, BufferGeometry>();
const outlineCache = new Map<string, BufferGeometry>();
const builders = new Map<string, BoxBuilder>();

function builderFor(speciesId: string): BoxBuilder {
  let b = builders.get(speciesId);
  if (!b) {
    const s = getSpecies(speciesId);
    b = new BoxBuilder();
    const head = buildBody(b, s);
    details(b, s, head);
    eyes(b, head);
    accessory(b, s, head);
    builders.set(speciesId, b);
  }
  return b;
}

/** One merged geometry per species (shared by every instance). */
export function creatureGeometry(speciesId: string): BufferGeometry {
  let g = geometryCache.get(speciesId);
  if (!g) {
    g = builderFor(speciesId).build();
    geometryCache.set(speciesId, g);
  }
  return g;
}

/** The species' ink outline hull (boxes grown by .04, render BackSide). */
export function creatureOutline(speciesId: string): BufferGeometry {
  let g = outlineCache.get(speciesId);
  if (!g) {
    g = builderFor(speciesId).outline(0.045);
    outlineCache.set(speciesId, g);
  }
  return g;
}

/** Base scale of a species (before the wild ×1.5 / pedestal ×1.3 factors). */
export function speciesScale(speciesId: string): number {
  return getSpecies(speciesId).look.scale ?? 1;
}

/** A creature body with its own toon material (blink + flash uniforms in `material.userData`). */
export function makeCreatureMesh(c: CreatureRef): Mesh & { material: CreatureMaterial } {
  const mesh = new Mesh(creatureGeometry(c.speciesId), creatureMaterial(c.mutation)) as Mesh & { material: CreatureMaterial };
  mesh.scale.setScalar(speciesScale(c.speciesId));
  return mesh;
}
