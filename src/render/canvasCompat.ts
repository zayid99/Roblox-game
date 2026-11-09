// CanvasRenderingContext2D.roundRect fallback for iOS 15 Safari, Firefox < 112 and Chromium < 99: the world signs,
// lock plaques, labels and some panels draw rounded boards, and without it the world build throws on load.

type Radii = number | DOMPointInit | (number | DOMPointInit)[] | undefined;

function firstRadius(r: Radii): number {
  const v = Array.isArray(r) ? r[0] : r;
  if (typeof v === 'number') return v;
  return v?.x ?? 0;
}

export function installRoundRectFallback(): void {
  if (typeof CanvasRenderingContext2D === 'undefined') return;
  const proto = CanvasRenderingContext2D.prototype as CanvasRenderingContext2D & { roundRect?: unknown };
  if (typeof proto.roundRect === 'function') return;
  proto.roundRect = function roundRect(this: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, radii?: Radii): void {
    const r = Math.max(0, Math.min(firstRadius(radii), Math.abs(w) / 2, Math.abs(h) / 2));
    this.moveTo(x + r, y);
    this.arcTo(x + w, y, x + w, y + h, r);
    this.arcTo(x + w, y + h, x, y + h, r);
    this.arcTo(x, y + h, x, y, r);
    this.arcTo(x, y, x + w, y, r);
    this.closePath();
  };
}

installRoundRectFallback();
