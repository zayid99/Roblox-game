import { BufferGeometry, Color, DoubleSide, Float32BufferAttribute, Mesh, MeshLambertMaterial, Vector3, type Scene } from 'three';
import { HOME_FRONT_Z } from '../game/config';
import type { WaveSim } from '../game/wave';
import type { Particles } from './particles';

// Side profile of the wave (z offset from the front, height), from the back up over the curl and down the face.
const PROFILE: [number, number][] = [
  [-22, -1],
  [-14, 3.5],
  [-8, 8],
  [-3.5, 10.8],
  [0, 11.4],
  [2.4, 10.6],
  [3, 9.2],
  [2, 8.2],
  [0.6, 7.6],
  [0.4, 4.5],
  [1.8, -1],
];
const WIDTH = 220;
const SEGMENTS = 44;

function buildGeometry(golden: boolean): BufferGeometry {
  const deep = new Color(golden ? '#c98a00' : '#0f5fbf');
  const mid = new Color(golden ? '#ffc93c' : '#2fb4ef');
  const foam = new Color(golden ? '#fff6c2' : '#ffffff');
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const c = new Color();
  for (let s = 0; s <= SEGMENTS; s++) {
    const x = -WIDTH / 2 + (WIDTH * s) / SEGMENTS;
    const wobble = Math.sin(s * 0.9) * 0.6;
    for (const [z, y] of PROFILE) {
      pos.push(x, y + (y > 6 ? wobble : 0), z + (y > 6 ? wobble * 0.6 : 0));
      const t = Math.max(0, Math.min(1, (y + 1) / 9));
      c.copy(deep).lerp(mid, t);
      if (y > 9) c.lerp(foam, Math.min(1, (y - 9) / 2));
      col.push(c.r, c.g, c.b);
    }
  }
  const n = PROFILE.length;
  for (let s = 0; s < SEGMENTS; s++) {
    for (let i = 0; i < n - 1; i++) {
      const a = s * n + i;
      const b = (s + 1) * n + i;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const crest = new Vector3();

/** The big wall of water. Follows the wave sim and throws foam. */
export class WaveVisual {
  private readonly mesh: Mesh;
  private readonly normalGeo = buildGeometry(false);
  private readonly goldenGeo = buildGeometry(true);
  private foamTimer = 0;

  constructor(scene: Scene) {
    this.mesh = new Mesh(this.normalGeo, new MeshLambertMaterial({ vertexColors: true, side: DoubleSide, emissive: new Color('#0a3d66'), emissiveIntensity: 0.25 }));
    this.mesh.visible = false;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
  }

  update(dt: number, wave: WaveSim, time: number, playerX: number, particles: Particles): void {
    const active = wave.phase === 'surge';
    this.mesh.visible = active;
    if (!active) return;
    this.mesh.geometry = wave.golden ? this.goldenGeo : this.normalGeo;
    // Shrink as it crashes into the home island.
    const toHome = HOME_FRONT_Z - wave.frontZ;
    const crash = Math.min(1, Math.max(0.15, toHome / 25));
    this.mesh.position.set(playerX * 0.3, 0, wave.frontZ);
    this.mesh.scale.set(1, crash * (1 + Math.sin(time * 3) * 0.03), 1);

    this.foamTimer += dt;
    while (this.foamTimer > 0.03) {
      this.foamTimer -= 0.03;
      crest.set(playerX + (Math.random() - 0.5) * 60, 10.8 * crash, wave.frontZ + 1.5);
      particles.burst(crest, wave.golden ? '#fff1b0' : '#ffffff', 2, { speed: 5, up: 4, size: 0.5, life: 0.7, gravity: 14 });
    }
  }
}
