import { BufferGeometry, Color, Float32BufferAttribute, Mesh, ShaderMaterial, UniformsLib, UniformsUtils } from 'three';
import type { AABB } from '../game/course';
import { SEA_GLSL, seaUniforms } from './water';

const WIDTH = 6;
const ROWS = [0, 0.15, 0.35, 0.6, 1];

/** Appends one rounded-rect band (0–6 m out from the island wall) to the arrays. */
function band(b: AABB, pos: number[], dist: number[], idx: number[]): void {
  const x0 = b.min.x;
  const x1 = b.max.x;
  const z0 = b.min.z;
  const z1 = b.max.z;
  // Perimeter samples: (inner x, inner z, outward nx, nz). Corners fan out over 6 steps.
  const ring: [number, number, number, number][] = [];
  const side = (ax: number, az: number, bx: number, bz: number, nx: number, nz: number) => {
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.round(len / 2.5));
    for (let i = 0; i < n; i++) ring.push([ax + ((bx - ax) * i) / n, az + ((bz - az) * i) / n, nx, nz]);
  };
  const corner = (cx: number, cz: number, a0: number) => {
    for (let i = 0; i <= 6; i++) {
      const a = a0 + (i / 6) * (Math.PI / 2);
      ring.push([cx, cz, Math.cos(a), Math.sin(a)]);
    }
  };
  side(x0, z0, x1, z0, 0, -1);
  corner(x1, z0, -Math.PI / 2);
  side(x1, z0, x1, z1, 1, 0);
  corner(x1, z1, 0);
  side(x1, z1, x0, z1, 0, 1);
  corner(x0, z1, Math.PI / 2);
  side(x0, z1, x0, z0, -1, 0);
  corner(x0, z0, Math.PI);
  const start = pos.length / 3;
  const per = ring.length;
  for (const r of ROWS) {
    for (const [x, z, nx, nz] of ring) {
      pos.push(x + nx * WIDTH * r, 0, z + nz * WIDTH * r);
      dist.push(r);
    }
  }
  for (let row = 0; row < ROWS.length - 1; row++) {
    for (let k = 0; k < per; k++) {
      const a = start + row * per + k;
      const bb = start + row * per + ((k + 1) % per);
      const c = a + per;
      const d = bb + per;
      idx.push(a, c, bb, bb, c, d);
    }
  }
}

/** G5 shore foam: one merged band per island, riding the waves; a turquoise halo plus moving foam rings. 1 draw call. */
export function buildShore(boxes: AABB[], rings: boolean): Mesh {
  const pos: number[] = [];
  const dist: number[] = [];
  const idx: number[] = [];
  for (const b of boxes) band(b, pos, dist, idx);
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('aDist', new Float32BufferAttribute(dist, 1));
  g.setIndex(idx);
  g.computeBoundingSphere();
  const mat = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: true,
    defines: rings ? { RINGS: '' } : {},
    uniforms: UniformsUtils.merge([UniformsLib.fog, { uHalo: { value: new Color('#7FF3E8') } }]),
    vertexShader: /* glsl */ `
      ${SEA_GLSL}
      attribute float aDist;
      varying float vDist;
      #include <fog_pars_vertex>
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        w.y = seaHeight(w.xz) + 0.03;
        vDist = aDist;
        vec4 mvPosition = viewMatrix * w;
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uHalo;
      uniform float uTime;
      varying float vDist;
      #include <fog_pars_fragment>
      void main() {
        float a = vDist;
        float solid = 1.0 - smoothstep(0.0, 0.12, a);
        float ring = 0.0;
        #ifdef RINGS
          float bandv = fract(a * 2.5 - uTime * 0.35);
          ring = smoothstep(0.0, 0.08, bandv) * (1.0 - smoothstep(0.12, 0.2, bandv)) * (1.0 - a);
        #endif
        float foam = step(0.5, max(solid, ring * 1.6));
        vec4 c = vec4(uHalo, (1.0 - a) * 0.55);
        c = mix(c, vec4(1.0), foam);
        gl_FragColor = c;
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  Object.assign(mat.uniforms, seaUniforms());
  const mesh = new Mesh(g, mat);
  mesh.renderOrder = 1;
  return mesh;
}
