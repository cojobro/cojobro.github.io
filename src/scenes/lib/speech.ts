/**
 * Synthetic speech for shaders: nothing here comes from a recording. A voice is a rhythm of
 * syllables (an envelope of quick-rise, slow-fall bumps with pauses between words) times a voiced
 * waveform whose pitch changes from syllable to syllable, plus short consonant bursts. Every
 * function takes `u`, a position in syllables (scale time or distance to it), and `seed`, which
 * picks the voice. Requires `HASH` from `./glsl` earlier in the shader.
 */
export const SPEECH = /* glsl */ `
// Loudness of syllable n, 0 to 1: about one slot in six is a pause between words.
float syllableGain(float n, float seed) {
  float pause = hash12(vec2(n, seed));
  return pause < 0.16 ? 0.0 : 0.35 + 0.65 * hash12(vec2(n + 0.5, seed + 7.0));
}

// Loudness of the voice at u, 0 to 1.
float speechEnvelope(float u, float seed) {
  float n = floor(u);
  float span = 0.6 + 0.3 * hash12(vec2(n, seed + 3.0));
  float x = clamp(fract(u) / span, 0.0, 1.0);
  return syllableGain(n, seed) * pow(max(sin(3.14159265 * x), 0.0), 1.6) * (1.0 - 0.35 * x);
}

// Strength of the consonant burst that opens some syllables, 0 to 1.
float speechBurst(float u, float seed) {
  float n = floor(u);
  float opens = step(0.55, hash12(vec2(n, seed + 17.0))) * step(0.01, syllableGain(n, seed));
  float x = (fract(u) - 0.035) / 0.03;
  return opens * exp(-x * x);
}

// The voiced waveform under the envelope, about -1 to 1, with "cycles" periods per syllable.
// "detail" (0 to 1) scales the harmonics that give the voice its edge.
float speechCarrier(float u, float seed, float cycles, float detail) {
  float n = floor(u);
  float pitch = cycles * (0.8 + 0.4 * hash12(vec2(n, seed + 11.0)));
  // The phase restarts each syllable, where the envelope is silent, so it never loses precision.
  float phase = 6.2831853 * pitch * fract(u);
  return 0.62 * sin(phase) + detail * (0.26 * sin(2.0 * phase + 1.1) + 0.12 * sin(3.0 * phase + 0.4));
}

// The whole voice: voiced syllables plus noisy consonant bursts, about -1 to 1.
float speech(float u, float seed, float cycles) {
  float x = fract(u);
  float noise = sin(x * 47.0 * 6.2831853) * sin(x * 29.0 * 6.2831853 + 1.3);
  return speechEnvelope(u, seed) * speechCarrier(u, seed, cycles, 1.0)
    + 0.45 * speechBurst(u, seed) * noise;
}
`;
