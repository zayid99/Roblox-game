import { BoxGeometry, Color, DynamicDrawUsage, InstancedMesh, Matrix4, MeshBasicMaterial, Quaternion, Vector3, type Scene } from 'three';

interface Particle {
  pos: Vector3;
  vel: Vector3;
  life: number;
  maxLife: number;
  size: number;
  gravity: number;
  spin: number;
  color: Color;
}

const MAX = 500;
const m = new Matrix4();
const q = new Quaternion();
const s = new Vector3();
const axis = new Vector3(1, 1, 0).normalize();

/** Blocky particle bursts (splashes, sparkles, coins) in one instanced draw call. */
export class Particles {
  private readonly mesh: InstancedMesh;
  private readonly items: Particle[] = [];

  constructor(scene: Scene) {
    this.mesh = new InstancedMesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial({ color: '#ffffff' }), MAX);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.setColorAt(0, new Color());
    scene.add(this.mesh);
  }

  burst(
    at: Vector3,
    color: Color | string,
    count: number,
    opts: { speed?: number; up?: number; size?: number; life?: number; gravity?: number; spread?: number } = {},
  ): void {
    const c = color instanceof Color ? color : new Color(color);
    const speed = opts.speed ?? 6;
    for (let i = 0; i < count; i++) {
      if (this.items.length >= MAX) this.items.shift();
      const dir = new Vector3(Math.random() - 0.5, Math.random() * 0.6 + 0.2, Math.random() - 0.5).normalize();
      const spread = opts.spread ?? 0.3;
      this.items.push({
        pos: at.clone().add(new Vector3((Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread, (Math.random() - 0.5) * spread)),
        vel: dir.multiplyScalar(speed * (0.5 + Math.random() * 0.7)).add(new Vector3(0, opts.up ?? 0, 0)),
        life: 0,
        maxLife: (opts.life ?? 0.8) * (0.7 + Math.random() * 0.6),
        size: (opts.size ?? 0.25) * (0.6 + Math.random() * 0.8),
        gravity: opts.gravity ?? 18,
        spin: Math.random() * 10,
        color: c,
      });
    }
  }

  update(dt: number): void {
    let n = 0;
    for (let i = this.items.length - 1; i >= 0; i--) {
      const p = this.items[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        this.items.splice(i, 1);
        continue;
      }
      p.vel.y -= p.gravity * dt;
      p.pos.addScaledVector(p.vel, dt);
      p.spin += dt * 6;
    }
    for (const p of this.items) {
      const k = 1 - p.life / p.maxLife;
      q.setFromAxisAngle(axis, p.spin);
      s.setScalar(p.size * (0.3 + 0.7 * k));
      m.compose(p.pos, q, s);
      this.mesh.setMatrixAt(n, m);
      this.mesh.setColorAt(n, p.color);
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
