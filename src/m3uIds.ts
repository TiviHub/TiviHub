import type { CatalogCandidate, CatalogSnapshot } from "./catalogRefresh";

interface Item {
  id: string;
  playlistId: string;
}

// M3U ids come from the line position, so one added line would shift every later id and move
// favorites, resume points and downloads onto the wrong title. Matching items keep their old id.
function carryIds<T extends Item>(
  next: T[],
  previous: T[],
  kind: string,
  keyOf: (item: T) => string,
): Map<string, string> {
  const unused = new Map<string, { ids: string[]; next: number }>();
  let highest = -1;
  for (const item of previous) {
    const key = keyOf(item);
    const queue = unused.get(key);
    if (queue) queue.ids.push(item.id);
    else unused.set(key, { ids: [item.id], next: 0 });
    const counter = Number(item.id.slice(item.id.lastIndexOf(":") + 1));
    if (Number.isInteger(counter)) highest = Math.max(highest, counter);
  }
  const renamed = new Map<string, string>();
  const fresh: T[] = [];
  for (const item of next) {
    const queue = unused.get(keyOf(item));
    const oldId = queue && queue.next < queue.ids.length ? queue.ids[queue.next++] : undefined;
    if (oldId === undefined) fresh.push(item);
    else renamed.set(item.id, oldId);
  }
  // Fresh ids start above every old one, so they can never collide with a carried-over id.
  for (const item of fresh) renamed.set(item.id, `${item.playlistId}:${kind}:${(highest += 1)}`);
  for (const item of next) item.id = renamed.get(item.id)!;
  return renamed;
}

/** Changes `next` in place. */
export function keepM3uIds(next: CatalogCandidate, previous: CatalogSnapshot): void {
  carryIds(next.channels, previous.channels, "live", (item) => item.streamUrl);
  carryIds(next.movies, previous.movies, "movie", (item) => item.streamUrl);
  const seriesIds = carryIds(next.series, previous.series, "series", (item) => item.name.toLocaleLowerCase());
  for (const episode of next.episodes ?? []) episode.seriesId = seriesIds.get(episode.seriesId) ?? episode.seriesId;
  carryIds(next.episodes ?? [], previous.episodes, "episode", (item) => item.streamUrl);
}
