/**
 * Dev-only sandbox for the tutorial module: open the game with ?sandbox=tutorial.
 * Shows the overlay for one step over a plain background with stand-in HUD anchors, for screenshots.
 *   &step=grab|grab-move|grab-fail|release-wait|letgo|again|pump|soclose|nice|collect|collect-more|home|
 *         shop-open|shop-buy|wave|wave-warn|launch|splash|ready|drag   (default grab)
 *         flow (cycles through the steps every 2.5 s to show pops, check stamps and exits)
 *   &device=keyboard|touch   (default keyboard)
 */
import lilita from '@fontsource/lilita-one/files/lilita-one-latin-400-normal.woff2?inline';
import fredoka600 from '@fontsource/fredoka/files/fredoka-latin-600-normal.woff2?inline';
import { NO_GUIDES, type FtueStepId, type PromptSpec, type TutorialFrame } from '../../contracts';
import { COPY } from '../copy';
import { TutorialOverlay } from '../overlay';

async function loadFonts(): Promise<void> {
  const faces = [
    new FontFace('Lilita One', `url(${lilita}) format('woff2')`, { weight: '400' }),
    new FontFace('Fredoka', `url(${fredoka600}) format('woff2')`, { weight: '600' }),
  ];
  const load = Promise.all(faces.map(async (f) => { await f.load(); document.fonts.add(f); }));
  await Promise.race([load, new Promise((r) => setTimeout(r, 1500))]);
}

type Device = 'keyboard' | 'touch';

function prompt(id: string, headline: string, extra: Partial<PromptSpec> = {}): PromptSpec {
  return { id, headline, size: 'normal', fail: false, glyph: 'none', ...extra };
}

/** One frame per sandbox step (the same prompts TutorialCore produces). */
export function sandboxFrame(name: string, device: Device): TutorialFrame {
  const touch = device === 'touch';
  const grab = touch ? COPY.grabTouch : COPY.grabDesktop;
  let step: FtueStepId = 'grab';
  let p: PromptSpec | null = null;
  let spotlight: string | null = null;
  let controlsCard = false;
  let timeScale = 1;
  switch (name) {
    case 'grab-move':
      p = prompt('grab', grab.headline, { sub: grab.sub, glyph: touch ? 'thumbDrag' : 'wasd' });
      break;
    case 'grab-fail':
      p = prompt('fail:hold', COPY.grabFail.headline, { sub: (touch ? COPY.grabFail : COPY.grabFailDesktop).sub, fail: true, glyph: touch ? 'thumbHold' : 'spaceHold' });
      break;
    case 'release-wait':
      step = 'release';
      p = prompt('release:wait', COPY.wait.headline, { size: 'small' });
      break;
    case 'letgo':
      step = 'release';
      timeScale = 0.25;
      p = prompt('letGo', COPY.letGo.headline, { size: 'big', glyph: touch ? 'thumbHold' : 'spaceHold' });
      break;
    case 'again':
      step = 'release';
      p = prompt('fail:again', COPY.again.headline, { sub: COPY.again.sub, fail: true });
      break;
    case 'pump': {
      step = 'release';
      const l = touch ? COPY.pumpTouch : COPY.pumpDesktop;
      p = prompt('fail:pump', l.headline, { sub: l.sub, fail: true, glyph: touch ? 'thumbPush' : 'keyW' });
      break;
    }
    case 'soclose':
      step = 'release';
      p = prompt('fail:soClose', COPY.soClose.headline, { sub: COPY.soClose.sub, fail: true });
      break;
    case 'nice':
      step = 'collect';
      p = prompt('stamp:nice', COPY.niceSwing, { stamp: COPY.niceSwing });
      break;
    case 'collect': {
      step = 'collect';
      const l = COPY.collect('Toastopus');
      p = prompt('collect', l.headline, { sub: l.sub, portrait: 'toastopus' });
      break;
    }
    case 'collect-more':
      step = 'collect';
      p = prompt('collect:more', COPY.collectMore(1, 2).headline);
      break;
    case 'home':
      step = 'home';
      p = prompt('home', COPY.home.headline, { chip: { icon: 'home', text: COPY.meters(24) } });
      break;
    case 'shop-open':
      step = 'shop';
      p = prompt('shop:open', COPY.openShop.headline, { glyph: touch ? 'none' : 'keyU' });
      spotlight = 'rail:shop';
      break;
    case 'shop-buy':
      step = 'shop';
      p = prompt('shop:buy', COPY.buyReach.headline);
      spotlight = 'shop:buy:reach';
      break;
    case 'wave':
      step = 'wave';
      p = prompt('wave', COPY.wave.headline);
      break;
    case 'wave-warn':
      step = 'wave';
      p = prompt('wave:warn', COPY.waveWarn.headline, { chip: { icon: 'lighthouse', text: COPY.etaPad(2) } });
      break;
    case 'launch':
      step = 'wave';
      p = prompt('stamp:launch', COPY.launch, { stamp: COPY.launch });
      break;
    case 'splash':
      step = 'wave';
      p = prompt('splash', COPY.splash.headline, { sub: COPY.splash.sub });
      break;
    case 'ready':
      step = 'ready';
      controlsCard = true;
      break;
    case 'drag':
      step = 'collect';
      p = prompt('dragToLook', COPY.dragToLook.headline, { glyph: 'dragLook' });
      break;
    default:
      p = prompt('grab', grab.headline, { sub: grab.sub, glyph: touch ? 'thumbHold' : 'spaceHold' });
  }
  return {
    active: true, step, timeScale, guides: NO_GUIDES, sim: { waveFrozen: true, practiceWave: false }, hide: {},
    jumpLabel: null, edgeTarget: null, prompt: p, spotlight, focus: null, controlsCard, skipVisible: step !== 'ready',
    musicLowpass: timeScale < 1, vignette: timeScale < 1 ? 1 : 0, commands: [],
  };
}

function el(tag: string, css: string, parent: HTMLElement, text = ''): HTMLElement {
  const e = document.createElement(tag);
  e.style.cssText = css;
  e.textContent = text;
  parent.appendChild(e);
  return e;
}

export async function runSandbox(root: HTMLElement): Promise<void> {
  await loadFonts();
  const q = new URLSearchParams(location.search);
  const name = q.get('step') ?? 'grab';
  const device = (q.get('device') === 'touch' ? 'touch' : 'keyboard') as Device;
  document.body.style.margin = '0';
  root.style.cssText = 'position:fixed;inset:0;overflow:hidden;background:linear-gradient(180deg,#7FD8FF 0%,#BDEBFF 55%,#2E9BD6 56%,#1679D9 100%);';

  // Stand-in HUD (only what the overlay anchors to, plus the wave meter for placement).
  const font = "font-family:'Lilita One',system-ui;color:#fff;-webkit-text-stroke:5px #1B1736;paint-order:stroke fill;";
  const wave = el('div', 'position:absolute;left:50%;top:14px;width:380px;max-width:calc(100vw - 32px);height:52px;transform:translateX(-50%);background:#123A5C;border:4px solid #1B1736;border-radius:999px;box-sizing:border-box;display:flex;align-items:center;justify-content:center;' + font + 'font-size:22px;', root, 'WAVE PAUSED');
  void wave;
  const rail = el('div', 'position:absolute;left:16px;top:168px;width:72px;height:72px;border-radius:18px;border:4px solid #1B1736;box-sizing:border-box;background:linear-gradient(#8CF25E,#3FCB4B 52%,#23963A);box-shadow:inset 0 -5px 0 #156B27,0 5px 0 #1B1736;display:flex;align-items:flex-end;justify-content:center;' + font + 'font-size:15px;padding-bottom:6px;', root, 'SHOP');
  let jump: HTMLElement | null = null;
  if (device === 'touch') {
    jump = el('div', 'position:absolute;right:28px;bottom:28px;width:104px;height:104px;border-radius:50%;border:4px solid #1B1736;box-sizing:border-box;background:linear-gradient(#FFF07A,#FFC92E 52%,#F39A12);box-shadow:inset 0 -6px 0 #B86400,0 6px 0 #1B1736;display:flex;align-items:center;justify-content:center;' + font + 'font-size:20px;', root, name === 'letgo' ? 'LET GO' : 'JUMP');
  }
  let buy: HTMLElement | null = null;
  if (name === 'shop-buy') {
    el('div', 'position:absolute;inset:0;background:rgba(6,20,34,.6);', root);
    const panel = el('div', 'position:absolute;left:50%;top:50%;width:min(560px,92vw);transform:translate(-50%,-50%);background:#123A5C;border:5px solid #1B1736;border-radius:26px;padding:16px;box-sizing:border-box;', root);
    const row = el('div', 'display:flex;align-items:center;gap:12px;background:#FFF6E0;border:4px solid #1B1736;border-radius:18px;padding:10px 12px;', panel);
    el('div', "flex:1;font-family:'Lilita One';font-size:22px;color:#1B1736;", row, 'Rope Reach  9.5 m > 10.3 m');
    buy = el('div', 'height:52px;padding:0 22px;border-radius:14px;border:4px solid #1B1736;box-sizing:border-box;background:linear-gradient(#8CF25E,#3FCB4B 52%,#23963A);box-shadow:inset 0 -5px 0 #156B27,0 5px 0 #1B1736;display:flex;align-items:center;' + font + 'font-size:22px;', row, '$40');
  }

  const ui = el('div', 'position:absolute;inset:0;', root);
  let closed = false;
  const overlay = new TutorialOverlay({
    root: ui,
    anchor: (id) => (id === 'rail:shop' ? rail : id === 'shop:buy:reach' ? buy : id === 'jump' ? jump : null),
    anchorPoint: (id) => {
      if (id !== 'jump' || !jump) return null;
      const r = jump.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    },
    sound: (id) => console.debug('[tutorial sound]', id),
    onSkip: () => console.debug('[tutorial] skip'),
    onControlsClosed: () => {
      closed = true;
    },
    device: () => device,
  });

  const FLOW = ['grab', 'letgo', 'nice', 'collect', 'collect-more', 'home', 'shop-open', 'wave', 'wave-warn', 'ready'];
  let last = performance.now();
  const t0 = last;
  const loop = (now: number) => {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const f = sandboxFrame(name === 'flow' ? FLOW[Math.floor((now - t0) / 2500) % FLOW.length] : name, device);
    if (closed) f.controlsCard = false;
    overlay.render(f, dt);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
