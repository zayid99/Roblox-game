import { describe, expect, it } from 'vitest';
import { DprController, FrameCap, tierForDevice, type DeviceHints } from '../src/render/quality';

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

describe('starting tier and same-session downgrade', () => {
  const dev = (o: Partial<DeviceHints>): DeviceHints => ({ coarse: false, memoryGb: 8, cores: 8, gpu: '', userAgent: 'Mozilla/5.0 (Windows NT 10.0)', ...o });

  it('starts High only on a clearly strong desktop GPU', () => {
    expect(tierForDevice(dev({ gpu: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0)' }))).toBe('high');
    expect(tierForDevice(dev({ gpu: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)' }))).toBe('high');
    expect(tierForDevice(dev({ gpu: 'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0)' }))).toBe('medium');
    expect(tierForDevice(dev({ gpu: '' }))).toBe('medium');
    // A strong GPU name on a machine with little memory or few cores is not trusted.
    expect(tierForDevice(dev({ gpu: 'NVIDIA GeForce GT 710', memoryGb: 4 }))).toBe('medium');
  });

  it('starts Low on weak machines: Chromebooks with 4 GB, 2 cores, software rendering', () => {
    expect(tierForDevice(dev({ userAgent: 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0)', memoryGb: 4, cores: 4 }))).toBe('low');
    expect(tierForDevice(dev({ userAgent: 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0)', memoryGb: 8, cores: 8 }))).toBe('medium');
    expect(tierForDevice(dev({ cores: 2 }))).toBe('low');
    expect(tierForDevice(dev({ memoryGb: 2 }))).toBe('low');
    expect(tierForDevice(dev({ gpu: 'Google SwiftShader' }))).toBe('low');
  });

  it('starts phones on Medium, budget phones on Low, and works with unknown hints', () => {
    expect(tierForDevice(dev({ coarse: true, memoryGb: 8, cores: 8 }))).toBe('medium');
    expect(tierForDevice(dev({ coarse: true, memoryGb: 3, cores: 8 }))).toBe('low');
    expect(tierForDevice(dev({ coarse: true, memoryGb: null, cores: 4 }))).toBe('low');
    expect(tierForDevice(dev({ coarse: true, memoryGb: null, cores: null }))).toBe('medium'); // iOS Safari reports neither
    expect(tierForDevice(dev({ memoryGb: null, cores: null }))).toBe('medium');
  });

  const run = (c: DprController, ms: number, seconds: number) => {
    for (let i = 0; i < Math.round((seconds * 1000) / ms); i++) c.sample(ms, ms / 1000);
  };

  it('asks for a lower tier within seconds when frames stay under 30 fps', () => {
    const c = new DprController(1, 'high', true);
    run(c, 45, 3.9);
    expect(c.pendingTier).toBeNull();
    run(c, 45, 2.2);
    expect(c.pendingTier).toBe('medium');
    c.reset(1, 'medium');
    expect(c.pendingTier).toBeNull();
    run(c, 45, 6.5);
    expect(c.pendingTier).toBe('low');
    c.reset(1, 'low');
    run(c, 45, 12);
    expect(c.pendingTier).toBeNull(); // nothing below Low
  });

  it('asks for a lower tier when the lowest resolution still misses 50 fps, and never on a smooth machine', () => {
    const c = new DprController(1, 'medium', true);
    run(c, 24, 9); // 1 -> .75 after 2 s, then 4+ s at the floor
    expect(c.dpr).toBe(0.75);
    expect(c.pendingTier).toBe('low');
    const ok = new DprController(1, 'high', true);
    run(ok, 1000 / 60, 60);
    expect(ok.pendingTier).toBeNull();
    const manual = new DprController(1, 'high', false); // a tier the player picked is never overridden
    run(manual, 45, 20);
    expect(manual.pendingTier).toBeNull();
  });
});
