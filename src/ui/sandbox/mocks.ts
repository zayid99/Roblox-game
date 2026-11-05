// Static mocks for the UI sandbox: HudView, PanelData, UiActions and placeholder portraits.
import type {
  DailyTile, HudView, IndexEntry, LockerItemView, PanelData, PanelKind, PanelTab, QualityTier, Reward, Settings, ShopRow, UiActions,
} from '../../contracts';
import { RARITIES, SPECIES, creatureIncome, getSpecies, type CreatureRef } from '../../game/creatures';
import { UPGRADES, UPGRADE_ORDER, formatCash, rebirthCost, rebirthMultiplier, upgradeCost, type UpgradeKey } from '../../game/economy';
import { ZONES } from '../../game/zones';

// ---------------------------------------------------------------- portraits
const cache = new Map<string, string>();

/** A simple blob creature portrait in the species colours (sandbox placeholder). */
export function mockPortrait(c: CreatureRef): string {
  const key = `${c.speciesId}:${c.mutation}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const sp = getSpecies(c.speciesId);
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const g = cv.getContext('2d') as CanvasRenderingContext2D;
  const body = c.mutation === 1 ? '#FFD23F' : c.mutation === 2 ? '#8EF3FF' : c.mutation === 3 ? '#FF6BF2' : sp.look.body;
  g.lineJoin = 'round';
  g.lineWidth = 7;
  g.strokeStyle = '#1B1736';
  // Body
  g.fillStyle = body;
  g.beginPath();
  const plan = sp.look.plan;
  if (plan === 'fish' || plan === 'whale') {
    g.ellipse(60, 70, 44, 34, 0, 0, Math.PI * 2);
    g.moveTo(100, 70);
    g.lineTo(122, 50);
    g.lineTo(122, 92);
    g.closePath();
  } else if (plan === 'crab') {
    g.ellipse(64, 76, 44, 30, 0, 0, Math.PI * 2);
  } else if (plan === 'jelly' || plan === 'octo') {
    g.moveTo(20, 96);
    g.bezierCurveTo(14, 30, 114, 30, 108, 96);
    g.quadraticCurveTo(96, 86, 86, 98);
    g.quadraticCurveTo(75, 86, 64, 98);
    g.quadraticCurveTo(53, 86, 42, 98);
    g.quadraticCurveTo(31, 86, 20, 96);
  } else {
    g.ellipse(64, 72, 46, 40, 0, 0, Math.PI * 2);
  }
  g.fill();
  g.stroke();
  // Belly / accent
  g.save();
  g.clip();
  g.fillStyle = 'rgba(27,23,54,.18)';
  g.beginPath();
  g.ellipse(84, 98, 60, 30, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,.45)';
  g.beginPath();
  g.ellipse(46, 50, 16, 8, -0.5, 0, Math.PI * 2);
  g.fill();
  g.restore();
  if (plan === 'crab') {
    for (const x of [16, 112]) {
      g.fillStyle = sp.look.accent;
      g.beginPath();
      g.arc(x, 52, 13, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
  }
  // Face
  for (const x of [50, 78]) {
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(x, 64, 10, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 4;
    g.stroke();
    g.fillStyle = '#1B1736';
    g.beginPath();
    g.arc(x + 2, 66, 4.5, 0, Math.PI * 2);
    g.fill();
  }
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(54, 84);
  g.quadraticCurveTo(64, 92, 76, 82);
  g.stroke();
  g.fillStyle = 'rgba(255,154,182,.85)';
  g.fillRect(36, 76, 9, 5);
  g.fillRect(84, 76, 9, 5);
  if (sp.look.acc === 'crown' || sp.look.acc === 'tophat' || sp.look.acc === 'pirate' || sp.look.acc === 'helmet') {
    g.fillStyle = sp.look.acc === 'crown' ? '#FFC92E' : '#2B2B3A';
    g.lineWidth = 5;
    g.beginPath();
    if (sp.look.acc === 'crown') {
      g.moveTo(44, 36); g.lineTo(48, 14); g.lineTo(58, 28); g.lineTo(64, 10); g.lineTo(70, 28); g.lineTo(80, 14); g.lineTo(84, 36);
    } else {
      g.rect(46, 14, 36, 24);
    }
    g.closePath();
    g.fill();
    g.stroke();
  }
  const url = cv.toDataURL('image/png');
  cache.set(key, url);
  return url;
}

// ---------------------------------------------------------------- state
export interface MockState {
  cash: number; pearls: number; income: number; rebirths: number; streak: number;
  levels: Record<UpgradeKey, number>;
  carried: CreatureRef[];
  found: Map<string, number>;
  owned: Set<string>; equipped: string;
  luckyTide: number; dailyCount: number; dailyClaimable: boolean; giftsClaimed: Set<number>; giftsReady: number;
  settings: Settings; lockerUnlocked: boolean;
}

export function makeState(): MockState {
  const found = new Map<string, number>();
  for (const s of SPECIES) if (s.rarity <= 2 || s.id === 'king_krill' || s.id === 'pizza_kraken' || s.id === 'captain_splash') found.set(s.id, s.rarity === 0 ? 0b0111 : 0b0001);
  found.set('crab_dj', 0b1011);
  return {
    cash: 12_480, pearls: 140, income: 85, rebirths: 1, streak: 3,
    levels: { speed: 4, reach: 2, power: 3, carry: 1, slots: 8 },
    carried: [{ speciesId: 'banana_shark', mutation: 0 }, { speciesId: 'king_krill', mutation: 1 }],
    found,
    owned: new Set(['rope_hemp', 'rope_kelp', 'rope_sailor']), equipped: 'rope_kelp',
    luckyTide: 2, dailyCount: 2, dailyClaimable: true, giftsClaimed: new Set([0, 1]), giftsReady: 2,
    settings: { music: 50, sound: 80, muted: false, quality: 'auto', autoTier: 'medium', reduceMotion: false, camSens: 1, invertY: false, swingAssist: true },
    lockerUnlocked: true,
  };
}

export function makeHudView(s: MockState, layout: HudView['layout'], touch: boolean): HudView {
  return {
    layout, touch,
    cash: s.cash, pearls: s.pearls, income: s.income, multiplier: rebirthMultiplier(s.rebirths), rebirths: s.rebirths, streak: s.streak,
    wave: { phase: 'calm', frozen: false, timer: 28, duration: 70, golden: false, big: false, number: 7, progress: 0, hitsPlayerIn: null, safe: false },
    course: { playerT: 0.31, waveT: null, zone: 1, visible: true },
    carried: s.carried, capacity: 2 + s.levels.carry, tripBonusPct: 20,
    chain: { count: 4, timerFrac: 0.65 },
    action: false,
    rail: {
      shop: { visible: true, badge: null, arrow: true, wiggle: false },
      free: { visible: true, badge: 3, arrow: false, wiggle: true, timer: '2:41' },
      index: { visible: true, badge: 2, arrow: false, wiggle: false },
      rebirth: { visible: true, badge: '!', arrow: false, wiggle: false },
    },
    tracker: {
      title: 'FIRST VOYAGE', count: '7/12',
      rows: [{ icon: 'reach', text: 'Reach Coral Reef', progress: 0.6, reward: { cash: 1500 }, done: false }],
    },
    jumpLabel: 'JUMP', jumpGoldRim: false,
    reticle: null,
    edgeArrow: null,
    vignette: { kind: 'none', strength: 0 },
    hide: {},
  };
}

// ---------------------------------------------------------------- panel data
const ROPES: Omit<LockerItemView, 'owned' | 'equipped' | 'isNew'>[] = [
  { id: 'rope_hemp', kind: 'rope', name: 'Hemp Rope', rarity: 0, price: null, source: 'Default', colors: ['#D9A35F', '#B07A3A'], stripesPerM: 6 },
  { id: 'rope_sailor', kind: 'rope', name: 'Sailor Rope', rarity: 2, price: null, source: 'Voyage reward', colors: ['#F2F2F2', '#2B4C9B'], stripesPerM: 8 },
  { id: 'rope_kelp', kind: 'rope', name: 'Kelp Rope', rarity: 1, price: 60, source: null, colors: ['#3FA34D', '#1F6B3A'], stripesPerM: 6 },
  { id: 'rope_candy', kind: 'rope', name: 'Candy Stripe', rarity: 2, price: 150, source: null, colors: ['#FF4D5E', '#FFFFFF'], stripesPerM: 10 },
  { id: 'rope_neon', kind: 'rope', name: 'Neon Rope', rarity: 3, price: 300, source: null, colors: ['#2EE6FF', '#B8FBFF'], stripesPerM: 4 },
  { id: 'rope_chain', kind: 'rope', name: 'Golden Chain', rarity: 4, price: 600, source: null, colors: ['#FFC92E', '#B86400'], stripesPerM: 8 },
  { id: 'rope_lightning', kind: 'rope', name: 'Lightning Rope', rarity: 5, price: 1200, source: null, colors: ['#FFF07A', '#FFB52E'], stripesPerM: 12 },
  { id: 'rope_coral', kind: 'rope', name: 'Coral Rope', rarity: 6, price: null, source: 'Day 7 reward', colors: ['#FF8C7A', '#FFD1C2'], stripesPerM: 8 },
  { id: 'rope_aurora', kind: 'rope', name: 'Aurora Rope', rarity: 6, price: null, source: 'First rebirth', colors: ['#7FFBE6', '#C79BFF'], stripesPerM: 6 },
];

const DAILY: Reward[] = [
  { cash: 900, pearls: 10 }, { luckyTide: 1 }, { cash: 1500, pearls: 20 }, { cash: 3000 },
  { creature: { speciesId: 'disco_clam', mutation: 1 } }, { cash: 4500, pearls: 30 }, { cosmetic: 'rope_coral', pearls: 50, luckyTide: 1 },
];
const GIFTS: [number, Reward][] = [[1, { cash: 300 }], [3, { cash: 600 }], [5, { pearls: 10 }], [7, { cash: 900 }], [10, { luckyTide: 1 }], [13, { cash: 1500 }], [16, { pearls: 25 }], [20, { creature: { speciesId: 'waffle_walrus', mutation: 2 } }]];

export function makePanelData(s: MockState): PanelData {
  const shopRows = (): ShopRow[] =>
    UPGRADE_ORDER.map((key) => {
      const d = UPGRADES[key];
      const level = s.levels[key];
      const maxed = level >= d.maxLevel;
      const cost = upgradeCost(key, level);
      let cost5 = 0;
      for (let i = 0; i < 5 && level + i < d.maxLevel; i++) cost5 += upgradeCost(key, level + i);
      let n = 0;
      let costMax = 0;
      while (level + n < d.maxLevel && costMax + upgradeCost(key, level + n) <= s.cash) costMax += upgradeCost(key, level + n++);
      return {
        key, name: d.name, icon: d.iconId, level, max: d.maxLevel,
        now: d.format(d.value(level)), next: maxed ? null : d.format(d.value(level + 1)),
        cost, cost5, maxAffordable: n, costMax, affordable: !maxed && cost <= s.cash, maxed,
      };
    });
  const zoneOf = (r: number) => ZONES.find((z) => z.rarity === r)?.name ?? 'the deep';
  return {
    shop: () => {
      const cost = rebirthCost(s.rebirths);
      return {
        cash: s.cash, income: s.income, rows: shopRows(), lockerUnlocked: s.lockerUnlocked,
        rebirth: {
          cost, progress: Math.min(1, s.cash / cost), multNow: rebirthMultiplier(s.rebirths), multNext: rebirthMultiplier(s.rebirths + 1),
          can: s.cash >= cost, visible: true,
          keep: ['Pearls', 'Locker items', 'Index', `Rebirth bonus ×${rebirthMultiplier(s.rebirths + 1)}`, 'Best zone record'],
          lose: ['Cash', 'All upgrades', 'Creatures on pedestals', 'Pedestals back to 2'],
        },
      };
    },
    index: () => {
      const entries: IndexEntry[] = SPECIES.map((sp) => ({
        id: sp.id, name: sp.name, rarity: sp.rarity, income: creatureIncome({ speciesId: sp.id, mutation: 0 }),
        mask: s.found.get(sp.id) ?? 0, isNew: sp.id === 'king_krill' || sp.id === 'disco_clam', foundIn: zoneOf(sp.rarity),
      }));
      const found = entries.reduce((a, e) => a + [0, 1, 2, 3].filter((b) => (e.mask >> b) & 1).length, 0);
      return { found, total: SPECIES.length * 4, entries, featured: 'banana_shark' };
    },
    free: () => {
      const today = s.dailyCount % 7;
      const tiles: DailyTile[] = DAILY.map((reward, i) => ({
        day: i + 1, reward,
        state: i < today ? 'claimed' : i === today ? (s.dailyClaimable ? 'today' : 'claimed') : i === today + 1 ? 'tomorrow' : 'later',
        teaser: i === 4 || i === 6,
      }));
      const gifts = GIFTS.map(([atMin, reward], i) => ({
        atMin, reward,
        state: (s.giftsClaimed.has(i) ? 'claimed' : i < 2 + s.giftsReady ? 'ready' : 'locked') as 'claimed' | 'ready' | 'locked',
        secondsLeft: Math.max(0, atMin * 60 - 290),
      }));
      return { daily: { tiles, streak: s.streak, claimable: s.dailyClaimable, resetIn: 7 * 3600 + 12 * 60 }, gifts: { gifts, resetIn: 7 * 3600 }, luckyTide: s.luckyTide, streak: s.streak };
    },
    locker: () => ({
      pearls: s.pearls,
      items: ROPES.map((r) => ({ ...r, owned: s.owned.has(r.id), equipped: s.equipped === r.id, isNew: r.id === 'rope_candy' })),
    }),
    settings: () => ({ ...s.settings, platformMuted: false, autoTier: 'medium' as QualityTier }),
    welcome: () => ({
      offline: 18_400,
      daily: { day: (s.dailyCount % 7) + 1, reward: DAILY[s.dailyCount % 7], state: 'today', teaser: false },
      pendingGifts: [{ cash: 900 }, { pearls: 10 }],
      canDouble: true,
    }),
  };
}

export function makeActions(s: MockState, log: (msg: string) => void, hooks: { panelChanged(k: PanelKind | null, t?: PanelTab): void }): UiActions {
  return {
    buyUpgrade(key, n) {
      const d = UPGRADES[key];
      let bought = 0;
      const want = n === 'max' ? 99 : n;
      while (bought < want && s.levels[key] < d.maxLevel && upgradeCost(key, s.levels[key]) <= s.cash) {
        s.cash -= upgradeCost(key, s.levels[key]);
        s.levels[key]++;
        bought++;
      }
      log(`buy ${key} x${bought}`);
      return bought > 0;
    },
    rebirth() { s.cash = 0; s.rebirths++; log('rebirth'); },
    claimDaily() { s.dailyClaimable = false; s.dailyCount++; s.pearls += 10; s.cash += 900; log('claimDaily'); },
    claimGift(i) {
      const list = i === 'all' ? GIFTS.map((_, k) => k) : [i];
      for (const k of list) {
        const g = GIFTS[k];
        if (s.giftsClaimed.has(k) || k >= 2 + s.giftsReady) continue;
        s.giftsClaimed.add(k);
        s.cash += g[1].cash ?? 0;
        s.pearls += g[1].pearls ?? 0;
      }
      log(`claimGift ${i}`);
    },
    useLuckyTide() { s.luckyTide = Math.max(0, s.luckyTide - 1); log('useLuckyTide'); },
    buyCosmetic(id) { const r = ROPES.find((x) => x.id === id); if (r?.price && s.pearls >= r.price) { s.pearls -= r.price; s.owned.add(id); s.equipped = id; } log(`buyCosmetic ${id}`); },
    equipCosmetic(id) { s.equipped = id; log(`equip ${id}`); },
    setSettings(p) { Object.assign(s.settings, p); log(`settings ${JSON.stringify(p)}`); },
    replayTutorial() { log('replayTutorial'); },
    collectWelcome(d) { s.cash += d ? 36_800 : 18_400; log(`collectWelcome ${d}`); },
    toggleMute() { s.settings.muted = !s.settings.muted; log('toggleMute'); },
    skipTutorial() { log('skipTutorial'); },
    panelChanged(k, t) { hooks.panelChanged(k, t); },
  };
}

export { RARITIES, formatCash };
