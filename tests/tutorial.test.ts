import { describe, expect, it } from 'vitest';
import { WAVE } from '../src/game/config';
import { NO_INPUT, type PlayerInput } from '../src/game/player';
import { GameState } from '../src/game/state';
import type { PromptSpec, TutorialFrame } from '../src/contracts';
import { allCopyStrings, COPY } from '../src/tutorial/copy';
import { FtueLog, FTUE_LOG_KEY } from '../src/tutorial/debugLog';
import { ASSIST } from '../src/tutorial/steps';
import { FtueHarness, playFtue, runFtueBot } from './tutorialBot';

const EMOJI = /\p{Extended_Pictographic}/u;
const grants = (h: FtueHarness) => h.commands.filter((c) => c.type === 'grant');

function promptTexts(p: PromptSpec | null): string[] {
  if (!p) return [];
  return [p.headline, p.sub ?? '', p.chip?.text ?? '', p.stamp ?? ''];
}

describe('FTUE bot (§7.5)', () => {
  it('finishes the FTUE within 150 s of sim time (keyboard)', () => {
    const r = runFtueBot({ device: 'keyboard' });
    expect(r.done).toBe(true);
    expect(r.simTime).toBeLessThan(150);
    const h = r.harness;
    expect(Object.keys(h.stepAt)).toEqual(['grab', 'release', 'collect', 'home', 'earn', 'shop', 'wave', 'ready']);
    // §7.1 targets for a competent player.
    expect(h.stepAt.collect!).toBeLessThan(13);
    expect(h.stepAt.earn!).toBeLessThan(45);
    expect(h.state.ftue).toMatchObject({ done: true, skipped: false });
    expect(h.state.levels.reach).toBe(1);
  });

  it('finishes on touch too', () => {
    const r = runFtueBot({ device: 'touch', rngSeed: 11 });
    expect(r.done).toBe(true);
    expect(r.simTime).toBeLessThan(150);
  });

  it('interrupted shop: the wave comes first, the shop resumes after surgeEnd, then ready', () => {
    const r = runFtueBot({ interruptShop: true });
    expect(r.done).toBe(true);
    expect(r.simTime).toBeLessThan(150);
    const h = r.harness;
    const warnAt = h.simEvents.findIndex((e) => e.type === 'waveWarning');
    const endAt = h.simEvents.findIndex((e) => e.type === 'surgeEnd');
    expect(warnAt).toBeGreaterThan(0);
    expect(endAt).toBeGreaterThan(warnAt);
    expect(h.stepAt.wave!).toBeGreaterThan(h.stepAt.shop!);
    expect(h.state.levels.reach).toBe(1);
    expect(h.state.ftue.rewarded).toEqual(expect.arrayContaining(['V1', 'V2', 'V4', 'V5', 'V6']));
  });

  it('pays each step reward exactly once and Progression never double-pays quests 1-6', () => {
    const r = runFtueBot();
    const h = r.harness;
    const g = grants(h);
    const sources = g.map((c) => (c.type === 'grant' ? c.source : ''));
    expect(sources).toEqual(['ftue:grab', 'ftue:release', 'ftue:home', 'ftue:shop', 'ftue:wave']);
    const cash = g.map((c) => (c.type === 'grant' ? c.reward.cash : 0));
    expect(cash.slice(0, 4)).toEqual([20, 20, 50, 40]);
    expect(cash[4]).toBeGreaterThanOrEqual(50);
    for (const e of h.progressEvents) {
      if (e.type === 'questDone' && e.index <= 6) expect(e.reward).toEqual({});
    }
    expect(h.state.voyage.step).toBeGreaterThanOrEqual(6);
  });

  it('wave rules: frozen in steps 1-3, timer 60 at home, capped at 30, practice wave until the first surgeEnd', () => {
    const seen: Record<string, TutorialFrame['sim'][]> = {};
    const r = runFtueBot({
      onFrame: (tf) => {
        if (tf.step) (seen[tf.step] ??= []).push(tf.sim);
      },
    });
    for (const s of ['grab', 'release', 'collect'] as const) expect(seen[s].every((o) => o.waveFrozen)).toBe(true);
    for (const s of ['home', 'earn', 'shop'] as const) expect(seen[s].every((o) => !o.waveFrozen && o.practiceWave)).toBe(true);
    expect(seen.ready.every((o) => !o.practiceWave)).toBe(true);
    const timers = r.harness.commands.filter((c) => c.type === 'setWaveTimer');
    expect(timers).toEqual([
      { type: 'setWaveTimer', seconds: 60, mode: 'set' },
      { type: 'setWaveTimer', seconds: 30, mode: 'cap' },
    ]);
  });

  it('never shows a prompt while its banner is up, and the pill copy has no emoji', () => {
    let bannerUntil = -1;
    let seenBanners = 0;
    const texts = new Set<string>();
    runFtueBot({
      interruptShop: true,
      onFrame: (tf, h) => {
        while (seenBanners < h.banners.length) {
          const b = h.banners[seenBanners++];
          bannerUntil = Math.max(bannerUntil, b.at + (b.spec.ms ?? 2000) / 1000 - 1e-6);
        }
        if (h.realTime < bannerUntil) expect(tf.prompt).toBeNull();
        for (const t of promptTexts(tf.prompt)) texts.add(t);
      },
    });
    expect(seenBanners).toBeGreaterThanOrEqual(4); // earn, shop reward, survived, ready
    for (const t of texts) expect(EMOJI.test(t)).toBe(false);
  });

  it('shop step: rail spotlight after 3 s, focus and spotlight on Rope Reach while the Shop is open, then closePanel', () => {
    let focused = false;
    let railSpot = false;
    const r = runFtueBot({
      interruptShop: true,
      onFrame: (tf) => {
        if (tf.focus) {
          expect(tf.focus).toEqual({ panel: 'shop', tab: 'upgrades', rowKey: 'reach', note: COPY.focusNote, sub: COPY.focusSub, dimOthers: true });
          expect(tf.spotlight).toBe('shop:buy:reach');
          focused = true;
        }
        if (tf.spotlight === 'rail:shop') railSpot = true;
      },
    });
    expect(focused).toBe(true);
    expect(railSpot).toBe(true);
    expect(r.harness.commands.some((c) => c.type === 'closePanel')).toBe(true);
    expect(r.harness.panel).toBeNull();
  });
});

describe('wave step prompt (§7.2 step 7)', () => {
  it("says YOU'RE SAFE (no ETA chip) when the meter does, WAVE. GET SAFE. with an ETA chip when not", () => {
    const seen: { id: string; safe: boolean; chip: boolean }[] = [];
    runFtueBot({
      onFrame: (tf, h) => {
        const id = tf.prompt?.id;
        if (id === 'wave:warn' || id === 'wave:safe') seen.push({ id, safe: h.sim.playerSafe(), chip: !!tf.prompt?.chip });
      },
    });
    // The bot waits at home: the pill must agree with the meter.
    expect(seen.length).toBeGreaterThan(0);
    for (const s of seen) expect(s.id).toBe(s.safe ? 'wave:safe' : 'wave:warn');
    expect(seen.some((s) => s.id === 'wave:safe')).toBe(true);
    expect(seen.filter((s) => s.id === 'wave:safe').every((s) => !s.chip)).toBe(true);

    // On an island during the warning: GET SAFE with the ETA chip.
    const state = new GameState();
    state.ftue.step = 'wave';
    const h = new FtueHarness({ state });
    h.frame(1 / 60, NO_INPUT);
    const isl = h.sim.course.islands[1];
    h.sim.player.reset(isl.checkpoint.clone());
    h.sim.wave.setTimer(5);
    let f = h.frame(1 / 60, NO_INPUT);
    for (let t = 0; t < 3 && f.prompt?.id !== 'wave:warn'; t += 1 / 60) f = h.frame(1 / 60, NO_INPUT);
    expect(h.sim.wave.phase).toBe('warning');
    expect(f.prompt).toMatchObject({ id: 'wave:warn', headline: COPY.waveWarn.headline });
    expect(f.prompt?.chip).toBeDefined();
  });
});

describe('release timing assist (§7.3)', () => {
  /** Grabs the gap-1 hook and never lets go: the window opens on each upswing. */
  function holdForever(seconds: number, h = new FtueHarness()) {
    const frames: TutorialFrame[] = [];
    const input: PlayerInput = { moveX: 0, moveZ: -1, jumpHeld: false, jumpPressed: false };
    let jumped = false;
    for (let t = 0; t < seconds; t += 1 / 60) {
      const p = h.sim.player;
      input.jumpPressed = false;
      if (p.mode === 'ground' && p.pos.z < 2.5 && !jumped) {
        input.jumpPressed = true;
        jumped = true;
      }
      input.jumpHeld = jumped;
      input.moveZ = p.mode === 'swing' ? 0 : -1;
      frames.push(h.frame(1 / 60, input));
    }
    return { h, frames };
  }

  it('slows to 0.25x on swing 1 and never holds the slow-mo longer than 1200 ms real', () => {
    const { frames } = holdForever(12);
    let run = 0;
    let longest = 0;
    let min = 1;
    let windows = 0;
    let prevLetGo = false;
    for (const f of frames) {
      min = Math.min(min, f.timeScale);
      run = f.timeScale < 1 ? run + 1 / 60 : 0;
      longest = Math.max(longest, run);
      const letGo = f.prompt?.id === 'letGo';
      if (letGo && !prevLetGo) windows++;
      prevLetGo = letGo;
    }
    expect(min).toBeCloseTo(0.25, 5);
    expect(windows).toBeGreaterThanOrEqual(1);
    // 1200 ms hold plus the 100 ms ease-out (and one 20 Hz evaluation step).
    expect(longest).toBeLessThanOrEqual((ASSIST.maxHoldMs + ASSIST.easeOutMs + 1000 / ASSIST.hz) / 1000 + 1 / 60);
  });

  it('shows the green landing arc and the LET GO label inside the window; AGAIN when the window passes', () => {
    const { frames } = holdForever(12);
    const inWin = frames.filter((f) => f.prompt?.id === 'letGo');
    expect(inWin.length).toBeGreaterThan(0);
    for (const f of inWin) {
      expect(f.jumpLabel).toBe('LET GO');
      expect(f.guides.landingArc?.ok).toBe(true);
      expect(f.guides.landingArc?.points.length).toBe(ASSIST.arcPoints);
      expect(f.prompt?.size).toBe('big');
      expect(f.musicLowpass || f.timeScale === 1).toBe(true);
    }
    expect(frames.some((f) => f.prompt?.id === 'fail:again' && f.prompt.fail)).toBe(true);
  });

  it('swing 2 (the return trip) uses 0.5x', () => {
    let minHome = 1;
    runFtueBot({
      onFrame: (tf) => {
        if (tf.step === 'home') minHome = Math.min(minHome, tf.timeScale);
      },
    });
    // The bot lets go at once, so the ease-in may not reach the floor; it must never go below 0.5.
    expect(minHome).toBeGreaterThanOrEqual(0.5 - 1e-9);
    expect(minHome).toBeLessThan(1);
  });

  it('struggle assist after the FTUE: 3 sea falls on one gap re-enable the arc and 0.5x', () => {
    const state = new GameState();
    state.ftue.done = true;
    const h = new FtueHarness({ state });
    // Three falls from home without holding.
    let falls = 0;
    const input: PlayerInput = { moveX: 0, moveZ: -1, jumpHeld: false, jumpPressed: false };
    for (let t = 0; t < 30 && falls < 3; t += 1 / 60) {
      const p = h.sim.player;
      input.jumpPressed = p.mode === 'ground' && p.pos.z < 2.5;
      h.frame(1 / 60, input);
      falls = h.simEvents.filter((e) => e.type === 'player' && e.event === 'sea').length;
    }
    expect(falls).toBe(3);
    const { frames } = holdForever(10, h);
    expect(frames.every((f) => !f.active)).toBe(true);
    expect(frames.some((f) => f.guides.landingArc !== null)).toBe(true);
    expect(Math.min(...frames.map((f) => f.timeScale))).toBeCloseTo(0.5, 5);
  });
});

describe('prompts per device and failures', () => {
  it('glyphs follow the last input device', () => {
    const h = new FtueHarness({ device: 'keyboard' });
    let f = h.frame(1 / 60, NO_INPUT);
    expect(f.prompt).toMatchObject({ id: 'grab', headline: COPY.grabDesktop.headline, glyph: 'spaceHold' });
    h.device = 'touch';
    f = h.frame(1 / 60, NO_INPUT);
    expect(f.prompt).toMatchObject({ id: 'grab', headline: COPY.grabTouch.headline, glyph: 'thumbHold' });
    // No movement for 2 s: the joystick ghost / WASD joins.
    for (let i = 0; i < 130; i++) f = h.frame(1 / 60, NO_INPUT);
    expect(f.prompt?.glyph).toBe('thumbDrag');
    h.device = 'mouse';
    f = h.frame(1 / 60, NO_INPUT);
    expect(f.prompt?.glyph).toBe('wasd');
  });

  it('HUD: wave meter always visible, cash hidden until the first reward, skip link shown', () => {
    const h = new FtueHarness();
    const f = h.frame(1 / 60, NO_INPUT);
    expect(f.hide).toMatchObject({ cash: true, rail: true, course: true, tracker: true, pearls: true });
    expect(f.hide.wave).toBeFalsy();
    expect(f.hide.carry).toBeFalsy();
    expect(f.skipVisible).toBe(true);
    expect(f.guides.ring?.label).toBe(COPY.jumpHere);
    expect(f.guides.hookTag?.text).toBe(COPY.hookTag);
  });

  it('jumping without holding into the sea shows HOLD IT (fail variant)', () => {
    const h = new FtueHarness();
    const input: PlayerInput = { moveX: 0, moveZ: -1, jumpHeld: false, jumpPressed: false };
    let fail: PromptSpec | null = null;
    for (let t = 0; t < 6 && !fail; t += 1 / 60) {
      input.jumpPressed = h.sim.player.mode === 'ground' && h.sim.player.pos.z < 2.5;
      const f = h.frame(1 / 60, input);
      if (f.prompt?.fail) fail = f.prompt;
    }
    expect(fail).toMatchObject({ id: 'fail:hold', headline: COPY.grabFailDesktop.headline, sub: COPY.grabFailDesktop.sub, fail: true, glyph: 'spaceHold' });
  });

  it('walking off the edge without jumping says JUMP AT THE EDGE, not HOLD IT', () => {
    for (const device of ['keyboard', 'touch'] as const) {
      const h = new FtueHarness({ device });
      const input: PlayerInput = { moveX: 0, moveZ: -1, jumpHeld: false, jumpPressed: false };
      let fail: PromptSpec | null = null;
      for (let t = 0; t < 6 && !fail; t += 1 / 60) {
        const f = h.frame(1 / 60, input);
        if (f.prompt?.fail) fail = f.prompt;
      }
      const line = device === 'touch' ? COPY.jumpFail : COPY.jumpFailDesktop;
      expect(fail).toMatchObject({ id: 'fail:jump', headline: line.headline, sub: line.sub, fail: true });
      // After the respawn, a real jump without holding is a HOLD IT again.
      while (h.sim.seaRespawnTime > 0 || h.sim.player.mode !== 'ground') h.frame(1 / 60, { ...input, moveZ: 0 });
      fail = null;
      for (let t = 0; t < 8 && fail?.id !== 'fail:hold'; t += 1 / 60) {
        input.jumpPressed = h.sim.player.mode === 'ground' && h.sim.player.pos.z < 2.5;
        const f = h.frame(1 / 60, input);
        if (f.prompt?.fail) fail = f.prompt;
      }
      expect(fail?.id).toBe('fail:hold');
    }
  });

  it('copy has no emoji', () => {
    const all = allCopyStrings();
    expect(all.length).toBeGreaterThan(40);
    for (const s of all) expect(EMOJI.test(s), s).toBe(false);
  });
});

describe('skip, replay, migration', () => {
  it('skip at step 1: done + skipped, pays $20 + $20 + $50 once, unfreezes the wave with >= 45 s, reveals the HUD', () => {
    const h = new FtueHarness();
    h.frame(1 / 60, NO_INPUT);
    h.core.skip();
    const f = h.frame(1 / 60, NO_INPUT);
    expect(h.state.ftue).toMatchObject({ done: true, skipped: true });
    expect(grants(h).map((c) => (c.type === 'grant' ? c.reward.cash : 0))).toEqual([20, 20, 50]);
    expect(h.state.cash).toBeGreaterThanOrEqual(90);
    expect(h.state.ftue.rewarded).toEqual(['V1', 'V2', 'V4']);
    expect(h.commands).toContainEqual({ type: 'setWaveTimer', seconds: WAVE.firstInterval, mode: 'set' });
    expect(f).toMatchObject({ active: false, step: null, prompt: null, skipVisible: false, hide: {}, sim: { waveFrozen: false, practiceWave: false } });
    expect(h.core.effects.some((e) => e.type === 'finished') || h.effects.some((e) => e.type === 'finished')).toBe(true);
    h.core.skip();
    h.frame(1 / 60, NO_INPUT);
    expect(grants(h).length).toBe(3);
  });

  it('skip mid-way pays only what was not received; the timer is max(remaining, 45)', () => {
    const r = runFtueBot({
      onFrame: (tf, h) => {
        if (tf.step === 'shop' && h.core.active) h.core.skip();
      },
    });
    const h = r.harness;
    expect(h.state.ftue.skipped).toBe(true);
    expect(grants(h).map((c) => (c.type === 'grant' ? c.source : ''))).toEqual(['ftue:grab', 'ftue:release', 'ftue:home']);
    const last = h.commands.filter((c) => c.type === 'setWaveTimer').pop();
    expect(last).toMatchObject({ mode: 'set' });
    expect(last && last.type === 'setWaveTimer' && last.seconds).toBeGreaterThanOrEqual(45);
  });

  it('replay restarts at grab from the FTUE spawn and pays nothing twice', () => {
    const first = runFtueBot();
    const h = first.harness;
    const paid = grants(h).length;
    const cashBefore = h.state.cash;
    h.core.replay();
    const f = h.frame(1 / 60, NO_INPUT);
    expect(f).toMatchObject({ active: true, step: 'grab' });
    expect(h.state.ftue).toMatchObject({ done: false, step: 'grab' });
    expect(h.commands).toContainEqual({ type: 'respawnFtue' });
    expect(h.sim.player.pos.distanceTo(h.sim.course.ftueSpawn)).toBeLessThan(0.5);
    const again = playFtue(h);
    expect(again.done).toBe(true);
    expect(grants(h).length).toBe(paid);
    expect(h.state.cash).toBeGreaterThan(cashBefore - 200); // only income and the second reach level moved it
  });

  it('migration: v1 players with delivered || bought skip the FTUE; a v1 player who only swung gets it', () => {
    for (const flags of [{ delivered: true }, { bought: true }]) {
      const state = new GameState();
      state.load({ v: 1, cash: 10, totalEarned: 10, rebirths: 0, levels: {}, base: [], index: {}, flags, bestZone: 0, savedAt: 1 });
      const h = new FtueHarness({ state });
      const f = h.frame(1 / 60, NO_INPUT);
      expect(state.ftue.done).toBe(true);
      expect(f.active).toBe(false);
    }
    const state = new GameState();
    state.load({ v: 1, cash: 0, totalEarned: 0, rebirths: 0, levels: {}, base: [], index: {}, flags: { swung: true }, bestZone: -1, savedAt: 1 });
    const h = new FtueHarness({ state });
    expect(h.frame(1 / 60, NO_INPUT)).toMatchObject({ active: true, step: 'grab' });
  });

  it('a v2 save with the old flags but no ftue.done is also treated as done', () => {
    const state = new GameState();
    state.flags.delivered = true;
    const h = new FtueHarness({ state });
    expect(h.frame(1 / 60, NO_INPUT).active).toBe(false);
    expect(state.ftue.done).toBe(true);
  });

  it('resuming the interrupted shop step after the wave was survived goes straight to ready after the purchase', () => {
    const state = new GameState();
    state.ftue.step = 'shop';
    state.ftue.rewarded.push('V1', 'V2', 'V4', 'V6');
    state.cash = 500;
    const h = new FtueHarness({ state });
    h.frame(1 / 60, NO_INPUT);
    h.setPanel('shop');
    h.frame(1 / 60, NO_INPUT);
    expect(state.buyMany('reach', 1)).toBe(1);
    h.core.onUi({ type: 'buy', key: 'reach' });
    expect(h.frame(1 / 60, NO_INPUT).step).toBe('ready');
  });

  it('home step with nothing left to deliver goes back to collect (no ping-pong)', () => {
    const state = new GameState();
    state.ftue.step = 'collect';
    const h = new FtueHarness({ state });
    h.frame(1 / 60, NO_INPUT);
    const isl = h.sim.course.islands.find((i) => i.order === 1)!;
    h.sim.player.reset(isl.solid.max.clone().setX((isl.solid.min.x + isl.solid.max.x) / 2).setZ(isl.solid.min.z + 1));
    // Collected one, then the 8 s auto-complete: on to home.
    h.core.onSimEvent({ type: 'collect', creature: { ...h.sim.wild[0] }, isNewSpecies: true, isNewMutation: true }, h.sim);
    state.carried = [{ speciesId: 'toastopus', mutation: 0 }];
    for (let t = 0; t < 9 && h.core.step === 'collect'; t += 1 / 60) h.frame(1 / 60, NO_INPUT);
    expect(h.core.step).toBe('home');
    // A real wave takes them: back to collect, and it stays there (no 8 s auto-complete with empty hands).
    state.carried = [];
    const steps: (string | null)[] = [];
    for (let t = 0; t < 10; t += 1 / 60) steps.push(h.frame(1 / 60, NO_INPUT).step);
    expect(steps.every((s) => s === 'collect')).toBe(true);
    expect(h.commands.filter((c) => c.type === 'setWaveTimer').length).toBe(1);
  });

  it('replay with Rope Reach maxed does not get stuck on BUY ROPE REACH', () => {
    const first = runFtueBot();
    const h = first.harness;
    h.state.levels.reach = 14;
    h.core.replay();
    const again = playFtue(h);
    expect(again.done).toBe(true);
    expect(h.stepAt.shop).toBeDefined();
  });

  it('resumes a saved step where the player can continue', () => {
    const cases = [
      ['release', 'grab'],
      ['home', 'collect'],
      ['earn', 'shop'],
      ['shop', 'shop'],
    ] as const;
    for (const [saved, resumed] of cases) {
      const state = new GameState();
      state.ftue.step = saved;
      const h = new FtueHarness({ state });
      expect(h.frame(1 / 60, NO_INPUT).step).toBe(resumed);
    }
  });
});

describe('FtueLog (§7.5)', () => {
  it('records steps, sea falls and swings and mirrors to storage capped at 20 sessions', () => {
    const store = new Map<string, string>();
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    let t = 0;
    for (let i = 0; i < 22; i++) {
      const log = new FtueLog(storage, () => ++t);
      log.begin(false);
      log.enter('grab');
      log.tick(2, 2);
      log.swing();
      log.seaFall();
      log.enter('release');
      log.hint('again');
      log.tick(1, 0.5);
      log.finish('done');
    }
    const list = JSON.parse(store.get(FTUE_LOG_KEY)!);
    expect(list.length).toBe(20);
    expect(list[19]).toMatchObject({ outcome: 'done', swings: 1, seaFalls: 1, total: 3 });
    expect(list[19].steps).toEqual([
      { step: 'grab', at: 0, dur: 2, simDur: 2, seaFalls: 1, hints: [] },
      { step: 'release', at: 2, dur: 1, simDur: 0.5, seaFalls: 0, hints: ['again'] },
    ]);
  });

  it('the core logs a full run', () => {
    const r = runFtueBot();
    const s = r.harness.core.log.session!;
    expect(s.outcome).toBe('done');
    expect(s.steps.map((x) => x.step)).toEqual(['grab', 'release', 'collect', 'home', 'earn', 'shop', 'wave', 'ready']);
    expect(s.swings).toBeGreaterThanOrEqual(2);
  });
});
