# TiviHub 2.0 plan

Goal: catch-up, custom User-Agent per playlist, radio mode, Stalker portals. Version 2.0.0.

## Why the order matters

A browser or webview cannot set `User-Agent`, `Cookie` or `Authorization` on a request. Custom User-Agent and Stalker both need
them, so both depend on one new piece: a Rust HTTP layer. Catch-up and radio need no new backend and can ship first.

Desktop only: the browser build cannot set those headers. In the browser build the User-Agent field and the Stalker source type
are hidden and the app says so.

## Steps (each ends with typecheck, lint, tests, and a commit)

### 0. Version 2.0.0
- `package.json`, `package-lock.json`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`; release notes `docs/releases/v2.0.0.md`
  (replace the unreleased v1.11.1 notes: fold them in).

### 1. Catch-up and timeshift (no backend change)
- Data: `LiveChannel.archiveDays?: number` and `LiveChannel.catchup?: { kind: "xtream" | "default" | "append" | "shift" | "flussonic"; template?: string }`.
- Xtream: channels with `tv_archive == 1` and `tv_archive_duration` days. Archive URL
  `{base}/timeshift/{user}/{pass}/{minutes}/{YYYY-MM-DD:HH-mm}/{stream_id}.ts` (start in the provider's time zone: use the
  `server_info.timezone` from the auth response, fall back to local time).
- M3U: attributes `catchup`, `catchup-source`, `catchup-days` (and `tvg-rec` for days). Build the URL from the template using
  `${start}`, `${end}`, `${timestamp}`, `${duration}`, `{utc}`, `{utcend}`.
- UI (TV Guide + Live TV): a past programme inside the archive window shows a replay button; the current programme gets
  "Start over". Played through the existing player as a non-live item with `contentType: "LIVE"` kept out of "recently watched".
- Tests: URL builders for each kind (pure functions), window check, a TV Guide test that past programmes of an archive channel are playable.
- Style guide: add the replay button / "Archive" chip in the same change.

### 2. Radio mode (no backend change)
- Detect radio: M3U `radio="true"`; Xtream categories named radio are not reliable, so only the explicit flag plus a per-group toggle later.
- `LiveChannel.radio?: true`. A "Radio" filter chip in Live TV; radio channels use an audio-only player layout (artwork + title,
  no black video box), play through the same engine, keep playing when you browse.
- Tests: parser flag, filter, player shows audio layout.

### 3. Rust HTTP layer (foundation for 4 and 5)
- Dependencies: `reqwest` (rustls, stream), plus a small local proxy using `tokio` + `hyper` (or reqwest + a TcpListener).
- Command `http_fetch { url, method, headers, body, maxBytes }` → `{ status, headers, text }`. Limits: 200 MB, HTTPS/HTTP only,
  no redirects to non-HTTP, timeouts. Used for playlist, Xtream, XMLTV and Stalker requests when a playlist needs custom headers.
- Local stream proxy on `127.0.0.1:<random port>`, started lazily: `GET /p/<token>?u=<encoded url>`; the token maps to a stored
  header set (User-Agent, Cookie, Authorization), never accepts arbitrary headers from the page, only forwards to http(s) targets,
  streams the body, passes `Range`, and does not follow redirects to private networks unless the playlist itself is private.
- Frontend: `src/providers/transport.ts` picks direct `fetch` (no custom headers) or `http_fetch`; Shaka gets a request filter that
  rewrites every request (manifest, segments, license excluded) to the proxy; `<video src>` uses the proxy URL.
- Tests (Rust): header forwarding, range pass-through, scheme check, size limit, token required. TS: transport selection.

### 4. Custom User-Agent per playlist
- `Playlist.userAgent?: string` (max 256 chars, no control characters); saved with the playlist, included in backups and validated there.
- Playlist dialog field "User-Agent (optional)" with presets (VLC, Chrome, "TiviHub default").
- All requests for that playlist (catalog, guide, streams, downloads) go through step 3 when it is set.
- Tests: validation, backup round trip, transport uses the header, field hidden in the browser build.

### 5. Stalker / Ministra portals
- `PlaylistType = "M3U" | "XTREAM" | "STALKER"`; fields `portalUrl`, `macAddress` (validated `XX:XX:XX:XX:XX:XX`), optional login/password.
  The MAC is a credential: stored sealed like passwords.
- Provider `src/providers/stalker.ts` over `http_fetch`: handshake → token, profile, genres, `itv` channels (paged), VOD and series
  lists, `create_link` for each play (links are short-lived, so resolved at play time, not stored). EPG from `get_epg_info`/`get_short_epg`.
- Headers: `Cookie: mac=…; stb_lang=en; timezone=…`, `Authorization: Bearer <token>`, MAG-style User-Agent unless the playlist
  overrides it.
- Catalog goes through the existing staging import so large portals stay fast; ids stable from the portal's channel ids.
- Tests: a mock portal (like `mockXtream`) covering handshake, paging, link creation, token refresh, error messages.
- Intended for accounts you are authorized to use; the dialog says so.

### 6. Wrap-up
- Style guide updated for every new control, both themes checked, desktop app run through the debug-exe probe used before,
  full test run (JS, Rust, e2e), release notes, PR.

## Risks
- Stalker has no public spec; portals differ. Mitigation: build against the open-source portal behavior, mock server tests, clear
  per-step error messages, and keep it behind the source type picker.
- The proxy is new attack surface. Mitigation: token-scoped headers, loopback only, scheme and size checks, no page-supplied headers.
- Archive time zones are the usual source of off-by-hours bugs; covered by unit tests with fixed time zones.
