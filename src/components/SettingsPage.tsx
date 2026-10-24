import { useEffect, useState, type FormEvent } from "react";
import { decryptBackup, encryptBackup } from "../services/backup";
import { formatCatalogChangeSummary } from "../services/catalogRefresh";
import { createSnapshot, restoreSnapshot } from "../storage/database";
import { clearSubtitleCache, countSavedSubtitles } from "../services/subtitleService";
import { formatDateTime, LOCALES, setLocale, t, tCount, useLocale, type Locale } from "../lib/i18n";
import type { MessageKey } from "../locales";
import type { Playlist, UserDataSnapshot } from "../types";
import { Icon } from "./common";
import { BrowseShell } from "./BrowseShell";
import { EmptyPanel } from "./EmptyPanel";
import { NavPanel, type NavPanelItem } from "./NavPanel";

type ThemePreference = "system" | "light" | "dark";

const themeChoices: { value: ThemePreference; label: MessageKey; icon: "brightness_auto" | "dark_mode" | "light_mode" }[] = [
  { value: "system", label: "settings.theme.system", icon: "brightness_auto" },
  { value: "dark", label: "settings.theme.dark", icon: "dark_mode" },
  { value: "light", label: "settings.theme.light", icon: "light_mode" },
];

function refreshOutcomeLabel(outcome: NonNullable<Playlist["lastCatalogRefreshOutcome"]>): string {
  switch (outcome) {
    case "success": return t("settings.refresh.success");
    case "review-required": return t("settings.refresh.reviewRequired");
    case "kept-previous": return t("settings.refresh.keptPrevious");
    case "failed": return t("settings.refresh.failed");
  }
}

export function SettingsPage({
  theme,
  onChooseTheme,
  showAdultContent,
  onSetShowAdultContent,
  sources,
  activeSourceId,
  downloadDirectoryPath,
  completedDownloadCount,
  onChangeDownloadDirectory,
  onClearCompletedDownloads,
  onAddSource,
  onActivate,
  onEdit,
  onDelete,
  onRefreshSource,
  refreshing,
  version,
  isDesktopApp,
  updateStatus,
  availableUpdateVersion,
  onUpdateAction,
  apiKey,
  onSaveApiKey,
  mdblistApiKey = "",
  onSaveMdblistApiKey,
  onOpenExternalUrl,
  onDataRestored,
  onRefreshEpg,
  onDownloadDiagnostics,
}: {
  theme: ThemePreference;
  onChooseTheme: (theme: ThemePreference) => void;
  showAdultContent: boolean;
  onSetShowAdultContent: (show: boolean) => void;
  sources: Playlist[];
  activeSourceId: string | null;
  downloadDirectoryPath: string | null;
  completedDownloadCount: number;
  onChangeDownloadDirectory: () => void;
  onClearCompletedDownloads: () => void;
  onAddSource: () => void;
  onActivate: (id: string) => void;
  onEdit: (source: Playlist) => void;
  onDelete: (source: Playlist) => void;
  onRefreshSource: () => void;
  refreshing: boolean;
  version: string;
  isDesktopApp: boolean;
  updateStatus: "idle" | "checking" | "current" | "available" | "error";
  availableUpdateVersion: string | null;
  onUpdateAction: () => void;
  apiKey: string;
  onSaveApiKey: (apiKey: string) => Promise<void>;
  mdblistApiKey?: string;
  onSaveMdblistApiKey?: (apiKey: string) => Promise<void>;
  onOpenExternalUrl?: (url: string) => Promise<void> | void;
  onDataRestored: () => Promise<void>;
  onRefreshEpg: () => Promise<void>;
  onDownloadDiagnostics: () => Promise<boolean>;
}) {
  const [group, setGroup] = useState("sources");
  const [keyDraft, setKeyDraft] = useState(apiKey);
  const [keyNotice, setKeyNotice] = useState<string | null>(null);
  const [mdblistDraft, setMdblistDraft] = useState(mdblistApiKey);
  const [mdblistNotice, setMdblistNotice] = useState<string | null>(null);
  useEffect(() => setMdblistDraft(mdblistApiKey), [mdblistApiKey]);
  const [backupPassword, setBackupPassword] = useState("");
  const [backupConfirm, setBackupConfirm] = useState("");
  const [importPassword, setImportPassword] = useState("");
  const [backupFile, setBackupFile] = useState<File | null>(null);
  const [pendingSnapshot, setPendingSnapshot] = useState<UserDataSnapshot | null>(null);
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [backupNotice, setBackupNotice] = useState<string | null>(null);
  const [epgBusy, setEpgBusy] = useState(false);
  const [savedSubtitleCount, setSavedSubtitleCount] = useState(0);
  const [subtitleCacheNotice, setSubtitleCacheNotice] = useState<string | null>(null);
  const [diagnosticsBusy, setDiagnosticsBusy] = useState(false);
  const [diagnosticsNotice, setDiagnosticsNotice] = useState<string | null>(null);
  const locale = useLocale();
  const [languageError, setLanguageError] = useState<string | null>(null);

  function chooseLanguage(value: Locale) {
    setLanguageError(null);
    try {
      setLocale(value);
    } catch (cause) {
      console.error("Could not save the local language preference", cause);
      setLanguageError(t("settings.language.saveFailed"));
    }
  }

  async function downloadDiagnostics() {
    setDiagnosticsNotice(null);
    setDiagnosticsBusy(true);
    try {
      const storageAvailable = await onDownloadDiagnostics();
      setDiagnosticsNotice(storageAvailable
        ? t("settings.diagnostics.downloaded")
        : t("settings.diagnostics.downloadedPartial"));
    } catch {
      setDiagnosticsNotice(t("settings.diagnostics.failed"));
    } finally {
      setDiagnosticsBusy(false);
    }
  }

  useEffect(() => {
    void countSavedSubtitles().then(setSavedSubtitleCount, () => undefined);
  }, []);

  async function clearCache() {
    try {
      await clearSubtitleCache();
      setSavedSubtitleCount(0);
      setSubtitleCacheNotice(t("settings.subtitles.cleared"));
    } catch {
      setSubtitleCacheNotice(t("settings.subtitles.clearFailed"));
    }
  }

  async function saveKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setKeyNotice(null);
    try {
      await onSaveApiKey(keyDraft);
      setKeyNotice(keyDraft.trim() ? t("settings.subtitles.keySaved") : t("settings.subtitles.keyRemoved"));
    } catch (cause) {
      setKeyNotice(cause instanceof Error ? cause.message : t("settings.apiKey.saveFailed"));
    }
  }

  async function saveMdblistKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMdblistNotice(null);
    try {
      await onSaveMdblistApiKey?.(mdblistDraft);
      setMdblistNotice(mdblistDraft.trim() ? t("settings.ratings.keySaved") : t("settings.ratings.keyRemoved"));
    } catch (cause) {
      setMdblistNotice(cause instanceof Error ? cause.message : t("settings.apiKey.saveFailed"));
    }
  }

  async function exportBackup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBackupError(null);
    setBackupNotice(null);
    if (backupPassword !== backupConfirm) {
      setBackupError(t("settings.backup.mismatch"));
      return;
    }
    setBackupBusy(true);
    try {
      const snapshot = await createSnapshot(theme, showAdultContent);
      const encrypted = await encryptBackup(snapshot, backupPassword);
      const url = URL.createObjectURL(new Blob([encrypted], { type: "application/json" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `tivihub-backup-${new Date().toISOString().slice(0, 10)}.tivihub`;
      anchor.click();
      URL.revokeObjectURL(url);
      setBackupNotice(t("settings.backup.downloaded"));
      setBackupPassword("");
      setBackupConfirm("");
    } catch (cause) {
      setBackupError(cause instanceof Error ? cause.message : t("settings.backup.createFailed"));
    } finally {
      setBackupBusy(false);
    }
  }

  async function inspectBackup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBackupError(null);
    setBackupNotice(null);
    if (!backupFile) {
      setBackupError(t("settings.backup.chooseFile"));
      return;
    }
    if (backupFile.size > 100 * 1024 * 1024) {
      setBackupError(t("settings.backup.tooLarge"));
      return;
    }
    setBackupBusy(true);
    try {
      setPendingSnapshot(await decryptBackup(await backupFile.text(), importPassword));
    } catch (cause) {
      setBackupError(cause instanceof Error ? cause.message : t("settings.backup.readFailed"));
    } finally {
      setBackupBusy(false);
    }
  }

  async function applyBackup() {
    if (!pendingSnapshot) return;
    if (!window.confirm(t("settings.backup.confirmReplace"))) return;
    setBackupBusy(true);
    setBackupError(null);
    try {
      await restoreSnapshot(pendingSnapshot);
      onChooseTheme(pendingSnapshot.theme);
      onSetShowAdultContent(pendingSnapshot.showAdultContent ?? false);
      setKeyDraft(pendingSnapshot.openSubtitlesApiKey);
      await onDataRestored();
      setPendingSnapshot(null);
      setBackupFile(null);
      setImportPassword("");
      setBackupNotice(t("settings.backup.restored"));
    } catch (cause) {
      setBackupError(cause instanceof Error ? cause.message : t("settings.backup.restoreFailed"));
    } finally {
      setBackupBusy(false);
    }
  }

  const sections: NavPanelItem[] = [
    { id: "sources", label: t("settings.section.sources"), icon: "playlist_play", count: sources.length },
    { id: "appearance", label: t("settings.section.appearance"), icon: "dark_mode" },
    { id: "content-visibility", label: t("settings.section.adult"), icon: "shield" },
    { id: "downloads", label: t("settings.section.downloads"), icon: "download" },
    { id: "subtitles", label: t("settings.section.subtitles"), icon: "subtitles" },
    ...(onSaveMdblistApiKey ? [{ id: "ratings", label: t("settings.section.ratings"), icon: "high_quality" } as const] : []),
    { id: "data", label: t("settings.section.data"), icon: "backup" },
    { id: "privacy", label: t("settings.section.privacy"), icon: "lock" },
    ...(isDesktopApp ? [{ id: "updates", label: t("settings.section.updates"), icon: "refresh" } as const] : []),
  ];

  return (
    <BrowseShell
      bodyClassName="live-channel-list browse-list settings-body"
      label={t("settings.title")}
      nav={(
        <NavPanel
          items={sections}
          onSelect={setGroup}
          selectedId={group}
          title={t("settings.title")}
        />
      )}
      title={sections.find((entry) => entry.id === group)?.label ?? t("settings.title")}
    >
      <div className="settings-content">
          <section aria-labelledby="settings-appearance-heading" className="settings-group" id="settings-appearance" hidden={group !== "appearance"}>
            <div className="settings-card">
              <div className="settings-card-heading">
                <div className="settings-heading-icon"><Icon name="dark_mode" /></div>
                <div><h2 id="settings-appearance-heading">{t("settings.section.appearance")}</h2><p>{t("settings.appearance.intro")}</p></div>
              </div>
              <fieldset className="theme-options">
                <legend className="sr-only">{t("settings.appearance.themeLegend")}</legend>
                {themeChoices.map((choice) => (
                  <button
                    aria-pressed={theme === choice.value}
                    className={`theme-option${theme === choice.value ? " selected" : ""}`}
                    key={choice.value}
                    onClick={() => onChooseTheme(choice.value)}
                    type="button"
                  >
                    <span className="theme-option-icon"><Icon name={choice.icon} /></span>
                    <span>{t(choice.label)}</span>
                    {theme === choice.value && <Icon name="check" />}
                  </button>
                ))}
              </fieldset>
              <div className="settings-card-heading">
                <div className="settings-heading-icon"><Icon name="language" /></div>
                <div><h2 id="settings-language-heading">{t("settings.language.heading")}</h2><p>{t("settings.language.intro")}</p></div>
              </div>
              <fieldset className="theme-options">
                <legend className="sr-only">{t("settings.language.heading")}</legend>
                {LOCALES.map((choice) => (
                  <button
                    aria-pressed={locale === choice.value}
                    className={`theme-option${locale === choice.value ? " selected" : ""}`}
                    key={choice.value}
                    lang={choice.value}
                    onClick={() => chooseLanguage(choice.value)}
                    type="button"
                  >
                    <span>{choice.name}</span>
                    {locale === choice.value && <Icon name="check" />}
                  </button>
                ))}
              </fieldset>
              {languageError && <p className="form-error" role="alert">{languageError}</p>}
            </div>
          </section>

          <section aria-labelledby="settings-content-heading" className="settings-group" id="settings-content-visibility" hidden={group !== "content-visibility"}>
            <div className="settings-card">
              <div className="settings-card-heading">
                <div className="settings-heading-icon"><Icon name="shield" /></div>
                <div><h2 id="settings-content-heading">{t("settings.section.adult")}</h2><p>{t("settings.adult.intro")}</p></div>
              </div>
              <label className="adult-content-toggle">
                <span>
                  <strong>{t("settings.adult.toggle")}</strong>
                  <small>{t("settings.adult.hint")}</small>
                </span>
                <input
                  checked={showAdultContent}
                  onChange={(event) => onSetShowAdultContent(event.target.checked)}
                  type="checkbox"
                />
              </label>
            </div>
          </section>

          <section aria-labelledby="settings-sources-heading" className="settings-group settings-sources" id="settings-sources" hidden={group !== "sources"}>
            <div className="settings-card">
              <div className="settings-card-heading">
                <div className="settings-heading-icon"><Icon name="playlist_play" /></div>
                <div><h2 id="settings-sources-heading">{t("settings.sources.heading")}</h2><p>{t("settings.sources.intro")}</p></div>
              </div>
              {sources.length === 0 ? (
                <EmptyPanel icon="playlist_play" title={t("settings.sources.emptyTitle")}>{t("settings.sources.emptyBody")}</EmptyPanel>
              ) : (
                <div className="source-list">
                  {sources.map((source) => (
                    <article className={`source-row${source.id === activeSourceId ? " active" : ""}`} key={source.id}>
                      <span className="source-row-icon"><Icon name={source.type === "M3U" ? "playlist_play" : source.type === "STALKER" ? "devices" : "dns"} /></span>
                      <div className="source-row-copy">
                        <strong>{source.name}</strong>
                        <small>{source.type}{source.expiresAtMillis
                          ? ` · ${t(source.expiresAtMillis <= Date.now() ? "settings.sources.expired" : "settings.sources.expires", { date: formatDateTime(source.expiresAtMillis, "medium") })}`
                          : ""}</small>
                        <small data-tooltip={source.lastCatalogRefreshAt
                          ? t("settings.sources.lastRefreshTooltip", { date: formatDateTime(source.lastCatalogRefreshAt, "medium") })
                          : t("settings.sources.noRefreshTooltip")}>
                          {t("settings.sources.lastRefresh", {
                            date: source.lastCatalogRefreshAt ? formatDateTime(source.lastCatalogRefreshAt) : t("settings.sources.notRecorded"),
                          })}
                        </small>
                        {source.lastCatalogRefreshAttemptAt && source.lastCatalogRefreshOutcome && (
                          <small>
                            {t("settings.sources.latestAttempt", {
                              outcome: refreshOutcomeLabel(source.lastCatalogRefreshOutcome),
                              date: formatDateTime(source.lastCatalogRefreshAttemptAt),
                            })}
                          </small>
                        )}
                        {source.lastCatalogRefreshSummary && (
                          <small>{t("settings.sources.changes", { summary: formatCatalogChangeSummary(source.lastCatalogRefreshSummary) })}</small>
                        )}
                      </div>
                      {source.id !== activeSourceId && (
                        <button className="secondary-button source-select-button" onClick={() => onActivate(source.id)} type="button">{t("settings.sources.use")}</button>
                      )}
                      {source.id === activeSourceId && <span className="active-source-tag"><Icon name="check_circle" /> {t("settings.sources.active")}</span>}
                      <button aria-label={t("settings.sources.editAria", { name: source.name })} className="icon-button settings-source-action" data-tooltip={t("settings.sources.editTooltip")} onClick={() => onEdit(source)} type="button"><Icon name="edit" /></button>
                      <button aria-label={t("settings.sources.deleteAria", { name: source.name })} className="icon-button danger-button settings-source-action" data-tooltip={t("settings.sources.deleteTooltip")} onClick={() => onDelete(source)} type="button"><Icon name="delete" /></button>
                    </article>
                  ))}
                </div>
              )}
              <div className="settings-actions">
                <button className="secondary-button" onClick={onAddSource} type="button">
                  <Icon name="add" /> {sources.length === 0 ? t("settings.sources.add") : t("settings.sources.addAnother")}
                </button>
                {activeSourceId && (
                  <button
                    className="secondary-button settings-source-refresh"
                    disabled={refreshing}
                    onClick={onRefreshSource}
                    type="button"
                  >
                    <Icon name="refresh" /> {refreshing ? t("settings.sources.refreshing") : t("settings.sources.refresh")}
                  </button>
                )}
                {activeSourceId && (
                  <button
                    className="secondary-button"
                    disabled={epgBusy}
                    onClick={async () => {
                      setEpgBusy(true);
                      try { await onRefreshEpg(); } finally { setEpgBusy(false); }
                    }}
                    type="button"
                  >
                    <Icon name="schedule" /> {epgBusy ? t("settings.sources.updatingGuide") : t("settings.sources.refreshGuide")}
                  </button>
                )}
              </div>
            </div>
          </section>

          <section aria-labelledby="settings-downloads-heading" className="settings-group" id="settings-downloads" hidden={group !== "downloads"}>
            <div className="settings-card">
              <div className="settings-card-heading">
                <div className="settings-heading-icon"><Icon name="download" /></div>
                <div>
                  <h2 id="settings-downloads-heading">{t("settings.section.downloads")}</h2>
                  <p>{t("settings.downloads.intro")}</p>
                </div>
              </div>
              <div className="settings-download-location">
                <div>
                  <span>{t("settings.downloads.folder")}</span>
                  <strong>
                    {downloadDirectoryPath ?? t("settings.downloads.noFolder")}
                  </strong>
                  <small>{t("settings.downloads.folderHint")}</small>
                </div>
                <button className="secondary-button" onClick={onChangeDownloadDirectory} type="button">
                  <Icon name="folder_open" /> {t("settings.downloads.change")}
                </button>
              </div>
              <div className="settings-download-location">
                <div>
                  <span>{t("settings.downloads.completed")}</span>
                  <strong>{tCount("settings.downloads.saved", completedDownloadCount)}</strong>
                  <small>{t("settings.downloads.completedHint")}</small>
                </div>
                <button
                  className="secondary-button danger-button"
                  disabled={completedDownloadCount === 0}
                  onClick={onClearCompletedDownloads}
                  type="button"
                >
                  <Icon name="delete_sweep" /> {t("settings.downloads.clear")}
                </button>
              </div>
            </div>
          </section>

          <section aria-labelledby="settings-subtitles-heading" className="settings-group" id="settings-subtitles" hidden={group !== "subtitles"}>
            <div className="settings-card">
              <div className="settings-card-heading">
                <div className="settings-heading-icon"><Icon name="subtitles" /></div>
                <div><h2 id="settings-subtitles-heading">{t("settings.section.subtitles")}</h2><p>{t("settings.subtitles.intro")}</p></div>
              </div>
              <form className="settings-form" onSubmit={(event) => void saveKey(event)}>
                <label className="form-field">
                  <span>{t("settings.subtitles.keyLabel")} <em>{apiKey.trim() ? t("settings.apiKey.saved") : t("settings.apiKey.optional")}</em></span>
                  <input
                    autoComplete="off"
                    onChange={(event) => setKeyDraft(event.target.value)}
                    placeholder={t("settings.apiKey.placeholder")}
                    type="password"
                    value={keyDraft}
                  />
                </label>
                <p className="form-note">
                  {t("settings.subtitles.note")}{" "}
                  <a
                    href="https://www.opensubtitles.com/en/consumers"
                    onClick={(event) => {
                      if (!onOpenExternalUrl) return;
                      event.preventDefault();
                      void onOpenExternalUrl("https://www.opensubtitles.com/en/consumers");
                    }}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {t("settings.subtitles.getKey")}
                  </a>
                  .
                </p>
                <button className="secondary-button" type="submit"><Icon name="lock" /> {t("settings.subtitles.saveKey")}</button>
                {keyNotice && <p className="settings-message" role="status">{keyNotice}</p>}
              </form>
              <div className="settings-download-location">
                <div>
                  <span>{t("settings.subtitles.downloaded")}</span>
                  <strong>{tCount("settings.subtitles.saved", savedSubtitleCount)}</strong>
                  <small>{t("settings.subtitles.cacheHint")}</small>
                  {subtitleCacheNotice && <small role="status">{subtitleCacheNotice}</small>}
                </div>
                <button
                  className="secondary-button danger-button"
                  disabled={savedSubtitleCount === 0}
                  onClick={() => void clearCache()}
                  type="button"
                >
                  <Icon name="delete_sweep" /> {t("settings.subtitles.clear")}
                </button>
              </div>
            </div>
          </section>

          {onSaveMdblistApiKey && (
            <section aria-labelledby="settings-ratings-heading" className="settings-group" id="settings-ratings" hidden={group !== "ratings"}>
              <div className="settings-card">
                <div className="settings-card-heading">
                  <div className="settings-heading-icon"><Icon name="high_quality" /></div>
                  <div><h2 id="settings-ratings-heading">{t("settings.section.ratings")}</h2><p>{t("settings.ratings.intro")}</p></div>
                </div>
                <form className="settings-form" onSubmit={(event) => void saveMdblistKey(event)}>
                  <label className="form-field">
                    <span>{t("settings.ratings.keyLabel")} <em>{mdblistApiKey.trim() ? t("settings.apiKey.saved") : t("settings.apiKey.optional")}</em></span>
                    <input
                      autoComplete="off"
                      onChange={(event) => setMdblistDraft(event.target.value)}
                      placeholder={t("settings.apiKey.placeholder")}
                      type="password"
                      value={mdblistDraft}
                    />
                  </label>
                  <p className="form-note">
                    {t("settings.ratings.note")}{" "}
                    <a
                      href="https://mdblist.com/preferences/#api"
                      onClick={(event) => {
                        if (!onOpenExternalUrl) return;
                        event.preventDefault();
                        void onOpenExternalUrl("https://mdblist.com/preferences/#api");
                      }}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {t("settings.ratings.getKey")}
                    </a>
                    .
                  </p>
                  <button className="secondary-button" type="submit"><Icon name="lock" /> {t("settings.ratings.saveKey")}</button>
                  {mdblistNotice && <p className="settings-message" role="status">{mdblistNotice}</p>}
                </form>
              </div>
            </section>
          )}

          <section aria-labelledby="settings-data-heading" className="settings-group settings-data" id="settings-data" hidden={group !== "data"}>
            <h2 className="sr-only" id="settings-data-heading">{t("settings.data.heading")}</h2>
            <div className="settings-card" id="settings-backup">
              <div className="settings-card-heading">
                <div className="settings-heading-icon"><Icon name="backup" /></div>
                <div><h2>{t("settings.backup.heading")}</h2><p>{t("settings.backup.intro")}</p></div>
              </div>
              <div className="backup-grid">
                <form className="backup-form" onSubmit={(event) => void exportBackup(event)}>
                  <h3>{t("settings.backup.export")}</h3>
                  <label className="form-field">
                    <span>{t("settings.backup.password")}</span>
                    <input autoComplete="new-password" minLength={12} onChange={(event) => setBackupPassword(event.target.value)} required type="password" value={backupPassword} />
                  </label>
                  <label className="form-field">
                    <span>{t("settings.backup.confirm")}</span>
                    <input autoComplete="new-password" minLength={12} onChange={(event) => setBackupConfirm(event.target.value)} required type="password" value={backupConfirm} />
                  </label>
                  <button className="primary-button" disabled={backupBusy} type="submit"><Icon name="download" /> {t("settings.backup.download")}</button>
                </form>
                <form className="backup-form" onSubmit={(event) => void inspectBackup(event)}>
                  <h3>{t("settings.backup.import")}</h3>
                  <label className="form-field">
                    <span>{t("settings.backup.file")}</span>
                    <input accept=".tivihub,.json,application/json" onChange={(event) => { setBackupFile(event.target.files?.[0] ?? null); setPendingSnapshot(null); }} required type="file" />
                  </label>
                  <label className="form-field">
                    <span>{t("settings.backup.password")}</span>
                    <input autoComplete="current-password" onChange={(event) => setImportPassword(event.target.value)} required type="password" value={importPassword} />
                  </label>
                  <button className="secondary-button" disabled={backupBusy} type="submit"><Icon name="search" /> {t("settings.backup.check")}</button>
                </form>
              </div>
              {pendingSnapshot && (
                <div className="backup-preview">
                  <div>
                    <strong>{t("settings.backup.valid")}</strong>
                    <p>{t("settings.backup.summary", {
                      sources: pendingSnapshot.playlists.length,
                      items: pendingSnapshot.channels.length + pendingSnapshot.movies.length + pendingSnapshot.series.length,
                      favorites: pendingSnapshot.favorites.length,
                      library: pendingSnapshot.library.length,
                    })}</p>
                  </div>
                  <button className="primary-button" disabled={backupBusy} onClick={() => void applyBackup()} type="button"><Icon name="restore" /> {t("settings.backup.replace")}</button>
                </div>
              )}
              {backupError && <p className="form-error" role="alert">{backupError}</p>}
              {backupNotice && <p className="settings-message" role="status">{backupNotice}</p>}
              <p className="form-note">{t("settings.backup.note")}</p>
            </div>

            <div className="settings-card" id="settings-diagnostics">
              <div className="settings-card-heading">
                <div className="settings-heading-icon"><Icon name="download" /></div>
                <div><h2>{t("settings.diagnostics.heading")}</h2><p>{t("settings.diagnostics.intro")}</p></div>
              </div>
              <p className="diagnostics-description">{t("settings.diagnostics.description")}</p>
              <div className="diagnostics-download-row">
                <button
                  className="secondary-button"
                  disabled={diagnosticsBusy}
                  onClick={() => void downloadDiagnostics()}
                  type="button"
                >
                  <Icon name="download" /> {diagnosticsBusy ? t("settings.diagnostics.preparing") : t("settings.diagnostics.download")}
                </button>
                {diagnosticsNotice && (
                  <p aria-live="polite" className="settings-message" role="status">{diagnosticsNotice}</p>
                )}
              </div>
              <p className="form-note">
                {t("settings.diagnostics.autosave")}{" "}
                <code>tivihub-diagnostics-YYYY-MM-DD.json</code>.
              </p>
            </div>
          </section>

          <section aria-labelledby="settings-privacy-heading" className="settings-group settings-privacy" id="settings-privacy" hidden={group !== "privacy"}>
            <h2 className="sr-only" id="settings-privacy-heading">{t("settings.section.privacy")}</h2>
            <div className="settings-card privacy-settings" id="settings-privacy-card">
              <div className="settings-card-heading">
                <div className="settings-heading-icon"><Icon name="shield" /></div>
                <div><h2>{t("settings.privacy.heading")}</h2><p>{t("settings.privacy.intro")}</p></div>
              </div>
              <p className="privacy-description">{t("settings.privacy.description")}</p>
              <div className="privacy-tag"><span className="status-pulse" /> {t("settings.privacy.tag")}</div>
            </div>

            <div className="settings-card legal-settings" id="settings-legal">
              <div className="settings-card-heading">
                <div className="settings-heading-icon"><Icon name="info" /></div>
                <div><h2>{t("settings.legal.heading")}</h2><p>{t("settings.legal.intro")}</p></div>
              </div>
              {/* The notice itself stays English on purpose: a loose translation of legal text is riskier than none. */}
              <div className="legal-notice-copy" lang="en">
                <p>
                  TiviHub is a desktop player and catalog organizer for sources you configure.
                  It does not supply, sell, license, or host your channels or media, and it does not
                  verify that a provider or source is authorized.
                </p>
                <ul>
                  <li>
                    You are responsible for using only sources and content you are authorized to access.
                    Check copyright rules, provider terms, territorial restrictions, and the laws that
                    apply where you use the app.
                  </li>
                  <li>
                    Playback and guide requests go directly from this app to the configured provider.
                    Subtitle searches go directly to OpenSubtitles. Those services have their own terms
                    and privacy practices; TiviHub does not control them.
                  </li>
                  <li>
                    TiviHub does not provide DRM licenses or bypass DRM, authentication, subscriptions,
                    geographic controls, or other technical protection measures. Use playback only where
                    the provider and rights holder permit it.
                  </li>
                  <li>
                    Media, programme data, artwork, names, and trademarks remain the property of their
                    respective owners. The MIT license applies to TiviHub software only; it does not
                    grant rights to third-party content or brands.
                  </li>
                </ul>
              </div>
            </div>
          </section>

          {isDesktopApp && (
            <section aria-labelledby="settings-updates-heading" className="settings-group" id="settings-updates" hidden={group !== "updates"}>
              <div className="settings-card">
                <div className="settings-card-heading">
                  <div className="settings-heading-icon"><Icon name="download" /></div>
                  <div><h2 id="settings-updates-heading">{t("settings.updates.heading")}</h2><p>{t("settings.updates.intro")}</p></div>
                </div>
                <div className="settings-update-row">
                  <div className="settings-update-details">
                    <p className="settings-version">{t("settings.updates.installed", { version })}</p>
                    <div aria-live="polite" className="settings-update-status" role="status">
                      <span className={`settings-update-indicator ${updateStatus}`} />
                      <span>
                        {updateStatus === "checking"
                          ? t("settings.updates.checking")
                          : updateStatus === "current"
                            ? t("settings.updates.current")
                            : updateStatus === "available" && availableUpdateVersion
                              ? t("settings.updates.available", { version: availableUpdateVersion })
                              : updateStatus === "error"
                                ? availableUpdateVersion ? t("settings.updates.openFailed") : t("settings.updates.checkFailed")
                                : t("settings.updates.check")}
                      </span>
                    </div>
                  </div>
                  <button
                    className="secondary-button"
                    disabled={updateStatus === "checking"}
                    onClick={onUpdateAction}
                    type="button"
                  >
                    <Icon name={availableUpdateVersion ? "download" : "refresh"} />
                    {availableUpdateVersion
                      ? t("settings.updates.download", { version: availableUpdateVersion })
                      : updateStatus === "checking"
                        ? t("settings.updates.checkingShort")
                        : updateStatus === "error" ? t("settings.updates.retry") : t("settings.updates.check")}
                  </button>
                </div>
              </div>
            </section>
          )}
      </div>
    </BrowseShell>
  );
}
