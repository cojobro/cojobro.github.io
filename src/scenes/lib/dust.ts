import { type Color, Points } from 'three';
import { createGlowGeometry, createGlowPoints } from './glow-points';
import type { DepthFog } from './glsl';

export interface DustOptions {
  color: Color;
  fog: DepthFog;
  /** The scene's shared point scale (see `createGlowPoints`). */
  scale: { value: number };
  count: number;
  random: () => number;
  /** The motes fill a ring around the y axis from `inner` to `outer`, `height` tall. */
  inner: number;
  outer: number;
  height: number;
}

/**
 * Faint motes of light around a subject, for depth: the fog dims the far ones. Turn the returned
 * object slowly (e.g. `rotation.y`) to make them drift.
 */
export function createDust({
  color,
  fog,
  scale,
  count,
  random,
  inner,
  outer,
  height,
}: DustOptions): Points {
  const geometry = createGlowGeometry(count);
  const positions = geometry.getAttribute('position');
  const glow = geometry.getAttribute('aGlow');
  for (let i = 0; i < count; i++) {
    const angle = random() * 2 * Math.PI;
    const radius = inner + random() * (outer - inner);
    positions.setXYZ(
      i,
      radius * Math.cos(angle),
      (random() - 0.5) * height,
      radius * Math.sin(angle),
    );
    glow.setX(i, 0.15 + 0.35 * random());
  }
  const { material } = createGlowPoints({ color, fog, size: 0.045, scale });
  return new Points(geometry, material);
}
