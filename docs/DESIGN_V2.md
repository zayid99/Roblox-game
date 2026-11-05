# Swing or Splash v2 design spec ("Big Splash" update)

*Version 2.0 spec, revision B (after the completeness, feasibility and player critiques), 5 Nov 2026. Builds on v0.1 (commit `cf138d3`). Engineers implement directly from this document. Where an earlier draft and this revision disagree, this revision wins; the Changelog at the end lists every change.*

**How to read this spec**

- **Units.** Pixel sizes are design px at the 1280×720 desktop reference (see §4.0 for scaling). Colours are hex, durations are ms, and 3D distances are metres.
- **Easing tokens.** These are used everywhere:

  | Token | Curve | Use |
  |---|---|---|
  | `--ease-back` | `cubic-bezier(.34,1.56,.64,1)` | Pop-ins and releases (~5% overshoot) |
  | `--ease-out` | `cubic-bezier(.22,1,.36,1)` | Rises and count-ups |
  | `--ease-in` | `cubic-bezier(.4,0,1,1)` | Exits |
  | `--ease-slam` | `cubic-bezier(.2,1.4,.4,1)` | Banner slams |
  | `--ease-io` | `cubic-bezier(.65,0,.35,1)` | Loops |

- **Reward notation.** "**N min**" means `minutes(N) = max(50, round(N × 60 × state.baseIncomePerSec()))`. `baseIncomePerSec()` = pedestal income × rebirth multiplier × streak bonus. `incomePerSec()` = `baseIncomePerSec()` × boost factor (the 2× boost is deferred to v2.1, so the factor is always 1 in v2.0, but both functions exist from Phase 0). Offline earnings also use `baseIncomePerSec()`.
- **Copy rules.**
  - No emoji anywhere: UI, toasts, 3D signs or code strings.
  - No mid-dot (`·`) separators.
  - Headlines are ALL CAPS, 5 words or fewer.
  - Sub-text is sentence case, 8 words or fewer.
  - At most one "!" visible on screen at a time.
- **Ownership.** File ownership is strict and disjoint (§10.0 table). `src/Game.ts`, `src/main.ts`, `src/core/*`, `index.html`, `src/contracts.ts`, `src/platform/*`, `scripts/*`, `vite.config.ts` and `package.json` belong to the lead.

**Scope.** About 1 week of parallel work (Phase 0 to 3, §10.0). Every item is tagged **P0** (must ship in v2.0), **P1** (ships in v2.0 if Phase 1 is on time, otherwise first in v2.1) or **v2.1** (specified here so contracts don't change later, but not built now).

- **In (v2.0):**
  - New UI system with a nautical identity (§1, §2), 34 icons, a custom SVG logo, all 3 layouts, and a pass/fail "slop checklist" (§2.5).
  - Graphics pass (§6): G1–G6, G8, G9, G11, G12, G13 (baseline draw-call plan), G14, G15, the blob-shadow part of G3b; G7 props and edge lines are P1.
  - Character and creature animation (§5.2): idles, carry pose, celebrations, per-species idles, faces.
  - Beginner tutorial (§7): 8 steps, wave visible from second 1, contextual hints, first-open coach cards.
  - Audio (§8): engine, all SFX including footsteps, rope creak and creature voices, Song 1 with adaptive layers, hurry and surge sections, surf and wind.
  - **Gameplay features** (§9.0): Bounce Buoys (P0), WAVE #N with Big Waves (P0), Featured Creature (P0), Drifting Hooks (P1), Volcano geysers (P1).
  - **Retention features:** Swing combo (Perfect Release, Chain, Close Call), First Voyage quests, FREE panel (Daily calendar plus Playtime gifts), Welcome Back, Locker with ropes, Settings, Index silhouettes with hints, Rebirth KEEP/LOSE card.
- **Deferred to v2.1** (specified only where contracts need it): Daily Missions, the 2× cash boost, trails, Index milestones, the full rebirth ceremony (v2.0 uses a banner plus confetti), Songs 2 and 3, gulls, kalimba and glockenspiel music layers, the nametag title and trophy board, the "runner" creature.
- **Out:** pets/eggs, spin wheel, codes, leaderboards, Tide events, time-limited offers (never), multiplayer.
- **Hard budgets:**
  - Total build ≤ 400 KB gzip (v0.1 is ≈ 170 KB). Fonts ≈ 37 KB as base64 inside the JS (§2.1). Still tiny against the CrazyGames 20 MB mobile limit.
  - Zero runtime network requests. `dist-single/index.html` must contain every byte (§10.1, build check).
  - 60 fps at the Medium tier on a mid-range phone.
  - Gameplay within 1 click; there is still no title screen.

---

## 1. Visual direction (6 lines)

1. **Roblox simulator HUD grammar** (Pet Simulator 99, Steal a Brainrot, Grow a Garden). Use a left rail of square sticker-icon buttons, currency pills at top-left, a wave timer at top-centre, a hotbar at bottom-centre, overhead "$/s" billboards, and rarity colour on everything. Players read the game as "a Roblox game" within a second.
2. **Supercell-grade component craft** (Clash Royale, Brawl Stars, Squad Busters). Use one chunky stroked display face. Every control gets an ink outline, a gradient body, a hard bottom lip and a gloss band. Panels are opaque and framed, with ribbon titles and an overhanging life-ring close button. Motion uses bouncy overshoot.
3. **Escape-Tsunami tension, made readable.** A barber-pole wave meter turns red. Warnings are layered: horn, vignette, a wall rising on the horizon, and music that switches to a faster "hurry" track. The player always sees "hits you in Ns".
4. **"Wind-Waker-lite" world.** A warm sun with real shadows near the player. A faceted wavy toon sea. Foam rings around islands. Puffy clouds. Blocky props with crisp edge lines. Squash and stretch on everything that lands.
5. **Original everything.** Our own ink colour (`#1B1736`), our own icons, creatures and copy. We copy genre conventions, never another game's assets, logos, fonts or pixel layouts. Creature names stay meme-style but never reference real "brainrot" IP names.
6. **A nautical identity, not a generic asset pack.** The chrome is a ship's: deep navy panels wrapped in rope, life-ring close buttons, buoy round buttons, a wave-crest scallop along every panel top, and porthole frames on portraits. Four signature pieces (§2.4, C5 and C21) appear on every screen, so a screenshot reads as *this* game, not "a Roblox HUD". Purple is used only for the Index.

---

## 2. UI style guide

### 2.1 Fonts

| Role | Package (exact) | Weight | File | Size |
|---|---|---|---|---|
| Display: buttons, titles, banners, labels, **numbers** | `@fontsource/lilita-one@5.3.0` | 400 | `files/lilita-one-latin-400-normal.woff2` | 10.7 KB |
| Body: descriptions, tutorial sub-text, settings | `@fontsource/fredoka@5.3.0` | 600 | `files/fredoka-latin-600-normal.woff2` | 16.5 KB |

Fredoka 600 is **dropped** (saves ≈ 16 KB). Every body-text style in this spec uses Fredoka 600. Emphasis in body text uses colour, not weight.

**Loading.** The lead installs the packages in Phase 0 (`npm i @fontsource/lilita-one@5.3.0 @fontsource/fredoka@5.3.0`). `src/ui/fonts.ts` loads the fonts with the FontFace API from **`?inline`** imports (base64 data URLs). `?url` must not be used: Vite only inlines files under 4 KB, so `?url` fonts would become separate `assets/` files that `scripts/inline-build.mjs` does not inline. Do **not** import the packages' CSS either (it lists `.woff` fallbacks).

```ts
import lilita from '@fontsource/lilita-one/files/lilita-one-latin-400-normal.woff2?inline';
import fredoka600 from '@fontsource/fredoka/files/fredoka-latin-600-normal.woff2?inline';

/** Resolves when both faces are loaded, or after timeoutMs (then the fallbacks show). */
export async function loadFonts(timeoutMs = 1500): Promise<void> {
  const faces = [
    new FontFace('Lilita One', `url(${lilita}) format('woff2')`, { weight: '400' }),
    new FontFace('Fredoka', `url(${fredoka600}) format('woff2')`, { weight: '600' }),
  ];
  const load = Promise.all(faces.map(async (f) => { await f.load(); document.fonts.add(f); }));
  await Promise.race([load, new Promise((r) => setTimeout(r, timeoutMs))]);
}
```

**Load order.** `main.ts` calls `await loadFonts()` before `gfx.init()`, because canvas signs and billboards bake text in once.

**Families.** `--display: 'Lilita One', 'Fredoka', system-ui, sans-serif` and `--body: 'Fredoka', system-ui, sans-serif`. No third family. Luckiest Guy is **not** used. The system fallbacks exist only for the 1500 ms timeout; the slop checklist (§2.5) fails any screenshot where a fallback shows.

**Number style `.t-num`** (cash, prices, timers, the wave countdown, chain count). Numbers get their own voice so they don't look like the labels:

```css
.t-num {
  font-family: var(--display); font-variant-numeric: tabular-nums;
  transform: skewX(-6deg);                       /* slight forward italic */
  -webkit-text-stroke: 8px var(--ink); paint-order: stroke fill;   /* heavier than .t-stroke (4px visible) */
  text-shadow: 0 4px 0 var(--ink);
}
.t-num > span {                                  /* 2-tone inner fill: light top half, base bottom half */
  background: linear-gradient(180deg, var(--num-hi, #FFFFFF) 0 48%, var(--num-lo, #DDE8FF) 52% 100%);
  -webkit-background-clip: text; background-clip: text; color: transparent;
}
```

`.t-num` uses the layered `.t-grad` structure below (stroke copy behind, gradient span in front). Cash sets `--num-hi:#F4FFB8; --num-lo:#5BE04A`; Pearls `#FFFFFF / #7FE0F5`; wave digits `#FFFFFF / #FFD0D5` in warning. It applies only at 22px and larger; smaller numbers use plain `.t-stroke`.

**Stroke recipe.** One ink colour, a hard drop shadow, never a blurred shadow.

```css
.t-stroke {             /* any text >= 18px */
  color: #fff;
  -webkit-text-stroke: var(--sw, 6px) var(--ink);
  paint-order: stroke fill;          /* only half the stroke shows */
  text-shadow: 0 var(--sd, 3px) 0 var(--ink);
  letter-spacing: .02em; line-height: 1;
}
```

| Text size | `--sw` (set width) | Visible outline | `--sd` (drop) |
|---|---|---|---|
| 14–17 px | none: ink text on light surfaces, or white text with `text-shadow: 0 2px 0 var(--ink)` | 0 | 2px |
| 18–28 px | 6px | 3px | 3px |
| 29–48 px | 9px | 4.5px | 4px |
| 49 px and up | `.2em` | .1em | `.09em` |

**Compatibility fallback.** `paint-order` on HTML text is missing in older Chromium and Android WebViews, where `-webkit-text-stroke` then eats into the glyphs. `fonts.ts` runs `CSS.supports('paint-order','stroke fill')` once and sets `html.no-po` if it fails. Under `.no-po`, every `.t-stroke` and `.t-num` **below 28px** drops `-webkit-text-stroke` and uses an 8-direction hard `text-shadow` outline instead (`±2px` at 18–27px), plus the drop shadow. 28px and above keep the stroke (the eaten edge is acceptable at that size).

**Minimum sizes on phones** (`landscape` and `portrait` layouts): no text below **13px**. Labels that would be smaller are removed in those layouts: course-bar zone numbers, hotkey keycap minis and the Settings version footer are hidden; the tracker timer goes up to 13px.

**Layered fallback for gradient text** (cash numbers, "REBIRTH", Legendary and higher names, the logo). `paint-order` does not combine with `background-clip:text`, so stack two copies:

```css
.t-grad { position: relative; z-index: 0; color: transparent; }
.t-grad::before { content: attr(data-text); position: absolute; inset: 0; z-index: -1;
  color: var(--ink); -webkit-text-stroke: var(--sw) var(--ink); text-shadow: 0 var(--sd) 0 var(--ink); }
.t-grad > span { background: var(--grad); -webkit-background-clip: text; background-clip: text; color: transparent; }
```

Always set text through `setText(el, text)` in `src/ui/dom.ts`. It writes `textContent` and `dataset.text` together.

**Number formatting.** This lives in `economy.ts`. The **lead** rewrites `formatNumber`/`formatCash` and adds `formatIncome` and `formatPearls` in Phase 0 (so `hud.ts` and `Game.ts` keep compiling); after Phase 0 the features team owns the file. These replace today's "$0.9" and "$1.00M".

| Value | Output |
|---|---|
| cash < 1000 | integer, floored: `$0`, `$12`, `$999` |
| income < 10 /s | one decimal, trailing ".0" trimmed: `$1.2/s`, `$3/s` |
| income 10 to 999 /s | integer |
| ≥ 1000 | 3 significant digits, trailing zeros trimmed, suffixes K, M, B, T, Qa, Qi: `1.25K`, `12.5K`, `125K`, `1M`, `2.5B` |
| Pearls | always an integer with thousands separators (`1,250`) |

### 2.2 Colour tokens (`src/ui/tokens.css`)

```css
:root {
  --ink: #1B1736;               /* every outline, lip shadow and stroke */
  --display: 'Lilita One', 'Fredoka', system-ui, sans-serif;
  --body: 'Fredoka', system-ui, sans-serif;

  /* Semantic button hues: hi (top), base, lo (bottom), lip (3D edge) */
  --grass-hi:#8CF25E; --grass:#3FCB4B; --grass-lo:#23963A; --grass-lip:#156B27;   /* buy / confirm / claim */
  --sun-hi:#FFF07A;   --sun:#FFC92E;   --sun-lo:#F39A12;   --sun-lip:#B86400;     /* hero CTA, swing, tutorial */
  --coral-hi:#FF8C8C; --coral:#FF4D5E; --coral-lo:#D9233A; --coral-lip:#9A1027;   /* close / danger / wave */
  --sky-hi:#7FD8FF;   --sky:#34AFFF;   --sky-lo:#1679D9;   --sky-lip:#0E4FA0;     /* navigate / info / settings */
  --grape-hi:#C79BFF; --grape:#9B5CFF; --grape-lo:#6A2FD1; --grape-lip:#451A96;   /* index / collection */
  --teal-hi:#7FFBE6;  --teal:#2EE6C9;  --teal-lo:#14B39C;  --teal-lip:#0A7A6A;    /* locker */
  --slate-hi:#D6DCE4; --slate:#A9B3C1; --slate-lo:#8792A3; --slate-lip:#5E6878;   /* can't afford / disabled */
  --gold-a:#FFE680;   --gold-b:#FFB52E; --gold-c:#E07800; --gold-lip:#9A5200;     /* rebirth / premium / MAX */

  /* Surfaces: nautical navy wrapped in rope gold (no indigo/purple chrome) */
  --frame-hi:#1D5583; --frame:#123A5C; --frame-lo:#0B2740; --frame-rim:#E8B04A;   /* panel frame; rim = rope gold */
  --rope-a:#E8B04A; --rope-b:#B97E2A; --rope-c:#7A4F14;                              /* 3-strand rope border shades */
  --well:#0A2236;                                                                    /* panel content well */
  --tab-off:#0E304D; --tab-off-text:#9FC3E0;                                         /* inactive tabs */
  --card:#FFF6E0; --card-edge:#E9CF98; --card-shade:#F2E2BC;                        /* light content cards (sailcloth) */
  --text-ink:#1B1736; --text-muted:#5E6A80;
  --hud-dark:#123A5C; --hud-dark-lo:#0B2740;                                        /* opaque HUD pill bodies (navy) */
  --backdrop: rgba(6,20,34,.6);
  --lifering:#FF4D5E; --lifering-white:#FFFFFF;                                     /* close button */
  --blush:#FF9AB6;                                                                   /* face decal cheeks */

  /* Stacking scale (the only z-index values any stylesheet may use) */
  --z-world:0; --z-hud:10; --z-fade:11; --z-hud-top:20; --z-spot:30; --z-backdrop:40;
  --z-panel:50; --z-pills-raised:55; --z-coach:60; --z-toast:70; --z-banner:80; --z-reveal:85;
  --z-resume:90; --z-loading:100;

  /* Currencies */
  --cash-grad: linear-gradient(180deg,#F4FFB8 0%,#8CFF5A 48%,#2FC23A 100%);
  --cash:#7DFF5A; --income:#FFD84A; --price-no:#FF4A5A;
  --pearl-grad: linear-gradient(180deg,#FFFFFF 0%,#BDF6FF 50%,#4FC8EE 100%); --pearl:#8FF0FF;

  /* Rarity: hi (centre glow), base, edge (dark) */
  --r0-hi:#E3E9F0; --r0:#A9B8C9; --r0-edge:#5E6B7C;   /* Common */
  --r1-hi:#A8F58A; --r1:#59D36A; --r1-edge:#1F7A2B;   /* Uncommon */
  --r2-hi:#8FD3FF; --r2:#3AA8FF; --r2-edge:#134F9F;   /* Rare */
  --r3-hi:#DDB0FF; --r3:#B065FF; --r3-edge:#5B1FA0;   /* Epic */
  --r4-hi:#FFE680; --r4:#FFB52E; --r4-edge:#9A5200;   /* Legendary (gradient + shine sweep) */
  --r5-hi:#FF9AB6; --r5:#FF4F7B; --r5-edge:#8E0E2E;   /* Mythic (gradient + glow pulse) */
  --r6-hi:#5EF3FF; --r6:#22F0FF; --r6-edge:#1A1030;   /* Secret (dark card + rainbow outline + sparkles) */
  --rainbow: conic-gradient(#FF4F7B,#FFB52E,#FFF07A,#59D36A,#22F0FF,#3AA8FF,#B065FF,#FF4F7B);
  --mut-gold:#FFD23F; --mut-diamond:#8EF3FF;           /* Rainbow uses --rainbow */
}
```

**Semantic rules.** Players read a button by its colour before they read its label, so keep these strict:

| Colour | Means |
|---|---|
| Green | Spend or receive: BUY, CLAIM, COLLECT, YES |
| Sun yellow | The one hero action on screen when it isn't a transaction: JUMP/SWING, tutorial "GOT IT", PLAY |
| Red | Close, cancel, NO, danger |
| Blue | Navigation, info, secondary |
| Purple | Index |
| Teal | Locker |
| Gold gradient | Rebirth and MAX |

**Rarity colour sync.** `RARITIES[i].color` in `src/game/creatures.ts` becomes the `--rN` base values above. Common changes from `#c3cbd6` to `#A9B8C9`. The rarity ladder and names don't change. The lead makes this edit in Phase 0.

**Rarity is never colour-only.** Every rarity-coloured element also carries a shape cue, for colour-blind players:

| Rarity | Letter chip | Frame shape (hotbar slot, Index card, pedestal glow) |
|---|---|---|
| Common | C | plain rounded square |
| Uncommon | U | plain |
| Rare | R | plain |
| Epic | E | 4 corner notches (6px) |
| Legendary | L | notches plus a 3-point crown tab on top |
| Mythic | M | notches plus 2 side fins |
| Secret | S | rainbow rim plus star tab |

The letter chip is 18×18, radius 6, `--rN-edge` fill, Lilita 13 white, at the bottom-left of hotbar slots and in the rarity pill ("R RARE"). Course-bar segments add the zone number (desktop) or nothing (phones, where the zone banner names it).

**Translucency.** UI surfaces are never translucent over gameplay. The two exceptions are the panel backdrop and the interior of empty carry slots. No `backdrop-filter` anywhere.

### 2.3 Scale system

- **Stroke widths** (only these): 3px for chips, badges, keycaps and controls 48px or smaller; 4px for buttons, pills, cards and tiles; 5px for panels.
- **Radii** (only these): 8 for chips and badges; 14 for buttons 56px tall or less; 18 for icon tiles and cards; 26 for panels; 999 for pills and round buttons.
- **Lip** (hard bottom edge): 4px on small controls, 5px on buttons and tiles, 6px on hero CTAs and panels.
- **Spacing:** 4, 8, 12, 16, 24, 32.
- **Animation:** animate only `transform`, `opacity` and `filter: brightness()`. Never width, height, top or left, shadow blur, or `background-position` (moving stripes translate an oversized child instead, see C10).
- **Text sizes per component:** at most 2 sizes inside one component (a number and its label count as 2).

### 2.4 Component recipes (`src/ui/components.css`)

#### C1. Button `.btn`

**Colour variants.** `.btn--grass`, `.btn--sun`, `.btn--coral`, `.btn--sky`, `.btn--grape`, `.btn--teal` and `.btn--gold` each set the four hue vars.

**Sizes.**

| Class | Height | Font | Padding |
|---|---|---|---|
| `--s` | 40 | 18 | 0 16 |
| `--m` (default) | 52 | 22 | 0 22 |
| `--l` | 64 | 28 | 0 28 |
| `--xl` | 76 | 34 | 0 34 |

```css
.btn {
  --hi:var(--grass-hi); --c:var(--grass); --lo:var(--grass-lo); --lip:var(--grass-lip);
  position:relative; display:inline-flex; align-items:center; justify-content:center; gap:8px;
  height:52px; padding:0 22px; border:4px solid var(--ink); border-radius:14px;
  font:400 22px/1 var(--display); color:#fff; cursor:pointer;
  background:linear-gradient(180deg,var(--hi) 0%,var(--c) 52%,var(--lo) 100%);
  box-shadow: inset 0 0 0 2px rgba(255,255,255,.35),   /* inner rim (double stroke) */
              inset 0 -5px 0 var(--lip),                /* bottom inner lip (slab) */
              0 5px 0 var(--ink);                       /* hard ground shadow */
  transition: transform 180ms var(--ease-back), box-shadow 80ms ease-out, filter 120ms;
}
.btn::before {                                          /* gloss band, top 42% */
  content:''; position:absolute; left:6px; right:6px; top:4px; height:42%;
  border-radius:9px 9px 16px 16px / 9px 9px 7px 7px;
  background:linear-gradient(180deg,rgba(255,255,255,.62),rgba(255,255,255,.12)); pointer-events:none;
}
.btn > * { position:relative; }                         /* label above the gloss */
.btn .label { -webkit-text-stroke:6px var(--ink); paint-order:stroke fill; text-shadow:0 3px 0 var(--ink); }
.btn.is-down { transform:translateY(4px) scale(.96); transition-duration:60ms;
  box-shadow: inset 0 0 0 2px rgba(255,255,255,.35), inset 0 -2px 0 var(--lip), 0 1px 0 var(--ink); }
@media (hover:hover) { .btn:hover:not(.is-down) { transform:translateY(-2px) scale(1.04) rotate(-1.5deg); filter:brightness(1.06); } }
```

**Pressed state.** Set `.is-down` on `pointerdown` through `pressable(el, onActivate)` in `src/ui/dom.ts`. Don't rely on `:active`, which is unreliable on iOS.

- `pressable()` calls `setPointerCapture` and plays `ui.click` on `pointerdown`. On desktop (`hover:hover`), `pointerenter` plays `ui.hover`, throttled to one per 60 ms.
- **Hold-to-repeat** (`pressable(el, fn, { repeat: true })`, used by every BUY button): after 400 ms held, `onActivate` fires again every 120 ms while the pointer stays inside, until it returns false (can't afford or maxed).
- It fires `onActivate` on `pointerup` only if the pointer is still within the rect plus 12px.
- It removes `.is-down` on `pointerup` or `pointercancel`. The release then pops back over 180ms with `--ease-back`.

**State variants.**

| Class | Look |
|---|---|
| `.btn--cant` | Slate hues. The price text turns `--price-no` and stays stroked. Never use `opacity`. Pressing it plays `ui.denied` and shakes the button ±6px horizontally 3 times over 240ms. |
| `.btn--max` | Flat `--gold-b` body with no lip and no gloss. Label "MAX". The button is rotated −4°. |
| `.btn--shine` | Hero only, at most one per screen. Adds the shine sweep below. |

Shine sweep:

```css
.btn--shine { overflow:hidden; }
.btn--shine::after { content:''; position:absolute; inset:-4px; pointer-events:none;
  background:linear-gradient(115deg,transparent 40%,rgba(255,255,255,.65) 50%,transparent 60%);
  transform:translateX(-150%); animation:shine 3200ms var(--ease-io) infinite; }
@keyframes shine { 0%,72% { transform:translateX(-150%) } 100% { transform:translateX(150%) } }
```

**Secondary button** (`.btn--sec`): 3px stroke, height 44, font 18, no gloss, lip 3px. **Tertiary link** (`.link`, e.g. "Skip tutorial ›"): Fredoka 600 15px white, `text-shadow:0 2px 0 var(--ink)`, underlined on hover, hit area padded to 48×48.

**Price content.** `<svg cash 26px/>` followed by `<span class="label">$1.2K</span>`. Pearl prices use the pearl icon.

#### C2. Icon tile (left rail) `.tile`

- **Tile:** 72×72. Radius 18, 4px ink border, gradient body in the tile's identity hue, gloss, lip 5px.
- **Icon:** 52px, absolutely positioned `top:-10px`, horizontally centred, so it pops above the top edge.
- **Label chip:** overlaps the bottom edge (`bottom:-11px`). Height 22, padding 0 8, radius 999, ink background, Lilita 14 white. On desktop the label is preceded by a hotkey keycap mini (18×18, Lilita 13); phones show no keycap.
- **Badge:** 24px circle in `#FF3B4E` with a 3px ink border, at `top:-8px; right:-8px`. White Lilita 14, stroked 4px. It shows either a count or "!". It pops in with `scale(0) → 1.25 → 1` over 260ms `--ease-back` and is static afterwards.
- **Upgrade arrow** (Shop tile only, the genre-standard "you can buy something" signal): the moment `cash ≥ cheapest upgrade cost`, a 28px green `arrow-up` icon (grass with ink outline) sits at the tile's top-right in place of the badge and bobs `translateY 0 → -6px` at 1.2 Hz. It is not subject to the badge cap. The same arrow floats over the 3D shop stall (graphics, G8). No wait time.
- **Badge cap:** at most **2** tiles show a badge at once. Priority: claimable reward (FREE) > Rebirth ready > Index NEW. Lower-priority badges wait.
- **Wiggle** (the attention loop): `rotate 0 → -7° → 6° → -4° → 0` over 600ms, repeated every 4000ms. Only **one** rail tile may wiggle at a time, picked by priority: FREE claimable > Shop affordable (only while at home) > Index NEW.
- **FREE tile:** while a gift is counting down and nothing is claimable, the label chip shows the timer ("2:41"). When anything is claimable it shows "FREE" and the badge shows the count.

| Tile (`RailId`) | Hue | Icon | Hotkey | Opens |
|---|---|---|---|---|
| `shop` | grass | `shop` | U | Shop panel, UPGRADES tab |
| `free` | sun | `gift` | G | FREE panel (DAILY and GIFTS tabs) |
| `index` | grape | `index` | I | Index panel |
| `rebirth` (when cash ≥ 25% of cost) | gold | `rebirth` | — | Shop panel, REBIRTH tab |

There is **no** Missions or Locker tile. The Voyage lives in the tracker; the Locker is a Shop tab (and also opens with L, or by tapping the player's own character on touch). Settings is the top-right round button.

#### C3. Round icon button `.rbtn` (top-right: sound, settings)

Styled as a **buoy** (signature piece). 48×48 circle, 4px ink border, lip 4px. Body: horizontal bands, white `#FFFFFF` top 30%, coral `--coral` middle 40%, white bottom 30%, with the gloss band over the top. The 28px icon sits in a 30px navy `--frame` disc in the centre (so it reads on both colours). Hit area 56.

#### C4. Currency pill `.pill`

- **Cash pill:**
  - Height 44, min-width 196, `padding:0 18px 0 50px`, radius 999, 4px ink border.
  - Background `linear-gradient(180deg,var(--hud-dark),var(--hud-dark-lo))` with `inset 0 3px 0 rgba(255,255,255,.12)` and lip `0 4px 0 var(--ink)`.
  - Icon: 58px `cash` icon at `left:-14px; top:-10px; rotate(-8deg)`, overhanging.
  - Value: Lilita 30 `.t-num` with the cash fill pair. Left-aligned; `min-width` grows in steps of 1ch so the pill never jitters.
- **Income chip:** sits under the cash pill, offset left +36, top +50. Height 24, ink background, radius 999. Contents: a 14px `arrow-up` icon tinted `--income`, then "+$12/s" in Lilita 16 `--income`. When rebirths > 0, a gold chip "×1.5" follows at height 24. (The v2.1 2× boost will add a sun chip "2× 8:12" here.)
- **Pearl pill:** height 34, min-width 112, 42px `pearl` icon overhanging left by −10, value Lilita 22 with `--pearl-grad`. Hidden until the first Pearl is earned, then pops in.
- **Gain feedback:**
  1. Pill scale 1 → 1.12 over 90ms ease-out, then back over 160ms `--ease-back`.
  2. The value counts up over 450ms with easeOutCubic: `v = from + (to - from) * (1 - (1 - t)^3)`.
  3. Passive income does **not** pop; its text refreshes every 100ms.
  4. A discrete gain pops only if it is ≥ $1 and ≥ 0.5% of the balance.
- **Spend feedback:** count down over 250ms, value tinted `--price-no` for 150ms.

#### C5. Panel `.panel`

- **Size:** `width: min(760px, 94vw)`, `max-height: calc(100% - 48px)`, `padding: 44px 20px 20px`.
- **Frame** (navy hull, no stripes):
  ```css
  border-radius:26px; position:relative;
  background: linear-gradient(180deg,var(--frame-hi),var(--frame-lo));
  box-shadow: inset 0 -6px 0 rgba(0,0,0,.25), 0 8px 0 var(--ink);
  ```
- **Rope border** (signature piece 1, `.panel::before`): a 14px rope wrapped around the whole frame.
  - `border: 14px solid transparent; border-image: url("data:image/svg+xml,…") 14 round; inset:-7px` (the rope straddles the frame edge), with a separate 5px ink outline outside it (`outline`-like `box-shadow: 0 0 0 5px var(--ink)` on a wrapper).
  - The SVG tile (`src/ui/art.ts`, `ROPE_TILE`) is 42×42 with a 14px border band: a **3-strand twist**, drawn as repeating diagonal capsules every 7px at 60°, filled in rotation `--rope-a`, `--rope-b`, `--rope-c`, each with a 1.5px ink stroke and a 1px white 35% highlight line on the upper edge. Corners are a coiled knot (a 14px circle of 3 rings).
- **Wave-crest scallop** (signature piece 2, `.panel::after`): along the top edge, inside the rope, a row of half-circles of radius 10 with a period of 28px, filled `--frame-hi`, with a 2px white 30% top edge. Height 12px. It reads as a wave crest under the ribbon. Drawn as a CSS `radial-gradient` repeating horizontally (`background-size: 28px 12px`), not animated.
- **Mock first.** Before any panel CSS is written, the UI team draws one reference frame per layout (desktop Shop, landscape HUD, portrait HUD) as static HTML in `src/ui/sandbox/` and the lead signs it off against the slop checklist (§2.5).
- **Ribbon** (`.ribbon`): inline SVG, viewBox `0 0 420 76`, `preserveAspectRatio="none"`, every stroke `vector-effect="non-scaling-stroke"`. Rendered height 58, min-width 300, positioned `top:-30px`, centred. Contents:
  - Left tail: `M4 24 H70 V70 H4 L24 47 Z`
  - Right tail: `M416 24 H350 V70 H416 L396 47 Z`
  - Both tails filled with the hue's `lip` colour and stroked ink 4.
  - Body: `rect x=34 y=4 width=352 height=56 rx=12`, filled with a vertical gradient (hue-hi → hue) and stroked ink 4.
  - Gloss: `rect x=44 y=10 width=332 height=18 rx=9`, white at 35%.
  - Title: HTML on top, Lilita 34 `.t-stroke`.
  - Ribbon hue per panel: Shop grass, Index grape, FREE sun, Settings sky, Welcome grass. The Shop ribbon switches to teal on the LOCKER tab and gold on the REBIRTH tab (cross-fade 160ms).
- **Close button** (`.btn-close`, signature piece 3: a **life ring**): 56px circle, 4px ink border, lip 4px. The ring body is 4 alternating segments (coral `--lifering` and white, starting at 45°) drawn as a `conic-gradient`, with a 22px navy hole in the centre holding the white `close` icon (18px). A 2px white 40% gloss arc on the upper-left. Positioned `top:-20px; right:-20px`, z above the ribbon, hit area 60. Hover: rotate 20°. Esc and a tap on the backdrop also close. The welcome card has no backdrop close.
- **Tabs** (`.tabs`): a row under the ribbon.
  - Tab: height 44, padding 0 18, radius 14, 4px ink border, Lilita 18.
  - Active: identity hue gradient with lip, `.t-stroke` label, z-index 2.
  - Inactive: background `--tab-off`, label `--tab-off-text` unstroked, no lip, `translateY(3px)`.
  - A 12px red dot appears on a tab with something claimable.
  - Tabs scroll horizontally on phones.
- **Content well:** `background: var(--well); border-radius: 18px; padding: 12px; box-shadow: inset 0 3px 0 rgba(0,0,0,.35)`. Cream cards (C6, C7) sit inside it. Opaque (no translucency).
- **Open motion:**

  | Element | Animation | Timing |
  |---|---|---|
  | Backdrop | opacity 0 → 1 | 180ms linear |
  | Panel | `scale(.7) opacity 0` → 70%: `scale(1.05) opacity 1` → `scale(1)` | 260ms `--ease-back` |
  | Ribbon | `translateY(-20px) opacity 0` → 0 | 220ms `--ease-back`, delay 80 |
  | Close button | `scale(0)` → 1 | 200ms `--ease-back`, delay 140 |
  | Cards | `translateY(12px) opacity 0` → 0, staggered | 35ms apart, first 8 only, 220ms `--ease-out` |

  Play `ui.open` on open.
- **Close motion:** panel to `scale(.88) opacity 0` and backdrop to 0, over 140ms `--ease-in`. Play `ui.close`.

#### C6. Upgrade row card `.card-up`

- **Card:** height 96, radius 18, 4px ink border, `background: var(--card)`, `box-shadow: inset 0 -5px 0 var(--card-shade), 0 4px 0 var(--ink)`, `grid-template-columns: 72px 1fr 148px`, gap 12, padding 12.
- **Icon tile:** 64×64, radius 16, 4px border, hue body plus gloss, 44px icon. Hues: speed sky, reach sun, power coral, carry grape, slots grass.
- **Name:** Lilita 22 `--text-ink`, unstroked.
- **Level pips** (when maxLevel ≤ 16):
  - One 12px-tall pip per level, gap 3, width `(100% − gaps) / maxLevel`, radius 4.
  - Filled pips: `--sun` with a 2px ink border. Empty pips: `#E5D3A8` with a 2px `#C9B27E` border.
  - A "LV 3" chip (ink background, Lilita 13 white) sits at the right end.
- **Stat line:** Fredoka 600 17, e.g. `10.0 m/s` then a 16px `chevron` icon then `10.8 m/s`. The next value is `#1E9A45`. When maxed, show only the value plus a gold "MAX" chip.
- **Button:** `.btn--grass` 148×56 showing the cash icon and price. States: `--cant`, `--max`.
- **Bulk toggle:** a ×1 / ×5 / MAX segmented control (height 36, sky-hue pills) in the panel header row, persisted per session. "×5" shows the summed cost of the next 5 levels (fewer if near max). "MAX" buys as many levels as the player can afford. BUY buttons also hold-to-repeat (C1).
- **Tutorial focus** (step `shop`, set through `Hud.setFocus`, §10.2): the focused row gets the `note` chip (sun hue, Lilita 15, e.g. "UNLOCKS ZONE 2") above its name and the `sub` line under the stat; other rows get `filter: brightness(.75)` but stay clickable.
- **Purchase feedback:**
  1. White overlay flash on the row: opacity .7 → 0 over 80ms.
  2. The new pip pops: scale 0 → 1.3 → 1 over 220ms `--ease-back`.
  3. The button squashes: `scale(1.08,.9) → (.96,1.04) → 1` over 220ms.
  4. 12 confetti pieces burst from the button.
  5. The stat value punches: scale 1.25 → 1 over 200ms.
  6. Play sfx `buy`. Reaching MAX instead plays sfx `maxed` and drops in the gold MAX stamp.

#### C7. Item card `.card-item` (Index, Locker, reveals)

- **Size:** 132×168 (phone 108×140), grid gap 12, grid padding-top 16 to make room for overflow.
- **Body:** `background: radial-gradient(circle at 50% 36%, var(--rN-hi) 0%, var(--rN) 55%, var(--rN-edge) 100%)`, 4px ink border, radius 18, `box-shadow: inset 0 0 0 2px rgba(255,255,255,.45), 0 4px 0 var(--ink)`.
- **Portrait in a porthole** (signature piece 4): a 96px circle (phone 80) centred, `margin-top:-14px` so it overflows the top edge. The porthole is a 7px brass ring (`--rope-a` to `--rope-c` vertical gradient, 3px ink outer stroke, 2px ink inner stroke) with 6 rivets (5px circles `--rope-c`, 1px ink) at 30° + n·60°. Inside: `radial-gradient(circle at 40% 35%, var(--rN-hi), var(--rN) 70%)` and the portrait image (it may poke 6px out of the ring top for Legendary and above). Also used on the compact reveal card and the Locker preview.
- **Name:** Lilita 16 `.t-stroke`, one line, ellipsis.
- **Rarity pill:** overlaps the bottom edge by 10px. Height 22, padding 0 10, radius 999, 3px ink border, `--rN-edge` fill, Lilita 13 white, text "R RARE" (letter chip plus name, §2.2). Epic and above use the frame shape cue of §2.2 on the card outline.
- **Income chip:** top-left inside the card, "+$30/s", Lilita 15 `--income` stroked.
- **Mutation gems:** a row of 4 `gem` icons at 14px, coloured white, `--mut-gold`, `--mut-diamond` and rainbow. Gems not yet owned are `filter: brightness(0) opacity(.3)`.
- **Unknown species:** `background: linear-gradient(180deg,#123A5C,#0B2740)`. Portrait silhouette: the normal portrait `<img>` with `filter: brightness(0) opacity(.85)` (no second render). Name "???" in `#7F9BB5`. Under it, a **hint line** in Fredoka 600 13 `#9FC3E0`: "Found in Coral Reef" (`ZONES[zoneOfRarity].name`). The rarity pill still shows, so players see which tier they are missing.
- **NEW sticker:** 48×24, `rotate(-12deg)`, coral, 3px border, Lilita 14 "NEW", at `top:-10px; right:-10px`. It bobs translateY ±3px every 1000ms `--ease-io`, but only until the card has been on screen once. Track that in `indexSeen` / `cosmetics.seen`.
- **Legendary and above:**
  - Shine sweep (as on `.btn--shine`) every 3200ms.
  - Sunburst behind the portrait: a 120px circle of `repeating-conic-gradient(rgba(255,255,255,.22) 0 10deg, transparent 10deg 20deg)`, masked with `radial-gradient(circle, #000 40%, transparent 70%)`, rotating 360° every 12000ms linear.
- **Mythic:** also a glow pulse `0 0 0 0 → 0 0 18px 4px rgba(255,79,123,.6)` every 1600ms (filter on a pseudo-element, not box-shadow blur animation).
- **Secret:**
  - Wrapper `padding:4px; background: var(--rainbow); border-radius:22px`, rotating via `@property --a` on the conic angle, 4000ms linear.
  - 3 `sparkle` icons at 10–14px twinkling (scale 0 → 1 → 0, 900ms, staggered 300ms).
  - The name text uses a scrolling rainbow gradient.

#### C8. Toast `.toast`

- **Body:** height 44, `padding: 0 18px 0 8px`, radius 999, `--card` background, 4px ink border, lip `0 4px 0 var(--ink)`.
- **Contents:** left icon disc (36px circle in the variant hue with a 3px border, 24px icon), then text in Fredoka 600 17 `--text-ink`.
- **Variants:**

  | Variant | Hue | Sound | Hold |
  |---|---|---|---|
  | `info` | sky | `toast` | 2200ms |
  | `good` | grass | `toast` | 2200ms |
  | `warn` | sun | `toast` | 2200ms |
  | `bad` | coral | `ui.denied` | 1800ms, plus a ±6px shake 3× over 240ms |

- **Placement:** top-centre (§4). At most 2 visible on desktop and 1 on phones, gap 8. The rest queue FIFO. If the same text repeats within 3s, the existing toast gets a "×2" suffix and re-pops instead.
- **Motion:** in `translateY(-16px) scale(.8) opacity 0` → `0 / 1 / 1` over 240ms `--ease-back`. Out: opacity 0 and `translateY(-8px)` over 160ms `--ease-in`.
- **Suppression:** during a surge only wave-related toasts show; others wait.

#### C9. Banner `.banner` (centre announcements)

- **Shape:** the ribbon SVG at `width:min(640px,90vw)`, height 84. Title Lilita 52 `.t-stroke` (phone 34). Optional sub chip below: ink background, radius 999, Fredoka 600 18 white, padding 4 14.
- **Hue by banner:** zone uses the rarity hue; WAVE uses coral; GOLDEN WAVE uses gold; REBIRTH uses gold; tutorial uses sun.
- **Motion:**
  - Whole banner `rotate(-3deg)`.
  - In: `scale(1.6) opacity 0` → `scale(.96)` → `1` over 200ms `--ease-slam`. WAVE banners also add camera trauma 0.1.
  - Hold 1400ms (zone 1600ms, wave 1800ms).
  - Out: `translateY(-24px) opacity 0` over 220ms `--ease-in`.
- **Queue and priority:** wave > reveal > zone > tutorial > info. A higher priority preempts by playing its out-animation immediately. Zone banners never show while `player.mode === 'swing'`; they wait until the next land, or at most 2000ms.

#### C10. Progress bar `.bar`

- **Track:** height 18 (phone 14), radius 999, 3px ink border, track `--hud-dark-lo` with `inset 0 3px 0 rgba(0,0,0,.35)`.
- **Fill:** `linear-gradient(180deg, hue-hi, hue)`. Highlight `::after` at top 3px, height 35%, white 35%, radius 999.
- **Label:** centred, Lilita 14 `.t-stroke` with `--sw:4px`, e.g. "3/10".
- **Width changes:** `transform: scaleX()` with origin left, 300ms `--ease-out`. The wave meter's fill is the exception: it is set every frame with no transition.
- **Striped variant** `.bar--stripes`: the fill has `overflow:hidden` and holds a child `.stripes` that is 22.6px wider than the fill, painted with
  ```css
  background-image: repeating-linear-gradient(-45deg,rgba(255,255,255,.28) 0 8px,transparent 8px 16px);
  animation: stripes 600ms linear infinite;   /* transform: translateX(-22.6px) → 0, compositor-only */
  ```
  Never animate `background-position`. Used only by the wave meter during warning and surge.

#### C11. Tooltip `.tip` (desktop only)

- Ink background, radius 10, padding 6 10, Fredoka 600 14 white, an 8px arrow.
- Shows after a 400ms hover delay; animates opacity and `translateY(4px → 0)` over 120ms.
- Rail tiles show "Shop (U)". On touch, a 500ms long-press shows the same tooltip.

#### C12. Keycap `.key`

- Min-width 34, height 34, padding 0 8, radius 8, 3px ink border.
- `background: linear-gradient(#FFFFFF,#E3E6EF)`, `box-shadow: 0 4px 0 var(--ink)`, Lilita 16 ink.
- SPACE keycap: 120×34.
- Pressed: `translateY(4px)`, box-shadow `0 0 0`.
- Hold fill: a `::after` bar inside the cap, `--sun`, scaleX 0 → 1.

#### C13. Touch action button `.act`

- **Size:** `width = height = clamp(84px, 26vh, 120px)`.
- **Body:** circle, 4px ink border, lip 6px, gloss. Content: 40px `arrow-up` icon over a label (Lilita 20, `.t-stroke`).
- **One-word label only:**

  | Label | When | Look |
  |---|---|---|
  | **JUMP** | default | sun hue |
  | **SWING** | `player.target` set and not swinging | gold hue, plus a rotating dashed ring (an SVG circle 12px outside the button, `stroke-dasharray 10 8`, 2000ms per turn) |
  | **LET GO** | tutorial release window only | coral, flashes brightness 1 ↔ 1.25 at 4 Hz |

- **Pressed:** squash `scale(1.08,.9) → (.96,1.04) → 1` over 220ms on release. The sub-label "hold to swing" is removed.

#### C14. Carry hotbar `.slot`

- **Slot:** 60×60 (phone 50), radius 14, 4px ink border.
- **Empty:** `background:#2A2452; box-shadow: inset 0 4px 0 rgba(0,0,0,.35)`. A `creature` silhouette icon at 32px, white 18%.
- **Filled:** rarity radial gradient (as on C7) with a 56px portrait overflowing `top:-6px`. Mutation gem 16px at bottom-right. Rarity letter chip (§2.2) at bottom-left; Epic and above also use the frame shape cue.
- **Counter chip** left of the slots: `carry` icon 34px, then "1/2" in Lilita 18 `.t-stroke`.
- **Fill motion:** scale 0 → 1.15 → 1 over 260ms `--ease-back`.
- **Full:** the counter chip turns sun-coloured with the text "FULL", and the bar shakes once (±5px, 200ms).

#### C15. Wave meter `.wave-meter`

- **Frame:** 380×52 desktop, radius 999, 4px ink border, `--hud-dark` body, lip 4px.
- **Icon disc:** 60px circle overhanging left by 12px, hue by phase, with a 40px `wave` icon (`color:#FFC92E` when golden).
- **Text row** (left-aligned after the disc):
  - Label: Lilita 15, white at 85%.
  - Digits: Lilita 30 `.t-num`, each digit in a fixed `.62em` span, centred.
- **Wave number chip:** at the frame's right end, inside, "#7" in Lilita 15 white on an ink chip (height 22). On a Big Wave it reads "BIG #10" in a coral chip.
- **Bar:** inside the frame at the bottom, inset 64px left and 16px right, height 12. Fill is per frame.
- **Phases:**

  | Phase | Label | Digits | Fill | Fill style | Extra |
  |---|---|---|---|---|---|
  | paused (FTUE, `wave.frozen`) | `WAVE PAUSED` | `m:ss` frozen, white at 60% | static | slate | A 26px `lock` icon over the disc and a diagonal chain of 6 `chain` icons (14px) across the bar. Slides from paused to calm by dropping the chain (translateY 0 → 24px, opacity → 0, 300ms `--ease-in`) plus sfx `ui.open`. |
  | calm | `WAVE IN` | `m:ss` | `1 − timer/wave.duration` | sky gradient | — |
  | calm, Big Wave next | `BIG WAVE IN` | `m:ss` | same | coral gradient (not striped) | coral number chip |
  | calm, golden next | `GOLDEN WAVE IN` | `m:ss` | same | gold gradient, `sparkle` icons at both ends | — |
  | warning (≤ 8 s) | `WAVE IN` | `0:0N`, in coral-white `#FFE3E6` | same | coral `.bar--stripes` | Every second: shake `translateX 0,-6,6,-3,0` over 180ms plus sfx `tick`. Top-edge red vignette. Centre countdown "3, 2, 1" in Lilita 120 `.t-stroke` that scales 1.4 → 1 and fades over 900ms per number. |
  | surge, player not safe | `HITS YOU IN` | `Ns` (`ceil(t)`, `t = wave.timeUntilReaches(player.z)`) | wave progress from `startZ` to home | coral stripes | — |
  | surge, player safe | `YOU'RE SAFE` | none | same | grass | — |

  "Safe" is computed by the sim (`sim.playerSafe()`, §10.5): on the home island, **or** above the current crest height, **or** the wave has already passed the player (`timeUntilReaches` returns `Infinity`). `HudView.wave.hitsPlayerIn` is `null` whenever it is not finite, so the HUD never prints "Infinity".

- **Course bar** (under the meter, gap 6): 380×16, radius 999, 3px ink border, horizontal.
  - Home is at the **left** end: 22px `home` icon overhanging.
  - Zone segments use rarity colours, widths proportional to zone z-length. Desktop only: the zone number in Lilita 13 on segments wider than 30px. Phones: no numbers (§2.1 minimum size).
  - Lighthouse ticks: 10px `lighthouse` icons above the bar.
  - Player marker: 22px circle (`#F28C38` shirt colour, 3px ink border, white face dots).
  - During a surge, a 20px `wave` icon slides from the right end toward home.
  - Zone name under the bar (desktop only): Fredoka 600 14 white with an ink drop, e.g. "Zone 2 Coral Reef", where "Zone 2" is in the rarity colour.

#### C16. Quest tracker `.tracker`

- **Container:** width 260, a stack of cream cards (C6 surface, radius 16).
- **Header ribbon chip:** height 30, sun hue, Lilita 16 `.t-stroke`. Text "FIRST VOYAGE 7/12". Tapping the header collapses or expands the tracker. After the Voyage completes the tracker hides (v2.1 Daily Missions will reuse it).
- **Row:** 28px icon, text in Fredoka 600 15 ink (2 lines max, left-aligned), an 8px mini bar, and a reward chip at the right (cash or pearl icon 16 plus Lilita 15).
- **Complete:**
  1. A green `check` stamp pops 1.4 → 1 over 200ms.
  2. After 300ms the reward chip becomes a coin burst (C-fx) into the matching pill.
  3. The row slides out left over 220ms and the next one slides in from the right over 260ms `--ease-back`.

#### C17. Reticle `.reticle` (screen-space hook target)

- Four corner brackets drawn in a 56px SVG. Each bracket is a 14px L, white with a 4px ink outline drawn first.
- **States:**
  - Grabbable: brackets `--sun`.
  - Locked: brackets `--slate`, plus a 20px `lock` icon and a chip "11.9 m" (ink background, Lilita 13 white).
- **Motion:** snaps in on target change, scale 1.4 → 1 and opacity 0 → 1 over 120ms `--ease-out`. No idle loop.
- **Keycap hint:** for the first 3 grabs on desktop, a SPACE keycap (24px tall) sits under the reticle.
- **Release ring** (permanent Perfect cue, every session, not only the FTUE). While swinging there is no hook target, so the reticle element turns into a 64px ring around the **player's** projected grip point:
  - Outside the Perfect window: hidden.
  - Inside the window (`HudView.reticle.kind === 'release'`, which the lead sets from `sim.perfectWindow`, §9.4): a gold `--sun` ring, 5px with an ink outline, scales 1.25 → 1 over 100ms on entry and holds; plus a 12px `perfect` bolt at its top.
  - On entry the rope flashes white for one rendered frame (graphics reads the same flag) and sfx `perfectWindow` plays (a soft tick). On touch, the JUMP button rim turns gold while inside.
  - Reduce motion: the ring shows without the scale pop.

#### C18. Settings controls

- **Toggle:** 56×32, radius 999, 3px ink border. On: grass. Off: slate. Knob: 26px white circle, 3px ink border, slides over 160ms `--ease-back`.
- **Slider:** a 10px `.bar` track. Thumb: 28px sun circle, 3px border, lip 3px. Hit area 48. The value shows on the right in Lilita 16.
- **Segmented control:** pills of height 36. Active: sky with lip. Inactive: `--frame-lo`.

#### C19. Rebirth tab: KEEP / LOSE card and hold-to-confirm

The REBIRTH tab of the Shop panel (gold ribbon) is the only place to rebirth. Layout, top to bottom:

1. **Header row:** the `rebirth` icon (64px) and "×1.5 → ×2.0" in Lilita 40 `.t-num` gold (`rebirthMultiplier(n)` → `rebirthMultiplier(n+1)` = `1 + 0.5n` → `1 + 0.5(n+1)`), sub "Cash earned forever" in Fredoka 600 15.
2. **Two columns** (cream cards, each 50% minus gap 12):
   - **KEEP** (grass header chip with `check`): "Pearls", "Locker items", "Index", "Rebirth bonus ×2.0", "Best zone record".
   - **LOSE** (coral header chip with `close`): "Cash", "All upgrades", "Creatures on pedestals", "Pedestals back to 2".
   - Each line: 24px icon plus Fredoka 600 16 ink, left-aligned.
3. **Cost bar:** a C10 bar (gold) "$1.2M / $8M" (`rebirthCost(n) = 1,000,000 × 8ⁿ`).
4. **Button:** `.btn--gold --l` "HOLD TO REBIRTH" with an SVG ring around it (6px stroke, `--sun-hi` on ink). The ring's `stroke-dashoffset` fills over 1000ms while held; releasing early drains it over 200ms. Disabled (slate, `--cant`) until affordable.
5. **On completion:** sfx `rebirth`, gold flash 150ms, banner "REBIRTH" (gold) with sub "×2.0 cash forever", confetti 80, panel closes. (The full ceremony is v2.1.) The first rebirth also grants the Aurora Rope.

A one-time coach card (C21) on the first open of this tab states the same KEEP/LOSE rule in one line.

#### C20. Hidden and fade states

- **`.hud-fade`:** `opacity:.55; transform:scale(.94)` with a 250ms transition. Applied to the rail, tracker and pearl pill during action (§4.4). On touch layouts it also sets **`pointer-events:none`**, so a thumb that brushes a faded tile while running doesn't open a panel.
- **`.hud-hide`:** `opacity:0; pointer-events:none` with a 200ms transition. Used for elements that are not unlocked yet or that the tutorial hides.

#### C21. Coach card `.coach` (first-open explainers)

- Shown once per panel or tab on its first open (ids in `hintsSeen`, prefixed `coach:`): Index, FREE, Locker, Rebirth tab, Settings is exempt.
- 320×96 (phone `min(320px, 92vw)`), centred over the panel content, cream card, 4px ink border, lip 5px, radius 18, `z-index: var(--z-coach)`.
- Content: a 64px pictogram on the left, then **one line of 8 words or fewer** in Fredoka 600 17 ink, left-aligned. A tap anywhere on the card (or anywhere in the panel) dismisses it (fade 160ms).
- Copy:

  | Panel / tab | Pictogram | Line |
  |---|---|---|
  | Index | `index` | "Catch every creature. Gaps show where." |
  | FREE | `gift` | "Come back daily. Rewards stack up." |
  | Locker | `locker` | "Spend Pearls on ropes. Looks only." |
  | Rebirth | `rebirth` | "Lose cash and upgrades. Keep Pearls, Index, Locker." |

#### C22. Resume overlay `.resume` ("TAP TO PLAY")

- Shown when the game resumes from an ad, from a hidden tab, or when iOS reports the `AudioContext` as `interrupted`, so audio resumes inside a real user gesture.
- Full screen, `z-index: var(--z-resume)`, background `--backdrop`. Centre: a 120px sun circle button (4px ink, lip 6px, gloss) with a 56px `play` icon, and "TAP TO PLAY" in Lilita 52 `.t-stroke` (phone 40) 24px under it.
- Any `pointerdown` or key dismisses it, calls `audio.unlock()` inside that gesture, and resumes the sim. The sim stays paused (as with panels) while it shows.
- In: opacity 0 → 1, 180ms; the button breathes scale 1 → 1.06 at 1 Hz (off with reduce motion).

#### C23. Edge arrow `.edge`

- A 44px arrowhead (a rounded triangle, `--sun` with a 4px ink outline and lip 3px) rotated to point at the off-screen target, on an ellipse inset 64px from the screen edges.
- Behind the arrow's base, a 36px navy circle with a 3px ink border holding a 24px icon (`home`, `lighthouse` or `creature`).
- A distance chip under it: ink background, radius 999, Lilita 15 white, "24 m".
- It bobs 4px along its pointing direction at 1.5 Hz. When the target comes on screen, it scales to 0 over 120ms.

#### C24. Compact reveal card `.reveal-c` (280×120, phone 230×100)

- Cream card, 4px ink border, lip 5px, radius 18, sliding in from the right (§5.1).
- Left: a 96px porthole (C7) with the portrait (phone 80px).
- Right, stacked and left-aligned: a "NEW" (coral) or "NEW MUTATION" (grape) sticker chip, Lilita 13; the name in Lilita 22 ink (one line, ellipsis); the rarity pill (letter plus name); a line "+$30/s" in Lilita 15 `#1E9A45` and "Index 6/21" in Fredoka 600 13 `--text-muted`.
- Legendary and above: the card border uses the rarity hue and the shine sweep plays once.

#### C25. Logo `src/ui/logo.ts` (custom SVG wordmark)

`logoSvg(width: number): string` returns one inline SVG, viewBox `0 0 600 300`, used on the loading screen (width `min(520px, 80vw)`), the Settings header (220px) and the CrazyGames thumbnail/cover (exported by `?logo` sandbox, §10.2). Never rendered larger than 600px wide.

- **"SWING"** (top line, Lilita outlines converted to paths at build time is **not** required; the SVG uses `<text font-family="Lilita One">` after fonts load): 120px, fill `--sun` to `--sun-lo` vertical gradient, 14px ink stroke behind (`paint-order: stroke`), 8px hard ink drop. The word hangs from a rope: a 10px rope line (`--rope-a` with ink edges) from the top edge (x 300, y 0) down to the top of the "I", and the word is rotated −5° around that point so it reads as swinging. The **G**'s spur is replaced by a small gold hook (a 3/4 circle of radius 14, 8px stroke `--gold-b`, ink outline).
- **"or"**: a small sun ribbon (C5 ribbon shape, 120×44) between the lines, Lilita 30 white stroked.
- **"SPLASH"** (bottom line): 120px, fill `#7FE0F5` to `--sky-lo`, same stroke and drop, rotated +3°. Three water drips hang from the bottoms of "S", "A" and "H": teardrops 10–16px wide, 18–30px long, same gradient, ink outline. A white wave crest (C5 scallop, radius 12) runs under the word.
- Colours come only from §2.2 tokens. The loading screen animates only the rope swing (±3°, 1.6 s period, `--ease-io`) and the drips (one falls every 1.2 s).

---

### 2.5 Slop checklist (visual acceptance, pass/fail)

Run at 1280×720, 844×390 and 390×844 on these screens: FTUE step 1, mid-swing, home with 4 pedestals, warning, Shop (each tab), Index, FREE, Settings, Welcome Back, Resume overlay. Screenshots go in `docs/shots/v2/`. **Any single failure fails the build** (Phase 3 gate, signed by the lead):

1. A system or fallback font is visible anywhere (check with fonts blocked for 1500 ms, then loaded).
2. Any translucent or glass surface over gameplay (other than the panel backdrop, empty carry slots and the spotlight dim), or any `backdrop-filter`.
3. Any UI surface, button, chip or icon without an ink outline.
4. More than 2 text sizes inside one component.
5. Any blurred shadow (`box-shadow`/`text-shadow` with blur > 0, or `filter: drop-shadow`).
6. Centred body text longer than 2 lines.
7. Any emoji, mid-dot separator, or more than one "!" on screen.
8. Text below 13px on a phone layout.
9. A rarity shown by colour alone (§2.2).
10. Purple or indigo used outside the Index.
11. Any of the 4 signature pieces missing from a panel screenshot (rope border, scallop, life-ring close, porthole where a portrait appears).

**Reference mocks.** Before coding, the UI team draws one static mock per layout (§2.4 C5 "Mock first") and the 34-icon contact sheet (§3) at 20, 32 and 52px on navy and on cream. Both are reviewed side by side with the build in Phase 3.

## 3. Icon set (`src/ui/icons.ts`)

**Delivery.** Ship one SVG sprite (`<svg style="display:none"><symbol id="i-cash" viewBox="0 0 48 48">…</symbol>…</svg>`), injected once at startup.

- `icon(id: IconId, size = 32, cls = ''): string` returns `<svg class="ic ${cls}" width=size height=size><use href="#i-${id}"/></svg>`.
- `iconSvg(id): string` returns a **standalone** SVG with the full symbol contents inlined (no `<use href="#…">`, which does not resolve when an SVG is rasterised as an image). Canvas code rasterises it (`new Image()` with a data URL) for 3D billboards: the padlock and the cash chip.
- **Silhouette reuse.** Inside each symbol, the silhouette path is defined once (`<path id="s-<id>">` in a shared `<defs>`) and the drop, base, clip and outline layers reference it with `<use>`. This keeps the 6-layer style without repeating path data.
- **Budget:** ≤ 18 KB minified for the 34 icons below.
- **Quality gate:** the contact sheet (§2.5) is reviewed before the icons are wired in. Hand-drawn path data is where cheap-looking art shows most; any icon that reads poorly at 20px is redrawn, not shipped.

**Drawing style.** The same for every icon, so the set reads as one family.

1. **viewBox** 0 0 48 48. Keep the silhouette inside 4–44 so the outline has room.
2. **Layer order:**
   1. Drop: the silhouette path in ink, `transform="translate(0 2.5)"`. A hard shadow, no filter.
   2. Base: the silhouette in the mid-tone.
   3. Shade: a darker shape covering the lower-right ~35%, clipped to the silhouette by `<clipPath id="c-<id>">`.
   4. Highlight: a white ellipse at the top-left (rx ≈ 22% of the icon width), opacity .55, clipped.
   5. Details: ink lines, `stroke-width 2`, round caps. Use sparingly: at most 3 per icon.
   6. Outline: the silhouette again, `fill:none; stroke:#1B1736; stroke-width:3; stroke-linejoin:round; stroke-linecap:round`.
3. **One stroke weight** (3 on the 48 grid) for every outline. Minimum display size 20px.
4. **Colours** come only from the tokens in §2.2. Recolourable icons (`gem`, `creature`) use `fill="currentColor"` on the base layer and a `color-mix` shade.
5. **Feel:** chunky, slightly tilted (−6° to 6°), big simple shapes. No thin line-art and no gradients inside icons (shading is the flat shade layer). Icons may overhang their containers (§2.4).

**Required icons** (34, all original drawings; cut from 56 in revision A):

| IconId | Depicts | Base / shade / accent | Used in |
|---|---|---|---|
| `cash` | Stack of 3 green bills, top bill with a "$" medallion | `#7DFF5A` / `#2FC23A` / medallion `#F4FFB8` | Cash pill, prices, coin fly, reward chips |
| `pearl` | Glossy pearl sphere resting in a small half-shell | pearl `#EAF6FF` / `#7FD8FF`, shell `#FF9AB6` | Pearl pill, prices |
| `shop` | Market-stall front: red/white striped scalloped awning over a green counter with a "$" | `#FF4D5E` + `#FFFFFF` / counter `#3FCB4B` | Rail Shop |
| `index` | Thick purple book with a gold fish emblem and a red bookmark tail | `#9B5CFF` / `#6A2FD1` / `#FFC92E` | Rail Index |
| `rebirth` | Gold 5-point star circled by a curved arrow | `#FFC92E` / `#E07800`, arrow `#FF8C3A` | Rebirth tile and tab |
| `gift` | Cube gift box, coral, gold ribbon, big bow | `#FF4D5E` / `#D9233A` / `#FFC92E` | Rail FREE, gift strip, daily tiles |
| `locker` | Coiled rope with a 4-point sparkle | rope `#D9A35F` / `#B07A3A`, sparkle `#7FFBE6` | Shop LOCKER tab, coach card |
| `settings` | 8-tooth gear with a hole | `#7FA8D9` / `#4A6FA0` | Top-right buoy |
| `sound-on` / `sound-off` | Speaker with 2 waves / speaker with a red X | `#34AFFF`, X `#FF4D5E` | Top-right buoy, Settings |
| `speed` | Sneaker with a white sole, 3 speed lines behind | `#34AFFF` / `#1679D9` | Run Speed |
| `reach` | Rope coil with a gold hook trailing out | rope `#D9A35F`, hook `#FFC92E` | Rope Reach |
| `power` | Fist gripping a rope, with an impact burst | skin `#FFB27A`, burst `#FFF07A` | Swing Power |
| `carry` | Chunky backpack with a front pocket and a strap | `#9B5CFF` / `#6A2FD1` | Carry Slots, hotbar counter |
| `pedestal` | Two-tier stone podium with gold trim and a star | `#ECE5D6` / `#C2B79F`, trim `#FFC92E` | Base Pedestals |
| `wave` | Curling wave with a white foam lip; body uses `currentColor` | default `#34AFFF`; golden sets `color:#FFC92E` | Wave meter, course bar |
| `lighthouse` | Tapered red/white tower, yellow lamp, dark cap | `#FF4D5E` + `#FFFFFF`, lamp `#FFF07A` | Course bar, edge arrow, hints |
| `home` | Hut with a red roof and a door, small palm leaf | wall `#F4D9A0`, roof `#FF4D5E` | Course bar, tutorial, edge arrow |
| `lock` | Padlock with a gold body and slate shackle | `#FFC92E` / `#E07800`, shackle `#A9B3C1` | Locked hooks, pedestals, items, paused meter |
| `check` | Fat tick in a green circle | `#3FCB4B` / `#23963A` | Claimed, quest done, KEEP |
| `close` | Fat X | `#FFFFFF`, ink outline | Life-ring close, LOSE |
| `play` | Rounded triangle | `#FFFFFF` | Resume overlay, replay |
| `arrow-up` | Fat up arrow (`currentColor`) | white; green on the Shop upgrade arrow; `--income` in the income chip | JUMP button, upgrade arrow, income |
| `chevron` | Fat right chevron | `#3FCB4B` | Stat arrows |
| `chain` | Two interlocked gold links | `#FFC92E` / `#E07800` | Chain counter, paused meter |
| `perfect` | Lightning bolt | `#FFF07A` / `#FFC92E` | Perfect Release, release ring |
| `sparkle` | 4-point twinkle | `#FFFFFF` | Card FX, golden, Day 7 |
| `flame` | Flame | `#FF8C3A` / `#FF4D5E` | Streak counter |
| `lucky-tide` | Gold coin with a wave curl | `#FFC92E`, wave `#34AFFF` | Token |
| `gem` | Faceted diamond (recolourable) | `currentColor` | Mutation gems |
| `creature` | Generic blob creature silhouette (`currentColor`) | — | Empty slots, Mystery Creature (with a CSS "?" overlay), edge arrow |
| `warning` | Rounded triangle with "!" | `#FFC92E`, "!" ink | Danger toasts |
| `hand` | White cartoon glove pointing up-left, 1 finger | `#FFFFFF` / `#D6DCE4` | Tutorial spotlight, DRAG TO LOOK |
| `thumb` | Thumb pad from above, 75% white | `#FFFFFF` | Tutorial ghost thumb |

Removed from revision A (deferred features or redundant): `coin`, `income`, `daily`, `quests`, `rope`, `trail`, `music-on`, `music-off`, `wave-golden`, `info`, `plus`, `clock`, `star`, `trophy`, `reroll`, `boost`, `mystery`, `pin`.

**Emoji removal.** Delete every emoji from `hud.ts`, `economy.ts` (`icon` field becomes `iconId: IconId`; the **lead** makes this rename in Phase 0 and updates today's readers in `hud.ts` and `Game.ts`), `Game.ts` toasts and banners, `world.ts` signs and `labels.ts`.

---

## 4. HUD layout

### 4.0 Layout modes and scaling

`src/ui/layout.ts` picks the layout mode on every resize and sets `#ui[data-layout]`:

- **`portrait`** if `innerHeight > innerWidth`.
- **`landscape`** (compact phone) if `min(innerWidth, innerHeight) < 500`.
- **`desktop`** otherwise. Tablets use desktop with touch controls.

Scaling:

- **Desktop** values below are authored at 1280×720. Set `--u = clamp(.85, min(innerWidth/1280, innerHeight/720), 1.5)` and apply `zoom: var(--u)` to `#ui > .hud-root`. Spotlight math uses `getBoundingClientRect()`, which already accounts for zoom in current browsers.
- **Landscape and portrait** use the fixed px values below. Nothing interactive is smaller than a 48×48 hit area.

**Safe-area padding.** `--sl/--sr/--st/--sb = max(12px, env(safe-area-inset-*) + 8px)`, applied to every edge-anchored element.

### 4.1 Desktop (1280×720)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ [$ 12.4K      ]            ((wave) WAVE IN 0:28 ▓▓▓░░)               (snd)(⚙) │
│   [+$85/s][×1.5]           [home▐z1▐z2▐z3▐…▐z7]                              │
│ [pearl 140]                     Zone 2 Coral Reef               ┌─ tracker ─┐│
│                              ( toasts / objective pill )        │ VOYAGE 7/12││
│ ┌──┐                                                            │ ...        ││
│ │SH│                                                            └────────────┘│
│ ├──┤                        (character: keep clear)                          │
│ │FR│                                                   CHAIN ×4              │
│ ├──┤                                                                         │
│ │IX│                                                                         │
│ ├──┤                                                                         │
│ │RB│                       [bag 1/2][slot][slot]                             │
└──────────────────────────────────────────────────────────────────────────────┘
```

| Id | Element | Anchor and position (px) | Size |
|---|---|---|---|
| `cash` | Cash pill | top-left, x 30 (icon overhangs to x 16), y 16 | 44 tall, min-w 196 |
| `income` | Income chip (plus the rebirth chip) | x 66, y 66 | 24 tall |
| `pearls` | Pearl pill | x 30, y 100 | 34 tall |
| `rail` | Left rail, 1 column: Shop, FREE, Index, Rebirth | x 16; rows y 168, 262, 356, 450 | tiles 72, row pitch 94 |
| `sound`, `settings` | Round buttons | top-right: settings right 16 / top 16, sound right 72 / top 16 | 48 |
| `skip` | "Skip tutorial ›" link (FTUE only) | right 16, top 76 | 48 hit area |
| `wave` | Wave meter | top-centre, y 14 | 380×52 |
| `course` | Course bar and zone label | top-centre, y 74; label y 96 | 380×16 |
| `toasts` | Toast stack | top-centre, y 124 (y 192 while the objective pill shows) | 44 tall |
| `objective` | Tutorial objective pill | top-centre, y 124 (the wave meter is always visible, §7.2) | 56 tall, max-w 560 |
| `tracker` | Quest tracker | right 16, top 84 | 260 wide |
| `chain` | Chain counter | left 67% of width, top 42% (right of the character) | Lilita 44 plus a 56px timer ring |
| `carry` | Carry hotbar | bottom-centre, y = bottom 20 | slots 60, gap 10 |
| `banner` | Centre banner | top 22% (y ≈ 158), centred | ≤ 640×84 |
| `reveal` | Compact reveal card | right edge, top 40%, slides in from the right | 280×120 |
| `reticle` | Hook reticle | projected hook position | 56 |
| `edge` | Off-screen objective arrow (C23) | clamped to an ellipse inset 64px from the screen edges | 44 arrow plus a 36 icon disc and distance chip |
| `vignette`, `flash` | Full-screen overlays | inset 0, `pointer-events:none` | — |
| `resume` | Resume overlay (C22) | full screen | — |

There are no touch controls on desktop. The keycap legend appears only inside tutorial prompts and tooltips.

### 4.2 Phone landscape (reference 844×390, notch insets up to 47px)

| Id | Position | Size |
|---|---|---|
| `cash` | left sl+14, top st+8 | 38 tall, value Lilita 24, icon 48 |
| `income` | right of the cash pill on the same row, gap 8, vertically centred | 24 tall, Lilita 14 |
| `pearls` | same row, right of the income chip, gap 8 | 28 tall, Lilita 18, icon 34 |
| `rail` | **1 horizontal row** under the cash row: x = sl, sl+60, sl+120, sl+180; top st+56 | tiles 52 (hit 56), label Lilita 13, icon 40 |
| `settings`, `sound` | top-right: settings at right sr, top st+6; sound at right sr+52 | 44 |
| `skip` | right sr, top st+56 | — |
| `wave` | top-centre, top st+6 | 300×42, digits Lilita 24, disc 48 |
| `course` | top st+54 | 300×12, no zone label (the zone shows in the banner only) |
| `objective` | top 74, centred | 46 tall, headline Lilita 20, sub Fredoka 600 13 |
| `toasts` | top 74, or 128 while the objective pill shows; **1 visible** | 38 tall, text 15 |
| `tracker` | right sr, top st+56 (after the FTUE). Collapsed chip by default; tap to expand to a 240-wide card that auto-collapses after 4000ms. Its bottom stays above 35% H as for the rail. | chip 210×38 |
| `chain` | left 64%, top 32% | Lilita 32 |
| `carry` | bottom-centre, bottom sb+10 | slots 48, gap 8. If capacity ≥ 6, slots shrink to 42 and the gap to 6. |
| `jump` | right sr+16, bottom sb+16 | `clamp(84px,26vh,120px)` → 101px |
| `joy` | floating. Ghost centred at (sl+96, H − sb − 92) | base 120 (radius 60), knob 52 |
| `banner` | top 16% | height 64, title Lilita 34 |
| `reveal` | right sr, top 34% | 230×100 |

**Thumb-zone rule (hard).** In landscape, no rail tile, tracker or other tappable HUD element may extend below **35% of H** on the left 45% of the screen. At the 390px reference the rail's label chips end at st+119 ≈ 131px (< 136.5px). If `H < 360`, rail tiles shrink to 48 (hit 52). The rail tiles use `.hud-fade` with `pointer-events:none` while running (C20).

**Floating joystick rules** (`src/input/input.ts`):

- A touch on the **canvas** with `x < 40% W` and `y > 40% H` spawns the joystick base at the touch point (a 5% buffer under the HUD zone). Touches on DOM buttons never reach the canvas.
- Base radius 60, knob 52, max travel 60, dead zone 12% (7px). Normalised output with a smoothstep from 12% to 100%.
- The ghost shows at the default spot at opacity .35 until the first touch, then hides while the joystick is unused.
- The rest of the canvas is camera drag, with pointer capture.
- Buttons stay pressed if the thumb drifts up to 24px outside them (pointer capture plus slop).

### 4.3 Phone portrait (reference 390×844)

| Id | Position | Size |
|---|---|---|
| `cash` / `income` / `pearls` | top-left: cash at top st+8; income chip under it at st+50; pearls at st+78 | cash and pearls as landscape |
| `settings`, `sound` | top-right row, top st+8 | 44 |
| `wave` | top-centre, top st+112, width `min(358px, 100vw - 32px)` | 42 tall |
| `course` | top st+160 | 12 tall |
| `tracker` | collapsed chip, left 16, top st+184 | 200×38 |
| `objective` | top st+184 (the tracker is hidden during the FTUE) | width 92vw |
| `toasts` | top st+232, 1 visible | — |
| `rail` | 2 columns × 2 rows, x = sl, sl+62; y = 30%, 30%+66 of height | tiles 52 |
| `chain` | centred, top 30% | Lilita 32 |
| `carry` | bottom-centre, bottom sb+150 | slots 48 |
| `jump` | right 20, bottom sb+28 | 104 |
| `joy` ghost | centre (100, H − sb − 110) | 120 |
| `banner` | top 22%, width 92vw | title Lilita 30 |
| Panels | `width: calc(100vw - 16px)`, `max-height: calc(100% - 120px)`, tabs scroll horizontally, grids at 3 columns | — |

The camera FOV for portrait stays at 75 (as in v0.1); the base FOV is 62 for landscape and desktop.

### 4.4 What hides when

| Situation | Behaviour |
|---|---|
| **Action**: `player.mode !== 'ground'` or horizontal speed > 6 m/s | `rail`, `tracker` and `pearls` get `.hud-fade` (on touch also `pointer-events:none`). They return 600ms after the player is grounded with speed < 4. Cash, wave meter, carry and touch buttons never fade. |
| **Surge** | Tracker collapses to its header. Non-wave toasts queue. Zone banners are suppressed. |
| **Panel open** | Backdrop covers everything except the currency pills, which are raised above the backdrop with `z-index` so purchases show their count-down. The game pauses (unchanged). |
| **Big reveal** | Everything is hidden except the currency pills. |
| **Resume overlay** | Covers everything; the sim is paused. |
| **FTUE** | Visibility follows the step (§7.2). Before step `shop` the rail is hidden. The wave meter is **always visible** (as `WAVE PAUSED` while frozen); the course bar appears at step `home`. The tracker is hidden until `ready`. Cash appears with the first reward. |
| **Not yet unlocked** | Rail tiles appear with a 300ms pop (`scale 0 → 1.15 → 1`) plus sfx `ui.open` when they unlock: Shop at FTUE step `shop`; Index and FREE at `ready`; the Shop's LOCKER tab when the Voyage completes; Rebirth when cash ≥ 25% of its cost. |
| **Reduce motion** | Disables wiggles, bobs, shine sweeps, sunburst rotation and shakes. Pops become 120ms fades. |

---

## 5. Motion and juice

### 5.1 UI motion

| Element | Trigger | Animation | Duration and easing | Sound |
|---|---|---|---|---|
| Button press | pointerdown | `translateY(4px) scale(.96)`, lip 5 → 2 | 60ms ease-out | `ui.click` |
| Button release | pointerup | back to rest with overshoot | 180ms `--ease-back` | — |
| Button hover | desktop | `translateY(-2px) scale(1.04) rotate(-1.5deg)`, brightness 1.06 | 120ms | `ui.hover` |
| Panel open / close | see C5 | — | 260 / 140ms | `ui.open` / `ui.close` |
| Tab switch | click | the old content fades 80ms, the new cards stagger in (C5) | 35ms stagger | `ui.tab` |
| Number count-up | discrete gain | easeOutCubic roll, pill pop 1.12 | 450ms (+90/160ms pop) | — |
| Coin fly | collect/claim/deliver cash | see below | 400–620ms per coin, 35ms stagger | `coinTick(i)` |
| Floating text | world events | see below | 900ms | — |
| Badge pop | badge appears | `scale 0 → 1.25 → 1` | 260ms `--ease-back` | — |
| Rail wiggle | highest-priority actionable tile | rotate 0 → −7° → 6° → −4° → 0 | 600ms every 4000ms | — |
| Toast | queue | C8 | 240 in, 160 out | `toast` |
| Banner | queue | C9 | 200 in, hold 1400–1800, 220 out | per banner |
| Hotbar fill | collect | `scale 0 → 1.15 → 1` | 260ms `--ease-back` | — |
| Reticle | target change | `scale 1.4 → 1` | 120ms ease-out | — |
| Countdown 3-2-1 | last 3 s of warning | Lilita 120 centre, `scale 1.4 → 1`, fade at 900ms | 1000ms each | `tick` |
| Upgrade bought | buy | C6 feedback | ≈ 300ms | `buy` |
| Compact reveal | new species or new mutation | card slides in from the right: `translateX(120%) → 0` | in 260ms `--ease-back`, hold 1800, out 200 | `reveal(r)` |
| Big reveal | first Legendary+, first Rainbow (calm phase only; otherwise compact) | see below | ≈ 1800ms | `reveal(r)` |
| Rebirth (v2.0) | rebirth confirmed | gold flash 150ms → "REBIRTH" banner (gold, sub "×2.0 cash forever") → confetti 80 | ≈ 2000ms | `rebirth` |
| Rebirth ceremony (v2.1) | — | flash → sunburst → banner → multiplier count-up over 800ms → confetti | 2400ms | `rebirth` |
| Upgrade arrow | cash ≥ cheapest upgrade | Shop tile arrow bobs 6px at 1.2 Hz | loop | — |
| Tomorrow teaser | after a Daily claim | toast `info` "Tomorrow: Lucky Tide" with the reward icon | 2200ms hold | `toast` |
| Screen flash | splash / sea fall | full-screen colour, opacity .7 → 0 | 250ms (splash `#1E88FF`, sea `#2EC5E8`) | — |
| Vignette | danger / slow-mo | `radial-gradient(ellipse at 50% 45%, transparent 58%, var(--vig) 100%)`, opacity animated | 300ms | — |

**Coin fly** (`src/ui/fx.ts`, pooled with 24 DOM nodes of the 28px `cash` icon, or `pearl` for Pearls):

1. **Coin count** by amount relative to income:

   | Amount | Coins |
   |---|---|
   | < 10 s of income | 4 |
   | < 60 s | 7 |
   | ≥ 60 s | 10 |
   | big reveal or rebirth | 12 (the cap) |

2. **Spawn** at the source screen point, scattered on a 30px radius. Each coin pops `scale 0 → 1` over 120ms.
3. **Flight** along a quadratic Bézier to the pill icon centre. Control point = midpoint + (random −120…120, −160). Duration 520 ± 80ms. Position follows `t' = t²` (accelerates in). Coins are staggered 35ms apart.
4. **Arrival:** the coin shrinks to .6 and fades over 60ms. The pill pops (C4). The counter adds `amount / count` per coin, so the number rolls; the first arrival starts the roll. Sfx `coinTick(i)` rises up the pentatonic.
5. **Sources:** pedestal screen positions (deliver), the claim button rect (rewards), the creature's projected position (none: creatures go to the hotbar instead, below).

**Floating text** (`FloatText`, pooled with 24 nodes, positioned with `gfx.project()`):

- **Keyframes:** 0ms `scale(.4) opacity 0` → 120ms `scale(1.25) opacity 1` → 220ms `scale(1)`. Rise 56px over 900ms `--ease-out`. Random x drift ±12px. Fade over the last 300ms.
- **Merging:** gains from the same source key within 250ms merge into one node. The text updates and the node re-pops `scale 1.2 → 1` over 120ms.

| Kind | Style |
|---|---|
| `cash` | "+$25", Lilita 26, `--cash-grad` |
| `income` | "+$2", Lilita 18, `--income` |
| `pearl` | "+10", Lilita 22, `--pearl-grad` |
| `perfect` | "PERFECT", Lilita 34, sun, `rotate(-6deg)` |
| `chain` | "×4", Lilita 30, sun |
| `bonus` | "CLOSE CALL +25%", Lilita 28, coral |

**Creature to hotbar.** On collect, a 56px portrait spawns at the creature's projected position. It arcs over 350ms (control point 120px above) into its hotbar slot, then the slot plays its fill pop. This runs alongside the 3D hop onto the head (§5.2).

**Big reveal** (only in the calm phase and outside the FTUE; in warning or surge, use the compact card):

| Time (ms) | Beat |
|---|---|
| 0–120 | `timeScale.request('reveal', 0.15, 1800)` through the lead's arbiter (§10.1); the UI calls it via `HudDeps.requestTimeScale`. Backdrop dims to .45. |
| 0 | Sunburst (rarity hue, 520px) fades in and rotates for 12000ms. |
| 0–600 | Portrait (160px) spins `rotateY(540deg) → 0` and scales `.2 → 1.15 → 1` with `--ease-back`. |
| 300 | Rarity banner slams in (C9), camera trauma 0.2. |
| 300 | Confetti: Epic 40 pieces, Legendary 60, Mythic and Secret 80 plus a white flash of 120ms at .6 opacity. |
| 500 | "NEW" sticker and an "Added to Index 6/21" chip. |
| 1800, or on tap | Everything exits over 220ms and the UI calls `requestTimeScale('reveal', 1, 0)` to release it; the arbiter ramps back over 200ms. |
| — | On the first Legendary or higher catch, the lead calls `platform.happytime()`. |

**Confetti** (`src/ui/confetti.ts`): a single full-screen 2D canvas, created on demand and removed when idle.

- Pieces are 8×12px rectangles and 8px circles in 4 colours (rarity hue, `--sun`, `--grass`, `--sky`).
- Initial velocity is radial, 300–700 px/s. Gravity 1400 px/s². Spin ±8 rad/s. Life 1200ms. Fade over the last 300ms.
- Cap 120 pieces. Reduce motion uses 30% of the count.

### 5.2 In-world motion (graphics team)

| Effect | Spec |
|---|---|
| Player idle | Breathing bob: torso and head `y += .03 × sin(2π × 1.5 t)` m; arms swing ±.04 rad in phase. After 5 s grounded with no input: a **look-around** fidget (head yaw 0 → +35° → −35° → 0 over 1800ms `--ease-io`, once, then every 8 s). After 15 s: **sit** (hips −.5 m over 300ms, legs forward 1.4 rad, arms back) and stay seated until input, standing up over 200ms. |
| Pose blending | Every pose (idle, run, swing, air, fall, carry, celebrate) is a set of joint targets. The character keeps one weight per pose and cross-fades linearly over **120ms** on any change, **60ms** for jump and double jump, and **0ms** into hit-stop. Joint angles are the weighted sum. |
| Carry pose | While `carried.length > 0`: both arms raised to 2.6 rad (hands above the head, holding the stack), run arm-pump amplitude drops to .25 rad. Blends in and out over 120ms. |
| Celebrations (layered over the base pose, 0 → 1 → 0 weight) | **Deliver:** arms straight up and a hop (+.4 m, 600ms total). **Legendary+ catch:** a fist pump (right arm 2.8 rad, 3 pumps of .3 rad at 5 Hz, 700ms) with the big-grin face. **Survived wave:** cheer (both arms up, 2 hops of .3 m, 900ms) at `surgeEnd` when `survived` is true. **Perfect Release:** none (the flip covers it). Reduce motion: no hops, arms only. |
| Player jump stretch | Scale `(1/√s, s, 1/√s)` with s = 1.15 for 100ms, then a spring back |
| Player land squash | `s = 1 − clamp(vyImpact/30, 0, .3)`. Spring k = 400, damping 18, ≈ 250ms with one overshoot to ≈ 1.06. |
| Flight stretch | Along the velocity: `s = 1 + clamp(speed/60, 0, .25)` while airborne and speed > 15 |
| Run pose | Forward lean `.18 rad × min(1, speed/12)`. Arm pump amplitude 1.0 rad. Leg frequency `speed × .9` rad/s. |
| Swing pose | Legs tuck (−.6 rad) near the apex (`|vel| < 4`). Legs kick (+.5 rad) on the downswing. |
| Release flip | If release speed > 16, a forward somersault of 360° over 450ms `--ease-out` |
| Fall | After more than 800ms falling with `vel.y < −8`: windmill arms at 9 rad/s and the "O" face |
| Face decals | 6 expressions drawn on a 16×16 grid, scaled ×4 to a 64×64 canvas with `NearestFilter` (pixel layouts in §5.2a): idle smirk; ground speed > 8 grin; swing big grin; long fall "O"; wave within 40 m panic; splash X-eyes for 1600ms. Celebrations use the big grin. |
| Landing dust | 8–12 puffs `#F3EAD8`, size .35–.6, outward 3 m/s, up 1, gravity −1 (floats), life .35–.5 s, grows .6 → 1.2 then shrinks. A hard land (`vyImpact > 18`) uses 16 puffs plus trauma .25. |
| Swing trail (ribbon) | 20-sample ring buffer at the feet midpoint, sampled when moved ≥ .15 m. 2 camera-facing verts per sample. Width .35 → 0 taper; alpha 0.7 → 0. Fades in above 12 m/s over 150ms, out below 9 m/s over 250ms. Colour and particles come from the equipped trail cosmetic (§9.5). |
| Speed lines | 40 additive quads (.03×3 m) in an InstancedMesh, spawned in a 4–10 m cylinder ahead of the camera, moving at −vel × 1.5. Opacity and length × `smoothstep(14, 30, speed) × .5`. Off on Low and with reduce motion. |
| FOV | `fov = base + 12 × smoothstep(8, 30, speed)`, smoothed `1 − exp(−6dt)`. Release kick +5° (Perfect +8°), decay τ 250ms. Landing −2°, τ 150ms. Pad launch +10°, τ 400ms. Cap +15° over base. Update the projection only when Δfov > .01. |
| Look-ahead | Camera target += `vel × .12`, clamped to 4 m, smoothed τ 200ms. Swinging uses `vel × .06`. |
| Camera shake (trauma) | Shake = trauma². Max yaw and pitch 1.5°, roll 2.5°, offset .15 m. Multi-octave value noise at 22 Hz. Decay 1.3/s. Applied **after** `lookAt`. Event values: hard land .25; Rare catch .1; Epic .15; Legendary+ .3; pad launch .35; WAVE banner .1; surge within 25 m of the player `.15 × proximity` continuous; splash .8; rebirth .4; Perfect .08. Reduce motion × .25. |
| Hit-stop | Sim `timeScale` .05 for: collect Common/Uncommon 40ms, Rare/Epic 70ms, Legendary+ 110ms; grab at speed > 20 for 35ms. Ease back over 80ms. Camera, particles and UI keep real dt. |
| Perfect slow-mo | `timeScale` .6 for 100ms real, then back over 80ms |
| Rope | 10 instanced cylinder segments along a quadratic curve hand → hook. Control point = midpoint plus sag `.04 × length` when not taut, plus twang. **Twang on grab:** a lateral offset of the control point, amplitude .3 m, 8 Hz, decay τ 100ms. Thickness .09 m. Skin from the cosmetic. |
| Pickup | Creature scale 1 → 1.35 → 1 (180ms `--ease-back`) plus a white emissive flash for 60ms, then a 300ms parabolic arc (apex +2 m) onto the head stack, where it lands with a squash (.85, 80ms). |
| Carried stack wobble | Per item i: `rot = −k × accel` with k = .015 rad per m/s², clamp .35. Spring k = 120, damping 10. Amplitude × (1 + .35i). |
| Wild creature idle | Each species has a **signature idle** (§5.2b) that plays every 2–4 s (random), alternating with the shared hop: squash .85 (60ms) → rise .5 m with stretch 1.12 (220ms) → land squash .88 → settle. Within 8 m of the player, face them (yaw slerp 4 rad/s); otherwise look around ±40° every 3–5 s. **Remove the constant spin** at `Game.ts:576`. |
| Blink | **In the vertex shader**, not a separate mesh: eye vertices carry an `aEye` attribute (1 for eye boxes, 0 otherwise, plus the eye-centre y in a second component) and each creature has a `uBlink` value (per-object uniform, or an instance attribute when batched). The shader scales eye vertices in y toward the eye centre by `1 − .9 × uBlink`. Every 2.5–5 s, `uBlink` goes 0 → 1 over 45ms and back over 45ms. Applies to wild, carried and pedestal creatures. 0 extra draw calls. |
| Pedestal creatures | Bob **on the music beat**: `y = .08 × (1 − |sin(π × beatPhase)|)` with `beatPhase` from `RenderFrame.beatPhase` (audio clock, §10.3), so every pedestal lands on the beat; neighbours alternate by half a beat. With music muted or not yet unlocked, fall back to a 112 BPM local clock. Blink, face the path to the island edge. Tapping a pedestal creature (touch or click within its screen rect) plays its signature idle and its voice (`creatureVoice`, §8.6). |
| Pedestal coin pops | Every 2000ms per pedestal, phase-offset by `i × 370ms`, only while the player is within 30 m of home and no panel is open: a gold box coin (.25) rises .8 m and shrinks over 500ms, plus a DOM `income` float "+$N" (N = 2 s of that pedestal's income). If more than 10 pedestals are filled, only the top 6 earners pop. |
| Deliver | Creatures hop head → pedestal along an arc (apex +2.5 m) over 350ms each, staggered 120ms. Landing squash, a 14-particle rarity burst, and a ring pulse on the pedestal glow disc (scale 1 → 1.6, fade 400ms). Then the coin fly from the pedestals to cash for the delivery bonus (§9.4). |
| Sea fall splash | 14 spray columns at 6–9 m/s up, gravity 22, life .6 s; 10 droplets; an alpha-tested ring decal expanding .5 → 4 m over 500ms; a foam patch fading over 1500ms; screen flash (§5.1) in place of a hard cut |
| Wave splash | The above × 1.8, trauma .8, flash `#1E88FF` |
| Hooks | Idle sway `rotation.z = sin(t·1.2 + id) × .08`. The buoy-balloon bobs ±.15 m at .8 Hz. The targeted hook's emissive goes 0 → .6 over 120ms. |
| Lighthouse | Beam cone rotates .6 rad/s. Its colour is `#FFF2A8` normally and `#FF5A5F` during warning and surge (lerp 400ms). Pad chevrons scroll at 1.2 m/s. Pad ring pulse every 800ms (scale 1 → 1.8, fade). |
| Palms | Vertex sway, `.05 rad × (y/h)` at .6 Hz, per-instance phase |
| Gulls | 3 blocky birds circle home at radius 18–26 m, height 14–18 m, .25 rad/s; wings flap 4 Hz |

**Reduce motion** applies everywhere: no shake, no FOV kicks, speed FOV × .5, no speed lines, no camera nudges, no release flip, confetti at 30%, UI pops become fades, no idle UI loops.

#### 5.2a Face decal pixel layouts (`render/faces.ts`)

16×16 grid, origin top-left, each entry is a filled rect `x,y,w,h` in grid cells (1 cell = 4 canvas px). Colours: **ink `#1B1736`**, white `#FFFFFF`, **blush `#FF9AB6`**, tongue `#FF4F7B`, mouth inside `#8E1B3A`, sweat `#7FD8FF`. The canvas background is transparent (the head's skin shows through). Drawn once per expression into one 384×64 atlas (6 frames); the face plane swaps UV offset, so an expression change costs nothing.

| Expression | Eyes | Mouth | Extras |
|---|---|---|---|
| `smirk` (idle) | ink 4,5,2,3 and 10,5,2,3; white glints 4,5,1,1 and 10,5,1,1 | ink 6,11,4,1 and 10,10,1,1 (lifted right corner) | blush 2,10,2,1 and 12,10,2,1 |
| `grin` (run) | as smirk | ink 5,10,6,1 and 6,11,4,2; white teeth 6,11,4,1 | blush as smirk |
| `bigGrin` (swing, celebrate) | happy arcs: ink 3,6,1,1 / 4,5,2,1 / 6,6,1,1 and 9,6,1,1 / 10,5,2,1 / 12,6,1,1 | ink 4,10,8,1 and 5,11,6,2; white 5,11,6,1; tongue 6,12,4,1 | blush 1,9,2,2 and 13,9,2,2 |
| `oh` (long fall) | ink 4,4,2,3 and 10,4,2,3 (raised one row); glints as smirk, one row up | ring: ink 7,10,2,1 / 6,11,1,2 / 9,11,1,2 / 7,13,2,1; inside 7,11,2,2 | none |
| `panic` (wave within 40 m) | ink 3,4,4,4 and 9,4,4,4; white 4,5,2,2 and 10,5,2,2; pupils ink 5,6,1,1 and 11,6,1,1 | wavy: ink 5,11 / 6,10 / 7,11 / 8,10 / 9,11 / 10,10 (each 1×1) | sweat 13,2,1,2 |
| `xEyes` (splash) | each eye an X of five 1×1 ink cells: 4,4 / 6,4 / 5,5 / 4,6 / 6,6 and 10,4 / 12,4 / 11,5 / 10,6 / 12,6 | ink 5,11,6,1; tongue 9,12,2,1 | none |

Creatures keep their v0.1 eye boxes (3D), now with the 1-texel white highlight and brow box of G13; they don't use decals.

#### 5.2b Signature idles per species (`render/creatures.ts`)

Each is a short procedural tween on the creature's parts (body, accessory, limbs from `creatureGeometry`), relative to its rest pose. "Amp" is the peak amplitude. All are ×0 with reduce motion except the hop.

| Species | Signature idle | Duration | Amp |
|---|---|---|---|
| Toastopus | Pops up out of an invisible toaster: sinks .25 m, then springs up .6 m with a 1-turn yaw spin | 700ms | .6 m |
| Pickle Puff | Inflates like a balloon (uniform scale) then deflates with a wobble | 600ms | ×1.25 |
| Soggy Sock | Wrings itself: body twists around its long axis and back | 800ms | 50° |
| Crab DJ | Scratches a disc: right claw slides left-right 3 times, head nods on each | 900ms | .15 m, 12° nod |
| Boba Turtle | Retracts into its shell (head and legs scale to 0) then peeks out | 1000ms | scale 0 |
| Sir Shrimpington | Tips his top hat: hat lifts .2 m and tilts 25°, body bows 15° | 700ms | .2 m |
| Banana Shark | Chomps: jaw (front 30% of body) opens 25° and snaps shut twice | 500ms | 25° |
| Disco Clam | Opens its lid, spins once inside, closes | 900ms | 70° lid |
| Waffle Walrus | Belly flop: tips forward 80°, lands flat with a squash .7, rolls back | 900ms | 80° |
| Burger Whale | Bun-top lifts and wobbles like a lid, a spout puff (2 white particles) | 800ms | .3 m |
| Cactus Jelly | Tentacles sway in a ripple (phase offset per tentacle), flower spins | 1200ms | 20° |
| Ninja Narwhal | Dashes .8 m sideways and back in 2 frames (blink step), bandana tails flap | 400ms | .8 m |
| King Krill | Royal wave: one leg waves 4 times; crown bobs | 1000ms | 35° |
| Lava Lobster | Claws clack together overhead twice; 3 ember particles | 600ms | 40° |
| Astro Otter | Floats up .5 m in slow motion, rotates 180° in roll, drifts down | 1600ms | .5 m |
| Thunder Tuna | Electric shiver: high-frequency jitter (30 Hz, ±.04 m) plus 1 spark | 500ms | .04 m |
| Ghost Galleon | Fades to 40% opacity and sways like a sail | 1400ms | 15° sway |
| Pizza Kraken | Spins like a pizza being tossed: rises .4 m with 2 yaw turns | 900ms | .4 m |
| The Big Cheese | Slow imperious turn to face the camera, crown glint (1 sparkle) | 1200ms | 90° yaw |
| Cosmic Sunfish | Orbit: body circles a .3 m loop in the vertical plane, trailing 4 sparkles | 1500ms | .3 m |
| Captain Splash | Salutes (claw to hat), then plants a fist on the hip | 900ms | 60° |

#### 5.2c Zone props (P1, `render/props.ts`)

Two prop kinds per zone, **2 props per island** (one of each kind), placed on the island top at least 2 m from spawn points, the path line and the edges. Box-built with `BoxBuilder` and ink edge lines; each zone's props are merged into one geometry (**1 draw call per zone**, 7 total). No props on the home island beyond G8.

| Zone | Prop A (size in m, colours) | Prop B |
|---|---|---|
| Shallows | Palm: trunk 4 stacked boxes .35×.9×.35 leaning 8°, `#B07A3A`/`#8A5A28`; 5 leaf boxes 1.6×.12×.5 `#3FCB4B`/`#23963A` | Shell pile: 3 flat boxes .5×.2×.4 `#FFD1C2`, `#FF9AB6`, `#FFF6E0` |
| Coral Reef | Coral branch: trunk .3×1.2×.3 plus 3 arms .2×.7×.2 at ±40°, `#FF7A59` and `#FF4F7B` | Brain coral: 1.0×.6×1.0 box with 4 groove lines, `#FFB27A` |
| Lagoon | Kelp: 3 stalks .2×2.2×.2 swaying (vertex sway .6 Hz), `#2E9E5B` | Lily pad cluster on the water at the island edge: 3 discs r .6 `#59D36A` with a `#FF9AB6` flower box .25 |
| Stormy Seas | Broken mast: post .4×3.0×.4 tilted 15°, `#6B4A2E`, with a torn sail box 1.4×1.0×.05 `#D6DCE4` | Dark rocks: 3 boxes .6–1.0 m, `#4A5566`/`#66758A` |
| Kraken Deep | Tentacle arch: 7 boxes .5×.5×.5 on a 3 m wide, 2.5 m tall arc, `#8A6BFF` with `#C79BFF` suction dots | Purple crystals: 3 elongated octahedra 1.2–1.8 m, `#B065FF`, emissive .25 |
| Volcano Bay | Lava crack: 3 flat strips 1.5×.05×.2 on the ground, emissive `#FF7A1A` (pulse .6 Hz) | Smoking rock: box .9×.7×.9 `#5A3A32` with 2 grey smoke puffs `#9B8C8C` rising 1.5 m every 2 s |
| Secret Reef | Glow crystals: 4 octahedra .6–1.4 m, `#54F2FF`, emissive .5, toneMapped false | Star rock: box .8×.5×.8 `#3A4A7A` with a 5-box star `#FFF07A` on top |

### 5.3 Feedback matrix (the lead wires this in `Game.ts`)

| Event | gfx | ui | audio |
|---|---|---|---|
| `player:jump` | stretch, dust ×6 | — | `jump` |
| `player:doubleJump` | stretch, puff `#BFEAFF` ×10 | first time: hint `doubleJump` stamp | `doubleJump` |
| `player:grab` | rope twang, hit-stop if fast (`requestTimeScale('hitstop', …)`) | reticle hides | `grab` |
| `releaseRated` perfect | FOV +8°, slow-mo .6 (`requestTimeScale('perfect', .6, 100)`), trauma .08 | float `perfect` | `perfect` |
| `player:release` (other) | FOV +5° | — | `release` |
| `landed` | squash, dust | — | `land` |
| `padLaunch` | FOV +10°, trauma .35, burst | — | `pad` |
| `bounce` | buoy squash (.6, 120ms), ring splash ×8 | — | `bounce` |
| `geyser` | geyser column burst | — | `geyser` |
| `collect` | pickup hop, rarity burst, hit-stop, trauma by rarity | creature → hotbar, compact or big reveal if new | `collect(r)` then `creatureVoice(id,'pickup')` 120ms later |
| `carryFull` | — | hotbar FULL shake, toast warn "Hands full. Head home." (cooldown 2.5 s) | `ui.denied` |
| `deliver` | hops to pedestals; player deliver celebration | coin fly (bonus), toast good "+$N/s added" | `deliver`, then one `creatureVoice(id,'deliver')` for the rarest delivered |
| `chain` (≥ 2) | — | chain counter pop | `chainStep(n)` |
| `chainEnd` | — | counter exits; reason `sea`/`splash` shows "CHAIN LOST" in coral | `chainEnd` / `chainLost` |
| `closeCall` | trauma .2 | float `bonus`, banner "CLOSE CALL" | `closeCall` |
| `splash` | wave splash | flash; toast bad "The wave took 2 creatures" (with the optional ad slot, §10.7); practice: "SPLASH. FIRST ONE'S FREE." | `splash` |
| `respawn` (sea) | splash small at the fall point; player appears on the last island stood on | flash | `sea` |
| `zone` (first) | — | banner zone (rarity hue), course bar | `zone` |
| `waveWarning` | horizon wall rises, sky dims | banner "WAVE INCOMING" (golden: "GOLDEN WAVE"; big: "BIG WAVE"), meter warning | horn, music → hurry (loops until `surgeStart`) |
| `surgeStart` | storm mood, wave visual (crest per `big`) | meter surge | riser stops, crash, music → surge |
| `surgeEnd` | mood restores; cheer celebration if `survived` | toast "Fresh creatures washed up"; if `survived`: float "SURVIVED" | music → recover |
| ProgressEvent `questDone` | — | tracker complete, coin fly | `claim` |
| ProgressEvent `giftReady` | — | FREE tile badge, toast info "Free gift ready" | `giftReady` |
| ProgressEvent `unlock` | — | tile or tab pop, toast | `ui.open` |

---

## 6. Graphics upgrade list and performance budget

### 6.1 Budgets

| Tier | Target device | DPR cap | Draw calls (including shadow pass) | Triangles | GPU ms | CPU (JS) ms |
|---|---|---|---|---|---|---|
| Low | Old Android, Mali-G52 class | 1.0 | ≤ 70 | ≤ 100k | ≤ 10 | ≤ 5 |
| Medium (phone default) | Adreno 618 / Mali-G57 class, ≈ 0.5 MP | 1.25 | ≤ 100 | ≤ 150k | ≤ 11 | ≤ 5 |
| High (desktop default) | Integrated GPU laptop and up | `min(dpr, 2)` | ≤ 140 | ≤ 250k | ≤ 12 | ≤ 4 |

**Rules:**

- No per-frame allocations. Fix `camera.ts` (two `new Vector3` per frame) and `particles.ts` (`clone`, `new`, `shift`, `splice`): pool and swap-remove.
- No `EffectComposer` and no full-screen post passes. Keep `antialias: true`.
- The `?debug` overlay shows `renderer.info.render.calls`, triangles, frame ms and DPR.
- **Measure first.** On day 1 of Phase 1 the graphics team records the v0.1 draw calls, triangles and frame ms with `?debug` at three fixed camera spots (spawn, zone 3 mid-course, home during a surge) and writes them into `docs/perf-baseline.md`. If v0.1 already exceeds a tier's call budget, the budget table is revised with the lead before G13 work starts.
- **Creature draw-call plan (baseline, not stretch).** About 32 wild creatures are live at once (45 spawn points × .7). Per creature: body only (1 call; blink is in the vertex shader, §5.2). Shared: all glow discs in **one** InstancedMesh, all rare beams in **one** InstancedMesh, all billboards as sprites only within 15 m (at most 6 visible), outline hulls only within 40 m (at most 8). Beyond 80 m: body only, no billboard, no glow. Budget: ≤ 30 calls for creatures on Medium.

**Auto quality:**

- Start at Medium on `(pointer: coarse)` devices and High otherwise.
- **At runtime only the DPR adapts.** Changing tiers at runtime recompiles materials (shadows, outlines, defines), which freezes phones. Average frame time over 2 s windows:
  - If > 18 ms: lower DPR by .25 (floor .75).
  - If < 12 ms for 6 s: raise by .25 (up to the tier cap).
  - At most one change every 2 s.
- If DPR has been at the floor for 10 s and frames are still > 20 ms, **save** the next lower tier (`settings.autoTier`) to apply on the **next load**, and show nothing. A tier the player picks in Settings applies immediately (behind the open panel, followed by `compileAsync`).
- **Frame cap (time-based).** On Low and Medium, `render()` is skipped when less than 15 ms have passed since the last rendered frame (so 120 Hz renders at 60, 90 Hz at 60–90, never 45). The sim still steps on every rAF. High renders every rAF.
- **Shader warm-up:** after `buildWorld`, make every effect material visible once and `await renderer.compileAsync(scene, camera)` before `loadingStop()`.

### 6.2 Upgrade list (ordered by impact per hour)

| # | Change | Spec | Cost (Medium) |
|---|---|---|---|
| G1 | **Tone mapping and grade** (`render/tonemap.ts`) | Override the `CustomToneMapping` stub in `ShaderChunk.tonemapping_pars_fragment` before any compile (code below). `tonemap.ts` is a side-effect module; the lead makes `import './render/tonemap'` the **first import in `main.ts`**, before anything that can compile a shader (including the portrait `IconFactory`). Render targets are not tone-mapped by three.js, so portraits are rendered with their own light rig tuned 10% brighter to match; the small mismatch is accepted. `renderer.toneMapping = CustomToneMapping`, exposure 1.0. Sky, sea, foam and wave `ShaderMaterial`s must `#include <tonemapping_fragment>` before `<colorspace_fragment>`. Text sprites and labels use `toneMapped:false`. Fog colour = horizon colour after the grade. | ≈ 0 ms |
| G2 | **Lighting** | Hemisphere sky `#BFE3FF`, ground `#2F7FA0`, intensity 1.0. Sun `#FFF1D6`, intensity 2.8, direction `(-0.45, 0.8, 0.35)` normalised (the sky's sun disc uses the same vector). Target: side faces ≈ 60% of top brightness. `BoxBuilder` gets an `ao` option that darkens verts within .4 m of an island top by 20%. | 0 |
| G3 | **Shadows** (`render/shadows.ts`) | `shadowMap.type = PCFShadowMap` (r186: `PCFSoftShadowMap` is removed and PCF is already soft). The light follows the player with texel snapping (code below). Medium: 1024², HALF = 22 m. High: 2048², HALF = 35 m. Bias −.0004, normalBias .03, radius 3, `shadow.intensity` .62. **Casters:** player, carried, wild and pedestal creatures, hooks, palms, lighthouses, props. **Receivers:** terrain, pedestals, base mat. The sea doesn't receive. | 0.7–2 ms |
| G3b | **Blob shadows** (`render/blobShadows.ts`) | One InstancedMesh (max 64) of quads with a 64² radial `CanvasTexture`, `depthWrite:false`, polygonOffset. Each frame, raycast down to the ground height (`groundHeightAt`) or `waterHeight()`. `scale = lerp(1, .45, h/20)`, `opacity = lerp(.45, .12, h/20)`. Used on every tier for the player over water and for wild creatures. On Low it replaces real shadows. While airborne, a dashed landing ring (the guides mesh) marks the predicted landing point. | ≈ .05 ms |
| G4 | **Sea** (`render/water.ts`) | **Mesh** (no vertex swimming): a **world-locked square near grid**, 160×160 m, cells Low 2.5 m (64²), Medium 1.67 m (96²), High 1.25 m (128²). Its centre snaps to multiples of the cell size under the camera, so vertices never slide across the wave field. Around it, a flat far skirt (an annulus from the grid edge to 1400 m, 2 rings × 32 segments) at y 0 that uses the same fragment shader with amplitude 0. **Waves:** 3 world-space sum-of-sines (Gerstner Q .35), table below. Amplitude fades to 0 over the outer 20 m of the near grid. Export `waveHeight(x, z, t): number` (JS mirror) for floating creatures, foam and buoys. A term `uWaveFrontZ` raises a 1.5 m swell 30 m ahead of the surge front. **Fragment:** faceted normal `normalize(cross(dFdx(vWorld), dFdy(vWorld)))`; colour `mix(deep #0E63C9, shallow #25C4EC, smoothstep(−A, A, vH))`; fresnel `pow(1 − N·V, 4)` quantised to 3 steps toward horizon `#BFE9FF` (× .6); toon sun glints `step(.5, pow(N·H, 180)) × .85`; crest foam `smoothstep(.75, 1, vH/A)` × hash noise. Low drops glints and crest noise. | .5–1.5 ms |
| G5 | **Shore foam** (`render/shore.ts`) | Delete the white trays (`world.ts:83,112`). Build one merged rounded-rect band per island, 0–6 m out, with attribute `aDist` (0 at shore, 1 at the outer edge), displaced by `waveHeight + .03`. Inner turquoise halo `#7FF3E8` alpha `(1 − aDist) × .55`. Moving rings: `band = fract(aDist × 2.5 − t × .35)`; `ring = smoothstep(0, .08, band) × (1 − smoothstep(.12, .2, band)) × (1 − aDist)`; solid lip `1 − smoothstep(0, .12, aDist)`; white where `max(solid, ring) > .5`. Two passes in one material: an alpha-blended halo and alpha-tested foam. 1 draw call. | .1 ms |
| G6 | **Sky** (`render/sky.ts`, `render/clouds.ts`) | Gradient: zenith `#2A8CFF`, mid `#6CC6FF` at h .18, horizon `#BFE9FF`; below the horizon = far sea colour. Sun: `disc = smoothstep(.99863, .99919, d)` plus halos `pow(d, 400) × .5 + pow(d, 12) × .15`. Clouds: InstancedMesh of puffs (merged icosahedron clusters of 5–8 blobs with flattened bottoms), vertex colours white on top and `#D9E6FF` underneath. Counts: Low 12, Medium 24, High 40. Ring of 250–650 m around the camera, drifting 1–3 m/s, with wrap. **Delete** the box "mountains" and per-hook mini clouds (`world.ts:179`). (v2.1: 10 distant low-poly islands at 450–700 m and a volcano with smoke.) | .2 ms |
| G7 (P1) | **Islands** (`render/world.ts`, `render/props.ts`) | 2–4 offset ledge boxes per island (±.5–1.5 m) break the rectangles. A .15 m grass overhang lip with a darker underside. 8–12 grass drips. 3 rock strata bands (light, mid, dark of the zone rock colour). 2–4 boulders (.5–1.2 m) on cliff faces. A wet line: a .4 m band 25% darker at y 0–.4. A 2 m world-space grass checker ±3.5% on up-facing fragments (`onBeforeCompile`). **Edge lines** (Medium and High): `aFace = (u·w, v·h, w, h)` per vertex; `d = min(min(f.x, f.z − f.x), min(f.y, f.w − f.y))`; `line = 1 − smoothstep(0, fwidth(d) × 1.5, d − .03)`; darken albedo 25%. Zone props: exactly 2 per island, specified with sizes and colours in §5.2c, one merged mesh per zone. | +7 draws (props) +0 (edge lines are in the island shader) |
| G8 | **Home base** | Two-tier podiums: base 2.4×.35 `#ECE5D6` with darker sides; top 2.0×.2 in the zone colour with a gold `#FFC92E` trim; an additive rarity glow disc on top. Locked podiums show a `lock` billboard and a price chip "Unlock in Shop". A base floor mat of lighter tiles with a low post fence. A HOME arch over the path (2 posts, crossbar, board). A shop stall: red `#FF4D5E` / white striped awning made of alternating boxes, a counter, and a "SHOP" board. Walking into its trigger opens the Shop (needs `course.shopZone`, §10). The green upgrade arrow (C2) floats 1 m above the stall's board, bobbing .2 m at 1.2 Hz, while `cash ≥ cheapest upgrade`. **Remove** the salmon roof slab. | +2 draws |
| G9 | **Hooks and rope** | Faceted gold ring `TorusGeometry(.75, .2, 4, 8)` with an ink outline hull. It hangs from a 3-link box chain under a red/white striped buoy-balloon (bobbing). Locked hooks are slate with a `lock` sprite and a reach chip ("11.9 m"). The rope uses the braided stripe skin (`#D9A35F` / `#B07A3A`) by default. | +2 draws |
| G10 (beam and pad pulse P0; deck, railing and taper v2.1) | **Lighthouses** | Taper 7% per band, gallery deck with a railing ring, emissive yellow lantern room, dark 4-sided cone roof. Rotating additive beam cone with vertical alpha falloff (§5.2). Pads: scrolling chevron texture (canvas-generated) and ring pulses. | +2 draws |
| G11 | **Wave** (`render/waveVisual.ts`) | Peak crest **12.5 m** (the sim crest is 10; lighthouse tops at 14 must visibly stay dry). A **Big Wave** (§9.0) uses the sim crest 12 and a visual crest of **13.2 m**, plus a second spray row; lighthouse tops still stay dry. Curling lip vertex animation `sin(x×.15 + t×2) × .8` plus noise. Vertex gradient: deep `#0B4FA8` at the bottom, mid `#3FD8FF`, white foam crest. Opaque, with a fresnel-like rim lighten (no transparency sorting). Large soft white spray sprites (additive, instanced) replace the foam cubes. A churning foam band on the water at the foot. **Warning:** the mesh appears at `startZ` with scale y .15 growing to 1 over the 8 s, a dark line rising on the horizon. **Storm mood** (`moodT` 0 → 1 over 1500ms at `surgeStart`, back over 3000ms after `surgeEnd`): sky zenith → `#3D5F93`, sun × .6, fog → `#9BB8D6`. Golden variant: gold palette plus sparkles. | ≈ .3 ms |
| G12 | **Character** (`render/character.ts`, `render/faces.ts`) | Head .66 → .78. Darker sleeve band. Face decal plane on the head front with expression swaps (§5.2). Ink outline hull via `BoxBuilder.outline(.04)`: the same boxes grown by .04 and rendered `BackSide` in `MeshBasicMaterial` with `color: #1B1736`. Creatures and the player use `MeshToonMaterial` with a 3-texel `NearestFilter` gradient map `[.6, .85, 1]`. Terrain stays Lambert. | +2 draws |
| G13 | **Creatures** (`render/creatureMesh.ts`, `render/creatures.ts`) | Wild scale × 1.5; pedestal × 1.3. Outline hull. Bigger eyes with a 1-texel white highlight block and a brow box. **Mutations:** Gold = a warm generated matcap (canvas) multiplied into the toon colour; Diamond = cyan fresnel rim plus twinkle sparkles; Rainbow = hue scroll along y plus a sparkle trail. Replace the grey ring with an additive radial glow disc in the rarity colour. The rare beam becomes a vertical gradient-alpha additive beam, slowly rotating. Legendary+ also gets a ground ring pulsing outward every 1200ms. **Billboards** (`render/billboards.ts`, canvas sprites in Lilita One, cached per species+mutation): wild creatures show name plus rarity (faded in within 15 m). Pedestals show 3 lines: name (white 30px), rarity (rarity colour; gradient for Legendary+), "$1/s" (`#7DFF5A`, 40px), with a thick ink stroke. Moves the wild, carried and base visual code out of `Game.ts`. The draw-call plan in §6.1 is the baseline. Gold mutation: `MeshToonMaterial` has no matcap slot, so the matcap is injected with `onBeforeCompile` (one shared material per mutation). Stretch: creatures in 4 `BatchedMesh`es (one per mutation material). | ≤ 30 draws for creatures |
| G14 | **Particles** (`render/particles.ts`) | Preallocated pool, swap-remove, no allocation in `burst()`. A second additive InstancedMesh (`depthWrite:false`) for sparkles and stars. Caps: Low 150, Medium 300, High 500. | ≤ .3 ms CPU |
| G15 | **Guides** (`render/guides.ts`), tutorial world indicators | Chevron trail: InstancedMesh (max 40) of additive chevron quads 1 m apart along a polyline, with a brightness wave toward the target at 2 m/s; re-pathed when the spec changes. Bouncing 3D arrow: a blocky gold arrow (`#FFC92E` with an ink hull), bobbing .5 m at 1.25 Hz and spinning .8 rad/s, 2.5 m above the target. Landing arc: 20 instanced dots; ok = solid `#46D46A` spheres (.18) ending in a ring; bad = hollow `#FF4D5E` rings. Light beam: additive cylinder 30 m tall, radius 1.2, alpha falloff upward, colour `#FFF2A8`. Pulsing ring decal: radius configurable, scale 1 → 1.15 at 1.5 Hz, with an optional label sprite (e.g. "JUMP HERE", "LAUNCH"). Hook highlight: emissive gold pulse plus a floating tag sprite. | ≤ 5 draws (only in the FTUE) |
| G16 | **Speed lines and swing ribbon** | See §5.2. The ribbon is the default white "Breeze" only (trail cosmetics are v2.1). | 2 draws |
| G17 | **Cold-open wave** (`render/coldOpen.ts`) | On the first frame of a session (FTUE or not), a decoy wave crashes over a far decoy island on the horizon, 260 m out at yaw +25° from the camera's forward. Timeline: 0–600ms the wall rises (reuses the wave mesh at 40% scale), 600–1400ms it curls and breaks over the island, spray sprites ×2, 1400–3000ms foam fades. Trauma .15 at 900ms (reduce motion: 0). Audio plays `horn` at 300ms and a distant `splash` (lowpassed 800 Hz, −10 dB) at 900ms. Non-blocking: input is live throughout. Triggered by `gfx.playColdOpen()` from the lead. | +1 draw for 3 s |
| G18 | **Gameplay objects** (§9.0) | **Bounce buoy:** red/white striped cylinder r 1.4 m, h 1.2 m, white top disc with a coral ring, ink outline hull, bobbing ±.12 m at .9 Hz (from `waveHeight`); squash .6 → 1 over 120ms on `bounce`. **Drifting hook:** the hook's chain is drawn to a small blue rail box (length = 2 × amplitude + 1 m) at the anchor's height + 1.5 m, so players see the path. **Geyser:** a dark rock ring r 1.5 m with a vent; 1000ms before eruption, bubbles (8 white particles/s) and a ring decal pulsing at 4 Hz; eruption: a white-blue column (additive cylinder r .9, height 0 → 9 m in 150ms, hold 1.8 s, collapse 300ms) with spray. | +3 draws |

**Tone-mapping code (G1):**

```ts
ShaderChunk.tonemapping_pars_fragment = ShaderChunk.tonemapping_pars_fragment.replace(
  'vec3 CustomToneMapping( vec3 color ) { return color; }',
  `vec3 CustomToneMapping( vec3 color ) {
     color = NeutralToneMapping( color );
     float l = dot( color, vec3( 0.2126, 0.7152, 0.0722 ) );
     color = mix( vec3( l ), color, 1.12 );
     color *= mix( vec3( 0.95, 1.0, 1.07 ), vec3( 1.04, 1.0, 0.95 ), smoothstep( 0.15, 0.8, l ) );
     return clamp( color, 0.0, 1.0 );
   }`);
```

**Shadow follow code (G3):**

```ts
const SUN = new Vector3(-0.45, 0.8, 0.35).normalize();
const rot = new Matrix4().lookAt(SUN, new Vector3(), new Vector3(0, 1, 0)), inv = rot.clone().invert();
function followShadow(focus: Vector3) {
  p.copy(focus).applyMatrix4(inv);
  p.x = Math.round(p.x / texel) * texel; p.y = Math.round(p.y / texel) * texel;
  p.applyMatrix4(rot);
  sun.target.position.copy(p); sun.position.copy(p).addScaledVector(SUN, 70);
}
```

The `sun.target` must be added to the scene.

**Sea waves (G4):**

| λ (m) | k | ω (rad/s) | Amplitude (m) | Direction (deg) |
|---|---|---|---|---|
| 18 | .349 | 1.85 | .35 | 20 |
| 9 | .698 | 2.62 | .18 | −35 |
| 4.5 | 1.396 | 3.70 | .08 | 75 |

### 6.3 Quality settings

| Setting | Low | Medium | High |
|---|---|---|---|
| DPR cap | 1.0 | 1.25 | `min(dpr, 2)` |
| Shadows | Blob only | PCF 1024, ±22 m | PCF 2048, ±35 m |
| Water mesh | 48×64, no glints or crest noise | 64×96 | 96×128 |
| Shore foam | Solid lip only | Full | Full |
| Edge lines | Off | On | On |
| Outlines | Player only | Player and creatures | Plus targeted hook |
| Clouds | 12 | 24 | 40 |
| Particle cap | 150 | 300 | 500 |
| Creature outlines / billboards range | none / 10 m | 40 m / 15 m | 60 m / 20 m |
| Trail / speed lines | On / off | On / on | On / on |
| Zone props (P1) | Off | On | On |
| Render cap | ≥ 15 ms between frames | ≥ 15 ms | Native |

The Settings menu exposes **Auto / Low / Medium / High** (§9.6).

---

## 7. Beginner tutorial (FTUE)

### 7.1 Principles

- **Soft and in-world.** The game never pauses, except the slow-mo in step 2 (`release`).
- **The threat is visible from second 1.** The cold-open wave (G17) crashes on the horizon at spawn, and the wave meter is on screen from the first frame (as `WAVE PAUSED` while frozen). The wave unfreezes when the player first carries creatures home (step `home`), so the first carry is tense.
- **Teach by doing.** No rule cards or text-only explainers mid-run. The only explainer cards are the one-time panel coach cards (C21), shown while the game is paused anyway.
- **One objective prompt** and **one world indicator** at a time. Banners and the objective pill never show together: the pill hides while a banner is up.
- **Completion is immediate.** Each step completes the moment its condition is true, even before its prompt has appeared, so fast players flow through.
- **Glyphs follow the last input device.** Movement keys are read by `KeyboardEvent.code` and drawn as W/A/S/D with arrows faded behind, so AZERTY's ZQSD works physically. Letter hotkeys (U, G, I, L, P, M) are read from `KeyboardEvent.key` (case-insensitive), so they match the printed keycap on any layout.
- **Every audio cue has a visual twin.**
- **No midgame ads until the FTUE is done.**
- **Targets:** first grab ≤ 8 s, land on island 1 ≤ 13 s, first creature ≤ 22 s, first delivery ≤ 45 s, first purchase ≤ 60 s, FTUE done ≤ 2:00.
- **Who sees it:** players with no save, or a v1 save without `flags.delivered || flags.bought` (a player who only swung once still gets the tutorial). Other v1 players are marked `ftue.done` by the migration.

**Objective pill** (owned by the tutorial team's `src/tutorial/overlay.ts`, styled with §2 tokens):

- Height 56 (phone 46), radius 999, `--card` background, 4px ink border, lip 5px.
- Layout: `[glyph area 64px][headline Lilita 26 in --text-ink][optional sub-line Fredoka 600 15 in --text-muted]`.
- Placement per §4.
- New step: the pill pops in (`scale .8 → 1.05 → 1`, 240ms) with sfx `tutorialStep`.
- Step complete: a green `check` stamp over the pill (1.4 → 1, 200ms), then the pill exits (160ms) with sfx `tutorialDone`.
- **Fail variant:** sun-orange border `#F39A12` plus a ±6px shake 3× over 240ms.

**Glyph components:**

- **WASD cluster:** 4 keycaps; the target key pulses down every 800ms.
- **SPACE keycap hold loop:** down at 0–120ms → fill bar sweeps 120–1100ms → hold → up at 1300ms; 1600ms loop.
- **Ghost thumb** (touch), 72px `thumb` icon at 75% opacity:
  - drag: translate (0,0) → (0,−60) over 900ms, fading over the last 150ms, 1400ms loop;
  - press-hold: press at 200ms with `translateY(6) scale(.9)`, a ring fills 0 → 100% over 1000ms, lift at 200ms; 1800ms loop.
- **Spotlight:** a `.spot` div over the target rect padded by 10px, radius = target radius + 8, `box-shadow: 0 0 0 9999px rgba(10,8,32,.5)`, `pointer-events:none`, so everything stays clickable. A `.spot-ring` (4px `--sun` border) pulses scale 1 → 1.12 and opacity 1 → 0 over 1200ms in a loop. A pointing `hand` icon (64px) at the target's bottom-right taps: `translate(0,0) → (−6,−10) scale .92 → back`, 900ms loop. The rect follows `getBoundingClientRect()` every frame.

**Skip and replay:**

- "Skip tutorial ›" (C1 tertiary link at the `skip` slot) is visible in every step.
- Skipping at any step:
  - sets `ftue.done = ftue.skipped = true`;
  - grants any of the $20 + $20 + $50 step rewards not yet received;
  - unfreezes the wave with `timer = max(remaining, 45)` and ends the practice wave;
  - reveals all FTUE-hidden HUD;
  - puts Voyage on its next uncompleted quest.
- Settings → "Replay tutorial" resets `ftue.step = 'grab'`, respawns the player at the FTUE spawn and replays. It grants no rewards a second time (`ftue.rewarded` flags).

### 7.2 Step table

Notation: **D** = desktop text, **T** = touch text.

**Spawn.** The FTUE (and every new session) spawns the player at `course.ftueSpawn` = (0, HOME_TOP, HOME_FRONT_Z + 4) = z 6, about 4 m from the home front edge, facing the gap-1 hook. The camera starts behind the player at yaw toward the first hook and pitch 8° down, framing the hook, the rope's arc, island 1 and the horizon where the cold-open wave breaks (§6.2 G17). This is also the thumbnail composition (§10.7).

| # | Id | Trigger | Completes when | Prompt | World indicator | HUD state | Reward (Voyage #) |
|---|---|---|---|---|---|---|---|
| 1 | `grab` | FTUE start | `grab` event | D: "RUN + JUMP + HOLD", SPACE hold-loop glyph, sub "Hold to grab the hook". T: "RUN + HOLD JUMP", ghost thumb press-hold on the real JUMP button and a pulsing ring around it. If there is no movement input after 2000ms, the WASD cluster (D) or the joystick ghost-thumb drag (T) is added to the glyph area. | Ring at the edge labelled "JUMP HERE"; gap-1 hook: emissive pulse, sparkles, floating tag "HOLD" | Wave meter visible as **WAVE PAUSED** (`frozen`). Cash, rail, course bar, tracker, pearls hidden. Carry visible. | $20 (V1) with a coin burst from the reticle position. The cash pill pops into view. |
| 2 | `release` | `grab` during swings 1–3 | `release` followed by `landed` on any island ahead | Outside the window: small "WAIT… SWING UP". Inside: "LET GO". D: SPACE keycap pops up with speed lines. T: JUMP relabels to LET GO and flashes; the ghost thumb lifts. | Landing arc (§7.3); soft vignette while slowed | Same | $20 (V2) plus stamp "NICE SWING", 30 confetti, `tutorialDone` |
| 3 | `collect` | First `landed` on island 1 | Carry 2/2, or 8 s after the first collect | "GRAB TOASTOPUS" with the creature portrait, sub "Walk into it". After 1: "GRAB ONE MORE 1/2". | Bouncing 3D arrow over Toastopus; short chevron trail | Same | — (the creatures are the reward) |
| 4 | `home` | Step 3 done | `deliver` event | "TAKE THEM HOME" plus a live distance chip ("24 m"). At the same moment the meter **unlocks** (chain drops, C15) and the tutorial issues `setWaveTimer(60)`; `practiceWave` turns on. | Chevron trail to the island edge → arc preview to the gap hook → trail to the first empty pedestal. Pedestal glow plus a bouncing arrow. Edge arrow (C23, `home`) when home is off-screen. Swing #2 uses the 0.5× assist. | Wave meter live; course bar slides in. | $50 (V4), coin fly from the pedestals, confetti 40 |
| 5 | `earn` | First `deliver` | Automatically after its banner (2500ms) | Banner "THEY EARN CASH" with sub "Even while you're away" (the pill is hidden while the banner shows) | Creatures hop to pedestals; `income` floats; pedestal coin pops start | Income chip pops in under cash | — |
| 6 | `shop` | Step 5 done (cash ≥ $40 is guaranteed) | Any purchase | "OPEN THE SHOP". D: keycap U. T: no glyph. After 3000ms without opening: spotlight plus hand on the Shop tile (desktop: hand plus keycap U next to it). Inside the Shop: "BUY ROPE REACH" with a spotlight on the Rope Reach BUY button and `Hud.setFocus({ panel:'shop', tab:'upgrades', rowKey:'reach', note:'UNLOCKS ZONE 2', sub:'Longer rope reaches farther islands', dimOthers:true })` (via `TutorialFrame.focus`). | — | The Shop tile pops into the rail (§4.4). The upgrade arrow shows on it. | $40 refund (V5). Banner "ROPE REACH UP" with sub "Coral Reef unlocked". Coral Reef hooks change from locked to glowing; zone 2 on the course bar lights up. The Shop auto-closes after 1200ms and `setFocus(null)`. |
| 7 | `wave` | Step 6 done **or** `waveWarning`, whichever is first | `surgeEnd` | If the timer shows more than 30 s, the tutorial issues `setWaveTimer(30)`; it never raises it. "GRAB MORE, BEAT THE WAVE". At warning: "WAVE. GET SAFE." with one arrow to the nearer safe spot plus an ETA chip ("Pad 2 s"). On the pad: stamp "LAUNCH". | Island-2 lighthouse (Shallows): light beam plus a pad ring labelled "LAUNCH". A guaranteed Common next to the pad. | Meter in its normal phases | V6 = 2 min, on survival or splash |
| 8 | `ready` | Step 7 done (and step 6, if it was interrupted) | Automatically | Banner "YOU'RE READY" with sub "Swing farther. Catch rarer." (1800ms), **then** the Controls card (the same card as Settings → Help, C21 styling at 360×140) for 4000ms or until tapped. | — | Tracker appears showing Voyage 7/12; Index and FREE tiles pop in; Index has a NEW badge | Sets `ftue.done = true`. The normal 70 s wave cycle resumes. |

**Interrupted shop step.** If `waveWarning` fires before any purchase (slow players), step 7 starts immediately; step 6's prompt is suspended and resumes after `surgeEnd`, then step 8 follows the purchase.

**Practice wave** (`SimOverrides.practiceWave`, on from step 4 until the first `surgeEnd`): if splashed, the player **keeps** carried creatures. The `splash` event carries `practice: true`; the creatures visibly float off the player for 900ms, then snap back with a pop (graphics), loudly (`splash` plus `ui.open`). Pill "SPLASH. FIRST ONE'S FREE." with sub "Next wave takes what you carry." There is **no rule card**.

**Step 1 failures:**

- Jumped without holding and fell in the sea: the player respawns at the home edge (the home island is the last island stood on). Fail pill "HOLD IT" with sub "Keep holding JUMP".
- At the edge for 6000ms without jumping: the glyph scales to 130% and a 3D arrow from the edge points at the hook.

**Step 2 failures:**

- The window passed without a release: "AGAIN" with sub "Let go on the upswing". The pendulum continues, so the window reopens.
- Two passes without the window ever opening: "PUMP". D: sub "Hold W to swing higher" with a W keycap. T: sub "Push the stick forward" with a thumb push-up glyph.
- Released early and fell: "SO CLOSE" with sub "Wait for the green arc". The player respawns on the last island stood on (§9.0 rule), not at home.

**Step 3 setup.** On entering the FTUE, island 1 (zone 0, order 1) always spawns both of its spawn points (`forceSpawn`). The spawn point nearest the gap-1 landing gets a normal Toastopus (ideally about 3 m from where players land). The other spawn point gets a random Common.

**Step 3 stuck hint.** After 8000ms without progress, the trail pulses at 2× speed and the camera nudges its yaw 15° toward the creature over 600ms (skipped with reduce motion).

**Step 4 stuck hint.** After 10000ms without the home distance decreasing, the edge arrow pulses and the pill re-pops.

**Step 6 fallback.** If the player leaves home without buying, drop the spotlight; the upgrade arrow stays on the Shop tile. The step completes later on any purchase.

**Wave rules during the FTUE:**

- `SimOverrides.waveFrozen` is true in steps 1–3, false from step 4 on.
- Timeline for a typical player: step 4 starts at about 22 s with 60 s on the timer; home by about 40 s; earn and shop take about 20 s (the sim pauses while the Shop is open); step 7 caps the remaining time at 30 s; the surge then needs about 17 s more to reach the Shallows.
- Warning telegraphs: horn, meter shake, coral edge vignette, sky dim, horizon wall.
- Survived (`surgeEnd` with `survived: true`): banner "YOU SURVIVED", 60 confetti, the player's cheer celebration.
- **Consequence preview:** the camera stays player-controlled, but the wave visibly washes the creatures off islands (existing `washed` bursts, ×1.5 size during the FTUE).

### 7.3 Release timing assist

**Window** (computed at 20 Hz while swinging, in `src/tutorial/core.ts`, using `predictRelease()` from `src/game/predict.ts`, which steps at the sim's own 1/120 s). All three must hold:

1. **Forward:** `dot(vel_h, anchor_h − lastGroundCentre_h) > 0`.
2. **Rising:** `vel.y > 0`.
3. **Landing:** `predictRelease(...)`'s first contact is the top of a solid other than the one last stood on, with `landsOn.kind !== 'tower'` unless it's a lighthouse platform.

**Support by swing count** (the count is persisted per session):

| Swing | Time scale inside the window | Landing arc | "LET GO" pill |
|---|---|---|---|
| 1 | 0.25× | Yes | Big (Lilita 34) |
| 2 (return trip) | 0.5× | Yes | Normal |
| 3 | 1× | Yes | Small (Lilita 20) |
| 4+ | — | Off | Off |

**Time-scale curve.** The tutorial requests its scale through `TutorialFrame.timeScale` (the lead forwards it to the arbiter as id `'tutorial'`). Ease to the target over 120ms real time. Hold for at most 1200ms real. Snap back to 1 over 100ms on release or when the window closes. The lead multiplies frame `dt` by the arbiter's scale **before** the fixed-step accumulator; camera, UI and audio keep real dt. While slowed, music lowpass goes to 700 Hz (§8.5) and the vignette (`--vig: rgba(20,40,90,.35)`) fades in.

**Landing arc:** 20 points, sampled from the predicted trajectory at equal time steps up to the first contact.

**Struggle assist** (any time, including after the FTUE, if Settings → Swing Assist is on, the default): 3 sea falls in a row on the same gap re-enable the arc plus 0.5× slow-mo for the next 2 swings on that gap, with toast info "Let go on the upswing".

### 7.4 Contextual hints after the tutorial (`src/tutorial/hints.ts`)

Hints are toasts (C8). Each shows once unless a cooldown is listed, never while another toast shows, and never during a surge unless it is wave-related. Shown hints are stored in `hintsSeen: string[]`.

| Id | Trigger | Toast (variant) | Extra indicator |
|---|---|---|---|
| `lockedHook` | First time within 16 m of a hook above the player's reach | "Needs Rope Reach 11.9 m" (warn), with a `lock` icon. Tapping it opens the Shop on Rope Reach. | Reticle locked state |
| `handsFull` | Carry full and away from home for 5 s (cooldown 120 s) | "Hands full. Head home." (warn) | Edge arrow to home for 5000ms |
| `baseFull` | First delivery with every pedestal full | "Base full. Extras sold for 30 s of cash." (info) | Pedestals card highlighted next time the Shop opens |
| `dragToLook` | 20 s after step `release` completes with no camera input yet (FTUE or not) | Objective-pill-styled prompt for 4000ms: "DRAG TO LOOK" with the `hand` icon doing a left-right drag loop (desktop: over the screen centre; touch: over the right half) | None |
| `doubleJump` | First time the player is airborne with `vel.y < 0`, more than 1.5 m above the ground, not swinging, after `ready` | "Tap JUMP again in the air" (info), touch; "Press SPACE again in the air" (info), desktop | None |
| `lighthouse` | First time within 12 m of a lighthouse pad in the calm phase, after `ready` | "Step on the pad to launch up" (info) | Pad ring pulses ×2 for 3 s |
| `bounce` | First time a Bounce Buoy saves a fall | "Buoys bounce you back up" (good) | None |
| `goldenNext` | First time the next wave is Golden | "Golden wave next. Rarer creatures after it." (info) | Gold meter |
| `firstMutation` | First Gold, Diamond or Rainbow collected | "DIAMOND. Earns ×4." (good), with the mutation name and multiplier | Compact reveal |
| `seaFalls` | 3 sea falls in a row on one gap | "Let go on the upswing" (info) | Assist (§7.3) |
| `welcomeBack` | Returning session | Welcome card (§9.2), not a toast | — |
| `rebirthReady` | Rebirth affordable for the first time | "Rebirth ready: ×1.5 cash forever" (good). Tapping it opens the Shop's REBIRTH tab. | Rebirth tile appears with a shine |
| `idle` | 20 s on an island with no input | None | The next objective indicator pulses |
| `chainIntro` | First chain of 3 or more | "Chain hooks without stopping for bonus cash" (info) | Chain counter |
| `coach:<panel>` | First open of Index, FREE, Locker tab, Rebirth tab | Coach card (C21), not a toast | — |

`shopNudge` from revision A is removed: the upgrade arrow (C2) shows immediately instead. P0 hints: `lockedHook`, `handsFull`, `seaFalls`, `rebirthReady`, `dragToLook`, `doubleJump`, `lighthouse`, coach cards. The rest are P1.

### 7.5 Measurement

- **`?debug` FTUE timeline overlay:** per-step elapsed time, sea falls per step, timed hints fired and swing count. The log is mirrored to `localStorage['sos-ftue-log']`, capped at 20 sessions.
- **Bot test:** extend `tests/bot.ts` to play the FTUE start to finish in sim (no DOM), driving `TutorialCore` only (the DOM overlay is not loaded in vitest's `node` environment). It must reach `ftue.done` within 150 s of sim time.
- **Playtest targets:** see §7.1. Also: ≤ 1 sea fall on gap 1, < 10% skip rate.

---

## 8. Audio

### 8.1 Architecture (`src/audio/*`)

```
voices → layerSum → musicLP (Biquad lowpass) → musicBus → duck ─┐
sfx voices → sfxBus ──────────────────────────────────────────┤
ui voices → uiBus (inside sfx) → sfxBus                         ├→ master → limiter → destination
surf/wind/rumble → ambBus ─────────────────────────────────────┘
limiter = DynamicsCompressor(threshold −6 dB, knee 6, ratio 12, attack 3 ms, release 200 ms)
       → ceiling gain 0.89 (−1 dBFS) → destination
```

**Shared resources**, created once at unlock (≈ 0.6 MB RAM, ≈ 5 ms CPU):

- 2 s white noise, 6 s brown noise (drift-corrected), 4 s pink noise (Kellet);
- `TANH_CURVE` (1024 samples of `tanh(2x)`).

No convolver and no Karplus-Strong buffers in v2.0 (CPU and node churn on mobile Safari). Reverb is the dub echo only.

**Voice cap.** At most **24** concurrently sounding voices (a "voice" = one note or one SFX layer with its own nodes). `engine.ts` keeps a pool count; when a new voice would exceed the cap, the oldest non-music-bass voice is released over 15 ms. On the Low quality tier, the cap is 16, conga layers are never scheduled and only 1 surf instance runs. Nodes are disconnected in `onended`, never left in the graph.

**Loudness acceptance.** In a 2-minute capture covering a surge, a reveal and a buy: the master never exceeds **−1 dBFS** peak (the ceiling gain after the limiter guarantees it; the limiter should rarely exceed 4 dB reduction). SFX stingers sit **3–6 dB above** the music at default volumes (checked with the meter in `?debug`). On a phone speaker, the bass stays audible (its `tanh` saturation adds harmonics above 200 Hz) and the kick's knock is audible.

### 8.2 Mixer defaults

| Bus | Gain | dB | Notes |
|---|---|---|---|
| master | 0.8 | −1.9 | Into the limiter |
| music | 0.25 | −12.0 | 0.30 (−10.5) during surge. Panel open: −3 dB plus lowpass 1800 Hz. |
| sfx | 0.9 | −0.9 | Per-voice peaks .07–.5 |
| ui (inside sfx) | 0.2 | −14 | Clicks, tabs, toasts |
| ambience | 0.18 | −14.9 | Surf 0 dB, wind 0 to −6, gulls −12, rumble 0 to −4 |
| duck node | 1.0 | 0 | −5 dB (×.56) on collect, deliver, zone, warning, reveal and buy stingers; −8 dB (×.4) on splash. Attack τ 30ms, hold 250ms, release τ 350ms. Always `cancelScheduledValues` before re-triggering. |

**Levels inside music:**

| Voice | dB | Voice | dB |
|---|---|---|---|
| bass | 0 | marimba | −8 |
| kick | −3 | pad | −10 |
| lead | −4 | conga | −12 |
| pluck / skank | −8 | hats | −16 |
| shaker | −18 | glockenspiel | −10 |

**User volume.** Settings sliders run 0–100. **Defaults: Music 50, Sound 80** (synth loops tire fastest, and players who mute usually mute music; SFX carry the polish). `busGain = design × (v/80)²`, so 100 gives 1.56× design, 50 gives .39× and 0 is silent. "Music" scales the music bus. "Sound" scales the sfx and ambience buses.

**Muting.** The quick mute button sets `settings.muted`, which zeroes the master bus. Always ramp gains with `setTargetAtTime`; never assign `.value` while playing.

### 8.3 Music

**Style.** Original "island pop": calypso 3-3-2 bass, reggae off-beat ukulele skank, steel-pan or marimba lead, shaker, half-time kick. 56% swing on 16ths in calm play; straight in danger sections.

**Clock** (`music.ts`, `MusicClock`): lookahead scheduler.

- A `setTimeout` every 25 ms schedules up to 150 ms ahead on `ctx.currentTime`.
- If the clock falls more than 50 ms behind, it resyncs instead of bursting.
- Tempo changes are queued in `pendingBpm` and applied at bar lines.
- `nextBeat()` provides quantised horizontal switches.
- `ctx.suspend()` freezes it, so it resumes in place.

**Tempos and keys:**

| Section | BPM | Key | Feel |
|---|---|---|---|
| Song 1 "Lagoon Loop" | 112 | F major (transposed per cycle: 0, +2, −2 → F, G, Eb) | Calypso half-time |
| Song 2 "Coconut Run" (v2.1) | 118 | F major (same rotation) | Soca four-on-the-floor |
| Song 3 "Reef Night" (v2.1, zones 5–7) | 108 | D Dorian | Sparse, kalimba lead with echo |
| Hurry (warning) | 124 | D minor | Straight. **Loops** in 1-bar units until the sim's `surgeStart` event |
| Surge | 128 | D minor | Straight |
| Phew (stinger after `surgeEnd`) | 112 | F major | 1 bar |

**Song choice (v2.0).** Song 1 every cycle, transposed per cycle (F, G, Eb) and with the seeded variations below, so repeats don't sound identical. **Every 2nd cycle**, after recover, play 8–16 s of ambience only before the song restarts. (v2.1 adds Songs 2 and 3 in rotation; their leads must be **hand-written 8-bar hooks** like Song 1's, with the seeded RNG used only for variations.)

**Music never schedules against the wave.** The song form is not aligned to the wave cycle (the first wave is at 90 s, surges take about 17 s or more, panels and slow-mo stretch sim time, and the FTUE sets its own timer). Section changes are driven only by sim events: `waveWarning` → hurry on the next beat; hurry loops until `surgeStart`; the riser runs from `waveWarning` and is **cut at `surgeStart`**, where the crash plays (unquantised) and surge starts on the next beat; `surgeEnd` → phew.

**Chord voicings** (close voicing for pluck, pad and marimba; bass = root and fifth):

| Chord | Voicing | Bass root / fifth |
|---|---|---|
| F | C4 F4 A4 C5 | F2 / C3 |
| C | C4 E4 G4 C5 | C3 / G2 |
| C7 | C4 E4 G4 Bb4 | C3 / G2 |
| Dm | D4 F4 A4 D5 | D2 / A2 |
| Bb | D4 F4 Bb4 D5 | Bb2 / F2 |
| Gm | D4 G4 Bb4 D5 | G2 / D3 |
| Am | C4 E4 A4 C5 | A2 / E2 |
| A7 | C#4 E4 G4 A4 | A2 / E2 |
| G (Dorian IV) | D4 G4 B4 D5 | G2 / D3 |

**Forms** (32 bars, one chord per bar, AABA, ≈ 68.6 s at 112 BPM; the length is not tied to the wave):

| Song | A (8 bars, played twice) | B (8 bars) | A'' (8 bars) |
|---|---|---|---|
| 1 | F C Dm Bb, F C Bb C | Bb F Gm C, Bb F Gm C7 | F C Dm Bb, F C Bb F |
| 2 (v2.1) | F Dm Gm C, F Dm Gm C | Am Dm Bb C, Am Dm Bb C7 | F Dm Gm C, Bb C F F |
| 3 (v2.1) | Dm G Dm G, Dm G Dm G | Bb C Dm Dm, Bb C A7 A7 | Dm G Dm G, Bb C Dm Dm |
| Hurry | Dm C Bb A7 (loop) | — | — |
| Surge | Dm Bb C A7 (loop) | — | — |
| Phew | F major arpeggio F4 A4 C5 F5 (8ths), then the next song's bar 1 with drums out for 2 bars | — | — |

**Song 1 A-section lead** (steel pan, or marimba in zones 1–2). Format: `step16:note:length16`.

| Bar | Chord | Notes |
|---|---|---|
| 1 | F | 0:C5:3, 3:A4:3, 6:F4:2, 8:G4:2, 10:A4:4, 14:C5:2 |
| 2 | C | 0:D5:3, 3:C5:3, 6:G4:2, 8:C5:6 |
| 3 | Dm | 0:D5:2, 2:F5:2, 4:D5:2, 6:C5:2, 8:A4:4, 12:C5:2, 14:D5:2 |
| 4 | Bb | 0:F5:6, 6:D5:2, 8:Bb4:8 |
| 5 | F | same as bar 1 |
| 6 | C | 0:D5:3, 3:C5:3, 6:E5:2, 8:G5:6 |
| 7 | Bb | 0:F5:3, 3:D5:3, 6:Bb4:2, 8:C5:4, 12:D5:4 |
| 8 | C | 0:C5:8, 10:G4:2, 12:A4:2, 14:Bb4:2 (pickup) |

- **B sections:** no lead. The marimba plays 8th-note arpeggios of chord-tone indices `[0,1,2,3,2,1,0,1]`.
- **Songs 2 and 3 leads (v2.1):** hand-written 8-bar hooks, to be added to this table before they are built. Not generated.
- **Hurry lead:** a 16th-note arpeggio of chord tones in octave 5, accents on `[0,3,6,8,11,14]`.
- **Variation on repeats** (seeded): 15% add a 16th grace note one scale step above; 10% drop a non-downbeat note; 20% per phrase play bars 5–6 an octave up; velocity .85–1.0 with an accent on beat 1.
- **Fills** on the last 2 beats of every 4th bar: one of 4 options (conga run, marimba run down, woodblock triplet, rest).
- **Humanise** percussion only: ±6 ms timing and ±12% velocity.

**Patterns** (16 steps; numbers are velocity):

```
calm.kick    [.8,0,0,0, 0,0,0,0, .55,0,0,0, 0,0,0,0]
calm.shaker  [.5,.2,.35,.2] ×4
calm.wood    [0,0,0,0, .35,0,0,0, 0,0,0,0, .35,0,0,0]
calm.bass    steps {0:root,3:root,6:fifth,8:root,11:oct,14:fifth}, length 2 sixteenths
calm.skank   [0,0,.7,0, 0,0,.6,0, 0,0,.7,0, 0,0,.6,0]  (up-strums; down-strum .8 on step 0 every 2nd bar)
soca.kick    [.8,0,0,0, .7,0,0,0, .8,0,0,0, .7,0,0,0]   soca.clap [0,0,0,0,.6,0,0,0,0,0,0,0,.6,0,0,0]
build.hats   [0,0,.5,0] ×4      build.congaHi [0,0,0,.6, 0,0,0,.5, 0,0,0,.6, 0,0,.4,.5]   build.congaLo [0,0,0,0, 0,0,.7,0] ×2
hurry.kick   [.9,0,0,0, .8,0,0,0] ×2   hurry.clap [0,0,0,0,.7,0,0,0] ×2   hurry.hats [.5,.25,.35,.25] ×4
hurry.bass8  root root oct root root root oct root (8ths)   hurry.stabs [0,0,.6,.4] ×4
```

**Instrument recipes** (`instruments.ts`). τ is the `setTargetAtTime` decay constant; stop each voice at attack + 7τ.

| Instrument | Recipe |
|---|---|
| **Steel pan** | Sine partials: f at .22v (τ .32 s), 2.004f at .11v (τ .20), 3f at .044v (τ .09). FM strike: modulator at f (1:1 ratio), deviation `f×2.0 → f×0.2` over τ 30 ms, into the fundamental's frequency. The fundamental starts 1% sharp and settles in τ 8 ms. Attack 3 ms. |
| **Marimba** | Partials f, 4f, 9.2f at gains v, .18v, .06v, with τ = `0.08 + 0.25 × max(0, (84 − midi)/36)` and τ×.25, τ×.10. Mallet thump: white noise bandpass at `min(2f, 4000)`, Q 1.5, 12 ms, .3v. |
| **Kalimba** (v2.1) | Partials f (τ .45, attack 2 ms) and 5.6f (.25v, τ .05). Into an echo: delay 3/16 note, feedback .35, lowpass 2.5 kHz. |
| **Glockenspiel** (SFX only in v2.0; no music layer) | Partials 1, 2.76, 5.40 with gains 1, .3, .1 and τ .6, .2, .08. Played 2 octaves up. |
| **Pluck / ukulele** | Filtered saw (no Karplus-Strong): saw at f → lowpass, cutoff env `6f → 1.5f` (τ 40 ms), Q 2 → gain (attack 2 ms, τ 120 ms). Strum offsets 12 ms per note (down low→high at .8v, up high→low at .6v). Chain: highpass 180 Hz → music −8 dB, plus a 20% dub-echo send. |
| **Bass** | Saw + sine (sub, .6) at f → lowpass Q 3 (env `min(10f, 2400) → 2.5f`, τ 60 ms) → `TANH_CURVE` shaper → gain (attack 6 ms to .45v, then .6× at τ 80 ms, release τ 30 ms at note end). The saturation keeps it audible on phone speakers. |
| **Soft kick** | Sine 110 → 45 Hz (exp, 120 ms), gain to .9v in 4 ms, then to 1e-4 by 320 ms. Plus a "knock": triangle 220 → 90 Hz over 50 ms at .15v. |
| **Shaker** | White noise bandpass 7000 Hz, Q 1.2, attack 10 ms, 70 ms, .10v |
| **Closed hat** | Noise highpass 7500 Hz, Q .7, 45 ms, .08v |
| **Open hat** | Noise highpass 7000 Hz, 250 ms, .06v |
| **Clap** | 3 noise bursts at t, +10 ms, +20 ms (bandpass 1200 Hz, Q 1, 10 ms, .2v), plus a tail at +30 ms (120 ms, .15v) |
| **Conga hi / lo** | Sine `1.15f → f` over 30 ms with f = 330 / 220 Hz and amplitude τ 70 ms, plus noise bandpass 2000 Hz for 6 ms at .08v |
| **Woodblock** | Partials 1050 Hz (.3v, τ 20 ms) and 1650 Hz (.1v, τ 12 ms) |
| **Agogo** | Triangle 900 Hz then 1350 Hz, τ 50 ms |
| **Crash** | Noise highpass 5000 Hz for 1.6 s at .12, plus bandpass 3000 Hz (Q .5) for .8 s at .05 |
| **Tension pad** | 2 saws at `f × (1 ± .004)` → lowpass rising 900 → 2500 Hz across the warning. 16th-note tremolo (square LFO at the 16th rate, depth .6). Attack .3 s, release .2 s, −10 dB. |
| **Riser** | Noise → bandpass Q 2, swept exponentially 400 → 5000 Hz until the surge downbeat; gain 1e-4 → .2 (exp). Cut at the downbeat and replaced by a crash. |
| **Reverb** | Dub echo on every tier (delay 0.40 s, feedback .3, lowpass 2.5 kHz in the loop). No convolver. |

### 8.4 Adaptive layers and states

**Intensity** is computed every frame and read at bar lines:

```ts
let I = onHome ? 0.25 : 0.45;
I += Math.min(0.2, carried * 0.07);
if (carriedMaxRarity >= 3) I += 0.05;
if (wavePhase === 'calm' && waveTimer <= 16) I += 0.25 * (1 - waveTimer / 16);
// thresholds (0.05 hysteresis): kick > .2, lead > .4, agogo > .55, hats > .6, conga > .7
musicLP.frequency.setTargetAtTime(2500 + 13500 * clamp01(I), t, 0.5);   // muffled → bright
```

| State | Enter when | Section | Layers |
|---|---|---|---|
| `ftue` | FTUE steps 1–2 (`grab`, `release`) | Song 1 | bass, skank, shaker. **Kick and lead join on the next bar after step `release` completes** (the "wow" lift). |
| `home` | On the home island, calm | Song N | bass, skank, shaker ×.6, half-time kick, marimba in B sections |
| `explore` | On the course | Song N | home + lead + woodblock |
| `build` | `waveTimer ≤ 16` in calm | Song N | + hats + congas, lowpass opens |
| `warning` | `waveWarning` | **Hurry** at 124 BPM, entered on the **next beat**; loops until `surgeStart` | four-on-the-floor kick, clap, bass 8ths, stabs, pad, 16th lead arpeggio, riser (cut at `surgeStart`) |
| `surge` | `surgeStart` | **Surge** at 128 BPM | hurry layers + 16th hats + lead an octave up + crash at the event. Golden adds an agogo 16th pattern (the glockenspiel layer is v2.1). |
| `recover` | `surgeEnd` | **Phew** stinger → Song N+1 bar 1 | 2 bars of bass and skank only, then normal |

**Transition rules:**

1. Horizontal switches (warning, surge) start on `clock.nextBeat()` (≤ 0.48 s away). The SFX stinger (horn or crash) plays immediately, unquantised.
2. Layers are added on the next bar line. Layers are dropped only on a 4-bar line. Every layer stays for at least 2 bars. "Drop" means "stop scheduling", so tails ring out.
3. Tempo changes go through `pendingBpm`.

**Lead instrument by zone (v2.0):** zones 1–2 marimba; zones 3–7 steel pan. (v2.1: kalimba in 5–7.) There's no key change per zone.

**Beat phase for visuals.** `AudioDirector.beatPhase(): number` returns the position inside the current beat (0..1) from the `MusicClock`, compensated by `ctx.outputLatency` when available. The lead passes it to the renderer as `RenderFrame.beatPhase` (pedestal bob, §5.2). Returns `NaN` before unlock or while music is muted; the renderer then uses its local 112 BPM clock.

**Start.** Music starts on the first user gesture with a 1500 ms fade-in from silence.

**Panels and slow-mo:**

- Panel open: music lowpass 1800 Hz and −3 dB; ambience continues.
- Tutorial slow-mo or big reveal: lowpass 700 Hz plus duck −4 dB, restored over 200 ms.

### 8.5 Ambience (`ambience.ts`, routed under "Sound")

- **Surf.** 2 `Surf` instances panned −.5 and +.5 with independent timing (1 centred instance on Low).
  - Each is brown noise → lowpass 450 Hz (Q .5) → gain .25, plus a foam layer (white noise → highpass 3 kHz).
  - Every 250 ms, `tick(level)` schedules randomised breakers:
    - period 5–9 s; rise 35–45% of the period; peak `(.55–1.0) × level`;
    - cutoff to `700 + 700 × peak` on the rise, back to 350 Hz on the fall;
    - foam to `.05 × peak` just after the break.
  - `level = clamp(1 − (playerY − 0)/40, .35, 1)`. Halved when the player is more than 20 m inland on the home island.
- **Wind.** Pink noise → bandpass → gust gain → level gain, plus a whistle (same pink → bandpass Q 10 → `wGain`). Updated at 10 Hz from speed:
  - `x = clamp((speed − 12)/33, 0, 1)`
  - level `.5 × x^1.6` (τ .15)
  - bandpass `280 + 900x` Hz, Q `.8 + 2.2x`
  - whistle `x > .6 ? .04 × (x − .6)/.4 : 0` at `900 + 1400x` Hz
  - random gusts: gain .75–1.2 every .3–1.1 s
  - Silent while running (speed ≤ 12).
- **Gulls (v2.1).** A call every 12–40 s (exponential) only while the player is within 40 m of an island and the phase is calm.
  - A call is 3–6 notes, .33–.45 s apart, pitch × .96 per note. One random pan (±.8) per call; distance .3–.9.
  - Note recipe: saw `f0 = 1050 × pitch`, glide `.8f0 → 1.25f0` over 60 ms → `.75f0` at 320 ms; 28 Hz vibrato ±35 Hz; bandpasses 1700 Hz (Q 4) and 3100 Hz (Q 6, ×.5); lowpass `4000 − dist × 2500`; envelope 30 ms attack, hold to 220 ms, out at 340 ms, peak `.12 × (1 − .6 dist)`.
- **Rumble.** The existing wave rumble moves to the ambience bus: noise → lowpass 380 → gain `min(.6, .6 × proximity)`.

### 8.6 SFX (`sfx.ts`, keeping the `Sfx`-style API)

Musical SFX use F-major pentatonic `[65,67,69,72,74,77,79,81,84]` (F4 G4 A4 C5 D5 F5 G5 A5 C6) plus the cycle transpose.

| Id | Recipe | Peak | Duck |
|---|---|---|---|
| `ui.click` | Sine G6 (1568 Hz) τ 15 ms, plus noise highpass 6 kHz 10 ms at .03 | .08 (ui bus) | — |
| `ui.open` | Sine 392 → 784 Hz exp over 90 ms, plus marimba C6 | .18 | — |
| `ui.close` | Sine 784 → 392 Hz over 70 ms | .12 | — |
| `ui.tab` | Marimba A5 | .10 | — |
| `ui.denied` | Marimba Bb3, then A3 90 ms later, plus sine 110 Hz τ 40 ms | .15 | — |
| `toast` | Marimba F5 | .08 | — |
| `jump` | Triangle 330 → 660 Hz exp over 110 ms, plus noise bandpass 2 kHz 40 ms at .03 | .10 | — |
| `doubleJump` | Triangle 440 → 988 Hz over 120 ms, plus glockenspiel C7 at .04 | .10 | — |
| `grab` | Noise bandpass 3200 → 900 Hz (Q 2) over 140 ms at .22, plus triangle C4 → C5 over 90 ms at .12, plus a woodblock "clack" when hit-stop fires | .22 | — |
| `release` | Noise bandpass 600 → 2600 Hz (Q 1.2) over 350 ms, panned by `vel.x/20` | .20 | — |
| `perfect` | `release`, plus glockenspiel F6 A6 C7 at 40 ms spacing | .12 | −4 dB |
| `land` | Sine 150 → 70 Hz over 120 ms at .22, plus noise lowpass 800 Hz 60 ms at .08. Hard land ×1.4 plus a soft kick. | .22–.3 | — |
| `pad` | Triangle 200 → 800 Hz "spring" over 250 ms, plus saw 300 → 1400 Hz through lowpass 3 kHz over 500 ms at .08, plus noise bandpass 900 → 3000 Hz at .15 | .15 | — |
| `collect(r)` | Steel-pan arpeggio up the pentatonic from F5: `2 + r` notes, 55 ms apart. r ≥ 4 adds a glockenspiel chord (F6 A6 C7). | .14 | −5 dB |
| `coinTick(i)` | Marimba pentatonic note `[C6,D6,F6,G6,A6,C7,D7,F7][min(i,7)]`, τ 60 ms | .07 | — |
| `deliver` | Marimba C6 → F6 (60 ms) plus open hat at .04, then the coin ticks | .14 | −5 dB |
| `buy` | Pan arpeggio F4 A4 C5 F5 (50 ms apart), plus "cha-ching" (noise highpass 5 kHz 80 ms at .06 and glockenspiel C7 at .05, +200 ms) | .14 | −5 dB |
| `maxed` | `buy` plus F6 an octave up and a crash at .06 | .16 | −5 dB |
| `claim` | Same as `buy` | .14 | −5 dB |
| `splash` | Noise lowpass 1800 → 180 Hz over 900 ms at .5, plus sine 200 → 60 Hz over 400 ms at .2, plus crash | .5 | −8 dB |
| `sea` | "Plop": sine 900 → 180 Hz over 120 ms at .2, plus noise lowpass 1400 → 300 Hz over 500 ms at .3 | .3 | −5 dB |
| `horn` (warning) | Original conch. Saw D4 plus sine D5 → lowpass 1100 Hz (Q 2). Starts 1 semitone flat and glides up over 150 ms. Vibrato 5 Hz ±6 cents. Attack 80 ms, release 300 ms. Two blasts: hold .25 s, then hold .6 s, starting .9 s apart. Golden: on F4/F5 plus a glockenspiel sparkle (reads as an opportunity). | .2 | −5 dB |
| `tick` | Woodblock 1050 Hz. Used for warning seconds ≤ 5 and the 3-2-1. | .15 | — |
| `zone` | Pan F5 A5 C6 F6 (90 ms apart) plus a shaker swell | .13 | −5 dB |
| `chainStep(n)` | Pluck at pentatonic `[F5,G5,A5,C6,D6,F6,G6,A6][min(n−2,7)]` | .10 | — |
| `chainEnd` | Marimba C6 A5 F5 descending (60 ms apart) | .10 | — |
| `chainLost` | Sine 220 → 110 Hz "womp" over 200 ms | .12 | — |
| `closeCall` | Woodblock triplet, plus whoosh, plus glockenspiel F6 C6 | .14 | −5 dB |
| `giftReady` | Glockenspiel F6 then A6 | .08 | — |
| `reveal(r)` | Snare-noise 16th roll over 400 ms (crescendo .03 → .12), crash, then a chord: r ≤ 2 marimba F triad; r 3–4 pan chord plus glockenspiel; r ≥ 5 adds a sub drop (sine 80 → 40 Hz, 400 ms) | .3 | −8 dB |
| `rebirth` | Riser 1.2 s → crash → F major chord on every instrument plus a glockenspiel arpeggio | .35 | −8 dB |
| `tutorialStep` | Glockenspiel C7 | .06 | — |
| `tutorialDone` | Glockenspiel C6 F6 A6, 70 ms apart | .10 | — |
| `slowIn` / `slowOut` | Noise bandpass 2600 → 600 Hz over 200 ms / 600 → 2600 Hz over 200 ms | .12 | — |
| `ui.hover` | Sine 2.4 kHz, 8 ms, attack 1 ms (desktop only, throttled 60 ms) | .03 (ui bus) | — |
| `perfectWindow` | Woodblock 1650 Hz partial only, τ 10 ms (the Perfect-window entry tick) | .05 | — |
| `footstep(surface)` | Noise burst 40 ms (attack 2 ms, τ 12 ms) → lowpass: grass 900 Hz, sand 1400 Hz, wood 2200 Hz (plus a 180 Hz sine knock τ 15 ms at .3× for wood). Pitch-random ±8% (filter cutoff), gain random .8–1.0. | .05 | — |
| `ropeCreak` | Bandpass noise 600 Hz, Q 8, 120 ms (attack 20 ms, release 60 ms), plus a sine 300 → 270 Hz at .3×. Plays at each swing **apex** (`|vel| < 4` while swinging, at most once per half-swing). | .06 | — |
| `whoosh(speed)` | Noise bandpass sweep 500 → 1800 Hz (Q 1.4) over 220 ms. Plays when the player passes the **bottom of the arc** (θ crosses 0) while swinging. Gain `.03 + .09 × clamp((speed − 8)/22, 0, 1)`; pan by `vel.x/20`. | .03–.12 | — |
| `bounce` | Triangle 180 → 520 Hz over 160 ms plus the `sea` plop at .4× | .14 | — |
| `geyser` | Brown noise lowpass 300 → 2400 Hz over 400 ms (rumble), then white noise highpass 2 kHz for 1.2 s at .08 (spray) | .2 | −4 dB |
| `creatureVoice(speciesId, kind)` | See the voice table below. `kind` = `pickup` \| `reveal` \| `deliver` \| `tap`. | .10 | — |

**Footsteps.** Played by `audio.update()` from the `AudioFrame`: while `grounded` and speed > 1.5 m/s, a foot phase integrates `speed × .9` rad/s (the same formula the character's legs use, §5.2), and a `footstep` plays each time the phase crosses a multiple of π. `surface` comes from the solid underfoot: `wood` on lighthouse platforms and towers, home-base mat tiles and the shop stall; `sand` on Shallows islands (zone 0); `grass` everywhere else.

**Rope sounds.** `ropeCreak` and `whoosh` are driven by `AudioFrame.swing` (`{ theta, speed }` or null), computed by the lead from `sim.player`.

**Creature voices** (`creatureVoice`). The meme-creature hook: every species has a recognisable 0.4 s chirp. Recipe: a sawtooth at the species pitch `f0` through **2 parallel bandpasses** (formants F1 and F2, Q 6 and 9, F2 at .6×) → gain, sung as **3 syllables** of 110 ms with 25 ms gaps, each syllable gliding by the plan's contour and with a 6 Hz ±20-cent vibrato. Attack 8 ms, release 40 ms per syllable.

- `f0 = 220 × 2^(k/12)` with `k = [0, 3, 5, 7, 10, 12, 15][i mod 7]`, where `i` is the species' index in `SPECIES` (0–20); then × .75 for `whale` and × 1.5 for `shrimp`. Within a rarity the three species therefore differ by plan and pitch.
- `pickup`: syllables as written. `reveal`: the same, 1 octave up on the last syllable. `deliver`: 2 syllables only, both rising. `tap` (pedestal): the full voice at .8× gain.

| Body plan | F1 / F2 (Hz) | Syllable contour (semitones per syllable, start → end) | Example species |
|---|---|---|---|
| `blob` | 500 / 1500 | 0→+2, +2→0, 0→+5 ("boo-ba-BOP") | Pickle Puff, Waffle Walrus, Astro Otter, Cosmic Sunfish |
| `fish` | 350 / 2200 | 0→−2, 0→−2, +3→+7 ("bloop-bloop-BLEE") | Soggy Sock, Banana Shark, Thunder Tuna |
| `octo` | 700 / 1200 | +2→0, +4→+2, 0→−5 ("wub-wub-WAH") | Toastopus, Pizza Kraken |
| `crab` | 800 / 2600 | 0, 0, +7 (flat clicks, 60 ms syllables, "chk-chk-CHEE") | Crab DJ, Lava Lobster, Captain Splash |
| `whale` | 300 / 900 | 0→+3, +3→+5, +5→0 ("hmm-HMM-mm", 150 ms syllables) | Burger Whale, Ninja Narwhal, The Big Cheese |
| `clam` | 600 / 1800 | +5→0, +5→0, +12→+7 ("pah-pah-PING") | Disco Clam |
| `turtle` | 400 / 1000 | 0→−3, −3→−5, 0→+4 (slow, 140 ms syllables) | Boba Turtle |
| `shrimp` | 900 / 2900 | +7→+12, +5→+7, +12 ("ee-ee-EEP") | Sir Shrimpington, King Krill |
| `jelly` | 450 / 1300 | +3→+5, +5→+3, +3→+10, vibrato 9 Hz | Cactus Jelly, Ghost Galleon |

### 8.7 Mute, ad and visibility behaviour (CrazyGames)

The master bus is silent if **any** of these four independent flags is set: `userMuted`, `platformMuted`, `adPlaying`, `hidden`. None of them overwrites another.

```ts
private apply() {
  const silent = this.userMuted || this.platformMuted || this.adPlaying || this.hidden;
  this.master.gain.setTargetAtTime(silent ? 0 : 0.8, this.ctx.currentTime, 0.02);
}
```

| Flag | Source | Behaviour |
|---|---|---|
| `userMuted` | Quick mute button or `M` | Persisted as `settings.muted` |
| `platformMuted` | `SDK.game.settings.muteAudio`, and `SDK.game.addSettingsChangeListener` | **Overrides the in-game toggle.** The in-game sound icons show a muted state and the Settings sliders are disabled, with the chip "Muted by CrazyGames". Test with `?muteAudio=true`. |
| `adPlaying` | Set on `adStarted`, not on request. Cleared on `adFinished` **and** `adError`. | Fade 60 ms, then `ctx.suspend()` (freezes the music clock in place). On end: the lead shows the resume overlay (C22); its tap calls `resume()` plus a 300 ms fade-in inside the gesture. |
| `hidden` | `visibilitychange` | `suspend()` on hidden. On visible, the lead shows the **resume overlay** (C22) when the tab was hidden for more than 1 s or the context state is `interrupted`; its tap calls `audio.unlock()` (which runs `suspend().then(resume)` on iOS) inside the gesture. Shorter blips resume directly. |

The `AudioContext` is created and resumed only inside the first gesture (as `Sfx.unlock()` does today). The lead adds `settings` and `addSettingsChangeListener` to the `CrazySdk` typings.

---

## 9. New features (ranked)

**Shared mechanics:**

- `minutes(N)` is defined at the top of this spec.
- **Pearls** are a second currency. They are **never reset** (they survive rebirth) and buy cosmetics only.
- **Rewards are client-side only.** The local clock gives the day key `YYYY-MM-DD` (local time).
- **Clock-rollback guard:** if `Date.now() < save.lastSeen − 5 min`, no time-based rewards are granted that session.
- **No randomness is ever sold.** No casino visuals, in line with the PEGI 2026 rules.
- **PEGI 12 fit for daily mechanics.** From June 2026 PEGI rates daily rewards at 7+, and at 12+ when missing a day costs progress. Our target is PEGI 12, so this is allowed, but we keep the pressure low: the calendar is cumulative, missed days only slow the streak (§9.2), unclaimed gifts are never lost (§9.3), there is **no** "claim before midnight" copy, and there are **never** time-limited offers.
- **`Reward` type:** `{ cash?, pearls?, luckyTide?, boost2xSec?, creature?, cosmetic? }`, applied by `applyReward(state, r)` in `src/game/rewards.ts`.
  - `creature` is delivered straight to the base with the existing `deliver()` rules (place, or sell the extras).
  - `luckyTide` tokens: tapping "USE" (FREE panel header) makes the next wave Golden (`wave.forceGoldenNext()`).
  - `boost2xSec` is in the type for v2.1 and is never granted in v2.0.
- **Mystery Creature** (Daily Day 5, Gift 8): a random species from `rarity = min(6, ZONES[max(0, bestZone)].rarity + 1)`, mutation Gold (70%) or Diamond (30%). Always use `max(0, bestZone)`: `bestZone` is −1 before the first zone is reached.

### 9.0 Gameplay features (something new happens in the world)

All are sim features (deterministic, in `src/game/*`, tested by the course bot) with visuals in G18. Placement is generated in `course.ts` from the course seed.

**Respawn rule (already in v0.1, now specified).** A sea fall respawns the player on the **checkpoint of the last island they landed on** (`Island.checkpoint`, home for the first gap) after a 0.6 s splash beat, and they **keep** what they carry. Only the wave takes creatures. The sim waits 0.6 s (`seaRespawnDelay`, new) between the `sea` event and the `respawn` event so the splash reads.

| Feature | Priority | Rules | Numbers |
|---|---|---|---|
| **Bounce Buoys** | P0 | A floating buoy in the sea under the middle of a gap. Touching its top while falling sets `vel.y = max(bounceVel, −vel.y × .9)` and keeps horizontal velocity × .8, emits `{type:'bounce', id}`, and resets the double jump. It's a safety net that gives a second chance at the hook, so it also helps beginners. | One buoy in **every gap of zones 2–5** (Coral Reef to Kraken Deep, 3 gaps each; 12 buoys), at the gap midpoint, x offset ±2 m (seeded). Radius 1.4 m, top at y 1.2 (bobbing visually only; the collider is static). `bounceVel` 19 m/s (enough to reach the gap's hook height). Not in the Shallows (the FTUE must teach the hook). |
| **WAVE #N and Big Waves** | P0 | `wave.count + 1` is the wave number, shown on the meter (C15). Every 5th wave (`n % 5 === 0`) is a **Big Wave**: faster and higher, announced as "BIG WAVE" at warning. After a Big Wave's `surgeEnd`, the respawned batch guarantees one creature of rarity `min(6, ZONES[max(0,bestZone)].rarity + 1)` on a random island of `bestZone`. Golden and Big can coincide (wave 20). | Big: `speed` 52 m/s (normal 42), sim crest **12 m** (normal 10; lighthouse tops at 14 stay safe). Warning stays 8 s. |
| **Featured Creature** | P0 | One species per ISO week (seeded by the week key, from the species of rarity ≤ 4) spawns at **2×** its normal weight within its rarity roll. Wild instances show a "FEATURED" gold chip on their billboard. On the first session of the week, a toast info "Featured: Banana Shark" with its portrait. | Weight ×2. No extra currency. |
| **Drifting Hooks** | P1 | In zones 3–7 (Lagoon onward), one anchor in the **last gap of each zone** (the middle one for multi-anchor gaps) slides along x: `pos.x = base.x + A × sin(2π t / T + φ)`. The rope constraint uses the current position, so swinging from a moving hook just works; `predictRelease` evaluates anchor motion at future times. | A = 2.5 m, T = 4 s, φ seeded. 5 anchors. The course test must still find a path with the hook at its worst phase. |
| **Volcano geysers** | P1 | Each Volcano Bay island has one geyser vent on its top. Cycle: 4 s idle, 1 s warning (bubbles), 2 s eruption. During eruption, a player inside the vent radius and within 1 m of the surface gets `vel.y = 26` (a launch, mode `launch` for .4 s) and the event `{type:'geyser', id}`. Creatures are never launched. | Radius 1.5 m, period 7 s, phase seeded per island. 3 geysers. |
| Runner creature | v2.1 | A Rare that flees within 6 m at 5 m/s along its island. | — |

### 9.1 #1. Quests: "First Voyage" (P0) and Daily Missions (v2.1)

**First Voyage** has 12 quests. Quests 1–6 are completed by the FTUE (§7.2). After the FTUE, the tracker (C16) shows quests 7–12 one at a time.

| # | Goal | Completion check | Reward |
|---|---|---|---|
| 1 | Grab a hook | `stats.grabs ≥ 1` | $20 |
| 2 | Swing to the next island | first `landed` event with `islandOrder ≥ 1` | $20 |
| 3 | Grab a creature | `stats.collects ≥ 1` | — |
| 4 | Bring it home | `stats.deliveries ≥ 1` | $50 |
| 5 | Buy Rope Reach | `levels.reach ≥ 1` | $40 |
| 6 | Survive your first wave | first `surgeEnd` | 2 min |
| 7 | Reach Coral Reef | `bestZone ≥ 1` | 2 min |
| 8 | Launch from a lighthouse during a wave | `stats.padLaunchesInWave ≥ 1` (from `padLaunch.inWave`) | 2 min |
| 9 | Fill 4 pedestals | 4 or more non-null `base` | 3 min |
| 10 | Buy Carry Slots | `levels.carry ≥ 1` | 3 min |
| 11 | Catch a Rare | `stats.collectsByRarity[2] ≥ 1` (or higher) | 5 min + 10 Pearls |
| 12 | Catch one after a Golden Wave | `stats.goldenBatchCollects ≥ 1` (a `collect` whose `WildCreature.golden` is true) | 5 min + 25 Pearls + **Sailor Rope** |

- Voyage complete: unlocks the Shop's LOCKER tab. Toast "Locker unlocked" (tapping it opens the tab), the tab gets a red dot, and the lead calls `platform.happytime()`.
- Quest checks are evaluated against cumulative stats, so a quest that is already satisfied completes the moment it becomes current.
- Rewards are auto-granted with a coin fly from the tracker row. No claim button.

**Daily Missions (v2.1, not built in v2.0).** Kept here so the stats and save design stay stable. In v2.1 a Quests rail tile returns for them.

- Unlocked after the Voyage. 3 per local day: one easy, one medium, one hard.
- Templates are drawn without repeats from the pools below, seeded by the day key.
- Progress = `stats[stat] − startValue`, except "best in a trip" stats, which are checked directly.
- `z = max(0, bestZone)`; `zoneName(i)` = `ZONES[i].name`.

| Tier | Id | Text | Stat / target |
|---|---|---|---|
| easy | `e_grabs` | Grab 15 hooks | grabs +15 |
| easy | `e_deliver` | Deliver 5 creatures | creaturesDelivered +5 |
| easy | `e_perfect` | Land 3 Perfect Releases | perfects +3 |
| easy | `e_buy` | Buy 3 upgrades | upgradesBought +3 |
| easy | `e_waves` | Survive 2 waves | wavesSurvived +2 |
| medium | `m_chain` | Reach a ×{4 + floor(z/2)} chain | bestChainToday ≥ target |
| medium | `m_trip` | Deliver 3 creatures in one trip (only if carry ≥ 3) | bestTripDeliveredToday ≥ 3 |
| medium | `m_zone` | Catch 3 creatures in {zoneName(max(0, z−1))} | zoneCollects[max(0, z−1)] +3 |
| medium | `m_pads` | Launch from 2 lighthouses during waves | padLaunchesInWave +2 |
| medium | `m_perfect` | Land 8 Perfect Releases | perfects +8 |
| medium | `m_cash` | Earn {formatCash(minutes(10))} | cashEarned + minutes(10), frozen at generation |
| hard | `h_rarity` | Catch a {RARITIES[ZONES[z].rarity].name} | collectsByRarity[r] +1 |
| hard | `h_mutation` | Catch a mutated creature | mutatedCollects +1 |
| hard | `h_chain` | Reach a ×{8 + z} chain | bestChainToday ≥ target |
| hard | `h_close` | Make 2 Close Call deliveries | closeCalls +2 |
| hard | `h_deliver` | Deliver 15 creatures | creaturesDelivered +15 |
| hard | `h_golden` | Ride out a Golden Wave on a lighthouse | goldenOnLighthouse +1 |

- **Rewards:** easy 3 min + 10 Pearls; medium 6 min + 15 Pearls; hard 10 min + 25 Pearls. All 3 claimed unlocks a **bonus chest**: 25 Pearls + 1 Lucky Tide.
- Missions need a **CLAIM** tap (a green button in the panel) so the panel has a payoff moment. The rail Missions badge shows the number claimable.
- **Reroll:** 1 free per day, per mission. It gives a different template of the same tier and is shown as a `reroll` icon button.
- **Reset:** at local midnight. The panel shows "New in 7h 12m".
- **UI:** a Missions panel (sky ribbon) with 3 cream rows (C16 row layout, but with the bar at full width 18px plus a reward chip plus CLAIM). Bonus chest bar at the bottom. The tracker shows "DAILY 1/3" collapsed after the Voyage.

**Save:**

```ts
voyage: { step: number /* 0..12, 12 = done */ };
missions: { day: string; list: MissionInstance[]; bonusClaimed: boolean };   // v2.1; saved empty in v2.0
// MissionInstance = { tpl: string; tier: 'easy'|'medium'|'hard'; target: number; stat: StatKey;
//                     start: number; param?: number; claimed: boolean; rerolled: boolean }
```

### 9.2 #2. Daily login calendar, streak, and Welcome Back card (P0, FREE panel DAILY tab)

**Calendar.** 7 tiles that advance by one on each new local day the player claims. Progress is **cumulative: missing days never resets it**. After Day 7 it wraps to Day 1 and `week++`.

| Day | Reward |
|---|---|
| 1 | 3 min + 10 Pearls |
| 2 | Lucky Tide token |
| 3 | 5 min + 20 Pearls (the 2× boost replaces this in v2.1) |
| 4 | 10 min |
| 5 | Mystery Creature (§9 shared mechanics; uses `max(0, bestZone)`) |
| 6 | 15 min + 30 Pearls |
| 7 | Weekly exclusive rope (week 1 Coral Rope, week 2 Seafoam Rope; week 3 and later, or if already owned: 100 Pearls) + 50 Pearls + Lucky Tide |

**Streak flame.**

- `streak` counts local days with a claim. A claim on the day after the last claim adds 1. Each **missed** day subtracts 2 instead of resetting (`streak = max(1, streak − 2 × missedDays) + 1` on the next claim), so one missed day costs a little, not everything.
- Income bonus: `+1% × min(streak, 7)`, multiplied into `baseIncomePerSec()`.
- Shown as a flame chip (`flame` icon + "3") in the FREE panel header and on the FREE tile label when nothing is claimable.

**First session.** Day 1 becomes claimable only after FTUE `ready`, so it is never shown at load for new players.

**Tomorrow teaser.** After any Daily claim, a toast info shows tomorrow's reward for 2200ms: "Tomorrow: Lucky Tide" with the reward's icon (cash, pearl, `lucky-tide`, `creature` with "?", or the rope colours). The Day 1 tile view also shows the **Day 5** Mystery Creature (a silhouette in a gold/diamond porthole) and the **Day 7** exclusive rope as visible teasers in the row.

**Welcome Back card** (panel kind `welcome`, grass ribbon "WELCOME BACK", no backdrop close):

- Shown on a returning session if offline earnings ≥ $1 **or** the daily reward is claimable.
- Contents:
  - Left: a big `cash` illustration (96px) with the offline amount counting up from 0 over 900ms.
  - Right: today's Day tile, and under it a row of any **gifts that became ready last session and were never claimed** (auto-claimed here, §9.3).
  - Footer: one green `--xl` **CLAIM** button with shine, which claims everything shown.
  - Next to it, only when `platform.hasSdk` and offline ≥ 60 s of income: a sky `--l` button "×2" with a small `play` icon (rewarded ad, §10.7). Never forced.
- This keeps the "gameplay within 1 click" rule.
- Offline cap stays at 1 h.

**FREE panel** (sun ribbon "FREE"; `PanelKind 'free'`). Header row: the streak flame chip on the left, Lucky Tide tokens on the right ("2" with the `lucky-tide` icon and a green "USE" `--s` button when > 0). Two tabs:

**DAILY tab:**

- A row of 7 tiles (96×120; Day 7 is double width, glowing gold). On phones the row scrolls horizontally with today's tile scrolled into view.
- Claimed tiles are stamped with `check` and dimmed 20%.
- Today's tile pulses (scale 1 → 1.04 at 1400ms) with a green CLAIM button under it.
- Tomorrow's tile shows its reward with a "TOMORROW" ribbon.
- Footer: "Next reward in 7h 12m".

**Save:**

```ts
daily: { lastClaimDay: string | null; count: number /* total claims */; week: number; streak: number };
tokens: { luckyTide: number; boost2xSec: number };
```

### 9.3 #3. Playtime gifts (P0, FREE panel GIFTS tab)

**Active time** accumulates per local day while `document.visibilityState === 'visible'` and the last input was within 120 s. Panel time counts. It is saved every 5 s, so reloading can't farm it.

| Gift | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 (Mega) |
|---|---|---|---|---|---|---|---|---|
| Active minute | 1 | 3 | 5 | 7 | 10 | 13 | 16 | 20 |
| Reward | 1 min | 2 min | 10 Pearls | 3 min | Lucky Tide | 5 min | 25 Pearls | Mystery Creature (rules as Day 5) |

**UI:**

- They share the FREE rail tile with the calendar. Its label shows a countdown to the next gift, or "FREE".
- The tile badge counts ready gifts plus a claimable Daily. Toast "Free gift ready" (once per gift).
- GIFTS tab: a strip of 8 gift boxes, 88×100 each (phone: 2 rows of 4, 76×88).
  - Locked boxes are greyed and show their timer.
  - Ready boxes bounce (one loop allowed, since the panel is in focus) and get a CLAIM button.
  - Claimed boxes are stamped.
  - The Mega Gift is visible from minute 0, framed gold.
- **CLAIM ALL** green button in the footer when 2 or more are ready.
- Claim feedback: lid pops off (`translateY(-30px) rotate(-20deg)`, 220ms), coin fly, sfx `claim`.

**Reset** at local midnight: the active-time counter and the strip reset. Ready gifts that were never claimed are **not lost**: they are carried over in `gifts.pending` and auto-claimed on the next session's Welcome Back card (or, if no card shows, granted with a toast "Gifts from yesterday" and a coin fly). There is no "claim before midnight" copy.

**Save:** `gifts: { day: string; activeSec: number; claimed: number[]; pending: number[] /* gift indices ready but unclaimed at reset */ }`.

### 9.4 #4. Swing combo: Hook Chain, Perfect Release, Close Call (P0)

**Chain** (`src/game/combo.ts`, owned by the sim):

- `+1` on every `grab`. `+1` extra when the release before that grab was **Perfect**.
- **Chain timer:** 8.0 s. It refills on `grab` and `release`, and counts down **only while the player is on the ground on a course island**.
- **Ends:**
  - timer reaches 0: reason `timeout`, the chain is kept for the trip;
  - sea fall: `sea`, current chain lost;
  - wave splash: `splash`, lost;
  - arriving home: `home`, banked.
- **Trip best:** `tripBest = max(tripBest, chain)` is kept until the next delivery.

**Release quality.** θ is the angle of the rope (anchor → grip) from straight down. It is positive when the player is past the anchor in the forward direction (forward is defined in §7.3).

**Where it is measured.** `release()` clears the anchor and boosts the velocity, so θ can't be recovered afterwards. `PlayerSim.release()` therefore records `lastRelease = { anchorId, anchorPos, theta, vel }` **before** the boost (features team, `player.ts`), and the sim rates that record when it sees the `release` player event. A swing that ends by **landing while still attached** (the `landed` path in `integrate()`, which clears the anchor without a `release` event) counts as a release of quality `'good'` for the chain (no Perfect, no boost) and refills the chain timer.

**Perfect cue (every swing).** While swinging, the sim sets `sim.perfectWindow = vel.y > 0 && θ ∈ [28°, 58°]` every step. HUD (release ring, C17), render (rope flash, gold JUMP rim) and audio (`perfectWindow` tick on entry) all read this one flag, so the skill layer is always readable, not only in the tutorial.

| Quality | Condition |
|---|---|
| **Perfect** | `vel.y > 0` and θ ∈ [28°, 58°] |
| **Good** | rising and θ ∈ [10°, 28°) ∪ (58°, 80°] |
| **Early** | θ < 10°, or not yet past the bottom |
| **Late** | θ > 80°, or `vel.y ≤ 0` |

- **Perfect reward:** horizontal velocity ×1.04 (`COMBO.perfectBoost`), +1 chain, float "PERFECT", FOV +8°, slow-mo .6 for 100 ms, sfx `perfect`.
- **Course tests must still pass** with and without perfect boosts.

**Delivery bonus.** This is new. Every delivery now pays instant cash, which gives the coin-fly moment:

```
chainMult = min(2, 1 + 0.1 × max(0, tripBest − 1))
closeCall = wave.phase !== 'calm' && wave.timeUntilReaches(HOME_FRONT_Z) ≤ 3   // at the moment of delivery
// (player.z is on the home island, where timeUntilReaches() returns Infinity, so the home line is used)
bonus = Σ creatureIncome(c) × multiplier × 10 × chainMult × (closeCall ? 1.25 : 1)
```

`tripBest` resets after the delivery; the `deliver` event carries the `tripBest` it used. A Close Call also triggers on a pad launch when `wave.phase !== 'calm' && wave.timeUntilReaches(pad.min.z) ≤ 3`: no cash, but stat `closeCalls++` and a banner.

**UI:**

- Chain counter (C-layout `chain`): "CHAIN" (Lilita 18) over "×4" (Lilita 44, sun, `.t-stroke`).
- A 56px ring timer to its left drains with the chain timer (`stroke-dashoffset`).
- Appears at chain ≥ 2. Each increment pops `scale 1.35 → 1` over 160ms and shakes the counter ±4px.
- At ≥ 5 the text turns to a gold gradient. At ≥ 10 it gets a shine sweep.
- Carry slots show a small chip above the hotbar while `tripBest ≥ 2`, with the **computed** value `"+" + round((chainMult − 1) × 100) + "%"` (tripBest 2 → "+10%", 4 → "+30%"), from `HudView.tripBonusPct`.

**Stats:** `grabs`, `perfects`, `bestChain`, `bestChainToday`, `closeCalls`.

### 9.5 #5. Locker: rope skins (P0, the Pearl sink; trails are v2.1)

**Catalogue** (`src/game/cosmetics.ts`: ids, names, prices, sources; visuals in `src/render/cosmeticStyles.ts`, keyed by the same ids). Card rarity frames: 60 = Uncommon, 150 = Rare, 300 = Epic, 600 = Legendary, 1200 = Mythic, exclusive = Secret.

| Id | Name | Price / source | Visual (render) | Priority |
|---|---|---|---|---|
| `rope_hemp` | Hemp Rope | Default | Stripes `#D9A35F` / `#B07A3A`, 6 per metre | P0 |
| `rope_sailor` | Sailor Rope | Voyage complete | `#F2F2F2` / `#2B4C9B` twist, 8 per metre | P0 |
| `rope_kelp` | Kelp Rope | 60 Pearls | `#3FA34D` / `#1F6B3A`, 6 per metre | P0 |
| `rope_candy` | Candy Stripe | 150 | `#FF4D5E` / `#FFFFFF`, 10 per metre | P0 |
| `rope_neon` | Neon Rope | 300 | Emissive `#2EE6FF`, toneMapped false, additive glow sprite at the hand | P0 |
| `rope_chain` | Golden Chain | 600 | Gold link boxes (alternating 90° rotation) instead of a cylinder | P1 (falls back to a gold/amber stripe skin) |
| `rope_lightning` | Lightning Rope | 1200 | Emissive `#FFF07A` zig-zag jitter (control point noise 10 Hz), spark particles 6/s | P1 (falls back to an emissive yellow stripe) |
| `rope_coral` | Coral Rope | Day 7, week 1 | `#FF8C7A` / `#FFD1C2`, 8 per metre | P0 |
| `rope_seafoam` | Seafoam Rope | Day 7, week 2 | `#7FF3E8` / `#FFFFFF`, 8 per metre | P0 |
| `rope_aurora` | Aurora Rope | Rebirth 1 | Hue-scrolling gradient along its length | P0 |

Rebirth 2 and later grant 200 Pearls. Stripe skins are one shader with 2 colours and a stripes-per-metre uniform, so a new rope is data only. The swing ribbon stays the default white "Breeze" (`trail_none`); trails return in v2.1 with the revision A catalogue.

**Pearl sources (v2.0):** First Voyage (35), Daily calendar (10–50 per day), gifts (35 per day), **first discovery of each species** (+5 each, 105 total, auto-granted and shown on the reveal card). **Pacing check:** day 0 gives about 105 Pearls (Voyage 35, gifts up to 35, Day 1 10, about 5 discoveries 25), so the first purchase (60) happens on day 0, and a 1200 item takes about 8–10 days.

**LOCKER tab** of the Shop panel (teal ribbon while active; also opened with **L** or by tapping the player character on touch):

- Left: a 240×240 **preview** in a porthole frame (C7 ring, scaled), on a navy sky with 2 white cloud blobs. An animated 2D canvas draws a **blocky figure in the character's proportions** (90px tall: head 26×26 with the smirk face, torso 30×32 in `#F28C38`, legs 2×(12×26), arms 2×(10×26) raised to the rope) hanging from a gold hook at the top centre on the selected rope, drawn in the rope's colours and stripe count, swinging **±35° with a 1.6 s period** (`--ease-io` pendulum). Reduce motion: static at +20°. Phone portrait: the preview sits above the grid at 180×180.
- Right: grid of C7 item cards (3 columns desktop, 3 phones).
  - Footer per card: price button (pearl), or "EQUIP" (sky), or an "EQUIPPED" chip (grass, `check`). Exclusive items show their source ("Day 7 reward").
  - NEW stickers on newly unlocked items.
  - Buying: confirm by tapping the price twice. The second tap within 2 s buys; the first tap turns the label into "BUY?".

**Save:** `cosmetics: { owned: string[]; equipped: { rope: string; trail: string }; seen: string[] }` (`trail` stays `'trail_none'` in v2.0). `pearls: number`.

### 9.6 #6. Settings menu

Opened with the top-right `settings` button or **P**. Panel with a sky ribbon "SETTINGS"; the game pauses (as other panels do). A single scroll column of cream section cards:

| Section | Control | Default | Effect |
|---|---|---|---|
| AUDIO | Music slider 0–100 | **50** | `audio.setVolumes` |
| AUDIO | Sound slider 0–100 | 80 | sfx + ambience |
| AUDIO | Mute all toggle | off | Same as the quick button |
| GRAPHICS | Quality segmented: AUTO / LOW / MEDIUM / HIGH | AUTO | `gfx.setQuality`. AUTO shows the current tier in small text: "Auto (Medium)". |
| GRAPHICS | Reduce motion toggle | `matchMedia('(prefers-reduced-motion: reduce)')` | gfx + ui + tutorial |
| CONTROLS | Camera sensitivity slider 50–200% | 100% | Multiplies look deltas |
| CONTROLS | Invert camera Y toggle | off | — |
| CONTROLS | Swing assist toggle | on | §7.3 struggle assist |
| HELP | REPLAY TUTORIAL (sky `--m`) | — | §7.1 |
| HELP | Controls card: keycaps for WASD (move), SPACE (jump, hold to swing), mouse drag (look), U (Shop), G (FREE), I (Index), L (Locker), P (Settings), M (mute), Esc; or touch pictograms (joystick, JUMP, drag right side to look). The same card is shown at FTUE `ready` (§7.2). | — | — |
| Footer | The logo (C25) at 220px, then "v2.0.0" in Fredoka 600 13, `--text-muted` (desktop only) | — | — |

With `platformMuted`, the audio controls are disabled and show the chip "Muted by CrazyGames".

**Save:**

```ts
settings: { music: number; sound: number; muted: boolean; quality: 'auto'|'low'|'medium'|'high';
            autoTier: 'low'|'medium'|'high'|null;   // saved by auto quality for the next load (§6.1)
            reduceMotion: boolean; camSens: number; invertY: boolean; swingAssist: boolean }
```

This replaces the v1 `sound: boolean`.

### 9.7 Index panel (P0) and Index milestones (v2.1)

**Index panel** (grape ribbon, the only purple surface):

- Header: "14/84 FOUND" (species × 4 mutations) in Lilita 22 with a C10 grape bar, and "Featured this week" with the featured species' porthole (40px).
- Body: one **row per rarity** (7 rows, Common first). Row header: the rarity pill (letter plus name) and "2/3" in Lilita 18. Under it, the 3 species cards (C7) in a row; each card shows its mutation gems.
- Desktop: the whole body scrolls vertically inside the well (row height 196). Phones: the same vertical scroll with cards at 108×140 (3 fit at 390px: 3 × 108 + 2 × 12 = 348); the panel's `max-height` keeps the header fixed and only the well scrolls (`overscroll-behavior: contain`).
- Portraits are rendered lazily (§10.3): visible rows first, at most 3 portraits per frame; a card shows a pulsing navy porthole until its portrait is ready.
- Tapping a found card plays its signature idle in the porthole (CSS rock ±8°, 600ms) and its voice (`creatureVoice(id, 'tap')`).

**First discovery** (P0): each new species grants +5 Pearls, auto-granted and shown on the reveal card.

**Milestones (v2.1, not built in v2.0):**
- **Species complete** (all 4 mutations): +1% income each, claimable (max +21%).
- **Rarity row complete** (all 3 species of a rarity found): +3% income each, claimable (max +21%).
- **All 21 found:** Rainbow Trail.
- Maximum total +42%, multiplied into `baseIncomePerSec()`.
- **UI:**
  - Index header shows "14/84 FOUND" with a bar.
  - Rarity rows have headers ("COMMON 2/3") with a reward chip ("+3%") and a CLAIM button when complete.
  - Completed rows get a gold frame.
  - The Index tile badge counts claimables plus NEW.
- **Save:** `indexClaims: string[]` (`'sp:<id>'`, `'row:<rarity>'`, `'all'`), `indexSeen: string[]`.

### 9.8 Consolidated save v2 (`src/game/state.ts`)

```ts
export const SAVE_VERSION = 2;
export interface SaveDataV2 {
  v: 2;
  cash: number; totalEarned: number; rebirths: number; levels: UpgradeLevels;
  base: (CreatureRef | null)[]; index: Record<string, number>; flags: Record<string, boolean>;
  bestZone: number; savedAt: number; lastSeen: number;
  pearls: number;
  settings: Settings;                                   // §9.6
  ftue: { step: FtueStepId; done: boolean; skipped: boolean; rewarded: string[] };
  voyage: { step: number };
  missions: { day: string; list: MissionInstance[]; bonusClaimed: boolean };   // v2.1, saved empty
  daily: { lastClaimDay: string | null; count: number; week: number; streak: number };
  gifts: { day: string; activeSec: number; claimed: number[]; pending: number[] };
  tokens: { luckyTide: number; boost2xSec: number };
  cosmetics: { owned: string[]; equipped: { rope: string; trail: string }; seen: string[] };
  stats: Stats;
  indexClaims: string[]; indexSeen: string[]; hintsSeen: string[];   // hintsSeen also holds 'coach:<panel>'
  featuredWeekSeen: string;                                          // ISO week key of the last "Featured" toast
}
export interface Stats {
  grabs: number; perfects: number; bestChain: number; bestChainToday: number; chainDay: string;
  deliveries: number; creaturesDelivered: number;
  wavesSurvived: number; padLaunches: number; padLaunchesInWave: number;
  closeCalls: number; collects: number; collectsByRarity: number[] /* 7 */;
  mutatedCollects: number; goldenBatchCollects: number; cashEarned: number; upgradesBought: number;
  seaFalls: number; splashes: number; bounces: number; giftsClaimed: number; playSec: number;
}
```

`bestTripDeliveredToday`, `goldenOnLighthouse` and `zoneCollects` (used only by Daily Missions) are added in v2.1; `load()` ignores unknown stat keys, so adding them later is not a version bump.

**Where the save lives.** Unchanged plumbing: `Platform.getItem/setItem` already prefers the CrazyGames SDK data module (`SDK.data`, synced to the player's CrazyGames account across devices) and falls back to `localStorage`. The lead keeps that, saves every 5 s and on `pagehide`/`visibilitychange`, and additionally mirrors to `localStorage` so a failed SDK init never loses progress. On load, if both exist, the one with the larger `savedAt` wins.

**Migration v1 → v2** (`migrateV1(d)`):

- Copy the shared fields.
- `settings` takes the defaults, with `muted = d.sound === false`.
- `ftue.done = !!(flags.delivered || flags.bought)` (a v1 player who only swung once still gets the tutorial).
- `voyage.step = ftue.done ? 6 : 0`.
- `settings.music = 50`, `settings.sound = 80`.
- Everything else starts zeroed or empty.
- `load()` accepts v1 and v2. Malformed fields fall back to defaults field by field, as today.

**"Survived" definition (owned by the sim).** The sim tracks `splashedThisSurge` and sets `survived` on the `surgeEnd` event: true if the player wasn't splashed during that surge and is on the home island, or on a lighthouse platform or tower top. Progression only counts the flag (`wavesSurvived++`); nobody else re-derives it.

---

## 10. Work breakdown and file ownership

### 10.0 Phases

| Phase | Owner | Duration | Output |
|---|---|---|---|
| 0. Contracts and shared renames | Lead | 1 day | See the Phase 0 checklist below. Ends with `npm run build` and `npm test` green, and the tree tagged `v2-phase0`. |
| 1. Parallel build | 5 teams | 4–5 days | Each module built against the contracts and tested in isolation (stubs, or a `?sandbox=<module>` page the team owns inside its folder). |
| 2. Integration | Lead | 1.5 days | Wire events (§5.3), save v2, platform hooks, ads; remove the v0.1 code paths from `Game.ts`. |
| 3. Polish | All | 2 days | Slop checklist (§2.5) at 1280×720, 844×390 and 390×844; FTUE targets (§7.1); perf on phones (§6.1); loudness (§8.1). |

**Phase 0 checklist (lead).** Everything here touches files that more than one team reads, so it is done once, before anyone forks:

1. `npm i @fontsource/lilita-one@5.3.0 @fontsource/fredoka@5.3.0`. Add `declare module '*?inline'` typings if TypeScript needs them.
2. `src/contracts.ts` (§10.1), complete, including the **full v2 `SimEvent` union** and `WildCreature`. `src/game/sim.ts` changes its local declarations to `export type { SimEvent, WildCreature } from '../contracts'` and emits the v2 shapes with placeholder values (`isNewSpecies:false`, `practice:false`, `survived:false`, `big:false`, `number: wave.count+1`, `golden` on wild creatures from the batch flag). After this, nobody edits the union except through the lead.
3. Shared renames, with today's readers in `hud.ts` and `Game.ts` updated so the tree compiles:
   - `economy.ts`: `icon: string` → `iconId: IconId`; new `formatNumber`, `formatCash`, `formatIncome`, `formatPearls` (§2.1).
   - `creatures.ts`: rarity colours (§2.2).
   - `state.ts`: `sound: boolean` → `settings: Settings` (v1 `sound:false` loads as `settings.muted = true`); add `baseIncomePerSec()` and make `incomePerSec()` call it (boost factor 1).
4. `src/core/timeScale.ts` (the arbiter, §10.1).
5. Debug keys move from G/T to **F2** (cash) and **F3** (force surge), behind `?debug`. `Input.onKey` passes `{ code, key }`.
6. No-op stubs of every module facade below, and `Game.ts` restructured into the frame order of **§10.7**.
7. `scripts/inline-build.mjs`: also fail if the inlined JS contains the string `assets/` (catches un-inlined fonts or images, which the HTML-only check misses).
8. Record the v0.1 bundle size (gzip) in the PR description; the budget is ≤ 400 KB gzip total.

**Rules:**

- A team edits **only** its own files (ownership table below). After Phase 0, `economy.ts`, `creatures.ts` and `state.ts` belong to the features team again.
- Changes to `src/contracts.ts` go through the lead.
- Cross-module calls only go through the facades listed here.

**File ownership (disjoint):**

| Owner | Files |
|---|---|
| Lead | `src/Game.ts`, `src/main.ts`, `src/contracts.ts`, `src/core/*` (`timeScale.ts`, `views.ts`: `buildHudView`, `buildAudioFrame`, `buildRenderFrame`), `src/platform/*`, `index.html`, `package.json`, `vite.config.ts`, `scripts/*`, `docs/shots/*` |
| UI | `src/ui/**` (including `src/ui/sandbox/`), `src/input/*` |
| Graphics | `src/render/**`, `docs/perf-baseline.md` |
| Audio | `src/audio/**` |
| Features | `src/game/**`, `tests/**` except the tutorial's files |
| Tutorial | `src/tutorial/**`, `tests/tutorial*.test.ts`, `tests/tutorialBot.ts` (which may import `tests/bot.ts` helpers read-only) |

### 10.1 Contracts (`src/contracts.ts`, lead)

```ts
import type { Vector3 } from 'three';
import type { CreatureRef } from './game/creatures';
import type { UpgradeKey } from './game/economy';
import type { WavePhase } from './game/wave';
import type { Solid, Island } from './game/course';
import type { PlayerEvent } from './game/player';
import type { DeliveryResult } from './game/state';

export type LayoutMode = 'desktop' | 'landscape' | 'portrait';
export type QualityTier = 'low' | 'medium' | 'high';
export type QualitySetting = 'auto' | QualityTier;
export type RailId = 'shop' | 'free' | 'index' | 'rebirth';
export type PanelKind = 'shop' | 'index' | 'free' | 'settings' | 'welcome';
export type PanelTab = 'upgrades' | 'locker' | 'rebirth' /* shop */ | 'daily' | 'gifts' /* free */;
export type HudPart = 'cash' | 'pearls' | 'rail' | 'wave' | 'course' | 'tracker' | 'carry' | 'chain' | 'topRight';
export type FtueStepId = 'grab' | 'release' | 'collect' | 'home' | 'earn' | 'shop' | 'wave' | 'ready';
export type Surface = 'grass' | 'sand' | 'wood';
export type IconId =
  | 'cash' | 'pearl' | 'shop' | 'index' | 'rebirth' | 'gift' | 'locker' | 'settings' | 'sound-on' | 'sound-off'
  | 'speed' | 'reach' | 'power' | 'carry' | 'pedestal' | 'wave' | 'lighthouse' | 'home' | 'lock' | 'check' | 'close'
  | 'play' | 'arrow-up' | 'chevron' | 'chain' | 'perfect' | 'sparkle' | 'flame' | 'lucky-tide' | 'gem' | 'creature'
  | 'warning' | 'hand' | 'thumb';

export interface Settings {
  music: number; sound: number; muted: boolean; quality: QualitySetting; autoTier: QualityTier | null;
  reduceMotion: boolean; camSens: number; invertY: boolean; swingAssist: boolean;
}
export interface Reward { cash?: number; pearls?: number; luckyTide?: number; boost2xSec?: number /* v2.1 */; creature?: CreatureRef; cosmetic?: string }

// ---------- Time scale (one arbiter, owned by the lead: src/core/timeScale.ts) ----------
/** Ask for a sim time scale. The arbiter applies the minimum of all live requests.
 *  ms > 0: the request expires after ms of real time. ms = 0: release the id now. Ease in 80 ms, out 100 ms. */
export type RequestTimeScale = (id: 'hitstop' | 'perfect' | 'tutorial' | 'reveal', scale: number, ms: number) => void;

// ---------- Sim (re-exported by src/game/sim.ts) ----------
export interface WildCreature extends CreatureRef {
  uid: number; pos: Vector3; zone: number; island: Island; bornAt: number;
  golden: boolean;      // spawned from a Golden-wave batch
  featured: boolean;    // this week's Featured Creature (§9.0)
}
export type ReleaseQuality = 'perfect' | 'good' | 'early' | 'late';
export type SimEvent =
  | { type: 'player'; event: PlayerEvent }                                   // v0.1, unchanged
  | { type: 'landed'; solid: Solid; islandOrder: number /* -1 home, -2 lighthouse */ }
  | { type: 'releaseRated'; quality: ReleaseQuality; theta: number }
  | { type: 'padLaunch'; padId: number; inWave: boolean }
  | { type: 'bounce'; buoyId: number }
  | { type: 'geyser'; geyserId: number }
  | { type: 'collect'; creature: WildCreature; isNewSpecies: boolean; isNewMutation: boolean }
  | { type: 'carryFull' }
  | { type: 'deliver'; result: DeliveryResult; bonusCash: number; chainMult: number; tripBest: number; closeCall: boolean }
  | { type: 'chain'; count: number }
  | { type: 'chainEnd'; count: number; reason: 'timeout' | 'sea' | 'splash' | 'home' }
  | { type: 'closeCall'; where: 'home' | 'pad' }
  | { type: 'splash'; lost: CreatureRef[]; practice: boolean }
  | { type: 'respawn'; reason: 'sea' | 'wave' }
  | { type: 'zone'; zone: number; first: boolean }
  | { type: 'waveWarning'; golden: boolean; big: boolean; number: number }
  | { type: 'surgeStart'; golden: boolean; big: boolean; number: number }
  | { type: 'surgeEnd'; golden: boolean; big: boolean; number: number; survived: boolean }
  | { type: 'washed'; uids: number[] }
  | { type: 'spawned'; golden: boolean }
  | { type: 'shopZone' };
export interface SimOverrides { waveFrozen: boolean; practiceWave: boolean }

// ---------- HUD ----------
export interface RailTileState { visible: boolean; badge: number | '!' | null; arrow: boolean; timer?: string; wiggle: boolean; label?: string }
export interface TrackerRow { icon: IconId; text: string; progress: number /* 0..1 */; reward: Reward; done: boolean }
export interface TrackerView { title: string; count: string; rows: TrackerRow[] }
export interface HudView {
  layout: LayoutMode; touch: boolean;
  cash: number; pearls: number; income: number; multiplier: number; rebirths: number; streak: number;
  wave: { phase: WavePhase; frozen: boolean; timer: number; duration: number; golden: boolean; big: boolean; number: number;
          progress: number; hitsPlayerIn: number | null /* null if not finite */; safe: boolean };
  course: { playerT: number; waveT: number | null; zone: number /* -1 home */; visible: boolean };
  carried: CreatureRef[]; capacity: number; tripBonusPct: number /* 0 when tripBest < 2 */;
  chain: { count: number; timerFrac: number } | null;
  action: boolean;                                  // §4.4 fade
  rail: Record<RailId, RailTileState>;
  tracker: TrackerView | null;
  jumpLabel: 'JUMP' | 'SWING' | 'LET GO'; jumpGoldRim: boolean;
  reticle: { kind: 'hook'; x: number; y: number; locked: boolean; reach?: number; keyHint: boolean }
         | { kind: 'release'; x: number; y: number }   // shown only while sim.perfectWindow (C17)
         | null;
  edgeArrow: { x: number; y: number; angle: number; icon: IconId; label: string } | null;
  vignette: { kind: 'none' | 'danger' | 'slowmo' | 'speed'; strength: number };
  hide: Partial<Record<HudPart, boolean>>;
}
export interface ToastSpec { text: string; kind: 'info' | 'good' | 'warn' | 'bad'; icon?: IconId; onTap?: () => void; action?: { label: string; icon: IconId; onTap: () => void } /* ad slot */ }
export interface BannerSpec { title: string; sub?: string; hue: 'grass' | 'sun' | 'coral' | 'sky' | 'grape' | 'gold' | `r${0|1|2|3|4|5|6}`; priority: 'wave' | 'reveal' | 'zone' | 'tutorial' | 'info'; ms?: number }
export type FloatKind = 'cash' | 'income' | 'pearl' | 'perfect' | 'chain' | 'bonus';
export interface ScreenPt { x: number; y: number }
/** Tutorial focus inside a panel (set by the lead from TutorialFrame.focus). */
export interface HudFocus { panel: PanelKind; tab?: PanelTab; rowKey: UpgradeKey | string; note?: string; sub?: string; dimOthers: boolean }

// ---------- Panel data (pulled by the UI when a panel opens or after an action) ----------
export interface ShopRow { key: UpgradeKey; name: string; icon: IconId; level: number; max: number; now: string; next: string | null; cost: number; cost5: number; maxAffordable: number; costMax: number; affordable: boolean; maxed: boolean }
export interface RebirthView { cost: number; progress: number; multNow: number; multNext: number; can: boolean; visible: boolean; keep: string[]; lose: string[] }
export interface ShopView { cash: number; income: number; rows: ShopRow[]; rebirth: RebirthView; lockerUnlocked: boolean }
export interface IndexEntry { id: string; name: string; rarity: number; income: number; mask: number /* mutation bits */; isNew: boolean; foundIn: string /* zone name hint */ }
export interface IndexView { found: number; total: number; entries: IndexEntry[]; featured: string | null }
export interface DailyTile { day: number; reward: Reward; state: 'claimed' | 'today' | 'tomorrow' | 'later'; teaser: boolean }
export interface DailyView { tiles: DailyTile[]; streak: number; claimable: boolean; resetIn: number }
export interface GiftsView { gifts: { atMin: number; reward: Reward; state: 'locked' | 'ready' | 'claimed'; secondsLeft: number }[]; resetIn: number }
export interface FreeView { daily: DailyView; gifts: GiftsView; luckyTide: number; streak: number }
export interface LockerItemView { id: string; kind: 'rope'; name: string; rarity: number; price: number | null; source: string | null; owned: boolean; equipped: boolean; isNew: boolean; colors: string[]; stripesPerM: number }
export interface LockerView { pearls: number; items: LockerItemView[] }
export interface WelcomeView { offline: number; daily: DailyTile | null; pendingGifts: Reward[]; canDouble: boolean }
export interface PanelData {
  shop(): ShopView; index(): IndexView; free(): FreeView; locker(): LockerView;
  settings(): Settings & { platformMuted: boolean; autoTier: QualityTier };
  welcome(): WelcomeView;
}
export interface UiActions {
  buyUpgrade(key: UpgradeKey, n: 1 | 5 | 'max'): boolean /* false = can't afford or maxed (stops hold-repeat) */; rebirth(): void;
  claimDaily(): void; claimGift(i: number | 'all'): void; useLuckyTide(): void;
  buyCosmetic(id: string): void; equipCosmetic(id: string): void;
  setSettings(patch: Partial<Settings>): void; replayTutorial(): void;
  collectWelcome(double: boolean): void;            // double = watch a rewarded ad first (lead runs it)
  toggleMute(): void; skipTutorial(): void;
  panelChanged(kind: PanelKind | null, tab?: PanelTab): void;   // pause/unpause, SDK gameplayStop/Start, tutorial
}

// ---------- Guides (tutorial → graphics) ----------
export interface GuideSpec {
  arrow: { pos: Vector3; color?: string } | null;
  trail: Vector3[] | null;
  ring: { pos: Vector3; radius: number; label?: string } | null;
  beam: Vector3 | null;
  landingArc: { points: Vector3[]; ok: boolean } | null;
  hookTag: { anchorId: number; text: string } | null;
}
export const NO_GUIDES: GuideSpec = { arrow: null, trail: null, ring: null, beam: null, landingArc: null, hookTag: null };

// ---------- Tutorial output (pure data; TutorialCore produces it, TutorialOverlay draws it) ----------
export type TutorialCommand =
  | { type: 'setWaveTimer'; seconds: number; mode: 'set' | 'cap' }   // cap = only lower it
  | { type: 'forceSpawn'; islandOrder: number; point: number; speciesId?: string; mutation?: number }
  | { type: 'grant'; reward: Reward; source: string; from?: ScreenPt | string /* anchor id */ }
  | { type: 'closePanel' }
  | { type: 'respawnFtue' };
export interface PromptSpec {
  id: string; headline: string; sub?: string; size: 'big' | 'normal' | 'small'; fail: boolean;
  glyph: 'none' | 'wasd' | 'spaceHold' | 'keyU' | 'keyW' | 'thumbDrag' | 'thumbHold' | 'thumbPush' | 'dragLook';
  chip?: { icon: IconId; text: string };            // e.g. distance "24 m", ETA "Pad 2 s"
  portrait?: string;                                // species id
  stamp?: string;                                   // "NICE SWING", "LAUNCH": plays the stamp, then exits
}
export interface TutorialFrame {
  active: boolean; step: FtueStepId | null;
  timeScale: number; guides: GuideSpec; sim: SimOverrides;
  hide: Partial<Record<HudPart, boolean>>; jumpLabel: 'JUMP' | 'SWING' | 'LET GO' | null;
  edgeTarget: { pos: Vector3; icon: IconId; label: string } | null;
  prompt: PromptSpec | null;                        // also used for hint prompts like DRAG TO LOOK
  spotlight: string | null;                         // Hud anchor id, e.g. 'rail:shop', 'shop:buy:reach'
  focus: HudFocus | null;                           // forwarded to Hud.setFocus
  controlsCard: boolean;                            // ready step (§7.2)
  skipVisible: boolean;
  musicLowpass: boolean; vignette: number;
  commands: TutorialCommand[];                      // drained by the lead each frame
}

// ---------- Audio input ----------
export interface AudioFrame {
  dt: number; onHome: boolean; carried: number; carriedMaxRarity: number;
  wavePhase: WavePhase; waveTimer: number; golden: boolean; big: boolean;
  speed: number; altitude: number; nearIsland: boolean; bestZone: number;
  grounded: boolean; surface: Surface;              // footsteps (§8.6)
  swing: { theta: number; speed: number } | null;   // rope creak and whoosh
  perfectWindow: boolean;                           // entry tick
  panelOpen: boolean; slowmo: boolean; ftueStep: FtueStepId | null; lowTier: boolean;
}
```

**`TimeScale` arbiter** (`src/core/timeScale.ts`, lead): `request: RequestTimeScale`, `update(realDt): number` (returns the eased minimum of live requests, 1 when none), `readonly value`. Callers: graphics (hit-stop and Perfect slow-mo, via the `requestTimeScale` passed to its constructor), UI (big reveal, via `HudDeps.requestTimeScale`), the lead (forwarding `TutorialFrame.timeScale` as `'tutorial'`). Nothing else changes sim speed.

### 10.2 UI module: `src/ui/*` and `src/input/*`

**Files:**

- `fonts.ts`, `tokens.css`, `components.css`, `hud.css`, `panels.css`, `fx.css`
- `dom.ts` (`el`, `setText`, `pressable`)
- `icons.ts` (sprite, `icon()`, `iconSvg()`), `art.ts` (rope border tile, scallop, porthole, life ring SVG strings), `logo.ts` (C25)
- `layout.ts`
- `hud.ts` (facade)
- `parts/`: `cash.ts`, `rail.ts`, `waveMeter.ts`, `courseBar.ts`, `carry.ts`, `tracker.ts`, `chain.ts`, `reticle.ts`, `edgeArrow.ts`, `toasts.ts`, `banners.ts`, `touch.ts`, `resume.ts`, `coach.ts`
- `fx.ts` (FloatText, CoinFly), `confetti.ts`, `reveal.ts`
- `panels/`: `panel.ts` (shell, ribbon, rope border, close, tabs, motion), `shop.ts` (UPGRADES), `rebirth.ts` (REBIRTH tab), `locker.ts` (LOCKER tab and preview), `index.ts`, `free.ts` (DAILY and GIFTS tabs), `settings.ts`, `welcome.ts`
- `sandbox/`: static mocks (§2.5) and the `?sandbox=ui` page; `?logo` renders the logo alone at 600px for the thumbnail
- `src/input/input.ts`: floating joystick, ghost stick, pointer capture, keybinds, camera sensitivity and invert, last-device tracking, canvas taps

**Public API:**

```ts
export async function loadFonts(timeoutMs?: number): Promise<void>;
export function icon(id: IconId, size?: number, cls?: string): string;
export function iconSvg(id: IconId): string;          // standalone SVG, symbol inlined
export function logoSvg(width: number): string;

export interface HudDeps {
  portraits: { get(c: CreatureRef): string /* '' while pending */; request(c: CreatureRef): void };
  data: PanelData; actions: UiActions;
  sound: (id: 'ui.click' | 'ui.hover' | 'ui.open' | 'ui.close' | 'ui.tab' | 'ui.denied' | 'toast' | 'coinTick', i?: number) => void;
  voice: (speciesId: string) => void;               // Index card tap
  requestTimeScale: RequestTimeScale;               // big reveal
  coach: { seen(id: string): boolean; markSeen(id: string): void };   // backed by state.hintsSeen
}
export class Hud {
  constructor(root: HTMLElement, deps: HudDeps);
  readonly jumpButton: HTMLButtonElement; readonly joyBase: HTMLElement; readonly joyKnob: HTMLElement;
  readonly layout: LayoutMode;
  update(realDt: number, v: HudView): void;          // runs every frame, also while paused
  toast(t: ToastSpec): void;
  banner(b: BannerSpec): void;
  float(at: ScreenPt, text: string, kind: FloatKind, mergeKey?: string): void;
  coinFly(from: ScreenPt, amount: number, currency: 'cash' | 'pearl', coins?: number): Promise<void>;
  creatureToSlot(from: ScreenPt, c: CreatureRef, slot: number): void;
  reveal(c: CreatureRef, mode: 'compact' | 'big', indexCount: string): Promise<void>;
  confetti(at: ScreenPt | 'center', count: number, hue?: string): void;
  countdown(n: 3 | 2 | 1): void;
  flash(color: string, ms?: number): void;
  openPanel(kind: PanelKind, tab?: PanelTab): void; closePanel(): void; refreshPanel(): void;
  readonly openPanelKind: PanelKind | null; readonly openPanelTab: PanelTab | null;
  setFocus(f: HudFocus | null): void;                // tutorial row focus inside panels
  showControlsCard(ms: number): void;
  showResume(onResume: () => void): void;            // C22; onResume runs inside the gesture
  anchor(id: string): HTMLElement | null;            // 'rail:shop', 'shop:buy:reach', 'jump', 'cash', 'pearls', 'tracker', 'wave' …
  anchorPoint(id: string): ScreenPt | null;
  setReduceMotion(on: boolean): void;
}
export class Input {   // src/input/input.ts (extends the v0.1 API)
  constructor(canvas: HTMLCanvasElement, joyBase: HTMLElement, joyKnob: HTMLElement);
  moveX: number; moveY: number; jumpHeld: boolean; touchMode: boolean; lastDevice: 'keyboard' | 'touch' | 'mouse';
  onKey: ((e: { code: string; key: string }) => void) | null;   // letters matched on key, movement on code
  onTap: ((p: ScreenPt) => void) | null;            // short canvas tap (< 250 ms, < 10 px): pedestal or player pick
  onFirstGesture: (() => void) | null; lastInputAt: number; lastLookAt: number;
  bindJumpButton(b: HTMLElement): void; setEnabled(on: boolean): void; update(): void;
  consumeJumpPressed(): boolean; consumeLook(): { dx: number; dy: number; zoom: number };
  setCameraPrefs(sens: number, invertY: boolean): void;
}
```

**Consumes:** `HudView` every frame (built by the lead in `src/core/views.ts`), `PanelData` on open and refresh, and the calls the lead makes per §5.3.

**Acceptance:**

- The slop checklist (§2.5) passes at all three resolutions.
- Every interactive target is at least 48px on touch; the landscape thumb-zone rule (§4.2) holds.
- `prefers-reduced-motion` is honoured.
- Only `transform`, `opacity` and `filter` are animated; no `background-position` animation.
- HUD `update()` touches the DOM only when values change.
- Hit areas verified with `zoom` applied at `--u` = .85 and 1.5 (desktop).

### 10.3 Graphics module: `src/render/*`

**Files:**

- `gameRenderer.ts` (facade), `quality.ts`, `tonemap.ts` (side-effect module, imported first by `main.ts`), `environment.ts` (lights and fog)
- `sky.ts`, `clouds.ts`, `water.ts`, `shore.ts`, `shadows.ts`, `blobShadows.ts`, `coldOpen.ts`
- `world.ts`, `props.ts`, `gameplayObjects.ts` (buoys, drifting-hook rails, geysers), `boxes.ts` (+`outline()`, `aFace`, `ao`, `aEye`), `materials.ts`
- `character.ts` (poses, blending, celebrations), `faces.ts`, `creatureMesh.ts`, `creatures.ts` (wild, carried and base visuals moved from `Game.ts`, signature idles)
- `rope.ts`, `speedLines.ts`, `ribbon.ts` (swing ribbon), `particles.ts`, `guides.ts`, `waveVisual.ts`
- `labels.ts`, `billboards.ts`, `cosmeticStyles.ts`, **`portraits.ts`** (renamed from `render/icons.ts`, so it never collides with `ui/icons.ts`), `camera.ts` (FOV, look-ahead, shake), `juice.ts` (squash springs; hit-stop requests)

**Public API:**

```ts
export interface RenderFrame {
  realDt: number; simDt: number; time: number;
  sim: Readonly<GameSim>; state: Readonly<GameState>;
  cosmetics: { rope: string; trail: string };
  guides: GuideSpec; reduceMotion: boolean;
  beatPhase: number;                                // NaN when music is off (§8.4)
}
export class PortraitFactory {                      // portraits.ts (was IconFactory)
  get(c: CreatureRef): string;                      // data URL, or '' while pending
  request(c: CreatureRef): void;                    // queue; rendered by pump()
  pump(maxPerFrame?: number): void;                 // default 3; called inside render(), idle-first
}
export class GameRenderer {
  constructor(canvas: HTMLCanvasElement, deps: { requestTimeScale: RequestTimeScale });
  init(course: Course, quality: QualitySetting, autoTier: QualityTier | null): Promise<void>;   // builds world, compileAsync
  readonly camera: PerspectiveCamera; readonly portraits: PortraitFactory;
  readonly tier: QualityTier;                       // effective tier for this load
  setQuality(q: QualitySetting): void;              // user choice: applies now (recompile behind the panel)
  pendingAutoTier(): QualityTier | null;            // tier to save for the next load (§6.1)
  setReduceMotion(on: boolean): void;
  resize(w: number, h: number, layout: LayoutMode): void;
  look(dx: number, dy: number, zoom: number, time: number): void;
  cameraYaw(): number; manualRecently(time: number): boolean; snapBehind(dx: number, dz: number): void;
  playColdOpen(): void;                             // G17
  onSimEvent(e: SimEvent): void;                    // particles, squash, shake, hops, celebrations; may call requestTimeScale
  setStormMood(target: 0 | 1): void;
  shouldRender(nowMs: number): boolean;             // time-based cap (§6.1)
  render(f: RenderFrame): void;                     // also syncs pedestal count, hook lock states and anchor positions from sim/state
  project(world: Vector3): ScreenPt & { onScreen: boolean; behind: boolean };
  pedestalScreen(i: number): ScreenPt | null; anchorScreen(anchorId: number): ScreenPt | null;
  pick(p: ScreenPt): { kind: 'pedestal'; index: number } | { kind: 'player' } | null;
  stats(): { calls: number; tris: number; ms: number; dpr: number };
}
export function waveHeight(x: number, z: number, t: number): number;   // water.ts, for anyone
```

There is no `world.setPedestalCount` or `updateHooks(reach)` facade: `render()` reads `state.slotCount`, `state.stats` (reach) and `course.anchors[i].pos` each frame and updates only on change.

**Consumes:** sim state (read-only), `SimEvent`s, `GuideSpec` from the tutorial, cosmetics ids, `beatPhase`, and `Settings.quality` / `reduceMotion`.

**Acceptance:**

- §6.1 budgets on Medium, verified with the `?debug` overlay against `docs/perf-baseline.md`.
- No per-frame allocations: a heap snapshot shows a stable count.
- `PCFShadowMap` with texel snapping (no shimmer while running); no sea vertex swimming while the camera moves.
- Toned sky, sea and world match at the horizon.
- Opening the Index never stalls a frame by more than 8 ms (portraits are pumped, at most 3 per frame).
- The course bot and all tests are unaffected (render is not imported by the sim).

### 10.4 Audio module: `src/audio/*`

**Files:** `engine.ts` (context, unlock, buses, limiter, ceiling, duck, noise, voice pool and cap, mute flags), `instruments.ts`, `songs.ts` (Song 1 form, chords, lead table, hurry/surge/phew, patterns), `music.ts` (MusicClock, state machine, layers, intensity, `beatPhase`), `ambience.ts` (Surf, Wind, Rumble), `sfx.ts` (SFX ids of §8.6, footsteps, rope sounds), `voices.ts` (creature voices), `director.ts` (facade). The v0.1 `Sfx` class is replaced; the lead switches `Game.ts` to `AudioDirector` in Phase 2.

```ts
export type SfxId = 'ui.click'|'ui.hover'|'ui.open'|'ui.close'|'ui.tab'|'ui.denied'|'toast'|'jump'|'doubleJump'|'grab'|'release'
  |'perfect'|'perfectWindow'|'land'|'pad'|'bounce'|'geyser'|'collect'|'coinTick'|'deliver'|'buy'|'maxed'|'claim'|'splash'|'sea'
  |'horn'|'tick'|'zone'|'chainStep'|'chainEnd'|'chainLost'|'closeCall'|'giftReady'|'reveal'|'rebirth'
  |'tutorialStep'|'tutorialDone'|'slowIn'|'slowOut';
export class AudioDirector {
  unlock(): void;                                   // call inside a gesture (first gesture and the resume overlay)
  play(id: SfxId, opts?: { rarity?: number; i?: number; n?: number; golden?: boolean; pan?: number; hard?: boolean }): void;
  voice(speciesId: string, kind: 'pickup' | 'reveal' | 'deliver' | 'tap'): void;
  onSimEvent(e: SimEvent): void;                    // maps sim events → sfx + music states (§5.3, §8.4)
  update(f: AudioFrame): void;                      // intensity, wind, surf, rumble, footsteps, rope sounds
  beatPhase(): number;                              // 0..1, NaN before unlock or with music at 0/muted
  setVolumes(music: number, sound: number): void;   // 0..100
  setUserMuted(m: boolean): void; setPlatformMuted(m: boolean): void;
  setAdPlaying(on: boolean): void; setHidden(on: boolean): void;
  readonly unlocked: boolean; readonly needsGesture: boolean;   // true when iOS reports 'interrupted'
}
```

**Acceptance:**

- 0 asset bytes.
- Music is gapless across a 30 min soak test with no drift, and there is no burst after a 2 s main-thread stall.
- The hurry section loops correctly through a 20 s stall of the wave timer (panel open) and ends exactly at `surgeStart`.
- All four mute flags behave independently.
- Ads suspend and resume with the music continuing in place.
- Loudness acceptance of §8.1 (≤ −1 dBFS peak, SFX 3–6 dB over music, audible on a phone speaker).
- Never more than 24 voices (16 on Low); under 3% CPU on a mid phone, measured over a dense surge bar.

### 10.5 Features logic: `src/game/*` and `tests/*`

**Files:**

- **Changed:**
  - `state.ts`: save v2, migration, pearls, tokens, streak multiplier in `baseIncomePerSec()`, `grantCreature()`, `restoreCarried(refs)`.
  - `economy.ts`: `bulkCost(key, n)`, `maxAffordable(key, cash)`, `cheapestUpgradeCost(levels)`.
  - `wave.ts`: `frozen`, `setTimer(s)`, `capTimer(s)`, `duration` (length of the current countdown), `forceGoldenNext()`, `big`, `number` (`count + 1`), `crest` (10 or 12), `speed` per wave (42 or 52), `hits()` uses `crest`.
  - `sim.ts`:
    - `overrides: SimOverrides`;
    - `forceSpawn(islandOrder, point, speciesId?, mutation?)`;
    - practice wave (`splash.practice`, carried kept);
    - combo integration and delivery bonus (§9.4);
    - `perfectWindow: boolean` (updated every step);
    - `playerSafe(): boolean` (§2.4 C15);
    - `survived` on `surgeEnd` (§9.8);
    - `seaRespawnDelay` 0.6 s between `sea` and `respawn`;
    - Bounce Buoys, Big Waves, Featured Creature, Drifting Hooks, geysers (§9.0);
    - `restoreCarried(refs)` (rewarded ad after a splash);
    - emits the full v2 `SimEvent` union (§10.1).
  - `course.ts`: `ftueSpawn`, `shopZone: AABB` beside the home path, `buoys: { id, pos, radius }[]`, `geysers: { id, pos, radius, phase }[]`, `Anchor.drift?: { baseX: number; amp: number; period: number; phase: number }`.
  - `player.ts`: `copyFrom(other: PlayerSim)` (copies every field including the private ones), `forceRelease(stats)` (the same physics as `release()` but pushes no event), `lastRelease: { anchorId: number; anchorPos: Vector3; theta: number; vel: Vector3 } | null` recorded inside `release()` before the boost, `swingAngle(forward: Vector3): number`, buoy and geyser contacts.
- **New:**
  - `combo.ts`, `predict.ts`
  - `progress.ts` (stat tracker)
  - `quests.ts` (Voyage), `daily.ts`, `gifts.ts`, `cosmetics.ts`, `featured.ts`
  - `rewards.ts` (`minutes()`, `applyReward()`, `rollMysteryCreature()`), `clock.ts` (injectable `now()`, `dayKey()`, `weekKey()`)
  - `progression.ts` (facade)
- **Tests:** `state-migration` (v1 → v2, including the `delivered || bought` FTUE rule and `sound:false`), `format`, `combo` (including landing while attached), `predict` (prediction equals the real release within 0.05 m over 2 s, at 1/120 steps, including a drifting hook), `quests`, `daily` (cumulative calendar, streak −2 per missed day, rollback guard, `max(0, bestZone)` mystery roll), `gifts` (pending carry-over across midnight), `cosmetics`, `wave-ftue` (freeze, setTimer, capTimer, practice wave keeps carried, wave 2 does not, Big Wave every 5th), `features` (buoy bounce, geyser launch, featured weight), and the course bot with Perfect boosts on, buoys present and hooks drifting.

**Public API:**

```ts
// sim.ts
export type { SimEvent, WildCreature } from '../contracts';
export class GameSim {                                // existing API plus:
  overrides: SimOverrides; readonly combo: ComboTracker;
  perfectWindow: boolean; featuredSpecies: string | null;
  playerSafe(): boolean;
  forceSpawn(islandOrder: number, point: number, speciesId?: string, mutation?: number): void;
  restoreCarried(refs: CreatureRef[]): void;
  geyserState(id: number): 'idle' | 'warning' | 'erupting';
}

// predict.ts
export interface ReleasePrediction { points: Vector3[]; landsOn: Solid | null; t: number }
/** Copies the player with copyFrom(), calls forceRelease(), then steps NO_INPUT at the sim step (1/120 s)
 *  for up to 3 s, with anchors and geysers evaluated at simTime + t. No events, no allocation after warm-up. */
export function predictRelease(sim: Readonly<GameSim>, samples?: number): ReleasePrediction;
export function releaseQuality(player: PlayerSim, forward: Vector3): ReleaseQuality;

// progression.ts
export type ProgressEvent =
  | { type: 'questDone'; index: number; reward: Reward } | { type: 'voyageDone' }
  | { type: 'giftReady'; index: number } | { type: 'dailyReady' }
  | { type: 'unlock'; what: RailId | 'locker' } | { type: 'rewardApplied'; reward: Reward; source: string }
  | { type: 'featured'; speciesId: string } | { type: 'discovery'; speciesId: string; pearls: number };
export class Progression implements Pick<PanelData, 'free' | 'locker' | 'index'> {
  constructor(state: GameState, clock?: Clock);
  readonly events: ProgressEvent[];                 // cleared at the start of update()
  onSimEvent(e: SimEvent, sim: GameSim): void;      // updates stats + quest checks
  update(realDt: number, ctx: { active: boolean; sim: GameSim; ftueDone: boolean }): void;   // runs while paused too
  welcome(): WelcomeView;
  claimDaily(): Reward | null; claimGift(i: number | 'all'): Reward | null;
  buyCosmetic(id: string): boolean; equipCosmetic(id: string): boolean;
  useLuckyTide(sim: GameSim): boolean;
  railState(cash: number): Record<RailId, RailTileState>;
  tracker(): TrackerView | null;
  free(): FreeView; locker(): LockerView; index(): IndexView;
}
```

The lead's `views.ts` builds `ShopView` (from `economy.ts` and `state`) and `settings()`; Progression supplies the rest of `PanelData`.

**Consumes:** nothing from render, UI or audio. It stays pure and deterministic with an injected clock and RNG.

**Acceptance:**

- `npm test` is green.
- v1 saves load without loss.
- All reward numbers match §9.
- No DOM or three.js rendering imports in `src/game/*` (`Vector3` is fine).

### 10.6 Tutorial module: `src/tutorial/*` and `tests/tutorial*`

**Files:**

- `steps.ts`: step definitions in data form (trigger, completion predicate, prompt per device, guides builder, timed hints, overrides).
- `copy.ts`: every string in §7.
- `core.ts`: **`TutorialCore`**, the state machine plus director (window computation with `predictRelease`, guides, commands, prompt selection). **No DOM**; runs in vitest's `node` environment.
- `overlay.ts`: **`TutorialOverlay`**, the DOM side: objective pill, glyphs (WASD, SPACE hold-loop, ghost thumb, drag-to-look hand), spotlight, stamps, skip link, controls card trigger.
- `tutorial.css`: uses the UI tokens, the `--z-*` scale and `icon()`.
- `hints.ts`: §7.4 (no DOM; emits toasts and prompts through its deps).
- `debugLog.ts`: §7.5.

**Public API:**

```ts
export interface TutorialCoreDeps { reduceMotion: () => boolean; device: () => 'keyboard' | 'touch' | 'mouse'; lastLookAt: () => number }
export class TutorialCore {
  constructor(deps: TutorialCoreDeps);
  start(state: GameState, sim: GameSim): void;      // resumes ftue.step; no-op if done
  readonly active: boolean;
  onSimEvent(e: SimEvent, sim: GameSim): void;
  onProgressEvent(e: ProgressEvent): void;
  onUi(e: { type: 'panel'; kind: PanelKind | null; tab?: PanelTab } | { type: 'buy'; key: UpgradeKey }): void;
  update(realDt: number, sim: GameSim, state: GameState, settings: Settings): TutorialFrame;   // every frame, also while paused
  skip(): void; replay(): void;
}
export interface TutorialOverlayDeps {
  root: HTMLElement; anchor: (id: string) => HTMLElement | null; anchorPoint: (id: string) => ScreenPt | null;
  sound: (id: 'tutorialStep' | 'tutorialDone' | 'slowIn' | 'slowOut') => void; onSkip: () => void;
}
export class TutorialOverlay { constructor(deps: TutorialOverlayDeps); render(f: TutorialFrame, realDt: number): void }
export interface HintsDeps { toast: (t: ToastSpec) => void; seen: (id: string) => boolean; markSeen: (id: string) => void; openShop: (tab?: PanelTab) => void }
export class Hints {
  constructor(deps: HintsDeps);
  update(realDt: number, sim: GameSim, state: GameState, ctx: { surge: boolean; toastBusy: boolean; lastLookAt: number; ftueStep: FtueStepId | null }): PromptSpec | null;
  onSimEvent(e: SimEvent, sim: GameSim): void;
}
```

**Acceptance:**

- The FTUE bot (`tests/tutorialBot.ts`, driving `TutorialCore` only) finishes within 150 s of sim time, including the interrupted-shop path.
- Skip, replay and the v1 migration rule all work.
- One prompt and one indicator at a time; never a prompt and a banner together.
- The slow-mo caps hold (1200 ms real).
- Glyphs switch with the last device.
- Text matches `copy.ts`, with no emoji.

### 10.7 Lead integration (`src/Game.ts`): frame order

```
0  paused = hud.openPanelKind !== null || resumeOverlayShown
1  input.update(); look → gfx.look(dx, dy, zoom, time)
2  tf = tutorialCore.update(realDt, sim, state, settings)
   apply tf.commands; sim.overrides = tf.sim; hud.setFocus(tf.focus)
   timeScale.request('tutorial', tf.timeScale, tf.timeScale < 1 ? 250 : 0)
3  scale = timeScale.update(realDt);  simDt = paused ? 0 : realDt * scale
4  if !paused: accumulator += simDt; fixed 1/120 steps → for each SimEvent e:
       progression.onSimEvent(e, sim); tutorialCore.onSimEvent(e, sim); hints.onSimEvent(e, sim);
       gfx.onSimEvent(e); audio.onSimEvent(e); feedback(e)   // §5.3 → hud.toast/banner/float/coinFly/reveal
5  progression.update(realDt, { active, sim, ftueDone })    // every frame, even while paused (gift time counts with panels open)
   drain progression.events → hud + audio + tutorialCore
   hintPrompt = hints.update(...)                         // every frame
6  if gfx.shouldRender(now): gfx.render(buildRenderFrame(..., beatPhase: audio.beatPhase()))
7  hud.update(realDt, buildHudView(...))                  // every frame; projects reticle/edge arrow via gfx.project
   tutorialOverlay.render(tf.prompt ? tf : { ...tf, prompt: hintPrompt }, realDt)
8  audio.update(buildAudioFrame(...))
```

Only the sim and its accumulator stop while paused. Tutorial, progression, hints, HUD, overlay, audio and rendering run every frame.

**Other lead duties:**

- `import './render/tonemap'` first in `main.ts`; then `loadFonts()`; then `gfx.init()`.
- New sessions spawn at `course.ftueSpawn` with the camera framing the first hook (§7.2), then `gfx.playColdOpen()` on the first rendered frame.
- **CrazyGames SDK lifecycle:** `loadingStart()` at boot; `loadingStop()` right after the **first rendered frame** (after `compileAsync`); `gameplayStart()` on the first gesture; `gameplayStop()` while a panel is open, while the resume overlay shows, and while the tab is hidden, and `gameplayStart()` again after; `happytime()` on the first Legendary+ catch, on Voyage complete and on rebirth.
- **Ads.** Midgame ads only at natural breaks: after `surgeEnd`, never before `ftue.done`, at most once per 3 minutes. **Rewarded slots** (all optional, only when `platform.hasSdk`, never forced):
  1. "KEEP THEM" on the splash toast (`ToastSpec.action`, sky, `play` icon), when the wave took 1 or more creatures, once per wave, offered for 6 s: on reward, `sim.restoreCarried(lost)`.
  2. "×2" on the Welcome Back card (offline earnings doubled).
  - While any ad plays: `audio.setAdPlaying(true)`, sim paused; afterwards the resume overlay.
- `platform` gains `settings.muteAudio` and `addSettingsChangeListener` typings → `audio.setPlatformMuted`.
- Save v2 writes every 5 s and on `pagehide` or `visibilitychange` (§9.8 for where it lives). `settings.autoTier` from `gfx.pendingAutoTier()` is saved when set.
- Visibility: hidden → `audio.setHidden(true)`, pause; visible → resume overlay if hidden > 1 s or `audio.needsGesture` (§8.7).
- Canvas taps (`input.onTap`): `gfx.pick()` → pedestal: `audio.voice(id,'tap')` plus the creature's signature idle; player: `hud.openPanel('shop','locker')` once the Locker is unlocked.
- Hotkeys (`e.key`, case-insensitive): U Shop, G FREE, I Index, L Locker, P Settings, M mute, Esc close. Debug: F2 cash, F3 force surge (with `?debug`).
- Remove `updateHints()`, the target ring, the rope and the creature visual code from `Game.ts`.
- **Loading screen** (`index.html`): navy `--frame-lo` background; the logo (C25) at `min(520px, 80vw)`; under it a **rope progress bar**: 320×22 (phone 240×18), a navy track with a 3px ink border and radius 999, filled left to right with the 3-strand rope pattern of C5 (`--rope-a/b/c`), ending in a 28px knot circle that travels with the fill. The logo is hidden until the fonts load (max 1500 ms). No other text except "Loading" in Fredoka 600 16 white at 70% under the bar.
- **Thumbnail and first frame.** The CrazyGames cover and the first gameplay frame show the same composition: the player on the home edge, the gap-1 hook and rope arc, island 1, and the cold-open wave on the horizon, with the logo (from `?logo`) composited for the cover.

### 10.8 Order of work inside Phase 1 (critical paths)

| Module | Order |
|---|---|
| Features | `player.ts` (`copyFrom`, `forceRelease`, `lastRelease`) and `predict.ts`, plus the `wave.ts` changes, first, since the tutorial needs them by day 2 → save v2 → combo and `perfectWindow` → buoys and Big Waves → progression → featured → drifting hooks and geysers (P1) |
| UI | tokens, `art.ts` signature pieces and the 3 static mocks (§2.5) → buttons and icons (contact sheet review) → HUD parts → panels → fx → logo |
| Graphics | `perf-baseline.md` → quality, tonemap and lighting → shadows and blob → water and foam → creatures (draw-call plan, vertex blink) and character (poses, faces) → guides (needed by the tutorial on day 3) → cold open, gameplay objects → signature idles → props (P1) |
| Audio | engine (voice cap, ceiling) and SFX → creature voices → music clock and Song 1 → states and layers (hurry loop) → ambience → footsteps and rope sounds |
| Tutorial | `core.ts` and `copy.ts` with the sim bot → overlay → hints and coach triggers → debug log |

---

## Changelog from critique

Revision B changes, grouped by critique. "Rejected" items say why.

**Completeness critique**

- A1 Indigo chrome replaced by navy `#123A5C` with rope-gold `#E8B04A` (§2.2); purple only in the Index; slop check 10.
- A2 Four signature pieces: rope border, wave-crest scallop, life-ring close, buoy round buttons, porthole portraits (§1.6, C3, C5, C7).
- A3 Custom SVG logo with a hanging rope, hooked G and drips, reused on loading screen, Settings and thumbnail (C25, §10.7).
- A4 Number style `.t-num`: 8px stroke, 2-tone fill, −6° skew (§2.1).
- A5 Locker preview is a blocky figure, 240×240, 90px tall, ±35° at 1.6 s (§9.5).
- A6 Pass/fail slop checklist and reference mocks (§2.5).
- B7–B9 Idle, look-around, sit; carry pose; deliver, Legendary and survived celebrations; 120/60 ms crossfades (§5.2).
- B10 16×16 face layouts with ink and blush colours (§5.2a).
- B11 21 signature idles (§5.2b). B12 pedestal bob on the music beat (§5.2, §8.4 `beatPhase`). B13 zone prop table with sizes and colours (§5.2c, P1).
- C14–C16 Footsteps, rope creak, whoosh, creature voices (§8.6). C17 Songs 2 and 3 deferred; when built, their leads must be hand-written. C18 24-voice cap, Low drops conga and a surf. C19 Loudness acceptance. C20 `ui.hover`.
- D21 `dragToLook`, D22 `doubleJump` and `lighthouse` hints (§7.4). D23 One-time coach cards (C21); the Rebirth card states KEEP/LOSE. D24 Controls card at `ready` (§7.2).
- E25 Gameplay features: Bounce Buoys, Big Waves, Featured Creature (P0), Drifting Hooks and geysers (P1), with numbers (§9.0).
- E26 Specified: Rebirth tab (C19), Shop tabs (UPGRADES, LOCKER, REBIRTH), compact reveal (C24), Index panel (§9.7), edge arrow (C23), loading rope bar (§10.7).
- F27 Landscape rail is one row at the top (thumb-zone rule), joystick zone starts at 40% H, `.hud-fade` blocks taps on touch (§4.2, C20).
- F28 13px minimum on phones; tiny labels removed (§2.1). F29 Rarity letter chips and frame shapes (§2.2). F30 Resume overlay (C22).

**Feasibility critique**

- A1 Full v2 `SimEvent` union and `WildCreature` (with `golden`, `featured`) in `contracts.ts` in Phase 0; `landed` carries the solid; `deliver` carries `tripBest`; `padLaunch.inWave`; `surgeEnd.survived` owned by the sim.
- A2 Shared renames (`iconId`, rarity colours, `settings`, formatters, `baseIncomePerSec`) done by the lead in Phase 0.
- A3 `PlayerSim.copyFrom`, `forceRelease`; prediction at 1/120. A4 `lastRelease` recorded before the boost; landing-while-attached path defined (§9.4).
- A5 One `TimeScale` arbiter (§10.1). A6 `Hud.setFocus` and a shared `--z-*` scale. A7 Only the sim pauses (§10.7). A8 `TutorialCore` / `TutorialOverlay` split.
- A9 Debug keys to F2/F3; letter hotkeys on `e.key`, movement on `code`. A10 `look(..., time)`; `render()` syncs pedestals and hooks; `render/icons.ts` renamed `portraits.ts`; frame-order reference fixed to §10.7.
- B11 Fonts via `?inline`; build check for `assets/` in JS; Fredoka 600 dropped. B12 Budget set to ≤ 400 KB gzip total.
- B13 Creature draw-call plan as baseline (vertex blink, instanced glows and beams, LOD ranges); measure v0.1 first. B14 World-locked snapped near grid plus flat skirt for the sea.
- B15 Runtime adaptation is DPR only; tier changes on next load or user choice; time-based render cap.
- B16 Tonemap import first in `main.ts`; portrait mismatch accepted with a brighter rig; gold matcap via `onBeforeCompile`.
- B17 Music follows sim events only; hurry loops until `surgeStart`. B18 Audio scope cut as proposed (no convolver, no Karplus-Strong, Song 1 only, no gulls).
- B19 `paint-order` fallback under 28px; stripes translate a child; zoom hit-area test. B20 Icons cut to 34 with `<use>` silhouettes, 18 KB budget, contact sheet; `iconSvg()` inlines the symbol. B21 Lazy, pumped portraits; silhouettes via CSS filter.
- C22 `max(0, bestZone)` everywhere. C23 `baseIncomePerSec()` vs `incomePerSec()`. C24 Trip chip shows the computed percentage. C25 Infinity treated as safe; `hitsPlayerIn` null when not finite. C26 FTUE skip rule `delivered || bought`. C27 PEGI 12 note; no midnight copy; no time-limited offers.
- D Scope cut adopted with these exceptions: **Playtime gifts kept** (merged with Daily into one FREE panel, cheap, and the player critique wanted the FREE tile); **Lucky Tide and Mystery Creature kept** (they reuse the golden-wave and `deliver()` plumbing); **first-discovery Pearls kept** (needed for Pearl pacing). Daily Missions, 2× boost, trails, Index milestones, the full rebirth ceremony, distant islands, gulls, Songs 2 and 3 are deferred.
- Additional bug found while revising: the Close Call check used `timeUntilReaches(player.z)`, which is always `Infinity` on the home island; it now uses `HOME_FRONT_Z` (and the pad's z for pads).

**Player critique**

- 1 Cold-open wave on the horizon, meter visible as WAVE PAUSED, wave unfreezes at step `home` (§7.1, §7.2, G17, C15).
- 2 Spawn at z 6 facing the hook; `run` merged into `grab` ("RUN + JUMP + HOLD"); WASD glyph only after 2 s idle.
- 3 Sea falls respawn on the last island stood on, keeping carried creatures (already v0.1 behaviour, now specified with a 0.6 s beat, §9.0).
- 4 Rule card dropped; practice-wave float-off and snap-back teaches instead.
- 5 Permanent Perfect cue: release ring, rope flash, gold JUMP rim, tick (C17, §9.4).
- 6 Landscape rail out of the joystick zone (§4.2). 7 At most 2 badges; Gifts and Daily merged into FREE; Locker moved into the Shop (and a character tap). 8 Instant green upgrade arrow on the Shop tile and the 3D stall; hold-to-buy repeat.
- 9 Creature voices (§8.6). 10 Collect-on-mat stack **rejected** for v2.0 (it changes the core income loop and needs an A/B test); the home-mat coin burst already exists as the pedestal coin pops and the delivery coin fly.
- 11 Rebirth KEEP/LOSE card (C19). 12 WAVE #N and Big Waves every 5th with a guaranteed rarer spawn (§9.0).
- 13 Tomorrow teaser toast and Day 5/Day 7 teasers (§9.2). 14 Unclaimed gifts carried over and auto-claimed (§9.3). 15 Index silhouettes with "Found in" hints (C7). 16 Featured Creature (§9.0). 17 Nametag titles and trophy board deferred to v2.1. 18 Streak loses 2 per missed day instead of resetting (§9.2).
- 19 Cloud save: already `SDK.data` first in `Platform`; now specified with a localStorage mirror (§9.8). 20 Rewarded slots: KEEP THEM after a splash and ×2 Welcome Back; "re-open a missed gift" is unnecessary since gifts are never lost. 21 SDK lifecycle (§10.7).
- 22 Music default 50, Sound 80; ambience breather every 2nd cycle. 23 First frame matches the thumbnail (§7.2, §10.7). 24 Meme names stay original (§1.5).
