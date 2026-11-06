// Original 2-tone sticker icon set (spec §3). Every icon is built from "parts":
// a silhouette path drawn in 6 layers (ink drop, base, lower-right shade crescent,
// top-left highlight, details, ink outline). One outline weight (3 on a 48 grid).
import type { IconId } from '../contracts';

const INK = '#1B1736';

interface Part {
  /** Silhouette path. */
  d: string;
  /** Base fill (or 'currentColor'). */
  fill: string;
  /** Shade colour for the lower-right crescent; 'ink' = translucent ink (multi-colour parts). */
  shade?: string;
  /** Offset of the lit area; the uncovered rim becomes the shade crescent. */
  off?: [number, number];
  /** Highlight ellipse [cx, cy, rx, ry, rotation]. */
  hl?: [number, number, number, number, number?];
  /** Extra markup clipped to the silhouette, drawn over the base (stripes, emblems). */
  deco?: string;
  /** Group transform. */
  t?: string;
  evenodd?: boolean;
  /** No drop shadow for this part (inner parts). */
  noDrop?: boolean;
}

/** A stroke-built piece (rope, shackle, X): ink under-stroke, colour stroke, optional light core. */
interface Stroke {
  stroke: string;
  d: string;
  w: number;
  core?: string;
}

interface IconDef {
  parts: (Part | Stroke)[];
  /** Ink detail lines (stroke 2, round caps), drawn over everything. */
  det?: string;
  /** Markup drawn on top of everything (already outlined). */
  top?: string;
  rot?: number;
  opacity?: number;
}

// ---------- path helpers (48 grid) ----------
const n = (v: number) => +v.toFixed(2);
function rr(x: number, y: number, w: number, h: number, r: number): string {
  r = Math.min(r, w / 2, h / 2);
  return `M${n(x + r)} ${n(y)}H${n(x + w - r)}A${r} ${r} 0 0 1 ${n(x + w)} ${n(y + r)}V${n(y + h - r)}A${r} ${r} 0 0 1 ${n(x + w - r)} ${n(y + h)}H${n(x + r)}A${r} ${r} 0 0 1 ${n(x)} ${n(y + h - r)}V${n(y + r)}A${r} ${r} 0 0 1 ${n(x + r)} ${n(y)}Z`;
}
function circ(cx: number, cy: number, r: number): string {
  return `M${n(cx - r)} ${n(cy)}a${r} ${r} 0 1 0 ${n(2 * r)} 0a${r} ${r} 0 1 0 ${n(-2 * r)} 0Z`;
}
function star(cx: number, cy: number, R: number, r: number, k: number, rotDeg = -90): string {
  let d = '';
  for (let i = 0; i < k * 2; i++) {
    const a = ((rotDeg + (i * 180) / k) * Math.PI) / 180;
    const rad = i % 2 === 0 ? R : r;
    d += `${i === 0 ? 'M' : 'L'}${n(cx + Math.cos(a) * rad)} ${n(cy + Math.sin(a) * rad)}`;
  }
  return d + 'Z';
}
function pt(cx: number, cy: number, r: number, deg: number): string {
  const a = (deg * Math.PI) / 180;
  return `${n(cx + Math.cos(a) * r)} ${n(cy + Math.sin(a) * r)}`;
}
function gear(cx: number, cy: number, teeth: number, ro: number, ri: number, hole: number): string {
  let d = '';
  const step = 360 / teeth;
  for (let i = 0; i < teeth; i++) {
    const a = i * step - 90;
    const pts = [pt(cx, cy, ri, a - step * 0.5), pt(cx, cy, ro, a - step * 0.22), pt(cx, cy, ro, a + step * 0.22), pt(cx, cy, ri, a + step * 0.5)];
    d += `${i === 0 ? 'M' : 'L'}${pts[0]}L${pts[1]}L${pts[2]}L${pts[3]}`;
  }
  return d + 'Z' + circ(cx, cy, hole);
}
/** Thick arc band with an arrowhead at the end (angles in degrees, clockwise from +x). */
function arcArrow(cx: number, cy: number, r1: number, r2: number, a0: number, a1: number): string {
  const mid = (r1 + r2) / 2;
  const big = a1 - a0 > 180 ? 1 : 0;
  return (
    `M${pt(cx, cy, r2, a0)}A${r2} ${r2} 0 ${big} 1 ${pt(cx, cy, r2, a1)}` +
    `L${pt(cx, cy, r2 + 4.5, a1)}L${pt(cx, cy, mid, a1 + 26)}L${pt(cx, cy, r1 - 4.5, a1)}L${pt(cx, cy, r1, a1)}` +
    `A${r1} ${r1} 0 ${big} 0 ${pt(cx, cy, r1, a0)}Z`
  );
}

const SHADE_CUR = 'color-mix(in srgb, currentColor 62%, #1B1736)';

// ---------- the 34 icons ----------
function bill(t: string, medallion: boolean): Part {
  return {
    d: rr(-16, -9, 32, 18, 3.5),
    fill: '#7DFF5A',
    shade: '#2FC23A',
    off: [-2.5, -3],
    t,
    hl: [-9, -6, 6, 2.2],
    deco:
      `<path d="${rr(-12.5, -5.5, 25, 11, 2)}" fill="none" stroke="#2FC23A" stroke-width="1.6"/>` +
      (medallion
        ? `<circle r="6.2" fill="#F4FFB8" stroke="${INK}" stroke-width="2"/><path d="M2.4 -2.6Q0 -4.2-2 -2.8Q-3.4-.9 0 0Q3.4.9 2 2.8Q0 4.2-2.6 2.6M0-5V5" fill="none" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"/>`
        : ''),
  };
}

const DEFS: Record<IconId, IconDef> = {
  cash: {
    parts: [bill('translate(25 34) rotate(-3)', false), bill('translate(24 27.5) rotate(-13)', false), bill('translate(23.5 20) rotate(-7)', true)],
  },
  pearl: {
    parts: [
      {
        d: 'M5 31C7 26 41 26 43 31L39.5 40C32 45 16 45 8.5 40Z',
        fill: '#FF9AB6',
        shade: '#E2648E',
        deco: `<path d="M24 44L13 30M24 44L24 28M24 44L35 30" stroke="#E2648E" stroke-width="2.2" fill="none" stroke-linecap="round"/>`,
      },
      { d: circ(24, 21, 13), fill: '#EAF6FF', shade: '#7FD8FF', off: [-3.5, -4], hl: [19, 15.5, 5, 3.2, -35] },
    ],
    top: `<circle cx="30" cy="25" r="1.8" fill="#fff"/>`,
  },
  shop: {
    parts: [
      { d: rr(10, 25, 28, 17, 3), fill: '#3FCB4B', shade: '#23963A', hl: [16, 28, 5, 1.6] },
      {
        d: 'M9 8H39L44 22Q40 28 36 22Q32 28 28 22Q24 28 20 22Q16 28 12 22Q8 28 4 22Z',
        fill: '#FF4D5E',
        shade: 'ink',
        deco: `<path d="M14.4 6L20.8 6L20 30L12 30ZM27.2 6L33.6 6L36 30L28 30Z" fill="#fff"/>`,
        hl: [14, 11, 6, 2],
      },
    ],
    top: `<circle cx="24" cy="34" r="4.6" fill="#FFC92E" stroke="${INK}" stroke-width="2.2"/>`,
    det: 'M15 37H19M29 37H33',
  },
  index: {
    rot: -6,
    parts: [
      { d: 'M29 34V45.5L32.5 42.5L36 45.5V34Z', fill: '#FF4D5E', shade: '#D9233A' },
      { d: rr(13, 8, 27, 34, 4), fill: '#FFF6E0', shade: '#E9CF98', deco: `<path d="M36 12V39M33 12V39" stroke="#E9CF98" stroke-width="1.5"/>` },
      { d: rr(8, 5, 28, 35, 4.5), fill: '#9B5CFF', shade: '#6A2FD1', hl: [17, 10, 6, 2.4] },
      { d: 'M15 23Q21 15.5 28 23Q21 30.5 15 23ZM27 23L33 18V28Z', fill: '#FFC92E', shade: '#E07800', off: [-1.5, -2], noDrop: true },
    ],
    det: 'M12.5 9V36',
    top: `<circle cx="19" cy="22" r="1.4" fill="${INK}"/>`,
  },
  rebirth: {
    parts: [
      { d: arcArrow(24, 25, 15.5, 20.5, 150, 395), fill: '#FF8C3A', shade: '#D95A1A', off: [-2, -2.5] },
      { d: star(24, 25.5, 13, 6, 5), fill: '#FFC92E', shade: '#E07800', hl: [20.5, 20, 4, 2.4, -20] },
    ],
  },
  gift: {
    rot: -4,
    parts: [
      { d: rr(9, 22, 30, 21, 3), fill: '#FF4D5E', shade: '#D9233A', deco: `<rect x="20.5" y="20" width="7" height="26" fill="#FFC92E"/><rect x="25.5" y="20" width="2" height="26" fill="#E07800"/>` },
      { d: rr(6, 15, 36, 10, 3), fill: '#FF4D5E', shade: '#D9233A', hl: [13, 17.5, 5, 1.6], deco: `<rect x="20" y="13" width="8" height="14" fill="#FFC92E"/>` },
      { d: 'M24 15C18 4 7 7 12 14.5C15 18 21 17 24 15ZM24 15C30 4 41 7 36 14.5C33 18 27 17 24 15Z', fill: '#FFC92E', shade: '#E07800', off: [-1.5, -2] },
      { d: rr(20.5, 11.5, 7, 7, 3), fill: '#FFC92E', shade: '#E07800', off: [-1, -1.5], noDrop: true },
    ],
  },
  locker: {
    parts: [
      {
        d: circ(22, 27, 16) + circ(22, 27, 5.5),
        evenodd: true,
        fill: '#D9A35F',
        shade: '#B07A3A',
        hl: [14, 18, 5, 2.4, -40],
        deco: `<circle cx="22" cy="27" r="10.8" fill="none" stroke="#B07A3A" stroke-width="2"/><circle cx="22" cy="27" r="13.5" fill="none" stroke="#7A4F14" stroke-width="1.4" stroke-dasharray="2.6 3.2" opacity=".55"/><circle cx="22" cy="27" r="8" fill="none" stroke="#7A4F14" stroke-width="1.4" stroke-dasharray="2.2 2.8" opacity=".55"/>`,
      },
      { d: 'M37 3Q38.5 10.5 45 12Q38.5 13.5 37 21Q35.5 13.5 29 12Q35.5 10.5 37 3Z', fill: '#7FFBE6', shade: '#14B39C', off: [-1.2, -1.6] },
    ],
  },
  settings: {
    rot: 8,
    parts: [{ d: gear(24, 24, 8, 20, 15.5, 6), evenodd: true, fill: '#7FA8D9', shade: '#4A6FA0', hl: [16, 15, 6, 3, -40] }],
    det: '',
  },
  'sound-on': {
    parts: [
      { d: 'M6 18.5H13.5L23 9.5V38.5L13.5 29.5H6Z', fill: '#34AFFF', shade: '#1679D9', hl: [10, 20.5, 3.2, 1.5] },
      { stroke: '#FFFFFF', d: 'M29.5 18.5Q33 24 29.5 29.5', w: 4 },
      { stroke: '#FFFFFF', d: 'M35 13Q42.5 24 35 35', w: 4 },
    ],
  },
  'sound-off': {
    parts: [
      { d: 'M5 18.5H12.5L22 9.5V38.5L12.5 29.5H5Z', fill: '#34AFFF', shade: '#1679D9', hl: [9, 20.5, 3.2, 1.5] },
      { stroke: '#FF4D5E', d: 'M29 17.5L41 30.5M41 17.5L29 30.5', w: 5 },
    ],
  },
  speed: {
    rot: -6,
    parts: [
      { stroke: '#FFFFFF', d: 'M3 17H9M2 23H8M4 29H9', w: 3.5 },
      { d: 'M13 20Q13 13 19 13H25Q27 19 33 20.5L40 22.5Q46 24.5 45 31V33H13Z', fill: '#34AFFF', shade: '#1679D9', hl: [19, 16, 4.5, 2] },
      { d: rr(11.5, 31, 35, 8, 4), fill: '#FFFFFF', shade: '#D6DCE4', off: [-1.5, -2] },
    ],
    det: 'M25 20L22.5 23.5M29 21.5L26.5 25',
  },
  reach: {
    parts: [
      { stroke: '#D9A35F', d: 'M22 27Q30 26 33 15', w: 4.5 },
      {
        d: circ(16, 32, 11.5) + circ(16, 32, 4),
        evenodd: true,
        fill: '#D9A35F',
        shade: '#B07A3A',
        hl: [10, 26, 4, 2, -40],
        deco: `<circle cx="16" cy="32" r="7.8" fill="none" stroke="#B07A3A" stroke-width="2"/>`,
      },
      { stroke: '#FFC92E', d: 'M35 4V14Q35 22 28.5 22Q24 22 23.5 17.5', w: 4.5, core: '#FFF07A' },
    ],
    top: `<circle cx="35" cy="5" r="3.6" fill="#FFC92E" stroke="${INK}" stroke-width="2.4"/>`,
  },
  power: {
    parts: [
      { d: star(30, 17, 15, 8, 8, -70), fill: '#FFF07A', shade: '#FFC92E', off: [-2, -2.5] },
      { d: rr(20, 3, 9, 42, 4.5), fill: '#D9A35F', shade: '#B07A3A', deco: `<path d="M18 9L31 3M18 17L31 11M18 33L31 27M18 41L31 35" stroke="#B07A3A" stroke-width="2.2"/>` },
      { d: 'M11 24Q11 17.5 18 17.5H31Q37.5 17.5 37.5 24V30Q37.5 36.5 31 36.5H18Q11 36.5 11 30Z', fill: '#FFB27A', shade: '#E0844A', hl: [16, 21, 4, 2] },
      { d: 'M7 25Q6 19 12 18L20 20.5Q21.5 25.5 16.5 27.5L11 28.5Q7.5 28.5 7 25Z', fill: '#FFB27A', shade: '#E0844A', off: [-1.5, -2] },
    ],
    det: 'M24 24H37M24 30H37',
  },
  carry: {
    rot: 4,
    parts: [
      { stroke: '#6A2FD1', d: 'M18 13.5Q18 5.5 24 5.5Q30 5.5 30 13.5', w: 4 },
      { d: rr(10, 11, 28, 33, 9), fill: '#9B5CFF', shade: '#6A2FD1', hl: [17, 16, 5, 2.5, -20] },
      { d: rr(14.5, 27, 19, 13, 4.5), fill: '#C79BFF', shade: '#9B5CFF', off: [-1.5, -2] },
      { d: rr(21, 24.5, 6, 6, 2), fill: '#FFC92E', shade: '#E07800', off: [-1, -1], noDrop: true },
    ],
    det: 'M15.5 33H32.5',
  },
  pedestal: {
    parts: [
      { d: rr(5, 32, 38, 11, 3), fill: '#ECE5D6', shade: '#C2B79F', deco: `<rect x="0" y="32" width="48" height="3.5" fill="#FFC92E"/>` },
      { d: rr(11, 22, 26, 11, 3), fill: '#ECE5D6', shade: '#C2B79F', deco: `<rect x="0" y="22" width="48" height="3.5" fill="#FFC92E"/>` },
      { d: star(24, 12, 10, 4.6, 5), fill: '#FFC92E', shade: '#E07800', hl: [21.5, 8.5, 2.5, 1.5] },
    ],
  },
  wave: {
    parts: [
      {
        d: 'M4 41C4 25 13 9 29 7.5C39 7 45 14 43 21.5C41 28 33 28.5 31 23.5C29.5 19.5 32.5 16 36 17.5C33 13 25 13.5 21 21C17.5 28 21 36 30 38L44 41Z',
        fill: 'currentColor',
        shade: SHADE_CUR,
        deco: `<path d="M9 33C11 20 19 11.5 29 11C36 10.5 41 15 40 20.5" fill="none" stroke="#fff" stroke-width="4.5" stroke-linecap="round"/>`,
      },
    ],
    top: `<circle cx="11" cy="18" r="2.4" fill="#fff" stroke="${INK}" stroke-width="1.6"/><circle cx="6" cy="25" r="1.7" fill="#fff" stroke="${INK}" stroke-width="1.4"/>`,
  },
  lighthouse: {
    parts: [
      {
        d: 'M17.5 17H30.5L35 44H13Z',
        fill: '#FF4D5E',
        shade: 'ink',
        deco: `<rect x="0" y="23" width="48" height="5.5" fill="#fff"/><rect x="0" y="33.5" width="48" height="5.5" fill="#fff"/>`,
        hl: [19.5, 20, 1.6, 2.5],
      },
      { d: rr(17.5, 8, 13, 10, 2), fill: '#FFF07A', shade: '#FFC92E', off: [-1.5, -2], hl: [21, 10.5, 2, 1.4] },
      { d: rr(13.5, 15.5, 21, 4.5, 2.25), fill: '#123A5C', shade: '#0B2740', off: [-1, -1.2] },
      { d: 'M15.5 9.5L24 2.5L32.5 9.5Z', fill: '#123A5C', shade: '#0B2740', off: [-1, -1.2] },
    ],
    top: `<path d="M8 11L3 9M8 14H3M40 11L45 9M40 14H45" stroke="#FFF07A" stroke-width="2.5" stroke-linecap="round"/>`,
  },
  home: {
    parts: [
      { d: 'M35 21Q42 9 47 14Q41 14 38 24Z', fill: '#3FCB4B', shade: '#23963A', off: [-1, -1.5] },
      { d: rr(11, 22, 26, 21, 2.5), fill: '#F4D9A0', shade: '#D9B070' },
      { d: rr(20, 30, 8, 13, 3), fill: '#B97E2A', shade: '#7A4F14', off: [-1, -1.5], noDrop: true },
      { d: 'M5 24.5L24 8L43 24.5Q43.5 27.5 40 27.5H8Q4.5 27.5 5 24.5Z', fill: '#FF4D5E', shade: '#D9233A', hl: [17, 17, 5, 1.8, -38] },
    ],
  },
  lock: {
    rot: 4,
    parts: [
      { stroke: '#A9B3C1', d: 'M16 22V15.5Q16 7.5 24 7.5Q32 7.5 32 15.5V22', w: 4.6, core: '#D6DCE4' },
      { d: rr(8.5, 20, 31, 24, 6), fill: '#FFC92E', shade: '#E07800', hl: [15, 24, 5, 2] },
    ],
    top: `<path d="M24 27.5a3.4 3.4 0 0 1 1.9 6.2L27 39H21L22.1 33.7A3.4 3.4 0 0 1 24 27.5Z" fill="${INK}"/>`,
  },
  check: {
    parts: [
      { d: circ(24, 24, 19), fill: '#3FCB4B', shade: '#23963A', hl: [16, 14, 6, 3, -35] },
      { stroke: '#FFFFFF', d: 'M14 24.5L21 31.5L34 16.5', w: 5.5 },
    ],
  },
  close: {
    parts: [{ stroke: '#FFFFFF', d: 'M14 14L34 34M34 14L14 34', w: 7.5, core: '#FFFFFF' }],
  },
  play: {
    parts: [{ d: 'M15 8.5Q11.5 6.5 11.5 10.5V37.5Q11.5 41.5 15 39.5L38.5 26.5Q42 24 38.5 21.5Z', fill: '#FFFFFF', shade: '#D6DCE4', off: [-2.5, -3] }],
  },
  'arrow-up': {
    parts: [{ d: 'M24 4.5L43 24.5H32V43H16V24.5H5Z', fill: 'currentColor', shade: SHADE_CUR, off: [-2.5, -3], hl: [18, 21, 3, 2] }],
  },
  chevron: {
    parts: [{ d: 'M13 5.5L38 24L13 42.5L7 35L22 24L7 13Z', fill: '#3FCB4B', shade: '#23963A', off: [-2, -3] }],
  },
  chain: {
    parts: [
      { d: rr(-12, -7.5, 24, 15, 7.5) + rr(-6.5, -2.5, 13, 5, 2.5), evenodd: true, t: 'translate(31 18) rotate(-35)', fill: '#E07800', shade: '#9A5200', off: [-1.5, -2] },
      { d: rr(-12, -7.5, 24, 15, 7.5) + rr(-6.5, -2.5, 13, 5, 2.5), evenodd: true, t: 'translate(17 30) rotate(-35)', fill: '#FFC92E', shade: '#E07800', off: [-1.5, -2], hl: [-6, -4.5, 3.5, 1.4] },
    ],
  },
  perfect: {
    rot: 4,
    parts: [{ d: 'M28 3L9 27.5H21.5L17 45L39 18.5H26.5L32 3Z', fill: '#FFF07A', shade: '#FFC92E', off: [-2, -2.5], hl: [24, 10, 2.5, 4, 35] }],
  },
  sparkle: {
    parts: [{ d: 'M24 3Q27 21 45 24Q27 27 24 45Q21 27 3 24Q21 21 24 3Z', fill: '#FFFFFF', shade: '#BDF6FF', off: [-2, -2.5] }],
  },
  flame: {
    rot: 4,
    parts: [
      { d: 'M24 44.5C13 44.5 8 36 10 28C12 21 17 19 17 11C22 14 24.5 19 23.5 24C26.5 22 27.5 17 26.5 12C35.5 17.5 40.5 27 38.5 34C36.5 40.5 31 44.5 24 44.5Z', fill: '#FF8C3A', shade: '#FF4D5E' },
      { d: 'M24 41.5C19 41.5 17 37.5 18 33.5C19 30.5 22 29.5 23 26C27 29 30 32 29.5 36C29 39.5 27 41.5 24 41.5Z', fill: '#FFF07A', shade: '#FFC92E', off: [-1.2, -1.5], noDrop: true },
    ],
  },
  'lucky-tide': {
    parts: [
      {
        d: circ(24, 24, 19.5),
        fill: '#FFC92E',
        shade: '#E07800',
        hl: [16, 13.5, 6, 3, -35],
        deco: `<circle cx="24" cy="24" r="14.5" fill="none" stroke="#E07800" stroke-width="2"/>`,
      },
    ],
    top: `<path d="M12.5 31C13 23 18 16.5 25.5 16.5C31 16.5 34.5 20 33.5 24C32.5 27.5 28.5 27.5 27.5 25C26.8 23 28.5 21.5 30 22.2C28 19.5 23 20.5 21.5 25C20.5 28.5 23 31 27 31.5L35.5 31Z" fill="#34AFFF" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>`,
  },
  gem: {
    parts: [
      {
        d: 'M14 7H34L43.5 18.5L24 42.5L4.5 18.5Z',
        fill: 'currentColor',
        shade: SHADE_CUR,
        off: [-2.5, -3],
        deco: `<path d="M14 7L19 18.5L24 7L29 18.5L34 7M4.5 18.5H43.5M19 18.5L24 42.5L29 18.5" fill="none" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round" opacity=".45"/><path d="M14 7L19 18.5H4.5Z" fill="#fff" opacity=".6"/>`,
      },
    ],
  },
  creature: {
    parts: [
      {
        d: 'M10 40.5C4.5 40.5 4.5 33.5 8 29C6 18 13 8.5 24 8.5C35 8.5 42 18 40 29C43.5 33.5 43.5 40.5 38 40.5Q35 37.5 31 40.5Q27.5 37.5 24 40.5Q20.5 37.5 17 40.5Q13.5 37.5 10 40.5Z',
        fill: 'currentColor',
        shade: SHADE_CUR,
        hl: [17, 15, 5, 2.6, -30],
      },
    ],
    top: `<circle cx="19" cy="24" r="4" fill="#fff" stroke="${INK}" stroke-width="2"/><circle cx="30" cy="24" r="4" fill="#fff" stroke="${INK}" stroke-width="2"/><circle cx="20" cy="25" r="1.7" fill="${INK}"/><circle cx="31" cy="25" r="1.7" fill="${INK}"/>`,
  },
  warning: {
    parts: [{ d: 'M24 5Q27 5 28.5 8L44 37Q45.5 42 40 42H8Q2.5 42 4 37L19.5 8Q21 5 24 5Z', fill: '#FFC92E', shade: '#E07800', hl: [20, 14, 2.5, 4, 28] }],
    top: `<path d="${rr(21.5, 15, 5, 15, 2.5)}" fill="${INK}"/><circle cx="24" cy="35.5" r="3" fill="${INK}"/>`,
  },
  hand: {
    rot: -28,
    parts: [
      { d: rr(17.5, 3, 9.5, 26, 4.75), fill: '#FFFFFF', shade: '#D6DCE4', off: [-1.5, -2] },
      { d: 'M12 26Q12 19 19 19H31Q38 19 38 27V33Q38 41 30 41H20Q12 41 12 33Z', fill: '#FFFFFF', shade: '#D6DCE4', off: [-2, -2.5] },
      { d: 'M7.5 27Q6 21.5 11.5 20.5L17.5 23.5L16 30.5Q9 31 7.5 27Z', fill: '#FFFFFF', shade: '#D6DCE4', off: [-1, -1.5] },
      { d: rr(14, 38.5, 22, 7, 3), fill: '#D6DCE4', shade: '#A9B3C1', off: [-1, -1.5] },
    ],
    det: 'M27.5 20.5V25M32.5 21V25.5',
  },
  thumb: {
    opacity: 0.75,
    parts: [{ d: rr(12, 5, 24, 36, 12), fill: '#FFFFFF', shade: '#D6DCE4', off: [-2, -2.5], deco: `<path d="${rr(17, 8, 14, 12, 6)}" fill="#EEF2F7" stroke="#A9B3C1" stroke-width="1.6"/>` }],
  },  egg: {
    parts: [
      {
        d: 'M24 3.5C33 3.5 39.5 16 39.5 27C39.5 37 32.5 42.5 24 42.5C15.5 42.5 8.5 37 8.5 27C8.5 16 15 3.5 24 3.5Z',
        fill: '#FFF6E0',
        shade: '#E9CF98',
        hl: [18, 13, 3.6, 6, 20],
        deco: `<circle cx="29" cy="15" r="3.4" fill="#2EE6C9"/><circle cx="17" cy="26" r="3" fill="#FF8C3A"/><circle cx="31" cy="29" r="4" fill="#9B5CFF"/><circle cx="22" cy="35" r="2.2" fill="#2EE6C9"/>`,
      },
      {
        d: 'M3.5 32Q24 40 44.5 32L41.5 42Q24 50 6.5 42Z',
        fill: '#E9B44C',
        shade: '#B97E2A',
        off: [-1.5, -2.5],
        deco: `<path d="M9 37L15 42M17 38L21 44M27 38L24 44M35 37L31 43M41 36L38 41" stroke="#B97E2A" stroke-width="1.8" stroke-linecap="round"/>`,
      },
    ],
    det: 'M24 8.5L21 13L25.5 15.5L22.5 19.5',
  },
  buddy: {
    parts: [
      {
        d: 'M9 42.5C3.5 42.5 3.5 35.5 7 31C5 20 12 11 23 11C34 11 41 20 39 31C42.5 35.5 42.5 42.5 37 42.5Q34 39.5 30 42.5Q26.5 39.5 23 42.5Q19.5 39.5 16 42.5Q12.5 39.5 9 42.5Z',
        fill: '#2EE6C9',
        shade: '#14B39C',
        hl: [16, 17, 5, 2.6, -30],
      },
      {
        d: 'M37.5 5.5C35 1.5 29 3 29.5 8C30 12 35 14 37.5 17.5C40 14 45 12 45.5 8C46 3 40 1.5 37.5 5.5Z',
        fill: '#FF4D5E',
        shade: '#D9233A',
        off: [-1.5, -2],
        hl: [33, 7, 2, 1.3, -30],
      },
    ],
    top: `<circle cx="17" cy="26" r="4" fill="#fff" stroke="${INK}" stroke-width="2"/><circle cx="28" cy="26" r="4" fill="#fff" stroke="${INK}" stroke-width="2"/><circle cx="18" cy="27" r="1.7" fill="${INK}"/><circle cx="29" cy="27" r="1.7" fill="${INK}"/><path d="M20 33Q22.5 35.5 25 33" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>`,
  },
};

export const ICON_IDS = Object.keys(DEFS) as IconId[];

function isStroke(p: Part | Stroke): p is Stroke {
  return (p as Stroke).stroke !== undefined;
}

/** Inner markup of one icon (viewBox 0 0 48 48). `uid` keeps ids unique per document. */
function build(id: IconId, uid: string): string {
  const def = DEFS[id];
  let defs = '';
  let body = '';
  def.parts.forEach((p, i) => {
    if (isStroke(p)) {
      const common = `fill="none" stroke-linecap="round" stroke-linejoin="round" d="${p.d}"`;
      body +=
        `<path ${common} stroke="${INK}" stroke-width="${p.w + 6}" transform="translate(0 2.5)"/>` +
        `<path ${common} stroke="${INK}" stroke-width="${p.w + 6}"/>` +
        `<path ${common} stroke="${p.stroke}" stroke-width="${p.w}"/>` +
        (p.core ? `<path ${common} stroke="${p.core}" stroke-width="${Math.max(1, p.w * 0.32)}" transform="translate(-.6 -.8)" opacity=".9"/>` : '');
      return;
    }
    const sid = `s-${uid}-${i}`;
    const rule = p.evenodd ? ' fill-rule="evenodd" clip-rule="evenodd"' : '';
    const [ox, oy] = p.off ?? [-3, -3.5];
    defs +=
      `<path id="${sid}" d="${p.d}"${rule}/>` +
      `<clipPath id="c-${sid}"><use href="#${sid}"/></clipPath>` +
      `<mask id="m-${sid}" maskUnits="userSpaceOnUse" x="-30" y="-30" width="108" height="108"><rect x="-30" y="-30" width="108" height="108" fill="#fff"/><use href="#${sid}" fill="#000" transform="translate(${ox} ${oy})"/></mask>`;
    const shade = p.shade === 'ink' ? 'rgba(27,23,54,.28)' : (p.shade ?? 'rgba(27,23,54,.25)');
    const hl = p.hl
      ? `<ellipse cx="${p.hl[0]}" cy="${p.hl[1]}" rx="${p.hl[2]}" ry="${p.hl[3]}" fill="#fff" opacity=".55"${p.hl[4] ? ` transform="rotate(${p.hl[4]} ${p.hl[0]} ${p.hl[1]})"` : ''}/>`
      : '';
    body +=
      `<g${p.t ? ` transform="${p.t}"` : ''}>` +
      (p.noDrop ? '' : `<use href="#${sid}" fill="${INK}" transform="translate(0 2.5)"/>`) +
      `<use href="#${sid}" style="fill:${p.fill}"/>` +
      `<g clip-path="url(#c-${sid})">${p.deco ?? ''}<rect x="-30" y="-30" width="108" height="108" style="fill:${shade}" mask="url(#m-${sid})"/>${hl}</g>` +
      `<use href="#${sid}" fill="none" stroke="${INK}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>` +
      `</g>`;
  });
  if (def.det) body += `<path d="${def.det}" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>`;
  if (def.top) body += def.top;
  const tf = def.rot ? ` transform="rotate(${def.rot} 24 24)"` : '';
  const op = def.opacity ? ` opacity="${def.opacity}"` : '';
  return `<defs>${defs}</defs><g${tf}${op}>${body}</g>`;
}

let injected = false;
/** Inject the sprite once (idempotent). Called by icon(). */
export function ensureIconSprite(): void {
  if (injected || typeof document === 'undefined') return;
  injected = true;
  const symbols = ICON_IDS.map((id) => `<symbol id="i-${id}" viewBox="0 0 48 48" overflow="visible">${build(id, id)}</symbol>`).join('');
  const holder = document.createElement('div');
  holder.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true">${symbols}</svg>`;
  document.body.prepend(holder.firstChild as SVGElement);
}

/** Inline reference to a sprite icon. */
export function icon(id: IconId, size = 32, cls = ''): string {
  ensureIconSprite();
  return `<svg class="ic ic-${id}${cls ? ' ' + cls : ''}" width="${size}" height="${size}" viewBox="0 0 48 48" aria-hidden="true"><use href="#i-${id}"/></svg>`;
}

let uidSeq = 0;
/** Standalone SVG with the symbol inlined (for rasterising to canvas textures). */
export function iconSvg(id: IconId): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="-2 -2 52 54" width="52" height="54">${build(id, `x${uidSeq++}${id}`)}</svg>`;
}
