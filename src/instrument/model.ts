/**
 * The model behind the home page's instrument: a stylized cochlea, the implant's electrode array
 * inside it, and how the array's current reaches the nerve. Both halves of the instrument work
 * from this one description, so what is drawn (`display.ts`) is what is heard (`engine.ts`).
 *
 * It is a sketch for explaining, not a simulation of anyone's ear. The shapes are procedural, the
 * numbers are textbook orders of magnitude, and nothing here comes from patient data or from the
 * lab's models.
 *
 * Coordinates. A *place* is a position along the cochlear spiral as a fraction of its length:
 * 0 at the base (where the implant enters, and high pitches are heard) to 1 at the apex (the
 * center of the spiral, low pitches).
 */

/** Contacts on the array, as on the 22-electrode arrays the research pages describe. */
export const ELECTRODE_COUNT = 22;
/** The most channels the sound-coding strategy stimulates in one cycle (an "n-of-m" strategy). */
export const MAXIMA = 8;
/** The band of sound the implant's processor analyses, in Hz. */
export const ANALYSIS_LOW_HZ = 188;
export const ANALYSIS_HIGH_HZ = 7938;
/** Noise bands the listening sketch synthesizes: places along the array where nerve can answer. */
export const CARRIER_COUNT = 44;
/** Samples of the nerve-survival profile along the whole spiral. */
export const SURVIVAL_SAMPLES = 256;

/** Turns of the spiral, base to apex. */
const TURNS = 2.6;
/** The spiral's radius at the apex, as a fraction of its radius at the base. */
const APEX_RADIUS = 0.17;
/** How deep the array reaches: the angles, in degrees from the base, of its end contacts. */
const ARRAY_BASAL_DEG = 28;
const ARRAY_APICAL_DEG = 405;
/** Length of the array between its end contacts, in millimeters (contacts about 0.75 mm apart). */
export const ARRAY_LENGTH_MM = 15.75;
/** Where the spiral starts on the screen: the base opens toward the lower right. */
const BASE_ANGLE = -0.2 * Math.PI;

/** Drawing: room kept around the spiral for the array and the scales, in spiral units. */
export const SPIRAL_MARGIN = 0.17;
/** Drawing: how far outside the spiral the array is shown, in spiral units. */
export const ARRAY_OFFSET = 0.05;

const TABLE_SIZE = 720;

export interface Point {
  x: number;
  y: number;
}

/** A point on the spiral with the unit vector pointing from it toward the spiral's center. */
export interface SpiralSample extends Point {
  /** Unit vector toward the modiolus, the axis the nerve fibers gather on. */
  inwardX: number;
  inwardY: number;
  /** Distance to the center, in spiral units (1 at the base). */
  radius: number;
}

/** Angle parameter (0 base → 1 apex) to polar coordinates. */
function polar(t: number): { angle: number; radius: number } {
  return {
    angle: BASE_ANGLE - t * TURNS * 2 * Math.PI,
    radius: 1 - (1 - APEX_RADIUS) * Math.pow(t, 0.85),
  };
}

function pointAtParameter(t: number): Point {
  const { angle, radius } = polar(t);
  return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
}

/** Cumulative length of the spiral at each parameter step, normalized to 1 at the apex. */
const lengthTable: Float32Array = (() => {
  const table = new Float32Array(TABLE_SIZE + 1);
  let previous = pointAtParameter(0);
  for (let i = 1; i <= TABLE_SIZE; i++) {
    const point = pointAtParameter(i / TABLE_SIZE);
    table[i] = table[i - 1]! + Math.hypot(point.x - previous.x, point.y - previous.y);
    previous = point;
  }
  const total = table[TABLE_SIZE]!;
  for (let i = 0; i <= TABLE_SIZE; i++) table[i]! /= total;
  return table;
})();

/** The spiral's angle parameter at a place (inverse of the length table). */
function parameterAtPlace(place: number): number {
  const target = Math.min(1, Math.max(0, place));
  let low = 0;
  let high = TABLE_SIZE;
  while (high - low > 1) {
    const middle = (low + high) >> 1;
    if (lengthTable[middle]! < target) low = middle;
    else high = middle;
  }
  const span = lengthTable[high]! - lengthTable[low]!;
  const fraction = span > 0 ? (target - lengthTable[low]!) / span : 0;
  return (low + fraction) / TABLE_SIZE;
}

function placeAtParameter(t: number): number {
  const position = Math.min(1, Math.max(0, t)) * TABLE_SIZE;
  const index = Math.min(TABLE_SIZE - 1, Math.floor(position));
  const fraction = position - index;
  return lengthTable[index]! * (1 - fraction) + lengthTable[index + 1]! * fraction;
}

/**
 * The spiral at a place, in spiral units: the center is the origin and the base is 1 unit out.
 * y grows downward, as on a screen.
 */
export function spiralAt(place: number): SpiralSample {
  const { angle, radius } = polar(parameterAtPlace(place));
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return { x: radius * cos, y: radius * sin, inwardX: -cos, inwardY: -sin, radius };
}

/** Radial room between the spiral at a place and its next turn inward (or the center). */
export function turnGap(place: number): number {
  const t = parameterAtPlace(place);
  const here = polar(t).radius;
  const next = t + 1 / TURNS;
  return next <= 1 ? here - polar(next).radius : here * 0.72;
}

/**
 * The pitch a healthy ear hears at a place: Greenwood's place-frequency function for the human
 * cochlea, about 20 kHz at the base down to 20 Hz at the apex.
 */
export function greenwoodHz(place: number): number {
  return 165.4 * (Math.pow(10, 2.1 * (1 - place)) - 0.88);
}

/** The place a healthy ear hears a pitch at (inverse of `greenwoodHz`). */
export function placeOfHz(hz: number): number {
  return 1 - Math.log10(hz / 165.4 + 0.88) / 2.1;
}

/** Places of the array's two end contacts. */
export const ARRAY_BASAL_PLACE = placeAtParameter(ARRAY_BASAL_DEG / (TURNS * 360));
export const ARRAY_APICAL_PLACE = placeAtParameter(ARRAY_APICAL_DEG / (TURNS * 360));

/**
 * The place of each contact, index 0 at the base. (Clinical numbering runs the same way: E1 is
 * the most basal contact and E22 the deepest.)
 */
export const ELECTRODE_PLACES: readonly number[] = Array.from(
  { length: ELECTRODE_COUNT },
  (_, index) =>
    ARRAY_BASAL_PLACE + ((ARRAY_APICAL_PLACE - ARRAY_BASAL_PLACE) * index) / (ELECTRODE_COUNT - 1),
);

/** Position along the array of a place: 0 at the basal contact, 1 at the apical one. */
export function arrayPosition(place: number): number {
  return (place - ARRAY_BASAL_PLACE) / (ARRAY_APICAL_PLACE - ARRAY_BASAL_PLACE);
}

/**
 * The sound frequency the implant assigns to a position along the array. The processor divides
 * its analysis band evenly by cochlear distance, low pitches to the deepest contacts.
 */
export function assignedHz(position: number): number {
  const low = placeOfHz(ANALYSIS_LOW_HZ);
  const high = placeOfHz(ANALYSIS_HIGH_HZ);
  return greenwoodHz(high + (low - high) * position);
}

/** One channel of the implant: a band of sound and the contact that delivers it. */
export interface Channel {
  /** Index into `ELECTRODE_PLACES`. */
  electrode: number;
  lowHz: number;
  highHz: number;
  /** Position along the array (0 basal → 1 apical) of the contact. */
  position: number;
  /** Middle of the stretch of array this contact answers for, as a position along the array. */
  center: number;
  /** Half the length of that stretch, as a fraction of the array's length. */
  halfTerritory: number;
}

/**
 * The implant's channels when `count` of its contacts are switched on: the active contacts are
 * spread evenly along the array and the whole analysis band is divided among them, so fewer
 * contacts means each one carries a wider band of sound.
 */
export function channelsFor(count: number): Channel[] {
  const active = Math.min(ELECTRODE_COUNT, Math.max(1, Math.round(count)));
  return Array.from({ length: active }, (_, index) => {
    const electrode =
      active === 1
        ? Math.round((ELECTRODE_COUNT - 1) / 2)
        : Math.round((index * (ELECTRODE_COUNT - 1)) / (active - 1));
    const lower = index / active;
    const upper = (index + 1) / active;
    return {
      electrode,
      // Band edges run with the array: a basal slice of the array carries a high slice of sound.
      highHz: assignedHz(lower),
      lowHz: assignedHz(upper),
      position: electrode / (ELECTRODE_COUNT - 1),
      center: (lower + upper) / 2,
      halfTerritory: 0.5 / active,
    };
  });
}

/** A noise band of the listening sketch: where along the array it sits and what it sounds like. */
export interface Carrier {
  position: number;
  lowHz: number;
  highHz: number;
}

export const CARRIERS: readonly Carrier[] = Array.from({ length: CARRIER_COUNT }, (_, index) => ({
  position: (index + 0.5) / CARRIER_COUNT,
  highHz: assignedHz(index / CARRIER_COUNT),
  lowHz: assignedHz((index + 1) / CARRIER_COUNT),
}));

/**
 * How strongly a contact's current reaches the nerve at a distance along the array. Within the
 * contact's own territory the nerve hears it fully; beyond that the current falls away
 * exponentially, with length constant `spreadMm`. A longer constant means neighboring channels
 * blur into one another.
 */
export function reach(distance: number, halfTerritory: number, spreadMm: number): number {
  const beyond = Math.max(0, Math.abs(distance) - halfTerritory) * ARRAY_LENGTH_MM;
  return Math.exp(-beyond / spreadMm);
}

/** The "current spread" control (0 narrow → 1 wide) as a length constant in millimeters. */
export function spreadMmOf(control: number): number {
  return 0.25 * Math.pow(26, Math.min(1, Math.max(0, control)));
}

/** A nerve: the share of fibers that survive at each of `SURVIVAL_SAMPLES` places. */
export type Survival = Float32Array;

export function survivalAt(survival: Survival, place: number): number {
  const position = Math.min(1, Math.max(0, place)) * (SURVIVAL_SAMPLES - 1);
  const index = Math.min(SURVIVAL_SAMPLES - 2, Math.floor(position));
  const fraction = position - index;
  return survival[index]! * (1 - fraction) + survival[index + 1]! * fraction;
}

/** A stretch of nerve where fibers are missing: its center and width as places, and how bare. */
interface Gap {
  center: number;
  width: number;
  depth: number;
}

function nerveWith(base: number, gaps: Gap[]): Survival {
  const survival = new Float32Array(SURVIVAL_SAMPLES);
  for (let i = 0; i < SURVIVAL_SAMPLES; i++) {
    const place = i / (SURVIVAL_SAMPLES - 1);
    let alive = base;
    for (const { center, width, depth } of gaps) {
      // A flat-bottomed dip: bare in the middle, recovering smoothly at its edges.
      const edge = Math.abs(place - center) / (width / 2);
      const dip =
        edge >= 1.35 ? 0 : edge <= 0.65 ? 1 : 0.5 + 0.5 * Math.cos(((edge - 0.65) / 0.7) * Math.PI);
      alive *= 1 - depth * dip;
    }
    survival[i] = alive;
  }
  return survival;
}

/**
 * The nerves the instrument offers. `full` is an intact nerve; the two listeners have the same
 * implant and nerves thinned in different places, which is the situation the research is about.
 */
export const NERVES = {
  full: () => nerveWith(1, []),
  a: () =>
    nerveWith(0.92, [
      { center: placeOnArray(0.2), width: 0.07, depth: 0.96 },
      { center: placeOnArray(0.62), width: 0.05, depth: 0.9 },
    ]),
  b: () =>
    nerveWith(0.8, [
      { center: placeOnArray(0.43), width: 0.12, depth: 0.97 },
      { center: placeOnArray(0.9), width: 0.08, depth: 0.93 },
      { center: 0.86, width: 0.12, depth: 0.7 },
    ]),
} as const;

export type NerveName = keyof typeof NERVES;

/**
 * The mixing matrix of the listening sketch, row by row: how loudly each carrier (a place where
 * nerve may answer) sounds for each channel's envelope. A carrier answers a channel as far as the
 * channel's current reaches it, and only as much as nerve survives there.
 */
export function mixingWeights(
  channels: readonly Channel[],
  spreadMm: number,
  survival: Survival,
): Float32Array {
  const weights = new Float32Array(CARRIER_COUNT * channels.length);
  CARRIERS.forEach((carrier, k) => {
    const alive = survivalAt(survival, placeOnArray(carrier.position));
    let total = 0;
    channels.forEach((channel, c) => {
      const weight = reach(carrier.position - channel.center, channel.halfTerritory, spreadMm);
      weights[k * channels.length + c] = weight;
      total += weight;
    });
    // Keep the loudness of a place roughly steady however many channels reach it.
    const normalize = total > 0 ? alive / Math.pow(total, 0.8) : 0;
    for (let c = 0; c < channels.length; c++) weights[k * channels.length + c]! *= normalize;
  });
  return weights;
}

/** A small repeatable random generator (mulberry32), so a drawn nerve is the same every time. */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The place along the spiral of a position along the array (inverse of `arrayPosition`). */
export function placeOnArray(position: number): number {
  return ARRAY_BASAL_PLACE + (ARRAY_APICAL_PLACE - ARRAY_BASAL_PLACE) * position;
}
