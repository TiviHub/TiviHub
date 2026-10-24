---
name: playback
description: How TiviHub plays streams (Shaka, native element, loopback proxy, DRM, subtitles, errors, cast, external players). Use before changing PlaybackDialog, usePlayback, src/lib/playback*, the proxy in net.rs, or anything that starts a stream.
---

# Playback

One dialog plays everything: `PlaybackDialog.tsx` (still ~1,100 lines: see the size rule in `architecture`; extract the part you touch). Live TV uses the same engine inline. State lives in `usePlayback`, pure helpers in `src/lib/playback*.ts` (`playbackMedia`, `playbackErrors`, `playbackDiagnostics`, `playbackAudio`).

## Which path plays a stream

Decided in `load()` in `PlaybackDialog.tsx`, in this order:

1. **Native media element** (`video.src`): offline downloads, or no DRM and (a direct file by extension: `directMediaUrl`, an `item.direct` flag, or Safari-class native HLS when no proxy is used: `nativeHlsUrl`).
2. **Shaka Player** for everything else (HLS, DASH, DRM). Shaka is `import("shaka-player")`ed on first use: keep it lazy.
3. **Native HLS fallback** only after a Shaka failure that `shouldAttemptNativeHlsFallback` accepts (code 4032, or 1001 with HTTP 509, `.m3u8`, no DRM, support not "no"). It is tried once per item (`nativeHlsFallbackAttemptedRef`).

The chosen path is recorded (`PlaybackPath`) and shown in diagnostics. Do not add a fourth path without a test in `playbackDiagnostics.test.ts`.

## The proxy (desktop only)

A web view cannot set `User-Agent`, `Cookie` or `Authorization`. When a source needs them (`usesNativeTransport(item.userAgent)`), `proxyBase()` registers the headers once with `proxy_register` and gets `http://127.0.0.1:<port>/p/<token>`; `proxiedUrl(base, url)` appends `?u=<encoded target>`.

- With a proxy, Shaka request filters rewrite manifest (0), segment (1), timing (4) and key (6) requests; **licence requests are never proxied.**
- A response filter restores the real address from `x-final-url` (or `?u=`), otherwise relative segment URLs resolve against the proxy and break.
- Proxied playlists must go through Shaka, not native HLS, for the same reason (see the comment in `load()`).
- The page never sends headers to the proxy; Rust adds the registered ones. Keep it that way (see the `security` skill).

## DRM

`item.drmLicenseUrl` + `item.drmSystem` (+ optional `drmCertificateUrl`) become Shaka `drm.servers` / `advanced.serverCertificateUri`. FairPlay registers both `com.apple.fps` and `com.apple.fps.1_0`. A licence URL without a system is an error, not a guess. DRM streams never use the native path or the HLS fallback.

## Errors

- Shaka errors go through `playbackErrorMessage(cause)`: one short, actionable sentence per code range (6000-6020 DRM, 4032 incompatible, 1001/1002/1003 network, 1-4 media). A new code range gets a message and a test in `playbackErrors.test.ts`.
- The user sees the message (`showPlaybackFailure`); the cause goes to `recordPlaybackFailure` (path, code, category, HTTP status only: **no URLs, no headers**).
- Backend errors are `component` + `code` pairs (`BackendDiagnostics`, 50 kept): never put an address or a message with credentials in them.

## Rules for changes

- Every `load()` run checks `disposed` after each `await`; the cleanup destroys the Shaka player and removes listeners. A new `await` needs a new `disposed` check.
- Resume position is applied after metadata (`loadedmetadata` natively, after `load()` in Shaka), clamped to `duration - 1`.
- Subtitles: `MAX_SUBTITLE_BYTES` (5 MB) limit, SRT is converted by `asWebVtt`. Reject larger files before reading them whole.
- Controls go into `PlayerControls` / `PlayerMenu` (see the `ui` skill), never next to the `<video>`.
- **Cast** (`chromecast.rs`, `CastPanel`): devices come from discovery on the local network; the device fetches the stream address itself, so a stream that needs the proxy's headers cannot be cast.
- **Open in VLC/mpv** (`external_player.rs`): for streams the web view cannot decode (AC-3). Only those two programs, the address as its own argument, http(s) only.
- A playback bug starts with a failing test on the pure helper (`src/lib/playback*`). The dialog itself is hard to test, so move logic out of it rather than into it.

## Verify

`npx vitest run src/__tests__/playbackErrors.test.ts src/__tests__/playbackDiagnostics.test.ts`, `cargo test` if `net.rs` changed, then play an HLS stream, a direct file and a proxied one in the real app (`npm run tauri:dev`). Report which you could not try.
