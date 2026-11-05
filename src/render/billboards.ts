import { BufferGeometry, CanvasTexture, Float32BufferAttribute, Mesh, ShaderMaterial, SRGBColorSpace, type Vector3 } from 'three';
import { getSpecies, MUTATIONS, RARITIES, type CreatureRef } from '../game/creatures';
import { FONT_STACK } from './labels';

const INK = '#1B1736';

function stroked(g: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, fill: string | CanvasGradient, maxW: number): void {
  g.font = `400 ${size}px ${FONT_STACK}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = size * 0.28;
  g.strokeStyle = INK;
  g.strokeText(text, x, y, maxW);
  g.fillStyle = fill;
  g.fillText(text, x, y, maxW);
}

function rarityFill(g: CanvasRenderingContext2D, rarity: number, x: number, w: number): string | CanvasGradient {
  if (rarity < 4) return RARITIES[rarity].color;
  const grad = g.createLinearGradient(x - w / 2, 0, x + w / 2, 0);
  const stops = rarity === 4 ? ['#FFE07A', '#FFB52E', '#FF8A1E'] : rarity === 5 ? ['#FF9AB6', '#FF4F7B', '#C92A5C'] : ['#9AFBFF', '#22F0FF', '#B065FF'];
  stops.forEach((c, i) => grad.addColorStop(i / 2, c));
  return grad;
}

function creatureName(c: CreatureRef): string {
  const s = getSpecies(c.speciesId);
  return c.mutation > 0 ? `${MUTATIONS[c.mutation].name} ${s.name}` : s.name;
}

const wildCache = new Map<string, CanvasTexture>();

/** Wild creature billboard: name plus rarity (and a FEATURED chip). Cached per species, mutation and chip. */
export function wildBillboard(c: CreatureRef, featured: boolean): CanvasTexture {
  const key = `${c.speciesId}:${c.mutation}:${featured ? 1 : 0}`;
  let t = wildCache.get(key);
  if (t) return t;
  const cv = document.createElement('canvas');
  cv.width = 320;
  cv.height = 128;
  const g = cv.getContext('2d')!;
  const rarity = getSpecies(c.speciesId).rarity;
  let y = 40;
  if (featured) {
    g.fillStyle = INK;
    g.beginPath();
    g.roundRect(100, 2, 120, 30, 15);
    g.fill();
    g.fillStyle = '#FFC92E';
    g.beginPath();
    g.roundRect(103, 5, 114, 24, 12);
    g.fill();
    g.font = `400 18px ${FONT_STACK}`;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = INK;
    g.fillText('FEATURED', 160, 18);
    y = 56;
  }
  stroked(g, creatureName(c), 160, y, 34, '#FFFFFF', 310);
  stroked(g, RARITIES[rarity].name.toUpperCase(), 160, y + 36, 26, rarityFill(g, rarity, 160, 160), 300);
  t = new CanvasTexture(cv);
  t.colorSpace = SRGBColorSpace;
  wildCache.set(key, t);
  return t;
}

// ---------- Pedestal labels: one camera-facing batch, one draw call ----------

const CELL_W = 256;
const CELL_H = 128;
const COLS = 4;
const ROWS = 6;

/**
 * Pedestal billboards (name, rarity, "$N/s") for up to 24 slots in one atlas and one mesh.
 * Quads face the camera in the vertex shader. Rebuilt only when the base changes.
 */
export class PedestalLabels {
  readonly mesh: Mesh;
  private readonly canvas = document.createElement('canvas');
  private readonly tex: CanvasTexture;

  constructor() {
    this.canvas.width = CELL_W * COLS;
    this.canvas.height = CELL_H * ROWS;
    this.tex = new CanvasTexture(this.canvas);
    this.tex.colorSpace = SRGBColorSpace;
    this.tex.anisotropy = 4;
    const mat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { map: { value: this.tex } },
      vertexShader: /* glsl */ `
        attribute vec3 aCenter;
        attribute vec2 aCorner;
        varying vec2 vUv;
        void main() {
          vUv = uv;
          vec4 mv = modelViewMatrix * vec4(aCenter, 1.0);
          mv.xy += aCorner;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D map;
        varying vec2 vUv;
        void main() {
          gl_FragColor = texture2D(map, vUv);
          if (gl_FragColor.a < 0.03) discard;
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new Mesh(new BufferGeometry(), mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 8;
  }

  set(entries: { pos: Vector3; c: CreatureRef; income: string }[]): void {
    const g = this.canvas.getContext('2d')!;
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const center: number[] = [];
    const corner: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    entries.slice(0, COLS * ROWS).forEach((e, i) => {
      const cx = (i % COLS) * CELL_W;
      const cy = Math.floor(i / COLS) * CELL_H;
      const rarity = getSpecies(e.c.speciesId).rarity;
      stroked(g, creatureName(e.c), cx + CELL_W / 2, cy + 22, 26, '#FFFFFF', CELL_W - 10);
      stroked(g, RARITIES[rarity].name.toUpperCase(), cx + CELL_W / 2, cy + 52, 22, rarityFill(g, rarity, cx + CELL_W / 2, 140), CELL_W - 10);
      stroked(g, e.income, cx + CELL_W / 2, cy + 92, 40, '#7DFF5A', CELL_W - 10);
      const u0 = cx / this.canvas.width;
      const u1 = (cx + CELL_W) / this.canvas.width;
      const v1 = 1 - cy / this.canvas.height;
      const v0 = 1 - (cy + CELL_H) / this.canvas.height;
      const w = 2.6;
      const h = 1.3;
      const base = center.length / 3;
      for (const [x, y, uu, vv] of [[-w / 2, -h / 2, u0, v0], [w / 2, -h / 2, u1, v0], [w / 2, h / 2, u1, v1], [-w / 2, h / 2, u0, v1]]) {
        center.push(e.pos.x, e.pos.y, e.pos.z);
        corner.push(x, y);
        uv.push(uu, vv);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
    });
    this.mesh.geometry.dispose();
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(center, 3));
    geo.setAttribute('aCenter', new Float32BufferAttribute(center, 3));
    geo.setAttribute('aCorner', new Float32BufferAttribute(corner, 2));
    geo.setAttribute('uv', new Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    this.mesh.geometry = geo;
    this.tex.needsUpdate = true;
    this.mesh.visible = entries.length > 0;
  }
}
