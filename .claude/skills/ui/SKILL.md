---
name: ui
description: TiviHub UI rules (tokens, components, spacing, icons, loading states, player). Use before touching any UI, CSS, or component in the app.
---

# TiviHub UI rules

The owner keeps asking for consistent UI ("too much difference everywhere"). These rules come from the style guide, which is the source of truth: `npm run styleguide` opens `/styleguide.html` (dev only, never built) with every shared component built from the app's real classes, in both themes.

**Before touching UI:** open the style guide and find the component. Reuse it. If it does not exist, add it to the style guide in the same change. After any change to shared CSS, check the style guide, then check every place that component appears in the app (both themes).

## Where styles live

- `src/styles/styles.css`: base styles and the shared rules at the very end (hover transition, list-card rule, icon sizes, dropdown rule).
- `src/styles/theme-app.css`: loaded after `styles.css`; the app's look (black/grey/purple, Roboto type, softly rounded corners, flat background). It overrides tokens and a few components.
- **Specificity trap:** the theme's "nested controls" rule uses `:is(... input[type="text"] ...)`, whose specificity is `(0,1,1)`. A plain `.my-class` (0,1,0) will lose to it. Use `button.my-class` or a two-class selector when overriding buttons, inputs and selects there.
- `.eyebrow` labels are hidden by the theme; do not rely on them.
- Prefer one shared selector list over per-page rules. Add new list rows, cards and buttons to the existing shared rules.

## Tokens (use these, never hard-coded colours)

`--bg --sidebar --surface --surface-raised --surface-hover --panel --row --row-selected --text --muted --faint --primary --primary-hover --secondary --outline --outline-soft --success --danger --warning`, radii `--radius-sm|md|lg|xl|2xl` (all 3px in the app theme, so always use the variable), `--hover-duration` (140ms).
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

**No border or outline around a logo, icon or artwork tile** (channel logos, placeholder icons, settings heading icons, the app logo on empty screens). Separate them from the surface with a tone step (`--surface-raised`), never a border colour.

18px inside chips, tabs and secondary buttons; 19px inside search fields and field-like boxes; 21px for actions, icon buttons, primary buttons, pagination arrows and settings/section icons; 27px for placeholder art (the larger Live TV player placeholder is the one exception at 30px). The 34px overlay circles on catalog cards use 19px. Never leave the 24px default inside a control. Icons come from `IconName` (`common.tsx`); add the name there first.

## Inputs and dropdowns

- Search fields: use `SearchField` (`common.tsx`), never your own `<label className="search-field">`. It holds the magnifier, the input and an X (`.search-clear`, 24px, appears once there is text, empties the box and keeps focus in it). The topbar search and the global search dialog (a native `type="search"` input with its own clear X) follow the same measurements: 42px tall, 0.8rem, 19px muted icon, 11px side padding, 8px gap, placeholder `--faint`. The inner `<input>` stays transparent.
- Dropdown (`CustomSelect`): standalone triggers 38px tall, 0.78rem, min-width 68px, 10px padding. Embedded variant lives inside a 42px search-style box. Do not size individual dropdowns.
- Forms: `.form-field`. TV Guide toolbar controls (icon buttons, date buttons, filter and zoom boxes) are the standard 42px too.
- Topbar actions are 42px, the same height as the topbar search. The reminders bell (`RemindersMenu`, style guide Feedback) is one of them: a 9px `--primary` dot means unseen fired reminders, its panel opens downward and reuses `.custom-select-menu` and `EmptyPanel`.

## Two-panel pages

Live TV, Movies, Series, TV Guide, Library, Downloads and Settings share one frame: `BrowseShell` (a 56px heading with a count, an optional row of 42px tools, then the content) beside a 320px left panel (`BrowseCategoryList` for source categories and channel groups, `NavPanel` for a short fixed list). Panels sit flush against the sidebar, no page header, no page scroll. Selected tile = `--row-selected` with a 3px `--primary` left bar. Empty and failed panels use `EmptyPanel` (icon, title, one sentence, at most one `secondary-button`; errors add `error` and "Try again"; `compact` for a strip like the guide under the player), never loose text or a one-off box. The page-sized `HomeEmptyState` ("Add your first source", "Make Home yours") is for a whole page with nothing to show; it has the same parts, set larger. Category counts follow the rule in the `architecture` skill: shown only when known, never 0 for unknown. The TV Guide uses the channel groups as its left panel and one row of 42px tools above the grid; Library has a title search plus a content-type dropdown. Settings shows one group at a time (`hidden` on the others).

## Cards and lists

- Catalog cards (`.catalog-card`): one poster shape (2:3) for movies, series and channels; a channel card (`.live-card`) adds the LIVE badge and shows its logo whole and padded; overlay actions `.favorite-button` and `.catalog-library-button` (34px circles, top-right).
- **Library and Favorites use the catalog card** (`LibraryCard`: delete circle or pink heart top-right, status dropdown under the title, channels poster-sized with the logo contained and padded).
- **One card look for every list row**: episode rows, download items and Live TV channel rows share the "Shared card look" rule at the end of `styles.css` (surface background, 1px `--outline-soft` border, `--radius-lg`, hover darkens the border). Add any new list row to that selector list (currently also `.subtitle-results li` and `.home-resume`).
- Padding 11px, gap 14px (8px / 9px on phones). Actions inside a row are bare `.icon-button`s; the selected row (Live TV) uses `--row-selected` and the 3px bar.
- Episode rows: one card holding the play circle, text and download button.

## Empty and error messages

- One component: `EmptyPanel` (`src/components/EmptyPanel.tsx`, style guide Feedback section). Title is short and says what is missing ("No matches", "No favorite channels", "Nothing saved yet"); the sentence says what to do next; one action at most; errors never leave a silent gap.
- Copy: no "No X found." sentences as titles, no exclamation marks, no emoji. Search without results is always "No matches" with the section named in the sentence.
- A footnote under a list (what Downloads can save) is `.panel-note`, not an empty message.
- Do not add `.live-guide-empty`, `.browse-message`, `.catalog-empty` or `.settings-empty` again; they were removed.

## Feedback and loading

- Toasts (`Toast`, `.toast`): a flat `--surface-raised` card with a 3px bar on its left edge in the message colour (`--success` for a notice, `--danger` for an error), a 21px status icon, one or two sentences at 0.8rem in the full ink, a bare `.icon-button` to dismiss. They float bottom right (above the mobile nav on a phone), one at a time, and are the only message that keeps a shadow besides menus and dialogs. No tinted fills, no coloured borders. "Playlist expired" (`.topbar-expiry-warning`) is the same card with the 3px bar in `--warning`, persistent and clickable; bottom left beside the sidebar on desktop, an icon in the top bar on a phone.
- **Where content will appear, use `src/components/Skeleton.tsx`** (`Skeleton`, `CardSkeletons`, `RowSkeletons`, and for the two-panel pages `CategorySkeletons`, `ChannelSkeletons`, `GridCardSkeletons`), never a spinner. A skeleton must sit exactly where the real content will, so nothing jumps when data arrives: it reuses the real row's box (border, padding, radius; category row 37px, channel row 71px with the logo at 21/14px, poster card 332px at a 183px column) and the real list's gap. Render more rows than fit and add `is-loading` to the list: it clips them (`overflow: hidden`) so the skeleton fills the panel without a scrollbar. Poster skeletons are direct children of the list's own grid, never a grid inside it. Skeleton rows go below the pinned Favorites and All rows. When a real row changes size, measure real against skeleton again (a headless page with the app's CSS is enough). Keep the old loading text as `sr-only` inside a `role="status"` wrapper. Current skeletons: catalog grids, episodes, downloads, ratings, TV Guide programme blocks and footer, current-programme line on Live TV (`guideLoading`), subtitle results, cast devices, player status, poster images.
- **Work on content that is already on screen** (catalog updating/sorting): the `ProgressIndicator` bar with an `sr-only` label, not a spinner banner.
- **Real progress** (startup, catalog refresh, playlist deletion, stream health check) keeps its progress screen and text; do not replace it with a skeleton.
- Spinners stay only inside buttons that are saving (Connect source, Import demo).
- Transparent channel logos get no shimmer (it would stay visible behind them); opaque poster images do.
- New loading state: add the skeleton to the style guide's Loading section in the same change.
- Progress: `ProgressIndicator` / `.progress-indicator`.

## Player

- One player look for the modal player, the inline Live TV player and the mini player (style guide: Player): header with title, status and Close (no eyebrow), the video edge to edge, and our own control bar (`PlayerControls`) drawn over the bottom of the picture, hidden while the video plays and the pointer is away. The bar holds play, seek and time (not on live), the `.playback-badge` Live or Radio chip left of the volume, volume, `PlayerMenu` (one settings button: subtitles, audio, quality, subtitle actions), speed (`.player-track-select`, embedded dropdown), Open in VLC, fullscreen and Cast last. Extra bar buttons are bare `.icon-button`s with a tooltip. While a stream is preparing or buffering, the standard `ProgressIndicator` (`.player-loading`, 3px) runs along the top of the picture. A new control goes into `PlayerControls`/`PlayerMenu` and the style guide, never next to the video.
- Subtitle panel (`.subtitle-panel`): search uses the shared `.search-field` plus a 42px `.secondary-button.selected`, never a custom input or a 48px primary button. Result and saved rows are `.subtitle-results li` in the shared card look; saved heading carries a `.subtitle-count` pill; the empty state is an `EmptyPanel`.
- Home resume card (`.home-resume`): shared card look, 96px poster, progress bar, one 48px `.primary-button` with 24px to the card edge on its right (11px on a phone, where it drops below). It is the only large card on Home; shelves stay poster cards.
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
