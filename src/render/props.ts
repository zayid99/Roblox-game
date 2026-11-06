import { Group, Matrix4, Mesh, MeshBasicMaterial, Vector3 } from 'three';
import type { Course, Island } from '../game/course';
import { Rng } from '../game/rng';
import { BoxBuilder } from './boxes';
import { islandMaterial } from './materials';
import type { Particles } from './particles';

type PropFn = (b: BoxBuilder, glow: BoxBuilder, x: number, y: number, z: number, rng: Rng) => void;

const rot = (x: number, y: number, z: number, ry: number, rz = 0, rx = 0) =>
  new Matrix4().makeRotationY(ry).multiply(new Matrix4().makeRotationZ(rz)).multiply(new Matrix4().makeRotationX(rx)).setPosition(x, y, z);

function octa(b: BoxBuilder, x: number, y: number, z: number, h: number, c: string, ry: number): void {
  // Elongated octahedron from two tapered box stacks.
  for (let i = 0; i < 4; i++) {
    const w = (0.45 - i * 0.1) * h * 0.5;
    b.box(0, 0, 0, w, h * 0.13, w, c, { matrix: rot(x, y + h * 0.5 + i * h * 0.13, z, ry) });
    b.box(0, 0, 0, w, h * 0.13, w, c, { matrix: rot(x, y + h * 0.5 - i * h * 0.13, z, ry) });
  }
}

/** §5.2c: prop A and prop B per zone. */
const PROPS: [PropFn, PropFn][] = [
  // Shallows: palm, shell pile.
  [
    (b, _g, x, y, z, rng) => {
      for (let i = 0; i < 4; i++) b.box(0, 0, 0, 0.35, 0.9, 0.35, i % 2 ? '#B07A3A' : '#8A5A28', { matrix: rot(x + i * 0.12, y + 0.45 + i * 0.88, z, 0, -0.14), ao: y });
      for (let k = 0; k < 5; k++) b.box(0, 0, 0, 1.6, 0.12, 0.5, k % 2 ? '#3FCB4B' : '#23963A', { matrix: rot(x + 0.5, y + 3.6, z, (k / 5) * Math.PI * 2 + rng.range(0, 0.4), -0.3).multiply(new Matrix4().makeTranslation(0.7, 0, 0)) });
    },
    (b, _g, x, y, z) => {
      b.box(x, y + 0.1, z, 0.5, 0.2, 0.4, '#FFD1C2', { ao: y });
      b.box(x + 0.35, y + 0.1, z + 0.2, 0.5, 0.2, 0.4, '#FF9AB6', { ao: y });
      b.box(x + 0.15, y + 0.3, z + 0.1, 0.45, 0.2, 0.35, '#FFF6E0');
    },
  ],
  // Coral Reef: coral branch, brain coral.
  [
    (b, _g, x, y, z) => {
      b.box(x, y + 0.6, z, 0.3, 1.2, 0.3, '#FF7A59', { ao: y });
      for (const [a, c] of [[-0.7, '#FF4F7B'], [0.7, '#FF7A59'], [0.2, '#FF4F7B']] as const) b.box(0, 0, 0, 0.2, 0.7, 0.2, c, { matrix: rot(x + Math.sin(a) * 0.35, y + 1.3, z + (a === 0.2 ? 0.25 : 0), 0, -a) });
    },
    (b, _g, x, y, z) => {
      b.box(x, y + 0.3, z, 1.0, 0.6, 1.0, '#FFB27A', { ao: y });
      for (let i = 0; i < 4; i++) b.box(x - 0.3 + i * 0.2, y + 0.61, z, 0.05, 0.02, 0.9, '#D9885A', { noOutline: true });
    },
  ],
  // Lagoon: kelp, lily pads (on the water at the island edge).
  [
    (b, _g, x, y, z) => {
      for (const [dx, h] of [[-0.3, 2.2], [0.1, 1.8], [0.4, 2.0]]) b.box(x + dx, y + h / 2, z + dx * 0.5, 0.2, h, 0.2, '#2E9E5B', { ao: y });
    },
    (b, _g, x, _y, z) => {
      for (const [dx, dz] of [[0, 0], [1.2, 0.4], [0.5, -1.0]]) b.box(x + dx, 0.08, z + dz, 1.2, 0.08, 1.2, '#59D36A');
      b.box(x + 0.1, 0.24, z, 0.25, 0.25, 0.25, '#FF9AB6');
    },
  ],
  // Stormy Seas: broken mast with a torn sail, dark rocks.
  [
    (b, _g, x, y, z) => {
      b.box(0, 0, 0, 0.4, 3.0, 0.4, '#6B4A2E', { matrix: rot(x, y + 1.45, z, 0.3, 0.26) });
      b.box(0, 0, 0, 1.4, 1.0, 0.05, '#D6DCE4', { matrix: rot(x - 0.55, y + 2.1, z + 0.2, 0.3, 0.26) });
    },
    (b, _g, x, y, z, rng) => {
      for (let i = 0; i < 3; i++) {
        const s = rng.range(0.6, 1.0);
        b.box(0, 0, 0, s, s * 0.8, s, i % 2 ? '#4A5566' : '#66758A', { matrix: rot(x + i * 0.6 - 0.6, y + s * 0.35, z + (i % 2) * 0.5, rng.range(0, 1)), ao: y });
      }
    },
  ],
  // Kraken Deep: tentacle arch, purple crystals.
  [
    (b, _g, x, y, z) => {
      for (let i = 0; i < 7; i++) {
        const a = (i / 6) * Math.PI;
        const px = x + Math.cos(a) * 1.5;
        const py = y + Math.sin(a) * 2.2 + 0.25;
        b.box(px, py, z, 0.5, 0.5, 0.5, '#8A6BFF');
        b.box(px, py - 0.05, z + 0.26, 0.14, 0.14, 0.02, '#C79BFF', { noOutline: true });
      }
    },
    (_b, g, x, y, z, rng) => {
      for (let i = 0; i < 3; i++) octa(g, x + i * 0.5 - 0.5, y, z + (i % 2) * 0.4, rng.range(1.2, 1.8), '#B065FF', rng.range(0, 1));
    },
  ],
  // Volcano Bay: lava crack strips (glow), smoking rock.
  [
    (_b, g, x, y, z) => {
      for (let i = 0; i < 3; i++) g.box(0, 0, 0, 1.5, 0.05, 0.2, '#FF7A1A', { matrix: rot(x + i * 0.3, y + 0.03, z + i * 0.45, 0.5 - i * 0.5) });
    },
    (b, _g, x, y, z) => {
      b.box(x, y + 0.35, z, 0.9, 0.7, 0.9, '#5A3A32', { ao: y });
    },
  ],
  // Secret Reef: glow crystals, star rock.
  [
    (_b, g, x, y, z, rng) => {
      for (let i = 0; i < 4; i++) octa(g, x + (i % 2) * 0.6 - 0.3, y, z + Math.floor(i / 2) * 0.6 - 0.3, rng.range(0.6, 1.4), '#54F2FF', rng.range(0, 1));
    },
    (b, _g, x, y, z) => {
      b.box(x, y + 0.25, z, 0.8, 0.5, 0.8, '#3A4A7A', { ao: y });
      b.box(x, y + 0.6, z, 0.2, 0.2, 0.2, '#FFF07A');
      for (const [dx, dz] of [[0.2, 0], [-0.2, 0], [0, 0.2], [0, -0.2]]) b.box(x + dx, y + 0.6, z + dz, 0.16, 0.12, 0.16, '#FFF07A');
    },
  ],
];

/** G7 zone props (P1): exactly 2 per island, one merged mesh per zone (+1 shared glow mesh). */
export class Props {
  readonly group = new Group();
  private readonly smokers: Vector3[] = [];
  private smokeT = 0;

  constructor(course: Course, edgeLines: boolean) {
    const rng = new Rng(course.seed ^ 0x9a0b);
    const glow = new BoxBuilder();
    const mat = islandMaterial(edgeLines);
    for (const zone of course.zones) {
      const b = new BoxBuilder({ faces: true });
      const kinds = PROPS[zone.index % PROPS.length];
      for (const isl of course.islands.filter((i) => i.zone === zone.index)) {
        for (let k = 0; k < 2; k++) {
          const at = this.spot(course, isl, k, rng);
          if (!at) continue;
          if (zone.index === 2 && k === 1) {
            // Lily pads float just off the island edge.
            const s = isl.solid;
            kinds[1](b, glow, at.x < (s.min.x + s.max.x) / 2 ? s.min.x - 2 : s.max.x + 2, 0, at.z, rng);
            continue;
          }
          kinds[k](b, glow, at.x, isl.solid.max.y, at.z, rng);
          if (zone.index === 5 && k === 1) this.smokers.push(new Vector3(at.x, isl.solid.max.y + 0.8, at.z));
        }
      }
      if (b.vertexCount === 0) continue;
      const mesh = new Mesh(b.build(), mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
    if (glow.vertexCount) this.group.add(new Mesh(glow.build(), new MeshBasicMaterial({ vertexColors: true, toneMapped: false })));
  }

  /** A spot on the island top ≥ 2 m from spawn points, the path line, the edges, towers and pads. */
  private spot(course: Course, isl: Island, k: number, rng: Rng): Vector3 | null {
    const s = isl.solid;
    const cx = (s.min.x + s.max.x) / 2;
    for (let tries = 0; tries < 24; tries++) {
      const side = (k === 0 ? -1 : 1) * (tries % 2 ? -1 : 1);
      const x = cx + side * rng.range(2.2, Math.max(2.3, (s.max.x - s.min.x) / 2 - 2));
      const z = rng.range(s.min.z + 2, s.max.z - 2);
      if (isl.spawnPoints.some((p) => Math.hypot(p.x - x, p.z - z) < 2.2)) continue;
      if (course.lighthouses.some((lh) => Math.hypot((lh.tower.min.x + lh.tower.max.x) / 2 - x, (lh.tower.min.z + lh.tower.max.z) / 2 - z) < 4)) continue;
      if (course.pads.some((p) => Math.hypot((p.min.x + p.max.x) / 2 - x, (p.min.z + p.max.z) / 2 - z) < 3)) continue;
      if ((course.springs ?? []).some((p) => Math.hypot(p.pos.x - x, p.pos.z - z) < 2.4)) continue;
      if (Math.abs(z - (s.max.z - 0.6)) < 2 && Math.abs(x - s.max.x) < 4) continue;
      return new Vector3(x, s.max.y, z);
    }
    return null;
  }

  /** Smoking rocks puff 2 grey puffs every 2 s near the player. */
  update(dt: number, player: Vector3, particles: Particles): void {
    this.smokeT += dt;
    if (this.smokeT < 2) return;
    this.smokeT = 0;
    for (const p of this.smokers) {
      if (Math.abs(p.z - player.z) > 80) continue;
      particles.emit(p.x, p.y, p.z, 0.2, 0.9, 0, '#9B8C8C', 0.6, 1.6, -0.1);
      particles.emit(p.x + 0.2, p.y + 0.2, p.z, -0.1, 0.8, 0.1, '#9B8C8C', 0.5, 1.6, -0.1);
    }
  }
}
