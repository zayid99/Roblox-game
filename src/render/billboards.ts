import { BufferAttribute, BufferGeometry, CanvasTexture, DynamicDrawUsage, Float32BufferAttribute, Mesh, ShaderMaterial, SRGBColorSpace, Vector2, type Vector3 } from 'three';
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
/**
 * Most textures kept (LRU). Species × mutation × chip is ~280 boards of ~220 KB of GPU memory each with mips, and
 * a long session meets most of them; only the few within billboard range are in use at any time (they are
 * touched every frame, so they never fall off the end).
 */
export const WILD_CACHE_MAX = 32;

/** Wild creature billboard: name plus rarity (and a FEATURED chip). Cached per species, mutation and chip. */
export function wildBillboard(c: CreatureRef, featured: boolean): CanvasTexture {
  const key = `${c.speciesId}:${c.mutation}:${featured ? 1 : 0}`;
  let t = wildCache.get(key);
  if (t) {
    // Most recently used goes last.
    wildCache.delete(key);
    wildCache.set(key, t);
    return t;
  }
  if (wildCache.size >= WILD_CACHE_MAX) {
    const [oldKey, oldTex] = wildCache.entries().next().value as [string, CanvasTexture];
    wildCache.delete(oldKey);
    oldTex.dispose();
  }
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
/** On-screen size of a cell half (256 × 64 texels) in CSS px at scale 1, before the distance falloff. */
const PX_W = 120;
const PX_H = 30;
/** The name/rarity header is drawn a bit bigger than the income tag. */
const HEAD = 1.3;

/** Rounded dark plate behind label text (keeps it readable over the busy base). */
function plate(g: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number, alpha: number): void {
  g.fillStyle = `rgba(27,23,54,${alpha})`;
  g.beginPath();
  g.roundRect(cx - w / 2, cy - h / 2, w, h, h / 2);
  g.fill();
}

/**
 * Pedestal labels for up to 24 slots in one atlas and one mesh (§G8). Each slot has a small income tag that is
 * always shown and a name/rarity header that only opens for the focused pedestal (the one the player stands at,
 * or a tapped one). Labels keep a fixed pixel size up close (shrinking past 16 m), fade near the camera, past
 * 45 m and between the camera and the player, so the base never fills the screen with text.
 */
export class PedestalLabels {
  readonly mesh: Mesh;
  private readonly canvas = document.createElement('canvas');
  private readonly tex: CanvasTexture;
  private readonly mat: ShaderMaterial;
  private slots: number[] = [];
  private focus = new Float32Array(0);
  private focusAttr: BufferAttribute | null = null;
  private focusSlot = -1;

  constructor() {
    this.canvas.width = CELL_W * COLS;
    this.canvas.height = CELL_H * ROWS;
    this.tex = new CanvasTexture(this.canvas);
    this.tex.colorSpace = SRGBColorSpace;
    this.tex.anisotropy = 4;
    this.mat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { map: { value: this.tex }, uViewport: { value: new Vector2(1280, 720) }, uUiScale: { value: 1 }, uPlayerDepth: { value: 13 } },
      vertexShader: /* glsl */ `
        attribute vec3 aCenter;
        attribute vec2 aCorner;
        attribute float aKind;
        attribute float aFocus;
        uniform vec2 uViewport;
        uniform float uUiScale;
        uniform float uPlayerDepth;
        varying vec2 vUv;
        varying float vAlpha;
        void main() {
          vUv = uv;
          vec4 mv = modelViewMatrix * vec4(aCenter, 1.0);
          float depth = -mv.z;
          float a = smoothstep(3.0, 6.0, depth) * (1.0 - smoothstep(38.0, 50.0, depth));
          // Pedestals between the camera and the player would sit on top of the player: hide them.
          a *= smoothstep(uPlayerDepth - 4.5, uPlayerDepth - 2.0, depth);
          // The header (aKind 1) opens with the focus weight; the income tag (aKind 0) is always there.
          float open = mix(1.0, aFocus, aKind);
          a *= open;
          float k = clamp(16.0 / max(depth, 0.1), 0.45, 1.0) * uUiScale * mix(1.0, 0.7 + 0.3 * open, aKind);
          vec4 clip = projectionMatrix * mv;
          clip.xy += aCorner * k * 2.0 / uViewport * clip.w;
          gl_Position = clip;
          vAlpha = a;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D map;
        varying vec2 vUv;
        varying float vAlpha;
        void main() {
          gl_FragColor = texture2D(map, vUv);
          gl_FragColor.a *= vAlpha;
          if (gl_FragColor.a < 0.03) discard;
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new Mesh(new BufferGeometry(), this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 8;
    this.mesh.visible = false;
  }

  /** Viewport in CSS px; labels are sized in pixels (scaled down a little on small screens). */
  setViewport(w: number, h: number): void {
    this.mat.uniforms.uViewport.value.set(Math.max(1, w), Math.max(1, h));
    this.mat.uniforms.uUiScale.value = Math.min(1.15, Math.max(0.8, Math.min(w, h * 1.6) / 1152));
  }

  /** Camera-space depth of the player (labels closer to the camera than this are hidden). */
  setPlayerDepth(d: number): void {
    this.mat.uniforms.uPlayerDepth.value = d;
  }

  /**
   * Opens the header of `slot` (−1: none) and closes the others, eased over ~150 ms. Uploads only on change.
   */
  setFocus(slot: number, dt: number): void {
    if (!this.focusAttr) return;
    if (slot !== this.focusSlot) {
      this.focusSlot = slot;
      this.order();
    }
    const f = this.focus;
    let dirty = false;
    for (let e = 0; e < this.slots.length; e++) {
      const want = this.slots[e] === slot ? 1 : 0;
      const cur = f[e * 8 + 4];
      if (cur === want) continue;
      const next = want > cur ? Math.min(1, cur + dt / 0.15) : Math.max(0, cur - dt / 0.12);
      for (let v = 4; v < 8; v++) f[e * 8 + v] = next;
      dirty = true;
    }
    if (dirty) this.focusAttr.needsUpdate = true;
  }

  /** Rewrites the index buffer in place so the focused label draws last (on top of the tags behind it). */
  private order(): void {
    const index = this.mesh.geometry.getIndex();
    if (!index) return;
    const a = index.array as Uint16Array;
    const last = this.slots.indexOf(this.focusSlot);
    let k = 0;
    const put = (e: number) => {
      for (let q = 0; q < 2; q++) {
        const b = e * 8 + q * 4;
        a[k++] = b;
        a[k++] = b + 1;
        a[k++] = b + 2;
        a[k++] = b;
        a[k++] = b + 2;
        a[k++] = b + 3;
      }
    };
    for (let e = 0; e < this.slots.length; e++) if (e !== last) put(e);
    if (last >= 0) put(last);
    index.needsUpdate = true;
  }

  set(entries: { slot: number; pos: Vector3; c: CreatureRef; income: string }[]): void {
    const g = this.canvas.getContext('2d')!;
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    const center: number[] = [];
    const corner: number[] = [];
    const kind: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    const list = entries.slice(0, COLS * ROWS);
    const oldFocus = new Map<number, number>();
    this.slots.forEach((s, e) => oldFocus.set(s, this.focus[e * 8 + 4]));
    this.slots = list.map((e) => e.slot);
    this.focus = new Float32Array(list.length * 8);
    list.forEach((e, i) => {
      const cx = (i % COLS) * CELL_W;
      const cy = Math.floor(i / COLS) * CELL_H;
      const mid = cx + CELL_W / 2;
      const rarity = getSpecies(e.c.speciesId).rarity;
      // Header (top half): name + rarity on a soft plate.
      const name = creatureName(e.c);
      g.font = `400 30px ${FONT_STACK}`;
      const nameW = Math.min(CELL_W - 8, g.measureText(name).width + 34);
      plate(g, mid, cy + 33, nameW, 60, 0.72);
      stroked(g, name, mid, cy + 22, 28, '#FFFFFF', CELL_W - 30);
      stroked(g, RARITIES[rarity].name.toUpperCase(), mid, cy + 48, 19, rarityFill(g, rarity, mid, 120), CELL_W - 40);
      // Income tag (bottom half): green on a dark pill.
      g.font = `400 38px ${FONT_STACK}`;
      const tagW = Math.min(CELL_W - 8, g.measureText(e.income).width + 36);
      plate(g, mid, cy + 96, tagW, 52, 0.7);
      stroked(g, e.income, mid, cy + 97, 36, '#7DFF5A', CELL_W - 30);

      const u0 = cx / this.canvas.width;
      const u1 = (cx + CELL_W) / this.canvas.width;
      const vTop = 1 - cy / this.canvas.height;
      const vMid = 1 - (cy + CELL_H / 2) / this.canvas.height;
      const vBot = 1 - (cy + CELL_H) / this.canvas.height;
      // Tag quad (kind 0) centred on the anchor, header quad (kind 1, larger) right above it.
      const quads: [number, number, number, number, number, number][] = [
        [-PX_H / 2, PX_H / 2, vBot, vMid, 0, PX_W / 2],
        [PX_H / 2 - 2, PX_H / 2 - 2 + PX_H * HEAD, vMid, vTop, 1, (PX_W * HEAD) / 2],
      ];
      for (const [y0, y1, va, vb, k, hw] of quads) {
        const base = center.length / 3;
        for (const [x, y, uu, vv] of [[-hw, y0, u0, va], [hw, y0, u1, va], [hw, y1, u1, vb], [-hw, y1, u0, vb]]) {
          center.push(e.pos.x, e.pos.y, e.pos.z);
          corner.push(x, y);
          uv.push(uu, vv);
          kind.push(k);
        }
        idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
      const was = oldFocus.get(e.slot) ?? 0;
      for (let v = 0; v < 8; v++) this.focus[i * 8 + v] = v < 4 ? 1 : was;
    });
    this.mesh.geometry.dispose();
    const geo = new BufferGeometry();
    geo.setAttribute('position', new Float32BufferAttribute(center, 3));
    geo.setAttribute('aCenter', new Float32BufferAttribute(center, 3));
    geo.setAttribute('aCorner', new Float32BufferAttribute(corner, 2));
    geo.setAttribute('aKind', new Float32BufferAttribute(kind, 1));
    this.focusAttr = new BufferAttribute(this.focus, 1);
    this.focusAttr.setUsage(DynamicDrawUsage);
    geo.setAttribute('aFocus', this.focusAttr);
    geo.setAttribute('uv', new Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    this.mesh.geometry = geo;
    this.order();
    this.tex.needsUpdate = true;
    this.mesh.visible = list.length > 0;
  }
}
