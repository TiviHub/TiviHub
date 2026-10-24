export type Locale = "en" | "nl" | "es" | "fr" | "de" | "pt" | "tr";
export type OtherLocale = Exclude<Locale, "en">;

// One area = the texts of one part of the app, all languages side by side.
// `others` must have exactly the keys of `en`, so a missing or extra translation is a type error.
export function area<K extends string>(
  en: Record<K, string>,
  others: Record<OtherLocale, Record<K, string>>,
): Record<Locale, Record<K, string>> {
  return { en, ...others };
}
