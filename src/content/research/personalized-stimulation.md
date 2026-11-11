---
title: 'Stimulation shaped to each nerve'
kicker: 'Personalized stimulation'
summary: 'Work in progress: learning, through each person’s digital twin, an implant program that steers current toward the nerve fibers they still have.'
overview: >-
  Most implant users are programmed with the same basic sound-coding strategy, which an audiologist
  then adjusts by hand. But every nerve has its own gaps, stretches where few fibers survive. A
  standard program still spends current there, and neighboring channels can blur together. I’m
  using each person’s digital twin to learn a program for that person, one that steers current
  toward the fibers that remain. A computer that learns can also learn to cheat, exploiting quirks
  of the model instead of helping the listener, so every learned program is judged by independent
  decoders. This work is in progress.
scene: stimulation
sceneLabel: 'Two stylized nerves with gaps in different places. A standard program’s current spreads into the gaps and neighboring channels blur together; then a learned program steers the current toward the fibers that remain.'
steps:
  - >-
    Two people, same implant, different nerves: the gaps where fibers have been lost fall in
    different places.
  - >-
    A standard program spends current where fibers are missing, and the current from neighboring
    channels spreads and blurs together.
  - >-
    A program learned through each person’s twin steers current toward the fibers that remain.
status: active
period: '2026 – present'
order: 3
keywords:
  - personalized stimulation
  - end-to-end learning
  - differentiable encoder
  - sound coding strategies
  - cochlear implants
  - PyTorch
---

## One program, many nerves

Nearly every cochlear implant user starts from one of a few standard sound-coding strategies. An audiologist then tunes the levels by hand, one person at a time, guided by what the person reports. The strategy itself was designed for an average ear. It does not know where this person's electrodes sit, or where their nerve has gaps.

Those gaps matter. Current delivered where few fibers survive does little good. And current spreads: two neighboring electrodes meant to carry different pitches can end up exciting many of the same fibers, blurring their channels together.

## Learning a program through the twin

Because the digital twin is differentiable, it can be used to learn stimulation, not just to simulate it. I built an encoder: a neural network that takes in sound and decides, pulse by pulse, which electrode to use and how much current to send. The encoder drives the person's twin, a decoder reads the result, and the encoder learns from how intelligible the decoded speech is, while staying within the levels the person's own program allows.

In principle, the encoder can find what no one could test by hand: how to spend a limited budget of current on the fibers this particular person has. The approach adapts end-to-end designs first developed for visual prostheses, where stimulation is optimized through a model of what the patient will perceive.

## Guarding against a clever optimizer

An optimizer is relentless. If the twin or the decoder has a flaw, the encoder may find it and exploit it, producing stimulation that scores well on the computer and would do nothing for a real listener. So a learned program has to prove itself to decoders that took no part in training it, on versions of the twin perturbed within the model's uncertainty, and against the standard clinical strategy on equal terms. A gain that only one decoder can see does not count.

## Technical details

- The encoder maps audio to electrode selections (a differentiable choice among the contacts) and pulse currents, end to end in PyTorch.
- It trains through the recipient's frozen twin and a frozen decoder, maximizing intelligibility within the recipient's threshold and comfort levels, pulse rate and pulse width.
- Its output exports as a hardware-realizable pulse table.
- Learned strategies are compared with ACE, the standard clinical strategy, by independent decoders.

## What comes next

This is work in progress, and the open question is the honest one: whether a learned program can beat the standard strategy once it is scored fairly. Next comes a comparison between programs learned for one person and a single program learned across many nerves, which separates the value of personalization from the value of learning itself. The same twins could also test simpler changes that a clinician can make today, such as adjusting levels or switching off electrodes.
