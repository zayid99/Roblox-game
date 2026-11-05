// Fallback SVG art for the tutorial overlay (the UI team's icon() replaces it when the lead passes
// TutorialOverlayDeps.icon). Same language as §3: chunky shapes, 3px ink outlines, flat fills.
import type { IconId } from '../contracts';

const INK = '#1B1736';

const wrap = (size: number, body: string, vb = '0 0 64 64') =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${vb}" aria-hidden="true">${body}</svg>`;

const ART: Partial<Record<IconId, string>> = {
  hand:
    `<path d="M22 6c3 0 5 2 5 5v17l2-1V20c0-3 2-5 5-5s5 2 5 5v8l2-1c3-1 6 1 6 4v2l2-1c3-1 6 1 6 4v10c0 9-7 16-16 16h-6c-6 0-10-3-13-8L10 43c-2-3-1-6 2-7 2-1 5 0 6 2l1 3V11c0-3 2-5 5-5z" ` +
    `fill="#FFFFFF" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>` +
    `<path d="M27 28v8M39 28v8M48 33v6" stroke="#D6DCE4" stroke-width="3" stroke-linecap="round"/>`,
  thumb:
    `<path d="M19 62V27a13 13 0 0126 0v35" fill="#FFFFFF" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>` +
    `<rect x="24" y="11" width="16" height="17" rx="7" fill="#FFE3EA" stroke="${INK}" stroke-width="3"/>` +
    `<path d="M24 40c5 2 11 2 16 0M24 48c5 2 11 2 16 0" fill="none" stroke="#D6DCE4" stroke-width="3" stroke-linecap="round"/>`,
  check:
    `<circle cx="32" cy="32" r="27" fill="#3FCB4B" stroke="${INK}" stroke-width="4"/>` +
    `<path d="M19 33l9 9 18-20" fill="none" stroke="#FFFFFF" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="M19 33l9 9 18-20" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" opacity=".25"/>`,
  home:
    `<path d="M10 30L32 10l22 20" fill="#FF4D5E" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>` +
    `<rect x="16" y="28" width="32" height="26" rx="3" fill="#F4D9A0" stroke="${INK}" stroke-width="4"/>` +
    `<rect x="27" y="38" width="10" height="16" rx="2" fill="#B97E2A" stroke="${INK}" stroke-width="3"/>`,
  lighthouse:
    `<path d="M24 56l4-38h8l4 38z" fill="#FFFFFF" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>` +
    `<path d="M26 40h12M25 48h14" stroke="#FF4D5E" stroke-width="5"/>` +
    `<rect x="24" y="8" width="16" height="10" rx="2" fill="#FFC92E" stroke="${INK}" stroke-width="4"/>`,
  creature:
    `<path d="M14 40c0-14 8-24 18-24s18 10 18 24c0 8-8 12-18 12s-18-4-18-12z" fill="#FFC92E" stroke="${INK}" stroke-width="4"/>` +
    `<circle cx="25" cy="34" r="4" fill="${INK}"/><circle cx="39" cy="34" r="4" fill="${INK}"/>`,
  lock:
    `<path d="M20 28v-6a12 12 0 0124 0v6" fill="none" stroke="${INK}" stroke-width="5"/>` +
    `<rect x="14" y="28" width="36" height="26" rx="6" fill="#FFC92E" stroke="${INK}" stroke-width="4"/>`,
  wave:
    `<path d="M6 44c8-18 22-28 36-24-8 2-10 10-4 14 6 4 14 0 20-6v26H6z" fill="#34AFFF" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>`,
  cash:
    `<circle cx="32" cy="32" r="24" fill="#7DFF5A" stroke="${INK}" stroke-width="4"/>` +
    `<path d="M38 24c-2-3-12-4-12 2s12 4 12 10-10 6-13 2M32 18v28" fill="none" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>`,
};

/** Inline SVG markup for an icon (a plain disc for icons this fallback set does not draw). */
export function tutorialIcon(id: IconId, size: number): string {
  return wrap(size, ART[id] ?? `<circle cx="32" cy="32" r="22" fill="#FFC92E" stroke="${INK}" stroke-width="4"/>`);
}

/** Thin arrow used behind the WASD keycaps (faded, §7.1). */
export function arrowSvg(rot: number): string {
  return `<svg class="tut-key-arrow" viewBox="0 0 20 20" style="transform:rotate(${rot}deg)" aria-hidden="true"><path d="M10 3l6 8h-4v6H8v-6H4z" fill="currentColor"/></svg>`;
}
