// Tiny DOM helpers shared by every UI part (spec §2.1, C1).

export type UiSoundId = 'ui.click' | 'ui.hover' | 'ui.open' | 'ui.close' | 'ui.tab' | 'ui.denied' | 'toast' | 'coinTick';
type SoundFn = (id: UiSoundId, i?: number) => void;

let soundFn: SoundFn = () => {};
let reduceMotion = false;

/** The Hud installs its sound hook here so pressable() can click without a reference. */
export function setUiSound(fn: SoundFn): void {
  soundFn = fn;
}
export function uiSound(id: UiSoundId, i?: number): void {
  soundFn(id, i);
}
export function setReducedMotion(on: boolean): void {
  reduceMotion = on;
  document.documentElement.classList.toggle('reduce-motion', on);
}
export function isReducedMotion(): boolean {
  return reduceMotion;
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls = '', html = ''): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html) e.innerHTML = html;
  return e;
}

/** Writes textContent and data-text together (the layered .t-grad stroke copy reads data-text). */
export function setText(e: HTMLElement, text: string): void {
  if (e.dataset.text === text && e.textContent === text) return;
  e.dataset.text = text;
  if (e.firstElementChild && e.firstElementChild.tagName === 'SPAN' && e.classList.contains('t-grad')) {
    (e.firstElementChild as HTMLElement).textContent = text;
  } else e.textContent = text;
}

/** Gradient text node: <span class="t-grad" data-text><span>text</span></span>. */
export function gradText(text: string, cls = ''): string {
  const t = escapeHtml(text);
  return `<span class="t-grad ${cls}" data-text="${t}"><span>${t}</span></span>`;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
}

/** Restart a one-shot CSS animation class. */
export function replay(e: Element, cls: string): void {
  e.classList.remove(cls);
  void (e as HTMLElement).offsetWidth;
  e.classList.add(cls);
}

export interface PressOpts {
  /** Hold-to-repeat: after 400 ms, fire every 120 ms until onActivate returns false. */
  repeat?: boolean;
  /** Sound on press (default ui.click). */
  sound?: UiSoundId | null;
  /** Fire on pointerdown instead of pointerup (tabs). */
  onDown?: boolean;
}

let lastHover = 0;

/**
 * Press behaviour for every button (C1): .is-down on pointerdown with pointer capture, click
 * sound, activation on pointerup inside the rect + 12px, hover sound throttled to 60 ms.
 */
export function pressable(e: HTMLElement, onActivate: () => boolean | void, opts: PressOpts = {}): void {
  let down = false;
  let repeatTimer = 0;
  let repeated = false;
  const stopRepeat = () => {
    if (repeatTimer) window.clearTimeout(repeatTimer);
    repeatTimer = 0;
  };
  const inside = (ev: PointerEvent) => {
    const r = e.getBoundingClientRect();
    return ev.clientX >= r.left - 12 && ev.clientX <= r.right + 12 && ev.clientY >= r.top - 12 && ev.clientY <= r.bottom + 12;
  };
  e.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0) return;
    ev.stopPropagation();
    down = true;
    repeated = false;
    e.classList.add('is-down');
    e.setPointerCapture?.(ev.pointerId);
    if (opts.sound !== null) uiSound(opts.sound ?? 'ui.click');
    if (opts.onDown) {
      onActivate();
      return;
    }
    if (opts.repeat) {
      const tick = () => {
        repeated = true;
        if (onActivate() === false) return stopRepeat();
        repeatTimer = window.setTimeout(tick, 120);
      };
      repeatTimer = window.setTimeout(tick, 400);
    }
  });
  e.addEventListener('pointermove', (ev) => {
    if (down && opts.repeat && repeatTimer && !inside(ev)) stopRepeat();
  });
  const end = (ev: PointerEvent, cancel: boolean) => {
    if (!down) return;
    down = false;
    stopRepeat();
    e.classList.remove('is-down');
    if (!cancel && !opts.onDown && !repeated && inside(ev)) onActivate();
  };
  e.addEventListener('pointerup', (ev) => end(ev, false));
  e.addEventListener('pointercancel', (ev) => end(ev, true));
  e.addEventListener('pointerenter', (ev) => {
    if (ev.pointerType !== 'mouse') return;
    const now = performance.now();
    if (now - lastHover > 60) {
      lastHover = now;
      uiSound('ui.hover');
    }
  });
}

/** Denied feedback: shake ±6px 3x over 240 ms and the denied sound. */
export function deny(e: HTMLElement): void {
  uiSound('ui.denied');
  if (!reduceMotion) replay(e, 'fx-shake');
}

export function fmtClock(sec: number): string {
  const t = Math.max(0, Math.ceil(sec));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

/** "7h 12m", "12m", "45s". */
export function fmtDuration(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}
