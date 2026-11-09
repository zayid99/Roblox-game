import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  RingGeometry,
  ShaderMaterial,
  ShapeGeometry,
  Shape,
  SphereGeometry,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  TorusGeometry,
  Vector3,
  type Object3D,
  type PerspectiveCamera,
} from 'three';
import type { GuideSpec } from '../contracts';
import { BoxBuilder } from './boxes';
import { textTexture } from './labels';
import { inkMaterial, toonVertexMaterial } from './materials';

const MAX_TRAIL = 40;
const MAX_ARC = 20;
/** Arc dots plus their ground shadows. */
const MAX_ARC_DOTS = 32;
const m = new Matrix4();
const v = new Vector3();
const dir = new Vector3();
const c = new Color();
const ndcA = new Vector3();
const ndcB = new Vector3();
const scaleV = new Vector3();

/**
 * World scale that keeps a guide about `px` pixels tall at 720p whatever the camera distance (clamped), so it
 * neither fills the screen up close nor vanishes far away. `size` is the guide's height in metres at scale 1.
 */
function screenScale(camera: PerspectiveCamera, at: Vector3, size: number, px: number, min: number, max: number): number {
  const d = Math.max(0.5, camera.position.distanceTo(at));
  const metresPerPx = (2 * d * Math.tan((camera.fov * Math.PI) / 360)) / 720;
  return Math.min(max, Math.max(min, (px * metresPerPx) / size));
}

/**
 * 1 when `at` is clear of the player on screen, falling to 0 when it sits in front of the player (closer to the
 * camera) and overlaps the player's on-screen box.
 */
function clearOfPlayer(camera: PerspectiveCamera, at: Vector3, player: Vector3): number {
  ndcB.set(player.x, player.y + 1.2, player.z);
  if (camera.position.distanceTo(at) > camera.position.distanceTo(ndcB) - 0.5) return 1;
  ndcA.copy(at).project(camera);
  ndcB.project(camera);
  const dx = Math.abs(ndcA.x - ndcB.x) / 0.22;
  const dy = Math.abs(ndcA.y - ndcB.y) / 0.38;
  return Math.min(1, Math.max(0, Math.max(dx, dy) * 2 - 1));
}

function arrowGeometry(color: string): { body: BoxBuilder } {
  const b = new BoxBuilder();
  // Pointing down: a shaft and a stepped head.
  b.box(0, 1.25, 0, 0.5, 1.1, 0.5, color, { topColor: '#FFE68A' });
  for (let i = 0; i < 4; i++) {
    const w = 0.35 + i * 0.3;
    b.box(0, 0.12 + i * 0.16, 0, w, 0.16, w, color);
  }
  return { body: b };
}

function chevronShape(): ShapeGeometry {
  const sh = new Shape();
  sh.moveTo(-0.45, -0.25);
  sh.lineTo(0, 0.2);
  sh.lineTo(0.45, -0.25);
  sh.lineTo(0.45, 0.05);
  sh.lineTo(0, 0.5);
  sh.lineTo(-0.45, 0.05);
  sh.closePath();
  return new ShapeGeometry(sh).scale(1.7, 1.7, 1).rotateX(-Math.PI / 2);
}

function dashedRingTexture(): CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d')!;
  g.strokeStyle = '#FFFFFF';
  g.lineWidth = 12;
  g.setLineDash([18, 12]);
  g.beginPath();
  g.arc(64, 64, 52, 0, Math.PI * 2);
  g.stroke();
  const t = new CanvasTexture(cv);
  t.colorSpace = SRGBColorSpace;
  return t;
}

/** G15 tutorial world indicators driven by `GuideSpec`, plus the airborne landing ring of G3b. */
export class Guides {
  readonly group = new Group();
  private readonly arrow = new Group();
  private readonly arrowMats: Map<string, Mesh> = new Map();
  private readonly trail: InstancedMesh;
  private readonly trailPts: Vector3[] = [];
  private readonly trailDirs: Vector3[] = [];
  private trailCount = 0;
  private readonly trailKey = new Float64Array(5);
  private readonly ring: Mesh;
  private readonly ringLabel: Sprite;
  private readonly labelTex = new Map<string, CanvasTexture>();
  private readonly beam: Mesh;
  private readonly arcOk: InstancedMesh;
  private readonly arcBad: InstancedMesh;
  private readonly arcEnd: Mesh;
  private readonly tag: Sprite;
  private readonly landing: Mesh;
  private lastTime = 0;
  private arrowVis = 1;
  private labelVis = 1;

  constructor(parent: Object3D) {
    const ab = arrowGeometry('#FFC92E').body;
    const body = new Mesh(ab.build(), toonVertexMaterial);
    const hull = new Mesh(ab.outline(0.06), inkMaterial);
    this.arrow.add(body, hull);
    this.arrowMats.set('#FFC92E', body);
    this.arrow.visible = false;

    this.trail = new InstancedMesh(chevronShape(), new MeshBasicMaterial({ color: '#FFFFFF', depthWrite: false, toneMapped: false, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), MAX_TRAIL);
    this.trail.instanceMatrix.setUsage(DynamicDrawUsage);
    this.trail.instanceColor = new InstancedBufferAttribute(new Float32Array(MAX_TRAIL * 3), 3);
    this.trail.frustumCulled = false;
    this.trail.count = 0;
    this.trail.renderOrder = 5;
    for (let i = 0; i < MAX_TRAIL; i++) {
      this.trailPts.push(new Vector3());
      this.trailDirs.push(new Vector3());
    }

    this.ring = new Mesh(new RingGeometry(0.85, 1, 48).rotateX(-Math.PI / 2), new MeshBasicMaterial({ color: '#FFE68A', transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }));
    this.ring.renderOrder = 5;
    this.ring.visible = false;
    this.ringLabel = new Sprite(new SpriteMaterial({ transparent: true, depthWrite: false, toneMapped: false }));
    this.ringLabel.visible = false;
    this.ringLabel.scale.set(4, 1.5, 1);

    this.beam = new Mesh(
      new CylinderGeometry(1.2, 1.2, 30, 16, 1, true).translate(0, 15, 0),
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide,
        uniforms: { uColor: { value: new Color('#FFF2A8') } },
        vertexShader: 'varying float vY; void main() { vY = position.y / 30.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'uniform vec3 uColor; varying float vY; void main() { float a = pow(1.0 - vY, 1.5) * 0.55; gl_FragColor = vec4(uColor * a, a); }',
      }),
    );
    this.beam.visible = false;
    this.beam.renderOrder = 6;

    this.arcOk = new InstancedMesh(new SphereGeometry(0.18, 8, 6), new MeshBasicMaterial({ color: '#46D46A', toneMapped: false }), MAX_ARC_DOTS);
    this.arcBad = new InstancedMesh(new TorusGeometry(0.16, 0.05, 4, 10), new MeshBasicMaterial({ color: '#FF4D5E', toneMapped: false }), MAX_ARC_DOTS);
    for (const im of [this.arcOk, this.arcBad]) {
      im.instanceMatrix.setUsage(DynamicDrawUsage);
      im.frustumCulled = false;
      im.count = 0;
    }
    this.arcEnd = new Mesh(new RingGeometry(0.7, 0.95, 32).rotateX(-Math.PI / 2), new MeshBasicMaterial({ color: '#46D46A', transparent: true, depthWrite: false, toneMapped: false }));
    this.arcEnd.visible = false;

    this.tag = new Sprite(new SpriteMaterial({ transparent: true, depthWrite: false, depthTest: false, toneMapped: false }));
    this.tag.visible = false;
    this.tag.scale.set(3.6, 1.35, 1);
    this.tag.renderOrder = 9;

    this.landing = new Mesh(
      new RingGeometry(0.2, 1, 32).rotateX(-Math.PI / 2),
      new MeshBasicMaterial({ map: dashedRingTexture(), transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false, color: '#FFFFFF' }),
    );
    // Map the dashed texture onto the ring by its planar uv.
    const pos = this.landing.geometry.getAttribute('position');
    const uv = this.landing.geometry.getAttribute('uv');
    for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) * 0.5 + 0.5, -pos.getZ(i) * 0.5 + 0.5);
    this.landing.visible = false;
    this.landing.renderOrder = 4;

    this.group.add(this.arrow, this.trail, this.ring, this.ringLabel, this.beam, this.arcOk, this.arcBad, this.arcEnd, this.tag, this.landing);
    parent.add(this.group);
  }

  private label(text: string): CanvasTexture {
    let t = this.labelTex.get(text);
    if (!t) {
      t = textTexture([{ text, size: 64, color: '#FFE66D' }], 400, 150, '#1F3F7A');
      this.labelTex.set(text, t);
    }
    return t;
  }

  private arrowColor(color: string): void {
    if (this.arrowMats.has(color)) return;
    const body = this.arrow.children[0] as Mesh;
    const geo = arrowGeometry(color).body.build();
    body.geometry.dispose();
    body.geometry = geo;
    this.arrowMats.clear();
    this.arrowMats.set(color, body);
  }

  private repath(points: Vector3[]): void {
    let n = 0;
    let carry = 0;
    for (let i = 0; i < points.length - 1 && n < MAX_TRAIL; i++) {
      const a = points[i];
      const b = points[i + 1];
      dir.copy(b).sub(a);
      const len = dir.length();
      if (len < 1e-4) continue;
      // Legs that climb to a hook or drop from it are swung, not walked: flat chevrons there float in the sky.
      if (Math.abs(dir.y) > 1.5) {
        carry = 0;
        continue;
      }
      dir.divideScalar(len);
      let d = carry;
      while (d < len && n < MAX_TRAIL) {
        this.trailPts[n].copy(a).addScaledVector(dir, d);
        this.trailDirs[n].copy(dir);
        n++;
        d += 1;
      }
      carry = d - len;
    }
    this.trailCount = n;
  }

  /** Frees the cached label textures (they live outside the scene graph). */
  dispose(): void {
    for (const t of this.labelTex.values()) t.dispose();
    this.labelTex.clear();
  }

  /**
   * `landing`: predicted landing point while airborne (null hides the ring). `hookPos` resolves hookTag anchors.
   * Guides keep a bounded on-screen size and step aside (fade) when they would sit in front of the player.
   */
  update(
    spec: GuideSpec,
    time: number,
    landing: Vector3 | null,
    hookPos: (id: number, out: Vector3) => Vector3 | null,
    camera: PerspectiveCamera,
    player: Vector3,
    ground?: (x: number, z: number, y: number) => number,
  ): void {
    const dt = Math.min(0.1, Math.max(0, time - this.lastTime));
    this.lastTime = time;
    const ease = Math.min(1, dt / 0.15);
    const camQ = camera.quaternion;

    // Hook tag.
    let tagTop = -Infinity;
    if (spec.hookTag && hookPos(spec.hookTag.anchorId, v)) {
      const tex = this.label(spec.hookTag.text);
      if (this.tag.material.map !== tex) {
        this.tag.material.map = tex;
        this.tag.material.needsUpdate = true;
      }
      this.tag.visible = true;
      // Above the balloon, but pulled down to stay on screen when the camera is close under the hook.
      const hookY = v.y;
      v.y = hookY + 4.6 + 0.15 * Math.sin(time * 4);
      ndcA.copy(v).project(camera);
      if (ndcA.z < 1 && ndcA.y > 0.78) {
        ndcB.set(v.x, hookY, v.z).project(camera);
        if (ndcB.z < 1 && ndcB.y < 0.78) v.y = hookY + (v.y - hookY) * ((0.78 - ndcB.y) / (ndcA.y - ndcB.y));
      }
      this.tag.position.copy(v);
      const s = screenScale(camera, v, 1.35, 44, 0.35, 2);
      this.tag.scale.set(3.6 * s, 1.35 * s, 1);
      tagTop = v.y + 0.7 * s;
    } else this.tag.visible = false;

    // Arrow: bobbing at 1.25 Hz, spinning .8 rad/s, its tip just above the target (or above the hook's tag when
    // it points at the tagged hook); ~70 px tall at any distance.
    if (spec.arrow) {
      this.arrowColor(spec.arrow.color ?? '#FFC92E');
      const s = screenScale(camera, spec.arrow.pos, 1.8, 70, 0.35, 2.2);
      this.arrow.position.copy(spec.arrow.pos);
      const onTag = this.tag.visible && Math.hypot(this.tag.position.x - spec.arrow.pos.x, this.tag.position.z - spec.arrow.pos.z) < 0.5;
      if (onTag) this.arrow.position.y = Math.max(this.arrow.position.y, tagTop);
      this.arrow.position.y += (0.5 + 0.25 * (1 + Math.sin(time * Math.PI * 2 * 1.25))) * s;
      this.arrow.rotation.y = time * 0.8;
      v.copy(this.arrow.position).setY(this.arrow.position.y + 0.9 * s);
      this.arrowVis += (clearOfPlayer(camera, v, player) - this.arrowVis) * ease;
      this.arrow.scale.setScalar(s * Math.max(0.01, this.arrowVis));
      this.arrow.visible = this.arrowVis > 0.03;
    } else {
      this.arrow.visible = false;
      this.arrowVis = 1;
    }

    // Chevron trail with a brightness wave toward the target (2 m/s).
    const trail = spec.trail;
    if (trail && trail.length > 1) {
      const last = trail[trail.length - 1];
      const k = this.trailKey;
      if (k[0] !== trail.length || k[1] !== trail[0].x || k[2] !== trail[0].z || k[3] !== last.x || k[4] !== last.z) {
        k[0] = trail.length;
        k[1] = trail[0].x;
        k[2] = trail[0].z;
        k[3] = last.x;
        k[4] = last.z;
        this.repath(trail);
      }
      for (let i = 0; i < this.trailCount; i++) {
        const p = this.trailPts[i];
        const d = this.trailDirs[i];
        const yaw = Math.atan2(-d.x, -d.z);
        m.makeRotationY(yaw);
        m.setPosition(v.copy(p).setY(p.y + 0.15));
        this.trail.setMatrixAt(i, m);
        const b = 0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin(((i - time * 2) / 5) * Math.PI * 2), 2);
        this.trail.setColorAt(i, c.setRGB(1, 0.62 + 0.36 * b, 0.05 + 0.6 * b, SRGBColorSpace));
      }
      this.trail.count = this.trailCount;
      this.trail.instanceMatrix.needsUpdate = true;
      this.trail.instanceColor!.needsUpdate = true;
    } else {
      this.trail.count = 0;
      this.trailKey[0] = 0;
    }

    // Pulsing ring decal (scale 1 → 1.15 at 1.5 Hz) with an optional label.
    if (spec.ring) {
      const k = 1 + 0.075 * (1 + Math.sin(time * Math.PI * 2 * 1.5));
      this.ring.visible = true;
      this.ring.position.copy(spec.ring.pos).setY(spec.ring.pos.y + 0.08);
      this.ring.scale.setScalar(spec.ring.radius * k);
      if (spec.ring.label) {
        const tex = this.label(spec.ring.label);
        if (this.ringLabel.material.map !== tex) {
          this.ringLabel.material.map = tex;
          this.ringLabel.material.needsUpdate = true;
        }
        // ~46 px tall at any distance; gone once the player stands on the ring, and never in front of the player.
        const lp = this.ringLabel.position.copy(spec.ring.pos).setY(spec.ring.pos.y + 2.2);
        const s = screenScale(camera, lp, 1.5, 46, 0.3, 1.8);
        const off = Math.hypot(player.x - spec.ring.pos.x, player.z - spec.ring.pos.z) - spec.ring.radius;
        const want = Math.min(1, Math.max(0, (off - 0.5) / 2)) * clearOfPlayer(camera, lp, player);
        this.labelVis += (want - this.labelVis) * ease;
        this.ringLabel.scale.set(4 * s, 1.5 * s, 1);
        this.ringLabel.material.opacity = this.labelVis;
        this.ringLabel.visible = this.labelVis > 0.03;
      } else this.ringLabel.visible = false;
    } else {
      this.ring.visible = false;
      this.ringLabel.visible = false;
    }

    // Light beam.
    if (spec.beam) {
      this.beam.visible = true;
      this.beam.position.copy(spec.beam);
    } else this.beam.visible = false;

    // Landing arc: solid green dots ending in a ring (ok), hollow red rings (bad).
    const arc = spec.landingArc;
    if (arc && arc.points.length) {
      const pts = arc.points;
      const n = Math.min(MAX_ARC, pts.length);
      const im = arc.ok ? this.arcOk : this.arcBad;
      const other = arc.ok ? this.arcBad : this.arcOk;
      other.count = 0;
      // The arc runs away from the camera behind the player, so its dots keep >= ~10 px on screen (they were
      // a few pixels wide 20 m out) and pulse toward the landing ring.
      for (let i = 0; i < n; i++) {
        const p = pts[Math.round((i / Math.max(1, n - 1)) * (pts.length - 1))];
        const ds = screenScale(camera, p, 0.36, 10, 1, 4) * (1 + 0.3 * Math.max(0, Math.sin((i / 3 - time * 3) * Math.PI)));
        if (arc.ok) m.makeScale(ds, ds, ds);
        else m.makeRotationFromQuaternion(camQ).scale(scaleV.setScalar(ds));
        m.setPosition(p);
        im.setMatrixAt(i, m);
      }
      // Its shadow on the ground/sea (flattened dots): from the chase camera the arc itself hides behind the
      // player, but the shadow path runs down the screen to the landing ring.
      let k = n;
      if (ground && arc.ok) {
        for (let i = 1; i < n - 1; i += 2) {
          const p = pts[Math.round((i / Math.max(1, n - 1)) * (pts.length - 1))];
          const gy = ground(p.x, p.z, p.y) + 0.08;
          if (p.y - gy < 0.6) continue;
          v.set(p.x, gy, p.z);
          const ds = screenScale(camera, v, 0.36, 8, 1, 3);
          m.makeScale(ds, ds * 0.2, ds).setPosition(v);
          im.setMatrixAt(k++, m);
        }
      }
      im.count = k;
      im.instanceMatrix.needsUpdate = true;
      const end = pts[pts.length - 1];
      this.arcEnd.visible = arc.ok;
      this.arcEnd.position.set(end.x, end.y + 0.06, end.z);
      // A big pulsing landing ring: the part of the aid the third-person camera always sees.
      this.arcEnd.scale.setScalar(Math.max(1.7, screenScale(camera, end, 1.9, 40, 1, 4)) * (1 + 0.12 * Math.sin(time * 7)));
    } else {
      this.arcOk.count = 0;
      this.arcBad.count = 0;
      this.arcEnd.visible = false;
    }

    // Dashed predicted-landing ring.
    if (landing) {
      this.landing.visible = true;
      this.landing.position.set(landing.x, landing.y + 0.05, landing.z);
      this.landing.scale.setScalar(0.9 + 0.1 * Math.sin(time * 8));
      this.landing.rotation.y = time * 1.5;
    } else this.landing.visible = false;
  }
}
