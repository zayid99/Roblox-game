// Creature voices (§8.6): a ~0.4 s three-syllable chirp per species. A sawtooth at the species pitch sings
// through two parallel formant bandpasses; the body plan sets formants, syllable contour and length.

import { type Engine } from './engine';
import { SPECIES, type BodyPlan } from '../game/creatures';

export type VoiceKind = 'pickup' | 'reveal' | 'deliver' | 'tap';

interface Plan {
  f1: number;
  f2: number;
  /** Semitones per syllable: [start, end]. */
  syl: [number, number][];
  /** Syllable length in seconds. */
  len: number;
  vib: number;
}

const PLANS: Record<BodyPlan, Plan> = {
  blob: { f1: 500, f2: 1500, syl: [[0, 2], [2, 0], [0, 5]], len: 0.11, vib: 6 },
  fish: { f1: 350, f2: 2200, syl: [[0, -2], [0, -2], [3, 7]], len: 0.11, vib: 6 },
  octo: { f1: 700, f2: 1200, syl: [[2, 0], [4, 2], [0, -5]], len: 0.11, vib: 6 },
  crab: { f1: 800, f2: 2600, syl: [[0, 0], [0, 0], [7, 7]], len: 0.06, vib: 6 },
  whale: { f1: 300, f2: 900, syl: [[0, 3], [3, 5], [5, 0]], len: 0.15, vib: 6 },
  clam: { f1: 600, f2: 1800, syl: [[5, 0], [5, 0], [12, 7]], len: 0.11, vib: 6 },
  turtle: { f1: 400, f2: 1000, syl: [[0, -3], [-3, -5], [0, 4]], len: 0.14, vib: 6 },
  shrimp: { f1: 900, f2: 2900, syl: [[7, 12], [5, 7], [12, 12]], len: 0.11, vib: 6 },
  jelly: { f1: 450, f2: 1300, syl: [[3, 5], [5, 3], [3, 10]], len: 0.11, vib: 9 },
};

const STEPS = [0, 3, 5, 7, 10, 12, 15];
/** Makeup gain for the narrow formant filters, measured so a chirp peaks near .10. */
const MAKEUP = 2.6;
const PEAK = 0.1;

export function speciesPitch(speciesId: string): { f0: number; plan: BodyPlan } | null {
  const i = SPECIES.findIndex((s) => s.id === speciesId);
  if (i < 0) return null;
  const plan = SPECIES[i].look.plan;
  let f0 = 220 * Math.pow(2, STEPS[i % 7] / 12);
  if (plan === 'whale') f0 *= 0.75;
  if (plan === 'shrimp') f0 *= 1.5;
  return { f0, plan };
}

export function creatureVoice(e: Engine, dest: AudioNode, speciesId: string, kind: VoiceKind, t = e.ctx.currentTime): void {
  const sp = speciesPitch(speciesId);
  if (!sp) return;
  const p = PLANS[sp.plan];
  let syl = p.syl.map(([a, b]) => [a, b] as [number, number]);
  if (kind === 'reveal') syl[2] = [syl[2][0] + 12, syl[2][1] + 12];
  if (kind === 'deliver') {
    syl = [syl[0], syl[2]].map(([a, b]) => {
      const lo = Math.min(a, b);
      const hi = Math.max(a, b, lo + 3);
      return [lo, hi] as [number, number];
    });
  }
  const peak = PEAK * (kind === 'tap' ? 0.8 : 1);
  const gap = 0.025;
  const total = syl.length * (p.len + gap);

  const vo = e.begin(dest, t);
  const saw = vo.osc('sawtooth', sp.f0);
  const vib = vo.osc('sine', p.vib);
  const vibG = vo.gain(sp.f0 * (Math.pow(2, 20 / 1200) - 1));
  vib.connect(vibG).connect(saw.frequency);
  const bp1 = vo.filter('bandpass', p.f1, 6);
  const bp2 = vo.filter('bandpass', p.f2, 9);
  const g2 = vo.gain(0.6);
  const env = vo.gain(0);
  const out = vo.gain(MAKEUP);
  saw.connect(bp1).connect(env);
  saw.connect(bp2).connect(g2).connect(env);
  env.connect(out).connect(vo.out);

  syl.forEach(([a, b], k) => {
    const ts = t + k * (p.len + gap);
    const fa = sp.f0 * Math.pow(2, a / 12);
    const fb = sp.f0 * Math.pow(2, b / 12);
    saw.frequency.setValueAtTime(fa, ts);
    if (fb !== fa) saw.frequency.exponentialRampToValueAtTime(fb, ts + p.len);
    // A slight accent on the last syllable reads as the punchline.
    const pk = peak * (k === syl.length - 1 ? 1 : 0.85);
    env.gain.setValueAtTime(0, ts);
    env.gain.linearRampToValueAtTime(pk, ts + 0.008);
    env.gain.setValueAtTime(pk, ts + Math.max(0.01, p.len - 0.04));
    env.gain.linearRampToValueAtTime(0, ts + p.len);
  });
  vo.finish(t + total + 0.05);
}
