import { BufferAttribute, BufferGeometry, Color, DoubleSide, DynamicDrawUsage, Mesh, ShaderMaterial, Vector3, type Object3D } from 'three';

const N = 20;
const tmp = new Vector3();
const tangent = new Vector3();
const view = new Vector3();
const side = new Vector3();

/** G16 swing ribbon: a 20-sample camera-facing strip behind the feet, fading in above 12 m/s. */
export class Ribbon {
  readonly mesh: Mesh;
  private readonly pos: Float32Array;
  private readonly alpha: Float32Array;
  private readonly samples: Vector3[] = [];
  private head = 0;
  private count = 0;
  private fade = 0;
  private readonly color: Color;

  constructor(parent: Object3D) {
    for (let i = 0; i < N; i++) this.samples.push(new Vector3());
    this.pos = new Float32Array(N * 2 * 3);
    this.alpha = new Float32Array(N * 2);
    const g = new BufferGeometry();
    const pa = new BufferAttribute(this.pos, 3);
    pa.setUsage(DynamicDrawUsage);
    const aa = new BufferAttribute(this.alpha, 1);
    aa.setUsage(DynamicDrawUsage);
    g.setAttribute('position', pa);
    g.setAttribute('aAlpha', aa);
    const idx: number[] = [];
    for (let i = 0; i < N - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    g.setIndex(idx);
    this.color = new Color('#FFFFFF');
    const mat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      uniforms: { uColor: { value: this.color } },
      vertexShader: /* glsl */ `
        attribute float aAlpha;
        varying float vA;
        void main() { vA = aAlpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor; varying float vA;
        void main() {
          gl_FragColor = vec4(uColor, vA);
          #include <colorspace_fragment>
        }`,
    });
    this.mesh = new Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    parent.add(this.mesh);
  }

  setColor(hex: string): void {
    this.color.set(hex);
  }

  reset(): void {
    this.count = 0;
    this.fade = 0;
  }

  update(dt: number, feet: Vector3, speed: number, camPos: Vector3, enabled: boolean): void {
    // Fade in above 12 m/s over 150 ms, out below 9 m/s over 250 ms.
    if (enabled && speed > 12) this.fade = Math.min(1, this.fade + dt / 0.15);
    else if (!enabled || speed < 9) this.fade = Math.max(0, this.fade - dt / 0.25);
    if (!enabled) this.count = 0;
    const last = this.samples[(this.head + N - 1) % N];
    if (this.count === 0 || last.distanceToSquared(feet) >= 0.15 * 0.15) {
      this.samples[this.head].copy(feet);
      this.head = (this.head + 1) % N;
      this.count = Math.min(N, this.count + 1);
    }
    this.mesh.visible = this.fade > 0.001 && this.count > 2;
    if (!this.mesh.visible) return;
    // Newest sample first (index 0 = the feet).
    for (let i = 0; i < N; i++) {
      const k = Math.min(i, this.count - 1);
      const s = this.samples[(this.head - 1 - k + N * 2) % N];
      const sNext = this.samples[(this.head - 1 - Math.min(k + 1, this.count - 1) + N * 2) % N];
      const sPrev = this.samples[(this.head - 1 - Math.max(k - 1, 0) + N * 2) % N];
      tangent.copy(sPrev).sub(sNext);
      if (tangent.lengthSq() < 1e-8) tangent.set(0, 0, 1);
      view.copy(camPos).sub(s);
      side.crossVectors(tangent, view).normalize();
      const t = i / (N - 1);
      const w = 0.35 * (1 - t) * 0.5;
      tmp.copy(s).addScaledVector(side, w);
      tmp.toArray(this.pos, i * 6);
      tmp.copy(s).addScaledVector(side, -w);
      tmp.toArray(this.pos, i * 6 + 3);
      const a = 0.7 * (1 - t) * this.fade * (i < this.count ? 1 : 0);
      this.alpha[i * 2] = a;
      this.alpha[i * 2 + 1] = a;
    }
    const g = this.mesh.geometry;
    g.getAttribute('position').needsUpdate = true;
    g.getAttribute('aAlpha').needsUpdate = true;
  }
}
