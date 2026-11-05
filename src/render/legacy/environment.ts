import {
  BackSide,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  Mesh,
  PlaneGeometry,
  type Scene,
  ShaderMaterial,
  SphereGeometry,
  type Vector3,
} from 'three';

export const SKY_TOP = new Color('#3fb6ff');
export const HORIZON = new Color('#d6f3ff');
const FOG_NEAR = 160;
const FOG_FAR = 560;

/** Sky dome, sea, fog and lights. */
export class Environment {
  readonly sea: Mesh;
  private readonly seaMaterial: ShaderMaterial;
  private readonly sky: Mesh;

  constructor(scene: Scene) {
    scene.fog = new Fog(HORIZON, FOG_NEAR, FOG_FAR);
    scene.background = HORIZON;

    const hemi = new HemisphereLight('#d8f1ff', '#7a9bb0', 1.5);
    scene.add(hemi);
    const sun = new DirectionalLight('#fff4dc', 1.9);
    sun.position.set(-40, 80, 30);
    scene.add(sun);

    this.sky = new Mesh(
      new SphereGeometry(900, 24, 12),
      new ShaderMaterial({
        side: BackSide,
        depthWrite: false,
        fog: false,
        uniforms: { uTop: { value: SKY_TOP }, uHorizon: { value: HORIZON } },
        vertexShader: /* glsl */ `
          varying float vH;
          void main() {
            vH = normalize(position).y;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: /* glsl */ `
          uniform vec3 uTop;
          uniform vec3 uHorizon;
          varying float vH;
          void main() {
            gl_FragColor = vec4(mix(uHorizon, uTop, smoothstep(0.0, 0.45, vH)), 1.0);
            #include <colorspace_fragment>
          }`,
      }),
    );
    this.sky.renderOrder = -10;
    scene.add(this.sky);

    this.seaMaterial = new ShaderMaterial({
      fog: false,
      uniforms: {
        uTime: { value: 0 },
        uShallow: { value: new Color('#2ec5e8') },
        uDeep: { value: new Color('#1b74c9') },
        uFog: { value: HORIZON },
        uCam: { value: [0, 0] },
        uFogNear: { value: FOG_NEAR },
        uFogFar: { value: FOG_FAR },
      },
      vertexShader: /* glsl */ `
        varying vec3 vWorld;
        void main() {
          vec4 w = modelMatrix * vec4(position, 1.0);
          vWorld = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uShallow;
        uniform vec3 uDeep;
        uniform vec3 uFog;
        uniform vec2 uCam;
        uniform float uFogNear;
        uniform float uFogFar;
        varying vec3 vWorld;
        void main() {
          float d = distance(vWorld.xz, uCam);
          float ripple = sin(vWorld.x * 0.21 + uTime * 1.4) * 0.5 + sin(vWorld.z * 0.17 - uTime * 1.1) * 0.5;
          float glint = smoothstep(0.82, 1.0, sin(vWorld.x * 0.55 + uTime * 1.9) * sin(vWorld.z * 0.47 - uTime * 1.6));
          vec3 col = mix(uShallow, uDeep, clamp(d / 380.0, 0.0, 1.0));
          col += ripple * 0.025 + glint * 0.22;
          col = mix(col, uFog, smoothstep(uFogNear, uFogFar, d));
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.sea = new Mesh(new PlaneGeometry(1400, 1400), this.seaMaterial);
    this.sea.rotation.x = -Math.PI / 2;
    scene.add(this.sea);
  }

  update(time: number, camera: Vector3): void {
    this.seaMaterial.uniforms.uTime.value = time;
    this.seaMaterial.uniforms.uCam.value = [camera.x, camera.z];
    this.sea.position.set(camera.x, 0, camera.z);
    this.sky.position.copy(camera);
  }
}
