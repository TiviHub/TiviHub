# Capability map: TiviHub improvements after v1.8.0

Source: `tasks/app-improvements/plan.md`. Status: approved by the maintainer. Module ids are stable; do not rename them.

| Module id | Responsibility | Depends on |
|---|---|---|
| baseline | Measure startup, memory, search latency and accessibility; resolve every "to verify" marker in the plan | none |
| ci-quality | CI on Windows, Linux and macOS, ESLint and Prettier, cargo clippy/fmt/audit, release dry-run, flaky-test fixes | none |
| release-trust | Checksums, build provenance, signing decision, update flow | ci-quality |
| hardening | Real CSP, scoped filesystem permissions, stop caching provider calls that carry the login, turn off autofill on the add-source form, audit cast | baseline |
| playback-split | Split `PlaybackDialog` and `ContentPages`, no behavior change | ci-quality |
| playback-features | Keyboard shortcuts, sleep timer, next episode, channel zapping, clearer errors, check of Picture-in-Picture (speed, audio and quality selection already exist) | playback-split |
| a11y-fixes | Fix the accessibility findings from the baseline: critical list roles, accessible names, contrast | baseline |
| app-split | Break `App.tsx` into hooks, in slices | ci-quality |
| native-network | Native HTTP from Rust for provider calls, streaming parsers | hardening |
| query-engine | Page, sort and search in SQLite with full-text search, lazy startup | baseline, app-split |
| library-features | EPG reminders, parental PIN, source merge, watchlist | query-engine |

Build order (updated after the baseline, see `tasks/baseline/findings.md`): baseline (done) and ci-quality, then the cheap hardening fixes, then app-split, then query-engine, then a11y-fixes and release-trust, then playback-split and playback-features, native-network, then library-features.

Each module has its own `SPEC-<id>.md` in this folder, written and approved before its plan and code.
