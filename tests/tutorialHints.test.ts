import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { GameSim } from '../src/game/sim';
import { GameState } from '../src/game/state';
import type { FtueStepId, SimEvent, ToastSpec } from '../src/contracts';
import { COPY } from '../src/tutorial/copy';
import { HINT, Hints } from '../src/tutorial/hints';

function setup(device: 'keyboard' | 'touch' = 'keyboard') {
  const state = new GameState();
  state.ftue.done = true;
  const sim = new GameSim(state, { rngSeed: 3 });
  const toasts: ToastSpec[] = [];
  const opened: (string | undefined)[] = [];
  const hints = new Hints({
    toast: (t) => toasts.push(t),
    seen: (id) => state.hintsSeen.includes(id),
    markSeen: (id) => void (state.hintsSeen.includes(id) || state.hintsSeen.push(id)),
    openShop: (tab) => opened.push(tab),
    device: () => device,
  });
  const ctx = { surge: false, toastBusy: false, lastLookAt: 0, ftueStep: null as FtueStepId | null };
  const tick = (sec: number, c = ctx) => {
    let p = null;
    for (let t = 0; t < sec; t += 1 / 60) p = hints.update(1 / 60, sim, state, c);
    return p;
  };
  return { state, sim, hints, toasts, opened, ctx, tick };
}

describe('Hints (§7.4)', () => {
  it('lockedHook: once, near a hook above the reach; tapping opens the Shop', () => {
    const { sim, toasts, opened, tick, state } = setup();
    const locked = sim.course.anchors.find((a) => a.minReach > 9.6)!;
    sim.player.reset(new Vector3(locked.pos.x, locked.pos.y - 8, locked.pos.z + 4));
    tick(0.1);
    expect(toasts.map((t) => t.text)).toEqual([COPY.hints.lockedHook(locked.minReach)]);
    expect(toasts[0]).toMatchObject({ kind: 'warn', icon: 'lock' });
    toasts[0].onTap?.();
    expect(opened).toEqual(['upgrades']);
    tick(1);
    expect(toasts.length).toBe(1);
    expect(state.hintsSeen).toContain('lockedHook');
  });

  it('never during the FTUE, never while another toast shows, never during a surge unless wave-related', () => {
    const { sim, toasts, tick, ctx, hints } = setup();
    const locked = sim.course.anchors.find((a) => a.minReach > 9.6)!;
    sim.player.reset(new Vector3(locked.pos.x, locked.pos.y - 8, locked.pos.z + 4));
    tick(0.5, { ...ctx, ftueStep: 'wave' });
    expect(toasts.length).toBe(0);
    tick(0.5, { ...ctx, toastBusy: true });
    expect(toasts.length).toBe(0);
    tick(0.5, { ...ctx, surge: true });
    expect(toasts.length).toBe(0);
    tick(0.1);
    expect(toasts.length).toBe(1);
    expect(hints.homeArrow).toBe(false);
  });

  it('handsFull: 5 s away from home with full hands, 120 s cooldown, edge arrow home for 5 s', () => {
    const { sim, state, toasts, tick, hints } = setup();
    const isl = sim.course.islands[0];
    sim.player.reset(isl.checkpoint.clone());
    for (let i = 0; i < 20; i++) sim.step(1 / 120, { moveX: 0, moveZ: 0, jumpHeld: false, jumpPressed: false });
    state.carried = [{ speciesId: 'toastopus', mutation: 0 }, { speciesId: 'toastopus', mutation: 0 }];
    state.hintsSeen.push('lockedHook', 'lighthouse', 'goldenNext');
    tick(HINT.handsFullSec - 0.2);
    expect(toasts.length).toBe(0);
    tick(0.4);
    expect(toasts.map((t) => t.text)).toEqual([COPY.hints.handsFull]);
    expect(hints.homeArrow).toBe(true);
    tick(HINT.homeArrowSec + 0.1);
    expect(hints.homeArrow).toBe(false);
    tick(60);
    expect(toasts.length).toBe(1);
    tick(HINT.handsFullCooldownSec);
    expect(toasts.length).toBe(2);
  });

  it('handsFull queued during a surge is dropped if the wave took the creatures (no stale toast)', () => {
    const { sim, state, toasts, tick, ctx, hints } = setup();
    const isl = sim.course.islands[0];
    sim.player.reset(isl.checkpoint.clone());
    for (let i = 0; i < 20; i++) sim.step(1 / 120, { moveX: 0, moveZ: 0, jumpHeld: false, jumpPressed: false });
    state.carried = [{ speciesId: 'toastopus', mutation: 0 }, { speciesId: 'toastopus', mutation: 0 }];
    state.hintsSeen.push('lockedHook', 'lighthouse', 'goldenNext', 'doubleJump');
    tick(HINT.handsFullSec + 0.5, { ...ctx, surge: true });
    expect(toasts.length).toBe(0);
    state.carried = [];
    tick(1);
    expect(toasts.length).toBe(0);
    expect(hints.homeArrow).toBe(false);
    // A later real case still hints (the dropped one did not use up the cooldown).
    state.carried = [{ speciesId: 'toastopus', mutation: 0 }, { speciesId: 'toastopus', mutation: 0 }];
    tick(HINT.handsFullSec + 0.2);
    expect(toasts.map((t) => t.text)).toEqual([COPY.hints.handsFull]);
  });

  it('event hints during the FTUE are neither shown later out of context nor used up', () => {
    const { sim, toasts, tick, ctx, hints, state } = setup();
    state.hintsSeen.push('lockedHook', 'lighthouse', 'goldenNext', 'doubleJump');
    tick(0.1, { ...ctx, ftueStep: 'collect' });
    hints.onSimEvent({ type: 'bounce', buoyId: 1 }, sim);
    tick(1, { ...ctx, ftueStep: 'collect' });
    tick(1);
    expect(toasts.length).toBe(0);
    expect(state.hintsSeen).not.toContain('bounce');
    hints.onSimEvent({ type: 'bounce', buoyId: 1 }, sim);
    tick(0.1);
    expect(toasts.map((t) => t.text)).toEqual([COPY.hints.bounce]);
  });

  it('event hints: bounce, chainIntro, firstMutation, baseFull, seaFalls (3 in a row on one gap)', () => {
    const { sim, toasts, tick, hints, state } = setup();
    state.hintsSeen.push('lockedHook', 'lighthouse', 'goldenNext', 'doubleJump');
    const home = sim.course.home;
    sim.player.groundSolid = home;
    const ev: SimEvent[] = [
      { type: 'bounce', buoyId: 1 },
      { type: 'chain', count: 2 },
      { type: 'chain', count: 3 },
      { type: 'collect', creature: { ...sim.wild[0], mutation: 2 }, isNewSpecies: false, isNewMutation: true },
      { type: 'deliver', result: { placed: [], sold: [{ creature: { speciesId: 'toastopus', mutation: 0 }, cash: 3 }] }, bonusCash: 0, chainMult: 1, tripBest: 0, closeCall: false },
      { type: 'player', event: 'sea' },
      { type: 'player', event: 'sea' },
      { type: 'player', event: 'sea' },
    ];
    for (const e of ev) hints.onSimEvent(e, sim);
    tick(0.01);
    expect(toasts.length).toBe(1); // one toast per update; the rest wait
    tick(1);
    expect(toasts.map((t) => t.text)).toEqual([
      COPY.hints.bounce,
      COPY.hints.chainIntro,
      'DIAMOND. Earns ×4.',
      COPY.hints.baseFull,
      COPY.hints.seaFalls,
    ]);
    for (const e of ev) hints.onSimEvent(e, sim);
    tick(1);
    expect(toasts.length).toBe(5);
  });

  it('doubleJump wording follows the device', () => {
    for (const device of ['keyboard', 'touch'] as const) {
      const { sim, toasts, tick, state } = setup(device);
      state.hintsSeen.push('lockedHook', 'lighthouse', 'goldenNext');
      const isl = sim.course.islands[0];
      sim.player.reset(isl.checkpoint.clone().setY(isl.solid.max.y + 4));
      sim.player.mode = 'air';
      sim.player.vel.set(0, -2, 0);
      tick(0.05);
      expect(toasts[0].text).toBe(device === 'touch' ? COPY.hints.doubleJumpTouch : COPY.hints.doubleJumpDesktop);
    }
  });

  it('rebirthReady: once when affordable, tap opens the REBIRTH tab', () => {
    const { toasts, tick, state, opened } = setup();
    state.hintsSeen.push('lockedHook', 'lighthouse', 'goldenNext');
    state.cash = state.rebirthCost();
    tick(0.1);
    expect(toasts.map((t) => t.text)).toEqual([COPY.hints.rebirthReady]);
    toasts[0].onTap?.();
    expect(opened).toEqual(['rebirth']);
  });

  it('dragToLook: 20 s after the release step with no camera input, shown 4 s; skipped if the player looked', () => {
    const { tick, ctx, state } = setup();
    state.hintsSeen.push('lockedHook', 'lighthouse', 'goldenNext');
    tick(0.1, { ...ctx, ftueStep: 'release' });
    expect(tick(19.5, { ...ctx, ftueStep: 'collect' })).toBeNull();
    const p = tick(0.6, { ...ctx, ftueStep: 'collect' });
    expect(p).toMatchObject({ id: 'dragToLook', headline: COPY.dragToLook.headline, glyph: 'dragLook' });
    expect(tick(3, { ...ctx, ftueStep: 'home' })).not.toBeNull();
    expect(tick(1.2, { ...ctx, ftueStep: 'home' })).toBeNull();

    const b = setup();
    b.tick(0.1, { ...b.ctx, ftueStep: 'release' });
    b.tick(5, { ...b.ctx, ftueStep: 'collect', lastLookAt: 1234 });
    expect(b.tick(30, { ...b.ctx, ftueStep: 'collect', lastLookAt: 1234 })).toBeNull();
    expect(b.state.hintsSeen).toContain('dragToLook');
  });
});
