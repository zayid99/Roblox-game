import {
  AdditiveBlending,
  CircleGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PerspectiveCamera,
  RingGeometry,
  Scene,
  SRGBColorSpace,
  TorusGeometry,
  Vector3,
  WebGLRenderer,
  type Sprite,
} from 'three';
import { Sfx } from './audio/sfx';
import { HOME_TOP } from './game/config';
import { groundHeightAt, MAX_PEDESTALS } from './game/course';
import { creatureIncome, creatureLabel, getSpecies, RARITIES, type CreatureRef } from './game/creatures';
import { UPGRADE_ORDER, formatCash, offlineEarnings, upgradeCost, type UpgradeKey } from './game/economy';
import { nearbyLockedAnchor, type PlayerInput } from './game/player';
import { GameSim, type SimEvent, type WildCreature } from './game/sim';
import { GameState } from './game/state';
import { Input } from './input/input';
import { Platform } from './platform/crazygames';
import { FollowCamera } from './render/legacy/camera';
import { CharacterRig } from './render/legacy/character';
import { makeCreatureMesh } from './render/creatureMesh';
import { Environment } from './render/legacy/environment';
import { IconFactory } from './render/icons';
import { disposeSprite, textSprite } from './render/labels';
import { updateAnimatedMaterials } from './render/materials';
import { Particles } from './render/legacy/particles';
import { WaveVisual } from './render/legacy/waveVisual';
import { buildWorld, type WorldVisuals } from './render/legacy/world';
import { Hud } from './ui/legacy/hud';

const SAVE_KEY = 'swing-or-splash-save';
const FIXED_DT = 1 / 120;
const UP = new Vector3(0, 1, 0);
const DEBUG = import.meta.env.DEV || new URLSearchParams(location.search).has('debug');

interface BaseSlotVisual {
  key: string;
  mesh: Mesh | null;
  label: Sprite | null;
}

const ringGeometry = new RingGeometry(0.75, 1.0, 28).rotateX(-Math.PI / 2);
const beamGeometry = new CylinderGeometry(0.32, 0.32, 1, 10, 1, true).translate(0, 0.5, 0);
const ringMaterials = RARITIES.map((r) => new MeshBasicMaterial({ color: r.color, transparent: true, opacity: 0.85, side: DoubleSide }));
const beamMaterials = RARITIES.map(
  (r) => new MeshBasicMaterial({ color: r.color, transparent: true, opacity: 0.28, blending: AdditiveBlending, depthWrite: false, side: DoubleSide }),
);

export class Game {
  readonly state = new GameState();
  sim!: GameSim;

  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly camera: PerspectiveCamera;
  private readonly followCam: FollowCamera;
  private readonly platform = new Platform();
  private readonly sfx = new Sfx();
  private readonly rig = new CharacterRig();
  private env!: Environment;
  private world!: WorldVisuals;
  private particles!: Particles;
  private waveVisual!: WaveVisual;
  private icons!: IconFactory;
  private hud!: Hud;
  private input!: Input;
  private rope!: Mesh;
  private targetRing!: Mesh;
  private shadow!: Mesh;

  private readonly wildMeshes = new Map<number, Group>();
  private readonly baseVisuals: BaseSlotVisual[] = [];
  private carriedMeshes: Mesh[] = [];
  private carriedKey = '';
  private knownIndex: Record<string, number> = {};
  private pedestalCount = -1;
  private readonly fwd = new Vector3();
  private readonly right = new Vector3();
  private readonly tmp = new Vector3();
  private readonly hand = new Vector3();

  private accumulator = 0;
  private lastFrame = 0;
  private time = 0;
  private paused = false;
  private saveTimer = 0;
  private releaseTipUntil = 0;
  private lastRumble = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly uiRoot: HTMLElement,
  ) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = SRGBColorSpace;
    const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2));
    this.camera = new PerspectiveCamera(62, 1, 0.1, 1600);
    this.followCam = new FollowCamera(this.camera);
  }

  async start(): Promise<void> {
    this.platform.loadingStart();
    await this.platform.init();
    this.loadSave();
    this.sim = new GameSim(this.state);
    this.knownIndex = { ...this.state.index };

    this.env = new Environment(this.scene);
    this.world = buildWorld(this.sim.course);
    this.scene.add(this.world.group);
    this.scene.add(this.rig.root);
    this.particles = new Particles(this.scene);
    this.waveVisual = new WaveVisual(this.scene);
    this.icons = new IconFactory(this.renderer);
    this.createPlayerExtras();

    this.hud = new Hud(this.uiRoot, this.sim.course, this.icons, this.state, {
      buy: (key) => this.buy(key),
      rebirth: () => this.rebirth(),
      toggleSound: () => this.toggleSound(),
      panelChanged: (open) => this.setPaused(open),
    });
    this.input = new Input(this.canvas, this.hud.joyBase, this.hud.joyKnob);
    this.input.bindJumpButton(this.hud.jumpButton);
    this.input.onFirstGesture = () => this.sfx.unlock();
    this.input.onKey = (e) => this.onKey(e.code);
    this.hud.setTouchMode(this.input.touchMode);
    this.hud.setSound(!this.state.settings.muted);
    this.sfx.setMuted(!!this.state.settings.muted);

    this.resize();
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.save();
    });
    window.addEventListener('pagehide', () => this.save());

    this.syncWorldToState();
    this.followCam.snapBehind(0, -1);

    this.platform.loadingStop();
    document.getElementById('loading')?.classList.add('done');
    this.platform.gameplayStart();
    this.offerOfflineEarnings();

    if (DEBUG) (window as unknown as { __game: Game }).__game = this;
    this.lastFrame = performance.now();
    requestAnimationFrame((t) => this.frame(t));
  }

  // ---------- Save / load ----------

  private savedAt = 0;

  private loadSave(): void {
    const raw = this.platform.getItem(SAVE_KEY);
    if (!raw) return;
    try {
      const data = JSON.parse(raw);
      if (this.state.load(data)) this.savedAt = typeof data.savedAt === 'number' ? data.savedAt : 0;
    } catch {
      console.warn('Save data was unreadable; starting fresh.');
    }
  }

  save(): void {
    this.platform.setItem(SAVE_KEY, JSON.stringify(this.state.toSave()));
  }

  private offerOfflineEarnings(): void {
    if (!this.savedAt) return;
    const earned = offlineEarnings(this.state.incomePerSec(), (Date.now() - this.savedAt) / 1000);
    if (earned >= 1) this.hud.showWelcome(earned, () => this.state.earn(earned));
  }

  // ---------- Scene helpers ----------

  private createPlayerExtras(): void {
    this.rope = new Mesh(new CylinderGeometry(0.055, 0.055, 1, 6).translate(0, 0.5, 0), new MeshLambertMaterial({ color: '#c8935a' }));
    this.rope.visible = false;
    this.scene.add(this.rope);

    this.targetRing = new Mesh(new TorusGeometry(1.1, 0.09, 8, 28), new MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.95 }));
    this.targetRing.visible = false;
    this.scene.add(this.targetRing);

    this.shadow = new Mesh(new CircleGeometry(0.7, 20).rotateX(-Math.PI / 2), new MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.28, depthWrite: false }));
    this.scene.add(this.shadow);
  }

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 0.8 ? 75 : 62;
    this.camera.updateProjectionMatrix();
  }

  private syncWorldToState(): void {
    if (this.pedestalCount !== this.state.slotCount) {
      this.pedestalCount = this.state.slotCount;
      this.world.setPedestalCount(this.pedestalCount);
    }
    this.world.updateHooks(this.state.stats.reach);
  }

  // ---------- Main loop ----------

  private frame(now: number): void {
    requestAnimationFrame((t) => this.frame(t));
    const dt = Math.min(0.1, (now - this.lastFrame) / 1000);
    this.lastFrame = now;
    this.time += dt;

    this.input.update();
    if (this.input.touchMode) this.hud.setTouchMode(true);
    const look = this.input.consumeLook();
    if (!this.paused) {
      this.followCam.rotate(look.dx, look.dy, this.time);
      this.followCam.zoom(look.zoom);
    }

    const pressed = this.input.consumeJumpPressed();
    if (!this.paused) {
      this.updateInputYaw();
      this.fwd.set(-Math.sin(this.inputYaw), 0, -Math.cos(this.inputYaw));
      this.right.set(Math.cos(this.inputYaw), 0, -Math.sin(this.inputYaw));
      const input: PlayerInput = {
        moveX: this.right.x * this.input.moveX + this.fwd.x * this.input.moveY,
        moveZ: this.right.z * this.input.moveX + this.fwd.z * this.input.moveY,
        jumpHeld: this.input.jumpHeld,
        jumpPressed: pressed,
      };
      this.accumulator += dt;
      let steps = 0;
      while (this.accumulator >= FIXED_DT && steps < 12) {
        this.sim.step(FIXED_DT, input);
        input.jumpPressed = false;
        for (const e of this.sim.events) this.onEvent(e);
        this.accumulator -= FIXED_DT;
        steps++;
      }
      if (steps === 12) this.accumulator = 0;

      this.saveTimer += dt;
      if (this.saveTimer > 5) {
        this.saveTimer = 0;
        this.save();
      }
    }

    this.updateVisuals(dt);
    this.updateHints();
    this.hud.update(dt, {
      cash: this.state.cash,
      income: this.state.incomePerSec(),
      rebirths: this.state.rebirths,
      wavePhase: this.sim.wave.phase,
      waveTimer: this.sim.wave.timer,
      golden: this.sim.wave.golden,
      frontZ: this.sim.wave.frontZ,
      playerZ: this.sim.player.pos.z,
      carried: this.state.carried,
      capacity: this.state.carryCapacity,
      canAffordSomething: UPGRADE_ORDER.some((k) => this.state.canBuy(k)),
    });
    this.renderer.render(this.scene, this.camera);
  }

  /**
   * Movement is camera-relative, but while a direction is held we keep using the camera angle
   * from when it was pressed. That way the camera can swing around behind you without
   * changing where you're running (otherwise holding "back" makes you run in circles).
   */
  private inputYaw = 0;
  private heldAngle: number | null = null;

  private updateInputYaw(): void {
    const x = this.input.moveX;
    const y = this.input.moveY;
    if (Math.hypot(x, y) < 0.15) {
      this.heldAngle = null;
      this.inputYaw = this.followCam.yaw;
      return;
    }
    const angle = Math.atan2(x, y);
    const turned = this.heldAngle === null || Math.abs(Math.atan2(Math.sin(angle - this.heldAngle), Math.cos(angle - this.heldAngle))) > 0.5;
    if (turned || this.followCam.manualRecently(this.time)) {
      this.heldAngle = angle;
      this.inputYaw = this.followCam.yaw;
    }
  }

  private setPaused(paused: boolean): void {
    this.paused = paused;
    this.input.setEnabled(!paused);
    if (paused) {
      this.platform.gameplayStop();
      this.save();
    } else {
      this.platform.gameplayStart();
      this.accumulator = 0;
    }
  }

  // ---------- Events from the simulation ----------

  private onEvent(e: SimEvent): void {
    const p = this.sim.player.pos;
    switch (e.type) {
      case 'player':
        switch (e.event) {
          case 'jump':
            this.sfx.jump();
            this.particles.burst(p.clone(), '#ffffff', 6, { speed: 3, size: 0.18, life: 0.4 });
            break;
          case 'doubleJump':
            this.sfx.doubleJump();
            this.particles.burst(p.clone(), '#bfeaff', 10, { speed: 4, size: 0.2, life: 0.4, gravity: 4 });
            break;
          case 'grab':
            this.sfx.grab();
            if (!this.state.flags.swung) {
              this.state.flags.swung = true;
              this.releaseTipUntil = this.time + 5;
            }
            break;
          case 'release':
            this.sfx.release();
            break;
          case 'land':
            this.sfx.land();
            this.particles.burst(p.clone(), '#f5f0dc', 6, { speed: 3, size: 0.2, life: 0.35 });
            break;
          case 'pad':
            this.sfx.pad();
            this.particles.burst(p.clone(), '#2de2ff', 20, { speed: 6, up: 6, size: 0.22, life: 0.6 });
            break;
          case 'sea':
            break;
        }
        break;
      case 'collect':
        this.onCollect(e.creature);
        break;
      case 'carryFull':
        this.hud.toast('🎒 Hands full! Take them home.', '#ffe66d');
        this.sfx.denied();
        break;
      case 'deliver': {
        const placed = e.result.placed;
        if (placed.length) {
          this.sfx.deliver();
          const gain = placed.reduce((sum, c) => sum + creatureIncome(c), 0) * this.state.multiplier;
          this.hud.toast(`🏝️ ${placed.length} creature${placed.length > 1 ? 's' : ''} placed! +${formatCash(gain)}/s`, '#b9ffb0');
          if (placed.some((c) => getSpecies(c.speciesId).rarity >= 4)) this.platform.happytime();
        }
        for (const s of e.result.sold) this.hud.toast(`Sold ${creatureLabel(s.creature)} for ${formatCash(s.cash)}`, '#ffd23f');
        this.state.flags.delivered = true;
        this.save();
        break;
      }
      case 'splash':
        this.sfx.splash();
        this.hud.flash('#1e88ff', 0.6);
        this.particles.burst(p.clone().add(this.tmp.set(0, 1, 0)), '#ffffff', 40, { speed: 12, up: 6, size: 0.4, life: 1 });
        if (e.lost.length) this.hud.toast(`🌊 The wave took ${e.lost.length} creature${e.lost.length > 1 ? 's' : ''}!`, '#ff9aa9');
        else this.hud.toast('🌊 Splash!', '#bfeaff');
        break;
      case 'respawn':
        if (e.reason === 'sea') {
          this.sfx.sea();
          this.hud.flash('#2ec5e8', 0.35);
        }
        this.rope.visible = false;
        break;
      case 'zone': {
        const zone = this.sim.course.zones[e.zone];
        const rarity = RARITIES[zone.def.rarity];
        this.hud.banner(`ZONE ${e.zone + 1}: ${zone.def.name}`, `${rarity.name} creatures`, rarity.color, e.first ? 3 : 1.8);
        if (e.first) this.sfx.zone();
        break;
      }
      case 'waveWarning':
        this.sfx.warning();
        this.hud.banner(e.golden ? '✨ GOLDEN WAVE INCOMING!' : '🌊 WAVE INCOMING!', 'Get home, or jump on a lighthouse pad 🗼', e.golden ? '#ffd23f' : '#7fe3ff', 3);
        break;
      case 'surgeStart':
        break;
      case 'surgeEnd':
        this.hud.toast(e.golden ? '✨ Golden creatures washed up!' : '🐙 New creatures washed up!', e.golden ? '#ffd23f' : '#bfeaff');
        break;
      case 'washed':
        for (const uid of e.uids) {
          const g = this.wildMeshes.get(uid);
          if (g) this.particles.burst(g.position.clone().add(this.tmp.set(0, 1, 0)), '#ffffff', 8, { speed: 6, up: 4, size: 0.3, life: 0.6 });
        }
        break;
      case 'spawned':
        break;
    }
  }

  private onCollect(c: WildCreature): void {
    const species = getSpecies(c.speciesId);
    const rarity = RARITIES[species.rarity];
    this.sfx.collect(species.rarity);
    this.particles.burst(c.pos.clone().add(this.tmp.set(0, 1, 0)), rarity.color, 18 + species.rarity * 4, { speed: 7, up: 3, size: 0.25, life: 0.7 });
    const bit = 1 << c.mutation;
    const isNew = ((this.knownIndex[c.speciesId] ?? 0) & bit) === 0;
    this.knownIndex[c.speciesId] = (this.knownIndex[c.speciesId] ?? 0) | bit;
    this.hud.toast(`${isNew ? '🆕 ' : '+ '}${creatureLabel(c)} (${rarity.name}) ${formatCash(creatureIncome(c) * this.state.multiplier)}/s`, rarity.color);
    if (species.rarity >= 4 || c.mutation >= 2) this.hud.banner(creatureLabel(c), `${rarity.name}! Get it home!`, rarity.color, 1.8);
    this.state.flags.collected = true;
  }

  // ---------- Actions ----------

  private buy(key: UpgradeKey): void {
    if (this.state.buy(key)) {
      this.sfx.buy();
      this.state.flags.bought = true;
      this.syncWorldToState();
      this.save();
    } else {
      this.sfx.denied();
    }
    this.hud.renderUpgrades();
  }

  private rebirth(): void {
    if (!this.state.canRebirth()) {
      this.sfx.denied();
      this.hud.toast(`Rebirth costs ${formatCash(this.state.rebirthCost())}`, '#ffd23f');
      return;
    }
    this.state.rebirth();
    this.syncWorldToState();
    this.save();
    this.hud.closePanel();
    this.sim.player.reset(this.sim.course.homeSpawn);
    this.hud.banner('⭐ REBIRTH!', `You now earn ×${this.state.multiplier.toFixed(1)} cash`, '#ffd23f', 3);
    this.sfx.zone();
    this.platform.happytime();
  }

  private toggleSound(): void {
    this.state.settings.muted = !this.state.settings.muted;
    this.sfx.unlock();
    this.sfx.setMuted(!!this.state.settings.muted);
    this.hud.setSound(!this.state.settings.muted);
    this.save();
  }

  private onKey(code: string): void {
    if (code === 'Escape') this.hud.closePanel();
    else if (code === 'KeyU') this.hud.togglePanel('upgrades');
    else if (code === 'KeyI' || code === 'KeyB') this.hud.togglePanel('index');
    else if (code === 'KeyM') this.toggleSound();
    else if (DEBUG && code === 'F2') this.state.earn(Math.max(1000, this.state.cash));
    else if (DEBUG && code === 'F3') this.sim.wave.forceSurge();
  }

  // ---------- Visuals ----------

  private updateVisuals(dt: number): void {
    const sim = this.sim;
    const player = sim.player;
    updateAnimatedMaterials(this.time);
    this.syncWorldToState();
    this.world.update(this.time);

    const splashed = sim.splashTime > 0;
    this.rig.update(dt, player, splashed, this.time);
    this.rig.root.updateMatrixWorld();

    this.updateCarried();
    this.updateWild();
    this.updateBase();

    // Rope.
    if (player.mode === 'swing' && player.anchor && !splashed) {
      this.rig.handPosition(this.hand);
      const dir = this.tmp.copy(player.anchor.pos).sub(this.hand);
      const len = dir.length();
      this.rope.position.copy(this.hand);
      this.rope.quaternion.setFromUnitVectors(UP, dir.normalize());
      this.rope.scale.set(1, len, 1);
      this.rope.visible = true;
    } else {
      this.rope.visible = false;
    }

    // Highlight the hook you'd grab.
    const target = player.mode !== 'swing' && !splashed ? player.target : null;
    this.targetRing.visible = !!target;
    if (target) {
      this.targetRing.position.copy(target.pos);
      this.targetRing.scale.setScalar(1 + Math.sin(this.time * 10) * 0.08);
      this.targetRing.quaternion.copy(this.camera.quaternion);
    }

    // Blob shadow.
    const gy = groundHeightAt(sim.course, player.pos.x, player.pos.z, player.pos.y + 0.05);
    const height = Math.max(0, player.pos.y - gy);
    this.shadow.visible = !splashed && gy > 0.5;
    this.shadow.position.set(player.pos.x, gy + 0.04, player.pos.z);
    this.shadow.scale.setScalar(Math.max(0.35, 1 - height * 0.05));

    const airborne = player.mode !== 'ground';
    const follow = player.mode === 'swing' || player.mode === 'launch' || splashed ? 0 : 1;
    this.followCam.update(dt, player.pos, player.vel, this.time, airborne, follow);
    this.env.update(this.time, this.camera.position);
    this.waveVisual.update(dt, sim.wave, this.time, player.pos.x, this.particles);
    this.particles.update(dt);

    // Wave rumble gets louder as it gets closer.
    let rumble = 0;
    if (sim.wave.phase === 'surge') rumble = Math.max(0.15, 1 - Math.abs(sim.wave.frontZ - player.pos.z) / 220);
    if (Math.abs(rumble - this.lastRumble) > 0.02 || (rumble === 0 && this.lastRumble !== 0)) {
      this.sfx.setRumble(this.paused ? 0 : rumble);
      this.lastRumble = rumble;
    }
  }

  private updateCarried(): void {
    const carried = this.state.carried;
    const key = carried.map((c) => `${c.speciesId}:${c.mutation}`).join(',');
    if (key !== this.carriedKey) {
      this.carriedKey = key;
      for (const m of this.carriedMeshes) this.rig.headTop.remove(m);
      this.carriedMeshes = carried.map((c, i) => {
        const m = makeCreatureMesh(c);
        m.scale.multiplyScalar(0.55);
        m.position.set(0, i * 0.62, 0);
        this.rig.headTop.add(m);
        return m;
      });
    }
    this.carriedMeshes.forEach((m, i) => {
      m.rotation.z = Math.sin(this.time * 5 + i) * 0.12 * (i + 1) * 0.5;
      m.rotation.y = Math.sin(this.time * 2 + i) * 0.3;
    });
  }

  private updateWild(): void {
    const alive = new Set<number>();
    const pz = this.sim.player.pos.z;
    for (const c of this.sim.wild) {
      alive.add(c.uid);
      let g = this.wildMeshes.get(c.uid);
      if (!g) {
        g = this.makeWildVisual(c);
        this.wildMeshes.set(c.uid, g);
        this.scene.add(g);
      }
      // Far-away creatures are lost in the fog anyway; skipping them saves draw calls on phones.
      g.visible = Math.abs(c.pos.z - pz) < 320;
      if (!g.visible) continue;
      const body = g.children[0];
      const age = this.sim.time - c.bornAt;
      const pop = Math.min(1, age / 0.4);
      body.position.y = 0.25 + Math.sin(this.time * 2.6 + c.uid) * 0.15;
      body.rotation.y = this.time * 0.8 + c.uid;
      g.scale.setScalar(pop < 1 ? pop * (1 + Math.sin(pop * Math.PI) * 0.3) : 1);
    }
    for (const [uid, g] of this.wildMeshes) {
      if (alive.has(uid)) continue;
      this.scene.remove(g);
      this.wildMeshes.delete(uid);
    }
  }

  private makeWildVisual(c: WildCreature): Group {
    const g = new Group();
    const rarity = getSpecies(c.speciesId).rarity;
    const body = makeCreatureMesh(c);
    g.add(body);
    const ring = new Mesh(ringGeometry, ringMaterials[rarity]);
    ring.position.y = 0.05;
    g.add(ring);
    if (rarity >= 2 || c.mutation > 0) {
      const beam = new Mesh(beamGeometry, beamMaterials[rarity]);
      beam.scale.set(1, 6 + rarity * 3, 1);
      g.add(beam);
    }
    g.position.copy(c.pos);
    return g;
  }

  private updateBase(): void {
    const course = this.sim.course;
    const slots = Math.min(MAX_PEDESTALS, this.state.base.length);
    for (let i = 0; i < slots; i++) {
      const c: CreatureRef | null = this.state.base[i];
      const key = c ? `${c.speciesId}:${c.mutation}:${this.state.rebirths}` : '';
      let v = this.baseVisuals[i];
      if (!v) {
        v = { key: '-', mesh: null, label: null };
        this.baseVisuals[i] = v;
      }
      if (v.key !== key) {
        if (v.mesh) this.scene.remove(v.mesh);
        if (v.label) {
          this.scene.remove(v.label);
          disposeSprite(v.label);
        }
        v.mesh = null;
        v.label = null;
        v.key = key;
        if (c) {
          const p = course.pedestals[i];
          const mesh = makeCreatureMesh(c);
          mesh.position.set(p.x, HOME_TOP + 0.3, p.z);
          mesh.rotation.y = Math.PI;
          this.scene.add(mesh);
          v.mesh = mesh;
          const rarity = RARITIES[getSpecies(c.speciesId).rarity];
          const label = textSprite([{ text: `${formatCash(creatureIncome(c) * this.state.multiplier)}/s`, color: rarity.color, size: 34 }], 2.6, 0.8);
          label.position.set(p.x, HOME_TOP + 2.6, p.z);
          this.scene.add(label);
          v.label = label;
          this.particles.burst(mesh.position.clone().add(this.tmp.set(0, 1, 0)), rarity.color, 14, { speed: 5, up: 3, size: 0.22, life: 0.6 });
        }
      }
      if (v.mesh) v.mesh.position.y = HOME_TOP + 0.3 + Math.abs(Math.sin(this.time * 2 + i)) * 0.12;
    }
  }

  // ---------- Tutorial hints ----------

  private updateHints(): void {
    const f = this.state.flags;
    const sim = this.sim;
    const touch = this.input.touchMode;
    let hint: string | null = null;
    if (this.paused) hint = null;
    else if (!f.swung) hint = touch ? 'Run with the joystick · HOLD the JUMP button off the edge to swing!' : 'Run with WASD · Jump off the edge and HOLD SPACE to swing!';
    else if (this.time < this.releaseTipUntil) hint = 'Let go at the top of the swing to fly forward!';
    else if (sim.wave.phase !== 'calm' && !sim.isOnHome() && sim.player.pos.y < 13) hint = '🌊 Get home, or step on a glowing pad to launch up a lighthouse!';
    else if (!f.collected) hint = 'Grab the creatures on the islands! 🐙';
    else if (!f.delivered && this.state.carried.length > 0) hint = 'Bring your creatures home before the wave hits! 🏝️';
    else if (!f.bought && this.state.cash >= Math.min(...UPGRADE_ORDER.map((k) => upgradeCost(k, 0)))) hint = touch ? 'Tap 🛒 to buy upgrades!' : 'Press U (or 🛒) to buy upgrades!';
    else if (this.state.carried.length >= this.state.carryCapacity && !sim.isOnHome()) hint = '🎒 Hands full! Head home to cash in.';

    if (!hint && sim.player.mode !== 'ground' && !sim.player.target) {
      const locked = nearbyLockedAnchor(sim.player.gripPos(this.tmp), sim.course.anchors, this.state.stats.reach, 14);
      if (locked) hint = `🔒 These hooks need Rope Reach ${locked.minReach} m. Upgrade it in 🛒`;
    }
    this.hud.hint(hint);
  }
}
