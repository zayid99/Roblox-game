import { Vector3 } from 'three';
import { ECONOMY } from './config';
import { generateCourse, zoneAtZ, type Course, type Island } from './course';
import { rollCreature } from './creatures';
import { PlayerSim, type PlayerInput } from './player';
import { Rng } from './rng';
import { GameState } from './state';
import { WaveSim } from './wave';

import type { SimEvent, WildCreature } from '../contracts';
export type { SimEvent, WildCreature } from '../contracts';

export const SPLASH_TIME = 1.6;

/** The whole game minus rendering, input devices and UI. Deterministic for a given seed. */
export class GameSim {
  readonly course: Course;
  readonly player = new PlayerSim();
  readonly wave: WaveSim;
  readonly state: GameState;
  wild: WildCreature[] = [];
  readonly events: SimEvent[] = [];
  time = 0;
  /** Zone the player is in (-1 = home). */
  zone = -1;
  /** Counts down while the wave tumbles the player. */
  splashTime = 0;
  readonly checkpoint: Vector3;

  private readonly rng: Rng;
  private readonly islandBySolid = new Map<number, Island>();
  private nextUid = 1;
  private carryFullCooldown = 0;

  constructor(state: GameState, opts: { courseSeed?: number; rngSeed?: number } = {}) {
    this.course = generateCourse(opts.courseSeed);
    this.state = state;
    this.wave = new WaveSim(this.course.endZ - 40);
    this.rng = new Rng(opts.rngSeed ?? Date.now());
    this.checkpoint = this.course.homeSpawn.clone();
    this.islandBySolid.set(this.course.home.id, this.course.homeIsland);
    for (const island of this.course.islands) this.islandBySolid.set(island.solid.id, island);
    this.player.reset(this.course.homeSpawn);
    this.respawnCreatures(false);
  }

  /** Clears the course and washes up a fresh batch of creatures. */
  respawnCreatures(golden: boolean): void {
    this.wild = [];
    for (const island of this.course.islands) {
      const rarity = this.course.zones[island.zone].def.rarity;
      for (const p of island.spawnPoints) {
        if (!this.rng.chance(ECONOMY.spawnChance)) continue;
        const c = rollCreature(rarity, golden, this.rng);
        this.wild.push({ ...c, uid: this.nextUid++, pos: p.clone(), zone: island.zone, island, bornAt: this.time, golden, featured: false });
      }
    }
    this.events.push({ type: 'spawned', golden });
  }

  isOnHome(): boolean {
    return this.player.mode === 'ground' && this.player.groundSolid?.kind === 'home';
  }

  step(dt: number, input: PlayerInput): void {
    this.events.length = 0;
    this.time += dt;
    this.carryFullCooldown = Math.max(0, this.carryFullCooldown - dt);

    this.updateWave(dt);

    if (this.splashTime > 0) {
      this.updateSplash(dt);
    } else {
      this.updatePlayer(dt, input);
    }

    this.state.tick(dt);
  }

  private updateWave(dt: number): void {
    const wasGolden = this.wave.golden;
    this.wave.update(dt);
    for (const e of this.wave.events) {
      const number = this.wave.count + 1;
      if (e === 'warning') this.events.push({ type: 'waveWarning', golden: this.wave.golden, big: false, number });
      else if (e === 'surgeStart') this.events.push({ type: 'surgeStart', golden: this.wave.golden, big: false, number });
      else {
        this.events.push({ type: 'surgeEnd', golden: wasGolden, big: false, number: this.wave.count, survived: false });
        this.respawnCreatures(wasGolden);
      }
    }
    if (this.wave.phase === 'surge') {
      const front = this.wave.frontZ;
      const washed: number[] = [];
      this.wild = this.wild.filter((c) => {
        if (c.pos.z < front) {
          washed.push(c.uid);
          return false;
        }
        return true;
      });
      if (washed.length) this.events.push({ type: 'washed', uids: washed });
    }
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

  private updatePlayer(dt: number, input: PlayerInput): void {
    const player = this.player;
    player.step(dt, input, this.state.stats, this.course);

    for (const ev of player.events) {
      this.events.push({ type: 'player', event: ev });
      if (ev === 'land' && player.groundSolid) {
        const island = this.islandBySolid.get(player.groundSolid.id);
        if (island) this.checkpoint.copy(island.checkpoint);
      }
    }
    if (player.events.includes('sea')) {
      this.respawnAt(this.checkpoint, 'sea');
      return;
    }

    this.collectNearby();

    if (this.state.carried.length > 0 && this.isOnHome()) {
      this.events.push({ type: 'deliver', result: this.state.deliver(), bonusCash: 0, chainMult: 1, tripBest: 0, closeCall: false });
    }

    const zone = zoneAtZ(this.course, player.pos.z);
    if (zone !== this.zone) {
      this.zone = zone;
      if (zone >= 0) {
        const first = zone > this.state.bestZone;
        if (first) this.state.bestZone = zone;
        this.events.push({ type: 'zone', zone, first });
      }
    }

    if (this.wave.hits(player.pos.y, player.pos.z)) {
      this.splashTime = SPLASH_TIME;
      player.anchor = null;
      player.mode = 'air';
      player.vel.set(0, 0, 0);
      this.events.push({ type: 'splash', lost: this.state.loseCarried(), practice: false });
    }
  }

  private collectNearby(): void {
    const p = this.player.pos;
    for (let i = this.wild.length - 1; i >= 0; i--) {
      const c = this.wild[i];
      if (Math.abs(c.pos.y - p.y) > 2.5) continue;
      if (Math.hypot(c.pos.x - p.x, c.pos.z - p.z) > 1.7) continue;
      if (!this.state.canCarryMore()) {
        if (this.carryFullCooldown <= 0) {
          this.events.push({ type: 'carryFull' });
          this.carryFullCooldown = 2.5;
        }
        return;
      }
      this.state.pickUp(c);
      this.wild.splice(i, 1);
      this.events.push({ type: 'collect', creature: c, isNewSpecies: false, isNewMutation: false });
    }
  }
}
