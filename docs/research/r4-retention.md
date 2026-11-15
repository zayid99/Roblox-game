# Swing or Splash: retention and session-length gap analysis (r4)

*15 Nov 2026. Repo read-only. The live numbers come from the brief: average playtime about 5 min (goal 8–10), a third of players quit in under 1 min, about 13% reach 10 min, D1 retention about 1.5% (good is 10–15%).*

**What I could and could not verify.** WebFetch was blocked for allthings.how, the swing-obby wiki pages.dev mirrors and crazygames.com, so I used search-engine snippets for all the competitor facts. The fan wikis and guide sites often disagree with each other (rebirth counts, event lengths, codes). I mark those claims "(snippet)". I found no first-party retention data for any competitor. The two RoWatcher claims (simulators lose about 60% of peak CCU within 30 days without events; daily login bonuses "backfire") are unsourced opinion. I could not confirm whether the CrazyGames SDK offers leaderboards.

---

## 1. Benchmark: what the top games use, compared with Swing or Splash (SoS)

| Mechanic | Swing Obby for Brainrots | Escape Tsunami for Brainrots | Steal a Brainrot | Pet Sim 99 / Grow a Garden | +1 Jump obby (CG) | **SoS today (code)** |
|---|---|---|---|---|---|---|
| Core loop length | Swing out, grab, home (≈30–90 s) | Run out, grab, beat the tsunami | Conveyor buy or steal, defend | Hatch or plant, wait, harvest | Click, jump, win | ✅ 70 s wave cycle (`config.ts WAVE.interval`) |
| Passive base income, auto-collect | ✅ | ✅ | ✅ | ✅ (GaG: grows offline) | – | ✅ `state.tick()` auto-earns |
| Offline progress as the reason to return | weak | weak | weak | **✅ core (GaG)** | – | ⚠️ 15% rate, **1 h cap** (`ECONOMY.offlineRate/offlineCapSeconds`) |
| Rebirth | ✅ resets Speed and Reach, early | ✅ resets speed, many levels | ✅ needs cash plus specific brainrots; R1 = $500K (snippet) | ✅ ranks and prestige | ✅ | ⚠️ first one at **2.5–3.5 h** (`REBIRTH.baseCost 150M`; `tests/pacing.test.ts`) |
| Level up a collected unit | ✅ "level it up" (snippet) | – | – | ✅ enchants | – | ❌ |
| In-session timed events | ? | **✅ hourly random events, 5–10 min, with their own currency** (snippet) | ✅ Admin Abuse and luck events | ✅ weather (GaG), weekend drops | – | ⚠️ only fixed Golden (every 4th) and Big (every 5th) waves |
| Spin wheel, lucky blocks, chests | ? | **✅ event wheels** (e.g. Arcade wheel: 59.5% Cosmic, 33.1% Secret) and Lucky Blocks | ✅ Lucky Blocks | ✅ gifts and chests | – | ❌ (eggs are the only gacha) |
| Guaranteed timed drop in session | ? | – | **✅ Legendary on the conveyor every 5 min** (snippet) | ✅ restock timers | – | ⚠️ playtime gifts are mostly "N min cash" (`gifts.ts`) |
| Pets or equip slots | – | – | – | **✅ many slots, the main multiplier** | ✅ pets from eggs, early | ⚠️ 1 Buddy, +5–35% on deliveries only (`hatchery.ts BUDDY_BONUS`) |
| Quests / achievements / rank | – | – | – | ✅ area quests, rank rewards, achievements | – | ⚠️ 12-step Voyage, then only a "next zone" bar (`progression.ts tracker()`) |
| Daily missions | – | – | – | ✅ | – | ❌ (specified in DESIGN_V2 §9.1, deferred to v2.1) |
| Daily login | ? | group reward | ? | ✅ | ? | ✅ 7-day calendar with streak (`daily.ts`) |
| Collection index with rewards | – | – | ✅ | ✅ ("one of the strongest retention tools") | – | ⚠️ Index exists, +5 Pearls per discovery; milestones deferred (§9.7) |
| Temporary boosts (2× cash or luck) | ? | ✅ 2× server luck on the wheel | ✅ luck events | ✅ potions | – | ❌ `tokens.boost2xSec` is saved but nothing grants or uses it |
| Codes | none (snippet) | disputed | ? | ✅ | ? | ❌ (low value on the web) |
| Leaderboards / social proof | server players | server players | stealing (PvP) | trading | ? | ❌ (single-player) |

**What the hits have in common:** (a) something exciting and **random** happens every few minutes (an event, a lucky block, a conveyor Legendary); (b) there is **always a bar that is nearly full**; (c) a **reason to come back tomorrow is built into the loop** (offline growth, restocks, events), not just a login bonus.

---

## 2. What a new player sees in the first 10 minutes (typical player, from the code and pacing model)

| Time | Event | Source |
|---|---|---|
| 0:00 | Cold open (a decoy wave), then FTUE step 1: grab a hook | `render/coldOpen.ts`, `tutorial/steps.ts` |
| 0:43 | First delivery | `TYPICAL_FTUE.firstDeliverSec` |
| 1:48 | FTUE done; FREE, Index and Hatchery tiles unlock; Coral Reef opens | `TYPICAL_FTUE.doneSec`, `railState()` |
| ~3:00 | Second wave ends: **the first midgame ad** (3 min after boot, at `surgeEnd`) | `Game.ts:209, 1148, 1183` (`AD_GAP_MS = 3 min`) |
| 3–12 min | Shallows plus Coral Reef only. Goal bar reads "Unlock Lagoon: $20K" | `nextZoneGoal()`; reach costs `[40, 150, 20000…]` |
| **~5:00** | **Median player leaves** | live data |
| ~5:25 | **First Golden Wave** (wave #4) | `wave.ts isGoldenNumber: n % 4 === 3` |
| ~6:25 | Second midgame ad; first Big Wave (#5) | |
| 10:00 | First Lucky Tide (playtime gift) | `gifts.ts` |
| ~12:00 | Lagoon opens | `pacing.test.ts` (≤ 12 min) |
| 2.5–3.5 h | First rebirth (the tile only appears at 25% of $150M) | `REBIRTH_VISIBLE_AT = 0.25` |

**Takeaway:** the game's best moments (Golden Wave, Big Wave, Lucky Tide, the Voyage finale, the Locker, the next zone) all come **after** the median player has left. Between minutes 3 and 12 nothing new happens except upgrade levels, and an ad lands at minute 3.

### Systems that exist but go unused or hidden
1. **Golden Wave and Big Wave** first happen at about 5.4 and 6.4 min, after the median quit. **Voyage step 12** ("catch one after a Golden Wave") therefore can't be finished before about 6 min.
2. **`tokens.boost2xSec`** and the `Reward.boost2xSec` plumbing (`state.ts:64`, `rewards.ts applyReward`) are never granted or used. The HUD chip "2× 8:12" is specified (DESIGN_V2 C4) but not built.
3. **Lucky Tide** can only be used from inside the FREE panel (`free.ts:120`). The first token arrives at minute 10 (gift) or on Day 2.
4. **Pearls have no visible use until the Voyage is done.** The Locker unlocks only then (`progression.ts lockerUnlocked = voyageDone`). Players earn 5 Pearls per discovery from minute 1.
5. **Buddy** is chosen by tapping a creature on a pedestal or in the Hatchery panel. No hint teaches it (`tutorial/hints.ts` has no buddy hint).
6. **Rebirth** is invisible to almost everyone, so there is no long-term promise ("×2 forever").
7. **Offline earnings:** 15% for at most 1 h, so returning the next day pays about 9 min of income, the same as returning after 1 h. That is a weak D1 pull.
8. **Featured Creature** gets one toast and an Index badge. Nothing marks it in the world.
9. **The guide arrow** stops at Lagoon (`GUIDE_UNTIL_ZONE = 2`). That is fine, but after the Voyage the tracker shows only one long-horizon goal.

### First-minute drop (a third of players quit before 1 min)
This is mainly an FTUE and load problem, not a retention-feature problem, but it caps average playtime more than anything else. `tutorial/debugLog.ts` already records per-step times and sea falls, but only in localStorage. **Recommendation:** send step-reached events to the CrazyGames dashboard if possible, or at least run 10+ cold playtests, to find out whether players quit while loading, during the cold open, or at step 1–2 (failed swings). Don't build features for minute 1 until you know which.

---

## 3. Gap analysis (impact on avg playtime / D1, effort, risk)

| Gap | Playtime | D1 | Effort | Risk |
|---|---|---|---|---|
| Best moments come after the median quit (Golden Wave, Lucky Tide); ad at minute 3 | **High** | Med | **S** | Low |
| No "always nearly full" bar after the FTUE (only a 10-min zone goal) | **High** | Low | M | Low |
| Nothing exciting and random in minutes 3–12 (no lucky drops, events or wheel) | **High** | Low | M | Med (balance) |
| Weak "come back tomorrow" pull (1 h offline cap, no timer running overnight) | Low | **High** | M | Low |
| No daily missions | Med | **High** | M (already specified) | Low |
| No temporary boost, though the plumbing exists | Med | Low | S–M | Low |
| Coral Reef to Lagoon gap (about 9 min with no new content) | **High** | Low | S code / M tuning | Med (pacing tests) |
| Index rewards nothing beyond 5 Pearls | Med | Med | S–M (specified) | Low |
| Single Buddy slot, small bonus | Low–Med | Low | M | Med |
| No leaderboard, codes or social proof | Low | Low | M | Med (fake social proof would be dishonest; SDK support unverified) |
| Rebirth at 2.5–3.5 h | Low (session 1) | Med (long term) | L | High |

---

## 4. Top 10 proposals, ranked by impact and effort

### 1. Move the best moments earlier and keep ads out of minutes 0–8 (S, low risk)
- **The player sees:** a gold sky, the horn and "GOLDEN WAVE INCOMING" on the first wave after the tutorial (~3 min). Rarer, mutated creatures wash up, and Voyage step 12 becomes doable in session 1. In returning sessions, the session's first wave is Golden ("Welcome-back tide").
- **Numbers:** first session: wave #2 is Golden, the first Big Wave is wave #6 (≈7.5 min), then the usual cadence. No midgame ad until **8 min of play in the first session**, and only after a Golden Wave pays out. In later sessions, keep the current 3-min gap.
- **Code:** `wave.ts isGoldenNumber()` takes a per-session offset (the sim knows whether the FTUE ran this session). `Game.ts maybeMidgameAd()` checks `state.counters.playSec` (first session) or a session timer instead of `lastAdAt` set at boot (`Game.ts:209`). Update `pacingSim.ts` golden handling.
- **Why:** the moments that hook players currently fall right after the median quit. This is the cheapest change in the list, with no new art.

### 2. A playtime gift ladder with the prize on the HUD and a showcase gift at minute 8 (S, low risk)
- **The player sees:** a HUD chip next to FREE showing the next prize's icon and a countdown ("🎁 GOLD CREATURE 4:12"). From minute 1 the chip shows the minute-8 showcase prize: a portrait of a Gold creature one rarity above their zone, with "FREE in 6:48".
- **Numbers** (reworks `GIFTS`): 1 min = 1 min of cash · 2 min = **2× boost for 2 min** (teaches the boost, see #4) · 4 min = 15 Pearls · 6 min = Lucky Tide with a **USE NOW** button in the claim toast · **8 min = Mystery creature (Gold 70 / Diamond 30)** · 11 = 3 min of cash · 14 = free egg voucher (best unlocked zone) · 18 = 2× boost for 5 min · 25 = Mystery creature, Diamond or better.
- **Code:** `gifts.ts GIFTS`, `progression.ts railState()` (the FREE tile already has `timer`, add the prize icon), `ui/hud.ts`. Re-check the gift numbers in `tests/pacing.test.ts`.
- **Why:** a visible, specific prize a few minutes away is the classic Roblox "stay until X" hook. Right now the gifts are mostly "N min cash" and the good ones sit at minutes 10 and 20.

### 3. Overnight Tide Pool plus a longer offline cap: the D1 hook (M, low risk)
- **The player sees:** at the end of the tutorial a free **Moon Egg** sits in a glowing tide pool on the home island, with a countdown in the world and on the HUD. The first egg hatches in **15 min** (a session goal). Every later egg takes **8 h of real time**: "Your Moon Egg hatches in 7:42:10. Come back to crack it!" On the Welcome Back card, "Your Moon Egg hatched!" plays the existing egg reveal first, then the offline cash.
- **Numbers:** the egg rolls the best unlocked zone's rarity +1 with a 25% mutation chance and refills on its own after hatching. Offline cap goes from 1 h to **8 h** (rate stays 15%), so returning the next day pays about 72 min of income instead of 9. An optional rewarded ad halves the remaining time once per egg.
- **Code:** a new save field `tidePool: { readyAt: number; zone: number } | null` (`state.ts` plus migration), egg rolls in `hatchery.ts`, the hatch on load in `progression.ts welcome()`, a mesh in `render/hatchery.ts`, `config.ts ECONOMY.offlineCapSeconds`. The clock-rollback guard already exists (`ROLLBACK_GUARD_MS`).
- **Why:** the best-performing return trigger is something growing while you are away (Grow a Garden). A daily login bonus alone doesn't do this.

### 4. 2× Cash Boost, finishing the existing plumbing (S–M, low risk)
- **The player sees:** a sun chip "2× 4:59" under the income chip (DESIGN_V2 C4). Their income float turns gold. Tapping the income chip offers "Watch an ad: +5 min 2× cash" (stacks to 30 min). The boost counts down **only while the player is actively playing**, so stored minutes are a reason to keep playing.
- **Sources:** gifts at 2 and 18 min, daily calendar day 3 (as the spec intended), missions (#5), bottles (#7), rewarded ads.
- **Code:** `state.ts incomePerSec()` (the boost factor the spec reserved), `tokens.boost2xSec` ticking in `Progression.update()` when `ctx.active`, the HUD chip, a `runAd('rewarded')` hook in `Game.ts`.

### 5. Daily Missions from the end of the tutorial (M, low risk; already specified in DESIGN_V2 §9.1)
- **The player sees:** under the Voyage in the tracker, "TODAY 1/3": one easy (e.g. "Grab 15 hooks"), one medium and one hard mission, each with a bar and a reward chip. Finishing all 3 pays a bonus chest (a guaranteed mutated creature). The tracker then reads "New missions in 9:14:02".
- **Numbers:** easy = 3 min of cash, medium = 5 min + 10 Pearls, hard = Lucky Tide + 20 Pearls; all 3 = Mystery creature. Change from the spec: unlock missions at **FTUE end**, not at Voyage end, so session 1 players see the "tomorrow" reset.
- **Code:** new `src/game/missions.ts` seeded with `hashKey(dayKey)`, progress from `state.counters` deltas (already tracked in `progress.ts`), `Progression.tracker()` adds rows, save `missions: {day, ids, start, claimed}`.

### 6. Shorten the Coral Reef to Lagoon gap (S code / M tuning, medium risk)
- **Problem:** from about minute 3 to minute 12 the player farms the same 6 islands, and Rope Reach level 2 ($150) unlocks nothing.
- **Change:** move Lagoon to about **7 min** (Reach costs `[40, 150, 20000]` to roughly `[40, 400, 6000]` plus re-tuning `STAGE_INCOME` and egg prices) and Stormy Seas to about 16–20 min. Alternatively, give Reach level 2 a purpose, such as a bonus "Treasure Islet" off the path with a guaranteed Uncommon, or #7's bottles.
- **Code:** `economy.ts UPGRADES.reach.costs`, `hatchery.ts STAGE_INCOME`; the bands in `tests/pacing.test.ts` must be moved on purpose.
- **Why:** players should get a new zone, colour palette and creature tier within 5–8 minutes. That is what "next zone" goals in top simulators deliver.

### 7. Treasure Bottles: rare drops out at sea (M, medium risk to balance)
- **The player sees:** after a surge, a glowing bottle or chest washes up on the farthest island the player can reach, with a beam and an edge arrow. It takes a carry slot (a real choice) and is lost if the wave hits you. Delivered home, it opens with the egg-style reveal and shows its odds.
- **Numbers:** spawns after 30% of normal waves and 100% of Golden and Big Waves (a Big Wave leaves a "Legendary bottle"). Table: 50% = 3–8 min of cash · 20% = 15–40 Pearls · 12% = 2× boost for 5 min · 10% = Lucky Tide · 7% = mutated creature of zone rarity +1 · 1% = Rainbow creature.
- **Code:** a new carried item kind in `sim.ts` (spawn at `surgeEnd`, next to `rollCreature`), `state.carried`, reveal via `ui/reveal.ts`, rolls via `rewards.ts resolveReward`.
- **Why:** this is the Lucky Block and wheel excitement of Escape Tsunami and Steal a Brainrot, delivered through SoS's own swing-and-carry loop instead of a menu.

### 8. Sailor Rank: an always-moving progress bar (M, low risk)
- **The player sees:** a thin XP bar with "Rank 4" under the cash pill. Every action fills it. A rank-up is a banner plus a reward, about every 1.5–2 min early on and every 5–8 min by hour 1. Ranks carry titles ("Deckhand", "Rope Rookie", "Wave Dodger"…), which fills the v2.1 nametag slot.
- **Numbers:** XP: grab 1, perfect release 3, collect 3 × (rarity + 1), deliver 5, wave survived 10, new zone 50. Rank n needs 20 + 15·n^1.4 XP. Rewards: Pearls or cash at every rank; every 5th rank gives Lucky Tide, a rope skin, **a 2nd Buddy slot (rank 10)** or +5% income.
- **Code:** XP comes from events `progress.ts trackSimEvent()` already sees, plus `Progression` and the tracker/HUD.
- **Why:** it always gives a short-term goal and makes Pearls and the Locker relevant early. It also replaces the "nothing nearly full" stretch after the Voyage.

### 9. Index milestones and a mutation Luck Meter (S–M, low risk; milestones already specified in DESIGN_V2 §9.7)
- **The player sees:** Index rows with "COMMON 4/5 · +3%" and a CLAIM button, plus "+1%" per completed species (all 4 mutations). On the carry hotbar, a small sparkle meter: "Luck 31/40". At 40 catches the next creature is guaranteed Gold or better.
- **Code:** `progression.ts index()`, save `indexClaims`, `baseIncomePerSec()` multiplier, a pity counter in `state.counters` used by `rollCreature()` in `sim.ts`.
- **Why:** this is the "almost there" mechanic. It turns 140 Index entries into goals and guarantees a Gold moment every 8–10 minutes.

### 10. Sea Events: random in-session events (M–L, medium risk)
- **The player sees:** from minute 6, every 4–6 min, a 15-s heads-up banner and horn ("RAINBOW RAIN in 15 s"), then a 60–90 s event with an icon on the wave meter. Events: **Rainbow Rain** (mutation chance ×3) · **Treasure Fleet** (3 bottles from #7) · **Calm Seas** (wave timer frozen for 45 s, 2× delivery bonus) · **Feeding Frenzy** (every spawn point filled). A Lucky Tide can force one.
- **Code:** sits beside the Golden logic in `wave.ts` (`forceGoldenNext` pattern), with `sim.ts` spawn overrides, and the audio state "golden" agogo layer reused.
- **Why:** Escape Tsunami's hourly random events with their own wheels are its main session-extender (snippet). The schedule is compressed here for a single-player web session.

---

## 5. Considered, not in the top 10
- **Leaderboards:** single-player, and I could not confirm CrazyGames SDK support. Use personal bests instead ("Best chain today", which is already tracked in `counters.bestChainToday`). Never show fake player counts.
- **Codes:** no community channel on CrazyGames, so low value.
- **Daily spin wheel:** overlaps the calendar. A cheap later option is to show calendar day 5's mystery reward as a wheel animation.
- **Faster first rebirth:** high impact long term, but L effort and high risk. Short term, add a locked "Rebirth: ×2 cash forever" teaser row in the Shop so the long-term promise is visible.
- **Show hidden systems early (S each):** open the Locker at Voyage step 7 so Pearls have a sink; add a one-time "Make it your Buddy" coach hint on the first Uncommon delivery; add a "USE NOW" button for Lucky Tide on the wave meter; give the Featured Creature a world marker.

## 6. Suggested order
1. Week 1 (all S): #1, #2, #4, plus the hidden-system fixes. Expect a lift in average playtime fast.
2. Week 2: #3 (D1) and #5 (D1).
3. Then #6 (re-pacing, A/B if possible), #7 to #9, and #10 last.
4. Measure: playtime and D1 on the CrazyGames dashboard per release, and the FTUE step funnel for the first-minute drop.

## Sources (search snippets; pages themselves not fetched)
- Swing Obby for Brainrots: [AllThings.How guide](https://allthings.how/how-to-play-swing-obby-for-brainrots-upgrades-rebirth-and-mutations-explained/) · [ProGameGuides](https://progameguides.com/roblox/swing-obby-for-brainrots-beginners-guide-mutation-rebirth-more/) · [codes (none)](https://allthings.how/swing-obby-for-brainrots-codes/) · [RoWatcher](https://rowatcher.com/games/9753814298/swing-obby-for-brainrots)
- Escape Tsunami: [events and spawn mechanics](https://allthings.how/escape-tsunami-for-brainrots-all-events-and-spawn-mechanics/) · [all events (ProGameGuides)](https://progameguides.com/roblox/all-escape-tsunami-for-brainrots-events-spawn-times-rewards/) · [Arcade event](https://progameguides.com/roblox/escape-tsunami-for-brainrots-arcade-event-guide/) · [lucky blocks](https://gamertweak.com/lucky-block-escape-tsunami-for-brainrots/) · [speed guide (Beebom)](https://beebom.com/how-to-increase-speed-in-escape-tsunami-for-brainrots)
- Steal a Brainrot: [stealing, events, rebirths](https://allthings.how/steal-a-brainrot-roblox-efficient-stealing-events-and-rebirths) · [Rebirth 3 (conveyor Legendary every 5 min)](https://www.sportskeeda.com/roblox-news/steal-brainrot-rebirth-3-guide)
- Grow a Garden: [Sportskeeda](https://www.sportskeeda.com/roblox-news/why-grow-garden-popular) · [GameDiscoverCo](https://newsletter.gamediscover.co/p/what-grow-a-gardens-89-million-ccu) · [weather](https://bloxodes.com/wiki/grow-a-garden/weather)
- Pet Simulator 99: [rank rewards](https://marix.app/library/games/pet-simulator-99-rank-rewards-guide) · [achievements](https://bloxodes.com/wiki/pet-simulator-99/achievements) · [economy](https://rowatcher.com/news/pet-simulator-99-economy-explained-gems-enchants-and-the-true-cost-of-progress)
- General: [CrazyGames Basic Launch metrics](https://docs.crazygames.com/resources/basic-launch-metrics/) · [Obby +1 Jump per Click (CG page)](https://www.crazygames.com/game/obby-1-jump-per-click) · [Roblox: bringing players back](https://medium.com/roblox-developer/from-the-devs-a-glance-aat-tools-you-can-employ-to-bring-players-back-to-your-game-by-e04a80f56c5) · [RoWatcher: daily login bonuses](https://rowatcher.com/news/reward-schedules-in-roblox-why-daily-login-bonuses-backfire) · [RoWatcher: retention by genre](https://rowatcher.com/news/roblox-retention-by-genre-which-games-keep-players-longest) · [DevForum: playtime rewards](https://devforum.roblox.com/t/how-effective-are-playtime-reward/3652644)
