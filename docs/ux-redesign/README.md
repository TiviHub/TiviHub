# TiviHub UX Redesign

This directory contains the planning documents for improving TiviHub's desktop UX while preserving its visual identity, local-first architecture, and privacy promises.

The future Titan OS HTML5 app is treated as a separate TV-oriented experience that shares product concepts and brand language, but not necessarily the desktop layout.

## Recommended reading order

1. [Goals and guardrails](./01-goals-and-guardrails.md)
2. [Current state and journeys](./02-current-state-and-journeys.md)
3. [Desktop UX plan](./03-desktop-ux-plan.md)
4. [Design system and components](./04-design-system-and-components.md)
5. [Accessibility and input](./05-accessibility-and-input.md)
6. [Titan OS future readiness](./06-titan-os-future-readiness.md)
7. [Validation and testing](./07-validation-and-testing.md)
8. [Implementation roadmap](./08-implementation-roadmap.md)
9. [Open decisions and risks](./09-open-decisions-and-risks.md)
10. [UX issue register](./10-ux-issue-register.md)

## Scope

The first implementation target is the existing desktop application. This planning branch does not change UI behavior or application architecture.

The plan is based on the current React/TypeScript application structure, including Home, Live TV, Movies, Series, Library, Settings, source management, search, playback, favorites, watch progress, themes, and local data handling.

## Working rule

Treat repository facts as confirmed. Treat Titan OS capabilities and requirements as assumptions until verified against the current official documentation and real target devices.
