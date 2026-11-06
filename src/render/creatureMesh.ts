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
    case 'star': {
      // An upright five-armed star standing on its two lower arms; the face sits on the centre.
      b.box(0, STAR_CY, 0, 0.6, 0.6, 0.4, body, { shadeBottom: 0.15 });
      for (const a of STAR_ARMS) {
        const rot = new Matrix4().makeRotationZ(a);
        const dx = -Math.sin(a);
        const dy = Math.cos(a);
        b.box(dx * 0.36, STAR_CY + dy * 0.36, 0, 0.34, 0.36, 0.32, body, { matrix: rot, shadeBottom: dy < 0 ? 0.25 : 0 });
        b.box(dx * 0.6, STAR_CY + dy * 0.6, 0, 0.2, 0.22, 0.26, body, { matrix: rot, shadeBottom: dy < 0 ? 0.3 : 0 });
      }
      return { x: 0, y: STAR_CY + 0.69, z: 0, w: 0.3, eyeY: STAR_CY + 0.06, eyeZ: 0.21, eyeX: 0.13 };
    }
    case 'puffer': {
      // A round-ish spiky ball with stubby fins and a pouty mouth.
      b.box(0, 0.5, 0, 0.92, 0.84, 0.84, body, { shadeBottom: 0.25 });
      b.box(0, 0.5, 0, 1.0, 0.66, 0.66, body, { shadeBottom: 0.25 });
      b.box(0, 0.32, 0.43, 0.6, 0.3, 0.02, accent);
      b.box(0, 0.36, 0.45, 0.14, 0.1, 0.04, '#7a2a3a', { noOutline: true });
      b.box(0, 0.55, -0.5, 0.08, 0.3, 0.2, accent);
      b.box(0, 0.55, -0.62, 0.1, 0.42, 0.12, accent);
      for (const sx of [-1, 1]) b.box(sx * 0.53, 0.42, 0.1, 0.06, 0.16, 0.24, accent);
      for (const [x, y, z] of PUFFER_SPIKES) b.box(x, y, z, 0.1, 0.1, 0.1, accent, { noOutline: true });
      return { x: 0, y: 0.92, z: 0, w: 0.8, eyeY: 0.62, eyeZ: 0.43, eyeX: 0.2 };
    }
  }
}

const SPRINKLE_COLS = ['#ff3b6b', '#3aa8ff', '#ffd23f', '#59d36a', '#ffffff'];
/** Sprinkle spots (x, z) on a roughly 1 m top. */
const SPRINKLES: [number, number][] = [[-0.4, 0.2], [-0.2, -0.25], [0, 0.1], [0.22, 0.28], [0.38, -0.1], [-0.05, -0.3], [0.15, -0.05], [-0.32, -0.05]];
/** Star arm angles (radians from straight up): top, upper pair, the two legs. */
const STAR_ARMS = [0, 1.2566, -1.2566, 2.5133, -2.5133];
const STAR_CY = 0.6;
/** Spike studs on a puffer's top, sides and back (front left clear for the face). */
const PUFFER_SPIKES: [number, number, number][] = [
  [-0.26, 0.94, -0.2], [0.26, 0.94, -0.2], [0, 0.94, 0.12], [-0.3, 0.94, 0.26], [0.3, 0.94, 0.26], [0, 0.94, -0.32],
  [-0.52, 0.66, -0.2], [0.52, 0.66, -0.2], [-0.52, 0.66, 0.24], [0.52, 0.66, 0.24], [-0.52, 0.3, -0.12], [0.52, 0.3, -0.12],
  [-0.25, 0.75, -0.44], [0.25, 0.75, -0.44], [-0.25, 0.3, -0.44], [0.25, 0.3, -0.44],
];

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
    case 'cookie_star':
      // Chocolate chips on the arms and a crumbly bite out of one leg.
      for (const [x, y] of [[-0.26, 0.92], [0.3, 0.84], [-0.4, 0.45], [0.36, 0.3], [0.04, 1.08], [-0.2, 0.18]]) b.box(x, y, 0.18, 0.08, 0.08, 0.04, accent, { noOutline: true });
      b.box(0, STAR_CY - 0.2, 0.21, 0.12, 0.04, 0.02, '#5a2330', { noOutline: true });
      break;
    case 'gum_puffer':
      // A bubblegum bubble on the lips.
      b.box(0, 0.32, 0.58, 0.3, 0.3, 0.24, '#ffc2e6');
      b.box(-0.06, 0.38, 0.705, 0.07, 0.07, 0.01, '#ffffff', { noOutline: true });
      break;
    case 'sushi_seal':
      // Nigiri: a salmon slab on the rice, striped with fat, and a nori belt.
      b.box(0, 0.88, -0.02, 1.06, 0.14, 0.96, accent);
      for (const z of [-0.3, 0, 0.3]) b.box(0, 0.955, z, 1.07, 0.02, 0.06, '#ffd2bf', { noOutline: true });
      b.box(0, 0.2, 0, 1.03, 0.16, 0.93, extra);
      h.y += 0.14;
      break;
    case 'cupcake_crab':
      // Paper wrapper under the frosting, sprinkles and a cherry.
      b.box(0, 0.3, 0, 1.04, 0.2, 0.72, accent);
      for (const x of [-0.42, -0.21, 0, 0.21, 0.42]) b.box(x, 0.3, 0.365, 0.05, 0.2, 0.02, '#a86f2c', { noOutline: true });
      SPRINKLES.forEach(([x, z], i) => b.box(x, 0.66, z, 0.1, 0.03, 0.04, SPRINKLE_COLS[i % SPRINKLE_COLS.length], { noOutline: true }));
      b.box(0.3, 0.72, -0.18, 0.14, 0.14, 0.14, '#e8183c');
      break;
    case 'popcorn_puffer':
      // A striped popcorn bucket around the bottom.
      for (let k = 0; k < 8; k++) {
        const col = k % 2 ? '#ffffff' : extra;
        const t = (k / 8) * 2 - 1 + 1 / 8;
        b.box(t * 0.5, 0.18, 0.47, 0.125, 0.36, 0.02, col, { noOutline: true });
        b.box(t * 0.5, 0.18, -0.47, 0.125, 0.36, 0.02, col, { noOutline: true });
        b.box(0.51, 0.18, t * 0.46, 0.02, 0.36, 0.115, col, { noOutline: true });
        b.box(-0.51, 0.18, t * 0.46, 0.02, 0.36, 0.115, col, { noOutline: true });
      }
      break;
    case 'spaghetti_squid':
      // Tomato sauce on the head with meatballs, and stray noodles dangling.
      b.box(0, 1.27, 0, 0.74, 0.08, 0.7, accent);
      for (const [x, z] of [[-0.18, 0.12], [0.2, -0.1], [0.02, -0.24]]) b.box(x, 1.37, z, 0.2, 0.18, 0.2, extra);
      for (const [x, z, l] of [[-0.48, 0.1, 0.5], [0.48, -0.15, 0.6], [0.47, 0.25, 0.4], [-0.47, -0.25, 0.55]]) b.box(x, 0.9 - l / 2, z, 0.05, l, 0.05, s.look.body, { noOutline: true });
      break;
    case 'hotdog_hammerhead':
      // A sausage in the bun, a mustard zig-zag and the hammer head.
      b.box(0, 0.8, 0, 0.32, 0.3, 1.5, accent);
      for (let k = 0; k < 6; k++) b.box((k % 2 ? 0.06 : -0.06), 0.96, -0.55 + k * 0.22, 0.16, 0.03, 0.06, extra, { noOutline: true });
      b.box(0, 0.6, 0.46, 1.2, 0.26, 0.3, s.look.body);
      for (const sx of [-1, 1]) b.box(sx * 0.6, 0.6, 0.62, 0.08, 0.1, 0.02, PUPIL, { noOutline: true });
      h.y = 0.97;
      h.z = 0.1;
      break;
    case 'lollipop_star':
      // A white candy swirl on the middle and a stick down the back.
      for (const [x, y, w, hh] of [[0, 0.38, 0.4, 0.04], [0.19, 0.6, 0.04, 0.4], [0, 0.82, 0.4, 0.04], [-0.12, 0.6, 0.04, 0.28], [0.04, 0.48, 0.24, 0.04]]) b.box(x, y, 0.205, w, hh, 0.01, accent, { noOutline: true });
      b.box(0, STAR_CY - 0.2, -0.3, 0.06, 0.9, 0.06, extra);
      break;
    case 'pineapple_puffer':
      // A spiky leaf crown and a diamond pattern on the sides.
      for (const [x, z, r] of [[0, 0, 0], [-0.12, 0.06, 0.4], [0.12, -0.06, -0.4], [0.06, 0.12, 0.25], [-0.06, -0.12, -0.25]] as [number, number, number][]) {
        const rot = new Matrix4().makeRotationZ(r);
        b.box(x, 1.16, z, 0.12, 0.5, 0.06, extra, { matrix: rot });
      }
      for (const [y, z] of [[0.5, 0], [0.7, -0.22], [0.3, -0.22], [0.7, 0.22], [0.3, 0.22]]) for (const sx of [-1, 1]) b.box(sx * 0.505, y, z, 0.02, 0.06, 0.06, accent, { noOutline: true });
      h.y = 1.0;
      break;
    case 'gelato_orca':
      // Three gelato scoops on the back with sprinkles, and a waffle-cone tail.
      for (const [z, c] of [[-0.35, '#fff3d6'], [0.05, extra], [0.45, '#7a4a2a']] as [number, string][]) b.box(0, 1.0, z, 0.6, 0.26, 0.4, c);
      SPRINKLES.forEach(([x, z], i) => b.box(x * 0.5, 1.14, z * 0.9, 0.08, 0.03, 0.04, SPRINKLE_COLS[i % SPRINKLE_COLS.length], { noOutline: true }));
      b.box(0, 0.62, -0.95, 0.18, 0.28, 0.48, accent);
      b.box(0, 0.76, -1.2, 0.86, 0.12, 0.32, accent);
      for (const x of [-0.25, 0, 0.25]) b.box(x, 0.83, -1.2, 0.03, 0.02, 0.32, '#8a5a2a', { noOutline: true });
      h.y = 1.13;
      h.z = 0.05;
      break;
    case 'nova_star':
      // A glowing core and sparkles orbiting the arms.
      b.box(0, STAR_CY - 0.18, 0.205, 0.36, 0.14, 0.01, accent, { noOutline: true });
      for (const [x, y] of [[-0.62, 1.05], [0.66, 1.0], [-0.7, 0.2], [0.7, 0.25], [0.0, 1.5]]) {
        b.box(x, y, 0, 0.14, 0.04, 0.04, extra, { noOutline: true });
        b.box(x, y, 0, 0.04, 0.14, 0.04, extra, { noOutline: true });
      }
      break;
    case 'sharkcuterie':
      // A wooden board shark: salami slices, cheese cubes and a row of teeth.
      for (const sx of [-1, 1]) for (const [y, z] of [[0.55, 0.25], [0.35, -0.05], [0.55, -0.35]]) b.box(sx * 0.29, y, z, 0.02, 0.2, 0.2, accent, { noOutline: true });
      for (const [x, z] of [[-0.14, -0.35], [0.14, 0.05], [-0.1, 0.25]]) b.box(x, 0.8, z, 0.14, 0.14, 0.14, extra);
      for (let k = 0; k < 4; k++) b.box(-0.15 + k * 0.1, 0.3, 0.61, 0.05, 0.06, 0.02, '#ffffff', { noOutline: true });
      for (const z of [-0.4, 0, 0.4]) b.box(0, 0.45, z, 0.57, 0.02, 0.02, '#8a5a2a', { noOutline: true });
      break;
    case 'angel_puffer':
      // Frosting swirls and little feathered wings.
      for (const z of [-0.2, 0.15]) b.box(0, 0.94, z, 0.6, 0.06, 0.12, accent, { noOutline: true });
      for (const sx of [-1, 1]) {
        const rot = new Matrix4().makeRotationZ(sx * -0.5);
        b.box(sx * 0.66, 0.7, -0.1, 0.36, 0.1, 0.42, '#ffffff', { matrix: rot });
        b.box(sx * 0.78, 0.82, -0.1, 0.2, 0.08, 0.32, '#ffffff', { matrix: rot });
      }
      break;
    case 'ramen_turtle':
      // The shell is a ramen bowl: a white rim, noodles, an egg, nori and chopsticks.
      b.box(0, 0.67, 0, 0.98, 0.04, 1.02, '#ffffff', { noOutline: true });
      b.box(0, 0.8, 0, 0.68, 0.06, 0.72, extra);
      for (const x of [-0.2, 0, 0.2]) b.box(x, 0.835, 0, 0.04, 0.02, 0.7, '#f2c460', { noOutline: true });
      b.box(0.15, 0.86, 0.12, 0.24, 0.06, 0.18, '#ffffff');
      b.box(0.15, 0.895, 0.12, 0.12, 0.02, 0.1, '#ffb52e', { noOutline: true });
      b.box(-0.2, 0.96, -0.18, 0.24, 0.3, 0.04, '#1f3b2c');
      for (const dx of [-0.05, 0.05]) {
        const rot = new Matrix4().makeRotationX(-0.6);
        b.box(0.25 + dx, 1.05, -0.2, 0.035, 0.035, 0.8, '#a8723a', { matrix: rot });
      }
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
    case 'propeller': {
      // A striped beanie with a stem and two blades.
      const cw = Math.min(0.56, w * 0.8);
      b.box(x, y + 0.07, z, cw, 0.14, cw, '#3a7bff');
      b.box(x, y + 0.07, z, cw + 0.01, 0.14, 0.12, '#ffd23f');
      b.box(x, y + 0.07, z, 0.12, 0.141, cw + 0.01, '#ff3b3b');
      b.box(x, y + 0.24, z, 0.05, 0.2, 0.05, '#2a2a35');
      const rot = new Matrix4().makeRotationY(0.45);
      b.box(x, y + 0.34, z, 0.7, 0.03, 0.12, '#ff3b3b', { matrix: rot });
      b.box(x, y + 0.36, z, 0.08, 0.06, 0.08, '#ffd23f');
      break;
    }
    case 'partyhat': {
      // A stepped cone in two colours with a pom-pom.
      const cols = ['#3aa8ff', s.look.extra ?? '#ffffff'];
      for (let k = 0; k < 5; k++) {
        const r = 0.36 - k * 0.065;
        b.box(x, y + 0.06 + k * 0.11, z, r, 0.11, r, cols[k % 2]);
      }
      b.box(x, y + 0.66, z, 0.13, 0.13, 0.13, '#ffd23f');
      break;
    }
    case 'halo':
      // A floating golden ring above the head (8 segments).
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        const rot = new Matrix4().makeRotationY(-a);
        b.box(x + Math.cos(a) * 0.3, y + 0.32, z + Math.sin(a) * 0.3, 0.07, 0.06, 0.26, '#ffe066', { matrix: rot, noOutline: true });
      }
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
