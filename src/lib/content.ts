import { getCollection } from 'astro:content';

/** The published (non-draft) entries of a collection, in their `order`. */
export async function getOrderedEntries<C extends 'research' | 'projects'>(collection: C) {
  const entries = await getCollection(collection, ({ data }) => !data.draft);
  return entries.sort((a, b) => a.data.order - b.data.order);
}
