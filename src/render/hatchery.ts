// The Hatchery stand on the home island: a wooden incubator table with a straw nest, four big eggs,
// a heat lamp and a HATCHERY board. The stand goes into the World's decor builder and sign atlas; the
// eggs are one small toon mesh plus its ink hull (the decor's edge lines would cover their thin layers).
import { BufferGeometry, Color, Float32BufferAttribute, Group, LatheGeometry, Matrix3, Matrix4, Mesh, Quaternion, SphereGeometry, Vector2, Vector3 } from 'three';
import { inkMaterial, toonVertexMaterial } from './materials';
import { HOME_TOP } from '../game/config';
import { EGG_COLORS, HATCHERY } from '../game/hatchery';
import type { BoxBuilder } from './boxes';
import type { SignAtlas } from './labels';

const rotY = (x: number, y: number, z: number, ry: number) => new Matrix4().makeRotationY(ry).setPosition(x, y, z);

/** Egg silhouette radius at height fraction s (0 bottom, 1 top): widest a little below the middle. */
const eggRadius = (s: number) => Math.sin(Math.PI * Math.pow(Math.min(1, Math.max(0, s)), 0.82));

/** Unit egg (height 1, max radius .36): a smooth lathe, shaded by the toon ramp like the creatures. */
function unitEgg(): LatheGeometry {
  const pts: Vector2[] = [];
  const rings = 14;
  for (let i = 0; i <= rings; i++) {
    const s = i / rings;
    pts.push(new Vector2(Math.max(i === 0 || i === rings ? 0 : 0.02, 0.36 * eggRadius(s)), s));
  }
  return new LatheGeometry(pts, 16);
}

/** Collects smooth, vertex-coloured meshes into one geometry (plus an ink hull grown along the normals). */
class SmoothBuilder {
  private readonly pos: number[] = [];
  private readonly nor: number[] = [];
  private readonly col: number[] = [];
  private readonly idx: number[] = [];
  private readonly hullPos: number[] = [];
  private readonly hullIdx: number[] = [];

  add(g: BufferGeometry, m: Matrix4, color: Color, opts: { hull?: number; shadeBottom?: [number, number] } = {}): void {
    const p = g.getAttribute('position');
    const n = g.getAttribute('normal');
    const nm = new Matrix3().getNormalMatrix(m);
    const base = this.pos.length / 3;
    const hullBase = this.hullPos.length / 3;
    const v = new Vector3();
    const nv = new Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(m);
      nv.fromBufferAttribute(n, i).applyMatrix3(nm).normalize();
      this.pos.push(v.x, v.y, v.z);
      this.nor.push(nv.x, nv.y, nv.z);
      let k = 1;
      if (opts.shadeBottom) k = 0.8 + 0.2 * Math.min(1, Math.max(0, (v.y - opts.shadeBottom[0]) / opts.shadeBottom[1]));
      this.col.push(color.r * k, color.g * k, color.b * k);
      if (opts.hull) this.hullPos.push(v.x + nv.x * opts.hull, v.y + nv.y * opts.hull, v.z + nv.z * opts.hull);
    }
    const index = g.getIndex();
    const count = index ? index.count : p.count;
    for (let i = 0; i < count; i++) {
      const k = index ? index.getX(i) : i;
      this.idx.push(base + k);
      if (opts.hull) this.hullIdx.push(hullBase + k);
    }
  }

  build(): { body: BufferGeometry; hull: BufferGeometry } {
    const body = new BufferGeometry();
    body.setAttribute('position', new Float32BufferAttribute(this.pos, 3));
    body.setAttribute('normal', new Float32BufferAttribute(this.nor, 3));
    body.setAttribute('color', new Float32BufferAttribute(this.col, 3));
    body.setIndex(this.idx);
    body.computeBoundingSphere();
    const hull = new BufferGeometry();
    hull.setAttribute('position', new Float32BufferAttribute(this.hullPos, 3));
    hull.setIndex(this.hullIdx);
    hull.computeBoundingSphere();
    return { body, hull };
  }
}

const UP = new Vector3(0, 1, 0);

/** A smooth toon egg (lathe, slight tilt) with round spots facing out, and its ink hull. */
function egg(b: SmoothBuilder, shellGeo: BufferGeometry, spotGeo: BufferGeometry, x: number, y: number, z: number, h: number, shell: string, spot: string, tilt: number): void {
  const m = new Matrix4().compose(new Vector3(x, y, z), new Quaternion(), new Vector3(h, h, h));
  b.add(shellGeo, m, new Color(shell), { hull: 0.035, shadeBottom: [y, h * 0.45] });
  // Spots: [height fraction, angle around the egg from the front (−z, toward the sea), size].
  const spots: [number, number, number][] = [[0.3, 0.35, 0.15], [0.56, -0.55, 0.12], [0.74, 0.8, 0.09], [0.42, -1.5, 0.11], [0.5, 1.7, 0.13], [0.22, -0.9, 0.08]];
  const c = new Color(spot);
  const n = new Vector3();
  const q = new Quaternion();
  for (const [s, a, size] of spots) {
    const r = 0.36 * eggRadius(s) * h;
    n.set(Math.sin(a + tilt), 0, -Math.cos(a + tilt));
    const at = new Vector3(x + n.x * r, y + s * h, z + n.z * r);
    // Tilt the outward normal by the shell's slope so the spot lies flat on it.
    const slope = (eggRadius(s + 0.02) - eggRadius(s - 0.02)) / 0.04 * 0.36;
    n.y = -slope;
    n.normalize();
    q.setFromUnitVectors(UP, n);
    const sm = new Matrix4().compose(at.addScaledVector(n, -0.004 * h), q, new Vector3(size * h, 0.035 * h, size * h * 0.85));
    b.add(spotGeo, sm, c);
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
  const eggB = new SmoothBuilder();
  const shellGeo = unitEgg();
  const spotGeo = new SphereGeometry(1, 10, 6);
  eggs.forEach(([dx, dz, h, tilt], i) => {
    const [shell, spot] = EGG_COLORS[i];
    egg(eggB, shellGeo, spotGeo, x + dx, top + 0.1, z + dz, h, shell, spot, tilt);
  });
  shellGeo.dispose();
  spotGeo.dispose();
  const built = eggB.build();
  const eggMesh = new Mesh(built.body, toonVertexMaterial);
  eggMesh.castShadow = true;
  const eggGroup = new Group();
  eggGroup.add(eggMesh, new Mesh(built.hull, inkMaterial));

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
