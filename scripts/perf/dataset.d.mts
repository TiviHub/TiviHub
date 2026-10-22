export interface DatasetSize {
  channels: number;
  movies: number;
  series: number;
}
export const SIZES: Record<"S" | "M" | "L" | "XL", DatasetSize>;
export function seededRandom(seed: number): () => number;
export function categories(kind: "live" | "vod" | "series"): Array<Record<string, unknown>>;
export function liveStreams(count: number, seed?: number): Generator<Record<string, unknown>>;
export function vodStreams(count: number, seed?: number): Generator<Record<string, unknown>>;
export function seriesList(count: number, seed?: number): Generator<Record<string, unknown>>;
export function seriesInfo(seriesId: number, seed?: number): Record<string, unknown>;
export function userInfo(username: string): Record<string, unknown>;
export function jsonArrayChunks(rows: Iterable<unknown>, chunkRows?: number): Generator<string>;
export function sizeFor(name: string): DatasetSize;
