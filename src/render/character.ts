import { Group, Matrix4, Mesh, Object3D, Quaternion, Vector3 } from 'three';
import type { PlayerSim } from '../game/player';
import { BoxBuilder } from './boxes';
import { vertexMaterial } from './materials';

const SKIN = '#f3c89b';
const SHIRT = '#ff7b39';
const SHIRT_DARK = '#e2602a';
const PANTS = '#2e4c7d';
const SHOES = '#20232b';
const CAP = '#19b5a5';

function part(build: (b: BoxBuilder) => void): Mesh {
  const b = new BoxBuilder();
  build(b);
  return new Mesh(b.build(), vertexMaterial);
}

const UP = new Vector3(0, 1, 0);
const tmpQ = new Quaternion();
const tmpQ2 = new Quaternion();
const tmpV = new Vector3();
const tmpM = new Matrix4();
const tmpX = new Vector3();
const tmpZ = new Vector3();

/** Blocky player character with simple procedural animation. Faces +z locally. */
export class CharacterRig {
  readonly root = new Group();
  /** Carried creatures stack on this. */
  readonly headTop = new Object3D();
  private readonly body = new Group();
  private readonly armL = new Group();
  private readonly armR = new Group();
  private readonly legL = new Group();
  private readonly legR = new Group();
  private runPhase = 0;
  private spin = 0;
  private readonly targetQuat = new Quaternion();

  constructor() {
    this.root.add(this.body);

    const torso = part((b) => {
      b.box(0, 1.2, 0, 0.84, 0.8, 0.46, SHIRT, { shadeBottom: 0.15 });
      b.box(0, 1.2, 0.235, 0.3, 0.6, 0.02, SHIRT_DARK);
    });
    const head = part((b) => {
      b.box(0, 1.93, 0, 0.66, 0.66, 0.66, SKIN);
      for (const sx of [-1, 1]) b.box(sx * 0.14, 1.98, 0.335, 0.1, 0.14, 0.02, '#1b1b2a');
      b.box(0, 1.8, 0.335, 0.2, 0.05, 0.02, '#9b4a3a');
      b.box(0, 2.31, 0, 0.7, 0.12, 0.7, CAP);
      b.box(0, 2.27, 0.45, 0.6, 0.05, 0.28, CAP);
    });
    this.body.add(torso, head);

    const arm = (g: Group, side: number) => {
      g.position.set(side * 0.57, 1.55, 0);
      g.add(
        part((b) => {
          b.box(0, -0.3, 0, 0.3, 0.6, 0.3, SHIRT);
          b.box(0, -0.68, 0, 0.28, 0.2, 0.28, SKIN);
        }),
      );
      this.body.add(g);
    };
    arm(this.armL, -1);
    arm(this.armR, 1);

    const leg = (g: Group, side: number) => {
      g.position.set(side * 0.21, 0.8, 0);
      g.add(
        part((b) => {
          b.box(0, -0.34, 0, 0.38, 0.68, 0.38, PANTS);
          b.box(0, -0.74, 0.04, 0.4, 0.12, 0.46, SHOES);
        }),
      );
      this.body.add(g);
    };
    leg(this.legL, -1);
    leg(this.legR, 1);

    this.headTop.position.set(0, 2.42, 0);
    this.body.add(this.headTop);
  }

  update(dt: number, sim: PlayerSim, splashed: boolean, time: number): void {
    this.root.position.copy(sim.pos);
    const hs = Math.hypot(sim.vel.x, sim.vel.z);
    const yaw = Math.atan2(sim.facing.x, sim.facing.z);
    const k = 1 - Math.exp(-dt * 14);

    // Orientation: upright and facing travel, or hanging toward the anchor while swinging.
    if (sim.mode === 'swing' && sim.anchor) {
      const ropeDir = tmpV.copy(sim.anchor.pos).sub(sim.pos).setY(sim.anchor.pos.y - sim.pos.y - 1.2).normalize();
      tmpZ.set(sim.facing.x, 0, sim.facing.z);
      tmpX.crossVectors(ropeDir, tmpZ).normalize();
      tmpZ.crossVectors(tmpX, ropeDir).normalize();
      tmpM.makeBasis(tmpX, ropeDir, tmpZ);
      this.targetQuat.setFromRotationMatrix(tmpM);
    } else {
      this.targetQuat.setFromAxisAngle(UP, yaw);
    }
    if (splashed) {
      this.spin += dt * 9;
      tmpQ.setFromAxisAngle(UP, yaw);
      tmpQ2.setFromAxisAngle(tmpV.set(1, 0, 0), this.spin);
      this.targetQuat.copy(tmpQ.multiply(tmpQ2));
      this.root.quaternion.copy(this.targetQuat);
    } else {
      this.spin = 0;
      this.root.quaternion.slerp(this.targetQuat, k);
    }

    // Limbs.
    let armSwing = 0;
    let legSwing = 0;
    let armRaise = 0;
    let armOut = 0.08;
    let legBend = 0;
    if (sim.mode === 'ground') {
      this.runPhase += dt * hs * 1.35;
      const amount = Math.min(1, hs / 7);
      legSwing = Math.sin(this.runPhase) * 0.9 * amount;
      armSwing = -legSwing * 0.85;
      this.body.position.y = Math.abs(Math.sin(this.runPhase)) * 0.06 * amount + Math.sin(time * 2) * 0.01;
    } else if (sim.mode === 'swing') {
      armRaise = Math.PI - 0.15;
      legSwing = Math.sin(time * 6) * 0.15;
      legBend = 0.35;
      this.body.position.y = 0;
    } else {
      armOut = 0.9;
      armRaise = sim.vel.y > 0 ? 0.4 : 0.9;
      legSwing = sim.vel.y > 0 ? 0.5 : -0.2;
      legBend = 0.25;
      this.body.position.y = 0;
    }
    const blend = (cur: number, target: number) => cur + (target - cur) * k;
    this.armL.rotation.x = blend(this.armL.rotation.x, -(armRaise > 0 ? armRaise : armSwing));
    this.armR.rotation.x = blend(this.armR.rotation.x, -(armRaise > 0 ? armRaise : -armSwing));
    this.armL.rotation.z = blend(this.armL.rotation.z, -armOut);
    this.armR.rotation.z = blend(this.armR.rotation.z, armOut);
    this.legL.rotation.x = blend(this.legL.rotation.x, legSwing - legBend);
    this.legR.rotation.x = blend(this.legR.rotation.x, -legSwing - legBend);
  }

  /** World position of the raised hands (where the rope attaches). */
  handPosition(out: Vector3): Vector3 {
    return out.set(0, 2.35, 0).applyMatrix4(this.root.matrixWorld);
  }
}
