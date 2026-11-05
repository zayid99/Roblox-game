import { Matrix4, PCFShadowMap, Vector3, type DirectionalLight, type WebGLRenderer } from 'three';
import { SUN_DIR } from './environment';
import type { TierParams } from './quality';

const rot = new Matrix4().lookAt(SUN_DIR, new Vector3(), new Vector3(0, 1, 0));
const inv = rot.clone().invert();
const p = new Vector3();

/** G3: real shadows near the player. The shadow camera follows the focus with texel snapping (no shimmer). */
export class ShadowRig {
  private texel = 1;
  enabled = false;

  constructor(
    private readonly renderer: WebGLRenderer,
    private readonly sun: DirectionalLight,
  ) {}

  configure(q: TierParams): void {
    this.enabled = q.shadows;
    this.renderer.shadowMap.enabled = q.shadows;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.sun.castShadow = q.shadows;
    if (!q.shadows) return;
    const s = this.sun.shadow;
    const half = q.shadowHalf;
    s.mapSize.set(q.shadowSize, q.shadowSize);
    s.camera.left = -half;
    s.camera.right = half;
    s.camera.top = half;
    s.camera.bottom = -half;
    s.camera.near = 1;
    s.camera.far = 160;
    s.camera.updateProjectionMatrix();
    s.bias = -0.0004;
    s.normalBias = 0.03;
    s.radius = 3;
    s.intensity = 0.62;
    if (s.map) {
      s.map.dispose();
      s.map = null;
    }
    this.texel = (half * 2) / q.shadowSize;
  }

  /** Centre the shadow box on `focus`, snapped to whole shadow-map texels in light space. */
  follow(focus: Vector3): void {
    const texel = this.texel;
    p.copy(focus).applyMatrix4(inv);
    p.x = Math.round(p.x / texel) * texel;
    p.y = Math.round(p.y / texel) * texel;
    p.applyMatrix4(rot);
    this.sun.target.position.copy(p);
    this.sun.position.copy(p).addScaledVector(SUN_DIR, 70);
    this.sun.target.updateMatrixWorld();
  }
}
