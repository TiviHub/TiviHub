# TiviHub UI rules

The owner keeps asking for consistent UI ("too much difference everywhere"). These rules come from the style guide, which is the source of truth: `npm run styleguide` opens `/styleguide.html` (dev only, never built) with every shared component built from the app's real classes, in both themes.

**Before touching UI:** open the style guide and find the component. Reuse it. If it does not exist, add it to the style guide in the same change. After any change to shared CSS, check the style guide, then check every place that component appears in the app (both themes).

## Where styles live

- `src/styles.css`: base styles and the shared rules at the very end (hover transition, list-card rule, icon sizes, dropdown rule).
- `src/theme-app.css`: loaded after `styles.css`; the app's look (black/grey/purple, Roboto type, softly rounded corners, flat background). It overrides tokens and a few components.
- **Specificity trap:** the theme's "nested controls" rule uses `:is(... input[type="text"] ...)`, whose specificity is `(0,1,1)`. A plain `.my-class` (0,1,0) will lose to it. Use `button.my-class` or a two-class selector when overriding buttons, inputs and selects there.
- `.eyebrow` labels are hidden by the theme; do not rely on them.
- Prefer one shared selector list over per-page rules. Add new list rows, cards and buttons to the existing shared rules.

## Tokens (use these, never hard-coded colours)

`--bg --sidebar --surface --surface-raised --surface-hover --panel --row --row-selected --text --muted --faint --primary --primary-hover --secondary --outline --outline-soft --success --danger`, radii `--radius-sm|md|lg|xl|2xl` (all 3px in the app theme, so always use the variable), `--hover-duration` (140ms).
Pink `#ff83aa` is used only for a favorited heart.

## Layout and spacing

- Page sides: `--content-gutter-x` = `clamp(20px, 4vw, 56px)`. Page top: `--content-gutter` (30px) under the topbar. Pages must not set their own top padding in the desktop app.
- Page header: `.page-intro` / `.catalog-intro` with `h1` (margin `8px 0 6px`), muted subtitle, controls on the right.
- Standard gaps: 15px between cards/sections items, 9px between list rows, 8-12px inside controls.
- Movie/series detail: poster fills the hero edge to edge (`.series-detail-header` + `.detail-backdrop`), fading into the page; text uses the same side margin; one `.primary-button` plus round `.detail-icon-button` actions.
- Floating items: toasts `right/bottom: 10px`; "Playlist expired" floats bottom-left beside the sidebar (10px from bottom). Both hidden/adapted under 820px.

## Typography

Roboto throughout (no monospace in the UI). Never use literal pixel `border-radius` values (they ignore the theme); use `var(--radius-md)` or the other radius tokens (pill shapes `999px` and `50%` are the only exceptions). Muted text `--muted`, placeholders and hints `--faint`. Control text: 0.8rem (buttons, search), 0.78rem (dropdowns), 0.72rem (toasts, chips). Do not introduce new font sizes for controls.

## Buttons

| Component | Class | Spec |
|---|---|---|
| Primary | `.primary-button` | purple, 48px everywhere (empty states, forms, settings), 1rem text, 21px icon, weight 600 |
| Secondary | `.secondary-button` | 42px, 0.8rem, 18px icon; `.selected` = purple outline |
| Text | `.text-button` | purple text, no box |
| Icon button | `.icon-button` | bare muted 21px icon; hover = `--surface-hover` tile + white icon; `.selected` purple icon; `.is-favorite` pink icon |
| Detail action | `.detail-icon-button` | 44px circle, dark translucent, white border (like thumbnail overlay actions); `.favorite.selected` pink, `.selected` green |

Never add one-off bordered or purple-outline icon button variants. Icon-only buttons need an `aria-label` and `data-tooltip`; **new button classes must be added to the allow-list in `TooltipLayer` (`src/components/common.tsx`) or no tooltip shows.**

## Icons

18px inside chips, tabs and secondary buttons; 19px inside search fields and field-like boxes; 21px for actions, icon buttons, primary buttons, pagination arrows and settings/section icons; 27px for placeholder art (the larger Live TV player placeholder is the one exception at 30px). The 34px overlay circles on catalog cards use 19px. Never leave the 24px default inside a control. Icons come from `IconName` (`common.tsx`); add the name there first.

## Inputs and dropdowns

- Search fields (`.search-field`, topbar search, global search dialog): 42px tall, 0.8rem, 19px muted icon, 11px side padding, 8px gap, placeholder `--faint`. The inner `<input>` stays transparent.
- Dropdown (`CustomSelect`): standalone triggers 38px tall, 0.78rem, min-width 68px, 10px padding. Embedded variant lives inside a 42px search-style box. Do not size individual dropdowns.
- Forms: `.form-field`. TV Guide toolbar controls (icon buttons, date buttons, filter and zoom boxes) are the standard 42px too.
- Topbar actions are 42px, the same height as the topbar search.

## Tabs

`.library-tabs` and `.library-content-tabs`: separate grey tiles, grey hover, active tab uses `--row-selected` with a 3px `--primary` left bar. No container bars.

## Cards and lists

- Catalog cards (`.catalog-card`): poster 2:3, live 16:9; overlay actions `.favorite-button` and `.catalog-library-button` (34px circles, top-right).
- **One card look for every list row**: library items, favorite rows, episode rows, download items and Live TV channel rows share the "Shared card look" rule at the end of `styles.css` (surface background, 1px `--outline-soft` border, `--radius-lg`, hover darkens the border). Add any new list row to that selector list (currently also `.subtitle-results li` and `.home-resume`).
- Padding 11px, gap 14px (8px / 9px on phones). Actions inside a row are bare `.icon-button`s; the selected row (Live TV) uses `--row-selected` and the 3px bar.
- Episode rows: one card holding the play circle, text and download button.

## Feedback and loading

- Toasts (`.notification-toast`): 38px min height, 0.72rem, tinted background and border from the toast colour, same shape for notice (green) and error (pink-red).
- **Where content will appear, use `src/components/Skeleton.tsx`** (`Skeleton`, `CardSkeletons`, `RowSkeletons`), never a spinner. Keep the old loading text as `sr-only` inside a `role="status"` wrapper. Current skeletons: catalog grids, popular row, episodes, downloads, ratings, TV Guide programme blocks and footer, current-programme line on Live TV (`guideLoading`), subtitle results, cast devices, player status, poster images.
- **Work on content that is already on screen** (catalog updating/sorting): the `ProgressIndicator` bar with an `sr-only` label, not a spinner banner.
- **Real progress** (startup, catalog refresh, playlist deletion, stream health check) keeps its progress screen and text; do not replace it with a skeleton.
- Spinners stay only inside buttons that are saving (Connect source, Import demo).
- Transparent channel logos get no shimmer (it would stay visible behind them); opaque poster images do.
- New loading state: add the skeleton to the style guide's Loading section in the same change.
- Progress: `ProgressIndicator` / `.progress-indicator`.

## Player

- One player look for the modal player, the inline Live TV player and the mini player: header with title (plus the `.playback-badge` "Live" chip on live channels, no eyebrow), video edge to edge, tools row below with 42px `.player-track-select` boxes, small `--faint` disclaimer. The modal player gives the header and tools a side margin; the inline player does the same with its own margin.
- Subtitle panel (`.subtitle-panel`): search uses the shared `.search-field` plus a 42px `.secondary-button.selected`, never a custom input or a 48px primary button. Result and saved rows are `.subtitle-results li` in the shared card look; saved heading carries a `.subtitle-count` pill; the empty state is `.subtitle-empty` (bordered card, 27px icon), not loose text.
- Home resume card (`.home-resume`): shared card look, 96px poster, progress bar, one 48px `.primary-button`. It is the only large card on Home; shelves stay poster cards.
- Count pills (tab counts, `.subtitle-count`, shelf counts) are 999px pills on `--row-selected` / `--surface-raised`.

## Pagination

`.catalog-pagination`: range text, page-size dropdown, 38px prev/next buttons. Live TV channel pagination uses the same 38px controls.

## Motion

Hover/focus feedback fades with `var(--hover-duration) ease` on background, border, colour and shadow. Layout transitions (sidebar width, panels) may use 180-240ms. Respect `prefers-reduced-motion`.

## Checks

- Typecheck: `npx tsc --noEmit`.
- Unit tests: `npx vitest run src` (plain `vitest run` also picks up the Playwright spec in `e2e/` and fails; that is a setup issue, not a regression).
- Browser mode: `npm run dev`, then `/app.html`; Settings, Add source, Import demo loads a demo playlist (live channels only).
- Screenshots with Playwright against the dev server are the quickest way to verify visual changes.
