/**
 * Shapes of the site's structured data (the files beside this one). Long-form writing lives in
 * Markdown under `src/content/` instead; its schemas are in `src/content.config.ts`.
 */

export interface Link {
  label: string;
  href: string;
}

/** A branch of the site: a header link and a card on the home page. */
export interface NavItem extends Link {
  /** One short line for the home page card. */
  description: string;
}

/** A profile elsewhere on the web, shown in the header, footer and contact sections. */
export interface Profile extends Link {
  /** Short handle or identifier shown beside the label, e.g. an ORCID iD. */
  handle?: string;
}

/** A dated highlight for the home page, newest first. */
export interface NewsItem {
  /** "YYYY-MM", or "YYYY" when the month is not known. */
  date: string;
  text: string;
  href?: string;
}

export interface Education {
  /** e.g. "Ph.D., Electrical and Computer Engineering" */
  degree: string;
  institution: string;
  location: string;
  /** As displayed, e.g. "2025 – expected 2030". */
  period: string;
  /** Advisor, dissertation topic, GPA, distinctions: one line each. */
  details: string[];
}

export type PositionKind = 'research' | 'teaching' | 'clinical' | 'other';

export interface Position {
  title: string;
  organization: string;
  /** Lab or group, e.g. "Noble Lab". */
  group?: string;
  /** Link for the lab or group. */
  url?: string;
  location: string;
  /**
   * As displayed, e.g. "2023 – 2025"; omit when the dates are not known rather than guessing.
   * Entries are listed in array order (newest first).
   */
  period?: string;
  kind: PositionKind;
  /** What the work was, one achievement per line. */
  highlights: string[];
  /** Supporting material, e.g. a sample of the work or demo videos. */
  links?: Link[];
}

export interface Honor {
  year: string;
  title: string;
  organization: string;
  note?: string;
}

export type PublicationKind = 'journal' | 'conference' | 'poster' | 'presentation';
export type PublicationStatus = 'published' | 'accepted' | 'submitted' | 'in-preparation';

export interface Publication {
  /** Stable key; research entries list related publications by this id. */
  id: string;
  kind: PublicationKind;
  /** Author names as printed. The site owner's name (see `site.authorNames`) is highlighted. */
  authors: string[];
  title: string;
  /** Journal, proceedings or meeting, as printed. */
  venue: string;
  year: number;
  status: PublicationStatus;
  doi?: string;
  url?: string;
  /** Extra context, e.g. "Poster" or "Paper 14520-75". */
  note?: string;
}

/** Someone else's paper the site owner contributed to without authorship. */
export interface Contribution {
  /** What the site owner did, e.g. "Built the social-robot control system used in". */
  role: string;
  citation: string;
  doi?: string;
}

export interface SkillGroup {
  label: string;
  items: string[];
}
