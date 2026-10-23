---
name: testing-and-ci
description: How to test, lint, measure performance and what CI runs. Use when adding tests, fixing a bug, changing a workflow, or claiming something is faster.
---

# Testing, lint, performance, CI

## Commands

| Check | Command |
|---|---|
| Types | `npx tsc --noEmit` |
| Lint | `npm run lint` |
| Unit/DOM tests | `npx vitest run src` (`npm test` also builds the Rust storage harness first; bare `vitest run` picks up the Playwright spec and fails: setup issue, not a regression) |
| Rust | `cargo test --manifest-path src-tauri/Cargo.toml`, `cargo fmt --check`, `cargo clippy -- -D warnings` |
| Browser E2E | `npm run test:e2e` (Playwright, needs `npx playwright install chromium`) |
| Performance | `npm run perf:all` (also `perf:a11y`, `perf:keyboard`, `perf:credentials`) |

## Tests

- Vitest + Testing Library in `src/__tests__/`, `<module>.test.ts(x)`. Rust-backed storage tests are `*.rust.test.ts` via `rustHarness.ts`.
- **A bug fix starts with a test that fails.** New parser, branch, storage write, migration or security rule gets a test. One good test beats coverage.
- Test behaviour a user sees (`userEvent`, roles, text), not internals.
- Fixtures are synthetic. Never use a real provider URL, account or media (`CONTRIBUTING.md`). Mocks: `mockXtream`, `memorySqlite.ts`, `fixtures/`.
- Never skip, delete or loosen a test to get green; say it if one must change and why.
- E2E is for flows that need a real browser (large playlist deletion today). Keep it few and slow-tolerant.

## Performance

- Claims need numbers: run `npm run perf:all` before and after, put both in the PR. Baselines live in `tasks/baseline/results/`.
- Watch: cold start, time to open the Movies/Series/Live pages on a 200k-title playlist, scroll smoothness, memory after a catalog refresh, bundle size of the startup chunk.

## Lint

ESLint (`eslint.config.js`) is the gate, and `npm run lint` fails above 26 warnings (`--max-warnings`): lower that number whenever you fix one, never raise it. Rules the old code still breaks are warnings; raise one to `error` when its count hits zero. Do not add Prettier or Stylelint (would rewrite every line for no user benefit). `cargo fmt` formats Rust.

## CI (`.github/workflows/`)

- `ci.yml`: "Checks" on Windows, Linux, macOS arm64 and macOS x64 (typecheck, lint, tests, Rust tests, desktop build); Linux only: rustfmt, Clippy, npm and Rust audits. Plus "Browser E2E and website build".
- `release.yml`: a `vX.Y.Z` tag builds installers and creates a draft release from `docs/releases/vX.Y.Z.md`. Labelling a PR `release-dry-run` rehearses it without publishing.
- Rust advisories are listed in `src-tauri/.cargo/audit.toml`; do not add to it without maintainer approval.
- Pin action versions. Never put secrets in a workflow file.
