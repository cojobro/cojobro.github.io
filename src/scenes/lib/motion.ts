import { MathUtils } from 'three';

/** How fast smoothed scroll progress closes on the scrollbar (1/s): settles in about a second. */
const PROGRESS_RATE = 3.5;
/** How fast the pointer parallax follows the pointer (1/s): a slow, floating response. */
const POINTER_RATE = 2;
/**
 * Half the width of a stage transition, in stages: around each boundary the view moves for
 * this much scroll on either side, and rests on the stage everywhere else.
 */
const STAGE_BLEND = 0.2;

/**
 * Scroll progress for a scene told in `count` stages, stage i owning progress [i/count, (i+1)/count].
 * It smooths the progress the host reports and turns it into a stage position that rests on each
 * stage through most of its range and eases across the boundaries, so captions always meet a
 * settled view and nothing jumps however fast the reader scrolls.
 */
export class StageProgress {
  /** Smoothed progress, 0 → 1. */
  progress = 1;
  /** 0 → count - 1: a whole number while a stage is settled, fractional during a transition. */
  position: number;
  private target = 1;
  private reported = false;

  /** `instant` (reduced motion) skips the smoothing: every report is shown as it is. */
  constructor(
    readonly count: number,
    private readonly instant: boolean,
  ) {
    // Until the host reports progress (a scene shown outside a scroll track), show the last stage.
    this.position = count - 1;
  }

  set(progress: number): void {
    this.target = MathUtils.clamp(progress, 0, 1);
    // The first report snaps: a scene should open where the reader is, not animate there.
    if (!this.reported || this.instant) this.progress = this.target;
    this.reported = true;
  }

  update(delta: number): void {
    this.progress = MathUtils.damp(this.progress, this.target, PROGRESS_RATE, delta);
    const scaled = this.progress * this.count;
    let position = 0;
    for (let boundary = 1; boundary < this.count; boundary++) {
      position += MathUtils.smoothstep(scaled, boundary - STAGE_BLEND, boundary + STAGE_BLEND);
    }
    this.position = position;
  }

  /** 1 while stage `index` is settled, falling to 0 one stage either side. */
  weight(index: number): number {
    return Math.max(0, 1 - Math.abs(this.position - index));
  }

  /** 0 before stage `index`, 1 from it on, easing across the boundary into it. */
  reached(index: number): number {
    return MathUtils.clamp(this.position - index + 1, 0, 1);
  }
}

/** The pointer, eased, for parallax. Stays centered when `enabled` is false (reduced motion). */
export class DampedPointer {
  x = 0;
  y = 0;
  private targetX = 0;
  private targetY = 0;

  constructor(private readonly enabled: boolean) {}

  set(x: number, y: number): void {
    if (!this.enabled) return;
    this.targetX = x;
    this.targetY = y;
  }

  update(delta: number): void {
    this.x = MathUtils.damp(this.x, this.targetX, POINTER_RATE, delta);
    this.y = MathUtils.damp(this.y, this.targetY, POINTER_RATE, delta);
  }
}
