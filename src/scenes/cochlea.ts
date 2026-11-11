/**
 * The cochlea: hearing, the implant and its digital twin, told in four stages. Scroll progress
 * from i/4 to (i+1)/4 shows stage i + 1 below; without scroll progress the scene rests on stage 4.
 *
 * 1. The cochlea. A fluid-filled spiral that sorts sound by pitch: notes ripple along its
 *    membrane and peak near the base for high pitches, towards the apex for low ones.
 * 2. The implant. A thin array of 22 electrode contacts slides in along the spiral.
 * 3. The nerve. Thousands of fibers fan from the spiral's inner edge to its central axis and down
 *    into the nerve bundle, sparser along the stretches where fewer survive.
 * 4. The digital twin. A violet model of the cochlea is laid over it and swept by a scan, while
 *    the electrodes pulse and the fibers they reach fire: amber spikes running inward.
 *
 * Colors keep the site's legend: signal (cyan) is current, spike (amber) is firing, decode
 * (violet) is the model. The anatomy is procedural (`lib/cochlea-geometry.ts`), no one's own.
 */
import {
  BufferAttribute,
  BufferGeometry,
  Group,
  LineSegments,
  MathUtils,
  Mesh,
  type Object3D,
  PerspectiveCamera,
  Points,
  Scene,
  Vector2,
  Vector3,
} from 'three';
import { disposeObject } from './core/dispose';
import type { Palette } from './core/palette';
import type { SceneFactory } from './core/types';
import { aimAtFocus, fitDistance, orbit, pointScale } from './lib/camera';
import {
  COCHLEA,
  CochleaLength,
  cochleaAngle,
  cochleaHeight,
  createDuctGeometry,
  ductCenter,
  ductFrame,
  ductRadius,
  ductTaper,
  spiralRadius,
} from './lib/cochlea-geometry';
import { createDust } from './lib/dust';
import { createGlowGeometry, createGlowPoints } from './lib/glow-points';
import { createDepthFog, type DepthFog, FOG_FRAGMENT, FOG_VERTEX, alwaysDrawn } from './lib/glsl';
import { createGlowMaterial, createShellMaterial } from './lib/materials';
import { DampedPointer, StageProgress } from './lib/motion';
import { Polyline } from './lib/polyline';
import { createRandom, shuffledIndices } from './lib/random';
import { createPathMaterial, createPathStrip } from './lib/strips';
import { SCENE_STAGES } from './names';

const STAGES = SCENE_STAGES.cochlea;
const CONTACTS = 22;
/** Place of the array's tip once fully inserted: about one and a half turns in. */
const INSERTION = 0.56;
/** Nerve fibers on large screens; small screens draw half as many of everything. */
const FIBERS = 2600;
/** Points along each fiber's path. */
const FIBER_POINTS = 12;
/** Notes that ripple along the membrane in stage 1, by the place where each peaks. */
const NOTES = [0.14, 0.58, 0.3, 0.86, 0.44, 0.72];
const NOTE_LENGTH = 2.6;
/** One round of stimulation: each contact pulses once, in a shuffled order, then it repeats. */
const CYCLE = 2.2;
const SPIKES_PER_PULSE = 10;
/** Seconds a spike takes from the spiral to the end of the bundle. */
const SPIKE_TRAVEL = 1.4;

/** A camera position on the orbit around the cochlea, one per stage. */
interface Pose {
  yaw: number;
  pitch: number;
  /** Multiplies the distance that frames the subject. */
  zoom: number;
  /** Height of the point the camera looks at. */
  lift: number;
}

const POSES: Pose[] = [
  { yaw: 0, pitch: 0.95, zoom: 1, lift: 0.5 },
  { yaw: -0.4, pitch: 0.82, zoom: 0.97, lift: 0.3 },
  { yaw: -0.12, pitch: 0.42, zoom: 0.94, lift: -0.55 },
  { yaw: 0.22, pitch: 0.6, zoom: 0.9, lift: -0.35 },
];

/** Width of the subject to frame: the spiral's diameter with a little room. */
const SUBJECT_WIDTH = 2 * (COCHLEA.baseRadius + COCHLEA.baseDuct) + 0.4;

/** What the scene's layers share: colors, the fog, the point scale and the strip resolution. */
interface Shared {
  palette: Palette;
  fog: DepthFog;
  scale: { value: number };
  resolution: Vector2;
  detail: number;
  random: () => number;
  length: CochleaLength;
}

/** A part of the scene that animates. `update` runs every frame with the stage values. */
interface Layer {
  object: Object3D;
  update(state: FrameState): void;
}

interface FrameState {
  time: number;
  /** 0 → 1 as each stage arrives: 1 the implant, 2 the nerve, 3 the twin. */
  implant: number;
  nerve: number;
  twin: number;
}

const createCochlea: SceneFactory = ({
  renderer,
  palette,
  reducedMotion,
  compact,
  width,
  height,
}) => {
  const shared: Shared = {
    palette,
    fog: createDepthFog(),
    scale: { value: 1 },
    resolution: new Vector2(width, height),
    detail: compact ? 0.5 : 1,
    random: createRandom(1729),
    length: new CochleaLength(),
  };
  const scene = new Scene();
  const camera = new PerspectiveCamera(35, width / height, 0.1, 60);
  const stages = new StageProgress(STAGES, reducedMotion);
  const pointer = new DampedPointer(!reducedMotion);

  const nerve = createNerve(shared);
  const implant = createImplant(shared);
  // The spikes layer times the pulses, so it updates before the implant that shows them.
  const layers: Layer[] = [
    createDuct(shared),
    createMembrane(shared),
    createSpikes(shared, nerve.fibers, implant),
    implant,
    nerve,
    createTwin(shared),
    createMotes(shared),
  ];
  for (const layer of layers) scene.add(layer.object);

  const state: FrameState = { time: 0, implant: 0, nerve: 0, twin: 0 };
  const target = new Vector3();

  return {
    frame(time, delta) {
      stages.update(delta);
      pointer.update(delta);
      state.time = time;
      state.implant = stages.reached(1);
      state.nerve = stages.reached(2);
      state.twin = stages.reached(3);
      for (let i = 0; i < layers.length; i++) layers[i].update(state);

      const pose = poseAt(stages.position);
      const yaw = pose.yaw + Math.sin(time * 0.09) * 0.12 + pointer.x * 0.07;
      const pitch = pose.pitch - pointer.y * 0.05;
      // The nerve bundle hangs below the spiral, so the subject grows taller once it shows.
      const subjectHeight =
        SUBJECT_WIDTH * Math.sin(pitch) +
        (COCHLEA.rise + 0.6 + 2.6 * state.nerve) * Math.cos(pitch);
      const distance = fitDistance(camera, SUBJECT_WIDTH, subjectHeight, 1.02) * pose.zoom;
      orbit(camera, target.set(0, pose.lift, 0), yaw, pitch, distance);
      shared.fog.value.set(distance - 3, distance + 5);
      renderer.render(scene, camera);
    },
    resize(newWidth, newHeight, focus) {
      const spanned = aimAtFocus(camera, newWidth, newHeight, focus);
      shared.scale.value = pointScale(camera, spanned, renderer.getPixelRatio());
      shared.resolution.set(newWidth, newHeight);
    },
    setProgress(progress) {
      stages.set(progress);
    },
    setPointer(x, y) {
      pointer.set(x, y);
    },
    dispose() {
      disposeObject(scene);
    },
  };
};

export default createCochlea;

const pose: Pose = { ...POSES[0] };

/** The camera pose at a stage position, easing between the stages' poses. */
function poseAt(position: number): Pose {
  const index = Math.min(Math.floor(position), STAGES - 2);
  const t = position - index;
  const from = POSES[index];
  const to = POSES[index + 1];
  pose.yaw = MathUtils.lerp(from.yaw, to.yaw, t);
  pose.pitch = MathUtils.lerp(from.pitch, to.pitch, t);
  pose.zoom = MathUtils.lerp(from.zoom, to.zoom, t);
  pose.lift = MathUtils.lerp(from.lift, to.lift, t);
  return pose;
}

/** Share of nerve fibers surviving along the spiral: two stretches of loss, as is common. */
function survival(u: number): number {
  return MathUtils.clamp(1 - 0.96 * bump(u, 0.24, 0.055) - 0.9 * bump(u, 0.6, 0.06), 0.03, 1);
}

function bump(x: number, center: number, width: number): number {
  const d = (x - center) / width;
  return Math.exp(-d * d);
}

function polar(radius: number, angle: number, height: number, target: Vector3): Vector3 {
  return target.set(radius * Math.cos(angle), height, radius * Math.sin(angle));
}

// Stage 1 ----------------------------------------------------------------------------------------

/** The duct: a glass shell, brightest along its silhouette. */
function createDuct({ palette, fog }: Shared): Layer {
  const color = palette.text.clone();
  const material = createShellMaterial({ color, fog, face: 0.025, rim: 0.5 });
  const mesh = new Mesh(createDuctGeometry(360, 28), material);
  return {
    object: mesh,
    update({ twin }) {
      // In stage 4 the glass takes on the model's color and its wireframe takes over the outline.
      color.lerpColors(palette.text, palette.decode, 0.6 * twin);
      material.uniforms.uOpacity.value = 1 - 0.4 * twin;
    },
  };
}

/**
 * The membrane inside the duct, as rows of points. A note sets off a wave that travels from the
 * base and peaks at the note's place, high notes near the base and low notes near the apex; each
 * note vibrates faster the higher it is.
 */
function createMembrane({ palette, fog, scale, detail, length }: Shared): Layer {
  const lanes = detail < 1 ? [-0.3, 0.3] : [-0.45, 0, 0.45];
  const perLane = Math.round(340 * detail);
  const count = lanes.length * perLane;
  const positions = new Float32Array(count * 3);
  const ups = new Float32Array(count * 3);
  const places = new Float32Array(count);
  const center = new Vector3();
  const outward = new Vector3();
  const up = new Vector3();
  const point = new Vector3();

  let index = 0;
  for (let i = 0; i < perLane; i++) {
    // Even spacing by length, so the long basal turn is not sparse.
    const u = length.placeAt(MathUtils.lerp(0.02, 0.985, i / (perLane - 1)) * length.total);
    ductCenter(u, center);
    ductFrame(u, outward, up);
    const radius = ductTaper(u);
    for (const lane of lanes) {
      point
        .copy(center)
        .addScaledVector(outward, lane * radius)
        .addScaledVector(up, -0.08 * radius)
        .toArray(positions, index * 3);
      up.toArray(ups, index * 3);
      places[index] = u;
      index++;
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('aUp', new BufferAttribute(ups, 3));
  geometry.setAttribute('aPlace', new BufferAttribute(places, 1));

  const uniforms = {
    uColor: { value: palette.text },
    uFog: fog,
    uScale: scale,
    uSize: { value: 0.05 },
    uLevel: { value: 1 },
    uNote: { value: 0.5 },
    uNoteAge: { value: 0 },
    uNoteGain: { value: 0 },
  };
  const material = createGlowMaterial(
    uniforms,
    /* glsl */ `
      ${FOG_VERTEX}
      attribute vec3 aUp;
      attribute float aPlace;
      uniform float uScale;
      uniform float uSize;
      uniform float uLevel;
      uniform float uNote;
      uniform float uNoteAge;
      uniform float uNoteGain;
      varying float vGlow;

      void main() {
        // The wave builds slowly from the base and dies just past the note's place.
        float width = aPlace < uNote ? 0.22 : 0.045;
        float envelope = exp(-pow((aPlace - uNote) / width, 2.0)) * uNoteGain;
        float rate = mix(2.6, 0.8, uNote);
        float wave = sin(6.2831853 * (rate * uNoteAge - 7.0 * aPlace));
        vec3 moved = position + aUp * wave * envelope * 0.07;
        vec4 mvPosition = modelViewMatrix * vec4(moved, 1.0);
        vFogDepth = -mvPosition.z;
        vGlow = (0.16 + envelope * (1.0 + 0.8 * wave)) * uLevel;
        gl_PointSize = uSize * (1.0 + 1.1 * envelope) * uScale / max(vFogDepth, 0.01);
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    /* glsl */ `
      ${FOG_FRAGMENT}
      uniform vec3 uColor;
      varying float vGlow;

      void main() {
        vec2 offset = gl_PointCoord - 0.5;
        float d2 = dot(offset, offset) * 4.0;
        float alpha = (exp(-d2 * 9.0) + 0.25 * exp(-d2 * 2.5)) * vGlow * fogFade();
        if (d2 > 1.0 || alpha < 0.002) discard;
        gl_FragColor = vec4(uColor, alpha);
        #include <colorspace_fragment>
      }
    `,
  );
  const points = alwaysDrawn(new Points(geometry, material));

  return {
    object: points,
    update({ time, implant }) {
      const note = Math.floor(time / NOTE_LENGTH);
      const age = time - note * NOTE_LENGTH;
      uniforms.uNote.value = NOTES[note % NOTES.length];
      uniforms.uNoteAge.value = age;
      uniforms.uNoteGain.value =
        MathUtils.smoothstep(age, 0, 0.35) *
        (1 - MathUtils.smoothstep(age, NOTE_LENGTH - 0.7, NOTE_LENGTH));
      // Quieter once the implant takes the stage.
      uniforms.uLevel.value = 1 - 0.55 * implant;
    },
  };
}

// Stage 2 ----------------------------------------------------------------------------------------

interface Implant extends Layer {
  /** Place along the spiral of each contact once inserted, tip first. */
  contactPlaces: Float32Array;
  /** Strength of each contact's pulse this frame, 0 → 1, set by the spikes layer. */
  pulses: Float32Array;
}

/**
 * The electrode array: a thin carrier with 22 contacts that slides in from outside the base along
 * the inner wall of the duct. When it pulses, current glows around the contacts.
 */
function createImplant(shared: Shared): Implant {
  const { palette, fog, scale, resolution } = shared;
  const { path, lead, places } = createArrayPath();
  const inside = path.length - lead;
  const tipGap = 0.12;
  const spacing = (inside * 0.86 - tipGap) / (CONTACTS - 1);
  const contactPlaces = new Float32Array(CONTACTS);
  for (let k = 0; k < CONTACTS; k++) {
    contactPlaces[k] = placeAlong(path, places, path.length - tipGap - k * spacing);
  }

  // The lead fades out away from the cochlea; `uTip` hides what is not yet inserted.
  const carrierMaterial = createPathMaterial({
    color: palette.text,
    fog,
    resolution: { value: resolution },
    width: 3.2,
    fadeIn: lead,
  });
  const carrier = alwaysDrawn(new Mesh(createPathStrip(path), carrierMaterial));

  const contactGeometry = createGlowGeometry(CONTACTS);
  const contacts = createGlowPoints({ color: palette.signal, fog, size: 0.17, scale });
  const haloGeometry = createGlowGeometry(CONTACTS);
  const halos = createGlowPoints({ color: palette.signal, fog, size: 0.8, look: 'haze', scale });
  const contactPoints = alwaysDrawn(new Points(contactGeometry, contacts.material));
  const haloPoints = alwaysDrawn(new Points(haloGeometry, halos.material));

  const group = new Group();
  group.add(carrier, haloPoints, contactPoints);

  const pulses = new Float32Array(CONTACTS);
  const point = new Vector3();
  const contactPositions = contactGeometry.getAttribute('position');
  const haloPositions = haloGeometry.getAttribute('position');
  const contactGlow = contactGeometry.getAttribute('aGlow');
  const haloGlow = haloGeometry.getAttribute('aGlow');

  return {
    object: group,
    contactPlaces,
    pulses,
    update({ implant, twin }) {
      const opacity = MathUtils.smoothstep(implant, 0, 0.3);
      // Slides in as stage 2 arrives: pulled back by the length still outside.
      const pulledBack = (1 - MathUtils.smoothstep(implant, 0.1, 1)) * inside;
      carrierMaterial.uniforms.uOpacity.value = 0.55 * opacity;
      carrierMaterial.uniforms.uTip.value = path.length - pulledBack;
      for (let k = 0; k < CONTACTS; k++) {
        path.pointAt(path.length - pulledBack - tipGap - k * spacing, point);
        contactPositions.setXYZ(k, point.x, point.y, point.z);
        haloPositions.setXYZ(k, point.x, point.y, point.z);
        contactGlow.setX(k, opacity * (1 + 1.5 * pulses[k] * twin));
        haloGlow.setX(k, pulses[k] * twin * 0.6);
      }
      contactPositions.needsUpdate = true;
      haloPositions.needsUpdate = true;
      contactGlow.needsUpdate = true;
      haloGlow.needsUpdate = true;
    },
  };
}

/**
 * The array's path: a lead that comes in from outside, continuing the spiral's line beyond its
 * base, then along the duct's inner wall to the tip. `places` holds each point's place in the
 * duct (negative along the lead).
 */
function createArrayPath(): { path: Polyline; lead: number; places: Float32Array } {
  const leadPoints = 48;
  const insidePoints = 220;
  const leadLength = 1.5;
  const points = new Float32Array((leadPoints + insidePoints) * 3);
  const places = new Float32Array(leadPoints + insidePoints);
  const outward = new Vector3();
  const up = new Vector3();
  const along = (u: number, target: Vector3) => {
    ductCenter(u, target);
    ductFrame(u, outward, up);
    const radius = ductTaper(u);
    return target.addScaledVector(outward, -0.4 * radius).addScaledVector(up, -0.3 * radius);
  };

  const entry = along(0, new Vector3());
  const back = entry.clone().sub(along(0.01, new Vector3())).normalize();
  const point = new Vector3();
  for (let i = 0; i < leadPoints; i++) {
    const out = 1 - i / leadPoints;
    // Dipping away below the spiral as it leaves.
    point.copy(entry).addScaledVector(back, out * leadLength);
    point.y -= 0.35 * out * out;
    point.toArray(points, i * 3);
    places[i] = -out;
  }
  for (let i = 0; i < insidePoints; i++) {
    const u = (i / (insidePoints - 1)) * INSERTION;
    along(u, point).toArray(points, (leadPoints + i) * 3);
    places[leadPoints + i] = u;
  }
  const path = new Polyline(points);
  return { path, lead: path.distances[leadPoints], places };
}

/** The place in the duct at `distance` along the array's path. */
function placeAlong(path: Polyline, places: Float32Array, distance: number): number {
  const { distances } = path;
  let index = 1;
  while (index < distances.length - 1 && distances[index] < distance) index++;
  const start = distances[index - 1];
  const t = MathUtils.clamp((distance - start) / (distances[index] - start || 1), 0, 1);
  return MathUtils.lerp(places[index - 1], places[index], t);
}

// Stage 3 ----------------------------------------------------------------------------------------

interface Fibers {
  count: number;
  /** Place along the spiral of each fiber, ascending. */
  places: Float32Array;
  /** FIBER_POINTS points per fiber, from the spiral inward and down the bundle. */
  paths: Float32Array;
}

interface Nerve extends Layer {
  fibers: Fibers;
}

/** The auditory nerve: fibers as thin lines, with a dot for each cell body. */
function createNerve(shared: Shared): Nerve {
  const { palette, fog, scale } = shared;
  const fibers = createFibers(shared);
  const segments = FIBER_POINTS - 1;
  const positions = new Float32Array(fibers.count * segments * 6);
  const along = new Float32Array(fibers.count * segments * 2);
  const somaGeometry = createGlowGeometry(fibers.count);
  const somas = somaGeometry.getAttribute('position');

  for (let fiber = 0; fiber < fibers.count; fiber++) {
    const path = fiber * FIBER_POINTS * 3;
    for (let i = 0; i < segments; i++) {
      const vertex = (fiber * segments + i) * 2;
      positions.set(fibers.paths.subarray(path + i * 3, path + i * 3 + 6), vertex * 3);
      along[vertex] = i / segments;
      along[vertex + 1] = (i + 1) / segments;
    }
    // The cell body sits where the fiber leaves the spiral's inner wall.
    somas.setXYZ(fiber, fibers.paths[path + 6], fibers.paths[path + 7], fibers.paths[path + 8]);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('aAlong', new BufferAttribute(along, 1));
  const uniforms = {
    uColor: { value: palette.text },
    uFog: fog,
    uOpacity: { value: 0 },
    uReveal: { value: 0 },
  };
  const lines = new LineSegments(
    geometry,
    createGlowMaterial(
      uniforms,
      /* glsl */ `
        ${FOG_VERTEX}
        attribute float aAlong;
        varying float vAlong;

        void main() {
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          vFogDepth = -mvPosition.z;
          vAlong = aAlong;
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      /* glsl */ `
        ${FOG_FRAGMENT}
        uniform vec3 uColor;
        uniform float uOpacity;
        uniform float uReveal;
        varying float vAlong;

        void main() {
          // Fibers grow from the spiral inward as the stage arrives.
          float grown = 1.0 - smoothstep(uReveal - 0.1, uReveal, vAlong);
          // Thousands of fibers crowd into the bundle: dim them there, and let it trail off.
          float body = mix(1.0, 0.1, smoothstep(0.3, 0.75, vAlong)) * (1.0 - smoothstep(0.82, 1.0, vAlong));
          float alpha = uOpacity * grown * body * fogFade();
          if (alpha < 0.002) discard;
          gl_FragColor = vec4(uColor, alpha);
          #include <colorspace_fragment>
        }
      `,
    ),
  );

  const somaColor = palette.text.clone();
  const soma = createGlowPoints({ color: somaColor, fog, size: 0.045, scale });
  const somaPoints = new Points(somaGeometry, soma.material);

  const group = new Group();
  group.add(lines, somaPoints);
  return {
    object: group,
    fibers,
    update({ nerve, twin }) {
      uniforms.uOpacity.value = 0.07 * MathUtils.smoothstep(nerve, 0, 0.25);
      uniforms.uReveal.value = MathUtils.lerp(-0.1, 1.1, nerve);
      soma.uniforms.uOpacity.value = (0.22 + 0.2 * twin) * MathUtils.smoothstep(nerve, 0.2, 0.7);
      // In the twin, every modeled cell body takes the model's color.
      somaColor.lerpColors(palette.text, palette.decode, twin);
    },
  };
}

/**
 * Fiber paths. Places are spread evenly by length and kept in proportion to survival there; each
 * path runs from under the membrane through its cell body by the inner wall, into the spiral's
 * core, and down into a twisted bundle where fibers from the apex run in the middle.
 */
function createFibers({ detail, random, length }: Shared): Fibers {
  const wanted = Math.round(FIBERS * detail);
  const places: number[] = [];
  while (places.length < wanted) {
    const u = length.placeAt(MathUtils.lerp(0.025, 0.975, random()) * length.total);
    if (random() < survival(u)) places.push(u);
  }
  places.sort((a, b) => a - b);

  const paths = new Float32Array(places.length * FIBER_POINTS * 3);
  const controls = [new Vector3(), new Vector3(), new Vector3(), new Vector3(), new Vector3()];
  const outward = new Vector3();
  const up = new Vector3();
  const point = new Vector3();
  places.forEach((u, fiber) => {
    const angle = cochleaAngle(u);
    const radius = spiralRadius(u);
    const height = cochleaHeight(u);
    const duct = ductTaper(u);
    const core = (0.08 + 0.3 * Math.pow(1 - u, 0.8)) * (0.5 + 0.5 * random());
    ductFrame(u, outward, up);
    ductCenter(u, controls[0])
      .addScaledVector(outward, (random() - 0.6) * 0.5 * duct)
      .addScaledVector(up, -0.12 * duct);
    polar(radius - 1.3 * duct, angle + (random() - 0.5) * 0.04, height - 0.1 * duct, controls[1]);
    polar(0.2 + 0.14 * random(), angle + 0.55, height * 0.5 - 0.42, controls[2]);
    polar(core, angle + 1.25, -1.35 - 0.2 * random(), controls[3]);
    polar(core * 0.9, angle + 1.55, -2.35 - 0.25 * random(), controls[4]);
    for (let i = 0; i < FIBER_POINTS; i++) {
      catmullRom(controls, i / (FIBER_POINTS - 1), point);
      point.toArray(paths, (fiber * FIBER_POINTS + i) * 3);
    }
  });
  return { count: places.length, places: Float32Array.from(places), paths };
}

/** A point on the Catmull-Rom spline through `controls`, at `t` from 0 (first) to 1 (last). */
function catmullRom(controls: Vector3[], t: number, target: Vector3): Vector3 {
  const segments = controls.length - 1;
  const scaled = Math.min(t * segments, segments - 1e-6);
  const i = Math.floor(scaled);
  const s = scaled - i;
  const p0 = controls[Math.max(0, i - 1)];
  const p1 = controls[i];
  const p2 = controls[i + 1];
  const p3 = controls[Math.min(segments, i + 2)];
  const s2 = s * s;
  const s3 = s2 * s;
  const a = -0.5 * s3 + s2 - 0.5 * s;
  const b = 1.5 * s3 - 2.5 * s2 + 1;
  const c = -1.5 * s3 + 2 * s2 + 0.5 * s;
  const d = 0.5 * s3 - 0.5 * s2;
  return target.set(
    a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    a * p0.y + b * p1.y + c * p2.y + d * p3.y,
    a * p0.z + b * p1.z + c * p2.z + d * p3.z,
  );
}

// Stage 4 ----------------------------------------------------------------------------------------

/**
 * Stimulation and the nerve's answer: each contact pulses once per cycle, and fibers near it
 * fire spikes that run inward and down the bundle. Contacts over a stretch with few surviving
 * fibers set off few spikes.
 */
function createSpikes(shared: Shared, fibers: Fibers, implant: Implant): Layer {
  const { contactPlaces, pulses } = implant;
  const { palette, fog, scale, random } = shared;
  const perPulse = Math.max(4, Math.round(SPIKES_PER_PULSE * shared.detail));
  const order = shuffledIndices(CONTACTS, random);
  const pulseStarts = new Float32Array(CONTACTS);
  order.forEach((contact, slot) => (pulseStarts[contact] = (slot / CONTACTS) * CYCLE));

  const spikeFibers: number[] = [];
  const spikeStarts: number[] = [];
  for (let contact = 0; contact < CONTACTS; contact++) {
    const near = fibersNear(fibers.places, contactPlaces[contact], 0.028);
    for (let i = 0; i < perPulse && near.count > 0; i++) {
      spikeFibers.push(near.first + Math.floor(random() * near.count));
      spikeStarts.push(pulseStarts[contact] + 0.03 + random() * 0.09);
    }
  }

  const count = spikeFibers.length;
  const geometry = createGlowGeometry(count);
  const positions = geometry.getAttribute('position');
  const glow = geometry.getAttribute('aGlow');
  const spikes = createGlowPoints({ color: palette.spike, fog, size: 0.24, scale });
  const points = alwaysDrawn(new Points(geometry, spikes.material));

  return {
    object: points,
    update({ time, twin }) {
      for (let contact = 0; contact < CONTACTS; contact++) {
        pulses[contact] = Math.exp(
          -MathUtils.euclideanModulo(time - pulseStarts[contact], CYCLE) / 0.14,
        );
      }
      for (let i = 0; i < count; i++) {
        const age = MathUtils.euclideanModulo(time - spikeStarts[i], CYCLE);
        if (age >= SPIKE_TRAVEL || twin <= 0) {
          glow.setX(i, 0);
          continue;
        }
        const along = age / SPIKE_TRAVEL;
        const index = along * (FIBER_POINTS - 1);
        const from = Math.floor(index);
        const to = Math.min(FIBER_POINTS - 1, from + 1);
        const t = index - from;
        const base = spikeFibers[i] * FIBER_POINTS * 3;
        const a = base + from * 3;
        const b = base + to * 3;
        const p = fibers.paths;
        positions.setXYZ(
          i,
          p[a] + (p[b] - p[a]) * t,
          p[a + 1] + (p[b + 1] - p[a + 1]) * t,
          p[a + 2] + (p[b + 2] - p[a + 2]) * t,
        );
        glow.setX(
          i,
          twin * MathUtils.smoothstep(along, 0, 0.04) * (1 - MathUtils.smoothstep(along, 0.7, 1)),
        );
      }
      positions.needsUpdate = true;
      glow.needsUpdate = true;
    },
  };
}

/** The range of fibers (sorted by place) within `reach` of `place`. */
function fibersNear(
  places: Float32Array,
  place: number,
  reach: number,
): { first: number; count: number } {
  let first = 0;
  while (first < places.length && places[first] < place - reach) first++;
  let last = first;
  while (last < places.length && places[last] <= place + reach) last++;
  return { first, count: last - first };
}

/**
 * The digital twin: a violet wireframe of the duct, rings and lengthwise lines, that a scan
 * sweeps from base to apex.
 */
function createTwin({ palette, fog, scale, length }: Shared): Layer {
  const rings = 64;
  const ringSides = 20;
  const lines = 10;
  const lineSegments = 220;
  const vertexCount = (rings * ringSides + lines * lineSegments) * 2;
  const positions = new Float32Array(vertexCount * 3);
  const places = new Float32Array(vertexCount);
  const center = new Vector3();
  const outward = new Vector3();
  const up = new Vector3();
  const point = new Vector3();
  let vertex = 0;

  const add = (u: number, around: number) => {
    ductCenter(u, center);
    ductFrame(u, outward, up);
    const radius = ductRadius(u) * 1.08;
    point
      .copy(center)
      .addScaledVector(outward, Math.cos(around) * radius)
      .addScaledVector(up, Math.sin(around) * radius)
      .toArray(positions, vertex * 3);
    places[vertex] = u;
    vertex++;
  };

  for (let ring = 0; ring < rings; ring++) {
    const u = length.placeAt(((ring + 0.5) / rings) * length.total);
    for (let side = 0; side < ringSides; side++) {
      add(u, (side / ringSides) * 2 * Math.PI);
      add(u, ((side + 1) / ringSides) * 2 * Math.PI);
    }
  }
  for (let line = 0; line < lines; line++) {
    const around = ((line + 0.5) / lines) * 2 * Math.PI;
    for (let i = 0; i < lineSegments; i++) {
      add(length.placeAt((i / lineSegments) * length.total), around);
      add(length.placeAt(((i + 1) / lineSegments) * length.total), around);
    }
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('aPlace', new BufferAttribute(places, 1));
  const uniforms = {
    uColor: { value: palette.decode },
    uFog: fog,
    uOpacity: { value: 0 },
    uScan: { value: 0 },
  };
  const wireframe = new LineSegments(
    geometry,
    createGlowMaterial(
      uniforms,
      /* glsl */ `
        ${FOG_VERTEX}
        attribute float aPlace;
        varying float vPlace;

        void main() {
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          vFogDepth = -mvPosition.z;
          vPlace = aPlace;
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      /* glsl */ `
        ${FOG_FRAGMENT}
        uniform vec3 uColor;
        uniform float uOpacity;
        uniform float uScan;
        varying float vPlace;

        void main() {
          float scan = exp(-pow((vPlace - uScan) / 0.04, 2.0));
          float alpha = uOpacity * (0.32 + 1.4 * scan) * fogFade();
          if (alpha < 0.002) discard;
          gl_FragColor = vec4(uColor, alpha);
          #include <colorspace_fragment>
        }
      `,
    ),
  );

  // The scan itself: a ring of light around the duct that sweeps from base to apex.
  const ringPoints = 36;
  const ringGeometry = createGlowGeometry(ringPoints);
  const ringPositions = ringGeometry.getAttribute('position');
  const ringGlow = ringGeometry.getAttribute('aGlow');
  const ring = createGlowPoints({ color: palette.decode, fog, size: 0.13, scale });
  const ringObject = alwaysDrawn(new Points(ringGeometry, ring.material));

  const group = new Group();
  group.add(wireframe, ringObject);
  return {
    object: group,
    update({ time, twin }) {
      const scan = MathUtils.euclideanModulo(time / 6.5, 1) * 1.3 - 0.15;
      uniforms.uOpacity.value = 0.85 * twin;
      uniforms.uScan.value = scan;

      const u = MathUtils.clamp(scan, 0, 1);
      const shown = twin * (1 - MathUtils.smoothstep(Math.abs(scan - 0.5), 0.45, 0.55));
      ductCenter(u, center);
      ductFrame(u, outward, up);
      const radius = ductRadius(u) * 1.1;
      for (let i = 0; i < ringPoints; i++) {
        const around = (i / ringPoints) * 2 * Math.PI;
        point
          .copy(center)
          .addScaledVector(outward, Math.cos(around) * radius)
          .addScaledVector(up, Math.sin(around) * radius);
        ringPositions.setXYZ(i, point.x, point.y, point.z);
        ringGlow.setX(i, shown);
      }
      ringPositions.needsUpdate = true;
      ringGlow.needsUpdate = true;
    },
  };
}

// Throughout -------------------------------------------------------------------------------------

/** Faint motes around the cochlea, turning slowly, for depth. */
function createMotes({ palette, fog, scale, detail, random }: Shared): Layer {
  const dust = createDust({
    color: palette.muted,
    fog,
    scale,
    count: Math.round(220 * detail),
    random,
    inner: 2.6,
    outer: 6.6,
    height: 6,
  });
  return {
    object: dust,
    update({ time }) {
      dust.rotation.y = time * 0.012;
    },
  };
}
