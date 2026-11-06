// The Buddy pet: the equipped base creature floating behind the player's shoulder. One creature mesh
// (plus its ink outline where the tier draws creature outlines), reusing creatureMesh's cached geometry.
import { Group, Mesh, Vector3 } from 'three';
import type { CreatureRef } from '../game/creatures';
import { creatureOutline, makeCreatureMesh, speciesScale } from './creatureMesh';
import { inkMaterial, type CreatureMaterial } from './materials';
import type { Particles } from './particles';

/** Size relative to the species' base scale (pedestal creatures are ×1.3, wild ×1.5). */
const SIZE = 0.62;
/** Offset from the player's feet in the player's frame: right, up (shoulder height), back. */
const SIDE = 1.05;
const UP = 2.25;
const BACK = 1.1;
/** Farther than this (a respawn, a launch pad, a big fling) and the buddy pops over instead of flying. */
const TELEPORT = 16;

const target = new Vector3();
const delta = new Vector3();
const fwd = new Vector3();

export interface BuddyFrame {
  dt: number;
  time: number;
  ref: CreatureRef | null;
  player: Vector3;
  facing: Vector3;
  playerVel: Vector3;
  grounded: boolean;
  hidden: boolean;
  outline: boolean;
  reduceMotion: boolean;
}

export class Buddy {
  readonly root = new Group();
  private body: (Mesh & { material: CreatureMaterial }) | null = null;
  private outline: Mesh | null = null;
  private key = '';
  private readonly pos = new Vector3();
  private yaw = 0;
  private placed = false;
  private hop = 0;
  private blinkT = 2;
  private popT = 0;

  constructor(private readonly particles: Particles) {
    this.root.visible = false;
  }

  update(f: BuddyFrame): void {
    const ref = f.ref;
    const key = ref ? `${ref.speciesId}:${ref.mutation}` : '';
    if (key !== this.key) this.setCreature(ref, key);
    if (!this.body || !ref) {
      this.root.visible = false;
      return;
    }
    this.root.visible = !f.hidden;
    const dt = Math.min(0.1, f.dt);

    // Shoulder spot behind and to the right of the player's facing (yaw only).
    fwd.set(f.facing.x, 0, f.facing.z);
    if (fwd.lengthSq() < 1e-4) fwd.set(0, 0, 1);
    fwd.normalize();
    target.set(f.player.x - fwd.x * BACK - fwd.z * SIDE, f.player.y + UP, f.player.z - fwd.z * BACK + fwd.x * SIDE);
    // Lead a little along the player's velocity so it keeps up during swings.
    target.addScaledVector(f.playerVel, 0.06);

    delta.subVectors(target, this.pos);
    const dist = delta.length();
    if (!this.placed || dist > TELEPORT) {
      if (this.placed) this.poof(this.pos);
      this.pos.copy(target);
      this.placed = true;
      this.poof(target);
    } else {
      // Exponential follow; the rate rises with distance and speed so it never trails far behind.
      const speed = f.playerVel.length();
      const k = 6 + dist * 1.2 + speed * 0.25;
      this.pos.addScaledVector(delta, 1 - Math.exp(-k * dt));
    }

    // Bob, plus little hops while the player runs on the ground.
    const t = f.time;
    const moving = f.grounded && Math.hypot(f.playerVel.x, f.playerVel.z) > 2;
    this.hop += ((moving ? 1 : 0) - this.hop) * Math.min(1, dt * 6);
    const bob = f.reduceMotion ? 0 : Math.sin(t * 3.1) * 0.12 + this.hop * Math.abs(Math.sin(t * 7.5)) * 0.32;
    this.root.position.set(this.pos.x, this.pos.y + bob, this.pos.z);

    // Face the way it travels when moving fast, else the way the player faces.
    const vx = delta.x;
    const vz = delta.z;
    const want = Math.hypot(vx, vz) > 0.6 ? Math.atan2(vx, vz) : Math.atan2(fwd.x, fwd.z);
    const d = Math.atan2(Math.sin(want - this.yaw), Math.cos(want - this.yaw));
    this.yaw += d * Math.min(1, dt * 8);
    const tilt = f.reduceMotion ? 0 : Math.sin(t * 2.3) * 0.08;
    this.root.rotation.set(0, this.yaw, tilt);

    // Pop-in squash after an equip or a teleport, and a blink every few seconds.
    if (this.popT > 0) this.popT = Math.max(0, this.popT - dt);
    const p = this.popT / 0.35;
    const s = 1 + Math.sin(p * Math.PI) * 0.35;
    this.root.scale.set(s, 2 - s, s);
    this.blinkT -= dt;
    const blink = this.body.material.userData.blink;
    if (this.blinkT <= 0) {
      blink.value = 1;
      if (this.blinkT < -0.12) {
        blink.value = 0;
        this.blinkT = 2.5 + Math.random() * 2.5;
      }
    }
    if (this.outline) this.outline.visible = f.outline;
  }

  private setCreature(ref: CreatureRef | null, key: string): void {
    this.key = key;
    if (this.body) {
      this.root.remove(this.body);
      this.body.material.dispose();
      this.body = null;
    }
    if (this.outline) {
      this.root.remove(this.outline);
      this.outline = null;
    }
    if (!ref) return;
    const scale = speciesScale(ref.speciesId) * SIZE;
    this.body = makeCreatureMesh(ref);
    this.body.scale.setScalar(scale);
    this.body.position.y = -0.45 * scale;
    this.outline = new Mesh(creatureOutline(ref.speciesId), inkMaterial);
    this.outline.scale.setScalar(scale);
    this.outline.position.y = this.body.position.y;
    this.root.add(this.body, this.outline);
    this.popT = 0.35;
    if (this.placed) this.poof(this.pos);
  }

  private poof(at: Vector3): void {
    this.popT = 0.35;
    this.particles.burst(at, '#FFFFFF', 10, { speed: 3, up: 1.5, size: 0.45, life: 0.45, puff: true, gravity: -1, drag: 3 });
  }
}
