// CrazyGames wrapper: SDK load gating, init timeout, ads that call back twice, the data module only where
// the SDK is live, the mute setting and its listener. Node environment with a fake window/document.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Platform, wantsSdk } from '../src/platform/crazygames';

const g = globalThis as unknown as Record<string, unknown>;

function fakeStorage(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: () => null,
    get length() {
      return m.size;
    },
  } as Storage;
}

interface Cb {
  adStarted?: () => void;
  adFinished?: () => void;
  adError?: (e: unknown) => void;
}

function sdk(env = 'crazygames', over: Record<string, unknown> = {}) {
  const log: string[] = [];
  const data = new Map<string, string>();
  let listener: ((s: { muteAudio?: boolean }) => void) | null = null;
  let lastAd: Cb = {};
  const s = {
    environment: env,
    init: () => Promise.resolve(),
    game: {
      settings: { muteAudio: false },
      gameplayStart: () => log.push('start'),
      gameplayStop: () => log.push('stop'),
      happytime: () => log.push('happy'),
      addSettingsChangeListener: (fn: (s: { muteAudio?: boolean }) => void) => (listener = fn),
    },
    ad: {
      requestAd: (_t: string, cb: Cb) => {
        lastAd = cb;
      },
    },
    data: { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) },
    ...over,
  };
  return { s, log, data, ad: () => lastAd, setSettings: (v: { muteAudio?: boolean }) => listener?.(v) };
}

let appended: { src: string; onload: (() => void) | null; onerror: (() => void) | null }[];

beforeEach(() => {
  appended = [];
  g.window = { localStorage: fakeStorage() };
  g.localStorage = (g.window as { localStorage: Storage }).localStorage;
  g.location = { search: '', hostname: 'localhost' };
  g.document = {
    createElement: () => ({ src: '', async: false, onload: null, onerror: null }),
    head: { appendChild: (el: { src: string; onload: (() => void) | null; onerror: (() => void) | null }) => appended.push(el) },
  };
});
afterEach(() => {
  vi.useRealTimers();
  delete g.window;
  delete g.document;
  delete g.location;
  delete g.localStorage;
});

describe('wantsSdk', () => {
  it('loads on CrazyGames hosts only, with ?sdk / ?nosdk overrides', () => {
    expect(wantsSdk({ hostname: 'games.crazygames.com', search: '' })).toBe(true);
    expect(wantsSdk({ hostname: 'swing-or-splash.game-files.crazygames.com', search: '' })).toBe(true);
    expect(wantsSdk({ hostname: 'www.crazygames.co.uk', search: '' })).toBe(true);
    expect(wantsSdk({ hostname: 'notcrazygames.com', search: '' })).toBe(false);
    expect(wantsSdk({ hostname: 'crazygames.com.evil.io', search: '' })).toBe(false);
    expect(wantsSdk({ hostname: 'localhost', search: '' })).toBe(false);
    expect(wantsSdk({ hostname: '', search: '' })).toBe(false); // file://
    expect(wantsSdk({ hostname: 'localhost', search: '?sdk' })).toBe(true);
    expect(wantsSdk({ hostname: 'games.crazygames.com', search: '?nosdk' })).toBe(false);
  });
});

describe('Platform', () => {
  it('off CrazyGames: no script is loaded, ads report not rewarded, saves use localStorage', async () => {
    const p = new Platform();
    await p.init();
    expect(appended).toHaveLength(0);
    expect(p.hasSdk).toBe(false);
    const done = vi.fn();
    p.requestAd('rewarded', { onDone: done });
    expect(done).toHaveBeenCalledExactlyOnceWith(false);
    p.setItem('k', 'v');
    expect(p.getItem('k')).toBe('v');
  });

  it('on CrazyGames: loads the SDK script, and a blocked script does not hang the boot', async () => {
    vi.useFakeTimers();
    (g.location as { hostname: string }).hostname = 'games.crazygames.com';
    const p = new Platform();
    const boot = p.init();
    expect(appended).toHaveLength(1);
    expect(appended[0].src).toBe('https://sdk.crazygames.com/crazygames-sdk-v3.js');
    appended[0].onerror?.(); // blocked by an ad blocker
    await boot;
    expect(p.hasSdk).toBe(false);
  });

  it('a script that never answers and an init that never resolves both time out', async () => {
    vi.useFakeTimers();
    (g.location as { hostname: string }).hostname = 'games.crazygames.com';
    const p = new Platform();
    const boot = p.init();
    await vi.advanceTimersByTimeAsync(9000); // script timeout
    await boot;
    expect(p.hasSdk).toBe(false);

    const f = sdk('crazygames', { init: () => new Promise(() => {}) });
    (g.window as { CrazyGames?: unknown }).CrazyGames = { SDK: f.s };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const p2 = new Platform();
    const boot2 = p2.init();
    await vi.advanceTimersByTimeAsync(9000);
    await boot2;
    expect(p2.hasSdk).toBe(false);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('an SDK already on the page is used without loading another copy', async () => {
    const f = sdk();
    (g.window as { CrazyGames?: unknown }).CrazyGames = { SDK: f.s };
    (g.location as { hostname: string }).hostname = 'games.crazygames.com';
    const p = new Platform();
    await p.init();
    expect(appended).toHaveLength(0);
    expect(p.hasSdk).toBe(true);
    p.gameplayStart();
    p.gameplayStart();
    p.gameplayStop();
    p.gameplayStop();
    expect(f.log).toEqual(['start', 'stop']);
  });

  it('ads: onDone exactly once, onStart at most once, error after start is not a reward', async () => {
    const f = sdk();
    (g.window as { CrazyGames?: unknown }).CrazyGames = { SDK: f.s };
    const p = new Platform();
    await p.init();
    const start = vi.fn();
    const done = vi.fn();
    p.requestAd('rewarded', { onStart: start, onDone: done });
    f.ad().adStarted?.();
    f.ad().adStarted?.();
    f.ad().adError?.('x');
    f.ad().adFinished?.();
    f.ad().adError?.('y');
    expect(start).toHaveBeenCalledTimes(1);
    expect(done).toHaveBeenCalledExactlyOnceWith(false);

    const start2 = vi.fn();
    const done2 = vi.fn();
    p.requestAd('midgame', { onStart: start2, onDone: done2 });
    f.ad().adError?.('noFill'); // never started
    f.ad().adStarted?.();
    expect(start2).not.toHaveBeenCalled();
    expect(done2).toHaveBeenCalledExactlyOnceWith(false);
  });

  it('ads: a requestAd that returns a rejected promise reports one failure', async () => {
    const f = sdk('crazygames', {
      ad: { requestAd: (_t: string, cb: Cb) => {
        cb.adError?.('e');
        return Promise.reject(new Error('e'));
      } },
    });
    (g.window as { CrazyGames?: unknown }).CrazyGames = { SDK: f.s };
    const p = new Platform();
    await p.init();
    const done = vi.fn();
    p.requestAd('midgame', { onDone: done });
    await Promise.resolve();
    await Promise.resolve();
    expect(done).toHaveBeenCalledExactlyOnceWith(false);
  });

  it("the data module is used only where the SDK is live, not in its 'disabled' environment", async () => {
    const off = sdk('disabled');
    (g.window as { CrazyGames?: unknown }).CrazyGames = { SDK: off.s };
    const p = new Platform();
    await p.init();
    expect(p.hasDataModule).toBe(false);
    p.setItem('save', 'x');
    expect(off.data.size).toBe(0);
    expect(p.getItem('save')).toBe('x');

    const on = sdk('crazygames');
    (g.window as { CrazyGames?: unknown }).CrazyGames = { SDK: on.s };
    const p2 = new Platform();
    await p2.init();
    expect(p2.hasDataModule).toBe(true);
    p2.setItem('save', 'y');
    expect(on.data.get('save')).toBe('y');
    expect(p2.getItem('save')).toBe('y');
  });

  it('follows the platform mute setting and its change listener', async () => {
    const f = sdk();
    f.s.game.settings.muteAudio = true;
    (g.window as { CrazyGames?: unknown }).CrazyGames = { SDK: f.s };
    const p = new Platform();
    const changes: boolean[] = [];
    p.onMuteChange = (m) => changes.push(m);
    await p.init();
    expect(p.platformMuted).toBe(true);
    f.setSettings({ muteAudio: false });
    expect(p.platformMuted).toBe(false);
    f.setSettings({ muteAudio: true });
    expect(changes).toEqual([false, true]);
  });
});
