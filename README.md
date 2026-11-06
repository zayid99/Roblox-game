# Swing or Splash

A Roblox-style 3D obby for [CrazyGames](https://www.crazygames.com): swing out over the sea on ropes, grab the weird creatures the last wave washed up, and get home before the next wave hits.

**Status: v2 ("Big Splash" update).** The v0.1 core loop plus a new toon look, a guided first session, an adaptive soundtrack and the retention features:

- **Swinging:** auto-targeting hooks with a screen reticle, a Perfect release window (gold ring, speed boost), swing chains, close calls, double jump, buoys and geysers
- **7 zones** gated by Rope Reach, 35 creatures with Gold, Diamond and Rainbow mutations, a Featured Creature each week
- **Obstacles that change by zone:** bounce buoys, Spring Coral pads that launch you high (Coral Reef on), drifting and swaying (pendulum) hooks (Lagoon on), crumble stones mid-gap that sink 1.2 s after you land (Stormy Seas to Volcano Bay) and volcano geysers
- **The wave:** a 70 s cycle with a warning, a wave meter that says "hits you in Ns", Golden Waves (every 4th) and Big Waves (every 5th), lighthouse launch pads, and a practice wave in the tutorial
- **Home base:** pedestals that earn cash every second, also while you're away (up to 1 hour, shown on a Welcome Back card)
- **Tutorial (FTUE):** 8 short steps that teach grab, release, collect, home, earn, shop and the wave, with a timing assist, a skip link and contextual hints afterwards
- **First Voyage** quest line (12 steps), **Daily** calendar with a streak bonus, **Playtime gifts**, the **Index**, the **Locker** (rope skins bought with Pearls), **Lucky Tide** tokens and **Rebirth**
- **Toon graphics:** custom tone mapping, toon water and foam, a storm mood during the surge, creature portraits, three quality tiers with an automatic pick
- **Adaptive audio:** synthesized music that switches to a hurry track at the warning, creature voices, footsteps and rope sounds (no audio files)
- **Settings:** music and sound volume, mute, quality, reduce motion, camera speed, invert Y, swing assist, replay tutorial
- **CrazyGames:** SDK lifecycle (loading, gameplay start/stop, happy time), optional rewarded ads ("KEEP THEM" after a splash, ×2 on the Welcome Back card) and midgame ads at natural breaks only, platform mute, cloud saves with a localStorage mirror

The game concept is in [docs/GAME_CONCEPT.md](docs/GAME_CONCEPT.md) and the v2 design spec in [docs/DESIGN_V2.md](docs/DESIGN_V2.md).

## Play it locally

```bash
npm install
npm run dev
```

Open the link it prints. A fresh browser starts the tutorial; clear the `swing-or-splash-save` localStorage key to start over.

### Debug keys

Add `?debug` to the URL (always on in `npm run dev`):

| Key | Effect |
|---|---|
| **F2** | Adds cash (doubles it, at least $1,000) |
| **F3** | Calm: skips to the wave warning. Warning: starts the surge now |

With `?debug` the game is also reachable as `window.__game` in the browser console. `?muteAudio=true` simulates the CrazyGames mute setting.

Module test pages: `?sandbox=ui`, `?sandbox=render`, `?sandbox=audio`, `?sandbox=tutorial` (see the comments at the top of each `src/*/sandbox/index.ts` for their parameters).

## Controls

| | Desktop | Phone / tablet |
|---|---|---|
| Move | WASD or arrow keys | Drag on the left side (floating joystick) |
| Jump / swing | **Space**: jump off an edge and hold to grab a hook, let go to fly (best on the gold ring) | **JUMP** button: hold to swing, it reads LET GO in the Perfect window |
| Double jump | Space again in the air | JUMP again in the air |
| Camera | Drag with the mouse, wheel to zoom, **Q** / **E** to turn | Drag on the right side |
| Shop | **U** | Shop tile |
| Free rewards (Daily, Gifts) | **G** | FREE tile |
| Index | **I** | Index tile |
| Locker | **L** (after the First Voyage) | Locker tab in the Shop, or tap your character |
| Settings | **P** | Gear button |
| Mute | **M** | Sound button |
| Close a panel | **Esc** | Life-ring button or tap outside |

Tap a creature on a home pedestal to hear it and see its idle animation.

## How it plays

1. Run to the edge of an island, jump, and hold to grab the glowing hook. Let go on the upswing (the gold ring) to fly to the next island.
2. Grab creatures. Farther zones have rarer ones: Common → Uncommon → Rare → Epic → Legendary → Mythic → Secret. Chaining hooks without touching an island adds a delivery bonus.
3. Get home before the wave sweeps through, or step on a glowing pad to launch up a lighthouse. If the wave catches you, you lose what you're carrying.
4. Creatures on your home pedestals earn cash every second, even while you're away (up to 1 hour).
5. Spend cash on Run Speed, Rope Reach (each zone's hooks need a longer rope), Swing Power, Carry Slots and Base Pedestals.
6. Golden Waves wash up rarer creatures and more mutations; Big Waves are faster and higher but leave a rare creature behind.
7. Rebirth resets cash and upgrades for a permanent cash multiplier.

## Build for CrazyGames

```bash
npm run build
```

- `dist/` is the folder to zip and upload in the CrazyGames developer portal. All paths are relative; the game is one JS file of about 310 KB gzipped plus 19 KB of CSS (fonts are inlined; the mobile homepage limit is 20 MB).
- `dist-single/index.html` is the same game as one self-contained file. The `?sandbox` pages are separate chunks and only work from `dist/`.

Basic Launch doesn't need the CrazyGames SDK. For Full Launch, uncomment the SDK script tag in `index.html`. `src/platform/crazygames.ts` then uses it for the lifecycle events, ads, the mute setting and cloud saves, and falls back to localStorage without it. Ads are only offered when the SDK is present.

## Tests

```bash
npm test           # unit tests: economy, save migration, quests, daily, gifts, combo, wave, tutorial bot, gap-crossing bot
npm run typecheck
```

The course test runs a bot through all 21 gaps with exactly the upgrades each zone requires (swaying and drifting hooks at every phase, and from every crumble stone); the tutorial tests run a bot through every FTUE step. If a change makes a gap or a step impossible, the tests fail.

## Project layout

```
src/
  main.ts        boot: tone mapping, fonts, loading screen progress, sandboxes
  Game.ts        the integration: frame loop (§10.7), event → feedback wiring (§5.3), panels,
                 hotkeys, save, ads and platform lifecycle
  contracts.ts   types shared by all modules
  core/          lead-owned helpers: the time-scale arbiter and the per-frame views
                 (HudView, AudioFrame, RenderFrame)
  game/          pure game logic, no rendering: course, physics and swing, wave, creatures,
                 economy, combo, save v2 and migration, progression (quests, daily, gifts,
                 locker, index, featured), rewards (unit-tested)
  tutorial/      FTUE state machine, its DOM overlay, contextual hints and the FTUE log
  render/        three.js graphics facade (GameRenderer): toon world, sea and sky, character,
                 creatures, wave, guides, cold open, particles, portraits, quality tiers
  ui/            HUD facade (Hud): parts, panels, effects, icons, logo, fonts and styles
  input/         keyboard, mouse and touch (floating joystick, taps)
  audio/         AudioDirector: synthesized music, SFX, creature voices and ambience
  platform/      CrazyGames SDK wrapper
tests/           Vitest tests and the bots
docs/            game concept, v2 design spec, performance baseline
```

## Next steps

- Playtest and tune swing feel, wave timing and upgrade prices
- v2.1: Daily Missions, the full rebirth ceremony, rope trails, Index milestone rewards
- Cover art and screenshots for the CrazyGames listing
