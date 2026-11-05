import './ui/style.css';
import { Game } from './Game';

function showError(message: string): void {
  const loading = document.getElementById('loading');
  if (!loading) return;
  loading.classList.remove('done');
  loading.innerHTML = `<div class="logo">Oops!</div><div style="max-width:80vw;text-align:center">${message}</div>`;
}

try {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const ui = document.getElementById('ui') as HTMLElement;
  const game = new Game(canvas, ui);
  game.start().catch((err: unknown) => {
    console.error(err);
    showError('Something went wrong while loading. Please refresh the page.');
  });
} catch (err) {
  console.error(err);
  showError('Your browser could not start 3D graphics (WebGL). Try another browser or enable hardware acceleration.');
}
