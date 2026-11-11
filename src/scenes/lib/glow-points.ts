/**
 * Luminous round points: a ready-made material whose points are placed and lit from JavaScript
 * (`createGlowPoints`), and GLSL snippets for point shaders that compute everything on the GPU.
 */
import { BufferAttribute, BufferGeometry, type Color, type ShaderMaterial } from 'three';
import { type DepthFog, FOG_FRAGMENT, FOG_VERTEX } from './glsl';
import { createGlowMaterial } from './materials';

/** A luminous round point for `gl_PointCoord`: a sharp core inside a soft halo, 0 at the edge. */
export const GLOW_POINT = /* glsl */ `
float glowPoint(vec2 coord) {
  float d2 = dot(coord - 0.5, coord - 0.5) * 4.0;
  return exp(-d2 * 22.0) + 0.28 * exp(-d2 * 4.5) * max(0.0, 1.0 - d2);
}
`;

/**
 * Vertex side of glow points sized in scene units: `pointSize(size, depth, minimum)` is the
 * `gl_PointSize` of a point `size` across at view depth `depth`, never below `minimum` CSS pixels.
 * Keep `uPointScale` at `pointScale(...)` (see `camera.ts`) and `uPixelRatio` at the renderer's.
 */
export const POINT_SIZE = /* glsl */ `
uniform float uPointScale;
uniform float uPixelRatio;

float pointSize(float size, float depth, float minimum) {
  return max(minimum * uPixelRatio, size * uPointScale / depth);
}
`;

/**
 * A whole fragment shader for glow points whose vertex shader sets `vColor` and `vStrength`: the
 * GLOW_POINT shape, faded by `uOpacity` and the depth fog.
 */
export const POINT_COLOR_FRAGMENT = /* glsl */ `
${GLOW_POINT}
${FOG_FRAGMENT}
uniform float uOpacity;
varying vec3 vColor;
varying float vStrength;

void main() {
  gl_FragColor = vec4(vColor, glowPoint(gl_PointCoord) * vStrength * uOpacity * fogFade());
  #include <colorspace_fragment>
}
`;

/** `spark`: a bright core in a soft halo. `haze`: a soft cloud with no core (a spread of current). */
export type GlowLook = 'spark' | 'haze';

export interface GlowPointsOptions {
  color: Color;
  fog: DepthFog;
  /** Diameter, in world units, of a point whose `aSize` is 1. */
  size: number;
  look?: GlowLook;
  /**
   * Pixels per world unit at distance 1 (`pointScale`). Pass one object to every material of a
   * scene so a resize updates them all; by default each material has its own.
   */
  scale?: { value: number };
  /** Fades the whole set; pass a shared uniform to fade several materials together. */
  opacity?: { value: number };
}

/** Update `uScale` on resize (from `pointScale`); fade the whole set with `uOpacity`. */
export interface GlowPointsUniforms {
  uColor: { value: Color };
  uSize: { value: number };
  uScale: { value: number };
  uOpacity: { value: number };
  uFog: DepthFog;
}

const SHAPES: Record<GlowLook, string> = {
  spark: 'glowPoint(gl_PointCoord)',
  haze: 'exp(-d2 * 3.2) * (1.0 - d2)',
};

/**
 * Luminous round points sized in world units: additive, so overlaps brighten, and sinking into
 * the depth fog. Each point's `aSize` scales its diameter and `aGlow` its brightness (0 hides it);
 * `createGlowGeometry` makes a geometry with both.
 */
export function createGlowPoints({
  color,
  fog,
  size,
  look = 'spark',
  scale = { value: 1 },
  opacity = { value: 1 },
}: GlowPointsOptions): {
  material: ShaderMaterial;
  uniforms: GlowPointsUniforms;
} {
  const uniforms: GlowPointsUniforms = {
    uColor: { value: color },
    uSize: { value: size },
    uScale: scale,
    uOpacity: opacity,
    uFog: fog,
  };
  const material = createGlowMaterial(
    { ...uniforms },
    /* glsl */ `
      ${FOG_VERTEX}
      attribute float aSize;
      attribute float aGlow;
      uniform float uSize;
      uniform float uScale;
      varying float vGlow;

      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vFogDepth = -mvPosition.z;
        vGlow = aGlow;
        gl_PointSize = aGlow > 0.0 ? uSize * aSize * uScale / max(vFogDepth, 0.01) : 0.0;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    /* glsl */ `
      ${FOG_FRAGMENT}
      ${GLOW_POINT}
      uniform vec3 uColor;
      uniform float uOpacity;
      varying float vGlow;

      void main() {
        vec2 offset = gl_PointCoord - 0.5;
        float d2 = min(1.0, dot(offset, offset) * 4.0);
        float alpha = (${SHAPES[look]}) * vGlow * uOpacity * fogFade();
        if (alpha < 0.002) discard;
        gl_FragColor = vec4(uColor, alpha);
        #include <colorspace_fragment>
      }
    `,
  );
  return { material, uniforms };
}

/** A geometry of `count` glow points: `position` (all at the origin), `aSize` and `aGlow` at 1. */
export function createGlowGeometry(count: number): BufferGeometry {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(count * 3), 3));
  geometry.setAttribute('aSize', new BufferAttribute(new Float32Array(count).fill(1), 1));
  geometry.setAttribute('aGlow', new BufferAttribute(new Float32Array(count).fill(1), 1));
  return geometry;
}
