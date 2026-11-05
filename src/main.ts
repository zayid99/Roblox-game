// Tone mapping must be patched into three.js before any renderer or material exists (§10.7).
import './render/tonemap';
import { Game } from './Game';
import { loadFonts, logoSvg } from './ui/hud';

const loading = document.getElementById('loading');

function setProgress(f: number): void {
  const pct = `${Math.round(4 + Math.max(0, Math.min(1, f)) * 96)}%`;
  const fill = loading?.querySelector('.ld-fill') as HTMLElement | null;
  const knot = loading?.querySelector('.ld-knot') as HTMLElement | null;
  if (fill) fill.style.width = pct;
  if (knot) knot.style.left = pct;
}

function hideLoading(): void {
  if (!loading) return;
  loading.classList.add('done');
  window.setTimeout(() => loading.remove(), 400);
}

function showError(message: string): void {
  if (!loading) return;
  loading.classList.remove('done');
  loading.querySelector('.ld-bar')?.remove();
  const text = loading.querySelector('.ld-text');
  if (text) {
    text.className = 'ld-error';
    text.textContent = message;
  }
}

/** Module test pages (?sandbox=ui|render|audio|tutorial), split into their own chunks. */
const SANDBOXES: Record<string, () => Promise<{ runSandbox(root: HTMLElement): Promise<void> }>> = {
  ui: () => import('./ui/sandbox/index'),
  render: () => import('./render/sandbox/index'),
  audio: () => import('./audio/sandbox/index'),
  tutorial: () => import('./tutorial/sandbox/index'),
};

async function boot(): Promise<void> {
  const sandbox = new URLSearchParams(location.search).get('sandbox');
  if (sandbox && SANDBOXES[sandbox]) {
    loading?.remove();
    const root = document.getElementById('app') as HTMLElement;
    await (await SANDBOXES[sandbox]()).runSandbox(root);
    return;
  }

  setProgress(0.05);
  await loadFonts(1500);
  const logo = loading?.querySelector('.ld-logo') as HTMLElement | null;
  if (logo) {
    logo.innerHTML = logoSvg(520);
    logo.classList.add('on');
  }
  setProgress(0.15);

  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const ui = document.getElementById('ui') as HTMLElement;
  let game: Game;
  try {
    game = new Game(canvas, ui, setProgress);
  } catch (err) {
    console.error(err);
    showError('Your browser could not start 3D graphics (WebGL). Try another browser or enable hardware acceleration.');
    return;
  }
  try {
    await game.start();
    hideLoading();
  } catch (err) {
    console.error(err);
    const webgl = err instanceof Error && /webgl|context/i.test(err.message);
    showError(
      webgl
        ? 'Your browser could not start 3D graphics (WebGL). Try another browser or enable hardware acceleration.'
        : 'Something went wrong while loading. Please refresh the page.',
    );
  }
}

void boot();
