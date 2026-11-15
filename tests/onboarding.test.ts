// Onboarding fixes from the r1 study: the shop step frees the cursor and opens the Shop by itself, the idle
// start escalates, the Controls card is desktop-only and waits for home, and post-tutorial messages are paced.
import { describe, expect, it } from 'vitest';
import { NO_INPUT } from '../src/game/player';
import { GameState } from '../src/game/state';
import type { ToastSpec } from '../src/contracts';
import { MessagePacer, PACE, type PaceContext } from '../src/tutorial/pacer';
import { TIMING } from '../src/tutorial/steps';
import { FtueHarness, runFtueBot } from './tutorialBot';

function shopStepHarness(device: 'keyboard' | 'touch' = 'keyboard'): FtueHarness {
  const state = new GameState();
  state.ftue.step = 'shop';
  state.ftue.rewarded.push('V1', 'V2', 'V4');
  state.cash = 500;
  return new FtueHarness({ state, device });
}

describe('shop step (r1 F2)', () => {
  it('asks for the cursor until the Shop is open', () => {
    const h = shopStepHarness();
    expect(h.frame(1 / 60, NO_INPUT).needsCursor).toBe(true);
    h.setPanel('shop');
    expect(h.frame(1 / 60, NO_INPUT).needsCursor).toBe(false);
  });

  it('opens the Shop by itself after ~4 s standing on home, and again (later) if closed without buying', () => {
    const h = shopStepHarness();
    let openedAt = -1;
    for (let i = 0; i < 60 * 8 && openedAt < 0; i++) {
      h.frame(1 / 60, NO_INPUT);
      if (h.panel === 'shop') openedAt = h.realTime;
    }
    expect(openedAt).toBeGreaterThan(TIMING.shopAutoOpenMs / 1000 - 0.1);
    expect(openedAt).toBeLessThan(TIMING.shopAutoOpenMs / 1000 + 1);
    expect(h.commands.filter((c) => c.type === 'openPanel')).toEqual([{ type: 'openPanel', kind: 'shop', tab: 'upgrades' }]);
    // Closed without buying: no instant re-open, but a later one.
    h.setPanel(null);
    const closedAt = h.realTime;
    let reopenedAt = -1;
    for (let i = 0; i < 60 * 15 && reopenedAt < 0; i++) {
      h.frame(1 / 60, NO_INPUT);
      if (h.panel === 'shop') reopenedAt = h.realTime;
    }
    expect(reopenedAt - closedAt).toBeGreaterThan(TIMING.shopReopenMs / 1000 - 0.1);
  });

  it('a player who opens the Shop never gets it auto-opened', () => {
    const h = shopStepHarness();
    h.frame(1 / 60, NO_INPUT);
    h.setPanel('shop');
    for (let i = 0; i < 60 * 6; i++) h.frame(1 / 60, NO_INPUT);
    expect(h.commands.some((c) => c.type === 'openPanel')).toBe(false);
  });

  it('the desktop pill says the tile can be clicked', () => {
    const h = shopStepHarness();
    let tf = h.frame(1 / 60, NO_INPUT);
    for (let i = 0; i < 30 && !tf.prompt; i++) tf = h.frame(1 / 60, NO_INPUT);
    expect(tf.prompt?.id).toBe('shop:open');
    expect(tf.prompt?.sub).toMatch(/Click/);
  });
});

describe('idle start (r1 F11)', () => {
  it('escalates after 8 s without moving: big pill, arrow, trail and one camera nudge', () => {
    const h = new FtueHarness({ device: 'touch' });
    let tf = h.frame(1 / 60, NO_INPUT);
    for (let i = 0; i < 60 * 7; i++) tf = h.frame(1 / 60, NO_INPUT);
    expect(tf.prompt?.size).toBe('normal');
    expect(h.effects.some((e) => e.type === 'cameraNudge')).toBe(false);
    for (let i = 0; i < 60 * 2; i++) tf = h.frame(1 / 60, NO_INPUT);
    expect(tf.prompt?.id).toBe('grab');
    expect(tf.prompt?.size).toBe('big');
    expect(tf.guides.arrow).toBeTruthy();
    expect(tf.guides.trail?.length).toBe(2);
    for (let i = 0; i < 60 * 5; i++) h.frame(1 / 60, NO_INPUT);
    expect(h.effects.filter((e) => e.type === 'cameraNudge')).toHaveLength(1);
  });
});

describe('hand-over (r1 F7)', () => {
  it('touch: no Controls card, the tutorial ends right after the banner', () => {
    let card = false;
    const r = runFtueBot({ device: 'touch', rngSeed: 11, onFrame: (tf) => (card ||= tf.controlsCard) });
    expect(r.done).toBe(true);
    expect(card).toBe(false);
  });

  it('desktop: the Controls card shows only while standing on home, and frees the cursor', () => {
    const seen: { onHome: boolean; mode: string; cursor: boolean }[] = [];
    const r = runFtueBot({
      device: 'keyboard',
      onFrame: (tf, h) => {
        if (tf.controlsCard) seen.push({ onHome: h.sim.isOnHome(), mode: h.sim.player.mode, cursor: !!tf.needsCursor });
      },
    });
    expect(r.done).toBe(true);
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((s) => s.onHome && s.cursor && s.mode !== 'swing')).toBe(true);
  });
});

describe('MessagePacer (r1 F7, F9)', () => {
  const makers = {
    free: (): ToastSpec => ({ text: 'gift waiting', kind: 'info' }),
    index: (): ToastSpec => ({ text: 'index new', kind: 'info' }),
  };
  const calm: PaceContext = { calm: true, home: true, freeReady: 0, indexNew: 0 };

  function run(p: MessagePacer, secs: number, ctx: PaceContext, dt = 0.1): { t: number; text: string }[] {
    const out: { t: number; text: string }[] = [];
    for (let t = 0; t < secs; t += dt) {
      const r = p.update(dt, ctx, makers);
      if (r.toast) out.push({ t, text: r.toast.text });
    }
    return out;
  }

  it('releases queued messages one at a time, at least gapSec apart, only when calm', () => {
    const p = new MessagePacer();
    for (const text of ['a', 'b', 'c']) p.push({ text, kind: 'good' });
    expect(run(p, 5, { ...calm, calm: false })).toEqual([]);
    const shown = run(p, 12, calm);
    expect(shown.map((s) => s.text)).toEqual(['a', 'b', 'c']);
    for (let i = 1; i < shown.length; i++) expect(shown[i].t - shown[i - 1].t).toBeGreaterThanOrEqual(PACE.gapSec - 0.11);
    expect(p.pending).toBe(0);
  });

  it('drops a message that went stale while waiting, and duplicates', () => {
    const p = new MessagePacer();
    let ready = true;
    p.push({ text: 'gift', kind: 'info' }, { valid: () => ready });
    p.push({ text: 'gift', kind: 'info' });
    expect(p.pending).toBe(1);
    ready = false;
    expect(run(p, 3, calm)).toEqual([]);
  });

  it('pulses the badge, then sends one gentle reminder at home, then waits out the cooldown', () => {
    const p = new MessagePacer();
    const ctx = { ...calm, freeReady: 1 };
    let r = p.update(PACE.freeNagSec + 0.1, { ...ctx, calm: false }, makers);
    expect(r.nag.free).toBe(true);
    expect(r.toast).toBeNull();
    const shown = run(p, PACE.remindCooldownSec - 10, ctx);
    expect(shown.map((s) => s.text)).toEqual(['gift waiting']);
    r = p.update(0.1, { ...ctx, freeReady: 0 }, makers);
    expect(r.nag.free).toBe(false);
  });
});
