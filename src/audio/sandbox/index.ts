/** Dev-only sandbox for the audio module: open the game with ?sandbox=audio. */
import type { AudioFrame, Surface } from '../../contracts';
import { SPECIES } from '../../game/creatures';
import { AudioDirector } from '../director';
import { SFX_IDS, type SfxId } from '../sfx';

const CSS = `
.asb{font:14px/1.4 system-ui,sans-serif;color:#eaf6ff;background:#0d2a44;min-height:100vh;padding:16px;box-sizing:border-box;overflow:auto}
.asb h1{font-size:20px;margin:0 0 8px}.asb h2{font-size:15px;margin:16px 0 6px;color:#9fd8ff}
.asb button{margin:3px;padding:6px 10px;border-radius:8px;border:2px solid #0a1a2a;background:#ffd23f;color:#1b1b1b;font-weight:600;cursor:pointer}
.asb button.on{background:#ff6b4a;color:#fff}.asb button.st{background:#7cc4ff}
.asb label{display:inline-flex;align-items:center;gap:6px;margin:4px 12px 4px 0}
.asb .meter{font-family:ui-monospace,monospace;background:#071827;padding:8px;border-radius:8px;white-space:pre}
.asb .row{display:flex;flex-wrap:wrap;align-items:center}
`;

export async function runSandbox(root: HTMLElement): Promise<void> {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  root.innerHTML = '';
  root.style.overflow = 'auto';
  const wrap = el('div', 'asb');
  root.appendChild(wrap);
  wrap.appendChild(el('h1', '', 'Audio sandbox'));
  wrap.appendChild(el('div', '', 'Click anywhere to unlock audio. Music starts with a 1.5 s fade-in.'));

  const audio = new AudioDirector();
  const unlock = (): void => audio.unlock();
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);

  // Synthetic frame driven by the controls.
  const frame: AudioFrame = {
    dt: 1 / 60, onHome: true, carried: 0, carriedMaxRarity: 0, wavePhase: 'calm', waveTimer: 90, golden: false, big: false,
    speed: 0, altitude: 0, nearIsland: true, bestZone: 3, grounded: true, surface: 'grass', swing: null, perfectWindow: false,
    panelOpen: false, slowmo: false, ftueStep: null, lowTier: false,
  };
  let swinging = false;
  let swingT = 0;
  let walking = false;

  // ---------- music states
  wrap.appendChild(el('h2', '', 'Music state'));
  const states = el('div', 'row');
  wrap.appendChild(states);
  let warnTimer = -1;
  for (const s of ['calm', 'warning', 'hurry', 'surge', 'phew'] as const) {
    const b = btn(s, () => {
      audio.debugMusic(s);
      if (s === 'warning') {
        frame.wavePhase = 'warning';
        warnTimer = 10;
      } else if (s === 'surge') {
        frame.wavePhase = 'surge';
        warnTimer = -1;
      } else if (s === 'calm' || s === 'phew') {
        frame.wavePhase = 'calm';
        warnTimer = -1;
      }
    });
    b.className = 'st';
    states.appendChild(b);
  }
  const golden = checkbox('golden wave', (v) => (frame.golden = v));
  states.appendChild(golden);

  wrap.appendChild(el('h2', '', 'Game context (drives intensity, layers, ambience)'));
  const ctxRow = el('div', 'row');
  wrap.appendChild(ctxRow);
  ctxRow.appendChild(checkbox('on home island', (v) => (frame.onHome = v), true));
  ctxRow.appendChild(slider('carried', 0, 6, 0, (v) => (frame.carried = v)));
  ctxRow.appendChild(slider('max rarity', 0, 6, 0, (v) => (frame.carriedMaxRarity = v)));
  ctxRow.appendChild(slider('wave timer (calm)', 0, 90, 90, (v) => (frame.waveTimer = v)));
  ctxRow.appendChild(slider('best zone', 0, 6, 3, (v) => (frame.bestZone = v)));
  ctxRow.appendChild(slider('speed m/s', 0, 50, 0, (v) => (frame.speed = v)));
  ctxRow.appendChild(slider('altitude m', 0, 60, 0, (v) => (frame.altitude = v)));
  ctxRow.appendChild(checkbox('panel open', (v) => (frame.panelOpen = v)));
  ctxRow.appendChild(checkbox('slow-mo', (v) => (frame.slowmo = v)));
  ctxRow.appendChild(checkbox('FTUE grab step (quiet)', (v) => (frame.ftueStep = v ? 'grab' : null)));
  ctxRow.appendChild(checkbox('low tier', (v) => (frame.lowTier = v)));
  ctxRow.appendChild(checkbox('walking (footsteps)', (v) => (walking = v)));
  const surf = document.createElement('select');
  for (const s of ['grass', 'sand', 'wood']) surf.appendChild(new Option(s, s));
  surf.onchange = () => (frame.surface = surf.value as Surface);
  ctxRow.appendChild(surf);
  ctxRow.appendChild(checkbox('swinging (creak + whoosh)', (v) => (swinging = v)));

  // ---------- mixer
  wrap.appendChild(el('h2', '', 'Mixer and mute flags'));
  const mix = el('div', 'row');
  wrap.appendChild(mix);
  let music = 50;
  let sound = 80;
  mix.appendChild(slider('Music', 0, 100, 50, (v) => audio.setVolumes((music = v), sound)));
  mix.appendChild(slider('Sound', 0, 100, 80, (v) => audio.setVolumes(music, (sound = v))));
  mix.appendChild(checkbox('user muted', (v) => audio.setUserMuted(v)));
  mix.appendChild(checkbox('platform muted', (v) => audio.setPlatformMuted(v)));
  mix.appendChild(checkbox('ad playing', (v) => audio.setAdPlaying(v)));
  mix.appendChild(checkbox('hidden', (v) => audio.setHidden(v)));
  mix.appendChild(btn('resume (gesture)', () => audio.unlock()));

  // ---------- sfx
  wrap.appendChild(el('h2', '', 'SFX'));
  const sfxRow = el('div', 'row');
  wrap.appendChild(sfxRow);
  let rarity = 3;
  sfxRow.appendChild(slider('rarity / n / i', 0, 8, 3, (v) => (rarity = v)));
  const sfxBtns = el('div', 'row');
  wrap.appendChild(sfxBtns);
  for (const id of SFX_IDS) {
    sfxBtns.appendChild(
      btn(id, () => audio.play(id as SfxId, { rarity, n: Math.max(2, rarity), i: rarity, golden: frame.golden, hard: rarity >= 4 })),
    );
  }

  // ---------- voices
  wrap.appendChild(el('h2', '', 'Creature voices'));
  const vkind = document.createElement('select');
  for (const k of ['pickup', 'reveal', 'deliver', 'tap']) vkind.appendChild(new Option(k, k));
  wrap.appendChild(vkind);
  const vRow = el('div', 'row');
  wrap.appendChild(vRow);
  for (const s of SPECIES) {
    vRow.appendChild(btn(`${s.name} (${s.look.plan})`, () => audio.voice(s.id, vkind.value as 'pickup')));
  }

  // ---------- sim events
  wrap.appendChild(el('h2', '', 'Sim events (onSimEvent)'));
  const evRow = el('div', 'row');
  wrap.appendChild(evRow);
  const fakeCreature = (id: string) => ({ speciesId: id, mutation: 0 });
  const evs: [string, () => void][] = [
    ['jump', () => audio.onSimEvent({ type: 'player', event: 'jump' })],
    ['release (good)', () => audio.onSimEvent({ type: 'player', event: 'release' })],
    ['release (perfect)', () => {
      audio.onSimEvent({ type: 'player', event: 'release' });
      audio.onSimEvent({ type: 'releaseRated', quality: 'perfect', theta: 0.4 });
    }],
    ['collect Pizza Kraken', () => audio.onSimEvent({ type: 'collect', creature: { ...fakeCreature('pizza_kraken'), uid: 1, golden: false, featured: false } as never, isNewSpecies: true, isNewMutation: false })],
    ['deliver 3', () => audio.onSimEvent({ type: 'deliver', result: { placed: [fakeCreature('crab_dj'), fakeCreature('toastopus'), fakeCreature('ghost_galleon')], sold: [] }, bonusCash: 0, chainMult: 1, tripBest: 3, closeCall: false })],
    ['chain 5', () => audio.onSimEvent({ type: 'chain', count: 5 })],
    ['chain lost', () => audio.onSimEvent({ type: 'chainEnd', count: 5, reason: 'sea' })],
    ['splash', () => audio.onSimEvent({ type: 'splash', lost: [], practice: false })],
  ];
  for (const [n, f] of evs) evRow.appendChild(btn(n, f));

  // ---------- meter
  wrap.appendChild(el('h2', '', 'Status'));
  const meter = el('div', 'meter');
  wrap.appendChild(meter);

  let last = performance.now();
  const loop = (now: number): void => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    frame.dt = dt;
    if (warnTimer >= 0 && frame.wavePhase === 'warning') {
      warnTimer = Math.max(0, warnTimer - dt);
      frame.waveTimer = warnTimer;
    }
    frame.grounded = walking || !swinging;
    if (walking && frame.speed < 2) frame.speed = 5;
    if (swinging) {
      swingT += dt;
      const w = 2.2;
      frame.swing = { theta: 0.9 * Math.sin(w * swingT), speed: 22 * Math.abs(Math.cos(w * swingT)) };
      frame.grounded = false;
    } else frame.swing = null;
    audio.update(frame);
    const d = audio.debugInfo();
    const bp = audio.beatPhase();
    meter.textContent =
      `context: ${d.state}   unlocked: ${audio.unlocked}   needsGesture: ${audio.needsGesture}\n` +
      `section: ${d.section}   transpose: ${d.transpose}   voices: ${d.voices} (peak ${d.peakVoices})\n` +
      `beat: ${Number.isNaN(bp) ? 'NaN' : '#'.repeat(Math.round(bp * 20)).padEnd(20, '.')}  wave: ${frame.wavePhase} ${frame.waveTimer.toFixed(1)}s`;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

function el(tag: string, cls = '', text = ''): HTMLElement {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text) e.textContent = text;
  return e;
}
function btn(label: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  b.onclick = onClick;
  return b;
}
function checkbox(label: string, on: (v: boolean) => void, init = false): HTMLElement {
  const l = document.createElement('label');
  const c = document.createElement('input');
  c.type = 'checkbox';
  c.checked = init;
  c.onchange = () => on(c.checked);
  l.append(c, label);
  return l;
}
function slider(label: string, min: number, max: number, init: number, on: (v: number) => void): HTMLElement {
  const l = document.createElement('label');
  const s = document.createElement('input');
  s.type = 'range';
  s.min = String(min);
  s.max = String(max);
  s.value = String(init);
  const v = document.createElement('span');
  v.textContent = String(init);
  s.oninput = () => {
    v.textContent = s.value;
    on(Number(s.value));
  };
  l.append(label, s, v);
  return l;
}
