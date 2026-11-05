// SFX bank of §8.6: every SfxId, footsteps and rope sounds. Peaks follow the table (per-voice peak before the sfx bus).
// The v0.1 `Sfx` class lives in legacySfx.ts and is re-exported here until the lead switches Game.ts to AudioDirector.

import { db, mtof, type Engine, type NoiseKind } from './engine';
import * as I from './instruments';
import type { Surface } from '../contracts';

export { Sfx } from './legacySfx';

export type SfxId =
  | 'ui.click' | 'ui.hover' | 'ui.open' | 'ui.close' | 'ui.tab' | 'ui.denied' | 'toast' | 'jump' | 'doubleJump' | 'grab' | 'release'
  | 'perfect' | 'perfectWindow' | 'land' | 'pad' | 'bounce' | 'geyser' | 'collect' | 'coinTick' | 'deliver' | 'buy' | 'maxed' | 'claim' | 'splash' | 'sea'
  | 'horn' | 'tick' | 'zone' | 'chainStep' | 'chainEnd' | 'chainLost' | 'closeCall' | 'giftReady' | 'reveal' | 'rebirth'
  | 'tutorialStep' | 'tutorialDone' | 'slowIn' | 'slowOut';

export const SFX_IDS: readonly SfxId[] = [
  'ui.click', 'ui.hover', 'ui.open', 'ui.close', 'ui.tab', 'ui.denied', 'toast', 'jump', 'doubleJump', 'grab', 'release',
  'perfect', 'perfectWindow', 'land', 'pad', 'bounce', 'geyser', 'collect', 'coinTick', 'deliver', 'buy', 'maxed', 'claim', 'splash', 'sea',
  'horn', 'tick', 'zone', 'chainStep', 'chainEnd', 'chainLost', 'closeCall', 'giftReady', 'reveal', 'rebirth',
  'tutorialStep', 'tutorialDone', 'slowIn', 'slowOut',
];

export interface PlayOpts {
  rarity?: number;
  i?: number;
  n?: number;
  golden?: boolean;
  pan?: number;
  hard?: boolean;
}

/** Duck depths (§8.2 / §8.6). */
const DUCK5 = db(-5);
const DUCK8 = db(-8);
const DUCK4 = db(-4);

// Raw instrument peak per unit velocity, so the table's peaks can be asked for directly.
const PAN_PEAK = 0.37;
const MAR_PEAK = 1.0;
const GLOCK_PEAK = 1.3;
const WOOD_PEAK = 0.4;

interface ToneSpec {
  type: OscillatorType;
  f0: number;
  f1?: number;
  glide?: number;
  dur: number;
  peak: number;
  attack?: number;
  tau?: number;
  pan?: number;
  linear?: boolean;
}
interface NoiseSpec {
  kind?: NoiseKind;
  type: BiquadFilterType;
  f0: number;
  f1?: number;
  glide?: number;
  q?: number;
  dur: number;
  peak: number;
  attack?: number;
  tau?: number;
  pan?: number;
}

export class SfxBank {
  /** Cycle transpose for musical SFX (F, G, Eb). */
  transpose = 0;
  private lastHover = -1;

  constructor(private readonly e: Engine) {}

  private get out(): AudioNode {
    return this.e.sfxBus;
  }

  // ------------------------------------------------------------ primitives

  tone(t: number, s: ToneSpec, dest: AudioNode = this.out): void {
    const vo = this.e.begin(dest, t);
    const o = vo.osc(s.type, s.f0);
    if (s.f1 !== undefined && s.f1 !== s.f0) {
      const g = s.glide ?? s.dur;
      if (s.linear) o.frequency.linearRampToValueAtTime(s.f1, t + g);
      else o.frequency.exponentialRampToValueAtTime(s.f1, t + g);
    }
    const env = vo.gain(0);
    const atk = s.attack ?? 0.004;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(s.peak, t + atk);
    env.gain.setTargetAtTime(0, t + atk, s.tau ?? Math.max(0.004, (s.dur - atk) / 4));
    let node: AudioNode = o.connect(env);
    if (s.pan) node = node.connect(vo.panner(s.pan));
    node.connect(vo.out);
    vo.finish(t + atk + (s.tau ? 7 * s.tau : s.dur) + 0.02);
  }

  noise(t: number, s: NoiseSpec, dest: AudioNode = this.out): void {
    const vo = this.e.begin(dest, t);
    const n = vo.noise(s.kind ?? 'white');
    const f = vo.filter(s.type, s.f0, s.q ?? 0.7071);
    if (s.f1 !== undefined && s.f1 !== s.f0) f.frequency.exponentialRampToValueAtTime(s.f1, t + (s.glide ?? s.dur));
    const env = vo.gain(0);
    const atk = s.attack ?? 0.005;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(s.peak, t + atk);
    env.gain.setTargetAtTime(0, t + atk, s.tau ?? Math.max(0.004, (s.dur - atk) / 4));
    let node: AudioNode = n.connect(f).connect(env);
    if (s.pan) node = node.connect(vo.panner(s.pan));
    node.connect(vo.out);
    vo.finish(t + atk + (s.tau ? 7 * s.tau : s.dur) + 0.02);
  }

  /** Noise swelling up to `peak` over `dur` then cut fast (rolls, risers, release whooshes). */
  private swell(t: number, kind: NoiseKind, type: BiquadFilterType, f0: number, f1: number, q: number, dur: number, peak: number, pan = 0): void {
    const vo = this.e.begin(this.out, t);
    const n = vo.noise(kind);
    const f = vo.filter(type, f0, q);
    f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    const env = vo.gain(0);
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(peak, t + dur * 0.6);
    env.gain.setTargetAtTime(0, t + dur * 0.6, dur * 0.12);
    let node: AudioNode = n.connect(f).connect(env);
    if (pan) node = node.connect(vo.panner(pan));
    node.connect(vo.out);
    vo.finish(t + dur * 1.5);
  }

  private pan(t: number, midi: number, peak: number, len = 0): void {
    I.steelPan(this.e, this.out, t, mtof(midi + this.transpose), peak / PAN_PEAK, len);
  }
  private mar(t: number, midi: number, peak: number, dest: AudioNode = this.out, len = 0): void {
    I.marimba(this.e, dest, t, mtof(midi + this.transpose), peak / MAR_PEAK, len);
  }
  private glock(t: number, midi: number, peak: number): void {
    I.glock(this.e, this.out, t, mtof(midi + this.transpose), peak / GLOCK_PEAK);
  }
  private wood(t: number, peak: number, pitch = 1): void {
    I.woodblock(this.e, this.out, t, peak / WOOD_PEAK, false, pitch);
  }

  // ------------------------------------------------------------ the bank

  play(id: SfxId, o: PlayOpts = {}, t = this.e.ctx.currentTime): void {
    const e = this.e;
    const r = (a: number, b: number): number => a + Math.random() * (b - a);
    switch (id) {
      case 'ui.click':
        this.tone(t, { type: 'sine', f0: 1568, dur: 0.1, peak: 0.08, attack: 0.001, tau: 0.015 }, e.uiBus);
        this.noise(t, { type: 'highpass', f0: 6000, dur: 0.01, peak: 0.03, attack: 0.001 }, e.uiBus);
        break;
      case 'ui.hover':
        if (t - this.lastHover < 0.06) return;
        this.lastHover = t;
        this.tone(t, { type: 'sine', f0: 2400, dur: 0.008, peak: 0.03, attack: 0.001, tau: 0.003 }, e.uiBus);
        break;
      case 'ui.open':
        this.tone(t, { type: 'sine', f0: 392, f1: 784, glide: 0.09, dur: 0.14, peak: 0.12 });
        this.mar(t + 0.05, 84, 0.1);
        break;
      case 'ui.close':
        this.tone(t, { type: 'sine', f0: 784, f1: 392, glide: 0.07, dur: 0.1, peak: 0.12 });
        break;
      case 'ui.tab':
        this.mar(t, 81, 0.1);
        break;
      case 'ui.denied':
        this.mar(t, 58, 0.12);
        this.mar(t + 0.09, 57, 0.12);
        this.tone(t, { type: 'sine', f0: 110, dur: 0.2, peak: 0.08, tau: 0.04 });
        break;
      case 'toast':
        this.mar(t, 77, 0.08);
        break;
      case 'jump': {
        const p = r(0.97, 1.03);
        this.tone(t, { type: 'triangle', f0: 330 * p, f1: 660 * p, glide: 0.11, dur: 0.13, peak: 0.1 });
        this.noise(t, { type: 'bandpass', f0: 2000, q: 1, dur: 0.04, peak: 0.03 });
        break;
      }
      case 'doubleJump':
        this.tone(t, { type: 'triangle', f0: 440, f1: 988, glide: 0.12, dur: 0.14, peak: 0.1 });
        this.glock(t + 0.03, 96, 0.04);
        break;
      case 'grab':
        this.noise(t, { type: 'bandpass', f0: 3200, f1: 900, q: 2, dur: 0.14, peak: 0.22, attack: 0.003 });
        this.tone(t, { type: 'triangle', f0: 261.6, f1: 523.3, glide: 0.09, dur: 0.12, peak: 0.12 });
        if (o.hard) this.wood(t, 0.12, 0.9);
        break;
      case 'release':
        this.swell(t, 'white', 'bandpass', 600, 2600, 1.2, 0.35, 0.2, o.pan ?? 0);
        break;
      case 'perfect':
        e.duckMusic(DUCK4, t);
        this.swell(t, 'white', 'bandpass', 600, 2600, 1.2, 0.35, 0.12, o.pan ?? 0);
        [89, 93, 96].forEach((m, k) => this.glock(t + 0.04 * k, m, 0.07));
        break;
      case 'perfectWindow':
        I.woodblock(e, this.out, t, 0.05, true);
        break;
      case 'land': {
        const k = o.hard ? 1.4 : 1;
        this.tone(t, { type: 'sine', f0: 150 * r(0.95, 1.05), f1: 70, glide: 0.12, dur: 0.14, peak: 0.22 * k });
        this.noise(t, { type: 'lowpass', f0: 800, dur: 0.06, peak: 0.08 * k });
        if (o.hard) I.kick(e, this.out, t, 0.2);
        break;
      }
      case 'pad':
        this.tone(t, { type: 'triangle', f0: 200, f1: 800, glide: 0.25, dur: 0.28, peak: 0.1 });
        {
          const vo = e.begin(this.out, t);
          const s = vo.osc('sawtooth', 300);
          s.frequency.exponentialRampToValueAtTime(1400, t + 0.5);
          const lp = vo.filter('lowpass', 3000, 1);
          const g = vo.gain(0);
          g.gain.linearRampToValueAtTime(0.08, t + 0.02);
          g.gain.setTargetAtTime(0, t + 0.3, 0.06);
          s.connect(lp).connect(g).connect(vo.out);
          vo.finish(t + 0.6);
        }
        this.noise(t, { type: 'bandpass', f0: 900, f1: 3000, glide: 0.4, q: 1, dur: 0.4, peak: 0.1, attack: 0.03 });
        break;
      case 'bounce':
        this.tone(t, { type: 'triangle', f0: 180, f1: 520, glide: 0.16, dur: 0.18, peak: 0.14 });
        this.plop(t, 0.4);
        break;
      case 'geyser':
        e.duckMusic(DUCK4, t);
        this.noise(t, { kind: 'brown', type: 'lowpass', f0: 300, f1: 2400, glide: 0.4, dur: 0.5, peak: 0.2, attack: 0.08 });
        this.noise(t + 0.35, { type: 'highpass', f0: 2000, dur: 1.2, peak: 0.08, attack: 0.05, tau: 0.25 });
        break;
      case 'collect': {
        e.duckMusic(DUCK5, t);
        const rar = Math.max(0, Math.min(6, o.rarity ?? 0));
        const up = [77, 79, 81, 84, 86, 89, 91, 93];
        for (let k = 0; k < 2 + rar; k++) this.pan(t + k * 0.055, up[k], 0.14, k === 1 + rar ? 0 : 0.2);
        if (rar >= 4) [89, 93, 96].forEach((m) => this.glock(t + (2 + rar) * 0.055, m, 0.05));
        break;
      }
      case 'coinTick': {
        const notes = [84, 86, 89, 91, 93, 96, 98, 101];
        this.mar(t, notes[Math.min(o.i ?? 0, 7)], 0.07);
        break;
      }
      case 'deliver': {
        e.duckMusic(DUCK5, t);
        this.mar(t, 84, 0.17);
        this.mar(t + 0.06, 89, 0.17);
        I.openHat(e, this.out, t + 0.06, 0.04 / 0.06);
        const n = Math.max(0, Math.min(8, o.n ?? 3));
        for (let k = 0; k < n; k++) this.play('coinTick', { i: k }, t + 0.18 + k * 0.07);
        break;
      }
      case 'buy':
      case 'claim':
      case 'maxed': {
        e.duckMusic(DUCK5, t);
        [65, 69, 72, 77].forEach((m, k) => this.pan(t + k * 0.05, m, 0.14, 0.3));
        this.noise(t + 0.2, { type: 'highpass', f0: 5000, dur: 0.08, peak: 0.06, attack: 0.002 });
        this.glock(t + 0.2, 96, 0.05);
        if (id === 'maxed') {
          this.pan(t + 0.25, 89, 0.16);
          I.crash(e, this.out, t + 0.25, 0.5);
        }
        break;
      }
      case 'splash':
        e.duckMusic(DUCK8, t);
        this.noise(t, { type: 'lowpass', f0: 1800, f1: 180, glide: 0.9, dur: 0.9, peak: 0.5, attack: 0.01, tau: 0.25 });
        this.tone(t, { type: 'sine', f0: 200, f1: 60, glide: 0.4, dur: 0.45, peak: 0.2 });
        I.crash(e, this.out, t, 0.8);
        break;
      case 'sea':
        e.duckMusic(DUCK5, t);
        this.plop(t, 1);
        break;
      case 'horn':
        e.duckMusic(DUCK5, t);
        this.horn(t, !!o.golden);
        break;
      case 'tick':
        this.wood(t, 0.15);
        break;
      case 'zone': {
        e.duckMusic(DUCK5, t);
        [77, 81, 84, 89].forEach((m, k) => this.pan(t + k * 0.09, m, 0.13, k === 3 ? 0 : 0.25));
        this.swell(t, 'white', 'bandpass', 6000, 8000, 1.2, 0.45, 0.05);
        break;
      }
      case 'chainStep': {
        const notes = [77, 79, 81, 84, 86, 89, 91, 93];
        const m = notes[Math.max(0, Math.min(7, (o.n ?? 2) - 2))] + this.transpose;
        I.strum(e, this.out, t, [mtof(m)], 0.1, 'down', 0.25, 0);
        break;
      }
      case 'chainEnd':
        [84, 81, 77].forEach((m, k) => this.mar(t + k * 0.06, m, 0.1));
        break;
      case 'chainLost':
        this.tone(t, { type: 'sine', f0: 220, f1: 110, glide: 0.2, dur: 0.25, peak: 0.12, attack: 0.01 });
        this.tone(t, { type: 'triangle', f0: 220, f1: 110, glide: 0.2, dur: 0.25, peak: 0.04, attack: 0.01 });
        break;
      case 'closeCall':
        e.duckMusic(DUCK5, t);
        for (let k = 0; k < 3; k++) this.wood(t + k * 0.07, 0.12, k === 2 ? 1.12 : 1);
        this.whoosh(t + 0.05, 30, 0);
        this.glock(t + 0.21, 89, 0.06);
        this.glock(t + 0.29, 84, 0.06);
        break;
      case 'giftReady':
        this.glock(t, 89, 0.08);
        this.glock(t + 0.1, 93, 0.08);
        break;
      case 'reveal':
        e.duckMusic(DUCK8, t);
        this.reveal(t, o.rarity ?? 0);
        break;
      case 'rebirth':
        e.duckMusic(DUCK8, t);
        this.rebirth(t);
        break;
      case 'tutorialStep':
        this.glock(t, 96, 0.06);
        break;
      case 'tutorialDone':
        [84, 89, 93].forEach((m, k) => this.glock(t + k * 0.07, m, 0.1));
        break;
      case 'slowIn':
        this.noise(t, { type: 'bandpass', f0: 2600, f1: 600, q: 1.2, dur: 0.2, peak: 0.12, attack: 0.03 });
        break;
      case 'slowOut':
        this.noise(t, { type: 'bandpass', f0: 600, f1: 2600, q: 1.2, dur: 0.2, peak: 0.12, attack: 0.03 });
        break;
    }
  }

  /** "Plop": sine 900 → 180 Hz plus a lowpassed splash. */
  private plop(t: number, k: number): void {
    this.tone(t, { type: 'sine', f0: 900, f1: 180, glide: 0.12, dur: 0.14, peak: 0.2 * k, attack: 0.002 });
    this.noise(t, { type: 'lowpass', f0: 1400, f1: 300, glide: 0.5, dur: 0.5, peak: 0.3 * k, attack: 0.005, tau: 0.12 });
  }

  /** Conch horn: two blasts (hold .25 s, then .6 s, .9 s apart). Golden plays on F with a glockenspiel sparkle. */
  private horn(t: number, golden: boolean): void {
    const e = this.e;
    const f = golden ? mtof(65) : mtof(62);
    const blasts: [number, number][] = [
      [0, 0.25],
      [0.9, 0.6],
    ];
    for (const [off, hold] of blasts) {
      const t0 = t + off;
      const vo = e.begin(this.out, t0);
      const flat = Math.pow(2, -1 / 12);
      const saw = vo.osc('sawtooth', f * flat);
      const sin = vo.osc('sine', 2 * f * flat);
      saw.frequency.exponentialRampToValueAtTime(f, t0 + 0.15);
      sin.frequency.exponentialRampToValueAtTime(2 * f, t0 + 0.15);
      const lfo = vo.osc('sine', 5);
      const dev = vo.gain(f * (Math.pow(2, 6 / 1200) - 1));
      lfo.connect(dev);
      dev.connect(saw.frequency);
      dev.connect(sin.frequency);
      const sinG = vo.gain(0.5);
      const lp = vo.filter('lowpass', 1100, 2);
      const env = vo.gain(0);
      env.gain.setValueAtTime(0, t0);
      env.gain.linearRampToValueAtTime(0.2 * 0.7, t0 + 0.08);
      env.gain.setValueAtTime(0.2 * 0.7, t0 + 0.08 + hold);
      env.gain.setTargetAtTime(0, t0 + 0.08 + hold, 0.3 / 4);
      saw.connect(lp);
      sin.connect(sinG).connect(lp);
      lp.connect(env).connect(vo.out);
      vo.finish(t0 + 0.08 + hold + 0.35);
    }
    if (golden) [89, 93, 96, 101].forEach((m, k) => this.glock(t + 0.1 + k * 0.06, m - this.transpose, 0.05));
  }

  private reveal(t: number, rar: number): void {
    const e = this.e;
    // Snare-noise roll over 400 ms, crescendo .03 → .12.
    const hits = 9;
    for (let k = 0; k < hits; k++) {
      const v = 0.03 + (0.09 * k) / (hits - 1);
      this.noise(t + k * 0.045, { type: 'bandpass', f0: 1800, q: 0.8, dur: 0.05, peak: v, attack: 0.001, tau: 0.015 });
    }
    const tc = t + 0.42;
    I.crash(e, this.out, tc, 0.45);
    if (rar <= 2) {
      [65, 69, 72].forEach((m) => this.mar(tc, m + 12, 0.12));
    } else {
      [65, 69, 72, 77].forEach((m, k) => this.pan(tc + k * 0.012, m + 12, 0.14));
      [89, 93, 96].forEach((m, k) => this.glock(tc + 0.05 + k * 0.05, m, 0.06));
    }
    if (rar >= 5) this.tone(tc, { type: 'sine', f0: 80, f1: 40, glide: 0.4, dur: 0.45, peak: 0.22 });
  }

  private rebirth(t: number): void {
    const e = this.e;
    this.swell(t, 'white', 'bandpass', 400, 5000, 2, 1.2, 0.15);
    const tc = t + 1.2;
    I.crash(e, this.out, tc, 1.2);
    const tr = this.transpose;
    [65, 69, 72, 77].forEach((m) => this.pan(tc, m, 0.1));
    [60, 65, 69, 72].forEach((m) => this.mar(tc, m + 12, 0.06));
    I.strum(e, this.out, tc, [60, 65, 69, 72].map((m) => mtof(m + tr)), 0.12, 'down', 0.6, 0);
    I.bass(e, this.out, tc, mtof(41 + tr), 0.35, 0.8);
    [77, 81, 84, 89, 93, 96].forEach((m, k) => this.glock(tc + 0.08 + k * 0.06, m, 0.06));
  }

  // ------------------------------------------------------------ movement sounds (driven by AudioFrame)

  footstep(surface: Surface, t = this.e.ctx.currentTime): void {
    const cut = (surface === 'grass' ? 900 : surface === 'sand' ? 1400 : 2200) * (1 + (Math.random() * 2 - 1) * 0.08);
    const g = 0.05 * (0.8 + Math.random() * 0.2);
    this.noise(t, { type: 'lowpass', f0: cut, dur: 0.04, peak: g, attack: 0.002, tau: 0.012 });
    if (surface === 'wood') this.tone(t, { type: 'sine', f0: 180, dur: 0.06, peak: g * 0.3, attack: 0.001, tau: 0.015 });
  }

  ropeCreak(t = this.e.ctx.currentTime): void {
    const vo = this.e.begin(this.out, t);
    const n = vo.noise('white');
    const bp = vo.filter('bandpass', 600 * (0.9 + Math.random() * 0.2), 8);
    const env = vo.gain(0);
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(0.06 * 3, t + 0.02);
    env.gain.setValueAtTime(0.06 * 3, t + 0.06);
    env.gain.linearRampToValueAtTime(0, t + 0.12);
    n.connect(bp).connect(env).connect(vo.out);
    const s = vo.osc('sine', 300);
    s.frequency.linearRampToValueAtTime(270, t + 0.12);
    const sg = vo.gain(0);
    sg.gain.linearRampToValueAtTime(0.06 * 0.3, t + 0.02);
    sg.gain.linearRampToValueAtTime(0, t + 0.12);
    s.connect(sg).connect(vo.out);
    vo.finish(t + 0.13);
  }

  whoosh(speed: number, pan: number, t = this.e.ctx.currentTime): void {
    const g = 0.03 + 0.09 * Math.max(0, Math.min(1, (speed - 8) / 22));
    this.swell(t, 'white', 'bandpass', 500, 1800, 1.4, 0.22, g, pan);
  }

  /** Surge stinger: unquantised crash. */
  crash(t = this.e.ctx.currentTime): void {
    this.e.duckMusic(DUCK5, t);
    I.crash(this.e, this.out, t, 1.2);
    I.kick(this.e, this.out, t, 0.25);
  }
}
