import { BufferAttribute, BufferGeometry, MathUtils, Vector3 } from 'three';

/**
 * A stylized cochlea, the geometry behind the `cochlea` scene: a tube of about two and a half
 * turns that tapers and rises gently about the +y axis. A place `u` runs 0 → 1 from the base, where high
 * pitches land, to the apex, where low pitches land. Procedural on purpose: it is no one's anatomy.
 */
export const COCHLEA = {
  turns: 2.5,
  /** Distance from the central axis to the duct's center, at the base and at the apex. */
  baseRadius: 2.05,
  apexRadius: 0.5,
  /** Height the duct climbs from base to apex. */
  rise: 1.5,
  /** Radius of the duct itself, at the base and towards the apex. */
  baseDuct: 0.34,
  apexDuct: 0.13,
  /** Where the base sits around the axis, radians from +x towards +z. */
  startAngle: 0.35 * Math.PI,
};

/** Angle around the central axis at place `u`, radians from +x towards +z. */
export function cochleaAngle(u: number): number {
  return COCHLEA.startAngle - u * COCHLEA.turns * 2 * Math.PI;
}

/** Distance from the central axis to the duct's center: shrinks evenly per turn (a log spiral). */
export function spiralRadius(u: number): number {
  return COCHLEA.baseRadius * Math.pow(COCHLEA.apexRadius / COCHLEA.baseRadius, u);
}

/** Height of the duct's center above the base. */
export function cochleaHeight(u: number): number {
  return COCHLEA.rise * Math.pow(u, 1.15);
}

/** Radius of the duct at `u`, ignoring its rounded ends: for placing things inside it. */
export function ductTaper(u: number): number {
  return MathUtils.lerp(COCHLEA.baseDuct, COCHLEA.apexDuct, Math.pow(u, 0.8));
}

/** Radius of the duct's wall at `u`, closing in a half-sphere at each end. */
export function ductRadius(u: number): number {
  const end = Math.min(u / ENDS.base, (1 - u) / ENDS.apex);
  const rounding = end >= 1 ? 1 : Math.sqrt(Math.max(0, 1 - (1 - end) * (1 - end)));
  return ductTaper(u) * rounding;
}

/** Center of the duct at `u`. */
export function ductCenter(u: number, target: Vector3): Vector3 {
  const angle = cochleaAngle(u);
  const radius = spiralRadius(u);
  return target.set(radius * Math.cos(angle), cochleaHeight(u), radius * Math.sin(angle));
}

const ahead = new Vector3();
const behind = new Vector3();

/** Length of place, at each end, that a half-sphere as wide as the duct there takes up. */
const ENDS = {
  base: COCHLEA.baseDuct / speedAt(0),
  apex: COCHLEA.apexDuct / speedAt(1),
};

/** World units travelled per unit of place at `u`. */
function speedAt(u: number): number {
  const step = 1e-4;
  const from = Math.min(u, 1 - step);
  return ductCenter(from + step, ahead).distanceTo(ductCenter(from, behind)) / step;
}

/**
 * The duct's cross-section axes at `u`, unit and perpendicular to the duct: `outward` points away
 * from the central axis, `up` mostly along it.
 */
export function ductFrame(u: number, outward: Vector3, up: Vector3): void {
  const step = 1e-3;
  ductCenter(Math.min(1, u + step), ahead);
  ductCenter(Math.max(0, u - step), behind);
  const tangent = ahead.sub(behind).normalize();
  const angle = cochleaAngle(u);
  outward.set(Math.cos(angle), 0, Math.sin(angle));
  outward.addScaledVector(tangent, -outward.dot(tangent)).normalize();
  up.crossVectors(outward, tangent).normalize();
  if (up.y < 0) up.negate();
}

/**
 * Converts between places and distances along the duct, so things can be spaced evenly by
 * length (nerve fibers, electrode contacts) rather than by angle, which crowds the apex.
 */
export class CochleaLength {
  /** Length of the duct's centerline, base to apex. */
  readonly total: number;
  private readonly distances: Float32Array;

  constructor(private readonly samples = 1024) {
    this.distances = new Float32Array(samples + 1);
    const previous = ductCenter(0, new Vector3());
    const point = new Vector3();
    for (let i = 1; i <= samples; i++) {
      ductCenter(i / samples, point);
      this.distances[i] = this.distances[i - 1] + point.distanceTo(previous);
      previous.copy(point);
    }
    this.total = this.distances[samples];
  }

  /** The place `distance` along the duct from the base. */
  placeAt(distance: number): number {
    const { distances, samples } = this;
    const target = MathUtils.clamp(distance, 0, this.total);
    let low = 0;
    let high = samples;
    while (high - low > 1) {
      const middle = (low + high) >> 1;
      if (distances[middle] <= target) low = middle;
      else high = middle;
    }
    const span = distances[high] - distances[low] || 1;
    return (low + (target - distances[low]) / span) / samples;
  }
}

/**
 * The duct as a tube mesh, `along` rings of `around` vertices from base to apex, slightly
 * inflated by `scale`, with rings packed closer towards the ends so the caps come out round.
 * Besides `position` and `normal` it carries `aPlace`, each vertex's `u`, for shaders that light
 * the duct by place.
 */
export function createDuctGeometry(along: number, around: number, scale = 1): BufferGeometry {
  const vertexCount = (along + 1) * around;
  const positions = new Float32Array(vertexCount * 3);
  const normals = new Float32Array(vertexCount * 3);
  const places = new Float32Array(vertexCount);
  const indices = new Uint32Array(along * around * 6);
  const center = new Vector3();
  const outward = new Vector3();
  const up = new Vector3();
  const normal = new Vector3();
  const point = new Vector3();

  for (let ring = 0; ring <= along; ring++) {
    const t = ring / along;
    const u = t - (0.9 / (2 * Math.PI)) * Math.sin(2 * Math.PI * t);
    ductCenter(u, center);
    ductFrame(u, outward, up);
    const radius = ductRadius(u) * scale;
    for (let side = 0; side < around; side++) {
      const angle = (side / around) * 2 * Math.PI;
      normal.copy(outward).multiplyScalar(Math.cos(angle)).addScaledVector(up, Math.sin(angle));
      const vertex = ring * around + side;
      normal.toArray(normals, vertex * 3);
      point
        .copy(center)
        .addScaledVector(normal, radius)
        .toArray(positions, vertex * 3);
      places[vertex] = u;
    }
  }

  let index = 0;
  for (let ring = 0; ring < along; ring++) {
    for (let side = 0; side < around; side++) {
      const a = ring * around + side;
      const b = ring * around + ((side + 1) % around);
      const c = a + around;
      const d = b + around;
      indices.set([a, c, b, b, c, d], index);
      index += 6;
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new BufferAttribute(normals, 3));
  geometry.setAttribute('aPlace', new BufferAttribute(places, 1));
  geometry.setIndex(new BufferAttribute(indices, 1));
  return geometry;
}
