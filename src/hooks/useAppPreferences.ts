import { useEffect, useState } from "react";
import { t } from "../lib/i18n";
import { readPinRecord } from "./useParentalPin";

export type ThemePreference = "system" | "light" | "dark";

function readThemePreference(): ThemePreference {
  try {
    const saved = window.localStorage.getItem("tivihub.web.theme");
    return saved === "system" || saved === "light" || saved === "dark" ? saved : "dark";
  } catch (error) {
    console.error("Could not read the local theme preference", error);
    return "dark";
  }
}

function readShowAdultContent(): boolean {
  // With a PIN set, adult content is locked again every time the app starts.
  if (readPinRecord()) return false;
  try {
    return window.localStorage.getItem("tivihub.web.show-adult-content") === "true";
  } catch (error) {
    console.error("Could not read the local adult-content preference", error);
    return false;
  }
}

export function useAppPreferences(notify: (message: string, kind: "error" | "notice") => void) {
  const [theme, setTheme] = useState<ThemePreference>(readThemePreference);
  const [showAdultContent, setShowAdultContent] = useState(readShowAdultContent);

  useEffect(() => {
    const systemTheme = window.matchMedia("(prefers-color-scheme: dark)");
    const applyTheme = () => {
      const dark = theme === "system" ? systemTheme.matches : theme === "dark";
      document.documentElement.dataset.theme = dark ? "dark" : "light";
      document.querySelector('meta[name="theme-color"]')?.setAttribute(
        "content",
        dark ? "#09080f" : "#f8f8fa",
      );
    };
    applyTheme();
    if (theme !== "system") return;
    systemTheme.addEventListener("change", applyTheme);
    return () => systemTheme.removeEventListener("change", applyTheme);
  }, [theme]);

  function chooseTheme(value: ThemePreference) {
    setTheme(value);
    try {
      window.localStorage.setItem("tivihub.web.theme", value);
    } catch (cause) {
      console.error("Could not save the local theme preference", cause);
      notify(t("prefs.themeSaveFailed"), "error");
    }
  }

  function chooseShowAdultContent(value: boolean) {
    setShowAdultContent(value);
    try {
      window.localStorage.setItem("tivihub.web.show-adult-content", String(value && !readPinRecord()));
    } catch (cause) {
      console.error("Could not save the local adult-content preference", cause);
      notify(t("prefs.adultSaveFailed"), "error");
    }
  }

  return { theme, showAdultContent, chooseTheme, chooseShowAdultContent };
}
