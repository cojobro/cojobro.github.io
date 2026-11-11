/**
 * Copy for the home page that is not about its owner (that is `profile.ts`) and not on the
 * instrument (that is `instrument.ts`): the headings and short texts of its sections.
 */

/** The problem the research is about, stated right after the instrument. */
export const problem = {
  kicker: 'The problem',
  /** The statement, in three parts: the middle one is set in italics. */
  statement: [
    'Two people can have the same implant and understand speech ',
    'very differently',
    '.',
  ],
  paragraphs: [
    'About a million people hear through cochlear implants, and for many of them the device is life-changing. Yet one person follows a conversation on the phone, while another, with the same device, struggles to understand speech in a quiet room.',
    'Part of the reason may lie where the implant meets the nerve. The electrodes come to rest differently in every ear, and every nerve has its own pattern of surviving fibers. Clinicians can measure some of this, but no measurement tells them how much speech actually gets through.',
  ],
  /** The figure: two unrolled nerves under the same array. */
  figure: {
    title: 'The same 22 electrodes, two different nerves',
    caption:
      'A sketch, not data: the two nerves from the instrument above, unrolled. Each tick is a fiber. Where fibers are missing, an electrode’s current has nothing to speak to.',
    people: { a: 'Person A', b: 'Person B' },
    base: 'Base · high pitches',
    apex: 'Apex · low pitches',
    electrodes: 'Electrodes',
    fibers: 'Nerve fibers',
    gap: 'few fibers survive',
  },
} as const;

/** The list of current research chapters. */
export const work = {
  kicker: 'The research',
  title:
    'A digital twin of each person’s nerve, to measure what their implant delivers, and to help improve it.',
  intro:
    'I build digital twins: computer models of one person’s implanted ear. Four lines of work follow from them.',
  all: 'The whole story, with every scene',
  statusLabels: { active: 'Current', exploratory: 'Exploratory', earlier: 'Earlier' },
} as const;

export const about = {
  kicker: 'About',
  pathTitle: 'Several corners of biomedical engineering',
  interestsTitle: 'Interests',
} as const;

export const goal = {
  kicker: 'Where this is going',
} as const;

export const newsSection = {
  kicker: 'News',
  title: 'Lately',
} as const;

export const branches = {
  kicker: 'Elsewhere on this site',
} as const;
