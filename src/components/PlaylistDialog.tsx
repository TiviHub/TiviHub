import { useEffect, useRef, useState, type FormEvent } from "react";
import type { DrmSystem, Playlist, PlaylistType } from "../types";
import { validateHttpsUrl } from "../providers/http";
import { MAX_M3U_BYTES } from "../providers/m3u";
import { Icon } from "./common";

export interface PlaylistDraft {
  playlist: Playlist;
  fileContent?: string;
}

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
  const [drmLicenseUrl, setDrmLicenseUrl] = useState(editing?.drmLicenseUrl ?? "");
  const [drmSystem, setDrmSystem] = useState<DrmSystem>(editing?.drmSystem ?? "com.widevine.alpha");
  const [drmCertificateUrl, setDrmCertificateUrl] = useState(editing?.drmCertificateUrl ?? "");
  const [busyAction, setBusyAction] = useState<"connect" | "demo" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previousFocus = document.activeElement;
    document.querySelector<HTMLInputElement>(".playlist-dialog input:not([type='file'])")?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      if (previousFocus instanceof HTMLElement) previousFocus.focus();
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
      return;
    }
    if (file && file.size > MAX_M3U_BYTES) {
      setError("Playlist files are limited to 200 MB.");
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
    try {
      if (drmLicenseUrl) validateHttpsUrl(drmLicenseUrl, "DRM license URL");
      if (drmCertificateUrl) validateHttpsUrl(drmCertificateUrl, "FairPlay certificate URL");
      if (drmSystem === "com.apple.fps" && drmLicenseUrl && !drmCertificateUrl) {
        throw new Error("FairPlay requires the HTTPS server certificate URL from your provider.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "DRM details are invalid.");
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
      fileName: type === "M3U" && sourceMode === "file" ? file?.name ?? editing?.fileName : undefined,
      expiresAtMillis: editing?.expiresAtMillis,
      createdAt: editing?.createdAt ?? createdAt,
    };

    setBusyAction("connect");
    try {
      await onConnect({
        playlist,
        fileContent: type === "M3U" && sourceMode === "file" && file ? await file.text() : undefined,
      });
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not connect to this source.");
    } finally {
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
      <section className="dialog-card playlist-dialog" role="dialog" aria-modal="true" aria-labelledby="source-dialog-title">
        <header className="dialog-heading">
          <div>
                <p className="eyebrow">YOUR SOURCES / 01</p>
                <h2 id="source-dialog-title">{editing ? "Edit playlist" : "Add a playlist"}</h2>
          </div>
          <button aria-label="Close" className="icon-button" onClick={onClose} type="button">
            <Icon name="close" />
          </button>
        </header>

        <form className="dialog-form" onSubmit={(event) => void submit(event)}>
          <fieldset className="source-type-switch">
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
            <fieldset className="source-mode-switch">
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
            <span>Playlist name</span>
            <input
              autoComplete="off"
              maxLength={80}
              onChange={(event) => setName(event.target.value)}
              placeholder="Living room"
              value={name}
            />
          </label>

          {sourceMode === "url" || type === "XTREAM" ? (
            <>
              <label className="form-field">
                <span>{type === "M3U" ? "Playlist URL" : "Provider server URL"}</span>
                <input
                  autoComplete="url"
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
              </p>
            </>
          ) : (
            <>
              <label className="form-field">
                <span>M3U file</span>
                <input
                  accept=".m3u,.m3u8,audio/x-mpegurl,application/vnd.apple.mpegurl,text/plain"
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                  type="file"
                />
                <small>{file?.name ?? editing?.fileName ?? "No file selected"}</small>
              </label>
              <p className="form-note">M3U files are limited to 200 MB. The file stays on this device.</p>
              <label className="form-field">
                <span>Base URL for relative streams <em>Optional</em></span>
                <input
                  autoComplete="url"
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
                <span>Username</span>
                <input
                  autoComplete="username"
                  onChange={(event) => setUsername(event.target.value)}
                  required
                  value={username}
                />
              </label>
              <label className="form-field">
                <span>Password</span>
                <input
                  autoComplete="current-password"
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
              <summary>Guide &amp; DRM options</summary>
              <label className="form-field">
                <span>XMLTV guide URL <em>Optional</em></span>
                <input
                  autoComplete="url"
                  inputMode="url"
                  onChange={(event) => setEpgUrl(event.target.value)}
                  placeholder={type === "XTREAM" ? "Uses provider's XMLTV by default" : "https://provider.example/guide.xml"}
                  type="url"
                  value={epgUrl}
                />
              </label>
              <label className="form-field">
                <span>DRM system</span>
                <span className="select-control">
                  <select onChange={(event) => setDrmSystem(event.target.value as DrmSystem)} value={drmSystem}>
                    <option value="com.widevine.alpha">Widevine (Chrome / Edge)</option>
                    <option value="com.apple.fps">FairPlay (Safari)</option>
                  </select>
                  <span aria-hidden="true" className="select-chevron"><Icon name="expand_more" /></span>
                </span>
              </label>
              <label className="form-field">
                <span>DRM license URL <em>Optional</em></span>
                <input
                  autoComplete="url"
                  inputMode="url"
                  onChange={(event) => setDrmLicenseUrl(event.target.value)}
                  placeholder="https://provider.example/license"
                  type="url"
                  value={drmLicenseUrl}
                />
              </label>
              {drmSystem === "com.apple.fps" && (
                <label className="form-field">
                  <span>FairPlay certificate URL</span>
                  <input
                    autoComplete="url"
                    inputMode="url"
                    onChange={(event) => setDrmCertificateUrl(event.target.value)}
                    placeholder="https://provider.example/fairplay.cer"
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

          <div className="dialog-actions">
            <button className="secondary-button" onClick={onClose} type="button">Cancel</button>
            <button className="primary-button" disabled={busyAction !== null} type="submit">
              {busyAction === "connect" ? <span className="spinner" /> : <Icon name="link" />}
              {busyAction === "connect" ? (editing ? "Saving…" : "Connecting…") : editing ? "Save changes" : "Connect source"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
