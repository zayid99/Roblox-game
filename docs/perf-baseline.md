# Performance baseline

Spec §6.1: draw calls (including the shadow pass), triangles and frame time at three fixed spots.
All numbers are `renderer.info.render` after a normal frame at 1280×720.

Frame ms come from headless Chromium with SwiftShader (software GL, no GPU), so they only rank spots against each other.
They are **not** device numbers; check GPU and CPU ms on a real Medium-class phone during Phase 3.

## v0.1 (before the v2 graphics pass, `v2-phase0`)

Measured through `Game.ts` (`window.__game` in dev), DPR 1, no shadow pass in v0.1.

| Spot | Setup | Draw calls | Triangles | Frame ms (SwiftShader) |
|---|---|---|---|---|
| Spawn | New save, home spawn, camera behind | 105 | 27 850 | 87 |
| Zone 3 mid-course | Player on the 2nd Lagoon island checkpoint | 89 | 25 890 | 62 |
| Home during a surge | Home spawn, `wave.forceSurge()` | 107 | 29 426 | 81–90 |

v0.1 already sat at the Medium call budget (100). Most of it was creatures: each wild creature cost 2–3 calls
(body, grey ring, rare beam), so about 32 creatures cost about 75 calls. No budget revision was needed: the v2
creature plan (one InstancedMesh for every glow disc, one for every rare beam, one for every legendary ring, body
only per creature, outlines and billboards pooled by distance) is what brings it down.

## v2 GameRenderer (`?sandbox=render`, `gfx.stats()`)

Same spots through the new facade: `&shot=spawn`, `&shot=zone3`, `&shot=wave` (home, base with 6 creatures, wave
held 40 m out), `&dpr=fixed` so the DPR stays at the tier cap. Calls include the shadow pass.
Measured before the zone props (P1) landed; props add 8 calls (7 zones + 1 shared glow mesh) on Medium and High.

| Tier (DPR) | Spot | Draw calls | Triangles | Budget (calls / tris) |
|---|---|---|---|---|
| Low (1.0) | Spawn | 41 | 52 k | ≤ 70 / ≤ 100 k |
| Low (1.0) | Zone 3 | 37 | 51 k | |
| Low (1.0) | Home during a surge | 44 | 54 k | |
| Medium (1.25) | Spawn | 52 | 88 k | ≤ 100 / ≤ 150 k |
| Medium (1.25) | Zone 3 | 51 | 87 k | |
| Medium (1.25) | Home during a surge | 71 | 93 k | |
| High (1.0 here, `min(dpr, 2)` live) | Spawn | 54 | 111 k | ≤ 140 / ≤ 250 k |
| High | Zone 3 | 56 | 111 k | |
| High | Home during a surge | 72 | 117 k | |

Where the triangles go (High): the sea grid (128² cells, 33 k), clouds (40 × 560, 22 k), terrain and decor (15 k),
creatures (≈ 7 k), the rest is small. Medium drops the sea to 96² and clouds to 24; Low to 64² and 12.

Where the calls go (Medium, spawn): sky, clouds, sea, shore, terrain, decor, palms, signs (one atlas), hooks + hull,
chains, balloons, lamps, pads, chevrons, pad rings, beams, podiums, lock plaques, pedestal labels, character (body,
hull, face), blob shadows, glow discs, beams, rings, particles (2 pools), ~20 visible creature bodies, ≤ 8 outlines,
≤ 6 billboards, plus the shadow pass (decor, palms, terrain casters near the player, character, nearby creatures).

## How to re-measure

1. `npm run dev`, open `/?sandbox=render&shot=spawn&q=medium&dpr=fixed` (also `zone3`, `wave`; `q=low|high`).
2. The overlay in the top-left shows calls, triangles, frame ms and DPR (`gfx.stats()`).
3. In the real game the lead's `?debug` overlay reads the same `gfx.stats()`.
