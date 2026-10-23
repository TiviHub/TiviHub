# Baseline findings (module `baseline`)

Spec: `tasks/baseline/spec.md`. Raw data: `tasks/baseline/results/`. Re-run with `npm run perf:build`, then `npm run perf:all -- --sizes M,L,XL --runs 5 --label <name>` and `node scripts/perf/summarize.mjs`.

## Setup

- Machine: Intel Core i7-12700K (20 logical cores), 31.7 GB RAM, Windows 11 (10.0.26200). One machine only; absolute numbers will differ elsewhere.
- App: the v1.8.0 release build (`tauri build --no-bundle`) with the identifier changed to `nl.tivihub.perf` so its data lives in its own folders. No source file was changed. Driven over WebView2's debugging port with Playwright.
- Data: seeded synthetic Xtream catalogs imported through the app's own importer. M = 5k channels, 20k movies, 4k series. L = 54k, 214k, 46k (the shape of a real large source). XL = 200k, 200k, 50k.
- Every figure is the median (range) of 5 cold runs after one discarded warm-up. The mock provider runs on the same machine, so network time is near zero.
- Run 1 is the full matrix. Run 2 repeated L only, to test repeatability.

## Results

### Startup and memory

| Size | Ready, ms | Working set, MB | JS heap, MB |
|---|---|---|---|
| M | 757 (753-819) | 462 (459-467) | 19 |
| L | 4,555 (4,370-4,692) | 970 (798-973) | 339 |
| XL | 6,753 (6,416-6,884) | 931 (867-942) | 382 |

"Ready" is process start to the startup dialog disappearing, measured from outside. It includes about 0.3 s before the debugger can attach. The dialog was seen in every run.

### Interactions (worst long task in ms; a long task blocks the UI)

| Interaction | M | L | XL |
|---|---|---|---|
| Open Movies | 0 | 359 | 363 |
| Sort movies by year | 0 | 493 | 431 |
| Filter by category | 0 | 0 | 0 |
| Global search, type 3 characters | 0 | 545 | 557 |
| Open Live TV | 0 | 265 | 595 |
| Open Home | 0 | 103 | 184 |

Full tables with wall times and ranges come from `summarize.mjs`. The long-task capture was calibrated: a deliberate 120 ms block must show up or the run aborts.

### Catalog refresh (full refresh against the mock provider)

| Size | Wall time, ms | Worst long task, ms |
|---|---|---|
| M | 2,327 | 145 |
| L | 26,759 | 1,525 |
| XL | 34,965 | 2,314 |

During a refresh the UI is frozen in single blocks of up to 1.5 s (L) to 2.3 s (XL).

### Where startup time goes (L, CPU profile)

- About 70 to 78 percent of the main thread's startup time is idle: the page is waiting for storage reads from Rust, not computing.
- The reads are large. For L, the movies list alone is about 100 MB of JSON (214k rows), channels 18 MB, series 18 MB. Outside the app, the release Rust store plus a pipe took about 2.8 s to deliver them and `JSON.parse` took about 0.5 s. The pipe makes the Rust figure an upper bound. The app's own IPC could not be timed separately, because Tauri's internals are not visible to the debugger.
- JavaScript work is the smaller part: about 0.5 s of "program", 0.5 s in app code and 0.2 s of garbage collection. The content-rating regular expressions (`isAdultContent`) show up but are small (about 26 ms).
- The profiler attaches a few hundred ms after launch, so the very start is not covered.

## Repeatability

Criterion: two runs agree within 15 percent. **Not met.** Run 2 on L:

| Metric | Run 1 | Run 2 | Difference |
|---|---|---|---|
| Ready ms | 4,555 | 5,278 | +15.9% |
| Working set MB | 970 | 974 | +0.5% |
| Worst long task, 5 interactions | 103 to 545 | 178 to 918 | +30% to +73% |
| Refresh wall ms | 26,759 | 19,634 | -26.6% |

Memory is stable and startup time is borderline. Long-task maxima and refresh time vary too much to quote to better than about plus or minus 70 percent. The conclusions below do not depend on the exact values, because every figure that triggers a decision rule is over its threshold in both runs. I do not know the cause of the difference between runs; background load on the machine is the likeliest. A quieter machine or more runs would tighten it.

## Accessibility

Automated (axe-core, 8 screens, dark and light theme, seeded S profile; `a11y-axe-*.json`):

| Rule | Impact | Where |
|---|---|---|
| `color-contrast` | serious | all 8 screens, both themes (first example: the `kbd` shortcut hint) |
| `label-content-name-mismatch` | serious | 7 screens; the visible text is not part of the accessible name, for example the top search button (label "Search your library", visible text "Search in your library…"), up to 30 elements per screen |
| `aria-required-children` | **critical** | Live TV only: the favorites channel list has `role="list"` without list items |
| `region` | moderate | 7 screens: the tooltip element sits outside any landmark |
| `aria-allowed-role` | minor | Live TV: 24 elements with an inappropriate role |

Keyboard (scripted, reduced motion on; `keyboard-*.json`): all four flows pass. Tab reaches the main navigation, Ctrl+K opens search and Escape closes it with focus restored, and the add-source and playback dialogs keep focus inside and close on Escape. My first version of this script reported two failures; both were mistakes in the script (it counted aria-hidden icon text in names and checked the wrong container for the dialog). I fixed them before the numbers above.

Not done: the screen reader pass (checklist for you in `baseline-results/screen-reader.md`) and a manual contrast review beyond axe. The 8-screen scan used the small dataset, so list-length effects on a big library were not tested.

## The "to verify" items

| Item | Result | Evidence |
|---|---|---|
| File permissions without a scope | Narrower than feared: no path is allowed until the user picks a folder, then everything inside that folder (recursively) is | `baseline-results/fs-scope.md` (code reading, no live test) |
| Audio-track selection | Present, plus quality and playback speed | `baseline-results/playback-capabilities.md` |
| Keyboard shortcuts in the player | Only Escape and a Tab focus trap of our own; the native `<video controls>` handles the rest | same |
| Credentials in M3U, cast, diagnostics | Diagnostics and `localStorage` clean. **New: the WebView2 HTTP cache keeps the Xtream login and the M3U token, and its autofill database keeps the username and M3U URL.** Cast not exercised. | `baseline-results/credential-scan.md` |
| Where startup time goes | Waiting on large storage reads, mostly the 100 MB movies list | section above |

## Decision rules applied

| Rule (from the spec) | Result |
|---|---|
| Cold start on L over 3 s, or any interaction with a long task over 200 ms | **Triggered**: 4.6 s (4.4 to 5.3 s across both runs), and long tasks of 265 to 545 ms on four interactions at L |
| Memory over 1.5 GB at ready on L | Not triggered: 970 MB |
| Serious or critical accessibility violations | **Triggered**: 2 serious rule types on every screen, 1 critical on Live TV |

## Recommendation

1. **Move `query-engine` ahead of `playback-features`.** The rule triggered, and the profile shows why: the app reads and parses the whole catalog (hundreds of MB) before the first screen. Paging and sorting in SQLite, with only the visible page in the UI, addresses startup, the 300 to 600 ms stalls and the memory growth together. It depends on `app-split`, which therefore also moves up.
2. **Add a module `a11y-fixes`** (depends on `baseline`), before `library-features`. First items: the critical list-role error on Live TV, accessible names that include the visible text, and contrast of the shortcut hint and other low-contrast text. Run a screen reader pass first if you can.
3. **Pull two cheap security fixes into `hardening` and do them early:** stop the webview from caching provider API calls that carry the login in the URL, and turn autofill off for the add-source form. Narrowing the download folder scope belongs there too.
4. **Refresh needs its own work:** a 1.5 to 2.3 s freeze and 20 to 35 s in total on a big source. Moving fetch and parse off the UI thread (a Rust command, or a worker) is the fix; it overlaps `native-network`.
5. **Playback features shrink:** speed, audio and quality selection already exist. What remains is keyboard shortcuts, a sleep timer, next-episode and channel zapping.

## Limits of this baseline

One machine, synthetic data on a local mock provider (no network latency, no slow provider), Windows only, and a release build with a different identifier. Linux and macOS were not measured. The IPC time inside the app was not measured directly.
