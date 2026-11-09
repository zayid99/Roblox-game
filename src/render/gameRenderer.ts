import './canvasCompat';
import './tonemap';
import {
  CustomToneMapping,
  Group,
  type InstancedMesh,
  type Material,
  Mesh,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
  type Object3D,
  type Texture,
} from 'three';
import type { GuideSpec, LayoutMode, QualitySetting, QualityTier, RequestTimeScale, ScreenPt, SimEvent } from '../contracts';
import { NO_GUIDES } from '../contracts';
import { PHYS, WAVE } from '../game/config';
import { groundHeightAt, type Course } from '../game/course';
import { getSpecies } from '../game/creatures';
import { activeBuddy } from '../game/hatchery';
import { UPGRADE_ORDER } from '../game/economy';
import type { GameSim } from '../game/sim';
import type { GameState } from '../game/state';
import { BlobShadows } from './blobShadows';
import { Buddy, type BuddyFrame } from './buddy';
import { CameraRig } from './camera';
import { Character } from './character';
import { Clouds } from './clouds';
import { ColdOpen } from './coldOpen';
import { creatureGeometry, isCachedCreatureGeometry, makeCreatureMesh } from './creatureMesh';
import { CreatureVisuals, type CreatureFrame } from './creatures';
import { Lighting } from './environment';
import { GameplayObjects } from './gameplayObjects';
import { Guides } from './guides';
import { collectHitStop, grabHitStop, perfectSlowMo, TRAUMA } from './juice';
import { inkMaterial, seeThrough, sharedTime, toonGradient, toonVertexMaterial, vertexMaterial } from './materials';
import { Particles } from './particles';
import { PortraitFactory } from './portraits';
import { Props } from './props';
import { DprController, FrameCap, resolveTier, TIERS, type TierParams } from './quality';
import { Ribbon } from './ribbon';
import { Rope } from './rope';
import { ShadowRig } from './shadows';
import { buildShore } from './shore';
import { Sky } from './sky';
import { SpeedLines } from './speedLines';
import { WaveVisual } from './waveVisual';
import { Water, waveHeight } from './water';
import { World } from './world';

export { waveHeight } from './water';
export { PortraitFactory } from './portraits';

/** Everything the renderer reads each frame (read-only views of the sim and state). */
export interface RenderFrame {
  realDt: number;
  simDt: number;
  time: number;
  sim: Readonly<GameSim>;
  state: Readonly<GameState>;
  cosmetics: { rope: string; trail: string };
  guides: GuideSpec;
  reduceMotion: boolean;
  /** NaN when music is off (§8.4). */
  beatPhase: number;
}

export interface GameRendererDeps {
  requestTimeScale: RequestTimeScale;
}

const tmpV = new Vector3();
const tmpV2 = new Vector3();
const fwd = new Vector3();
const landing = new Vector3();
const hand = new Vector3();
const grip = new Vector3();

/** The graphics facade (§10.3): owns every visual. Reads the sim and state read-only through `RenderFrame`. */
export class GameRenderer {
  readonly camera: PerspectiveCamera;
  readonly portraits: PortraitFactory;
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly rig: CameraRig;
  private params: TierParams;
  private quality: QualitySetting = 'auto';
  private autoTier: QualityTier | null = null;
  private readonly dpr: DprController;
  private course: Course | null = null;
  private root = new Group();

  private lighting!: Lighting;
  private shadows!: ShadowRig;
  private sky!: Sky;
  private clouds!: Clouds;
  private water!: Water;
  private shore!: Mesh;
  private world!: World;
  private character!: Character;
  private creatures!: CreatureVisuals;
  private particles!: Particles;
  private blobs!: BlobShadows;
  private rope!: Rope;
  private ribbon!: Ribbon;
  private speedLines!: SpeedLines;
  private wave!: WaveVisual;
  private guides!: Guides;
  private objects!: GameplayObjects;
  private coldOpen!: ColdOpen;
  private props: Props | null = null;
  private buddy!: Buddy;

  private reduceMotion = false;
  private mood = 0;
  private moodTarget = 0;
  private moodForced: 0 | 1 | null = null;
  private danger = 0;
  private readonly frameCap = new FrameCap();
  private lastFrameMs = 0;
  private frameMs = 0;
  private width = 1;
  private height = 1;
  private lastSim: Readonly<GameSim> | null = null;
  private lastState: Readonly<GameState> | null = null;
  private lastTime = 0;
  private airMinVy = 0;
  private lastPadMs = -1e9;
  private coldOpenPending = false;
  private lastReachLevel = -1;
  private reach = 0;
  private shopArrow = false;
  private shopCheckT = 0;
  private wasSplashed = false;
  private lastReduce = false;
  /** Shader programs kept alive for the session (warm-up creature materials), see warmUp(). */
  private readonly keepAlive: Material[] = [];
  private readonly warmCam = new PerspectiveCamera(62, 1, 0.1, 1800);
  /** Runtime DPR adaptation (§6.1). Sandbox screenshots turn it off. */
  adaptiveDpr = true;
  // Per-frame parameter objects, reused (no allocation in render()).
  private readonly charCtx = { time: 0, splashed: false, carrying: false, panic: false, reduceMotion: false };
  private readonly worldFrame = { time: 0, dt: 0, targetId: -1, danger: 0, player: new Vector3(), shopArrow: false, reach: 0 };
  private creatureFrame: CreatureFrame | null = null;
  private buddyFrame: BuddyFrame | null = null;
  /** Island top under a point (0 over open sea), for the camera floor. */
  private readonly solidAt = (x: number, z: number, y: number): number => (this.course ? groundHeightAt(this.course, x, z, y) : 0);
  /** Island top under a point, or the sea surface. */
  private readonly groundAt = (x: number, z: number, y: number): number => {
    const g = this.course ? groundHeightAt(this.course, x, z, y) : 0;
    return g > 0.5 ? g : waveHeight(x, z, this.lastTime);
  };
  private readonly hookPos = (id: number, out: Vector3): Vector3 | null => {
    const anchors = this.course?.anchors;
    if (!anchors) return null;
    for (const a of anchors) if (a.id === id) return out.copy(a.pos);
    return null;
  };

  constructor(canvas: HTMLCanvasElement, private readonly deps: GameRendererDeps) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = CustomToneMapping;
    this.renderer.toneMappingExposure = 1;
    this.camera = new PerspectiveCamera(62, 1, 0.1, 1800);
    this.rig = new CameraRig(this.camera);
    this.portraits = new PortraitFactory(this.renderer);
    this.params = TIERS.high;
    this.dpr = new DprController(this.params.dprCap, 'high', true);
    this.scene.add(this.root);
  }

  /** Effective tier for this load. */
  get tier(): QualityTier {
    return this.params.tier;
  }

  /** Builds the world for the course and warms up every shader. */
  async init(course: Course, quality: QualitySetting, autoTier: QualityTier | null): Promise<void> {
    this.course = course;
    this.quality = quality;
    this.autoTier = autoTier;
    this.applyTier(resolveTier(quality, autoTier));
    this.build();
    await this.warmUp();
  }

  private applyTier(tier: QualityTier): void {
    this.params = TIERS[tier];
    // Never render more pixels than the screen has (Medium's 1.25 on a 1× screen would out-draw High).
    const device = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    this.dpr.reset(Math.min(this.params.dprCap, Math.max(1, device)), tier);
    this.renderer.setPixelRatio(this.dpr.dpr);
    this.renderer.setSize(this.width, this.height, false);
  }

  private build(): void {
    const course = this.course!;
    const q = this.params;
    // Tear down a previous build (quality change): geometries, materials, their textures and the shadow map.
    this.scene.remove(this.root);
    if (this.world) this.disposeBuild();
    this.root = new Group();
    this.scene.add(this.root);

    this.lighting = new Lighting(this.scene);
    this.scene.remove(this.lighting.hemi, this.lighting.sun, this.lighting.sun.target);
    this.root.add(this.lighting.hemi, this.lighting.sun, this.lighting.sun.target);
    this.shadows = new ShadowRig(this.renderer, this.lighting.sun);
    this.shadows.configure(q);
    this.sky = new Sky(this.lighting.fogOut);
    this.clouds = new Clouds(40);
    this.clouds.setCount(q.clouds);
    this.water = new Water(q.waterCells, q.waterDetail);
    this.shore = buildShore([course.home, ...course.islands.map((i) => i.solid)], q.shoreRings);
    this.world = new World(course, { edgeLines: q.edgeLines, hookOutline: q.hookOutline });
    this.particles = new Particles(this.root, q.particleCap);
    this.blobs = new BlobShadows();
    this.character = new Character();
    this.creatures = new CreatureVisuals(course, this.particles, this.blobs);
    this.creatures.labels.setViewport(this.width, this.height);
    this.rope = new Rope(this.root);
    this.ribbon = new Ribbon(this.root);
    this.speedLines = new SpeedLines(this.root);
    this.wave = new WaveVisual(this.root);
    this.guides = new Guides(this.root);
    this.objects = new GameplayObjects(course);
    this.coldOpen = new ColdOpen(this.root, this.wave.spray);
    this.props = q.props ? new Props(course, q.edgeLines) : null;
    this.buddy = new Buddy(this.particles);
    this.root.add(this.buddy.root);
    if (this.props) this.root.add(this.props.group);
    this.root.add(this.sky.mesh, this.clouds.mesh, this.water.mesh, this.shore, this.world.group, this.blobs.mesh, this.character.root, this.creatures.group, this.objects.group);
    this.lastReachLevel = -1;
    this.lastFrameMs = 0;
    this.rig.reduceMotion = this.reduceMotion;
    if (!this.rig.yaw) this.rig.snapBehind(0, -1);
  }

  private async warmUp(): Promise<void> {
    // Make every effect visible once (plus one creature per mutation) and compile. The creature materials are
    // kept (never disposed) so their programs stay cached for the whole session: a program is destroyed with
    // its last material, and the first Gold/Diamond/Rainbow creature would otherwise compile mid-run.
    if (!this.keepAlive.length) {
      for (let m = 0; m < 4; m++) this.keepAlive.push(makeCreatureMesh({ speciesId: 'toastopus', mutation: m }).material);
      const ghost = makeCreatureMesh({ speciesId: 'ghost_galleon', mutation: 0 }).material;
      ghost.transparent = true;
      this.keepAlive.push(ghost);
    }
    const warm = new Group();
    this.keepAlive.forEach((mat, i) => {
      const c = new Mesh(creatureGeometry(i < 4 ? 'toastopus' : 'ghost_galleon'), mat);
      c.position.set(i * 3, -50, 0);
      warm.add(c);
    });
    this.root.add(warm);
    const hidden: Object3D[] = [];
    this.root.traverse((o) => {
      if (!o.visible) {
        hidden.push(o);
        o.visible = true;
      }
    });
    // A separate camera: the main one keeps its rig pose while the rAF loop renders during the compile.
    const cam = this.warmCam;
    cam.position.set(0, 10, 20);
    cam.lookAt(0, 0, 0);
    cam.updateMatrixWorld();
    let ready: Promise<unknown> | null = null;
    try {
      // compileAsync creates every program synchronously, then waits for the (parallel) link to finish,
      // so the hidden objects are restored right away (no decoy wave or warm-up meshes on screen meanwhile).
      ready = this.renderer.compileAsync(this.scene, cam);
    } catch {
      /* compileAsync can throw on context loss; the first render compiles instead. */
    }
    for (const o of hidden) o.visible = false;
    this.root.remove(warm);
    try {
      await ready;
    } catch {
      /* compileAsync can reject on context loss; the first render compiles instead. */
    }
  }

  /** Frees the GPU resources of the current build. Keeps the shared module materials and cached creature geometry. */
  private disposeBuild(): void {
    const keep = new Set<object>([toonVertexMaterial, inkMaterial, vertexMaterial, toonGradient, ...this.keepAlive]);
    const mats = new Set<Material>();
    const texs = new Set<Texture>();
    const addTex = (v: unknown) => {
      if (v && (v as Texture).isTexture && !keep.has(v as object)) texs.add(v as Texture);
    };
    this.root.traverse((o) => {
      const m = o as Mesh;
      if (!m.isMesh && !(o as { isSprite?: boolean }).isSprite) return;
      if (m.isMesh && !isCachedCreatureGeometry(m.geometry)) m.geometry?.dispose?.();
      if ((o as InstancedMesh).isInstancedMesh) (o as InstancedMesh).dispose();
      const list = Array.isArray(m.material) ? m.material : [m.material];
      for (const mat of list) if (mat && !keep.has(mat)) mats.add(mat);
    });
    for (const mat of mats) {
      for (const v of Object.values(mat)) addTex(v);
      const uniforms = (mat as { uniforms?: Record<string, { value: unknown }> }).uniforms;
      if (uniforms) for (const u of Object.values(uniforms)) addTex(u?.value);
      mat.dispose();
    }
    // Shared caches (wild billboards, the face atlas, the creature matcap) are re-uploaded on next use if freed,
    // so freeing everything found here is safe; it only costs an upload.
    for (const t of texs) t.dispose();
    this.world.dispose();
    this.guides.dispose();
    this.lighting.sun.shadow.map?.dispose();
    this.lighting.sun.shadow.map = null;
  }

  /** The player's quality choice: applies now (rebuild + recompile behind the open panel). */
  setQuality(q: QualitySetting): void {
    this.quality = q;
    const tier = resolveTier(q, this.autoTier);
    if (tier === this.params.tier || !this.course) return;
    this.applyTier(tier);
    this.build();
    void this.warmUp();
    this.frameCap.reset();
  }

  /** Tier to save for the next load (§6.1), or null. */
  pendingAutoTier(): QualityTier | null {
    return this.quality === 'auto' ? this.dpr.pendingTier : null;
  }

  setReduceMotion(on: boolean): void {
    this.reduceMotion = on;
    this.rig.reduceMotion = on;
  }

  resize(w: number, h: number, layout: LayoutMode): void {
    this.width = Math.max(1, w);
    this.height = Math.max(1, h);
    this.renderer.setSize(this.width, this.height, false);
    this.creatures?.labels.setViewport(this.width, this.height);
    this.camera.aspect = this.width / this.height;
    this.rig.setBaseFov(layout === 'portrait' || this.camera.aspect < 0.8 ? 75 : 62);
    this.camera.updateProjectionMatrix();
  }

  look(dx: number, dy: number, zoom: number, time: number): void {
    this.rig.rotate(dx, dy, time);
    this.rig.zoom(zoom);
  }

  cameraYaw(): number {
    return this.rig.yaw;
  }

  manualRecently(time: number): boolean {
    return this.rig.manualRecently(time);
  }

  snapBehind(dx: number, dz: number): void {
    this.rig.snapBehind(dx, dz);
  }

  /** G17: decoy wave on the horizon. Call on the first rendered frame. */
  playColdOpen(): void {
    this.coldOpenPending = true;
  }

  setStormMood(target: 0 | 1): void {
    this.moodForced = target;
  }

  /** Extra (not in the §10.3 list): play a pedestal creature's signature idle after a tap (a hop with Reduce motion). */
  tapPedestal(i: number): void {
    this.creatures?.tapPedestal(i, this.lastTime, this.reduceMotion || this.lastReduce);
  }

  /** Time-based render cap (§6.1): Low and Medium render at most one frame per 15 ms (see FrameCap). */
  shouldRender(nowMs: number): boolean {
    return this.frameCap.ready(nowMs, this.params.frameCapMs);
  }

  // ---------- Events (§5.3 graphics column) ----------

  onSimEvent(e: SimEvent): void {
    const sim = this.lastSim;
    if (!sim || !this.course) return;
    const p = sim.player.pos;
    const t = this.lastTime;
    const ts = this.deps.requestTimeScale;
    const parts = this.particles;
    switch (e.type) {
      case 'player':
        switch (e.event) {
          case 'jump':
            this.character.onJump(t);
            parts.burst(p, '#F3EAD8', 6, { speed: 3, size: 0.4, life: 0.4, puff: true, flat: true, gravity: -1 });
            break;
          case 'doubleJump':
            this.character.onJump(t);
            parts.burst(tmpV.copy(p).setY(p.y + 0.3), '#BFEAFF', 10, { speed: 4, size: 0.4, life: 0.45, puff: true, gravity: -1 });
            break;
          case 'grab':
            this.rope.twang();
            grabHitStop(ts, sim.player.vel.length());
            break;
          case 'release':
            this.rig.kickFov(5, 0.25);
            this.character.onRelease(sim.player.vel.length(), this.reduceMotion);
            break;
          case 'land': {
            const vy = -this.airMinVy;
            this.character.onLand(vy);
            const hard = vy > 18;
            parts.burst(p, '#F3EAD8', hard ? 16 : 8 + Math.floor(Math.random() * 5), { speed: 3, up: 1, size: 0.5, life: 0.45, puff: true, flat: true, gravity: -1, drag: 3 });
            if (hard) this.rig.addTrauma(TRAUMA.hardLand);
            this.rig.kickFov(-2, 0.15);
            this.airMinVy = 0;
            break;
          }
          case 'pad':
            this.padLaunch(p, t);
            break;
          case 'sea':
            this.splashFx(tmpV.copy(p).setY(0.2), 1);
            break;
        }
        break;
      case 'padLaunch':
        this.padLaunch(p, t);
        break;
      case 'releaseRated':
        if (e.quality === 'perfect') {
          this.rig.kickFov(8, 0.25);
          perfectSlowMo(ts);
          this.rig.addTrauma(TRAUMA.perfect);
          parts.burst(tmpV.copy(p).setY(p.y + 1), '#FFE66D', 12, { speed: 6, size: 0.45, life: 0.5, additive: true, gravity: 0, drag: 2 });
        }
        break;
      case 'bounce':
        this.objects.onBounce(e.buoyId, t, parts);
        break;
      case 'geyser':
        this.objects.onGeyser(e.geyserId, parts);
        this.rig.kickFov(10, 0.4);
        break;
      case 'spring':
        this.objects.onSpring(e.springId, t, parts);
        this.rig.kickFov(6, 0.3);
        break;
      case 'crumble':
        this.objects.onCrumble(e.stoneId, e.phase, parts);
        if (e.phase === 'shake') this.rig.addTrauma(TRAUMA.closeCall * 0.5);
        break;
      case 'collect': {
        const rarity = getSpecies(e.creature.speciesId).rarity;
        this.creatures.onCollect(e.creature);
        const col = ['#A9B8C9', '#59D36A', '#3AA8FF', '#B065FF', '#FFB52E', '#FF4F7B', '#22F0FF'][rarity];
        tmpV.copy(e.creature.pos).setY(e.creature.pos.y + 1);
        parts.burst(tmpV, col, 14 + rarity * 4, { speed: 7, up: 3, size: 0.28, life: 0.7 });
        parts.burst(tmpV, '#FFFFFF', 4 + rarity * 2, { speed: 5, up: 2, size: 0.5, life: 0.6, additive: true, gravity: 0, drag: 2 });
        collectHitStop(ts, rarity);
        if (rarity >= 4) {
          this.rig.addTrauma(TRAUMA.legendary);
          this.character.celebrate('legendary');
        } else if (rarity === 3) this.rig.addTrauma(TRAUMA.epic);
        else if (rarity === 2) this.rig.addTrauma(TRAUMA.rare);
        break;
      }
      case 'deliver':
        this.creatures.onDeliver();
        if (e.result.placed.length || e.result.sold.length) this.character.celebrate('deliver');
        break;
      case 'closeCall':
        this.rig.addTrauma(TRAUMA.closeCall);
        break;
      case 'splash':
        this.splashFx(tmpV.copy(p), 1.8);
        this.rig.addTrauma(TRAUMA.splash);
        this.character.onSplash(t);
        if (e.practice) this.creatures.practiceSplash(t);
        break;
      case 'respawn':
        this.airMinVy = 0;
        this.rope.hide();
        this.ribbon.reset();
        if (e.reason === 'wave') this.rig.reset(sim.player.pos);
        break;
      case 'waveWarning':
        this.wave.setVariant(e.golden, e.big);
        this.rig.addTrauma(TRAUMA.waveBanner);
        this.moodTarget = 0.3;
        break;
      case 'surgeStart':
        this.wave.setVariant(e.golden, e.big);
        this.moodTarget = 1;
        break;
      case 'surgeEnd':
        this.moodTarget = 0;
        if (e.survived) this.character.celebrate('cheer');
        break;
      case 'washed':
        for (const uid of e.uids) {
          if (this.creatures.wildPosition(uid, tmpV)) parts.burst(tmpV.setY(tmpV.y + 1), '#FFFFFF', 8, { speed: 6, up: 4, size: 0.3, life: 0.6 });
        }
        break;
      default:
        break;
    }
  }

  private padLaunch(p: Vector3, t: number): void {
    if (t - this.lastPadMs < 0.05) return;
    this.lastPadMs = t;
    this.rig.kickFov(10, 0.4);
    this.rig.addTrauma(TRAUMA.pad);
    this.particles.burst(p, '#2DE2FF', 20, { speed: 6, up: 6, size: 0.25, life: 0.6 });
    this.particles.burst(p, '#FFFFFF', 8, { speed: 4, up: 4, size: 0.5, life: 0.5, additive: true, gravity: 0 });
  }

  /** Sea fall splash (§5.2): spray columns, droplets and a foam ring; ×1.8 for the wave. */
  private splashFx(at: Vector3, k: number): void {
    const cols = Math.round(14 * k);
    for (let i = 0; i < cols; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 0.4 + Math.random() * 0.8;
      this.particles.emit(at.x + Math.cos(a) * r, at.y, at.z + Math.sin(a) * r, Math.cos(a) * 1.5, 6 + Math.random() * 3, Math.sin(a) * 1.5, '#FFFFFF', 0.45, 0.6, 22);
    }
    this.particles.burst(at, '#BFEFFF', Math.round(10 * k), { speed: 6, up: 5, size: 0.22, life: 0.7, gravity: 22 });
    this.particles.burst(at, '#FFFFFF', Math.round(16 * k), { speed: 4 * k, size: 0.6, life: 0.6, flat: true, puff: true, gravity: 0, drag: 4 });
    this.wave.spray.emit(at.x, at.y + 1, at.z, 0, 4, 0, 1.3 * k, 0.45);
  }

  // ---------- Per frame ----------

  render(f: RenderFrame): void {
    if (!this.course) return;
    const now = performance.now();
    // A gap over 250 ms is a hidden tab, a stall or a rebuild, not the frame rate: keep it out of the DPR average.
    const gap = this.lastFrameMs > 0 ? now - this.lastFrameMs : 0;
    this.frameMs = gap > 0 && gap < 250 ? gap : 0;
    this.lastFrameMs = now;
    const sim = f.sim;
    const state = f.state;
    this.lastSim = sim;
    this.lastState = state;
    this.lastTime = f.time;
    const dt = Math.min(0.1, f.realDt);
    const t = f.time;
    const q = this.params;
    const reduce = f.reduceMotion || this.reduceMotion;
    this.lastReduce = reduce;
    this.rig.reduceMotion = reduce;
    sharedTime.value = t;

    if (this.adaptiveDpr && this.frameMs > 0 && this.dpr.sample(this.frameMs, dt)) {
      this.renderer.setPixelRatio(this.dpr.dpr);
      this.renderer.setSize(this.width, this.height, false);
    }

    // World sync: pedestal count, hook reach (only on change).
    this.world.setPedestalCount(state.slotCount);
    const reachLevel = state.levels.reach;
    if (reachLevel !== this.lastReachLevel) {
      this.lastReachLevel = reachLevel;
      this.reach = state.stats.reach;
      this.world.updateHooks(this.reach);
    }
    this.shopCheckT -= dt;
    if (this.shopCheckT <= 0) {
      this.shopCheckT = 0.5;
      this.shopArrow = false;
      for (const k of UPGRADE_ORDER) if (state.canBuy(k)) this.shopArrow = true;
    }

    // Mood: storm 0 → 1 over 1.5 s at surgeStart, back over 3 s.
    const target = this.moodForced ?? this.moodTarget;
    this.mood = target > this.mood ? Math.min(target, this.mood + dt / 1.5) : Math.max(target, this.mood - dt / 3);
    this.lighting.setMood(this.mood);
    this.sky.setMood(this.mood);
    this.water.setMood(this.mood);
    const wave = sim.wave;
    const dangerT = wave.phase === 'calm' ? 0 : 1;
    this.danger += (dangerT - this.danger) * Math.min(1, dt / 0.4);

    // Player.
    const player = sim.player;
    const splashed = sim.splashTime > 0;
    if (player.mode !== 'ground') this.airMinVy = Math.min(this.airMinVy, player.vel.y);
    const panic = wave.phase === 'surge' && player.pos.z - wave.frontZ < 40 && player.pos.z - wave.frontZ > -2;
    const cc = this.charCtx;
    cc.time = t;
    cc.splashed = splashed;
    cc.carrying = state.carried.length > 0;
    cc.panic = panic;
    cc.reduceMotion = reduce;
    this.character.update(dt, player, cc);
    this.character.root.updateMatrixWorld(true);
    if (splashed && !this.wasSplashed) this.ribbon.reset();
    this.wasSplashed = splashed;

    // Camera.
    const swinging = player.mode === 'swing';
    const follow = swinging || player.mode === 'launch' || splashed ? 0 : 1;
    if (wave.phase === 'surge') {
      const d = Math.abs(wave.frontZ - player.pos.z);
      if (d < 25) this.rig.holdTrauma(0.15 * (1 - d / 25));
    }
    this.rig.update(dt, player.pos, player.vel, t, player.mode !== 'ground', follow, swinging, this.solidAt);
    this.camera.updateMatrixWorld();
    this.camera.getWorldDirection(fwd);
    this.updateSeeThrough(player.pos, splashed);

    // Rope.
    if (swinging && player.anchor && !splashed) {
      this.character.handPosition(hand);
      player.gripPos(grip);
      const slack = Math.min(1, Math.max(0, player.ropeLength - grip.distanceTo(player.anchor.pos)));
      this.rope.setStyle(f.cosmetics.rope);
      this.rope.update(dt, hand, player.anchor.pos, slack, t, this.particles);
    } else this.rope.hide();

    // Ribbon and speed lines.
    const speed = player.vel.length();
    this.ribbon.update(dt, tmpV.copy(player.pos).setY(player.pos.y + 0.35), speed, this.camera.position, player.mode !== 'ground' && !splashed);
    this.speedLines.update(dt, this.camera.position, player.vel, q.speedLines && !reduce && !splashed);

    // Blob shadows: player over water (or always on Low), wild creatures (inside creatures.update).
    this.blobs.begin();
    const gy = groundHeightAt(this.course, player.pos.x, player.pos.z, player.pos.y + 0.05);
    if (!splashed && (gy < 0.5 || !q.shadows)) {
      const y = gy < 0.5 ? waveHeight(player.pos.x, player.pos.z, t) : gy;
      this.blobs.add(player.pos.x, y, player.pos.z, player.pos.y - y, 1.4);
    }
    const cf = (this.creatureFrame ??= { time: 0, dt: 0, camera: this.camera, player: player.pos, reduceMotion: false, outlineRange: 0, billboardRange: 0, beatPhase: NaN, shadows: false });
    cf.time = t;
    cf.dt = dt;
    cf.player = player.pos;
    cf.reduceMotion = reduce;
    cf.outlineRange = q.creatureOutlines ? q.outlineRange : 0;
    cf.billboardRange = q.billboardRange;
    cf.beatPhase = f.beatPhase;
    cf.shadows = q.shadows;
    this.creatures.update(
      cf,
      sim.wild,
      sim.time,
      state.carried,
      state.base,
      state.multiplier * state.streakBonus,
      this.character.headTop.matrixWorld,
      this.character.root.quaternion,
      player.vel,
      state.slotCount,
    );
    this.blobs.end();

    // Buddy pet (Hatchery): follows the player's shoulder.
    const bf = (this.buddyFrame ??= { dt: 0, time: 0, ref: null, player: player.pos, facing: player.facing, playerVel: player.vel, grounded: false, hidden: false, outline: false, reduceMotion: false });
    bf.dt = dt;
    bf.time = t;
    bf.ref = activeBuddy(state);
    bf.player = player.pos;
    bf.facing = player.facing;
    bf.playerVel = player.vel;
    bf.grounded = player.mode === 'ground';
    bf.hidden = splashed;
    bf.outline = q.creatureOutlines;
    bf.reduceMotion = reduce;
    this.buddy.update(bf);

    // World, objects, wave.
    const hookTag = f.guides.hookTag;
    const wf = this.worldFrame;
    wf.time = t;
    wf.dt = dt;
    wf.targetId = !swinging && !splashed && player.target ? player.target.id : hookTag ? hookTag.anchorId : -1;
    wf.danger = this.danger;
    wf.player.copy(player.pos);
    wf.shopArrow = this.shopArrow;
    wf.reach = this.reach;
    this.world.update(wf);
    this.objects.update(t, dt, sim, sim.time, this.particles, player.pos);
    this.props?.update(dt, player.pos, this.particles);
    // Golden/Big look from the sim every frame (two uniforms), so a rebuild mid-warning keeps it.
    if (wave.phase !== 'calm') this.wave.setVariant(wave.golden, wave.big);
    this.wave.update(dt, wave, player.pos.x, this.camera.quaternion, this.particles, WAVE.warning);

    // Guides and the predicted landing ring.
    const land = player.mode === 'air' && !splashed ? this.predictLanding(player.pos, player.vel) : null;
    this.guides.update(f.guides ?? NO_GUIDES, t, land, this.hookPos, this.camera, player.pos, this.groundAt);

    // Cold open.
    if (this.coldOpenPending) {
      this.coldOpenPending = false;
      this.coldOpen.play(this.camera.position, fwd);
    }
    if (this.coldOpen.update(dt) && !reduce) this.rig.addTrauma(TRAUMA.coldOpen);

    // Sky, sea, clouds, shadows.
    this.sky.update(this.camera.position);
    this.clouds.update(dt, this.camera.position);
    this.water.update(this.camera.position, fwd);
    if (this.shadows.enabled) this.shadows.follow(player.pos);
    this.particles.update(dt, this.camera.quaternion);

    this.portraits.pump(2);
    this.renderer.render(this.scene, this.camera);
  }

  /** Screen circle around the player inside which decor and palms in front of them dither away. */
  private updateSeeThrough(pos: Vector3, splashed: boolean): void {
    const st = seeThrough.value;
    st.w = 0;
    if (splashed) return;
    const depth = -tmpV2.set(pos.x, pos.y + 1.2, pos.z).applyMatrix4(this.camera.matrixWorldInverse).z;
    if (depth < 0.5) return;
    tmpV2.set(pos.x, pos.y + 1.2, pos.z).project(this.camera);
    if (Math.abs(tmpV2.x) > 1.2 || Math.abs(tmpV2.y) > 1.2) return;
    const r = this.renderer.getPixelRatio();
    const pxPerM = (this.height * r) / 2 / (depth * Math.tan((this.camera.fov * Math.PI) / 360));
    st.set((tmpV2.x * 0.5 + 0.5) * this.width * r, (tmpV2.y * 0.5 + 0.5) * this.height * r, depth, Math.max(30 * r, 1.7 * pxPerM));
  }

  /** Ballistic landing point while airborne (G3b dashed ring). */
  private predictLanding(pos: Vector3, vel: Vector3): Vector3 | null {
    const course = this.course!;
    let x = pos.x;
    let y = pos.y;
    let z = pos.z;
    let vy = vel.y;
    const h = 1 / 30;
    for (let i = 0; i < 120; i++) {
      const ny = y + vy * h;
      vy -= PHYS.gravity * h;
      const nx = x + vel.x * h;
      const nz = z + vel.z * h;
      const g = groundHeightAt(course, nx, nz, y);
      if (ny <= g) return landing.set(nx, g > 0.5 ? g : waveHeight(nx, nz, this.lastTime), nz);
      x = nx;
      y = ny;
      z = nz;
    }
    return null;
  }

  // ---------- Queries ----------

  project(world: Vector3): ScreenPt & { onScreen: boolean; behind: boolean } {
    tmpV2.copy(world).project(this.camera);
    const behind = tmpV2.z > 1;
    const x = ((tmpV2.x + 1) / 2) * this.width;
    const y = ((1 - tmpV2.y) / 2) * this.height;
    const onScreen = !behind && tmpV2.x >= -1 && tmpV2.x <= 1 && tmpV2.y >= -1 && tmpV2.y <= 1;
    return { x, y, onScreen, behind };
  }

  pedestalScreen(i: number): ScreenPt | null {
    if (!this.creatures?.pedestalWorld(i, tmpV)) {
      const p = this.course?.pedestals[i];
      if (!p) return null;
      tmpV.set(p.x, p.y + 1, p.z);
    }
    const s = this.project(tmpV);
    return s.behind ? null : { x: s.x, y: s.y };
  }

  anchorScreen(anchorId: number): ScreenPt | null {
    const a = this.course?.anchors.find((x) => x.id === anchorId);
    if (!a) return null;
    const s = this.project(a.pos);
    return s.behind ? null : { x: s.x, y: s.y };
  }

  pick(p: ScreenPt): { kind: 'pedestal'; index: number } | { kind: 'player' } | null {
    const sim = this.lastSim;
    const state = this.lastState;
    if (!sim || !state || !this.course) return null;
    const scale = Math.min(this.width, this.height) / 720;
    const ps = this.project(tmpV.copy(sim.player.pos).setY(sim.player.pos.y + 1.1));
    if (ps.onScreen && Math.hypot(ps.x - p.x, ps.y - p.y) < 55 * scale) return { kind: 'player' };
    let best = -1;
    let bestD = 60 * scale;
    for (let i = 0; i < state.base.length; i++) {
      if (!state.base[i]) continue;
      const s = this.pedestalScreen(i);
      if (!s) continue;
      const d = Math.hypot(s.x - p.x, s.y - p.y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best >= 0 ? { kind: 'pedestal', index: best } : null;
  }

  stats(): { calls: number; tris: number; ms: number; dpr: number } {
    const r = this.renderer.info.render;
    return { calls: r.calls, tris: r.triangles, ms: this.frameMs, dpr: this.renderer.getPixelRatio() };
  }

  /** The underlying WebGL renderer (sandbox and debug tools). */
  get webgl(): WebGLRenderer {
    return this.renderer;
  }
}
