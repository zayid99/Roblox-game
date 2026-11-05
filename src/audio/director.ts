// AudioDirector: the audio module's facade (§10.4). The lead calls only this.

import type { AudioFrame, SimEvent } from '../contracts';
import { getSpecies, hasSpecies } from '../game/creatures';
import { Ambience } from './ambience';
import { Engine, MIX, clamp01, holdParam, vol } from './engine';
import { Music } from './music';
import { SfxBank, type PlayOpts, type SfxId } from './sfx';
import { creatureVoice, type VoiceKind } from './voices';

export type { SfxId } from './sfx';

type Ctor = typeof AudioContext;

export class AudioDirector {
  private ctx: AudioContext | null = null;
  private eng: Engine | null = null;
  private music: Music | null = null;
  private sfx: SfxBank | null = null;
  private amb: Ambience | null = null;

  private userMuted = false;
  private platformMuted = false;
  private adPlaying = false;
  private hidden = false;
  private musicVol = 50;
  private soundVol = 80;
  private suspendTimer: ReturnType<typeof setTimeout> | null = null;

  // Logical state tracked even before unlock, so music starts in the right section.
  private phase: AudioFrame['wavePhase'] = 'calm';
  private golden = false;
  private warnDur = 0;
  private surgeT = -1;
  private cycle = 0;

  // Movement sound state.
  private footPhase = 0;
  private lastTheta: number | null = null;
  private creakArmed = true;
  private lastPerfectWindow = false;
  private lowTier = false;

  // Per-frame dedupe of aliased events (player:land vs landed, …) and the release/perfect choice.
  private playedThisFrame = new Set<SfxId>();
  private pendingRelease = false;
  private perfectThisFrame = false;
  private flushQueued = false;

  get unlocked(): boolean {
    return !!this.ctx;
  }

  /** True when the context needs a gesture to run again (iOS 'interrupted', or a resume the browser refused). */
  get needsGesture(): boolean {
    const c = this.ctx;
    if (!c || this.adPlaying || this.hidden) return false;
    return (c.state as string) !== 'running';
  }

  /** Call inside a user gesture: first gesture, and the resume overlay's tap. */
  unlock(): void {
    try {
      if (!this.ctx) {
        const C: Ctor | undefined =
          window.AudioContext ?? (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext;
        if (!C) return;
        const ctx = new C({ latencyHint: 'interactive' });
        this.ctx = ctx;
        const eng = new Engine(ctx);
        this.eng = eng;
        this.music = new Music(eng);
        this.sfx = new SfxBank(eng);
        this.amb = new Ambience(eng);
        eng.master.gain.value = 0;
        this.applyVolumes();
        this.applyTier();
        ctx.addEventListener('statechange', () => this.apply());
      }
      const ctx = this.ctx;
      const eng = this.eng!;
      // iOS: a silent buffer inside the gesture unlocks output; 'interrupted' needs suspend → resume.
      const b = ctx.createBufferSource();
      b.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
      b.connect(ctx.destination);
      b.start(0);
      if (this.adPlaying || this.hidden) return;
      const st = ctx.state as string;
      const fadeIn = (): void => {
        const t = ctx.currentTime;
        holdParam(eng.master.gain, t);
        eng.master.gain.setValueAtTime(0, t);
        this.apply(0.1); // ≈300 ms fade-in
        this.startMusic();
      };
      if (st === 'interrupted') {
        void ctx.suspend().then(() => ctx.resume()).then(fadeIn, () => undefined);
      } else if (st !== 'running') {
        void ctx.resume().then(fadeIn, () => undefined);
      } else {
        this.apply(0.1);
        this.startMusic();
      }
    } catch {
      this.ctx = null;
      this.eng = null;
    }
  }

  private startMusic(): void {
    const m = this.music;
    if (!m || m.isRunning) return;
    m.golden = this.golden;
    m.section = this.phase === 'warning' ? 'hurry' : this.phase === 'surge' ? 'surge' : 'song';
    m.start(1.5);
  }

  play(id: SfxId, opts?: PlayOpts): void {
    if (!this.sfx || !this.ctx || this.ctx.state !== 'running') return;
    this.sfx.play(id, opts);
    this.playedThisFrame.add(id);
    this.queueFlush();
  }

  voice(speciesId: string, kind: VoiceKind): void {
    if (!this.eng || !this.ctx || this.ctx.state !== 'running') return;
    creatureVoice(this.eng, this.eng.sfxBus, speciesId, kind);
  }

  private voiceLater(speciesId: string, kind: VoiceKind, delay: number): void {
    if (!this.eng || !this.ctx || this.ctx.state !== 'running') return;
    creatureVoice(this.eng, this.eng.sfxBus, speciesId, kind, this.ctx.currentTime + delay);
  }

  private once(id: SfxId, opts?: PlayOpts): void {
    if (this.playedThisFrame.has(id)) return;
    this.play(id, opts);
  }

  private queueFlush(): void {
    if (this.flushQueued) return;
    this.flushQueued = true;
    queueMicrotask(() => this.flush());
  }

  /** End of the current task: resolve release vs perfect, clear the per-frame dedupe. */
  private flush(): void {
    this.flushQueued = false;
    if (this.pendingRelease && !this.perfectThisFrame && !this.playedThisFrame.has('release')) {
      this.sfx?.play('release', { pan: this.releasePan });
    }
    this.pendingRelease = false;
    this.perfectThisFrame = false;
    this.playedThisFrame.clear();
  }
  private releasePan = 0;
  private velX = 0;

  /** Maps sim events to SFX and music states (§5.3, §8.4). */
  onSimEvent(e: SimEvent): void {
    switch (e.type) {
      case 'player':
        switch (e.event) {
          case 'jump':
            this.play('jump');
            break;
          case 'doubleJump':
            this.play('doubleJump');
            break;
          case 'grab':
            this.play('grab');
            break;
          case 'release':
            this.pendingRelease = true;
            this.releasePan = Math.max(-1, Math.min(1, this.velX / 20));
            this.queueFlush();
            break;
          case 'land':
            this.once('land');
            break;
          case 'pad':
            this.once('pad');
            break;
          case 'sea':
            this.once('sea');
            break;
        }
        break;
      case 'releaseRated':
        if (e.quality === 'perfect') {
          this.perfectThisFrame = true;
          this.once('perfect', { pan: this.releasePan });
        }
        break;
      case 'landed':
        this.once('land');
        break;
      case 'padLaunch':
        this.once('pad');
        break;
      case 'bounce':
        this.play('bounce');
        break;
      case 'geyser':
        this.play('geyser');
        break;
      case 'collect': {
        const r = rarityOf(e.creature.speciesId);
        this.play('collect', { rarity: r });
        this.voiceLater(e.creature.speciesId, 'pickup', 0.12);
        break;
      }
      case 'carryFull':
        this.once('ui.denied');
        break;
      case 'deliver': {
        const all = [...e.result.placed, ...e.result.sold.map((s) => s.creature)];
        this.play('deliver', { n: Math.min(8, all.length) });
        if (all.length) {
          let best = all[0];
          for (const c of all) if (rarityOf(c.speciesId) > rarityOf(best.speciesId)) best = c;
          this.voiceLater(best.speciesId, 'deliver', 0.18 + Math.min(8, all.length) * 0.07);
        }
        break;
      }
      case 'chain':
        if (e.count >= 2) this.play('chainStep', { n: e.count });
        break;
      case 'chainEnd':
        this.play(e.reason === 'sea' || e.reason === 'splash' ? 'chainLost' : 'chainEnd');
        break;
      case 'closeCall':
        this.play('closeCall');
        break;
      case 'splash':
        this.play('splash');
        break;
      case 'respawn':
        if (e.reason === 'sea') this.once('sea');
        break;
      case 'zone':
        if (e.first) this.play('zone');
        break;
      case 'waveWarning':
        this.phase = 'warning';
        this.golden = e.golden;
        this.warnDur = 0;
        this.play('horn', { golden: e.golden });
        if (this.music) {
          this.music.golden = e.golden;
          this.music.warnProgress = 0;
          this.music.onWarning();
        }
        break;
      case 'surgeStart':
        this.phase = 'surge';
        this.golden = e.golden;
        this.surgeT = 0;
        if (this.sfx && this.ctx?.state === 'running') this.sfx.crash();
        if (this.music) {
          this.music.golden = e.golden;
          this.music.onSurgeStart();
        }
        break;
      case 'surgeEnd':
        this.phase = 'calm';
        this.surgeT = -1;
        this.cycle++;
        if (this.music) {
          this.music.onSurgeEnd();
          if (this.sfx) this.sfx.transpose = this.music.transpose;
        }
        this.amb?.rumble.set(0);
        break;
      case 'washed':
      case 'spawned':
      case 'shopZone':
        break;
    }
  }

  /** Per frame: intensity, filters, wind, surf, rumble, footsteps and rope sounds. */
  update(f: AudioFrame): void {
    this.phase = f.wavePhase;
    this.golden = f.golden;
    if (f.lowTier !== this.lowTier) {
      this.lowTier = f.lowTier;
      this.applyTier();
    }
    // Warning progress (robust to sim stalls: it follows the wave timer, not wall time).
    if (f.wavePhase === 'warning') {
      if (f.waveTimer > this.warnDur) this.warnDur = f.waveTimer;
      const p = this.warnDur > 0 ? 1 - f.waveTimer / this.warnDur : 0;
      this.music?.setWarnProgress(p);
    }
    if (f.wavePhase === 'surge' && this.surgeT >= 0) this.surgeT += f.dt;

    const eng = this.eng;
    const ctx = this.ctx;
    if (!eng || !ctx || ctx.state !== 'running') return;
    const t = ctx.currentTime;
    const m = this.music!;

    // Intensity (§8.4).
    let I = f.onHome ? 0.25 : 0.45;
    I += Math.min(0.2, f.carried * 0.07);
    if (f.carriedMaxRarity >= 3) I += 0.05;
    if (f.wavePhase === 'calm' && f.waveTimer <= 16) I += 0.25 * (1 - f.waveTimer / 16);
    m.intensity = I;
    m.onHome = f.onHome;
    m.ftueQuiet = f.ftueStep === 'grab' || f.ftueStep === 'release';
    m.lead = f.bestZone <= 1 ? 'marimba' : 'pan';
    m.lowTier = f.lowTier;

    let lp = 2500 + 13500 * clamp01(I);
    let mod = 1;
    if (f.panelOpen) {
      lp = Math.min(lp, 1800);
      mod = 0.708;
    }
    if (f.slowmo) {
      lp = Math.min(lp, 700);
      mod = Math.min(mod, 0.63);
    }
    eng.musicLP.frequency.setTargetAtTime(lp, t, f.slowmo || f.panelOpen ? 0.07 : 0.5);
    eng.musicMod.gain.setTargetAtTime(mod, t, 0.07);
    eng.musicBus.gain.setTargetAtTime((f.wavePhase === 'surge' ? MIX.musicSurge : MIX.music) * vol(this.musicVol), t, 0.3);

    // Ambience.
    const surf = Math.max(0.35, Math.min(1, 1 - f.altitude / 40));
    this.amb!.update(f.dt, surf, f.speed);
    const prox = f.wavePhase === 'surge' && this.surgeT >= 0 ? Math.max(0.15, Math.min(1, this.surgeT / 12)) : 0;
    this.amb!.rumble.set(prox);

    // Footsteps: the leg phase integrates speed × .9 rad/s; a step on every multiple of π.
    if (f.grounded && f.speed > 1.5) {
      const before = Math.floor(this.footPhase / Math.PI);
      this.footPhase += f.speed * 0.9 * f.dt;
      if (Math.floor(this.footPhase / Math.PI) !== before) this.sfx!.footstep(f.surface);
    }

    // Rope: creak at the apex (|vel| < 4, once per half-swing), whoosh through the bottom of the arc.
    if (f.swing) {
      const th = f.swing.theta;
      if (this.lastTheta !== null && Math.sign(th) !== Math.sign(this.lastTheta) && th !== 0) {
        this.sfx!.whoosh(f.swing.speed, Math.max(-1, Math.min(1, this.velX / 20)));
        this.creakArmed = true;
      }
      if (this.creakArmed && f.swing.speed < 4) {
        this.sfx!.ropeCreak();
        this.creakArmed = false;
      }
      this.lastTheta = th;
    } else {
      this.lastTheta = null;
      this.creakArmed = true;
    }

    if (f.perfectWindow && !this.lastPerfectWindow) this.sfx!.play('perfectWindow');
    this.lastPerfectWindow = f.perfectWindow;
  }

  /** Position inside the current beat (0..1), latency-compensated. NaN before unlock or when music is silent. */
  beatPhase(): number {
    const ctx = this.ctx;
    const m = this.music;
    if (!ctx || !m || !m.isRunning) return NaN;
    if (this.musicVol <= 0 || this.userMuted || this.platformMuted || ctx.state !== 'running') return NaN;
    const lat = (ctx as AudioContext & { outputLatency?: number }).outputLatency ?? ctx.baseLatency ?? 0;
    return m.beatPhase(ctx.currentTime - (Number.isFinite(lat) ? lat : 0));
  }

  setVolumes(music: number, sound: number): void {
    this.musicVol = music;
    this.soundVol = sound;
    this.applyVolumes();
  }

  setUserMuted(m: boolean): void {
    this.userMuted = m;
    this.apply();
  }
  setPlatformMuted(m: boolean): void {
    this.platformMuted = m;
    this.apply();
  }

  setAdPlaying(on: boolean): void {
    this.adPlaying = on;
    this.apply(on ? 0.02 : 0.1);
    this.syncSuspend();
  }

  setHidden(on: boolean): void {
    this.hidden = on;
    this.apply();
    this.syncSuspend();
  }

  /** Extra for the sandbox: the music section, the voice count, the duck value. */
  debugInfo(): { section: string; voices: number; peakVoices: number; state: string; transpose: number } {
    return {
      section: this.music?.section ?? '-',
      voices: this.eng?.activeVoices() ?? 0,
      peakVoices: this.eng?.peakVoices ?? 0,
      state: this.ctx?.state ?? 'locked',
      transpose: this.music?.transpose ?? 0,
    };
  }

  /** Extra for the sandbox: force a music state without sim events. */
  debugMusic(state: 'calm' | 'warning' | 'hurry' | 'surge' | 'phew'): void {
    const m = this.music;
    if (!m) return;
    switch (state) {
      case 'calm':
        this.phase = 'calm';
        m.toCalm();
        break;
      case 'warning':
        this.onSimEvent({ type: 'waveWarning', golden: this.golden, big: false, number: this.cycle + 1 });
        break;
      case 'hurry':
        m.switchTo('hurry');
        break;
      case 'surge':
        this.onSimEvent({ type: 'surgeStart', golden: this.golden, big: false, number: this.cycle + 1 });
        break;
      case 'phew':
        this.onSimEvent({ type: 'surgeEnd', golden: this.golden, big: false, number: this.cycle + 1, survived: true });
        break;
    }
  }

  /** Remember the player's horizontal velocity for panning (optional; the lead may set it). */
  setVelX(vx: number): void {
    this.velX = vx;
  }

  // ------------------------------------------------------------ internals

  private get silent(): boolean {
    return this.userMuted || this.platformMuted || this.adPlaying || this.hidden;
  }

  private apply(tau = 0.02): void {
    const eng = this.eng;
    const ctx = this.ctx;
    if (!eng || !ctx) return;
    eng.master.gain.setTargetAtTime(this.silent ? 0 : MIX.master, ctx.currentTime, tau);
  }

  /** Suspend while an ad plays or the tab is hidden (60 ms fade first); resume when both clear. */
  private syncSuspend(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    if (this.suspendTimer) clearTimeout(this.suspendTimer);
    this.suspendTimer = null;
    if (this.adPlaying || this.hidden) {
      const go = (): void => {
        if (this.adPlaying || this.hidden) void ctx.suspend().catch(() => undefined);
      };
      if (this.hidden) go();
      else this.suspendTimer = setTimeout(go, 60);
    } else if (ctx.state !== 'running') {
      // May be refused without a gesture; then needsGesture is true and the resume overlay's tap calls unlock().
      void ctx.resume().then(
        () => {
          const eng = this.eng!;
          const t = ctx.currentTime;
          holdParam(eng.master.gain, t);
          eng.master.gain.setValueAtTime(0, t);
          this.apply(0.1);
          this.startMusic();
        },
        () => undefined,
      );
    }
  }

  private applyVolumes(): void {
    const eng = this.eng;
    const ctx = this.ctx;
    if (!eng || !ctx) return;
    const t = ctx.currentTime;
    eng.musicBus.gain.setTargetAtTime((this.phase === 'surge' ? MIX.musicSurge : MIX.music) * vol(this.musicVol), t, 0.05);
    eng.sfxBus.gain.setTargetAtTime(MIX.sfx * vol(this.soundVol), t, 0.05);
    eng.ambBus.gain.setTargetAtTime(MIX.amb * vol(this.soundVol), t, 0.05);
  }

  private applyTier(): void {
    if (!this.eng) return;
    this.eng.cap = this.lowTier ? 16 : 24;
    this.amb?.setLowTier(this.lowTier);
    if (this.music) this.music.lowTier = this.lowTier;
  }
}

function rarityOf(speciesId: string): number {
  return hasSpecies(speciesId) ? getSpecies(speciesId).rarity : 0;
}
