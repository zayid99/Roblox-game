import { describe, expect, it } from 'vitest';
import { DprController, FrameCap } from '../src/render/quality';

/** Renders over `frames` rAF ticks at `hz` with a cap, returning how many rendered. */
function rendered(hz: number, capMs: number, frames: number): number {
  const cap = new FrameCap();
  let n = 0;
  for (let i = 0; i < frames; i++) if (cap.ready(1000 + (i * 1000) / hz, capMs)) n++;
  return n;
}

describe('FrameCap (§6.1 render cap)', () => {
  it('renders every frame of a 60 Hz screen under the 15 ms cap', () => {
    expect(rendered(60, 15, 600)).toBe(600);
  });

  it('renders 120 Hz at an even 60 fps and never drops 90 Hz to 45', () => {
    expect(rendered(120, 15, 1200)).toBe(600); // 10 s
    expect(rendered(90, 15, 900)).toBe(900);
  });

  it('tolerates rAF jitter at 60 Hz', () => {
    const cap = new FrameCap();
    let n = 0;
    for (let i = 0; i < 600; i++) if (cap.ready(1000 + i * 16.667 + (i % 2 ? 1.5 : -1.5), 15)) n++;
    expect(n).toBe(600);
  });

  it('does not cap with 0', () => {
    expect(rendered(144, 0, 144)).toBe(144);
  });
});

describe('DprController', () => {
  const run = (c: DprController, ms: number, seconds: number) => {
    const frames = Math.round((seconds * 1000) / ms);
    let changes = 0;
    for (let i = 0; i < frames; i++) if (c.sample(ms, ms / 1000)) changes++;
    return changes;
  };

  it('drops on slow frames and climbs back at a steady 60 Hz', () => {
    const c = new DprController(1.5, 'high', true);
    run(c, 30, 5);
    expect(c.dpr).toBeLessThan(1.5);
    run(c, 1000 / 60, 40);
    expect(c.dpr).toBe(1.5);
  });

  it('backs off when a raise does not hold', () => {
    // Durations are whole 2 s windows (the controller averages per window).
    const c = new DprController(1.25, 'medium', true);
    run(c, 30, 2.01); // 1.25 → 1.0
    expect(c.dpr).toBe(1);
    run(c, 1000 / 60, 8.1); // raise after 6 s of keeping up
    expect(c.dpr).toBe(1.25);
    run(c, 30, 2.01); // drops again soon after → the next raise waits 12 s
    expect(c.dpr).toBe(1);
    run(c, 1000 / 60, 9);
    expect(c.dpr).toBe(1);
    run(c, 1000 / 60, 5);
    expect(c.dpr).toBe(1.25);
  });
});
