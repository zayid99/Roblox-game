import {
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Float32BufferAttribute,
  IcosahedronGeometry,
  InstancedMesh,
  Matrix4,
  MeshLambertMaterial,
  Quaternion,
  Vector3,
} from 'three';
import { Rng } from '../game/rng';

const TOP = new Color('#FFFFFF');
const UNDER = new Color('#D9E6FF');

/** One puffy cluster: 6 icosahedron blobs with flattened bottoms, white on top, blue-grey underneath. */
function puffGeometry(rng: Rng): BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const blob = new IcosahedronGeometry(1, 1);
  const src = blob.getAttribute('position');
  const blobs: [number, number, number, number][] = [
    [0, 0.2, 0, 1.25],
    [-1.3, 0, 0.1, 0.95],
    [1.35, -0.05, -0.1, 1.0],
    [-0.5, 0.75, -0.2, 0.9],
    [0.65, 0.65, 0.25, 0.85],
    [2.3, -0.25, 0.1, 0.65],
    [-2.2, -0.25, -0.1, 0.6],
  ];
  const c = new Color();
  for (const [bx, by, bz, r0] of blobs) {
    const r = r0 * rng.range(0.9, 1.1);
    for (let i = 0; i < src.count; i++) {
      let y = src.getY(i) * r + by;
      y = Math.max(y, -0.35);
      const x = src.getX(i) * r + bx;
      const z = src.getZ(i) * r * 0.85 + bz;
      pos.push(x, y, z);
      c.copy(UNDER).lerp(TOP, Math.min(1, Math.max(0, (y + 0.35) / 1.1)));
      col.push(c.r, c.g, c.b);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  blob.dispose();
  return g;
}

interface Cloud {
  x: number;
  y: number;
  z: number;
  s: number;
  yaw: number;
  speed: number;
}

const m = new Matrix4();
const q = new Quaternion();
const v = new Vector3();
const sc = new Vector3();
const UP = new Vector3(0, 1, 0);

/** G6 clouds: one InstancedMesh, a ring 250–650 m around the camera, drifting 1–3 m/s and wrapping. */
export class Clouds {
  readonly mesh: InstancedMesh;
  private readonly clouds: Cloud[] = [];
  private readonly rng = new Rng(77);

  constructor(max = 40) {
    const mat = new MeshLambertMaterial({ vertexColors: true, fog: false, emissive: new Color('#B8CCEB'), emissiveIntensity: 0.55 });
    this.mesh = new InstancedMesh(puffGeometry(new Rng(5)), mat, max);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    for (let i = 0; i < max; i++) {
      const a = this.rng.range(0, Math.PI * 2);
      const d = this.rng.range(250, 650);
      this.clouds.push({ x: Math.cos(a) * d, y: this.rng.range(55, 120), z: Math.sin(a) * d, s: this.rng.range(9, 18), yaw: this.rng.range(0, 6.28), speed: this.rng.range(1, 3) });
    }
    this.mesh.count = max;
  }

  setCount(n: number): void {
    this.mesh.count = Math.min(n, this.clouds.length);
  }

  update(dt: number, cam: Vector3): void {
    for (let i = 0; i < this.mesh.count; i++) {
      const c = this.clouds[i];
      c.x += c.speed * dt;
      const dx = c.x - cam.x;
      const dz = c.z - cam.z;
      const d = Math.hypot(dx, dz);
      if (d > 660 || d < 240) {
        // Re-enter on the upwind side of the ring.
        const a = this.rng.range(Math.PI * 0.6, Math.PI * 1.4);
        const r = this.rng.range(300, 640);
        c.x = cam.x + Math.cos(a) * r;
        c.z = cam.z + Math.sin(a) * r;
      }
      q.setFromAxisAngle(UP, c.yaw);
      sc.set(c.s, c.s * 0.8, c.s);
      m.compose(v.set(c.x, c.y, c.z), q, sc);
      this.mesh.setMatrixAt(i, m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
