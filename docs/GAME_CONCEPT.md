# Swing or Splash: Game Concept and Market Research

*Research date: 5 November 2026. Target platform: [CrazyGames](https://www.crazygames.com) (web, desktop and mobile).*

## TL;DR

**Build a Roblox-style rope-swinging obby. You swing out over a cartoon sea, grab the weird creatures the last wave washed up, and race home before the next wave hits.**
Creatures you bring home earn cash every second. Cash buys longer ropes, stronger swings and more carry slots, so you can reach farther zones with rarer creatures.

It combines two game loops that are proven in 2026. I could not find any game on CrazyGames that combines them:

- **Escape-the-wave obbies** are among the biggest Roblox-style games on CrazyGames. *Escape Tsunami for Brainrots!* has about 337K votes. The format is already crowded there, with at least 5 copies.
- **Swing obbies** broke out on Roblox this year. *Swing Obby for Brainrots* (Feb 2026) has about 386M visits and peaked at about 120K concurrent players. On CrazyGames I found no Roblox-style swing obby, only unrelated grapple and web-swinging games.

The swing makes the game look and feel different from the dozens of "+1 per click" and "escape for brainrots" clones. The collect, base income and upgrade loop is the structure that keeps players on CrazyGames longest and brings them back the next day.

---

## 1. What the research shows

### 1.1 How CrazyGames judges a new game

Every game starts in **Basic Launch**, a test with real players that lasts 7 to 21 days and needs at least 500 plays. It needs no SDK and shows no ads. CrazyGames then decides on **Full Launch** (SDK, ads, full traffic) based on three numbers ([Basic Launch guide](https://docs.crazygames.com/resources/basic-launch-metrics/)):

| Metric | What it measures | "Good" according to CrazyGames |
|---|---|---|
| **Conversion** | % of players who stay at least 1 minute | 80%+. Top games load in under 10 s and are under 20 MB |
| **Average playtime** | Minutes per visit | 10+ minutes |
| **Day-1 retention** | % who come back the next day | 10–15% |

For comparison, the platform averages are: action games about 13 min and 8.1% D1; hypercasual 8.6 min and 6% D1; all games 6.7% D1 ([Ad tips for action games](https://docs.crazygames.com/resources/monetizing-action/)).

**What this means for the design:** the game needs instant action in the first minute, a "one more run" loop, and a reason to come back tomorrow. The "collect → earn passive income → upgrade" loop delivers the second and third, which explains why it dominates CrazyGames' Roblox-style games.

### 1.2 What's working on CrazyGames (Roblox-style games)

| Game | Format | Votes* | Rating | Released |
|---|---|---|---|---|
| [Escape Tsunami for Brainrots!](https://www.crazygames.com/game/escape-tsunami-for-brainrots-wfe) | Run out, grab, escape the wave | ~337K | 8.7 | Feb 2026 |
| [Obby: +1 Jump per Click](https://www.crazygames.com/game/obby-1-jump-per-click) | Clicker obby | ~107K | 8.6 | updated Jan 2026 |
| [Speed per Click: Obby](https://www.crazygames.com/game/speed-per-click-obby) | Clicker obby | ~87K | 8.4 | n/a |
| [Obby: Pull a Sword](https://www.crazygames.com/game/obby-pull-a-sword) | Strength sim + obby | ~78K | 8.9 | n/a |
| [Escape Lava for Brainrots!](https://www.crazygames.com/game/escape-lava-for-brainrots) | Escape the lava | ~47K | 8.4 | Mar 2026 |
| [Obby: Gym Simulator, Escape](https://www.crazygames.com/game/obby-gym-simulator-escape) | Sim + escape | ~44K | 8.9 | Oct 2025 |
| [Run and Jump for Brainrot](https://www.crazygames.com/game/run-and-jump-for-brainrot) | Jump, collect, carry to base | ~43K | 8.8 | May 2026 |
| [Obby Escape from Tsunami Brainrot](https://www.crazygames.com/game/obby-escape-from-tsunami-brainrot) | Escape the wave | ~23K | 8.9 | Feb 2026 |
| [Web Slinging Race](https://www.crazygames.com/game/web-slinging-race) | Swinging race (not an obby) | ~23K | 8.8 | Dec 2022 |
| [Barry's Prison Escape!](https://www.crazygames.com/game/barry-s-prison-escape-obby) | Story escape obby | ~20K | 8.6 | Mar 2026 |
| [Grapple Rush](https://www.crazygames.com/game/grapple-rush-ynv) | First-person grapple time trial | ~1.8K | 9.1 | Oct 2026 |

\*Votes are likes plus dislikes on the CrazyGames page as of the last time search engines indexed it, so today's numbers are higher. I use them as a rough stand-in for play counts. The CrazyGames site was blocked in my research environment, so all figures come from search-engine snapshots.

What this tells us:

- **Roblox formats ported to the web do very well on CrazyGames**, and the developers who port them first get the most plays.
- **"+1 per click/second" obbies are saturated.** I found at least 12 of them. Brainrot-themed games number 20+, and escape-the-wave/lava games at least 5.
- **The collect → carry → base loop works.** *Run and Jump for Brainrot* got about 43K votes in its first 2 months.
- **Swinging has its own audience on CrazyGames** (a Spider-Man games tag, *Web Slinging Race*), but nobody there has made the Roblox-style swing obby yet. Swing-obby ports have appeared only on smaller portals ([Playgama](https://playgama.com/game/swing-obby-for-brainrots), [Kiz10](https://kiz10.com/obby-swing-for-brainrots)), and some are poorly rated. Good swing physics would set our game apart.

### 1.3 What's working on Roblox (2026)

- **[Swing Obby for Brainrots](https://obbywiki.com/wiki/Swing_Obby_for_Brainrots)** (released 18 Feb 2026). You swing between platforms, collect creatures and bring them home for passive income, buy Power/Reach/Carry upgrades, then rebirth ([guide](https://allthings.how/how-to-play-swing-obby-for-brainrots-upgrades-rebirth-and-mutations-explained/)). About 386M visits, with a peak of about 120K concurrent players ([Profitable snapshot, Jul 2026](https://profitable.app/roblox/games/swing-obby-for-brainrots)).
- **[Escape Tsunami For Brainrots](https://rowatcher.com/games/9363735110/escape-tsunami-for-brainrots)** has 5B+ visits and was briefly Roblox's most-played game in January 2026.
- **"Brainrot" as a theme has stopped growing.** Spring 2026 analysis describes it as settling into a permanent genre rather than an explosive trend ([RoWatcher](https://rowatcher.com/news/is-the-brainrot-trend-dying-what-ccu-data-from-three-top-games-reveals)). **We should use the loop, not the meme characters.**
- **Steal An Egg** (Jul 2026) had about 1M concurrent players in Oct 2026 ([Sportskeeda](https://www.sportskeeda.com/roblox-news/best-roblox-games-to-play-right-now)). Egg hatching and pet collecting is the current #1 trend, which makes it a good later update for us.
- **Rising in Nov 2026:** co-op absurd obbies and troll obbies ([GGRecon](https://www.ggrecon.com/articles/fastest-growing-new-roblox-games-november-2026/)). Most of them need real-time multiplayer.

### 1.4 CrazyGames rules that shape the idea

- **Originality.** Names, assets and content must be "clearly distinguishable" from existing games. Clones and asset flips are rejected ([gameplay requirements](https://docs.crazygames.com/requirements/gameplay/), [quality guidelines](https://docs.crazygames.com/requirements/quality/), [FAQ](https://docs.crazygames.com/faq/)). → We use our own name, our own creatures and a mechanic mix no one else has.
- **Audience is 13+ and games must be PEGI 12. Content aimed at kids fails QA.** → Use meme humor and satisfying physics, and avoid a toddler look.
- **No copyrighted visuals or names you don't own.** Don't use "Roblox", Barry, Garfield, or the famous brainrot meme characters.
- **Full Launch requires the SDK:** gameplay start/stop events, ads, the Data module for saves, and landing the player in gameplay immediately (at most one click) ([technical requirements](https://docs.crazygames.com/requirements/technical/), [SDK game module](https://docs.crazygames.com/sdk/game/)).
- **Size:** the initial download must be ≤ 50 MB, and ≤ 20 MB to appear on the mobile homepage.
- **Money:** you earn a revenue share on ads. CrazyGames does not publish the split. In-game purchases (via Xsolla) are invite-only, and payouts are monthly with a €100 minimum ([third-party guide](https://app.cinevva.com/guides/publish-game-crazygames)).

---

## 2. Ideas compared

These scores are my judgement from the research above, from 1 (bad) to 5 (best). For "Buildable solo", 5 means easiest.

| Idea | Demand | Room on CrazyGames | Fits CG metrics | Buildable solo | Total |
|---|---|---|---|---|---|
| **Swing obby + wave escape + collect (the pick)** | 5 | 4 | 5 | 3 | **17** |
| +1 jump/speed per click obby | 5 | 1 | 4 | 5 | 15 |
| Escape-the-wave clone (running only) | 5 | 1 | 5 | 4 | 15 |
| 3D troll obby (fake platforms, traps) | 3 | 3 | 2 | 4 | 12 |
| Co-op chained/absurd obby | 4 | 4 | 3 | 1 | 12 |
| Story escape obby (prison run style) | 4 | 2 | 2 | 2 | 10 |

The clones score high on demand but almost zero on room. On CrazyGames that's fatal: the originality rule can get them rejected, and even if accepted they'd be buried among 12+ near-identical games.

---

## 3. The concept: *Swing or Splash*

> Swing out over the sea, grab the weird creatures the last wave washed up, and get home before the next wave hits.

### 3.1 Core loop (one run = 30–90 seconds)

1. You start on your **home island**. A **wave timer** counts down (for example, 60 s).
2. You **swing out** along a chain of floating islands, hooks and buoys. Hold to latch onto the highlighted anchor ahead; release to fling yourself.
3. **The farther out you go, the rarer the creatures:** Common → Uncommon → Rare → Epic → Legendary → Mythic → Secret.
4. **Grab creatures.** They stack on your head, and carry slots are limited.
5. **Get home** before the wave sweeps through, or reach a tall **lighthouse** safe spot. If the wave catches you, you lose what you're carrying and respawn at home.
6. **Place creatures on base pedestals.** Each one earns $/second, including while you're offline (capped).
7. **Spend cash** on Rope Reach, Swing Power, Carry Slots, Wave Radar and extra pedestals. **Rebirth** for a permanent multiplier and cosmetics.

**The twist:** the wave is also the spawner. Every wave washes up a fresh batch of creatures, and sometimes a **Golden Wave** brings mutated ones (Gold, Diamond, Rainbow).

### 3.2 Controls (designed for mobile from day one)

- **Desktop:** WASD/arrows steer and Space jumps. In the air, hold Space (or the mouse button) to grab the highlighted anchor and release to let go.
- **Mobile:** a left-thumb joystick and one big right-thumb button (tap to jump, hold to grab).
- **Auto-targeting** picks the best anchor in front of you, so the game is easy to learn. The skill is in release timing and steering.

### 3.3 Why it should hit CrazyGames' numbers

- **Conversion:** you're swinging within 5 seconds, with no menu and a tiny download.
- **Playtime:** every run makes you stronger, so the next upgrade is always close. Zones gate progress.
- **Day-1 retention:** offline earnings ("your creatures made $12K while you were away"), a daily gift, an **Index** of every creature × mutation to complete, and rebirth goals.

### 3.4 Monetization (CrazyGames SDK)

| Placement | Ad type | Platform rule to respect |
|---|---|---|
| "Keep your loot" when the wave hits | Rewarded | Max once per session (same rule as revives) |
| Lucky Wave: next wave guaranteed Rare+ | Rewarded | Reward only after `adFinished`, never after `adError` |
| 2× cash for 5 minutes | Rewarded | Never chain two ads for one reward |
| 2× offline earnings on return | Rewarded | |
| Back at base after a run, or on rebirth | Midgame | Never mid-swing. The SDK caps these at 1 per 3 minutes |
| Shop and Index screens | Banner | |

Rules source: [ad requirements](https://docs.crazygames.com/requirements/ads/), [ad tips for action games](https://docs.crazygames.com/resources/monetizing-action/).

### 3.5 Art and tone

- **Blocky, Roblox-like low-poly characters** built from simple boxes. The files are tiny and read well at small sizes.
- **A bright tropical sky-and-sea world,** with a huge cartoon wave you can see coming from far away.
- **Original creatures:** absurd sea-meme mashups such as Toastopus, Crab DJ, Banana Shark, Disco Clam and Burger Whale. Strong creature design makes players want to collect them all, and the creatures double as the cover art and thumbnails.
- **Tone for 13+:** meme humor, juicy physics, funny wipeouts, and nothing that looks babyish.

---

## 4. Version 1 (MVP) scope

**In:**
- 1 world with 6–7 distance zones, about 25 creatures, and 3 mutations
- Swing, jump and double jump; wave timer; carrying; base pedestals; offline income
- 4 upgrades, rebirth, the Index, and a daily gift
- Saving: browser storage for now, the CrazyGames Data module for Full Launch
- Keyboard and touch controls, sound, settings

**Out (later updates):** multiplayer, more worlds, eggs/pets, trading, timed events, cosmetic shop.

---

## 5. Tech plan

- **Three.js + TypeScript + Vite,** with custom lightweight physics (character controller plus a rope constraint) instead of a heavy engine.
- **Why:** the build is tiny (target < 10 MB, well under the 20 MB mobile limit), loads fast, runs on phones, and can be built and tested end to end in this repository.
- **Alternative:** Unity 6, which many CrazyGames obbies use (for example, *Run and Jump for Brainrot*). Pick it if you specifically want to learn Unity. Builds are larger and slower to load on mobile.
- **CrazyGames HTML5 SDK v3** goes behind a small wrapper, so the game also runs locally and on other portals.

---

## 6. CrazyGames launch checklist

- [ ] Original name and cover art (no copyrighted visuals), English text
- [ ] Loads in under 10 s; initial download under 20 MB
- [ ] Gameplay starts immediately (at most 1 click)
- [ ] PEGI 12 and not aimed at kids
- [ ] **Basic Launch:** submit without the SDK, then watch conversion, playtime and D1 retention for 7–21 days
- [ ] **Full Launch:** SDK init, `gameplayStart`/`gameplayStop`, ads that follow the rules, Data module saves
- [ ] Tested on desktop Chrome, Android Chrome and iOS Safari

---

## 7. Roadmap (part-time, rough)

| Week | Goal |
|---|---|
| 1 | Greybox swing prototype. **The key test: is swinging fun within 30 seconds?** |
| 2 | Wave, zones, collecting, carrying, base income |
| 3 | Upgrades, rebirth, saving, offline income, Index |
| 4 | Art, UI, audio, touch controls, performance |
| 5 | Submit for Basic Launch |
| 6–7 | Tune using the metrics; add SDK and ads; Full Launch |
| After | A new world every few weeks, Golden Wave weekends, eggs/pets, maybe multiplayer |

---

## 8. Risks and mitigations

| Risk | Mitigation |
|---|---|
| The swing feel *is* the game, and bad rope physics would kill it | Prototype it first and test on a phone in week 1 |
| Copycats move fast on CrazyGames | Ship quickly and update often (game pages show "last updated") |
| The trend fades | The core is a skill mechanic plus original creatures, not a meme; it can be reskinned (eggs/pets) later |
| Rejected for originality | Own name, own art and a new mechanic mix; no "Roblox", Barry or brainrot meme characters |
| Swinging is awkward on touch screens | One-button grab with auto-targeting; playtest on mobile early |

---

## Sources

**CrazyGames (official docs):** [Basic Launch guide](https://docs.crazygames.com/resources/basic-launch-metrics/) · [Requirements intro](https://docs.crazygames.com/requirements/intro/) · [Technical](https://docs.crazygames.com/requirements/technical/) · [Gameplay](https://docs.crazygames.com/requirements/gameplay/) · [Quality](https://docs.crazygames.com/requirements/quality/) · [Ads](https://docs.crazygames.com/requirements/ads/) · [Ad tips: action](https://docs.crazygames.com/resources/monetizing-action/) · [SDK: game](https://docs.crazygames.com/sdk/game/) · [SDK: data](https://docs.crazygames.com/sdk/data/) · [SDK: video ads](https://docs.crazygames.com/sdk/video-ads/) · [FAQ](https://docs.crazygames.com/faq/)

**CrazyGames game pages:** linked in the table in section 1.2, plus [Obby: Gym Simulator, Escape](https://www.crazygames.com/game/obby-gym-simulator-escape) and [Grapple Rush](https://www.crazygames.com/game/grapple-rush-ynv).

**Roblox data:** [Swing Obby for Brainrots wiki](https://obbywiki.com/wiki/Swing_Obby_for_Brainrots) · [Swing Obby stats (Profitable)](https://profitable.app/roblox/games/swing-obby-for-brainrots) · [Swing Obby guide (AllThings.How)](https://allthings.how/how-to-play-swing-obby-for-brainrots-upgrades-rebirth-and-mutations-explained/) · [Escape Tsunami For Brainrots (RoWatcher)](https://rowatcher.com/games/9363735110/escape-tsunami-for-brainrots) · [Is the brainrot trend dying? (RoWatcher)](https://rowatcher.com/news/is-the-brainrot-trend-dying-what-ccu-data-from-three-top-games-reveals) · [Steal An Egg (RoWatcher)](https://rowatcher.com/games/10563114921/steal-an-egg) · [Best Roblox games, Oct 2026 (Sportskeeda)](https://www.sportskeeda.com/roblox-news/best-roblox-games-to-play-right-now) · [Fastest-growing new Roblox games, Nov 2026 (GGRecon)](https://www.ggrecon.com/articles/fastest-growing-new-roblox-games-november-2026/) · [Top trending Roblox games (clip.dor.gg)](https://clip.dor.gg/en/blog/roblox-popular-games-ranking)

**Other:** [CrazyGames developer guide 2026 (Cinevva, third-party)](https://app.cinevva.com/guides/publish-game-crazygames) · [Swing Obby for Brainrots web port (Playgama)](https://playgama.com/game/swing-obby-for-brainrots) · [Obby: Swing for Brainrots (Kiz10)](https://kiz10.com/obby-swing-for-brainrots)
