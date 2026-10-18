# Validation and Testing Plan

## Desktop usability testing

Use participants unfamiliar with TiviHub. Ask them to complete:

1. Add an M3U URL.
2. Add a local M3U file.
3. Add an Xtream source.
4. Find and play a live channel.
5. Find and play a movie.
6. Open a series and episode.
7. Resume playback.
8. Add and remove a favorite.
9. Refresh a source.
10. Recover from a failed connection.
11. Change the theme.
12. Find a relevant setting.

Record completion, time, wrong turns, questions, confidence, and recovery behavior.

## Accessibility testing

Test:

- Keyboard-only operation
- Focus visibility
- Focus restoration
- Screen-reader names
- Dynamic announcements
- Reduced motion
- Light and dark theme contrast
- OS text scaling
- Dialog and overlay behavior

## Visual and responsive testing

Test common desktop window sizes, including narrow desktop windows. Verify:

- No clipped content
- Stable layouts during loading
- Readable headings and metadata
- Consistent card sizing
- Usable dialogs
- Correct focus visibility

## TV prototype testing

Before a full port, prototype Home, catalog browsing, details, playback, Back behavior, source setup, and the platform keyboard.

## Titan OS / DevView testing

Use DevView and real target hardware to test:

- Cold launch
- Initial focus
- D-pad movement
- OK/Enter activation
- Back behavior
- Exit confirmation
- Source setup and long text entry
- Catalog scrolling
- Playback and DRM
- Playback return path
- Local data persistence
- Large catalogs
- Slow network conditions
- App suspension and resume
- Accessibility settings
- Low-end performance

## Evidence standards

Every significant redesign decision should identify its evidence:

- Repository observation
- Existing support feedback
- Usability test
- Accessibility test
- Platform documentation
- Real-device test
- Design hypothesis

Do not present untested Titan OS assumptions as confirmed behavior.

## Release gates

### Desktop gate

Primary tasks work with keyboard and mouse, accessibility regressions are addressed, and source/playback behavior has regression coverage.

### TV gate

Target devices are named, remote and Back behavior are verified, platform keyboard behavior works, playback is stable, storage behavior is understood, and performance is acceptable on the lowest-spec target.
