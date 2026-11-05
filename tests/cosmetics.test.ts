import { describe, expect, it } from 'vitest';
import { ManualClock } from '../src/game/clock';
import { COSMETICS, buyCosmetic, equipCosmetic, getCosmetic, lockerItems } from '../src/game/cosmetics';
import { Progression } from '../src/game/progression';
import { applyReward } from '../src/game/rewards';
import { GameState } from '../src/game/state';

describe('locker cosmetics', () => {
  it('catalogue matches §9.5', () => {
    expect(COSMETICS.map((c) => c.id)).toEqual([
      'rope_hemp', 'rope_sailor', 'rope_kelp', 'rope_candy', 'rope_neon', 'rope_chain', 'rope_lightning', 'rope_coral', 'rope_seafoam', 'rope_aurora',
    ]);
    expect(getCosmetic('rope_kelp')!.price).toBe(60);
    expect(getCosmetic('rope_candy')!.price).toBe(150);
    expect(getCosmetic('rope_neon')!.price).toBe(300);
    expect(getCosmetic('rope_chain')!.price).toBe(600);
    expect(getCosmetic('rope_lightning')!.price).toBe(1200);
    expect(getCosmetic('rope_coral')!.price).toBeNull();
    expect(getCosmetic('rope_kelp')!.rarity).toBe(1);
    expect(getCosmetic('rope_lightning')!.rarity).toBe(5);
    expect(getCosmetic('rope_coral')!.rarity).toBe(6);
  });

  it('buys with Pearls, once, and only priced items', () => {
    const s = new GameState();
    s.pearls = 100;
    expect(buyCosmetic(s, 'rope_candy')).toBe(false);
    expect(buyCosmetic(s, 'rope_kelp')).toBe(true);
    expect(s.pearls).toBe(40);
    expect(buyCosmetic(s, 'rope_kelp')).toBe(false);
    s.pearls = 5000;
    expect(buyCosmetic(s, 'rope_coral')).toBe(false);
    expect(buyCosmetic(s, 'nope')).toBe(false);
  });

  it('equips owned ropes only; NEW until seen', () => {
    const s = new GameState();
    expect(equipCosmetic(s, 'rope_kelp')).toBe(false);
    applyReward(s, { cosmetic: 'rope_sailor' });
    let item = lockerItems(s).find((i) => i.id === 'rope_sailor')!;
    expect(item.owned).toBe(true);
    expect(item.isNew).toBe(true);
    expect(item.source).toBe('First Voyage reward');
    expect(equipCosmetic(s, 'rope_sailor')).toBe(true);
    item = lockerItems(s).find((i) => i.id === 'rope_sailor')!;
    expect(item.equipped).toBe(true);
    expect(item.isNew).toBe(false);
    expect(s.cosmetics.equipped.trail).toBe('trail_none');
  });

  it('Progression exposes the locker view and marks it seen', () => {
    const s = new GameState();
    const p = new Progression(s, new ManualClock(Date.UTC(2026, 10, 5)));
    s.pearls = 200;
    expect(p.buyCosmetic('rope_candy')).toBe(true);
    const v = p.locker();
    expect(v.pearls).toBe(50);
    expect(v.items.find((i) => i.id === 'rope_candy')!.isNew).toBe(true);
    expect(v.items.find((i) => i.id === 'rope_hemp')!.equipped).toBe(true);
    p.markLockerSeen();
    expect(p.locker().items.some((i) => i.isNew)).toBe(false);
    expect(p.equipCosmetic('rope_candy')).toBe(true);
    expect(s.toSave(0).cosmetics.equipped.rope).toBe('rope_candy');
  });
});
