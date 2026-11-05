import {
  BufferGeometry,
  CanvasTexture,
  DoubleSide,
  Float32BufferAttribute,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  type Matrix4,
  Vector3,
} from 'three';

export interface TextLine {
  text: string;
  color?: string;
  size?: number;
}

export const FONT_STACK = '"Lilita One", "Trebuchet MS", "Arial Rounded MT Bold", "Segoe UI", system-ui, sans-serif';
const INK = '#1B1736';

/** Draws centered lines of chunky ink-stroked text into a 2D context region. */
export function drawLines(ctx: CanvasRenderingContext2D, lines: TextLine[], x: number, y: number, width: number, height: number): void {
  const total = lines.reduce((sum, l) => sum + (l.size ?? 40) * 1.15, 0);
  let cy = y + (height - total) / 2;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.lineJoin = 'round';
  for (const line of lines) {
    const size = line.size ?? 40;
    ctx.font = `400 ${size}px ${FONT_STACK}`;
    ctx.lineWidth = size * 0.22;
    ctx.strokeStyle = INK;
    ctx.strokeText(line.text, x + width / 2, cy + size * 0.08, width - 24);
    ctx.fillStyle = line.color ?? '#ffffff';
    ctx.fillText(line.text, x + width / 2, cy + size * 0.08, width - 24);
    cy += size * 1.15;
  }
}

/** Nautical board: navy body, rope-coloured frame, ink outline. */
export function drawBoard(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill = '#1F3F7A'): void {
  const r = Math.min(w, h) * 0.14;
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.roundRect(x + 2, y + 2, w - 4, h - 4, r);
  ctx.fill();
  ctx.fillStyle = '#D9A35F';
  ctx.beginPath();
  ctx.roundRect(x + 7, y + 7, w - 14, h - 14, r * 0.85);
  ctx.fill();
  const grad = ctx.createLinearGradient(0, y, 0, y + h);
  grad.addColorStop(0, fill);
  grad.addColorStop(1, '#14285A');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.roundRect(x + 14, y + 14, w - 28, h - 28, r * 0.7);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath();
  ctx.roundRect(x + 20, y + 18, w - 40, (h - 36) * 0.35, r * 0.5);
  ctx.fill();
}

/** Draws centered lines of chunky outlined text onto a canvas texture. */
export function textTexture(lines: TextLine[], width: number, height: number, bg?: string): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  if (bg) drawBoard(ctx, 0, 0, width, height, bg);
  drawLines(ctx, lines, 0, 0, width, height);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** A flat sign board (faces +z). */
export function signMesh(lines: TextLine[], w: number, h: number, bg = '#1F3F7A'): Mesh {
  const tex = textTexture(lines, Math.round(w * 96), Math.round(h * 96), bg);
  return new Mesh(new PlaneGeometry(w, h), new MeshBasicMaterial({ map: tex, transparent: true, side: DoubleSide, toneMapped: false }));
}

/** Text that always faces the camera. */
export function textSprite(lines: TextLine[], w: number, h: number): Sprite {
  const tex = textTexture(lines, Math.round(w * 80), Math.round(h * 80));
  const sprite = new Sprite(new SpriteMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
  sprite.scale.set(w, h, 1);
  return sprite;
}

export function disposeSprite(sprite: Sprite): void {
  sprite.material.map?.dispose();
  sprite.material.dispose();
}

// ---------- Sign atlas: every world sign in one texture and one draw call ----------

const CELL_W = 512;
const CELL_H = 205;
const COLS = 4;
const ROWS = 5;

interface Quad {
  matrix: Matrix4;
  w: number;
  h: number;
  cell: number;
  draw: (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => void;
}

/** Collects sign boards, then builds one double-sided mesh with one canvas atlas (2048×1024). */
export class SignAtlas {
  private readonly quads: Quad[] = [];

  /** A board with text lines (aspect 2.5:1 fits a cell best). */
  board(matrix: Matrix4, w: number, h: number, lines: TextLine[], fill?: string): void {
    this.custom(matrix, w, h, (ctx, x, y, cw, ch) => {
      drawBoard(ctx, x, y, cw, ch, fill);
      drawLines(ctx, lines, x, y + 4, cw, ch - 8);
    });
  }

  custom(matrix: Matrix4, w: number, h: number, draw: Quad['draw']): void {
    if (this.quads.length >= COLS * ROWS) return;
    this.quads.push({ matrix, w, h, cell: this.quads.length, draw });
  }

  build(): Mesh {
    const canvas = document.createElement('canvas');
    canvas.width = CELL_W * COLS;
    canvas.height = CELL_H * ROWS;
    const ctx = canvas.getContext('2d')!;
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    const v = new Vector3();
    for (const q of this.quads) {
      const cx = (q.cell % COLS) * CELL_W;
      const cy = Math.floor(q.cell / COLS) * CELL_H;
      q.draw(ctx, cx, cy, CELL_W, CELL_H);
      const u0 = (cx + 1) / canvas.width;
      const u1 = (cx + CELL_W - 1) / canvas.width;
      const v1 = 1 - (cy + 1) / canvas.height;
      const v0 = 1 - (cy + CELL_H - 1) / canvas.height;
      const base = pos.length / 3;
      const corners: [number, number, number, number][] = [
        [-q.w / 2, -q.h / 2, u0, v0],
        [q.w / 2, -q.h / 2, u1, v0],
        [q.w / 2, q.h / 2, u1, v1],
        [-q.w / 2, q.h / 2, u0, v1],
      ];
      for (const [x, y, uu, vv] of corners) {
        v.set(x, y, 0).applyMatrix4(q.matrix);
        pos.push(v.x, v.y, v.z);
        uv.push(uu, vv);
      }
      // Back side, mirrored so text reads correctly from behind too.
      for (const [x, y, uu, vv] of corners) {
        v.set(-x, y, -0.01).applyMatrix4(q.matrix);
        pos.push(v.x, v.y, v.z);
        uv.push(uu, vv);
      }
      idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
      idx.push(base + 4, base + 6, base + 5, base + 4, base + 7, base + 6);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeBoundingSphere();
    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    tex.anisotropy = 4;
    return new Mesh(g, new MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.05, toneMapped: false }));
  }
}
