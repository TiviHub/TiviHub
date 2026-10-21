# Filesystem permission reach (T13a)

Method: read the capability file, the Rust side (`src-tauri/src/main.rs`) and the `tauri-plugin-fs` 2.7.1 source. I did not run a live write test: it needs the native folder picker, which cannot be driven over the debugging port, and Tauri's internals are not visible to injected scripts in this app. So this is a code-reading result, stated as such.

## What is granted

`src-tauri/capabilities/default.json` grants `fs:allow-open`, `fs:allow-remove` and `fs:allow-write`. The permission definitions say "Enables the command **without any pre-configured scope**", so by themselves they allow the commands but no paths.

## What decides which paths work

- `tauri-plugin-fs` checks every path against the global scope plus the command scope (`resolve_path` in `commands.rs`) and returns `PathForbidden` when the path is not allowed.
- No static scope is configured in `tauri.conf.json` or the capability file.
- The only code that adds a path at runtime is `allow_download_directory` in `main.rs`. It runs after the user picks a folder in the native dialog (`choose_download_directory`) or for the folder saved from an earlier pick (`saved_download_directory`, read from `download-directory.txt` in the app data folder). The comment in `main.rs` says the same: write access is only granted to a folder the user picked, never to a path supplied by the webview.

## Result

Confirmed (by reading): without a user-picked folder the webview cannot write, open or remove any file. After the user picks a download folder, the webview can write, open and delete **any file inside that folder and its subfolders** (`allow_directory(&directory, true)` is recursive), not only files TiviHub created.

Residual risks:

1. If the user picks a folder that already holds other files (their whole Downloads or Documents folder), a script running in the webview could delete or overwrite them. Today that needs script injection, and there is no CSP (`"csp": null`), so a CSP would narrow this.
2. The saved folder is re-allowed on every launch. The file that stores it sits in the app data folder, which the webview cannot write, so it cannot be redirected from the webview.

Suggested follow-ups for the `hardening` module: create and use a `TiviHub` subfolder inside the picked folder as the scope instead of the picked folder itself, and scope `fs:allow-remove` to downloaded files only if the plugin allows it.
