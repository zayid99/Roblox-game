// Song data of §8.3: chord voicings, Song 1 "Lagoon Loop" (form + hand-written lead), hurry / surge / phew, patterns.

export type ChordName = 'F' | 'C' | 'C7' | 'Dm' | 'Bb' | 'Gm' | 'Am' | 'A7' | 'G';

const NOTE_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** 'C4' → 60, 'Bb4' → 70, 'C#4' → 61. */
export function note(name: string): number {
  const m = /^([A-G])(b|#)?(-?\d)$/.exec(name);
  if (!m) throw new Error(`bad note ${name}`);
  const acc = m[2] === 'b' ? -1 : m[2] === '#' ? 1 : 0;
  return 12 * (Number(m[3]) + 1) + NOTE_PC[m[1]] + acc;
}

export interface Chord {
  /** Close voicing for pluck, pad and marimba (midi). */
  voicing: number[];
  root: number;
  fifth: number;
}

const chord = (v: string, root: string, fifth: string): Chord => ({
  voicing: v.split(' ').map(note),
  root: note(root),
  fifth: note(fifth),
});

export const CHORDS: Record<ChordName, Chord> = {
  F: chord('C4 F4 A4 C5', 'F2', 'C3'),
  C: chord('C4 E4 G4 C5', 'C3', 'G2'),
  C7: chord('C4 E4 G4 Bb4', 'C3', 'G2'),
  Dm: chord('D4 F4 A4 D5', 'D2', 'A2'),
  Bb: chord('D4 F4 Bb4 D5', 'Bb2', 'F2'),
  Gm: chord('D4 G4 Bb4 D5', 'G2', 'D3'),
  Am: chord('C4 E4 A4 C5', 'A2', 'E2'),
  A7: chord('C#4 E4 G4 A4', 'A2', 'E2'),
  G: chord('D4 G4 B4 D5', 'G2', 'D3'),
};

export interface LeadNote {
  step: number;
  midi: number;
  len: number;
}

/** Parse 'step:note:len, ...' (len in 16ths). */
export function bar(spec: string): LeadNote[] {
  return spec.split(',').map((s) => {
    const [step, n, len] = s.trim().split(':');
    return { step: Number(step), midi: note(n), len: Number(len) };
  });
}

export type SectionTag = 'A' | 'B' | 'A2';

export interface SongDef {
  name: string;
  bpm: number;
  swing: number;
  /** 32 chords, one per bar. */
  form: ChordName[];
  tags: SectionTag[];
  /** Lead per bar; null = no lead (B sections play the marimba arpeggio). */
  lead: (LeadNote[] | null)[];
}

// The hook. Hand-written (§8.3 table); A'' bar 8 resolves to F with a pickup back into bar 1.
const A_LEAD: LeadNote[][] = [
  bar('0:C5:3, 3:A4:3, 6:F4:2, 8:G4:2, 10:A4:4, 14:C5:2'),
  bar('0:D5:3, 3:C5:3, 6:G4:2, 8:C5:6'),
  bar('0:D5:2, 2:F5:2, 4:D5:2, 6:C5:2, 8:A4:4, 12:C5:2, 14:D5:2'),
  bar('0:F5:6, 6:D5:2, 8:Bb4:8'),
  bar('0:C5:3, 3:A4:3, 6:F4:2, 8:G4:2, 10:A4:4, 14:C5:2'),
  bar('0:D5:3, 3:C5:3, 6:E5:2, 8:G5:6'),
  bar('0:F5:3, 3:D5:3, 6:Bb4:2, 8:C5:4, 12:D5:4'),
  bar('0:C5:8, 10:G4:2, 12:A4:2, 14:Bb4:2'),
];
const A2_LAST = bar('0:F5:6, 6:C5:2, 8:A4:2, 10:F4:2, 12:G4:2, 14:A4:2');

const form1: ChordName[] = [
  ...(['F', 'C', 'Dm', 'Bb', 'F', 'C', 'Bb', 'C'] as const),
  ...(['F', 'C', 'Dm', 'Bb', 'F', 'C', 'Bb', 'C'] as const),
  ...(['Bb', 'F', 'Gm', 'C', 'Bb', 'F', 'Gm', 'C7'] as const),
  ...(['F', 'C', 'Dm', 'Bb', 'F', 'C', 'Bb', 'F'] as const),
];

export const SONG1: SongDef = {
  name: 'Lagoon Loop',
  bpm: 112,
  swing: 0.56,
  form: form1,
  tags: [...Array(8).fill('A'), ...Array(8).fill('A'), ...Array(8).fill('B'), ...Array(8).fill('A2')] as SectionTag[],
  lead: [...A_LEAD, ...A_LEAD, ...Array<null>(8).fill(null), ...A_LEAD.slice(0, 7), A2_LAST],
};

/** Cycle transposition: F, G, Eb. */
export const CYCLE_TRANSPOSE = [0, 2, -2];

export const HURRY = { bpm: 124, chords: ['Dm', 'C', 'Bb', 'A7'] as ChordName[] };
export const SURGE = { bpm: 128, chords: ['Dm', 'Bb', 'C', 'A7'] as ChordName[] };
export const PHEW = { bpm: 112, arp: ['F4', 'A4', 'C5', 'F5'].map(note) };

const x4 = (a: number[]): number[] => [...a, ...a, ...a, ...a];
const x2 = (a: number[]): number[] => [...a, ...a];

export const PAT = {
  calmKick: [0.8, 0, 0, 0, 0, 0, 0, 0, 0.55, 0, 0, 0, 0, 0, 0, 0],
  calmShaker: x4([0.5, 0.2, 0.35, 0.2]),
  calmWood: [0, 0, 0, 0, 0.35, 0, 0, 0, 0, 0, 0, 0, 0.35, 0, 0, 0],
  /** step → 'r' root, 'f' fifth, 'o' octave. Calypso 3-3-2, two 16ths long. */
  calmBass: { 0: 'r', 3: 'r', 6: 'f', 8: 'r', 11: 'o', 14: 'f' } as Record<number, 'r' | 'f' | 'o'>,
  calmSkank: [0, 0, 0.7, 0, 0, 0, 0.6, 0, 0, 0, 0.7, 0, 0, 0, 0.6, 0],
  buildHats: x4([0, 0, 0.5, 0]),
  buildCongaHi: [0, 0, 0, 0.6, 0, 0, 0, 0.5, 0, 0, 0, 0.6, 0, 0, 0.4, 0.5],
  buildCongaLo: x2([0, 0, 0, 0, 0, 0, 0.7, 0]),
  /** Not in the spec table: a light calm agogo (hi on beats, lo on the "and-a"). */
  calmAgogo: [0.5, 0, 0, 0.3, 0, 0, 0, 0, 0.4, 0, 0.3, 0, 0, 0, 0, 0],
  hurryKick: x2([0.9, 0, 0, 0, 0.8, 0, 0, 0]),
  hurryClap: x2([0, 0, 0, 0, 0.7, 0, 0, 0]),
  hurryHats: x4([0.5, 0.25, 0.35, 0.25]),
  /** 8ths: r r o r r r o r */
  hurryBass8: ['r', 'r', 'o', 'r', 'r', 'r', 'o', 'r'] as ('r' | 'o')[],
  hurryStabs: x4([0, 0, 0.6, 0.4]),
  hurryAccents: [0, 3, 6, 8, 11, 14],
  /** Index into the 4 chord tones for the 16th arpeggio. */
  hurryArp: [0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 2, 1, 3, 2, 1, 2],
  /** Marimba 8th arpeggio in B sections. */
  bArp: [0, 1, 2, 3, 2, 1, 0, 1],
};

/** F-major pentatonic used by musical SFX: F4 G4 A4 C5 D5 F5 G5 A5 C6. */
export const PENTA = [65, 67, 69, 72, 74, 77, 79, 81, 84];

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
