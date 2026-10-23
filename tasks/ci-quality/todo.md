# Tasks: ci-quality

Plan: `tasks/ci-quality/plan.md`. Spec: `tasks/ci-quality/spec.md`. No task touches more than 5 files.

## Phase 1: clean slate

- [x] **T1: Format Rust and fix the clippy warning** (S)
  - Description: Run `cargo fmt` once as its own commit, then fix the single clippy warning (my `set_readonly(false)` test).
  - Acceptance:
    - `cargo fmt --check` passes; the fmt commit contains only `.rs` files and no logic change.
    - `cargo clippy --all-targets -- -D warnings` passes.
    - All 21 Rust tests still pass.
  - Verify: run those three commands; `git show --stat` of the fmt commit lists only `.rs` files.
  - Dependencies: none
  - Files: `src-tauri/src/main.rs`, `src-tauri/src/storage.rs`, `src-tauri/src/chromecast.rs`, `src-tauri/src/diagnostics.rs`, `src-tauri/examples/storage_harness.rs`

- [x] **T2: ESLint with a lint script** (M)
  - Description: Add ESLint (flat config, `typescript-eslint` recommended, `eslint-plugin-react-hooks`) and `npm run lint`. Rules that currently error are lowered to warnings.
  - Acceptance:
    - `npm run lint` exits 0 on the current code; the number of warnings per rule is recorded in the commit message.
    - Ignores `dist`, `src-tauri`, `scripts/perf`.
    - A deliberately introduced error rule violation makes it exit non-zero (checked locally, then removed).
  - Verify: `npm run lint`; `npm test` and `npm run typecheck` unchanged.
  - Dependencies: none
  - Files: `eslint.config.js`, `package.json`, `package-lock.json`

### Checkpoint 1: local gates are clean
- [x] `cargo fmt --check`, `cargo clippy -D warnings`, `npm run lint` (0 errors, 51 warnings), `npm run typecheck`, `npm test`, `cargo test` all pass
- [ ] Review with maintainer

## Phase 2: the matrix

- [x] **T3: Cross-platform CI job** (M)
  - Description: Rewrite `ci.yml`: a matrix job on four runners for install, typecheck, lint, `npm test`, `cargo test`, desktop build; Rust fmt and clippy on Linux; the Playwright E2E and website build in a separate Windows job; `concurrency` (cancel PR runs only), `timeout-minutes`, `Swatinem/rust-cache@v2`, and the `ci-proof/**` push trigger.
  - Acceptance:
    - A push to a `ci-proof/*` branch runs all jobs and they pass on Windows, Linux, macOS arm64 and macOS x64.
    - Existing steps are all still present (nothing weakened).
    - Linux packages are the same list as in `release.yml`.
  - Verify: push the branch (after the maintainer's OK), read the run via `https://api.github.com/repos/TiviHub/TiviHub/actions/runs?branch=...`; all jobs conclude `success`.
  - Dependencies: T1, T2
  - Files: `.github/workflows/ci.yml`

- [x] **T4: Dependency audits** (S)
  - Description: Add `cargo audit` and `npm audit --omit=dev --audit-level=high` steps.
  - Acceptance: both run in CI and pass; any existing advisory found is listed in the PR and nothing is ignored without maintainer approval.
  - Verify: Actions run is green; the step logs show both tools ran.
  - Dependencies: T3
  - Files: `.github/workflows/ci.yml`

- [x] **T5: Dependabot for cargo and GitHub Actions** (XS)
  - Description: Add two `updates` entries (`cargo` in `/src-tauri`, `github-actions` in `/`), weekly, same PR limit style as npm.
  - Acceptance: `dependabot.yml` is valid YAML and lists three ecosystems.
  - Verify: parse the file locally; GitHub's Dependabot tab shows no config error after the push (maintainer check).
  - Dependencies: none
  - Files: `.github/dependabot.yml`

### Checkpoint 2: PRs prove all platforms
- [x] All four OS jobs green in Actions; E2E job green
- [ ] Audit results reviewed with the maintainer
- [ ] Review with maintainer before touching the release workflow

## Phase 3: release dry-run

- [x] **T6: Dry-run mode in the release workflow** (M)
  - Description: Add `pull_request: types [labeled]` (only for label `release-dry-run`) and `workflow_dispatch` to `release.yml`. In those runs, skip release creation, asset upload and publish, and upload the installers as workflow artifacts.
  - Acceptance:
    - A tag push still behaves exactly as before (same jobs, same publish).
    - A dry-run builds the Windows installer and the Linux and macOS packages and creates no GitHub release.
    - Every publish-related step is guarded by `github.event_name == 'push'`.
  - Verify: dry-run from a `ci-proof/*` PR or via the label (needs an open PR, maintainer action); check the Releases API shows no new release; confirm the artifacts exist.
  - Dependencies: T3
  - Files: `.github/workflows/release.yml`

### Checkpoint 3: a tag is no longer the first full build
- [x] Dry-run green on all platforms, no release created
- [ ] Diff of `release.yml` reviewed line by line for the push path

## Phase 4: proof and docs

- [x] **T7: Deliberate-break proofs** (M)
  - Description: On throwaway `ci-proof/*` branches, break each gate once: a mis-formatted Rust file, a clippy warning, an ESLint error, a test that fails only on Linux, and a known-vulnerable dependency. Confirm each fails only its own job.
  - Acceptance: a table in the PR: break, expected failing job, actual result. Nothing from these branches is merged.
  - Verify: Actions API for each branch; branches deleted afterwards (with the maintainer's OK).
  - Dependencies: T3, T4
  - Result (runs on 2026-10-21; each failed only its own step, all other jobs green):

    | Break | Expected failing step | Actual |
    |---|---|---|
    | `break-fmt` | Check Rust formatting (Linux) | Linux: Check Rust formatting |
    | `break-clippy` | Run Clippy (Linux) | Linux: Run Clippy |
    | `break-lint` | Lint (all 4 OS) | all 4: Lint |
    | `break-linux-test` | Run Rust tests (Linux only) | Linux: Run Rust tests; other 3 OS and E2E passed |
    | `break-npm-audit` | Audit JavaScript dependencies (Linux) | Linux: Audit JavaScript dependencies |
    | `break-cargo-audit` | Audit Rust dependencies (Linux) | Linux: Audit Rust dependencies |
  - Files: none kept (throwaway commits)

- [x] **T8: Cache speed-up measurement** (S)
  - Description: Compare the Windows matrix job time on a cold run and a warm re-run of the same commit.
  - Acceptance: the warm run is at least 40 percent faster, with both durations in the PR; if not, say so and look at what is not cached.
  - Verify: job durations from the Actions API.
  - Dependencies: T3
  - Result: Windows warm run only 33% faster (target 40%, missed); Linux -71%, macOS x64 -57%.
  - Files: none

- [x] **T9: Contributor docs** (XS)
  - Description: Update `CONTRIBUTING.md` with the new local commands (`npm run lint`, `cargo fmt`, `cargo clippy`, `cargo audit`) and what CI runs, and note the job names to select as required checks.
  - Acceptance: commands match what CI runs; no stale statements (CONTRIBUTING currently says CI runs on pushes to main and PRs on one OS).
  - Verify: re-read against `ci.yml`.
  - Dependencies: T3, T4
  - Files: `CONTRIBUTING.md`

### Checkpoint: Complete
- [ ] All nine success criteria in the spec met, with evidence
- [ ] `npm test`, `npm run typecheck`, `cargo test` pass locally
- [ ] Ready for review
