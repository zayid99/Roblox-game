import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  RingGeometry,
  ShaderMaterial,
  Vector3,
} from 'three';
import type { Anchor, Course } from '../game/course';
import { BoxBuilder } from './boxes';
import { inkMaterial, islandMaterial, sharedTime, toonVertexMaterial } from './materials';
import type { Particles } from './particles';
import { waveHeight } from './water';

// The features team adds these to the sim in parallel (§9.0). Read them defensively so render compiles before and after.
export interface BuoyLike { id: number; pos: Vector3; radius: number }
export interface GeyserLike { id: number; pos: Vector3; radius: number; phase: number }
export interface DriftLike { baseX: number; amp: number; period: number; phase: number }
export type GeyserPhase = 'idle' | 'warning' | 'erupting';

export function courseBuoys(c: Course): readonly BuoyLike[] {
  return (c as unknown as { buoys?: BuoyLike[] }).buoys ?? [];
}
export function courseGeysers(c: Course): readonly GeyserLike[] {
  return (c as unknown as { geysers?: GeyserLike[] }).geysers ?? [];
}
export function anchorDrift(a: Anchor): DriftLike | null {
  return (a as unknown as { drift?: DriftLike }).drift ?? null;
}
/** Geyser phase from the sim if it has `geyserState`, else from the spec cycle (4 s idle, 1 s warning, 2 s eruption). */
export function geyserPhase(sim: unknown, g: GeyserLike, simTime: number): { phase: GeyserPhase; t: number } {
  const c = (((simTime + g.phase) % 7) + 7) % 7;
  const fromSpec: GeyserPhase = c < 4 ? 'idle' : c < 5 ? 'warning' : 'erupting';
  const fn = (sim as { geyserState?: (id: number) => unknown }).geyserState;
  let phase = fromSpec;
  if (typeof fn === 'function') {
    const r = fn.call(sim, g.id);
    if (r === 'idle' || r === 'warning' || r === 'erupting') phase = r;
  }
  phaseOut.phase = phase;
  phaseOut.t = phase === 'idle' ? c : phase === 'warning' ? c - 4 : c - 5;
  return phaseOut;
}

function buoyGeometry(): BufferGeometry {
  // Red/white striped cylinder r 1.4, h 1.2 (top at y 0), white top with a coral ring.
  const g = new CylinderGeometry(1.4, 1.5, 1.2, 14, 4).translate(0, -0.6, 0);
  const pos = g.getAttribute('position');
  const col: number[] = [];
  const red = new Color('#FF4D5E');
  const white = new Color('#FFFFFF');
  const coral = new Color('#FF7A59');
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const r = Math.hypot(pos.getX(i), pos.getZ(i));
    let c = Math.floor((y + 1.2) / 0.3) % 2 ? white : red;
    if (y > -0.01) c = r > 0.95 && r < 1.2 ? coral : white;
    col.push(c.r, c.g, c.b);
  }
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  return g;
}

const m = new Matrix4();
const q = new Quaternion();
const v = new Vector3();
const s = new Vector3();
const tmpC = new Color();
const phaseOut: { phase: GeyserPhase; t: number } = { phase: 'idle', t: 0 };

/** G18 gameplay objects: bounce buoys, drifting-hook rails and volcano geysers. */
export class GameplayObjects {
  readonly group = new Group();
  private readonly buoys: readonly BuoyLike[];
  private readonly geysers: readonly GeyserLike[];
  private readonly buoyMesh: InstancedMesh | null = null;
  private readonly buoyHull: InstancedMesh | null = null;
  private readonly squash = new Map<number, number>();
  private readonly columns: InstancedMesh | null = null;
  private readonly rings: InstancedMesh | null = null;
  private readonly lastPhase = new Map<number, GeyserPhase>();
  private bubbleT = 0;

  constructor(course: Course) {
    this.buoys = courseBuoys(course);
    this.geysers = courseGeysers(course);
    if (this.buoys.length) {
      this.buoyMesh = new InstancedMesh(buoyGeometry(), toonVertexMaterial, this.buoys.length);
      this.buoyHull = new InstancedMesh(new CylinderGeometry(1.47, 1.57, 1.32, 14, 1).translate(0, -0.6, 0), inkMaterial, this.buoys.length);
      for (const im of [this.buoyMesh, this.buoyHull]) {
        im.instanceMatrix.setUsage(DynamicDrawUsage);
        im.frustumCulled = false;
        this.group.add(im);
      }
      this.buoyMesh.castShadow = true;
    }
    // Drifting hook rails: a small blue rail box (2 × amp + 1 m) above the hook's balloon, so the path reads.
    const rails = new BoxBuilder({ faces: true });
    let anyRail = false;
    for (const a of course.anchors) {
      const d = anchorDrift(a);
      if (!d) continue;
      anyRail = true;
      const y = a.pos.y + 3.9;
      rails.box(d.baseX, y, a.pos.z, d.amp * 2 + 1, 0.22, 0.3, '#3AA8FF', { topColor: '#7FD8FF' });
      for (const sx of [-1, 1]) rails.box(d.baseX + sx * (d.amp + 0.5), y, a.pos.z, 0.36, 0.5, 0.42, '#1F3F7A');
    }
    if (anyRail) {
      const mesh = new Mesh(rails.build(), islandMaterial(true));
      mesh.castShadow = true;
      this.group.add(mesh);
    }
    // Geysers: a dark rock ring with a vent, a warning ring decal, and an eruption column.
    if (this.geysers.length) {
      const rock = new BoxBuilder({ faces: true });
      for (const g of this.geysers) {
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2;
          rock.box(g.pos.x + Math.cos(a) * 1.5, g.pos.y + 0.2, g.pos.z + Math.sin(a) * 1.5, 0.75, 0.4 + (k % 2) * 0.15, 0.75, k % 2 ? '#4A3530' : '#5A3A32', { ao: g.pos.y });
        }
        rock.box(g.pos.x, g.pos.y + 0.03, g.pos.z, 1.8, 0.06, 1.8, '#2A1C1A', { noOutline: true });
      }
      const rm = new Mesh(rock.build(), islandMaterial(true));
      rm.castShadow = true;
      rm.receiveShadow = true;
      this.group.add(rm);
      this.columns = new InstancedMesh(
        new CylinderGeometry(0.9, 1.1, 1, 14, 1, true).translate(0, 0.5, 0),
        new ShaderMaterial({
          transparent: true,
          depthWrite: false,
          blending: AdditiveBlending,
          side: DoubleSide,
          uniforms: { uTime: sharedTime },
          vertexShader: `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
          fragmentShader: `uniform float uTime; varying vec2 vUv;
            void main() {
              float streak = 0.65 + 0.35 * sin(vUv.x * 40.0 + vUv.y * 6.0 - uTime * 14.0);
              float a = (0.35 + 0.5 * vUv.y) * streak * smoothstep(1.0, 0.85, vUv.y);
              gl_FragColor = vec4(vec3(0.75, 0.92, 1.0) * a, a);
            }`,
        }),
        this.geysers.length,
      );
      this.rings = new InstancedMesh(new RingGeometry(1.2, 1.5, 28).rotateX(-Math.PI / 2), new MeshBasicMaterial({ color: '#FFB27A', transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false }), this.geysers.length);
      for (const im of [this.columns, this.rings]) {
        im.instanceMatrix.setUsage(DynamicDrawUsage);
        im.frustumCulled = false;
        im.count = 0;
        this.group.add(im);
      }
      this.columns.renderOrder = 6;
    }
  }

  /** `bounce` event: squash the buoy .6 → 1 over 120 ms and splash a ring. */
  onBounce(id: number, time: number, particles: Particles): void {
    this.squash.set(id, time);
    const b = this.buoys.find((x) => x.id === id);
    if (b) particles.burst(v.set(b.pos.x, b.pos.y - 0.6, b.pos.z), '#FFFFFF', 8, { speed: 6, size: 0.3, life: 0.5, flat: true, gravity: 10 });
  }

  /** `geyser` launch event: extra spray. */
  onGeyser(id: number, particles: Particles): void {
    const g = this.geysers.find((x) => x.id === id);
    if (g) particles.burst(v.set(g.pos.x, g.pos.y + 1, g.pos.z), '#E8F6FF', 18, { speed: 8, up: 10, size: 0.35, life: 0.8 });
  }

  update(time: number, dt: number, sim: unknown, simTime: number, particles: Particles, player: Vector3): void {
    if (this.buoyMesh && this.buoyHull) {
      for (let i = 0; i < this.buoys.length; i++) {
        const b = this.buoys[i];
        const bob = waveHeight(b.pos.x, b.pos.z, time) * 0.35 + Math.sin(time * Math.PI * 2 * 0.9 + b.id) * 0.12;
        const st = this.squash.get(b.id);
        let sy = 1;
        if (st !== undefined) {
          const k = (time - st) / 0.12;
          if (k >= 1) this.squash.delete(b.id);
          else sy = 0.6 + 0.4 * k;
        }
        const side = 1 / Math.sqrt(sy);
        q.setFromAxisAngle(v.set(0, 0, 1), Math.sin(time * 1.3 + b.id) * 0.05);
        m.compose(v.set(b.pos.x, b.pos.y + bob, b.pos.z), q, s.set(side, sy, side));
        this.buoyMesh.setMatrixAt(i, m);
        this.buoyHull.setMatrixAt(i, m);
      }
      this.buoyMesh.instanceMatrix.needsUpdate = true;
      this.buoyHull.instanceMatrix.needsUpdate = true;
    }
    if (this.columns && this.rings) {
      let nc = 0;
      let nr = 0;
      this.bubbleT += dt;
      const bubble = this.bubbleT > 1 / 8;
      if (bubble) this.bubbleT = 0;
      for (const g of this.geysers) {
        const { phase, t } = geyserPhase(sim, g, simTime);
        const near = Math.abs(g.pos.z - player.z) < 120;
        if (phase === 'warning') {
          // Bubbles (8/s) and a ring pulsing at 4 Hz.
          if (bubble && near) particles.emit(g.pos.x + (Math.random() - 0.5), g.pos.y + 0.1, g.pos.z + (Math.random() - 0.5), 0, 2.5, 0, '#FFFFFF', 0.25, 0.5, -1);
          const k = (t * 4) % 1;
          q.identity();
          m.compose(v.set(g.pos.x, g.pos.y + 0.08, g.pos.z), q, s.setScalar(0.8 + 0.5 * k));
          this.rings.setMatrixAt(nr, m);
          this.rings.setColorAt(nr++, tmpC.setScalar(1 - k));
        } else if (phase === 'erupting') {
          // Column: height 0 → 9 m in 150 ms, hold 1.8 s, collapse 300 ms.
          const h = t < 0.15 ? (t / 0.15) * 9 : t < 1.7 ? 9 + Math.sin(t * 20) * 0.3 : Math.max(0, 9 * (1 - (t - 1.7) / 0.3));
          q.identity();
          m.compose(v.set(g.pos.x, g.pos.y, g.pos.z), q, s.set(1, Math.max(0.01, h), 1));
          this.columns.setMatrixAt(nc++, m);
          if (near && Math.random() < 0.6) particles.emit(g.pos.x + (Math.random() - 0.5), g.pos.y + h, g.pos.z + (Math.random() - 0.5), (Math.random() - 0.5) * 6, 3 + Math.random() * 3, (Math.random() - 0.5) * 6, '#E8F6FF', 0.35, 0.6, 14);
        }
        if (phase === 'erupting' && this.lastPhase.get(g.id) !== 'erupting' && near) {
          particles.burst(v.set(g.pos.x, g.pos.y + 0.5, g.pos.z), '#FFFFFF', 14, { speed: 7, up: 8, size: 0.35, life: 0.7 });
        }
        this.lastPhase.set(g.id, phase);
      }
      this.columns.count = nc;
      this.rings.count = nr;
      this.columns.instanceMatrix.needsUpdate = true;
      this.rings.instanceMatrix.needsUpdate = true;
      if (this.rings.instanceColor) this.rings.instanceColor.needsUpdate = true;
    }
  }
}
