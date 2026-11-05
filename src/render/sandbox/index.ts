/**
 * Dev-only sandbox for the render module: open the game with ?sandbox=render.
 * Params: &shot=home|swing|wave|warning|zone3|creatures|guides|coldopen|volcano  &q=low|medium|high|auto
 *         &auto=0 (keyboard only: WASD/arrows + Space, drag to look)  &rm=1 (reduce motion)
 */
import { Vector3 } from 'three';
import { NO_GUIDES, type GuideSpec, type QualitySetting } from '../../contracts';
import { TimeScale } from '../../core/timeScale';
import { HOME_FRONT_Z, HOME_TOP } from '../../game/config';
import { SPECIES } from '../../game/creatures';
import type { PlayerInput } from '../../game/player';
import { GameSim } from '../../game/sim';
import { GameState } from '../../game/state';
import { GameRenderer, type RenderFrame } from '../gameRenderer';

const FIXED = 1 / 120;

export async function runSandbox(root: HTMLElement): Promise<void> {
  const params = new URLSearchParams(location.search);
  const shot = params.get('shot') ?? 'swing';
  const quality = (params.get('q') ?? 'auto') as QualitySetting;
  const auto = params.get('auto') !== '0';
  const reduceMotion = params.get('rm') === '1';
  const waveGap = Number(params.get('gap') ?? 40);

  root.innerHTML = '';
  root.style.cssText = 'position:fixed;inset:0;overflow:hidden;background:#000';
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'width:100%;height:100%;display:block;touch-action:none';
  root.appendChild(canvas);
  const hud = document.createElement('div');
  hud.style.cssText = 'position:fixed;left:8px;top:8px;font:12px/1.3 monospace;color:#fff;background:rgba(0,0,0,.45);padding:4px 6px;border-radius:4px;pointer-events:none;white-space:pre';
  root.appendChild(hud);

  const state = new GameState();
  const timeScale = new TimeScale();
  // A mid-game save: every zone reachable, a few pedestals filled.
  const levels = state.levels as unknown as Record<string, number>;
  levels.reach = shot === 'swing' || shot === 'home' || shot === 'guides' ? 0 : 20;
  levels.slots = 6;
  levels.carry = 3;
  state.syncBaseSize();
  if (shot === 'home' || shot === 'wave' || shot === 'warning') {
    for (let i = 0; i < state.base.length; i++) state.base[i] = { speciesId: SPECIES[(i * 4 + 2) % SPECIES.length].id, mutation: i === 2 ? 1 : i === 4 ? 2 : 0 };
  }
  if (shot === 'home' || shot === 'creatures' || shot === 'player') state.carried = [{ speciesId: 'crab_dj', mutation: 0 }, { speciesId: 'pickle_puff', mutation: 3 }];

  const sim = new GameSim(state, { rngSeed: 7 });
  injectGameplayObjects(sim);
  const gfx = new GameRenderer(canvas, { requestTimeScale: timeScale.request });
  const resize = () => gfx.resize(window.innerWidth, window.innerHeight, window.innerWidth / window.innerHeight < 0.8 ? 'portrait' : window.innerHeight < 500 ? 'landscape' : 'desktop');
  resize();
  window.addEventListener('resize', resize);
  await gfx.init(sim.course, quality, null);
  gfx.setReduceMotion(reduceMotion);
  if (params.get('dpr') === 'fixed') gfx.adaptiveDpr = false;

  const course = sim.course;
  const islandOf = (zone: number, k = 1) => course.islands.filter((i) => i.zone === zone)[k] ?? course.islands[0];
  let guides: GuideSpec = NO_GUIDES;

  // Shot set-ups.
  const home = course.homeSpawn;
  if (shot === 'home') {
    sim.player.reset(new Vector3(0, HOME_TOP, HOME_FRONT_Z + 9), 1);
    gfx.snapBehind(0.35, 1);
  } else if (shot === 'player') {
    sim.player.reset(home);
    gfx.snapBehind(0.3, 1);
    gfx.look(0, 40, -600, -10);
  } else if (shot === 'zone3') {
    sim.player.reset(islandOf(2).checkpoint);
  } else if (shot === 'volcano') {
    sim.player.reset(islandOf(5, 0).checkpoint);
  } else if (shot === 'buoy') {
    const gap = course.gaps.find((g) => g.zone === 1)!;
    sim.player.reset(gap.from.checkpoint);
    gfx.snapBehind(0.4, -1);
  } else if (shot === 'creatures') {
    const isl = islandOf(0, 0);
    sim.player.reset(isl.checkpoint);
  } else if (shot === 'wave' || shot === 'warning') {
    sim.player.reset(home);
    sim.wave.forceSurge();
    if (shot === 'warning') {
      sim.wave.phase = 'warning';
      sim.wave.timer = 3.5;
    }
  } else if (shot === 'guides') {
    const a = course.anchors[0];
    const isl = course.islands[0];
    guides = {
      arrow: { pos: a.pos.clone().setY(a.pos.y - 2.5) },
      trail: [home.clone(), new Vector3(0, HOME_TOP, HOME_FRONT_Z + 0.5)],
      ring: { pos: isl.checkpoint.clone(), radius: 2.2, label: 'JUMP HERE' },
      beam: isl.checkpoint.clone(),
      landingArc: { points: Array.from({ length: 20 }, (_, i) => new Vector3(a.pos.x, HOME_TOP + 6 * Math.sin((i / 19) * Math.PI) + (isl.checkpoint.y - HOME_TOP) * (i / 19), HOME_FRONT_Z - (i / 19) * (HOME_FRONT_Z - isl.checkpoint.z))), ok: true },
      hookTag: { anchorId: a.id, text: 'HOLD SPACE' },
    };
    sim.player.reset(home);
  } else sim.player.reset(home);
  if (shot === 'coldopen' || shot === 'swing') gfx.playColdOpen();

  // Input: keyboard, drag-to-look, or the auto-pilot.
  const keys = new Set<string>();
  let jumpPressed = false;
  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !keys.has('Space')) jumpPressed = true;
    keys.add(e.code);
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  let dragging = false;
  let lx = 0;
  let ly = 0;
  let lookDx = 0;
  let lookDy = 0;
  canvas.addEventListener('pointerdown', (e) => {
    dragging = true;
    lx = e.clientX;
    ly = e.clientY;
  });
  window.addEventListener('pointerup', () => (dragging = false));
  window.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    lookDx += e.clientX - lx;
    lookDy += e.clientY - ly;
    lx = e.clientX;
    ly = e.clientY;
  });

  const input: PlayerInput = { moveX: 0, moveZ: 0, jumpHeld: false, jumpPressed: false };
  let botHold = false;
  const botStep = () => {
    // Run toward -z along the course; hold jump off each edge and let go past the hook on the upswing.
    const p = sim.player;
    const nextIsland = course.islands.find((i) => i.solid.max.z < p.pos.z - 0.5) ?? course.islands[0];
    const tx = (nextIsland.solid.min.x + nextIsland.solid.max.x) / 2;
    input.moveX = Math.max(-1, Math.min(1, (tx - p.pos.x) * 0.3));
    input.moveZ = -1;
    input.jumpPressed = false;
    if (p.mode === 'ground') {
      botHold = false;
      const s = p.groundSolid;
      if (s && p.pos.z < s.min.z + 1.2) {
        input.jumpPressed = true;
        botHold = true;
      }
    } else if (p.mode === 'swing' && p.anchor) {
      if (p.pos.z < p.anchor.pos.z - 3 && p.vel.y > -1) botHold = false;
    }
    input.jumpHeld = botHold;
  };

  const moving = shot === 'swing' ? auto : false;
  let acc = 0;
  let time = 0;
  let last = performance.now();
  (window as unknown as { __sb: unknown }).__sb = { sim, state, gfx, timeScale, setGuides: (g: GuideSpec) => (guides = g) };

  const frame = (now: number) => {
    requestAnimationFrame(frame);
    const realDt = Math.min(0.1, (now - last) / 1000);
    last = now;
    time += realDt;
    gfx.look(lookDx, lookDy, 0, time);
    lookDx = lookDy = 0;
    const scale = timeScale.update(realDt);
    const simDt = realDt * scale;
    acc += simDt;
    let steps = 0;
    while (acc >= FIXED && steps < 12) {
      if (moving && keys.size === 0) botStep();
      else {
        const yaw = gfx.cameraYaw();
        const mx = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
        const my = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
        input.moveX = Math.cos(yaw) * mx - Math.sin(yaw) * my;
        input.moveZ = -Math.sin(yaw) * mx - Math.cos(yaw) * my;
        input.jumpHeld = keys.has('Space');
        input.jumpPressed = jumpPressed;
        jumpPressed = false;
      }
      if (shot === 'wave' && sim.wave.phase === 'surge') sim.wave.frontZ = Math.min(sim.player.pos.z, 2) - waveGap - sim.wave.speed * FIXED;
      sim.step(FIXED, input);
      for (const e of sim.events) gfx.onSimEvent(e);
      acc -= FIXED;
      steps++;
    }
    if (steps === 12) acc = 0;
    if (shot === 'wave' && sim.wave.phase === 'surge') sim.wave.frontZ = Math.min(sim.player.pos.z, 2) - waveGap;
    if (!gfx.shouldRender(now)) return;
    const f: RenderFrame = { realDt, simDt, time, sim, state, cosmetics: { rope: params.get('rope') ?? 'rope_hemp', trail: 'trail_none' }, guides, reduceMotion, beatPhase: NaN };
    gfx.render(f);
    const s = gfx.stats();
    hud.textContent = `render sandbox  shot=${shot}  tier=${gfx.tier}\ncalls ${s.calls}  tris ${(s.tris / 1000).toFixed(1)}k  ${s.ms.toFixed(1)} ms  dpr ${s.dpr}\nmode ${sim.player.mode}  wave ${sim.wave.phase} ${sim.wave.timer.toFixed(1)}`;
  };
  requestAnimationFrame(frame);
}

/**
 * Until the features team's course lands, fake its §9.0 objects (buoys in zones 2–5, drift on the last hook of
 * zones 3–7, geysers on Volcano Bay islands) so the sandbox can show them. No-op once the sim has them.
 */
function injectGameplayObjects(sim: GameSim): void {
  const c = sim.course as unknown as { buoys?: unknown[]; geysers?: unknown[] };
  if (c.buoys) return;
  {
    let id = 9000;
    c.buoys = sim.course.gaps
      .filter((g) => g.zone >= 1 && g.zone <= 4)
      .map((g) => {
        const a = g.from.solid;
        const b = g.to.solid;
        return { id: id++, pos: new Vector3(((a.min.x + a.max.x) / 2 + (b.min.x + b.max.x) / 2) / 2 + 1, 1.2, (a.min.z + b.max.z) / 2), radius: 1.4 };
      });
    for (let z = 2; z <= 6; z++) {
      const gaps = sim.course.gaps.filter((g) => g.zone === z);
      const g = gaps[gaps.length - 1];
      const a = g?.anchors[Math.floor(g.anchors.length / 2)] as unknown as { pos: Vector3; drift?: unknown } | undefined;
      if (a) a.drift = { baseX: a.pos.x, amp: 2.5, period: 4, phase: z };
    }
  }
  if (!c.geysers) {
    let id = 9500;
    c.geysers = sim.course.islands.filter((i) => i.zone === 5).map((i, k) => ({ id: id++, pos: new Vector3(i.solid.max.x - 2.5, i.solid.max.y, i.checkpoint.z + 1.5), radius: 1.5, phase: k * 2.3 }));
  }
  // Drive the fake drift so rails and hooks move together.
  const drifting = sim.course.anchors.filter((a) => (a as unknown as { drift?: unknown }).drift);
  const step = sim.step.bind(sim);
  sim.step = (dt, input) => {
    step(dt, input);
    for (const a of drifting) {
      const d = (a as unknown as { drift: { baseX: number; amp: number; period: number; phase: number } }).drift;
      a.pos.x = d.baseX + d.amp * Math.sin((2 * Math.PI * sim.time) / d.period + d.phase);
    }
  };
}
