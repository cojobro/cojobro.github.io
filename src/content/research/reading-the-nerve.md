---
title: 'Reading speech back from the nerve'
kicker: 'Neural decoding'
summary: 'Decoders that turn a twin’s simulated nerve firing back into sound, so that one instrument can measure how much speech each person’s implant carries.'
overview: >-
  A twin shows how a person’s nerve fires, but firing is not hearing. To find out what the firing
  carries, I train decoders: neural networks that listen to the simulated spikes and turn them back
  into sound, much as a listener’s brain learns to make sense of an implant. Comparing the decoded
  sound with the original speech shows how much got through. I train the decoder on many simulated
  nerves, leaving out the person being measured, so it reads their twin as a stranger would. That
  makes it a measuring instrument: one ruler, applied the same way to everyone, for how much speech
  an implant can carry.
scene: journey
sceneLabel: 'A sound wave travels into a stylized implant, becomes rapid pulses across its electrodes, sets nerve fibers firing, and is turned back into a sound wave by a decoder; the decoded wave is set beneath the original, aligned in time, to compare the two.'
steps:
  - >-
    Speech arrives as sound: a pressure wave rippling through the air.
  - >-
    The implant’s processor turns it into rapid electrical pulses, delivered across the electrodes
    one after another.
  - >-
    The nerve answers with spikes: brief electrical signals that carry the sound toward the brain.
  - >-
    A decoder, trained much like a listener learns, turns those spikes back into sound.
  - >-
    Comparing what comes out with what went in measures how much of the speech this person’s
    implant can carry.
status: active
period: '2026 – present'
order: 2
keywords:
  - neural decoding
  - speech reconstruction
  - speech intelligibility
  - auditory nerve
  - convolutional networks
  - cochlear implants
publications:
  - brown-2027-spie-speech-transmission
---

## Firing is not hearing

A digital twin predicts which nerve fibers fire, and when. But a pattern of spikes is not yet a sound, and it does not say how much of a sentence a person could understand. Something has to read the firing.

In a person, that reader is the brain, which learns over months to make sense of the signal an implant provides. I can't simulate a brain, but I can train a decoder: a neural network that listens to the simulated spikes and turns them back into sound.

## Turning spikes back into sound

The decoder sees only the firing of the twin's nerve fibers, the same information the brain receives, and learns to reconstruct the speech that caused it. Where the firing carries the speech faithfully, the reconstruction is clear. Where the implant or the nerve loses detail, the reconstruction loses it too. Comparing what comes out with what went in gives a score for how much of the speech the firing carries.

## One instrument for everyone

The step I find most exciting is turning that decoder into a measuring instrument. A decoder trained on one person's twin might learn its quirks and flatter it. So I train the instrument on many synthetic nerves, leave out the person being measured, and then freeze it. Every twin is read by the same decoder in the same way, like one ruler applied to everyone.

That makes it possible to compare people on a common scale and to ask what limits each of them: the number of surviving fibers, where the electrodes sit, or how their program codes the sound.

## How it works

- Speech is encoded with the recipient's own clinical program (ACE, with their channels, rate and levels) and passed through their twin.
- A convolutional decoder reconstructs the audio from the twin's spike trains.
- Reconstructions are scored for objective intelligibility (STOI) and by the share of words that an independent speech recognizer transcribes correctly.
- The instrument is trained on a family of synthetic nerves with the recipient left out, so its score reflects their nerve and program, not the decoder's memory of them.

An earlier version of this analysis, _Decoding simulated auditory nerve activity to measure cochlear implant speech transmission from patient-specific neural health_, written with Jack Noble, is accepted for presentation at SPIE Medical Imaging 2027.

## What comes next

A ruler is only useful if it measures the right thing. The real test is whether the instrument's readings follow how well people actually understand speech with their implants, so the next step is to compare its predictions with recipients' clinical speech scores. I am also exploring decoders that keep learning the way a new implant user does, taught only by whether the words come through, to model how listening improves in the months after an implant is switched on.
