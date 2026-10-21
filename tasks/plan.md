# Implementation Plan: baseline (measure before changing anything)

Spec: `docs/specs/SPEC-baseline.md`. Capability map: `docs/specs/CAPABILITY-MAP.md`. Task list: `tasks/todo.md` (default target, no external tracker).

## Overview

Build a small, re-runnable measurement harness that drives the real Windows desktop app, run it on seeded synthetic catalogs of four sizes, audit accessibility, settle the plan's "to verify" items, and write a findings note that reorders `docs/plans/app-improvements.md` using the approved decision rules (cold start over 3 s, a long task over 200 ms, or memory over 1.5 GB on the large dataset moves `query-engine` up).

No application code under `src/` changes. All new code is in `scripts/perf/`, plus one generator test and docs.

## What I read to plan this

- `package.json` scripts: `build:desktop`, `package:windows`, `tauri:dev`, `test`, `test:e2e`. `perf:*` scripts do not exist yet.
- `playwright.config.ts` and `e2e/large-playlist-deletion.spec.ts`: the existing E2E drives the web build (IndexedDB), not the desktop app. It builds a 270k-record catalog by importing app modules, which is the size this plan targets.
- `src/providers/xtream.ts`: an Xtream import calls `get_live_categories`, `get_live_streams`, `get_vod_categories`, `get_vod_streams`, `get_series_categories`, `get_series` (and `get_series_info` per series on demand) on `/player_api.php`.
- `src/__tests__/catalogPerformance.test.ts`: existing synthetic generators and a percentile helper to copy from.
- `src-tauri/src/main.rs`: the app data dir comes from Tauri's `app_data_dir()` (`%APPDATA%\nl.tivihub.desktop`), the key from the OS keychain.

## Architecture decisions

1. **Drive the real app over CDP.** WebView2 accepts `--remote-debugging-port` through the `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` environment variable, and Playwright's `chromium.connectOverCDP` attaches to it. This measures the actual SQLite path, which the web build cannot. It is the riskiest assumption, so it is Task 1.
2. **Isolate the profile.** The harness launches the app with `APPDATA` and `LOCALAPPDATA` pointed at a temp folder, so the SQLite file and WebView2's data never touch the maintainer's real library. The OS keychain entry is shared and only read, which is harmless.
3. **Seed through the app's own importer.** A local mock Xtream server (with CORS headers) serves the generated catalog and the harness adds it as a source over CDP. This exercises real import code, gives the refresh measurement for free, and avoids writing SQLite rows by hand. After a seed, the profile folder is copied to `seeded/<size>/` so cold-start runs restore a copy instead of re-importing.
4. **No source changes for timing.** The breakdown of "where startup goes" uses CDP's CPU profiler and the Performance timeline, so the spec's "ask first" boundary on touching `src/` is never triggered.
5. **Keep it out of CI.** `perf:*` are manual scripts. The only CI-visible addition is the generator unit test.
6. **Numbers need repeats.** Every reported figure is the median of at least 5 runs, with the worst case and spread. Two full runs must agree within 15 percent, or the note says the figure is too noisy.

## Dependency graph

```
T1 CDP spike ──► T4 seed ──► T5 startup+memory ──► T9 full matrix ──► T14 findings
T2 dataset ──► T3 mock server ──┘        │              ▲
                                         ├► T6 interactions ──┤
                                         ├► T7 refresh ───────┤
                                         └► T8 CPU profile ───┘
T1 ──► T10 axe (needs approval) ──► T11 keyboard/contrast ──► T14
T13a fs scope, T13b playback review, T13c credential scan: independent ──► T14
T12 screen reader pass (maintainer, optional) ──► T14
```

If T1 fails, T4 to T9 switch to a manual path (see Risks): the same datasets and decision rules apply, measured with a stopwatch and Task Manager.

## Phases

- **Phase 1, Harness:** T1 to T4. Checkpoint: an isolated app launches, imports dataset S and M through the mock server, and `npm test` is still green.
- **Phase 2, Measurements:** T5 to T9. Checkpoint: numbers for S, M and L exist and two runs agree within 15 percent; then XL.
- **Phase 3, Audit:** T10 to T13c. Checkpoint: every "to verify" marker has an answer with evidence.
- **Phase 4, Findings:** T14 and the final checklist against the spec's success criteria.

## Parallelization

Safe in parallel once T1 passes: T2/T3 (data and mock server), T13a/b/c (audits, read-only except for one controlled write test), and T10 after approval. Sequential: T4 before any measurement, and T9 after T5 to T8, because the full matrix reuses their code.

## Risks and mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| CDP cannot attach to the packaged Tauri app | High | T1 first. Fallback: a manual runbook with a stopwatch and Task Manager readings, recorded in the same JSON shape; Playwright is still used for the web-build accessibility checks |
| Webview `fetch` to the mock server is blocked | Medium | The mock sends `Access-Control-Allow-Origin: *`; if the app's CSP or Tauri rules still block it, run the mock on a hostname the app accepts (found in T1/T3) |
| The XL dataset needs too much memory to generate or serve | Medium | Stream the JSON from the generator instead of building one big string; cap XL if the machine cannot hold it and say so in the note |
| Noisy machine (antivirus scans, background apps) | Medium | Close other apps, run on mains power, discard the first run as warm-up and report the spread; fail the 15 percent check rather than hide noise |
| A write test for filesystem permissions touches real files | High | T13a writes only inside a temp folder created for the test and deletes it; it does not try paths outside it |
| Real credentials in diagnostics or results | High | Credentials in this work are fake sentinels (`SENTINEL-USER-xyz`); results store only numbers; `.gitignore` the seeded profile folders |
| Measuring the wrong thing (dev build vs packaged) | Medium | Record whether the run used `tauri:dev` or the installer build; headline numbers come from the packaged build |

## Open questions

Answered: thresholds are accepted (3 s, 200 ms, 1.5 GB). Still open, with the defaults I will assume until told otherwise:

1. **Adding `@axe-core/playwright` as a dev dependency.** Default: ask again at Task 10 before installing; the task does not start without a yes.
2. **Screen reader pass.** Default: Task 12 is optional and owned by the maintainer; the findings note says "not performed" if skipped.
3. **Reference machine.** Default: this Windows machine; the note records CPU, RAM and disk, and says other machines will differ.
4. **Manual fallback if CDP fails.** Default: acceptable, as written in the risks.
