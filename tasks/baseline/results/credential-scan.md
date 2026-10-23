# Credential leak scan (T13c)

Method: `npm run perf:credentials`. The script adds an Xtream source (login `sentinel-user` / `sentinel-pass`) and an M3U source with `?token=SENTINEL-TOKEN-7f2` in its URL, runs a stream that cannot play, captures the diagnostics export and `localStorage`, closes the app, then searches every file under the perf build's two data folders for the sentinel strings, as UTF-8 and UTF-16. Raw hits: `credential-scan-files.json`.

| Place | Xtream username | Xtream password | M3U token |
|---|---|---|---|
| Diagnostics export (the downloaded log) | not found | not found | not found |
| `localStorage` (including the local diagnostic log) | not found | not found | not found |
| SQLite database and its WAL | **not found** | **not found** | found (in `tivihub.sqlite3-wal`: stream URLs) |
| WebView2 HTTP cache (`EBWebView/Default/Cache/Cache_Data/data_1`) | **found** | **found** | **found** |
| WebView2 autofill database (`EBWebView/Default/Web Data`) | **found** | not found | **found** |

Notes: the cast request was not exercised (no Chromecast); read `chromecast.rs` and the README, which already say stream URLs can carry credentials and are sent to the device. The backup file was not created (it needs a native save dialog); backups are encrypted by design.

## What this means

1. **Working as designed:** the diagnostics export and `localStorage` stay clean, and the Xtream login is no longer stored in SQLite (the v1.8.0 change).
2. **New finding, the HTTP cache:** Xtream authentication is carried in the query string of every API call (`player_api.php?username=...&password=...`). WebView2 keeps those request URLs in its on-disk cache, so the account login sits in plaintext under `%LOCALAPPDATA%\<app id>\EBWebView`. This was true before v1.8.0 as well. Likely fix: request provider API calls with `cache: "no-store"`, or clear the cache on startup and when a source is deleted.
3. **New finding, the autofill database:** the username and the M3U URL (with its token) were saved by the webview's form autofill (`Web Data`), probably from the add-source form. Likely fix: `autocomplete="off"` on those inputs.
4. **Known limit:** M3U stream URLs keep their token in SQLite. Unlike Xtream there is no login segment to separate out.
5. Deleting a source does not clear (1) or (3); both persist until the cache entry expires or the profile is reset. A "delete source" test should include them.

Both findings (2) and (3) belong in the `hardening` module.
