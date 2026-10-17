import { useState, type FormEvent } from "react";
import { decryptBackup, encryptBackup } from "../backup";
import { formatCatalogChangeSummary } from "../catalogRefresh";
import { createSnapshot, restoreSnapshot } from "../storage/database";
import type { Playlist, UserDataSnapshot } from "../types";
import { Icon } from "./common";

type ThemePreference = "system" | "light" | "dark";

const themeChoices: { value: ThemePreference; label: string; icon: "brightness_auto" | "dark_mode" | "light_mode" }[] = [
  { value: "system", label: "System", icon: "brightness_auto" },
  { value: "dark", label: "Dark", icon: "dark_mode" },
  { value: "light", label: "Light", icon: "light_mode" },
];

function refreshOutcomeLabel(outcome: NonNullable<Playlist["lastCatalogRefreshOutcome"]>): string {
  switch (outcome) {
    case "success": return "Updated successfully";
    case "review-required": return "Large change paused for review";
    case "kept-previous": return "Kept the previous catalog";
    case "failed": return "Failed; saved catalog kept";
  }
}

export function SettingsPage({
  theme,
  onChooseTheme,
  showAdultContent,
  onSetShowAdultContent,
  sources,
  activeSourceId,
  onAddSource,
  onActivate,
  onEdit,
  onDelete,
  apiKey,
  onSaveApiKey,
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
  onAddSource: () => void;
  onActivate: (id: string) => void;
  onEdit: (source: Playlist) => void;
  onDelete: (source: Playlist) => void;
  apiKey: string;
  onSaveApiKey: (apiKey: string) => Promise<void>;
  onDataRestored: () => Promise<void>;
  onRefreshEpg: () => Promise<void>;
  onDownloadDiagnostics: () => Promise<boolean>;
}) {
  const [keyDraft, setKeyDraft] = useState(apiKey);
  const [keyNotice, setKeyNotice] = useState<string | null>(null);
  const [backupPassword, setBackupPassword] = useState("");
  const [backupConfirm, setBackupConfirm] = useState("");
  const [importPassword, setImportPassword] = useState("");
  const [backupFile, setBackupFile] = useState<File | null>(null);
  const [pendingSnapshot, setPendingSnapshot] = useState<UserDataSnapshot | null>(null);
  const [backupBusy, setBackupBusy] = useState(false);
  const [backupError, setBackupError] = useState<string | null>(null);
  const [backupNotice, setBackupNotice] = useState<string | null>(null);
  const [epgBusy, setEpgBusy] = useState(false);
  const [diagnosticsBusy, setDiagnosticsBusy] = useState(false);
  const [diagnosticsNotice, setDiagnosticsNotice] = useState<string | null>(null);

  async function downloadDiagnostics() {
    setDiagnosticsNotice(null);
    setDiagnosticsBusy(true);
    try {
      const storageAvailable = await onDownloadDiagnostics();
      setDiagnosticsNotice(storageAvailable
        ? "Diagnostic log downloaded. Review it before sharing."
        : "Diagnostic log downloaded, but older errors could not be saved on this device.");
    } catch {
      setDiagnosticsNotice("Could not create the diagnostic log. No file was downloaded.");
    } finally {
      setDiagnosticsBusy(false);
    }
  }

  async function saveKey(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setKeyNotice(null);
    try {
      await onSaveApiKey(keyDraft);
      setKeyNotice(keyDraft.trim() ? "OpenSubtitles API key saved on this device." : "OpenSubtitles API key removed.");
    } catch (cause) {
      setKeyNotice(cause instanceof Error ? cause.message : "Could not save the API key.");
    }
  }

  async function exportBackup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBackupError(null);
    setBackupNotice(null);
    if (backupPassword !== backupConfirm) {
      setBackupError("The backup passwords do not match.");
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
      setBackupNotice("Encrypted backup downloaded. Keep its password safe; it cannot be recovered.");
      setBackupPassword("");
      setBackupConfirm("");
    } catch (cause) {
      setBackupError(cause instanceof Error ? cause.message : "Could not create the backup.");
    } finally {
      setBackupBusy(false);
    }
  }

  async function inspectBackup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBackupError(null);
    setBackupNotice(null);
    if (!backupFile) {
      setBackupError("Choose a TiviHub backup file.");
      return;
    }
    if (backupFile.size > 100 * 1024 * 1024) {
      setBackupError("Backup file exceeds the 100 MB limit.");
      return;
    }
    setBackupBusy(true);
    try {
      setPendingSnapshot(await decryptBackup(await backupFile.text(), importPassword));
    } catch (cause) {
      setBackupError(cause instanceof Error ? cause.message : "Could not read this backup.");
    } finally {
      setBackupBusy(false);
    }
  }

  async function applyBackup() {
    if (!pendingSnapshot) return;
    if (!window.confirm("Replace all TiviHub data saved by this app with this backup? This cannot be undone.")) return;
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
      setBackupNotice("Backup restored to this app.");
    } catch (cause) {
      setBackupError(cause instanceof Error ? cause.message : "Could not restore this backup.");
    } finally {
      setBackupBusy(false);
    }
  }

  return (
    <section className="settings-page">
      <div className="page-intro">
        <p className="eyebrow">MAKE IT YOURS</p>
        <h1>Settings<span className="neon-text">.</span></h1>
        <p>Manage this device's local data, sources, and appearance.</p>
      </div>

      <div className="settings-card">
        <div className="settings-card-heading">
          <div className="settings-heading-icon"><Icon name="dark_mode" /></div>
          <div><h2>Appearance</h2><p>Choose a theme that feels right on this device.</p></div>
        </div>
        <fieldset className="theme-options">
          <legend className="sr-only">Color theme</legend>
          {themeChoices.map((choice) => (
            <button
              aria-pressed={theme === choice.value}
              className={`theme-option${theme === choice.value ? " selected" : ""}`}
              key={choice.value}
              onClick={() => onChooseTheme(choice.value)}
              type="button"
            >
              <span className="theme-option-icon"><Icon name={choice.icon} /></span>
              <span>{choice.label}</span>
              {theme === choice.value && <Icon name="check" />}
            </button>
          ))}
        </fieldset>
      </div>

      <div className="settings-card">
        <div className="settings-card-heading">
          <div className="settings-heading-icon"><Icon name="shield" /></div>
          <div><h2>Adult content</h2><p>Choose whether adult movies, series, and TV are shown.</p></div>
        </div>
        <label className="adult-content-toggle">
          <span>
            <strong>Show adult content</strong>
            <small>Matches Adult, XXX, Porn, Erotic, and 18+ labels in titles and categories.</small>
          </span>
          <input
            checked={showAdultContent}
            onChange={(event) => onSetShowAdultContent(event.target.checked)}
            type="checkbox"
          />
        </label>
      </div>

      <div className="settings-card">
        <div className="settings-card-heading">
          <div className="settings-heading-icon"><Icon name="playlist_play" /></div>
          <div><h2>Your sources</h2><p>Remote catalogs are cached locally, auto-refresh every 24 hours, and can be refreshed anytime.</p></div>
        </div>
        {sources.length === 0 ? (
          <p className="settings-empty">No sources connected yet. Add a playlist to browse your media.</p>
        ) : (
          <div className="source-list">
            {sources.map((source) => (
              <article className={`source-row${source.id === activeSourceId ? " active" : ""}`} key={source.id}>
                <span className="source-row-icon"><Icon name={source.type === "M3U" ? "playlist_play" : "dns"} /></span>
                <div className="source-row-copy">
                  <strong>{source.name}</strong>
                  <small>{source.type}{source.expiresAtMillis ? ` · Expires ${new Date(source.expiresAtMillis).toLocaleDateString()}` : ""}</small>
                  <small title={source.lastCatalogRefreshAt
                    ? `Last successful catalog refresh: ${new Date(source.lastCatalogRefreshAt).toLocaleString()}`
                    : "A catalog refresh has not been recorded for this source yet."}>
                    Last successful refresh: {source.lastCatalogRefreshAt
                      ? new Date(source.lastCatalogRefreshAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" })
                      : "Not recorded"}
                  </small>
                  {source.lastCatalogRefreshAttemptAt && source.lastCatalogRefreshOutcome && (
                    <small>
                      Latest attempt: {refreshOutcomeLabel(source.lastCatalogRefreshOutcome)} ·{" "}
                      {new Date(source.lastCatalogRefreshAttemptAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                    </small>
                  )}
                  {source.lastCatalogRefreshSummary && (
                    <small>Changes: {formatCatalogChangeSummary(source.lastCatalogRefreshSummary)}</small>
                  )}
                </div>
                {source.id !== activeSourceId && (
                  <button className="secondary-button source-select-button" onClick={() => onActivate(source.id)} type="button">Use</button>
                )}
                {source.id === activeSourceId && <span className="active-source-tag"><Icon name="check_circle" /> Active</span>}
                <button aria-label={`Edit ${source.name}`} className="icon-button" onClick={() => onEdit(source)} type="button"><Icon name="edit" /></button>
                <button aria-label={`Delete ${source.name}`} className="icon-button danger-button" onClick={() => onDelete(source)} type="button"><Icon name="delete" /></button>
              </article>
            ))}
          </div>
        )}
        <button className="secondary-button settings-action" onClick={onAddSource} type="button">
          <Icon name="add" /> {sources.length === 0 ? "Add source" : "Add another source"}
        </button>
        {activeSourceId && (
          <button
            className="secondary-button settings-action"
            disabled={epgBusy}
            onClick={async () => {
              setEpgBusy(true);
              try { await onRefreshEpg(); } finally { setEpgBusy(false); }
            }}
            type="button"
          >
            <Icon name="schedule" /> {epgBusy ? "Updating guide…" : "Refresh TV guide"}
          </button>
        )}
      </div>

      <div className="settings-card">
        <div className="settings-card-heading">
          <div className="settings-heading-icon"><Icon name="subtitles" /></div>
          <div><h2>Subtitles</h2><p>Optional OpenSubtitles search from this app.</p></div>
        </div>
        <form className="settings-form" onSubmit={(event) => void saveKey(event)}>
          <label className="form-field">
            <span>OpenSubtitles API key <em>Optional</em></span>
            <input
              autoComplete="off"
              onChange={(event) => setKeyDraft(event.target.value)}
              placeholder="Paste your personal API key"
              type="password"
              value={keyDraft}
            />
          </label>
          <p className="form-note">Encrypted in this app and sent only to OpenSubtitles when you search. Cross-origin or account restrictions can prevent downloads.</p>
          <button className="secondary-button" type="submit"><Icon name="lock" /> Save key</button>
          {keyNotice && <p className="settings-message" role="status">{keyNotice}</p>}
        </form>
      </div>

      <div className="settings-card">
        <div className="settings-card-heading">
          <div className="settings-heading-icon"><Icon name="backup" /></div>
          <div><h2>Encrypted backup</h2><p>Move or restore your data without a TiviHub account.</p></div>
        </div>
        <div className="backup-grid">
          <form className="backup-form" onSubmit={(event) => void exportBackup(event)}>
            <h3>Export</h3>
            <label className="form-field">
              <span>Backup password</span>
              <input autoComplete="new-password" minLength={12} onChange={(event) => setBackupPassword(event.target.value)} required type="password" value={backupPassword} />
            </label>
            <label className="form-field">
              <span>Confirm password</span>
              <input autoComplete="new-password" minLength={12} onChange={(event) => setBackupConfirm(event.target.value)} required type="password" value={backupConfirm} />
            </label>
            <button className="primary-button" disabled={backupBusy} type="submit"><Icon name="download" /> Download encrypted backup</button>
          </form>
          <form className="backup-form" onSubmit={(event) => void inspectBackup(event)}>
            <h3>Import</h3>
            <label className="form-field">
              <span>Backup file</span>
              <input accept=".tivihub,.json,application/json" onChange={(event) => { setBackupFile(event.target.files?.[0] ?? null); setPendingSnapshot(null); }} required type="file" />
            </label>
            <label className="form-field">
              <span>Backup password</span>
              <input autoComplete="current-password" onChange={(event) => setImportPassword(event.target.value)} required type="password" value={importPassword} />
            </label>
            <button className="secondary-button" disabled={backupBusy} type="submit"><Icon name="search" /> Check backup</button>
          </form>
        </div>
        {pendingSnapshot && (
          <div className="backup-preview">
            <div>
              <strong>Backup is valid</strong>
              <p>{pendingSnapshot.playlists.length} sources · {pendingSnapshot.channels.length + pendingSnapshot.movies.length + pendingSnapshot.series.length} catalog items · {pendingSnapshot.favorites.length} favorites · {pendingSnapshot.library.length} library items</p>
            </div>
            <button className="primary-button" disabled={backupBusy} onClick={() => void applyBackup()} type="button"><Icon name="restore" /> Replace local data</button>
          </div>
        )}
        {backupError && <p className="form-error" role="alert">{backupError}</p>}
        {backupNotice && <p className="settings-message" role="status">{backupNotice}</p>}
        <p className="form-note">Backups use AES-256-GCM encryption. Choose a strong password of at least 12 characters and keep it safe; TiviHub cannot recover it.</p>
      </div>

      <div className="settings-card">
        <div className="settings-card-heading">
          <div className="settings-heading-icon"><Icon name="download" /></div>
          <div><h2>Diagnostics</h2><p>Download recent request errors to share when asking for help.</p></div>
        </div>
        <p className="diagnostics-description">
          The log is stored only on this device and keeps up to 100 recent failures. Its export
          excludes media titles, source names, URLs, credentials, raw error messages, and stack traces.
          Review the file before sharing it.
        </p>
        <button
          className="secondary-button settings-action"
          disabled={diagnosticsBusy}
          onClick={() => void downloadDiagnostics()}
          type="button"
        >
          <Icon name="download" /> {diagnosticsBusy ? "Preparing log…" : "Download diagnostic log"}
        </button>
        {diagnosticsNotice && <p aria-live="polite" className="settings-message" role="status">{diagnosticsNotice}</p>}
      </div>

      <div className="settings-card privacy-settings">
        <div className="settings-card-heading">
          <div className="settings-heading-icon"><Icon name="shield" /></div>
          <div><h2>Privacy by design</h2><p>No TiviHub account or application server.</p></div>
        </div>
        <p className="privacy-description">
          Playlists, credentials, favorites, playback progress, and settings stay on this device.
          Backups are encrypted files that you choose where to save. The installed app does not
          contact TiviHub servers. Playback and subtitle requests go directly to their configured
          providers, which receive your connection and request details. The website host may log
          visits and installer downloads. Cached stream links can contain provider tokens.
          Local storage is not protection against malicious code running on this device or
          extensions.
        </p>
        <div className="privacy-tag"><span className="status-pulse" /> DATA STAYS ON THIS DEVICE</div>
      </div>

      <div className="settings-card legal-settings">
        <div className="settings-card-heading">
          <div className="settings-heading-icon"><Icon name="info" /></div>
          <div><h2>Legal and content rights</h2><p>Important information about using third-party sources.</p></div>
        </div>
        <div className="legal-notice-copy">
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
  );
}
