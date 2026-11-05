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
  // SPLASH: letters spread over 460px centred at 300, so letter i sits at 70 + 460 * (i + .5) / 6.
  const lx = (i: number) => 70 + (460 * (i + 0.5)) / 6;
  const drip = (x: number, wd: number, len: number, delay: number) =>
    `<path class="lg-drip" style="animation-delay:${delay}ms" transform="translate(${x.toFixed(1)} 250)" d="M${-wd / 2} 0V${len - wd / 2}A${wd / 2} ${wd / 2} 0 0 0 ${wd / 2} ${len - wd / 2}V0Z" fill="#7FE0F5" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>`;
  // Wave crest: a white band with a scalloped top (radius 12) under SPLASH.
  let crest = 'M58 306V286';
  for (let x = 58; x < 538; x += 24) crest += `A12 12 0 0 1 ${x + 24} 286`;
  crest += 'V306Z';
  return (
    `<svg class="logo" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 300" width="${w}" height="${h}" role="img" aria-label="Swing or Splash" overflow="visible">` +
    `<defs>` +
    `<linearGradient id="${sunG}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF07A"/><stop offset=".45" stop-color="#FFC92E"/><stop offset="1" stop-color="#F39A12"/></linearGradient>` +
    `<linearGradient id="${seaG}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#C8F6FF"/><stop offset=".4" stop-color="#7FE0F5"/><stop offset="1" stop-color="#1679D9"/></linearGradient>` +
    `<clipPath id="lgtop${id}"><rect x="0" y="0" width="600" height="72"/><rect x="0" y="0" width="0" height="0"/></clipPath>` +
    `<style>.logo .lg-swing{transform-origin:300px 0;animation:lgSwing 1600ms cubic-bezier(.65,0,.35,1) infinite alternate}` +
    `.logo .lg-drip{transform-box:fill-box;transform-origin:50% 0;animation:lgDrip 3600ms cubic-bezier(.4,0,1,1) infinite}` +
    `@keyframes lgSwing{from{transform:rotate(-3deg)}to{transform:rotate(3deg)}}` +
    `@keyframes lgDrip{0%,70%{translate:0 0;scale:1 1;opacity:1}85%{translate:0 10px;scale:1 1.2;opacity:1}100%{translate:0 26px;scale:1 .4;opacity:0}}` +
    `@media (prefers-reduced-motion:reduce){.logo .lg-swing,.logo .lg-drip{animation:none}}</style>` +
    `</defs>` +
    // SPLASH block (behind the hanging word): crest, word, drips.
    `<g transform="rotate(3 300 230)">` +
    `<path d="${crest}" fill="${INK}" transform="translate(0 6)"/><path d="${crest}" fill="#fff" stroke="${INK}" stroke-width="6" stroke-linejoin="round"/>` +
    `<path d="M70 299H526" stroke="#BDF6FF" stroke-width="5" stroke-linecap="round"/>` +
    word('SPLASH', 300, 258, 460, `url(#${seaG})`) +
    drip(lx(0) + 2, 22, 40, 0) + drip(lx(3) + 8, 26, 46, 1200) + drip(lx(5) + 10, 20, 36, 2400) +
    `</g>` +
    // Rope from the top edge to the "I" of SWING, and the swinging word.
    `<g class="lg-swing"><g transform="rotate(-5 300 0)">` +
    `<path d="M300 -20V40" stroke="${INK}" stroke-width="18" stroke-linecap="round"/><path d="M300 -20V40" stroke="#E8B04A" stroke-width="10" stroke-linecap="round"/>` +
    `<path d="M300 -20V40" stroke="#B97E2A" stroke-width="10" stroke-dasharray="5 6"/>` +
    word('SWING', 300, 124, 420, `url(#${sunG})`) +
    // Gold hook hanging off the G.
    `<g transform="translate(503 104)"><path d="M0 -4V20A13 13 0 0 1 -26 20V13" fill="none" stroke="${INK}" stroke-width="15" stroke-linecap="round" stroke-linejoin="round"/><path d="M0 -4V20A13 13 0 0 1 -26 20V13" fill="none" stroke="#FFB52E" stroke-width="7.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M-2 0V18" stroke="#FFF07A" stroke-width="2.5" stroke-linecap="round"/></g>` +
    `</g></g>` +
    // "or" ribbon
    `<g transform="translate(240 136) rotate(-2 60 20)">` +
    `<path d="M2 10H26V40H2L12 25Z" fill="#B86400" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/><path d="M118 10H94V40H118L108 25Z" fill="#B86400" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>` +
    `<rect x="14" y="2" width="92" height="34" rx="9" fill="url(#${sunG})" stroke="${INK}" stroke-width="4"/><rect x="20" y="6" width="80" height="10" rx="5" fill="#fff" opacity=".4"/>` +
    `<text x="60" y="29" text-anchor="middle" font-family="'Lilita One', sans-serif" font-size="30" fill="#fff" stroke="${INK}" stroke-width="7" paint-order="stroke" stroke-linejoin="round">or</text></g>` +
    `</svg>`
  );
}
