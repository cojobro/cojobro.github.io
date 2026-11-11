/**
 * Starts the 3D scenes on a page. `SceneCanvas.astro` renders each scene's markup and calls
 * `mountScenes()`; pages and scenes never need to call into this file.
 *
 * For every `[data-scene]` element the host:
 * - downloads three.js and the scene's module only when the element nears the viewport;
 * - runs the render loop only while the element is visible and the tab is in front;
 * - draws on demand, frozen at `STILL_TIME`, when the visitor prefers reduced motion;
 * - feeds scroll progress (`data-scene-scroll`) and the pointer to scenes that accept them;
 * - tells the scene which part of the element to frame its subject in (`--scene-inset`);
 * - shows the element's fallback content when WebGL 2 is missing or the scene fails.
 *
 * `data-scene-state` on the element (pending → running | fallback) drives the CSS.
 */
import type { WebGLRenderer } from 'three';
import { isSceneName } from '../names';
import { sceneLoaders } from '../registry';
import type { SceneInstance, SceneRect } from './types';

/** The moment, in seconds, every scene is frozen at when the visitor prefers reduced motion. */
const STILL_TIME = 4;
/** Sharper than this costs GPU time for no visible gain. */
const MAX_PIXEL_RATIO = 2;
/** A drawing area whose shorter side is below this, in CSS pixels, is `compact` (phones). */
const COMPACT_SIZE = 640;
/** Start downloading a scene when it comes within this margin of the viewport. */
const PRELOAD_MARGIN = '50% 0px';
/** Longest step passed to `frame`, so a scene resuming after a pause does not jump. */
const MAX_DELTA = 0.1;

type SceneState = 'pending' | 'running' | 'fallback';

export function mountScenes(root: ParentNode = document): void {
  const hosts = root.querySelectorAll<HTMLElement>('[data-scene]:not([data-scene-state])');
  if (hosts.length === 0) return;

  const preload = new IntersectionObserver(
    (entries, observer) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.unobserve(entry.target);
        void startScene(entry.target as HTMLElement);
      }
    },
    { rootMargin: PRELOAD_MARGIN },
  );

  for (const host of hosts) {
    setState(host, 'pending');
    preload.observe(host);
  }
}

async function startScene(host: HTMLElement): Promise<void> {
  const name = host.dataset.scene;
  const canvas = host.querySelector('canvas');
  if (!canvas || !isSceneName(name) || !supportsWebGL2()) {
    setState(host, 'fallback');
    return;
  }

  let renderer: WebGLRenderer | undefined;
  try {
    // Dynamic imports keep three.js out of the page bundle until a scene needs it.
    const [{ WebGLRenderer }, { readPalette }, { default: createScene }] = await Promise.all([
      import('three'),
      import('./palette'),
      sceneLoaders[name](),
    ]);
    renderer = new WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
    const { width, height } = sizeOf(canvas);
    renderer.setSize(width, height, false);

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const scene = createScene({
      renderer,
      palette: readPalette(host),
      reducedMotion,
      compact: Math.min(width, height) < COMPACT_SIZE,
      width,
      height,
    });
    run(host, canvas, renderer, scene, reducedMotion);
    setState(host, 'running');
  } catch (error) {
    console.error(`The "${name}" scene could not start.`, error);
    renderer?.dispose();
    setState(host, 'fallback');
  }
}

function run(
  host: HTMLElement,
  canvas: HTMLCanvasElement,
  renderer: WebGLRenderer,
  scene: SceneInstance,
  reducedMotion: boolean,
): void {
  const track = trackOf(host);
  const scrollDriven = host.hasAttribute('data-scene-scroll') && scene.setProgress !== undefined;
  const lifetime = new AbortController();
  const listen = { signal: lifetime.signal, passive: true };

  let visible = false;
  let frameId = 0;
  let lastTimestamp = 0;
  let elapsed = 0;

  const updateProgress = () => {
    if (scrollDriven) scene.setProgress?.(progressOf(track));
  };

  /** A frame outside the loop: the reduced-motion still, or a redraw while paused. */
  const drawOnce = () => {
    updateProgress();
    scene.frame(reducedMotion ? STILL_TIME : elapsed, 0);
  };

  const tick = (timestamp: number) => {
    const delta = lastTimestamp ? Math.min((timestamp - lastTimestamp) / 1000, MAX_DELTA) : 0;
    lastTimestamp = timestamp;
    elapsed += delta;
    updateProgress();
    scene.frame(elapsed, delta);
    frameId = requestAnimationFrame(tick);
  };

  const start = () => {
    if (reducedMotion || frameId !== 0 || !visible || document.hidden) return;
    lastTimestamp = 0;
    frameId = requestAnimationFrame(tick);
  };

  const stop = () => {
    cancelAnimationFrame(frameId);
    frameId = 0;
  };

  const layout = () => {
    const { width, height } = sizeOf(canvas);
    renderer.setSize(width, height, false);
    scene.resize(width, height, focusOf(host, width, height));
  };

  // The host as well as the canvas: a new `--scene-inset` moves the focus, not the canvas.
  const resizeObserver = new ResizeObserver(() => {
    layout();
    if (frameId === 0) drawOnce();
  });
  resizeObserver.observe(host);
  resizeObserver.observe(canvas);
  layout();

  const visibilityObserver = new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? false;
    if (!visible) stop();
    // A still may be out of date: the reader can scroll while it is out of view.
    else if (reducedMotion) drawOnce();
    else start();
  });
  visibilityObserver.observe(host);

  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()), listen);

  if (reducedMotion) {
    if (scrollDriven) {
      const redraw = throttleToFrame(() => {
        if (visible) drawOnce();
      });
      window.addEventListener('scroll', redraw, listen);
    }
  } else if (scene.setPointer) {
    const setPointer = scene.setPointer.bind(scene);
    window.addEventListener(
      'pointermove',
      (event) =>
        setPointer(
          (event.clientX / window.innerWidth) * 2 - 1,
          1 - (event.clientY / window.innerHeight) * 2,
        ),
      listen,
    );
  }

  // A lost context (GPU reset, too many contexts) is not worth recovering on a static page.
  canvas.addEventListener(
    'webglcontextlost',
    () => {
      stop();
      lifetime.abort();
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
      scene.dispose();
      renderer.dispose();
      setState(host, 'fallback');
    },
    { signal: lifetime.signal },
  );

  drawOnce();
}

/**
 * The element whose scrolling drives the scene: the one named by `data-scene-track-id` (a track
 * beside the scene rather than around it), else the nearest `[data-scene-track]` ancestor, else
 * the scene's own element.
 */
function trackOf(host: HTMLElement): HTMLElement {
  const id = host.dataset.sceneTrackId;
  const named = id ? document.getElementById(id) : null;
  return named ?? host.closest<HTMLElement>('[data-scene-track]') ?? host;
}

/**
 * 0 → 1 as `track` scrolls through the viewport. A track taller than the viewport (a sticky
 * scrollytelling section) runs from its top meeting the viewport's top to its bottom meeting
 * the viewport's bottom; a shorter one from entering at the bottom to leaving at the top.
 */
function progressOf(track: HTMLElement): number {
  const { top, height } = track.getBoundingClientRect();
  const viewport = window.innerHeight;
  const progress =
    height > viewport ? -top / (height - viewport) : (viewport - top) / (viewport + height);
  return Math.min(1, Math.max(0, progress));
}

function sizeOf(element: Element): { width: number; height: number } {
  return { width: Math.max(1, element.clientWidth), height: Math.max(1, element.clientHeight) };
}

/** The element's area inside its padding (`--scene-inset`), on a `width` x `height` canvas. */
function focusOf(host: HTMLElement, width: number, height: number): SceneRect {
  const style = getComputedStyle(host);
  const top = parseFloat(style.paddingTop) || 0;
  const right = parseFloat(style.paddingRight) || 0;
  const bottom = parseFloat(style.paddingBottom) || 0;
  const left = parseFloat(style.paddingLeft) || 0;
  return {
    x: left,
    y: top,
    width: Math.max(1, width - left - right),
    height: Math.max(1, height - top - bottom),
  };
}

function setState(host: HTMLElement, state: SceneState): void {
  host.dataset.sceneState = state;
}

function throttleToFrame(callback: () => void): () => void {
  let pending = false;
  return () => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      pending = false;
      callback();
    });
  };
}

let webgl2Supported: boolean | undefined;

/** three.js (r163+) needs WebGL 2. Probed once per page, and the probe context released. */
function supportsWebGL2(): boolean {
  if (webgl2Supported === undefined) {
    try {
      const context = document.createElement('canvas').getContext('webgl2');
      webgl2Supported = context !== null;
      context?.getExtension('WEBGL_lose_context')?.loseContext();
    } catch {
      webgl2Supported = false;
    }
  }
  return webgl2Supported;
}
