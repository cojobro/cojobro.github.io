import { publications } from '@/data/cv';
import { site } from '@/data/site';
import type { Publication } from '@/data/types';

/** The publications with these ids, in the given order. An unknown id fails the build. */
export function publicationsByIds(ids: readonly string[]): Publication[] {
  return ids.map((id) => {
    const publication = publications.find((candidate) => candidate.id === id);
    if (!publication) throw new Error(`Unknown publication id "${id}" (see src/data/cv.ts).`);
    return publication;
  });
}

/** Whether an author name, as printed, is the site owner's. */
export function isOwnName(author: string): boolean {
  return (site.authorNames as readonly string[]).includes(author);
}
