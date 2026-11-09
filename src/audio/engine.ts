// Audio engine: context, unlock, buses, limiter, ducking, shared noise, voice pool and the four mute flags.
// Everything is synthesized; there are no audio files (§8.1).
//
//   voices → layers → layerSum → musicLP → musicMod → musicBus → duck ─┐
//   sfx voices → sfxBus (ui voices → uiBus → sfxBus) ──────────────────┤
//   surf / wind / rumble → ambBus ─────────────────────────────────────┴→ master → limiter → ceiling → out

export type NoiseKind = 'white' | 'brown' | 'pink';

/** Design gains of §8.2. */
export const MIX = {
  master: 0.8,
  music: 0.25,
  musicSurge: 0.3,
  sfx: 0.9,
  ui: 0.5,
  amb: 0.18,
} as const;

export const db = (d: number): number => Math.pow(10, d / 20);
export const mtof = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);
export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

/** `cancelAndHoldAtTime` where available (not in Firefox), else cancel and pin the current value. */
export function holdParam(p: AudioParam, t: number): void {
  const anyP = p as AudioParam & { cancelAndHoldAtTime?: (t: number) => AudioParam };
  if (typeof anyP.cancelAndHoldAtTime === 'function') {
    anyP.cancelAndHoldAtTime(t);
  } else {
    const v = p.value;
    p.cancelScheduledValues(t);
    p.setValueAtTime(v, t);
  }
}

/** Glide a param smoothly to a target (never assigns `.value` while playing). */
export function glide(p: AudioParam, target: number, t: number, tau: number): void {
  p.setTargetAtTime(target, t, Math.max(0.001, tau));
}

/**
 * One sounding note or SFX layer with its own nodes. All sources start at `start` (unless given another time)
 * and stop at the time passed to `finish()`. Nodes are disconnected in `onended`.
 */
export class Voice {
  readonly out: GainNode;
  readonly srcs: AudioScheduledSourceNode[] = [];
  readonly nodes: AudioNode[] = [];
  end = Infinity;
  stolen = false;

  constructor(
    readonly eng: Engine,
    dest: AudioNode,
    readonly start: number,
    readonly bass: boolean,
  ) {
    this.out = eng.ctx.createGain();
    this.out.connect(dest);
    this.nodes.push(this.out);
  }

  get ctx(): BaseAudioContext {
    return this.eng.ctx;
  }

  gain(value = 0): GainNode {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(value, this.start);
    this.nodes.push(g);
    return g;
  }

  filter(type: BiquadFilterType, freq: number, q = 0.7071): BiquadFilterNode {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, this.start);
    f.Q.setValueAtTime(q, this.start);
    this.nodes.push(f);
    return f;
  }

  panner(pan: number): StereoPannerNode | GainNode {
    const c = this.ctx as BaseAudioContext & { createStereoPanner?: () => StereoPannerNode };
    if (typeof c.createStereoPanner !== 'function') return this.gain(1);
    const p = c.createStereoPanner();
    p.pan.setValueAtTime(Math.max(-1, Math.min(1, pan)), this.start);
    this.nodes.push(p);
    return p;
  }

  shaper(): WaveShaperNode {
    const s = this.ctx.createWaveShaper();
    s.curve = this.eng.tanhCurve as Float32Array<ArrayBuffer>;
    this.nodes.push(s);
    return s;
  }

  osc(type: OscillatorType, freq: number, at = this.start): OscillatorNode {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, at);
    o.start(at);
    this.srcs.push(o);
    this.nodes.push(o);
    return o;
  }

  noise(kind: NoiseKind = 'white', at = this.start): AudioBufferSourceNode {
    const s = this.ctx.createBufferSource();
    const buf = this.eng.noise[kind];
    s.buffer = buf;
    s.loop = true;
    s.start(at, Math.random() * (buf.duration - 0.5));
    this.srcs.push(s);
    this.nodes.push(s);
    return s;
  }

  /** Stop every source at `stopAt` and register the voice's end (used by the cap). */
  finish(stopAt: number): this {
    if (this.stolen) return this;
    this.end = stopAt;
    for (const s of this.srcs) s.stop(stopAt);
    const last = this.srcs[this.srcs.length - 1];
    if (last) {
      last.onended = () => {
        for (const n of this.nodes) {
          try {
            n.disconnect();
          } catch {
            /* already disconnected */
          }
        }
      };
    }
    return this;
  }

  /** Release over 15 ms (voice stealing). */
  kill(t: number): void {
    if (this.stolen) return;
    const at = Math.max(t, this.start);
    this.stolen = true;
    holdParam(this.out.gain, at);
    this.out.gain.setTargetAtTime(0, at, 0.005);
    const stopAt = at + 0.04;
    if (stopAt < this.end) {
      this.end = stopAt;
      for (const s of this.srcs) {
        try {
          s.stop(stopAt); // a second stop(): older WebKit throws InvalidStateError
        } catch {
          /* keeps its first stop time; the gain fade above already silences it */
        }
      }
    }
  }
}

/** Shared buffers and the bus graph. Works on a live AudioContext or an OfflineAudioContext. */
export class Engine {
  readonly noise: Record<NoiseKind, AudioBuffer>;
  readonly tanhCurve: Float32Array;

  readonly master: GainNode;
  readonly limiter: DynamicsCompressorNode;
  readonly ceiling: GainNode;
  readonly musicBus: GainNode;
  readonly duck: GainNode;
  readonly musicMod: GainNode;
  readonly musicLP: BiquadFilterNode;
  readonly layerSum: GainNode;
  readonly sfxBus: GainNode;
  readonly uiBus: GainNode;
  readonly ambBus: GainNode;
  /** Dub echo (the only reverb): delay .40 s, feedback .3, lowpass 2.5 kHz in the loop. Send into it. */
  readonly echoIn: GainNode;

  cap = 24;
  private voices: Voice[] = [];
  /** Max concurrent voices seen (for tests / the sandbox meter). */
  peakVoices = 0;

  constructor(readonly ctx: BaseAudioContext, dest: AudioNode = ctx.destination) {
    this.noise = makeNoise(ctx);
    this.tanhCurve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1023) * 2 - 1;
      this.tanhCurve[i] = Math.tanh(2 * x);
    }

    const g = (v: number): GainNode => {
      const n = ctx.createGain();
      n.gain.value = v;
      return n;
    };
    this.master = g(MIX.master);
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -6;
    this.limiter.knee.value = 6;
    this.limiter.ratio.value = 12;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.2;
    this.ceiling = g(0.89);
    this.master.connect(this.limiter).connect(this.ceiling).connect(dest);

    this.layerSum = g(1);
    this.musicLP = ctx.createBiquadFilter();
    this.musicLP.type = 'lowpass';
    this.musicLP.frequency.value = 16000;
    this.musicLP.Q.value = 0.5;
    this.musicMod = g(1);
    this.musicBus = g(MIX.music * vol(50));
    this.duck = g(1);
    this.layerSum.connect(this.musicLP).connect(this.musicMod).connect(this.musicBus).connect(this.duck).connect(this.master);

    this.sfxBus = g(MIX.sfx * vol(80));
    this.uiBus = g(MIX.ui);
    this.uiBus.connect(this.sfxBus);
    this.sfxBus.connect(this.master);
    this.ambBus = g(MIX.amb * vol(80));
    this.ambBus.connect(this.master);

    // Dub echo feeding back into the music chain.
    this.echoIn = g(1);
    const delay = ctx.createDelay(1);
    delay.delayTime.value = 0.4;
    const fb = g(0.3);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2500;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 250;
    this.echoIn.connect(delay);
    delay.connect(lp).connect(hp).connect(fb).connect(delay);
    hp.connect(this.layerSum);
  }

  get now(): number {
    return this.ctx.currentTime;
  }

  /** Allocate a voice that starts at t, enforcing the voice cap (oldest non-bass voice is released over 15 ms). */
  begin(dest: AudioNode, t: number, bass = false): Voice {
    const now = this.ctx.currentTime;
    if (this.voices.length > 64) this.voices = this.voices.filter((v) => v.end > now - 0.05);
    // Conservative overlap: voices sounding at t, or already scheduled to start within the lookahead window.
    let live = 0;
    let oldest: Voice | null = null;
    for (const v of this.voices) {
      if (v.stolen || v.end <= t || v.start > t + 0.2) continue;
      live++;
      if (!v.bass && (!oldest || v.start < oldest.start)) oldest = v;
    }
    while (live >= this.cap && oldest) {
      oldest.kill(t);
      live--;
      oldest = null;
      for (const v of this.voices) {
        if (v.stolen || v.end <= t || v.start > t + 0.2 || v.bass) continue;
        if (!oldest || v.start < oldest.start) oldest = v;
      }
    }
    const v = new Voice(this, dest, t, bass);
    this.voices.push(v);
    if (live + 1 > this.peakVoices) this.peakVoices = live + 1;
    return v;
  }

  /** Voices sounding right now. */
  activeVoices(t = this.ctx.currentTime): number {
    let n = 0;
    for (const v of this.voices) if (!v.stolen && v.start <= t && v.end > t) n++;
    return n;
  }

  /**
   * Duck the music: attack τ 30 ms to `depth`, hold 250 ms, release τ 350 ms.
   * Always cancels what was scheduled first.
   */
  duckMusic(depth: number, t = this.ctx.currentTime): void {
    const p = this.duck.gain;
    holdParam(p, t);
    p.setTargetAtTime(depth, t, 0.03);
    p.setTargetAtTime(1, t + 0.09 + 0.25, 0.35);
  }
}

/** User slider (0..100) to a bus multiplier: (v/80)², so 80 is the design level. */
export function vol(v: number): number {
  const x = Math.max(0, Math.min(100, v)) / 80;
  return x * x;
}

function makeNoise(ctx: BaseAudioContext): Record<NoiseKind, AudioBuffer> {
  const sr = ctx.sampleRate;
  const white = ctx.createBuffer(1, Math.floor(sr * 2), sr);
  const w = white.getChannelData(0);
  for (let i = 0; i < w.length; i++) w[i] = Math.random() * 2 - 1;

  // Brown: leaky integrator, then remove the drift (linear trend) so the loop point is seamless, then normalise.
  const brown = ctx.createBuffer(1, Math.floor(sr * 6), sr);
  const b = brown.getChannelData(0);
  let last = 0;
  for (let i = 0; i < b.length; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) * 0.998;
    b[i] = last;
  }
  const drift = (b[b.length - 1] - b[0]) / (b.length - 1);
  let mean = 0;
  for (let i = 0; i < b.length; i++) {
    b[i] -= b[0] + drift * i;
    mean += b[i];
  }
  mean /= b.length;
  let peak = 1e-6;
  for (let i = 0; i < b.length; i++) {
    b[i] -= mean;
    peak = Math.max(peak, Math.abs(b[i]));
  }
  for (let i = 0; i < b.length; i++) b[i] /= peak;

  // Pink: Paul Kellet's refined method.
  const pink = ctx.createBuffer(1, Math.floor(sr * 4), sr);
  const p = pink.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  let pk = 1e-6;
  for (let i = 0; i < p.length; i++) {
    const x = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + x * 0.0555179;
    b1 = 0.99332 * b1 + x * 0.0750759;
    b2 = 0.969 * b2 + x * 0.153852;
    b3 = 0.8665 * b3 + x * 0.3104856;
    b4 = 0.55 * b4 + x * 0.5329522;
    b5 = -0.7616 * b5 - x * 0.016898;
    p[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + x * 0.5362;
    b6 = x * 0.115926;
    pk = Math.max(pk, Math.abs(p[i]));
  }
  for (let i = 0; i < p.length; i++) p[i] /= pk;
  return { white, brown, pink };
}
