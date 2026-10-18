# Accessibility and Input Plan

## Desktop baseline

Use WCAG 2.2 as the baseline for web-facing UI behavior.

Priorities:

- Keyboard-operable controls
- Logical tab order
- Visible focus
- No keyboard traps
- Focus not hidden by overlays
- Sufficient contrast in both themes
- Clear labels and instructions
- Useful error identification
- Status announcements for dynamic updates
- Reduced-motion support
- Adequate control sizes

## Focus

Focus must be visibly distinct from hover, selected, and disabled states. It must work on dark surfaces, light surfaces, artwork, and gradients. It must not be clipped by a card or container.

Focus must be restored after closing:

- Source dialogs
- Search
- Playback
- Refresh overlays
- Stream-health dialogs

## Keyboard testing

Test the primary workflows without a mouse:

- Navigate sections
- Search
- Add a source
- Edit a source
- Start playback
- Close playback
- Manage favorites and library
- Change settings
- Recover from errors

## TV input foundation

For the future Titan OS adaptation, define a focus map for every screen. Remote navigation must work with Up, Down, Left, Right, and OK/Enter. Back behavior must be defined by application state.

Do not use hover as a required interaction. Keep focused controls visible and readable from a distance.

## Dynamic content

When catalogs, guides, or playback states change:

- Preserve or intentionally move focus.
- Announce important status changes where appropriate.
- Avoid unexpected focus jumps.
- Keep loading and error states associated with their content.

## Motion

Respect reduced-motion preferences. Avoid animation that communicates essential information without a non-animated alternative.
