/** Who the site owner is and where they are headed: the home page and About copy. */

/** One sentence under the name on the home page. */
export const tagline =
  'I build digital twins of the hearing nerve, so that each cochlear implant can be measured, and tuned, for the person who hears through it.';

/** Short introduction for the home page, one string per paragraph. */
export const bio: string[] = [
  'I’m a Ph.D. student in Electrical and Computer Engineering at Vanderbilt University, in Jack Noble’s lab, and a predoctoral trainee on an NIH training grant. I build digital twins of the hearing nerve: models of each cochlear implant user’s own nerve, built on the lab’s CT-based models of their inner ear. Two people with the same implant can understand speech very differently. A twin lets me measure how much speech a person’s implant gets through, and search for stimulation that gets more through.',
  'I came to this through several corners of biomedical engineering. I stained and tested engineered heart tissue at the University of Alabama at Birmingham, worked as a medical assistant at a rural clinic in Naknek, Alaska, where I was also the one the staff called when the equipment failed, and built AI tools for dementia caregivers and for cancer genetic-risk assessment at the University of Tennessee, Knoxville. Neural engineering is where those threads meet: devices that give back a lost sense by speaking to the nervous system in its own electrical language.',
];

/** Career goal, in the owner's voice. */
export const careerGoal =
  'I want to lead an academic lab that personalizes neuroprosthetic devices. Every neural implant meets a different nervous system, yet devices are still tuned largely by trial and error. I want to model each patient’s electrode–neural interface from their own scans and measurements, then use that model to predict what their device can deliver and to design stimulation that delivers more. The cochlear implant is my proving ground, because every part of the problem can be checked: the electrodes show up on a CT scan, the nerve’s response can be recorded through the implant itself, and hearing is measured with standard speech tests. From there, I want to carry the approach to other neuroprostheses, in both directions: what a device sends into the nervous system, and what it can record back.';

export const interests: string[] = [
  'Cochlear implants and hearing science',
  'Patient-specific digital twins',
  'Computational models of the auditory nerve',
  'Differentiable modeling and machine learning',
  'Neural decoding',
  'Digital signal processing',
  'Neuroprosthetics and electrode–neural interfaces',
  'Translational medical technology',
];

/** A stop on the way to the current work, for the home page's About section. */
export interface PathStep {
  place: string;
  /** As displayed, e.g. "2019 – 2021". */
  period: string;
  title: string;
  text: string;
}

/** How the owner came to neural engineering, in the order the bio tells it. */
export const path: PathStep[] = [
  {
    place: 'Birmingham, Alabama',
    period: '2019 – 2021',
    title: 'Engineered heart tissue',
    text: 'Began biomedical engineering at UAB. In Jianyi Zhang’s lab I stained heart tissue, helped fabricate cardiac patches and tested how strong they were.',
  },
  {
    place: 'Naknek, Alaska',
    period: '2022',
    title: 'A rural clinic',
    text: 'Medical assistant at Camai Community Health Center: drawing blood, suturing, taking X-rays, and fixing the equipment when it failed.',
  },
  {
    place: 'Knoxville, Tennessee',
    period: '2021 – 2025',
    title: 'AI for care',
    text: 'A B.S. in biomedical engineering at the University of Tennessee, then AI tools for dementia caregivers and for cancer genetic-risk assessment in Xiaopeng Zhao’s SMART Lab.',
  },
  {
    place: 'Nashville, Tennessee',
    period: '2025 – present',
    title: 'The hearing nerve',
    text: 'A Ph.D. at Vanderbilt in Jack Noble’s lab, building digital twins of the implanted auditory nerve.',
  },
];

/** The footer's invitation to write, and its note on how the site is made. */
export const colophon = {
  invitation: 'Questions, ideas, collaborations: write to me',
  text: 'Set in Newsreader, Archivo and JetBrains Mono. Built with Astro and three.js; the instrument on the home page is Web Audio and a canvas. Every drawing is procedural and stylized, not anyone’s anatomy.',
} as const;
