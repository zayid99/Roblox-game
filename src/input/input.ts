// Keyboard, mouse and touch input in one place (spec §4.2, §10.2).
// Movement comes out camera-relative: moveX = right, moveY = forward, each -1..1.
// Movement keys are read by KeyboardEvent.code (physical WASD, so AZERTY's ZQSD works);
// letter hotkeys are forwarded with both code and key so callers can match on the printed key.

import type { ScreenPt } from '../contracts';

const MOVE_KEYS: Record<string, [number, number]> = {
  KeyW: [0, 1],
  ArrowUp: [0, 1],
  KeyS: [0, -1],
  ArrowDown: [0, -1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};
const JUMP_KEYS = new Set(['Space']);
const BLOCK_DEFAULT = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'F2', 'F3']);

/** Joystick geometry (§4.2): base radius 60, max travel 60, dead zone 12%. */
const JOY_RADIUS = 60;
const JOY_DEAD = 0.12;
/** Joystick spawn zone on the canvas: left 40% of the width, below 40% of the height. */
const JOY_ZONE_X = 0.4;
const JOY_ZONE_Y = 0.4;
/** A canvas tap: released within 250 ms and moved less than 10 px. */
const TAP_MS = 250;
const TAP_PX = 10;
/** Raw mouse counts to look units while the cursor is locked (drag uses 1 per pixel). */
const LOCK_SCALE = 0.45;

export type InputDevice = 'keyboard' | 'touch' | 'mouse';

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

export class Input {
  moveX = 0;
  moveY = 0;
  jumpHeld = false;
  touchMode = false;
  lastDevice: InputDevice = 'mouse';
  /** Non-movement key presses. Letters should be matched on `key` (case-insensitive), physical keys on `code`. */
  onKey: ((e: { code: string; key: string }) => void) | null = null;
  /** Short canvas tap (< 250 ms, < 10 px): pedestal or player pick. */
  onTap: ((p: ScreenPt) => void) | null = null;
  /** Called the first time the user interacts (to unlock audio). */
  onFirstGesture: (() => void) | null = null;
  /** performance.now() of the last input of any kind. */
  lastInputAt = 0;
  /** performance.now() of the last camera look input. */
  lastLookAt = 0;
  /** Cursor locked to the game: moving the mouse looks around (desktop mouse look). */
  locked = false;
  /** Lock state changed (show or hide the "Esc to free cursor" hint). */
  onLockChange: ((locked: boolean) => void) | null = null;

  private readonly keys = new Set<string>();
  private jumpPressed = false;
  private keyJump = false;
  private touchJump = false;
  private lookDX = 0;
  private lookDY = 0;
  private zoomDelta = 0;
  private lookPointer: number | null = null;
  private readonly lastLook = { x: 0, y: 0 };
  /** Reused by consumeLook() (read right away by the caller, never kept). */
  private readonly lookOut = { dx: 0, dy: 0, zoom: 0 };
  private tapStart: { id: number; x: number; y: number; t: number } | null = null;
  private joyPointer: number | null = null;
  private readonly joyOrigin = { x: 0, y: 0 };
  private readonly joyVec = { x: 0, y: 0 };
  private gestured = false;
  private enabled = true;
  private sens = 1;
  private invertY = false;
  private jumpButtons: HTMLElement[] = [];
  private mouseLook = true;
  private lockFailedAt = -1e9;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly joyBase: HTMLElement,
    private readonly joyKnob: HTMLElement,
  ) {
    this.touchMode = window.matchMedia?.('(pointer: coarse)').matches ?? false;
    if (this.touchMode) {
      this.lastDevice = 'touch';
      this.joyBase.classList.add('is-ghost');
    }
    window.addEventListener('keydown', (e) => this.keyDown(e));
    window.addEventListener('keyup', (e) => this.keyUp(e));
    window.addEventListener('blur', () => this.clear());
    // Mobile browsers can hide the page (app switch, lock screen) without a blur or the matching key/pointer ups.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.clear();
    });
    canvas.addEventListener('pointerdown', (e) => this.pointerDown(e));
    window.addEventListener('pointermove', (e) => this.pointerMove(e));
    window.addEventListener('pointerup', (e) => this.pointerUp(e));
    window.addEventListener('pointercancel', (e) => this.pointerUp(e, true));
    canvas.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.zoomDelta += e.deltaY;
        this.lastLookAt = this.lastInputAt = performance.now();
      },
      { passive: false },
    );
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === this.canvas;
      if (locked === this.locked) return;
      this.locked = locked;
      if (locked) this.lookPointer = null;
      this.onLockChange?.(locked);
    });
    document.addEventListener('pointerlockerror', () => {
      this.lockFailedAt = performance.now();
    });
  }

  /** Desktop mouse look (Settings): when on, a click on the game locks the cursor. */
  setMouseLook(on: boolean): void {
    this.mouseLook = on;
    if (!on) this.unlock();
  }

  /** Free the cursor (panels, menus, settings). */
  unlock(): void {
    if (this.locked && document.exitPointerLock) document.exitPointerLock();
  }

  private tryLock(): void {
    if (this.locked || !this.mouseLook || this.touchMode || !this.enabled) return;
    // Browsers refuse a re-lock right after Esc; don't spam them.
    if (performance.now() - this.lockFailedAt < 1200) return;
    const req = this.canvas.requestPointerLock as unknown as ((o?: object) => Promise<void> | void) | undefined;
    if (!req) return;
    try {
      const p = req.call(this.canvas);
      if (p && typeof (p as Promise<void>).catch === 'function') (p as Promise<void>).catch(() => (this.lockFailedAt = performance.now()));
    } catch {
      this.lockFailedAt = performance.now();
    }
  }

  /** Jump button for touch screens. It stays pressed while the thumb drifts (pointer capture). */
  bindJumpButton(button: HTMLElement): void {
    this.jumpButtons.push(button);
    const down = (e: PointerEvent) => {
      e.preventDefault();
      this.gesture();
      this.touchMode = true;
      this.device(e.pointerType);
      if (!this.enabled) return;
      if (!this.touchJump) this.jumpPressed = true;
      this.touchJump = true;
      button.classList.add('is-down');
      button.classList.add('pressed');
      try {
        button.setPointerCapture?.(e.pointerId);
      } catch {
        /* pointer already gone, or the cursor is locked: the button still works without capture */
      }
    };
    const up = () => {
      if (!this.touchJump) return;
      this.touchJump = false;
      button.classList.remove('is-down');
      button.classList.remove('pressed');
      // Release squash (C13): restart the animation class.
      button.classList.remove('is-release');
      void button.offsetWidth;
      button.classList.add('is-release');
    };
    button.addEventListener('pointerdown', down);
    button.addEventListener('pointerup', up);
    button.addEventListener('pointercancel', up);
    button.addEventListener('lostpointercapture', up);
  }

  /** Disabled input reports no movement or jumps (panels open, resume overlay). */
  setEnabled(on: boolean): void {
    if (this.enabled === on) return;
    this.enabled = on;
    if (!on) {
      this.clear();
      this.unlock();
    }
  }

  /** Camera sensitivity (0.5..2) and Y inversion from Settings. */
  setCameraPrefs(sens: number, invertY: boolean): void {
    this.sens = Math.min(2, Math.max(0.5, sens || 1));
    this.invertY = invertY;
  }

  /** Call once per frame before reading moveX/moveY/jumpHeld. */
  update(): void {
    let x = 0;
    let y = 0;
    for (const code of this.keys) {
      const v = MOVE_KEYS[code];
      if (v) {
        x += v[0];
        y += v[1];
      }
    }
    if (this.joyPointer !== null) {
      x += this.joyVec.x;
      y += this.joyVec.y;
    }
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    this.moveX = this.enabled ? x : 0;
    this.moveY = this.enabled ? y : 0;
    this.jumpHeld = this.enabled && (this.keyJump || this.touchJump);
  }

  consumeJumpPressed(): boolean {
    const p = this.jumpPressed && this.enabled;
    this.jumpPressed = false;
    return p;
  }

  /** The look input since the last call. The returned object is reused: read it right away. */
  consumeLook(): { readonly dx: number; readonly dy: number; readonly zoom: number } {
    const out = this.lookOut;
    out.dx = this.lookDX * this.sens;
    out.dy = this.lookDY * this.sens * (this.invertY ? -1 : 1);
    out.zoom = this.zoomDelta;
    this.lookDX = 0;
    this.lookDY = 0;
    this.zoomDelta = 0;
    return out;
  }

  private device(pointerType: string): void {
    this.lastInputAt = performance.now();
    if (pointerType === 'touch' || pointerType === 'pen') {
      this.lastDevice = 'touch';
      this.touchMode = true;
    } else this.lastDevice = 'mouse';
  }

  private gesture(): void {
    this.lastInputAt = performance.now();
    if (this.gestured) return;
    this.gestured = true;
    this.onFirstGesture?.();
  }

  private clear(): void {
    this.keys.clear();
    this.keyJump = false;
    this.touchJump = false;
    this.jumpPressed = false;
    this.joyPointer = null;
    this.lookPointer = null;
    this.tapStart = null;
    this.joyVec.x = this.joyVec.y = 0;
    this.joyBase.classList.remove('active');
    for (const b of this.jumpButtons) b.classList.remove('is-down', 'pressed');
  }

  private keyDown(e: KeyboardEvent): void {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    if (BLOCK_DEFAULT.has(e.code)) e.preventDefault();
    this.gesture();
    this.lastDevice = 'keyboard';
    // Auto-repeat of a held key re-arms it after a panel closed (clear() dropped it) without a new jump press.
    if (MOVE_KEYS[e.code]) {
      if (this.enabled) this.keys.add(e.code);
      return;
    }
    if (JUMP_KEYS.has(e.code)) {
      if (!this.enabled) return;
      if (!this.keyJump && !e.repeat) this.jumpPressed = true;
      this.keyJump = true;
      return;
    }
    if (e.repeat) return;
    if (e.code === 'Escape') this.unlock();
    if (this.enabled && e.code === 'KeyQ') this.addLook(-60, 0);
    else if (this.enabled && e.code === 'KeyE') this.addLook(60, 0);
    this.onKey?.({ code: e.code, key: e.key });
  }

  private keyUp(e: KeyboardEvent): void {
    if (BLOCK_DEFAULT.has(e.code)) e.preventDefault();
    this.keys.delete(e.code);
    if (JUMP_KEYS.has(e.code)) this.keyJump = false;
  }

  private addLook(dx: number, dy: number): void {
    this.lookDX += dx;
    this.lookDY += dy;
    this.lastLookAt = performance.now();
  }

  private pointerDown(e: PointerEvent): void {
    this.gesture();
    this.device(e.pointerType);
    if (e.pointerType === 'mouse') {
      if (this.locked) {
        // Locked cursor: a click picks whatever is under the screen centre.
        this.tapStart = { id: e.pointerId, x: window.innerWidth / 2, y: window.innerHeight / 2, t: performance.now() };
        return;
      }
      if (e.button === 0) this.tryLock();
    }
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (this.tapStart === null) this.tapStart = { id: e.pointerId, x: e.clientX, y: e.clientY, t: performance.now() };
    if (e.pointerType === 'touch' && this.enabled) {
      if (e.clientX < w * JOY_ZONE_X && e.clientY > h * JOY_ZONE_Y && this.joyPointer === null) {
        this.joyPointer = e.pointerId;
        this.joyOrigin.x = e.clientX;
        this.joyOrigin.y = e.clientY;
        this.joyVec.x = this.joyVec.y = 0;
        this.joyBase.classList.remove('is-ghost');
        this.joyBase.style.left = `${e.clientX}px`;
        this.joyBase.style.top = `${e.clientY}px`;
        this.joyKnob.style.transform = 'translate(-50%, -50%)';
        this.joyBase.classList.add('active');
        this.tapStart = null;
        return;
      }
    }
    if (this.lookPointer === null) {
      this.lookPointer = e.pointerId;
      this.lastLook.x = e.clientX;
      this.lastLook.y = e.clientY;
      try {
        this.canvas.setPointerCapture?.(e.pointerId);
      } catch {
        /* the pointer is being locked */
      }
    }
  }

  private pointerMove(e: PointerEvent): void {
    if (this.locked && e.pointerType === 'mouse') {
      if (this.enabled) this.addLook(e.movementX * LOCK_SCALE, e.movementY * LOCK_SCALE);
      this.lastInputAt = performance.now();
      return;
    }
    if (e.pointerId === this.joyPointer) {
      let dx = e.clientX - this.joyOrigin.x;
      let dy = e.clientY - this.joyOrigin.y;
      const len = Math.hypot(dx, dy);
      if (len > JOY_RADIUS) {
        dx = (dx / len) * JOY_RADIUS;
        dy = (dy / len) * JOY_RADIUS;
      }
      const n = Math.min(1, len / JOY_RADIUS);
      const mag = smoothstep(JOY_DEAD, 1, n);
      const k = len > 0 ? mag / Math.max(1e-6, n) / JOY_RADIUS : 0;
      this.joyVec.x = dx * k;
      this.joyVec.y = -dy * k;
      this.joyKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      this.lastInputAt = performance.now();
    } else if (e.pointerId === this.lookPointer) {
      const scale = e.pointerType === 'touch' ? 1.4 : 1;
      const dx = e.clientX - this.lastLook.x;
      const dy = e.clientY - this.lastLook.y;
      if (this.tapStart && this.tapStart.id === e.pointerId) {
        if (Math.hypot(e.clientX - this.tapStart.x, e.clientY - this.tapStart.y) >= TAP_PX) this.tapStart = null;
      }
      if (this.enabled) this.addLook(dx * scale, dy * scale);
      this.lastLook.x = e.clientX;
      this.lastLook.y = e.clientY;
      this.lastInputAt = performance.now();
    }
  }

  private pointerUp(e: PointerEvent, cancelled = false): void {
    if (e.pointerId === this.joyPointer) {
      this.joyPointer = null;
      this.joyVec.x = this.joyVec.y = 0;
      this.joyBase.classList.remove('active');
    }
    if (e.pointerId === this.lookPointer) this.lookPointer = null;
    const tap = this.tapStart;
    if (tap && tap.id === e.pointerId) {
      this.tapStart = null;
      const quick = performance.now() - tap.t < TAP_MS;
      const still = this.locked || Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < TAP_PX;
      if (!cancelled && quick && still && this.enabled) this.onTap?.(this.locked ? { x: tap.x, y: tap.y } : { x: e.clientX, y: e.clientY });
    }
  }
}
