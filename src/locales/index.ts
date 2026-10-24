import type { Locale } from "./area";
import { browse } from "./browse";
import { de } from "./de";
import { detail } from "./detail";
import { en } from "./en";
import { es } from "./es";
import { errors } from "./errors";
import { fr } from "./fr";
import { home } from "./home";
import { library } from "./library";
import { nl } from "./nl";
import { pt } from "./pt";
import { shell } from "./shell";
import { misc } from "./misc";
import { playback } from "./playback";
import { sources } from "./sources";
import { tr } from "./tr";

export type { Locale } from "./area";

// The settings texts are one file per language; every other area keeps all languages together (see `area`).
const settings = { en, nl, es, fr, de, pt, tr };

function merge(locale: Locale) {
  return { ...settings[locale], ...shell[locale], ...browse[locale], ...library[locale], ...detail[locale], ...sources[locale], ...errors[locale], ...home[locale], ...playback[locale], ...misc[locale] };
}

export type Messages = ReturnType<typeof merge>;
export type MessageKey = keyof Messages;

export const catalogs: Record<Locale, Messages> = {
  en: merge("en"),
  nl: merge("nl"),
  es: merge("es"),
  fr: merge("fr"),
  de: merge("de"),
  pt: merge("pt"),
  tr: merge("tr"),
};
