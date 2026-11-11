import type { Vector3 } from 'three';

/**
 * A path through points, measured by length, so things can travel along it at an even pace
 * (an electrode array sliding in, a spike running down a fiber). Sampling allocates nothing, so
 * it is safe to call every frame. `createPathStrip` (`strips.ts`) draws one as a glowing line.
 */
export class Polyline {
  /** Total length, in world units. */
  readonly length: number;
  /** Distance along the path at each point. */
  readonly distances: Float32Array;

  /** `points` holds x, y, z for each point in order. */
  constructor(readonly points: Float32Array) {
    const count = points.length / 3;
    this.distances = new Float32Array(count);
    let total = 0;
    for (let i = 1; i < count; i++) {
      const dx = points[i * 3] - points[i * 3 - 3];
      const dy = points[i * 3 + 1] - points[i * 3 - 2];
      const dz = points[i * 3 + 2] - points[i * 3 - 1];
      total += Math.hypot(dx, dy, dz);
      this.distances[i] = total;
    }
    this.length = total;
  }

  /** Writes the point `distance` along the path into `target` (clamped to the ends). */
  pointAt(distance: number, target: Vector3): Vector3 {
    const { distances, points } = this;
    const last = distances.length - 1;
    if (distance <= 0) return target.fromArray(points, 0);
    if (distance >= this.length) return target.fromArray(points, last * 3);
    // Binary search for the segment that contains `distance`.
    let low = 0;
    let high = last;
    while (high - low > 1) {
      const middle = (low + high) >> 1;
      if (distances[middle] <= distance) low = middle;
      else high = middle;
    }
    const start = distances[low];
    const t = (distance - start) / (distances[high] - start || 1);
    const a = low * 3;
    const b = high * 3;
    return target.set(
      points[a] + (points[b] - points[a]) * t,
      points[a + 1] + (points[b + 1] - points[a + 1]) * t,
      points[a + 2] + (points[b + 2] - points[a + 2]) * t,
    );
  }
}
