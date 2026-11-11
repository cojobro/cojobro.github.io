/**
 * Copy for the research page that is not a chapter. Each chapter is a Markdown file in
 * `src/content/research/`.
 */

export const researchPage = {
  /** The legend over the headline. */
  label: 'Research',
  title: 'Hearing, one nerve at a time',
  /** Opening paragraph(s) under the headline, written for everyone. */
  lede: [
    'About a million people hear through cochlear implants. Two of them can have the same device and understand speech very differently, and part of the reason may lie where the implant meets the nerve: the electrodes come to rest differently in every ear, and every nerve has its own pattern of surviving fibers.',
    'I build digital twins of those nerves: computer models of one person’s implanted ear that show what reaches their nerve, measure how much speech gets through, and help design stimulation that suits them.',
  ],
  /**
   * The color legend shared by every 3D scene (see `src/scenes/core/palette.ts`). Keys match the
   * palette's meaning colors; text says what each color stands for, in plain words.
   */
  legend: {
    signal: 'Electrical stimulation',
    spike: 'Nerve firing',
    decode: 'Models and decoding',
  },
  /** The link from a chapter to its own page. */
  more: 'Read the long version',
  /** Marks a chapter whose `status` is `exploratory`. */
  exploratory: 'Exploratory',
  earlierTitle: 'Earlier research',
  publicationsTitle: 'Publications',
  contactTitle: 'Get in touch',
} as const;
