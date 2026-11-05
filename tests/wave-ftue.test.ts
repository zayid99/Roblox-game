import { describe, expect, it } from 'vitest';
import { WAVE, WAVE_CREST } from '../src/game/config';
import { WaveSim } from '../src/game/wave';

const DT = 1 / 60;

function finishSurge(w: WaveSim) {
  w.forceSurge();
  const c = w.count;
  while (w.count === c) w.update(DT);
}

describe('wave controls (FTUE)', () => {
  it('freeze stops the countdown; unfreezing resumes it', () => {
    const w = new WaveSim(-300);
    w.frozen = true;
    for (let i = 0; i < 600; i++) w.update(DT);
    expect(w.timer).toBe(WAVE.firstInterval);
    expect(w.phase).toBe('calm');
    w.frozen = false;
    w.update(1);
    expect(w.timer).toBeCloseTo(WAVE.firstInterval - 1);
  });

  it('setTimer sets the countdown and the duration', () => {
    const w = new WaveSim(-300);
    w.setTimer(60);
    expect(w.timer).toBe(60);
    expect(w.duration).toBe(60);
    w.setTimer(5);
    w.update(DT);
    expect(w.phase).toBe('warning');
    expect(w.events).toContain('warning');
    w.setTimer(30);
    expect(w.phase).toBe('calm');
  });

  it('capTimer only lowers', () => {
    const w = new WaveSim(-300);
    w.setTimer(60);
    w.capTimer(30);
    expect(w.timer).toBe(30);
    expect(w.duration).toBe(60);
    w.capTimer(45);
    expect(w.timer).toBe(30);
  });

  it('forceGoldenNext makes the next wave golden, even mid-surge', () => {
    const w = new WaveSim(-100);
    expect(w.golden).toBe(false);
    w.forceGoldenNext();
    expect(w.golden).toBe(true);
    finishSurge(w);
    expect(w.golden).toBe(false);
    w.forceSurge();
    w.update(DT);
    expect(w.phase).toBe('surge');
    w.forceGoldenNext();
    expect(w.golden).toBe(false);
    while (w.phase === 'surge') w.update(DT);
    expect(w.golden).toBe(true);
  });

  it('every 5th wave is Big: faster and higher', () => {
    const w = new WaveSim(-100);
    const bigs: boolean[] = [];
    const numbers: number[] = [];
    for (let i = 0; i < 10; i++) {
      bigs.push(w.big);
      numbers.push(w.number);
      if (w.big) {
        expect(w.speed).toBe(52);
        expect(w.crest).toBe(12);
      } else {
        expect(w.speed).toBe(42);
        expect(w.crest).toBe(WAVE_CREST);
      }
      finishSurge(w);
    }
    expect(numbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(bigs).toEqual([false, false, false, false, true, false, false, false, false, true]);
  });

  it('a Big Wave hits at 11 m, a normal one does not', () => {
    const w = new WaveSim(-300);
    w.count = 4; // wave #5
    w.forceSurge();
    w.update(DT);
    w.frontZ = -100;
    expect(w.hits(11, -102)).toBe(true);
    expect(w.hits(12.5, -102)).toBe(false);
    const n = new WaveSim(-300);
    n.forceSurge();
    n.update(DT);
    n.frontZ = -100;
    expect(n.hits(11, -102)).toBe(false);
  });
});
