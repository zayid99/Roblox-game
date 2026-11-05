import { AdditiveBlending, DynamicDrawUsage, InstancedMesh, Matrix4, MeshBasicMaterial, PlaneGeometry, Vector3, type Object3D } from 'three';
import { smoothstep } from './juice';

const N = 40;
const m = new Matrix4();
const axis = new Vector3();
const toCam = new Vector3();
const xAxis = new Vector3();
const zAxis = new Vector3();
const perp1 = new Vector3();
const perp2 = new Vector3();
const rel = new Vector3();

/** G16 speed lines: 40 additive streaks in a 4–10 m cylinder ahead of the camera, moving at −vel × 1.5. */
export class SpeedLines {
  readonly mesh: InstancedMesh;
  private readonly mat: MeshBasicMaterial;
  private readonly pts: Vector3[] = [];
  private amount = 0;

  constructor(parent: Object3D) {
    this.mat = new MeshBasicMaterial({ color: '#FFFFFF', transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false, opacity: 0 });
    this.mesh = new InstancedMesh(new PlaneGeometry(0.03, 1), this.mat, N);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 7;
    this.mesh.visible = false;
    for (let i = 0; i < N; i++) this.pts.push(new Vector3(0, -1e4, 0));
    parent.add(this.mesh);
  }

  private respawn(p: Vector3, cam: Vector3, dir: Vector3, near: boolean): void {
    perp1.set(-dir.z, 0, dir.x);
    if (perp1.lengthSq() < 1e-6) perp1.set(1, 0, 0);
    perp1.normalize();
    perp2.crossVectors(dir, perp1).normalize();
    const a = Math.random() * Math.PI * 2;
    const r = 4 + Math.random() * 6;
    const along = near ? Math.random() * 18 - 2 : 12 + Math.random() * 8;
    p.copy(cam).addScaledVector(dir, along).addScaledVector(perp1, Math.cos(a) * r).addScaledVector(perp2, Math.sin(a) * r);
  }

  update(dt: number, cam: Vector3, vel: Vector3, enabled: boolean): void {
    const speed = vel.length();
    const want = enabled ? smoothstep(14, 30, speed) * 0.5 : 0;
    this.amount += (want - this.amount) * (1 - Math.exp(-dt * 8));
    const on = this.amount > 0.01;
    if (!on) {
      this.mesh.visible = false;
      for (const p of this.pts) p.y = -1e4;
      return;
    }
    this.mesh.visible = true;
    this.mat.opacity = this.amount;
    axis.copy(vel).divideScalar(Math.max(speed, 1e-4));
    const len = 3 * this.amount * 2;
    for (let i = 0; i < N; i++) {
      const p = this.pts[i];
      p.addScaledVector(vel, -1.5 * dt);
      rel.copy(p).sub(cam);
      const along = rel.dot(axis);
      if (p.y < -1e3 || along < -3 || rel.lengthSq() > 30 * 30) this.respawn(p, cam, axis, p.y < -1e3);
      // Long axis along the velocity, facing the camera.
      toCam.copy(cam).sub(p).normalize();
      xAxis.crossVectors(axis, toCam).normalize();
      zAxis.crossVectors(xAxis, axis);
      m.makeBasis(xAxis, axis, zAxis);
      m.scale(rel.set(1, len, 1));
      m.setPosition(p);
      this.mesh.setMatrixAt(i, m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
