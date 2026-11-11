---
title: 'A digital twin of the hearing nerve'
kicker: 'Digital twins'
summary: 'A model of one person’s implanted hearing nerve, built from their own CT scan, that predicts how its fibers fire when the implant’s electrodes pulse.'
overview: >-
  A cochlear implant restores hearing by sending tiny electrical pulses to the hearing nerve. But
  no two nerves are alike. The electrodes come to rest in a slightly different place in every ear,
  and the number of healthy nerve fibers varies from person to person. That may be part of why two
  people with the same implant can understand speech so differently. My lab models each person’s
  inner ear from their CT scan. I turn that model into a digital twin of their nerve: a simulation
  that predicts how each fiber fires when the implant pulses, so one person’s hearing can be studied
  on a computer.
scene: cochlea
sceneLabel: 'A stylized, glowing cochlea: a spiral that sorts pitch from high at its base to low at its apex, a thin array of 22 electrode contacts threaded inside it, nerve fibers fanning out toward the brain with gaps where fibers are missing, and fibers lighting up as the electrodes pulse.'
steps:
  - >-
    The cochlea is a spiral that sorts sound by pitch. High notes peak near its base; low notes
    travel all the way to its tip, the apex.
  - >-
    A cochlear implant threads a thin array of 22 electrode contacts into the spiral. Each contact
    stands in for a band of pitches, high near the entrance and lower deeper in.
  - >-
    Behind the array, nerve fibers fan out toward the brain. How many survive, and where, differs
    from person to person, and the implant can only speak to the fibers that remain.
  - >-
    The digital twin is a model built from the person’s CT scan. It predicts how their fibers fire
    each time the electrodes pulse, so their hearing can be studied on a computer.
status: active
period: '2025 – present'
order: 1
keywords:
  - cochlear implants
  - digital twins
  - auditory nerve modeling
  - patient-specific modeling
  - differentiable simulation
  - PyTorch
---

## Same device, different outcomes

About a million people hear through cochlear implants, and for many of them the device is life-changing. Yet two people can receive the same implant, through the same kind of surgery, and come away hearing very differently: one follows a conversation on the phone, while the other struggles to understand speech in a quiet room. Age, how long someone was deaf, and other clinical factors explain surprisingly little of that difference.

One place to look is where the implant meets the nerve. The electrodes come to rest at a different depth, and a different distance from the nerve, in every ear. The number of nerve fibers that survive hearing loss varies along the cochlea and from person to person. Clinicians can measure some of this, but no measurement tells them how much speech actually gets through.

## What a digital twin is

A digital twin, in this work, is a computer model of one person's implanted nerve. It answers a simple question: when this electrode pulses at this strength, which of this person's nerve fibers fire, and when?

The Noble Lab builds the foundation from each person's CT scan: the shape of their cochlea, the position of every electrode contact, and a model of how current from each contact spreads through the surrounding tissue. The lab also estimates how many fibers survive in each region, from responses recorded through the implant itself.

My part is the nerve. I ported the lab's model of the auditory nerve from MATLAB to PyTorch, verified that it reproduces the original, and rebuilt it to be differentiable. Like real nerve fibers, the model is stochastic: the same pulse does not always produce the same response, and a fiber that has just fired needs a moment to recover before it can fire again.

## Why differentiable matters

A differentiable model is one you can learn through. Every step from electrode current to spike is written so that a learning algorithm can ask how a small change in the stimulation would change the firing, and adjust accordingly. That turns the twin from a simulator into a building block. It is what lets me train decoders that read the twin's firing as speech (the next chapter) and encoders that design stimulation for one person's nerve.

Running in PyTorch on a GPU also lets the twin simulate the large amounts of speech that training those models requires.

## What the model contains

For readers who want the details, each twin combines:

- intracochlear anatomy segmented from post-operative CT, with the electrode contacts localized in the same scan;
- a volume-conduction model of the electric field each contact produces;
- regional fiber survival and thresholds fitted to the recipient's ECAP growth functions;
- a stochastic population model of auditory-nerve fibers with refractoriness and facilitation, driven pulse by pulse by the recipient's own clinical program.

The first three are the lab's work. The fiber model is my differentiable PyTorch implementation of the lab's model.

## What comes next

A twin is only useful if it behaves like the person it represents. Next, I am checking the twins against more of each person's physiology, such as how widely each electrode's excitation spreads along the nerve and how quickly fibers recover between pulses, and measuring how far their predictions move when their inputs are uncertain.
