# Swing or Splash: gameplay QA (r5)

Method. Every gap of the default course (seed 20261105, 21 gaps) was crossed with the real `PlayerSim`, plus the sim's Perfect boost, at 1/120 s steps. Harness and raw output: `research/r5/` (`h.ts`, `gaps.txt`, `wave.txt`, `feat.txt`, `assist.txt`, `diag*.txt`, `fix_*.txt`).

Two upgrade profiles were measured at each zone's unlock:
- **Bare**: Rope Reach exactly at the zone's gate, with Speed 0 and Power 0.
- **Typical**: Reach at the gate, with the Speed and Power levels `tests/pacingSim.ts` owns when the gate is bought. Those levels are Coral 2/2, Lagoon 6/5, Stormy 10/8, Kraken 12/10, Volcano 13/11 and Secret Reef 15/12. That is run speed 11.5 to 21.3 m/s and power ×1.2 to ×2.2. A slower player (`tripTimeMult` 1.5) owns the same levels.

Two difficulty measures are reported:
- **Pitch grid**: the 28 release policies of `tests/bot.ts` (pitch × regrab delay). It reports the share that land and the share that end in the sea.
- **Release window**: release time swept in 10 ms steps from 0.05 to 3 s after each grab. Earlier hooks are fixed at the centre of their best window, and the bot holds the stick toward the target island. The window is the longest run of release times that still lands on the far island. "Tightest" is the bottleneck hook. For moving hooks it is given as the minimum–maximum over 4 hook phases.

As a rough guide to human timing spread, a window under 150 ms is very hard and 150–300 ms is hard.

## Per-gap results

| Gap | Zone | Gap len (m) | Hooks | Moving | Reach gate (m) | Edge→hook dist (m) | Bare (reach only): pitch-grid ok / sea | Bare: tightest release window (ms, min–max over hook phase) | Typical upgrades: grid ok / sea | Typical: tightest window (ms) |
|---|---|---|---|---|---|---|---|---|---|---|
| 0 | 0 Shallows | 9.1 | 1 |  | 9.5 (start) | 8.7 | 100% / 0% | 1800 | 100% / 0% | 1800 |
| 1 | 0 Shallows | 9.6 | 1 |  | 9.5 (start) | 8.6 | 100% / 0% | 1800 | 100% / 0% | 1800 |
| 2 | 0 Shallows | 9.2 | 1 |  | 9.5 (start) | 8.5 | 100% / 0% | 1790 | 100% / 0% | 1790 |
| 3 | 1 Coral Reef | 12.7 | 1 |  | 10.3 | 11.0 | 28% / 71% | 1550 | 100% / 0% | 1900 |
| 4 | 1 Coral Reef | 11.5 | 1 |  | 10.3 | 10.4 | 100% / 0% | 1980 | 100% / 0% | 1800 |
| 5 | 1 Coral Reef | 11.0 | 1 |  | 10.3 | 9.5 | 100% / 0% | 1910 | 100% / 0% | 1700 |
| 6 | 2 Lagoon | 15.5 | 1 |  | 11.9 | 12.3 | 85% / 14% | 1630 | 85% / 14% | 1210 |
| 7 | 2 Lagoon | 14.7 | 1 | sway | 11.9 | 12.5 | 82% / 17% | 1210–1800 | 89% / 10% | 1110–1270 |
| 8 | 2 Lagoon | 14.5 | 1 | drift | 11.9 | 12.7 | 85% / 14% | 1200–1710 | 85% / 14% | 1240–1260 |
| 9 | 3 Stormy Seas | 25.0 | 2 |  | 13.5 | 12.1 | 28% / 71% | 1040 | 39% / 60% | 430 |
| 10 | 3 Stormy Seas | 25.5 | 2 | sway | 13.5 | 11.9 | 45% / 50% | 860–1230 | 30% / 69% | 420–1070 |
| 11 | 3 Stormy Seas | 24.3 | 2 | drift | 13.5 | 12.7 | 41% / 57% | 730–870 | 30% / 67% | 380–460 |
| 12 | 4 Kraken Deep | 29.6 | 2 |  | 15.1 | 13.6 | 64% / 35% | 1200 | 14% / 85% | 150 |
| 13 | 4 Kraken Deep | 28.9 | 2 | sway | 15.1 | 13.9 | 66% / 33% | 730–1080 | 36% / 63% | 230–680 |
| 14 | 4 Kraken Deep | 27.4 | 2 | drift | 15.1 | 13.0 | 60% / 38% | 800–1520 | 28% / 71% | 80–400 |
| 15 | 5 Volcano Bay | 31.3 | 2 |  | 16.7 | 15.9 | 57% / 39% | 820 | 17% / 82% | 400 |
| 16 | 5 Volcano Bay | 32.1 | 2 | sway | 16.7 | 14.1 | 55% / 42% | 600–1540 | 14% / 84% | 110–480 |
| 17 | 5 Volcano Bay | 32.5 | 2 | drift | 16.7 | 14.7 | 59% / 37% | 960–1410 | 8% / 91% | 440–470 |
| 18 | 6 Secret Reef | 48.6 | 3 |  | 18.3 | 15.6 | 46% / 50% | 350 | 25% / 75% | 110 |
| 19 | 6 Secret Reef | 50.1 | 3 | sway | 18.3 | 14.6 | 42% / 56% | 210–400 | 6% / 93% | 90–230 |
| 20 | 6 Secret Reef | 48.9 | 3 | drift | 18.3 | 16.7 | 32% / 62% | 330–600 | 7% / 92% | 190–200 |

Issues by zone:
- **Shallows (0)**: trivial. Any release lands, so the tutorial area is fine. Coming home later is a different story. A player with Stormy-level Speed overshoots these 11–13 m islands on an early release. On gap 1 heading home with Speed 10 / Power 8, 24 of 28 policies fly past the island. The time sweep shows releases at 0.05–0.40 s overshoot, while 0.41–1.4 s lands.
- **Coral Reef (1)**: the first Coral gap (3) is risky for a player who bought only the tutorial's Reach. Any release before 0.56 s into the swing slams into the island's front wall about 1.8 m below the lip, and 71% of policies fail. With the typical Speed 2 / Power 2 it is 100%.
- **Lagoon (2)**: fine. Success is 82–89% and windows are at least 1.1 s. Early releases hit the cliff (wall falls).
- **Stormy Seas (3)**: the first 2-hook zone. The second hook's window drops to 380–460 ms with typical upgrades, and grid success is 30–39%.
- **Kraken Deep (4)**: with typical upgrades, the windows are 150 ms (gap 12) and 80–400 ms (gap 14, drift). Grid success is 14–36%. With bare stats the windows are 730–1200 ms, so **upgrades make it harder**.
- **Volcano Bay (5)**: with typical upgrades, grid success is 8–17% and windows are 110–480 ms. The swaying hook's phase alone changes the window by about 4× (gap 16).
- **Secret Reef (6)**: the third hook is the bottleneck. Typical windows are 110 ms, 90–230 ms and 190–200 ms, and grid success is 6–25%. Even bare stats give only 210–600 ms.
- **What causes the sea falls**: in Stormy and later, more than 90% of typical-profile sea falls in the sampled gaps (9, 12, 15, 18) are **overshoots** past the 8.5–11 m far island. They are not short falls. The `diag.txt` table holds Speed and Power apart: Run Speed is the main cause, and Power is second.
  - The air-control cap and the air-drag floor in `PlayerSim.updateMove` both use `stats.runSpeed`. Holding W in the air therefore pushes you up to your run speed (21 m/s), and that speed bleeds off at only 0.35/s.
  - Meanwhile the islands get shorter as you go out (`len` 11–13 m in Shallows, 8.5–10 m in Volcano and Secret Reef).
  - Up to 12 of 28 landings at 15–24 m/s also **skid off** the far edge when the stick is released (`diag2.txt`). Landing keeps all horizontal speed, and friction is 60 m/s².
- **No ledge forgiveness**: many sea falls touch the target island's front face first ("wall" in `gaps.txt`). In several of them the feet were 0.06–0.3 m below the lip: gap 10 at 0.28 m, gap 13 at 0.10 m, gap 15 at 0.11 m, gap 17 at 0.17 m, gap 20 at 0.06 m. Hitting a wall zeroes velocity (`moveAndCollide`), so you slide down into the sea.

Fix experiments (typical profile, zones 3–6, grid success before → after):

| Change | Result |
|---|---|
| Air cap of 11 m/s instead of `stats.runSpeed` (air only) | Gap 9: 39→60%. Gap 12: 14→25%. Gap 19: 6→25%. Gap 20: 7→22%. Windows improve a little. |
| ... plus Stormy–Secret island `len` [13, 15] | Gap 9: 39→67%. Gap 11: 30→59%. Gap 12: 14→32%. Gap 14: 28→51%. Gap 16: 14→33%. Gap 18: 25→46%. Gap 19: 6→44%. Gap 20: 7→33%. Stormy windows: 430→1000 ms. |
| Cap horizontal speed after release (22 / 26 m/s) | Little or no gain. |
| Cap speed into the swing at the grab (12 m/s) | Helps Kraken (150→510 ms) but hurts grid success. |

Even with both of the first two changes, Volcano and Secret Reef bottlenecks stay at 140–300 ms. That needs a landing aid as well (problem 1 below).

## Wave: can you get home or to a lighthouse after the warning?

The wave starts at `course.endZ − 40` = z −767 and moves at 42 m/s (Big Waves: 52). Counting from the 8 s warning, it reaches home after **26.3 s** (Big Wave: 22.8 s). The times below are best-policy route times at the typical speed for that zone. The success figures are pitch-grid products, so they are a pessimistic proxy for first-try odds.

| Zone | Islands | Home after warning | Lighthouse after warning | Verdict |
|---|---|---|---|---|
| Shallows, Coral, Lagoon | 1–9 | Needs 1.6–17.4 s | Needs 1.2–9 s | All safe, including Big Waves. |
| Stormy (3) | 10 | 24.4 s: misses a Big Wave by 1.6 s | LH3 ahead: 3.0 s of 19.8 s available, 32% | Big-Wave trap for home. Use LH3. |
| | 11–12 | 27.5 s and 29.4 s: too late | 1.2 s and 3.0 s of 19.8 s; from island 12 it is 14% (crossing gap 11 homeward) | Lighthouse is the only refuge. |
| Kraken (4) | 13–15 | 41–48 s: impossible | 1.2–4.8 s of 17.1 s; 14–18% from the side islands | Lighthouse only, and it relies on a 1-in-6 crossing. |
| Volcano (5) | 16–18 | 52–58 s | 1.2–3.0 s of 14.2 s; 4% (island 16) and 32% (island 18) | Island 16 is close to a trap. |
| **Secret Reef (6)** | **19** | Impossible | **LH6 is ahead, across the hardest gap (gap 19: 3 hooks, swaying hook, 6% success). About 5–6 s if the first try works, with 10.4 s available. The fallback, LH5, is behind across gap 18, the other 3-hook gap.** | **Trap** |
| | 20 | Impossible | 1.2 s (on the lighthouse island) | Safe |
| | **21** | Impossible | **LH6 is behind, across gap 20 (3 hooks, drifting hook): 5.8 s, 7%. The wave reaches island 21 9.1 s after the warning.** | **Trap** |

From Stormy on, `TYPICAL_TRIP_SEC` (113–261 s) is longer than the 70 s wave cycle. Every deep trip therefore has to shelter at a lighthouse, and there is only one per zone, on the middle island. A sea fall during the escape costs 0.6 s plus the restart from the checkpoint, so in Kraken and later one miss usually means the creatures are gone.

## Spawns and hazards

- **Creature spawns**: all 45 spawn points sit on the island top, at least 2.2 m from an edge, and clear of towers and pads. No creature is unreachable.
  - Six spawn points sit 2.3–2.7 m from a spring or geyser centre. The radii are 1.1 m and 1.5 m, and pickup radius is 1.7 m, so a player picking these up is likely to step on the pad. The affected islands are 10, 12, 18 (×2), 19 and 21.
  - Geyser placement (`course.ts`) never checks spawn points. Spring placement does check them, with a 2.2 m clearance, which is too small.
- **Spring coral** is a sea trap. Walking onto one at run speed launches you straight up at 22 m/s with up to 6 m/s horizontal speed, a flight of about 1.3 s. Air control then accelerates you to your run speed. Results by reaction (`feat.txt`):
  - Keep holding the stick: **48/48 land in the sea**.
  - Let go of the stick: 29/48 sea.
  - Steer back to the island centre: 0/48 sea.

  Springs sit 1.5–3.3 m from a side edge and at least 2.2 m from the front or back edge.
- **Geysers (Volcano)**: every vent sits 2.2 m from the island's far edge, 1.0–2.8 m from the straight running line, with a 1.5 m radius. The eruption launch keeps horizontal speed. A runner caught by an eruption who is not holding jump is thrown into the gap: **3/3 into the sea**. Geyser 122 is also 2.9 m from the launch pad of the Volcano lighthouse, which is the wave escape.
- **Bounce buoys** are fair and useful. All 12, in Coral through Kraken, bounce you into hook reach, and you reach the island in both directions. There are none in Volcano or Secret Reef, where falls are most common.
- **Crumble stones** grab a hook 0.09 s after you jump off them, but rarely lead anywhere. Only 4 of 18 direction trials reached an island (Stormy 3/6, Kraken 1/6, Volcano 0/6). They mostly delay the sea fall by 1.2 s. They are fair but rarely a real rescue. Some typical-profile swings also land on a stone mid-gap and then sink ("stone" in `gaps.txt`).
- **Swaying and drifting hooks** move ±2.3 m along the course (3.6 s period) and ±2.5 m sideways (4 s period). Hook phase alone changes the final-swing window 2–4×: gap 16 bare 600–1540 ms, gap 14 typical 80–400 ms, gap 13 typical 230–680 ms. They are readable only if the hook's phase or position is shown clearly.

## Release timing and Swing Assist

- **After the tutorial** (Coral at the gate): the window is long (1.5–1.9 s) if you hold through the bottom. Early releases are punished by the cliff, not by falling short.
- **Swing Assist** (`src/tutorial/core.ts` and `steps.ts`): after the tutorial's first 3 swings, it only switches on after **3 sea falls in a row from the same island** (`STRUGGLE.falls`). It then gives an arc and 0.5× slow motion for 2 swings, and the Settings toggle controls only this. The window it highlights comes from `predictRelease`, which assumes **no stick input and no Perfect boost**. Real players hold W. Of the final-swing release times that actually land (`assist.txt`), the assist window covers:
  - Coral: 1230 of 1490 ms.
  - Lagoon (typical): 820 of 1440 ms.
  - Stormy (typical): 150 of 510 ms, plus 60 ms of false "OK" that falls in.
  - Kraken: 290 of 510 ms.
  - **Volcano: 100 of 770 ms.**
  - **Secret Reef: 20 of 160 ms.**

  So the assist is good early and close to useless exactly where players struggle.
- **Controls**: input yaw is latched while the stick is held (`Game.updateInputYaw`), and the camera stops auto-following mid-swing, so the pump direction does not drift. That is good. Jump is Space only, and clicking a locked mouse picks targets rather than swinging. That is acceptable, but a mouse-button swing is the usual convention. No control-feel bugs were found in the sim. Rendering and pointer lock were not play-tested in the browser.

## Ranked problems and fixes

1. **Upgrades make late gaps harder, and the far islands are too short to land on at speed.**
   - Evidence: typical-profile success is 6–36% in Kraken through Secret Reef. Bottleneck windows are 80–200 ms, against 210–1200 ms with bare stats. more than 90% of the falls are overshoots, and some landings skid off.
   - Fixes:
     - (a) In `src/game/player.ts` `updateMove`, air branch: replace `stats.runSpeed` in the air cap and the drag floor with a new constant `PHYS.airMaxSpeed` of about 11. Run Speed should only affect running.
     - (b) In `src/game/zones.ts`, change `len` for Stormy through Secret Reef from about [8.5–11] to [13, 15].
     - (c) Landing aid: on `land` onto an island top, clamp horizontal speed to `max(stats.runSpeed, 12)`. This removes skid-offs. Optionally add an air brake: double `airAccel` while the stick opposes the velocity.
   - Measured result of (a) + (b): grid success roughly doubles (gap 19: 6→44%), and Stormy windows go from 0.43 to 1.0 s. Volcano and Secret Reef still need (c).
2. **Secret Reef wave traps (islands 19 and 21), and lighthouse escapes in Kraken and Volcano that need a 4–18% crossing.** Fix one of these:
   - Raise `WAVE.warning` to about 12 s in zones 5 and later. For example, in `sim.ts` or `wave.ts`, add `+ (bestZone ≥ 5 ? 4 : 0)` to the warning.
   - Add a second lighthouse in 3-island zones from Kraken on. In `course.ts`, place lighthouses at `i === 0 || i === 2` instead of the middle island.
   - Move the wave start (`WaveSim(course.endZ − 40)` → `endZ − 120`), which adds about 2 s everywhere.
3. **Geysers fling runners into the gap.**
   - In `src/game/player.ts` `checkGeysers`, scale horizontal velocity to about 0.2 on launch.
   - In `course.ts` geyser placement, put the vent at the home-facing end (`s.max.z − 2.2`), at least 3 m off the run line, at least 3.5 m from spawn points, and at least 5 m from the lighthouse pad.
4. **Spring coral launches you into the sea, and creatures spawn next to springs.**
   - Change `SPRING.maxHorizontal` from 6 to about 2, or point the launch's horizontal part toward the island centre.
   - In `course.ts` `clear()`, raise the spawn clearance from 2.2 to 3.5 m. Apply the same check to geysers.
5. **No ledge forgiveness, so near-misses at the lip become sea falls.** In `src/game/physics.ts` `moveAndCollide`, or in `player.ts`, add a mantle or step-up. When a horizontal hit happens against an `island` solid, the feet are within 0.8 m below its top, and the player is moving toward it, snap them onto the top.
6. **Swing Assist is miscalibrated where it matters.**
   - In `src/game/predict.ts` `predictRelease`, take the current stick input (step the ghost with the held `moveX`/`moveZ`) and apply `COMBO.perfectBoost` when the release would rate Perfect. Count only `island`/`home` landings as OK, not `stone`.
   - Change `STRUGGLE.falls` from 3 to 2.
   - Consider showing the arc (without slow motion) on any gap from Stormy on while `swingAssist` is on.
7. **Moving hooks change difficulty 2–4× by phase.** Keep them, but cut `SWAY.angle` from 0.34 to about 0.22 and `DRIFT.amp` from 2.5 to about 1.5, or show a clear phase cue. Avoid putting a moving hook on the last hook of a 3-hook gap.
8. **There are no buoys where falls are worst.** In `course.ts`, change the buoy loop condition from `gap.zone > 4` to `gap.zone > 6`, so Volcano and Secret Reef get buoys.
9. **Homeward overshoot through the early zones at high Speed.** This is covered by fix 1(a). Otherwise, make Shallows and Coral islands longer, or clamp the landing as in 1(c).
10. **Coral Reef's first gap with only the tutorial's Reach**: 71% of policies hit the cliff on an early release. Fix 5 covers it. Alternatively, have the tutorial grant Swing Power 1 alongside the Coral gate.
