/** Framing a perspective camera: field of view, distance, orbit and the page's focus area. */
import { MathUtils, type PerspectiveCamera, type Vector3 } from 'three';
import type { SceneRect } from '../core/types';

/** Vertical field of view, degrees, on landscape drawing areas. */
const LANDSCAPE_FOV = 35;
/** Vertical field of view on the narrowest portrait areas (phones), so subjects fit across. */
const PORTRAIT_FOV = 50;

/**
 * Aims `camera` at `focus`, the part of a `width` x `height` drawing area the subject should fill
 * (see `SceneInstance.resize`). The view still covers the whole area, but its center, aspect and
 * field of view become the focus rectangle's, so `fitDistance` frames the subject inside it and
 * glows can spill past it. Returns the height, in CSS pixels, that the field of view spans: pass
 * it to `pointScale`.
 */
export function aimAtFocus(
  camera: PerspectiveCamera,
  width: number,
  height: number,
  focus: SceneRect,
): number {
  camera.aspect = focus.width / focus.height;
  camera.fov = fieldOfView(camera.aspect);
  const whole = focus.x === 0 && focus.y === 0 && focus.width === width && focus.height === height;
  if (whole) camera.clearViewOffset();
  else camera.setViewOffset(focus.width, focus.height, -focus.x, -focus.y, width, height);
  camera.updateProjectionMatrix();
  return focus.height;
}

/** Vertical field of view for an aspect ratio (width / height), widening on portrait areas. */
function fieldOfView(aspect: number): number {
  return aspect >= 1
    ? LANDSCAPE_FOV
    : MathUtils.lerp(PORTRAIT_FOV, LANDSCAPE_FOV, MathUtils.clamp((aspect - 0.45) / 0.55, 0, 1));
}

/**
 * How narrow a view of this aspect ratio (width / height) is: 0 for landscape views (1.25 and
 * wider), rising to 1 for phone-shaped ones (0.45). Scenes ease their framing between the two.
 */
export function narrowness(aspect: number): number {
  return MathUtils.clamp((1.25 - aspect) / 0.8, 0, 1);
}

/**
 * Distance from which a `width` x `height` area (world units) facing the camera fills its view,
 * with `margin` to spare. Use it to frame a subject for any aspect ratio.
 */
export function fitDistance(
  camera: PerspectiveCamera,
  width: number,
  height: number,
  margin = 1.08,
): number {
  const tanHalf = Math.tan(MathUtils.degToRad(camera.fov) / 2);
  return margin * Math.max(height / (2 * tanHalf), width / (2 * tanHalf * camera.aspect));
}

/**
 * Places `camera` on an orbit around `target` and points it there. `yaw` turns about +y
 * (0 = on the +z side, positive towards +x); `pitch` rises above the horizon. Radians.
 */
export function orbit(
  camera: PerspectiveCamera,
  target: Vector3,
  yaw: number,
  pitch: number,
  distance: number,
): void {
  const flat = distance * Math.cos(pitch);
  camera.position.set(
    target.x + flat * Math.sin(yaw),
    target.y + distance * Math.sin(pitch),
    target.z + flat * Math.cos(yaw),
  );
  camera.lookAt(target);
}

/**
 * Pixels per world unit at distance 1 from `camera`, for a drawing area `height` CSS pixels
 * tall at `pixelRatio`. Points sized in world units divide this by their depth.
 */
export function pointScale(camera: PerspectiveCamera, height: number, pixelRatio: number): number {
  return (height * pixelRatio) / (2 * Math.tan(MathUtils.degToRad(camera.fov) / 2));
}
