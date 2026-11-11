/**
 * The sound of the home page's instrument. It plays a recording two ways at once, as it is and
 * through the implant sketch (`vocoder.worklet.js`), and fades between them, so switching is
 * instant and the two stay in step. The ear and the implant are described in `model.ts`.
 *
 * Nothing here runs until the visitor presses play: browsers only allow sound after a gesture,
 * and the page should not ask for anything before then. That is why this module is imported as
 * a type only by the page, and downloaded on that first press.
 */
import {
  CARRIERS,
  MAXIMA,
  channelsFor,
  mixingWeights,
  spreadMmOf,
  type Channel,
  type Survival,
} from './model';
import workletUrl from './vocoder.worklet.js?url';

export type ListeningMode = 'natural' | 'implant';

/** The implant and nerve being listened through. */
export interface Settings {
  /** Contacts switched on, 1 to 22. */
  electrodes: number;
  /** The current-spread control, 0 (narrow) to 1 (wide). */
  spread: number;
  survival: Survival;
}

/** Seconds to fade between the two ways of listening. */
const CROSSFADE = 0.08;
/** The longest recording of the visitor's own voice, in seconds. */
export const RECORDING_SECONDS = 6;
/** Silence added after a recording so the loop breathes between repeats, in seconds. */
const LOOP_GAP = 0.7;
/** The spectrum analyser's resolution: 4096 samples gives bins about 12 Hz apart. */
const FFT_SIZE = 4096;

export class Engine {
  /** The implant's channels as currently set (the display draws them). */
  channels: Channel[] = [];
  /** Each channel's stimulation level, 0 to 1, as last reported by the audio thread. */
  levels: Float32Array = new Float32Array(0);
  readonly sampleRate: number;
  /** Width of one spectrum bin, in Hz. */
  readonly binHz: number;

  private readonly context: AudioContext;
  private readonly vocoder: AudioWorkletNode;
  private readonly analyser: AnalyserNode;
  private readonly input: GainNode;
  private readonly dry: GainNode;
  private readonly wet: GainNode;
  private readonly decibels: Float32Array<ArrayBuffer>;
  private source: AudioBufferSourceNode | null = null;
  private buffer: AudioBuffer | null = null;
  private mode: ListeningMode = 'natural';

  /**
   * Builds the audio graph on `context`. Browsers only let sound start in answer to a click or
   * key press, and some only in the very moment of it, so the page opens the context itself,
   * first thing in its event handler (`openOutput` in Instrument.astro), and hands it over.
   */
  static async create(context: AudioContext): Promise<Engine> {
    await context.audioWorklet.addModule(workletUrl);
    return new Engine(context);
  }

  private constructor(context: AudioContext) {
    this.context = context;
    this.sampleRate = context.sampleRate;
    this.binHz = context.sampleRate / FFT_SIZE;

    this.input = context.createGain();
    this.dry = context.createGain();
    this.wet = context.createGain();
    this.wet.gain.value = 0;
    this.analyser = context.createAnalyser();
    this.analyser.fftSize = FFT_SIZE;
    this.analyser.smoothingTimeConstant = 0.55;
    this.decibels = new Float32Array(this.analyser.frequencyBinCount);

    this.vocoder = new AudioWorkletNode(context, 'implant-vocoder', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
    });
    this.vocoder.port.postMessage({
      type: 'carriers',
      bands: CARRIERS.map(({ lowHz, highHz }) => ({ lowHz, highHz })),
    });
    this.vocoder.port.onmessage = ({ data }: MessageEvent<{ levels: Float32Array }>) => {
      if (data.levels.length === this.channels.length) this.levels = data.levels;
    };

    const output = context.createGain();
    output.gain.value = 0.9;
    this.input.connect(this.analyser);
    this.input.connect(this.dry).connect(output);
    this.input.connect(this.vocoder).connect(this.wet).connect(output);
    output.connect(context.destination);
  }

  /** Sets the implant and the nerve. Cheap enough to call on every movement of a control. */
  configure({ electrodes, spread, survival }: Settings): void {
    const channels = channelsFor(electrodes);
    const weights = mixingWeights(channels, spreadMmOf(spread), survival);
    if (channels.length === this.channels.length) {
      this.vocoder.port.postMessage({ type: 'weights', weights });
      return;
    }
    this.channels = channels;
    this.levels = new Float32Array(channels.length);
    this.vocoder.port.postMessage({
      type: 'channels',
      bands: channels.map(({ lowHz, highHz }) => ({ lowHz, highHz })),
      weights,
      maxima: MAXIMA,
    });
  }

  setMode(mode: ListeningMode): void {
    this.mode = mode;
    const now = this.context.currentTime;
    const implant = mode === 'implant' ? 1 : 0;
    this.wet.gain.setTargetAtTime(implant, now, CROSSFADE / 3);
    this.dry.gain.setTargetAtTime(1 - implant, now, CROSSFADE / 3);
  }

  get playing(): boolean {
    return this.source !== null;
  }

  get hasRecording(): boolean {
    return this.buffer !== null;
  }

  /** Loads the recording at `url` as the sound to play. */
  async load(url: string): Promise<void> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Could not load ${url} (${response.status}).`);
    this.use(await this.context.decodeAudioData(await response.arrayBuffer()));
  }

  /**
   * Records the visitor's voice for up to `RECORDING_SECONDS` and makes it the sound to play.
   * Resolves when the recording is ready. `onProgress` reports 0 → 1 while recording; calling
   * the function it is given to `onStart` ends the recording early.
   */
  async record(onProgress: (fraction: number) => void, onStart: (finish: () => void) => void) {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true },
    });
    try {
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      recorder.addEventListener('dataavailable', (event) => chunks.push(event.data));
      const stopped = new Promise<void>((resolve) =>
        recorder.addEventListener('stop', () => resolve(), { once: true }),
      );

      const started = performance.now();
      const finish = () => {
        if (recorder.state !== 'inactive') recorder.stop();
      };
      const timer = window.setInterval(() => {
        const fraction = (performance.now() - started) / (RECORDING_SECONDS * 1000);
        onProgress(Math.min(1, fraction));
        if (fraction >= 1) finish();
      }, 50);
      recorder.start();
      onStart(finish);
      await stopped;
      window.clearInterval(timer);

      const encoded = await new Blob(chunks, { type: recorder.mimeType }).arrayBuffer();
      this.use(await this.context.decodeAudioData(encoded));
    } finally {
      for (const track of stream.getTracks()) track.stop();
    }
  }

  /** Makes `recording` the sound to play: mono, at a steady loudness, with a pause at its end. */
  private use(recording: AudioBuffer): void {
    const length = recording.length;
    const mono = new Float32Array(length);
    for (let channel = 0; channel < recording.numberOfChannels; channel++) {
      const data = recording.getChannelData(channel);
      for (let i = 0; i < length; i++) mono[i]! += data[i]! / recording.numberOfChannels;
    }
    let peak = 0;
    for (let i = 0; i < length; i++) peak = Math.max(peak, Math.abs(mono[i]!));
    const scale = peak > 0 ? 0.8 / peak : 1;
    for (let i = 0; i < length; i++) mono[i]! *= scale;

    const gap = Math.round(LOOP_GAP * recording.sampleRate);
    const buffer = this.context.createBuffer(1, length + gap, recording.sampleRate);
    buffer.copyToChannel(mono, 0);
    this.buffer = buffer;
    if (this.playing) {
      this.stop();
      void this.play();
    }
  }

  /** Plays the recording, looping, until `stop`. */
  async play(): Promise<void> {
    if (!this.buffer || this.source) return;
    await this.context.resume();
    const source = this.context.createBufferSource();
    source.buffer = this.buffer;
    source.loop = true;
    source.connect(this.input);
    source.start();
    this.source = source;
    this.setMode(this.mode);
  }

  stop(): void {
    this.source?.stop();
    this.source?.disconnect();
    this.source = null;
  }

  /**
   * How loud the sound is at a frequency right now, 0 (silent) to 1: the level a healthy ear's
   * nerve fibers tuned to `hz` would be answering.
   */
  loudnessAt(hz: number): number {
    const position = hz / this.binHz;
    const index = Math.floor(position);
    if (index < 1 || index >= this.decibels.length - 1) return 0;
    const fraction = position - index;
    const decibels = this.decibels[index]! * (1 - fraction) + this.decibels[index + 1]! * fraction;
    // Speech sits some 30 to 90 dB below full scale in the analyser's units.
    return Math.min(1, Math.max(0, (decibels + 88) / 58));
  }

  /** Takes a new reading of the spectrum; call once per frame before `loudnessAt`. */
  measure(): void {
    this.analyser.getFloatFrequencyData(this.decibels);
  }
}
