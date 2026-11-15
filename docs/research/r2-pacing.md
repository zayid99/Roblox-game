# R2 pacing proposal "F1" (from the pacing research agent; harness in research/r2/)

Problem: rewards arrive in two lumps (1:48 tutorial end; ~3:40 when quests 7-10 all complete on the first Coral trip, ~10 min of income at once). Then the only goal is "Unlock Lagoon $20K", 13-14 min away at minute 4; Lagoon really gets bought by quest 11 "Catch a Rare" (a lottery: typical Lagoon 3.7/7.4/7.4 min p25/50/75). 8-13 min: nothing reachable (Stormy $300K is 30-50 min away; 10-min gift is a Lucky Tide, no cash).

F1 (all three parts together; each alone breaks a pacing band):

| File | Constant | Old -> New |
|---|---|---|
| src/game/economy.ts | UPGRADES.reach.costs[2] (Lagoon gate) | 20,000 -> 8,000 |
| src/game/economy.ts | costs[3] | 90,000 -> 110,000 |
| src/game/economy.ts | costs[4] | 210,000 -> 260,000 (update price comment) |
| src/game/quests.ts | Q7 Reach Coral Reef reward | min 2 -> min 1 |
| src/game/quests.ts | Q8 lighthouse launch in wave reward | min 2 -> min 1 |
| src/game/quests.ts | Q9 | "Fill 4 pedestals" (min 3) -> "Fill 6 pedestals" (min 2), done filled >= 6 |
| src/game/quests.ts | Q10 | "Buy Carry Slots" (min 3) -> "Hatch an egg", icon egg, min 2, done eggsHatched >= 1 OR bestZone >= 2 |
| src/game/quests.ts | Q11 | "Catch a Rare" (min 5 + 10 pearls) -> "Reach Lagoon", icon chevron, min 3 + 10 pearls, done bestZone >= 2 |
| src/game/quests.ts | Q12 | unchanged (Golden Wave catch) |
| src/game/gifts.ts | GIFTS | 1:1min, 3:2min, 5:10 pearls, 7:3min, 10:Lucky Tide, 13:5min, 16:25 pearls, 20:Mystery -> 1:1min, 2.5:1min, 4:2min, 5.5:2min, 8:Lucky Tide, 10:Mystery Creature, 12.5:5min+10 pearls, 20:Mystery+25 pearls (keep 8 gifts: 8-column strip) |
| tests/pacingSim.ts | shopOnce quest following | buy what the current quest asks (carry, pedestals, egg), not only carry |
| src/game/progression.ts railState | Hatchery tile arrow/wiggle while "Hatch an egg" is the current quest | off -> on |

Results (calibrated sim, 41 seeds, typical): Lagoon 5.5/5.5/5.5 min; longest gap first 10 min 83 s -> 65 s; biggest lump 10 -> 5 min of income; quest 12 + Locker + Mystery gift land at 9-10 min. Long-term bands in tests/pacing.test.ts pass except "skilled last zone <= 0.9 x typical", which is already flaky on 7 seeds (0.93 on 101 seeds today). Proposed test changes: skilled band 21+ seeds and 0.95, or compare at Kraken/Volcano; tighten Lagoon band to <= 6 min with p25-p75 spread <= 1.5 min; add cadence test (no gap > 90 s in minutes 2-10, no lump > 6 min of income) once the event log is in pacingSim.

Expected: churn in min 1-10 down 15-35% -> avg playtime ~5:45-6:55. 8-10 min average also needs retention past minute 10 (Stormy ~20 min, 20-min gift, Locker at ~10 min, a follow-up quest line after Q12 — shopView/state hard-code 12 quests).
