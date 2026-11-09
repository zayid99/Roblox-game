// Input edge cases with a tiny fake DOM (node environment): held keys across a pause, hidden pages,
// pointer capture that throws, and the reused look object.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Input } from '../src/input/input';

class FakeEl extends EventTarget {
  readonly classes = new Set<string>();
  readonly classList = {
    add: (...c: string[]) => c.forEach((x) => this.classes.add(x)),
    remove: (...c: string[]) => c.forEach((x) => this.classes.delete(x)),
    contains: (c: string) => this.classes.has(c),
  };
  readonly style: Record<string, string> = {};
  offsetWidth = 0;
  captureThrows = false;
  setPointerCapture(): void {
    if (this.captureThrows) throw new Error('NotFoundError');
  }
  requestPointerLock(): void {}
}

const g = globalThis as unknown as Record<string, unknown>;
let win: EventTarget;
let doc: EventTarget & { hidden: boolean; pointerLockElement: unknown; exitPointerLock(): void };

beforeEach(() => {
  win = Object.assign(new EventTarget(), {
    innerWidth: 1280,
    innerHeight: 720,
    matchMedia: () => ({ matches: false }),
  });
  doc = Object.assign(new EventTarget(), { hidden: false, pointerLockElement: null, exitPointerLock() {} });
  g.window = win;
  g.document = doc;
});
afterEach(() => {
  delete g.window;
  delete g.document;
});

function key(type: 'keydown' | 'keyup', code: string, repeat = false): Event {
  const e = new Event(type, { cancelable: true });
  Object.assign(e, { code, key: code.replace(/^Key/, '').toLowerCase(), repeat });
  return e;
}

function pointer(type: string, pointerId: number, pointerType = 'touch', x = 1000, y = 600): Event {
  const e = new Event(type, { cancelable: true });
  Object.assign(e, { pointerId, pointerType, clientX: x, clientY: y, button: 0 });
  return e;
}

function make(): { input: Input; canvas: FakeEl; jump: FakeEl } {
  const canvas = new FakeEl();
  const input = new Input(canvas as unknown as HTMLCanvasElement, new FakeEl() as unknown as HTMLElement, new FakeEl() as unknown as HTMLElement);
  const jump = new FakeEl();
  input.bindJumpButton(jump as unknown as HTMLElement);
  return { input, canvas, jump };
}

describe('Input', () => {
  it('a key still held when a panel closes moves again on its auto-repeat (no new jump press)', () => {
    const { input } = make();
    win.dispatchEvent(key('keydown', 'KeyW'));
    win.dispatchEvent(key('keydown', 'Space'));
    input.update();
    expect(input.moveY).toBe(1);
    expect(input.consumeJumpPressed()).toBe(true);

    input.setEnabled(false); // panel opens: everything is released
    input.setEnabled(true); // panel closes, W and Space still physically down
    input.update();
    expect(input.moveY).toBe(0);
    expect(input.jumpHeld).toBe(false);

    win.dispatchEvent(key('keydown', 'KeyW', true));
    win.dispatchEvent(key('keydown', 'Space', true));
    input.update();
    expect(input.moveY).toBe(1);
    expect(input.jumpHeld).toBe(true);
    expect(input.consumeJumpPressed()).toBe(false);
  });

  it('auto-repeat never fires hotkeys twice', () => {
    const { input } = make();
    const keys: string[] = [];
    input.onKey = (e) => keys.push(e.code);
    win.dispatchEvent(key('keydown', 'KeyU'));
    win.dispatchEvent(key('keydown', 'KeyU', true));
    expect(keys).toEqual(['KeyU']);
  });

  it('a hidden page releases held keys and the jump button', () => {
    const { input, jump } = make();
    win.dispatchEvent(key('keydown', 'KeyD'));
    jump.dispatchEvent(pointer('pointerdown', 7));
    input.update();
    expect(input.moveX).toBe(1);
    expect(input.jumpHeld).toBe(true);
    doc.hidden = true;
    doc.dispatchEvent(new Event('visibilitychange'));
    input.update();
    expect(input.moveX).toBe(0);
    expect(input.jumpHeld).toBe(false);
  });

  it('the jump button works when pointer capture throws', () => {
    const { input, jump } = make();
    jump.captureThrows = true;
    expect(() => jump.dispatchEvent(pointer('pointerdown', 3))).not.toThrow();
    input.update();
    expect(input.jumpHeld).toBe(true);
    expect(input.consumeJumpPressed()).toBe(true);
    jump.dispatchEvent(pointer('pointerup', 3));
    input.update();
    expect(input.jumpHeld).toBe(false);
  });

  it('touch joystick and look drag on two fingers at once', () => {
    const { input, canvas } = make();
    canvas.dispatchEvent(pointer('pointerdown', 1, 'touch', 200, 600)); // joystick zone
    canvas.dispatchEvent(pointer('pointerdown', 2, 'touch', 1000, 300)); // look
    win.dispatchEvent(pointer('pointermove', 1, 'touch', 200, 540)); // push up 60 px
    win.dispatchEvent(pointer('pointermove', 2, 'touch', 1010, 300));
    input.update();
    expect(input.moveY).toBeCloseTo(1, 5);
    const look = input.consumeLook();
    expect(look.dx).toBeGreaterThan(0);
    win.dispatchEvent(pointer('pointerup', 1, 'touch', 200, 540));
    input.update();
    expect(input.moveY).toBe(0);
  });

  it('consumeLook reuses one object and resets the deltas', () => {
    const { input } = make();
    win.dispatchEvent(key('keydown', 'KeyE'));
    const a = input.consumeLook();
    expect(a.dx).toBe(60);
    const b = input.consumeLook();
    expect(b).toBe(a);
    expect(b.dx).toBe(0);
  });
});
