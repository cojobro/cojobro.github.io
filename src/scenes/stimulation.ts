/**
 * Same implant, different nerves: why one program does not fit everyone, told in three stages.
 * Scroll progress from i/3 to (i+1)/3 shows stage i + 1 below; without scroll progress the scene
 * rests on stage 3.
 *
 * 1. Two people, the same implant. Each cochlea is unrolled into a ribbon from base (left) to
 *    apex, its surviving nerve fibers a fringe of strands with gaps in different places, and the
 *    same 22 contacts along both.
 * 2. A standard program. Every contact sends a broad, soft cloud of current: it spills over the
 *    gaps and into its neighbors', and few fibers answer.
 * 3. A personalized program. Narrow current, steered onto each person's surviving fibers, which
 *    flash as they fire.
 *
 * Colors keep the site's legend: signal (cyan) is current, spike (amber) is firing. Where ribbons
 * laid across would be small (phones, narrow columns), they stand upright, side by side.
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
import { createDust } from './lib/dust';
import { createGlowGeometry, createGlowPoints } from './lib/glow-points';
import {
  alwaysDrawn,
  createDepthFog,
  type DepthFog,
  float,
  FOG_FRAGMENT,
  FOG_VERTEX,
} from './lib/glsl';
import { createGlowMaterial } from './lib/materials';
import { DampedPointer, StageProgress } from './lib/motion';
import { Polyline } from './lib/polyline';
import { createRandom, shuffledIndices } from './lib/random';
import { createPathMaterial, createPathStrip } from './lib/strips';
import { SCENE_STAGES } from './names';

const STAGES = SCENE_STAGES.stimulation;
const CONTACTS = 22;
/** Length of each ribbon, base to apex, and half the distance between the two. */
const LENGTH = 7;
const SEPARATION = 0.95;
/** The area to frame with the ribbons laid across: their length, and both with their fibers. */
const FRAME_ACROSS = LENGTH + 0.9;
const FRAME_DOWN = 2 * SEPARATION + 1.5;
/**
 * Below this many CSS pixels per scene unit, ribbons laid across are too small to read, and they
 * stand upright instead if that draws them larger.
 */
const MIN_ACROSS_SCALE = 70;
/** Where the first and last contacts sit along a ribbon. */
const FIRST_CONTACT = -3.15;
const LAST_CONTACT = 3.15;
/** Every channel pulses once per period, in a shuffled order. */
const PERIOD = 1.3;

/** A stretch of a ribbon where fibers are lost. */
interface Gap {
  center: number;
  width: number;
  /** 1 = no fiber survives at its middle. */
  depth: number;
}

/** Each person's nerve: the gaps differ, the implant does not. */
const PEOPLE: Gap[][] = [
  [
    { center: -1.45, width: 0.55, depth: 0.98 },
    { center: 1.55, width: 0.32, depth: 0.96 },
  ],
  [
    { center: -2.45, width: 0.34, depth: 0.96 },
    { center: 0.3, width: 0.62, depth: 0.98 },
    { center: 2.6, width: 0.38, depth: 0.92 },
  ],
];

/** Spread and strength of a channel's current: broad and weak in stage 2, narrow and strong in 3. */
const STANDARD = { spread: 0.5, strength: 0.52, size: 1.7 };
const FOCUSED = { spread: 0.2, strength: 1.4, size: 0.6 };

interface Shared {
  palette: Palette;
  fog: DepthFog;
  scale: { value: number };
  resolution: Vector2;
  random: () => number;
  reducedMotion: boolean;
}

interface FrameState {
  time: number;
  /** 0 → 1 as the standard program comes on (stage 2), then as it is personalized (stage 3). */
  program: number;
  personal: number;
}

interface Layer {
  object: Object3D;
  update(state: FrameState): void;
}

const createStimulation: SceneFactory = ({
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
    random: createRandom(31),
    reducedMotion,
  };
  const scene = new Scene();
  const camera = new PerspectiveCamera(35, width / height, 0.1, 60);
  const stages = new StageProgress(STAGES, reducedMotion);
  const pointer = new DampedPointer(!reducedMotion);

  // Everything but the dust stands upright on narrow views (see `resize`).
  const layout = new Group();
  const layers: Layer[] = PEOPLE.map((gaps, person) =>
    createPerson(shared, gaps, person === 0 ? SEPARATION : -SEPARATION),
  );
  for (const layer of layers) layout.add(layer.object);
  const dust = createDust({
    color: palette.muted,
    fog: shared.fog,
    scale: shared.scale,
    count: compact ? 90 : 180,
    random: shared.random,
    inner: 3,
    outer: 7,
    height: 7,
  });
  scene.add(layout, dust);

  const state: FrameState = { time: 0, program: 0, personal: 0 };
  const target = new Vector3();
  let upright = false;

  return {
    frame(time, delta) {
      stages.update(delta);
      pointer.update(delta);
      state.time = time;
      state.program = stages.reached(1);
      state.personal = stages.reached(2);
      for (let i = 0; i < layers.length; i++) layers[i].update(state);

      const yaw = Math.sin(time * 0.1) * 0.06 + pointer.x * 0.06;
      const pitch = 0.16 - pointer.y * 0.04;
      const distance = upright
        ? fitDistance(camera, FRAME_DOWN, FRAME_ACROSS, 1.04)
        : fitDistance(camera, FRAME_ACROSS, FRAME_DOWN, 1.04);
      orbit(camera, target.set(0, upright ? 0 : 0.2, 0), yaw, pitch, distance);
      shared.fog.value.set(distance - 2, distance + 5);
      dust.rotation.y = time * 0.01;
      renderer.render(scene, camera);
    },
    resize(newWidth, newHeight, focus) {
      const spanned = aimAtFocus(camera, newWidth, newHeight, focus);
      shared.scale.value = pointScale(camera, spanned, renderer.getPixelRatio());
      shared.resolution.set(newWidth, newHeight);
      const acrossScale = Math.min(focus.width / FRAME_ACROSS, focus.height / FRAME_DOWN);
      const uprightScale = Math.min(focus.width / FRAME_DOWN, focus.height / FRAME_ACROSS);
      upright = acrossScale < MIN_ACROSS_SCALE && uprightScale > acrossScale;
      // Upright: the base at the bottom, the first person on the left.
      layout.rotation.z = upright ? Math.PI / 2 : 0;
      layout.position.x = upright ? 0.35 : 0;
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

export default createStimulation;

/** Share of fibers surviving at `x` along a ribbon, given its gaps. */
function survival(gaps: Gap[], x: number): number {
  let alive = 1;
  for (const { center, width, depth } of gaps) {
    const d = (x - center) / width;
    alive -= depth * Math.exp(-d * d);
  }
  return MathUtils.clamp(alive, 0.02, 1);
}

/** Width of a ribbon at `x`: the unrolled membrane widens from base to apex. */
function ribbonWidth(x: number): number {
  return MathUtils.lerp(0.3, 0.48, (x + LENGTH / 2) / LENGTH);
}

/**
 * A point on a ribbon centered at height `offset`: `across` runs from -1 (lower edge) to 1 (upper
 * edge). The ribbon arcs gently and its ends curl away from the viewer.
 */
function ribbonPoint(x: number, across: number, offset: number, target: Vector3): Vector3 {
  const t = (2 * x) / LENGTH;
  return target.set(x, offset + 0.12 * t * t + (across * ribbonWidth(x)) / 2, -0.55 * t * t);
}

function contactX(k: number): number {
  return MathUtils.lerp(FIRST_CONTACT, LAST_CONTACT, k / (CONTACTS - 1));
}

/**
 * One person: their ribbon and fibers, the implant along it, and the current it sends. The
 * fibers fire when the current reaching them beats their threshold.
 */
function createPerson(shared: Shared, gaps: Gap[], offset: number): Layer {
  const { palette, fog, scale, resolution, random, reducedMotion } = shared;
  const group = new Group();
  group.add(createRibbon(shared, offset));

  // Fibers: a fringe of strands along the upper edge, as dense as survival there.
  const strands: { x: number; threshold: number }[] = [];
  const candidates = 300;
  for (let i = 0; i < candidates; i++) {
    const x = MathUtils.lerp(-LENGTH / 2 + 0.12, LENGTH / 2 - 0.12, (i + random()) / candidates);
    if (random() < survival(gaps, x)) strands.push({ x, threshold: 0.42 + 0.55 * random() });
  }
  const strandPoints = 3;
  const strandVertices = (strandPoints - 1) * 2;
  const positions = new Float32Array(strands.length * strandVertices * 3);
  const fire = new Float32Array(strands.length * strandVertices);
  const tipGeometry = createGlowGeometry(strands.length);
  const tips = tipGeometry.getAttribute('position');
  const tipGlow = tipGeometry.getAttribute('aGlow');
  const root = new Vector3();
  const point = new Vector3();
  const previous = new Vector3();
  strands.forEach(({ x }, s) => {
    ribbonPoint(x, 1, offset, root);
    const length = 0.42 + 0.22 * random();
    const lean = (random() - 0.5) * 0.12;
    previous.copy(root);
    for (let i = 1; i < strandPoints; i++) {
      const t = i / (strandPoints - 1);
      point.set(root.x + lean * t * t, root.y + 0.04 + length * t, root.z + 0.06 * t);
      const vertex = s * strandVertices + (i - 1) * 2;
      previous.toArray(positions, vertex * 3);
      point.toArray(positions, (vertex + 1) * 3);
      previous.copy(point);
    }
    tips.setXYZ(s, point.x, point.y, point.z);
  });
  const fiberGeometry = new BufferGeometry();
  fiberGeometry.setAttribute('position', new BufferAttribute(positions, 3));
  const fireAttribute = new BufferAttribute(fire, 1);
  fiberGeometry.setAttribute('aFire', fireAttribute);
  const fibers = new LineSegments(
    fiberGeometry,
    createGlowMaterial(
      { uRest: { value: palette.text }, uFire: { value: palette.spike }, uFog: fog },
      /* glsl */ `
        ${FOG_VERTEX}
        attribute float aFire;
        varying float vFire;

        void main() {
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          vFogDepth = -mvPosition.z;
          vFire = aFire;
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      /* glsl */ `
        ${FOG_FRAGMENT}
        uniform vec3 uRest;
        uniform vec3 uFire;
        varying float vFire;

        void main() {
          vec3 color = mix(uRest, uFire, min(vFire, 1.0));
          gl_FragColor = vec4(color, mix(0.42, 1.0, min(vFire, 1.0)) * fogFade());
          #include <colorspace_fragment>
        }
      `,
    ),
  );
  const flashes = createGlowPoints({ color: palette.spike, fog, size: 0.22, scale });
  const flashPoints = new Points(tipGeometry, flashes.material);
  group.add(fibers, flashPoints);

  // The implant: a carrier from beyond the base, with the 22 contacts.
  const carrierPoints = new Float32Array(60 * 3);
  for (let i = 0; i < 60; i++) {
    const x = MathUtils.lerp(-LENGTH / 2 - 0.8, LAST_CONTACT + 0.12, i / 59);
    ribbonPoint(x, -0.15, offset, point).toArray(carrierPoints, i * 3);
  }
  const carrier = alwaysDrawn(
    new Mesh(
      createPathStrip(new Polyline(carrierPoints)),
      createPathMaterial({
        color: palette.muted,
        fog,
        resolution: { value: resolution },
        width: 2.6,
        strength: 0.6,
        fadeIn: 0.8,
      }),
    ),
  );

  const contactGeometry = createGlowGeometry(CONTACTS);
  const contactPositions = contactGeometry.getAttribute('position');
  const contactGlow = contactGeometry.getAttribute('aGlow');
  for (let k = 0; k < CONTACTS; k++) {
    ribbonPoint(contactX(k), -0.15, offset, point);
    contactPositions.setXYZ(k, point.x, point.y, point.z);
  }
  const contacts = createGlowPoints({ color: palette.signal, fog, size: 0.15, scale });
  group.add(carrier, new Points(contactGeometry, contacts.material));

  // Current: one cloud per contact. Personalized, a cloud moves to a cluster of surviving fibers
  // and narrows; clouds with no cluster to serve go dark.
  const targets = focusTargets(gaps);
  const assigned = assignContacts(targets);
  const cloudGeometry = createGlowGeometry(CONTACTS);
  const cloudPositions = cloudGeometry.getAttribute('position');
  const cloudSizes = cloudGeometry.getAttribute('aSize');
  const cloudGlow = cloudGeometry.getAttribute('aGlow');
  const clouds = createGlowPoints({ color: palette.signal, fog, size: 1, look: 'haze', scale });
  group.add(alwaysDrawn(new Points(cloudGeometry, clouds.material)));

  const phases = shuffledIndices(CONTACTS, random);
  const channelX = new Float32Array(CONTACTS);
  const channelSpread = new Float32Array(CONTACTS);
  const channelStrength = new Float32Array(CONTACTS);
  const channelPulse = new Float32Array(CONTACTS);

  return {
    object: group,
    update({ time, program, personal }) {
      const spread = MathUtils.lerp(STANDARD.spread, FOCUSED.spread, personal);
      const strength = MathUtils.lerp(STANDARD.strength, FOCUSED.strength, personal);
      const size = MathUtils.lerp(STANDARD.size, FOCUSED.size, personal);
      for (let k = 0; k < CONTACTS; k++) {
        const target = assigned[k];
        const used = target === undefined ? 1 - personal : 1;
        const x =
          target === undefined ? contactX(k) : MathUtils.lerp(contactX(k), target, personal);
        const age = MathUtils.euclideanModulo(time - (phases[k] / CONTACTS) * PERIOD, PERIOD);
        // A still frame shows every channel mid-pulse rather than whichever moment it caught.
        const pulse = reducedMotion ? 0.6 : Math.exp(-age / 0.22);
        channelX[k] = x;
        channelSpread[k] = spread;
        channelStrength[k] = strength * used * program;
        channelPulse[k] = pulse;

        ribbonPoint(x, MathUtils.lerp(0.35, 1.1, personal), offset, point);
        cloudPositions.setXYZ(k, point.x, point.y, point.z);
        cloudSizes.setX(k, size);
        cloudGlow.setX(
          k,
          program * used * MathUtils.lerp(0.22 + 0.22 * pulse, 0.55 + 0.8 * pulse, personal),
        );
        contactGlow.setX(k, 0.8 + 0.9 * pulse * program * used);
      }

      // A fiber the current reaches glows while the program runs and flares with each pulse.
      for (let s = 0; s < strands.length; s++) {
        const { x, threshold } = strands[s];
        let flash = 0;
        for (let k = 0; k < CONTACTS; k++) {
          const d = (x - channelX[k]) / channelSpread[k];
          if (channelStrength[k] * Math.exp(-d * d) > threshold) {
            flash = Math.max(flash, 0.45 + 0.55 * channelPulse[k]);
          }
        }
        fire.fill(flash, s * strandVertices, (s + 1) * strandVertices);
        tipGlow.setX(s, flash);
      }

      cloudPositions.needsUpdate = true;
      cloudSizes.needsUpdate = true;
      cloudGlow.needsUpdate = true;
      contactGlow.needsUpdate = true;
      fireAttribute.needsUpdate = true;
      tipGlow.needsUpdate = true;
    },
  };
}

/**
 * Where a personalized program aims: the middles of runs of surviving fibers, at least a little
 * apart, reached by steering current between contacts.
 */
function focusTargets(gaps: Gap[]): number[] {
  const targets: number[] = [];
  const step = 0.05;
  const spacing = 0.6;
  let runStart: number | undefined;
  for (let x = FIRST_CONTACT; x <= LAST_CONTACT + step / 2; x += step) {
    const alive = survival(gaps, x) > 0.7;
    if (alive && runStart === undefined) runStart = x;
    if ((!alive || x + step > LAST_CONTACT + step / 2) && runStart !== undefined) {
      const runEnd = x;
      const count = Math.max(1, Math.round((runEnd - runStart) / spacing));
      for (let i = 0; i < count; i++) {
        targets.push(MathUtils.lerp(runStart, runEnd, (i + 0.5) / count));
      }
      runStart = undefined;
    }
  }
  return targets;
}

/** For each contact, the target it is steered to (the nearest still free), if any. */
function assignContacts(targets: number[]): (number | undefined)[] {
  const assigned: (number | undefined)[] = Array.from({ length: CONTACTS }, () => undefined);
  for (const target of targets) {
    let best = -1;
    for (let k = 0; k < CONTACTS; k++) {
      if (assigned[k] !== undefined) continue;
      if (best < 0 || Math.abs(contactX(k) - target) < Math.abs(contactX(best) - target)) best = k;
    }
    if (best >= 0) assigned[best] = target;
  }
  return assigned;
}

/** The ribbon: a faint band with luminous edges. */
function createRibbon({ palette, fog }: Shared, offset: number): Mesh {
  const along = 120;
  const across = 8;
  const positions = new Float32Array((along + 1) * (across + 1) * 3);
  const sides = new Float32Array((along + 1) * (across + 1));
  const indices = new Uint16Array(along * across * 6);
  const point = new Vector3();
  for (let i = 0; i <= along; i++) {
    const x = MathUtils.lerp(-LENGTH / 2, LENGTH / 2, i / along);
    for (let j = 0; j <= across; j++) {
      const vertex = i * (across + 1) + j;
      const side = (j / across) * 2 - 1;
      ribbonPoint(x, side, offset, point).toArray(positions, vertex * 3);
      sides[vertex] = side;
      if (i < along && j < across) {
        const next = vertex + across + 1;
        indices.set([vertex, next, vertex + 1, vertex + 1, next, next + 1], (i * across + j) * 6);
      }
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  geometry.setAttribute('aSide', new BufferAttribute(sides, 1));
  geometry.setIndex(new BufferAttribute(indices, 1));
  return new Mesh(
    geometry,
    createGlowMaterial(
      { uColor: { value: palette.text }, uFog: fog },
      /* glsl */ `
        ${FOG_VERTEX}
        attribute float aSide;
        varying float vSide;
        varying float vX;

        void main() {
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          vFogDepth = -mvPosition.z;
          vSide = aSide;
          vX = position.x;
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      /* glsl */ `
        ${FOG_FRAGMENT}
        uniform vec3 uColor;
        varying float vSide;
        varying float vX;

        void main() {
          float edge = pow(abs(vSide), 14.0);
          float ends = smoothstep(${float(LENGTH / 2)}, ${float(LENGTH / 2 - 0.4)}, abs(vX));
          gl_FragColor = vec4(uColor, (0.05 + 0.55 * edge) * ends * fogFade());
          #include <colorspace_fragment>
        }
      `,
    ),
  );
}
