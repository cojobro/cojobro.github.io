---
title: 'Predicting the phase of sound'
kicker: 'Sound processing'
summary: 'Transformer models that predict the phase of sound from its magnitude spectrum, for cochlear implant sound processing.'
overview: >-
  Any sound can be broken into frequencies, each with a strength and a timing, called its phase.
  Many audio systems keep the strengths and set the timing aside, and turning strengths alone back
  into natural-sounding audio is surprisingly hard. In 2025 I trained Transformer models, the same
  family of neural networks behind modern language AI, to predict the missing timing from the
  strengths. I scored the rebuilt sound with measures modeled on how human hearing weighs
  frequencies, not just on how closely the numbers match. I presented the work as a poster in 2025
  and again in 2026.
status: earlier
period: '2025'
order: 5
keywords:
  - phase retrieval
  - short-time Fourier transform
  - Transformers
  - speech processing
  - cochlear implants
publications:
  - brown-2026-phase-transformer-ece-day
  - brown-2025-phase-transformer-vise
---

## The missing half of a spectrogram

A spectrogram is a picture of sound: time runs left to right, pitch runs bottom to top, and brightness shows how strong each frequency is at each moment. It is how most audio software sees sound, and a cochlear implant's processor works in a similar way, tracking how strong each band of frequencies is from moment to moment.

But a spectrogram keeps only half of the information. Each frequency also has a phase, which says exactly when its waves crest. Throw the phase away, and turning the picture back into sound becomes a puzzle: many different waveforms share the same spectrogram, and a poor guess at the phase sounds metallic or hollow.

## A Transformer for phase

Transformers, the neural networks behind modern language models, are good at finding structure across long sequences. A spectrogram is such a sequence, and its phase is not random: it is tied to how the strengths of the frequencies change over time. I trained Transformer models to predict the phase from the log-magnitude spectrogram alone.

Rather than the raw phase, which wraps around at every cycle, the models predicted how the phase changes (the delta phase).

## Scoring by ear

A predicted phase can be wrong sample by sample and still sound right, or match closely and still sound off. So I scored the reconstructions with metrics built on mel-frequency cepstral coefficients (MFCCs), features designed to reflect how human hearing weighs different frequencies.

## Where it led

I presented this work with Jack Noble as a poster at the VISE Annual Surgery, Intervention, and Engineering Symposium in 2025 and at Vanderbilt ECE Day in 2026. The questions it raised, how to turn a representation back into sound and how to score the result by ear, run straight through my current work on decoding speech from simulated nerve firing.
