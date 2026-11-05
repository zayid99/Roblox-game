// Signature nautical pieces (spec §1.6, C5, C7): rope border tile, ribbon, porthole, life ring.

const INK = '#1B1736';
const ROPE = ['#E8B04A', '#B97E2A', '#7A4F14'];

/**
 * 49×49 border-image tile with a 14px band: a 3-strand twist (diagonal strands every 7px in
 * the rope shades, ink edges, a white highlight) and a coiled knot in each corner. The middle
 * segments are 21px (3 strands) so the colour rotation tiles seamlessly with `round`.
 */
function ropeTile(): string {
  const S = 49;
  const B = 14;
  let strands = '';
  for (let k = -10; k <= 14; k++) {
    // Line x - y = 7k, drawn as a fat strand with an ink outline.
    const c = ROPE[((k % 3) + 3) % 3];
    const x0 = 7 * k - 4;
    const d = `M${x0} -4L${x0 + S + 8} ${S + 4}`;
    strands += `<path d="${d}" stroke="${INK}" stroke-width="7"/><path d="${d}" stroke="${c}" stroke-width="5"/><path d="${d}" stroke="#fff" stroke-opacity=".35" stroke-width="1" transform="translate(-1.3 1.3)"/>`;
  }
  const band = `M0 0H${S}V${S}H0Z M${B} ${B}V${S - B}H${S - B}V${B}Z`;
  const knot = (x: number, y: number) =>
    `<g transform="translate(${x} ${y})"><circle r="6.6" fill="${ROPE[1]}" stroke="${INK}" stroke-width="2"/><circle r="4.3" fill="none" stroke="${ROPE[0]}" stroke-width="2"/><circle r="1.9" fill="${ROPE[2]}" stroke="${INK}" stroke-width="1"/><path d="M-4 -3.2A5 5 0 0 1 2 -4.6" stroke="#fff" stroke-opacity=".5" stroke-width="1.2" fill="none" stroke-linecap="round"/></g>`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">` +
    `<defs><clipPath id="b"><path d="${band}" clip-rule="evenodd" fill-rule="evenodd"/></clipPath></defs>` +
    `<g clip-path="url(#b)" fill="none">${strands}` +
    `<path d="M1 1H${S - 1}V${S - 1}H1Z" stroke="${INK}" stroke-width="2.6"/><path d="M${B - 1} ${B - 1}H${S - B + 1}V${S - B + 1}H${B - 1}Z" stroke="${INK}" stroke-width="2.6"/></g>` +
    knot(7, 7) + knot(S - 7, 7) + knot(7, S - 7) + knot(S - 7, S - 7) +
    `</svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

export const ROPE_TILE = ropeTile();

/** Install CSS custom properties that need generated data (rope tile). */
export function installArtVars(): void {
  document.documentElement.style.setProperty('--rope-tile', ROPE_TILE);
}

let rid = 0;
/**
 * Ribbon title (C5): tails in the hue's lip colour, a gradient body and a gloss band.
 * Colours come from the container's --rb-hi / --rb / --rb-lip variables (set by .hue-* classes).
 */
export function ribbonSvg(): string {
  const id = `rbg${rid++}`;
  return (
    `<svg class="ribbon-svg" viewBox="0 0 420 76" preserveAspectRatio="none" aria-hidden="true">` +
    `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--rb-hi)"/><stop offset="1" style="stop-color:var(--rb)"/></linearGradient></defs>` +
    `<path d="M4 24H70V70H4L24 47Z" style="fill:var(--rb-lip)" stroke="${INK}" stroke-width="4" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>` +
    `<path d="M416 24H350V70H416L396 47Z" style="fill:var(--rb-lip)" stroke="${INK}" stroke-width="4" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>` +
    `<path d="M58 60L70 70V60ZM362 60L350 70V60Z" fill="${INK}" opacity=".55"/>` +
    `<rect x="34" y="4" width="352" height="56" rx="12" fill="url(#${id})" stroke="${INK}" stroke-width="4" vector-effect="non-scaling-stroke"/>` +
    `<rect x="34" y="52" width="352" height="8" rx="4" style="fill:var(--rb-lo)" opacity=".75"/>` +
    `<rect x="44" y="10" width="332" height="18" rx="9" fill="#fff" opacity=".35"/>` +
    `</svg>`
  );
}

/**
 * Brass porthole (C7, signature piece 4) around arbitrary inner HTML. Size in px.
 * The ring and its 6 rivets are one SVG overlay; the inside is a rarity radial gradient.
 */
export function porthole(inner: string, size: number, cls = ''): string {
  const gid = `phg${rid++}`;
  const rivets = [30, 90, 150, 210, 270, 330]
    .map((a) => {
      const r = (a * Math.PI) / 180;
      return `<circle cx="${(50 + Math.cos(r) * 42.5).toFixed(2)}" cy="${(50 + Math.sin(r) * 42.5).toFixed(2)}" r="2.9" fill="#7A4F14" stroke="${INK}" stroke-width="1.1"/>`;
    })
    .join('');
  const ring =
    `<svg class="ph-ring" viewBox="0 0 100 100" aria-hidden="true"><defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#F6CF77"/><stop offset=".5" stop-color="#E8B04A"/><stop offset="1" stop-color="#7A4F14"/></linearGradient></defs>` +
    `<circle cx="50" cy="50" r="42.5" fill="none" stroke="${INK}" stroke-width="15.5"/>` +
    `<circle cx="50" cy="50" r="42.5" fill="none" stroke="url(#${gid})" stroke-width="9.5"/>` +
    `<path d="M17 36A36 36 0 0 1 40 13" stroke="#fff" stroke-opacity=".55" stroke-width="2.4" fill="none" stroke-linecap="round"/>` +
    rivets +
    `</svg>`;
  return `<div class="porthole ${cls}" style="--ph:${size}px"><div class="ph-in">${inner}</div>${ring}</div>`;
}

/** Inner SVG for the rope preview / swatches: a striped rope segment. */
export function ropeSwatch(colors: string[], stripes: number, w = 120, h = 22): string {
  const id = `rsw${rid++}`;
  const a = colors[0] ?? '#D9A35F';
  const b = colors[1] ?? '#B07A3A';
  const period = Math.max(6, (w / Math.max(2, stripes)) * 1.2);
  let s = '';
  for (let x = -h; x < w + h; x += period) s += `<path d="M${x.toFixed(1)} ${h}L${(x + h).toFixed(1)} 0" stroke="${b}" stroke-width="${(period / 2).toFixed(1)}"/>`;
  return `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" aria-hidden="true"><defs><clipPath id="${id}"><rect x="2" y="2" width="${w - 4}" height="${h - 4}" rx="${(h - 4) / 2}"/></clipPath></defs><g clip-path="url(#${id})"><rect width="${w}" height="${h}" fill="${a}"/>${s}<rect x="0" y="3" width="${w}" height="${h * 0.22}" fill="#fff" opacity=".35"/></g><rect x="2" y="2" width="${w - 4}" height="${h - 4}" rx="${(h - 4) / 2}" fill="none" stroke="${INK}" stroke-width="3"/></svg>`;
}
