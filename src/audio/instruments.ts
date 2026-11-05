// Instrument recipes of §8.3. Each call allocates one voice (one note, or one strum / one drum hit),
// schedules it at t on the given destination node and returns it already finished (stop time set).
// τ is the setTargetAtTime decay constant; a voice stops at attack + 7τ unless its note is released earlier.

import { type Engine, type Voice } from './engine';

const ftom = (f: number): number => 69 + 12 * Math.log2(f / 440);

/** Linear attack to `peak`, then exponential decay with τ. */
function strike(p: AudioParam, t: number, peak: number, attack: number, tau: number): void {
  p.setValueAtTime(0, t);
  p.linearRampToValueAtTime(peak, t + attack);
  p.setTargetAtTime(0, t + attack, tau);
}

/** Steel pan: 3 sine partials with an FM strike on the fundamental. `len` (s) chokes the note early. */
export function steelPan(e: Engine, dest: AudioNode, t: number, f: number, v: number, len = 0): Voice {
  const vo = e.begin(dest, t);
  const atk = 0.003;
  const natural = t + atk + 7 * 0.32;
  const rel = len > 0 ? t + len : Infinity;
  const stop = Math.min(natural, rel + 0.35);
  const parts: [number, number, number][] = [
    [1, 0.22, 0.32],
    [2.004, 0.11, 0.2],
    [3, 0.044, 0.09],
  ];
  parts.forEach(([ratio, amp, tau], i) => {
    const o = vo.osc('sine', f * ratio);
    const g = vo.gain(0);
    strike(g.gain, t, amp * v, atk, tau);
    if (rel < natural) g.gain.setTargetAtTime(0, rel, 0.07);
    o.connect(g).connect(vo.out);
    if (i === 0) {
      o.frequency.setValueAtTime(f * 1.01, t);
      o.frequency.setTargetAtTime(f, t, 0.008);
      const mod = vo.osc('sine', f);
      const dev = vo.gain(f * 2);
      dev.gain.setTargetAtTime(f * 0.2, t, 0.03);
      mod.connect(dev).connect(o.frequency);
    }
  });
  return vo.finish(stop);
}

/** Marimba: partials f, 4f, 9.2f with a pitch-dependent decay, plus a mallet thump. */
export function marimba(e: Engine, dest: AudioNode, t: number, f: number, v: number, len = 0): Voice {
  const vo = e.begin(dest, t);
  const midi = ftom(f);
  const tau = 0.08 + 0.25 * Math.max(0, (84 - midi) / 36);
  const atk = 0.002;
  const natural = t + atk + 7 * tau;
  const rel = len > 0 ? t + len : Infinity;
  const stop = Math.min(natural, rel + 0.25);
  const nyq = e.ctx.sampleRate * 0.45;
  const parts: [number, number, number][] = [
    [1, 1, tau],
    [4, 0.18, tau * 0.25],
    [9.2, 0.06, tau * 0.1],
  ];
  for (const [ratio, amp, tt] of parts) {
    if (f * ratio > nyq) continue;
    const o = vo.osc('sine', f * ratio);
    const g = vo.gain(0);
    strike(g.gain, t, amp * v, atk, tt);
    if (rel < natural) g.gain.setTargetAtTime(0, rel, 0.05);
    o.connect(g).connect(vo.out);
  }
  const n = vo.noise('white');
  const bp = vo.filter('bandpass', Math.min(2 * f, 4000), 1.5);
  const ng = vo.gain(0);
  ng.gain.setValueAtTime(0.3 * v, t);
  ng.gain.setTargetAtTime(0, t + 0.004, 0.004);
  n.connect(bp).connect(ng).connect(vo.out);
  return vo.finish(stop);
}

/** Glockenspiel partials 1, 2.76, 5.40 (SFX only). The pitch given is the sounding pitch. */
export function glock(e: Engine, dest: AudioNode, t: number, f: number, v: number): Voice {
  const vo = e.begin(dest, t);
  const nyq = e.ctx.sampleRate * 0.45;
  const parts: [number, number, number][] = [
    [1, 1, 0.6],
    [2.76, 0.3, 0.2],
    [5.4, 0.1, 0.08],
  ];
  for (const [ratio, amp, tau] of parts) {
    if (f * ratio > nyq) continue;
    const o = vo.osc('sine', f * ratio);
    const g = vo.gain(0);
    strike(g.gain, t, amp * v, 0.002, tau);
    o.connect(g).connect(vo.out);
  }
  return vo.finish(t + 0.002 + 7 * 0.6 * 0.6); // the top partials are long gone; 2.5 s covers the fundamental
}

/**
 * Ukulele-style pluck strum: filtered saws, 12 ms between strings.
 * dir 'down' plays low→high, 'up' high→low. `len` chokes the strum (reggae skank).
 */
export function strum(
  e: Engine,
  dest: AudioNode,
  t: number,
  freqs: number[],
  v: number,
  dir: 'down' | 'up',
  len = 0.25,
  echoSend = 0.2,
): Voice {
  const vo = e.begin(dest, t);
  const hp = vo.filter('highpass', 180, 0.7);
  hp.connect(vo.out);
  if (echoSend > 0) {
    const s = vo.gain(echoSend);
    hp.connect(s).connect(e.echoIn);
  }
  const order = dir === 'down' ? freqs : [...freqs].reverse();
  const tau = 0.12;
  const natural = t + 0.04 + 7 * tau;
  const rel = t + len;
  const stop = Math.min(natural, rel + 0.15);
  order.forEach((f, i) => {
    const tt = t + i * 0.012;
    const o = vo.osc('sawtooth', f, tt);
    const lp = vo.filter('lowpass', 6 * f, 2);
    lp.frequency.setValueAtTime(6 * f, tt);
    lp.frequency.setTargetAtTime(1.5 * f, tt, 0.04);
    const g = vo.gain(0);
    strike(g.gain, tt, v / Math.sqrt(order.length), 0.002, tau);
    g.gain.setTargetAtTime(0, Math.max(rel, tt + 0.01), 0.025);
    o.connect(lp).connect(g).connect(hp);
  });
  return vo.finish(stop);
}

/** Saturated saw + sub bass. `len` is the note length in seconds. */
export function bass(e: Engine, dest: AudioNode, t: number, f: number, v: number, len: number): Voice {
  const vo = e.begin(dest, t, true);
  const saw = vo.osc('sawtooth', f);
  const sub = vo.osc('sine', f);
  const subG = vo.gain(0.6);
  const pre = vo.gain(0.55);
  const lp = vo.filter('lowpass', Math.min(10 * f, 2400), 3);
  lp.frequency.setTargetAtTime(2.5 * f, t, 0.06);
  const sh = vo.shaper();
  const g = vo.gain(0);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.45 * v, t + 0.006);
  g.gain.setTargetAtTime(0.27 * v, t + 0.006, 0.08);
  const end = t + Math.max(0.03, len);
  g.gain.setTargetAtTime(0, end, 0.03);
  saw.connect(pre);
  sub.connect(subG).connect(pre);
  pre.connect(lp).connect(sh).connect(g).connect(vo.out);
  return vo.finish(end + 0.21);
}

/** Soft kick: sine 110 → 45 Hz plus a triangle knock that reads on phone speakers. */
export function kick(e: Engine, dest: AudioNode, t: number, v: number): Voice {
  const vo = e.begin(dest, t);
  const o = vo.osc('sine', 110);
  o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
  const g = vo.gain(0);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.9 * v, t + 0.004);
  g.gain.exponentialRampToValueAtTime(1e-4, t + 0.32);
  o.connect(g).connect(vo.out);
  const k = vo.osc('triangle', 220);
  k.frequency.exponentialRampToValueAtTime(90, t + 0.05);
  const kg = vo.gain(0);
  kg.gain.setValueAtTime(0.15 * v, t);
  kg.gain.exponentialRampToValueAtTime(1e-4, t + 0.06);
  k.connect(kg).connect(vo.out);
  return vo.finish(t + 0.33);
}

/** Generic filtered-noise hit. */
export function noiseHit(
  e: Engine,
  dest: AudioNode,
  t: number,
  type: BiquadFilterType,
  freq: number,
  q: number,
  peak: number,
  attack: number,
  dur: number,
  kind: 'white' | 'pink' | 'brown' = 'white',
): Voice {
  const vo = e.begin(dest, t);
  const n = vo.noise(kind);
  const fl = vo.filter(type, freq, q);
  const g = vo.gain(0);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(peak, t + attack);
  g.gain.setTargetAtTime(0, t + attack, Math.max(0.004, (dur - attack) / 4));
  n.connect(fl).connect(g).connect(vo.out);
  return vo.finish(t + dur + 0.02);
}

export const shaker = (e: Engine, d: AudioNode, t: number, v: number): Voice =>
  noiseHit(e, d, t, 'bandpass', 7000, 1.2, 0.1 * v, 0.01, 0.07);
export const closedHat = (e: Engine, d: AudioNode, t: number, v: number): Voice =>
  noiseHit(e, d, t, 'highpass', 7500, 0.7, 0.08 * v, 0.001, 0.045);
export const openHat = (e: Engine, d: AudioNode, t: number, v: number): Voice =>
  noiseHit(e, d, t, 'highpass', 7000, 0.7, 0.06 * v, 0.002, 0.25);

/** Clap: 3 short bursts 10 ms apart plus a tail. One voice. */
export function clap(e: Engine, dest: AudioNode, t: number, v: number): Voice {
  const vo = e.begin(dest, t);
  const n = vo.noise('white');
  const bp = vo.filter('bandpass', 1200, 1);
  const g = vo.gain(0);
  for (let i = 0; i < 3; i++) {
    const tt = t + i * 0.01;
    g.gain.setValueAtTime(0.2 * v, tt);
    g.gain.setTargetAtTime(0, tt + 0.001, 0.003);
  }
  g.gain.setValueAtTime(0.15 * v, t + 0.03);
  g.gain.setTargetAtTime(0, t + 0.031, 0.03);
  n.connect(bp).connect(g).connect(vo.out);
  return vo.finish(t + 0.2);
}

/** Conga: f = 330 (hi) / 220 (lo), pitch drop 1.15f → f over 30 ms, plus a slap. */
export function conga(e: Engine, dest: AudioNode, t: number, v: number, hi: boolean): Voice {
  const f = hi ? 330 : 220;
  const vo = e.begin(dest, t);
  const o = vo.osc('sine', f * 1.15);
  o.frequency.exponentialRampToValueAtTime(f, t + 0.03);
  const g = vo.gain(0);
  strike(g.gain, t, 0.5 * v, 0.002, 0.07);
  o.connect(g).connect(vo.out);
  const n = vo.noise('white');
  const bp = vo.filter('bandpass', 2000, 1);
  const ng = vo.gain(0);
  ng.gain.setValueAtTime(0.08 * v, t);
  ng.gain.setValueAtTime(0, t + 0.006);
  n.connect(bp).connect(ng).connect(vo.out);
  return vo.finish(t + 0.002 + 7 * 0.07);
}

/** Woodblock: partials 1050 Hz and 1650 Hz. `topOnly` plays just the 1650 Hz partial (τ 10 ms). */
export function woodblock(e: Engine, dest: AudioNode, t: number, v: number, topOnly = false, pitch = 1): Voice {
  const vo = e.begin(dest, t);
  const parts: [number, number, number][] = topOnly ? [[1650, 1, 0.01]] : [[1050, 0.3, 0.02], [1650, 0.1, 0.012]];
  for (const [f, amp, tau] of parts) {
    const o = vo.osc('sine', f * pitch);
    const g = vo.gain(0);
    strike(g.gain, t, amp * v, 0.001, tau);
    o.connect(g).connect(vo.out);
  }
  return vo.finish(t + 0.16);
}

/** Agogo bell: triangle at 900 Hz (lo) or 1350 Hz (hi), τ 50 ms. */
export function agogo(e: Engine, dest: AudioNode, t: number, v: number, hi: boolean): Voice {
  const vo = e.begin(dest, t);
  const f = hi ? 1350 : 900;
  const o = vo.osc('triangle', f);
  const o2 = vo.osc('sine', f * 2.7);
  const g = vo.gain(0);
  strike(g.gain, t, 0.3 * v, 0.001, 0.05);
  const g2 = vo.gain(0);
  strike(g2.gain, t, 0.06 * v, 0.001, 0.02);
  o.connect(g).connect(vo.out);
  o2.connect(g2).connect(vo.out);
  return vo.finish(t + 0.36);
}

/** Crash cymbal: highpassed noise 1.6 s plus a 3 kHz band. `v` = 1 gives the recipe's .12 / .05. */
export function crash(e: Engine, dest: AudioNode, t: number, v: number): Voice {
  const vo = e.begin(dest, t);
  const n = vo.noise('white');
  const hp = vo.filter('highpass', 5000, 0.7);
  const g = vo.gain(0);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(0.12 * v, t + 0.003);
  g.gain.setTargetAtTime(0, t + 0.003, 0.4);
  n.connect(hp).connect(g).connect(vo.out);
  const bp = vo.filter('bandpass', 3000, 0.5);
  const g2 = vo.gain(0);
  g2.gain.setValueAtTime(0, t);
  g2.gain.linearRampToValueAtTime(0.05 * v, t + 0.003);
  g2.gain.setTargetAtTime(0, t + 0.003, 0.2);
  n.connect(bp).connect(g2).connect(vo.out);
  return vo.finish(t + 1.6);
}

/**
 * Tension pad: 2 detuned saws per chord tone → lowpass (lpFrom → lpTo across the note) → 16th tremolo.
 * Attack .3 s, release .2 s.
 */
export function tensionPad(
  e: Engine,
  dest: AudioNode,
  t: number,
  freqs: number[],
  v: number,
  len: number,
  lpFrom: number,
  lpTo: number,
  stepDur: number,
): Voice {
  const vo = e.begin(dest, t);
  const lp = vo.filter('lowpass', lpFrom, 1);
  lp.frequency.exponentialRampToValueAtTime(Math.max(lpFrom, lpTo), t + len);
  const trem = vo.gain(0.7);
  const lfo = vo.osc('square', 1 / (2 * stepDur));
  const depth = vo.gain(0.3);
  lfo.connect(depth).connect(trem.gain);
  const env = vo.gain(0);
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(v / Math.sqrt(freqs.length * 2), t + Math.min(0.3, len * 0.5));
  env.gain.setTargetAtTime(0, t + len, 0.06);
  for (const f of freqs) {
    for (const d of [1.004, 0.996]) {
      const o = vo.osc('sawtooth', f * d);
      o.connect(lp);
    }
  }
  lp.connect(trem).connect(env).connect(vo.out);
  return vo.finish(t + len + 0.3);
}
