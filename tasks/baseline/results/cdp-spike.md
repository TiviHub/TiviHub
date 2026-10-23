# CDP feasibility spike (T1)

Result: works.

- WebView2 accepts `--remote-debugging-port` through `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS`. Playwright `chromium.connectOverCDP` attaches to the running Tauri release build and can read the page title and the startup dialog.
- The release build reached "ready" in about 0.7 s on an empty profile.
- Isolation: Tauri ignores an overridden `APPDATA` (it asks Windows for the known folder), so the first attempt wrote to the real data folder. That folder only received an empty database created by the spike.
- Fix: a perf build of the same app with a different identifier (`nl.tivihub.perf`, built with `tauri build --no-bundle --config`, into `src-tauri/target-perf`). Its SQLite and WebView2 data live in `%APPDATA%\nl.tivihub.perf` and `%LOCALAPPDATA%\nl.tivihub.perf`. Verified: the real `nl.tivihub.desktop` folders were not modified by the second run.
- Launch mode used: the packaged release executable (not `tauri dev`). No source files were changed to build it.
- The OS keychain entry is shared by identifier-independent constants, so the perf build reuses the same encryption key; the database content is separate.
