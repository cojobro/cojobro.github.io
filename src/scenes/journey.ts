/**
 * How a decoder reads the nerve: speech travels through a cochlear implant into the auditory
 * nerve, and a decoder turns the nerve's answer back into sound. Every signal is synthesized
 * (see `lib/speech.ts`); nothing comes from recordings or patients.
 *
 * Stages, one per caption:
 *  1. Sound: speech arrives as a pressure wave. Wavefronts sweep towards the implant while the
 *     waveform traces the pressure.
 *  2. Pulses: the implant's processor, a prism, splits the sound into 22 channels of brief
 *     electrical pulses, one row per electrode (an electrodogram).
 *  3. Spikes: at the electrodes the current spreads into the nerve, and each fiber's spikes
 *     stream past as amber points (a spike raster).
 *  4. Decoding: a decoder, a violet lattice, turns the spikes back into sound.
 *  5. Comparison: the original settles above the reconstruction, aligned in time. The links
 *     between them glow violet where the speech was kept and stay grey where it was lost.
 *
 * Everything flows left to right at one speed, so a syllable can be followed through every form
 * it takes, and the camera travels along the pipeline with the scroll.
 */
import {
  BufferAttribute,
  BufferGeometry,
  type Color,
  CylinderGeometry,
  EdgesGeometry,
  Group,
  type IUniform,
  MathUtils,
  Mesh,
  PerspectiveCamera,
  Points,
  Scene,
  Vector2,
  Vector3,
} from 'three';
import { disposeObject } from './core/dispose';
import type { Palette } from './core/palette';
import type { SceneFactory } from './core/types';
import { aimAtFocus, fitDistance, narrowness, orbit, pointScale } from './lib/camera';
import { createDust } from './lib/dust';
import { POINT_COLOR_FRAGMENT, POINT_SIZE } from './lib/glow-points';
import {
  alwaysDrawn,
  createDepthFog,
  type DepthFog,
  float,
  FOG_FRAGMENT,
  FOG_VERTEX,
  HASH,
} from './lib/glsl';
import { createGlowMaterial, createShellMaterial } from './lib/materials';
import { DampedPointer, StageProgress } from './lib/motion';
import { createRandom } from './lib/random';
import { SPEECH } from './lib/speech';
import {
  addLineAttribute,
  createSegmentStrips,
  createStripGeometry,
  STRIP_COLOR_FRAGMENT,
  STRIP_FRAGMENT,
  STRIP_VERTEX,
} from './lib/strips';
import { SCENE_STAGES } from './names';

const STAGES = SCENE_STAGES.journey;
/** Electrodes, one electrodogram row each, as on a common implant. */
const CHANNELS = 22;
/** Scene units the flow advances per second, and the share of that kept while comparing. */
const FLOW_SPEED = 0.42;
const COMPARE_FLOW = 0.35;
/** Where the speech starts, so the first frames open in the middle of a phrase. */
const STREAM_START = 7;
/** One syllable's length along the flow, and the voice's periods per syllable: slow enough to see. */
const SYLLABLE = 1.5;
const CYCLES = 14;
/** Peak height of the waveforms. */
const AMPLITUDE = 0.72;
/** Heights spanned by the electrodogram's rows and by the raster's fibers. */
const ROWS_HEIGHT = 2.6;
const FIBERS_HEIGHT = 3;
/** How far above the reconstruction the original settles for the comparison. */
const COMPARE_LIFT = 2.1;
/** Camera swing, radians, across the pointer's full range. */
const PARALLAX = 0.06;

/** Where each part of the pipeline sits along x. */
const X = {
  source: -15.9,
  soundFrom: -15.5,
  soundTo: -8.7,
  prism: -8.45,
  pulsesFrom: -7.1,
  pulsesTo: -1.8,
  contacts: -1.35,
  spikesFrom: -0.85,
  spikesTo: 4.85,
  decoderFrom: 5.75,
  decoderTo: 8.55,
  outputFrom: 9.4,
  outputTo: 15,
} as const;

/**
 * What the camera frames at each stage: a center, an orbit, and the area that must fit. On
 * narrow views (see `narrowness`) the camera also leans further along the pipeline, rises, and
 * moves towards the near end (`lean`, `rise`, `shift`), so a station runs diagonally down the
 * tall view instead of shrinking to fit across it.
 */
interface Pose {
  x: number;
  y: number;
  yaw: number;
  pitch: number;
  width: number;
  height: number;
  lean: number;
  rise: number;
  shift: number;
}

const POSES: readonly Pose[] = [
  {
    x: -12.3,
    y: 0,
    yaw: -0.36,
    pitch: 0.12,
    width: 9,
    height: 4,
    lean: -0.5,
    rise: 0.2,
    shift: -0.9,
  },
  {
    x: -5.5,
    y: 0,
    yaw: -0.26,
    pitch: 0.14,
    width: 8.4,
    height: 4,
    lean: -0.55,
    rise: 0.2,
    shift: -1,
  },
  {
    x: 1.8,
    y: 0,
    yaw: -0.26,
    pitch: 0.12,
    width: 7.8,
    height: 4.2,
    lean: -0.55,
    rise: 0.2,
    shift: -0.8,
  },
  {
    x: 9.7,
    y: 0,
    yaw: -0.32,
    pitch: 0.14,
    width: 9,
    height: 4,
    lean: -0.5,
    rise: 0.2,
    shift: -0.4,
  },
  {
    x: 12.2,
    y: 1.05,
    yaw: -0.14,
    pitch: 0.07,
    width: 6.6,
    height: 5.4,
    lean: 0.1,
    rise: 0.02,
    shift: 0,
  },
];
/** Share of a pose's width that may fall outside the narrowest views (see `narrowness`). */
const NARROW_CROP = 0.3;

/** Uniforms every material shares; updating one updates them all. */
interface Shared {
  [name: string]: IUniform;
  /** How far the flow has advanced: content at x shows the speech at `uStream - x`. */
  uStream: IUniform<number>;
  uTime: IUniform<number>;
  uFog: DepthFog;
  uResolution: IUniform<Vector2>;
  uPointScale: IUniform<number>;
  uPixelRatio: IUniform<number>;
}

/** The signals at every step of the pipeline, all functions of a stream position q. */
const SIGNALS = /* glsl */ `
${HASH}
${SPEECH}
uniform float uStream;

float soundAt(float q) {
  return speech(q / ${float(SYLLABLE)}, 0.0, ${float(CYCLES)});
}

// The decoder keeps the rhythm and the voice, smears its timing a little, loses part of the
// quietest syllables and none of the consonant noise survives.
float decodedEnvelope(float u) {
  float smeared = 0.6 * speechEnvelope(u - 0.03, 0.0) + 0.4 * speechEnvelope(u - 0.1, 0.0);
  return smeared * mix(0.3, 1.0, smoothstep(0.45, 0.8, syllableGain(floor(u), 0.0)));
}

float decodedAt(float q) {
  float u = q / ${float(SYLLABLE)};
  return decodedEnvelope(u) * speechCarrier(u, 0.0, ${float(CYCLES)}, 0.35);
}

// Stimulation on channel k (0 = lowest pitch): two formant-like peaks that move from syllable to
// syllable over a faint floor across all channels, plus consonant noise on the high channels.
float channelLevel(float k, float q) {
  float u = q / ${float(SYLLABLE)};
  float n = floor(u);
  float low = (k - 2.0 - 6.0 * hash12(vec2(n, 41.0))) / 3.0;
  float high = (k - 11.0 - 8.0 * hash12(vec2(n, 59.0))) / 3.4;
  float spectrum = exp(-low * low) + 0.7 * exp(-high * high) + 0.12;
  return speechEnvelope(u, 0.0) * spectrum + speechBurst(u, 0.0) * smoothstep(12.0, 20.0, k);
}

float rowY(float k) {
  return (k / ${float(CHANNELS - 1)} - 0.5) * ${float(ROWS_HEIGHT)};
}
`;

const createJourney: SceneFactory = ({
  renderer,
  palette,
  reducedMotion,
  compact,
  width,
  height,
}) => {
  const scene = new Scene();
  const camera = new PerspectiveCamera(35, width / height, 0.1, 200);
  const fibers = compact ? 28 : 40;

  const shared: Shared = {
    uStream: { value: STREAM_START },
    uTime: { value: 0 },
    uFog: createDepthFog(),
    uResolution: { value: new Vector2(width, height) },
    uPointScale: { value: 1 },
    uPixelRatio: { value: renderer.getPixelRatio() },
  };
  /** How present each part is: the sound always, the rest as the story reaches it. */
  const always = { value: 1 };
  const pulses = { value: 1 };
  const spikes = { value: 1 };
  const decoding = { value: 1 };
  const reconstruction = { value: 1 };
  const comparing = { value: 1 };
  const lift = { value: COMPARE_LIFT };

  // Faint motes around the pipeline give depth as the camera travels. The dust fills a shell
  // around its own y axis; turned onto x, the shell runs the length of the pipeline.
  const dust = createDust({
    color: palette.muted,
    fog: shared.uFog,
    scale: shared.uPointScale,
    count: compact ? 140 : 280,
    random: createRandom(5),
    inner: 3.5,
    outer: 9,
    height: X.outputTo - X.source + 4,
  });
  dust.rotation.z = Math.PI / 2;
  dust.position.x = (X.source + X.outputTo) / 2;

  scene.add(
    dust,
    createWavefronts(shared, palette.muted, always),
    createVoice(shared, palette.text, always),
    createWave(shared, {
      signal: 'soundAt',
      from: X.soundFrom,
      to: X.soundTo,
      base: { value: 0 },
      color: palette.text,
      opacity: always,
      segments: compact ? 640 : 960,
    }),
    createProcessor(shared, palette, pulses),
    createPulses(shared, palette.signal, pulses, compact),
    createContacts(shared, palette, spikes, fibers),
    createSegments(shared, fiberSegments(fibers), palette.spike, 0.07, spikes),
    createSpikes(shared, palette.spike, spikes, fibers, compact),
    createDecoder(shared, palette, decoding, fibers),
    createWave(shared, {
      signal: 'decodedAt',
      from: X.outputFrom,
      to: X.outputTo,
      base: { value: 0 },
      color: palette.decode,
      opacity: reconstruction,
      segments: compact ? 560 : 800,
    }),
    createWave(shared, {
      signal: 'soundAt',
      from: X.outputFrom,
      to: X.outputTo,
      base: lift,
      color: palette.text,
      opacity: comparing,
      segments: compact ? 560 : 800,
    }),
    createComparison(shared, palette, comparing, lift),
  );

  const progress = new StageProgress(STAGES, reducedMotion);
  const pointer = new DampedPointer(!reducedMotion);
  const target = new Vector3();
  const centers = new Float32Array(STAGES);
  const yaws = new Float32Array(STAGES);
  const pitches = new Float32Array(STAGES);
  const distances = new Float32Array(STAGES);
  let stream = 0;

  return {
    frame(time, delta) {
      progress.update(delta);
      pointer.update(delta);
      const compare = progress.reached(4);

      // The flow slows while the two waveforms are compared; reduced motion freezes it.
      stream = reducedMotion
        ? time * FLOW_SPEED
        : stream + delta * FLOW_SPEED * MathUtils.lerp(1, COMPARE_FLOW, compare);
      shared.uStream.value = STREAM_START + stream;
      shared.uTime.value = time;
      dust.rotation.x = reducedMotion ? 0 : time * 0.01;

      // Parts not yet reached in the story wait as faint ghosts of themselves.
      pulses.value = 0.12 + 0.88 * progress.reached(1);
      spikes.value = 0.12 + 0.88 * progress.reached(2);
      reconstruction.value = 0.12 + 0.88 * progress.reached(3);
      // While comparing, the decoder steps back so the eye goes to the two waveforms.
      decoding.value = reconstruction.value - 0.65 * compare;
      comparing.value = compare;
      lift.value = COMPARE_LIFT + (1 - compare) * 0.8;

      const position = progress.position;
      const index = Math.min(Math.floor(position), STAGES - 2);
      const blend = position - index;
      const distance = MathUtils.lerp(distances[index], distances[index + 1], blend);
      const drift = reducedMotion ? 0 : Math.sin(time * 0.17);
      target.set(
        MathUtils.lerp(centers[index], centers[index + 1], blend),
        MathUtils.lerp(POSES[index].y, POSES[index + 1].y, blend),
        0,
      );
      orbit(
        camera,
        target,
        MathUtils.lerp(yaws[index], yaws[index + 1], blend) + pointer.x * PARALLAX + drift * 0.025,
        MathUtils.lerp(pitches[index], pitches[index + 1], blend) -
          pointer.y * PARALLAX * 0.6 +
          drift * 0.01,
        distance,
      );
      shared.uFog.value.set(distance * 0.8, distance * 2.2);

      renderer.render(scene, camera);
    },
    resize(newWidth, newHeight, focus) {
      const viewHeight = aimAtFocus(camera, newWidth, newHeight, focus);
      const narrow = narrowness(camera.aspect);
      POSES.forEach((pose, i) => {
        centers[i] = pose.x + narrow * pose.shift;
        yaws[i] = pose.yaw + narrow * pose.lean;
        pitches[i] = pose.pitch + narrow * pose.rise;
        const width = pose.width * (1 - NARROW_CROP * narrow) * Math.cos(narrow * pose.lean);
        distances[i] = fitDistance(camera, width, pose.height);
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

export default createJourney;

// Stage 1: sound ----------------------------------------------------------------------------------

interface WaveOptions {
  /** Which signal from SIGNALS the wave draws. */
  signal: 'soundAt' | 'decodedAt';
  from: number;
  to: number;
  /** Height of the wave's axis. */
  base: IUniform<number>;
  color: Color;
  opacity: IUniform<number>;
  segments: number;
}

/** A waveform: a glowing line over a faint fill down to its axis. */
function createWave(shared: Shared, options: WaveOptions): Group {
  const { signal, from, to, base, color, opacity, segments } = options;
  const geometry = createStripGeometry(1, segments);
  const uniforms = { ...shared, uBase: base, uColor: colorUniform(color), uOpacity: opacity };
  const header = /* glsl */ `
    ${SIGNALS}
    ${FOG_VERTEX}
    uniform float uBase;
    varying float vSide;
    varying float vT;

    float crest(float x) {
      return ${float(AMPLITUDE)} * ${signal}(uStream - x);
    }
  `;
  const fragmentHeader = /* glsl */ `
    ${FOG_FRAGMENT}
    uniform vec3 uColor;
    uniform float uOpacity;
    varying float vSide;
    varying float vT;

    float ends() {
      return smoothstep(0.0, 0.06, vT) * (1.0 - smoothstep(0.94, 1.0, vT));
    }
  `;

  const line = createGlowMaterial(
    uniforms,
    /* glsl */ `
      ${header}
      ${STRIP_VERTEX}

      vec3 wavePoint(float t) {
        float x = mix(${float(from)}, ${float(to)}, t);
        return vec3(x, uBase + crest(x), 0.0);
      }

      void main() {
        float t = position.x;
        float h = ${float(0.5 / segments)};
        vec3 current = wavePoint(t);
        gl_Position = stripPosition(wavePoint(t - h), current, wavePoint(t + h), position.y, 4.5);
        vSide = position.y;
        vT = t;
        vFogDepth = -(modelViewMatrix * vec4(current, 1.0)).z;
      }
    `,
    /* glsl */ `
      ${fragmentHeader}
      ${STRIP_FRAGMENT}

      void main() {
        gl_FragColor = vec4(uColor, stripGlow(vSide) * ends() * uOpacity * fogFade());
        #include <colorspace_fragment>
      }
    `,
  );

  const fill = createGlowMaterial(
    uniforms,
    /* glsl */ `
      ${header}

      void main() {
        float x = mix(${float(from)}, ${float(to)}, position.x);
        float y = uBase + (position.y > 0.0 ? crest(x) : 0.0);
        vec4 mvPosition = modelViewMatrix * vec4(x, y, 0.0, 1.0);
        vSide = position.y;
        vT = position.x;
        vFogDepth = -mvPosition.z;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    /* glsl */ `
      ${fragmentHeader}

      void main() {
        float strength = 0.1 * (0.3 + 0.35 * (vSide + 1.0));
        gl_FragColor = vec4(uColor, strength * ends() * uOpacity * fogFade());
        #include <colorspace_fragment>
      }
    `,
  );

  const group = new Group();
  group.add(alwaysDrawn(new Mesh(geometry, fill)), alwaysDrawn(new Mesh(geometry, line)));
  return group;
}

/** Wavefronts of the incoming sound: arcs that sweep from the voice to the prism, flattening. */
function createWavefronts(shared: Shared, color: Color, opacity: IUniform<number>): Mesh {
  const count = 26;
  const start = 0.25;
  const range = X.prism - 0.55 - X.source - start;
  const segments = 40;
  return alwaysDrawn(
    new Mesh(
      createStripGeometry(count, segments),
      createGlowMaterial(
        { ...shared, uColor: colorUniform(color), uOpacity: opacity },
        /* glsl */ `
          ${SIGNALS}
          ${STRIP_VERTEX}
          ${FOG_VERTEX}
          uniform vec3 uColor;
          varying vec3 vColor;
          varying float vStrength;
          varying float vSide;

          vec3 arcPoint(float travel, float t) {
            float radius = ${float(start)} + travel;
            float spread = asin(min(1.0, 1.15 / radius));
            float angle = mix(-spread, spread, t);
            return vec3(${float(X.source)} + radius * cos(angle), radius * sin(angle), 0.0);
          }

          void main() {
            float travel = mod(uStream + position.z * ${float(range / count)}, ${float(range)});
            float t = position.x;
            float h = ${float(0.5 / segments)};
            vec3 current = arcPoint(travel, t);
            gl_Position = stripPosition(
              arcPoint(travel, t - h), current, arcPoint(travel, t + h), position.y, 3.5);
            // A wavefront is as loud as the speech where it crosses the axis.
            float x = ${float(X.source + start)} + travel;
            float loud = speechEnvelope((uStream - x) / ${float(SYLLABLE)}, 0.0);
            float life = smoothstep(0.0, 0.5, travel) * (1.0 - smoothstep(${float(range - 0.9)}, ${float(range)}, travel));
            vStrength = (0.06 + 0.5 * loud) * life * sin(3.14159 * t);
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

/** The voice the speech comes from: a glow that swells with each syllable. */
function createVoice(shared: Shared, color: Color, opacity: IUniform<number>): Points {
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(new Float32Array([X.source, 0, 0]), 3));
  return alwaysDrawn(
    new Points(
      geometry,
      createGlowMaterial(
        { ...shared, uColor: colorUniform(color), uOpacity: opacity },
        /* glsl */ `
          ${SIGNALS}
          ${POINT_SIZE}
          ${FOG_VERTEX}
          uniform vec3 uColor;
          varying vec3 vColor;
          varying float vStrength;

          void main() {
            float loud = speechEnvelope((uStream - position.x) / ${float(SYLLABLE)}, 0.0);
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            gl_PointSize = pointSize(0.5 + 0.25 * loud, -mvPosition.z, 8.0);
            vStrength = 0.55 + 0.45 * loud;
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

// Stage 2: pulses ---------------------------------------------------------------------------------

/** The processor as a glass prism: sound enters, and 22 channels fan out into the rows. */
function createProcessor(shared: Shared, palette: Palette, opacity: IUniform<number>): Group {
  const group = new Group();
  // A cylinder with three sides is a triangular prism; stand it apex up along z.
  const prism = new CylinderGeometry(0.95, 0.95, 1.1, 3, 1)
    .rotateX(-Math.PI / 2)
    .translate(X.prism, -0.2375, 0);
  const faces = prism.toNonIndexed();
  faces.computeVertexNormals();
  const shell = createShellMaterial({
    color: palette.muted,
    fog: shared.uFog,
    face: 0.008,
    rim: 0.16,
    power: 3,
    opacity,
  });
  const edges = new EdgesGeometry(prism);
  group.add(
    new Mesh(faces, shell),
    createSegments(shared, edges.getAttribute('position').array, palette.text, 0.42, opacity),
  );
  prism.dispose();
  edges.dispose();

  const fan = 0.24;
  const segments = 84;
  group.add(
    alwaysDrawn(
      new Mesh(
        createStripGeometry(CHANNELS, segments),
        createGlowMaterial(
          {
            ...shared,
            uSound: colorUniform(palette.text),
            uSignal: colorUniform(palette.signal),
            uOpacity: opacity,
          },
          /* glsl */ `
            ${SIGNALS}
            ${STRIP_VERTEX}
            ${FOG_VERTEX}
            uniform vec3 uSound;
            uniform vec3 uSignal;
            varying vec3 vColor;
            varying float vStrength;
            varying float vSide;

            // Fans out from the prism's heart along a smooth curve, then runs straight along the
            // channel's row of the electrodogram.
            vec3 channelPoint(float k, float t) {
              vec3 row = vec3(${float(X.pulsesFrom)}, rowY(k), 0.0);
              if (t >= ${float(fan)}) {
                return vec3(mix(row.x, ${float(X.pulsesTo)}, (t - ${float(fan)}) / ${float(1 - fan)}), row.y, 0.0);
              }
              float s = t / ${float(fan)};
              float r = 1.0 - s;
              vec3 heart = vec3(${float(X.prism - 0.2)}, 0.0, 0.0);
              vec3 reach = vec3((row.x - heart.x) * 0.5, 0.0, 0.0);
              return r * r * r * heart + 3.0 * r * r * s * (heart + reach)
                + 3.0 * r * s * s * (row - reach) + s * s * s * row;
            }

            void main() {
              float k = position.z;
              float t = position.x;
              float h = ${float(0.5 / segments)};
              vec3 current = channelPoint(k, t);
              gl_Position = stripPosition(
                channelPoint(k, t - h), current, channelPoint(k, t + h), position.y, 3.0);
              float level = smoothstep(0.05, 0.7, channelLevel(k, uStream - current.x));
              float fanning = 1.0 - smoothstep(${float(fan * 0.75)}, ${float(fan)}, t);
              vColor = mix(uSound, uSignal, smoothstep(0.0, ${float(fan)}, t));
              vStrength = mix(0.07 + 0.08 * level, 0.18 + 0.7 * level, fanning)
                * smoothstep(0.0, 0.03, t) * (1.0 - smoothstep(0.97, 1.0, t));
              vSide = position.y;
              vFogDepth = -(modelViewMatrix * vec4(current, 1.0)).z;
            }
          `,
          STRIP_COLOR_FRAGMENT,
        ),
      ),
    ),
  );
  return group;
}

/** The electrodogram: brief pulses on every channel, as tall as the channel's level. */
function createPulses(
  shared: Shared,
  color: Color,
  opacity: IUniform<number>,
  compact: boolean,
): Mesh {
  const slots = compact ? 44 : 64;
  return alwaysDrawn(
    new Mesh(
      createStripGeometry(CHANNELS * slots, 1),
      createGlowMaterial(
        { ...shared, uColor: colorUniform(color), uOpacity: opacity },
        /* glsl */ `
          ${SIGNALS}
          ${STRIP_VERTEX}
          ${FOG_VERTEX}
          uniform vec3 uColor;
          varying vec3 vColor;
          varying float vStrength;
          varying float vSide;

          void main() {
            float row = floor(position.z / ${float(slots)});
            float slot = position.z - row * ${float(slots)};
            float span = ${float(X.pulsesTo - X.pulsesFrom)};
            float spacing = span / ${float(slots)};
            // Channels fire in turn, a fraction of a period apart, as implants interleave them.
            float travel = mod(uStream + (slot + row / ${float(CHANNELS)}) * spacing, span);
            float x = ${float(X.pulsesFrom)} + travel;
            float level = channelLevel(row, uStream - x);
            vec3 bottom = vec3(x, rowY(row), 0.0);
            float pulse = pow(clamp((level - 0.03) / 0.8, 0.0, 1.0), 0.7);
            vec3 top = bottom + vec3(0.0, 0.105 * pulse, 0.0);
            vec3 current = mix(bottom, top, position.x);
            gl_Position = stripPosition(bottom, current, top, position.y, 3.6);
            vStrength = (0.55 + 0.45 * level)
              * smoothstep(0.0, 0.35, travel) * (1.0 - smoothstep(span - 0.35, span, travel));
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

// Stage 3: spikes ---------------------------------------------------------------------------------

function fiberY(fiber: number, fibers: number): number {
  return (fiber / (fibers - 1) - 0.5) * FIBERS_HEIGHT;
}

/** The nerve's fibers, faint lines the spikes run along. */
function fiberSegments(fibers: number): number[] {
  const segments: number[] = [];
  for (let fiber = 0; fiber < fibers; fiber++) {
    const y = fiberY(fiber, fibers);
    segments.push(X.spikesFrom - 0.05, y, 0, X.spikesTo + 0.05, y, 0);
  }
  return segments;
}

function rowY(channel: number): number {
  return (channel / (CHANNELS - 1) - 0.5) * ROWS_HEIGHT;
}

/**
 * Where the implant meets the nerve: the electrode array's contacts, each flashing with its
 * channel, and the current spreading from each contact into the nearby fibers.
 */
function createContacts(
  shared: Shared,
  palette: Palette,
  opacity: IUniform<number>,
  fibers: number,
): Group {
  const contactX = X.contacts;
  const fiberX = X.spikesFrom - 0.05;
  const segments: number[] = [contactX, rowY(0) - 0.14, 0, contactX, rowY(CHANNELS - 1) + 0.14, 0];
  const info: number[] = [-1, 1];
  for (let channel = 0; channel < CHANNELS; channel++) {
    for (let fiber = 0; fiber < fibers; fiber++) {
      const gap = Math.abs(fiberY(fiber, fibers) - rowY(channel));
      if (gap > 0.45) continue;
      segments.push(contactX, rowY(channel), 0, fiberX, fiberY(fiber, fibers), 0);
      info.push(channel, (1 - gap / 0.45) ** 2);
    }
  }
  const spread = createSegmentStrips(segments);
  addLineAttribute(spread, 'aInfo', 2, info);

  const contacts = new BufferGeometry();
  const contactPositions = new Float32Array(CHANNELS * 3);
  for (let channel = 0; channel < CHANNELS; channel++) {
    contactPositions.set([contactX, rowY(channel), 0], channel * 3);
  }
  contacts.setAttribute('position', new BufferAttribute(contactPositions, 3));

  const uniforms = {
    ...shared,
    uSignal: colorUniform(palette.signal),
    uSpike: colorUniform(palette.spike),
    uOpacity: opacity,
  };
  const group = new Group();
  group.add(
    alwaysDrawn(
      new Mesh(
        spread,
        createGlowMaterial(
          uniforms,
          /* glsl */ `
            ${SIGNALS}
            ${STRIP_VERTEX}
            ${FOG_VERTEX}
            attribute vec3 aFrom;
            attribute vec3 aTo;
            attribute vec2 aInfo;
            uniform vec3 uSignal;
            uniform vec3 uSpike;
            varying vec3 vColor;
            varying float vStrength;
            varying float vSide;

            void main() {
              vec3 current = mix(aFrom, aTo, position.x);
              gl_Position = stripPosition(aFrom, current, aTo, position.y, 2.6);
              bool wire = aInfo.x < 0.0;
              float level = wire ? 0.0 : smoothstep(0.05, 0.7, channelLevel(aInfo.x, uStream - ${float(contactX)}));
              vStrength = wire ? 0.4 : aInfo.y * (0.06 + 0.8 * level);
              vColor = wire ? uSignal : mix(uSignal, uSpike, position.x);
              vSide = position.y;
              vFogDepth = -(modelViewMatrix * vec4(current, 1.0)).z;
            }
          `,
          STRIP_COLOR_FRAGMENT,
        ),
      ),
    ),
    alwaysDrawn(
      new Points(
        contacts,
        createGlowMaterial(
          uniforms,
          /* glsl */ `
            ${SIGNALS}
            ${POINT_SIZE}
            ${FOG_VERTEX}
            uniform vec3 uSignal;
            varying vec3 vColor;
            varying float vStrength;

            void main() {
              float channel = float(gl_VertexID);
              float level = smoothstep(0.05, 0.7, channelLevel(channel, uStream - position.x));
              vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
              gl_PointSize = pointSize(0.1 + 0.08 * level, -mvPosition.z, 3.0);
              vStrength = 0.45 + 0.55 * level;
              vColor = uSignal;
              vFogDepth = -mvPosition.z;
              gl_Position = projectionMatrix * mvPosition;
            }
          `,
          POINT_COLOR_FRAGMENT,
        ),
      ),
    ),
  );
  return group;
}

/** The spike raster: each fiber's spikes streaming past, more where its channels are loud. */
function createSpikes(
  shared: Shared,
  color: Color,
  opacity: IUniform<number>,
  fibers: number,
  compact: boolean,
): Points {
  const slots = compact ? 60 : 88;
  const geometry = new BufferGeometry();
  const data = new Float32Array(fibers * slots * 3);
  for (let fiber = 0; fiber < fibers; fiber++) {
    for (let slot = 0; slot < slots; slot++) data.set([slot, fiber, 0], (fiber * slots + slot) * 3);
  }
  geometry.setAttribute('position', new BufferAttribute(data, 3));
  return alwaysDrawn(
    new Points(
      geometry,
      createGlowMaterial(
        { ...shared, uColor: colorUniform(color), uOpacity: opacity },
        /* glsl */ `
          ${SIGNALS}
          ${POINT_SIZE}
          ${FOG_VERTEX}
          uniform vec3 uColor;
          varying vec3 vColor;
          varying float vStrength;

          void main() {
            float slot = position.x;
            float fiber = position.y;
            float span = ${float(X.spikesTo - X.spikesFrom)};
            float spacing = span / ${float(slots)};
            float travel = uStream + (slot + hash12(vec2(fiber, 3.0))) * spacing;
            // Each pass of a slot is a new chance to fire, at a slightly different moment.
            float pass = floor(travel / span);
            float x = ${float(X.spikesFrom)} + mod(travel, span)
              + (hash12(vec2(fiber * 13.0 + slot, pass)) - 0.5) * spacing * 0.9;
            float place = fiber / ${float(fibers - 1)} * ${float(CHANNELS - 1)};
            float drive = channelLevel(place, uStream - x);
            float chance = 0.015 + 0.8 * smoothstep(0.06, 0.6, drive);
            float fires = step(hash12(vec2(slot * 1.7 + pass * 31.0, fiber)), chance);
            float y = (fiber / ${float(fibers - 1)} - 0.5) * ${float(FIBERS_HEIGHT)};
            vec4 mvPosition = modelViewMatrix * vec4(x, y, 0.0, 1.0);
            float ends = smoothstep(${float(X.spikesFrom)}, ${float(X.spikesFrom + 0.4)}, x)
              * (1.0 - smoothstep(${float(X.spikesTo - 0.4)}, ${float(X.spikesTo)}, x));
            gl_PointSize = fires * pointSize(0.085, -mvPosition.z, 2.5);
            vStrength = fires * ends;
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

// Stage 4: decoding -------------------------------------------------------------------------------

/** Layers of the decoder's lattice: nodes up and down (y), nodes deep (z), and height. */
const LAYERS: readonly [number, number, number][] = [
  [5, 3, 2.5],
  [4, 3, 2],
  [3, 3, 1.5],
  [4, 3, 2],
  [5, 3, 2.5],
];

interface Lattice {
  /** x, y, z per node. */
  nodes: number[];
  /** Preferred channel and layer per node. */
  info: number[];
  /** First node of each layer, plus the total at the end. */
  starts: number[];
}

function buildLattice(): Lattice {
  const random = createRandom(7);
  const lattice: Lattice = { nodes: [], info: [], starts: [] };
  LAYERS.forEach(([rows, columns, height], layer) => {
    lattice.starts.push(lattice.info.length / 2);
    const x = MathUtils.lerp(X.decoderFrom, X.decoderTo, layer / (LAYERS.length - 1));
    const depth = 1.4 * (height / 2.5);
    for (let row = 0; row < rows; row++) {
      for (let column = 0; column < columns; column++) {
        lattice.nodes.push(
          x + (random() - 0.5) * 0.12,
          (row / (rows - 1) - 0.5) * height + (random() - 0.5) * 0.1,
          (column / (columns - 1) - 0.5) * depth + (random() - 0.5) * 0.1,
        );
        lattice.info.push(random() * (CHANNELS - 1), layer);
      }
    }
  });
  lattice.starts.push(lattice.info.length / 2);
  return lattice;
}

/** Activation of a decoder node: its channel early in the lattice, the speech itself late. */
const NODE_ACTIVITY = /* glsl */ `
float nodeActivity(float channel, float layer, float x) {
  float q = uStream - x;
  float heard = mix(channelLevel(channel, q), speechEnvelope(q / ${float(SYLLABLE)}, 0.0), layer / ${float(LAYERS.length - 1)});
  return smoothstep(0.05, 0.6, heard);
}
`;

/**
 * The decoder: a violet lattice of nodes and links, fed by the raster's fibers. Activity runs
 * through it with the speech and leaves towards the reconstructed waveform.
 */
function createDecoder(
  shared: Shared,
  palette: Palette,
  opacity: IUniform<number>,
  fibers: number,
): Group {
  const lattice = buildLattice();
  const random = createRandom(11);
  const node = (index: number) => lattice.nodes.slice(index * 3, index * 3 + 3);

  const segments: number[] = [];
  /** Per link: channel and layer of its source (-1 for feeds), and a seed. */
  const info: number[] = [];
  const inputStart = lattice.starts[0];
  const inputEnd = lattice.starts[1];
  // Each fiber feeds the input node nearest its height.
  for (let fiber = 0; fiber < fibers; fiber++) {
    const y = fiberY(fiber, fibers);
    let nearest = inputStart;
    for (let i = inputStart; i < inputEnd; i++) {
      if (Math.abs(node(i)[1] - y) < Math.abs(node(nearest)[1] - y)) nearest = i;
    }
    segments.push(X.spikesTo + 0.05, y, 0, ...node(nearest));
    info.push((fiber / (fibers - 1)) * (CHANNELS - 1), -1, random());
  }
  // Each node links to the two nearest nodes of the next layer and one more at random.
  for (let layer = 0; layer < LAYERS.length - 1; layer++) {
    const nextStart = lattice.starts[layer + 1];
    const nextEnd = lattice.starts[layer + 2];
    for (let i = lattice.starts[layer]; i < nextStart; i++) {
      const from = node(i);
      const targets = Array.from({ length: nextEnd - nextStart }, (_, j) => nextStart + j).sort(
        (a, b) => separation(node(a), from) - separation(node(b), from),
      );
      const picks = [
        targets[0],
        targets[1],
        targets[2 + Math.floor(random() * (targets.length - 2))],
      ];
      for (const target of picks) {
        if (target === undefined) continue;
        segments.push(...from, ...node(target));
        info.push(lattice.info[i * 2], layer, random());
      }
    }
  }
  // The last layer converges on the start of the reconstruction.
  const outputLayer = LAYERS.length - 1;
  for (let i = lattice.starts[outputLayer]; i < lattice.starts[LAYERS.length]; i++) {
    segments.push(...node(i), X.outputFrom, 0, 0);
    info.push(lattice.info[i * 2], outputLayer, random());
  }

  const links = createSegmentStrips(segments);
  addLineAttribute(links, 'aInfo', 3, info);
  const nodes = new BufferGeometry();
  nodes.setAttribute('position', new BufferAttribute(new Float32Array(lattice.nodes), 3));
  nodes.setAttribute('aInfo', new BufferAttribute(new Float32Array(lattice.info), 2));

  const uniforms = {
    ...shared,
    uSpike: colorUniform(palette.spike),
    uDecode: colorUniform(palette.decode),
    uOpacity: opacity,
  };
  const group = new Group();
  group.add(
    alwaysDrawn(
      new Mesh(
        links,
        createGlowMaterial(
          uniforms,
          /* glsl */ `
            ${SIGNALS}
            ${NODE_ACTIVITY}
            ${STRIP_VERTEX}
            ${FOG_VERTEX}
            attribute vec3 aFrom;
            attribute vec3 aTo;
            attribute vec3 aInfo;
            uniform vec3 uSpike;
            uniform vec3 uDecode;
            uniform float uTime;
            varying vec3 vColor;
            varying float vStrength;
            varying float vSide;

            void main() {
              vec3 current = mix(aFrom, aTo, position.x);
              gl_Position = stripPosition(aFrom, current, aTo, position.y, 2.8);
              bool feed = aInfo.y < 0.0;
              float activity = feed
                ? smoothstep(0.06, 0.6, channelLevel(aInfo.x, uStream - aFrom.x))
                : nodeActivity(aInfo.x, aInfo.y, aFrom.x);
              // A pulse of activity runs along every busy link.
              float pulse = fract(position.x - uTime * 0.8 + aInfo.z);
              pulse = exp(-pow((pulse - 0.5) * 7.0, 2.0));
              vStrength = (feed ? 0.05 : 0.09) + activity * (0.25 + 0.6 * pulse);
              vColor = feed ? mix(uSpike, uDecode, position.x) : uDecode;
              vSide = position.y;
              vFogDepth = -(modelViewMatrix * vec4(current, 1.0)).z;
            }
          `,
          STRIP_COLOR_FRAGMENT,
        ),
      ),
    ),
    alwaysDrawn(
      new Points(
        nodes,
        createGlowMaterial(
          uniforms,
          /* glsl */ `
            ${SIGNALS}
            ${NODE_ACTIVITY}
            ${POINT_SIZE}
            ${FOG_VERTEX}
            attribute vec2 aInfo;
            uniform vec3 uDecode;
            varying vec3 vColor;
            varying float vStrength;

            void main() {
              float activity = nodeActivity(aInfo.x, aInfo.y, position.x);
              vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
              gl_PointSize = pointSize(0.16 + 0.12 * activity, -mvPosition.z, 3.0);
              vStrength = 0.35 + 0.65 * activity;
              vColor = uDecode;
              vFogDepth = -mvPosition.z;
              gl_Position = projectionMatrix * mvPosition;
            }
          `,
          POINT_COLOR_FRAGMENT,
        ),
      ),
    ),
  );
  return group;
}

function separation(a: number[], b: number[]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

// Stage 5: comparison -----------------------------------------------------------------------------

/**
 * Links between the original (above) and the reconstruction (below) at regular moments:
 * violet where the reconstruction kept the speech, grey where it lost it.
 */
function createComparison(
  shared: Shared,
  palette: Palette,
  opacity: IUniform<number>,
  lift: IUniform<number>,
): Mesh {
  const count = 44;
  const segments: number[] = [];
  for (let i = 0; i < count; i++) {
    const x = MathUtils.lerp(X.outputFrom + 0.3, X.outputTo - 0.3, i / (count - 1));
    segments.push(x, 0, 0, x, 1, 0);
  }
  return alwaysDrawn(
    new Mesh(
      createSegmentStrips(segments),
      createGlowMaterial(
        {
          ...shared,
          uKept: colorUniform(palette.decode),
          uLost: colorUniform(palette.muted),
          uLift: lift,
          uOpacity: opacity,
        },
        /* glsl */ `
          ${SIGNALS}
          ${STRIP_VERTEX}
          ${FOG_VERTEX}
          attribute vec3 aFrom;
          attribute vec3 aTo;
          uniform vec3 uKept;
          uniform vec3 uLost;
          uniform float uLift;
          varying vec3 vColor;
          varying float vStrength;
          varying float vSide;

          void main() {
            float gap = 0.12;
            vec3 bottom = vec3(aFrom.x, ${float(AMPLITUDE)} * 0.75 + gap, 0.0);
            vec3 top = vec3(aFrom.x, uLift - ${float(AMPLITUDE)} * 0.75 - gap, 0.0);
            vec3 current = mix(bottom, top, position.x);
            gl_Position = stripPosition(bottom, current, top, position.y, 3.0);
            float u = (uStream - aFrom.x) / ${float(SYLLABLE)};
            float heard = speechEnvelope(u, 0.0);
            float kept = clamp(decodedEnvelope(u) / max(heard, 0.001), 0.0, 1.0);
            float keeps = smoothstep(0.35, 0.8, kept);
            vColor = mix(uLost, uKept, keeps);
            vStrength = smoothstep(0.04, 0.35, heard) * mix(0.22, 0.85, keeps);
            vSide = position.y;
            vFogDepth = -(modelViewMatrix * vec4(current, 1.0)).z;
          }
        `,
        STRIP_COLOR_FRAGMENT,
      ),
    ),
  );
}

// Helpers -----------------------------------------------------------------------------------------

function colorUniform(color: Color): IUniform<Color> {
  return { value: color };
}

/** Straight glowing segments of one color: glass edges, wires. */
function createSegments(
  shared: Shared,
  segments: ArrayLike<number>,
  color: Color,
  strength: number,
  opacity: IUniform<number>,
): Mesh {
  return alwaysDrawn(
    new Mesh(
      createSegmentStrips(segments),
      createGlowMaterial(
        { ...shared, uColor: colorUniform(color), uOpacity: opacity },
        /* glsl */ `
          ${STRIP_VERTEX}
          ${FOG_VERTEX}
          attribute vec3 aFrom;
          attribute vec3 aTo;
          uniform vec3 uColor;
          varying vec3 vColor;
          varying float vStrength;
          varying float vSide;

          void main() {
            vec3 current = mix(aFrom, aTo, position.x);
            gl_Position = stripPosition(aFrom, current, aTo, position.y, 3.0);
            vColor = uColor;
            vStrength = ${float(strength)};
            vSide = position.y;
            vFogDepth = -(modelViewMatrix * vec4(current, 1.0)).z;
          }
        `,
        STRIP_COLOR_FRAGMENT,
      ),
    ),
  );
}
