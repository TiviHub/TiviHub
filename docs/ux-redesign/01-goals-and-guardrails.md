# Goals and Guardrails

## Goal

Make TiviHub easier to understand and more efficient to use on desktop while keeping its existing visual identity and preparing clear design foundations for a future Titan OS TV adaptation.

## Product goals

- Help users add and manage sources with less confusion.
- Make navigation, browsing, search, playback, and library actions predictable.
- Make loading, empty, success, and error states useful.
- Improve keyboard access, focus visibility, and dialog behavior.
- Preserve the existing dark/light/system theme model and purple-accented identity.
- Keep local-first data handling and privacy messaging accurate.
- Establish reusable interaction patterns that can be adapted for remote-controlled TV use.

## Guardrails

- Desktop is the immediate target; mobile is not a redesign target.
- Do not introduce accounts, cloud sync, analytics, a TiviHub server, or a proxy service.
- Do not change provider, storage, or playback behavior as part of a visual UX task unless separately approved.
- Do not replace the existing palette without evidence of an accessibility problem.
- Prefer semantic HTML and native controls where they provide reliable behavior.
- Do not assume desktop browser APIs exist on Titan OS.
- Do not make QR pairing, phone setup, or companion services requirements without a separate privacy and architecture decision.
- Keep implementation incremental and reviewable.

## Design principles

1. Preserve identity, improve clarity.
2. Make the primary action obvious.
3. Prefer recognition over memory.
4. Keep users informed about system status.
5. Make errors understandable and recoverable.
6. Design for the actual input method.
7. Reuse information architecture, but adapt layouts by device.
8. Protect the local-first privacy promise.
