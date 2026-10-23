# Spec: ci-quality (a pull request proves it works on every platform)

Module of `capability-map.md`. Depends on: nothing. Status: draft, waiting for approval.

## Objective

Today a platform-specific failure first appears when a release tag is pushed (the v1.7.0 release failed on the macOS x64 runner after `main` was green). This module makes the pull request itself prove the app builds and tests pass on Windows, Linux and macOS, adds the missing lint and audit checks, and adds a release dry-run, so a tag is never the first full build.

Success: a PR that breaks Linux or macOS fails before merge; a tag push never fails for a reason a PR could have caught.

## Facts I checked

- `ci.yml` runs one job on `windows-latest`: typecheck, `npm test`, `cargo test`, Playwright E2E, website build, desktop frontend build. No caching of Cargo, no timeout, no concurrency control.
- `release.yml` runs tests on Windows, Linux (`ubuntu-22.04`) and macOS (arm64 and x64) only after a tag is pushed.
- `cargo fmt --check` reports 62 diffs (the Rust code was never formatted). `cargo clippy --all-targets` reports 1 warning (in my own test, `set_readonly(false)`). `cargo audit` is not installed. `npm audit --omit=dev` reports 0 vulnerabilities.
- There is no ESLint or Prettier config and no `lint` script. `tsc` runs with `strict`, `noUnusedLocals` and `noUnusedParameters`.
- Dependabot covers npm only.
- Since v1.8.0, `npm test` builds a Rust harness first (`pretest`), which compiles Tauri from scratch on a cold runner.

## Assumptions

1. The repository stays on GitHub Actions. Public repo, so runner minutes are free.
2. Playwright E2E and the website build only need to run on one OS (Windows, as today). The unit tests, Rust tests, desktop build and typecheck run on all three.
3. Linux runs on `ubuntu-22.04` (the release OS, which has the WebKit 4.1 packages), macOS on `macos-latest` (arm64) plus `macos-15-intel` for x64, the same set as the release.
4. ESLint starts in warning mode on existing code and becomes an error only for rules with zero violations, so this module never forces a large refactor.
5. No Prettier. It would reformat the whole code base for no behavior gain (open question 2).

## Commands

```
Install:           npm ci
Typecheck:         npm run typecheck
Unit tests:        npm test
Rust tests:        cargo test --manifest-path src-tauri/Cargo.toml
Rust format:       cargo fmt --manifest-path src-tauri/Cargo.toml --check
Rust lint:         cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
Rust audit:        cargo audit --file src-tauri/Cargo.lock
JS audit:          npm audit --omit=dev --audit-level=high
Lint (new):        npm run lint
Browser E2E:       npm run test:e2e
Release dry-run:   run the "Release" workflow by hand (workflow_dispatch) with publish=false
```

## Project structure

```
.github/workflows/ci.yml        changed: matrix, caching, timeouts, concurrency, lint and audit steps
.github/workflows/release.yml   changed: workflow_dispatch trigger with a publish input; jobs unchanged otherwise
.github/dependabot.yml          changed: add cargo and github-actions
eslint.config.js                new
package.json                    new devDependencies and a lint script
src-tauri/                      one commit of cargo fmt output; no logic change
```

## Code style

Follow the repo: TypeScript, 2-space indent, double quotes. ESLint config in the flat format, with only rules that catch real bugs, not style:

```js
export default [
  { ignores: ["dist/**", "src-tauri/**", "scripts/perf/**"] },
  ...tseslint.configs.recommended,
  { plugins: { "react-hooks": reactHooks }, rules: reactHooks.configs.recommended.rules },
];
```

## Testing strategy

- Every change is verified by running it on a branch: open a draft PR and read the Actions result for all three OSes. A green local run is not enough for this module.
- To prove the new gates work, one throwaway commit per gate that breaks it on purpose (a formatting change, a clippy warning, a failing test on Linux only), seen failing in Actions and then removed.
- The release dry-run is proven by running it from the branch and checking that every job builds and nothing is published.

## Boundaries

- Always: keep the existing checks; make each new check fail the build only after it is clean; pin action versions as the repo does.
- Ask first: adding ESLint plugins or other dev dependencies; making a currently-passing check stricter; changing release triggers.
- Never: loosen or delete an existing test or check to get green; publish a release from the dry-run; add secrets to the workflows.

## Success criteria

1. A PR runs typecheck, `npm test`, `cargo test` and the desktop frontend build on Windows, Linux and macOS (arm64 and x64), and all pass.
2. `cargo fmt --check` and `cargo clippy -- -D warnings` pass and are required checks. The fmt change is one commit that touches only Rust files.
3. `npm run lint` exists, runs in CI, and fails on errors. The number of existing warnings is recorded in the PR.
4. `cargo audit` and `npm audit --audit-level=high` run in CI; a known-vulnerable test dependency (added on a throwaway commit) makes them fail.
5. Dependabot also covers `cargo` and `github-actions`.
6. Rust build output is cached; the second run of the same PR is at least 40 percent faster than the first on the Windows job (measured and written in the PR).
7. Runs cancel when the PR gets a new push (concurrency), and every job has a timeout.
8. Running "Release" with `publish=false` builds all four platform artifacts and creates no GitHub release.
9. The deliberate-break commits each fail the intended job and nothing else.

## Open questions

1. Is a 2-OS Playwright run needed, or is Windows enough for E2E? (I assume Windows.)
2. Do you want Prettier anyway? It would be one big reformat commit; I recommend skipping it.
3. May the dry-run live in `release.yml` as a `workflow_dispatch` input, or do you prefer a separate workflow file?
4. Should I make the checks "required" in branch protection, or is that a setting you change yourself? (I cannot change repository settings from here.)
