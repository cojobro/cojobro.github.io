import { type Object3D, Vector2, type Vector3 } from 'three';

/**
 * GLSL snippets shared by the scenes' shader materials. Paste them into a shader string with
 * `${...}`. Fragment shaders write a linear color with its strength in alpha, then end with
 * `#include <colorspace_fragment>` so palette colors come out exactly as the CSS tokens.
 */

/** Cheap, stable pseudo-random numbers in [0, 1) (Dave Hoskins' "hash without sine"). */
export const HASH = /* glsl */ `
float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
`;

/** A uniform shared by every material of a scene: (near, far) view-space distances of the fog. */
export interface DepthFog {
  value: Vector2;
}

export function createDepthFog(): DepthFog {
  return { value: new Vector2(10, 30) };
}

/** Vertex side of the depth fog: set `vFogDepth = -mvPosition.z`. */
export const FOG_VERTEX = /* glsl */ `
varying float vFogDepth;
`;

/**
 * Fragment side of the depth fog. The canvas is transparent, so fading a fragment out sinks it
 * into the page background behind: multiply alpha by `fogFade()`.
 */
export const FOG_FRAGMENT = /* glsl */ `
uniform vec2 uFog;
varying float vFogDepth;

float fogFade() {
  return 1.0 - smoothstep(uFog.x, uFog.y, vFogDepth);
}
`;

/** A number as a GLSL float literal, for constants written into shader source. */
export function float(value: number): string {
  return value.toFixed(4);
}

/** A vector as a GLSL vec3 literal. */
export function vec3({ x, y, z }: Vector3): string {
  return `vec3(${float(x)}, ${float(y)}, ${float(z)})`;
}

/**
 * Turns off frustum culling for an object whose stored positions do not say where it draws: its
 * vertex shader places the vertices, or JavaScript moves them every frame (three.js computes an
 * object's bounds only once).
 */
export function alwaysDrawn<T extends Object3D>(object: T): T {
  object.frustumCulled = false;
  return object;
}
