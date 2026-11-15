import { Vector3 } from 'three';
import { COMBO, ECONOMY, HOME_FRONT_Z, HOME_TOP, PHYS, SEA_RESPAWN_DELAY } from './config';
import { ComboTracker } from './combo';
import { anchorPosAt, CRUMBLE, generateCourse, geyserStateAt, zoneAtZ, type Anchor, type Course, type GeyserState, type Island, type Pad, type Stone } from './course';
import { playerOverlaps } from './physics';
import { creatureIncome, pickSpecies, rollCreature, RARITIES, type CreatureRef } from './creatures';
import { deliveryMult } from './hatchery';
import { PlayerSim, type PlayerInput } from './player';
import { inPerfectWindow, rateRelease } from './predict';
import { applyReward } from './rewards';
import { Rng } from './rng';
import { SeaEventSim, type SeaSignal } from './seaEvents';
import { GameState } from './state';
import { openBottle, TreasureSim, type Bottle } from './treasure';
import { WaveSim } from './wave';
import { ZONES } from './zones';

import type { BottleKind, ReleaseQuality, SeaEventId, SimEvent, SimOverrides, WildCreature } from '../contracts';
import type { PlayerStats } from './player';
export type { SimEvent, WildCreature } from '../contracts';

export const SPLASH_TIME = 1.6;

export type StonePhase = 'solid' | 'shaking' | 'sunk' | 'rising';

const tmpFwd = new Vector3();

/** The whole game minus rendering, input devices and UI. Deterministic for a given seed. */
export class GameSim {
  readonly course: Course;
  readonly player = new PlayerSim();
  readonly wave: WaveSim;
  readonly state: GameState;
  readonly combo = new ComboTracker();
  wild: WildCreature[] = [];
  readonly events: SimEvent[] = [];
  time = 0;
  /** Zone the player is in (-1 = home). */
  zone = -1;
  /** Counts down while the wave tumbles the player. */
  splashTime = 0;
  /** Seconds between the 'sea' event and the 'respawn' event (§9.0). */
  readonly seaRespawnDelay = SEA_RESPAWN_DELAY;
  /** Counts down from seaRespawnDelay after a sea fall; the player is frozen meanwhile. */
  seaRespawnTime = 0;
  readonly checkpoint: Vector3;
  /** Set by the lead every frame from TutorialFrame.sim. */
  overrides: SimOverrides = { waveFrozen: false, practiceWave: false };
  /** True while a release right now would be Perfect (updated every step). */
  perfectWindow = false;
  /** Rope angle in degrees while swinging (0 otherwise); see PlayerSim.swingAngle. */
  swingTheta = 0;
  /** This week's Featured Creature (set by Progression), weighted ×2 in spawns. */
  featuredSpecies: string | null = null;
  /** True once the player has been splashed during the current surge. */
  splashedThisSurge = false;

  // ---- Treasure Bottles and Sea Events (src/game/treasure.ts, src/game/seaEvents.ts) ----
  /** Bottles in the world and in the player's hands. Own Rng, so creature rolls are unchanged. */
  readonly treasure: TreasureSim;
  /** The session's sea-event clock. Own Rng. */
  readonly sea: SeaEventSim;
  /** Set by the lead every frame: a tutorial (or replay) is running, so no bottles and no sea events. */
  tutorialActive = false;
  /** Events raised between steps (debug hooks), emitted at the start of the next step. */
  private readonly queued: SimEvent[] = [];

  private readonly rng: Rng;
  private readonly islandBySolid = new Map<number, Island>();
  private readonly padById = new Map<number, Pad>();
  private readonly drifting: Anchor[];
  /** Sim time each crumble stone started to crumble (absent = solid). */
  private readonly crumbleStart = new Map<number, number>();
  private readonly stoneBySolid = new Map<number, Stone>();
  private readonly stoneById = new Map<number, Stone>();
  /** Scratch list for the 'washed' event (reused every step of a surge). */
  private readonly washed: number[] = [];
  private nextUid = 1;
  private carryFullCooldown = 0;
  private inShopZone = false;

  constructor(state: GameState, opts: { courseSeed?: number; rngSeed?: number; featuredSpecies?: string | null } = {}) {
    this.course = generateCourse(opts.courseSeed);
    this.state = state;
    this.wave = new WaveSim(this.course.endZ - 40);
    const seed = opts.rngSeed ?? Date.now();
    this.rng = new Rng(seed);
    this.treasure = new TreasureSim(this.course, new Rng((seed ^ 0x5bd1e995) >>> 0));
    this.sea = new SeaEventSim((seed ^ 0x27d4eb2d) >>> 0);
    this.featuredSpecies = opts.featuredSpecies ?? null;
    this.checkpoint = this.course.homeSpawn.clone();
    this.islandBySolid.set(this.course.home.id, this.course.homeIsland);
    for (const island of this.course.islands) this.islandBySolid.set(island.solid.id, island);
    for (const pad of this.course.pads) this.padById.set(pad.id, pad);
    this.drifting = this.course.anchors.filter((a) => a.drift || a.sway);
    for (const st of this.course.stones) {
      this.stoneBySolid.set(st.solid.id, st);
      this.stoneById.set(st.id, st);
    }
    this.player.reset(this.course.homeSpawn);
    this.respawnCreatures(false);
  }

  private makeWild(c: CreatureRef, pos: Vector3, island: Island, golden: boolean): WildCreature {
    return {
      speciesId: c.speciesId,
      mutation: c.mutation,
      uid: this.nextUid++,
      pos: pos.clone(),
      zone: island.zone,
      island,
      bornAt: this.time,
      golden,
      featured: c.speciesId === this.featuredSpecies,
    };
  }

  /** Clears the course and washes up a fresh batch of creatures. */
  respawnCreatures(golden: boolean): void {
    this.wild = [];
    for (const island of this.course.islands) {
      const rarity = this.course.zones[island.zone].def.rarity;
      for (const p of island.spawnPoints) {
        // Sea events: Feeding Frenzy fills every spawn point, Rainbow Rain gives each creature an extra mutation roll.
        if (!this.rng.chance(this.sea.active === 'feedingFrenzy' ? 1 : ECONOMY.spawnChance)) continue;
        const c = rollCreature(rarity, golden, this.rng, this.featuredSpecies);
        if (this.sea.active === 'rainbowRain') c.mutation = this.sea.boostMutation(c.mutation, golden);
        this.wild.push(this.makeWild(c, p, island, golden));
      }
    }
    this.events.push({ type: 'spawned', golden });
  }

  /**
   * Puts a creature on spawn point `point` of the island with course order `islandOrder`
   * (replacing whatever stood there). Without a species it rolls one of the zone's rarity.
   */
  forceSpawn(islandOrder: number, point: number, speciesId?: string, mutation = 0): WildCreature | null {
    const island = this.course.islands.find((i) => i.order === islandOrder);
    const p = island?.spawnPoints[point];
    if (!island || !p) return null;
    this.wild = this.wild.filter((c) => c.island !== island || c.pos.distanceToSquared(p) > 0.01);
    const rarity = this.course.zones[island.zone].def.rarity;
    const id = speciesId ?? pickSpecies(rarity, this.rng, this.featuredSpecies).id;
    const w = this.makeWild({ speciesId: id, mutation: Math.max(0, Math.min(3, Math.floor(mutation))) }, p, island, false);
    this.wild.push(w);
    return w;
  }

  /** Gives back creatures the wave took (rewarded ad "KEEP THEM"). */
  restoreCarried(refs: readonly CreatureRef[]): void {
    this.state.restoreCarried(refs);
  }

  geyserState(id: number): GeyserState {
    const g = this.course.geysers.find((x) => x.id === id);
    return g ? geyserStateAt(g, this.time) : 'idle';
  }

  /** Crumble stone cycle: solid until stood on, then shaking → sunk → rising → solid. t is seconds into the phase. */
  stoneState(id: number): { phase: StonePhase; t: number } {
    const start = this.crumbleStart.get(id);
    if (start === undefined) return { phase: 'solid', t: 0 };
    let t = this.time - start;
    if (t < CRUMBLE.shake) return { phase: 'shaking', t };
    t -= CRUMBLE.shake;
    if (t < CRUMBLE.sunk) return { phase: 'sunk', t };
    t -= CRUMBLE.sunk;
    return { phase: 'rising', t };
  }

  /** Advances the crumble stones: sinks them after the shake, brings them back once risen (and not inside the player). */
  private updateStones(): void {
    if (this.crumbleStart.size === 0) return;
    const p = this.player.pos;
    for (const [id, start] of this.crumbleStart) {
      const st = this.stoneById.get(id);
      if (!st) continue;
      const t = this.time - start;
      if (t >= CRUMBLE.shake && !st.solid.off && t < CRUMBLE.shake + CRUMBLE.sunk + CRUMBLE.rise) {
        st.solid.off = true;
        if (this.player.groundSolid === st.solid && this.player.mode === 'ground') this.player.mode = 'air';
        this.events.push({ type: 'crumble', stoneId: id, phase: 'sink' });
      } else if (t >= CRUMBLE.shake + CRUMBLE.sunk + CRUMBLE.rise) {
        st.solid.off = false;
        if (playerOverlaps(p.x, p.y, p.z, st.solid)) {
          st.solid.off = true;
          continue;
        }
        this.crumbleStart.delete(id);
      }
    }
  }

  isOnHome(): boolean {
    return this.player.mode === 'ground' && this.player.groundSolid?.kind === 'home';
  }

  /**
   * Where the player stands out of the wave's reach: on the home island or up on a lighthouse
   * (platform or tower top, as for SURVIVED), including small hops there. Null anywhere else.
   */
  safeSpot(): 'home' | 'lighthouse' | null {
    const pl = this.player;
    const g = pl.groundSolid;
    if (!g || this.splashTime > 0 || this.seaRespawnTime > 0 || pl.mode === 'swing') return null;
    const p = pl.pos;
    // Standing on it means the body overlaps its top (the feet centre can be just past an edge).
    const hw = PHYS.halfWidth;
    if (p.x + hw <= g.min.x || p.x - hw >= g.max.x || p.z + hw <= g.min.z || p.z - hw >= g.max.z) return null;
    if (g.kind === 'home') return p.y >= HOME_TOP - 0.5 ? 'home' : null;
    if (g.kind === 'platform' || g.kind === 'tower') return p.y >= g.max.y - 0.5 ? 'lighthouse' : null;
    return null;
  }

  /**
   * C15 "YOU'RE SAFE": on the home island, above the current crest,
   * or the wave has already passed (or will never reach) the player.
   */
  playerSafe(): boolean {
    if (this.isOnHome() || this.homeShelters()) return true;
    if (this.player.pos.y >= this.wave.crest) return true;
    return !Number.isFinite(this.wave.timeUntilReaches(this.player.pos.z));
  }

  step(dt: number, input: PlayerInput): void {
    this.events.length = 0;
    if (this.queued.length) {
      this.events.push(...this.queued);
      this.queued.length = 0;
    }
    this.time += dt;
    this.carryFullCooldown = Math.max(0, this.carryFullCooldown - dt);
    for (const a of this.drifting) anchorPosAt(a, this.time, a.pos);
    this.updateStones();

    this.updateSea(dt);
    this.wave.frozen = this.overrides.waveFrozen || this.sea.freezesWave; // Calm Seas stops the countdown
    this.updateWave(dt);

    if (this.splashTime > 0) {
      this.updateSplash(dt);
    } else if (this.seaRespawnTime > 0) {
      this.seaRespawnTime -= dt;
      if (this.seaCaughtByWave()) {
        // In the water when the wall comes through: the wave takes you (no escaping it by falling in).
        this.seaRespawnTime = 0;
        this.splashPlayer();
      } else if (this.seaRespawnTime <= 0) {
        this.seaRespawnTime = 0;
        this.respawnAt(this.checkpoint, 'sea');
      }
    } else {
      this.updatePlayer(dt, input);
    }

    if (this.player.mode === 'swing' && this.player.anchor) {
      this.swingTheta = this.player.swingAngle(this.player.swingForward(tmpFwd));
      this.perfectWindow = inPerfectWindow(this.swingTheta, this.player.vel.y);
    } else {
      this.swingTheta = 0;
      this.perfectWindow = false;
    }

    this.state.tick(dt);
  }

  private updateWave(dt: number): void {
    const wasGolden = this.wave.golden;
    const wasBig = this.wave.big;
    this.wave.update(dt);
    for (const e of this.wave.events) {
      const w = this.wave;
      if (e === 'warning') this.events.push({ type: 'waveWarning', golden: w.golden, big: w.big, number: w.number });
      else if (e === 'surgeStart') {
        this.splashedThisSurge = false;
        this.events.push({ type: 'surgeStart', golden: w.golden, big: w.big, number: w.number });
      } else {
        this.events.push({ type: 'surgeEnd', golden: wasGolden, big: wasBig, number: w.count, survived: this.survivedSurge() });
        this.respawnCreatures(wasGolden);
        if (wasBig) this.guaranteeBigWaveCreature(wasGolden);
        if (this.treasureAllowed()) {
          const b = this.treasure.afterWave(wasGolden, wasBig, this.state.bestZone, this.time, this.occupiedSpots());
          if (b) this.events.push(bottleSpawnEvent(b, 'wave'));
        }
      }
    }
    if (this.wave.phase === 'surge') {
      // Compact in place: this runs every step of a surge, so no new arrays.
      const front = this.wave.frontZ;
      const wild = this.wild;
      let n = 0;
      for (const c of wild) {
        if (c.pos.z < front) this.washed.push(c.uid);
        else wild[n++] = c;
      }
      if (n < wild.length) {
        wild.length = n;
        this.events.push({ type: 'washed', uids: this.washed.slice() });
        this.washed.length = 0;
      }
      const gone = this.treasure.wash(front);
      if (gone.length) this.events.push({ type: 'bottleLost', kinds: gone.map((b) => b.kind), how: 'washed' });
    }
  }

  /** §9.8: not splashed this surge, and on the home island or a lighthouse platform/tower top (as safeSpot). */
  private survivedSurge(): boolean {
    return !this.splashedThisSurge && this.safeSpot() !== null;
  }

  /**
   * The home island shelters a player standing on (or hopping on) it, including its front lip: the feet can be
   * a little past HOME_FRONT_Z while the body still stands on home, where WaveSim.hits() alone would splash them.
   */
  private homeShelters(): boolean {
    return this.safeSpot() === 'home';
  }

  /** After a Big Wave: one creature of rarity min(6, bestZone rarity + 1) on a random island of the best zone. */
  private guaranteeBigWaveCreature(golden: boolean): void {
    const z = Math.max(0, Math.min(ZONES.length - 1, this.state.bestZone));
    const rarity = Math.min(RARITIES.length - 1, ZONES[z].rarity + 1);
    const islands = this.course.islands.filter((i) => i.zone === z && i.spawnPoints.length > 0);
    if (!islands.length) return;
    const island = this.rng.pick(islands);
    const p = this.rng.pick(island.spawnPoints);
    this.wild = this.wild.filter((c) => c.island !== island || c.pos.distanceToSquared(p) > 0.01);
    const species = pickSpecies(rarity, this.rng, this.featuredSpecies);
    const c = rollCreature(rarity, golden, this.rng, this.featuredSpecies);
    this.wild.push(this.makeWild({ speciesId: species.id, mutation: c.mutation }, p, island, golden));
  }

  private updateSplash(dt: number): void {
    this.splashTime -= dt;
    const p = this.player.pos;
    p.z += this.wave.speed * 0.85 * dt;
    p.y += (3 - p.y) * Math.min(1, dt * 4);
    if (this.splashTime <= 0) {
      this.splashTime = 0;
      this.respawnAt(this.course.homeSpawn, 'wave');
      this.checkpoint.copy(this.course.homeSpawn);
    }
  }

  private respawnAt(at: Vector3, reason: 'sea' | 'wave'): void {
    this.player.reset(at);
    this.events.push({ type: 'respawn', reason });
  }

  private endChain(reason: 'timeout' | 'sea' | 'splash' | 'home'): void {
    const count = this.combo.end(reason);
    if (count > 0) this.events.push({ type: 'chainEnd', count, reason });
  }

  private updatePlayer(dt: number, input: PlayerInput): void {
    const player = this.player;
    player.time = this.time - dt;
    player.step(dt, input, this.playerStats(), this.course);

    for (const ev of player.events) {
      this.events.push({ type: 'player', event: ev });
      if (ev === 'grab') {
        this.events.push({ type: 'chain', count: this.combo.grab() });
      } else if (ev === 'release') {
        this.rateRelease();
      } else if (ev === 'land' && player.groundSolid) {
        const solid = player.groundSolid;
        const island = this.islandBySolid.get(solid.id);
        if (island) this.checkpoint.copy(island.checkpoint);
        const islandOrder = solid.kind === 'home' ? -1 : solid.kind === 'tower' || solid.kind === 'platform' ? -2 : (island?.order ?? -2);
        this.events.push({ type: 'landed', solid, islandOrder });
        if (player.landedAttached) this.combo.release('good');
        const stone = this.stoneBySolid.get(solid.id);
        if (stone && !this.crumbleStart.has(stone.id)) {
          this.crumbleStart.set(stone.id, this.time);
          this.events.push({ type: 'crumble', stoneId: stone.id, phase: 'shake' });
        }
        if (solid.kind === 'home') this.endChain('home');
      } else if (ev === 'pad') {
        this.onPad(player.padId);
      }
    }
    if (player.bouncedOn >= 0) this.events.push({ type: 'bounce', buoyId: player.bouncedOn });
    if (player.geyserLaunched >= 0) this.events.push({ type: 'geyser', geyserId: player.geyserLaunched });
    if (player.sprungOn >= 0) this.events.push({ type: 'spring', springId: player.sprungOn });

    if (player.events.includes('sea')) {
      this.endChain('sea');
      this.seaRespawnTime = this.seaRespawnDelay;
      player.vel.set(0, 0, 0);
      return;
    }

    this.collectNearby();

    const timedOut = this.combo.update(dt, player.mode === 'ground' && player.groundSolid?.kind === 'island');
    if (timedOut > 0) this.events.push({ type: 'chainEnd', count: timedOut, reason: 'timeout' });

    if (this.state.carried.length > 0 && this.isOnHome()) this.deliverHome();
    if (this.treasure.carried.length > 0 && this.isOnHome()) this.openBottles();

    const zone = zoneAtZ(this.course, player.pos.z);
    if (zone !== this.zone) {
      this.zone = zone;
      if (zone >= 0) {
        const first = zone > this.state.bestZone;
        if (first) this.state.bestZone = zone;
        this.events.push({ type: 'zone', zone, first });
      }
    }

    const sz = this.course.shopZone;
    const p = player.pos;
    const inShop = p.x >= sz.min.x && p.x <= sz.max.x && p.z >= sz.min.z && p.z <= sz.max.z && p.y >= sz.min.y - 0.5 && p.y <= sz.max.y;
    if (inShop && !this.inShopZone) this.events.push({ type: 'shopZone' });
    this.inShopZone = inShop;

    if (!this.homeShelters() && this.wave.hits(player.pos.y, player.pos.z)) this.splashPlayer();
  }

  /** The wave catches the player: tumble for SPLASH_TIME, then respawn at home. */
  private splashPlayer(): void {
    const player = this.player;
    this.splashTime = SPLASH_TIME;
    this.splashedThisSurge = true;
    player.anchor = null;
    player.mode = 'air';
    player.vel.set(0, 0, 0);
    const practice = this.overrides.practiceWave;
    // Practice wave: the creatures float off and snap back; `lost` lists them but they are kept.
    const lost = practice ? this.state.carried.map((c) => ({ ...c })) : this.state.loseCarried();
    // The wave takes carried bottles like creatures (kept in the practice wave).
    if (!practice && this.treasure.carried.length) this.events.push({ type: 'bottleLost', kinds: this.treasure.takeCarried().map((b) => b.kind), how: 'splash' });
    this.endChain('splash');
    this.events.push({ type: 'splash', lost, practice });
  }

  /**
   * During the sea-fall beat: the wall reaches the spot where the player fell in, or the respawn would put them
   * on a checkpoint the wall has already swept while their fall spot is still ahead of it (falling into the sea
   * right in front of the wave must not carry them through it with their creatures).
   */
  private seaCaughtByWave(): boolean {
    const w = this.wave;
    if (w.phase !== 'surge') return false;
    const p = this.player.pos;
    if (w.hits(p.y, p.z)) return true;
    if (this.seaRespawnTime > 0) return false;
    const cp = this.checkpoint;
    return cp.z <= HOME_FRONT_Z && cp.z <= w.frontZ && p.z > w.frontZ && p.z <= HOME_FRONT_Z;
  }

  /** Rates the release the player just made (recorded before the boost) and applies the Perfect boost. */
  private rateRelease(): void {
    const r = this.player.lastRelease;
    const quality: ReleaseQuality = r ? rateRelease(r.theta, r.vel.y) : 'early';
    if (quality === 'perfect') {
      this.player.vel.x *= COMBO.perfectBoost;
      this.player.vel.z *= COMBO.perfectBoost;
    }
    this.combo.release(quality);
    this.events.push({ type: 'releaseRated', quality, theta: r ? r.theta : 0 });
  }

  private onPad(padId: number): void {
    const pad = this.padById.get(padId);
    const inWave = this.wave.phase !== 'calm';
    this.events.push({ type: 'padLaunch', padId, inWave });
    if (pad && inWave && this.wave.timeUntilReaches(pad.min.z) <= COMBO.closeCallSeconds) {
      this.events.push({ type: 'closeCall', where: 'pad' });
    }
  }

  private deliverHome(): void {
    if (this.combo.chain > 0) this.endChain('home');
    const carried = this.state.carried;
    const tripBest = this.combo.consumeTrip();
    const chainMult = ComboTracker.chainMult(tripBest);
    const closeCall = this.wave.phase !== 'calm' && this.wave.timeUntilReaches(HOME_FRONT_Z) <= COMBO.closeCallSeconds;
    let income = 0;
    for (const c of carried) income += creatureIncome(c);
    const bonusCash = income * this.state.multiplier * COMBO.deliverySeconds * chainMult * (closeCall ? COMBO.closeCallMult : 1) * deliveryMult(this.state);
    const result = this.state.deliver();
    this.state.earn(bonusCash);
    this.events.push({ type: 'deliver', result, bonusCash, chainMult, tripBest, closeCall });
    if (closeCall) this.events.push({ type: 'closeCall', where: 'home' });
  }

  private collectNearby(): void {
    const p = this.player.pos;
    this.collectBottle();
    for (let i = this.wild.length - 1; i >= 0; i--) {
      const c = this.wild[i];
      if (Math.abs(c.pos.y - p.y) > 2.5) continue;
      if (Math.hypot(c.pos.x - p.x, c.pos.z - p.z) > 1.7) continue;
      if (!this.state.canCarryMore() || this.carryFree() <= 0) {
        if (this.carryFullCooldown <= 0) {
          this.events.push({ type: 'carryFull' });
          this.carryFullCooldown = 2.5;
        }
        return;
      }
      const mask = this.state.index[c.speciesId] ?? 0;
      const isNewSpecies = mask === 0;
      const isNewMutation = (mask & (1 << c.mutation)) === 0;
      this.state.pickUp(c);
      this.wild.splice(i, 1);
      this.events.push({ type: 'collect', creature: c, isNewSpecies, isNewMutation });
    }
  }

  // ================================================================ Treasure Bottles and Sea Events
  // Hooks: step() → updateSea, updateWave → afterWave/wash, collectNearby → collectBottle, splashPlayer → lose,
  // updatePlayer → openBottles at home, respawnCreatures → Frenzy/Rainbow odds, playerStats → Calm Seas speed.

  /** Carry slots left: creatures and bottles share them. */
  carryFree(): number {
    return this.state.carryCapacity - this.state.carried.length - this.treasure.carried.length;
  }

  /** Bottles only wash up once the tutorial is over and none is running. */
  private treasureAllowed(): boolean {
    return this.state.ftue.done && !this.tutorialActive && !this.overrides.waveFrozen && !this.overrides.practiceWave;
  }

  private occupiedSpots(): Vector3[] {
    return this.wild.map((c) => c.pos);
  }

  /** Movement stats for this step (Calm Seas: faster running). */
  private playerStats(): PlayerStats {
    const s = this.state.stats;
    const k = this.sea.runSpeedMult;
    if (k !== 1) s.runSpeed *= k;
    return s;
  }

  /** Debug and tests: washes up a bottle now (the farthest reachable island unless `islandOrder` is given). */
  spawnBottle(kind: BottleKind = 'normal', islandOrder?: number): Bottle | null {
    const island = islandOrder === undefined ? undefined : this.course.islands.find((i) => i.order === islandOrder);
    const b = this.treasure.spawn(kind, this.state.bestZone, this.time, this.occupiedSpots(), island);
    if (b) this.queued.push(bottleSpawnEvent(b, 'debug'));
    return b;
  }

  /** Debug and tests: starts a sea event now (with its 15 s heads-up unless skipHeadsUp). */
  forceSeaEvent(id?: SeaEventId, skipHeadsUp = false): void {
    this.sea.force(id, skipHeadsUp);
  }

  private collectBottle(): void {
    if (!this.treasure.world.length) return;
    const b = this.treasure.tryPickUp(this.player.pos, this.carryFree());
    if (b) this.events.push({ type: 'bottlePickup', uid: b.uid, kind: b.kind });
    else if (this.carryFullCooldown <= 0 && this.treasure.near(this.player.pos)) {
      this.events.push({ type: 'carryFull' });
      this.carryFullCooldown = 2.5;
    }
  }

  /** Home with bottles: each opens, its prize goes straight into the state. */
  private openBottles(): void {
    for (const b of this.treasure.takeCarried()) {
      const { prize, reward } = openBottle(this.state, b.kind, this.treasure.rng);
      const { discovery } = applyReward(this.state, reward);
      this.events.push({ type: 'bottleOpen', kind: b.kind, prize, reward, discovery });
    }
  }

  private updateSea(dt: number): void {
    const blocked = !this.state.ftue.done || this.tutorialActive || this.overrides.waveFrozen || this.overrides.practiceWave;
    this.sea.update(dt, { blocked, wavePhase: this.wave.phase, waveTimer: this.wave.timer, waveFrozen: this.overrides.waveFrozen });
    const signals = this.sea.signals;
    for (let i = 0; i < signals.length; i++) this.onSeaSignal(signals[i]);
    signals.length = 0;
  }

  private onSeaSignal(s: SeaSignal): void {
    if (s.phase === 'refill') {
      this.fillSpawnPoints();
      return;
    }
    this.events.push({ type: 'seaEvent', id: s.id, phase: s.phase });
    if (s.phase !== 'start') return;
    if (s.id === 'feedingFrenzy') this.fillSpawnPoints();
    else if (s.id === 'treasureFleet') {
      for (const b of this.treasure.fleet(this.state.bestZone, this.time, this.occupiedSpots())) this.events.push(bottleSpawnEvent(b, 'fleet'));
    } else if (s.id === 'rainbowRain') {
      // The rain touches every creature already out: an extra mutation roll (an upgrade pops in as a new creature).
      for (let i = 0; i < this.wild.length; i++) {
        const c = this.wild[i];
        const m = this.sea.boostMutation(c.mutation, c.golden);
        if (m !== c.mutation) this.wild[i] = this.makeWild({ speciesId: c.speciesId, mutation: m }, c.pos, c.island, c.golden);
      }
    }
  }

  /** Feeding Frenzy: a creature on every empty spawn point (rolled with the sea Rng). */
  private fillSpawnPoints(): void {
    const rng = this.sea.rng;
    for (const island of this.course.islands) {
      const rarity = this.course.zones[island.zone].def.rarity;
      for (const p of island.spawnPoints) {
        if (this.wild.some((c) => c.island === island && c.pos.distanceToSquared(p) < 0.01)) continue;
        if (this.treasure.world.some((b) => b.pos.distanceToSquared(p) < 1)) continue;
        this.wild.push(this.makeWild(rollCreature(rarity, false, rng, this.featuredSpecies), p, island, false));
      }
    }
  }
}

function bottleSpawnEvent(b: Bottle, reason: 'wave' | 'fleet' | 'debug'): SimEvent {
  return { type: 'bottleSpawn', uid: b.uid, kind: b.kind, pos: b.pos, islandOrder: b.islandOrder, reason };
}
