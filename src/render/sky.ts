import { BackSide, Color, Mesh, ShaderMaterial, SphereGeometry, Vector3 } from 'three';
import { SKY, SUN_DIR } from './environment';

const tmpA = new Color();

/** G6 sky dome: gradient, toon sun disc with halos, horizon blended to the fog colour so sky, sea and world meet cleanly. */
export class Sky {
  readonly mesh: Mesh;
  private readonly mat: ShaderMaterial;

  constructor(fogOut: Vector3) {
    this.mat = new ShaderMaterial({
      side: BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        uZenith: { value: SKY.zenith.clone() },
        uMid: { value: SKY.mid.clone() },
        uHorizon: { value: SKY.horizon.clone() },
        uSunDir: { value: SUN_DIR.clone() },
        uSun: { value: 1 },
        uFogOut: { value: fogOut },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = position;
          vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          gl_Position = p.xyww;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uZenith; uniform vec3 uMid; uniform vec3 uHorizon; uniform vec3 uSunDir;
        uniform float uSun; uniform vec3 uFogOut;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(vDir);
          float h = d.y;
          vec3 col = h < 0.18 ? mix(uHorizon, uMid, smoothstep(0.0, 0.18, h)) : mix(uMid, uZenith, smoothstep(0.18, 0.8, h));
          float sd = max(dot(d, uSunDir), 0.0);
          float disc = smoothstep(0.99863, 0.99919, sd);
          col += vec3(1.0, 0.96, 0.85) * (disc * 2.2 + pow(sd, 400.0) * 0.5 + pow(sd, 12.0) * 0.15) * uSun;
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          float hz = 1.0 - smoothstep(-0.005, 0.05, h);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, uFogOut, hz);
        }`,
    });
    this.mesh = new Mesh(new SphereGeometry(900, 32, 16), this.mat);
    this.mesh.renderOrder = -10;
    this.mesh.frustumCulled = false;
  }

  /** 0 = sunny, 1 = storm. */
  setMood(t: number): void {
    const u = this.mat.uniforms;
    (u.uZenith.value as Color).copy(SKY.zenith).lerp(SKY.stormZenith, t);
    (u.uMid.value as Color).copy(SKY.mid).lerp(SKY.stormMid, t);
    (u.uHorizon.value as Color).copy(tmpA.copy(SKY.horizon).lerp(SKY.stormHorizon, t));
    u.uSun.value = 1 - 0.6 * t;
  }

  update(cam: Vector3): void {
    this.mesh.position.copy(cam);
  }
}
