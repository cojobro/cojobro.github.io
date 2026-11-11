/**
 * Listening back: an implant that could follow the voice its wearer is listening to.
 *
 * Stages, one per caption:
 *  1. Two voices: in a noisy room two talkers speak at once, and rings of sound from both reach
 *     the ear. One voice travels as solid rings, the other as dotted rings.
 *  2. Attention: the brain's hearing centers, an amber region above the ear, pulse in rhythm with
 *     the voice being listened to (the solid rings), not with the other.
 *  3. Listening back: a small electrode near the ear (cyan) picks up that rhythm, and a violet
 *     readout locks onto the attended talker, whose rings strengthen while the other's fade.
 *
 * Everything is stylized: the head is a procedural glass form, the voices are synthesized (see
 * `lib/speech.ts`), and the electrode's place is conceptual, not anatomical.
 */
import {
  BufferAttribute,
  BufferGeometry,
  type Color,
  CylinderGeometry,
  type IUniform,
  MathUtils,
  Mesh,
  type Object3D,
  PerspectiveCamera,
  Points,
  Scene,
  SphereGeometry,
  Vector2,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { disposeObject } from './core/dispose';
import type { Palette } from './core/palette';
import type { SceneFactory } from './core/types';
import { aimAtFocus, fitDistance, narrowness, orbit, pointScale } from './lib/camera';
import { createDust } from './lib/dust';
import {
  createGlowGeometry,
  createGlowPoints,
  POINT_COLOR_FRAGMENT,
  POINT_SIZE,
} from './lib/glow-points';
import {
  alwaysDrawn,
  createDepthFog,
  type DepthFog,
  float,
  FOG_VERTEX,
  HASH,
  vec3,
} from './lib/glsl';
import { createGlowMaterial, createShellMaterial } from './lib/materials';
import { DampedPointer, StageProgress } from './lib/motion';
import { Polyline } from './lib/polyline';
import { createRandom } from './lib/random';
import { SPEECH } from './lib/speech';
import {
  createPathMaterial,
  createPathStrip,
  createStripGeometry,
  PATH_STRIP_VERTEX,
  STRIP_COLOR_FRAGMENT,
  STRIP_VERTEX,
} from './lib/strips';
import { SCENE_STAGES } from './names';

const STAGES = SCENE_STAGES.attention;
/** Speed of sound in the scene, units per second: slow, so the rings can be followed. */
const SOUND_SPEED = 1;
/** Rings in flight per voice, and how far they spread before fading out. */
const RINGS = 16;
const REACH = 5.2;
/**
 * The two talkers, at ear height. The listener faces the other one: attention, unlike a
 * directional microphone, can follow a voice that is not in front.
 */
const ATTENDED = new Vector3(2.95, 0, 0.52);
const OTHER = new Vector3(-1.03, 0, 2.82);
/** The ear that faces the camera, where both voices arrive. */
const EAR = new Vector3(0.72, -0.05, -0.08);
/** Seconds from a syllable leaving the attended talker to the brain following it. */
const DELAY = ATTENDED.distanceTo(EAR) / SOUND_SPEED + 0.12;
/** Camera swing, radians, across the pointer's full range. */
const PARALLAX = 0.06;

/**
 * What the camera frames at each stage: a center, an orbit, and the area that must fit. On
 * narrow views (see `narrowness`) it changes its height (`rise`: up so the rings fill a tall view,
 * or down to keep a talker level with the head) and lets a share of the width (`crop`) fall
 * outside the view.
 */
interface Pose {
  target: Vector3;
  yaw: number;
  pitch: number;
  width: number;
  height: number;
  rise: number;
  crop: number;
}

const POSES: readonly Pose[] = [
  // Both talkers and the head: the two voices stay in view.
  {
    target: new Vector3(0.5, 0, 0.9),
    yaw: 0.75,
    pitch: 0.3,
    width: 7.4,
    height: 3.8,
    rise: 0.4,
    crop: 0.1,
  },
  // The side of the head: the ear, and the hearing region above it.
  {
    target: new Vector3(0.45, 0.12, -0.1),
    yaw: 1.1,
    pitch: 0.2,
    width: 3.4,
    height: 2.9,
    rise: 0.1,
    crop: 0.3,
  },
  // The head, the electrode and the attended talker.
  {
    target: new Vector3(1.3, 0.15, 0.2),
    yaw: 0.85,
    pitch: 0.3,
    width: 5.8,
    height: 3.4,
    rise: -0.15,
    crop: 0.3,
  },
];

/** Uniforms every material shares; updating one updates them all. */
interface Shared {
  [name: string]: IUniform;
  uTime: IUniform<number>;
  uFog: DepthFog;
  uResolution: IUniform<Vector2>;
  uPointScale: IUniform<number>;
  uPixelRatio: IUniform<number>;
}

/** The two voices, as loudness over time: each its own rhythm of syllables. */
const VOICES = /* glsl */ `
${HASH}
${SPEECH}
uniform float uTime;

// 0 is the attended voice, 1 the other.
float voice(float talker, float t) {
  return talker < 0.5 ? speechEnvelope(t / 1.1, 1.0) : speechEnvelope(t / 0.9 + 0.37, 2.0);
}

// Strength of a ring at this radius from its talker: as loud as the moment it left, thinning as
// it spreads.
float ringStrength(float talker, float radius) {
  float loud = voice(talker, uTime - radius / ${float(SOUND_SPEED)});
  return (0.1 + 0.9 * loud) * pow(1.0 - radius / ${float(REACH)}, 1.4) * smoothstep(0.0, 0.3, radius);
}

float ringRadius(float ring) {
  return mod(uTime * ${float(SOUND_SPEED)} + ring * ${float(REACH / RINGS)}, ${float(REACH)});
}
`;

const createAttention: SceneFactory = ({
  renderer,
  palette,
  reducedMotion,
  compact,
  width,
  height,
}) => {
  const scene = new Scene();
  const camera = new PerspectiveCamera(35, width / height, 0.1, 100);
  const random = createRandom(23);

  const shared: Shared = {
    uTime: { value: 0 },
    uFog: createDepthFog(),
    uResolution: { value: new Vector2(width, height) },
    uPointScale: { value: 1 },
    uPixelRatio: { value: renderer.getPixelRatio() },
  };
  const attendedGain = { value: 1 };
  const otherGain = { value: 1 };
  const listening = { value: 1 };
  const device = { value: 1 };

  const dust = createDust({
    color: palette.muted,
    fog: shared.uFog,
    scale: shared.uPointScale,
    count: compact ? 70 : 140,
    random,
    inner: 2.4,
    outer: 7,
    height: 5,
  });
  scene.add(
    dust,
    ...createHead(shared, palette),
    createSolidRings(shared, palette.text, attendedGain),
    createDottedRings(shared, palette.muted, otherGain),
    createTalkers(shared, palette, attendedGain, otherGain),
    ...createCortex(shared, palette.spike, listening, random, compact ? 50 : 80),
    ...createElectrode(shared, palette.signal, device),
    ...createReadout(shared, palette.decode, device),
  );

  const progress = new StageProgress(STAGES, reducedMotion);
  const pointer = new DampedPointer(!reducedMotion);
  const target = new Vector3();
  const pitches = new Float32Array(STAGES);
  const distances = new Float32Array(STAGES);

  return {
    frame(time, delta) {
      progress.update(delta);
      pointer.update(delta);
      shared.uTime.value = time;

      const hearing = progress.reached(1);
      const readout = progress.reached(2);
      listening.value = 0.1 + 0.9 * hearing;
      device.value = readout;
      // Once the readout locks on, the implant favors the attended voice over the other.
      attendedGain.value = 0.8 + 0.4 * readout;
      otherGain.value = 0.8 - 0.62 * readout;

      const position = progress.position;
      const index = Math.min(Math.floor(position), STAGES - 2);
      const blend = position - index;
      const from = POSES[index];
      const to = POSES[index + 1];
      const distance = MathUtils.lerp(distances[index], distances[index + 1], blend);
      const drift = reducedMotion ? 0 : Math.sin(time * 0.1);
      target.lerpVectors(from.target, to.target, blend);
      orbit(
        camera,
        target,
        MathUtils.lerp(from.yaw, to.yaw, blend) + pointer.x * PARALLAX + drift * 0.05,
        MathUtils.lerp(pitches[index], pitches[index + 1], blend) - pointer.y * PARALLAX * 0.6,
        distance,
      );
      shared.uFog.value.set(distance - 2.5, distance + 6);
      dust.rotation.y = reducedMotion ? 0 : time * 0.012;

      renderer.render(scene, camera);
    },
    resize(newWidth, newHeight, focus) {
      const viewHeight = aimAtFocus(camera, newWidth, newHeight, focus);
      const narrow = narrowness(camera.aspect);
      POSES.forEach((pose, i) => {
        pitches[i] = pose.pitch + narrow * pose.rise;
        distances[i] = fitDistance(camera, pose.width * (1 - pose.crop * narrow), pose.height);
      });
      shared.uResolution.value.set(newWidth, newHeight);
      shared.uPixelRatio.value = renderer.getPixelRatio();
      shared.uPointScale.value = pointScale(camera, viewHeight, renderer.getPixelRatio());
    },
    setProgress(value) {
      progress.set(value);
    },
    setPointer(x, y) {
      pointer.set(x, y);
    },
    dispose() {
      disposeObject(scene);
    },
  };
};

export default createAttention;

// The listener ------------------------------------------------------------------------------------

/**
 * The head's surface in the direction of the unit vector (x, y, z): a sphere shaped into skull,
 * jaw and face, looking along +z. Heights are kept, so circles of latitude stay level.
 */
function headPoint(x: number, y: number, z: number, target: Vector3): Vector3 {
  const lower = MathUtils.smoothstep(-y, 0.05, 1);
  const front = Math.max(0, z);
  const back = Math.max(0, -z);
  const bump = (dx: number, dy: number, width: number, height: number) =>
    Math.exp(-((dx / width) ** 2) - (dy / height) ** 2);
  // Soft features on the face: nose, brow, eye sockets, lips and chin.
  const face =
    0.24 * bump(x, y + 0.14, 0.1, 0.15) * front ** 8 +
    0.05 * bump(x, y - 0.24, 0.42, 0.08) * front ** 4 -
    0.045 * bump(Math.abs(x) - 0.27, y - 0.1, 0.1, 0.07) * front ** 4 +
    0.03 * bump(x, y + 0.5, 0.18, 0.06) * front ** 6 +
    0.08 * bump(x, y + 0.78, 0.22, 0.1) * front ** 3;
  // A little extra width over the cheekbones.
  const cheek = 0.04 * bump(z - 0.45, y + 0.05, 0.25, 0.15) * front;
  // A skull fuller behind; a jaw narrower than the cheeks, tucked in behind towards the neck.
  const depth = 0.9 * (1 + 0.12 * back * (1 - lower)) * (1 - 0.12 * lower);
  return target.set(
    x * (0.7 * (1 - 0.32 * lower ** 1.2) + cheek),
    y,
    z * depth + 0.22 * back * lower ** 1.5 + face,
  );
}

/** A point on (or off, with `lift`) the head's surface, in the direction of (x, y, z). */
function onHead(x: number, y: number, z: number, lift = 1): Vector3 {
  const length = Math.hypot(x, y, z);
  return headPoint(x / length, y / length, z / length, new Vector3()).multiplyScalar(lift);
}

/**
 * The head: a glass shell with level contour lines, a neck that dissolves below it, and the ear
 * that faces the camera.
 */
function createHead(shared: Shared, palette: Palette): Object3D[] {
  const sphere = new SphereGeometry(1, 72, 54);
  const position = sphere.getAttribute('position');
  const point = new Vector3();
  for (let i = 0; i < position.count; i++) {
    headPoint(position.getX(i), position.getY(i), position.getZ(i), point);
    position.setXYZ(i, point.x, point.y, point.z);
  }
  sphere.computeVertexNormals();
  const glass = { color: palette.text, fog: shared.uFog, face: 0.016, rim: 0.42, power: 2.6 };
  // The neck leans forward as it rises, and dissolves below the jaw.
  const neck = new CylinderGeometry(0.24, 0.3, 1.6, 48, 1, true)
    .rotateX(0.2)
    .translate(0, -1.25, -0.22);

  // Level contours and the profile down the middle trace the brow, nose and chin even where the
  // glass faces the camera and shows no rim.
  const levels = [-0.84, -0.66, -0.5, -0.32, -0.14, 0.06, 0.26, 0.46, 0.66, 0.84];
  const contours: Vector3[][] = levels.map((y) => {
    const ring = Math.sqrt(1 - y * y);
    return Array.from({ length: 129 }, (_, i) => {
      const angle = (i / 128) * 2 * Math.PI;
      return headPoint(ring * Math.cos(angle), y, ring * Math.sin(angle), new Vector3());
    });
  });
  contours.push(
    Array.from({ length: 129 }, (_, i) => {
      const angle = (i / 128) * 2 * Math.PI;
      return headPoint(0, Math.sin(angle), Math.cos(angle), new Vector3());
    }),
  );
  // The ear: an upright loop on the side of the head, its top tipped back.
  const ear = Array.from({ length: 49 }, (_, i) => {
    const angle = (i / 48) * 2 * Math.PI;
    const up = 0.17 * Math.sin(angle);
    const across = 0.1 * Math.cos(angle);
    return new Vector3(EAR.x + 0.03 * Math.cos(angle), EAR.y + up, EAR.z + across - 0.25 * up);
  });

  const line = { color: palette.text, fog: shared.uFog, resolution: shared.uResolution };
  return [
    new Mesh(sphere, createShellMaterial(glass)),
    new Mesh(neck, createShellMaterial({ ...glass, rim: 0.3, band: [-2, -1.55, -0.95, -0.7] })),
    alwaysDrawn(
      new Mesh(createPaths(contours), createPathMaterial({ ...line, width: 2, strength: 0.11 })),
    ),
    alwaysDrawn(
      new Mesh(createPaths([ear]), createPathMaterial({ ...line, width: 2.4, strength: 0.55 })),
    ),
  ];
}

// Stage 1: two voices -----------------------------------------------------------------------------

/** The attended voice: solid rings spreading from its talker. */
function createSolidRings(shared: Shared, color: Color, gain: IUniform<number>): Mesh {
  const segments = 96;
  return alwaysDrawn(
    new Mesh(
      createStripGeometry(RINGS, segments),
      createGlowMaterial(
        { ...shared, uColor: { value: color }, uGain: gain, uOpacity: { value: 1 } },
        /* glsl */ `
          ${VOICES}
          ${STRIP_VERTEX}
          ${FOG_VERTEX}
          uniform vec3 uColor;
          uniform float uGain;
          varying vec3 vColor;
          varying float vStrength;
          varying float vSide;

          vec3 ringPoint(float radius, float t) {
            float angle = t * 6.2831853;
            return ${vec3(ATTENDED)} + vec3(cos(angle), 0.0, sin(angle)) * radius;
          }

          void main() {
            float radius = ringRadius(position.z);
            float t = position.x;
            float h = ${float(0.5 / segments)};
            vec3 current = ringPoint(radius, t);
            gl_Position = stripPosition(
              ringPoint(radius, t - h), current, ringPoint(radius, t + h), position.y, 3.0);
            vStrength = uGain * ringStrength(0.0, radius);
            vColor = uColor;
            vSide = position.y;
            vFogDepth = -(modelViewMatrix * vec4(current, 1.0)).z;
          }
        `,
        STRIP_COLOR_FRAGMENT,
      ),
    ),
  );
}

/** The other voice: dotted rings spreading from its talker. */
function createDottedRings(shared: Shared, color: Color, gain: IUniform<number>): Points {
  const dots = 80;
  const data = new Float32Array(RINGS * dots * 3);
  for (let ring = 0; ring < RINGS; ring++) {
    for (let dot = 0; dot < dots; dot++) data.set([ring, dot, 0], (ring * dots + dot) * 3);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(data, 3));
  return alwaysDrawn(
    new Points(
      geometry,
      createGlowMaterial(
        { ...shared, uColor: { value: color }, uGain: gain, uOpacity: { value: 1 } },
        /* glsl */ `
          ${VOICES}
          ${POINT_SIZE}
          ${FOG_VERTEX}
          uniform vec3 uColor;
          uniform float uGain;
          varying vec3 vColor;
          varying float vStrength;

          void main() {
            float radius = ringRadius(position.x);
            // Alternate rings offset their dots by half a step, so the dots never line up.
            float angle = (position.y + 0.5 * mod(position.x, 2.0)) * ${float((2 * Math.PI) / dots)};
            vec3 point = ${vec3(OTHER)} + vec3(cos(angle), 0.0, sin(angle)) * radius;
            vec4 mvPosition = modelViewMatrix * vec4(point, 1.0);
            gl_PointSize = pointSize(0.07, -mvPosition.z, 2.0);
            vStrength = uGain * ringStrength(1.0, radius) * 1.3;
            vColor = uColor;
            vFogDepth = -mvPosition.z;
            gl_Position = projectionMatrix * mvPosition;
          }
        `,
        POINT_COLOR_FRAGMENT,
      ),
    ),
  );
}

/** The two talkers: glows that swell with each syllable of their voice. */
function createTalkers(
  shared: Shared,
  palette: Palette,
  attendedGain: IUniform<number>,
  otherGain: IUniform<number>,
): Points {
  const geometry = new BufferGeometry();
  geometry.setAttribute(
    'position',
    new BufferAttribute(new Float32Array([...ATTENDED.toArray(), ...OTHER.toArray()]), 3),
  );
  return alwaysDrawn(
    new Points(
      geometry,
      createGlowMaterial(
        {
          ...shared,
          uAttended: { value: palette.text },
          uOther: { value: palette.muted },
          uAttendedGain: attendedGain,
          uOtherGain: otherGain,
          uOpacity: { value: 1 },
        },
        /* glsl */ `
          ${VOICES}
          ${POINT_SIZE}
          ${FOG_VERTEX}
          uniform vec3 uAttended;
          uniform vec3 uOther;
          uniform float uAttendedGain;
          uniform float uOtherGain;
          varying vec3 vColor;
          varying float vStrength;

          void main() {
            float talker = float(gl_VertexID);
            float loud = voice(talker, uTime);
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = pointSize(0.42 + 0.22 * loud, -mvPosition.z, 10.0);
            vStrength = (0.5 + 0.5 * loud) * mix(uAttendedGain, uOtherGain, talker);
            vColor = mix(uAttended, uOther, talker);
            vFogDepth = -mvPosition.z;
            gl_Position = projectionMatrix * mvPosition;
          }
        `,
        POINT_COLOR_FRAGMENT,
      ),
    ),
  );
}

// Stage 2: attention ------------------------------------------------------------------------------

/**
 * The hearing region of the brain: amber points inside the head above the ear, firing in rhythm
 * with the attended voice as it arrives, in a soft glow that marks the region.
 */
function createCortex(
  shared: Shared,
  color: Color,
  opacity: IUniform<number>,
  random: () => number,
  count: number,
): Object3D[] {
  const haze = createGlowGeometry(1);
  haze.getAttribute('position').setXYZ(0, ...onHead(0.92, 0.36, -0.14, 0.86).toArray());
  haze.getAttribute('aGlow').setX(0, 0.6);
  const glow = createGlowPoints({
    color,
    fog: shared.uFog,
    size: 1,
    look: 'haze',
    scale: shared.uPointScale,
    opacity,
  });

  const positions: number[] = [];
  const sizes: number[] = [];
  for (let i = 0; i < count; i++) {
    const angle = random() * 2 * Math.PI;
    const reach = Math.sqrt(random());
    const point = onHead(
      0.92,
      0.36 + 0.13 * reach * Math.sin(angle),
      -0.14 + 0.36 * reach * Math.cos(angle),
      0.9 + 0.05 * random(),
    );
    positions.push(...point.toArray());
    sizes.push(0.07 + 0.04 * random());
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('aSize', new BufferAttribute(new Float32Array(sizes), 1));
  const neurons = alwaysDrawn(
    new Points(
      geometry,
      createGlowMaterial(
        { ...shared, uColor: { value: color }, uOpacity: opacity },
        /* glsl */ `
          ${VOICES}
          ${POINT_SIZE}
          ${FOG_VERTEX}
          attribute float aSize;
          uniform vec3 uColor;
          varying vec3 vColor;
          varying float vStrength;

          void main() {
            float heard = voice(0.0, uTime - ${float(DELAY)});
            // Each neuron fires now and then, far more often while the attended voice is loud.
            float fires = step(hash12(vec2(float(gl_VertexID), floor(uTime * 9.0))), 0.12 + 0.7 * heard);
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = pointSize(aSize, -mvPosition.z, 2.0);
            vStrength = 0.15 + 0.85 * fires * (0.4 + 0.6 * heard);
            vColor = uColor;
            vFogDepth = -mvPosition.z;
            gl_Position = projectionMatrix * mvPosition;
          }
        `,
        POINT_COLOR_FRAGMENT,
      ),
    ),
  );
  return [alwaysDrawn(new Points(haze, glow.material)), neurons];
}

// Stage 3: listening back -------------------------------------------------------------------------

/** The electrode near the ear: a short lead with four contacts, from a receiver behind the ear. */
function createElectrode(shared: Shared, color: Color, opacity: IUniform<number>): Object3D[] {
  const contacts = [0, 1, 2, 3].map((i) => onHead(0.9, 0.06 + 0.07 * i, -0.42 - 0.04 * i, 1.03));
  const lead = Array.from({ length: 24 }, (_, i) => {
    const t = i / 23;
    return onHead(
      MathUtils.lerp(0.9, 0.62, t),
      MathUtils.lerp(0.06, -0.3, t),
      MathUtils.lerp(-0.42, -0.95, t),
      1.03,
    );
  });
  const points = createGlowGeometry(contacts.length);
  const positions = points.getAttribute('position');
  contacts.forEach((contact, i) => positions.setXYZ(i, contact.x, contact.y, contact.z));
  const glow = createGlowPoints({
    color,
    fog: shared.uFog,
    size: 0.14,
    scale: shared.uPointScale,
    opacity,
  });
  const path = createPaths([[...contacts].reverse().concat(lead.slice(1))]);
  return [
    alwaysDrawn(
      new Mesh(
        path,
        createPathMaterial({
          color,
          fog: shared.uFog,
          resolution: shared.uResolution,
          width: 2.6,
          strength: 0.8,
          opacity,
        }),
      ),
    ),
    alwaysDrawn(new Points(points, glow.material)),
  ];
}

/**
 * The readout: a violet arc from the electrode to the attended talker, with pulses running out
 * along it, and a ring that closes around the talker as the readout appears (`level` 0 to 1).
 */
function createReadout(shared: Shared, color: Color, level: IUniform<number>): Object3D[] {
  const start = onHead(0.9, 0.2, -0.36, 1.14);
  const end = ATTENDED.clone().add(new Vector3(0, 0.32, 0));
  const control = start
    .clone()
    .lerp(end, 0.5)
    .add(new Vector3(0, 1.2, 0));
  const arc = Array.from({ length: 48 }, (_, i) => {
    const t = i / 47;
    return new Vector3()
      .addScaledVector(start, (1 - t) ** 2)
      .addScaledVector(control, 2 * t * (1 - t))
      .addScaledVector(end, t * t);
  });
  const uniforms = { ...shared, uColor: { value: color }, uOpacity: level, uLock: level };
  const segments = 96;
  return [
    alwaysDrawn(
      new Mesh(
        createPaths([arc]),
        createGlowMaterial(
          uniforms,
          /* glsl */ `
            ${PATH_STRIP_VERTEX}
            ${FOG_VERTEX}
            uniform vec3 uColor;
            uniform float uTime;
            varying vec3 vColor;
            varying float vStrength;
            varying float vSide;

            void main() {
              gl_Position = pathStripPosition(2.6);
              // Pulses run out from the electrode towards the talker.
              float pulse = fract(aDistance * 1.1 - uTime * 0.6);
              vStrength = 0.3 + 0.7 * exp(-pow((pulse - 0.5) * 6.0, 2.0));
              vColor = uColor;
              vSide = aSide;
              vFogDepth = -(modelViewMatrix * vec4(position, 1.0)).z;
            }
          `,
          STRIP_COLOR_FRAGMENT,
        ),
      ),
    ),
    alwaysDrawn(
      new Mesh(
        createStripGeometry(1, segments),
        createGlowMaterial(
          uniforms,
          /* glsl */ `
            ${STRIP_VERTEX}
            ${FOG_VERTEX}
            uniform vec3 uColor;
            uniform float uTime;
            uniform float uLock;
            varying vec3 vColor;
            varying float vStrength;
            varying float vSide;

            vec3 lockPoint(float t) {
              float angle = t * 6.2831853 + uTime * 0.25;
              return ${vec3(ATTENDED)} + vec3(cos(angle), 0.0, sin(angle)) * mix(1.5, 0.55, uLock);
            }

            void main() {
              float t = position.x;
              float h = ${float(0.5 / segments)};
              vec3 current = lockPoint(t);
              gl_Position = stripPosition(lockPoint(t - h), current, lockPoint(t + h), position.y, 2.6);
              // Three arcs with gaps between them, so the ring's slow turn shows.
              float arc = fract(t * 3.0);
              vStrength = smoothstep(0.0, 0.04, arc) * (1.0 - smoothstep(0.8, 0.84, arc));
              vColor = uColor;
              vSide = position.y;
              vFogDepth = -(modelViewMatrix * vec4(current, 1.0)).z;
            }
          `,
          STRIP_COLOR_FRAGMENT,
        ),
      ),
    ),
  ];
}

// Helpers -----------------------------------------------------------------------------------------

/** Several fixed paths, as one geometry so they draw in one call. */
function createPaths(paths: Vector3[][]): BufferGeometry {
  const strips = paths.map((path) =>
    createPathStrip(new Polyline(new Float32Array(path.flatMap((point) => point.toArray())))),
  );
  const merged = mergeGeometries(strips);
  for (const strip of strips) strip.dispose();
  return merged;
}
