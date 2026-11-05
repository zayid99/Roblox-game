import { CanvasTexture, DoubleSide, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace, Sprite, SpriteMaterial } from 'three';

export interface TextLine {
  text: string;
  color?: string;
  size?: number;
}

export const FONT_STACK = '"Trebuchet MS", "Arial Rounded MT Bold", "Segoe UI", system-ui, sans-serif';

/** Draws centered lines of chunky outlined text onto a canvas texture. */
export function textTexture(lines: TextLine[], width: number, height: number, bg?: string): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  if (bg) {
    const r = Math.min(width, height) * 0.12;
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.roundRect(4, 4, width - 8, height - 8, r);
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.stroke();
  }
  const total = lines.reduce((sum, l) => sum + (l.size ?? 40) * 1.2, 0);
  let y = (height - total) / 2;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.lineJoin = 'round';
  for (const line of lines) {
    const size = line.size ?? 40;
    ctx.font = `900 ${size}px ${FONT_STACK}`;
    ctx.lineWidth = size * 0.18;
    ctx.strokeStyle = 'rgba(15, 30, 60, 0.9)';
    ctx.strokeText(line.text, width / 2, y + size * 0.1, width - 16);
    ctx.fillStyle = line.color ?? '#ffffff';
    ctx.fillText(line.text, width / 2, y + size * 0.1, width - 16);
    y += size * 1.2;
  }
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** A flat sign board (faces +z). */
export function signMesh(lines: TextLine[], w: number, h: number, bg = 'rgba(20, 60, 110, 0.92)'): Mesh {
  const tex = textTexture(lines, Math.round(w * 96), Math.round(h * 96), bg);
  return new Mesh(new PlaneGeometry(w, h), new MeshBasicMaterial({ map: tex, transparent: true, side: DoubleSide }));
}

/** Text that always faces the camera. */
export function textSprite(lines: TextLine[], w: number, h: number): Sprite {
  const tex = textTexture(lines, Math.round(w * 80), Math.round(h * 80));
  const sprite = new Sprite(new SpriteMaterial({ map: tex, transparent: true, depthWrite: false }));
  sprite.scale.set(w, h, 1);
  return sprite;
}

export function disposeSprite(sprite: Sprite): void {
  sprite.material.map?.dispose();
  sprite.material.dispose();
}
