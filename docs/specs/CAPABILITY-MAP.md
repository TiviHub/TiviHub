# Capability map: TiviHub improvements after v1.8.0

Source: `docs/plans/app-improvements.md`. Status: approved by the maintainer. Module ids are stable; do not rename them.

| Module id | Responsibility | Depends on |
|---|---|---|
| baseline | Measure startup, memory, search latency and accessibility; resolve every "to verify" marker in the plan | none |
| ci-quality | CI on Windows, Linux and macOS, ESLint and Prettier, cargo clippy/fmt/audit, release dry-run, flaky-test fixes | none |
| release-trust | Checksums, build provenance, signing decision, update flow | ci-quality |
| hardening | Real CSP, scoped filesystem permissions, credential audit of M3U, cast and diagnostics | baseline |
| playback-split | Split `PlaybackDialog` and `ContentPages`, no behavior change | ci-quality |
| playback-features | Picture-in-Picture, speed, sleep timer, next episode, shortcuts, zapping, clearer errors | playback-split |
| app-split | Break `App.tsx` into hooks, in slices | ci-quality |
| native-network | Native HTTP from Rust for provider calls, streaming parsers | hardening |
| query-engine | Page, sort and search in SQLite with full-text search, lazy startup | baseline, app-split |
| library-features | EPG reminders, parental PIN, source merge, watchlist | query-engine |

Build order: baseline and ci-quality, then release-trust, hardening, playback-split and app-split, then playback-features, native-network and query-engine, then library-features.

Each module has its own `SPEC-<id>.md` in this folder, written and approved before its plan and code.
