import type { WebGLRenderer } from 'three';
import type { Palette } from './palette';

/** What the host (`mount.ts`) hands a scene when it starts. */
export interface SceneContext {
  /** Renderer bound to the scene's canvas, already sized, transparent, pixel ratio capped. */
  renderer: WebGLRenderer;
  /** Site colors, resolved from the CSS tokens (see `palette.ts`). */
  palette: Palette;
  /**
   * The visitor prefers reduced motion. The host then never loops: it calls `frame` only when
   * something changes (start, resize, scroll progress), always with the same `time`. Show a
   * meaningful still and skip pointer parallax.
   */
  reducedMotion: boolean;
  /** The drawing area is small (a phone, a narrow banner): draw fewer particles and lines. */
  compact: boolean;
  /** Initial size of the drawing area, in CSS pixels. */
  width: number;
  height: number;
}

/** A rectangle on the drawing area, in CSS pixels from its top-left corner. */
export interface SceneRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * A running scene. The host owns the render loop and calls these methods.
 *
 * A scene told in stages (see `SCENE_STAGES` in `../names.ts`) lists them at the top of its
 * module; with N stages, stage i covers scroll progress [i/N, (i+1)/N], and before any progress
 * arrives (a scene shown outside a scroll track) it rests on its final stage. `StageProgress` in
 * `lib/motion.ts` implements this.
 */
export interface SceneInstance {
  /**
   * Update to `time` (seconds of on-screen running since start) and draw one frame with
   * `renderer.render(...)`. `delta` is the seconds since the previous frame (0 for on-demand draws).
   */
  frame(time: number, delta: number): void;
  /**
   * Lay out for a `width` x `height` drawing area, in CSS pixels (the renderer is already
   * resized), framing the subject in `focus`: the area minus the room the page keeps clear with
   * `--scene-inset` (see `SceneCanvas.astro`), e.g. for text laid over the scene. Draw across the
   * whole area, so glows can spill past `focus`; `aimAtFocus` (`lib/camera.ts`) aims a
   * perspective camera this way. Called before the first frame and on every layout change.
   */
  resize(width: number, height: number, focus: SceneRect): void;
  /**
   * Scroll progress of the scene's track through the viewport, 0 → 1 (see `progressOf` in
   * `mount.ts`). Called before each frame for scenes mounted with `scroll`. Smooth it yourself
   * if the scene should ease rather than follow the scrollbar exactly.
   */
  setProgress?(progress: number): void;
  /** Pointer position over the window, normalized to [-1, 1] on both axes (y up). */
  setPointer?(x: number, y: number): void;
  /** Free everything the scene created on the GPU. The host disposes the renderer itself. */
  dispose(): void;
}

/** Every scene module default-exports a factory with this signature. */
export type SceneFactory = (context: SceneContext) => SceneInstance;
