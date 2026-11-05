// Thin wrapper around the CrazyGames HTML5 SDK (v3).
// Basic Launch doesn't need the SDK, so everything here falls back to no-ops and localStorage.
// For Full Launch, add the SDK script tag to index.html (see the README); this wrapper picks it up.

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

export class Platform {
  private sdk: CrazySdk | null = null;
  private playing = false;
  private muted = false;
  /** Called when the platform's muteAudio setting changes. */
  onMuteChange: ((muted: boolean) => void) | null = null;

  async init(): Promise<void> {
    // ?muteAudio=true simulates the platform's mute setting (testing without the SDK).
    if (new URLSearchParams(location.search).get('muteAudio') === 'true') this.muted = true;
    const sdk = window.CrazyGames?.SDK;
    if (!sdk) return;
    try {
      await sdk.init();
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
    return !!this.sdk?.data;
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

  /** Shows an ad. onDone(true) only when a rewarded ad actually finished. */
  requestAd(type: AdType, hooks: { onStart?: () => void; onDone: (rewarded: boolean) => void }): void {
    if (!this.hasSdk) {
      hooks.onDone(false);
      return;
    }
    try {
      this.sdk!.ad.requestAd(type, {
        adStarted: () => hooks.onStart?.(),
        adFinished: () => hooks.onDone(true),
        adError: () => hooks.onDone(false),
      });
    } catch {
      hooks.onDone(false);
    }
  }

  getItem(key: string): string | null {
    try {
      if (this.sdk?.data) return this.sdk.data.getItem(key);
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
      if (this.sdk?.data) {
        this.sdk.data.setItem(key, value);
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
