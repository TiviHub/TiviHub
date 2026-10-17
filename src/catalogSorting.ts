import type { Movie, Series } from "./types";

export type CatalogSort = "name" | "added" | "year" | "rating";

type SortableCatalogItem = Movie | Series;

function compareNames(left: SortableCatalogItem, right: SortableCatalogItem): number {
  return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" });
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
  return [...items].sort((left, right) => {
    if (sort === "name") return compareNames(left, right);

    const leftValue = sort === "added"
      ? left.addedAtMillis
      : sort === "year"
        ? yearOf(left)
        : left.rating;
    const rightValue = sort === "added"
      ? right.addedAtMillis
      : sort === "year"
        ? yearOf(right)
        : right.rating;
    const comparison = compareDescending(leftValue, rightValue);
    return comparison || compareNames(left, right);
  });
}
