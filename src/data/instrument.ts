/**
 * Every word on the home page's instrument (`src/components/Instrument.astro`). What the
 * instrument does is in `src/instrument/`.
 */
export const instrument = {
  /**
   * The recording that plays (a file in `public/audio/`). The one shipped is a synthetic voice;
   * replace it with any few seconds of clear speech under the same name, and update
   * `note.transcript` below to match.
   */
  sample: '/audio/sentence.mp3',

  /** What the screen shows, for visitors who cannot see it. */
  description:
    'A drawing of a cochlea seen from above: a spiral lined with nerve fibers, with the 22 contacts of a cochlear implant’s electrode array threaded along its outer turn. While the recording plays, the contacts flash with current and the nerve fibers near them light up as they fire.',

  /** Screen-reader names of the play key, by state. */
  play: 'Play the recording',
  stop: 'Stop the recording',
  deckLabel: 'Instrument controls',

  /** The key on the screen that switches the way of listening, named for where it leads. */
  flip: {
    natural: 'Hear the healthy ear',
    implant: 'Back to the implant',
  },

  /** The line beside the play key, which walks the visitor through the experiment. */
  prompts: {
    idle: {
      title: 'Hear it for yourself',
      text: 'Play a sentence the way a cochlear implant might deliver it.',
    },
    implant: {
      title: 'Can you make out the words?',
      text: 'Switch to the healthy ear to check, then come back.',
    },
    natural: {
      title: 'The same sentence, as it was spoken',
      text: 'Now switch back to the implant. It is easier once you know the words.',
    },
    again: {
      title: 'Now change the implant, or the nerve',
      text: 'Use fewer electrodes, widen the current, or drag (or tap) along the nerve to remove fibers.',
    },
    unavailable: {
      title: 'Sound is not available here',
      text: 'This browser would not start the audio. The rest of the site works without it.',
    },
  },

  /** The two meaning colors on the screen: the same legend as the research scenes. */
  legend: {
    signal: 'Current from the implant',
    spike: 'Nerve fibers firing',
  },

  /** The label of the scrolling record at the foot of the screen, by way of listening. */
  record: {
    implant: 'Stimulation, by electrode',
    natural: 'Sound, by pitch',
  },

  controls: {
    listen: { label: 'Listen as', implant: 'Cochlear implant', natural: 'Healthy ear' },
    electrodes: 'Electrodes in use',
    spread: { label: 'Current spread', narrow: 'Narrow', medium: 'Medium', wide: 'Wide' },
    nerve: { label: 'Nerve', full: 'Intact', a: 'Person A', b: 'Person B' },
    source: {
      label: 'Sound',
      sentence: 'Sentence',
      voice: 'Your voice',
      recording: 'Recording',
      denied: 'No microphone',
    },
  },

  /** The fine print under the controls: what the instrument is, and is not. */
  note: {
    label: 'What this is',
    text: 'A sketch for the ear, not a simulation of anyone’s hearing. It is a channel vocoder, the method hearing scientists use to let people with ordinary hearing sample what an implant conveys: the sound is split into the implant’s channels, only the loudness of each is kept, and what reaches the nerve is played back as bands of noise. The cochlea and both “people” are stylized. My digital twins go much further: they model the nerve itself, a population of fibers, on a model of one person’s ear built from their own CT scan.',
    transcript:
      'The recording is a synthetic voice reading two of the Harvard sentences, a standard set for testing speech: “The birch canoe slid on the smooth planks. Glue the sheet to the dark blue background.” If you record your own voice, it is processed in your browser and never leaves it.',
  },
} as const;
