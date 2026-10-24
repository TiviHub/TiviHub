---
name: security
description: TiviHub's trust boundaries and the checklist for changing them (webview to Rust, network policy, proxy, credentials, capabilities, CSP, cast, external players, dependencies). Use before adding a Tauri command, a capability, a network call, a process spawn, or touching secrets.
---

# Security

TiviHub is local-first: no server, accounts or analytics. The attacker is **a hostile playlist, portal or stream** (everything a provider sends is untrusted) and **a web page or process on the same computer**. Vulnerabilities are reported through `SECURITY.md`, not a public issue.

## Boundaries and who guards them

| Boundary | Guard | Where |
|---|---|---|
| Webview to the internet | All requests go through Rust `http_fetch`. `check_target` allows only http/https, resolves host names, refuses loopback, link-local (169.254.x) and multicast, and re-checks every redirect (max 5). 200 MB cap, header allow-list without line breaks | `src-tauri/src/net.rs`, `providers/transport.ts` |
| Streams | Loopback proxy: secret token per registration, Host must be `127.0.0.1:<port>` or `localhost:<port>` (stops DNS rebinding), GET/HEAD only, headers set once by `proxy_register`, same `check_target` policy | `net.rs` |
| Webview to OS | Tauri capabilities: window close/minimize/maximize, `fs` open/remove/write, opener default URLs | `src-tauri/capabilities/default.json` |
| Content | CSP in `tauri.conf.json`: scripts `'self'` only, `object-src 'none'`, `frame-src 'none'`, `base-uri 'self'`. `http:`/`https:` stay open for images, media and connect because providers are arbitrary hosts | `src-tauri/tauri.conf.json` |
| Credentials | OS keychain key; secrets encrypted in the `secrets` store; Xtream stream URLs stored with `/{username}/{password}/` placeholders | `storage.rs`, `storage/credentialUrls.ts` |
| Other programs | VLC or mpv only, address as a separate argument, http(s) only, User-Agent without line breaks and at most 256 chars | `external_player.rs` |
| Chromecast | Local network only. The `chromecast` crate accepts every certificate (Chromecasts are self-signed), so cast traffic is **not authenticated** | `chromecast.rs`, `.cargo/audit.toml` |

## Rules

- **Never widen `Policy` or `check_target`** (no "allow private networks", no new scheme) without a test that fails first. Loopback is allowed only under the test policy.
- A new Tauri command validates every argument from the webview as hostile, returns `Result<T, String>` with a message free of addresses and credentials, and is registered in `main.rs`. Prefer no new capability; never add `fs` scopes broader than a directory the user chose.
- **No shell.** Spawn programs with `Command::new(<fixed program>).args([...])`; never build a command line from strings, and never pass a user value that can start with `-` as an option.
- **No credential in a log, error, diagnostic, URL stored in SQLite, backup (unless encrypted by `encryptBackup`) or release note.** Use `redactUrl`; Rust diagnostics carry only `component` + `code`.
- A keychain failure stops with an error and never creates a new key (see the `database` skill).
- Render provider text as text. No `dangerouslySetInnerHTML`, `innerHTML`, `eval` or `new Function`; subtitles go through `asWebVtt` as text tracks.
- Provider-controlled sizes are capped (fetch 200 MB, subtitles 5 MB, 256 proxy profiles). A new read of remote data gets a cap.
- Test fixtures never contain a real provider URL, account or media.

## Dependencies and CI

- `npm audit --omit=dev --audit-level=high` and `cargo audit` run on Linux CI. The accepted Rust advisories (all from the `chromecast` crate) are in `src-tauri/.cargo/audit.toml`, plus `RUSTSEC-2024-0437` in `ci.yml`. Do not add one without maintainer approval, and remove entries when the crate is replaced.
- No new dependency without asking (see `CLAUDE.md`); pin workflow actions; no secrets in workflows.
- `npm run perf:credentials` scans for credentials in stored data and output: run it when you touch storage, backup or logging.

## Review checklist (for any change that crosses a boundary)

1. What does the webview, a playlist or a stream control here? Could it reach `127.0.0.1`, the LAN, `file:` or a process?
2. Is the check in Rust, not only in TypeScript?
3. Does a failure message or log now contain an address, header or password?
4. Is there a test that fails without the guard (loopback refused, bad header dropped, wrong token gives 403)?
5. Did a capability, a CSP directive or an advisory ignore grow? If yes, say why in the PR.

## File access

`capabilities/default.json` grants `fs:allow-open/remove/write` with no fixed scope, so nothing is reachable by default. `allow_download_directory` (`main.rs`) adds a scope at runtime, only for a folder picked in the native dialog or the one saved from such a pick (`download-directory.txt` in the app config folder), and recursively. Consequences: a path from the webview never widens the scope, but the whole picked tree is writable and removable, including files TiviHub did not create. Keep `fs` access in `services/downloads.ts` and never add a static scope or a command that takes a path to allow.
