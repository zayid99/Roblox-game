// Layout mode and desktop scale (spec §4.0).
import type { LayoutMode } from '../contracts';

export function pickLayout(w = window.innerWidth, h = window.innerHeight): LayoutMode {
  if (h > w) return 'portrait';
  if (Math.min(w, h) < 500) return 'landscape';
  return 'desktop';
}

/** Desktop zoom factor: clamp(.85, min(w/1280, h/720), 1.5). Phones use 1. */
export function desktopScale(w = window.innerWidth, h = window.innerHeight): number {
  return Math.min(1.5, Math.max(0.85, Math.min(w / 1280, h / 720)));
}

/** Watches the viewport and applies data-layout and --u to the root. */
export class LayoutWatcher {
  mode: LayoutMode;
  scale = 1;
  private readonly listeners: ((m: LayoutMode) => void)[] = [];

  constructor(
    private readonly root: HTMLElement,
    private readonly zoomed: HTMLElement,
  ) {
    this.mode = pickLayout();
    this.apply();
    window.addEventListener('resize', () => this.apply());
    window.addEventListener('orientationchange', () => setTimeout(() => this.apply(), 50));
  }

  onChange(fn: (m: LayoutMode) => void): void {
    this.listeners.push(fn);
  }

  apply(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const mode = pickLayout(w, h);
    const scale = mode === 'desktop' ? desktopScale(w, h) : 1;
    const changed = mode !== this.mode;
    this.mode = mode;
    this.scale = scale;
    this.root.dataset.layout = mode;
    this.root.classList.toggle('short', h < 360);
    this.root.style.setProperty('--u', String(scale));
    this.zoomed.style.setProperty('zoom', String(scale));
    if (changed) for (const l of this.listeners) l(mode);
  }
}
