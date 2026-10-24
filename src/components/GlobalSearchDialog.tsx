import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  searchCatalog,
  type GlobalSearchCommand,
  type GlobalSearchMatch,
} from "../lib/globalSearch";
import type { LiveChannel, Movie, Series } from "../types";
import { t, useT } from "../lib/i18n";
import { sectionLabel } from "../lib/sectionLabel";
import { Icon, type IconName } from "./common";

interface CommandOption {
  command: GlobalSearchCommand;
  icon: IconName;
  label: string;
  keywords: string;
}

export function GlobalSearchDialog({
  channels,
  movies,
  series,
  showAdultContent,
  canRefresh,
  onClose,
  onRunCommand,
  onSelectResult,
}: {
  channels: LiveChannel[];
  movies: Movie[];
  series: Series[];
  showAdultContent: boolean;
  canRefresh: boolean;
  onClose: () => void;
  onRunCommand: (command: GlobalSearchCommand) => void;
  onSelectResult: (result: GlobalSearchMatch) => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const optionsRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const tr = useT();
  const commands: CommandOption[] = useMemo(() => [
    { command: { kind: "navigate", section: "Home" }, icon: "home", label: tr("search.goHome"), keywords: "home start" },
    { command: { kind: "navigate", section: "Live TV" }, icon: "live_tv", label: tr("search.goLive"), keywords: "channels live" },
    { command: { kind: "navigate", section: "TV Guide" }, icon: "schedule", label: tr("search.goGuide"), keywords: "epg guide programmes listings" },
    { command: { kind: "navigate", section: "Movies" }, icon: "movie", label: tr("search.goMovies"), keywords: "films cinema" },
    { command: { kind: "navigate", section: "Series" }, icon: "tv", label: tr("search.goSeries"), keywords: "shows tv" },
    { command: { kind: "navigate", section: "Library" }, icon: "bookmark", label: tr("search.goLibrary"), keywords: "watchlist favorites" },
    { command: { kind: "navigate", section: "Downloads" }, icon: "download", label: tr("search.goDownloads"), keywords: "offline saved videos" },
    { command: { kind: "navigate", section: "Settings" }, icon: "settings", label: tr("search.goSettings"), keywords: "preferences theme" },
    { command: { kind: "add-source" }, icon: "add", label: tr("search.addSource"), keywords: "playlist connect" },
    ...(canRefresh
      ? [{ command: { kind: "refresh-source" } as const, icon: "refresh" as const, label: tr("search.refresh"), keywords: "sync update catalog" }]
      : []),
  ], [canRefresh, tr]);
  const normalizedQuery = query.trim().toLowerCase();
  const results = useMemo(
    () => searchCatalog(query, channels, movies, series, showAdultContent),
    [channels, movies, query, series, showAdultContent],
  );
  const matchingCommands = commands.filter((option) =>
    !normalizedQuery || `${option.label} ${option.keywords}`.toLowerCase().includes(normalizedQuery),
  );
  const hasResults = Object.values(results).some((group) => group.items.length > 0);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function focusOption(current: HTMLElement | null, offset: number) {
    const options = Array.from(
      optionsRef.current?.querySelectorAll<HTMLButtonElement>("[data-global-search-option]") ?? [],
    );
    if (options.length === 0) return;
    const currentIndex = current ? options.findIndex((option) => option === current) : -1;
    const nextIndex = currentIndex < 0
      ? offset < 0 ? options.length - 1 : 0
      : (currentIndex + offset + options.length) % options.length;
    options[nextIndex]?.focus();
  }

  function handleDialogKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>("input:not([disabled]), button:not([disabled])") ?? [],
    );
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function handleInputKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      focusOption(null, event.key === "ArrowDown" ? 1 : -1);
    }
  }

  function handleOptionKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      focusOption(event.currentTarget, event.key === "ArrowDown" ? 1 : -1);
    }
  }

  function renderMatch(result: GlobalSearchMatch) {
    const typeLabel = result.type === "LIVE" ? t("search.kindChannel") : result.type === "MOVIE" ? t("card.kindMovie") : t("card.kindSeries");
    const iconName = result.type === "LIVE" ? "live_tv" : result.type === "MOVIE" ? "movie" : "tv";
    const actionLabel = result.type === "LIVE" ? t("player.play") : t("home.viewDetails");
    return (
      <button
        aria-label={result.type === "LIVE"
          ? t("card.play", { name: result.item.name })
          : t(result.type === "MOVIE" ? "search.viewMovie" : "search.viewSeries", { name: result.item.name })}
        className="global-search-option"
        data-global-search-option
        key={`${result.type}:${result.item.id}`}
        onClick={() => onSelectResult(result)}
        onKeyDown={handleOptionKeyDown}
        type="button"
      >
        <span className="global-search-option-icon"><Icon name={iconName} /></span>
        <span className="global-search-option-copy">
          <strong>{result.item.name}</strong>
          <small>{typeLabel} · {result.category} · {actionLabel}</small>
        </span>
        <Icon name="arrow_forward" />
      </button>
    );
  }

  function renderGroup(title: string, id: string, items: GlobalSearchMatch[], hasMore: boolean) {
    if (items.length === 0) return null;
    return (
      <section aria-labelledby={id} className="global-search-group">
        <h3 id={id}>{title}</h3>
        <div className="global-search-options">
          {items.map(renderMatch)}
        </div>
        {hasMore && <p className="global-search-more">{t("search.more")}</p>}
      </section>
    );
  }

  return (
    <div className="global-search-overlay">
      <button
        aria-label={t("search.close")}
        className="global-search-scrim"
        onClick={onClose}
        tabIndex={-1}
        type="button"
      />
      <section
        aria-labelledby="global-search-title"
        aria-modal="true"
        className="global-search-dialog"
        onKeyDown={handleDialogKeyDown}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        <header className="global-search-header">
          <div>
            <h2 id="global-search-title">{t("search.title")}</h2>
            <p>{t("search.subtitle")}</p>
          </div>
          <button aria-label={t("search.close")} className="icon-button" onClick={onClose} type="button">
            <Icon name="close" />
          </button>
        </header>
        <label className="global-search-input">
          <Icon name="search" />
          <span className="sr-only">{t("search.srLabel")}</span>
          <input
            autoComplete="off"
            autoFocus
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder={t("search.placeholder")}
            ref={inputRef}
            type="search"
            value={query}
          />
          <kbd aria-hidden="true">ESC</kbd>
        </label>
        <div className="global-search-results" ref={optionsRef}>
          {matchingCommands.length > 0 && (
            <section aria-labelledby="global-search-actions" className="global-search-group">
              <h3 id="global-search-actions">{normalizedQuery ? t("search.actions") : t("search.quick")}</h3>
              <div className="global-search-options">
                {matchingCommands.map((option) => (
                  <button
                    className="global-search-option"
                    data-global-search-option
                    key={option.label}
                    onClick={() => onRunCommand(option.command)}
                    onKeyDown={handleOptionKeyDown}
                    type="button"
                  >
                    <span className="global-search-option-icon"><Icon name={option.icon} /></span>
                    <span className="global-search-option-copy">
                      <strong>{option.label}</strong>
                      <small>{t("search.quickAction")}</small>
                    </span>
                    <Icon name="arrow_forward" />
                  </button>
                ))}
              </div>
            </section>
          )}
          {normalizedQuery && (
            <>
              {renderGroup(sectionLabel("Live TV"), "global-search-channels", results.channels.items, results.channels.hasMore)}
              {renderGroup(sectionLabel("Movies"), "global-search-movies", results.movies.items, results.movies.hasMore)}
              {renderGroup(sectionLabel("Series"), "global-search-series", results.series.items, results.series.hasMore)}
            </>
          )}
          {normalizedQuery && matchingCommands.length === 0 && !hasResults && (
            <p className="global-search-empty">{t("search.noMatches")}</p>
          )}
          {!normalizedQuery && matchingCommands.length === 0 && (
            <p className="global-search-empty">{t("search.noActions")}</p>
          )}
        </div>
        <footer className="global-search-footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> {t("search.navigate")}</span>
          <span><kbd>Enter</kbd> {t("search.open")}</span>
          <span><kbd>Ctrl/⌘</kbd><kbd>K</kbd> {t("search.searchKey")}</span>
        </footer>
      </section>
    </div>
  );
}
