# Desktop UX Plan

## Navigation

Keep the existing primary sections: Home, Live TV, Movies, Series, Library, and Settings.

Improve:

- Active-section and active-source visibility
- Page headings and supporting descriptions
- Search and refresh discoverability
- Back behavior for details and playback
- Consistency between sidebar, topbar, dialogs, and mobile-sized desktop windows
- Focus restoration after search, refresh, playback, and source dialogs

## Home

For an active source, prioritize:

1. Continue watching
2. Recently watched live content
3. Favorites
4. Watchlist
5. Recently added content
6. Clear routes to Live TV, Movies, Series, and Library

For no-source state, prioritize a clear Add source action and concise explanation over decoration.

## Catalogs and cards

Standardize card behavior across Live TV, Movies, Series, Home, and Library.

Define explicitly whether each action:

- Starts playback
- Resumes playback
- Opens details
- Adds to library
- Toggles a favorite

Movies and series should generally open details. Live channels should generally start playback. Continue-watching items should generally resume directly.

## Source setup

Use progressive disclosure:

1. Choose M3U or Xtream.
2. Choose URL or file for M3U.
3. Enter required details.
4. Expand advanced guide/DRM options only when needed.
5. Connect and show understandable stages.
6. Report imported content, guide status, preserved data, and next steps.

Required and optional fields must be obvious. Errors should be close to fields and summarized when useful. Recoverable errors should not unnecessarily clear entered information.

## Playback

Represent clear states: preparing, buffering, playing, paused, failed, DRM unavailable, unsupported, and cancelled.

Every failure should offer a useful next step such as Retry, Return to details, Refresh source, or Check source settings.

## Empty and loading states

Every empty state should answer:

1. What is empty?
2. Why is it empty?
3. What can the user do next?

Loading states should preserve layout stability and communicate meaningful progress without unnecessary animation.

## Settings

Organize settings into understandable groups:

- Sources
- Playback
- Appearance
- Content visibility
- Subtitles
- Data and backup
- Diagnostics
- About and updates
