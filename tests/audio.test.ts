// AudioDirector lifecycle against a fake AudioContext (node): unlock inside the gesture (iOS
// 'interrupted'), suspend/resume around ads and hidden tabs, no movement sounds while paused.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AudioFrame } from '../src/contracts';
import { AudioDirector } from '../src/audio/director';

function param(v = 0): Record<string, unknown> {
  const p: Record<string, unknown> = { value: v };
  for (const m of ['setValueAtTime', 'linearRampToValueAtTime', 'exponentialRampToValueAtTime', 'cancelScheduledValues', 'cancelAndHoldAtTime']) {
    p[m] = () => p;
  }
  p.setTargetAtTime = (x: number) => {
    p.value = x;
    return p;
  };
  return p;
}

const PARAMS = new Set(['gain', 'frequency', 'Q', 'pan', 'delayTime', 'threshold', 'knee', 'ratio', 'attack', 'release', 'detune', 'playbackRate']);

function node(): Record<string, unknown> {
  const t: Record<string, unknown> = {};
  return new Proxy(t, {
    get(o, k: string) {
      if (k in o) return o[k];
      if (PARAMS.has(k)) return (o[k] = param(1));
      if (k === 'connect') return (d: unknown) => d;
      if (k === 'disconnect' || k === 'start' || k === 'stop') return () => {};
      return undefined;
    },
    set(o, k: string, v) {
      o[k] = v;
      return true;
    },
  });
}

let created: FakeCtx[] = [];
let failNext = false;

class FakeCtx extends EventTarget {
  state: string = 'suspended';
  currentTime = 0;
  sampleRate = 8000;
  readonly destination = node();
  readonly calls: string[] = [];
  constructor() {
    super();
    created.push(this);
  }
  createBuffer(_c: number, len: number, sr: number) {
    return { duration: len / sr, getChannelData: () => new Float32Array(len) };
  }
  createGain() {
    return node();
  }
  createBiquadFilter() {
    return node();
  }
  createBufferSource() {
    return node();
  }
  createOscillator() {
    return node();
  }
  createWaveShaper() {
    return node();
  }
  createStereoPanner() {
    return node();
  }
  createDelay() {
    return node();
  }
  createDynamicsCompressor() {
    if (failNext) {
      failNext = false;
      throw new Error('no audio device');
    }
    return node();
  }
  /** State changes land a task later, like a real context. */
  suspend(): Promise<void> {
    this.calls.push('suspend');
    return new Promise((r) => setTimeout(() => this.set('suspended', r), 0));
  }
  resume(): Promise<void> {
    this.calls.push('resume');
    return new Promise((r) => setTimeout(() => this.set('running', r), 0));
  }
  close(): Promise<void> {
    this.calls.push('close');
    this.state = 'closed';
    return Promise.resolve();
  }
  private set(s: string, r: () => void): void {
    if (this.state !== s) {
      this.state = s;
      this.dispatchEvent(new Event('statechange'));
    }
    r();
  }
}

const g = globalThis as unknown as Record<string, unknown>;
const tick = () => new Promise((r) => setTimeout(r, 5));

function frame(over: Partial<AudioFrame> = {}): AudioFrame {
  return {
    dt: 0.1, onHome: true, carried: 0, carriedMaxRarity: -1, wavePhase: 'calm', waveTimer: 60, golden: false, big: false,
    speed: 10, altitude: 0, nearIsland: true, bestZone: 0, grounded: true, surface: 'grass', swing: null, perfectWindow: false,
    panelOpen: false, slowmo: false, ftueStep: null, lowTier: false, ...over,
  };
}

type Internals = { ctx: FakeCtx | null; music: { stop(): void } | null; sfx: { footstep: (...a: unknown[]) => void } | null; amb: { wind: { update: (s: number) => void } } | null };
const inside = (d: AudioDirector) => d as unknown as Internals;

let directors: AudioDirector[] = [];
function director(): AudioDirector {
  const d = new AudioDirector();
  directors.push(d);
  return d;
}

beforeEach(() => {
  created = [];
  failNext = false;
  g.window = { AudioContext: FakeCtx };
});
afterEach(() => {
  for (const d of directors) inside(d).music?.stop();
  directors = [];
  delete g.window;
});

describe('AudioDirector', () => {
  it('unlock calls resume() inside the gesture, and cycles an iOS interrupted context first', async () => {
    const d = director();
    d.unlock();
    const ctx = created[0];
    expect(ctx.calls).toEqual(['resume']);
    await tick();
    expect(ctx.state).toBe('running');
    expect(d.needsGesture).toBe(false);

    ctx.state = 'interrupted'; // iOS after a phone call / app switch
    expect(d.needsGesture).toBe(true);
    ctx.calls.length = 0;
    d.unlock();
    // Both calls are made synchronously, i.e. still inside the user gesture.
    expect(ctx.calls).toEqual(['suspend', 'resume']);
    await tick();
    expect(ctx.state).toBe('running');
  });

  it('a failed context build is closed and retried on the next gesture (never two contexts)', async () => {
    failNext = true;
    const d = director();
    d.unlock();
    expect(created).toHaveLength(1);
    expect(created[0].calls).toContain('close');
    expect(d.unlocked).toBe(false);
    d.unlock();
    expect(created).toHaveLength(2);
    expect(d.unlocked).toBe(true);
    d.unlock();
    expect(created).toHaveLength(2);
  });

  it('a tab hidden and shown again before the suspend lands still resumes', async () => {
    const d = director();
    d.unlock();
    await tick();
    const ctx = created[0];
    ctx.calls.length = 0;
    d.setHidden(true);
    d.setHidden(false); // still reads 'running': the suspend is in flight
    await tick();
    expect(ctx.calls).toEqual(['suspend', 'resume']);
    expect(ctx.state).toBe('running');
  });

  it('ads: silent while playing, resumed afterwards; an ad that fails before 120 ms never suspends', async () => {
    vi.useFakeTimers();
    try {
      const d = director();
      d.unlock();
      await vi.advanceTimersByTimeAsync(1);
      const ctx = created[0];
      ctx.calls.length = 0;
      d.setAdPlaying(true);
      d.setAdPlaying(false);
      await vi.advanceTimersByTimeAsync(500);
      expect(ctx.calls).toEqual([]);
      expect(ctx.state).toBe('running');

      d.setAdPlaying(true);
      await vi.advanceTimersByTimeAsync(200);
      expect(ctx.state).toBe('suspended');
      expect(d.needsGesture).toBe(false); // an ad is not a reason to ask for a tap
      d.setAdPlaying(false);
      await vi.advanceTimersByTimeAsync(5);
      expect(ctx.state).toBe('running');
    } finally {
      vi.useRealTimers();
    }
  });

  it('no footsteps or speed wind while the sim is paused (panel / resume card)', async () => {
    const d = director();
    d.unlock();
    await tick();
    const steps = vi.fn();
    const wind: number[] = [];
    const sfx = inside(d).sfx!;
    const orig = sfx.footstep.bind(sfx);
    sfx.footstep = (...a: unknown[]) => {
      steps();
      orig(...a);
    };
    const w = inside(d).amb!.wind;
    const origW = w.update.bind(w);
    w.update = (s: number) => {
      wind.push(s);
      origW(s);
    };
    for (let i = 0; i < 20; i++) d.update(frame({ speed: 20 }));
    expect(steps).toHaveBeenCalled();
    steps.mockClear();
    wind.length = 0;
    for (let i = 0; i < 20; i++) d.update(frame({ speed: 20, panelOpen: true }));
    expect(steps).not.toHaveBeenCalled();
    expect(wind.length).toBeGreaterThan(0);
    expect(wind.every((s) => s === 0)).toBe(true);
  });
});
