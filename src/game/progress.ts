import { getSpecies } from './creatures';
import { FLAG_FIRST_SURGE_END, FLAG_LANDED_ISLAND } from './quests';
import type { GameState } from './state';
import type { SimEvent } from '../contracts';

/** Resets the "today" stats when the local day changes. */
export function rollStatsDay(state: GameState, today: string): void {
  const c = state.counters;
  if (c.chainDay !== today) {
    c.chainDay = today;
    c.bestChainToday = 0;
  }
}

/**
 * Updates cumulative stats (and the event flags quests need) from one sim event.
 * cashEarned and upgradesBought are counted by GameState itself; giftsClaimed and playSec by Progression.
 * Returns the species id when a collect discovered a new species, else null.
 */
export function trackSimEvent(state: GameState, e: SimEvent, today: string): string | null {
  const c = state.counters;
  switch (e.type) {
    case 'player':
      if (e.event === 'grab') c.grabs++;
      else if (e.event === 'sea') c.seaFalls++;
      break;
    case 'releaseRated':
      if (e.quality === 'perfect') c.perfects++;
      break;
    case 'chain':
      rollStatsDay(state, today);
      c.bestChain = Math.max(c.bestChain, e.count);
      c.bestChainToday = Math.max(c.bestChainToday, e.count);
      break;
    case 'landed':
      if (e.islandOrder >= 1) state.flags[FLAG_LANDED_ISLAND] = true;
      break;
    case 'deliver':
      c.deliveries++;
      c.creaturesDelivered += e.result.placed.length + e.result.sold.length;
      break;
    case 'surgeEnd':
      state.flags[FLAG_FIRST_SURGE_END] = true;
      if (e.survived) c.wavesSurvived++;
      break;
    case 'padLaunch':
      c.padLaunches++;
      if (e.inWave) c.padLaunchesInWave++;
      break;
    case 'closeCall':
      c.closeCalls++;
      break;
    case 'collect': {
      c.collects++;
      const r = getSpecies(e.creature.speciesId).rarity;
      c.collectsByRarity[r] = (c.collectsByRarity[r] ?? 0) + 1;
      if (e.creature.mutation > 0) c.mutatedCollects++;
      if (e.creature.golden) c.goldenBatchCollects++;
      return e.isNewSpecies ? e.creature.speciesId : null;
    }
    case 'splash':
      c.splashes++;
      break;
    case 'bounce':
      c.bounces++;
      break;
    default:
      break;
  }
  return null;
}
