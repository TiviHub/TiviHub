import { useRef, useState } from "react";
import { t } from "../lib/i18n";
import {
  createPinRecord, isPinRecord, MAX_PIN_FAILURES, pinLockRemaining, verifyPin, type PinRecord,
} from "../lib/parentalPin";

// shortcut: the PIN record sits in localStorage next to the toggle it guards, and the wait after wrong
// PINs resets when the app restarts. Fine for a child lock; move to the encrypted `secrets` store if it must resist more.
const STORAGE_KEY = "tivihub.web.parental-pin";

export type PinCheck = "ok" | "wrong" | { lockedSeconds: number };

export function readPinRecord(): PinRecord | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const value: unknown = raw ? JSON.parse(raw) : null;
    return isPinRecord(value) ? value : null;
  } catch (cause) {
    console.error("Could not read the local PIN", cause);
    return null;
  }
}

export function useParentalPin(notify: (message: string, kind: "error" | "notice") => void) {
  const [record, setRecord] = useState<PinRecord | null>(readPinRecord);
  const attempts = useRef({ failures: 0, lastFailureAt: 0 });

  async function check(pin: string): Promise<PinCheck> {
    if (!record) return "ok";
    const wait = pinLockRemaining(attempts.current.failures, attempts.current.lastFailureAt, Date.now());
    if (wait > 0) return { lockedSeconds: Math.ceil(wait / 1000) };
    if (attempts.current.failures >= MAX_PIN_FAILURES) attempts.current.failures = 0;
    if (await verifyPin(pin, record)) {
      attempts.current.failures = 0;
      return "ok";
    }
    attempts.current = { failures: attempts.current.failures + 1, lastFailureAt: Date.now() };
    const next = pinLockRemaining(attempts.current.failures, attempts.current.lastFailureAt, Date.now());
    return next > 0 ? { lockedSeconds: Math.ceil(next / 1000) } : "wrong";
  }

  function save(next: PinRecord | null): boolean {
    try {
      if (next) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch (cause) {
      console.error("Could not save the local PIN", cause);
      notify(t("pin.saveFailed"), "error");
      return false;
    }
    setRecord(next);
    return true;
  }

  async function setPin(pin: string): Promise<boolean> {
    return save(await createPinRecord(pin));
  }

  async function clearPin(pin: string): Promise<PinCheck> {
    const result = await check(pin);
    if (result === "ok") save(null);
    return result;
  }

  return { pinSet: record !== null, check, setPin, clearPin };
}

export type ParentalPin = ReturnType<typeof useParentalPin>;
