// Keyboard, mouse and touch input in one place.
// Movement comes out camera-relative: moveX = right, moveY = forward, each -1..1.

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
const BLOCK_DEFAULT = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
const JOY_RADIUS = 60;

export class Input {
  moveX = 0;
  moveY = 0;
  jumpHeld = false;
  touchMode = false;
  /** Called on key presses that aren't movement (e.g. "KeyU"). */
  onKey: ((code: string) => void) | null = null;
  /** Called the first time the user interacts (to unlock audio). */
  onFirstGesture: (() => void) | null = null;

  private readonly keys = new Set<string>();
  private jumpPressed = false;
  private keyJump = false;
  private touchJump = false;
  private lookDX = 0;
  private lookDY = 0;
  private zoomDelta = 0;
  private lookPointer: number | null = null;
  private lastLook = { x: 0, y: 0 };
  private joyPointer: number | null = null;
  private joyOrigin = { x: 0, y: 0 };
  private joyVec = { x: 0, y: 0 };
  private gestured = false;
  private enabled = true;

  constructor(
    canvas: HTMLCanvasElement,
    private readonly joyBase: HTMLElement,
    private readonly joyKnob: HTMLElement,
  ) {
    this.touchMode = window.matchMedia?.('(pointer: coarse)').matches ?? false;
    window.addEventListener('keydown', (e) => this.keyDown(e));
    window.addEventListener('keyup', (e) => this.keyUp(e));
    window.addEventListener('blur', () => this.clear());
    canvas.addEventListener('pointerdown', (e) => this.pointerDown(e));
    window.addEventListener('pointermove', (e) => this.pointerMove(e));
    window.addEventListener('pointerup', (e) => this.pointerUp(e));
    window.addEventListener('pointercancel', (e) => this.pointerUp(e));
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoomDelta += e.deltaY;
    }, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** Jump button for touch screens. */
  bindJumpButton(button: HTMLElement): void {
    const down = (e: PointerEvent) => {
      e.preventDefault();
      this.gesture();
      this.touchMode = true;
      if (!this.touchJump) this.jumpPressed = true;
      this.touchJump = true;
      button.classList.add('pressed');
      button.setPointerCapture?.(e.pointerId);
    };
    const up = () => {
      this.touchJump = false;
      button.classList.remove('pressed');
    };
    button.addEventListener('pointerdown', down);
    button.addEventListener('pointerup', up);
    button.addEventListener('pointercancel', up);
    button.addEventListener('lostpointercapture', up);
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    if (!on) this.clear();
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

  consumeLook(): { dx: number; dy: number; zoom: number } {
    const out = { dx: this.lookDX, dy: this.lookDY, zoom: this.zoomDelta };
    this.lookDX = 0;
    this.lookDY = 0;
    this.zoomDelta = 0;
    return out;
  }

  private gesture(): void {
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
    this.joyVec = { x: 0, y: 0 };
    this.joyBase.classList.remove('active');
  }

  private keyDown(e: KeyboardEvent): void {
    if (BLOCK_DEFAULT.has(e.code)) e.preventDefault();
    this.gesture();
    if (e.repeat) return;
    if (e.code === 'KeyQ') this.lookDX -= 60;
    else if (e.code === 'KeyE') this.lookDX += 60;
    if (MOVE_KEYS[e.code]) this.keys.add(e.code);
    else if (JUMP_KEYS.has(e.code)) {
      if (!this.keyJump) this.jumpPressed = true;
      this.keyJump = true;
    } else this.onKey?.(e.code);
  }

  private keyUp(e: KeyboardEvent): void {
    if (BLOCK_DEFAULT.has(e.code)) e.preventDefault();
    this.keys.delete(e.code);
    if (JUMP_KEYS.has(e.code)) this.keyJump = false;
  }

  private pointerDown(e: PointerEvent): void {
    this.gesture();
    if (e.pointerType === 'touch') {
      this.touchMode = true;
      if (e.clientX < window.innerWidth * 0.45 && this.joyPointer === null) {
        this.joyPointer = e.pointerId;
        this.joyOrigin = { x: e.clientX, y: e.clientY };
        this.joyVec = { x: 0, y: 0 };
        this.joyBase.style.left = `${e.clientX}px`;
        this.joyBase.style.top = `${e.clientY}px`;
        this.joyKnob.style.transform = 'translate(-50%, -50%)';
        this.joyBase.classList.add('active');
        return;
      }
    }
    if (this.lookPointer === null) {
      this.lookPointer = e.pointerId;
      this.lastLook = { x: e.clientX, y: e.clientY };
    }
  }

  private pointerMove(e: PointerEvent): void {
    if (e.pointerId === this.joyPointer) {
      let dx = e.clientX - this.joyOrigin.x;
      let dy = e.clientY - this.joyOrigin.y;
      const len = Math.hypot(dx, dy);
      if (len > JOY_RADIUS) {
        dx = (dx / len) * JOY_RADIUS;
        dy = (dy / len) * JOY_RADIUS;
      }
      this.joyVec = { x: dx / JOY_RADIUS, y: -dy / JOY_RADIUS };
      this.joyKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
    } else if (e.pointerId === this.lookPointer) {
      const scale = e.pointerType === 'touch' ? 1.4 : 1;
      this.lookDX += (e.clientX - this.lastLook.x) * scale;
      this.lookDY += (e.clientY - this.lastLook.y) * scale;
      this.lastLook = { x: e.clientX, y: e.clientY };
    }
  }

  private pointerUp(e: PointerEvent): void {
    if (e.pointerId === this.joyPointer) {
      this.joyPointer = null;
      this.joyVec = { x: 0, y: 0 };
      this.joyBase.classList.remove('active');
    }
    if (e.pointerId === this.lookPointer) this.lookPointer = null;
  }
}
