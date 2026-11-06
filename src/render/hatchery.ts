// The Hatchery stand on the home island: a wooden incubator table with a straw nest, four big eggs,
// a heat lamp and a HATCHERY board. The stand goes into the World's decor builder and sign atlas; the
// eggs are one small toon mesh plus its ink hull (the decor's edge lines would cover their thin layers).
import { Group, Matrix4, Mesh } from 'three';
import { BoxBuilder } from './boxes';
import { inkMaterial, toonVertexMaterial } from './materials';
import { HOME_TOP } from '../game/config';
import { EGG_COLORS, HATCHERY } from '../game/hatchery';
import type { SignAtlas } from './labels';

const rotY = (x: number, y: number, z: number, ry: number) => new Matrix4().makeRotationY(ry).setPosition(x, y, z);

/** A toon egg from stacked octagonal layers (wider below the middle), with a few spots facing out. */
function egg(b: BoxBuilder, x: number, y: number, z: number, h: number, shell: string, spot: string, tilt: number): void {
  const n = 8;
  const R = h * 0.36;
  const layer = h / n;
  for (let i = 0; i < n; i++) {
    const s = (i + 0.5) / n;
    const w = Math.max(0.12, 2 * R * Math.sin(Math.PI * Math.pow(s, 0.82)));
    const cy = y + s * h;
    const m = rotY(x, cy, z, tilt + (i % 2 ? Math.PI / 4 : 0));
    b.box(0, 0, 0, w, layer * 1.06, w, shell, { matrix: m, shadeBottom: i === 0 ? 0.25 : 0 });
  }
  // Spots: [height fraction, angle around the egg from the front (−z, toward the sea)].
  const spots: [number, number][] = [[0.3, 0.35], [0.56, -0.55], [0.72, 0.85], [0.4, -1.5], [0.5, 1.7]];
  for (const [s, a] of spots) {
    const r = R * Math.sin(Math.PI * Math.pow(s, 0.82)) + 0.03;
    const px = x + Math.sin(a + tilt) * r;
    const pz = z - Math.cos(a + tilt) * r;
    b.box(0, 0, 0, h * 0.15, h * 0.13, h * 0.06, spot, { matrix: rotY(px, y + s * h, pz, -(a + tilt)), noOutline: true });
  }
}

/** Adds the stand to the home island decor (centre HATCHERY.x/z, facing the sea) and returns the eggs. */
export function hatcheryStand(decor: BoxBuilder, signs: SignAtlas): Group {
  const { x, z, halfW, halfD } = HATCHERY;
  const y0 = HOME_TOP;
  const top = y0 + 0.6;
  // Incubator table: plank body, darker trim and little feet.
  decor.boxMinMax(x - halfW, y0 + 0.12, z - halfD, x + halfW, top, z + halfD, '#B07A3A', { topColor: '#D9A35F', ao: y0 });
  decor.boxMinMax(x - halfW - 0.05, top - 0.12, z - halfD - 0.05, x + halfW + 0.05, top, z + halfD + 0.05, '#8A5A28');
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) decor.box(x + sx * (halfW - 0.2), y0 + 0.06, z + sz * (halfD - 0.2), 0.36, 0.12, 0.36, '#6B4423');
  // Teal front panel with an egg emblem (wide pale oval).
  decor.box(x, y0 + 0.36, z - halfD - 0.03, halfW * 2 - 0.5, 0.36, 0.06, '#2EE6C9', { noOutline: true });
  decor.box(x, y0 + 0.36, z - halfD - 0.07, 0.34, 0.26, 0.04, '#FFF6E0', { noOutline: true });
  decor.box(x, y0 + 0.36, z - halfD - 0.07, 0.24, 0.34, 0.04, '#FFF6E0', { noOutline: true });

  // Straw nest: a low bed with a rough rim and a few loose tufts.
  decor.box(x, top + 0.08, z, halfW * 2 - 0.3, 0.16, halfD * 2 - 0.3, '#F2D58A', { noOutline: true });
  decor.box(x, top + 0.2, z - halfD + 0.2, halfW * 2 - 0.2, 0.34, 0.3, '#E9B44C');
  decor.box(x, top + 0.2, z + halfD - 0.2, halfW * 2 - 0.2, 0.34, 0.3, '#E9B44C');
  decor.box(x - halfW + 0.2, top + 0.2, z, 0.3, 0.34, halfD * 2 - 0.5, '#E9B44C');
  decor.box(x + halfW - 0.2, top + 0.2, z, 0.3, 0.34, halfD * 2 - 0.5, '#E9B44C');
  const tufts: [number, number, number][] = [[-1.5, -0.95, 0.4], [-0.6, -1.0, -0.5], [0.5, -0.98, 0.7], [1.4, -0.92, -0.3], [-1.6, 0.8, 0.2], [1.6, 0.6, -0.6]];
  for (const [dx, dz, r] of tufts) decor.box(0, 0, 0, 0.5, 0.07, 0.12, '#D9A84A', { matrix: rotY(x + dx, top + 0.4, z + dz, r), noOutline: true });

  // Four eggs on display: the first four zones' colours, the middle two bigger.
  const eggs: [number, number, number, number][] = [[-1.3, 0.1, 1.0, 0.2], [-0.44, -0.08, 1.34, -0.15], [0.47, 0.1, 1.22, 0.3], [1.32, -0.1, 1.04, -0.25]];
  const eggB = new BoxBuilder();
  eggs.forEach(([dx, dz, h, tilt], i) => {
    const [shell, spot] = EGG_COLORS[i];
    egg(eggB, x + dx, top + 0.1, z + dz, h, shell, spot, tilt);
  });
  const eggMesh = new Mesh(eggB.build(), toonVertexMaterial);
  eggMesh.castShadow = true;
  const eggGroup = new Group();
  eggGroup.add(eggMesh, new Mesh(eggB.outline(0.035), inkMaterial));

  // Back frame: two posts, a crossbar, a heat lamp over the eggs and the board.
  const backZ = z + halfD - 0.15;
  const postH = 3.1;
  for (const sx of [-1, 1]) {
    decor.box(x + sx * (halfW - 0.12), top + postH / 2, backZ, 0.24, postH, 0.24, '#8A5A28', { ao: top });
    decor.box(x + sx * (halfW - 0.12), top + postH + 0.08, backZ, 0.36, 0.16, 0.36, '#6B4423');
  }
  decor.box(x, top + postH - 0.25, backZ, halfW * 2, 0.22, 0.3, '#6B4423');
  // Lamp arm and shade (teal), warm bulb.
  decor.box(x, top + postH - 0.25, backZ - 0.6, 0.12, 0.12, 1.2, '#2A2F3A');
  decor.box(x, top + postH - 0.6, z - 0.15, 0.1, 0.6, 0.1, '#2A2F3A');
  decor.box(x, top + postH - 0.95, z - 0.15, 0.9, 0.28, 0.9, '#14B39C');
  decor.box(x, top + postH - 0.82, z - 0.15, 0.5, 0.12, 0.5, '#2EE6C9');
  decor.box(x, top + postH - 1.16, z - 0.15, 0.36, 0.16, 0.36, '#FFE680', { noOutline: true });
  // Board text faces the sea, where players come home from.
  signs.board(new Matrix4().makeRotationY(Math.PI).setPosition(x, top + postH + 0.85, backZ), 3.4, 1.36, [{ text: 'HATCHERY', size: 80, color: '#FFFFFF' }], '#14B39C');
  return eggGroup;
}
