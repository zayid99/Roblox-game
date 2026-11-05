import {
  AdditiveBlending,
  BoxGeometry,
  BufferGeometry,
  Color,
  DoubleSide,
  DynamicDrawUsage,
  Float32BufferAttribute,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  Quaternion,
  Vector3,
  type Object3D,
} from 'three';

export interface BurstOptions {
  speed?: number;
  up?: number;
  size?: number;
  life?: number;
  gravity?: number;
  spread?: number;
  /** Additive sparkle/star instead of a solid block. */
  additive?: boolean;
  /** Puffs grow .6 → 1.2 then shrink (landing dust); blocks shrink. */
  puff?: boolean;
  /** Fraction of upward bias in the random direction (default .6). */
  lift?: number;
  /** Mostly horizontal ring (landing dust, splash rings). */
  flat?: boolean;
  drag?: number;
}

const colorCache = new Map<string, Color>();
function toColor(c: Color | string): Color {
  if (typeof c !== 'string') return c;
  let v = colorCache.get(c);
  if (!v) {
    v = new Color(c);
    colorCache.set(c, v);
  }
  return v;
}

const STRIDE = 16;
const m = new Matrix4();
const q = new Quaternion();
const s = new Vector3();
const p = new Vector3();
const axis = new Vector3(1, 1, 0).normalize();

/** One pool (structure-of-arrays, swap-remove, no allocation per burst). */
class Pool {
  readonly mesh: InstancedMesh;
  private readonly d: Float32Array;
  n = 0;
  cap: number;

  constructor(
    geo: BufferGeometry,
    mat: MeshBasicMaterial,
    readonly max: number,
    private readonly billboard: boolean,
  ) {
    this.cap = max;
    this.d = new Float32Array(max * STRIDE);
    this.mesh = new InstancedMesh(geo, mat, max);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(max * 3), 3);
    this.mesh.instanceColor.setUsage(DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
  }

  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, grav: number, col: Color, puff: number, drag: number): void {
    let i = this.n;
    if (i >= this.cap) i = Math.floor(Math.random() * this.cap);
    else this.n++;
    const o = i * STRIDE;
    const d = this.d;
    d[o] = x;
    d[o + 1] = y;
    d[o + 2] = z;
    d[o + 3] = vx;
    d[o + 4] = vy;
    d[o + 5] = vz;
    d[o + 6] = 0;
    d[o + 7] = life;
    d[o + 8] = size;
    d[o + 9] = grav;
    d[o + 10] = Math.random() * 6;
    d[o + 11] = col.r;
    d[o + 12] = col.g;
    d[o + 13] = col.b;
    d[o + 14] = puff;
    d[o + 15] = drag;
  }

  update(dt: number, camQ: Quaternion): void {
    const d = this.d;
    let i = 0;
    while (i < this.n) {
      const o = i * STRIDE;
      d[o + 6] += dt;
      if (d[o + 6] >= d[o + 7]) {
        // Swap-remove.
        this.n--;
        if (i !== this.n) d.copyWithin(o, this.n * STRIDE, this.n * STRIDE + STRIDE);
        continue;
      }
      const drag = Math.exp(-d[o + 15] * dt);
      d[o + 3] *= drag;
      d[o + 5] *= drag;
      d[o + 4] = d[o + 4] * drag - d[o + 9] * dt;
      d[o] += d[o + 3] * dt;
      d[o + 1] += d[o + 4] * dt;
      d[o + 2] += d[o + 5] * dt;
      d[o + 10] += dt * 6;
      const k = d[o + 6] / d[o + 7];
      const scale = d[o + 14] > 0 ? (k < 0.4 ? 0.6 + (k / 0.4) * 0.6 : 1.2 * (1 - (k - 0.4) / 0.6)) : 0.3 + 0.7 * (1 - k);
      if (this.billboard) q.copy(camQ);
      else q.setFromAxisAngle(axis, d[o + 10]);
      s.setScalar(d[o + 8] * scale);
      m.compose(p.set(d[o], d[o + 1], d[o + 2]), q, s);
      this.mesh.setMatrixAt(i, m);
      this.mesh.instanceColor!.setXYZ(i, d[o + 11], d[o + 12], d[o + 13]);
      i++;
    }
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor!.needsUpdate = true;
  }
}

function sparkleGeometry(): BufferGeometry {
  // A 4-point star in the XY plane.
  const pts: number[] = [];
  const r1 = 0.5;
  const r2 = 0.14;
  for (let i = 0; i < 8; i++) {
    const a0 = (i / 8) * Math.PI * 2;
    const a1 = ((i + 1) / 8) * Math.PI * 2;
    const ra = i % 2 === 0 ? r1 : r2;
    const rb = i % 2 === 0 ? r2 : r1;
    pts.push(0, 0, 0, Math.sin(a0) * ra, Math.cos(a0) * ra, 0, Math.sin(a1) * rb, Math.cos(a1) * rb, 0);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pts, 3));
  return g;
}

const dir = new Vector3();

/** G14 particles: a solid block pool and an additive sparkle pool, both preallocated. */
export class Particles {
  private readonly solid: Pool;
  private readonly glow: Pool;
  private readonly camQ = new Quaternion();

  constructor(parent: Object3D, cap = 500) {
    this.solid = new Pool(new BoxGeometry(1, 1, 1), new MeshBasicMaterial({ color: '#ffffff' }), 500, false);
    this.glow = new Pool(
      sparkleGeometry(),
      new MeshBasicMaterial({ color: '#ffffff', transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }),
      300,
      true,
    );
    this.glow.mesh.renderOrder = 5;
    this.setCap(cap);
    parent.add(this.solid.mesh, this.glow.mesh);
  }

  setCap(cap: number): void {
    this.solid.cap = Math.min(this.solid.max, cap);
    this.glow.cap = Math.min(this.glow.max, Math.round(cap * 0.6));
  }

  get count(): number {
    return this.solid.n + this.glow.n;
  }

  burst(at: { x: number; y: number; z: number }, color: Color | string, count: number, opts: BurstOptions = {}): void {
    const c = toColor(color);
    const speed = opts.speed ?? 6;
    const spread = opts.spread ?? 0.3;
    const lift = opts.lift ?? 0.6;
    const pool = opts.additive ? this.glow : this.solid;
    for (let i = 0; i < count; i++) {
      dir.set(Math.random() - 0.5, opts.flat ? Math.random() * 0.15 : Math.random() * lift + 0.2, Math.random() - 0.5).normalize();
      const v = speed * (0.5 + Math.random() * 0.7);
      pool.spawn(
        at.x + (Math.random() - 0.5) * spread,
        at.y + (Math.random() - 0.5) * spread,
        at.z + (Math.random() - 0.5) * spread,
        dir.x * v,
        dir.y * v + (opts.up ?? 0),
        dir.z * v,
        (opts.life ?? 0.8) * (0.7 + Math.random() * 0.6),
        (opts.size ?? 0.25) * (0.6 + Math.random() * 0.8),
        opts.gravity ?? 18,
        c,
        opts.puff ? 1 : 0,
        opts.drag ?? 0,
      );
    }
  }

  /** One particle with an exact velocity (spray columns, embers, trails). */
  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, color: Color | string, size: number, life: number, gravity: number, additive = false): void {
    (additive ? this.glow : this.solid).spawn(x, y, z, vx, vy, vz, life, size, gravity, toColor(color), 0, 0);
  }

  update(dt: number, cameraQuaternion?: Quaternion): void {
    if (cameraQuaternion) this.camQ.copy(cameraQuaternion);
    this.solid.update(dt, this.camQ);
    this.glow.update(dt, this.camQ);
  }
}
