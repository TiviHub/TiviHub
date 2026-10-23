import type { Movie, Series } from "../types";

export type CatalogSort = "name" | "added" | "year" | "rating";

type SortableCatalogItem = Movie | Series;

const nameCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

function compareNames(left: SortableCatalogItem, right: SortableCatalogItem): number {
  return nameCollator.compare(left.name, right.name);
}

function compareDescending(
  left: number | undefined,
  right: number | undefined,
): number {
  if (left === undefined) return right === undefined ? 0 : 1;
  if (right === undefined) return -1;
  return right - left;
}

function yearOf(item: SortableCatalogItem): number | undefined {
  if (item.year !== undefined) return item.year;
  const matches = item.name.match(/\b(?:18|19|20|21|22)\d{2}\b/g);
  return matches?.length ? Number(matches[matches.length - 1]) : undefined;
}

export function sortCatalogItems<T extends SortableCatalogItem>(
  items: T[],
  sort: CatalogSort,
): T[] {
  if (sort === "name") return [...items].sort(compareNames);

  return items
    .map((item) => ({
      item,
      value: sort === "added"
        ? item.addedAtMillis
        : sort === "year"
          ? yearOf(item)
          : item.rating,
    }))
    .sort((left, right) =>
      compareDescending(left.value, right.value) || compareNames(left.item, right.item))
    .map(({ item }) => item);
}

export function topCatalogItems<T extends SortableCatalogItem>(
  items: readonly T[],
  sort: "added" | "rating",
  limit: number,
): T[] {
  if (!Number.isSafeInteger(limit) || limit < 1) {
    throw new RangeError("The top item limit must be a positive integer.");
  }

  const top: T[] = [];
  const valueOf = (item: T) => sort === "added" ? item.addedAtMillis : item.rating;
  const compare = (left: T, right: T) =>
    compareDescending(valueOf(left), valueOf(right)) || compareNames(left, right);

  for (const item of items) {
    const value = valueOf(item);
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) continue;

    const insertAt = top.findIndex((current) => compare(item, current) < 0);
    if (insertAt === -1) {
      if (top.length < limit) top.push(item);
      continue;
    }

    top.splice(insertAt, 0, item);
    if (top.length > limit) top.pop();
  }

  return top;
}
