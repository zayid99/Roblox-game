// Adaptive music (§8.3, §8.4): a lookahead MusicClock, the song / hurry / surge / phew / rest sections,
// layers driven by intensity, the riser and beatPhase for visuals.

import { db, mtof, type Engine, type Voice } from './engine';
import * as I from './instruments';
import {
  CHORDS,
  CYCLE_TRANSPOSE,
  HURRY,
  PAT,
  PHEW,
  SONG1,
  SURGE,
  mulberry32,
  type Chord,
  type ChordName,
  type LeadNote,
  type SongDef,
} from './songs';

export type Section = 'song' | 'hurry' | 'surge' | 'phew' | 'rest';
export type LeadKind = 'pan' | 'marimba';
type LayerId = 'kick' | 'lead' | 'wood' | 'agogo' | 'hats' | 'conga';

const LOOKAHEAD = 0.15;
const TICK_MS = 25;
const MAX_LAG = 0.05;

/** Thresholds of §8.4 (0.05 hysteresis below). */
const THRESH: Record<LayerId, number> = { kick: 0.2, lead: 0.4, wood: 0.4, agogo: 0.55, hats: 0.6, conga: 0.7 };

/** Overall trim of the music sum, tuned so SFX stingers sit 3–6 dB over the music at default volumes. */
export const MUSIC_TRIM = db(4);

/**
 * Calibration (dB) added to the §8.2 voice levels. The table's levels assume every recipe peaks alike, but a
 * band-passed noise hit comes out far quieter than a sine partial of the same gain value, so the noise
 * percussion was inaudible. These offsets were measured with the offline renders (see the module notes) so the
 * layers sit at the table's *relative* loudness (perceived, highpassed RMS) instead.
 */
const CAL: Record<string, number> = {
  shaker: 26,
  hats: 22,
  wood: 12,
  agogo: 10,
  conga: 4,
  clap: 24,
  pad: -3,
};

interface Segment {
  t0: number;
  stepDur: number;
}

export class Music {
  private readonly out: GainNode;
  private readonly g: Record<string, GainNode> = {};

  // Clock.
  private running = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private segT0 = 0;
  private segN = 0;
  private stepDur = 60 / 112 / 4;
  private segments: Segment[] = [];
  /** Tempo waiting for the next bar line. */
  pendingBpm: number | null = null;

  // Position.
  section: Section = 'song';
  private step = 0;
  private bar = 0;
  private barCount = 0;
  private pendingSection: Section | null = null;
  private restBars = 0;
  private recoverBars = 0;
  private song: SongDef = SONG1;
  private loopCount = 0;
  private rng = mulberry32(1);
  private barLead: LeadNote[] | null = null;
  private fill: 'conga' | 'marimba' | 'wood' | 'rest' = 'rest';

  // Inputs.
  intensity = 0.25;
  onHome = true;
  ftueQuiet = false;
  golden = false;
  lowTier = false;
  lead: LeadKind = 'pan';
  transpose = 0;
  cycle = 0;
  /** 0..1 progress through the warning (drives the pad filter and the riser). */
  warnProgress = 0;

  private layers: Record<LayerId, { on: boolean; since: number }> = {
    kick: { on: false, since: 0 },
    lead: { on: false, since: 0 },
    wood: { on: false, since: 0 },
    agogo: { on: false, since: 0 },
    hats: { on: false, since: 0 },
    conga: { on: false, since: 0 },
  };

  private riser: { src: AudioBufferSourceNode; bp: BiquadFilterNode; gain: GainNode } | null = null;

  constructor(private readonly e: Engine) {
    const ctx = e.ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(e.layerSum);
    e.layerSum.gain.value = MUSIC_TRIM;
    const levels: Record<string, number> = {
      bass: 0,
      kick: -3,
      lead: -4,
      pluck: -8,
      marimba: -8,
      pad: -10,
      conga: -12,
      hats: -16,
      shaker: -18,
      wood: -12,
      clap: -8,
      agogo: -14,
      riser: -6,
      crash: -6,
    };
    for (const [k, d] of Object.entries(levels)) {
      const n = ctx.createGain();
      n.gain.value = db(d + (CAL[k] ?? 0));
      n.connect(this.out);
      this.g[k] = n;
    }
    // A little dub echo on the lead too (the pluck has its own 20% send).
    const leadSend = ctx.createGain();
    leadSend.gain.value = 0.12;
    this.g.lead.connect(leadSend).connect(e.echoIn);
  }

  get isRunning(): boolean {
    return this.running;
  }

  // ---------------------------------------------------------------- clock

  /** Start (or restart) playback with a fade-in. `realtime` false = caller pumps manually (offline render). */
  start(fadeSec = 1.5, realtime = true, at = this.e.ctx.currentTime + 0.05): void {
    const p = this.out.gain;
    p.cancelScheduledValues(at);
    p.setValueAtTime(0, at);
    p.linearRampToValueAtTime(1, at + fadeSec);
    if (this.running) return;
    this.running = true;
    this.segT0 = at;
    this.segN = 0;
    this.step = 0;
    this.bar = 0;
    this.stepDur = 60 / this.bpmOf(this.section) / 4;
    this.segments = [{ t0: at, stepDur: this.stepDur }];
    this.prepareBar();
    if (realtime) this.loop();
  }

  stop(): void {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.cutRiser(this.e.ctx.currentTime);
  }

  private loop = (): void => {
    if (!this.running) return;
    this.tick();
    this.timer = setTimeout(this.loop, TICK_MS);
  };

  private get nextT(): number {
    return this.segT0 + this.segN * this.stepDur;
  }

  /** One scheduler pass. If the clock fell more than 50 ms behind (main-thread stall), skip silently instead of bursting. */
  tick(): void {
    const now = this.e.ctx.currentTime;
    if (this.nextT < now - MAX_LAG) {
      let guard = 0;
      while (this.nextT < now && guard++ < 100000) this.advance();
    }
    this.pump(now + LOOKAHEAD);
  }

  /** Schedule every step whose time is before `until`. */
  pump(until: number): void {
    let guard = 0;
    while (this.running && this.nextT < until && guard++ < 10000) {
      this.scheduleStep(this.nextT);
      this.advance();
    }
  }

  private bpmOf(s: Section): number {
    return s === 'hurry' ? HURRY.bpm : s === 'surge' ? SURGE.bpm : s === 'phew' ? PHEW.bpm : this.song.bpm;
  }

  private newSegment(bpm: number): void {
    const t0 = this.nextT;
    this.stepDur = 60 / bpm / 4;
    this.segT0 = t0;
    this.segN = 0;
    this.segments.push({ t0, stepDur: this.stepDur });
    if (this.segments.length > 6) this.segments.shift();
  }

  private advance(): void {
    this.segN++;
    this.step++;
    if (this.step >= 16) {
      this.step = 0;
      this.onBarLine();
    } else if (this.pendingSection && this.step % 4 === 0) {
      // Horizontal switch on the next beat.
      this.enter(this.pendingSection);
    }
  }

  private enter(s: Section): void {
    this.pendingSection = null;
    this.section = s;
    this.step = 0;
    this.bar = 0;
    this.newSegment(this.bpmOf(s));
    this.prepareBar();
  }

  private onBarLine(): void {
    this.barCount++;
    if (this.pendingSection) {
      this.enter(this.pendingSection);
      return;
    }
    this.bar++;
    switch (this.section) {
      case 'song':
        if (this.bar >= this.song.form.length) {
          this.bar = 0;
          this.loopCount++;
        }
        break;
      case 'hurry':
      case 'surge':
        this.bar %= 4;
        break;
      case 'phew':
        this.recoverBars = 2;
        if (this.restBars > 0) {
          this.enter('rest');
          return;
        }
        this.enter('song');
        return;
      case 'rest':
        if (this.bar >= this.restBars) {
          this.restBars = 0;
          this.recoverBars = 2;
          this.enter('song');
          return;
        }
        break;
    }
    if (this.recoverBars > 0 && this.section === 'song' && this.bar > 0) this.recoverBars--;
    if (this.pendingBpm !== null) {
      const b = this.pendingBpm;
      this.pendingBpm = null;
      this.newSegment(b);
    }
    this.prepareBar();
  }

  /** Bar-line work: layer decisions, the bar's lead with seeded variations, the fill choice. */
  private prepareBar(): void {
    if (this.section === 'song' && this.bar === 0) this.rng = mulberry32(1000 * this.cycle + this.loopCount * 7 + 1);
    this.decideLayers();
    if (this.section !== 'song') return;
    const r = this.rng;
    const base = this.song.lead[this.bar];
    if (base) {
      const phraseUp = this.bar % 8 === 4 ? r() < 0.2 : this.bar % 8 === 5 ? this.octUp : false;
      if (this.bar % 8 === 4) this.octUp = phraseUp;
      const out: LeadNote[] = [];
      for (const n of base) {
        if (n.step !== 0 && r() < 0.1) continue;
        const midi = n.midi + (phraseUp ? 12 : 0);
        if (n.len >= 3 && r() < 0.15) {
          out.push({ step: n.step, midi: scaleStepUp(midi), len: 1 });
          out.push({ step: n.step + 1, midi, len: n.len - 1 });
        } else out.push({ ...n, midi });
      }
      this.barLead = out;
    } else this.barLead = null;
    if (this.bar % 4 === 3) {
      const opts: ('conga' | 'marimba' | 'wood' | 'rest')[] =
        this.bar % 8 === 7 && base ? ['conga', 'wood', 'rest', 'conga'] : ['conga', 'marimba', 'wood', 'rest'];
      this.fill = opts[Math.floor(r() * 4)];
    }
  }
  private octUp = false;

  private decideLayers(): void {
    const I = this.intensity;
    const fourBar = this.bar % 4 === 0;
    for (const id of Object.keys(this.layers) as LayerId[]) {
      const L = this.layers[id];
      const thr = THRESH[id];
      let want = L.on ? I > thr - 0.05 : I > thr;
      if (this.ftueQuiet) want = false;
      if (id === 'conga' && this.lowTier) want = false;
      if (want && !L.on) {
        L.on = true;
        L.since = this.barCount;
      } else if (!want && L.on && (fourBar || this.ftueQuiet) && this.barCount - L.since >= 2) {
        L.on = false;
        L.since = this.barCount;
      }
    }
  }

  // ---------------------------------------------------------------- state changes

  /** Request a horizontal switch on the next beat. */
  switchTo(s: Section): void {
    if (!this.running) {
      this.section = s;
      return;
    }
    this.pendingSection = s;
  }

  onWarning(): void {
    this.switchTo('hurry');
    this.startRiser();
  }

  onSurgeStart(t = this.e.ctx.currentTime): void {
    this.cutRiser(t);
    this.switchTo('surge');
  }

  /** Phew stinger then the song from bar 1 in the next cycle key; every 2nd cycle rests ~12 s first. */
  onSurgeEnd(): void {
    this.cutRiser(this.e.ctx.currentTime);
    this.cycle++;
    this.transpose = CYCLE_TRANSPOSE[this.cycle % CYCLE_TRANSPOSE.length];
    this.loopCount = 0;
    this.restBars = this.cycle % 2 === 0 ? Math.round((8 + Math.random() * 8) / ((60 / SONG1.bpm) * 4)) : 0;
    this.switchTo('phew');
  }

  /** Back to the calm song immediately (sandbox / resync). */
  toCalm(): void {
    this.cutRiser(this.e.ctx.currentTime);
    this.switchTo('song');
  }

  private startRiser(): void {
    if (this.riser || !this.running) return;
    const ctx = this.e.ctx;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.e.noise.white;
    src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 2;
    bp.frequency.setValueAtTime(400, t);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(1e-4, t);
    src.connect(bp).connect(gain).connect(this.g.riser);
    src.start(t);
    this.riser = { src, bp, gain };
    this.setWarnProgress(this.warnProgress, t);
  }

  /** p = 0..1 through the warning: riser 400 → 5000 Hz (exp), gain 1e-4 → .2 (exp). */
  setWarnProgress(p: number, t = this.e.ctx.currentTime): void {
    this.warnProgress = Math.max(0, Math.min(1, p));
    if (!this.riser) return;
    const q = this.warnProgress;
    this.riser.bp.frequency.setTargetAtTime(400 * Math.pow(5000 / 400, q), t, 0.1);
    this.riser.gain.gain.setTargetAtTime(1e-4 * Math.pow(0.2 / 1e-4, q), t, 0.1);
  }

  private cutRiser(t: number): void {
    const r = this.riser;
    if (!r) return;
    this.riser = null;
    r.gain.gain.cancelScheduledValues(t);
    r.gain.gain.setTargetAtTime(0, t, 0.008);
    r.src.stop(t + 0.08);
    r.src.onended = () => {
      r.src.disconnect();
      r.bp.disconnect();
      r.gain.disconnect();
    };
  }

  /** Crash into the music (used by phew-less resyncs); the surge crash itself is an SFX stinger. */
  crash(t: number, v = 1): void {
    I.crash(this.e, this.g.crash, t, v);
  }

  // ---------------------------------------------------------------- beat phase

  beatPhase(t: number): number {
    if (!this.running || this.section === 'rest') return NaN;
    let seg = this.segments[0];
    for (const s of this.segments) if (s.t0 <= t) seg = s;
    const beat = seg.stepDur * 4;
    const x = (t - seg.t0) / beat;
    return x - Math.floor(x);
  }

  // ---------------------------------------------------------------- scheduling

  private scheduleStep(t: number): void {
    switch (this.section) {
      case 'song':
        this.songStep(t);
        break;
      case 'hurry':
      case 'surge':
        this.hurryStep(t);
        break;
      case 'phew':
        this.phewStep(t);
        break;
      case 'rest':
        break;
    }
  }

  private chordOf(name: ChordName): Chord {
    return CHORDS[name];
  }

  private leadNote(t: number, midi: number, v: number, len: number): Voice {
    const f = mtof(midi);
    return this.lead === 'marimba'
      ? I.marimba(this.e, this.g.lead, t, f, v * 1.1, len)
      : I.steelPan(this.e, this.g.lead, t, f, v * 2.4, len);
  }

  private hum(t: number, v: number, now: number): [number, number] {
    const tt = Math.max(now, t + (Math.random() * 2 - 1) * 0.006);
    return [tt, v * (1 + (Math.random() * 2 - 1) * 0.12)];
  }

  private songStep(t0: number): void {
    const e = this.e;
    const s = this.step;
    const sd = this.stepDur;
    const swingOff = s % 2 === 1 ? (this.song.swing - 0.5) * 2 * sd : 0;
    const t = t0 + swingOff;
    const now = e.ctx.currentTime;
    const tr = this.transpose;
    const ch = this.chordOf(this.song.form[this.bar]);
    const tag = this.song.tags[this.bar];
    const recover = this.recoverBars > 0;
    const L = this.layers;
    const drums = !recover;
    const isFill = this.bar % 4 === 3 && s >= 8 && drums && L.kick.on && this.fill !== 'rest';

    // Bass (3-3-2).
    const bs = PAT.calmBass[s];
    if (bs) {
      const m = (bs === 'r' ? ch.root : bs === 'f' ? ch.fifth : ch.root + 12) + tr;
      I.bass(e, this.g.bass, t, mtof(m), 1, sd * 1.8);
    }
    // Skank (up-strums) and the down-strum on step 0 every 2nd bar.
    const voicing = ch.voicing.map((m) => mtof(m + tr));
    if (PAT.calmSkank[s] > 0) I.strum(e, this.g.pluck, t, voicing, PAT.calmSkank[s], 'up', sd * 1.1);
    if (s === 0 && this.bar % 2 === 1) I.strum(e, this.g.pluck, t, voicing, 0.8, 'down', sd * 1.6);

    if (recover) return;

    // Shaker.
    const sh = PAT.calmShaker[s] * (this.onHome ? 0.6 : 1);
    if (sh > 0) {
      const [tt, vv] = this.hum(t, sh, now);
      I.shaker(e, this.g.shaker, tt, vv);
    }
    if (L.kick.on && PAT.calmKick[s] > 0) {
      const [tt, vv] = this.hum(t0, PAT.calmKick[s], now);
      I.kick(e, this.g.kick, tt, vv);
    }
    if (L.wood.on && PAT.calmWood[s] > 0 && !isFill) {
      const [tt, vv] = this.hum(t, PAT.calmWood[s], now);
      I.woodblock(e, this.g.wood, tt, vv * 1.6);
    }
    if (L.hats.on && PAT.buildHats[s] > 0) {
      const [tt, vv] = this.hum(t, PAT.buildHats[s], now);
      I.closedHat(e, this.g.hats, tt, vv * 1.5);
    }
    if (L.conga.on && !isFill) {
      if (PAT.buildCongaHi[s] > 0) {
        const [tt, vv] = this.hum(t, PAT.buildCongaHi[s], now);
        I.conga(e, this.g.conga, tt, vv, true);
      }
      if (PAT.buildCongaLo[s] > 0) {
        const [tt, vv] = this.hum(t, PAT.buildCongaLo[s], now);
        I.conga(e, this.g.conga, tt, vv, false);
      }
    }
    if (L.agogo.on && PAT.calmAgogo[s] > 0) {
      const [tt, vv] = this.hum(t, PAT.calmAgogo[s], now);
      I.agogo(e, this.g.agogo, tt, vv, s % 8 === 0);
    }

    // Lead (A sections) or marimba arpeggio (B).
    if (tag === 'B') {
      if (s % 2 === 0) {
        const idx = PAT.bArp[s / 2];
        const m = ch.voicing[idx] + 12 + tr;
        I.marimba(e, this.g.marimba, t, mtof(m), s === 0 ? 0.9 : 0.7, sd * 2);
      }
    } else if (L.lead.on && this.barLead) {
      for (const n of this.barLead) {
        if (n.step !== s) continue;
        const v = s === 0 ? 1 : 0.85 + this.rng() * 0.12;
        this.leadNote(t, n.midi + tr, v, n.len * sd);
      }
    }

    // Fills on the last 2 beats of every 4th bar.
    if (isFill) this.fillStep(t, s, ch, tr, now);
  }

  private fillStep(t: number, s: number, ch: Chord, tr: number, now: number): void {
    const e = this.e;
    const sd = this.stepDur;
    switch (this.fill) {
      case 'conga': {
        const v = 0.45 + ((s - 8) / 7) * 0.4;
        const [tt, vv] = this.hum(t, v, now);
        I.conga(e, this.g.conga, tt, vv * 1.4, s % 2 === 0 ? s >= 12 : s < 12);
        break;
      }
      case 'marimba': {
        if (this.lowTier && s % 2 === 1) break;
        const top = ch.voicing[3] + 12;
        const run = [0, 2, 3, 5, 7, 8, 10, 12].map((d) => scaleDown(top, d) + tr);
        I.marimba(e, this.g.marimba, t, mtof(run[s - 8]), 0.55 + (15 - s) * 0.03, sd);
        break;
      }
      case 'wood': {
        if (s === 12) {
          for (let k = 0; k < 3; k++) {
            const [tt, vv] = this.hum(t + (k * 4 * sd) / 3, k === 2 ? 0.6 : 0.45, now);
            I.woodblock(e, this.g.wood, tt, vv * 1.6, false, k === 2 ? 1.12 : 1);
          }
        }
        break;
      }
      case 'rest':
        break;
    }
  }

  private hurryStep(t: number): void {
    const e = this.e;
    const s = this.step;
    const sd = this.stepDur;
    const now = e.ctx.currentTime;
    const surge = this.section === 'surge';
    const chords = surge ? SURGE.chords : HURRY.chords;
    const ch = this.chordOf(chords[this.bar % 4]);

    if (PAT.hurryKick[s] > 0) {
      const [tt, vv] = this.hum(t, PAT.hurryKick[s], now);
      I.kick(e, this.g.kick, tt, vv);
    }
    if (PAT.hurryClap[s] > 0) {
      const [tt, vv] = this.hum(t, PAT.hurryClap[s], now);
      I.clap(e, this.g.clap, tt, vv);
    }
    if (s % 2 === 0) {
      const b = PAT.hurryBass8[s / 2];
      const m = b === 'o' ? ch.root + 12 : ch.root;
      I.bass(e, this.g.bass, t, mtof(m), 1, sd * 1.6);
    }
    const voicing = ch.voicing.map(mtof);
    if (PAT.hurryStabs[s] > 0) I.strum(e, this.g.pluck, t, voicing, PAT.hurryStabs[s], 'up', sd * 0.7, 0.1);
    if (s === 0) {
      const p0 = surge ? 1 : this.warnProgress;
      const lpFrom = 900 + 1600 * p0;
      const lpTo = surge ? 2500 : Math.min(2500, lpFrom + 400);
      I.tensionPad(e, this.g.pad, t, voicing, 0.9, sd * 16, lpFrom, lpTo, sd);
    }
    // 16th arpeggio of the chord tones in octave 5 (an octave up in the surge).
    const tones = [...ch.voicing].sort((a, b) => a - b);
    const m = tones[PAT.hurryArp[s]] + 12 + (surge ? 12 : 0);
    const acc = PAT.hurryAccents.includes(s);
    this.leadNote(t, m, (acc ? 0.85 : 0.5) * (surge ? 0.7 : 1), sd * 0.9);

    if (surge) {
      const [tt, vv] = this.hum(t, PAT.hurryHats[s], now);
      I.closedHat(e, this.g.hats, tt, vv * 1.5);
      if (this.golden) I.agogo(e, this.g.agogo, t, s % 4 === 0 ? 0.7 : 0.4, s % 8 < 4);
    }
  }

  private phewStep(t: number): void {
    const e = this.e;
    const s = this.step;
    const sd = this.stepDur;
    const tr = CYCLE_TRANSPOSE[this.cycle % CYCLE_TRANSPOSE.length];
    if (s % 2 === 0 && s < 8) {
      this.leadNote(t, PHEW.arp[s / 2] + tr, s === 0 ? 1 : 0.85, s === 6 ? sd * 8 : sd * 2);
    }
    if (s === 0) {
      const F = CHORDS.F;
      I.bass(e, this.g.bass, t, mtof(F.root + tr), 1, sd * 6);
      I.strum(e, this.g.pluck, t, F.voicing.map((m) => mtof(m + tr)), 0.8, 'down', sd * 4);
    }
    if (s === 8) I.bass(e, this.g.bass, t, mtof(CHORDS.F.fifth + tr), 0.8, sd * 6);
  }
}

// F major scale degrees for runs and grace notes (pitch classes relative to C).
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
function inF(m: number): number {
  return (((m - 5) % 12) + 12) % 12;
}
/** Next F-major scale tone above m (one scale step up). */
function scaleStepUp(m: number): number {
  for (let d = 1; d <= 2; d++) if (MAJOR.includes(inF(m + d))) return m + d;
  return m + 2;
}
/** Walk down from `top` by `d` semitones then snap down onto the F-major pentatonic. */
function scaleDown(top: number, d: number): number {
  const PENTA_F = [0, 2, 4, 7, 9];
  let m = top - d;
  for (let k = 0; k < 3 && !PENTA_F.includes(inF(m)); k++) m--;
  return m;
}
