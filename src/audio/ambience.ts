// Ambience (§8.5), routed under "Sound": surf breakers, speed wind, wave rumble. Continuous sources, outside the voice cap.

import { clamp01, type Engine } from './engine';

function panNode(ctx: BaseAudioContext, pan: number): AudioNode {
  const c = ctx as BaseAudioContext & { createStereoPanner?: () => StereoPannerNode };
  if (typeof c.createStereoPanner !== 'function') return ctx.createGain();
  const p = c.createStereoPanner();
  p.pan.value = pan;
  return p;
}

/** One surf instance: brown-noise body plus white-noise foam, with randomised breakers. */
export class Surf {
  private readonly src: AudioBufferSourceNode;
  private readonly foamSrc: AudioBufferSourceNode;
  private readonly lp: BiquadFilterNode;
  private readonly body: GainNode;
  private readonly foam: GainNode;
  private readonly out: AudioNode;
  private nextBreak = 0;

  constructor(private readonly e: Engine, pan: number, t = e.ctx.currentTime) {
    const ctx = e.ctx;
    this.out = panNode(ctx, pan);
    this.out.connect(e.ambBus);
    this.src = ctx.createBufferSource();
    this.src.buffer = e.noise.brown;
    this.src.loop = true;
    this.lp = ctx.createBiquadFilter();
    this.lp.type = 'lowpass';
    this.lp.frequency.value = 350;
    this.lp.Q.value = 0.5;
    const fixed = ctx.createGain();
    fixed.gain.value = 0.25;
    this.body = ctx.createGain();
    this.body.gain.value = 0.15;
    this.src.connect(this.lp).connect(fixed).connect(this.body).connect(this.out);

    this.foamSrc = ctx.createBufferSource();
    this.foamSrc.buffer = e.noise.white;
    this.foamSrc.loop = true;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 3000;
    this.foam = ctx.createGain();
    this.foam.gain.value = 0;
    this.foamSrc.connect(hp).connect(this.foam).connect(this.out);
    this.src.start(t, Math.random() * 5);
    this.foamSrc.start(t, Math.random() * 1.5);
    this.nextBreak = t + Math.random() * 3;
  }

  /** Called every 250 ms: schedules the next breaker when its time comes. */
  tick(level: number, t = this.e.ctx.currentTime): void {
    if (t < this.nextBreak) return;
    const period = 5 + Math.random() * 4;
    const rise = period * (0.35 + Math.random() * 0.1);
    const peak = (0.55 + Math.random() * 0.45) * level;
    const b = this.body.gain;
    const f = this.lp.frequency;
    const tb = t + rise;
    b.cancelScheduledValues(t);
    b.setValueAtTime(b.value, t);
    b.linearRampToValueAtTime(peak, tb);
    b.setTargetAtTime(0.18 * level, tb, (period - rise) / 3);
    f.cancelScheduledValues(t);
    f.setValueAtTime(f.value, t);
    f.linearRampToValueAtTime(700 + 700 * peak, tb);
    f.setTargetAtTime(350, tb, (period - rise) / 3);
    const fo = this.foam.gain;
    fo.cancelScheduledValues(t);
    fo.setValueAtTime(fo.value, t);
    fo.setValueAtTime(0, tb);
    fo.linearRampToValueAtTime(0.05 * peak, tb + 0.12);
    fo.setTargetAtTime(0, tb + 0.12, 0.6);
    this.nextBreak = t + period;
  }

  stop(t: number): void {
    this.body.gain.setTargetAtTime(0, t, 0.2);
    this.foam.gain.setTargetAtTime(0, t, 0.2);
    this.src.stop(t + 1.5);
    this.foamSrc.stop(t + 1.5);
    this.src.onended = () => this.out.disconnect();
  }
}

/** Speed wind: pink noise through a moving bandpass, with gusts and a whistle at high speed. */
export class Wind {
  private readonly bp: BiquadFilterNode;
  private readonly gust: GainNode;
  private readonly level: GainNode;
  private readonly wbp: BiquadFilterNode;
  private readonly wGain: GainNode;
  private nextGust = 0;

  constructor(private readonly e: Engine, t = e.ctx.currentTime) {
    const ctx = e.ctx;
    const src = ctx.createBufferSource();
    src.buffer = e.noise.pink;
    src.loop = true;
    this.bp = ctx.createBiquadFilter();
    this.bp.type = 'bandpass';
    this.bp.frequency.value = 280;
    this.bp.Q.value = 0.8;
    this.gust = ctx.createGain();
    this.level = ctx.createGain();
    this.level.gain.value = 0;
    src.connect(this.bp).connect(this.gust).connect(this.level).connect(e.ambBus);
    this.wbp = ctx.createBiquadFilter();
    this.wbp.type = 'bandpass';
    this.wbp.Q.value = 10;
    this.wbp.frequency.value = 900;
    this.wGain = ctx.createGain();
    this.wGain.gain.value = 0;
    src.connect(this.wbp).connect(this.wGain).connect(e.ambBus);
    src.start(t, Math.random() * 3);
  }

  /** 10 Hz update from the player's speed (m/s). Silent at running speed. */
  update(speed: number, t = this.e.ctx.currentTime): void {
    const x = clamp01((speed - 12) / 33);
    this.level.gain.setTargetAtTime(0.5 * Math.pow(x, 1.6), t, 0.15);
    this.bp.frequency.setTargetAtTime(280 + 900 * x, t, 0.15);
    this.bp.Q.setTargetAtTime(0.8 + 2.2 * x, t, 0.15);
    // Narrow bandpass loses energy; ×6 makes the whistle actually audible at the spec's .04.
    this.wGain.gain.setTargetAtTime(x > 0.6 ? 6 * 0.04 * ((x - 0.6) / 0.4) : 0, t, 0.15);
    this.wbp.frequency.setTargetAtTime(900 + 1400 * x, t, 0.15);
    if (t >= this.nextGust) {
      this.gust.gain.setTargetAtTime(0.75 + Math.random() * 0.45, t, 0.12);
      this.nextGust = t + 0.3 + Math.random() * 0.8;
    }
  }
}

/** The wave's low roar: noise → lowpass 380 Hz → gain min(.6, .6 × proximity). */
export class Rumble {
  private readonly gain: GainNode;

  constructor(private readonly e: Engine, t = e.ctx.currentTime) {
    const ctx = e.ctx;
    const src = ctx.createBufferSource();
    src.buffer = e.noise.brown;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 380;
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    src.connect(lp).connect(this.gain).connect(e.ambBus);
    src.start(t);
  }

  set(proximity: number, t = this.e.ctx.currentTime): void {
    this.gain.gain.setTargetAtTime(Math.min(0.6, 0.6 * Math.max(0, proximity)), t, 0.2);
  }
}

export class Ambience {
  private surfs: Surf[] = [];
  readonly wind: Wind;
  readonly rumble: Rumble;
  private surfAcc = 0;
  private windAcc = 0;
  private low = false;

  constructor(private readonly e: Engine) {
    this.wind = new Wind(e);
    this.rumble = new Rumble(e);
    this.setLowTier(false);
  }

  setLowTier(low: boolean): void {
    if (low === this.low && this.surfs.length) return;
    this.low = low;
    const t = this.e.ctx.currentTime;
    for (const s of this.surfs) s.stop(t);
    this.surfs = low ? [new Surf(this.e, 0, t)] : [new Surf(this.e, -0.5, t), new Surf(this.e, 0.5, t)];
  }

  /** dt in seconds; surf every 250 ms, wind at 10 Hz. */
  update(dt: number, surfLevel: number, speed: number): void {
    this.surfAcc += dt;
    this.windAcc += dt;
    if (this.surfAcc >= 0.25) {
      this.surfAcc = 0;
      for (const s of this.surfs) s.tick(surfLevel);
    }
    if (this.windAcc >= 0.1) {
      this.windAcc = 0;
      this.wind.update(speed);
    }
  }
}
