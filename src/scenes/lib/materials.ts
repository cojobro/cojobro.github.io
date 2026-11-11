import {
  AdditiveBlending,
  type Color,
  DoubleSide,
  type IUniform,
  ShaderMaterial,
  Vector4,
} from 'three';
import { type DepthFog, FOG_FRAGMENT, FOG_VERTEX } from './glsl';

/**
 * A luminous material: additive, so overlapping light adds up as glows do, and tested against
 * depth without writing it, so transparent layers never cut holes in each other. Double-sided,
 * so strips twisted at sharp turns still draw.
 */
export function createGlowMaterial(
  uniforms: Record<string, IUniform>,
  vertexShader: string,
  fragmentShader: string,
): ShaderMaterial {
  return new ShaderMaterial({
    uniforms,
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    side: DoubleSide,
  });
}

export interface ShellOptions {
  color: Color;
  fog: DepthFog;
  /** Strength where the surface faces the camera: the shell's faint body. */
  face?: number;
  /** Strength added at the silhouette. */
  rim?: number;
  /** Sharpness of the rim: higher hugs the silhouette more tightly. */
  power?: number;
  /**
   * World heights between which the shell shows: it fades in from `band[0]` to `band[1]` and out
   * from `band[2]` to `band[3]` (e.g. a neck that dissolves below the head). Shown everywhere by
   * default.
   */
  band?: readonly [number, number, number, number];
  /** Fades the shell; pass a shared uniform to fade it with other materials. */
  opacity?: { value: number };
}

/**
 * A translucent glass shell: nearly clear where it faces the camera, glowing along its silhouette
 * (a fresnel rim). Both sides draw, so the far wall of a closed shape adds a fainter rim of its own.
 */
export function createShellMaterial({
  color,
  fog,
  face = 0.04,
  rim = 0.7,
  power = 2.5,
  band = [-2e4, -1e4, 1e4, 2e4],
  opacity = { value: 1 },
}: ShellOptions): ShaderMaterial {
  return createGlowMaterial(
    {
      uColor: { value: color },
      uFace: { value: face },
      uRim: { value: rim },
      uPower: { value: power },
      uBand: { value: new Vector4(...band) },
      uOpacity: opacity,
      uFog: fog,
    },
    /* glsl */ `
      ${FOG_VERTEX}
      varying vec3 vNormal;
      varying vec3 vView;
      varying float vHeight;

      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vNormal = normalize(normalMatrix * normal);
        vView = normalize(-mvPosition.xyz);
        vHeight = (modelMatrix * vec4(position, 1.0)).y;
        vFogDepth = -mvPosition.z;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    /* glsl */ `
      ${FOG_FRAGMENT}
      uniform vec3 uColor;
      uniform float uFace;
      uniform float uRim;
      uniform float uPower;
      uniform vec4 uBand;
      uniform float uOpacity;
      varying vec3 vNormal;
      varying vec3 vView;
      varying float vHeight;

      void main() {
        float facing = abs(dot(normalize(vNormal), normalize(vView)));
        float strength = uFace + uRim * pow(1.0 - facing, uPower);
        float shown = smoothstep(uBand.x, uBand.y, vHeight) * (1.0 - smoothstep(uBand.z, uBand.w, vHeight));
        gl_FragColor = vec4(uColor, strength * shown * uOpacity * fogFade());
        #include <colorspace_fragment>
      }
    `,
  );
}
