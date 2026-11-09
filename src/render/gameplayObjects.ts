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
import { CRUMBLE, type Anchor, type AnchorSway, type Course, type Spring, type Stone } from '../game/course';
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

type StonePhase = 'solid' | 'shaking' | 'sunk' | 'rising';
const stoneOut: { phase: StonePhase; t: number } = { phase: 'solid', t: 0 };
/** Crumble stone phase from the sim's `stoneState` (solid if the sim has none). */
function stonePhase(sim: unknown, id: number): { phase: StonePhase; t: number } {
  const fn = (sim as { stoneState?: (id: number) => { phase: StonePhase; t: number } }).stoneState;
  const r = typeof fn === 'function' ? fn.call(sim, id) : null;
  stoneOut.phase = r?.phase ?? 'solid';
  stoneOut.t = r?.t ?? 0;
  return stoneOut;
}

/**
 * Spring coral: a bouncy mushroom about .55 m tall. The cap is built white and tinted per zone (instance colour)
 * so it stands out on every island colour; the stem, rim studs and spots stay as built (separate mesh).
 */
function springCapGeometry(): BoxBuilder {
  const b = new BoxBuilder();
  b.box(0, 0.36, 0, 1.9, 0.16, 1.9, '#FFFFFF', { shadeBottom: 0.4 });
  b.box(0, 0.48, 0, 1.5, 0.12, 1.5, '#FFFFFF');
  b.box(0, 0.36, 0, 2.3, 0.1, 1.2, '#F2F2F2', { shadeBottom: 0.3 });
  b.box(0, 0.36, 0, 1.2, 0.1, 2.3, '#F2F2F2', { shadeBottom: 0.3 });
  return b;
}
function springBaseGeometry(): BoxBuilder {
  const b = new BoxBuilder();
  b.box(0, 0.14, 0, 0.8, 0.28, 0.8, '#FFF3DE', { shadeBottom: 0.3 });
  b.box(0, 0.03, 0, 1.3, 0.06, 1.3, '#3A2E4A', { noOutline: true });
  for (const [x, z] of [[-0.45, -0.25], [0.4, 0.35], [0.05, -0.55], [-0.25, 0.5], [0.55, -0.3]]) b.box(x, 0.545, z, 0.26, 0.02, 0.26, '#FFFFFF', { noOutline: true });
  return b;
}

/** Cap colour per zone, picked to contrast with that zone's grass. */
const SPRING_TINT: Record<number, string> = { 1: '#FFD23F', 2: '#FF4FD8', 3: '#FFD23F', 4: '#7CFF4F', 5: '#3FE0FF', 6: '#FF4FD8' };

/** Crumble stone: a stacked rock column from below the sea up to the top at y 0, with cracks on the top. */
function stoneGeometry(): BoxBuilder {
  const h = CRUMBLE.size / 2;
  const b = new BoxBuilder();
  b.box(0, -3.4, 0, CRUMBLE.size + 0.3, 6.0, CRUMBLE.size + 0.3, '#9AA0A8', { shadeBottom: 0.5 });
  b.box(0, -0.28, 0, CRUMBLE.size, 0.56, CRUMBLE.size, '#C9CED4', { topColor: '#E4E7EA' });
  b.box(-0.35, -0.75, h + 0.12, 0.9, 0.5, 0.12, '#8A9098');
  b.box(h + 0.12, -1.1, 0.3, 0.12, 0.6, 1.0, '#8A9098');
  // Cracks so it reads as breakable.
  b.box(-0.1, 0.005, 0, 0.08, 0.02, 1.7, '#3A3F48', { noOutline: true });
  b.box(0.35, 0.005, -0.35, 0.9, 0.02, 0.08, '#3A3F48', { noOutline: true });
  b.box(-0.55, 0.005, 0.45, 0.8, 0.02, 0.08, '#3A3F48', { noOutline: true });
  return b;
}

const STONE_TINT: Record<number, string> = { 3: '#C2CCDA', 4: '#B4A8E0', 5: '#DDA898' };
const STONE_HOT = new Color('#FF5A3C');
const SPRING_TOP = 0.55;

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
  private readonly springs: readonly Spring[];
  private readonly springMesh: InstancedMesh | null = null;
  private readonly springBase: InstancedMesh | null = null;
  private readonly springHull: InstancedMesh | null = null;
  private readonly springSquash = new Map<number, number>();
  private readonly stones: readonly Stone[];
  private readonly stoneMesh: InstancedMesh | null = null;
  private readonly stoneHull: InstancedMesh | null = null;
  private readonly stoneWarn: number[] = [];
  private readonly swaying: { a: Anchor; w: AnchorSway }[] = [];
  private readonly arms: InstancedMesh | null = null;

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
    // Spring coral pads (instanced, squash on launch).
    this.springs = course.springs ?? [];
    if (this.springs.length) {
      const cap = springCapGeometry();
      const base = springBaseGeometry();
      const hull = new BoxBuilder();
      hull.merge(cap);
      hull.merge(base);
      this.springMesh = new InstancedMesh(cap.build(), toonVertexMaterial, this.springs.length);
      this.springBase = new InstancedMesh(base.build(), toonVertexMaterial, this.springs.length);
      this.springHull = new InstancedMesh(hull.outline(0.05), inkMaterial, this.springs.length);
      this.springs.forEach((sp, i) => this.springMesh!.setColorAt(i, tmpC.set(SPRING_TINT[sp.zone] ?? '#FFD23F')));
      for (const im of [this.springMesh, this.springBase, this.springHull]) {
        im.instanceMatrix.setUsage(DynamicDrawUsage);
        im.frustumCulled = false;
        this.group.add(im);
      }
      this.springMesh.castShadow = true;
    }
    // Crumble stones (instanced, tinted per zone; shake, sink and rise with the sim's stone state).
    this.stones = course.stones ?? [];
    if (this.stones.length) {
      const stb = stoneGeometry();
      this.stoneMesh = new InstancedMesh(stb.build(), toonVertexMaterial, this.stones.length);
      this.stoneHull = new InstancedMesh(stb.outline(0.05), inkMaterial, this.stones.length);
      this.stones.forEach((st, i) => this.stoneMesh!.setColorAt(i, tmpC.set(STONE_TINT[st.zone] ?? '#FFFFFF')));
      for (const im of [this.stoneMesh, this.stoneHull]) {
        im.instanceMatrix.setUsage(DynamicDrawUsage);
        im.frustumCulled = false;
        this.group.add(im);
      }
      this.stoneMesh.castShadow = true;
      this.stoneMesh.receiveShadow = true;
    }
    // Swaying hooks: a hub with an axle above each pendulum, dots marking the hook's arc, and an arm (instanced).
    for (const a of course.anchors) if (a.sway) this.swaying.push({ a, w: a.sway });
    if (this.swaying.length) {
      const hub = new BoxBuilder({ faces: true });
      for (const { w } of this.swaying) {
        const p = w.pivot;
        hub.box(p.x, p.y, p.z, 1.1, 1.1, 1.1, '#8A5CFF', { topColor: '#B79CFF' });
        hub.box(p.x, p.y, p.z, 2.4, 0.3, 0.3, '#2A3550');
        for (const sx of [-1, 1]) hub.box(p.x + sx * 1.25, p.y, p.z, 0.3, 0.8, 0.8, '#FFD23F');
        hub.box(p.x, p.y + 0.75, p.z, 0.5, 0.4, 0.5, '#FFD23F');
        for (let k = -3; k <= 3; k++) {
          const th = (k / 3) * w.angle;
          hub.box(p.x, p.y - w.length * Math.cos(th) - 0.9, p.z - w.length * Math.sin(th), 0.18, 0.18, 0.18, '#B79CFF', { noOutline: true });
        }
      }
      const hm = new Mesh(hub.build(), islandMaterial(true));
      hm.castShadow = true;
      this.group.add(hm);
      const arm = new BoxBuilder();
      arm.box(0, -0.5, 0, 0.2, 1, 0.2, '#2A3550');
      this.arms = new InstancedMesh(arm.build(), toonVertexMaterial, this.swaying.length);
      this.arms.instanceMatrix.setUsage(DynamicDrawUsage);
      this.arms.frustumCulled = false;
      this.arms.castShadow = true;
      this.group.add(this.arms);
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

  /** `spring` event: squash the pad and puff petals. */
  onSpring(id: number, time: number, particles: Particles): void {
    this.springSquash.set(id, time);
    const sp = this.springs.find((x) => x.id === id);
    if (sp) particles.burst(v.set(sp.pos.x, sp.pos.y + SPRING_TOP, sp.pos.z), SPRING_TINT[sp.zone] ?? '#FFD23F', 10, { speed: 5, up: 4, size: 0.3, life: 0.5, gravity: 8 });
  }

  /** `crumble` event: grit when it starts to shake, a splash of rubble when it sinks. */
  onCrumble(id: number, phase: 'shake' | 'sink', particles: Particles): void {
    const st = this.stones.find((x) => x.id === id);
    if (!st) return;
    const sol = st.solid;
    v.set((sol.min.x + sol.max.x) / 2, sol.max.y, (sol.min.z + sol.max.z) / 2);
    if (phase === 'shake') particles.burst(v, '#C9CED4', 8, { speed: 3, up: 2, size: 0.25, life: 0.5, gravity: 12 });
    else {
      particles.burst(v, '#8A9098', 14, { speed: 5, up: 4, size: 0.35, life: 0.7, gravity: 14 });
      particles.burst(v.setY(0.3), '#FFFFFF', 12, { speed: 6, size: 0.3, life: 0.5, flat: true, gravity: 10 });
    }
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
    if (this.springMesh && this.springBase && this.springHull) {
      for (let i = 0; i < this.springs.length; i++) {
        const sp = this.springs[i];
        const st = this.springSquash.get(sp.id);
        // Idle: a slow breathing pulse. Launch: squash to .45, spring up past 1, settle (350 ms).
        let sy = 1 + 0.05 * Math.sin(time * 3 + sp.id);
        if (st !== undefined) {
          const k = (time - st) / 0.35;
          if (k >= 1) this.springSquash.delete(sp.id);
          else if (k < 0.2) sy = 1 - 0.55 * (k / 0.2);
          else {
            const u = (k - 0.2) / 0.8;
            sy = 0.45 + 0.55 * u + 0.6 * Math.sin(u * Math.PI) * (1 - u);
          }
        }
        const side = 1 / Math.sqrt(Math.max(0.3, sy));
        q.identity();
        m.compose(v.set(sp.pos.x, sp.pos.y, sp.pos.z), q, s.set(side, sy, side));
        this.springMesh.setMatrixAt(i, m);
        this.springBase.setMatrixAt(i, m);
        this.springHull.setMatrixAt(i, m);
      }
      this.springMesh.instanceMatrix.needsUpdate = true;
      this.springBase.instanceMatrix.needsUpdate = true;
      this.springHull.instanceMatrix.needsUpdate = true;
    }
    if (this.stoneMesh && this.stoneHull) {
      let stoneColorsDirty = false;
      for (let i = 0; i < this.stones.length; i++) {
        const st = this.stones[i];
        const sol = st.solid;
        const { phase, t } = stonePhase(sim, st.id);
        let dx = 0;
        let dz = 0;
        let dy = 0;
        let tilt = 0;
        if (phase === 'shaking') {
          // Shake harder as it gets closer to sinking.
          const a = 0.03 + 0.09 * (t / CRUMBLE.shake);
          dx = Math.sin(time * 61) * a;
          dz = Math.cos(time * 53) * a;
          tilt = Math.sin(time * 37) * a * 0.3;
        }
        // Warm up toward red while it shakes (the warning), back to the zone tint otherwise.
        const warn = phase === 'shaking' ? Math.min(1, t / CRUMBLE.shake) : 0;
        if (warn !== (this.stoneWarn[i] ?? 0)) {
          this.stoneWarn[i] = warn;
          this.stoneMesh.setColorAt(i, tmpC.set(STONE_TINT[st.zone] ?? '#FFFFFF').lerp(STONE_HOT, warn * 0.8));
          stoneColorsDirty = true;
        }
        // (The offsets used to hang off the colour branch with `else if`, so the frame the tint changed, e.g.
        // shaking → sunk, the stone popped back up to the surface for one frame.)
        if (phase === 'sunk') {
          dy = -Math.min(1, t / 0.5) * 7;
          tilt = Math.min(1, t / 0.5) * 0.25;
        } else if (phase === 'rising') {
          const k = Math.min(1, t / CRUMBLE.rise);
          dy = -7 * (1 - k * k * (3 - 2 * k));
        } else if (phase === 'solid') {
          dy = Math.sin(time * 1.4 + st.id) * 0.03;
        }
        q.setFromAxisAngle(v.set(1, 0, 0.6).normalize(), tilt);
        m.compose(v.set((sol.min.x + sol.max.x) / 2 + dx, sol.max.y + dy, (sol.min.z + sol.max.z) / 2 + dz), q, s.set(1, 1, 1));
        this.stoneMesh.setMatrixAt(i, m);
        this.stoneHull.setMatrixAt(i, m);
      }
      this.stoneMesh.instanceMatrix.needsUpdate = true;
      this.stoneHull.instanceMatrix.needsUpdate = true;
      if (stoneColorsDirty && this.stoneMesh.instanceColor) this.stoneMesh.instanceColor.needsUpdate = true;
    }
    if (this.arms) {
      for (let i = 0; i < this.swaying.length; i++) {
        const { a, w } = this.swaying[i];
        // Arm from the hub down to the top of the hook's balloon (3.5 m above the hook).
        const ex = a.pos.x - w.pivot.x;
        const ey = a.pos.y + 3.5 - w.pivot.y;
        const ez = a.pos.z - w.pivot.z;
        const len = Math.max(0.1, Math.hypot(ex, ey, ez));
        q.setFromUnitVectors(v.set(0, -1, 0), s.set(ex / len, ey / len, ez / len));
        m.compose(v.copy(w.pivot), q, s.set(1, len, 1));
        this.arms.setMatrixAt(i, m);
      }
      this.arms.instanceMatrix.needsUpdate = true;
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
