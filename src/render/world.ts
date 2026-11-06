import {
  AdditiveBlending,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DoubleSide,
  DynamicDrawUsage,
  Euler,
  Float32BufferAttribute,
  Group,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  MeshToonMaterial,
  Quaternion,
  RepeatWrapping,
  RingGeometry,
  ShaderMaterial,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  TorusGeometry,
  Vector3,
  type WebGLProgramParametersWithUniforms,
} from 'three';
import { HOME_FRONT_Z, HOME_TOP } from '../game/config';
import { LIGHTHOUSE_TOP, MAX_PEDESTALS, type AABB, type Course, type Island } from '../game/course';
import { RARITIES } from '../game/creatures';
import { Rng } from '../game/rng';
import { BoxBuilder } from './boxes';
import { drawBoard, drawLines, SignAtlas, textTexture } from './labels';
import { inkMaterial, islandMaterial, sharedTime, toonGradient, toonVertexMaterial } from './materials';

const HOOK_READY = new Color('#FFC92E');
const HOOK_LOCKED = new Color('#6E7787');
const HOOK_HOT = new Color(1.7, 1.45, 0.75);
const BEAM_CALM = new Color('#FFF2A8');
const BEAM_DANGER = new Color('#FF5A5F');

const tmpC = new Color();
const tmpM = new Matrix4();
const tmpM2 = new Matrix4();
const tmpQ = new Quaternion();
const tmpE = new Euler();
const tmpV = new Vector3();
const tmpS = new Vector3();
const ONE = new Vector3(1, 1, 1);

const shade = (hex: string | Color, k: number): Color => new Color(hex).multiplyScalar(k);

export interface WorldOptions {
  edgeLines: boolean;
  hookOutline: boolean;
}

export interface WorldFrame {
  time: number;
  dt: number;
  /** Anchor id the player would grab (-1 none). */
  targetId: number;
  /** 0 calm → 1 wave warning/surge (lighthouse beam colour). */
  danger: number;
  player: Vector3;
  /** Green upgrade arrow over the shop stall. */
  shopArrow: boolean;
  reach: number;
}

// ---------- Static builders ----------

function palm(b: BoxBuilder, x: number, y: number, z: number, rng: Rng, sway: number[]): void {
  const start = b.vertexCount;
  const h = rng.range(3.4, 4.8);
  const lean = rng.range(-0.22, 0.22);
  for (let i = 0; i < 4; i++) {
    const t = i / 4;
    b.box(x + lean * h * t, y + (h * (i + 0.5)) / 4, z, 0.42 - i * 0.04, h / 4 + 0.05, 0.42 - i * 0.04, i % 2 ? '#B07A3A' : '#8A5A28', { ao: y });
  }
  const tx = x + lean * h;
  const ty = y + h;
  b.box(tx, ty + 0.1, z, 0.6, 0.4, 0.6, '#2E9E3F');
  const leaf = new Matrix4();
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2 + rng.range(0, 0.6);
    leaf.makeRotationY(a).multiply(tmpM2.makeRotationZ(-0.28)).setPosition(tx + Math.cos(a) * 0.85, ty - 0.1, z - Math.sin(a) * 0.85);
    b.box(0, 0, 0, 1.7, 0.13, 0.52, '#3FCB4B', { matrix: leaf, shadeBottom: 0.35 });
  }
  b.box(tx + 0.2, ty - 0.22, z + 0.15, 0.26, 0.26, 0.26, '#6B4423');
  b.box(tx - 0.18, ty - 0.25, z - 0.12, 0.24, 0.24, 0.24, '#6B4423');
  const phase = rng.range(0, 6.28);
  for (let i = start; i < b.vertexCount; i++) sway.push(y, h, phase);
}

function tufts(b: BoxBuilder, s: AABB, grass: Color, rng: Rng): void {
  const n = rng.int(4, 7);
  for (let i = 0; i < n; i++) {
    const x = rng.range(s.min.x + 0.8, s.max.x - 0.8);
    const z = rng.range(s.min.z + 0.8, s.max.z - 0.8);
    const flower = rng.chance(0.4);
    const c = flower ? rng.pick(['#FFE66D', '#FF8FAB', '#FFFFFF', '#B38CFF']) : grass.clone().multiplyScalar(0.8);
    b.box(x, s.max.y + 0.12, z, 0.24, 0.24, 0.24, c, { ao: s.max.y });
    if (!flower) b.box(x + 0.16, s.max.y + 0.08, z + 0.05, 0.16, 0.16, 0.16, c, { ao: s.max.y });
  }
}

/** Zone grass colours, calmed slightly so the grade's saturation boost stays toy-like rather than neon. */
function toyGrass(hex: string): Color {
  const c = new Color(hex);
  const l = c.r * 0.2126 + c.g * 0.7152 + c.b * 0.0722;
  return c.lerp(new Color(l, l, l), 0.14).multiplyScalar(0.9);
}

/** G7 island: strata, ledges, grass lip with a dark underside, drips, boulders and a wet line. */
function island(b: BoxBuilder, s: AABB, grassHex: string, rockHex: string, rng: Rng): void {
  const x0 = s.min.x;
  const x1 = s.max.x;
  const z0 = s.min.z;
  const z1 = s.max.z;
  const top = s.max.y;
  const rock = new Color(rockHex);
  const light = rock.clone();
  const mid = shade(rock, 0.86);
  const dark = shade(rock, 0.72);
  const grass = toyGrass(grassHex);
  const capY = top - 0.5;
  const b1 = 0.4;
  const b2 = b1 + (capY - b1) * 0.45;
  b.boxMinMax(x0, -4, z0, x1, b1, z1, dark);
  b.boxMinMax(x0, b1, z0, x1, b2, z1, mid);
  b.boxMinMax(x0, b2, z0, x1, capY, z1, light);
  // Wet line: .4 m band, 25% darker.
  b.boxMinMax(x0 - 0.03, -0.15, z0 - 0.03, x1 + 0.03, 0.4, z1 + 0.03, shade(rock, 0.55), { noOutline: true });
  // Ledges break the rectangle.
  const ledges = rng.int(2, 4);
  for (let i = 0; i < ledges; i++) {
    const out = rng.range(0.5, 1.2);
    const h = rng.range(0.8, Math.max(1, capY - 1.4));
    const yTop = rng.range(Math.min(capY - 1, 1.2 + h * 0.4), capY - 0.9);
    const yBot = Math.max(-0.2, yTop - h);
    const w = rng.range(2, 4);
    const sideK = rng.int(0, 3);
    const c = rng.chance(0.5) ? mid : dark;
    if (sideK < 2) {
      const x = sideK === 0 ? x0 - out / 2 + 0.2 : x1 + out / 2 - 0.2;
      const z = rng.range(z0 + w / 2, Math.max(z0 + w / 2, z1 - w / 2));
      b.box(x, (yTop + yBot) / 2, z, out + 0.4, yTop - yBot, w, c, { topColor: shade(grass, 0.9) });
    } else {
      const z = sideK === 2 ? z0 - out / 2 + 0.2 : z1 + out / 2 - 0.2;
      const x = rng.range(x0 + w / 2, Math.max(x0 + w / 2, x1 - w / 2));
      b.box(x, (yTop + yBot) / 2, z, w, yTop - yBot, out + 0.4, c, { topColor: shade(grass, 0.9) });
    }
  }
  // Grass cap with a .15 m overhang lip and a darker underside.
  b.boxMinMax(x0 - 0.15, capY, z0 - 0.15, x1 + 0.15, top, z1 + 0.15, grass, { shadeBottom: 0.45, sideColor: shade(grass, 0.88) });
  // Grass drips.
  const drips = rng.int(8, 12);
  for (let i = 0; i < drips; i++) {
    const onX = rng.chance(0.5);
    const len = rng.range(0.3, 0.9);
    const w = rng.range(0.4, 1.0);
    const x = onX ? rng.range(x0 + 0.6, x1 - 0.6) : rng.pick([x0 - 0.1, x1 + 0.1]);
    const z = onX ? rng.pick([z0 - 0.1, z1 + 0.1]) : rng.range(z0 + 0.6, z1 - 0.6);
    b.box(x, capY - len / 2 + 0.05, z, onX ? w : 0.14, len, onX ? 0.14 : w, shade(grass, 0.82), { noOutline: true });
  }
  // Boulders on the cliff faces.
  const boulders = rng.int(2, 4);
  for (let i = 0; i < boulders; i++) {
    const r = rng.range(0.5, 1.2);
    const onX = rng.chance(0.5);
    const x = onX ? rng.range(x0 + 1, x1 - 1) : rng.pick([x0 - r * 0.3, x1 + r * 0.3]);
    const z = onX ? rng.pick([z0 - r * 0.3, z1 + r * 0.3]) : rng.range(z0 + 1, z1 - 1);
    const m = new Matrix4().makeRotationFromEuler(tmpE.set(rng.range(-0.3, 0.3), rng.range(0, 1.5), rng.range(-0.3, 0.3)));
    m.setPosition(x, rng.range(0.1, 0.9), z);
    b.box(0, 0, 0, r, r * 0.8, r, dark, { matrix: m });
  }
}

function chevronTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, 64, 64);
  g.strokeStyle = '#FFFFFF';
  g.lineWidth = 11;
  g.lineJoin = 'miter';
  g.beginPath();
  g.moveTo(10, 44);
  g.lineTo(32, 20);
  g.lineTo(54, 44);
  g.stroke();
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping;
  t.colorSpace = SRGBColorSpace;
  return t;
}

function lockPlaqueTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d')!;
  drawBoard(g, 0, 0, 128, 128, '#2A3550');
  // Padlock.
  g.fillStyle = '#1B1736';
  g.fillRect(38, 46, 52, 40);
  g.fillStyle = '#FFC92E';
  g.fillRect(42, 50, 44, 32);
  g.strokeStyle = '#1B1736';
  g.lineWidth = 9;
  g.beginPath();
  g.arc(64, 46, 14, Math.PI, 0);
  g.stroke();
  g.fillStyle = '#1B1736';
  g.fillRect(61, 60, 6, 12);
  drawLines(g, [{ text: 'SHOP', size: 20, color: '#FFFFFF' }], 0, 88, 128, 30);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

function beamMaterial(): ShaderMaterial {
  return new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
    uniforms: { uColor: { value: BEAM_CALM.clone() } },
    vertexShader: /* glsl */ `
      varying float vAlong;
      void main() {
        vAlong = position.x / 30.0;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      varying float vAlong;
      void main() {
        float a = pow(1.0 - clamp(vAlong, 0.0, 1.0), 1.6) * 0.32;
        gl_FragColor = vec4(uColor * a, a);
        #include <colorspace_fragment>
      }`,
  });
}

function hookChainGeometry(): BufferGeometry {
  const b = new BoxBuilder();
  for (let i = 0; i < 3; i++) {
    const m = new Matrix4().makeRotationY(i % 2 ? Math.PI / 2 : 0);
    m.setPosition(0, 1.12 + i * 0.3, 0);
    b.box(0, 0, 0, 0.16, 0.34, 0.05, '#C7CCD6', { matrix: m });
  }
  return b.build();
}

function balloonGeometry(): BufferGeometry {
  const b = new BoxBuilder();
  const widths = [0.45, 0.8, 0.95, 0.95, 0.8, 0.5];
  widths.forEach((w, i) => b.box(0, 2.15 + i * 0.2, 0, w, 0.2, w, i % 2 ? '#FFFFFF' : '#FF4D5E'));
  b.box(0, 3.4, 0, 0.18, 0.12, 0.18, '#FFFFFF');
  return b.build();
}

function upgradeArrowGeometry(): { body: BufferGeometry; hull: BufferGeometry } {
  const b = new BoxBuilder();
  b.box(0, -0.35, 0, 0.4, 0.7, 0.18, '#46D46A');
  for (let i = 0; i < 4; i++) {
    const w = 1.1 - i * 0.27;
    b.box(0, 0.05 + i * 0.14, 0, w, 0.14, 0.2, '#46D46A', { topColor: '#8DF5A2' });
  }
  return { body: b.build(), hull: b.outline(0.05) };
}

const swayCompile = (s: WebGLProgramParametersWithUniforms) => {
  s.uniforms.uTime = sharedTime;
  s.vertexShader = s.vertexShader
    .replace('#include <common>', '#include <common>\nattribute vec3 aSway;\nuniform float uTime;')
    .replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      { float hy = max(0.0, position.y - aSway.x);
        float k = hy / aSway.y;
        float a = sin(uTime * 3.77 + aSway.z) * 0.05;
        transformed.x += a * hy * k;
        transformed.z += a * 0.6 * hy * k * cos(aSway.z); }`,
    );
};

// ---------- World ----------

/** Static course visuals plus the few animated world pieces (hooks, beams, pads, home base). */
export class World {
  readonly group = new Group();
  readonly hooks: InstancedMesh;
  private readonly hookOutline: InstancedMesh | null;
  private readonly chains: InstancedMesh;
  private readonly balloons: InstancedMesh;
  private readonly beams: InstancedMesh;
  private readonly beamMat: ShaderMaterial;
  private readonly padRings: InstancedMesh;
  private readonly chevronTex: CanvasTexture;
  private readonly padMat: MeshLambertMaterial;
  private readonly lampMat: MeshBasicMaterial;
  private readonly arrow: Group;
  private readonly chips: Sprite[] = [];
  private readonly chipTex = new Map<number, CanvasTexture>();
  private readonly hookHot: Float32Array;
  private readonly lanterns: Vector3[] = [];
  private readonly padCenters: Vector3[] = [];
  private pedestalMesh: Mesh | null = null;
  private plaqueMesh: Mesh | null = null;
  private readonly plaqueMat: MeshBasicMaterial;
  private lastReach = -1;
  private readonly animated: InstancedMesh[] = [];
  private lastCount = -1;

  constructor(
    private readonly course: Course,
    opts: WorldOptions,
  ) {
    const rng = new Rng(course.seed ^ 0x5eed);
    const terrain = new BoxBuilder({ faces: true });
    const decor = new BoxBuilder({ faces: true });
    const palms = new BoxBuilder({ faces: true });
    const sway: number[] = [];
    const signs = new SignAtlas();
    const home = course.home;

    // Home island.
    island(terrain, home, '#86E05F', '#E9D49C', rng);
    // Base floor mat of lighter tiles, with a low post fence.
    const matX0 = -13.2;
    const matX1 = 13.2;
    const matZ0 = HOME_FRONT_Z + 10.6;
    const matZ1 = HOME_FRONT_Z + 29.2;
    for (let x = matX0; x < matX1 - 0.01; x += 2.2) {
      for (let z = matZ0; z < matZ1 - 0.01; z += 2.2) {
        const odd = (Math.round((x - matX0) / 2.2) + Math.round((z - matZ0) / 2.2)) % 2;
        decor.box(x + 1.1, HOME_TOP + 0.02, z + 1.1, 2.18, 0.04, 2.18, odd ? '#F2E9D3' : '#E6DABD', { noOutline: true });
      }
    }
    for (let x = matX0; x <= matX1 + 0.01; x += 2.2) {
      if (Math.abs(x) < 2.5) continue;
      decor.box(x, HOME_TOP + 0.35, matZ0 - 0.3, 0.22, 0.7, 0.22, '#B07A3A', { ao: HOME_TOP });
      decor.box(x, HOME_TOP + 0.35, matZ1 + 0.3, 0.22, 0.7, 0.22, '#B07A3A', { ao: HOME_TOP });
    }
    for (let z = matZ0; z <= matZ1 + 0.01; z += 2.2) {
      decor.box(matX0 - 0.3, HOME_TOP + 0.35, z, 0.22, 0.7, 0.22, '#B07A3A', { ao: HOME_TOP });
      decor.box(matX1 + 0.3, HOME_TOP + 0.35, z, 0.22, 0.7, 0.22, '#B07A3A', { ao: HOME_TOP });
    }
    decor.boxMinMax(matX0 - 0.35, HOME_TOP + 0.55, matZ0 - 0.36, -2.5, HOME_TOP + 0.65, matZ0 - 0.24, '#8A5A28');
    decor.boxMinMax(2.5, HOME_TOP + 0.55, matZ0 - 0.36, matX1 + 0.35, HOME_TOP + 0.65, matZ0 - 0.24, '#8A5A28');
    decor.boxMinMax(matX0 - 0.35, HOME_TOP + 0.55, matZ1 + 0.24, matX1 + 0.35, HOME_TOP + 0.65, matZ1 + 0.36, '#8A5A28');
    // Stepping-stone path from the spawn to the front edge.
    for (let z = home.min.z + 0.8; z < course.homeSpawn.z + 2; z += 1.6) decor.box(0, HOME_TOP + 0.03, z, 2.2, 0.06, 1.1, '#F3E2B3', { noOutline: true });
    for (const [x, z] of [[-14.5, 4.5], [14.5, 1.5], [-15, 29], [15, 28.5], [-14.5, 17], [15, 20]]) palm(palms, x, HOME_TOP, z + home.min.z - 2, rng, sway);

    // HOME gate: two posts and a crossbar with a board, at the front-left corner facing the sea and the spawn.
    // (Kept off the path itself so it never hides the first hook from the spawn or swing camera.)
    const gate = new Matrix4().makeRotationY(0.5).setPosition(-9.5, 0, HOME_FRONT_Z + 3.2);
    const gbox = (x: number, y: number, z: number, sx: number, sy: number, sz: number, c: string) =>
      decor.box(0, 0, 0, sx, sy, sz, c, { matrix: new Matrix4().copy(gate).multiply(new Matrix4().makeTranslation(x, y, z)) });
    for (const sx of [-1, 1]) {
      gbox(sx * 2.4, HOME_TOP + 2.2, 0, 0.45, 4.4, 0.45, '#8A5A28');
      gbox(sx * 2.4, HOME_TOP + 0.2, 0, 0.75, 0.4, 0.75, '#6B4423');
      gbox(sx * 2.4, HOME_TOP + 4.45, 0, 0.6, 0.2, 0.6, '#6B4423');
    }
    gbox(0, HOME_TOP + 4.55, 0, 5.6, 0.35, 0.5, '#6B4423');
    signs.board(new Matrix4().copy(gate).multiply(new Matrix4().makeTranslation(0, HOME_TOP + 5.5, 0)), 4.2, 1.68, [{ text: 'HOME', size: 92, color: '#FFE66D' }]);

    // Shop stall: striped awning, counter and a SHOP board.
    const shopX = 11.5;
    const shopZ = home.min.z + 5;
    decor.boxMinMax(shopX - 2.4, HOME_TOP, shopZ - 1, shopX + 2.4, HOME_TOP + 1.1, shopZ + 1, '#C98A4B', { topColor: '#F2D9A8', ao: HOME_TOP });
    decor.boxMinMax(shopX - 2.4, HOME_TOP + 1.1, shopZ - 1.05, shopX + 2.4, HOME_TOP + 1.2, shopZ + 1.05, '#8A5A28');
    for (const [dx, dz] of [[-2.2, -0.85], [2.2, -0.85], [-2.2, 0.85], [2.2, 0.85]]) decor.box(shopX + dx, HOME_TOP + 1.6, shopZ + dz, 0.2, 3.2, 0.2, '#8A5A28');
    const awning = new Matrix4();
    for (let i = 0; i < 8; i++) {
      awning.makeRotationX(-0.32).setPosition(shopX - 2.45 + 0.35 + i * 0.6, HOME_TOP + 3.25, shopZ - 0.25);
      decor.box(0, 0, 0, 0.6, 0.12, 2.6, i % 2 ? '#FFFFFF' : '#FF4D5E', { matrix: awning });
    }
    signs.board(new Matrix4().makeTranslation(shopX, HOME_TOP + 4.2, shopZ - 0.6), 3.2, 1.28, [{ text: 'SHOP', size: 88, color: '#FFFFFF' }], '#C2203A');
    const ag = upgradeArrowGeometry();
    this.arrow = new Group();
    this.arrow.add(new Mesh(ag.body, toonVertexMaterial), new Mesh(ag.hull, inkMaterial));
    this.arrow.position.set(shopX, HOME_TOP + 5.6, shopZ - 0.6);
    this.arrow.visible = false;
    this.group.add(this.arrow);

    // Islands.
    for (const isl of course.islands) {
      const def = course.zones[isl.zone].def;
      island(terrain, isl.solid, def.grass, def.rock, rng);
      tufts(decor, isl.solid, toyGrass(def.grass), rng);
      if (rng.chance(0.55)) {
        const s = isl.solid;
        const x = rng.chance(0.5) ? s.min.x + 0.9 : s.max.x - 0.9;
        const z = rng.chance(0.5) ? s.min.z + 0.9 : s.max.z - 0.9;
        if (!this.nearLighthouse(isl, x, z)) palm(palms, x, s.max.y, z, rng, sway);
      }
    }

    // Zone signs on each zone's first island.
    for (const zone of course.zones) {
      const first = course.islands.find((i) => i.zone === zone.index)!;
      const s = first.solid;
      const rarity = RARITIES[zone.def.rarity];
      const lines = [
        { text: `ZONE ${zone.index + 1}: ${zone.def.name.toUpperCase()}`, size: 50, color: '#FFFFFF' },
        { text: `${rarity.name} creatures`, size: 40, color: rarity.color },
      ];
      if (zone.def.minReach > 0) lines.push({ text: `Hooks need Rope Reach ${zone.def.minReach} m`, size: 30, color: '#FFE66D' });
      const sx = s.max.x - 1.2 > 0 ? s.max.x - 0.6 : s.min.x + 0.6;
      const bx = sx + (sx > 0 ? 2.6 : -2.6);
      signs.board(new Matrix4().makeTranslation(bx, s.max.y + 3.6, s.max.z - 0.6), 6.5, 2.6, lines);
      decor.box(sx, s.max.y + 1.4, s.max.z - 0.6, 0.25, 2.8, 0.25, '#8A5A28', { ao: s.max.y });
      decor.box(bx, s.max.y + 2.15, s.max.z - 0.6, 3.6, 0.2, 0.2, '#8A5A28');
    }

    // End of the course.
    const last = course.islands[course.islands.length - 1].solid;
    const lcx = (last.min.x + last.max.x) / 2;
    signs.board(new Matrix4().makeTranslation(lcx, last.max.y + 4.5, last.min.z + 0.6), 7, 2.8, [
      { text: 'END OF THE SEA', size: 56, color: '#FFE66D' },
      { text: 'More zones coming soon', size: 34 },
    ]);
    decor.box(lcx, last.max.y + 1.6, last.min.z + 0.6, 0.25, 3.2, 0.25, '#8A5A28');

    // Lighthouses (G10): striped tower, gallery deck, lantern room and a stepped dark roof.
    const lampBuilder = new BoxBuilder();
    const padBuilder = new BoxBuilder();
    const chevPos: number[] = [];
    const chevUv: number[] = [];
    for (const lh of course.lighthouses) {
      const t = lh.tower;
      const cx = (t.min.x + t.max.x) / 2;
      const cz = (t.min.z + t.max.z) / 2;
      const bands = 6;
      const bandH = (t.max.y - t.min.y) / bands;
      for (let i = 0; i < bands; i++) {
        const inset = i * 0.06;
        decor.boxMinMax(t.min.x + inset, t.min.y + i * bandH, t.min.z + inset, t.max.x - inset, t.min.y + (i + 1) * bandH, t.max.z - inset, i % 2 ? '#FFFFFF' : '#FF4D5E');
      }
      // Windows.
      for (const y of [t.min.y + bandH * 1.5, t.min.y + bandH * 3.5]) decor.box(cx, y, t.max.z - 0.15, 0.5, 0.7, 0.32, '#1F3F7A', { noOutline: true });
      const p = lh.platform;
      decor.boxMinMax(p.min.x, p.min.y, p.min.z, p.max.x, p.max.y, p.max.z, '#566173', { topColor: '#7A8699' });
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        decor.box(cx + Math.cos(a) * 1.85, LIGHTHOUSE_TOP + 0.4, cz + Math.sin(a) * 1.85, 0.1, 0.8, 0.1, '#FFFFFF');
      }
      const lx = cx + 1.25;
      const lz = cz + 1.25;
      lampBuilder.box(lx, LIGHTHOUSE_TOP + 0.7, lz, 1.0, 1.3, 1.0, '#FFF3A0');
      decor.box(lx, LIGHTHOUSE_TOP + 1.45, lz, 1.3, 0.22, 1.3, '#2A2F3A');
      decor.box(lx, LIGHTHOUSE_TOP + 1.68, lz, 0.9, 0.24, 0.9, '#2A2F3A');
      decor.box(lx, LIGHTHOUSE_TOP + 1.9, lz, 0.45, 0.22, 0.45, '#2A2F3A');
      decor.box(lx, LIGHTHOUSE_TOP + 2.1, lz, 0.12, 0.25, 0.12, '#FFC92E');
      this.lanterns.push(new Vector3(lx, LIGHTHOUSE_TOP + 0.9, lz));

      const padCx = (lh.pad.min.x + lh.pad.max.x) / 2;
      const padCz = (lh.pad.min.z + lh.pad.max.z) / 2;
      padBuilder.box(padCx, lh.pad.min.y + 0.07, padCz, 2.6, 0.14, 2.6, '#FFFFFF', { topColor: '#2DE2FF' });
      this.padCenters.push(new Vector3(padCx, lh.pad.min.y + 0.16, padCz));
      // Chevron quad pointing at the tower (v runs toward the tower).
      const dx = Math.sign(cx - padCx) || 1;
      const y = lh.pad.min.y + 0.15;
      const hw = 1.05;
      const quad = [
        [padCx - dx * hw, padCz + hw, 0, 0],
        [padCx - dx * hw, padCz - hw, 1, 0],
        [padCx + dx * hw, padCz - hw, 1, 2],
        [padCx + dx * hw, padCz + hw, 0, 2],
      ];
      for (const i of [0, 1, 2, 0, 2, 3]) {
        chevPos.push(quad[i][0], y, quad[i][1]);
        chevUv.push(quad[i][2], quad[i][3]);
      }
    }
    this.lampMat = new MeshBasicMaterial({ vertexColors: true, toneMapped: false });
    this.group.add(new Mesh(lampBuilder.build(), this.lampMat));
    this.padMat = new MeshLambertMaterial({ vertexColors: true, emissive: new Color('#00B8FF'), emissiveIntensity: 0.4 });
    this.group.add(new Mesh(padBuilder.build(), this.padMat));
    const chevGeo = new BufferGeometry();
    chevGeo.setAttribute('position', new Float32BufferAttribute(chevPos, 3));
    chevGeo.setAttribute('uv', new Float32BufferAttribute(chevUv, 2));
    this.chevronTex = chevronTexture();
    const chev = new Mesh(chevGeo, new MeshBasicMaterial({ map: this.chevronTex, transparent: true, color: '#E8FDFF', toneMapped: false, side: DoubleSide, depthWrite: false }));
    chev.renderOrder = 2;
    this.group.add(chev);
    this.padRings = new InstancedMesh(
      new RingGeometry(1.2, 1.45, 24).rotateX(-Math.PI / 2),
      new MeshBasicMaterial({ color: '#FFFFFF', transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false }),
      Math.max(1, this.padCenters.length),
    );
    this.padRings.instanceColor = new InstancedBufferAttribute(new Float32Array(Math.max(1, this.padCenters.length) * 3), 3);
    this.padRings.count = this.padCenters.length;
    this.padRings.frustumCulled = false;
    this.group.add(this.padRings);

    // Rotating beams.
    this.beamMat = beamMaterial();
    const cone = new CylinderGeometry(3.2, 0.25, 30, 10, 1, true).rotateZ(Math.PI / 2).translate(15, 0, 0);
    this.beams = new InstancedMesh(cone, this.beamMat, Math.max(1, this.lanterns.length));
    this.beams.count = this.lanterns.length;
    this.beams.instanceMatrix.setUsage(DynamicDrawUsage);
    this.beams.frustumCulled = false;
    this.beams.renderOrder = 6;
    this.group.add(this.beams);

    // Hooks (G9): faceted gold rings on a 3-link chain under a striped buoy-balloon.
    const n = course.anchors.length;
    this.hooks = new InstancedMesh(new TorusGeometry(0.75, 0.2, 4, 8), new MeshToonMaterial({ gradientMap: toonGradient }), n);
    this.hooks.instanceMatrix.setUsage(DynamicDrawUsage);
    this.hooks.castShadow = true;
    this.hookHot = new Float32Array(n);
    for (let i = 0; i < n; i++) this.hooks.setColorAt(i, HOOK_LOCKED);
    this.hookOutline = opts.hookOutline ? new InstancedMesh(new TorusGeometry(0.75, 0.26, 4, 8), inkMaterial, n) : null;
    this.chains = new InstancedMesh(hookChainGeometry(), toonVertexMaterial, n);
    this.balloons = new InstancedMesh(balloonGeometry(), toonVertexMaterial, n);
    this.balloons.castShadow = true;
    for (const im of [this.hooks, this.hookOutline, this.chains, this.balloons]) {
      if (!im) continue;
      this.animated.push(im);
      im.instanceMatrix.setUsage(DynamicDrawUsage);
      im.frustumCulled = false;
      this.group.add(im);
    }

    // Reach chips for locked hooks near the player (pool of 3 sprites).
    for (let i = 0; i < 3; i++) {
      const sp = new Sprite(new SpriteMaterial({ transparent: true, depthWrite: false, toneMapped: false }));
      sp.scale.set(2.4, 0.9, 1);
      sp.visible = false;
      this.chips.push(sp);
      this.group.add(sp);
    }

    // Merge and add the static meshes.
    const terrainMesh = new Mesh(terrain.build(), islandMaterial(opts.edgeLines));
    terrainMesh.receiveShadow = true;
    const decorMesh = new Mesh(decor.build(), islandMaterial(opts.edgeLines));
    decorMesh.castShadow = true;
    decorMesh.receiveShadow = true;
    const palmGeo = palms.build();
    palmGeo.setAttribute('aSway', new Float32BufferAttribute(sway, 3));
    const palmMat = islandMaterial(opts.edgeLines);
    const islandCompile = palmMat.onBeforeCompile;
    palmMat.onBeforeCompile = (s, r) => {
      islandCompile.call(palmMat, s, r);
      swayCompile(s);
    };
    palmMat.customProgramCacheKey = () => 'palm-sway';
    const palmMesh = new Mesh(palmGeo, palmMat);
    palmMesh.castShadow = true;
    palmMesh.receiveShadow = true;
    this.group.add(terrainMesh, decorMesh, palmMesh, signs.build());

    this.plaqueMat = new MeshBasicMaterial({ map: lockPlaqueTexture(), toneMapped: false });
  }

  private nearLighthouse(isl: Island, x: number, z: number): boolean {
    return this.course.lighthouses.some((lh) => lh.tower.max.y > isl.solid.max.y && Math.hypot((lh.tower.min.x + lh.tower.max.x) / 2 - x, (lh.tower.min.z + lh.tower.max.z) / 2 - z) < 4.5)
      || this.course.pads.some((p) => Math.hypot((p.min.x + p.max.x) / 2 - x, (p.min.z + p.max.z) / 2 - z) < 3)
      || (this.course.springs ?? []).some((p) => Math.hypot(p.pos.x - x, p.pos.z - z) < 2.4);
  }

  /** G8 two-tier podiums; locked ones carry a lock plaque. Rebuilt only when the count changes. */
  setPedestalCount(count: number): void {
    if (count === this.lastCount) return;
    this.lastCount = count;
    if (this.pedestalMesh) {
      this.group.remove(this.pedestalMesh);
      this.pedestalMesh.geometry.dispose();
    }
    if (this.plaqueMesh) {
      this.group.remove(this.plaqueMesh);
      this.plaqueMesh.geometry.dispose();
    }
    const b = new BoxBuilder({ faces: true });
    const pos: number[] = [];
    const uv: number[] = [];
    this.course.pedestals.slice(0, MAX_PEDESTALS).forEach((p, i) => {
      const open = i < count;
      b.box(p.x, p.y + 0.12, p.z, 2.4, 0.24, 2.4, '#ECE5D6', { sideColor: '#C9BFA8', ao: p.y });
      b.box(p.x, p.y + 0.3, p.z, 2.06, 0.06, 2.06, open ? '#FFC92E' : '#8D96A3');
      b.box(p.x, p.y + 0.34, p.z, 2.0, 0.12, 2.0, open ? '#38C6D9' : '#9AA3AD', { sideColor: open ? '#2A9DB0' : '#7D8794' });
      if (!open) {
        for (const [sz, flip] of [[-1, 0], [1, 1]]) {
          const z = p.z + sz * 0.02;
          const y0 = p.y + 0.42;
          const y1 = y0 + 1.1;
          const hx = 0.55;
          const xs = flip ? [p.x + hx, p.x - hx] : [p.x - hx, p.x + hx];
          const quad = [
            [xs[0], y0, 0, 0],
            [xs[1], y0, 1, 0],
            [xs[1], y1, 1, 1],
            [xs[0], y1, 0, 1],
          ];
          for (const k of [0, 1, 2, 0, 2, 3]) {
            pos.push(quad[k][0], quad[k][1], z);
            uv.push(quad[k][2], quad[k][3]);
          }
        }
      }
    });
    const mat = islandMaterial(false);
    this.pedestalMesh = new Mesh(b.build(), mat);
    this.pedestalMesh.receiveShadow = true;
    this.group.add(this.pedestalMesh);
    if (pos.length) {
      const g = new BufferGeometry();
      g.setAttribute('position', new Float32BufferAttribute(pos, 3));
      g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
      g.computeBoundingSphere();
      this.plaqueMesh = new Mesh(g, this.plaqueMat);
      this.plaqueMat.side = DoubleSide;
      this.group.add(this.plaqueMesh);
    } else this.plaqueMesh = null;
  }

  /** Gold if the rope reaches the hook, slate if locked. */
  updateHooks(reach: number): void {
    if (reach === this.lastReach) return;
    this.lastReach = reach;
    this.course.anchors.forEach((a, i) => this.hooks.setColorAt(i, a.minReach <= reach + 1e-6 ? HOOK_READY : HOOK_LOCKED));
    if (this.hooks.instanceColor) this.hooks.instanceColor.needsUpdate = true;
  }

  private chip(minReach: number): CanvasTexture {
    let t = this.chipTex.get(minReach);
    if (!t) {
      t = textTexture([{ text: `LOCKED  ${minReach} m`, size: 54, color: '#FFE66D' }], 300, 112, '#2A3550');
      this.chipTex.set(minReach, t);
    }
    return t;
  }

  update(f: WorldFrame): void {
    const t = f.time;
    // Hooks: sway around the balloon, balloon bob, targeted glow.
    const anchors = this.course.anchors;
    let colorsDirty = false;
    for (let i = 0; i < anchors.length; i++) {
      const a = anchors[i];
      const sway = Math.sin(t * 1.2 + a.id) * 0.08;
      const bob = Math.sin(t * Math.PI * 2 * 0.8 + a.id * 1.7) * 0.15;
      tmpQ.setFromAxisAngle(tmpV.set(0, 0, 1), sway);
      tmpM.compose(tmpS.set(a.pos.x, a.pos.y + 2.2 + bob, a.pos.z), tmpQ, ONE);
      tmpM2.makeTranslation(0, -2.2, 0);
      tmpM.multiply(tmpM2);
      this.hooks.setMatrixAt(i, tmpM);
      this.hookOutline?.setMatrixAt(i, tmpM);
      this.chains.setMatrixAt(i, tmpM);
      tmpM.makeTranslation(a.pos.x, a.pos.y + bob, a.pos.z);
      this.balloons.setMatrixAt(i, tmpM);
      const want = a.id === f.targetId ? 1 : 0;
      const hot = this.hookHot[i];
      if (hot !== want) {
        const next = want > hot ? Math.min(1, hot + f.dt / 0.12) : Math.max(0, hot - f.dt / 0.2);
        this.hookHot[i] = next;
        const base = a.minReach <= f.reach + 1e-6 ? HOOK_READY : HOOK_LOCKED;
        this.hooks.setColorAt(i, tmpC.copy(base).lerp(HOOK_HOT, next * (0.75 + 0.25 * Math.sin(t * 12))));
        colorsDirty = true;
      } else if (hot > 0) {
        this.hooks.setColorAt(i, tmpC.copy(HOOK_READY).lerp(HOOK_HOT, 0.75 + 0.25 * Math.sin(t * 12)));
        colorsDirty = true;
      }
    }
    for (const im of this.animated) im.instanceMatrix.needsUpdate = true;
    if (colorsDirty && this.hooks.instanceColor) this.hooks.instanceColor.needsUpdate = true;

    // Locked-hook reach chips (3 nearest within 30 m).
    let used = 0;
    for (let pass = 0; pass < 3; pass++) {
      let best = -1;
      let bestD = 30;
      for (let i = 0; i < anchors.length; i++) {
        const a = anchors[i];
        if (a.minReach <= f.reach + 1e-6) continue;
        let taken = false;
        for (let k = 0; k < used; k++) if (this.chips[k].userData.id === a.id) taken = true;
        if (taken) continue;
        const d = a.pos.distanceTo(f.player);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      if (best < 0) break;
      const a = anchors[best];
      const sp = this.chips[used++];
      sp.userData.id = a.id;
      const tex = this.chip(a.minReach);
      if (sp.material.map !== tex) {
        sp.material.map = tex;
        sp.material.needsUpdate = true;
      }
      sp.position.set(a.pos.x, a.pos.y - 1.5, a.pos.z);
      sp.visible = true;
    }
    for (let k = used; k < 3; k++) {
      this.chips[k].visible = false;
      this.chips[k].userData.id = -1;
    }

    // Lighthouse beams, lantern and pad pulses.
    this.beamMat.uniforms.uColor.value.copy(BEAM_CALM).lerp(BEAM_DANGER, f.danger);
    for (let i = 0; i < this.lanterns.length; i++) {
      tmpQ.setFromAxisAngle(tmpV.set(0, 1, 0), t * 0.6 + i * 1.3);
      tmpM.compose(this.lanterns[i], tmpQ, ONE);
      this.beams.setMatrixAt(i, tmpM);
      const k = ((t + i * 0.27) % 0.8) / 0.8;
      tmpS.setScalar(1 + 0.8 * k);
      tmpQ.identity();
      tmpM.compose(this.padCenters[i], tmpQ, tmpS);
      this.padRings.setMatrixAt(i, tmpM);
      const fade = (1 - k) * 0.9;
      this.padRings.setColorAt(i, tmpC.setRGB(0.4 * fade, 0.95 * fade, fade));
    }
    this.beams.instanceMatrix.needsUpdate = true;
    this.padRings.instanceMatrix.needsUpdate = true;
    if (this.padRings.instanceColor) this.padRings.instanceColor.needsUpdate = true;
    this.chevronTex.offset.y = -((t * 1.2) / 1.05) % 1;
    this.padMat.emissiveIntensity = 0.35 + 0.3 * Math.sin(t * 5);
    this.lampMat.color.setScalar(0.85 + 0.15 * Math.sin(t * 3));

    // Upgrade arrow over the shop stall.
    this.arrow.visible = f.shopArrow;
    if (f.shopArrow) {
      this.arrow.position.y = HOME_TOP + 5.6 + Math.sin(t * Math.PI * 2 * 1.2) * 0.2;
      this.arrow.rotation.y = t * 1.5;
    }
  }
}
