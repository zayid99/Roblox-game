# Swing or Splash (working title)

A Roblox-style 3D obby for [CrazyGames](https://www.crazygames.com): swing out over the sea on ropes, grab the weird creatures the last wave washed up, and get home before the next wave hits.

**Status: v0.1 playable prototype.** The whole core loop works:

- rope swinging, with hooks that auto-target
- 7 zones, each needing more Rope Reach
- 21 creatures, each with Gold, Diamond and Rainbow mutations
- the wave, Golden Waves, and lighthouse launch pads
- home pedestals that earn cash every second
- upgrades, Rebirth and the creature Index
- saving and offline earnings
- keyboard, mouse and touch controls

The game concept and market research are in [docs/GAME_CONCEPT.md](docs/GAME_CONCEPT.md).

## Play it locally

```bash
npm install
npm run dev
```

Open the link it prints. Add `?debug` to the URL to enable test keys: **G** gives cash, **T** starts the wave now.

## Controls

| | Desktop | Phone / tablet |
|---|---|---|
| Move | WASD or arrow keys | Drag on the left side (joystick) |
| Jump / swing | **Space**: jump off an edge and hold to grab a hook, let go to fly | **JUMP** button: hold to swing |
| Double jump | Space again in the air | JUMP again in the air |
| Camera | Drag with the mouse, wheel to zoom, Q / E to turn | Drag on the right side |
| Menus | **U** upgrades, **I** index, **M** sound, **Esc** close | Buttons at the top right |

## How it plays

1. Run to the edge of an island, jump, and hold to grab the glowing hook. Let go on the upswing to fly to the next island.
2. Grab creatures. Farther zones have rarer ones: Common → Uncommon → Rare → Epic → Legendary → Mythic → Secret.
3. Get home before the wave sweeps through, or step on a glowing pad to launch up a lighthouse. If the wave catches you, you lose what you're carrying.
4. Creatures on your home pedestals earn cash every second, even while you're away (up to 1 hour).
5. Spend cash on Run Speed, Rope Reach (each zone's hooks need a longer rope), Swing Power, Carry Slots and Base Pedestals.
6. Every 4th wave is a **Golden Wave**: rarer creatures and more mutations wash up afterwards.
7. Rebirth resets cash and upgrades for a permanent cash multiplier.

## Build for CrazyGames

```bash
npm run build
```

- `dist/` is the folder to zip and upload in the CrazyGames developer portal. All paths are relative, and the whole game is about 170 KB gzipped (the mobile homepage limit is 20 MB).
- `dist-single/index.html` is the same game as one self-contained file.

Basic Launch doesn't need the CrazyGames SDK. For Full Launch, uncomment the SDK script tag in `index.html`. `src/platform/crazygames.ts` then uses it for gameplay events, ads and cloud saves, and falls back to localStorage without it.

## Tests

```bash
npm test           # unit tests, including a bot that must swing across every gap
npm run typecheck
```

The course test runs a bot through all 21 gaps with exactly the upgrades each zone requires. If a level change makes a gap impossible, the test fails.

## Project layout

```
src/
  game/       pure game logic, no rendering: course generator, physics and swing,
              wave, creatures, economy, save state (unit-tested)
  render/     three.js visuals: world, blocky character, procedural creatures,
              sea and sky, the wave, particles, camera, creature icons
  ui/         HUD, upgrade shop, creature index, styles
  input/      keyboard, mouse and touch (virtual joystick)
  audio/      synthesized sound effects (no audio files)
  platform/   CrazyGames SDK wrapper
tests/        Vitest tests and the gap-crossing bot
```

## Next steps

- Playtest and tune swing feel, wave timing and upgrade prices
- Cover art and screenshots for the CrazyGames listing
- Rewarded ads at Full Launch ("keep your loot", 2× cash, lucky wave)
- Daily gift, eggs/pets, more zones, music
