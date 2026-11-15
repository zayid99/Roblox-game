# Swing or Splash: first 10 minutes as a new player (UX research r1)

Build: `/home/user/Roblox-game/dist-single/index.html?debug` (Nov 14 09:41 build, HEAD 8165305). Driven by Playwright with a fake clock (true game speed), 960x540 desktop and 844x390 phone. Nothing in the repo was edited.

Work dir: `/tmp/claude-0/-home-user-Roblox-game/72973353-e2c0-514a-89a6-3b691316ec0d/scratchpad/research/r1/` (call it `R1/` below; every path below is under it).
- Harness: `R1/r1lib.cjs`. It has an in-page "brain" that plans trips with the real swing physics, and it learns its release timing after each fall, the way a player would.
- Runs: `R1/good.cjs` (competent, 11 min), `R1/clumsy.cjs` (clumsy, 2.5 min), `R1/phone.cjs` (phone, 80 s).
- Raw logs: `R1/good.out`, `R1/clumsy.out`, `R1/phone.out`. An earlier competent run with a bot that did not learn is in `R1/good-v1.out`.
- Screenshots: `R1/good/`, `R1/clumsy/`, `R1/phone/`. Reduced copies and montages are in `R1/sm/`.

Caveat: the competent bot is better than a real new player. It grabs instantly and sees through walls, so treat its timeline as a best case. Real players reach each beat later. That makes the waits and gates below worse, not better.

---

## 1. Timelines

### (a) Competent desktop player, 0:00 to 11:00 (`R1/good.out`)

| time | event |
|---|---|
| 0:00 | First frame. "RUN + JUMP + HOLD" pill with WASD and SPACE glyphs. JUMP HERE ring on the edge. Wave meter shows "WAVE PAUSED 1:30". (`good/000-first-look.jpg`) |
| 0:02 | Clicks the game. **The mouse locks** (cursor hidden; "ESC Show cursor" chip). |
| 0:04.5 | First hook grabbed (+$20). WAIT… SWING UP, then LET GO with slow-mo. |
| 0:06 | Lands on island 1 (+$20). 2 forced-spawn creatures sit at the landing and are caught in 1 s. |
| 0:07 | TAKE THEM HOME (wave timer set to 60 s). |
| 0:10 | Delivered home. "+$2/s added". Banner THEY EARN CASH. $116. |
| 0:12.6 | OPEN THE SHOP (press U). 0:14.5 shop opens. 0:16.5 buys Rope Reach for $40. Banner ROPE REACH UP. |
| 0:19 | GRAB MORE, BEAT THE WAVE (wave capped to 30 s). Goes to Coral Reef and back with 1 creature. |
| 0:40 | WAVE INCOMING → "YOU'RE SAFE Stay here till the wave passes". |
| **0:36 to 1:07** | **Stands at home for 31 s** (8 s warning + 18.5 s surge + walking). Nothing to do. |
| 1:07 | Surge ends. Within 3 s: YOU SURVIVED, Fresh creatures washed up, Featured this week, YOU'RE READY, Free rewards unlocked, Controls card, INDEX and FREE tiles pop, cash $277 → $1,033. (`good/067-panel-shop.jpg`) |
| 1:09 | Spends $1,033 at once: Reach 2 (does nothing, see F8), Carry 1, Pedestals 1, Speed ×4, Power ×2. |
| 1:23 | Reaches Coral Reef: Voyage 7 is done. **The tracker now shows Voyage 8, "Launch from a lighthouse during a wave". It stays there until 11:00.** |
| 1:29 to 2:03 | First falls after buying Swing Power. 4 falls in 11 s on gaps 3 and r3. |
| 1:38 | Base 6/6 full. Daily calendar pops up. |
| 2:15 | First "Base full: sold Toastopus for $30". From here on, most deliveries partly turn into $30 to $90 sales. |
| 2:24 to 2:53 | Wave 2: 29 s idle at home. |
| 2:53 to 4:25 | **About 90 s with nothing new.** Same islands, sales toasts, buys Power 4 and Pedestals 2 ($1,000 → base 8/8). |
| 3:59 to 4:25 | Wave 3: idle. "Golden wave next" toast. |
| 4:58 | New species (Waffle Walrus). Income $34/s. |
| 5:34 to 6:00 | Golden wave: idle. 6:14 first GOLD mutation (×2). This is the last new moment for 4 minutes. |
| **6:30 to 10:16** | **About 3¾ min with nothing new.** Waves at 7:06 and 8:35 (about 55 s idle). Buys Speed 7 and Power 6. Shop shows Rope Reach **$20K** greyed out (`good/523-panel-shop.jpg`). |
| 10:16, 10:57 | Two new species (Spaghettopus, Disco Clam). |
| 11:00 | Income $65/s. Cash earned in total: $21.8K. **Still only zone 2 of 7**: Reach level 2, Lagoon needs $20K. Voyage 8/12 since 1:23. FREE badge 5 and INDEX badge 11 unclaimed. |

Totals at 11:00:
- 152 grabs, 24 falls into the sea. Of those, 22 were the bot's own timing overshooting after Power upgrades.
- 7 waves, 0 splashes.
- 20 purchases. 12 species in the Index.
- **About 205 s of 650 s (31%) spent standing at home waiting out waves.** Idle stretches: 0:36 (37 s), 2:15 (39 s), 4:01 (24 s), 5:30 (30 s), 7:04 (27 s), 8:36 (28 s), 10:16 (17 s).

### (b) Clumsy desktop player, 0:00 to 2:30 (`R1/clumsy.out`, screenshots `R1/clumsy/`)

| time | event |
|---|---|
| 0:02 | Clicks the game. Mouse locks. |
| 0:02 to 0:12 | Does nothing. After 2 s the pill adds the WASD glyph. **Nothing else happens:** no camera nudge, no arrow, no bigger prompt. The edge-idle escalation only fires when the player stands near the edge. |
| 0:13.7 | Walks off the edge without jumping → "JUMP AT THE EDGE / Then hold SPACE to grab". Correct. |
| 0:16 | Taps SPACE → falls → "HOLD IT / Keep holding SPACE". Correct (`clumsy/019.jpg`). |
| 0:19.7 | Holds SPACE, lets go only 0.35 s after the grab (far too early). **Still lands on island 1.** Gap 0 is very forgiving. |
| 0:21 to 0:25 | Catches 2 creatures, swings home, delivers. |
| 0:28 | OPEN THE SHOP. A pointing hand spotlights the SHOP tile (`sm/lock.jpg`, full size `R1/locktest.jpg`). |
| 0:37 | Clicks the spotlighted SHOP tile. **Nothing opens: the mouse is pointer-locked, so the click goes to the canvas.** Reproduced on its own in `R1/locktest.cjs`. Locked: click → no panel. After ESC: the same click opens the shop. |
| 0:37 to 2:30 | **Stuck in the shop step for over 2 minutes.** The practice wave comes and goes (1:14 to 1:41, "YOU'RE SAFE Stay here"). +$276 reward. The prompt returns to "U OPEN THE SHOP" with no escalation, no unlock of the mouse, and no auto-open. |

The tutorial recovers well from the swing mistakes. It **does not** recover from a desktop player who tries to click the HUD while the mouse is locked.

### (c) Phone, 844x390, joystick and JUMP button, first 80 s (`R1/phone.out`, screenshots `R1/phone/`)

| time | event |
|---|---|
| 0:00 | Same layout. The "RUN + HOLD JUMP" pill's thumb glyph sits over the JUMP button label (`phone/000-first.jpg`). |
| 0:03.5 | Grab. 0:04.2 LET GO. **On a 390-px-high screen the big LET GO pill covers the character and the landing island**, exactly when the player has to judge the release (`phone/005.jpg`, `sm/p005.jpg`). |
| 0:06 to 0:10 | Catches 2, swings home, delivers. |
| 0:12.8 | Taps the SHOP tile and it opens; touch has no pointer lock. The shop panel shows only 2 rows at this height. Rope Reach is visible (`phone/shop.jpg`). |
| 0:15 to 1:03 | Wave step. The script ran off island 1 repeatedly (a harness limit, but no tutorial hint fires after the release step). The safety chip flips "Home 2 s" / "Pad 2 s" every 0.3 s. Splashed at 1:03: "SPLASH. FIRST ONE'S FREE." |
| 1:05 | **The Controls card (STICK / JUMP / DRAG, GOT IT) appears mid-swing in the centre of the screen**, over the action (`phone/069.jpg`). |

---

## 2. Friction points ranked by how likely they are to make a player quit

### F1. Forced idle during the practice wave right after the tutorial's fast part (0:36 to 1:07). Minute 0 to 1. Very high.
- **Evidence:** a competent player finishes everything active by about 0:36. They are then told "YOU'RE SAFE, Stay here till the wave passes" and stand still for **31 to 37 s**: an 8 s warning plus an 18.5 s surge.
  - The surge always starts at the far end of the about 770 m course. `WaveSim.update` adds `speed * dt` from `startZ` and travels at 42 m/s.
  - A zone-0/1 player is only reachable in the last 1 to 2 s of it.
  - This dead half-minute lands exactly at the 1-minute mark, where a third of players are lost.
- **Screenshots:** `good/044.jpg` (top-left of `sm/montage1.jpg`), `clumsy` 1:14 to 1:41.
- **Fix:**
  - (a) Start the surge just beyond the player's frontier instead of at `course.endZ`. In `src/game/sim.ts`, where the WaveSim is built or `surgeStart` fires: `frontZ = max(startZ, zoneEndZ(state.bestZone + 1))`. Alternatively, run the front at about 150 m/s until it reaches the player's furthest island. Either way the surge lasts about 3 to 5 s for new players and is still a visible wall.
  - (b) For the practice wave (`practiceWave` in `TutorialCore.buildFrame`), make it short and dramatic: about 5 s warning, about 3 s surge.
  - (c) Change `COPY.waveSafe` from "Stay here till the wave passes" to "Safe! Shop while you wait (U)" and open the shop spotlight. This makes the wait shopping time.

### F2. Desktop: the mouse lock makes the spotlighted SHOP tile (and every tappable toast) unclickable. Minute 0 to 1. High.
- **Evidence:** the first click on the game calls `Input.tryLock()` (`src/input/input.ts:319`).
  - At the shop step the tutorial shows a pointing hand on the SHOP tile ("OPEN THE SHOP").
  - Clicking it while locked does nothing. Only the small U keycap glyph works, or ESC then click, or walking into the stall.
  - The clumsy player was stuck for over 2 minutes with no escalation.
- **Screenshots:** `sm/lock.jpg`, `R1/locktest.jpg`. Repro: `R1/locktest.cjs`.
- **Same root cause elsewhere:** "Free gift ready" and "Needs Rope Reach" toasts have `onTap` (`Game.ts:1213`, `hints.ts:168`) but cannot be tapped while locked. Over 11 minutes, `giftsClaimed = 0` while FREE showed 5 ready items.
- **Fix:**
  - On desktop, call `document.exitPointerLock()` when a step needs the HUD. Use `TutorialCore.enter('shop')`, or have `Game` react to `tf.spotlight` / `tf.step === 'shop'`, and do the same whenever a tappable toast shows.
  - After 4 s in the shop step with no panel, auto-open the shop: `TutorialCore.tickStep` case `'shop'`, where `shopSpotlight` is already logged.
  - Make the U keycap the big glyph, and add "or click" only when the mouse is unlocked.

### F3. Waves make players wait about 27 to 31% of the session. Minutes 1 to 10. High.
- **Evidence:** every 96 s cycle costs about 26 s of "stand on home": 8 s warning plus 18.5 s surge.
  - In the 11-minute run, about 205 s were idle at home across 7 waves.
  - The HUD and guide arrow actively send new players home (`guide.ts` wave branch, banner "Get home or launch up a lighthouse").
- **Screenshots:** `good/144.jpg`, `good/344.jpg` (`sm/montage4.jpg` top row).
- **Fix:** the same as F1(a), applied to every wave while `bestZone` is low. Surge length should be about the time the wall needs to cross the zones the player can reach.
  - In `WAVE` (`src/game/config.ts`) consider `warning: 5` after the first wave.
  - Let `guideTarget` stop pointing home once `timeUntilReaches(p.z) > 10` s, so the player keeps catching until it is really time to run.

### F4. Lagoon costs $20,000: only 2 of 7 zones in the first 10+ minutes. Minutes 4 to 10. High (it ends the session's goal).
- **Evidence:** Rope Reach costs are `[40, 150, 20_000, …]` (`src/game/economy.ts:58`).
  - Level 2 ($150) gives 11.1 m, which **unlocks nothing**: Lagoon needs 11.9 m (level 3).
  - The next step is 133× the previous price. Income was $18/s at 2:15, $34/s at 5:00 and $65/s at 11:00.
  - Even saving every dollar from 1:10, Lagoon comes at about 10:50. With the cheap green Speed and Power buttons inviting spending, the competent bot had not reached it at 11:00.
  - The tracker's only other goal is "Unlock Lagoon: $20K" for 9 minutes. "Catch a Rare" (Voyage 11) also needs Lagoon.
- **Screenshot:** `good/523-panel-shop.jpg` (Rope Reach $20K greyed).
- **Fix:**
  - Make level 2 the Lagoon gate: Lagoon `minReach: 11.1` in `src/game/zones.ts`, or `reachAt` steps. Price it at about $1.5K to $3K so Lagoon opens around minute 4 to 6.
  - Move the $20K-scale wall to Stormy Seas.
  - Update `tests/pacing.test.ts` (`gateMin(sitting, 2) ≤ 6`).
  - In the shop, label the Reach row "UNLOCKS LAGOON" with a savings bar. Mark Speed and Power as "optional".

### F5. Voyage quest stuck at 8/12 for about 9.5 minutes because it contradicts the wave guidance. Minutes 1 to 10. High (no progress feedback).
- **Evidence:** Voyage 8 is "Launch from a lighthouse during a wave" (`src/game/quests.ts:42`).
  - Every wave the game says "You're safe at home / Stay here till the wave passes".
  - The tracker shows "FIRST VOYAGE 8/12" from 1:23 to 11:00 (`sm/montage4.jpg`). Quests 9 to 12 (3 to 5 min of income each, pearls, a cosmetic) sit behind it.
- **Fix:** do one of the following.
  - Reorder: Fill 4 pedestals → Buy Carry Slots → … with the lighthouse quest last.
  - Make the quest teach itself: at the warning, show "Quest: launch from the lighthouse pad!" with the beam and ring used in the tutorial `wave` step (`buildGuides` case `'wave'`).
  - Let quests progress in parallel.

### F6. Swing Power and Run Speed upgrades turn learned timing into falls. Minutes 1 to 4. Medium to high.
- **Evidence:** the same bot release (40° climb) lands gap 3 with Power ×1.0 and **overshoots** with Power ×1.4.
  - Isolated in `R1/diag.cjs`: Speed alone is fine; Power alone overshoots; releasing at 55° lands.
  - Power is the cheapest green button at the tutorial shop ($30) and stays cheap.
  - A perfect-timing bot fell 22 times in 11 minutes after buying it, including 4 falls in 11 s at 1:52 to 2:03.
  - The release assist (arc + slow-mo) is off after the first 3 swings (`SWING_SUPPORT`, `src/tutorial/steps.ts`).
  - A player who buys an upgrade and immediately starts falling will feel the game got worse.
- **Fix:**
  - Make Power scale pump strength, not launch speed on short (zone 0 to 2) gaps.
  - Or, after any Power or Speed purchase, give 2 swings of the green landing arc: set `struggleLeft` in `TutorialCore` from the `buy` UI event even when the tutorial is not active.
  - Hide Swing Power from the shop until Lagoon.

### F7. Information overload at the hand-over (1:07). Minute 1. Medium.
- **Evidence:** six messages and two new tiles in about 3 s, plus the Controls card with 12 hotkeys. The Daily calendar follows 30 s later.
  - On phone the Controls card appears mid-swing over the action (`phone/069.jpg`).
- **Fix:**
  - Queue the post-tutorial unlocks (`Progression` `unlock` events at `progression.ts:197`) one by one, on the next landing at home.
  - Show the Controls card only on desktop and only while standing on home (`TutorialCore` `ready` step: gate `controlsCard` on `sim.isOnHome() && p.mode === 'ground'`).
  - On touch, skip it: the player already used the stick and JUMP.

### F8. Base full almost immediately, so catches become "+$30" sales. Minutes 2 to 10. Medium.
- **Evidence:** base 6/6 at 1:38 and 8/8 at about 3:40. Pedestal costs are `[100, 1_000, 25_000, …]`.
  - The most frequent toast from 2:15 on is "Base full: sold X for $30 to $90" (about 25 of them). Income at that point is $18 to $65/s, so a sale is worth about 1 s.
  - The capture loop, the core fantasy, stops paying off within 2 to 3 minutes.
- **Fix:**
  - Pedestal level 3 at about $3K to $5K (`economy.ts:89`).
  - Change the delivery toast to lead with the upgrade, for example "+$2.1/s (replaced Toastopus)". Show the sale only as small text.
  - Give a one-time "Base full → buy pedestals" spotlight.

### F9. Rewards pile up unclaimed (FREE 5, INDEX 11). Minutes 3 to 10. Medium (lost motivation and power spikes).
- **Evidence:** `giftsClaimed: 0`. Timed gifts at 1, 3, 5, 7 and 10 min (`src/game/gifts.ts`) worth 1 to 3 min of income each, and the Lucky Tide, were never collected. The only path is a toast that cannot be tapped while locked (F2) or the G key.
- **Fix:** when a gift is ready and the player lands on home in calm, auto-open FREE once (like the Daily pop in `Game.frame`). Or grant gifts automatically with a coin-fly.

### F10. Phone: tutorial pills cover the character on short landscape screens. Minute 0 to 1. Medium on phone.
- **Evidence:** the LET GO pill is centred over the player and the landing (`phone/005.jpg`). The thumb glyph covers the JUMP label (`phone/000-first.jpg`).
- **Fix:** in `src/tutorial/tutorial.css` / `overlay.ts`, use `@media (max-height: 430px)` to pin the pill to the top under the wave meter at about 70% size. On touch, label the JUMP button itself ("HOLD" / "LET GO" is already in `TouchPart`) and drop the duplicate pill.

### F11. 10 s of idling at the start gets no escalation. Minute 0. Low to medium.
- **Evidence:** with no input, only the WASD glyph is added after 2 s (`grabNoMoveMs`). `grabEdgeIdleMs` only counts standing near the edge.
- **Fix:** after 6 s with no movement, pulse the JUMP HERE ring, run a 1 s camera pan from the player to the hook (reuse the `cameraNudge` effect), and size the pill to `'big'`.

### F12. The wave-safety chip flickers between "Home 2 s" and "Pad 2 s". Low.
- **Evidence:** seen in `phone.out` from 0:38 to 1:02. `safeTarget` picks the minimum ETA every frame, with no hysteresis.
- **Fix:** keep the previous target unless the new one is at least 1 s quicker (`core.ts:971`, `guide.ts`).

### What works (keep)
- Fail prompts are correct and immediate: "JUMP AT THE EDGE" (walked off) versus "HOLD IT" (tapped).
- Gap 0 is very forgiving.
- Forced-spawn creatures at the landing give 2 catches in 1 s.
- THEY EARN CASH lands well.
- Phone controls work end to end, and the touch Shop tile opens fine.
- The coin rewards early are generous: about $1K at 1:07.

---

## 3. Dead stretches of more than 45 s with nothing new (competent run)

| from to | length | what fills it |
|---|---|---|
| 0:36 to 1:07 | 31 s | Practice wave wait (under 45 s, but forced and at the 1-minute mark: F1) |
| 2:53 to 4:25 | about 90 s | Same 6 islands, "Base full: sold…" toasts, Power 4 and Pedestals 2. Includes a 26 s wave wait. |
| 6:30 to 10:16 | about 225 s | Two wave waits (about 55 s idle), Speed 7 and Power 6 (no visible gain beyond more overshoots), only sales toasts. Tracker frozen at Voyage 8/12 and Lagoon $20K. |

For a real player these stretches start earlier and last longer: they are slower to build income, so the $20K wall is further away.

---

## 4. Where the drop-off probably comes from (mapped to the live funnel)

- **0 to 1 min (a third lost):**
  - F1, the 30+ s of forced standing that begins about 35 to 40 s in.
  - F2, desktop players clicking the spotlighted SHOP tile with a locked mouse and getting nothing, with no recovery.
  - F7 hits right at 1:07.
  - Phone players additionally get F10 during the first release.
- **1 to 4 min:**
  - F3, waves keep forcing 26 s waits.
  - F6, purchases make you fall.
  - F8, catches are sold for nothing.
  - F5, the tracker stops moving at 1:23.
- **4 to 10 min (50 of 234 left at 10 min):**
  - F4, the $20K Lagoon wall. The only goal left is about 5 to 10 minutes of grinding the same 6 islands with no new zone, creature tier or quest.
  - F9, rewards go unclaimed.
  - Dead stretch 6:30 to 10:16.

Highest-leverage order for an 8 to 10 min average:
1. F1/F3: short surges for low zones.
2. F2: unlock the mouse and auto-open the shop.
3. F4: Lagoon at about 5 min.
4. F5: reorder Voyage.
5. F6: Power overshoot.
6. F8: cheaper pedestals and "upgrade" framing.
7. F7: staggered hand-over.
8. F10: phone pill.
