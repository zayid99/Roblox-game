import { CanvasTexture, NearestFilter, SRGBColorSpace } from 'three';

// §5.2a face decals: 16×16 grids drawn ×4 into a 384×64 atlas (6 frames). Rects are x, y, w, h in cells.
export type Expression = 'smirk' | 'grin' | 'bigGrin' | 'oh' | 'panic' | 'xEyes';
export const EXPRESSIONS: Expression[] = ['smirk', 'grin', 'bigGrin', 'oh', 'panic', 'xEyes'];

const INK = '#1B1736';
const WHITE = '#FFFFFF';
const BLUSH = '#FF9AB6';
const TONGUE = '#FF4F7B';
const INSIDE = '#8E1B3A';
const SWEAT = '#7FD8FF';

type R = [number, number, number, number];
type Layer = [string, R[]];

const px = (cells: [number, number][]): R[] => cells.map(([x, y]) => [x, y, 1, 1]);
const SMIRK_EYES: Layer[] = [
  [INK, [[4, 5, 2, 3], [10, 5, 2, 3]]],
  [WHITE, [[4, 5, 1, 1], [10, 5, 1, 1]]],
];
const BLUSH_SMALL: Layer = [BLUSH, [[2, 10, 2, 1], [12, 10, 2, 1]]];

const LAYOUTS: Record<Expression, Layer[]> = {
  smirk: [...SMIRK_EYES, [INK, [[6, 11, 4, 1], [10, 10, 1, 1]]], BLUSH_SMALL],
  grin: [...SMIRK_EYES, [INK, [[5, 10, 6, 1], [6, 11, 4, 2]]], [WHITE, [[6, 11, 4, 1]]], BLUSH_SMALL],
  bigGrin: [
    [INK, [[3, 6, 1, 1], [4, 5, 2, 1], [6, 6, 1, 1], [9, 6, 1, 1], [10, 5, 2, 1], [12, 6, 1, 1]]],
    [INK, [[4, 10, 8, 1], [5, 11, 6, 2]]],
    [WHITE, [[5, 11, 6, 1]]],
    [TONGUE, [[6, 12, 4, 1]]],
    [BLUSH, [[1, 9, 2, 2], [13, 9, 2, 2]]],
  ],
  oh: [
    [INK, [[4, 4, 2, 3], [10, 4, 2, 3]]],
    [WHITE, [[4, 4, 1, 1], [10, 4, 1, 1]]],
    [INK, [[7, 10, 2, 1], [6, 11, 1, 2], [9, 11, 1, 2], [7, 13, 2, 1]]],
    [INSIDE, [[7, 11, 2, 2]]],
  ],
  panic: [
    [INK, [[3, 4, 4, 4], [9, 4, 4, 4]]],
    [WHITE, [[4, 5, 2, 2], [10, 5, 2, 2]]],
    [INK, [[5, 6, 1, 1], [11, 6, 1, 1]]],
    [INK, px([[5, 11], [6, 10], [7, 11], [8, 10], [9, 11], [10, 10]])],
    [SWEAT, [[13, 2, 1, 2]]],
  ],
  xEyes: [
    [INK, px([[4, 4], [6, 4], [5, 5], [4, 6], [6, 6], [10, 4], [12, 4], [11, 5], [10, 6], [12, 6]])],
    [INK, [[5, 11, 6, 1]]],
    [TONGUE, [[9, 12, 2, 1]]],
  ],
};

let atlas: CanvasTexture | null = null;

/** The 6-frame face atlas (shared). Swap frames with `faceOffset`. */
export function faceAtlas(): CanvasTexture {
  if (atlas) return atlas;
  const c = document.createElement('canvas');
  c.width = 384;
  c.height = 64;
  const g = c.getContext('2d')!;
  EXPRESSIONS.forEach((e, i) => {
    for (const [color, rects] of LAYOUTS[e]) {
      g.fillStyle = color;
      for (const [x, y, w, h] of rects) g.fillRect(i * 64 + x * 4, y * 4, w * 4, h * 4);
    }
  });
  atlas = new CanvasTexture(c);
  atlas.colorSpace = SRGBColorSpace;
  atlas.magFilter = NearestFilter;
  atlas.minFilter = NearestFilter;
  atlas.generateMipmaps = false;
  atlas.repeat.set(1 / 6, 1);
  return atlas;
}

/** u offset of an expression's frame in the atlas. */
export function faceOffset(e: Expression): number {
  return EXPRESSIONS.indexOf(e) / 6;
}
