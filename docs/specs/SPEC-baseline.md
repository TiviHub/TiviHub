# Spec: baseline (measure before changing anything)

Module of `CAPABILITY-MAP.md`. Status: draft, waiting for approval.

## Objective

Turn the guesses in `docs/plans/app-improvements.md` into numbers, so later modules (`hardening`, `query-engine`, `playback-split`) are chosen and sized from data. Nothing about the app's behavior changes in this module.

Who it is for: the maintainer, deciding what to build next. Success is a findings note plus a script that can be re-run later to prove an improvement (the `query-engine` gate needs the same measurements again).

## Assumptions

1. Windows 10/11 desktop build is the only platform measured. Linux and macOS are out of scope here.
2. The real app can be driven through WebView2's remote debugging port (`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=--remote-debugging-port=9222`) with Playwright's `connectOverCDP`. This must be confirmed in the first task. If it fails, fall back to a manual stopwatch and Task Manager readings, recorded the same way.
3. Measurements use synthetic data. The maintainer's real catalog is used only to choose realistic sizes (about 54k channels, 214k movies, 46k series) and is never copied into the repo.
4. One machine is measured, and its specs are recorded in the note. Results are comparisons on that machine, not absolute promises.

## What gets measured

| Area | Metric | How |
|---|---|---|
| Startup | Launch to "Opening your library" dialog gone (`ready`); median and worst of 5 cold starts per dataset | Playwright over CDP, polling for the dialog |
| Memory | Working set of `tivihub.exe` plus all `msedgewebview2.exe` children at ready, and after 6 scripted interactions; JS heap from CDP `Performance.getMetrics` | PowerShell `Get-Process` plus CDP |
| Interaction latency | Long tasks (over 50 ms) and the worst one, during: switch to Movies, sort by year, filter by genre, open global search and type 3 characters, open Live TV, open Home | CDP Long Tasks / `PerformanceObserver` |
| Catalog refresh | Time and long tasks for a full refresh of a mocked provider | Local mock server returning generated Xtream JSON |
| Accessibility | Automated violations on 8 screens, keyboard-only walkthrough pass/fail, screen reader notes, reduced motion, contrast | axe-core via Playwright, manual screen reader pass |
| Plan items marked "to verify" | Confirmed or refuted, with the file and line or the observed behavior | Code reading and targeted checks |

Datasets (deterministic, generated from a fixed seed):

| Name | Channels | Movies | Series |
|---|---|---|---|
| S | 200 | 100 | 50 |
| M | 5,000 | 20,000 | 4,000 |
| L | 54,000 | 214,000 | 46,000 |
| XL | 200,000 | 200,000 | 50,000 |

"To verify" items to settle:
- Reach of `fs:allow-write` and `fs:allow-remove` without a scope.
- How complete audio-track selection is in `PlaybackDialog`.
- Which keyboard shortcuts exist.
- Whether M3U stream URLs, cast URLs or diagnostics exports leak credentials.
- Where startup time actually goes: read, parse, hydrate, React state, or render.

## Commands

```
Install:            npm ci
Typecheck:          npm run typecheck
Unit tests:         npm test
Rust tests:         cargo test --manifest-path src-tauri/Cargo.toml
Browser E2E:        npm run test:e2e
Desktop frontend:   npm run build:desktop
Windows installer:  npm run package:windows
Generate datasets:  npm run perf:data -- --size L                  (new)
Run the baseline:   npm run perf:baseline -- --size L --runs 5     (new, Windows only)
App with CDP port:  $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS="--remote-debugging-port=9222"; npm run tauri:dev
```

The `perf:*` scripts are new and live outside `npm test`, so they never slow CI.

## Project structure

```
scripts/perf/                  new: dataset generator, mock Xtream server, baseline runner, results writer
docs/specs/                    this spec and the capability map
docs/plans/                    app-improvements.md, plus app-improvements-baseline.md (the findings note, new)
docs/plans/baseline-results/   raw JSON per run (new, small files only)
src/                           unchanged in this module
```

## Code style

Match the repo: TypeScript, 2-space indent, double quotes, explicit types at boundaries, no comments that restate the code. Scripts are ES modules (`.mjs`), like the existing ones in `scripts/`.

```ts
export interface DatasetSize {
  channels: number;
  movies: number;
  series: number;
}

// Same seed, same data: runs are comparable across commits.
export function generateCatalog(size: DatasetSize, seed = 1): Catalog {
  const random = seededRandom(seed);
  return { channels: makeChannels(size.channels, random) /* ... */ };
}
```

## Testing strategy

- The generator gets unit tests in the `src/__tests__` style: the same seed gives identical output, sizes match, ids are unique, and every record passes the existing catalog validation.
- The runner is not unit tested. Its output is checked by running it twice and comparing: medians must agree within 15 percent, or the note says the measurement is too noisy to use.
- No change to existing tests. `npm test` must stay green and no slower.

## Boundaries

- Always: use synthetic data; record machine specs and the commit hash with every result; keep raw results next to the note.
- Ask first: adding dev dependencies (`@axe-core/playwright` is the expected one); changing `src/` to add timing marks; changing CI.
- Never: commit real provider URLs, credentials or catalog contents; change app behavior or storage; report a number that was measured only once.

## Success criteria

1. `docs/plans/app-improvements-baseline.md` exists with, for datasets M, L and XL: startup (median, worst), memory at ready and after interactions, and the long-task table for the 6 interactions. Each number comes from at least 5 runs.
2. Every "to verify" item in `app-improvements.md` is marked confirmed or refuted, with evidence, and the plan's wording is updated to match.
3. The accessibility section lists axe violations by severity for 8 named screens, the keyboard walkthrough results, and screen reader notes for the main flows.
4. `npm run perf:baseline` reproduces the numbers on a clean checkout, and two runs agree within 15 percent.
5. A short recommendation reorders the plan's phases using the decision rules below.
6. `npm test`, `npm run typecheck` and `cargo test` pass, and the diff touches no file under `src/` except new tests for the generator, if it lives there.

Decision rules (proposed defaults; the maintainer can change them before approval):

- If cold start on L is over 3 s, or any interaction on L has a long task over 200 ms, `query-engine` moves up, ahead of `playback-features`.
- If WebView plus app memory on L is over 1.5 GB at ready, startup loading (B4) is in scope for `query-engine`.
- If axe reports serious or critical violations on any screen, an accessibility fix module is added to the map before `library-features`.
- If none of these trigger, `query-engine` stays after the feature work.

## Open questions

1. Are the decision thresholds above acceptable (3 s, 200 ms, 1.5 GB)?
2. Is adding `@axe-core/playwright` as a dev dependency OK?
3. Can you run a screen reader pass (NVDA or another), or should the accessibility part be automated checks plus keyboard-only?
4. Which machine should be the reference, and is it fine to also record a slower one if you have it?
5. If CDP does not work with the packaged app, is manual measurement with a stopwatch and Task Manager an acceptable fallback?
