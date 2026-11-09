import { describe, expect, it } from 'vitest';
import { ECONOMY } from '../src/game/config';
import { creatureIncome, rollCreature, RARITIES, SPECIES } from '../src/game/creatures';
import { REBIRTH, formatCash, offlineEarnings, upgradeCost, UPGRADES, UPGRADE_ORDER } from '../src/game/economy';
import { Rng } from '../src/game/rng';
import { GameState } from '../src/game/state';

describe('creatures', () => {
  it('has three species per rarity', () => {
    RARITIES.forEach((_, r) => expect(SPECIES.filter((s) => s.rarity === r).length).toBe(5));
    expect(new Set(SPECIES.map((s) => s.id)).size).toBe(SPECIES.length);
  });

  it('mostly rolls the zone rarity, and golden waves roll better', () => {
    const rng = new Rng(1);
    let same = 0;
    let goldenMutations = 0;
    let normalMutations = 0;
    for (let i = 0; i < 2000; i++) {
      const c = rollCreature(3, false, rng);
      const r = SPECIES.find((s) => s.id === c.speciesId)!.rarity;
      if (r === 3) same++;
      if (c.mutation > 0) normalMutations++;
      if (rollCreature(3, true, rng).mutation > 0) goldenMutations++;
    }
    expect(same / 2000).toBeGreaterThan(0.7);
    expect(goldenMutations).toBeGreaterThan(normalMutations * 3);
  });

  it('pays more for rarer and mutated creatures', () => {
    expect(creatureIncome({ speciesId: 'toastopus', mutation: 0 })).toBe(1);
    expect(creatureIncome({ speciesId: 'toastopus', mutation: 1 })).toBe(2);
    expect(creatureIncome({ speciesId: 'big_cheese', mutation: 0 })).toBeGreaterThan(creatureIncome({ speciesId: 'pizza_kraken', mutation: 0 }));
  });
});

describe('game state', () => {
  it('places carried creatures at home and earns from them', () => {
    const s = new GameState();
    s.pickUp({ speciesId: 'toastopus', mutation: 0 });
    s.pickUp({ speciesId: 'crab_dj', mutation: 0 });
    expect(s.canCarryMore()).toBe(false);
    expect(s.pickUp({ speciesId: 'toastopus', mutation: 0 })).toBe(false);
    const result = s.deliver();
    expect(result.placed.length).toBe(2);
    expect(s.carried.length).toBe(0);
    expect(s.incomePerSec()).toBe(1 + 3);
    s.tick(10);
    expect(s.cash).toBeCloseTo(40);
    expect(s.index.toastopus).toBe(1);
  });

  it('swaps out the weakest creature when the base is full', () => {
    const s = new GameState();
    for (let i = 0; i < s.slotCount; i++) s.base[i] = { speciesId: 'toastopus', mutation: 0 };
    s.carried = [{ speciesId: 'king_krill', mutation: 0 }, { speciesId: 'toastopus', mutation: 0 }];
    const result = s.deliver();
    expect(result.placed.map((c) => c.speciesId)).toEqual(['king_krill']);
    expect(result.sold.length).toBe(2);
    expect(s.base.filter((c) => c?.speciesId === 'king_krill').length).toBe(1);
    expect(s.cash).toBeCloseTo(60);
  });

  it('buys upgrades with growing costs', () => {
    const s = new GameState();
    for (const key of UPGRADE_ORDER) expect(upgradeCost(key, 1)).toBeGreaterThan(upgradeCost(key, 0));
    s.cash = 1000;
    expect(s.buy('slots')).toBe(true);
    expect(s.base.length).toBe(UPGRADES.slots.value(1));
    expect(s.cash).toBe(1000 - upgradeCost('slots', 0));
    s.cash = 0;
    expect(s.buy('speed')).toBe(false);
  });

  it('rebirth resets cash, upgrades and the base, and multiplies income', () => {
    const s = new GameState();
    s.base[0] = { speciesId: 'big_cheese', mutation: 0 };
    s.levels.speed = 5;
    const before = s.incomePerSec();
    s.cash = s.rebirthCost();
    expect(s.rebirth()).toBe(true);
    expect(s.levels.speed).toBe(0);
    expect(s.cash).toBe(0);
    expect(s.base.filter(Boolean).length).toBe(REBIRTH.keep);
    s.base[0] = { speciesId: 'big_cheese', mutation: 0 };
    expect(s.incomePerSec()).toBeCloseTo(before * REBIRTH.multGrowth);
  });

  it('round-trips through a save and rejects garbage', () => {
    const s = new GameState();
    s.cash = 123;
    s.levels.reach = 3;
    s.base[1] = { speciesId: 'disco_clam', mutation: 2 };
    s.flags.tutorialDone = true;
    const loaded = new GameState();
    expect(loaded.load(JSON.parse(JSON.stringify(s.toSave())))).toBe(true);
    expect(loaded.cash).toBe(123);
    expect(loaded.levels.reach).toBe(3);
    expect(loaded.base[1]).toEqual({ speciesId: 'disco_clam', mutation: 2 });
    expect(loaded.flags.tutorialDone).toBe(true);

    const fresh = new GameState();
    expect(fresh.load('nope')).toBe(false);
    expect(fresh.load({ v: 1, cash: -5, levels: { speed: 999 }, base: [{ speciesId: 'fake', mutation: 0 }] })).toBe(true);
    expect(fresh.cash).toBe(0);
    expect(fresh.levels.speed).toBe(UPGRADES.speed.maxLevel);
    expect(fresh.base.every((c) => c === null)).toBe(true);
  });

  it('pays offline earnings up to the cap', () => {
    expect(offlineEarnings(10, 60)).toBeCloseTo(600 * ECONOMY.offlineRate);
    expect(offlineEarnings(10, 10 * 3600)).toBeCloseTo(36000 * ECONOMY.offlineRate);
    expect(offlineEarnings(10, -5)).toBe(0);
  });

  it('formats money', () => {
    expect(formatCash(5)).toBe('$5');
    expect(formatCash(1234)).toBe('$1.23K');
    expect(formatCash(56_700_000)).toBe('$56.7M');
  });
});
