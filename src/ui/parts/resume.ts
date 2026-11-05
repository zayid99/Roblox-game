// C22 resume overlay ("TAP TO PLAY"): resumes audio inside a real user gesture.
import { el } from '../dom';
import { icon } from '../icons';

export class ResumePart {
  readonly el: HTMLElement;
  private onResume: (() => void) | null = null;
  private readonly onKey = (e: KeyboardEvent) => {
    e.preventDefault();
    this.dismiss();
  };

  constructor() {
    this.el = el('div', 'resume');
    this.el.innerHTML = `<div class="rs-btn">${icon('play', 56)}</div><div class="rs-txt t-stroke">TAP TO PLAY</div>`;
    this.el.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      this.dismiss();
    });
  }

  get shown(): boolean {
    return this.onResume !== null;
  }

  show(onResume: () => void): void {
    this.onResume = onResume;
    this.el.classList.add('on');
    window.addEventListener('keydown', this.onKey, { capture: true, once: true });
  }

  private dismiss(): void {
    const cb = this.onResume;
    if (!cb) return;
    this.onResume = null;
    window.removeEventListener('keydown', this.onKey, { capture: true });
    this.el.classList.remove('on');
    cb();
  }
}
