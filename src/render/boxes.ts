import { BufferGeometry, Color, Float32BufferAttribute, Matrix3, Matrix4, Uint32BufferAttribute, Vector3 } from 'three';

// Unit cube faces: outward normal, then 4 corners in counter-clockwise order.
const FACES: { n: [number, number, number]; c: [number, number, number][] }[] = [
  { n: [1, 0, 0], c: [[1, -1, 1], [1, -1, -1], [1, 1, -1], [1, 1, 1]] },
  { n: [-1, 0, 0], c: [[-1, -1, -1], [-1, -1, 1], [-1, 1, 1], [-1, 1, -1]] },
  { n: [0, 1, 0], c: [[-1, 1, 1], [1, 1, 1], [1, 1, -1], [-1, 1, -1]] },
  { n: [0, -1, 0], c: [[-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1]] },
  { n: [0, 0, 1], c: [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]] },
  { n: [0, 0, -1], c: [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]] },
];

export interface BoxOptions {
  /** Rotation/translation applied after sizing (box is built around its center). */
  matrix?: Matrix4;
  /** Darken the bottom of the box: 0 = no change, 0.5 = bottom half as bright. */
  shadeBottom?: number;
  /** Color for the top face only (e.g. grass on dirt). */
  topColor?: Color | string | number;
}

const tmpColor = new Color();
const tmpTop = new Color();
const tmpV = new Vector3();
const tmpN = new Vector3();
const normalMatrix = new Matrix3();

/**
 * Collects many colored boxes into one geometry with vertex colors, so a whole
 * island, creature or character part is a single draw call.
 */
export class BoxBuilder {
  private readonly positions: number[] = [];
  private readonly normals: number[] = [];
  private readonly colors: number[] = [];
  private readonly indices: number[] = [];

  get vertexCount(): number {
    return this.positions.length / 3;
  }

  box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, color: Color | string | number, opts: BoxOptions = {}): this {
    tmpColor.set(color);
    const hasTop = opts.topColor !== undefined;
    if (hasTop) tmpTop.set(opts.topColor!);
    const shade = opts.shadeBottom ?? 0;
    if (opts.matrix) normalMatrix.getNormalMatrix(opts.matrix);

    for (const face of FACES) {
      const base = this.vertexCount;
      const isTop = face.n[1] === 1;
      const col = isTop && hasTop ? tmpTop : tmpColor;
      tmpN.set(face.n[0], face.n[1], face.n[2]);
      if (opts.matrix) tmpN.applyMatrix3(normalMatrix).normalize();
      for (const c of face.c) {
        tmpV.set((c[0] * sx) / 2, (c[1] * sy) / 2, (c[2] * sz) / 2);
        if (opts.matrix) tmpV.applyMatrix4(opts.matrix);
        this.positions.push(tmpV.x + cx, tmpV.y + cy, tmpV.z + cz);
        this.normals.push(tmpN.x, tmpN.y, tmpN.z);
        const k = shade > 0 && c[1] < 0 ? 1 - shade : 1;
        this.colors.push(col.r * k, col.g * k, col.b * k);
      }
      this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
    return this;
  }

  /** Box given by its min/max corners. */
  boxMinMax(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, color: Color | string | number, opts?: BoxOptions): this {
    return this.box((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0, color, opts);
  }

  build(): BufferGeometry {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.positions, 3));
    g.setAttribute('normal', new Float32BufferAttribute(this.normals, 3));
    g.setAttribute('color', new Float32BufferAttribute(this.colors, 3));
    g.setIndex(new Uint32BufferAttribute(this.indices, 1));
    g.computeBoundingSphere();
    return g;
  }
}
