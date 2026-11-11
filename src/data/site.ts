import type { NavItem, Profile } from './types';

/** Identity and contact details used across the site (header, footer, metadata). */
export const site = {
  name: 'Conor J. Brown',
  /** Default meta description (at most 160 characters); pages can pass their own. */
  description:
    'Conor J. Brown, a Ph.D. student at Vanderbilt, builds digital twins of the implanted auditory nerve to measure and personalize what cochlear implants deliver.',
  role: 'Ph.D. student, Electrical & Computer Engineering',
  affiliation: 'Vanderbilt University',
  location: 'Nashville, Tennessee',
  email: 'conor.j.brown@vanderbilt.edu',
  /** Spellings of the owner's name in author lists, highlighted in publication lists. */
  authorNames: ['Conor J. Brown', 'Conor Brown', 'Brown CJ', 'Brown C', 'C. J. Brown'],
  /** Public path of the CV PDF (a file in `public/files/`). */
  cvPdf: '/files/Conor_Brown_CV.pdf',
} as const;

/** Main navigation. Add a branch of the site here and create its page under `src/pages/`. */
export const nav: NavItem[] = [
  {
    label: 'Research',
    href: '/research/',
    description:
      'How a digital twin of each person’s hearing nerve can measure what a cochlear implant delivers, and help improve it.',
  },
  {
    label: 'CV',
    href: '/cv/',
    description: 'Education, research and teaching, publications and awards.',
  },
  {
    label: 'Projects',
    href: '/projects/',
    description: 'Things I’ve built outside the lab, from a CRT-television instrument to a drone.',
  },
];

export const profiles: Profile[] = [
  { label: 'GitHub', href: 'https://github.com/cojobro505', handle: 'cojobro505' },
  { label: 'LinkedIn', href: 'https://www.linkedin.com/in/conorjbrown/', handle: 'conorjbrown' },
  { label: 'ORCID', href: 'https://orcid.org/0009-0006-8499-5800', handle: '0009-0006-8499-5800' },
];
