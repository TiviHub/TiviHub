// A child lock for adult content, not strong security: whoever can read this device's files can remove it.
export interface PinRecord {
  salt: string;
  hash: string;
  iterations: number;
}

const PBKDF2_ITERATIONS = 120_000;
export const MAX_PIN_FAILURES = 5;
export const PIN_LOCK_MILLIS = 30_000;

export function isValidPin(pin: string): boolean {
  return /^\d{4,8}$/.test(pin);
}

export function isPinRecord(value: unknown): value is PinRecord {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.salt === "string" && typeof record.hash === "string" &&
    typeof record.iterations === "number" && Number.isInteger(record.iterations) && record.iterations > 0;
}

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(text), (character) => character.charCodeAt(0));
}

async function derive(pin: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

export async function createPinRecord(pin: string): Promise<PinRecord> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { salt: toBase64(salt), hash: toBase64(await derive(pin, salt, PBKDF2_ITERATIONS)), iterations: PBKDF2_ITERATIONS };
}

export async function verifyPin(pin: string, record: PinRecord): Promise<boolean> {
  const expected = fromBase64(record.hash);
  const actual = await derive(pin, fromBase64(record.salt), record.iterations);
  if (actual.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < actual.length; index += 1) difference |= actual[index] ^ expected[index];
  return difference === 0;
}

/** Milliseconds left of the wait after too many wrong PINs; 0 when a try is allowed. */
export function pinLockRemaining(failures: number, lastFailureAt: number, now: number): number {
  if (failures < MAX_PIN_FAILURES) return 0;
  return Math.max(0, lastFailureAt + PIN_LOCK_MILLIS - now);
}
