import {
  AmbientLight,
  DirectionalLight,
  PerspectiveCamera,
  Scene,
  WebGLRenderTarget,
  type WebGLRenderer,
} from 'three';
import { getSpecies, type CreatureRef } from '../game/creatures';
import { makeCreatureMesh } from './creatureMesh';

const SIZE = 96;

function toSrgb(v: number): number {
  const c = v / 255;
  const s = c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
  return Math.round(Math.min(1, Math.max(0, s)) * 255);
}

/** Renders small creature portraits (for the HUD and the Index) and caches them as data URLs. */
export class IconFactory {
  private readonly cache = new Map<string, string>();
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(30, 1, 0.1, 50);
  private readonly target = new WebGLRenderTarget(SIZE, SIZE);
  private readonly pixels = new Uint8Array(SIZE * SIZE * 4);
  private readonly canvas = document.createElement('canvas');

  constructor(private readonly renderer: WebGLRenderer) {
    this.scene.add(new AmbientLight('#ffffff', 1.2));
    const sun = new DirectionalLight('#ffffff', 2.2);
    sun.position.set(2, 4, 3);
    this.scene.add(sun);
    this.canvas.width = SIZE;
    this.canvas.height = SIZE;
  }

  get(c: CreatureRef): string {
    const key = `${c.speciesId}:${c.mutation}`;
    let url = this.cache.get(key);
    if (!url) {
      url = this.render(c);
      this.cache.set(key, url);
    }
    return url;
  }

  private render(c: CreatureRef): string {
    const mesh = makeCreatureMesh(c);
    mesh.scale.setScalar(1);
    mesh.rotation.y = 0.55;
    this.scene.add(mesh);
    const look = getSpecies(c.speciesId).look;
    const tall = look.plan === 'jelly' || look.plan === 'octo';
    const long = look.plan === 'whale';
    this.camera.position.set(0, tall ? 1.4 : 1.1, long ? 4.6 : 3.9);
    this.camera.lookAt(0, tall ? 0.8 : 0.5, 0);

    const prevTarget = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(this.target);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    this.renderer.readRenderTargetPixels(this.target, 0, 0, SIZE, SIZE, this.pixels);
    this.renderer.setRenderTarget(prevTarget);
    this.scene.remove(mesh);

    const ctx = this.canvas.getContext('2d')!;
    const img = ctx.createImageData(SIZE, SIZE);
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const src = ((SIZE - 1 - y) * SIZE + x) * 4;
        const dst = (y * SIZE + x) * 4;
        img.data[dst] = toSrgb(this.pixels[src]);
        img.data[dst + 1] = toSrgb(this.pixels[src + 1]);
        img.data[dst + 2] = toSrgb(this.pixels[src + 2]);
        img.data[dst + 3] = this.pixels[src + 3];
      }
    }
    ctx.clearRect(0, 0, SIZE, SIZE);
    ctx.putImageData(img, 0, 0);
    return this.canvas.toDataURL('image/png');
  }
}
