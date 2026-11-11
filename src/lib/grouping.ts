/** A titled group of items that share a `kind`. */
export interface KindGroup<K extends string, T> {
  kind: K;
  title: string;
  items: T[];
}

/**
 * Splits items into groups by their `kind`, in the order of `titles` (whose keys must cover every
 * kind, so a new kind cannot be forgotten). Item order is kept; empty groups are left out.
 */
export function groupByKind<K extends string, T extends { kind: K }>(
  items: readonly T[],
  titles: Record<K, string>,
): KindGroup<K, T>[] {
  return (Object.keys(titles) as K[])
    .map((kind) => ({
      kind,
      title: titles[kind],
      items: items.filter((item) => item.kind === kind),
    }))
    .filter((group) => group.items.length > 0);
}
