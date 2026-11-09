import { BufferGeometry, Color, Float32BufferAttribute, Matrix3, Matrix4, Uint16BufferAttribute, Uint32BufferAttribute, Vector3 } from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Unit cube faces: outward normal, then 4 corners in counter-clockwise order.
const FACES: { n: [number, number, number]; c: [number, number, number][] }[] = [
  { n: [1, 0, 0], c: [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]] },
  { n: [-1, 0, 0], c: [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]] },
  { n: [0, 1, 0], c: [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]] },
  { n: [0, -1, 0], c: [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]] },
  { n: [0, 0, 1], c: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]] },
  { n: [0, 0, -1], c: [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]] },
];
// Which box axes span u and v per face (0 = x, 1 = y, 2 = z).
const FACE_AXES: [number, number][] = [[2, 1], [2, 1], [0, 2], [0, 2], [0, 1], [0, 1]];

export interface BoxOptions {
  /** Rotation/translation applied after sizing (box is built around its center). */
  matrix?: Matrix4;
  /** Darken the bottom of the box: 0 = no change, 0.5 = bottom half as bright. */
  shadeBottom?: number;
  /** Color for the top face only (e.g. grass on dirt). */
  topColor?: Color | string | number;
  /** Colour for the side faces (top keeps `color`). */
  sideColor?: Color | string | number;
  /** G2 ambient occlusion: vertices within .4 m above this height are darkened up to 20%. */
  ao?: number;
  /** Marks the box as an eye that blinks in the vertex shader; the value is the eye centre y. */
  eye?: number;
  /** Skinning: bone index this box follows rigidly. */
  bone?: number;
  /** Leave this box out of `outline()`. */
  noOutline?: boolean;
}

interface BoxRecord {
  cx: number;
  cy: number;
  cz: number;
  sx: number;
  sy: number;
  sz: number;
  matrix?: Matrix4;
  bone?: number;
}

const tmpColor = new Color();
const tmpTop = new Color();
const tmpSide = new Color();
const tmpV = new Vector3();
const tmpN = new Vector3();
const normalMatrix = new Matrix3();

export interface BoxBuilderOptions {
  /** Adds the `aFace` attribute (u·w, v·h, w, h) used for G7 edge lines. */
  faces?: boolean;
}

/**
 * Collects many colored boxes into one geometry with vertex colors, so a whole
 * island, creature or character part is a single draw call.
 */
export class BoxBuilder {
  private readonly positions: number[] = [];
  private readonly normals: number[] = [];
  private readonly colors: number[] = [];
  private readonly indices: number[] = [];
  private readonly face: number[] = [];
  private readonly eye: number[] = [];
  private readonly skin: number[] = [];
  private readonly records: BoxRecord[] = [];
  private readonly meshes: { geo: BufferGeometry; matrix?: Matrix4 }[] = [];
  private hasEye = false;
  private hasBone = false;

  constructor(private readonly opts: BoxBuilderOptions = {}) {}

  get vertexCount(): number {
    return this.positions.length / 3;
  }

  box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, color: Color | string | number, opts: BoxOptions = {}): this {
    tmpColor.set(color);
    const hasTop = opts.topColor !== undefined;
    if (hasTop) tmpTop.set(opts.topColor!);
    const hasSide = opts.sideColor !== undefined;
    if (hasSide) tmpSide.set(opts.sideColor!);
    const shade = opts.shadeBottom ?? 0;
    if (opts.matrix) normalMatrix.getNormalMatrix(opts.matrix);
    if (opts.eye !== undefined) this.hasEye = true;
    if (opts.bone !== undefined) this.hasBone = true;
    if (!opts.noOutline) this.records.push({ cx, cy, cz, sx, sy, sz, matrix: opts.matrix?.clone(), bone: opts.bone });
    const size = [sx, sy, sz];

    for (let f = 0; f < 6; f++) {
      const face = FACES[f];
      const base = this.vertexCount;
      const isTop = face.n[1] === 1;
      const isSide = face.n[1] === 0;
      const col = isTop && hasTop ? tmpTop : isSide && hasSide ? tmpSide : tmpColor;
      tmpN.set(face.n[0], face.n[1], face.n[2]);
      if (opts.matrix) tmpN.applyMatrix3(normalMatrix).normalize();
      const [au, av] = FACE_AXES[f];
      for (let ci = 0; ci < 4; ci++) {
        const c = face.c[ci];
        tmpV.set((c[0] * sx) / 2, (c[1] * sy) / 2, (c[2] * sz) / 2);
        if (opts.matrix) tmpV.applyMatrix4(opts.matrix);
        const px = tmpV.x + cx;
        const py = tmpV.y + cy;
        const pz = tmpV.z + cz;
        this.positions.push(px, py, pz);
        this.normals.push(tmpN.x, tmpN.y, tmpN.z);
        let k = shade > 0 && c[1] < 0 ? 1 - shade : 1;
        if (opts.ao !== undefined) {
          const d = py - opts.ao;
          if (d >= -0.05 && d < 0.4) k *= 0.8 + 0.2 * Math.max(0, d) / 0.4;
        }
        this.colors.push(col.r * k, col.g * k, col.b * k);
        if (this.opts.faces) {
          // u runs along the first face axis, v along the second (corner order differs per face; use the corner sign).
          const uSign = c[au] > 0 ? 1 : 0;
          const vSign = c[av] > 0 ? 1 : 0;
          this.face.push(uSign * size[au], vSign * size[av], size[au], size[av]);
        }
        this.eye.push(opts.eye !== undefined ? 1 : 0, opts.eye ?? 0);
        this.skin.push(opts.bone ?? 0);
      }
      this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    return this;
  }

  /**
   * Appends any indexed or non-indexed geometry with normals (e.g. an extruded shape) in one colour. Its outline
   * hull is grown along smoothed normals.
   */
  mesh(geo: BufferGeometry, color: Color | string | number, opts: { matrix?: Matrix4; noOutline?: boolean } = {}): this {
    tmpColor.set(color);
    const p = geo.getAttribute('position');
    const n = geo.getAttribute('normal');
    if (opts.matrix) normalMatrix.getNormalMatrix(opts.matrix);
    const base = this.vertexCount;
    for (let i = 0; i < p.count; i++) {
      tmpV.fromBufferAttribute(p, i);
      tmpN.fromBufferAttribute(n, i);
      if (opts.matrix) {
        tmpV.applyMatrix4(opts.matrix);
        tmpN.applyMatrix3(normalMatrix).normalize();
      }
      this.positions.push(tmpV.x, tmpV.y, tmpV.z);
      this.normals.push(tmpN.x, tmpN.y, tmpN.z);
      this.colors.push(tmpColor.r, tmpColor.g, tmpColor.b);
      if (this.opts.faces) this.face.push(1, 1, 2, 2);
      this.eye.push(0, 0);
      this.skin.push(0);
    }
    const index = geo.getIndex();
    const count = index ? index.count : p.count;
    for (let i = 0; i < count; i++) this.indices.push(base + (index ? index.getX(i) : i));
    if (!opts.noOutline) this.meshes.push({ geo, matrix: opts.matrix?.clone() });
    return this;
  }

  /** Box given by its min/max corners. */
  boxMinMax(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: Color | string | number, opts?: BoxOptions): this {
    return this.box((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0, color, opts);
  }

  /** Appends another builder's boxes (keeps its outline records). */
  merge(other: BoxBuilder): this {
    const base = this.vertexCount;
    // Loops, not push(...arr): spreading a big builder (> 65 536 numbers, ~900 boxes) throws a RangeError on
    // Safari/JavaScriptCore, whose argument limit is that low.
    append(this.positions, other.positions);
    append(this.normals, other.normals);
    append(this.colors, other.colors);
    append(this.face, other.face);
    append(this.eye, other.eye);
    append(this.skin, other.skin);
    for (const i of other.indices) this.indices.push(i + base);
    append(this.records, other.records);
    append(this.meshes, other.meshes);
    this.hasEye ||= other.hasEye;
    this.hasBone ||= other.hasBone;
    return this;
  }

  build(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.positions, 3));
    g.setAttribute('normal', new Float32BufferAttribute(this.normals, 3));
    g.setAttribute('color', new Float32BufferAttribute(this.colors, 3));
    if (this.opts.faces) g.setAttribute('aFace', new Float32BufferAttribute(this.face, 4));
    if (this.hasEye) g.setAttribute('aEye', new Float32BufferAttribute(this.eye, 2));
    if (this.hasBone) addSkin(g, this.skin);
    g.setIndex(this.vertexCount > 65535 ? new Uint32BufferAttribute(this.indices, 1) : new Uint16BufferAttribute(this.indices, 1));
    g.computeBoundingSphere();
    return g;
  }

  /**
   * G12 ink outline hull: every box grown by `grow` on each side. Render it `BackSide` in a flat ink
   * material. Keeps the eye attribute shape out (outlines don't blink) but keeps skinning.
   */
  outline(grow = 0.04): BufferGeometry {
    const b = new BoxBuilder();
    for (const r of this.records) {
      b.box(r.cx, r.cy, r.cz, r.sx + grow * 2, r.sy + grow * 2, r.sz + grow * 2, 0x000000, { matrix: r.matrix, bone: r.bone });
    }
    for (const m of this.meshes) b.mesh(grownHull(m.geo, grow, m.matrix), 0x000000);
    const g = b.build();
    g.deleteAttribute('color');
    g.deleteAttribute('normal');
    return g;
  }
}

/** A copy of `geo` (transformed) with corners welded and every vertex pushed out along its smoothed normal. */
function grownHull(geo: BufferGeometry, grow: number, matrix?: Matrix4): BufferGeometry {
  const src = new BufferGeometry();
  src.setAttribute('position', geo.getAttribute('position').clone());
  if (geo.getIndex()) src.setIndex(geo.getIndex()!.clone());
  if (matrix) src.applyMatrix4(matrix);
  const welded = mergeVertices(src, 1e-4);
  welded.computeVertexNormals();
  const p = welded.getAttribute('position');
  const n = welded.getAttribute('normal');
  for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) + n.getX(i) * grow, p.getY(i) + n.getY(i) * grow, p.getZ(i) + n.getZ(i) * grow);
  src.dispose();
  return welded;
}

function append<T>(into: T[], from: readonly T[]): void {
  for (let i = 0; i < from.length; i++) into.push(from[i]);
}

function addSkin(g: BufferGeometry, bones: number[]): void {
  const idx = new Uint16Array(bones.length * 4);
  const w = new Float32Array(bones.length * 4);
  for (let i = 0; i < bones.length; i++) {
    idx[i * 4] = bones[i];
    w[i * 4] = 1;
  }
  g.setAttribute('skinIndex', new Uint16BufferAttribute(idx, 4));
  g.setAttribute('skinWeight', new Float32BufferAttribute(w, 4));
}
