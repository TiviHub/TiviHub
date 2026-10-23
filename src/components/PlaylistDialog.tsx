import { useEffect, useRef, useState, type FormEvent } from "react";
import { isTauri } from "@tauri-apps/api/core";
import type { DrmSystem, Playlist, PlaylistType } from "../types";
import { validateHttpsUrl } from "../providers/http";
import { MAX_M3U_BYTES } from "../providers/m3u";
import { CustomSelect, Icon, type CustomSelectOption } from "./common";
import { ProgressIndicator } from "./ProgressIndicator";

export interface PlaylistDraft {
  playlist: Playlist;
  fileContent?: string;
  signal?: AbortSignal;
  onStage?: (stage: "connecting" | "parsing" | "saving") => void;
  onProgress?: (completed: number, total: number) => void;
}

const DRM_SYSTEM_OPTIONS: readonly CustomSelectOption<DrmSystem>[] = [
  { label: "Widevine (Chrome / Edge)", value: "com.widevine.alpha" },
  { label: "FairPlay (Safari)", value: "com.apple.fps" },
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
      setError("Choose an M3U playlist file.");
      fileInputRef.current?.focus();
      return;
    }
    if (file && file.size > MAX_M3U_BYTES) {
      setError("Playlist files are limited to 200 MB.");
      fileInputRef.current?.focus();
      return;
    }
    if ((type === "XTREAM" || sourceMode === "url") && !url.trim()) {
      setError("Enter the playlist or provider URL.");
      return;
    }
    if (type === "XTREAM" && (!username.trim() || !password)) {
      setError("Enter the Xtream username and password.");
      return;
    }
    // eslint-disable-next-line no-control-regex -- control characters must not reach a header
    if (/[\u0000-\u001f\u007f]/.test(userAgent)) {
      setError("The User-Agent cannot contain line breaks or control characters.");
      return;
    }
    if (drmLicenseUrl) {
      try {
        validateHttpsUrl(drmLicenseUrl, "DRM license URL");
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "DRM license URL is invalid.");
        drmLicenseUrlRef.current?.focus();
        return;
      }
    }
    if (drmCertificateUrl) {
      try {
        validateHttpsUrl(drmCertificateUrl, "FairPlay certificate URL");
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "FairPlay certificate URL is invalid.");
        drmCertificateUrlRef.current?.focus();
        return;
      }
    }
    if (drmSystem === "com.apple.fps" && drmLicenseUrl && !drmCertificateUrl) {
      setError("FairPlay requires the HTTPS server certificate URL from your provider.");
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
      const confirmed = window.confirm(
        "This source uses unencrypted HTTP. Browsers may block it from the secure TiviHub site, and your provider credentials or requests may be exposed in transit. Continue anyway?",
      );
      if (!confirmed) return;
    }

    const createdAt = Date.now();
    const playlist: Playlist = {
      id: editing?.id ?? crypto.randomUUID(),
      name: name.trim() || file?.name.replace(/\.[^.]+$/, "") || "My playlist",
      type,
      url: type === "M3U" && sourceMode === "file" ? "" : url.trim(),
      username: type === "XTREAM" ? username.trim() : "",
      password: type === "XTREAM" ? password : "",
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
        setError(cause instanceof Error ? cause.message : "Could not connect to this source.");
      }
    } finally {
      if (connectAbortController.current === controller) connectAbortController.current = null;
      setBusyAction(null);
    }
  }

  async function loadDemo() {
    if (!onLoadDemo) {
      setError("Demo imports are only available during development.");
      return;
    }
    setError(null);
    setBusyAction("demo");
    try {
      await onLoadDemo();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load the demo playlist.");
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
                <p className="eyebrow">YOUR SOURCES / 01</p>
                <h2 id="source-dialog-title">{editing ? "Edit playlist" : "Add a playlist"}</h2>
          </div>
          <button
            aria-label="Close"
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
            Connect a playlist or provider account. Source details and imported content stay on this device.
          </p>
          <fieldset className="source-type-switch" disabled={busyAction !== null}>
            <legend className="sr-only">Source type</legend>
            {(["M3U", "XTREAM"] as const).map((item) => (
              <button
                aria-pressed={type === item}
                className={type === item ? "source-type active" : "source-type"}
                key={item}
                onClick={() => {
                  setType(item);
                  if (item === "XTREAM") setFile(null);
                }}
                type="button"
              >
                <Icon name={item === "M3U" ? "playlist_play" : "dns"} />
                {item === "M3U" ? "M3U playlist" : "Xtream account"}
              </button>
            ))}
          </fieldset>

          {type === "M3U" && (
            <fieldset className="source-mode-switch" disabled={busyAction !== null}>
              <legend className="sr-only">M3U source method</legend>
              <button
                aria-pressed={sourceMode === "url"}
                className={sourceMode === "url" ? "source-mode active" : "source-mode"}
                onClick={() => setSourceMode("url")}
                type="button"
              >
                Playlist URL
              </button>
              <button
                aria-pressed={sourceMode === "file"}
                className={sourceMode === "file" ? "source-mode active" : "source-mode"}
                onClick={() => setSourceMode("file")}
                type="button"
              >
                Choose file
              </button>
            </fieldset>
          )}

          <label className="form-field">
            <span>Playlist name <em>Optional</em></span>
            <input
              autoComplete="off"
              disabled={busyAction !== null}
              maxLength={80}
              onChange={(event) => setName(event.target.value)}
              placeholder="Living room"
              value={name}
            />
          </label>

          {sourceMode === "url" || type === "XTREAM" ? (
            <>
              <label className="form-field" key="playlist-url">
                <span>{type === "M3U" ? "Playlist URL" : "Provider server URL"} <em>Required</em></span>
                <input
                  autoComplete="url"
                  disabled={busyAction !== null}
                  inputMode="url"
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder={type === "M3U" ? "https://provider.example/list.m3u" : "https://provider.example"}
                  required
                  type="url"
                  value={url}
                />
              </label>
              <p className="form-note">
                {type === "M3U"
                  ? "M3U playlist downloads are limited to 200 MB."
                  : "Each Xtream API response is limited to 200 MB."}
                {/^http:\/\//i.test(url.trim()) &&
                  " This address is unencrypted (HTTP), so anyone on your network can read your login."}
              </p>
            </>
          ) : (
            <>
              <label className="form-field" key="playlist-file">
                <span>M3U file <em>Required</em></span>
                <input
                  accept=".m3u,.m3u8,audio/x-mpegurl,application/vnd.apple.mpegurl,text/plain"
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                  disabled={busyAction !== null}
                  required={!(editing?.type === "M3U" && editing.fileName)}
                  ref={fileInputRef}
                  type="file"
                />
                <small>{file?.name ?? editing?.fileName ?? "No file selected"}</small>
              </label>
              <p className="form-note">M3U files are limited to 200 MB. The file stays on this device.</p>
              <label className="form-field" key="playlist-file-base-url">
                <span>Base URL for relative streams <em>Optional</em></span>
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

          {type === "XTREAM" && (
            <div className="form-row">
              <label className="form-field">
                <span>Username <em>Required</em></span>
                <input
                  autoComplete="username"
                  disabled={busyAction !== null}
                  onChange={(event) => setUsername(event.target.value)}
                  required
                  value={username}
                />
              </label>
              <label className="form-field">
                <span>Password <em>Required</em></span>
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

          {(type === "M3U" || type === "XTREAM") && (
            <details className="advanced-source">
              <summary>Optional guide &amp; DRM settings</summary>
              <label className="form-field">
                <span>XMLTV guide URL <em>Optional</em></span>
                <input
                  autoComplete="url"
                  disabled={busyAction !== null}
                  inputMode="url"
                  onChange={(event) => setEpgUrl(event.target.value)}
                  placeholder={type === "XTREAM" ? "Uses provider's XMLTV by default" : "https://provider.example/guide.xml"}
                  type="url"
                  value={epgUrl}
                />
              </label>
              {isTauri() && (
                <label className="form-field">
                  <span>User-Agent <em>Optional</em></span>
                  <input
                    autoComplete="off"
                    disabled={busyAction !== null}
                    list="user-agent-presets"
                    maxLength={256}
                    onChange={(event) => setUserAgent(event.target.value)}
                    placeholder="Uses TiviHub's default"
                    value={userAgent}
                  />
                  <datalist id="user-agent-presets">
                    <option value="VLC/3.0.20 LibVLC/3.0.20" />
                    <option value="Kodi/21.0 (Windows NT 10.0; Win64; x64)" />
                    <option value="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36" />
                  </datalist>
                </label>
              )}
              <label className="form-field">
                <span>DRM system <em>Optional</em></span>
                <div className="select-control">
                  <CustomSelect
                    ariaLabel="DRM system"
                    disabled={busyAction !== null}
                    onValueChange={setDrmSystem}
                    options={DRM_SYSTEM_OPTIONS}
                    value={drmSystem}
                  />
                </div>
              </label>
              <label className="form-field">
                <span>DRM license URL <em>Optional</em></span>
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
                    FairPlay certificate URL
                    <em>{drmLicenseUrl ? "Required" : "Optional"}</em>
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
                Use only license details supplied by your provider. DRM support depends on its
                license flow and webview CORS permissions; TiviHub does not proxy license requests.
              </p>
            </details>
          )}

          <p className="local-data-note">
            <Icon name="lock" />
            Account details and source URLs are encrypted in this app. Derived stream links stay
            local and may contain provider tokens.
          </p>
          {import.meta.env.DEV && !editing && onLoadDemo && (
            <div className="demo-playlist-option">
              <div>
                <strong>Just exploring?</strong>
                <p>Import a sample M3U with live feeds, movies, and series to explore TiviHub without a provider.</p>
              </div>
              <button
                className="secondary-button"
                disabled={busyAction !== null}
                onClick={() => void loadDemo()}
                type="button"
              >
                {busyAction === "demo" ? <span className="spinner" /> : <Icon name="playlist_play" />}
                {busyAction === "demo" ? "Importing…" : "Import demo"}
              </button>
            </div>
          )}
          {error && <p className="form-error" role="alert">{error}</p>}
          {busyAction === "connect" && (
            <p aria-live="polite" className="form-note source-connect-status" role="status">
              {busyStage === "connecting"
                ? "Connecting to the source…"
                : busyStage === "parsing"
                  ? "Reading playlist content…"
                  : "Saving playlist data locally…"}
            </p>
          )}
          {busyAction === "connect" &&
            busyStage === "saving" &&
            saveProgress &&
            saveProgress.total > 0 && (
              <ProgressIndicator
                className="source-connect-progress"
                label="Saving imported content"
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
              {busyAction === "connect" && busyStage === "saving" ? "Saving…" : "Cancel"}
            </button>
            <button className="primary-button" disabled={busyAction !== null} type="submit">
              {busyAction === "connect" ? <span className="spinner" /> : <Icon name="link" />}
              {busyAction === "connect"
                ? busyStage === "parsing"
                  ? "Reading playlist…"
                  : busyStage === "saving"
                    ? `Saving playlist…${saveProgress && saveProgress.total > 0
                      ? ` ${Math.floor(saveProgress.completed / saveProgress.total * 100)}%`
                      : ""}`
                    : editing ? "Saving…" : "Connecting…"
                : editing ? "Save changes" : "Connect source"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
