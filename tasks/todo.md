# Tasks: baseline

Plan: `tasks/plan.md`. Spec: `docs/specs/SPEC-baseline.md`. Sizes: XS 1 file, S 1-2, M 3-5. No task touches more than 5 files.

## Phase 1: Harness

- [ ] **T1: CDP feasibility spike** (S, risk first)
  - Description: Launch the desktop app with an isolated profile and `--remote-debugging-port`, attach with Playwright `connectOverCDP`, and read the page.
  - Acceptance:
    - A script starts the app with `APPDATA`/`LOCALAPPDATA` set to a temp folder and the maintainer's real data untouched.
    - It attaches over CDP and detects that the "Opening your library" dialog appeared and went away.
    - It records which launch mode worked (`tauri:dev` or the installed exe) in `docs/plans/baseline-results/cdp-spike.md`.
  - Verify: run `node scripts/perf/launch.mjs --check`; it prints the time to ready and exits 0. Confirm `%APPDATA%\nl.tivihub.desktop` modified time did not change.
  - Dependencies: none
  - Files: `scripts/perf/launch.mjs`, `docs/plans/baseline-results/cdp-spike.md`

- [ ] **T2: Seeded dataset generator** (S)
  - Description: Deterministic catalogs for sizes S, M, L, XL, shaped like the Xtream responses the importer reads.
  - Acceptance:
    - Same seed gives identical output; counts match the spec table; ids are unique.
    - Output passes the existing catalog validation (`loadXtreamCatalog` accepts it).
    - Generation streams or batches so XL does not need one giant string.
  - Verify: `npm test -- perfDataset` passes; `npm run perf:data -- --size M` writes the files and prints counts.
  - Dependencies: none
  - Files: `scripts/perf/dataset.mjs`, `src/__tests__/perfDataset.test.ts`, `package.json`

- [ ] **T3: Mock Xtream server** (S)
  - Description: Local HTTP server answering the six `player_api.php` actions plus the account info call, with CORS headers, serving a chosen dataset.
  - Acceptance:
    - `loadXtreamCatalog` pointed at the server returns the full dataset S (unit test).
    - Responses are streamed for L and XL; the server's memory stays bounded.
    - Credentials are fake sentinels, never real ones.
  - Verify: `npm test -- mockXtream`; `curl http://127.0.0.1:<port>/player_api.php?...` returns JSON for M.
  - Dependencies: T2
  - Files: `scripts/perf/mockXtream.mjs`, `src/__tests__/mockXtream.test.ts`

- [ ] **T4: Seed an isolated profile through the app** (M)
  - Description: Using T1's launcher and T3's server, add the mock source through the UI over CDP, wait for the import to finish, close the app, and copy the profile to `seeded/<size>/`.
  - Acceptance:
    - Seeding S and M succeeds and the app shows the expected counts.
    - A later launch restores a copy of the seeded profile instead of re-importing.
    - The import duration for each size is written to the results JSON (feeds T7).
    - `seeded/` is in `.gitignore`.
  - Verify: `npm run perf:seed -- --size M`; then launch with that profile and confirm the Movies page count equals the dataset.
  - Dependencies: T1, T3
  - Files: `scripts/perf/seed.mjs`, `scripts/perf/profile.mjs`, `.gitignore`, `package.json`

### Checkpoint 1: harness works
- [ ] An isolated app launches, imports S and M, and relaunches from a copy
- [ ] `npm test`, `npm run typecheck` and `cargo test` pass
- [ ] Real app data folder unchanged
- [ ] Review with maintainer before measuring

## Phase 2: Measurements

- [ ] **T5: Startup and memory runner** (M)
  - Description: For a seeded dataset, do 5 cold starts (discard a warm-up), record time to ready, the app plus WebView working set at ready, JS heap from CDP, and write one JSON per run with the machine specs and commit hash.
  - Acceptance:
    - Output has median, worst and spread per metric.
    - Records launch mode and the build used.
    - Closes every process it started, including `msedgewebview2.exe` children.
  - Verify: `npm run perf:baseline -- --size M --runs 5` produces the JSON; no stray `tivihub.exe` remains in `Get-Process`.
  - Dependencies: T4
  - Files: `scripts/perf/baseline.mjs`, `scripts/perf/system.mjs`, `scripts/perf/results.mjs`

- [ ] **T6: Interaction latency** (M)
  - Description: Script the six interactions (Movies, sort by year, filter by genre, global search typing, Live TV, Home) and record long tasks over 50 ms, with the worst, per interaction.
  - Acceptance:
    - Each interaction reports count and max of long tasks.
    - Selectors come from the existing tests (`appFlow`, `userActions`), not guesses.
    - Results sit beside T5's in the same JSON.
  - Verify: `npm run perf:baseline -- --size M --interactions`; the JSON has six entries.
  - Dependencies: T5
  - Files: `scripts/perf/interactions.mjs`, `scripts/perf/baseline.mjs`

- [ ] **T7: Catalog refresh timing** (S)
  - Description: Time a full refresh of the seeded source against the mock server, with long tasks.
  - Acceptance: refresh duration and long-task max recorded for M and L; the app ends with the same counts.
  - Verify: `npm run perf:baseline -- --size M --refresh`.
  - Dependencies: T5
  - Files: `scripts/perf/refresh.mjs`, `scripts/perf/baseline.mjs`

- [ ] **T8: Where startup time goes** (S)
  - Description: Capture a CDP CPU profile of startup on dataset L and summarize the top functions by self time (no source changes).
  - Acceptance:
    - A table of the top 15 functions with self time and share of startup.
    - A one-paragraph reading: read and parse, hydrate, React state, or render.
  - Verify: the profile JSON is saved and the summary is reproducible with `npm run perf:baseline -- --size L --profile`.
  - Dependencies: T5
  - Files: `scripts/perf/profile-startup.mjs`, `docs/plans/baseline-results/startup-profile.md`

### Checkpoint 2: numbers are trustworthy
- [ ] Datasets S, M, L measured with at least 5 runs each
- [ ] Two full runs agree within 15 percent (or the note records that they do not)
- [ ] Review with maintainer; adjust the matrix if the machine cannot do XL

- [ ] **T9: Full matrix M, L, XL** (S)
  - Description: Run T5 to T7 for M, L and XL and store the raw JSON.
  - Acceptance: results for all three sizes, at least 5 runs per figure, committed under `docs/plans/baseline-results/`, small files only.
  - Verify: `npm run perf:baseline -- --all`; the folder lists three sizes with per-run files.
  - Dependencies: T5, T6, T7
  - Files: `docs/plans/baseline-results/*.json`

## Phase 3: Audit

- [ ] **T10: Automated accessibility on 8 screens** (M, blocked on approval)
  - Description: With `@axe-core/playwright`, scan Home, Live TV, Movies, Series, Library, Downloads, Settings and the playback dialog, through the same CDP connection.
  - Acceptance:
    - Maintainer approves the new dev dependency before installation.
    - A table of violations by severity for each of the 8 screens.
  - Verify: `npm run perf:a11y` writes the JSON; `npm test` and `npm run typecheck` still pass after the dependency is added.
  - Dependencies: T1, maintainer approval
  - Files: `scripts/perf/a11y.mjs`, `package.json`, `package-lock.json`

- [ ] **T11: Keyboard-only, reduced motion, contrast** (S)
  - Description: Scripted keyboard pass (tab order reaches the main controls, Escape closes dialogs, focus returns) with reduced motion enabled and a contrast check of theme tokens.
  - Acceptance: a pass or fail per flow with the failing step named; contrast ratios listed for the light and dark themes.
  - Verify: `npm run perf:a11y -- --keyboard`.
  - Dependencies: T10
  - Files: `scripts/perf/keyboard.mjs`, `docs/plans/baseline-results/keyboard.md`

- [ ] **T12: Screen reader pass** (S, maintainer, optional)
  - Description: A short checklist for NVDA (or another reader) over add source, browse, play, favorite, settings.
  - Acceptance: notes recorded, or the findings note says "not performed".
  - Verify: filled checklist in `docs/plans/baseline-results/screen-reader.md`.
  - Dependencies: none
  - Files: `docs/plans/baseline-results/screen-reader.md`

- [ ] **T13a: Filesystem permission reach** (S)
  - Description: Find out what `fs:allow-write` and `fs:allow-remove` allow without a scope, by reading the plugin permission definitions and by a controlled test that writes and deletes a file inside a temp folder through the webview.
  - Acceptance: a short statement of what the webview can write or delete, with evidence; the test never touches a path outside its own temp folder.
  - Verify: the test passes and the temp folder is gone afterwards.
  - Dependencies: T1
  - Files: `docs/plans/baseline-results/fs-scope.md`, `scripts/perf/fs-scope.mjs`

- [ ] **T13b: Playback features review** (S)
  - Description: Read `PlaybackDialog.tsx` and settle: audio-track and quality selection (what the UI offers), the full list of keyboard shortcuts, playback rate, and Picture-in-Picture.
  - Acceptance: a table of each capability as present, partial or absent, with line references.
  - Verify: references open at the stated lines.
  - Dependencies: none
  - Files: `docs/plans/baseline-results/playback-capabilities.md`

- [ ] **T13c: Credential leak scan** (S)
  - Description: Add a source with sentinel credentials (M3U with a token in the URL, Xtream), play, favorite, cast-prepare, export diagnostics, create a backup, then search the exports and the profile for the sentinels.
  - Acceptance: a table of places checked (diagnostics export, logs, localStorage, SQLite files, backup file, cast request) and whether the sentinel appears.
  - Verify: the scan script's output matches the table.
  - Dependencies: T1
  - Files: `scripts/perf/credential-scan.mjs`, `docs/plans/baseline-results/credential-scan.md`

### Checkpoint 3: every "to verify" marker has an answer
- [ ] fs permissions, audio-track, shortcuts, credential leaks, startup breakdown all resolved
- [ ] Review with maintainer

## Phase 4: Findings

- [ ] **T14: Findings note and plan update** (M)
  - Description: Write `docs/plans/app-improvements-baseline.md` with machine specs, tables for S, M, L, XL, the long-task table, accessibility results and the resolved "to verify" items. Apply the decision rules and reorder the phases in `docs/plans/app-improvements.md`.
  - Acceptance:
    - All six success criteria in the spec are met, or the gap is stated.
    - Each "to verify" marker in `app-improvements.md` is replaced with confirmed or refuted.
    - A recommendation says which module is next and why.
  - Verify: re-read against `docs/specs/SPEC-baseline.md`; `npm test`, `npm run typecheck`, `cargo test` pass; `git diff --stat` shows no file under `src/` except `perfDataset.test.ts` and `mockXtream.test.ts`.
  - Dependencies: T9, T11, T13a, T13b, T13c (T12 if done)
  - Files: `docs/plans/app-improvements-baseline.md`, `docs/plans/app-improvements.md`

### Checkpoint: Complete
- [ ] All acceptance criteria in the spec met
- [ ] `npm run perf:baseline` reproduces the numbers on a clean checkout, two runs within 15 percent
- [ ] Ready for review and for choosing the next module
