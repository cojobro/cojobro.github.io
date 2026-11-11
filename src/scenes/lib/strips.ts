/**
 * Glowing lines, drawn as strips that always face the camera. WebGL draws plain lines one device
 * pixel wide whatever the pixel ratio; strips keep a soft, luminous width in CSS pixels at any
 * distance and on any screen. Two kinds:
 *
 * - Lines placed by the shader (`createStripGeometry`): the vertex shader computes each line's
 *   shape, so it animates through uniforms alone (waves, rings, streams of pulses).
 * - Lines along a fixed path (`createPathStrip`, from a `Polyline`), drawn with
 *   `createPathMaterial` or a custom shader built on PATH_STRIP_VERTEX.
 *
 * Either way the strip's width is pushed out on screen by `stripPosition` (STRIP_VERTEX), and
 * its glow across the width comes from `stripGlow` (STRIP_FRAGMENT).
 */
import {
  BufferAttribute,
  BufferGeometry,
  type Color,
  type ShaderMaterial,
  type Vector2,
} from 'three';
import { type DepthFog, FOG_FRAGMENT, FOG_VERTEX } from './glsl';
import { createGlowMaterial } from './materials';
import type { Polyline } from './polyline';

/**
 * Vertex side of a strip. `stripPosition(previous, current, next, side, width)` returns the clip
 * position of a strip vertex: `current` pushed sideways on screen by half of `width` (CSS pixels),
 * perpendicular to the line through its neighbors. Keep `uResolution` at the drawing area's size
 * in CSS pixels.
 */
export const STRIP_VERTEX = /* glsl */ `
uniform vec2 uResolution;

vec4 stripPosition(vec3 previous, vec3 current, vec3 next, float side, float width) {
  mat4 toClip = projectionMatrix * modelViewMatrix;
  vec4 clipPrevious = toClip * vec4(previous, 1.0);
  vec4 clipNext = toClip * vec4(next, 1.0);
  vec4 clip = toClip * vec4(current, 1.0);
  vec2 along = (clipNext.xy / clipNext.w - clipPrevious.xy / clipPrevious.w) * uResolution;
  float len = length(along);
  along = len > 1e-6 ? along / len : vec2(1.0, 0.0);
  clip.xy += vec2(-along.y, along.x) * side * width / uResolution * clip.w;
  return clip;
}
`;

/**
 * Fragment side: brightness across a strip from its interpolated `side`, 1 at the center. The
 * bright core spans about a third of the strip's width; a soft halo fades out to its edges.
 */
export const STRIP_FRAGMENT = /* glsl */ `
float stripGlow(float side) {
  float d = abs(side);
  return 0.85 * exp(-d * d * 7.0) + 0.15 * (1.0 - d);
}
`;

/**
 * A whole fragment shader for strips whose vertex shader sets `vColor`, `vStrength` and `vSide`:
 * the strip's glow, faded by `uOpacity` and the depth fog.
 */
export const STRIP_COLOR_FRAGMENT = /* glsl */ `
${STRIP_FRAGMENT}
${FOG_FRAGMENT}
uniform float uOpacity;
varying vec3 vColor;
varying float vStrength;
varying float vSide;

void main() {
  gl_FragColor = vec4(vColor, stripGlow(vSide) * vStrength * uOpacity * fogFade());
  #include <colorspace_fragment>
}
`;

// Lines placed by the shader -------------------------------------------------------------------

/**
 * Strips whose geometry only numbers the vertices. Its `position` attribute holds
 * (t, side, line): `t` runs 0 → 1 along a line, `side` is -1 or 1 across it, `line` is the line's
 * index. The material's vertex shader maps each (line, t) to a point and hands it to
 * `stripPosition`. Meshes using it need `alwaysDrawn` (`glsl.ts`): the stored positions are not
 * where they draw.
 */
export function createStripGeometry(lineCount: number, segments: number): BufferGeometry {
  const pointsPerLine = segments + 1;
  const vertexCount = lineCount * pointsPerLine * 2;
  const positions = new Float32Array(vertexCount * 3);
  const indices =
    vertexCount > 65535
      ? new Uint32Array(lineCount * segments * 6)
      : new Uint16Array(lineCount * segments * 6);

  let vertex = 0;
  let index = 0;
  for (let line = 0; line < lineCount; line++) {
    for (let point = 0; point < pointsPerLine; point++) {
      const t = point / segments;
      positions.set([t, -1, line, t, 1, line], vertex * 3);
      if (point < segments) {
        // Two triangles between this pair of vertices and the next pair, counterclockwise on
        // screen: `stripPosition` puts side 1 on the left of the direction of travel.
        indices.set([vertex, vertex + 2, vertex + 1, vertex + 1, vertex + 2, vertex + 3], index);
        index += 6;
      }
      vertex += 2;
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setIndex(new BufferAttribute(indices, 1));
  return geometry;
}

/**
 * Adds an attribute that holds one value (`itemSize` numbers) per line of a strip geometry,
 * repeated on each of the line's vertices: endpoints, a channel, a seed.
 */
export function addLineAttribute(
  geometry: BufferGeometry,
  name: string,
  itemSize: number,
  values: ArrayLike<number>,
): void {
  const lineCount = values.length / itemSize;
  const verticesPerLine = geometry.getAttribute('position').count / lineCount;
  const data = new Float32Array(lineCount * verticesPerLine * itemSize);
  for (let line = 0; line < lineCount; line++) {
    for (let vertex = 0; vertex < verticesPerLine; vertex++) {
      for (let i = 0; i < itemSize; i++) {
        data[(line * verticesPerLine + vertex) * itemSize + i] = values[line * itemSize + i];
      }
    }
  }
  geometry.setAttribute(name, new BufferAttribute(data, itemSize));
}

/**
 * Straight strips, one per segment of `segments` (x, y, z of both ends, six numbers per segment,
 * as in a LineSegments geometry). Their vertex shader reads the ends from `aFrom` and `aTo`:
 * `stripPosition(aFrom, mix(aFrom, aTo, position.x), aTo, position.y, width)`.
 */
export function createSegmentStrips(segments: ArrayLike<number>): BufferGeometry {
  const count = segments.length / 6;
  const geometry = createStripGeometry(count, 1);
  const from = new Float32Array(count * 3);
  const to = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    for (let axis = 0; axis < 3; axis++) {
      from[i * 3 + axis] = segments[i * 6 + axis];
      to[i * 3 + axis] = segments[i * 6 + 3 + axis];
    }
  }
  addLineAttribute(geometry, 'aFrom', 3, from);
  addLineAttribute(geometry, 'aTo', 3, to);
  return geometry;
}

// Lines along a fixed path ---------------------------------------------------------------------

/**
 * A strip along `path`, two vertices per point: each carries `position` (its point), `aPrevious`
 * and `aNext` (the neighboring points), `aSide` (-1 or 1) and `aDistance` (how far along the path
 * it is). Draw it with `createPathMaterial`, or a shader built on PATH_STRIP_VERTEX.
 */
export function createPathStrip(path: Polyline): BufferGeometry {
  const { points, distances } = path;
  const count = distances.length;
  const current = new Float32Array(count * 6);
  const previous = new Float32Array(count * 6);
  const next = new Float32Array(count * 6);
  const sides = new Float32Array(count * 2);
  const along = new Float32Array(count * 2);
  const indices = new Uint16Array((count - 1) * 6);
  for (let i = 0; i < count; i++) {
    const before = Math.max(0, i - 1) * 3;
    const after = Math.min(count - 1, i + 1) * 3;
    for (let side = 0; side < 2; side++) {
      const vertex = i * 2 + side;
      for (let axis = 0; axis < 3; axis++) {
        current[vertex * 3 + axis] = points[i * 3 + axis];
        previous[vertex * 3 + axis] = points[before + axis];
        next[vertex * 3 + axis] = points[after + axis];
      }
      sides[vertex] = side === 0 ? -1 : 1;
      along[vertex] = distances[i];
    }
    if (i < count - 1) {
      const v = i * 2;
      indices.set([v, v + 1, v + 2, v + 1, v + 3, v + 2], i * 6);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(current, 3));
  geometry.setAttribute('aPrevious', new BufferAttribute(previous, 3));
  geometry.setAttribute('aNext', new BufferAttribute(next, 3));
  geometry.setAttribute('aSide', new BufferAttribute(sides, 1));
  geometry.setAttribute('aDistance', new BufferAttribute(along, 1));
  geometry.setIndex(new BufferAttribute(indices, 1));
  return geometry;
}

/**
 * Vertex side of a path strip (includes STRIP_VERTEX): its attributes, and
 * `pathStripPosition(width)`, the clip position of the vertex for a strip `width` CSS pixels wide.
 */
export const PATH_STRIP_VERTEX = /* glsl */ `
${STRIP_VERTEX}
attribute vec3 aPrevious;
attribute vec3 aNext;
attribute float aSide;
attribute float aDistance;

vec4 pathStripPosition(float width) {
  return stripPosition(aPrevious, position, aNext, aSide, width);
}
`;

export interface PathMaterialOptions {
  color: Color;
  fog: DepthFog;
  /** The drawing area's size in CSS pixels: one object the scene keeps current on resize. */
  resolution: { value: Vector2 };
  /** Width of the strip, in CSS pixels. */
  width: number;
  /** Brightness along the strip's center. */
  strength?: number;
  /** Fades the line; pass a shared uniform to fade several materials together. */
  opacity?: { value: number };
  /** Length, in world units, over which the line fades in from the start of its path. */
  fadeIn?: number;
}

/**
 * A glowing line of one color along a path strip (`createPathStrip`), faded by the depth fog.
 * `uniforms.uTip` hides the line beyond that distance along the path, e.g. while it grows.
 */
export function createPathMaterial({
  color,
  fog,
  resolution,
  width,
  strength = 1,
  opacity = { value: 1 },
  fadeIn = 0,
}: PathMaterialOptions): ShaderMaterial {
  return createGlowMaterial(
    {
      uColor: { value: color },
      uFog: fog,
      uResolution: resolution,
      uWidth: { value: width },
      uStrength: { value: strength },
      uOpacity: opacity,
      uFadeIn: { value: fadeIn },
      // Farther along than any path: the whole line shows.
      uTip: { value: 1e9 },
    },
    /* glsl */ `
      ${FOG_VERTEX}
      ${PATH_STRIP_VERTEX}
      uniform float uWidth;
      varying float vSide;
      varying float vDistance;

      void main() {
        vSide = aSide;
        vDistance = aDistance;
        vFogDepth = -(modelViewMatrix * vec4(position, 1.0)).z;
        gl_Position = pathStripPosition(uWidth);
      }
    `,
    /* glsl */ `
      ${FOG_FRAGMENT}
      ${STRIP_FRAGMENT}
      uniform vec3 uColor;
      uniform float uStrength;
      uniform float uOpacity;
      uniform float uFadeIn;
      uniform float uTip;
      varying float vSide;
      varying float vDistance;

      void main() {
        if (vDistance > uTip) discard;
        float fadeIn = uFadeIn > 0.0 ? smoothstep(0.0, uFadeIn, vDistance) : 1.0;
        float alpha = stripGlow(vSide) * uStrength * uOpacity * fadeIn * fogFade();
        gl_FragColor = vec4(uColor, alpha);
        #include <colorspace_fragment>
      }
    `,
  );
}
