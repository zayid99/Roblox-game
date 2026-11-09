import { Matrix4, PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import type { Course } from '../src/game/course';
import { BoxBuilder } from '../src/render/boxes';
import { CameraRig } from '../src/render/camera';
import { GameplayObjects } from '../src/render/gameplayObjects';
import { loadFonts } from '../src/ui/fonts';

describe('CameraRig ground floor', () => {
  const run = (ground?: (x: number, z: number, y: number) => number) => {
    const rig = new CameraRig(new PerspectiveCamera(62, 16 / 9, 0.1, 1000));
    rig.pitch = -0.1; // lowest pitch, zoomed fully out: the lens sits below the player's feet
    rig.distance = 26;
    const focus = new Vector3(0, 6, 0); // standing on a 6 m island top
    for (let i = 0; i < 30; i++) rig.update(1 / 60, focus, new Vector3(), i / 60, false, 0, false, ground);
    return rig.camera.position.y;
  };

  it('keeps the lens above the island the player stands on', () => {
    const island = (x: number, z: number, y: number) => (Math.abs(x) < 30 && Math.abs(z) < 30 && y >= 6 ? 6 : 0);
    expect(run()).toBeLessThan(6); // old behaviour: inside the island
    expect(run(island)).toBeGreaterThanOrEqual(6.8 - 1e-6);
  });
});

describe('GameplayObjects crumble stones', () => {
  it('stay sunk on the frame the warning tint resets (no one-frame pop)', () => {
    const solid = { min: new Vector3(-1.2, 0, -1.2), max: new Vector3(1.2, 2.4, 1.2) };
    const course = { anchors: [], springs: [], stones: [{ id: 1, zone: 3, solid }] } as unknown as Course;
    const objects = new GameplayObjects(course);
    let state = { phase: 'shaking', t: 1.2 };
    const sim = { stoneState: () => state };
    const particles = { emit() {}, burst() {} } as never;
    const mesh = objects.group.children.find((c) => (c as { isInstancedMesh?: boolean }).isInstancedMesh) as unknown as {
      getMatrixAt(i: number, m: Matrix4): void;
    };
    const m = new Matrix4();
    const y = () => {
      mesh.getMatrixAt(0, m);
      return new Vector3().setFromMatrixPosition(m).y;
    };
    objects.update(1, 1 / 60, sim, 1, particles, new Vector3());
    state = { phase: 'sunk', t: 0.5 };
    objects.update(1.02, 1 / 60, sim, 1.02, particles, new Vector3());
    expect(y()).toBeCloseTo(2.4 - 7, 5);
  });
});

describe('BoxBuilder.merge', () => {
  it('merges builders bigger than an engine argument limit', () => {
    const a = new BoxBuilder();
    const b = new BoxBuilder();
    for (let i = 0; i < 1500; i++) b.box(i, 0, 0, 1, 1, 1, '#ffffff');
    a.merge(b);
    expect(a.vertexCount).toBe(1500 * 24);
  });
});

describe('loadFonts', () => {
  it('resolves (never rejects) without a FontFace API', async () => {
    await expect(loadFonts(50)).resolves.toBeUndefined();
  });
});
