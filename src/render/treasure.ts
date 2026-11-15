// Treasure Bottles in the world (src/game/treasure.ts): an outlined voxel bottle with a cork and a rolled map,
// bobbing on its island under a soft light beam, and the one the player carries over their head.
// Three instanced draw calls for every bottle: bodies, ink outlines and beams.
import {
  AdditiveBlending,
  Color,
  CylinderGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Matrix4,
  Quaternion,
  ShaderMaterial,
  Vector3,
} from 'three';
import type { BottleKind } from '../contracts';
import type { Bottle } from '../game/treasure';
import { BoxBuilder } from './boxes';
import { inkMaterial, toonVertexMaterial } from './materials';
import type { Particles } from './particles';

const MAX = 8;
const TINT: Record<BottleKind, Color> = { normal: new Color('#9AF6EA'), legendary: new Color('#FFD54A') };
const SPARK: Record<BottleKind, string> = { normal: '#BFFFF6', legendary: '#FFE58A' };
const BEAM: Record<BottleKind, Color> = { normal: new Color('#7FF3FF'), legendary: new Color('#FFD34D') };

/** The bottle, about 0.9 m tall, standing on its base (y = 0). Colours are multiplied by the instance tint. */
function bottleBuilder(): BoxBuilder {
  const b = new BoxBuilder();
  b.box(0, 0.32, 0, 0.56, 0.64, 0.56, '#FFFFFF', { shadeBottom: 0.25 }); // glass body
  b.box(0, 0.7, 0, 0.36, 0.14, 0.36, '#E8FFFF'); // shoulder
  b.box(0, 0.86, 0, 0.22, 0.2, 0.22, '#FFFFFF'); // neck
  b.box(0, 1.02, 0, 0.26, 0.14, 0.26, '#9C6A3A'); // cork
  b.box(0, 0.34, 0.29, 0.34, 0.3, 0.02, '#FFF6D8', { noOutline: true }); // the map inside, seen through the glass
  b.box(0, 0.34, -0.29, 0.34, 0.3, 0.02, '#FFF6D8', { noOutline: true });
  b.box(0.29, 0.34, 0, 0.02, 0.3, 0.34, '#F6E7B8', { noOutline: true });
  b.box(-0.29, 0.34, 0, 0.02, 0.3, 0.34, '#F6E7B8', { noOutline: true });
  b.box(0.13, 0.5, 0.29, 0.08, 0.2, 0.03, '#FFFFFF', { noOutline: true }); // glint
  return b;
}

const beamMaterial = () =>
  new ShaderMaterial({
    uniforms: {},
    vertexShader: /* glsl */ `
      varying float vY;
      varying vec3 vCol;
      void main() {
        vY = uv.y;
        #ifdef USE_INSTANCING_COLOR
          vCol = instanceColor;
        #else
          vCol = vec3(1.0);
        #endif
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      varying float vY;
      varying vec3 vCol;
      void main() {
        float a = (1.0 - vY) * (1.0 - vY) * 0.7;
        gl_FragColor = vec4(vCol * a, a);
      }`,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
  });

const m4 = new Matrix4();
const q = new Quaternion();
const s = new Vector3();
const p = new Vector3();
const UP = new Vector3(0, 1, 0);

export interface TreasureFrame {
  time: number;
  /** Sim time (bottles pop in from Bottle.bornAt). */
  simTime: number;
  dt: number;
  world: readonly Bottle[];
  carried: readonly Bottle[];
  /** Feet of the player (the carried bottle floats above their head). */
  player: Vector3;
  hidePlayer: boolean;
  outlines: boolean;
  reduceMotion: boolean;
}

export class TreasureVisuals {
  readonly group = new Group();
  private readonly bodies: InstancedMesh;
  private readonly outlines: InstancedMesh;
  private readonly beams: InstancedMesh;
  private sparkT = 0;

  constructor(private readonly particles: Particles) {
    const b = bottleBuilder();
    this.bodies = new InstancedMesh(b.build(), toonVertexMaterial, MAX);
    this.outlines = new InstancedMesh(b.outline(0.05), inkMaterial, MAX);
    const beamGeo = new CylinderGeometry(0.3, 0.55, 18, 10, 1, true).translate(0, 9, 0);
    this.beams = new InstancedMesh(beamGeo, beamMaterial(), MAX);
    this.beams.renderOrder = 4;
    for (const m of [this.bodies, this.outlines, this.beams]) {
      m.instanceMatrix.setUsage(DynamicDrawUsage);
      m.frustumCulled = false;
      m.count = 0;
    }
    // Instance colours (allocates instanceColor).
    for (let i = 0; i < MAX; i++) {
      this.bodies.setColorAt(i, TINT.normal);
      this.beams.setColorAt(i, BEAM.normal);
    }
    this.group.add(this.beams, this.outlines, this.bodies);
  }

  update(f: TreasureFrame): void {
    let n = 0;
    let nb = 0;
    this.sparkT -= f.dt;
    const spark = this.sparkT <= 0;
    if (spark) this.sparkT = f.reduceMotion ? 0.35 : 0.12;
    for (const b of f.world) {
      if (n >= MAX) break;
      const age = f.simTime - b.bornAt;
      // Pop in over 0.4 s with a little overshoot, then bob and turn.
      const k = Math.min(1, Math.max(0, age / 0.4));
      const pop = k < 1 ? 1 - Math.pow(1 - k, 3) * Math.cos(k * 7) : 1;
      const scale = (b.kind === 'legendary' ? 2.1 : 1.7) * Math.max(0.01, pop);
      const bob = f.reduceMotion ? 0 : Math.sin(f.time * 2.2 + b.uid) * 0.12;
      p.set(b.pos.x, b.pos.y + 0.15 + bob, b.pos.z);
      q.setFromAxisAngle(UP, f.time * 0.9 + b.uid).multiply(tilt.setFromAxisAngle(Z, Math.sin(f.time * 1.7 + b.uid) * 0.18));
      this.place(n, p, q, scale, b.kind, f.outlines);
      m4.compose(s.set(1, 1, 1).multiplyScalar(b.kind === 'legendary' ? 1.3 : 1), q.identity(), tmp.set(b.pos.x, b.pos.y, b.pos.z));
      this.beams.setMatrixAt(nb, m4);
      this.beams.setColorAt(nb, BEAM[b.kind]);
      nb++;
      n++;
      if (spark) {
        const a = Math.random() * Math.PI * 2;
        this.particles.emit(b.pos.x + Math.cos(a) * 0.5, b.pos.y + 0.4 + Math.random() * 0.8, b.pos.z + Math.sin(a) * 0.5, 0, 1.6, 0, SPARK[b.kind], 0.22, 0.8, -1, true);
      }
    }
    if (!f.hidePlayer) {
      f.carried.forEach((b, i) => {
        if (n >= MAX) return;
        const bob = f.reduceMotion ? 0 : Math.sin(f.time * 4 + i) * 0.06;
        p.set(f.player.x + (i - (f.carried.length - 1) / 2) * 0.7, f.player.y + 3.1 + bob, f.player.z);
        q.setFromAxisAngle(UP, f.time * 1.6 + i);
        this.place(n++, p, q, 1.05, b.kind, f.outlines);
      });
    }
    this.bodies.count = n;
    this.outlines.count = f.outlines ? n : 0;
    this.beams.count = nb;
    this.bodies.instanceMatrix.needsUpdate = true;
    this.outlines.instanceMatrix.needsUpdate = true;
    this.beams.instanceMatrix.needsUpdate = true;
    if (this.bodies.instanceColor) this.bodies.instanceColor.needsUpdate = true;
    if (this.beams.instanceColor) this.beams.instanceColor.needsUpdate = true;
  }

  /** A pick-up or opening: a burst of glints where it happened. */
  burst(at: Vector3, kind: BottleKind): void {
    this.particles.burst(at, SPARK[kind], 18, { speed: 5, up: 4, size: 0.3, life: 0.7, additive: true, gravity: 4 });
    this.particles.burst(at, kind === 'legendary' ? '#FFC92E' : '#2DE2FF', 10, { speed: 4, up: 5, size: 0.22, life: 0.6 });
  }

  private place(i: number, pos: Vector3, rot: Quaternion, scale: number, kind: BottleKind, outlines: boolean): void {
    m4.compose(pos, rot, s.set(scale, scale, scale));
    this.bodies.setMatrixAt(i, m4);
    this.bodies.setColorAt(i, TINT[kind]);
    if (outlines) this.outlines.setMatrixAt(i, m4);
  }
}

const tilt = new Quaternion();
const Z = new Vector3(0, 0, 1);
const tmp = new Vector3();
