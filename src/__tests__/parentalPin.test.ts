import { describe, expect, it } from "vitest";
import {
  createPinRecord, isPinRecord, isValidPin, MAX_PIN_FAILURES, PIN_LOCK_MILLIS, pinLockRemaining, verifyPin,
} from "../lib/parentalPin";

describe("parental PIN", () => {
  it("accepts only 4 to 8 digits", () => {
    expect(["1234", "12345678"].every(isValidPin)).toBe(true);
    expect(["123", "123456789", "12a4", "", " 1234"].some(isValidPin)).toBe(false);
  });

  it("verifies the right PIN and rejects another one", async () => {
    const record = await createPinRecord("4821");
    expect(isPinRecord(record)).toBe(true);
    expect(await verifyPin("4821", record)).toBe(true);
    expect(await verifyPin("4822", record)).toBe(false);
  });

  it("does not store the PIN and salts every record", async () => {
    const [first, second] = await Promise.all([createPinRecord("4821"), createPinRecord("4821")]);
    expect(JSON.stringify(first)).not.toContain("4821");
    expect(first.hash).not.toBe(second.hash);
  });

  it("rejects a damaged stored record", () => {
    expect(isPinRecord(null)).toBe(false);
    expect(isPinRecord({ salt: "a", hash: "b" })).toBe(false);
    expect(isPinRecord({ salt: "a", hash: "b", iterations: 0 })).toBe(false);
  });

  it("makes you wait after too many wrong PINs, then lets you try again", () => {
    const at = 1_000;
    expect(pinLockRemaining(MAX_PIN_FAILURES - 1, at, at)).toBe(0);
    expect(pinLockRemaining(MAX_PIN_FAILURES, at, at + 1_000)).toBe(PIN_LOCK_MILLIS - 1_000);
    expect(pinLockRemaining(MAX_PIN_FAILURES, at, at + PIN_LOCK_MILLIS)).toBe(0);
  });
});
