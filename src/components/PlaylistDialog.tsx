import { useEffect, useRef, useState, type FormEvent } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { t } from "../lib/i18n";
import type { DrmSystem, Playlist, PlaylistType } from "../types";
import { validateHttpsUrl } from "../providers/http";
import { MAX_M3U_BYTES } from "../providers/m3u";
import { normalizeMac } from "../providers/stalker";
import { CustomSelect, Icon, type CustomSelectOption } from "./common";
import { ProgressIndicator } from "./ProgressIndicator";

export interface PlaylistDraft {
  playlist: Playlist;
  fileContent?: string;
  signal?: AbortSignal;
  onStage?: (stage: "connecting" | "parsing" | "saving") => void;
  onProgress?: (completed: number, total: number) => void;
}

const drmSystemOptions = (): readonly CustomSelectOption<DrmSystem>[] => [
  { label: t("dlg.drmWidevine"), value: "com.widevine.alpha" },
  { label: t("dlg.drmFairplay"), value: "com.apple.fps" },
];

export function PlaylistDialog({
  editing,
  onClose,
  onConnect,
  onLoadDemo,
}: {
  editing?: Playlist;
  onClose: () => void;
  onConnect: (draft: PlaylistDraft) => Promise<void>;
  onLoadDemo?: () => Promise<void>;
}) {
  const [type, setType] = useState<PlaylistType>(editing?.type ?? "M3U");
  const [sourceMode, setSourceMode] = useState<"url" | "file">(
    editing?.type === "M3U" && editing.fileName ? "file" : "url",
  );
  const [name, setName] = useState(editing?.name ?? "");
  const [url, setUrl] = useState(editing?.url ?? "");
  const [username, setUsername] = useState(editing?.username ?? "");
  const [password, setPassword] = useState(editing?.password ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [epgUrl, setEpgUrl] = useState(editing?.epgUrl ?? "");
  const [userAgent, setUserAgent] = useState(editing?.userAgent ?? "");
  const [macAddress, setMacAddress] = useState(editing?.macAddress ?? "");
  const [drmLicenseUrl, setDrmLicenseUrl] = useState(editing?.drmLicenseUrl ?? "");
  const [drmSystem, setDrmSystem] = useState<DrmSystem>(editing?.drmSystem ?? "com.widevine.alpha");
  const [drmCertificateUrl, setDrmCertificateUrl] = useState(editing?.drmCertificateUrl ?? "");
  const [busyAction, setBusyAction] = useState<"connect" | "demo" | null>(null);
  const [busyStage, setBusyStage] = useState<"connecting" | "parsing" | "saving">("connecting");
  const [saveProgress, setSaveProgress] = useState<{ completed: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const restoreFocusFrameRef = useRef<number | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const focusCapturedRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const drmLicenseUrlRef = useRef<HTMLInputElement>(null);
  const drmCertificateUrlRef = useRef<HTMLInputElement>(null);
  const connectAbortController = useRef<AbortController | null>(null);
  const onCloseRef = useRef<() => void>(onClose);
  const closeDialog = () => {
    if (busyAction === "demo" || (busyAction === "connect" && busyStage === "saving")) return;
    connectAbortController.current?.abort();
    onClose();
  };
  onCloseRef.current = closeDialog;

  useEffect(() => {
    if (restoreFocusFrameRef.current !== null) {
      window.cancelAnimationFrame(restoreFocusFrameRef.current);
      restoreFocusFrameRef.current = null;
    }
    if (!focusCapturedRef.current) {
      previousFocusRef.current = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
      focusCapturedRef.current = true;
    }
    dialogRef.current?.querySelector<HTMLInputElement>("input:not([type='file'])")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const dialog = dialogRef.current;
      const focusable = Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
        ) ?? [],
      ).filter((element) => element.getClientRects().length > 0);
      if (focusable.length === 0 || !dialog) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const focusIsOutsideDialog = !dialog.contains(document.activeElement);
      if (event.shiftKey && (document.activeElement === first || focusIsOutsideDialog)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || focusIsOutsideDialog)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      restoreFocusFrameRef.current = window.requestAnimationFrame(() => {
        restoreFocusFrameRef.current = null;
        const previousFocus = previousFocusRef.current;
        previousFocusRef.current = null;
        focusCapturedRef.current = false;
        if (previousFocus?.isConnected) previousFocus.focus();
      });
    };
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (
      type === "M3U" &&
      sourceMode === "file" &&
      !file &&
      !(editing?.type === "M3U" && editing.fileName)
    ) {
      setError(t("dlg.errChooseFile"));
      fileInputRef.current?.focus();
      return;
    }
    if (file && file.size > MAX_M3U_BYTES) {
      setError(t("dlg.errFileSize"));
      fileInputRef.current?.focus();
      return;
    }
    if ((type === "XTREAM" || sourceMode === "url") && !url.trim()) {
      setError(t("dlg.errUrl"));
      return;
    }
    if (type === "XTREAM" && (!username.trim() || !password)) {
      setError(t("dlg.errXtream"));
      return;
    }
    if (type === "STALKER" && !normalizeMac(macAddress)) {
      setError(t("dlg.errMac"));
      return;
    }
    // eslint-disable-next-line no-control-regex -- control characters must not reach a header
    if (/[\u0000-\u001f\u007f]/.test(userAgent)) {
      setError(t("dlg.errUserAgent"));
      return;
    }
    if (drmLicenseUrl) {
      try {
        validateHttpsUrl(drmLicenseUrl, t("dlg.drmLicense"));
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : t("dlg.errDrmInvalid"));
        drmLicenseUrlRef.current?.focus();
        return;
      }
    }
    if (drmCertificateUrl) {
      try {
        validateHttpsUrl(drmCertificateUrl, t("dlg.fairplayCert"));
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : t("dlg.errFairplayInvalid"));
        drmCertificateUrlRef.current?.focus();
        return;
      }
    }
    if (drmSystem === "com.apple.fps" && drmLicenseUrl && !drmCertificateUrl) {
      setError(t("dlg.errFairplayRequired"));
      drmCertificateUrlRef.current?.focus();
      return;
    }

    let sourceProtocol: string | undefined;
    try {
      sourceProtocol = new URL(url.trim()).protocol;
    } catch {
      sourceProtocol = undefined;
    }
    if (sourceProtocol === "http:" && window.location.protocol === "https:") {
      const confirmed = window.confirm(t("dlg.confirmHttp"));
      if (!confirmed) return;
    }

    const createdAt = Date.now();
    const playlist: Playlist = {
      id: editing?.id ?? crypto.randomUUID(),
      name: name.trim() || file?.name.replace(/\.[^.]+$/, "") || t("dlg.defaultName"),
      type,
      url: type === "M3U" && sourceMode === "file" ? "" : url.trim(),
      username: type === "M3U" ? "" : username.trim(),
      password: type === "M3U" ? "" : password,
      macAddress: type === "STALKER" ? normalizeMac(macAddress) ?? undefined : undefined,
      active: editing?.active ?? true,
      drmLicenseUrl: drmLicenseUrl.trim(),
      drmSystem,
      drmCertificateUrl: drmCertificateUrl.trim() || undefined,
      epgUrl: epgUrl.trim() || undefined,
      userAgent: (isTauri() && userAgent.trim()) || undefined,
      fileName: type === "M3U" && sourceMode === "file" ? file?.name ?? editing?.fileName : undefined,
      expiresAtMillis: editing?.expiresAtMillis,
      createdAt: editing?.createdAt ?? createdAt,
    };

    const controller = new AbortController();
    connectAbortController.current = controller;
    setSaveProgress(null);
    setBusyStage("connecting");
    setBusyAction("connect");
    try {
      const fileContent = type === "M3U" && sourceMode === "file" && file
        ? await file.text()
        : undefined;
      if (controller.signal.aborted) return;
      await onConnect({
        playlist,
        fileContent,
        signal: controller.signal,
        onStage: setBusyStage,
        onProgress: (completed, total) => setSaveProgress({ completed, total }),
      });
      connectAbortController.current = null;
      onClose();
    } catch (cause) {
      if (!controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : t("dlg.errConnect"));
      }
    } finally {
      if (connectAbortController.current === controller) connectAbortController.current = null;
      setBusyAction(null);
    }
  }

  async function loadDemo() {
    if (!onLoadDemo) {
      setError(t("dlg.errDemoDev"));
      return;
    }
    setError(null);
    setBusyAction("demo");
    try {
      await onLoadDemo();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t("dlg.errDemo"));
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="dialog-card playlist-dialog"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="source-dialog-title"
        aria-describedby="source-dialog-description"
      >
        <header className="dialog-heading">
          <div>
                <p className="eyebrow">{t("dlg.eyebrow")}</p>
                <h2 id="source-dialog-title">{editing ? t("dlg.editTitle") : t("dlg.addTitle")}</h2>
          </div>
          <button
            aria-label={t("dlg.close")}
            className="icon-button"
            disabled={busyAction === "demo" || (busyAction === "connect" && busyStage === "saving")}
            onClick={closeDialog}
            type="button"
          >
            <Icon name="close" />
          </button>
        </header>

        <form aria-busy={busyAction !== null} className="dialog-form" onSubmit={(event) => void submit(event)}>
          <p className="form-note source-dialog-intro" id="source-dialog-description">
            {t("dlg.intro")}
          </p>
          <fieldset className="source-type-switch" disabled={busyAction !== null}>
            <legend className="sr-only">{t("dlg.typeLegend")}</legend>
            {(isTauri() ? ["M3U", "XTREAM", "STALKER"] as const : ["M3U", "XTREAM"] as const).map((item) => (
              <button
                aria-pressed={type === item}
                className={type === item ? "source-type active" : "source-type"}
                key={item}
                onClick={() => {
                  setType(item);
                  if (item !== "M3U") setFile(null);
                }}
                type="button"
              >
                <Icon name={item === "M3U" ? "playlist_play" : item === "XTREAM" ? "dns" : "devices"} />
                {item === "M3U" ? t("noSource.m3u") : item === "XTREAM" ? t("dlg.typeXtream") : t("dlg.typeStalker")}
              </button>
            ))}
          </fieldset>

          {type === "M3U" && (
            <fieldset className="source-mode-switch" disabled={busyAction !== null}>
              <legend className="sr-only">{t("dlg.modeLegend")}</legend>
              <button
                aria-pressed={sourceMode === "url"}
                className={sourceMode === "url" ? "source-mode active" : "source-mode"}
                onClick={() => setSourceMode("url")}
                type="button"
              >
                {t("dlg.modeUrl")}
              </button>
              <button
                aria-pressed={sourceMode === "file"}
                className={sourceMode === "file" ? "source-mode active" : "source-mode"}
                onClick={() => setSourceMode("file")}
                type="button"
              >
                {t("dlg.modeFile")}
              </button>
            </fieldset>
          )}

          <label className="form-field">
            <span>{t("dlg.name")} <em>{t("settings.apiKey.optional")}</em></span>
            <input
              autoComplete="off"
              disabled={busyAction !== null}
              maxLength={80}
              onChange={(event) => setName(event.target.value)}
              placeholder={t("dlg.namePlaceholder")}
              value={name}
            />
          </label>

          {sourceMode === "url" || type !== "M3U" ? (
            <>
              <label className="form-field" key="playlist-url">
                <span>{type === "M3U" ? t("dlg.modeUrl") : type === "XTREAM" ? t("dlg.urlXtream") : t("dlg.urlStalker")} <em>{t("dlg.required")}</em></span>
                <input
                  autoComplete="url"
                  disabled={busyAction !== null}
                  inputMode="url"
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder={type === "M3U" ? "https://provider.example/list.m3u" : type === "XTREAM" ? "https://provider.example" : "http://portal.example/c/"}
                  required
                  type="url"
                  value={url}
                />
              </label>
              <p className="form-note">
                {type === "M3U"
                  ? t("dlg.noteM3u")
                  : type === "XTREAM"
                    ? t("dlg.noteXtream")
                    : t("dlg.noteStalker")}
                {/^http:\/\//i.test(url.trim()) &&
                  t("dlg.httpWarning")}
              </p>
            </>
          ) : (
            <>
              <label className="form-field" key="playlist-file">
                <span>{t("dlg.fileLabel")} <em>{t("dlg.required")}</em></span>
                <input
                  accept=".m3u,.m3u8,audio/x-mpegurl,application/vnd.apple.mpegurl,text/plain"
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                  disabled={busyAction !== null}
                  required={!(editing?.type === "M3U" && editing.fileName)}
                  ref={fileInputRef}
                  type="file"
                />
                <small>{file?.name ?? editing?.fileName ?? t("dlg.noFile")}</small>
              </label>
              <p className="form-note">{t("dlg.fileNote")}</p>
              <label className="form-field" key="playlist-file-base-url">
                <span>{t("dlg.baseUrl")} <em>{t("settings.apiKey.optional")}</em></span>
                <input
                  autoComplete="url"
                  disabled={busyAction !== null}
                  inputMode="url"
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="https://provider.example/"
                  type="url"
                  value={url}
                />
              </label>
            </>
          )}

          {type === "STALKER" && (
            <label className="form-field">
              <span>{t("dlg.mac")} <em>{t("dlg.required")}</em></span>
              <input
                autoCapitalize="characters"
                autoComplete="off"
                disabled={busyAction !== null}
                maxLength={17}
                onChange={(event) => setMacAddress(event.target.value)}
                placeholder="00:1A:79:12:34:56"
                required
                spellCheck={false}
                value={macAddress}
              />
            </label>
          )}

          {type === "XTREAM" && (
            <div className="form-row">
              <label className="form-field">
                <span>{t("dlg.username")} <em>{t("dlg.required")}</em></span>
                <input
                  autoComplete="username"
                  disabled={busyAction !== null}
                  onChange={(event) => setUsername(event.target.value)}
                  required
                  value={username}
                />
              </label>
              <label className="form-field">
                <span>{t("dlg.password")} <em>{t("dlg.required")}</em></span>
                <input
                  autoComplete="current-password"
                  disabled={busyAction !== null}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  type="password"
                  value={password}
                />
              </label>
            </div>
          )}

          {(
            <details className="advanced-source">
              <summary>{type === "STALKER" ? t("dlg.advancedStalker") : t("dlg.advanced")}</summary>
              {type === "STALKER" && (
                <div className="form-row">
                  <label className="form-field">
                    <span>{t("dlg.username")} <em>{t("settings.apiKey.optional")}</em></span>
                    <input
                      autoComplete="username"
                      disabled={busyAction !== null}
                      onChange={(event) => setUsername(event.target.value)}
                      value={username}
                    />
                  </label>
                  <label className="form-field">
                    <span>{t("dlg.password")} <em>{t("settings.apiKey.optional")}</em></span>
                    <input
                      autoComplete="current-password"
                      disabled={busyAction !== null}
                      onChange={(event) => setPassword(event.target.value)}
                      type="password"
                      value={password}
                    />
                  </label>
                </div>
              )}
              <label className="form-field">
                <span>{t("dlg.epgUrl")} <em>{t("settings.apiKey.optional")}</em></span>
                <input
                  autoComplete="url"
                  disabled={busyAction !== null}
                  inputMode="url"
                  onChange={(event) => setEpgUrl(event.target.value)}
                  placeholder={type === "M3U" ? "https://provider.example/guide.xml" : t("dlg.epgPlaceholder")}
                  type="url"
                  value={epgUrl}
                />
              </label>
              {isTauri() && (
                <label className="form-field">
                  <span>{t("dlg.userAgent")} <em>{t("settings.apiKey.optional")}</em></span>
                  <input
                    autoComplete="off"
                    disabled={busyAction !== null}
                    list="user-agent-presets"
                    maxLength={256}
                    onChange={(event) => setUserAgent(event.target.value)}
                    placeholder={t("dlg.userAgentPlaceholder")}
                    value={userAgent}
                  />
                  <datalist id="user-agent-presets">
                    <option value="VLC/3.0.20 LibVLC/3.0.20" />
                    <option value="Kodi/21.0 (Windows NT 10.0; Win64; x64)" />
                    <option value="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36" />
                  </datalist>
                </label>
              )}
              {type !== "STALKER" && (<>
              <label className="form-field">
                <span>{t("dlg.drmSystem")} <em>{t("settings.apiKey.optional")}</em></span>
                <div className="select-control">
                  <CustomSelect
                    ariaLabel={t("dlg.drmSystem")}
                    disabled={busyAction !== null}
                    onValueChange={setDrmSystem}
                    options={drmSystemOptions()}
                    value={drmSystem}
                  />
                </div>
              </label>
              <label className="form-field">
                <span>{t("dlg.drmLicense")} <em>{t("settings.apiKey.optional")}</em></span>
                <input
                  autoComplete="url"
                  disabled={busyAction !== null}
                  inputMode="url"
                  onChange={(event) => setDrmLicenseUrl(event.target.value)}
                  placeholder="https://provider.example/license"
                  ref={drmLicenseUrlRef}
                  type="url"
                  value={drmLicenseUrl}
                />
              </label>
              {drmSystem === "com.apple.fps" && (
                <label className="form-field">
                  <span>
                    {t("dlg.fairplayCert")}
                    <em>{drmLicenseUrl ? t("dlg.required") : t("settings.apiKey.optional")}</em>
                  </span>
                  <input
                    autoComplete="url"
                    disabled={busyAction !== null}
                    inputMode="url"
                    onChange={(event) => setDrmCertificateUrl(event.target.value)}
                    placeholder="https://provider.example/fairplay.cer"
                    ref={drmCertificateUrlRef}
                    required={Boolean(drmLicenseUrl)}
                    type="url"
                    value={drmCertificateUrl}
                  />
                </label>
              )}
              <p className="form-note">
                {t("dlg.drmNote")}
              </p>
              </>)}
            </details>
          )}

          <p className="local-data-note">
            <Icon name="lock" />
            {t("dlg.localNote")}
          </p>
          {import.meta.env.DEV && !editing && onLoadDemo && (
            <div className="demo-playlist-option">
              <div>
                <strong>{t("dlg.demoTitle")}</strong>
                <p>{t("dlg.demoBody")}</p>
              </div>
              <button
                className="secondary-button"
                disabled={busyAction !== null}
                onClick={() => void loadDemo()}
                type="button"
              >
                {busyAction === "demo" ? <span className="spinner" /> : <Icon name="playlist_play" />}
                {busyAction === "demo" ? t("dlg.demoImporting") : t("dlg.demoImport")}
              </button>
            </div>
          )}
          {error && <p className="form-error" role="alert">{error}</p>}
          {busyAction === "connect" && (
            <p aria-live="polite" className="form-note source-connect-status" role="status">
              {busyStage === "connecting"
                ? t("dlg.connecting")
                : busyStage === "parsing"
                  ? t("dlg.reading")
                  : t("dlg.savingLocal")}
            </p>
          )}
          {busyAction === "connect" &&
            busyStage === "saving" &&
            saveProgress &&
            saveProgress.total > 0 && (
              <ProgressIndicator
                className="source-connect-progress"
                label={t("dlg.savingProgress")}
                max={saveProgress.total}
                value={saveProgress.completed}
              />
            )}

          <div className="dialog-actions">
            <button
              className="secondary-button"
              disabled={busyAction === "demo" || (busyAction === "connect" && busyStage === "saving")}
              onClick={closeDialog}
              type="button"
            >
              {busyAction === "connect" && busyStage === "saving" ? t("dlg.saving") : t("dlg.cancel")}
            </button>
            <button className="primary-button" disabled={busyAction !== null} type="submit">
              {busyAction === "connect" ? <span className="spinner" /> : <Icon name="link" />}
              {busyAction === "connect"
                ? busyStage === "parsing"
                  ? t("dlg.readingBtn")
                  : busyStage === "saving"
                    ? (saveProgress && saveProgress.total > 0
                      ? t("dlg.savingBtnPct", { percent: Math.floor(saveProgress.completed / saveProgress.total * 100) })
                      : t("dlg.savingBtn"))
                    : editing ? t("dlg.saving") : t("dlg.connectingBtn")
                : editing ? t("dlg.save") : t("dlg.connect")}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
