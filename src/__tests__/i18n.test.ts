// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { formatDateTime, getLocale, isLocale, LOCALES, setLocale, t, tCount } from "../lib/i18n";
import { catalogs } from "../locales";

describe("i18n", () => {
  afterEach(() => { setLocale("en"); });

  it("switches language and remembers it", () => {
    setLocale("nl");
    expect(t("settings.theme.dark")).toBe("Donker");
    expect(getLocale()).toBe("nl");
    expect(window.localStorage.getItem("tivihub.web.locale")).toBe("nl");
    expect(document.documentElement.lang).toBe("nl");
  });

  it("fills {name} placeholders and leaves unknown ones visible", () => {
    const dictionary = catalogs.en as Record<string, string>;
    dictionary["test.greeting"] = "Hello {name}, {missing}";
    try {
      expect(t("test.greeting" as never, { name: "Ana" })).toBe("Hello Ana, {missing}");
    } finally {
      delete dictionary["test.greeting"];
    }
  });

  it("picks the singular or plural text and formats the count", () => {
    expect(tCount("settings.downloads.saved", 1)).toBe("1 saved video");
    expect(tCount("settings.downloads.saved", 1234)).toBe("1,234 saved videos");
    setLocale("de");
    expect(tCount("settings.downloads.saved", 0)).toBe("0 gespeicherte Videos");
  });

  it("formats dates in the app language", () => {
    const millis = Date.UTC(2026, 0, 15, 12, 0);
    setLocale("en");
    const english = formatDateTime(millis, "medium");
    setLocale("de");
    expect(formatDateTime(millis, "medium")).not.toBe(english);
  });

  it("keeps the same {placeholders} in every language", () => {
    const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort().join(",");
    const problems: string[] = [];
    for (const locale of LOCALES) {
      for (const [key, english] of Object.entries(catalogs.en)) {
        const translated = (catalogs[locale.value] as Record<string, string>)[key];
        if (!translated?.trim()) problems.push(`${locale.value}: ${key} is empty`);
        else if (placeholders(translated) !== placeholders(english)) problems.push(`${locale.value}: ${key} has other placeholders`);
      }
    }
    expect(problems).toEqual([]);
  });

  it("only accepts known languages", () => {
    expect(isLocale("fr")).toBe(true);
    expect(isLocale("xx")).toBe(false);
    expect(LOCALES).toHaveLength(7);
  });
});
