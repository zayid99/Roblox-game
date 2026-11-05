import {
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  TorusGeometry,
} from 'three';
import { HOME_TOP } from '../../game/config';
import { LIGHTHOUSE_TOP, MAX_PEDESTALS, type Anchor, type Course, type Island } from '../../game/course';
import { RARITIES } from '../../game/creatures';
import { Rng } from '../../game/rng';
import { BoxBuilder } from '../boxes';
import { signMesh } from '../labels';
import { vertexMaterial } from '../materials';

const HOOK_READY = new Color('#ffcf3a');
const HOOK_LOCKED = new Color('#6e7787');

function palm(b: BoxBuilder, x: number, y: number, z: number, rng: Rng): void {
  const h = rng.range(3.2, 4.6);
  const lean = rng.range(-0.25, 0.25);
  for (let i = 0; i < 4; i++) {
    const t = i / 4;
    b.box(x + lean * h * t, y + (h * (i + 0.5)) / 4, z, 0.42 - i * 0.04, h / 4 + 0.05, 0.42 - i * 0.04, i % 2 ? '#9a6b3f' : '#86592f');
  }
  const tx = x + lean * h;
  const ty = y + h;
  b.box(tx, ty + 0.1, z, 0.6, 0.4, 0.6, '#3f9e3a');
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    b.box(tx + dx * 0.95, ty - 0.05, z + dz * 0.95, dx ? 1.6 : 0.55, 0.16, dz ? 1.6 : 0.55, '#4cb846');
  }
  b.box(tx + 0.2, ty - 0.25, z + 0.15, 0.28, 0.28, 0.28, '#6b4423');
}

function tufts(b: BoxBuilder, island: Island, grass: Color, rng: Rng): void {
  const s = island.solid;
  const n = rng.int(3, 6);
  for (let i = 0; i < n; i++) {
    const x = rng.range(s.min.x + 0.8, s.max.x - 0.8);
    const z = rng.range(s.min.z + 0.8, s.max.z - 0.8);
    const flower = rng.chance(0.4);
    const c = flower ? rng.pick(['#ffe66d', '#ff8fab', '#ffffff', '#b38cff']) : grass.clone().multiplyScalar(0.8);
    b.box(x, s.max.y + 0.12, z, 0.25, 0.24, 0.25, c);
  }
}

function cloud(b: BoxBuilder, x: number, y: number, z: number, scale: number, rng: Rng): void {
  const n = rng.int(3, 5);
  for (let i = 0; i < n; i++) {
    const w = rng.range(2, 3.5) * scale;
    b.box(x + rng.range(-1.6, 1.6) * scale, y + rng.range(-0.3, 0.6) * scale, z + rng.range(-1, 1) * scale, w, rng.range(1, 1.8) * scale, w * 0.8, '#ffffff', {
      shadeBottom: 0.12,
    });
  }
}

export interface WorldVisuals {
  group: Group;
  hooks: InstancedMesh;
  pads: Mesh[];
  padMaterial: MeshLambertMaterial;
  lampMaterial: MeshBasicMaterial;
  /** Rebuilds pedestal visuals for a new unlocked count. */
  setPedestalCount(count: number): void;
  /** Colors hooks gold if the rope can reach them, grey if locked. */
  updateHooks(reach: number): void;
  update(time: number): void;
}

export function buildWorld(course: Course): WorldVisuals {
  const group = new Group();
  const rng = new Rng(course.seed ^ 0x5eed);
  const terrain = new BoxBuilder();
  const decor = new BoxBuilder();

  // Home island.
  const home = course.home;
  terrain.boxMinMax(home.min.x, -4, home.min.z, home.max.x, HOME_TOP - 0.5, home.max.z, '#e9d49c', { shadeBottom: 0.45 });
  terrain.boxMinMax(home.min.x - 0.05, HOME_TOP - 0.5, home.min.z - 0.05, home.max.x + 0.05, HOME_TOP, home.max.z + 0.05, '#86e05f');
  terrain.boxMinMax(home.min.x - 1.4, -0.3, home.min.z - 1.4, home.max.x + 1.4, 0.08, home.max.z + 1.4, '#ffffff');
  // A path of stepping tiles from spawn to the front edge.
  for (let z = home.min.z + 0.8; z < course.homeSpawn.z + 2; z += 1.6) decor.box(0, HOME_TOP + 0.03, z, 2.2, 0.06, 1.1, '#f3e2b3');
  for (const [x, z] of [[-14.5, 4.5], [14.5, 5.5], [-15, 29], [15, 28.5], [-13, 17], [13.5, 20]]) palm(decor, x, HOME_TOP, z + home.min.z - 2, rng);
  // Shop hut on the side.
  decor.boxMinMax(9, HOME_TOP, home.min.z + 3, 14, HOME_TOP + 2.6, home.min.z + 7, '#ffe0b2', { shadeBottom: 0.2 });
  decor.boxMinMax(8.6, HOME_TOP + 2.6, home.min.z + 2.6, 14.4, HOME_TOP + 3.1, home.min.z + 7.4, '#ff6b6b');
  decor.boxMinMax(10.6, HOME_TOP, home.min.z + 2.95, 12.4, HOME_TOP + 1.8, home.min.z + 3.0, '#8d5a2b');

  const homeSign = signMesh([{ text: 'HOME', size: 64, color: '#ffe66d' }, { text: 'Bring creatures here!', size: 30 }], 6, 2.6);
  homeSign.position.set(-8.5, HOME_TOP + 3.2, home.min.z + 4);
  homeSign.rotation.y = 0.35;
  group.add(homeSign);
  decor.box(-8.5, HOME_TOP + 0.95, home.min.z + 4, 0.25, 1.9, 0.25, '#8d5a2b');

  // Islands.
  for (const island of course.islands) {
    const def = course.zones[island.zone].def;
    const s = island.solid;
    const grass = new Color(def.grass);
    terrain.boxMinMax(s.min.x, -4, s.min.z, s.max.x, s.max.y - 0.5, s.max.z, def.rock, { shadeBottom: 0.5 });
    terrain.boxMinMax(s.min.x - 0.05, s.max.y - 0.5, s.min.z - 0.05, s.max.x + 0.05, s.max.y, s.max.z + 0.05, grass);
    // Grass drips down the sides.
    for (let i = 0; i < 4; i++) {
      const onX = rng.chance(0.5);
      const x = onX ? rng.range(s.min.x + 0.6, s.max.x - 0.6) : rng.pick([s.min.x - 0.03, s.max.x + 0.03]);
      const z = onX ? rng.pick([s.min.z - 0.03, s.max.z + 0.03]) : rng.range(s.min.z + 0.6, s.max.z - 0.6);
      terrain.box(x, s.max.y - 0.7, z, onX ? 0.8 : 0.12, 0.5, onX ? 0.12 : 0.8, grass);
    }
    terrain.boxMinMax(s.min.x - 0.9, -0.3, s.min.z - 0.9, s.max.x + 0.9, 0.08, s.max.z + 0.9, '#ffffff');
    tufts(decor, island, grass, rng);
    if (rng.chance(0.55)) {
      const x = rng.chance(0.5) ? s.min.x + 0.9 : s.max.x - 0.9;
      const z = rng.chance(0.5) ? s.min.z + 0.9 : s.max.z - 0.9;
      palm(decor, x, s.max.y, z, rng);
    }
  }

  // Zone signs on each zone's first island.
  for (const zone of course.zones) {
    const first = course.islands.find((i) => i.zone === zone.index)!;
    const s = first.solid;
    const rarity = RARITIES[zone.def.rarity];
    const lines = [
      { text: `ZONE ${zone.index + 1}: ${zone.def.name.toUpperCase()}`, size: 46, color: '#ffffff' },
      { text: `${rarity.name} creatures`, size: 40, color: rarity.color },
    ];
    if (zone.def.minReach > 0) lines.push({ text: `Hooks need Rope Reach ${zone.def.minReach} m`, size: 32, color: '#ffe66d' });
    const sign = signMesh(lines, 7, 2.8);
    const sx = s.max.x - 1.2 > 0 ? s.max.x - 0.6 : s.min.x + 0.6;
    sign.position.set(sx + (sx > 0 ? 2.6 : -2.6), s.max.y + 3.6, s.max.z - 0.6);
    group.add(sign);
    decor.box(sx, s.max.y + 1.2, s.max.z - 0.6, 0.25, 2.4, 0.25, '#8d5a2b');
  }

  // Lighthouses and launch pads.
  const pads: Mesh[] = [];
  const padMaterial = new MeshLambertMaterial({ color: '#2de2ff', emissive: new Color('#00b8ff'), emissiveIntensity: 0.6 });
  const lampMaterial = new MeshBasicMaterial({ color: '#fff3a0' });
  const lampBuilder = new BoxBuilder();
  for (const lh of course.lighthouses) {
    const t = lh.tower;
    const cx = (t.min.x + t.max.x) / 2;
    const cz = (t.min.z + t.max.z) / 2;
    const bands = 6;
    const bandH = (t.max.y - t.min.y) / bands;
    for (let i = 0; i < bands; i++) {
      decor.boxMinMax(t.min.x, t.min.y + i * bandH, t.min.z, t.max.x, t.min.y + (i + 1) * bandH, t.max.z, i % 2 ? '#ffffff' : '#ff4d4d');
    }
    const p = lh.platform;
    decor.boxMinMax(p.min.x, p.min.y, p.min.z, p.max.x, p.max.y, p.max.z, '#566173');
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1]]) decor.box(cx + dx * 1.9, LIGHTHOUSE_TOP + 0.45, cz + dz * 1.9, 0.12, 0.9, 0.12, '#ffffff');
    lampBuilder.box(cx + 1.4, LIGHTHOUSE_TOP + 0.65, cz + 1.4, 0.9, 1.3, 0.9, '#ffffff');
    decor.box(cx + 1.4, LIGHTHOUSE_TOP + 1.42, cz + 1.4, 1.2, 0.25, 1.2, '#ff4d4d');

    const pb = new BoxBuilder();
    const padCx = (lh.pad.min.x + lh.pad.max.x) / 2;
    const padCz = (lh.pad.min.z + lh.pad.max.z) / 2;
    pb.box(padCx, lh.pad.min.y + 0.06, padCz, 2.4, 0.12, 2.4, '#ffffff');
    const dir = Math.sign(cx - padCx);
    for (const k of [-0.5, 0.15]) pb.box(padCx + dir * k, lh.pad.min.y + 0.14, padCz, 0.3, 0.06, 1.2, '#003a66');
    const pad = new Mesh(pb.build(), padMaterial);
    pads.push(pad);
    group.add(pad);
  }
  group.add(new Mesh(lampBuilder.build(), lampMaterial));

  // Hooks: gold rings hanging from little clouds.
  const hookGeometry = new TorusGeometry(0.75, 0.17, 8, 18);
  const hooks = new InstancedMesh(hookGeometry, new MeshLambertMaterial({ color: '#ffffff', emissive: new Color('#3a2a00'), emissiveIntensity: 0.25 }), course.anchors.length);
  const m = new Matrix4();
  course.anchors.forEach((a, i) => {
    m.makeTranslation(a.pos.x, a.pos.y, a.pos.z);
    hooks.setMatrixAt(i, m);
    hooks.setColorAt(i, HOOK_LOCKED);
    decor.box(a.pos.x, a.pos.y + 1.55, a.pos.z, 0.1, 1.6, 0.1, '#4a4f5c');
    cloud(decor, a.pos.x, a.pos.y + 3, a.pos.z, 0.55, rng);
  });
  group.add(hooks);

  // Sky clouds and far-off mountains for depth.
  const sky = new BoxBuilder();
  for (let i = 0; i < 46; i++) {
    const side = rng.chance(0.5) ? -1 : 1;
    cloud(sky, side * rng.range(25, 220), rng.range(32, 75), rng.range(course.endZ - 150, 160), rng.range(2, 4.5), rng);
  }
  for (let i = 0; i < 18; i++) {
    const side = i % 2 ? -1 : 1;
    const x = side * rng.range(260, 420);
    const z = rng.range(course.endZ - 300, 300);
    const w = rng.range(40, 90);
    const h = rng.range(30, 80);
    sky.box(x, h / 2 - 2, z, w, h, w * rng.range(0.6, 1.2), '#8fb9d6', { shadeBottom: 0.25 });
    sky.box(x + rng.range(-8, 8), h + 4, z, w * 0.5, 16, w * 0.4, '#a9cce3');
  }
  group.add(new Mesh(sky.build(), vertexMaterial));

  // End of the course.
  const last = course.islands[course.islands.length - 1].solid;
  const endSign = signMesh(
    [
      { text: '🏁 END OF THE SEA', size: 52, color: '#ffe66d' },
      { text: '...for now! More zones coming soon.', size: 32 },
    ],
    8,
    2.6,
  );
  endSign.position.set((last.min.x + last.max.x) / 2, last.max.y + 4.5, last.min.z + 0.6);
  group.add(endSign);
  decor.box((last.min.x + last.max.x) / 2, last.max.y + 1.6, last.min.z + 0.6, 0.25, 3.2, 0.25, '#8d5a2b');

  group.add(new Mesh(terrain.build(), vertexMaterial));
  group.add(new Mesh(decor.build(), vertexMaterial));

  // Pedestals at home.
  let pedestalMesh: Mesh | null = null;
  const setPedestalCount = (count: number) => {
    if (pedestalMesh) {
      group.remove(pedestalMesh);
      pedestalMesh.geometry.dispose();
    }
    const b = new BoxBuilder();
    course.pedestals.slice(0, MAX_PEDESTALS).forEach((p, i) => {
      const open = i < count;
      b.box(p.x, p.y + 0.12, p.z, 2.4, 0.24, 2.4, open ? '#ffffff' : '#9aa3ad');
      b.box(p.x, p.y + 0.26, p.z, 1.9, 0.06, 1.9, open ? '#5fd3ff' : '#b8c0c9');
    });
    pedestalMesh = new Mesh(b.build(), vertexMaterial);
    group.add(pedestalMesh);
  };

  let lastReach = -1;
  const updateHooks = (reach: number) => {
    if (reach === lastReach) return;
    lastReach = reach;
    course.anchors.forEach((a: Anchor, i) => hooks.setColorAt(i, a.minReach <= reach + 1e-6 ? HOOK_READY : HOOK_LOCKED));
    if (hooks.instanceColor) hooks.instanceColor.needsUpdate = true;
  };

  const update = (time: number) => {
    padMaterial.emissiveIntensity = 0.45 + 0.35 * Math.sin(time * 5);
    lampMaterial.color.setHSL(0.14, 1, 0.75 + 0.15 * Math.sin(time * 3));
  };

  return { group, hooks, pads, padMaterial, lampMaterial, setPedestalCount, updateHooks, update };
}
