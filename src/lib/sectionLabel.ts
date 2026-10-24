import type { MessageKey } from "../locales";
import { t } from "./i18n";
import type { SearchSection } from "./globalSearch";

const keys: Record<SearchSection, MessageKey> = {
  "Home": "nav.home",
  "Live TV": "nav.liveTv",
  "TV Guide": "nav.tvGuide",
  "Movies": "nav.movies",
  "Series": "nav.series",
  "Library": "nav.library",
  "Downloads": "nav.downloads",
  "Settings": "nav.settings",
};

// The section name is an id used all over the app; only what the person reads is translated.
export function sectionLabel(section: SearchSection): string {
  return t(keys[section]);
}
