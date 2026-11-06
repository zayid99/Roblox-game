import { describe, expect, it } from 'vitest';
import { RARITIES, getSpecies } from '../src/game/creatures';
import {
  BUDDY_BONUS, EGGS, EGG_MINUTES, EGG_UP_CHANCE, STAGE_INCOME, activeBuddy, buddyBonus, buildHatcheryView, deliveryMult,
  eggOdds, eggPrice, eggUnlocked, hatchEgg, inHatcheryZone, rollEgg, setBuddy, formatPct, HATCHERY_ZONE,
} from '../src/game/hatchery';
import { Rng } from '../src/game/rng';
import { GameSim } from '../src/game/sim';
import { GameState, emptyStats } from '../src/game/state';
import { ZONES } from '../src/game/zones';

describe('hatchery eggs', () => {
  it('has one egg per zone with that zone rarity and rising prices', () => {
    expect(EGGS.length).toBe(ZONES.length);
    EGGS.forEach((e, i) => {
      expect(e.zone).toBe(i);
      expect(e.rarity).toBe(ZONES[i].rarity);
      if (i > 0) expect(e.price).toBeGreaterThan(EGGS[i - 1].price);
    });
    expect(EGGS.map((e) => e.name)).toEqual(['Shallows Egg', 'Reef Egg', 'Lagoon Egg', 'Storm Egg', 'Kraken Egg', 'Volcano Egg', 'Secret Egg']);
  });

  it('prices an egg at 3 to 6 minutes of the stage income', () => {
    for (let z = 0; z < EGGS.length; z++) {
      const minutes = eggPrice(z) / STAGE_INCOME[z] / 60;
      expect(minutes).toBeGreaterThanOrEqual(3);
      expect(minutes).toBeLessThanOrEqual(6);
    }
    expect(EGG_MINUTES).toBeGreaterThanOrEqual(3);
  });

  it('costs far more than the creature earns back quickly, so swinging stays the main source', () => {
    // A hatched creature of the egg's rarity needs well over 5 minutes to repay the egg.
    for (const e of EGGS) {
      const payback = e.price / (RARITIES[e.rarity].income * 1.3);
      expect(payback).toBeGreaterThan(5 * 60);
    }
  });

  it('odds sum to 1: mostly the zone rarity, a small chance one rarity up', () => {
    for (let z = 0; z < EGGS.length; z++) {
      const odds = eggOdds(z);
      expect(odds.reduce((s, o) => s + o.p, 0)).toBeCloseTo(1, 10);
      expect(odds[0].rarity).toBe(EGGS[z].rarity);
      expect(odds[0].p).toBeGreaterThanOrEqual(0.85);
    }
    expect(eggOdds(0)).toEqual([{ rarity: 0, p: 1 - EGG_UP_CHANCE }, { rarity: 1, p: EGG_UP_CHANCE }]);
    expect(eggOdds(6)).toEqual([{ rarity: 6, p: 1 }]);
  });

  it('rolls match the shown odds over many hatches', () => {
    const rng = new Rng(42);
    const n = 20000;
    let up = 0;
    let mutated = 0;
    for (let i = 0; i < n; i++) {
      const c = rollEgg(2, rng);
      const r = getSpecies(c.speciesId).rarity;
      expect([2, 3]).toContain(r);
      if (r === 3) up++;
      if (c.mutation > 0) mutated++;
    }
    expect(up / n).toBeGreaterThan(EGG_UP_CHANCE - 0.015);
    expect(up / n).toBeLessThan(EGG_UP_CHANCE + 0.015);
    // Gold 4% + Diamond 1% + Rainbow 0.2% = 5.2%.
    expect(mutated / n).toBeGreaterThan(0.04);
    expect(mutated / n).toBeLessThan(0.065);
  });

  it('unlocks eggs by best zone reached', () => {
    const s = new GameState();
    expect(eggUnlocked(s, 0)).toBe(false);
    s.bestZone = 2;
    expect([0, 1, 2, 3].map((z) => eggUnlocked(s, z))).toEqual([true, true, true, false]);
    expect(eggUnlocked(s, -1)).toBe(false);
    expect(eggUnlocked(s, 99)).toBe(false);
  });

  it('hatching pays, grants the creature to the base and counts it', () => {
    const s = new GameState();
    s.bestZone = 1;
    s.cash = EGGS[1].price + 10;
    const out = hatchEgg(s, 1, new Rng(1));
    expect(typeof out).toBe('object');
    if (typeof out === 'string') return;
    expect(s.cash).toBe(10);
    expect(s.counters.eggsHatched).toBe(1);
    expect(s.base.filter(Boolean)).toEqual([out.ref]);
    expect(out.result.placed).toEqual([out.ref]);
    expect(out.isNewSpecies).toBe(true);
    expect(s.index[out.ref.speciesId]).toBeGreaterThan(0);
    expect(out.eggName).toBe('Reef Egg');
  });

  it('refuses locked eggs and eggs the player cannot afford, without side effects', () => {
    const s = new GameState();
    s.bestZone = 0;
    s.cash = 1e12;
    expect(hatchEgg(s, 1, new Rng(1))).toBe('locked');
    s.cash = EGGS[0].price - 1;
    expect(hatchEgg(s, 0, new Rng(1))).toBe('cash');
    expect(s.cash).toBe(EGGS[0].price - 1);
    expect(s.counters.eggsHatched).toBe(0);
    expect(s.base.every((c) => c === null)).toBe(true);
  });

  it('follows the delivery rules when the base is full (sells the weaker creature)', () => {
    const s = new GameState();
    s.bestZone = 6;
    s.base = s.base.map(() => ({ speciesId: 'big_cheese', mutation: 0 }));
    s.cash = EGGS[0].price;
    const out = hatchEgg(s, 0, new Rng(3));
    if (typeof out === 'string') throw new Error(out);
    expect(out.result.placed).toEqual([]);
    expect(out.result.sold.length).toBe(1);
    expect(out.result.sold[0].creature).toEqual(out.ref);
    expect(s.cash).toBeGreaterThan(0); // sold for 30 s of its income
  });

  it('builds the panel view', () => {
    const s = new GameState();
    s.bestZone = 1;
    s.cash = 3000;
    s.index.toastopus = 1;
    const v = buildHatcheryView(s);
    expect(v.eggs.length).toBe(EGGS.length);
    expect(v.eggs[0].unlocked && v.eggs[0].affordable).toBe(true);
    expect(v.eggs[2].unlocked).toBe(false);
    expect(v.eggs[0].species.find((x) => x.id === 'toastopus')?.found).toBe(true);
    expect(v.mutations.map((m) => m.name)).toEqual(['Gold', 'Diamond', 'Rainbow']);
    expect(formatPct(0.002)).toBe('0.2%');
    expect(formatPct(0.9)).toBe('90%');
  });

  it('opens from a box in front of the stand', () => {
    expect(inHatcheryZone((HATCHERY_ZONE.minX + HATCHERY_ZONE.maxX) / 2, (HATCHERY_ZONE.minZ + HATCHERY_ZONE.maxZ) / 2)).toBe(true);
    expect(inHatcheryZone(0, 6)).toBe(false); // the spawn
  });
});

describe('buddy', () => {
  it('gives +5% (Common) to +35% (Secret)', () => {
    expect(BUDDY_BONUS.length).toBe(RARITIES.length);
    expect(buddyBonus({ speciesId: 'toastopus', mutation: 0 })).toBeCloseTo(0.05);
    expect(buddyBonus({ speciesId: 'crab_dj', mutation: 2 })).toBeCloseTo(0.1);
    expect(buddyBonus({ speciesId: 'captain_splash', mutation: 0 })).toBeCloseTo(0.35);
  });

  it('can only equip a creature that is on the base, and goes inactive when it leaves', () => {
    const s = new GameState();
    expect(setBuddy(s, { speciesId: 'crab_dj', mutation: 0 })).toBe(false);
    s.base[0] = { speciesId: 'crab_dj', mutation: 0 };
    expect(setBuddy(s, { speciesId: 'crab_dj', mutation: 1 })).toBe(false);
    expect(setBuddy(s, { speciesId: 'crab_dj', mutation: 0 })).toBe(true);
    expect(activeBuddy(s)).toEqual({ speciesId: 'crab_dj', mutation: 0 });
    expect(deliveryMult(s)).toBeCloseTo(1.1);
    expect(buildHatcheryView(s).buddy?.bonus).toBeCloseTo(0.1);
    s.base[0] = null;
    expect(activeBuddy(s)).toBeNull();
    expect(deliveryMult(s)).toBe(1);
    expect(setBuddy(s, null)).toBe(true);
    expect(s.buddy).toBeNull();
  });

  it('boosts delivery cash in the sim', () => {
    const run = (buddy: boolean) => {
      const s = new GameState();
      s.base[0] = { speciesId: 'king_krill', mutation: 0 };
      if (buddy) setBuddy(s, s.base[0]);
      const sim = new GameSim(s);
      s.carried.push({ speciesId: 'banana_shark', mutation: 0 });
      sim.player.reset(sim.course.homeSpawn);
      sim.step(1 / 120, { moveX: 0, moveZ: 0, jumpHeld: false, jumpPressed: false });
      const e = sim.events.find((x) => x.type === 'deliver');
      return e && e.type === 'deliver' ? e.bonusCash : -1;
    };
    const plain = run(false);
    expect(plain).toBeGreaterThan(0);
    expect(run(true)).toBeCloseTo(plain * 1.25, 6);
  });
});

describe('hatchery save fields', () => {
  it('round-trips the buddy and the eggs-hatched stat', () => {
    const s = new GameState();
    s.base[1] = { speciesId: 'disco_clam', mutation: 1 };
    setBuddy(s, s.base[1]);
    s.counters.eggsHatched = 7;
    const json = JSON.parse(JSON.stringify(s.toSave(1000)));
    const t = new GameState();
    expect(t.load(json)).toBe(true);
    expect(t.buddy).toEqual({ speciesId: 'disco_clam', mutation: 1 });
    expect(t.counters.eggsHatched).toBe(7);
    expect(activeBuddy(t)).toEqual({ speciesId: 'disco_clam', mutation: 1 });
  });

  it('loads a v2 save from before the Hatchery (no buddy, no eggsHatched)', () => {
    const s = new GameState();
    s.cash = 500;
    s.base[0] = { speciesId: 'toastopus', mutation: 0 };
    const old = JSON.parse(JSON.stringify(s.toSave(1000))) as Record<string, unknown>;
    delete old.buddy;
    delete (old.stats as Record<string, unknown>).eggsHatched;
    const t = new GameState();
    expect(t.load(old)).toBe(true);
    expect(t.cash).toBe(500);
    expect(t.buddy).toBeNull();
    expect(t.counters.eggsHatched).toBe(0);
    expect(t.counters).toEqual(emptyStats());
  });

  it('drops a malformed or unknown buddy', () => {
    for (const buddy of [{ speciesId: 'nope', mutation: 0 }, { speciesId: 'crab_dj', mutation: 9 }, 'crab_dj', 5]) {
      const s = new GameState();
      const save = { ...JSON.parse(JSON.stringify(s.toSave(1000))), buddy };
      const t = new GameState();
      expect(t.load(save)).toBe(true);
      expect(t.buddy).toBeNull();
    }
  });

  it('migrates a v1 save with no buddy', () => {
    const t = new GameState();
    expect(t.load({ v: 1, cash: 10, totalEarned: 10, rebirths: 0, levels: {}, base: [], index: {}, flags: {}, bestZone: 0, savedAt: 5 })).toBe(true);
    expect(t.buddy).toBeNull();
    expect(t.counters.eggsHatched).toBe(0);
  });
});
