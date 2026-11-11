/**
 * The picture on the home page's instrument: a cochlea seen from above, its nerve fibers, the
 * implant's electrode array, and the nerve answering sound in real time. The ear and the implant
 * are described in `model.ts`; the sound comes from an `Engine` once the visitor presses play.
 *
 * Three canvases share the screen:
 *
 * - `base`: what does not move (the spiral, resting fibers, the array, the scales), redrawn only
 *   when the layout or the settings change;
 * - `live`: what the sound sets off (current at the contacts, fibers lighting, spikes running
 *   inward), drawn every frame in added light over a fading copy of the frame before, so
 *   everything leaves a short afterglow, like the phosphor of an oscilloscope tube;
 * - `strip`: a scrolling record along the foot of the screen, each channel's stimulation over
 *   time (an electrodogram) or, for the healthy ear, the sound's spectrum.
 *
 * Colors come from the screen's CSS tokens, the same legend as the research scenes: `signal` is
 * electrical stimulation, `spike` is nerve firing.
 */
import type { Engine, ListeningMode } from './engine';
import {
  ARRAY_APICAL_PLACE,
  ARRAY_OFFSET,
  ELECTRODE_COUNT,
  ELECTRODE_PLACES,
  arrayPosition,
  channelsFor,
  greenwoodHz,
  placeOfHz,
  reach,
  seededRandom,
  SPIRAL_MARGIN,
  spiralAt,
  spreadMmOf,
  survivalAt,
  turnGap,
  type Channel,
  type Survival,
} from './model';

export interface DisplaySettings {
  mode: ListeningMode;
  electrodes: number;
  spread: number;
  survival: Survival;
}

type Rgb = readonly [number, number, number];

/** Nerve fibers drawn on a roomy screen and on a small one. */
const FIBERS = 1500;
const FIBERS_COMPACT = 850;
/** A drawing area narrower than this, in CSS pixels, is small. */
const COMPACT_WIDTH = 640;
/** Sharper than this costs time for no visible gain. */
const MAX_PIXEL_RATIO = 2;
/** Seconds for the afterglow to fall to about a third. */
const AFTERGLOW = 0.09;
/** Spikes a fully excited fiber fires per second (far fewer than a real one; each is visible). */
const SPIKE_RATE = 11;
/** Spikes a resting fiber fires per second on its own. */
const SPONTANEOUS_RATE = 0.22;
/** Seconds a spike takes to run down its fiber. */
const SPIKE_SECONDS = 0.34;
const MAX_SPIKES = 2600;
/** The pitches marked along the spiral, in Hz. */
const PITCH_MARKS = [8000, 4000, 2000, 1000, 500, 250, 125];
/** The strip scrolls this many CSS pixels a second. */
const STRIP_SPEED = 84;
/** Rows of the strip's spectrum for the healthy ear, and the band they cover. */
const SPECTRUM_ROWS = 40;
const SPECTRUM_LOW_HZ = 90;
const SPECTRUM_HIGH_HZ = 9000;
/** Brightness steps the lit fibers are drawn in (one stroke per step). */
const GLOW_STEPS = 6;

export class Display {
  private readonly host: HTMLElement;
  private readonly focus: HTMLElement;
  private readonly base: CanvasRenderingContext2D;
  private readonly live: CanvasRenderingContext2D;
  private readonly strip: CanvasRenderingContext2D;
  private readonly reducedMotion: boolean;
  private readonly colors: { text: Rgb; signal: Rgb; spike: Rgb };
  private readonly sprites: { signal: HTMLCanvasElement; spike: HTMLCanvasElement };
  /** The screen's own color, nearly opaque, for patches behind figures; and its mono font. */
  private readonly backing: string;
  private readonly monoFont: string;

  private settings: DisplaySettings;
  private channels: Channel[];
  private engine: Engine | null = null;

  // Layout: the spiral's center and scale on the canvas, in CSS pixels.
  private ratio = 1;
  private width = 1;
  private height = 1;
  private centerX = 0;
  private centerY = 0;
  private scale = 1;

  // Fibers, as parallel arrays. Positions are in spiral units.
  private count = 0;
  private place = new Float32Array(0);
  private rootX = new Float32Array(0);
  private rootY = new Float32Array(0);
  private tipX = new Float32Array(0);
  private tipY = new Float32Array(0);
  private chance = new Float32Array(0); // a fiber survives where survival exceeds its chance
  private pitch = new Float32Array(0); // the frequency a healthy ear hears at the fiber
  private alive = new Uint8Array(0);
  private excitation = new Float32Array(0);
  /** For each fiber, the channels whose current reaches it: [channel, weight] pairs. */
  private reachIndex = new Int32Array(0);
  private reachOffsets = new Int32Array(0);
  private reachWeights = new Float32Array(0);

  // Spikes in flight: which fiber, and how far along it (0 → 1).
  private spikeFiber = new Int32Array(MAX_SPIKES);
  private spikeProgress = new Float32Array(MAX_SPIKES);
  private spikes = 0;

  private frameId = 0;
  private lastTimestamp = 0;
  private stripCarry = 0;
  private visible = false;
  private brush: { place: number } | null = null;

  constructor(
    host: HTMLElement,
    canvases: { base: HTMLCanvasElement; live: HTMLCanvasElement; strip: HTMLCanvasElement },
    focus: HTMLElement,
    settings: DisplaySettings,
  ) {
    this.host = host;
    this.focus = focus;
    this.base = canvases.base.getContext('2d')!;
    this.live = canvases.live.getContext('2d')!;
    this.strip = canvases.strip.getContext('2d')!;
    this.settings = settings;
    this.channels = channelsFor(settings.electrodes);
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const style = getComputedStyle(host);
    const token = (name: string) => parseHex(style.getPropertyValue(name));
    this.colors = {
      text: token('--color-text'),
      signal: token('--color-signal'),
      spike: token('--color-spike'),
    };
    this.sprites = { signal: glowSprite(this.colors.signal), spike: glowSprite(this.colors.spike) };
    this.backing = rgba(token('--color-bg'), 0.82);
    this.monoFont = style.getPropertyValue('--font-mono') || 'monospace';

    new ResizeObserver(() => this.layout()).observe(host);
    new IntersectionObserver(([entry]) => {
      this.visible = entry?.isIntersecting ?? false;
      this.visible ? this.start() : this.stop();
    }).observe(host);
    document.addEventListener('visibilitychange', () =>
      document.hidden ? this.stop() : this.start(),
    );
    this.layout();
  }

  /** The sound to draw from; without one the nerve only idles. */
  setEngine(engine: Engine): void {
    this.engine = engine;
  }

  /** Call when the sound starts or stops, so a display at rest starts drawing again. */
  wake(): void {
    this.start();
    if (this.frameId === 0) this.drawStill();
  }

  /** Applies new settings and redraws what they change. */
  update(settings: DisplaySettings): void {
    const { mode, electrodes } = this.settings;
    const restart = settings.mode !== mode || settings.electrodes !== electrodes;
    this.settings = settings;
    this.channels = channelsFor(settings.electrodes);
    if (restart) {
      // A different picture: spikes in flight and the record so far belong to the old one.
      this.spikes = 0;
      this.clearStrip();
    }
    this.refresh();
  }

  /** Shows (or, with `null`, hides) the ring that marks where the pointer would thin the nerve. */
  setBrush(place: number | null): void {
    this.brush = place === null ? null : { place };
    if (this.frameId === 0) this.drawStill();
  }

  /**
   * The place along the spiral nearest a point of the window, or `null` when the point is not
   * near the nerve. Used to thin the nerve under the pointer.
   */
  placeAt(clientX: number, clientY: number): number | null {
    const bounds = this.host.getBoundingClientRect();
    const x = (clientX - bounds.left - this.centerX) / this.scale;
    const y = (clientY - bounds.top - this.centerY) / this.scale;
    let nearest = -1;
    let best = Infinity;
    for (let i = 0; i < this.count; i++) {
      // Measured from the middle of the fiber, so the whole comb of the nerve is the target.
      const dx = (this.rootX[i]! + this.tipX[i]!) / 2 - x;
      const dy = (this.rootY[i]! + this.tipY[i]!) / 2 - y;
      const distance = dx * dx + dy * dy;
      if (distance < best) {
        best = distance;
        nearest = i;
      }
    }
    if (nearest < 0) return null;
    const place = this.place[nearest]!;
    return Math.sqrt(best) < Math.max(0.09, turnGap(place) * 0.42) ? place : null;
  }

  // ── Layout ───────────────────────────────────────────────────────────────────────────────

  private layout(): void {
    const width = Math.max(1, this.host.clientWidth);
    const height = Math.max(1, this.host.clientHeight);
    this.ratio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
    this.width = width;
    this.height = height;
    for (const context of [this.base, this.live]) {
      context.canvas.width = Math.round(width * this.ratio);
      context.canvas.height = Math.round(height * this.ratio);
    }
    const strip = this.strip.canvas;
    strip.width = Math.round(Math.max(1, strip.clientWidth) * this.ratio);
    strip.height = Math.round(Math.max(1, strip.clientHeight) * this.ratio);

    // The spiral is framed in the focus element, which the page's CSS places clear of the text.
    const hostBounds = this.host.getBoundingClientRect();
    const focus = this.focus.getBoundingClientRect();
    const extent = 1 + SPIRAL_MARGIN;
    this.scale = Math.max(40, Math.min(focus.width, focus.height) / (2 * extent));
    this.centerX = focus.left - hostBounds.left + focus.width / 2;
    this.centerY = focus.top - hostBounds.top + focus.height / 2;

    this.buildFibers(width < COMPACT_WIDTH ? FIBERS_COMPACT : FIBERS);
    this.refresh();
  }

  /** Lays the fibers along the spiral, evenly by length, each running inward to its cell body. */
  private buildFibers(count: number): void {
    if (count === this.count) return;
    this.count = count;
    this.place = new Float32Array(count);
    this.rootX = new Float32Array(count);
    this.rootY = new Float32Array(count);
    this.tipX = new Float32Array(count);
    this.tipY = new Float32Array(count);
    this.chance = new Float32Array(count);
    this.pitch = new Float32Array(count);
    this.alive = new Uint8Array(count);
    this.excitation = new Float32Array(count);
    const random = seededRandom(22);
    for (let i = 0; i < count; i++) {
      const place = (i + 0.5) / count;
      const { x, y, inwardX, inwardY } = spiralAt(place);
      const length = turnGap(place) * (0.3 + 0.14 * random());
      // A slight lean, so the comb of fibers looks grown rather than ruled.
      const lean = (random() - 0.5) * 0.16;
      this.place[i] = place;
      this.rootX[i] = x;
      this.rootY[i] = y;
      this.tipX[i] = x + (inwardX - inwardY * lean) * length;
      this.tipY[i] = y + (inwardY + inwardX * lean) * length;
      this.chance[i] = 0.02 + 0.96 * random();
      this.pitch[i] = greenwoodHz(place);
    }
  }

  /** Recomputes which fibers live and what reaches them, then redraws the still layers. */
  private refresh(): void {
    const { mode, spread, survival } = this.settings;
    const implant = mode === 'implant';
    const spreadMm = spreadMmOf(spread);
    const offsets = new Int32Array(this.count + 1);
    const index: number[] = [];
    const weights: number[] = [];
    for (let i = 0; i < this.count; i++) {
      const place = this.place[i]!;
      // The healthy ear is drawn whole; the implanted ear has the nerve that was set.
      this.alive[i] = !implant || this.chance[i]! < survivalAt(survival, place) ? 1 : 0;
      if (implant && this.alive[i]) {
        const position = arrayPosition(place);
        this.channels.forEach((channel, c) => {
          const weight = reach(position - channel.position, channel.halfTerritory, spreadMm);
          if (weight > 0.03) {
            index.push(c);
            weights.push(weight);
          }
        });
      }
      offsets[i + 1] = index.length;
    }
    this.reachOffsets = offsets;
    this.reachIndex = Int32Array.from(index);
    this.reachWeights = Float32Array.from(weights);
    this.drawBase();
    if (this.frameId === 0) this.drawStill();
  }

  // ── The still layer ──────────────────────────────────────────────────────────────────────

  private drawBase(): void {
    const context = this.base;
    const { text } = this.colors;
    const implant = this.settings.mode === 'implant';
    context.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
    context.clearRect(0, 0, this.width, this.height);
    context.lineCap = 'round';
    context.lineJoin = 'round';

    // A polar scale around the spiral: rings, and a tick every 15 degrees.
    context.lineWidth = 1;
    context.setLineDash([1, 6]);
    context.strokeStyle = rgba(text, 0.1);
    for (const ring of [0.4, 0.8, 1.2]) {
      context.beginPath();
      context.arc(this.centerX, this.centerY, ring * this.scale, 0, 2 * Math.PI);
      context.stroke();
    }
    context.setLineDash([]);
    context.beginPath();
    for (let degrees = 0; degrees < 360; degrees += 15) {
      const angle = (degrees * Math.PI) / 180;
      const inner = (degrees % 90 === 0 ? 1.155 : 1.18) * this.scale;
      const outer = 1.2 * this.scale;
      context.moveTo(
        this.centerX + inner * Math.cos(angle),
        this.centerY + inner * Math.sin(angle),
      );
      context.lineTo(
        this.centerX + outer * Math.cos(angle),
        this.centerY + outer * Math.sin(angle),
      );
    }
    context.strokeStyle = rgba(text, 0.22);
    context.stroke();

    // Fibers at rest, and a stub where one is missing.
    context.beginPath();
    for (let i = 0; i < this.count; i++) {
      if (!this.alive[i]) continue;
      context.moveTo(this.px(this.rootX[i]!), this.py(this.rootY[i]!));
      context.lineTo(this.px(this.tipX[i]!), this.py(this.tipY[i]!));
    }
    context.strokeStyle = rgba(text, 0.15);
    context.stroke();

    context.fillStyle = rgba(text, 0.34);
    for (let i = 0; i < this.count; i++) {
      if (!this.alive[i]) continue;
      context.fillRect(this.px(this.tipX[i]!) - 0.75, this.py(this.tipY[i]!) - 0.75, 1.5, 1.5);
    }

    // The spiral itself: the membrane the fibers hang from.
    context.beginPath();
    for (let step = 0; step <= 480; step++) {
      const { x, y } = spiralAt(step / 480);
      if (step === 0) context.moveTo(this.px(x), this.py(y));
      else context.lineTo(this.px(x), this.py(y));
    }
    context.strokeStyle = rgba(text, implant ? 0.3 : 0.42);
    context.lineWidth = 1.25;
    context.stroke();

    if (implant) this.drawArray(context);
    this.drawPitchMarks(context);
  }

  /** Ticks along the outside of the spiral at the pitches a healthy ear hears there. */
  private drawPitchMarks(context: CanvasRenderingContext2D): void {
    const { text } = this.colors;
    const size = this.scale < 150 ? 9 : 10;
    context.font = `500 ${size}px ${this.monoFont}`;
    context.textBaseline = 'middle';
    context.textAlign = 'center';
    context.lineWidth = 1;
    for (const hz of PITCH_MARKS) {
      const { x, y, inwardX, inwardY } = spiralAt(placeOfHz(hz));
      // Outward of the spiral, past the array, in the clear part of the gap between turns.
      const near = ARRAY_OFFSET + 0.03;
      const far = near + 0.03;
      context.beginPath();
      context.moveTo(this.px(x - inwardX * near), this.py(y - inwardY * near));
      context.lineTo(this.px(x - inwardX * far), this.py(y - inwardY * far));
      context.strokeStyle = rgba(text, 0.5);
      context.stroke();

      const label = hz >= 1000 ? `${hz / 1000}k` : `${hz}`;
      const width = context.measureText(label).width + 8;
      const labelX = this.px(x - inwardX * far) - inwardX * (width / 2 + 2);
      const labelY = this.py(y - inwardY * far) - inwardY * (size / 2 + 4);
      // A patch of the screen's own color keeps the figure legible over the fibers behind it.
      context.fillStyle = this.backing;
      context.fillRect(labelX - width / 2, labelY - size / 2 - 2, width, size + 4);
      context.fillStyle = rgba(text, 0.62);
      context.fillText(label, labelX, labelY + 0.5);
    }
  }

  /** The electrode array: its carrier threaded along the outside of the spiral, and its contacts. */
  private drawArray(context: CanvasRenderingContext2D): void {
    const { text, signal } = this.colors;
    const at = (place: number) => {
      const { x, y, inwardX, inwardY } = spiralAt(place);
      return { x: this.px(x - inwardX * ARRAY_OFFSET), y: this.py(y - inwardY * ARRAY_OFFSET) };
    };

    // The carrier, from its tip back to the base, then the lead running off the way it came in.
    const tip = ARRAY_APICAL_PLACE + 0.012;
    const path = new Path2D();
    for (let step = 0; step <= 160; step++) {
      const { x, y } = at(tip * (1 - step / 160));
      if (step === 0) path.moveTo(x, y);
      else path.lineTo(x, y);
    }
    const start = at(0);
    const before = at(0.004);
    const length = Math.hypot(start.x - before.x, start.y - before.y) || 1;
    const leadX = (start.x - before.x) / length;
    const leadY = (start.y - before.y) / length;
    const reachPx = 0.42 * this.scale;
    path.quadraticCurveTo(
      start.x + leadX * reachPx * 0.5,
      start.y + leadY * reachPx * 0.5,
      start.x + leadX * reachPx * 0.8 + leadY * reachPx * 0.25,
      start.y + leadY * reachPx * 0.8 - leadX * reachPx * 0.25,
    );
    context.strokeStyle = rgba(text, 0.09);
    context.lineWidth = Math.max(5, this.scale * 0.034);
    context.stroke(path);
    context.strokeStyle = rgba(text, 0.5);
    context.lineWidth = 1;
    context.stroke(path);

    // Contacts: lit a little when their channel is switched on, hollow when it is off.
    const active = new Set(this.channels.map((channel) => channel.electrode));
    const radius = Math.max(1.8, this.scale * 0.0125);
    ELECTRODE_PLACES.forEach((place, electrode) => {
      const { x, y } = at(place);
      context.beginPath();
      context.arc(x, y, radius, 0, 2 * Math.PI);
      if (active.has(electrode)) {
        context.fillStyle = rgba(signal, 0.6);
        context.fill();
      } else {
        context.strokeStyle = rgba(text, 0.4);
        context.lineWidth = 1;
        context.stroke();
      }
    });

    // The end contacts carry their clinical numbers, set just beyond each end of the array.
    context.fillStyle = rgba(signal, 0.9);
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    const ends = [
      { place: ELECTRODE_PLACES[0]! - 0.02, out: ARRAY_OFFSET + 0.075, label: 'E1' },
      {
        place: ELECTRODE_PLACES[ELECTRODE_COUNT - 1]! + 0.03,
        out: ARRAY_OFFSET,
        label: `E${ELECTRODE_COUNT}`,
      },
    ];
    for (const { place, out, label } of ends) {
      const { x, y, inwardX, inwardY } = spiralAt(Math.max(0, place));
      context.fillText(label, this.px(x - inwardX * out), this.py(y - inwardY * out));
    }
  }

  // ── The live layer ───────────────────────────────────────────────────────────────────────

  private start(): void {
    if (this.frameId !== 0 || !this.visible || document.hidden) return;
    // With reduced motion the nerve does not idle: there is nothing to draw until sound plays.
    if (this.reducedMotion && !this.engine?.playing) return;
    this.lastTimestamp = 0;
    this.frameId = requestAnimationFrame(this.tick);
  }

  private stop(): void {
    cancelAnimationFrame(this.frameId);
    this.frameId = 0;
  }

  private tick = (timestamp: number): void => {
    const delta = this.lastTimestamp ? Math.min((timestamp - this.lastTimestamp) / 1000, 0.1) : 0;
    this.lastTimestamp = timestamp;
    this.draw(delta);
    if (this.reducedMotion && !this.engine?.playing) {
      this.frameId = 0;
      this.drawStill();
      return;
    }
    this.frameId = requestAnimationFrame(this.tick);
  };

  /** One frame without a running loop: the resting picture. */
  private drawStill(): void {
    this.live.setTransform(1, 0, 0, 1, 0, 0);
    this.live.clearRect(0, 0, this.live.canvas.width, this.live.canvas.height);
    this.draw(0);
  }

  private draw(delta: number): void {
    const context = this.live;
    const playing = this.engine?.playing ?? false;
    const implant = this.settings.mode === 'implant';
    context.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);

    // Afterglow: last frame's light fades instead of vanishing.
    context.globalCompositeOperation = 'destination-out';
    context.fillStyle = `rgba(0, 0, 0, ${delta > 0 ? 1 - Math.exp(-delta / AFTERGLOW) : 1})`;
    context.fillRect(0, 0, this.width, this.height);
    context.globalCompositeOperation = 'lighter';

    this.excite(playing, implant);
    this.drawGlow(context);
    if (!this.reducedMotion) {
      this.fire(delta, playing);
      this.drawSpikes(context, delta);
    }
    if (implant) this.drawCurrent(context, playing);
    this.drawBrush(context);
    if (playing) this.drawStrip(delta, implant);
  }

  /** How strongly each fiber is driven right now, 0 to 1. */
  private excite(playing: boolean, implant: boolean): void {
    const excitation = this.excitation;
    const engine = this.engine;
    if (!playing || !engine) {
      excitation.fill(0);
      return;
    }
    if (implant) {
      const levels = engine.levels;
      for (let i = 0; i < this.count; i++) {
        let sum = 0;
        for (let r = this.reachOffsets[i]!; r < this.reachOffsets[i + 1]!; r++) {
          sum += (levels[this.reachIndex[r]!] ?? 0) * this.reachWeights[r]!;
        }
        excitation[i] = sum > 1 ? 1 : sum;
      }
    } else {
      engine.measure();
      for (let i = 0; i < this.count; i++) excitation[i] = engine.loudnessAt(this.pitch[i]!);
    }
  }

  /** Driven fibers glow along their length, brighter the harder they are driven. */
  private drawGlow(context: CanvasRenderingContext2D): void {
    const { spike } = this.colors;
    context.lineWidth = 1.1;
    for (let step = 1; step <= GLOW_STEPS; step++) {
      const low = (step - 0.5) / GLOW_STEPS;
      const high = (step + 0.5) / GLOW_STEPS;
      let any = false;
      context.beginPath();
      for (let i = 0; i < this.count; i++) {
        const value = this.excitation[i]!;
        if (value < low || (value >= high && step < GLOW_STEPS)) continue;
        context.moveTo(this.px(this.rootX[i]!), this.py(this.rootY[i]!));
        context.lineTo(this.px(this.tipX[i]!), this.py(this.tipY[i]!));
        any = true;
      }
      if (!any) continue;
      const level = step / GLOW_STEPS;
      context.strokeStyle = rgba(spike, 0.05 + 0.2 * level * level);
      context.stroke();
    }
  }

  /** Fibers fire by chance: often when driven, now and then on their own. */
  private fire(delta: number, playing: boolean): void {
    if (delta <= 0) return;
    const spontaneous = SPONTANEOUS_RATE * (playing ? 0.35 : 1) * delta;
    for (let i = 0; i < this.count; i++) {
      if (!this.alive[i] || this.spikes >= MAX_SPIKES) continue;
      const value = this.excitation[i]!;
      const chance = spontaneous + SPIKE_RATE * value * value * delta;
      if (Math.random() < chance) {
        this.spikeFiber[this.spikes] = i;
        this.spikeProgress[this.spikes] = 0;
        this.spikes++;
      }
    }
  }

  /** Spikes run down their fibers toward the center, leaving a short trail in the afterglow. */
  private drawSpikes(context: CanvasRenderingContext2D, delta: number): void {
    const { spike, text } = this.colors;
    const size = this.scale < 150 ? 1.6 : 2;
    const step = delta / SPIKE_SECONDS;
    let kept = 0;
    context.fillStyle = rgba(mix(spike, text, 0.35), 0.95);
    for (let s = 0; s < this.spikes; s++) {
      const progress = this.spikeProgress[s]! + step;
      if (progress >= 1.25) continue;
      const fiber = this.spikeFiber[s]!;
      const x = this.rootX[fiber]! + (this.tipX[fiber]! - this.rootX[fiber]!) * progress;
      const y = this.rootY[fiber]! + (this.tipY[fiber]! - this.rootY[fiber]!) * progress;
      // Past the cell body the spike dims: it has left the plane of the picture.
      context.globalAlpha = progress <= 1 ? 1 : 1 - (progress - 1) / 0.25;
      context.fillRect(this.px(x) - size / 2, this.py(y) - size / 2, size, size);
      this.spikeFiber[kept] = fiber;
      this.spikeProgress[kept] = progress;
      kept++;
    }
    context.globalAlpha = 1;
    this.spikes = kept;
  }

  /** Current at each contact: a bright core, and a halo as wide as the current spreads. */
  private drawCurrent(context: CanvasRenderingContext2D, playing: boolean): void {
    if (!playing || !this.engine) return;
    const levels = this.engine.levels;
    const spreadMm = spreadMmOf(this.settings.spread);
    // The halo's size follows the spread, drawn smaller than to scale so that it stays legible.
    const halo = this.scale * (0.1 + 0.055 * Math.sqrt(spreadMm));
    this.channels.forEach((channel, c) => {
      const level = levels[c] ?? 0;
      if (level <= 0.02) return;
      const { x, y, inwardX, inwardY } = spiralAt(ELECTRODE_PLACES[channel.electrode]!);
      const contactX = this.px(x - inwardX * ARRAY_OFFSET);
      const contactY = this.py(y - inwardY * ARRAY_OFFSET);
      context.globalAlpha = 0.16 * level;
      context.drawImage(this.sprites.signal, contactX - halo, contactY - halo, halo * 2, halo * 2);
      const core = this.scale * 0.03 * (0.6 + level);
      context.globalAlpha = 0.5 * level;
      context.drawImage(this.sprites.signal, contactX - core, contactY - core, core * 2, core * 2);
    });
    context.globalAlpha = 1;
  }

  private drawBrush(context: CanvasRenderingContext2D): void {
    if (!this.brush) return;
    const { x, y, inwardX, inwardY } = spiralAt(this.brush.place);
    const offset = turnGap(this.brush.place) * 0.18;
    context.beginPath();
    context.arc(
      this.px(x + inwardX * offset),
      this.py(y + inwardY * offset),
      Math.max(9, this.scale * 0.07),
      0,
      2 * Math.PI,
    );
    context.strokeStyle = rgba(this.colors.text, 0.5);
    context.lineWidth = 1;
    context.stroke();
  }

  // ── The strip ────────────────────────────────────────────────────────────────────────────

  private clearStrip(): void {
    const { canvas } = this.strip;
    this.strip.setTransform(1, 0, 0, 1, 0, 0);
    this.strip.clearRect(0, 0, canvas.width, canvas.height);
    this.stripCarry = 0;
  }

  /** Scrolls the record left and writes the newest moment at its right edge. */
  private drawStrip(delta: number, implant: boolean): void {
    const engine = this.engine;
    if (!engine || delta <= 0) return;
    const context = this.strip;
    const { canvas } = context;
    this.stripCarry += STRIP_SPEED * this.ratio * delta;
    const shift = Math.floor(this.stripCarry);
    if (shift < 1) return;
    this.stripCarry -= shift;

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.globalCompositeOperation = 'copy';
    context.drawImage(canvas, -shift, 0);
    context.globalCompositeOperation = 'source-over';
    context.clearRect(canvas.width - shift, 0, shift, canvas.height);

    if (implant) {
      // One row per contact, the base (high pitches) at the top.
      const row = canvas.height / ELECTRODE_COUNT;
      const levels = engine.levels;
      this.channels.forEach((channel, c) => {
        const level = levels[c] ?? 0;
        if (level <= 0.04) return;
        context.fillStyle = rgba(this.colors.signal, 0.15 + 0.85 * level);
        const height = Math.max(1, row * (0.25 + 0.6 * level));
        context.fillRect(
          canvas.width - shift,
          channel.electrode * row + (row - height) / 2,
          Math.max(1, shift - this.ratio),
          height,
        );
      });
    } else {
      const row = canvas.height / SPECTRUM_ROWS;
      const span = Math.log(SPECTRUM_HIGH_HZ / SPECTRUM_LOW_HZ);
      for (let r = 0; r < SPECTRUM_ROWS; r++) {
        const hz = SPECTRUM_HIGH_HZ * Math.exp((-span * (r + 0.5)) / SPECTRUM_ROWS);
        const level = engine.loudnessAt(hz);
        if (level <= 0.05) continue;
        context.fillStyle = rgba(mix(this.colors.spike, this.colors.text, level * 0.5), level);
        context.fillRect(canvas.width - shift, r * row, shift, Math.ceil(row));
      }
    }
  }

  private px(x: number): number {
    return this.centerX + x * this.scale;
  }

  private py(y: number): number {
    return this.centerY + y * this.scale;
  }
}

/** A soft round glow in one color, drawn once and stamped wherever light is needed. */
function glowSprite(color: Rgb): HTMLCanvasElement {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const context = canvas.getContext('2d')!;
  const gradient = context.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  );
  gradient.addColorStop(0, rgba(mix(color, [255, 255, 255], 0.6), 1));
  gradient.addColorStop(0.12, rgba(color, 0.85));
  gradient.addColorStop(0.4, rgba(color, 0.22));
  gradient.addColorStop(1, rgba(color, 0));
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);
  return canvas;
}

function parseHex(value: string): Rgb {
  const hex = value.trim().replace('#', '');
  const full = hex.length === 3 ? [...hex].map((digit) => digit + digit).join('') : hex;
  const number = Number.parseInt(full, 16);
  if (full.length !== 6 || Number.isNaN(number)) return [255, 255, 255];
  return [(number >> 16) & 255, (number >> 8) & 255, number & 255];
}

function rgba([r, g, b]: Rgb, alpha: number): string {
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function mix(a: Rgb, b: Rgb, amount: number): Rgb {
  return [
    Math.round(a[0] + (b[0] - a[0]) * amount),
    Math.round(a[1] + (b[1] - a[1]) * amount),
    Math.round(a[2] + (b[2] - a[2]) * amount),
  ];
}
