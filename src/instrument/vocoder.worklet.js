// @ts-nocheck
/**
 * The listening half of the home page's instrument: a channel vocoder, the standard way of
 * letting someone with ordinary hearing sample what a cochlear implant conveys. It runs on the
 * audio thread and is loaded as-is (see `engine.ts`), so it is plain JavaScript with no imports;
 * everything about the ear and the implant is decided in `model.ts` and arrives here as numbers.
 *
 * What it does to the sound, sample by sample:
 *
 * 1. Analysis. A bank of band-pass filters splits the sound into the implant's channels, and the
 *    envelope of each band (how loud it is from moment to moment) is kept. The fine detail inside
 *    each band is discarded, as it is by an implant.
 * 2. Selection. In each short cycle only the `maxima` loudest channels are stimulated.
 * 3. Reaching the nerve. Each carrier stands for a place where nerve may answer. It takes its
 *    loudness from the channels through the mixing matrix (`mixingWeights` in `model.ts`): how
 *    far each channel's current spreads, and how much nerve survives at that place.
 * 4. Synthesis. Each carrier is a narrow band of noise at the pitch its place is assigned,
 *    played at that loudness. The sum is what you hear.
 *
 * Messages in:  { type: 'carriers', bands }            once, before anything else
 *               { type: 'channels', bands, weights, maxima }   a new set of channels
 *               { type: 'weights', weights }           the same channels, mixed differently
 * Messages out: { levels }   each channel's stimulation level since the last message, 0 to 1
 */

/** Band-pass sections in series for each analysis band and each carrier band. */
const ANALYSIS_SECTIONS = 3;
const CARRIER_SECTIONS = 2;
/** Identical band-pass sections in series narrow the band; these widen each one to compensate. */
const WIDEN = { 2: 0.6436, 3: 0.5098 };
/** The envelope keeps changes slower than this, in Hz. */
const ENVELOPE_HZ = 180;
/** Samples between updates of the selection and of the carriers' loudness. */
const CONTROL_PERIOD = 32;
/** Seconds between level reports to the page (the display draws from them). */
const REPORT_SECONDS = 1 / 120;
/** The level display shows channels within this many decibels of the loudest recent one. */
const DISPLAY_RANGE_DB = 34;
/** The quietest sound the level display treats as its loudest, so silence stays dark. */
const DISPLAY_FLOOR = 2e-3;

/** Coefficients [b0, b2, a1, a2] of a band-pass section (b1 is 0) with unit gain at its center. */
function bandpass(lowHz, highHz, sections, out, offset) {
  const nyquist = sampleRate / 2;
  const low = Math.max(20, Math.min(lowHz, nyquist * 0.9));
  const high = Math.max(low * 1.02, Math.min(highHz, nyquist * 0.95));
  const center = Math.sqrt(low * high);
  const q = (WIDEN[sections] * center) / (high - low);
  const omega = (2 * Math.PI * center) / sampleRate;
  const alpha = Math.sin(omega) / (2 * q);
  const a0 = 1 + alpha;
  out[offset] = alpha / a0;
  out[offset + 1] = -alpha / a0;
  out[offset + 2] = (-2 * Math.cos(omega)) / a0;
  out[offset + 3] = (1 - alpha) / a0;
}

class ImplantVocoder extends AudioWorkletProcessor {
  constructor() {
    super();
    this.channelCount = 0;
    this.carrierCount = 0;
    this.maxima = 8;

    // Analysis: per channel, 4 coefficients shared by its sections and 2 state values per section.
    this.analysisCoefficients = new Float64Array(0);
    this.analysisState = new Float64Array(0);
    this.envelopeA = new Float64Array(0);
    this.envelopeB = new Float64Array(0);
    this.gate = new Float64Array(0);
    this.level = new Float64Array(0);
    this.peak = new Float32Array(0);
    this.order = [];

    // Synthesis: the same layout for the carriers, plus each carrier's loudness and its ramp.
    this.carrierCoefficients = new Float64Array(0);
    this.carrierState = new Float64Array(0);
    this.carrierNorm = new Float64Array(0);
    this.gain = new Float64Array(0);
    this.gainStep = new Float64Array(0);

    this.weights = new Float32Array(0);
    this.targetWeights = new Float32Array(0);

    this.envelopeCoefficient = 1 - Math.exp((-2 * Math.PI * ENVELOPE_HZ) / sampleRate);
    this.controlPhase = 0;
    this.reportPhase = 0;
    this.reportPeriod = Math.round(sampleRate * REPORT_SECONDS);
    // Loudness matching: the output is held near the loudness of the sound that came in. The
    // correction moves slowly and within limits, so it evens out settings, not syllables.
    this.inputPower = 1e-5;
    this.outputPower = 1e-5;
    this.makeup = 1.25;
    this.powerCoefficient = 1 - Math.exp(-1 / (0.6 * sampleRate));
    this.fade = 0; // 0 → 1 after a change of channels, so the change does not click
    this.reference = DISPLAY_FLOOR; // the loudest recent channel level, for the display

    this.port.onmessage = ({ data }) => {
      if (data.type === 'carriers') this.setCarriers(data.bands);
      else if (data.type === 'channels') this.setChannels(data.bands, data.weights, data.maxima);
      else if (data.type === 'weights' && data.weights.length === this.targetWeights.length) {
        this.targetWeights = data.weights;
      }
    };
  }

  setCarriers(bands) {
    const count = bands.length;
    this.carrierCount = count;
    this.carrierCoefficients = new Float64Array(count * 4);
    this.carrierState = new Float64Array(count * CARRIER_SECTIONS * 2);
    this.carrierNorm = new Float64Array(count);
    this.gain = new Float64Array(count);
    this.gainStep = new Float64Array(count);
    bands.forEach(({ lowHz, highHz }, k) =>
      bandpass(lowHz, highHz, CARRIER_SECTIONS, this.carrierCoefficients, k * 4),
    );

    // Calibrate: run noise through each carrier's filter and note how loud it comes out, so that
    // every carrier plays at unit loudness however narrow its band.
    const samples = 16384;
    const noise = new Float64Array(samples);
    for (let i = 0; i < samples; i++) noise[i] = Math.random() * 2 - 1;
    for (let k = 0; k < count; k++) {
      let power = 0;
      for (let i = 0; i < samples; i++) {
        const y = this.carrierSample(k, noise[i]);
        if (i >= 2048) power += y * y;
      }
      this.carrierNorm[k] = 1 / Math.sqrt(power / (samples - 2048) + 1e-12);
    }
    this.carrierState.fill(0);
  }

  setChannels(bands, weights, maxima) {
    const count = bands.length;
    this.channelCount = count;
    this.maxima = maxima;
    this.analysisCoefficients = new Float64Array(count * 4);
    this.analysisState = new Float64Array(count * ANALYSIS_SECTIONS * 2);
    this.envelopeA = new Float64Array(count);
    this.envelopeB = new Float64Array(count);
    this.gate = new Float64Array(count).fill(1);
    this.level = new Float64Array(count);
    this.peak = new Float32Array(count);
    this.order = Array.from({ length: count }, (_, c) => c);
    bands.forEach(({ lowHz, highHz }, c) =>
      bandpass(lowHz, highHz, ANALYSIS_SECTIONS, this.analysisCoefficients, c * 4),
    );
    this.weights = weights.slice();
    this.targetWeights = weights;
    this.fade = 0;
  }

  /** One sample of noise through carrier `k`'s band-pass sections. */
  carrierSample(k, x) {
    const coefficients = this.carrierCoefficients;
    const state = this.carrierState;
    const c = k * 4;
    const b0 = coefficients[c];
    const b2 = coefficients[c + 1];
    const a1 = coefficients[c + 2];
    const a2 = coefficients[c + 3];
    let s = k * CARRIER_SECTIONS * 2;
    let y = x;
    for (let section = 0; section < CARRIER_SECTIONS; section++, s += 2) {
      const input = y;
      y = b0 * input + state[s];
      state[s] = state[s + 1] - a1 * y;
      state[s + 1] = b2 * input - a2 * y;
    }
    return y;
  }

  /** Choose which channels are stimulated this cycle, and set each carrier's next loudness. */
  control() {
    const channels = this.channelCount;
    const { envelopeB, gate, level, peak, weights, targetWeights } = this;

    if (channels > this.maxima) {
      this.order.sort((a, b) => envelopeB[b] - envelopeB[a]);
      for (let rank = 0; rank < channels; rank++) {
        const c = this.order[rank];
        gate[c] += ((rank < this.maxima ? 1 : 0) - gate[c]) * 0.5;
      }
    }
    for (let c = 0; c < channels; c++) {
      const value = envelopeB[c] * gate[c];
      level[c] = value;
      if (value > peak[c]) peak[c] = value;
    }

    for (let i = 0; i < weights.length; i++) weights[i] += (targetWeights[i] - weights[i]) * 0.2;

    for (let k = 0; k < this.carrierCount; k++) {
      let target = 0;
      const row = k * channels;
      for (let c = 0; c < channels; c++) target += weights[row + c] * level[c];
      this.gainStep[k] = (target - this.gain[k]) / CONTROL_PERIOD;
    }
  }

  report() {
    const { peak } = this;
    let loudest = 0;
    for (let c = 0; c < this.channelCount; c++) if (peak[c] > loudest) loudest = peak[c];
    // The reference follows the loudest channel up at once and sinks back over a second or two.
    this.reference = Math.max(this.reference * 0.992, loudest, DISPLAY_FLOOR);

    const levels = new Float32Array(this.channelCount);
    for (let c = 0; c < this.channelCount; c++) {
      const decibels = 20 * Math.log10(peak[c] / this.reference + 1e-9);
      levels[c] = Math.min(1, Math.max(0, 1 + decibels / DISPLAY_RANGE_DB));
      peak[c] = 0;
    }
    this.port.postMessage({ levels }, [levels.buffer]);
  }

  process(inputs, outputs) {
    const output = outputs[0];
    const input = inputs[0];
    const left = input && input[0];
    const right = input && input[1];
    const frames = output[0].length;
    const channels = this.channelCount;
    const carriers = this.carrierCount;
    if (channels === 0 || carriers === 0) return true;

    const { analysisCoefficients, analysisState, envelopeA, envelopeB } = this;
    const { gain, gainStep, carrierNorm } = this;
    const envelopeCoefficient = this.envelopeCoefficient;
    const powerCoefficient = this.powerCoefficient;
    const out = output[0];

    for (let i = 0; i < frames; i++) {
      const x = left ? (right ? (left[i] + right[i]) * 0.5 : left[i]) : 0;

      // 1. Analysis: each channel's band, then its envelope.
      for (let c = 0; c < channels; c++) {
        const k = c * 4;
        const b0 = analysisCoefficients[k];
        const b2 = analysisCoefficients[k + 1];
        const a1 = analysisCoefficients[k + 2];
        const a2 = analysisCoefficients[k + 3];
        let s = c * ANALYSIS_SECTIONS * 2;
        let y = x;
        for (let section = 0; section < ANALYSIS_SECTIONS; section++, s += 2) {
          const sectionInput = y;
          y = b0 * sectionInput + analysisState[s];
          analysisState[s] = analysisState[s + 1] - a1 * y;
          analysisState[s + 1] = b2 * sectionInput - a2 * y;
        }
        const rectified = (y < 0 ? -y : y) + 1e-20;
        envelopeA[c] += (rectified - envelopeA[c]) * envelopeCoefficient;
        envelopeB[c] += (envelopeA[c] - envelopeB[c]) * envelopeCoefficient;
      }

      // 2 and 3. Selection and reach, a few hundred times a second.
      if (this.controlPhase === 0) this.control();
      this.controlPhase = (this.controlPhase + 1) % CONTROL_PERIOD;

      // 4. Synthesis: one shared noise source, shaped into each carrier's band.
      const noise = Math.random() * 2 - 1;
      let sum = 0;
      for (let k = 0; k < carriers; k++) {
        gain[k] += gainStep[k];
        sum += this.carrierSample(k, noise) * carrierNorm[k] * gain[k];
      }

      // Match the loudness that came in, without letting silence be amplified into hiss.
      this.inputPower += (x * x - this.inputPower) * powerCoefficient;
      this.outputPower += (sum * sum - this.outputPower) * powerCoefficient;
      const wanted = Math.sqrt((this.inputPower + 1e-5) / (this.outputPower + 1e-5));
      const bounded = wanted < 0.4 ? 0.4 : wanted > 3.5 ? 3.5 : wanted;
      this.makeup += (bounded - this.makeup) * powerCoefficient;
      if (this.fade < 1) this.fade = Math.min(1, this.fade + 1 / (0.03 * sampleRate));

      // A gentle ceiling instead of a hard clip: straight up to 0.7, then bending toward 1.
      const y = sum * this.makeup * this.fade;
      const size = y < 0 ? -y : y;
      out[i] = size <= 0.7 ? y : Math.sign(y) * (0.7 + 0.3 * Math.tanh((size - 0.7) / 0.3));

      if (++this.reportPhase >= this.reportPeriod) {
        this.reportPhase = 0;
        this.report();
      }
    }

    for (let channel = 1; channel < output.length; channel++) output[channel].set(out);
    return true;
  }
}

registerProcessor('implant-vocoder', ImplantVocoder);
