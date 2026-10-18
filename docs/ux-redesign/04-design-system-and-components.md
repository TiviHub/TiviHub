# Design System and Component Plan

## Existing visual foundation

Continue using the existing CSS variables and theme model. The redesign should refine usage rather than introduce a replacement palette.

Important existing concepts include background, sidebar, surface, raised surface, hover surface, text, muted text, faint text, primary, secondary, outline, success, danger, and glow tokens.

## Define and document

- Content max widths
- Spacing scale
- Typography levels
- Surface hierarchy
- Border and radius rules
- Button hierarchy
- Form-field structure
- Dialog layout
- Notification placement
- Card proportions
- Empty and loading patterns
- Focus treatment
- Responsive desktop-window behavior

## Component rules

### Buttons

- Primary action: one dominant action per context.
- Secondary action: safe alternatives and navigation.
- Text action: low-emphasis navigation or utility action.
- Destructive action: clearly labeled and separated from routine actions.
- Icon-only action: use only when the icon is familiar and has an accessible label.

### Forms

- Visible labels for every field.
- Required and optional status shown in text.
- Help text placed near the field.
- Errors identify the problem and the correction.
- Preserve user input after recoverable errors.

### Dialogs

- Move focus into the dialog.
- Keep interaction inside while open.
- Support Escape where safe.
- Restore focus to the trigger.
- Prevent accidental dismissal during irreversible saving work.
- Announce title, status, and errors.

### Notifications

- Use status messages for successful background actions.
- Use alert treatment for failures requiring attention.
- Provide dismissal where appropriate.
- Do not rely only on color or an icon.

### Cards

- Define one primary activation behavior.
- Make secondary actions explicit.
- Keep metadata concise and readable.
- Provide an artwork fallback.
- Show progress in a way that is visible but not ambiguous.
