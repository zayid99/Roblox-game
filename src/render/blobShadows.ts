import {
  CanvasTexture,
  Color,
  DynamicDrawUsage,
  InstancedBufferAttribute,
  InstancedMesh,
  Matrix4,
  MeshBasicMaterial,
  PlaneGeometry,
  type WebGLProgramParametersWithUniforms,
} from 'three';

const MAX = 64;
const m = new Matrix4();
const c = new Color();

function radialTexture(): CanvasTexture {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.55, 'rgba(255,255,255,0.75)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new CanvasTexture(cv);
}

/** G3b: soft round contact shadows, one InstancedMesh. Fill with add() between begin() and end() each frame. */
export class BlobShadows {
  readonly mesh: InstancedMesh;
  private n = 0;

  constructor() {
    const mat = new MeshBasicMaterial({
      map: radialTexture(),
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    mat.onBeforeCompile = (s: WebGLProgramParametersWithUniforms) => {
      s.fragmentShader = s.fragmentShader.replace(
        '#include <color_fragment>',
        `#ifdef USE_INSTANCING_COLOR
          diffuseColor.a *= vColor.r;
        #endif
        diffuseColor.rgb = vec3(0.06, 0.08, 0.22);`,
      );
    };
    this.mesh = new InstancedMesh(new PlaneGeometry(1, 1).rotateX(-Math.PI / 2), mat, MAX);
    this.mesh.instanceMatrix.setUsage(DynamicDrawUsage);
    this.mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(MAX * 3), 3);
    this.mesh.instanceColor.setUsage(DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.count = 0;
  }

  begin(): void {
    this.n = 0;
  }

  /** A shadow at ground height `gy` under something `h` metres above it; `size` is its diameter at h = 0. */
  add(x: number, gy: number, z: number, h: number, size: number): void {
    if (this.n >= MAX) return;
    const k = Math.min(1, Math.max(0, h / 20));
    const s = size * (1 + (0.45 - 1) * k);
    const a = 0.45 + (0.12 - 0.45) * k;
    m.makeScale(s, 1, s);
    m.setPosition(x, gy + 0.03, z);
    this.mesh.setMatrixAt(this.n, m);
    this.mesh.setColorAt(this.n, c.setRGB(a, a, a));
    this.n++;
  }

  end(): void {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
