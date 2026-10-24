export const diagnosticOperations = [
  "m3u-playlist",
  "xtream-catalog",
  "xmltv-guide",
  "stalker-portal",
  "subtitle-search",
  "subtitle-download",
] as const;

export type DiagnosticOperation = (typeof diagnosticOperations)[number];
export type DiagnosticFailureKind = "network" | "http" | "invalid-response";

export interface DiagnosticLogEntry {
  occurredAt: string;
  operation: DiagnosticOperation;
  kind: DiagnosticFailureKind;
  httpStatus?: number;
}

const STORAGE_KEY = "tivihub.diagnostic-log.v1";
const MAX_ENTRIES = 100;
let eventCache: DiagnosticLogEntry[] | null = null;
let storageAvailable = true;

function isDiagnosticLogEntry(value: unknown): value is DiagnosticLogEntry {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Partial<DiagnosticLogEntry>;
  return typeof entry.occurredAt === "string" &&
    diagnosticOperations.includes(entry.operation as DiagnosticOperation) &&
    (entry.kind === "network" || entry.kind === "http" || entry.kind === "invalid-response") &&
    (entry.httpStatus === undefined ||
      (Number.isSafeInteger(entry.httpStatus) && entry.httpStatus >= 100 && entry.httpStatus <= 599));
}

function loadEntries(): DiagnosticLogEntry[] {
  if (eventCache) return eventCache;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      eventCache = [];
      return eventCache;
    }
    const parsed: unknown = JSON.parse(stored);
    eventCache = Array.isArray(parsed) ? parsed.filter(isDiagnosticLogEntry).slice(-MAX_ENTRIES) : [];
  } catch {
    storageAvailable = false;
    eventCache = [];
  }
  return eventCache;
}

export function recordDiagnosticFailure(
  operation: DiagnosticOperation,
  kind: DiagnosticFailureKind,
  httpStatus?: number,
): void {
  if (kind === "http" && (
    typeof httpStatus !== "number" ||
    !Number.isSafeInteger(httpStatus) ||
    httpStatus < 100 ||
    httpStatus > 599
  )) {
    throw new Error("HTTP diagnostic events require a valid status code.");
  }
  const entries = loadEntries();
  const entry: DiagnosticLogEntry = {
    occurredAt: new Date().toISOString(),
    operation,
    kind,
    ...(kind === "http" ? { httpStatus } : {}),
  };
  eventCache = [...entries, entry].slice(-MAX_ENTRIES);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(eventCache));
  } catch {
    storageAvailable = false;
    console.error("Could not save sanitized diagnostic events on this device.");
  }
}

export function getDiagnosticLogSnapshot(): {
  entries: DiagnosticLogEntry[];
  storageAvailable: boolean;
} {
  return {
    entries: [...loadEntries()],
    storageAvailable,
  };
}
