import { Color, DirectionalLight, Fog, HemisphereLight, SRGBColorSpace, Vector3, type Scene } from 'three';

/** Sun direction (towards the sun). The sky's sun disc uses the same vector (G2). */
export const SUN_DIR = new Vector3(-0.45, 0.8, 0.35).normalize();

export const SKY = {
  zenith: new Color('#2A8CFF'),
  mid: new Color('#6CC6FF'),
  horizon: new Color('#BFE9FF'),
  stormZenith: new Color('#3D5F93'),
  stormMid: new Color('#6E8DB8'),
  stormHorizon: new Color('#9BB8D6'),
};

export const FOG_NEAR = 170;
export const FOG_FAR = 620;
const RGB_TMP = { r: 0, g: 0, b: 0 };
const SUN_INTENSITY = 2.8;
const HEMI_INTENSITY = 1.0;

/** Hemisphere + sun lights and fog (G2). Storm mood darkens all three (G11). */
export class Lighting {
  readonly hemi = new HemisphereLight('#BFE3FF', '#2F7FA0', HEMI_INTENSITY);
  readonly sun = new DirectionalLight('#FFF1D6', SUN_INTENSITY);
  readonly fog = new Fog(SKY.horizon.clone(), FOG_NEAR, FOG_FAR);
  /** Fog colour in output (sRGB) space, for shaders that blend to the horizon by hand. */
  readonly fogOut = new Vector3();
  private mood = -1;

  constructor(scene: Scene) {
    scene.fog = this.fog;
    scene.add(this.hemi, this.sun, this.sun.target);
    this.sun.position.copy(SUN_DIR).multiplyScalar(70);
    this.setMood(0);
  }

  /** 0 = sunny, 1 = storm. */
  setMood(t: number): void {
    if (Math.abs(t - this.mood) < 1e-4) return;
    this.mood = t;
    this.fog.color.copy(SKY.horizon).lerp(SKY.stormHorizon, t);
    this.sun.intensity = SUN_INTENSITY * (1 - 0.4 * t);
    this.hemi.intensity = HEMI_INTENSITY * (1 - 0.15 * t);
    this.fog.color.getRGB(RGB_TMP, SRGBColorSpace);
    this.fogOut.set(RGB_TMP.r, RGB_TMP.g, RGB_TMP.b);
  }
}
