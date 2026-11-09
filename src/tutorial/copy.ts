// Every player-facing string of the tutorial and the contextual hints (§7). No emoji.

export interface Line {
  headline: string;
  sub?: string;
}

/** A Controls card row (ready step). */
export interface ControlsRow {
  keys: string[];
  text: string;
  /** Row width: full, half, or a quarter when omitted (hotkeys). */
  size?: 'full' | 'half';
  /** The panel hotkey it opens: the row only shows while that panel is unlocked. */
  hotkey?: string;
}

export const COPY = {
  // Step 1 `grab`
  grabDesktop: { headline: 'RUN + JUMP + HOLD', sub: 'Hold to grab the hook' } as Line,
  grabTouch: { headline: 'RUN + HOLD JUMP', sub: 'Hold to grab the hook' } as Line,
  grabFail: { headline: 'HOLD IT', sub: 'Keep holding JUMP' } as Line,
  grabFailDesktop: { headline: 'HOLD IT', sub: 'Keep holding SPACE' } as Line,
  /** Sea fall without any jump (walked off the edge). */
  jumpFail: { headline: 'JUMP AT THE EDGE', sub: 'Then hold JUMP to grab' } as Line,
  jumpFailDesktop: { headline: 'JUMP AT THE EDGE', sub: 'Then hold SPACE to grab' } as Line,
  jumpHere: 'JUMP HERE',
  hookTag: 'HOLD',

  // Step 2 `release`
  wait: { headline: 'WAIT\u2026 SWING UP' } as Line,
  letGo: { headline: 'LET GO' } as Line,
  again: { headline: 'AGAIN', sub: 'Let go on the upswing' } as Line,
  pumpDesktop: { headline: 'PUMP', sub: 'Hold W to swing higher' } as Line,
  pumpTouch: { headline: 'PUMP', sub: 'Push the stick forward' } as Line,
  soClose: { headline: 'SO CLOSE', sub: 'Wait for the green arc' } as Line,
  niceSwing: 'NICE SWING',

  // Step 3 `collect`
  collect: (name: string): Line => ({ headline: `GRAB ${name.toUpperCase()}`, sub: 'Walk into it' }),
  collectMore: (n: number, cap: number): Line => ({ headline: `GRAB ONE MORE ${n}/${cap}` }),

  // Step 4 `home`
  home: { headline: 'TAKE THEM HOME' } as Line,
  meters: (m: number) => `${Math.max(0, Math.round(m))} m`,

  // Step 5 `earn` (banner)
  earnBanner: { headline: 'THEY EARN CASH', sub: "Even while you're away" } as Line,

  // Step 6 `shop`
  openShop: { headline: 'OPEN THE SHOP' } as Line,
  buyReach: { headline: 'BUY ROPE REACH' } as Line,
  focusNote: 'UNLOCKS ZONE 2',
  focusSub: 'Longer rope reaches farther islands',
  reachBanner: { headline: 'ROPE REACH UP', sub: 'Coral Reef unlocked' } as Line,
  boughtBanner: { headline: 'UPGRADED', sub: 'Every level helps' } as Line,

  // Step 7 `wave`
  wave: { headline: 'GRAB MORE, BEAT THE WAVE' } as Line,
  waveWarn: { headline: 'WAVE. GET SAFE.' } as Line,
  /** The wave is coming but the player already stands somewhere it cannot reach (matches the meter). */
  waveSafe: { headline: "YOU'RE SAFE", sub: 'Stay here till the wave passes' } as Line,
  etaPad: (s: number) => `Pad ${Math.max(0, Math.ceil(s))} s`,
  etaHome: (s: number) => `Home ${Math.max(0, Math.ceil(s))} s`,
  launch: 'LAUNCH',
  survivedBanner: { headline: 'YOU SURVIVED' } as Line,
  splash: { headline: "SPLASH. FIRST ONE'S FREE.", sub: 'Next wave takes what you carry.' } as Line,

  // Step 8 `ready`
  readyBanner: { headline: "YOU'RE READY", sub: 'Swing farther. Catch rarer.' } as Line,

  // Chrome
  skip: 'Skip tutorial ›',
  done: 'GOT IT',
  controlsTitle: 'CONTROLS',
  // size: 'full' row, 'half' row, or a quarter (hotkeys). hotkey: listed only while it does something.
  controlsDesktop: [
    { keys: ['W', 'A', 'S', 'D'], text: 'Move', size: 'half' },
    { keys: ['Q', 'E'], text: 'Turn camera', size: 'half' },
    { keys: ['SPACE'], text: 'Jump, hold to swing', size: 'full' },
    { keys: ['MOUSE'], text: 'Click, then move to look', size: 'full' },
    { keys: ['U'], text: 'Shop', hotkey: 'u' },
    { keys: ['G'], text: 'Free', hotkey: 'g' },
    { keys: ['I'], text: 'Index', hotkey: 'i' },
    { keys: ['H'], text: 'Eggs', hotkey: 'h' },
    { keys: ['L'], text: 'Locker', hotkey: 'l' },
    { keys: ['P'], text: 'Settings' },
    { keys: ['M'], text: 'Mute' },
    { keys: ['ESC'], text: 'Close' },
  ] as ControlsRow[],
  controlsTouch: [
    { keys: ['STICK'], text: 'Move', size: 'full' },
    { keys: ['JUMP'], text: 'Jump, hold to swing', size: 'full' },
    { keys: ['DRAG'], text: 'Drag the right side to look', size: 'full' },
  ] as ControlsRow[],

  // §7.4 hints
  dragToLook: { headline: 'LOOK AROUND' } as Line,
  hints: {
    lockedHook: (reach: number) => `Needs Rope Reach ${reach.toFixed(1)} m`,
    handsFull: 'Hands full. Head home.',
    baseFull: 'Base full. Extras sold for 30 s of cash.',
    doubleJumpTouch: 'Tap JUMP again in the air',
    doubleJumpDesktop: 'Press SPACE again in the air',
    lighthouse: 'Step on the pad to launch up',
    bounce: 'Buoys bounce you back up',
    goldenNext: 'Golden wave next. Rarer creatures after it.',
    firstMutation: (name: string, mult: number) => `${name.toUpperCase()}. Earns ×${mult}.`,
    seaFalls: 'Let go on the upswing',
    rebirthReady: 'Rebirth ready: ×1.5 cash forever',
    chainIntro: 'Chain hooks without stopping for bonus cash',
  },
} as const;

/** Every literal string in COPY (functions are called with sample arguments), for the no-emoji test. */
export function allCopyStrings(): string[] {
  const out: string[] = [];
  const visit = (v: unknown): void => {
    if (typeof v === 'string') out.push(v);
    else if (typeof v === 'function') {
      const f = v as (...a: unknown[]) => unknown;
      let r: unknown;
      try {
        r = f(4, 2);
      } catch {
        r = f('Diamond', 4);
      }
      visit(r);
    } else if (Array.isArray(v)) v.forEach(visit);
    else if (v && typeof v === 'object') Object.values(v).forEach(visit);
  };
  visit(COPY);
  return out;
}
