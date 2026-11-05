// UI sandbox (?sandbox=ui): the full HUD over a painted backdrop, driven by mocks.
// Params: panel=shop|shop:locker|shop:rebirth|index|free|free:gifts|settings|welcome
//         state=calm|warning|surge|safe|paused|golden|big|action|ftue   fx=reveal|bigreveal|toasts|banner|resume|controls|coins|focus
//         logo (logo alone)   sheet (icon contact sheet)   touch=1   clean (no dev menu)
import type { HudView, PanelKind, PanelTab } from '../../contracts';
import { SPECIES } from '../../game/creatures';
import { loadFonts } from '../fonts';
import { Hud } from '../hud';
import { ICON_IDS, icon } from '../icons';
import { logoSvg } from '../logo';
import { makeActions, makeHudView, makePanelData, makeState, mockPortrait } from './mocks';

const STYLE = `
.sb-scene { position:absolute; inset:0; overflow:hidden; background:linear-gradient(180deg,#5EC3F2 0%,#A8E4FF 46%,#DDF6FF 52%,#2AA7D8 52.2%,#1679C0 100%); }
.sb-scene .isl { position:absolute; border-radius:50%; background:radial-gradient(ellipse at 50% 30%,#8BE06A 0 44%,#E9D49C 46% 62%,#C9A86A 64%); box-shadow:0 10px 0 rgba(0,40,80,.25); }
.sb-scene .cloud { position:absolute; height:40px; border-radius:999px; background:#fff; box-shadow:40px -18px 0 6px #fff, 86px 0 0 -2px #fff; opacity:.95; }
.sb-scene .hero { position:absolute; left:50%; top:56%; width:46px; height:86px; margin-left:-23px; border-radius:8px; background:linear-gradient(#FFD2A6 0 28%,#F28C38 28% 68%,#2B4C9B 68%); border:4px solid #1B1736; }
.sb-menu { position:fixed; right:8px; bottom:8px; z-index:200; display:flex; flex-wrap:wrap; gap:4px; max-width:360px; justify-content:flex-end; font:12px system-ui; }
.sb-menu button { padding:4px 8px; border-radius:6px; border:1px solid #1B1736; background:#fff; cursor:pointer; }
.sb-log { position:fixed; left:8px; bottom:8px; z-index:200; font:11px monospace; color:#fff; background:rgba(0,0,0,.5); padding:2px 6px; border-radius:4px; pointer-events:none; }
`;

function scene(): HTMLElement {
  const s = document.createElement('div');
  s.className = 'sb-scene';
  s.innerHTML =
    `<div class="cloud" style="left:12%;top:18%;width:90px"></div><div class="cloud" style="left:68%;top:12%;width:70px"></div>` +
    `<div class="isl" style="left:18%;top:58%;width:34%;height:16%"></div><div class="isl" style="left:62%;top:53%;width:16%;height:6%"></div>` +
    `<div class="isl" style="left:40%;top:63%;width:28%;height:12%"></div><div class="hero"></div>`;
  return s;
}

function contactSheet(root: HTMLElement): void {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:absolute;inset:0;overflow:auto';
  for (const bg of ['#123A5C', '#FFF6E0']) {
    const s = document.createElement('div');
    s.style.cssText = `background:${bg};padding:12px;display:grid;grid-template-columns:repeat(12,1fr);gap:6px`;
    s.innerHTML = ICON_IDS.map((id) => `<div style="display:flex;flex-direction:column;align-items:center;gap:2px;font:600 11px Fredoka,sans-serif;color:${bg === '#FFF6E0' ? '#1B1736' : '#fff'};${id === 'wave' || id === 'creature' || id === 'gem' ? 'color:#34AFFF' : ''}">${icon(id, 52)}<div style="display:flex;gap:4px;align-items:end">${icon(id, 32)}${icon(id, 20)}</div>${id}</div>`).join('');
    wrap.appendChild(s);
  }
  root.appendChild(wrap);
}

export async function runSandbox(root: HTMLElement): Promise<void> {
  const q = new URLSearchParams(location.search);
  root.innerHTML = '';
  const style = document.createElement('style');
  style.textContent = STYLE;
  document.head.appendChild(style);
  await loadFonts(3000);
  document.body.style.background = '#0B2740';

  if (q.has('logo')) {
    root.innerHTML = `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:radial-gradient(circle at 50% 40%,#1D5583,#0B2740)">${logoSvg(600)}</div>`;
    return;
  }
  if (q.has('sheet')) {
    contactSheet(root);
    return;
  }

  root.appendChild(scene());
  const ui = document.createElement('div');
  ui.style.cssText = 'position:absolute;inset:0';
  root.appendChild(ui);
  const logEl = document.createElement('div');
  logEl.className = 'sb-log';
  const log = (m: string) => (logEl.textContent = m);

  const state = makeState();
  const seen = new Set<string>(q.has('coach') ? [] : ['coach:index', 'coach:free', 'coach:locker', 'coach:rebirth']);
  let hud!: Hud;
  const actions = makeActions(state, log, { panelChanged: (k, t) => log(`panelChanged ${k} ${t ?? ''}`) });
  hud = new Hud(ui, {
    portraits: { get: (c) => mockPortrait(c), request: () => {} },
    data: makePanelData(state),
    actions,
    sound: (id, i) => log(`sound ${id}${i !== undefined ? ' ' + i : ''}`),
    voice: (id) => log(`voice ${id}`),
    requestTimeScale: (id, s, ms) => log(`timeScale ${id} ${s} ${ms}`),
    coach: { seen: (id) => seen.has(id), markSeen: (id) => seen.add(id) },
  });

  const touch = q.get('touch') === '1' || matchMedia('(pointer: coarse)').matches;
  if (touch) hud.joyBase.classList.add('is-ghost');
  const st = q.get('state') ?? 'calm';
  let wavePhase = st;
  let t = 28;
  const view = (): HudView => {
    const v = makeHudView(state, hud.layout, touch);
    v.cash = state.cash;
    v.pearls = state.pearls;
    v.wave.timer = t;
    if (wavePhase === 'paused') v.wave.frozen = true;
    if (wavePhase === 'golden') v.wave.golden = true;
    if (wavePhase === 'big') {
      v.wave.big = true;
      v.wave.number = 10;
    }
    if (wavePhase === 'warning') {
      v.wave.phase = 'warning';
      v.wave.timer = Math.min(t, 6);
      v.vignette = { kind: 'danger', strength: 0.6 };
    }
    if (wavePhase === 'surge' || wavePhase === 'safe') {
      v.wave.phase = 'surge';
      v.wave.progress = 0.45;
      v.wave.hitsPlayerIn = 4.2;
      v.wave.safe = wavePhase === 'safe';
      v.course.waveT = 0.62;
      v.vignette = { kind: 'danger', strength: wavePhase === 'safe' ? 0 : 0.8 };
    }
    if (wavePhase === 'action') {
      v.action = true;
      v.jumpLabel = 'SWING';
      v.reticle = { kind: 'hook', x: innerWidth * 0.62, y: innerHeight * 0.3, locked: false, keyHint: true };
    }
    if (wavePhase === 'locked') v.reticle = { kind: 'hook', x: innerWidth * 0.62, y: innerHeight * 0.3, locked: true, reach: 11.9, keyHint: false };
    if (wavePhase === 'release') {
      v.reticle = { kind: 'release', x: innerWidth * 0.5, y: innerHeight * 0.48 };
      v.jumpLabel = 'LET GO';
      v.jumpGoldRim = true;
    }
    if (wavePhase === 'edge') v.edgeArrow = { x: -200, y: innerHeight * 0.7, angle: Math.PI, icon: 'home', label: '24 m' };
    if (wavePhase === 'ftue') {
      v.wave.frozen = true;
      v.hide = { cash: true, rail: true, course: true, tracker: true, pearls: true };
      v.chain = null;
    }
    return v;
  };

  let last = performance.now();
  const loop = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    if (!q.has('freeze')) {
      t -= dt;
      if (t < 0) t = 70;
      state.cash += state.income * dt;
    }
    hud.update(dt, view());
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);

  const fire = (what: string) => {
    const cx = innerWidth / 2;
    const cy = innerHeight / 2;
    switch (what) {
      case 'toast':
        hud.toast({ text: 'Hands full. Head home.', kind: 'warn' });
        hud.toast({ text: 'Locker unlocked', kind: 'good', icon: 'locker', onTap: () => hud.openPanel('shop', 'locker') });
        break;
      case 'toastbad':
        hud.toast({ text: 'The wave took 2 creatures', kind: 'bad', icon: 'wave', action: { label: 'KEEP THEM', icon: 'play', onTap: () => log('ad') } });
        break;
      case 'banner':
        hud.banner({ title: 'WAVE INCOMING', sub: 'Get home or climb a lighthouse', hue: 'coral', priority: 'wave' });
        break;
      case 'zone':
        hud.banner({ title: 'CORAL REEF', sub: 'Uncommon creatures', hue: 'r1', priority: 'zone' });
        break;
      case 'coins': {
        const amt = 2500;
        state.cash += amt;
        void hud.coinFly({ x: cx, y: cy + 80 }, amt, 'cash');
        hud.float({ x: cx, y: cy + 40 }, '+$2.5K', 'cash');
        break;
      }
      case 'pearls':
        state.pearls += 25;
        void hud.coinFly({ x: cx, y: cy }, 25, 'pearl', 5);
        break;
      case 'float':
        hud.float({ x: cx + 60, y: cy - 40 }, 'PERFECT', 'perfect');
        hud.float({ x: cx - 80, y: cy }, '×5', 'chain');
        hud.float({ x: cx, y: cy + 60 }, 'CLOSE CALL +25%', 'bonus');
        break;
      case 'reveal':
        void hud.reveal({ speciesId: 'king_krill', mutation: 0 }, 'compact', '9/21');
        break;
      case 'bigreveal':
        void hud.reveal({ speciesId: 'pizza_kraken', mutation: 0 }, 'big', '10/21');
        break;
      case 'confetti':
        hud.confetti('center', 80);
        break;
      case 'countdown':
        hud.countdown(3);
        setTimeout(() => hud.countdown(2), 1000);
        setTimeout(() => hud.countdown(1), 2000);
        break;
      case 'flash':
        hud.flash('#1E88FF', 250);
        break;
      case 'resume':
        hud.showResume(() => log('resumed'));
        break;
      case 'controls':
        hud.showControlsCard(4000);
        break;
      case 'slot': {
        const sp = SPECIES[Math.floor(Math.random() * SPECIES.length)];
        hud.creatureToSlot({ x: cx, y: cy - 40 }, { speciesId: sp.id, mutation: 0 }, 1);
        break;
      }
      case 'focus':
        hud.openPanel('shop', 'upgrades');
        hud.setFocus({ panel: 'shop', tab: 'upgrades', rowKey: 'reach', note: 'UNLOCKS ZONE 2', sub: 'Longer rope reaches farther islands', dimOthers: true });
        break;
    }
  };

  const openSpec = (p: string) => {
    const [k, tab] = p.split(':') as [PanelKind, PanelTab | undefined];
    hud.openPanel(k, tab);
  };

  const keys: Record<string, () => void> = {
    '1': () => openSpec('shop'), '2': () => openSpec('free'), '3': () => openSpec('index'), '4': () => openSpec('settings'), '5': () => openSpec('welcome'),
    '6': () => openSpec('shop:locker'), '7': () => openSpec('shop:rebirth'), '8': () => openSpec('free:gifts'),
    t: () => fire('toast'), y: () => fire('toastbad'), b: () => fire('banner'), z: () => fire('zone'), c: () => fire('coins'), v: () => fire('pearls'),
    f: () => fire('float'), r: () => fire('reveal'), R: () => fire('bigreveal'), k: () => fire('confetti'), x: () => fire('countdown'),
    h: () => fire('flash'), p: () => fire('resume'), o: () => fire('controls'), s: () => fire('slot'), Escape: () => hud.closePanel(),
    w: () => {
      const order = ['calm', 'golden', 'big', 'warning', 'surge', 'safe', 'paused', 'action', 'locked', 'release', 'edge'];
      wavePhase = order[(order.indexOf(wavePhase) + 1) % order.length];
      log(`state ${wavePhase}`);
    },
  };
  window.addEventListener('keydown', (e) => keys[e.key]?.());

  if (!q.has('clean')) {
    const menu = document.createElement('div');
    menu.className = 'sb-menu';
    const btns: [string, () => void][] = [
      ['Shop', () => openSpec('shop')], ['Locker', () => openSpec('shop:locker')], ['Rebirth', () => openSpec('shop:rebirth')], ['Index', () => openSpec('index')],
      ['Free', () => openSpec('free')], ['Gifts', () => openSpec('free:gifts')], ['Settings', () => openSpec('settings')], ['Welcome', () => openSpec('welcome')],
      ['Toast', () => fire('toast')], ['Bad toast', () => fire('toastbad')], ['Banner', () => fire('banner')], ['Zone', () => fire('zone')],
      ['Coins', () => fire('coins')], ['Pearls', () => fire('pearls')], ['Floats', () => fire('float')], ['Reveal', () => fire('reveal')], ['Big reveal', () => fire('bigreveal')],
      ['Confetti', () => fire('confetti')], ['3-2-1', () => fire('countdown')], ['Flash', () => fire('flash')], ['Resume', () => fire('resume')],
      ['Controls', () => fire('controls')], ['To slot', () => fire('slot')], ['Focus', () => fire('focus')], ['Wave state', keys.w],
    ];
    for (const [label, fn] of btns) {
      const b = document.createElement('button');
      b.textContent = label;
      b.onclick = fn;
      menu.appendChild(b);
    }
    root.append(menu);
  } else logEl.style.display = 'none';
  root.appendChild(logEl);

  const panel = q.get('panel');
  if (panel) openSpec(panel);
  const fx = q.get('fx');
  if (fx) setTimeout(() => fire(fx), 300);
}
