import { REBIRTH, UPGRADES, UPGRADE_ORDER, baseSlots, emptyLevels, rebirthMultiplier } from './economy';
import type { GameState } from './state';
import type { RebirthView, ShopRow, ShopView } from '../contracts';

/** The Rebirth tile shows once cash reaches this share of the rebirth cost (C2). */
export const REBIRTH_VISIBLE_AT = 0.25;

export function buildShopRow(state: GameState, key: (typeof UPGRADE_ORDER)[number]): ShopRow {
  const def = UPGRADES[key];
  const level = state.levels[key];
  const maxed = level >= def.maxLevel;
  const affordableN = state.maxAffordable(key);
  return {
    key,
    name: def.name,
    icon: def.iconId,
    level,
    max: def.maxLevel,
    now: def.format(def.value(level)),
    next: maxed ? null : def.format(def.value(level + 1)),
    cost: maxed ? 0 : state.upgradeCost(key),
    cost5: state.bulkCost(key, 5),
    maxAffordable: affordableN,
    costMax: state.bulkCost(key, affordableN),
    affordable: state.canBuy(key),
    maxed,
  };
}

export function buildRebirthView(state: GameState): RebirthView {
  const cost = state.rebirthCost();
  const multNext = rebirthMultiplier(state.rebirths + 1);
  return {
    cost,
    progress: Math.min(1, state.cash / cost),
    multNow: state.multiplier,
    multNext,
    can: state.canRebirth(),
    visible: state.rebirths > 0 || state.cash >= cost * REBIRTH_VISIBLE_AT,
    keep: [
      'Pearls', 'Locker items', 'Index', `Rebirth bonus ×${+multNext.toFixed(2)}`, 'Best zone record',
      ...(REBIRTH.keep > 0 ? [REBIRTH.keep === 1 ? 'Your best creature' : `Your best ${REBIRTH.keep} creatures`] : []),
    ],
    lose: ['Cash', 'All upgrades', ...(REBIRTH.keep > 0 ? [] : ['Creatures on pedestals']), `Pedestals back to ${baseSlots(emptyLevels())}`],
  };
}

/** Data for the Shop panel (UPGRADES and REBIRTH tabs). */
export function buildShopView(state: GameState): ShopView {
  return {
    cash: state.cash,
    income: state.incomePerSec(),
    rows: UPGRADE_ORDER.map((k) => buildShopRow(state, k)),
    rebirth: buildRebirthView(state),
    lockerUnlocked: state.voyage.step >= 12,
  };
}
