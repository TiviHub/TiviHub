---
name: coding
description: TypeScript, React and Rust conventions for TiviHub. Use when writing or reviewing any code in src/ or src-tauri/.
---

# Coding rules

Behave as in the `karpathy-guidelines` skill: state assumptions, smallest change, surgical edits, verify with a check.

## TypeScript / React

- `strict` stays on. No `any`; use `unknown` and narrow. No `@ts-ignore` / `eslint-disable` to get green (fix the cause, or ask).
- Types live in `src/types.ts` (domain) or beside the module (local). Storage shapes come from `StoreValues` in `src/storage/backend.ts`.
- Function components and hooks only. State in hooks (`src/hooks/`), components render.
- Effects: every `useEffect` that starts work (timer, listener, request) returns a cleanup. Prefer event handlers over effects. The `react-hooks` warnings in `eslint.config.js` are debt: do not add new ones.
- Errors: surface them. Never return an empty or success-shaped value for a failure (`CONTRIBUTING.md`). User-facing errors go through the toast hook (`useNotifications`); background failures go to `diagnosticLog`.
- Reuse before writing: a page with a left list and content beside it uses `BrowseShell` + `NavPanel`; saved titles use `LibraryCard`; category tiles come from `useCategoryEntries`; every search box is `SearchField` (with its clear X). Do not copy their markup into a page.
- Never show a number you guessed (a count of 0 for "not loaded"). Show nothing until it is known.
- Async: handle the "stale response" case (user switched playlist while a request ran). Check the active id before writing results.
- Naming: components `PascalCase.tsx`, everything else `camelCase.ts`, one main export per file. Match the file next to yours.
- Comments: only the why. Mark a known shortcut as `shortcut: <limit>, <when to fix>`.
- Imports: no deep cross-layer imports (see the `architecture` skill). No new dependency for a few lines.

## Rust (`src-tauri/`)

- Commands return `Result<T, String>`. No `unwrap()` / `expect()` outside tests and startup.
- Anything that blocks (SQLite, disk) is not on the async runtime thread: use the existing `StorageState` mutex pattern and keep the lock short.
- Validate input from the webview: URLs go through `check_target` (`net.rs`); never widen that policy without a test.
- `cargo fmt` and `cargo clippy -- -D warnings` must pass (CI runs both).
- Secrets: system keychain only (`storage.rs`). Never log a URL with credentials; use the redaction helpers.

## Before you say "done"

```sh
npx tsc --noEmit
npm run lint
npx vitest run src
cargo test --manifest-path src-tauri/Cargo.toml     # when Rust changed
```

Then run the app for UI changes. Report any check you could not run.
