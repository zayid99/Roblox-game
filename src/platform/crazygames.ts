// Thin wrapper around the CrazyGames HTML5 SDK (v3).
// On CrazyGames (Basic and Full Launch) the SDK script is loaded here at boot, so the same build works on
// both; elsewhere nothing is loaded and everything falls back to no-ops and localStorage. A static SDK
// script tag in index.html is picked up too. `?sdk` forces the load (local SDK testing), `?nosdk` skips it.

const SDK_URL = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';
/** A blocked or hanging SDK must never keep the loading screen up. */
const SDK_LOAD_MS = 8000;
const SDK_INIT_MS = 8000;

type AdType = 'midgame' | 'rewarded';

interface AdCallbacks {
  adStarted?: () => void;
  adFinished?: () => void;
  adError?: (error: unknown) => void;
}

interface CrazySdk {
  init(): Promise<void>;
  environment?: string;
  game: {
    gameplayStart(): void;
    gameplayStop(): void;
    loadingStart?(): void;
    loadingStop?(): void;
    happytime(): void;
    /** Platform-wide settings (muteAudio overrides the in-game sound toggle, §8.7). */
    settings?: { muteAudio?: boolean; disableChat?: boolean };
    addSettingsChangeListener?(listener: (settings: { muteAudio?: boolean }) => void): void;
  };
  ad: {
    requestAd(type: AdType, callbacks: AdCallbacks): void;
  };
  data?: {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
  };
}

declare global {
  interface Window {
    CrazyGames?: { SDK: CrazySdk };
  }
}

/** True when the page is served by CrazyGames (their game iframe), or the URL asks for the SDK. */
export function wantsSdk(loc: { hostname: string; search: string }): boolean {
  const q = new URLSearchParams(loc.search);
  if (q.has('nosdk')) return false;
  if (q.has('sdk')) return true;
  return /(^|\.)crazygames\.[a-z]{2,}(\.[a-z]{2})?$/i.test(loc.hostname);
}

function loadScript(src: string, ms: number): Promise<void> {
  return new Promise((resolve) => {
    const s = document.createElement('script');
    const done = (): void => {
      clearTimeout(timer);
      s.onload = s.onerror = null;
      resolve();
    };
    const timer = setTimeout(done, ms);
    s.onload = done;
    s.onerror = done;
    s.async = true;
    s.src = src;
    document.head.appendChild(s);
  });
}

function timeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

export class Platform {
  private sdk: CrazySdk | null = null;
  private playing = false;
  private muted = false;
  /** Called when the platform's muteAudio setting changes. */
  onMuteChange: ((muted: boolean) => void) | null = null;

  async init(): Promise<void> {
    // ?muteAudio=true simulates the platform's mute setting (testing without the SDK).
    if (new URLSearchParams(location.search).get('muteAudio') === 'true') this.muted = true;
    if (!window.CrazyGames?.SDK && wantsSdk(location)) await loadScript(SDK_URL, SDK_LOAD_MS);
    const sdk = window.CrazyGames?.SDK;
    if (!sdk) return;
    try {
      await timeout(Promise.resolve(sdk.init()), SDK_INIT_MS);
      this.sdk = sdk;
      if (sdk.game.settings?.muteAudio) this.muted = true;
      sdk.game.addSettingsChangeListener?.((s) => {
        this.muted = !!s.muteAudio;
        this.onMuteChange?.(this.muted);
      });
    } catch (err) {
      console.warn('CrazyGames SDK init failed, running without it.', err);
    }
  }

  /** The platform's muteAudio setting (§8.7). */
  get platformMuted(): boolean {
    return this.muted;
  }

  /** True when the SDK's data module stores saves (in addition to the localStorage mirror). */
  get hasDataModule(): boolean {
    return this.data !== null;
  }

  /** The data module, only where the SDK is live (a 'disabled' SDK outside CrazyGames stores nothing). */
  private get data(): CrazySdk['data'] | null {
    return this.hasSdk ? (this.sdk!.data ?? null) : null;
  }

  get hasSdk(): boolean {
    return this.sdk !== null && this.sdk.environment !== 'disabled';
  }

  loadingStart(): void {
    this.call(() => this.sdk?.game.loadingStart?.());
  }

  loadingStop(): void {
    this.call(() => this.sdk?.game.loadingStop?.());
  }

  gameplayStart(): void {
    if (this.playing) return;
    this.playing = true;
    this.call(() => this.sdk?.game.gameplayStart());
  }

  gameplayStop(): void {
    if (!this.playing) return;
    this.playing = false;
    this.call(() => this.sdk?.game.gameplayStop());
  }

  happytime(): void {
    this.call(() => this.sdk?.game.happytime());
  }

  /**
   * Shows an ad. onDone runs exactly once: true when the ad played to the end, false on an error (also
   * after adStarted), an ad that never starts, or no SDK. onStart runs at most once, before onDone.
   */
  requestAd(type: AdType, hooks: { onStart?: () => void; onDone: (rewarded: boolean) => void }): void {
    let started = false;
    let finished = false;
    const done = (ok: boolean): void => {
      if (finished) return;
      finished = true;
      hooks.onDone(ok);
    };
    if (!this.hasSdk) {
      done(false);
      return;
    }
    try {
      const r = this.sdk!.ad.requestAd(type, {
        adStarted: () => {
          if (started || finished) return;
          started = true;
          hooks.onStart?.();
        },
        adFinished: () => done(true),
        adError: () => done(false),
      }) as unknown;
      // Some SDK builds also return a promise; a rejection is an ad error, not an unhandled rejection.
      if (r && typeof (r as Promise<void>).catch === 'function') (r as Promise<void>).catch(() => done(false));
    } catch {
      done(false);
    }
  }

  getItem(key: string): string | null {
    try {
      const data = this.data;
      if (data) return data.getItem(key);
    } catch {
      /* fall through to localStorage */
    }
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  setItem(key: string, value: string): void {
    try {
      const data = this.data;
      if (data) {
        data.setItem(key, value);
        return;
      }
    } catch {
      /* fall through to localStorage */
    }
    try {
      window.localStorage.setItem(key, value);
    } catch {
      /* storage blocked (private mode); progress just won't persist */
    }
  }

  private call(fn: () => void): void {
    try {
      fn();
    } catch (err) {
      console.warn('CrazyGames SDK call failed', err);
    }
  }
}
