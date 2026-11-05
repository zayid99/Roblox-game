// Every sound is synthesized with WebAudio, so there are no audio files to download.

type Wave = OscillatorType;

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private rumble: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  muted = false;

  /** Must be called from a user gesture (browsers block audio before that). */
  unlock(): void {
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.55;
        this.master.connect(this.ctx.destination);
        const len = this.ctx.sampleRate;
        this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const data = this.noiseBuffer.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : 0.55, this.ctx.currentTime, 0.02);
  }

  /** Pause/resume all audio (e.g. while an ad plays). */
  suspend(on: boolean): void {
    if (!this.ctx) return;
    if (on) void this.ctx.suspend();
    else void this.ctx.resume();
  }

  private tone(freq: number, dur: number, type: Wave = 'sine', vol = 0.25, slideTo?: number, delay = 0): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol: number, freq: number, type: BiquadFilterType = 'lowpass', slideTo?: number, delay = 0): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noiseBuffer) return;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, t);
    if (slideTo) filter.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.05);
  }

  jump(): void {
    this.tone(420, 0.14, 'square', 0.08, 760);
  }
  doubleJump(): void {
    this.tone(620, 0.14, 'square', 0.08, 1150);
  }
  grab(): void {
    this.noise(0.14, 0.25, 3200, 'bandpass', 900);
    this.tone(260, 0.1, 'triangle', 0.15, 520);
  }
  release(): void {
    this.noise(0.35, 0.22, 600, 'bandpass', 2600);
  }
  land(): void {
    this.tone(150, 0.12, 'sine', 0.22, 70);
  }
  pad(): void {
    this.tone(300, 0.5, 'sawtooth', 0.08, 1400);
    this.noise(0.4, 0.15, 900, 'bandpass', 3000);
  }
  collect(rarity: number): void {
    const notes = [659, 784, 988, 1175, 1319, 1568, 1976];
    for (let i = 0; i < 2 + Math.min(rarity, 5); i++) this.tone(notes[i], 0.16, 'triangle', 0.14, undefined, i * 0.06);
  }
  deliver(): void {
    this.tone(988, 0.09, 'square', 0.09);
    this.tone(1319, 0.28, 'square', 0.09, undefined, 0.08);
  }
  buy(): void {
    [523, 659, 784, 1047].forEach((f, i) => this.tone(f, 0.14, 'triangle', 0.14, undefined, i * 0.05));
  }
  denied(): void {
    this.tone(220, 0.18, 'square', 0.07, 160);
  }
  splash(): void {
    this.noise(0.9, 0.5, 1800, 'lowpass', 180);
    this.tone(200, 0.4, 'sine', 0.2, 60);
  }
  sea(): void {
    this.noise(0.5, 0.35, 1400, 'lowpass', 300);
  }
  warning(): void {
    for (let i = 0; i < 3; i++) {
      this.tone(620, 0.28, 'sawtooth', 0.07, 880, i * 0.6);
      this.tone(880, 0.28, 'sawtooth', 0.07, 620, i * 0.6 + 0.3);
    }
  }
  zone(): void {
    [523, 784, 1047, 1568].forEach((f, i) => this.tone(f, 0.22, 'triangle', 0.13, undefined, i * 0.09));
  }
  ui(): void {
    this.tone(880, 0.05, 'triangle', 0.06);
  }

  /** Low roar while the wave is surging; loudness follows how close it is (0..1). */
  setRumble(level: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noiseBuffer) return;
    if (level <= 0.001) {
      if (this.rumble) {
        this.rumble.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
        const r = this.rumble;
        this.rumble = null;
        setTimeout(() => r.src.stop(), 800);
      }
      return;
    }
    if (!this.rumble) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuffer;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 380;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(filter).connect(gain).connect(this.master);
      src.start();
      this.rumble = { src, gain };
    }
    this.rumble.gain.gain.setTargetAtTime(Math.min(0.6, level * 0.6), ctx.currentTime, 0.1);
  }
}
