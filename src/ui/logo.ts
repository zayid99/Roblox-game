// C25 logo: "SWING" hanging from a rope, a sun ribbon "or", and a dripping "SPLASH".
const INK = '#1B1736';
let seq = 0;

function word(text: string, x: number, y: number, w: number, fill: string, size = 120): string {
  const common = `x="${x}" y="${y}" text-anchor="middle" font-family="'Lilita One', 'Fredoka', sans-serif" font-size="${size}" textLength="${w}" lengthAdjust="spacingAndGlyphs"`;
  return (
    `<text ${common} fill="${INK}" stroke="${INK}" stroke-width="28" stroke-linejoin="round" transform="translate(0 8)">${text}</text>` +
    `<text ${common} fill="${INK}" stroke="${INK}" stroke-width="28" stroke-linejoin="round">${text}</text>` +
    `<text ${common} fill="${fill}">${text}</text>` +
    `<text ${common} fill="#fff" opacity=".28" clip-path="url(#lgtop${seq})">${text}</text>`
  );
}

/** One inline SVG wordmark (viewBox 0 0 600 300), never wider than 600px. */
export function logoSvg(width: number): string {
  const id = seq++;
  const w = Math.min(600, width);
  const h = Math.round((w * 300) / 600);
  const sunG = `lgs${id}`;
  const seaG = `lgw${id}`;
  // SPLASH: letters spread over 470px centred at 300, so letter i sits at 65 + 470 * (i + .5) / 6.
  const lx = (i: number) => 65 + (470 * (i + 0.5)) / 6;
  const drip = (x: number, wd: number, len: number, delay: number) =>
    `<path class="lg-drip" style="animation-delay:${delay}ms" d="M${x - wd / 2} 0Q${x - wd / 2} ${len * 0.55} ${x} ${len}Q${x + wd / 2} ${len * 0.55} ${x + wd / 2} 0Z" fill="url(#${seaG})" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>`;
  let crest = '';
  for (let x = 92; x < 510; x += 24) crest += `<circle cx="${x}" cy="0" r="12"/>`;
  return (
    `<svg class="logo" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 300" width="${w}" height="${h}" role="img" aria-label="Swing or Splash">` +
    `<defs>` +
    `<linearGradient id="${sunG}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF07A"/><stop offset=".45" stop-color="#FFC92E"/><stop offset="1" stop-color="#F39A12"/></linearGradient>` +
    `<linearGradient id="${seaG}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#C8F6FF"/><stop offset=".4" stop-color="#7FE0F5"/><stop offset="1" stop-color="#1679D9"/></linearGradient>` +
    `<clipPath id="lgtop${id}"><rect x="0" y="0" width="600" height="68"/><rect x="0" y="178" width="600" height="44"/></clipPath>` +
    `<style>.logo .lg-swing{transform-origin:300px 4px;animation:lgSwing 1600ms cubic-bezier(.65,0,.35,1) infinite alternate}` +
    `.logo .lg-drip{transform-box:fill-box;transform-origin:50% 0;animation:lgDrip 3600ms cubic-bezier(.4,0,1,1) infinite}` +
    `@keyframes lgSwing{from{transform:rotate(-3deg)}to{transform:rotate(3deg)}}` +
    `@keyframes lgDrip{0%,70%{transform:scaleY(1);opacity:1}85%{transform:translateY(16px) scaleY(1.2);opacity:1}100%{transform:translateY(30px) scaleY(.4);opacity:0}}` +
    `@media (prefers-reduced-motion:reduce){.logo .lg-swing,.logo .lg-drip{animation:none}}</style>` +
    `</defs>` +
    // Rope from the top edge to the "I" of SWING, and the swinging word.
    `<g class="lg-swing"><g transform="rotate(-5 300 4)">` +
    `<path d="M300 -6V44" stroke="${INK}" stroke-width="16" stroke-linecap="round"/><path d="M300 -6V44" stroke="#E8B04A" stroke-width="9" stroke-linecap="round"/>` +
    `<path d="M300 2V44" stroke="#B97E2A" stroke-width="9" stroke-dasharray="5 6"/>` +
    word('SWING', 300, 132, 420, `url(#${sunG})`) +
    // Gold hook hanging off the G.
    `<g transform="translate(497 118)"><path d="M0 -18A14 14 0 1 1 -12 6" fill="none" stroke="${INK}" stroke-width="14" stroke-linecap="round"/><path d="M0 -18A14 14 0 1 1 -12 6" fill="none" stroke="#FFB52E" stroke-width="7" stroke-linecap="round"/><path d="M-4 -16A11 11 0 0 1 9 -9" fill="none" stroke="#FFF07A" stroke-width="2.5" stroke-linecap="round"/></g>` +
    `</g></g>` +
    // "or" ribbon
    `<g transform="translate(240 140)">` +
    `<path d="M2 10H26V40H2L12 25Z" fill="#B86400" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/><path d="M118 10H94V40H118L108 25Z" fill="#B86400" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>` +
    `<rect x="14" y="2" width="92" height="34" rx="9" fill="url(#${sunG})" stroke="${INK}" stroke-width="4"/><rect x="20" y="6" width="80" height="10" rx="5" fill="#fff" opacity=".4"/>` +
    `<text x="60" y="29" text-anchor="middle" font-family="'Lilita One', sans-serif" font-size="30" fill="#fff" stroke="${INK}" stroke-width="7" paint-order="stroke" stroke-linejoin="round">or</text></g>` +
    // SPLASH with drips and a crest.
    `<g transform="rotate(3 300 230)">` +
    `<g transform="translate(0 262)">` +
    `<g transform="translate(${lx(0) - 6} -14)">${drip(0, 14, 28, 0)}</g>` +
    `<g transform="translate(${lx(3) + 4} -14)">${drip(0, 16, 34, 1200)}</g>` +
    `<g transform="translate(${lx(5) + 8} -14)">${drip(0, 11, 24, 2400)}</g></g>` +
    word('SPLASH', 300, 262, 470, `url(#${seaG})`) +
    `<g transform="translate(0 286)" fill="#fff" stroke="${INK}" stroke-width="5">${crest}</g>` +
    `<rect x="70" y="282" width="460" height="8" fill="#fff"/>` +
    `</g>` +
    `</svg>`
  );
}
