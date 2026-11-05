import { describe, expect, it } from 'vitest';
import { UPGRADES, bulkCost, cheapestUpgradeCost, emptyLevels, maxAffordable, upgradeCost } from '../src/game/economy';
import { buildShopView } from '../src/game/shopView';
import { GameState, SAVE_VERSION, migrateV1 } from '../src/game/state';

function v1Save(extra: Record<string, unknown> = {}) {
  return {
    v: 1,
    cash: 1234,
    totalEarned: 5000,
    rebirths: 1,
    levels: { speed: 2, reach: 3, power: 1, carry: 1, slots: 2 },
    base: [{ speciesId: 'crab_dj', mutation: 1 }, null, { speciesId: 'banana_shark', mutation: 0 }],
    index: { crab_dj: 0b11, banana_shark: 1 },
    flags: { swung: true },
    bestZone: 2,
    savedAt: 1_700_000_000_000,
    ...extra,
  };
}

describe('save v2 migration', () => {
  it('loads a v1 save without losing anything', () => {
    const s = new GameState();
    expect(s.load(v1Save())).toBe(true);
    expect(s.cash).toBe(1234);
    expect(s.totalEarned).toBe(5000);
    expect(s.rebirths).toBe(1);
    expect(s.levels).toEqual({ speed: 2, reach: 3, power: 1, carry: 1, slots: 2 });
    expect(s.base[0]).toEqual({ speciesId: 'crab_dj', mutation: 1 });
    expect(s.base[1]).toBeNull();
    expect(s.base[2]).toEqual({ speciesId: 'banana_shark', mutation: 0 });
    expect(s.index).toEqual({ crab_dj: 3, banana_shark: 1 });
    expect(s.flags.swung).toBe(true);
    expect(s.bestZone).toBe(2);
    expect(s.savedAt).toBe(1_700_000_000_000);
    expect(s.lastSeen).toBe(1_700_000_000_000);
    expect(s.pearls).toBe(0);
    expect(s.cosmetics.equipped.rope).toBe('rope_hemp');
    expect(s.counters.grabs).toBe(0);
    expect(s.settings.music).toBe(50);
    expect(s.settings.sound).toBe(80);
  });

  it('a v1 player who only swung gets the tutorial', () => {
    const m = migrateV1(v1Save());
    expect(m.ftue.done).toBe(false);
    expect(m.voyage.step).toBe(0);
  });

  it('a v1 player who delivered or bought skips the tutorial, voyage at 6', () => {
    for (const flags of [{ delivered: true }, { bought: true }]) {
      const s = new GameState();
      s.load(v1Save({ flags }));
      expect(s.ftue.done).toBe(true);
      expect(s.voyage.step).toBe(6);
    }
  });

  it('v1 sound:false loads as muted', () => {
    const s = new GameState();
    s.load(v1Save({ sound: false }));
    expect(s.settings.muted).toBe(true);
    const t = new GameState();
    t.load(v1Save({ sound: true }));
    expect(t.settings.muted).toBe(false);
  });

  it('round-trips a v2 save', () => {
    const s = new GameState();
    s.cash = 99;
    s.pearls = 70;
    s.ftue = { step: 'shop', done: false, skipped: false, rewarded: ['V1', 'V2'] };
    s.voyage.step = 3;
    s.daily = { lastClaimDay: '2026-11-04', count: 3, week: 1, streak: 3 };
    s.gifts = { day: '2026-11-05', activeSec: 400, claimed: [0, 1], pending: [5] };
    s.tokens.luckyTide = 2;
    s.cosmetics.owned.push('rope_kelp');
    s.cosmetics.equipped.rope = 'rope_kelp';
    s.counters.grabs = 17;
    s.counters.collectsByRarity[2] = 4;
    s.hintsSeen.push('coach:free');
    s.featuredWeekSeen = '2026-W45';
    s.settings.camSens = 1.5;
    const save = JSON.parse(JSON.stringify(s.toSave(1000)));
    expect(save.v).toBe(SAVE_VERSION);
    expect(save.stats.grabs).toBe(17);
    const t = new GameState();
    expect(t.load(save)).toBe(true);
    expect(t.toSave(1000)).toEqual(s.toSave(1000));
  });

  it('falls back field by field on malformed v2 data', () => {
    const s = new GameState();
    expect(
      s.load({
        v: 2,
        cash: 'lots',
        pearls: -4,
        settings: { music: 'loud', quality: 'ultra', autoTier: 'medium', invertY: true },
        ftue: { step: 'bogus', done: 'yes' },
        daily: null,
        cosmetics: { owned: ['rope_kelp', 5], equipped: { rope: 'rope_neon' } },
        stats: { grabs: 5, collectsByRarity: [1, 'x'] },
        gifts: { claimed: [1, -2, 'a'] },
      }),
    ).toBe(true);
    expect(s.cash).toBe(0);
    expect(s.pearls).toBe(0);
    expect(s.settings.music).toBe(50);
    expect(s.settings.quality).toBe('auto');
    expect(s.settings.autoTier).toBe('medium');
    expect(s.settings.invertY).toBe(true);
    expect(s.ftue).toEqual({ step: 'grab', done: false, skipped: false, rewarded: [] });
    expect(s.daily.lastClaimDay).toBeNull();
    expect(s.cosmetics.owned).toEqual(['rope_hemp', 'rope_kelp']);
    expect(s.cosmetics.equipped.rope).toBe('rope_hemp');
    expect(s.counters.grabs).toBe(5);
    expect(s.counters.collectsByRarity).toEqual([1, 0, 0, 0, 0, 0, 0]);
    expect(s.gifts.claimed).toEqual([1]);
    expect(s.load({ v: 3 })).toBe(false);
  });

  it('streak adds up to +7% to base income', () => {
    const s = new GameState();
    s.base[0] = { speciesId: 'toastopus', mutation: 0 };
    expect(s.baseIncomePerSec()).toBe(1);
    s.daily.streak = 3;
    expect(s.baseIncomePerSec()).toBeCloseTo(1.03);
    s.daily.streak = 30;
    expect(s.incomePerSec()).toBeCloseTo(1.07);
  });

  it('grantCreature places on the base and records the index; restoreCarried respects capacity', () => {
    const s = new GameState();
    const g = s.grantCreature({ speciesId: 'king_krill', mutation: 1 });
    expect(g.isNewSpecies).toBe(true);
    expect(g.result.placed.length).toBe(1);
    expect(s.base[0]).toEqual({ speciesId: 'king_krill', mutation: 1 });
    expect(s.grantCreature({ speciesId: 'king_krill', mutation: 2 }).isNewSpecies).toBe(false);
    s.restoreCarried([
      { speciesId: 'toastopus', mutation: 0 },
      { speciesId: 'toastopus', mutation: 0 },
      { speciesId: 'toastopus', mutation: 0 },
    ]);
    expect(s.carried.length).toBe(s.carryCapacity);
  });

  it('first rebirth grants the Aurora Rope, later ones 200 Pearls', () => {
    const s = new GameState();
    s.cash = s.rebirthCost();
    s.rebirth();
    expect(s.cosmetics.owned).toContain('rope_aurora');
    expect(s.pearls).toBe(0);
    s.cash = s.rebirthCost();
    s.rebirth();
    expect(s.pearls).toBe(200);
  });
});

describe('economy bulk buying', () => {
  it('bulkCost sums the next levels and stops at max', () => {
    expect(bulkCost('speed', 0, 1)).toBe(upgradeCost('speed', 0));
    expect(bulkCost('speed', 0, 3)).toBe(upgradeCost('speed', 0) + upgradeCost('speed', 1) + upgradeCost('speed', 2));
    const max = UPGRADES.carry.maxLevel;
    expect(bulkCost('carry', max - 1, 5)).toBe(upgradeCost('carry', max - 1));
    expect(bulkCost('carry', max, 5)).toBe(0);
  });

  it('maxAffordable and cheapestUpgradeCost', () => {
    const c2 = upgradeCost('speed', 0) + upgradeCost('speed', 1);
    expect(maxAffordable('speed', 0, c2)).toBe(2);
    expect(maxAffordable('speed', 0, c2 - 1)).toBe(1);
    expect(maxAffordable('speed', 0, 0)).toBe(0);
    expect(cheapestUpgradeCost(emptyLevels())).toBe(20);
    const maxed = { speed: 16, reach: 14, power: 12, carry: 6, slots: 8 };
    expect(cheapestUpgradeCost(maxed)).toBe(Infinity);
  });

  it('buyMany buys 5 or max, and counts upgradesBought', () => {
    const s = new GameState();
    s.cash = bulkCost('speed', 0, 5) - 1;
    expect(s.buyMany('speed', 5)).toBe(0);
    expect(s.buyMany('speed', 'max')).toBe(4);
    expect(s.counters.upgradesBought).toBe(4);
    s.cash = 1e9;
    expect(s.buyMany('carry', 'max')).toBe(UPGRADES.carry.maxLevel);
    expect(s.buyMany('carry', 1)).toBe(0);
  });

  it('builds the shop view', () => {
    const s = new GameState();
    s.cash = 100;
    const v = buildShopView(s);
    expect(v.rows.map((r) => r.key)).toEqual(['speed', 'reach', 'power', 'carry', 'slots']);
    const speed = v.rows[0];
    expect(speed.cost).toBe(20);
    expect(speed.affordable).toBe(true);
    expect(speed.maxAffordable).toBe(maxAffordable('speed', 0, 100));
    expect(speed.next).not.toBeNull();
    expect(v.rebirth.visible).toBe(false);
    expect(v.rebirth.multNext).toBe(1.5);
    expect(v.lockerUnlocked).toBe(false);
  });
});
