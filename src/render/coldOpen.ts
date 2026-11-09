import { Group, Mesh, Vector3, type Object3D } from 'three';
import { BoxBuilder } from './boxes';
import { easeInOut, easeOut } from './juice';
import { islandMaterial } from './materials';
import type { Spray } from './waveVisual';
import { waveMaterial, waveMesh } from './waveVisual';

const tmp = new Vector3();
const dirV = new Vector3();
const toCam = new Vector3();

/**
 * G17 cold open: on the first frame of a session a decoy wave crashes over a decoy island on the horizon,
 * 260 m out at yaw +25° from the camera's forward. Non-blocking; about 3 s.
 */
export class ColdOpen {
  readonly group = new Group();
  private readonly wave: Mesh;
  private readonly mat = waveMaterial();
  private readonly island: Mesh;
  private t = -1;
  private shook = false;
  private sprayT = 0;

  constructor(
    parent: Object3D,
    private readonly spray: Spray,
  ) {
    this.wave = waveMesh(this.mat);
    const b = new BoxBuilder({ faces: true });
    b.boxMinMax(-7, -3, -5, 7, 3.2, 5, '#E9D49C');
    b.boxMinMax(-7.15, 2.7, -5.15, 7.15, 3.6, 5.15, '#86E05F', { shadeBottom: 0.4 });
    for (let i = 0; i < 4; i++) b.box(-3 + i * 0.1, 3.6 + i * 1 + 0.5, 1, 0.45, 1.05, 0.45, i % 2 ? '#B07A3A' : '#8A5A28');
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) b.box(-2.6 + dx, 8, 1 + dz, dx ? 1.8 : 0.5, 0.15, dz ? 1.8 : 0.5, '#3FCB4B');
    this.island = new Mesh(b.build(), islandMaterial(false));
    this.island.scale.setScalar(1.6);
    this.group.add(this.island, this.wave);
    this.group.visible = false;
    parent.add(this.group);
  }

  get active(): boolean {
    return this.t >= 0;
  }

  play(camPos: Vector3, camForward: Vector3): void {
    const yaw = Math.atan2(camForward.x, camForward.z) + (25 * Math.PI) / 180;
    dirV.set(Math.sin(yaw), 0, Math.cos(yaw));
    this.group.position.copy(camPos).addScaledVector(dirV, 260).setY(0);
    // The wave travels toward the camera, over the island.
    toCam.copy(camPos).sub(this.group.position).setY(0).normalize();
    this.group.rotation.y = Math.atan2(toCam.x, toCam.z);
    this.t = 0;
    this.shook = false;
    this.group.visible = true;
  }

  /** Returns true once, at 900 ms, when the camera should shake (trauma .15). */
  update(dt: number): boolean {
    if (this.t < 0) return false;
    this.t += dt;
    const t = this.t;
    let shake = false;
    const w = this.wave;
    w.scale.set(0.24, 0.62, 0.6);
    if (t < 0.6) {
      this.mat.uniforms.uGrow.value = 0.15 + 0.85 * easeOut(t / 0.6);
      w.position.z = -16;
    } else if (t < 1.4) {
      const k = (t - 0.6) / 0.8;
      this.mat.uniforms.uGrow.value = 1 - 0.2 * k;
      w.position.z = -16 + easeInOut(k) * 22;
      this.sprayT += dt;
      while (this.sprayT > 0.03) {
        this.sprayT -= 0.03;
        tmp.set((Math.random() - 0.5) * 45, 6 + Math.random() * 4, w.position.z + 2).applyMatrix4(this.group.matrixWorld);
        this.spray.emit(tmp.x, tmp.y, tmp.z, 0, 3 + Math.random() * 3, 0, 4 + Math.random() * 2.5, 0.8);
        this.spray.emit(tmp.x + 3, tmp.y + 1, tmp.z, 0, 4, 0, 5, 0.8);
      }
    } else if (t < 3) {
      const k = (t - 1.4) / 1.6;
      this.mat.uniforms.uGrow.value = Math.max(0.01, 0.8 * (1 - easeOut(k)));
      w.position.z = 6 + k * 4;
    } else {
      this.t = -1;
      this.group.visible = false;
    }
    if (!this.shook && t >= 0.9) {
      this.shook = true;
      shake = true;
    }
    return shake;
  }
}
