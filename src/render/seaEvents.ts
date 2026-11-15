// Sea Events in the world (src/game/seaEvents.ts): each event's own particles around the player, drawn by the
// shared particle pools (no extra draw calls). The screen tint is a HUD layer (src/ui/parts/sea.ts).
import type { Vector3 } from 'three';
import type { SeaEventId } from '../contracts';
import type { Particles } from './particles';

const RAINBOW = ['#FF5A5A', '#FF9F2E', '#FFE04A', '#5BE36B', '#3FC8FF', '#8A6BFF', '#FF6BD6'];

export interface SeaFrame {
  dt: number;
  time: number;
  event: SeaEventId | null;
  /** 0..1 fade-in/out of the event (so particles ramp rather than snap). */
  strength: number;
  player: Vector3;
  reduceMotion: boolean;
  lowTier: boolean;
}

export class SeaEventVisuals {
  private acc = 0;

  constructor(private readonly particles: Particles) {}

  update(f: SeaFrame): void {
    if (!f.event || f.strength <= 0) return;
    const scale = (f.reduceMotion ? 0.35 : 1) * (f.lowTier ? 0.5 : 1) * f.strength;
    const rate = RATE[f.event] * scale;
    this.acc += f.dt * rate;
    const P = f.player;
    while (this.acc >= 1) {
      this.acc -= 1;
      const a = Math.random() * Math.PI * 2;
      const r = 3 + Math.random() * 16;
      const x = P.x + Math.cos(a) * r;
      const z = P.z + Math.sin(a) * r - 4;
      switch (f.event) {
        case 'rainbowRain': {
          // Coloured drops falling through the scene, a few glinting.
          const c = RAINBOW[(Math.random() * RAINBOW.length) | 0];
          this.particles.emit(x, P.y + 10 + Math.random() * 6, z, 0, -16, 0, c, 0.16, 1.1, 6, Math.random() < 0.35);
          break;
        }
        case 'treasureFleet':
          // Gold glints drifting up.
          this.particles.emit(x, P.y - 1 + Math.random() * 3, z, 0, 1.4 + Math.random(), 0, Math.random() < 0.5 ? '#FFE58A' : '#FFC92E', 0.24, 1.4, -0.5, true);
          break;
        case 'calmSeas':
          // Soft light motes rising slowly from the sea.
          this.particles.emit(x, Math.max(0.2, P.y - 3) + Math.random() * 2, z, (Math.random() - 0.5) * 0.4, 0.9, (Math.random() - 0.5) * 0.4, Math.random() < 0.5 ? '#E6FBFF' : '#9FE8FF', 0.2, 2.2, -0.2, true);
          break;
        case 'feedingFrenzy':
          // Little fish-jump splashes on the water.
          this.particles.burst({ x, y: 0.3, z }, Math.random() < 0.5 ? '#FF8A5B' : '#BFEFFF', 4, { speed: 3, up: 6, size: 0.2, life: 0.6, gravity: 20 });
          break;
      }
    }
  }
}

/** Particles (or splash bursts) per second at full strength. */
const RATE: Record<SeaEventId, number> = { rainbowRain: 70, treasureFleet: 16, calmSeas: 14, feedingFrenzy: 5 };
