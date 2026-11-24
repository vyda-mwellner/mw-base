export interface Group<T> {
  readonly name: string;
  readonly rows: T[];
}

/** Groups in the order they first show up, so the order of apps.json carries through. */
export function inGroups<T, R>(
  items: readonly T[],
  groupOf: (item: T) => string,
  row: (item: T) => R,
): Group<R>[] {
  const groups: Group<R>[] = [];
  for (const item of items) {
    const name = groupOf(item);
    const group = groups.find((candidate) => candidate.name === name);
    if (group) group.rows.push(row(item));
    else groups.push({ name, rows: [row(item)] });
  }
  return groups;
}
