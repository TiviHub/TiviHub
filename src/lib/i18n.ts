import { useSyncExternalStore } from "react";
import { catalogs, type Locale, type MessageKey } from "../locales";

export type { Locale };

// Each language is named in itself, so it can be found when the app is in a language you cannot read.
export const LOCALES: { value: Locale; name: string }[] = [
  { value: "en", name: "English" },
  { value: "nl", name: "Nederlands" },
  { value: "es", name: "Español" },
  { value: "fr", name: "Français" },
  { value: "de", name: "Deutsch" },
  { value: "pt", name: "Português" },
  { value: "tr", name: "Türkçe" },
];

// shortcut: all languages ship in the main bundle, split per language when the texts pass ~100 KB.

const STORAGE_KEY = "tivihub.web.locale";

export function isLocale(value: unknown): value is Locale {
  return LOCALES.some((entry) => entry.value === value);
}

function detectLocale(): Locale {
  // Outside a browser (the Node tests) the machine's language must not leak into the texts.
  if (typeof window === "undefined") return "en";
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (isLocale(saved)) return saved;
  } catch (error) {
    console.error("Could not read the local language preference", error);
  }
  const preferred = (typeof navigator === "undefined" ? "en" : navigator.language).slice(0, 2).toLowerCase();
  return isLocale(preferred) ? preferred : "en";
}

let current: Locale = detectLocale();
const listeners = new Set<() => void>();

export function getLocale(): Locale {
  return current;
}

// Switches first, then saves: throws when the save fails, so the caller can tell the user.
export function setLocale(locale: Locale): void {
  current = locale;
  document.documentElement.lang = locale;
  listeners.forEach((listener) => listener());
  window.localStorage.setItem(STORAGE_KEY, locale);
}

function translate(locale: Locale, key: MessageKey, vars?: Record<string, string | number>): string {
  const text = catalogs[locale][key];
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, name: string) => (name in vars ? String(vars[name]) : match));
}

export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  return translate(current, key, vars);
}

const boundByLocale = new Map<Locale, typeof t>();

// A `t` that is a new function when the language changes: use it inside useMemo and list it in the dependencies.
export function useT(): typeof t {
  const locale = useLocale();
  let bound = boundByLocale.get(locale);
  if (!bound) {
    bound = (key, vars) => translate(locale, key, vars);
    boundByLocale.set(locale, bound);
  }
  return bound;
}

// Dates follow the app language, not the system one.
export function formatDateTime(millis: number, style: "short" | "medium" = "short"): string {
  return new Date(millis).toLocaleString(current, { dateStyle: style, timeStyle: "short" });
}

export function formatTimeOfDay(millis: number): string {
  return new Date(millis).toLocaleTimeString(current, { hour: "2-digit", minute: "2-digit" });
}

export function formatDate(millis: number, options: Intl.DateTimeFormatOptions): string {
  return new Date(millis).toLocaleDateString(current, options);
}

export function formatNumber(value: number): string {
  return value.toLocaleString(current);
}

// shortcut: one/other only; fine for these seven languages, add Intl.PluralRules for Arabic or Russian.
export function tCount(base: string, count: number): string {
  return t(`${base}${count === 1 ? "One" : "Other"}` as MessageKey, { count: formatNumber(count) });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

// Components call this so they render again when the language changes.
export function useLocale(): Locale {
  return useSyncExternalStore(subscribe, getLocale);
}
