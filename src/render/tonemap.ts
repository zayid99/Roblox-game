// G1: tone mapping and grade. A side-effect module: import it before anything compiles a shader.
// Renderers then use `toneMapping = CustomToneMapping`, exposure 1.0.
import { ShaderChunk } from 'three';

const STUB = 'vec3 CustomToneMapping( vec3 color ) { return color; }';

if (ShaderChunk.tonemapping_pars_fragment.includes(STUB)) {
  ShaderChunk.tonemapping_pars_fragment = ShaderChunk.tonemapping_pars_fragment.replace(
    STUB,
    `vec3 CustomToneMapping( vec3 color ) {
     color = NeutralToneMapping( color );
     float l = dot( color, vec3( 0.2126, 0.7152, 0.0722 ) );
     color = mix( vec3( l ), color, 1.12 );
     color *= mix( vec3( 0.95, 1.0, 1.07 ), vec3( 1.04, 1.0, 0.95 ), smoothstep( 0.15, 0.8, l ) );
     return clamp( color, 0.0, 1.0 );
   }`,
  );
}

/** True once the grade is installed (importing this module is what installs it). */
export const TONEMAP_INSTALLED = true;
