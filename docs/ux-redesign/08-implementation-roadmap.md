# Implementation Roadmap

## Milestone 1 — UX foundation

- Complete the current-state audit.
- Create the issue register.
- Define shared component and interaction rules.
- Confirm unchanged color and privacy guardrails.
- Define desktop accessibility acceptance criteria.

## Milestone 2 — Desktop navigation and source setup

- Improve section and source hierarchy.
- Improve source selection and progressive disclosure.
- Improve validation and help text.
- Improve connection, parsing, and saving feedback.
- Improve dialog focus and cancellation behavior.

## Milestone 3 — Desktop browsing and library

- Standardize content-card behavior.
- Clarify Watch, Resume, Details, Favorite, and Library actions.
- Improve filters, sorting, and search result actions.
- Improve empty and loading states.

## Milestone 4 — Desktop playback and recovery

- Clarify playback states.
- Improve stream and DRM errors.
- Improve retry and return actions.
- Verify resume and progress behavior.

## Milestone 5 — Desktop validation

- Keyboard testing.
- Accessibility testing.
- Unfamiliar-user testing.
- Theme and window-size testing.
- Provider, storage, and playback regression testing.

## Milestone 6 — Titan OS capability spike

Do not build the full TV UI yet. Verify:

- Target devices and markets.
- DevView workflow.
- Key events and Back behavior.
- Platform keyboard behavior.
- Storage APIs and limits.
- Playback and DRM.
- Startup and catalog performance.
- Accessibility behavior.

## Milestone 7 — TV-specific design

- Create TV wireframes.
- Define focus maps.
- Define Back state transitions.
- Define TV source setup.
- Define playback controls.
- Define low-end hardware adaptations.
- Define TV accessibility behavior.

## Milestone 8 — TV implementation and QA

- Implement a TV-specific presentation or build target.
- Test on the target device matrix.
- Complete DevView validation.
- Prepare publishing and QA materials.
- Submit only after key handling and playback are stable.

## Branch strategy

The planning and future implementation branch is:

```text
feature/ux-redesign
```

Keep documentation and implementation separate in reviewable commits. When implementation begins, split large work where useful:

```text
feature/ux-foundation
feature/desktop-navigation
feature/source-setup-ux
feature/library-playback-ux
feature/titan-tv-navigation
feature/titan-tv-source-setup
```

Do not mix unrelated provider, storage, or playback refactors into UI commits.
