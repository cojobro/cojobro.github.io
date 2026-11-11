/**
 * SVG geometry for logarithmic spirals, the shape of the cochlea: the site's spiral mark. Units
 * are SVG user units with y pointing down, so increasing angles turn clockwise.
 */

export interface Spiral {
  cx: number;
  cy: number;
  /** Radius at the outer end (the cochlea's base). */
  outerRadius: number;
  /** Radius at the inner end (the apex). */
  innerRadius: number;
  /** Full turns from the outer end to the inner end. */
  turns: number;
  /** Direction of the outer end from the center, in radians; 0 points right. */
  startAngle: number;
}

type Point = [x: number, y: number];

/** Bézier segments per turn; at eight the fitted curve is indistinguishable from the spiral. */
const SEGMENTS_PER_TURN = 8;

/** The point at `t` along the spiral: 0 is the outer end, 1 the inner end. */
export function spiralPoint(spiral: Spiral, t: number): Point {
  const { angle, radius } = polarAt(spiral, t);
  return [spiral.cx + radius * Math.cos(angle), spiral.cy + radius * Math.sin(angle)];
}

/** SVG path data along the spiral from `from` to `to` (fractions as in `spiralPoint`). */
export function spiralPath(spiral: Spiral, from = 0, to = 1): string {
  const span = to - from;
  const segments = Math.max(1, Math.ceil(Math.abs(span) * spiral.turns * SEGMENTS_PER_TURN));
  const step = span / segments;
  let path = `M${format(spiralPoint(spiral, from))}`;
  for (let index = 0; index < segments; index++) {
    const t0 = from + index * step;
    const t1 = t0 + step;
    // Cubic Bézier through both ends with the curve's own tangents (Hermite form).
    const [p0, p1] = [spiralPoint(spiral, t0), spiralPoint(spiral, t1)];
    const [d0, d1] = [derivative(spiral, t0), derivative(spiral, t1)];
    const c0: Point = [p0[0] + (d0[0] * step) / 3, p0[1] + (d0[1] * step) / 3];
    const c1: Point = [p1[0] - (d1[0] * step) / 3, p1[1] - (d1[1] * step) / 3];
    path += `C${format(c0)} ${format(c1)} ${format(p1)}`;
  }
  return path;
}

function polarAt(spiral: Spiral, t: number) {
  return {
    angle: spiral.startAngle + t * spiral.turns * 2 * Math.PI,
    radius: spiral.outerRadius * (spiral.innerRadius / spiral.outerRadius) ** t,
  };
}

/** d(point)/dt. */
function derivative(spiral: Spiral, t: number): Point {
  const { angle, radius } = polarAt(spiral, t);
  const angleRate = spiral.turns * 2 * Math.PI;
  const radiusRate = radius * Math.log(spiral.innerRadius / spiral.outerRadius);
  return [
    radiusRate * Math.cos(angle) - radius * angleRate * Math.sin(angle),
    radiusRate * Math.sin(angle) + radius * angleRate * Math.cos(angle),
  ];
}

function format([x, y]: Point): string {
  return `${Number(x.toFixed(2))},${Number(y.toFixed(2))}`;
}
