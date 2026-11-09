import { AmbientLight, Box3, DirectionalLight, HemisphereLight, Matrix4, Mesh, PerspectiveCamera, Scene, Vector3, WebGLRenderTarget, type WebGLRenderer } from 'three';
import type { CreatureRef } from '../game/creatures';
import { creatureGeometry } from './creatureMesh';
import { creatureMaterial, type CreatureMaterial } from './materials';

const SIZE = 128;
/** Three-quarter turn of the model toward the camera. */
const MODEL_YAW = 0.55;

function toSrgb(v: number): number {
  const c = v / 255;
  const s = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, s)) * 255);
}
const SRGB_LUT = new Uint8Array(256).map((_, i) => toSrgb(i));

const key = (c: CreatureRef) => `${c.speciesId}:${c.mutation}`;

/**
 * Creature portraits for the HUD, Index and reveals (was `IconFactory`). Lazy: `request()` queues,
 * `pump()` renders at most N per frame, `get()` returns '' until ready. Render targets aren't tone mapped,
 * so the light rig is ~10% brighter to match the in-world grade.
 */
export class PortraitFactory {
  private readonly cache = new Map<string, string>();
  private readonly queue: CreatureRef[] = [];
  private readonly queued = new Set<string>();
  private scene: Scene | null = null;
  private readonly camera = new PerspectiveCamera(30, 1, 0.1, 50);
  private target: WebGLRenderTarget | null = null;
  private readonly pixels = new Uint8Array(SIZE * SIZE * 4);
  private canvas: HTMLCanvasElement | null = null;
  private readonly mats: CreatureMaterial[] = [];
  private readonly framing = new Map<string, { pos: Vector3; at: Vector3 }>();

  constructor(private readonly renderer: WebGLRenderer) {}

  /** Data URL, or '' while pending (also queues it). */
  get(c: CreatureRef): string {
    const url = this.cache.get(key(c));
    if (url) return url;
    this.request(c);
    return '';
  }

  request(c: CreatureRef): void {
    const k = key(c);
    if (this.cache.has(k) || this.queued.has(k)) return;
    this.queued.add(k);
    this.queue.push({ speciesId: c.speciesId, mutation: c.mutation });
  }

  /** Render up to `maxPerFrame` queued portraits (call once per frame). */
  pump(maxPerFrame = 3): void {
    for (let i = 0; i < maxPerFrame && this.queue.length; i++) {
      const c = this.queue.shift()!;
      this.queued.delete(key(c));
      this.cache.set(key(c), this.render(c));
    }
  }

  get pending(): number {
    return this.queue.length;
  }

  private setup(): void {
    this.scene = new Scene();
    this.scene.add(new AmbientLight('#ffffff', 0.5));
    this.scene.add(new HemisphereLight('#D6EEFF', '#5C8FA8', 1.25));
    const sun = new DirectionalLight('#FFF1D6', 3.1);
    sun.position.set(2, 4, 3);
    this.scene.add(sun);
    this.target = new WebGLRenderTarget(SIZE, SIZE, { samples: 4 });
    this.canvas = document.createElement('canvas');
    this.canvas.width = SIZE;
    this.canvas.height = SIZE;
  }

  /**
   * Camera placement that fits the species' rotated model inside the porthole (U13-08: a fixed camera cut
   * crab claws and party hats). Looks slightly down at the model's centre, distance from its projected extent.
   */
  private frame(speciesId: string): { pos: Vector3; at: Vector3 } {
    let f = this.framing.get(speciesId);
    if (f) return f;
    const pos = creatureGeometry(speciesId).getAttribute('position');
    const rot = new Matrix4().makeRotationY(MODEL_YAW);
    const pts: Vector3[] = [];
    for (let i = 0; i < pos.count; i++) pts.push(new Vector3().fromBufferAttribute(pos, i).applyMatrix4(rot));
    const center = new Box3().setFromPoints(pts).getCenter(new Vector3());
    const dir = new Vector3(0, 0.16, 1).normalize();
    const right = new Vector3(1, 0, 0);
    const up = new Vector3().crossVectors(dir, right).normalize();
    const t = Math.tan((this.camera.fov * Math.PI) / 360);
    // Every vertex inside 90% of the porthole circle (radius ≈ 1 in NDC).
    const fill = 0.9;
    let dist = 0;
    const o = new Vector3();
    for (const p of pts) {
      o.copy(p).sub(center);
      dist = Math.max(dist, Math.hypot(o.dot(right), o.dot(up)) / (fill * t) + o.dot(dir));
    }
    f = { pos: center.clone().addScaledVector(dir, dist), at: center };
    this.framing.set(speciesId, f);
    return f;
  }

  private render(c: CreatureRef): string {
    if (!this.scene) this.setup();
    const scene = this.scene!;
    const target = this.target!;
    // One material per mutation, kept for the session: the portrait program compiles once.
    const mat = (this.mats[c.mutation] ??= creatureMaterial(c.mutation));
    const mesh = new Mesh(creatureGeometry(c.speciesId), mat);
    mesh.rotation.y = MODEL_YAW;
    scene.add(mesh);
    const f = this.frame(c.speciesId);
    this.camera.position.copy(f.pos);
    this.camera.lookAt(f.at);

    const r = this.renderer;
    const prevTarget = r.getRenderTarget();
    const prevShadow = r.shadowMap.autoUpdate;
    r.shadowMap.autoUpdate = false;
    r.setRenderTarget(target);
    r.setClearColor(0x000000, 0);
    r.clear();
    r.render(scene, this.camera);
    r.readRenderTargetPixels(target, 0, 0, SIZE, SIZE, this.pixels);
    r.setRenderTarget(prevTarget);
    r.shadowMap.autoUpdate = prevShadow;
    scene.remove(mesh);

    const ctx = this.canvas!.getContext('2d')!;
    const img = ctx.createImageData(SIZE, SIZE);
    const px = this.pixels;
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const src = ((SIZE - 1 - y) * SIZE + x) * 4;
        const dst = (y * SIZE + x) * 4;
        const a = px[src + 3];
        // Un-premultiply is not needed (alpha 0 or 1 except on AA edges); convert linear → sRGB.
        img.data[dst] = SRGB_LUT[px[src]];
        img.data[dst + 1] = SRGB_LUT[px[src + 1]];
        img.data[dst + 2] = SRGB_LUT[px[src + 2]];
        img.data[dst + 3] = a;
      }
    }
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.putImageData(img, 0, 0);
    return this.canvas!.toDataURL('image/png');
  }
}
