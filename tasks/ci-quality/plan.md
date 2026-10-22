# Implementation Plan: ci-quality

Spec: `docs/specs/SPEC-ci-quality.md` (approved). Task list: `tasks/ci-quality/todo.md`. The older `tasks/plan.md` and `tasks/todo.md` belong to the finished `baseline` module and still have unchecked items, so this plan lives in its own folder instead of replacing them.

## Overview

Make a pull request prove the app builds and its tests pass on Windows, Linux and macOS (arm64 and x64), enforce Rust formatting and lint, add ESLint and dependency audits, speed CI up with caching, and add a release dry-run so a tag is never the first full build.

## What I read to plan this

- `.github/workflows/ci.yml`: one Windows job, `on` pull_request and push to `main` only.
- `.github/workflows/release.yml`: tag-triggered. Jobs `create-release`, `windows`, `unix` (matrix: `ubuntu-22.04`, `macos-latest`, `macos-15-intel`) and `publish`. The Linux dependency list and the package commands (`package:windows`, `package:unix`) are already there to copy from.
- Actions in use: `actions/checkout@v4`, `actions/setup-node@v4`, `dtolnay/rust-toolchain@stable`.
- `CONTRIBUTING.md` lists the local checks; it must gain the new commands.
- Current state, measured: `cargo fmt --check` 62 diffs, `cargo clippy` 1 warning (mine), `npm audit --omit=dev` clean, `cargo audit` not installed, no ESLint.

## Design decisions

1. **One matrix job for the cross-platform checks, one Windows job for the rest.** Matrix `os: [windows-latest, ubuntu-22.04, macos-latest, macos-15-intel]` runs checkout, Node, Rust, Linux packages (Linux only), `npm ci`, typecheck, lint, `npm test`, `cargo test` and the desktop frontend build. The Playwright E2E and website build stay in a separate Windows job, as today. Rust fmt and clippy run once, on Linux, because the result does not depend on the OS except for `cfg` code, which clippy on Linux still compiles for Linux only; the Windows `cargo test` already compiles the Windows-specific code.
2. **Caching with `Swatinem/rust-cache@v2`** keyed per OS, plus Node's built-in npm cache. This is the one new third-party action; it is widely used and pinned by major version like the others (ask-first item in the spec, covered by approval).
3. **Cancel stale PR runs, never main.** `concurrency` group on the ref with `cancel-in-progress` only for pull requests. Every job gets `timeout-minutes` (30 for the matrix, 20 for the others).
4. **Branch proofs without a pull request.** I cannot open a pull request from here (no GitHub credential access), so CI also triggers on pushes to branches named `ci-proof/**`. That lets me push throwaway branches and read the results from GitHub's public API. The trigger stays in the file; it costs nothing.
5. **ESLint in warning mode first.** Flat config with `typescript-eslint` recommended and `eslint-plugin-react-hooks`. Any rule that reports an error today is lowered to `warn`, so the new gate cannot fail on existing code; the warning count is recorded.
6. **Audits: fail on high severity only.** `npm audit --omit=dev --audit-level=high` and `cargo audit`. If `cargo audit` finds existing advisories, I list them and ask before adding any ignore (spec: ask first).
7. **Release dry-run through the PR label.** A manual workflow trigger only works once a workflow file is on the default branch, so it could not be tested before merge. Instead `release.yml` gets a `pull_request` trigger (types: labeled) that only runs when the label is `release-dry-run`, plus `workflow_dispatch` for later. In dry-run mode the release creation, asset upload and publish steps are skipped, and the built installers are uploaded as workflow artifacts instead. The build jobs currently need `create-release`; they will accept it being skipped.
8. **No Prettier.** (Spec assumption 5.) Formatting is only enforced for Rust.

## Dependency graph

```
T1 Rust fmt + clippy ─┐
T2 ESLint ────────────┼─► T3 CI matrix ─► T4 audits ─┐
                      │                     T5 dependabot ─┼─► T7 deliberate-break proofs ─► T8 cache timing ─► T9 docs
                      └────────────► T6 release dry-run ───┘
```

T1, T2, T5 are independent. T3 needs T1 and T2 (the new checks must pass before they become gates). T4 and T6 edit different workflow files and can follow T3 in either order. T7 and T8 need everything else.

## Phases and checkpoints

- **Phase 1, clean slate (T1, T2):** local only. Checkpoint: `cargo fmt --check`, `cargo clippy -D warnings`, `npm run lint`, `npm test`, `cargo test` all pass locally.
- **Phase 2, the matrix (T3, T4, T5):** needs the first push to a `ci-proof/*` branch. Checkpoint: all four OS jobs green in Actions.
- **Phase 3, release dry-run (T6):** Checkpoint: a dry-run builds all platform artifacts and creates no release.
- **Phase 4, proof and docs (T7 to T9).**

## Risks and mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Linux or macOS fails for reasons only seen there (missing packages, path or timing differences like the v1.7.0 timeout) | High, but that is the point | Run on a `ci-proof/*` branch first; fix root causes, never skip a platform or loosen a test |
| `npm test` builds the Rust harness (`pretest`), compiling Tauri on a cold runner | Medium: slow first run | Rust cache; timeout of 30 minutes; measure the cold and warm times in T8 |
| `cargo audit` finds advisories in the existing lockfile | Medium | Triage in T4; ask before any ignore; otherwise upgrade the crate |
| Job names change, so existing required-check settings stop matching | Medium | Tell the maintainer exactly which job names to select once the PR runs; I cannot change branch protection |
| `macos-15-intel` runners are scarce or removed | Low | Same runner as the release today; if unavailable, note it rather than dropping x64 silently |
| The dry-run could publish by mistake | High | Guard every publish step with `github.event_name == 'push'`; check in T7 that a dry-run creates no release (look at the Releases API) |
| Pushing throwaway branches adds clutter on the remote | Low | Name them `ci-proof/*` and delete them afterwards (needs your OK to delete remote branches) |

## Parallelization

T1, T2, T5 can be done in any order. After T3 lands, T4 and T6 are independent of each other.

## Open questions (carried from the spec, defaults assumed)

1. Playwright E2E on Windows only. (Assumed.)
2. No Prettier. (Assumed.)
3. Dry-run lives in `release.yml`. (Assumed; implemented through the PR label because of the default-branch limit.)
4. Branch protection (required checks) is the maintainer's setting.
5. New: OK to push and later delete `ci-proof/*` branches on the remote? (Needed for T3 to T8. I will ask again before the first push.)
