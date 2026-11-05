import { Color, MeshLambertMaterial } from 'three';
import { MUTATIONS } from '../game/creatures';

/** The one material almost everything uses: flat-lit vertex colors. */
export const vertexMaterial = new MeshLambertMaterial({ vertexColors: true });

/** Creature materials by mutation: normal, gold, diamond, rainbow (rainbow hue is animated). */
export const mutationMaterials: MeshLambertMaterial[] = [
  vertexMaterial,
  new MeshLambertMaterial({ vertexColors: true, color: '#ffd84a', emissive: new Color('#ff9d00'), emissiveIntensity: 0.35 }),
  new MeshLambertMaterial({ vertexColors: true, color: '#c8f7ff', emissive: new Color('#38d9ff'), emissiveIntensity: 0.4 }),
  new MeshLambertMaterial({ vertexColors: true, color: '#ffffff', emissive: new Color(MUTATIONS[3].color), emissiveIntensity: 0.45 }),
];

const rainbow = new Color();

export function updateAnimatedMaterials(time: number): void {
  rainbow.setHSL((time * 0.25) % 1, 1, 0.55);
  mutationMaterials[3].emissive.copy(rainbow);
  mutationMaterials[3].color.setHSL((time * 0.25 + 0.5) % 1, 0.6, 0.85);
}
