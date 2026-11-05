import { AmbientLight, DirectionalLight, HemisphereLight, PerspectiveCamera, Scene, WebGLRenderTarget, type WebGLRenderer } from 'three';
import { getSpecies, type CreatureRef } from '../game/creatures';
import { makeCreatureMesh } from './creatureMesh';

const SIZE = 128;

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

  /** Synchronous render (legacy callers that need the image immediately). */
  getNow(c: CreatureRef): string {
    let url = this.cache.get(key(c));
    if (!url) {
      url = this.render(c);
      this.cache.set(key(c), url);
    }
    return url;
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

  private render(c: CreatureRef): string {
    if (!this.scene) this.setup();
    const scene = this.scene!;
    const target = this.target!;
    const mesh = makeCreatureMesh(c);
    mesh.scale.setScalar(1);
    mesh.rotation.y = 0.55;
    scene.add(mesh);
    const look = getSpecies(c.speciesId).look;
    const tall = look.plan === 'jelly' || look.plan === 'octo';
    const long = look.plan === 'whale';
    this.camera.position.set(0, tall ? 1.4 : 1.1, long ? 4.6 : 3.9);
    this.camera.lookAt(0, tall ? 0.8 : 0.5, 0);

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
    mesh.material.dispose();

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
