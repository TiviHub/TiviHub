# Tasks: baseline

Plan: `tasks/baseline/plan.md`. Spec: `tasks/baseline/spec.md`. Sizes: XS 1 file, S 1-2, M 3-5. No task touches more than 5 files.

## Phase 1: Harness

- [x] **T1: CDP feasibility spike** (S, risk first)
  - Description: Launch the desktop app with an isolated profile and `--remote-debugging-port`, attach with Playwright `connectOverCDP`, and read the page.
  - Acceptance:
    - A script starts the perf build (identifier `nl.tivihub.perf`, separate data folders) and the maintainer's real data is untouched. (Changed from overriding `APPDATA`, which Tauri ignores; see `tasks/baseline/results/cdp-spike.md`.)
    - It attaches over CDP and detects that the "Opening your library" dialog appeared and went away.
    - It records which launch mode worked (`tauri:dev` or the installed exe) in `tasks/baseline/results/cdp-spike.md`.
  - Verify: run `node scripts/perf/launch.mjs --check`; it prints the time to ready and exits 0. Confirm `%APPDATA%\nl.tivihub.desktop` modified time did not change.
  - Dependencies: none
  - Files: `scripts/perf/launch.mjs`, `tasks/baseline/results/cdp-spike.md`

- [x] **T2: Seeded dataset generator** (S)
  - Description: Deterministic catalogs for sizes S, M, L, XL, shaped like the Xtream responses the importer reads.
  - Acceptance:
    - Same seed gives identical output; counts match the spec table; ids are unique.
    - Output passes the existing catalog validation (`loadXtreamCatalog` accepts it).
    - Generation streams or batches so XL does not need one giant string.
  - Verify: `npm test -- perfDataset` passes; `npm run perf:data -- --size M` writes the files and prints counts.
  - Dependencies: none
  - Files: `scripts/perf/dataset.mjs`, `src/__tests__/perfDataset.test.ts`, `package.json`

- [x] **T3: Mock Xtream server** (S)
  - Description: Local HTTP server answering the six `player_api.php` actions plus the account info call, with CORS headers, serving a chosen dataset.
  - Acceptance:
    - `loadXtreamCatalog` pointed at the server returns the full dataset S (unit test).
    - Responses are streamed for L and XL; the server's memory stays bounded.
    - Credentials are fake sentinels, never real ones.
  - Verify: `npm test -- mockXtream`; `curl http://127.0.0.1:<port>/player_api.php?...` returns JSON for M.
  - Dependencies: T2
  - Files: `scripts/perf/mockXtream.mjs`, `src/__tests__/mockXtream.test.ts`

- [x] **T4: Seed an isolated profile through the app** (M)
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
- [x] An isolated app launches, imports S, M and L (L in 15.8 s), and seeded copies are saved
- [x] `npm test`, `npm run typecheck` and `cargo test` pass
- [x] Real app data folder unchanged (the first spike left an empty database in `%APPDATA%
l.tivihub.desktop`, see the spike note)
- [ ] Review with maintainer before measuring

## Phase 2: Measurements

- [x] **T5: Startup and memory runner** (M)
  - Description: For a seeded dataset, do 5 cold starts (discard a warm-up), record time to ready, the app plus WebView working set at ready, JS heap from CDP, and write one JSON per run with the machine specs and commit hash.
  - Acceptance:
    - Output has median, worst and spread per metric.
    - Records launch mode and the build used.
    - Closes every process it started, including `msedgewebview2.exe` children.
  - Verify: `npm run perf:baseline -- --size M --runs 5` produces the JSON; no stray `tivihub.exe` remains in `Get-Process`.
  - Dependencies: T4
  - Files: `scripts/perf/baseline.mjs`, `scripts/perf/system.mjs`, `scripts/perf/results.mjs`

- [x] **T6: Interaction latency** (M)
  - Description: Script the six interactions (Movies, sort by year, filter by genre, global search typing, Live TV, Home) and record long tasks over 50 ms, with the worst, per interaction.
  - Acceptance:
    - Each interaction reports count and max of long tasks.
    - Selectors come from the existing tests (`appFlow`, `userActions`), not guesses.
    - Results sit beside T5's in the same JSON.
  - Verify: `npm run perf:baseline -- --size M --interactions`; the JSON has six entries.
  - Dependencies: T5
  - Files: `scripts/perf/interactions.mjs`, `scripts/perf/baseline.mjs`

- [x] **T7: Catalog refresh timing** (S)
  - Description: Time a full refresh of the seeded source against the mock server, with long tasks.
  - Acceptance: refresh duration and long-task max recorded for M and L; the app ends with the same counts.
  - Verify: `npm run perf:baseline -- --size M --refresh`.
  - Dependencies: T5
  - Files: `scripts/perf/refresh.mjs`, `scripts/perf/baseline.mjs`

- [x] **T8: Where startup time goes** (S)
  - Description: Capture a CDP CPU profile of startup on dataset L and summarize the top functions by self time (no source changes).
  - Acceptance:
    - A table of the top 15 functions with self time and share of startup.
    - A one-paragraph reading: read and parse, hydrate, React state, or render.
  - Verify: the profile JSON is saved and the summary is reproducible with `npm run perf:baseline -- --size L --profile`.
  - Dependencies: T5
  - Files: `scripts/perf/profile-startup.mjs`, `tasks/baseline/results/startup-profile.md`

### Checkpoint 2: numbers are trustworthy
- [x] Datasets M, L, XL measured with 5 runs each (S only used for the accessibility scan)
- [ ] Two full runs agree within 15 percent: NOT met on L (long tasks vary 30 to 73 percent, refresh 27 percent); recorded in the findings note
- [x] The machine handled XL

- [x] **T9: Full matrix M, L, XL** (S)
  - Description: Run T5 to T7 for M, L and XL and store the raw JSON.
  - Acceptance: results for all three sizes, at least 5 runs per figure, committed under `tasks/baseline/results/`, small files only.
  - Verify: `npm run perf:baseline -- --all`; the folder lists three sizes with per-run files.
  - Dependencies: T5, T6, T7
  - Files: `tasks/baseline/results/*.json`

## Phase 3: Audit

- [x] **T10: Automated accessibility on 8 screens** (M, blocked on approval)
  - Description: With `@axe-core/playwright`, scan Home, Live TV, Movies, Series, Library, Downloads, Settings and the playback dialog, through the same CDP connection.
  - Acceptance:
    - Maintainer approves the new dev dependency before installation.
    - A table of violations by severity for each of the 8 screens.
  - Verify: `npm run perf:a11y` writes the JSON; `npm test` and `npm run typecheck` still pass after the dependency is added.
  - Dependencies: T1, maintainer approval
  - Files: `scripts/perf/a11y.mjs`, `package.json`, `package-lock.json`

- [x] **T11: Keyboard-only, reduced motion, contrast** (S)
  - Description: Scripted keyboard pass (tab order reaches the main controls, Escape closes dialogs, focus returns) with reduced motion enabled and a contrast check of theme tokens.
  - Acceptance: a pass or fail per flow with the failing step named; contrast ratios listed for the light and dark themes.
  - Verify: `npm run perf:a11y -- --keyboard`.
  - Dependencies: T10
  - Files: `scripts/perf/keyboard.mjs`, `tasks/baseline/results/keyboard.md`

- [ ] **T12: Screen reader pass** (S, maintainer, optional)
  - Description: A short checklist for NVDA (or another reader) over add source, browse, play, favorite, settings.
  - Acceptance: notes recorded, or the findings note says "not performed".
  - Verify: filled checklist in `tasks/baseline/results/screen-reader.md`.
  - Dependencies: none
  - Files: `tasks/baseline/results/screen-reader.md`

- [x] **T13a: Filesystem permission reach** (S)
  - Description: Find out what `fs:allow-write` and `fs:allow-remove` allow without a scope, by reading the plugin permission definitions and by a controlled test that writes and deletes a file inside a temp folder through the webview.
  - Acceptance: a short statement of what the webview can write or delete, with evidence; the test never touches a path outside its own temp folder.
  - Verify: the test passes and the temp folder is gone afterwards.
  - Dependencies: T1
  - Files: `tasks/baseline/results/fs-scope.md`, `scripts/perf/fs-scope.mjs`

- [x] **T13b: Playback features review** (S)
  - Description: Read `PlaybackDialog.tsx` and settle: audio-track and quality selection (what the UI offers), the full list of keyboard shortcuts, playback rate, and Picture-in-Picture.
  - Acceptance: a table of each capability as present, partial or absent, with line references.
  - Verify: references open at the stated lines.
  - Dependencies: none
  - Files: `tasks/baseline/results/playback-capabilities.md`

- [x] **T13c: Credential leak scan** (S)
  - Description: Add a source with sentinel credentials (M3U with a token in the URL, Xtream), play, favorite, cast-prepare, export diagnostics, create a backup, then search the exports and the profile for the sentinels.
  - Acceptance: a table of places checked (diagnostics export, logs, localStorage, SQLite files, backup file, cast request) and whether the sentinel appears.
  - Verify: the scan script's output matches the table.
  - Dependencies: T1
  - Files: `scripts/perf/credential-scan.mjs`, `tasks/baseline/results/credential-scan.md`

### Checkpoint 3: every "to verify" marker has an answer
- [x] fs permissions, audio-track, shortcuts, credential leaks, startup breakdown all resolved
- [ ] Review with maintainer

## Phase 4: Findings

- [x] **T14: Findings note and plan update** (M)
  - Description: Write `tasks/baseline/findings.md` with machine specs, tables for S, M, L, XL, the long-task table, accessibility results and the resolved "to verify" items. Apply the decision rules and reorder the phases in `tasks/app-improvements/plan.md`.
  - Acceptance:
    - All six success criteria in the spec are met, or the gap is stated.
    - Each "to verify" marker in `app-improvements.md` is replaced with confirmed or refuted.
    - A recommendation says which module is next and why.
  - Verify: re-read against `tasks/baseline/spec.md`; `npm test`, `npm run typecheck`, `cargo test` pass; `git diff --stat` shows no file under `src/` except `perfDataset.test.ts` and `mockXtream.test.ts`.
  - Dependencies: T9, T11, T13a, T13b, T13c (T12 if done)
  - Files: `tasks/baseline/findings.md`, `tasks/app-improvements/plan.md`

### Checkpoint: Complete
- [ ] All acceptance criteria in the spec met (gaps: repeatability within 15 percent not met; T12 screen reader pass is the maintainer's and not done; cast and backup files not exercised)
- [ ] `npm run perf:baseline` reproduces the numbers on a clean checkout, two runs within 15 percent (not met, see findings)
- [ ] Ready for review and for choosing the next module
