# Swing or Splash: raising CrazyGames CTR from 1.1% to 2–3%

Research date: 15 Nov 2026. Scope: covers/thumbnails, title, category/tags, hover video, testing plan.

## What I could and could not verify

- **Blocked in this sandbox:** every page fetch. docs.crazygames.com, crazygames.com, poki.com, developers.poki.com, itch.io, github.com (other repos), the image CDNs and web.archive.org all failed (DNS or proxy refusal). **Everything below about CrazyGames and Poki comes from search-engine snippets of the official pages, not from reading the pages.** The wording may differ slightly from the live docs.
- **Not seen:** the competitors' actual thumbnail images. Titles, categories, tags, ratings and vote counts come from search snippets. Where I describe the typical look of the genre's covers, that is my own knowledge of the genre, marked *(unverified)*. Open the tag pages in a normal browser and check before relying on it.
- **Not in the repo:** the current gold-wave AI cover. The repo holds the previous blue-wave cover with the logo (`/home/user/Roblox-game/crazygames/media/cover-*.png`). I rendered that one at real tile sizes. I critique the gold one from your description.
- **CrazyGames tile pixel sizes and the title-on-hover "label zone":** not confirmed by any source I could reach. One developer reports the carousel tile at about 200×112. From memory (unverified), CrazyGames uses a dark navy UI and shows the game name over the bottom of the tile on hover. Treat both as assumptions to check.

---

## 1. What CrazyGames officially says (from search snippets of docs.crazygames.com)

**Covers** ([Game covers](https://docs.crazygames.com/requirements/game-covers/))
- 3 covers are required: landscape 16:9 1920×1080, portrait 2:3 800×1200, square 1:1 800×800. They should look consistent with each other.
- Text: **only the game's title.** No "New", "Updated", "Play", "Play now" or promotional text. No borders, no icons or store logos, no blurry or pixelated art, nothing you don't have the rights to.
- They *recommend* putting the name on the cover: "Adding the name of your game to the cover is a great way to make it more memorable!" It also helps a game stand apart from similar-looking titles.
- Don't just use a screenshot. Use the main character, a large stylised title, or an illustration that refers to the game. Covers don't have to match gameplay exactly, because "users can preview the gameplay by hovering over your game cover anyway".
- "We also advise updating your covers occasionally after publication."
- Third-party summary of the same page: clear, eye-catching covers generate more views ([Larss IO devlog](https://fxf8.itch.io/larss-io/devlog/1586849/launching-a-1v1-strategy-game-on-crazygames-04-ctr-and-what-im-learning)).

**Preview (hover) videos** (same page)
- "Most game thumbnails on CrazyGames have a video preview on hover."
- 15–20 s (longer is cut to 20 s), 50 MB max. Landscape 1080p 16:9 and portrait 1080p **2:3** are both mandatory. Developers report that 9:16 is rejected and 1080×1620 is accepted.
- Avoid black screens, black bars, the default mouse cursor, and "Play Now" or promotional text.
- **Use the static cover as the first frame** so the cover turns smoothly into the video.
- Silent: no official snippet found, but developer reports say the previews have no sound.

**Quality guidelines** ([Quality](https://docs.crazygames.com/requirements/quality/), optional guidance)
- "The name and imagery presented on CrazyGames should reflect accurately the type of game the player will experience." The game shouldn't mislead about its genre.
- Change the name and imagery only "where totally necessary", for example after a big update or visual overhaul.
- The game should not be "easily confused with another that features a similar name or iconography".

**Basic Launch and CTR** ([Basic Launch guide](https://docs.crazygames.com/resources/basic-launch-metrics/), [FAQ](https://docs.crazygames.com/faq/))
- Full Launch decision uses 4 KPIs benchmarked against other games: average playtime, retention, conversion to gameplay, and CTR.
- **"CTR is measured for games that start or restart Basic Launch on or after 23 November 2026."**
- Basic Launch ends when the game has been live at least 7 days *and* has 500+ plays (hard stop at 21 days). If some KPIs pass, you may be invited to improve the game and request another Basic Launch.
- "Game and art updates for games in Basic Launch go live instantly" (usually processed the same working day).
- **Cover A/B testing (Experiments tab) is available only after Full Launch.** It is a 50/50 split of new vs current covers and videos. Limits: 1 experiment at a time, 2 started per calendar month, 14 days max. All 3 covers and both videos must be complete, with no other artwork waiting for review.
- No published numeric CTR benchmark. For reference: one developer set themselves a 2–4% target (0.4% on 6,100 impressions on day 2), and Poki's docs give a 1.5% *average* CTR for Action/Adventure.

**What this means for your timing (my reading of the docs, please confirm with CrazyGames support):** your Basic Launch began 11 Nov, before 23 Nov. So this round's scoring should not use CTR yet. If you are invited to *restart* Basic Launch after 23 Nov, CTR will count. Use the next 8 days, while art updates go live instantly and CTR doesn't count, to test covers one after another (plan in section 8).

**Poki's docs, the closest official evidence from a peer portal** ([Poki game thumbnail](https://developers.poki.com/guide/game-thumbnail), [animated thumbnails](https://sdk.poki.com/animated-thumbnails.html), [reading results](https://developers.poki.com/guide/reading-results))
- "Your game thumbnail is the single most important factor for click-through rate." It must grab attention "in under a second" and say what kind of game it is.
- Dynamic poses, clean background. Text becomes unreadable on small tiles, and "Poki's own tests show players prefer text-free thumbnails". Check the thumbnail at both large and small sizes.
- Avoid colours close to the portal's background colour, or the thumbnail blends into the page.
- Art must match the game, or conversion to play and playtime suffer.
- Animated thumbnail: plays on hover, muted, 4–6 s, 2–3 scenes of 1–2 s each. Core mechanic and high-impact moments, minimal text, start from the static art, hide non-essential UI, centre the action, no cursor.

---

## 2. What the genre leaders use (CrazyGames and Poki)

Popularity figures are from search snippets of the official game pages. Visual notes marked *(unverified)* are typical genre conventions I could not see this session.

| # | Game (portal) | Category › tags | Popularity | Title pattern | Notable |
|---|---|---|---|---|---|
| 1 | **Escape Tsunami for Brainrots!** (CrazyGames, Feb 2026) | **Arcade** | 8.7–8.9 rating, ~243K votes / ~301K likes | Keyword title: *Escape + Tsunami + Brainrots* | The direct competitor and benchmark: collect creatures, bring them home before the wave, idle income. Same loop as yours. |
| 2 | **Obby Escape from Tsunami Brainrot** (Mirra Games, Feb 2026) | **Action** › tags 3D, Mobile, Meme, Avoid, Collect, Speed, Idle | 9.0, ~20.8K votes | *Obby* + *Escape* + *Tsunami* + *Brainrot* | Roblox-inspired obby. All four search words are in the title. |
| 3 | **Escape Tsunami Brainrot** (Mirra Games, Mar 2026) | Action › Obby | 8.5 | Same keywords | Second listing from the same developer, which shows the keyword set is worth owning. |
| 4 | **Obby: Dig Brainrots** (Serbull, Apr 2026) | (n/a) | 8.3, ~47K likes | "Obby:" prefix + verb + creature | The "Obby: <verb> <thing>" formula. |
| 5 | **Obby vs Brainrot** (Fluffy Games, Jan 2026) | (n/a) | 8.9, ~18K likes | Obby + Brainrot | |
| 6 | **Obby – BrainWave** (melasi, Mar 2026) | (n/a) | 8.9, ~10K likes | Obby + wave pun | |
| 7 | **Obby: Find and Dig Brainrot** (Jungle Games, Oct 2026) | (n/a) | 8.6, ~2.2K likes | Formula again | |
| 8 | **Obby: +1 Laser to Break Walls** / **+1 Click Wall Breaker** / **Obby Steal an Egg** / **Obby: Dig Down** / **Obby Highest Jump Ever** | Obstacle tag top picks | ~21.4K / 16.2K / 14K / 10.7K / 6.7K ratings | "Obby:" plus a one-line hook in the title | The leading obbies put the *mechanic* in the title. |
| 9 | **Steal Brainrot Online** (Playme, Aug 2025) | (n/a) | 8.4, ~13K votes | Copies the Roblox hit's name | Heist/collect loop. |
| 10 | **The Lava Tsunami** (Eva Games, Jun 2026) | Parkour | 8.7 | "Tsunami" as the hook | Wave-chase parkour, reskinned with lava. |
| 11 | **Brainrot Idle Clicker** (Magikon, Jun 2025) | (n/a) | 8.8 | Keyword + genre | |
| 12 | **Arcade Rope** (CrazyGames, 2023) / **Grapple Rush** (Oct 2026) | (n/a) | 9.4 from 398 votes / 9.1 | Mechanic in title | The only rope-swing games found. Small, so **nobody owns "rope swing obby" on CrazyGames**: room for you to be different. |
| 13 | **Rainbow Obby** (Poki, emolingo) | Poki top pick on Obby, Parkour, Running, Multiplayer | 4.1★ | Colour + Obby | |
| 14 | **Obby Roads** (Poki exclusive, Tall Team, Dec 2025), **Draw my Path Obby**, **Animal Obby**, **Jetpack Speed Obby**, **Obby Tag** (Poki) | Poki Obby page | Featured / popular | Every one is "<hook> Obby" or "Obby <hook>" | On Poki, "Obby" in the title is close to universal. |
| 15 | **Escape Tsunami For Brainrots** (Roblox original, by Wave of Brainrots) | (n/a) | ~72K concurrent players at one tracker snapshot | (n/a) | The source of the trend; web players search these words. |

**Patterns**
- **Titles:** almost every winner puts its genre and hook words in the title: *Obby, Tsunami, Escape, Brainrot, Dig, Steal, +1*. **"Swing or Splash" contains none of them.**
- **Categories:** the tsunami/obby leaders split between **Arcade** (#1, the biggest) and **Action** (Mirra's). Other obbies sit under Arcade › Obby, Action › Parkour or Simulation. Category does not decide success.
- **Cover look** *(unverified, typical of the genre)*: one or two big characters with exaggerated open-mouth faces, a huge blue wave with white foam behind or above them, meme creatures held or flying, saturated toy colours, often a big outlined title. Little detailed scenery.
- **Roblox chart data** ([ClipClip, 905 chart games, Nov 2026](https://clipclip.io/guides/roblox-thumbnail-ctr), vendor, descriptive only): 72% show a character, 57% have no words besides the logo, median 3 words, 3D renders on 83% of 2026's top new games, expressive faces on 43%. Obby/platformer thumbnails are bright (median brightness 57% vs 27% for survival). Blue and orange are the main colours of 60% of thumbnails, which matches your teal/orange/sea palette exactly.

---

## 3. General evidence on thumbnail CTR

| Lever | Evidence | Strength |
|---|---|---|
| **One big focal subject, readable at tile size** | Poki: under 1 second, check at small size. Larss IO dev: a cover that looked great at 1920×1080 "lost all impact" at the ~200×112 carousel size. CTR 0.4%, then redesigned. Roblox icon guides: check at 150×150. | Official (Poki) plus a real case |
| **Character with an expressive face** | vidIQ: 69% of 500 breakout YouTube thumbnails use a face. Vendor studies claim +18–32% CTR for one dominant emotional face ([TubeAnalytics](https://www.tubeanalytics.net/resources/research/thumbnail-ctr-patterns-study-2026), [thumbnailtest](https://thumbnailtest.com/guides/face-in-youtube-thumbnail/)). SplitMetrics/MyTona: icons with an open "action mouth" beat a closed mouth, +9.1% conversion ([case](https://splitmetrics.com/customers/mytona-app-icons-halloween-update/)). Roblox: 72% show a character, 43% expressive faces. | Consistent direction, vendor-grade numbers |
| **But expression alone isn't magic** | Towerlands Google Play icon test: the "yelling guy" was not the winner; brightness and colour changes won ([Asodesk](https://asodesk.com/blog/from-angry-guy-yelling-to-game-graphics-a-b-testing-of-the-towerlands-app-icon/)). | Real A/B test |
| **Contrast and brightness; stand out from the portal background** | Poki: avoid colours near the site background. Roblox: obby thumbnails are high-key. YouTube guides: lots of contrast. | Official (Poki) plus descriptive data |
| **Text: little or none, except a short, big title** | Poki tests: players prefer text-free. CrazyGames: the title helps memorability. Roblox: 57% use no words besides the logo. | Official, but the two portals differ, so **test it** |
| **Honest art** | Poki and CrazyGames: art that doesn't match the game hurts conversion and playtime, and CrazyGames counts conversion and playtime as KPIs too. Roblox staff warn that clickbait triggers low-quality warnings. | Official |
| **Test several variants** | Roblox Thumbnail Personalization: +8.5% average qPTR, some games +50% ([Roblox DevForum](https://devforum.roblox.com/t/5-tips-from-roblox-staff-to-get-the-most-out-of-thumbnail-personalization/3471689)). Yandex runs built-in icon/cover A/B tests ([Yandex](https://yandex.com/dev/games/doc/en/concepts/ab-test)). | Official |

---

## 4. Critique of the covers at real display size

I rendered the repo's blue/logo cover at 240×135 and 200×112 (the reported carousel size), blurred and in greyscale, on a dark background. Files: `/tmp/claude-0/-home-user-Roblox-game/72973353-e2c0-514a-89a6-3b691316ec0d/scratchpad/research/r3/tile-test.png` and `/tmp/claude-0/-home-user-Roblox-game/72973353-e2c0-514a-89a6-3b691316ec0d/scratchpad/research/r3/small-montage.png`.

**Previous blue/logo cover (in repo)**
1. **The lighthouse wins the squint test.** Its red and white stripes are the most salient thing at 200 px. The character comes third, after the logo. The eye goes to a building, not a hero.
2. **The character is a thin vertical sliver**, about 7% of frame width, seen from the side. The face is two dots and is unreadable at tile size, so there is no emotion. The creature stack above his head reads as a yellow blob.
3. **The wave reads as a low white wall on the horizon, not a threat.** There is no curl, no height and no shadow. "Tsunami" doesn't come across.
4. **Blue on blue on blue** (sky, sea, wave). In greyscale it all collapses to one mid-grey. The only warm accents are small.
5. The logo is legible at 240 px and does the branding job. But "SWING or SPLASH" tells the player nothing about the genre (obby? collecting? tsunami?).
6. It is close to a game screenshot, which CrazyGames' docs advise against.

**Current gold-wave AI cover (from your description; not seen)**
1. **Gold wave plus gold hook plus gold, diamond and rainbow creatures plus sparkles: everything shouts at once.** With no single focal point, it turns to glitter noise at 200 px.
2. **A gold wave doesn't read as danger.** It reads as treasure, sunset or a reward screen, so the core "escape the wave" promise is lost. The tsunami is the hook that 300K-like games prove players click for, and it should be unmistakably a wave: blue-white, curling, towering.
3. **The island full of creatures is detail that disappears** at tile size. Two hero creatures beat ten small ones.
4. **No title and no genre cue,** so nothing says "obby" or "tsunami". Moving to text-free was reasonable in principle (Poki's data) but removed the only identity element. CrazyGames itself recommends the title.
5. **Risk of mismatch with the game.** A glossy AI 3D cartoon promises a different game than the flat voxel game. That can lower conversion-to-play and playtime, which are scored KPIs. Keep the art clearly voxel/blocky.
6. **The cover doesn't match the first frame of the hover video**, which CrazyGames recommends. See section 7.

**Per placement (your numbers):** homepage 0.3–0.5% is the main drag. There your tile competes against every genre at the smallest size, and only a big face plus a big threat wins there. Tag pages at 0.2–1% are the "fair fight" against other obbies: there the title words and a clearly different mechanic (rope swing) matter. Ignore "recent" (1.5–4%): those viewers have already played.

**Is 2–3% realistic?** Poki's average for Action/Adventure is 1.5%. Your 1.1% is "bottom 20%", which suggests the CrazyGames median is around 1.5–2%. Reaching 2% overall needs the homepage tile to roughly triple (0.4% → about 1.2%). That is plausible with a much stronger focal point. 3% is a stretch target.

---

## 5. Four thumbnail concepts, ranked for CTR

These rules apply to all four concepts (put them in every brief):
- **One hero, one threat, one creature.** The character's head and face should take up at least 20% of the frame height in 16:9 and at least 30% in 1:1.
- **Face:** the same blocky character (square head, teal cap, orange tee, navy trousers), but with **big readable cartoon eyes and a wide-open mouth**. The covers may exaggerate the in-game dot face, as long as the head, cap and shirt stay identical.
- **Wave:** bright cyan or turquoise, with a darker deep-blue body behind the character for value contrast, a thick white foam curl and a visible shadow. **Not gold.** Gold only as an accent: the hook and at most one rare creature.
- **Colour:** warm orange and teal hero against a cool blue wave (the complementary pair, and the genre's language). Keep bright, high-key values. Keep the frame edges bright, not dark navy, so the tile doesn't melt into a dark portal UI.
- **Safe zones:** keep the face and the main creature inside the central 60%. Keep the bottom ~18% free of essential detail (the possible hover title overlay; unverified). Nothing important in the outer 5% (rounded corners).
- **Text:** make version A with the title logo (top-left, at least 18% of image height, the existing "SWING or SPLASH" lettering) and version B text-free. If the title changes to "Swing or Splash: Tsunami Obby", the logo may then legally include "TSUNAMI OBBY" as a small subtitle under the logo. It's part of the title, so the only-title rule is respected.
- **Generate without text** and add the logo afterwards in an editor (AI lettering misspells). Attach 2–3 in-game shots from `/home/user/Roblox-game/crazygames/media/reference/` to keep the character on-model.
- **Test the finished cover at 200×112 on a dark background, blurred.** The face, the wave and the creature must all still read.

### Concept 1 (rank 1): "UH-OH!" close-up chase
*Why first:* one huge emotional face, one unmistakable tsunami and one funny creature. That is all three proven levers at the largest possible size, and it reads in under 1 s at 200 px. It also says "escape the wave" (the 300K-like genre) without copying anyone.

```
Create a wide 16:9 game cover illustration (landscape) for a 3D voxel rope-swinging obby game. Use the attached screenshots as the exact reference for the character and creature design.

Subject, large and close to the camera: an original blocky voxel cartoon boy with a square head, teal cap, orange t-shirt and dark navy trousers, swinging toward the viewer on a thick rope that hangs from a shiny golden ring hook at the top edge of the image. His head and shoulders fill about a third of the image height, positioned slightly left of centre. He looks back over his shoulder with a huge wide-open "uh-oh!" scream-laugh mouth and big round cartoon eyes. Under one arm he hugs a funny cube-shaped toast-coloured octopus with big googly eyes and the same screaming open mouth.

Behind him on the right: a gigantic curling tsunami wave in bright turquoise with a deep blue body and a thick white foam crest curling over the top, towering far above him and casting a blue shadow. A red crab wearing DJ headphones tumbles off the foam crest with a shocked face.

Background: simple bright sky, light blue fading to warm pale yellow near the horizon, one tiny palm-tree island far away. Nothing else.

Style: toon-shaded voxel 3D render, chunky cube shapes, soft dark ink outlines, bright saturated toy colours, warm sunlight on the character's face so the orange shirt pops against the blue wave, strong depth, a few white speed lines. Keep the top-left quarter as clean sky (a logo goes there later). Keep the bottom fifth simple.

No text, no letters, no numbers, no logo, no border, no UI. The character must be original, not from Roblox, Minecraft or any other game.
```
- **2:3 (800×1200):** "Tall 2:3 version. The rope and golden hook come down from the top centre. The character is in the middle third, larger, looking back and screaming. The wave rises behind him and fills the whole upper-right and right side, curling over his head. Clean sky at the very top for the logo."
- **1:1 (800×800):** "Square, tight crop. Only the character's head, shoulders and the screaming toast-octopus fill about 70% of the frame, with the foam curl of the wave right behind his head. No islands." Put the logo small at the top, or go text-free.

### Concept 2 (rank 2): "Too many creatures!" stack run
*Why:* this sells the collecting fantasy that drives the brainrot/tsunami hits ("grab creatures, get home before the wave"). The wobbling stack of googly-eyed creatures gives several funny faces, and the tall shape is perfect for the 2:3 crop.

```
Create a wide 16:9 game cover illustration for a 3D voxel obby game about collecting funny creatures before a tsunami hits. Use the attached screenshots as the reference for the character and creatures.

Low camera angle, the character running straight toward the viewer across a narrow wooden plank bridge between two small grass islands. The original blocky voxel cartoon boy (square head, teal cap, orange t-shirt, dark navy trousers) shouts with a wide-open mouth and big panicked-but-happy eyes. He holds a ridiculously tall, wobbling tower of five cube-shaped sea creatures in his arms, taller than himself: a toast-coloured octopus, a red crab with DJ headphones, a yellow shark wearing sunglasses, a green pickle blob, and a cookie starfish on top, each with big googly eyes and a funny expression. One creature on top glows gold.

Directly behind and above him, a giant curling turquoise tsunami wave with a thick white foam crest is about to crash down, filling the upper half of the background. A golden ring hook with a rope dangles at the top right.

Style: toon-shaded voxel 3D render, chunky cubes, soft dark ink outlines, bright saturated toy colours, warm light on the character and creatures, cool blue wave behind for contrast, simple background. Character and stack centred, filling about 60% of the image height. Leave clean space in the top-left for a logo. Keep the bottom fifth simple.

No text, no letters, no numbers, no logo, no border, no UI. Original character, not from Roblox, Minecraft or any other game.
```
- **2:3:** the natural format. The stack runs up the centre, the wave curls over the top, and the logo sits above the wave.
- **1:1:** crop from the character's belt up: face plus the top three creatures plus the foam curl.

### Concept 3 (rank 3): "The big swing" over the wave
*Why:* clearest picture of the unique mechanic. No other obby/tsunami game on CrazyGames owns rope-swinging, so this one stands out most on tag pages. Ranked below 1 and 2 only because a side view makes the face smaller.

```
Create a wide 16:9 game cover illustration for a 3D voxel rope-swinging obby. Use the attached screenshots as the character reference.

Three-quarter side view: the original blocky voxel cartoon boy (square head, teal cap, orange t-shirt, dark navy trousers) is at the very top of a huge rope swing, body stretched out almost horizontally, one hand on a taut rope tied to a big shiny golden ring hook at the top centre. His face is turned toward the viewer with a thrilled, wide-open grin and big eyes. A funny toast-coloured octopus with googly eyes clings to his back, tentacles flying. A white motion arc traces the swing path.

Far below him, a huge turquoise tsunami wave with a white foam curl surges across the gap between two small grass islands. The landing island with a red-and-white striped lighthouse is small on the right edge. Two creatures (a red crab with headphones and a yellow shark with sunglasses) wave at him from the island.

Style: toon-shaded voxel 3D render, chunky cubes, soft dark ink outlines, bright saturated toy colours, bright sunny sky, strong diagonal composition from bottom-left to top-right, character large in the centre-left. Clean sky top-left for a logo. Keep the bottom fifth simple.

No text, no letters, no numbers, no logo, no border, no UI. Original character, not from Roblox, Minecraft or any other game.
```
- **2:3:** the hook at the top, the character swinging toward the camera from slightly below, the wave filling the bottom half.
- **1:1:** the character and hook only, plus the foam crest at the bottom edge.

### Concept 4 (rank 4): "Swing… or SPLASH!" split
*Why:* it plays on the name and is funny, but it shows two smaller characters and needs a second to parse. Weakest at 200 px. Use it as a challenger or a seasonal variant.

```
Create a wide 16:9 game cover illustration for a 3D voxel rope-swinging game, split diagonally into two halves by the curling edge of a wave.

Upper-left half, sunny: the original blocky voxel cartoon boy (square head, teal cap, orange t-shirt, dark navy trousers) swings high on a rope from a golden ring hook, triumphant, arms full of cute cube-shaped creatures with googly eyes (toast octopus, crab with headphones).

Lower-right half: the same boy, comically shocked with a wide-open mouth, being swallowed by a giant turquoise wave with white foam, his creatures flying out of his arms in every direction with surprised faces.

The diagonal boundary is the white foam crest of the wave. Style: toon-shaded voxel 3D render, chunky cubes, soft dark ink outlines, bright saturated toy colours, very simple backgrounds, both characters large with readable faces.

No text, no letters, no numbers, no logo, no border, no UI. Original character, not from Roblox, Minecraft or any other game.
```
- **2:3:** stack the two moments vertically: swing on top, splash below.
- **1:1:** use only the "SPLASH" half. The close-up shocked face with creatures flying works as a standalone icon.

**What to drop for now:** the all-gold palette, the island full of tiny creatures, sparkles everywhere, and the lighthouse as a large element.

---

## 6. Title, category, tags, description

**Title.** "Swing or Splash" is memorable but has **no search words**. Every leader in this niche carries *Obby / Tsunami / Escape / Brainrot* in its name, and CrazyGames search and tag-page shoppers scan for those words.
- **Recommended: "Swing or Splash: Tsunami Obby"** (29 characters). It keeps the brand and the existing logo, and adds the two highest-value genre words. The "Name: subtitle" format is common on CrazyGames (e.g. "Obby: Gym Simulator, Escape"), so it should be accepted. It also lets the cover legally show "TSUNAMI OBBY" as part of the title.
- Alternative if you want keyword-first truncation: "Tsunami Obby: Swing or Splash".
- "Swing Obby: Escape the Tsunami" is strong for search but drops the brand. It also sits very close to "Escape Tsunami for Brainrots!", which the quality guideline on names that are easily confused warns about, and it invites a head-to-head against a 300K-like game. Not recommended as the primary choice.
- Don't put "Brainrot" in the title. Your creatures are original absurd food-animal hybrids, and calling them brainrots risks the "misleading" guideline. Mentioning "brainrot-style" in the description is a softer option.
- The guidelines discourage renames except "where totally necessary". Do it once, now, during Basic Launch, and ask CrazyGames support or your account manager to confirm before changing. **Change the title separately from the cover** so you can tell which change moved CTR.

**Category.** Keep **Arcade**. The biggest game in your exact loop (#1 above, about 301K likes) lives in Arcade, and obbies there show as Arcade › Obby. Action is the reasonable second choice (Mirra's tsunami obbies use it). Adventure isn't used by any of the leaders I found. Category is a weak CTR lever compared with art and title, so don't spend a change on it now. (Note: STORE_LISTING.md still says Adventure. Update it to match what you submitted.)

**Tags** (pick whatever the portal offers; the order sets the primary tag and breadcrumb):
1. **Obby** (primary, so the breadcrumb reads Arcade › Obby), 2. **3D**, 3. **Collect**, 4. **Idle** (income while away, which Mirra also uses), 5. **Parkour**, 6. **Avoid**, 7. **Mobile**, plus **Escape** or **Jumping** if available. Add **Meme** only if you're comfortable that the creatures read as meme-style (Mirra tags Meme).
- Drop low-value tags (Mouse, 1 Player, Platformer) if there is a cap.

**Short description** (first line, keyword-led):
> Rope-swinging tsunami obby: swing from island to island, grab funny creatures like Toastopus and Crab DJ, and get home before the giant wave hits!

**Description first paragraph:** open with "Swing or Splash is a 3D tsunami obby with rope swinging and creature collecting…". Keep the rest. Mention "idle income" and "escape the wave" naturally in the text. Don't stuff keywords.

---

## 7. Hover / preview video plan

**Current video** (19 s, frames checked at 0/1/2/3/5/8/12 s): it opens on a small character standing on a pink island with a full HUD and a "ZONE … Hooks" sign. **The wave first appears at about 8 s.** The first frame is not the cover. The camera is far away, so the character is about 1/10 of the frame height. Hover viewers decide within 2–3 s, and right now those seconds show neither a swing, a wave nor a creature.

**New cut** (both 1920×1080 and 1080×1620, 15–20 s, no sound, no cursor, HUD hidden or reduced to the cash counter, action centred for the 2:3 and square crops):

| Time | Shot |
|---|---|
| 0.0–0.4 s | **The static cover** (each version's own cover), then a quick zoom/push into gameplay. This follows CrazyGames' "cover as first frame" advice. |
| 0.4–3.0 s | **The money shot:** close chase camera, the character in a big swing off a golden hook, the **giant wave clearly visible and close behind**, release, land, grab a creature (pop-up and creature face visible). |
| 3–6 s | The wave crashes just behind as he reaches home or a lighthouse. Near miss. Big white splash. |
| 6–9 s | Two quick creature close-ups (Toastopus, Crab DJ, Banana Shark) with their funny faces, plus a "Perfect Release" chain. |
| 9–13 s | Swinging chain across 3–4 hooks, a different zone (Volcano Bay or Stormy Seas) for variety. |
| 13–17 s | Home base: pedestals filling with creatures, coins popping (the idle payoff). |
| 17–20 s | A Golden Wave or Big Wave rising. End on a frame that matches the cover pose. |

Also cut a **5 s version** (scenes 0.4–6 s) for Poki and similar portals (4–6 s, 1:1 1080×1080 at 50 fps). Record with the camera closer than normal play (character at least 1/4 of the frame height), and avoid text banners like "WAVE INCOMING" in the first 3 s.

---

## 8. Testing plan

**Constraint:** the Experiments tab (true 50/50 split) only opens after Full Launch. During Basic Launch, art updates go live the same working day, so test **one version after another**, and measure **per placement** (homepage, tag page, game page). Ignore "recent".

**Sample size:** at about 8.5K impressions/day, detecting 1.1% → 1.6% (80% power, α 0.05) needs about 8.4K impressions per version. 1.1% → 2.0% needs about 3K. So **2 full days per version (about 17K impressions)** is enough. Change art at the same time of day, and log the exact go-live time.

**Phase 0: now to 22 Nov** (CTR probably not scored for this round; confirm with support)
| Days | Version | Question |
|---|---|---|
| 15–16 Nov | Current gold cover (baseline) | Per-placement baseline. Note the impressions. |
| 17–18 Nov | **Concept 1 + logo** (+ new video with cover first frame) | Does a big face plus a blue wave beat gold? |
| 19–20 Nov | **Concept 1 text-free** | Logo or no logo on CrazyGames? |
| 21–22 Nov | **Concept 2** (winner's text treatment) | Face close-up or creature stack? |
| 23 Nov+ | Winner. Then change the **title** alone (2–3 days) | Isolate the title effect (watch tag page and search CTR). |
If time allows, re-run the baseline for one day (A-B-A) to check for drift from day-of-week or traffic mix.

**Read-out:** a version "wins" if homepage *and* tag-page CTR both rise, and conversion to gameplay and playtime don't fall (an honesty check). If CTR rises but conversion drops, the art is overpromising.

**Phase 1: after Full Launch (Experiments tab)**
- Up to 2 experiments a month, 14 days each, 1 at a time. All 3 covers and both videos must be complete, with nothing else waiting for review.
- Month 1: the Phase 0 winner vs Concept 3 (the mechanic shot). Then the winner vs a seasonal variant (e.g. a Golden Wave event, Concept 4).
- Keep a naming scheme for art versions (e.g. `v3-c1-logo`, `v4-c1-nologo`) with dates, so the portal's version history lines up with your log.
- **Refresh once a quarter.** Both CrazyGames ("update your covers occasionally") and Roblox data (more variants, more gains) support it. Keep the character and logo consistent so returning players recognise the game.

---

## Sources

- CrazyGames, Game covers: https://docs.crazygames.com/requirements/game-covers/
- CrazyGames, Quality guidelines: https://docs.crazygames.com/requirements/quality/
- CrazyGames, Basic Launch guide: https://docs.crazygames.com/resources/basic-launch-metrics/
- CrazyGames, FAQ (Experiments tab, Basic Launch updates): https://docs.crazygames.com/faq/
- CrazyGames, Introduction: https://docs.crazygames.com/requirements/intro/
- Larss IO devlog (0.4% CTR, cover at carousel size): https://fxf8.itch.io/larss-io/devlog/1586849/launching-a-1v1-strategy-game-on-crazygames-04-ctr-and-what-im-learning
- Bolt Pit Basic Launch write-up: https://froessell.substack.com/p/15000-from-one-browser-game-the-math
- Poki, Game thumbnail: https://developers.poki.com/guide/game-thumbnail and https://sdk.poki.com/game-thumbnail
- Poki, Animated thumbnails: https://sdk.poki.com/animated-thumbnails.html
- Poki, Reading results (1.5% average CTR example): https://developers.poki.com/guide/reading-results
- Poki, Obby page: https://poki.com/en/obby ; Obby Roads: https://poki.com/blog/tall-teams-launches-obby-roads-poki
- CrazyGames game pages: https://www.crazygames.com/game/escape-tsunami-for-brainrots-wfe , https://www.crazygames.com/game/obby-escape-from-tsunami-brainrot , https://www.crazygames.com/game/escape-tsunami-brainrot , https://www.crazygames.com/game/obby-dig-brainrots , https://www.crazygames.com/game/obby-vs-brainrot , https://www.crazygames.com/game/obby---brainwave , https://www.crazygames.com/game/obby-find-and-dig-brainrot , https://www.crazygames.com/game/steal-brainrot-online , https://www.crazygames.com/game/obby-1-laser-to-break-walls-pks , https://www.crazygames.com/game/obby-1-click-wall-breaker , https://www.crazygames.com/game/obby-steal-an-egg , https://www.crazygames.com/game/obby-dig-down , https://www.crazygames.com/game/obby-highest-jump-ever , https://www.crazygames.com/game/obby-build-a-car-farm , https://www.crazygames.com/game/digital-circus-obby , https://www.crazygames.com/game/arcade-rope , https://www.crazygames.com/game/grapple-rush-ynv , https://www.crazygames.com/game/brainrot-idle-clicker , https://www.crazygames.com/t/obstacle , https://www.crazygames.com/t/meme
- Roblox original "Escape Tsunami For Brainrots" stats: https://rowatcher.com/games/9363735110/escape-tsunami-for-brainrots
- ClipClip, 905 Roblox chart thumbnails: https://clipclip.io/guides/roblox-thumbnail-ctr
- Roblox DevForum, thumbnail personalization: https://devforum.roblox.com/t/5-tips-from-roblox-staff-to-get-the-most-out-of-thumbnail-personalization/3471689 and https://create.roblox.com/docs/production/promotion/thumbnails
- SplitMetrics / MyTona "action mouth" icons: https://splitmetrics.com/customers/mytona-app-icons-halloween-update/
- Asodesk, Towerlands icon test: https://asodesk.com/blog/from-angry-guy-yelling-to-game-graphics-a-b-testing-of-the-towerlands-app-icon/
- Faces/CTR (vendor data): https://www.tubeanalytics.net/resources/research/thumbnail-ctr-patterns-study-2026 , https://thumbnailtest.com/guides/face-in-youtube-thumbnail/
- Yandex Games icon/cover A/B tests: https://yandex.com/dev/games/doc/en/concepts/ab-test
