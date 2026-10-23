export interface CatalogImportSummary {
  occurredAt: string;
  provider: "M3U" | "XTREAM" | "STALKER";
  elapsedMillis: number;
  channels: number;
  movies: number;
  series: number;
  episodes: number | null;
}

const STORAGE_KEY = "tivihub.catalog-import-log.v1";
const MAX_ENTRIES = 20;
let eventCache: CatalogImportSummary[] | null = null;
let storageAvailable = true;

function isCatalogImportSummary(value: unknown): value is CatalogImportSummary {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Partial<CatalogImportSummary>;
  return typeof entry.occurredAt === "string" &&
    (entry.provider === "M3U" || entry.provider === "XTREAM" || entry.provider === "STALKER") &&
    isNonNegativeSafeInteger(entry.elapsedMillis) &&
    isNonNegativeSafeInteger(entry.channels) &&
    isNonNegativeSafeInteger(entry.movies) &&
    isNonNegativeSafeInteger(entry.series) &&
    (entry.episodes === null || isNonNegativeSafeInteger(entry.episodes));
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function loadEntries(): CatalogImportSummary[] {
  if (eventCache) return eventCache;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      eventCache = [];
      return eventCache;
    }
    const parsed: unknown = JSON.parse(stored);
    eventCache = Array.isArray(parsed)
      ? parsed.filter(isCatalogImportSummary).slice(-MAX_ENTRIES)
      : [];
  } catch {
    storageAvailable = false;
    eventCache = [];
  }
  return eventCache;
}

export function recordCatalogImportSummary(
  summary: Omit<CatalogImportSummary, "occurredAt">,
): void {
  const entry = { ...summary, occurredAt: new Date().toISOString() };
  if (!isCatalogImportSummary(entry)) {
    throw new Error("Catalog import diagnostics must contain valid counts and duration.");
  }
  eventCache = [...loadEntries(), entry].slice(-MAX_ENTRIES);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(eventCache));
  } catch {
    storageAvailable = false;
    console.error("Could not save sanitized catalog import diagnostics on this device.");
  }
}

export function getCatalogImportLogSnapshot(): {
  entries: CatalogImportSummary[];
  storageAvailable: boolean;
} {
  return {
    entries: [...loadEntries()],
    storageAvailable,
  };
}
