# Titan OS Future Readiness

## Status

Titan OS is a future target, not the immediate implementation target. Platform behavior must be verified against the current official documentation and real devices before becoming a product requirement.

Titan OS documentation describes hosted HTML5/HbbTV application delivery, remote key handling, playback validation, device variation, local storage, accessibility, and performance constraints.

References:

- [Titan OS introduction](https://docs.titanos.tv/introduction)
- [Remote control](https://docs.titanos.tv/remote-control)
- [Cookies and local storage](https://docs.titanos.tv/cookies)
- [Performance optimization](https://docs.titanos.tv/performance-optimization-strategies)
- [Accessibility](https://docs.titanos.tv/titan-sdk-accessibility)
- [DevView installation](https://docs.titanos.tv/devviewinstall)
- [Publishing](https://docs.titanos.tv/publishing)

## Shared with desktop

Reuse:

- Product language
- Media concepts
- Section names where appropriate
- Source concepts
- Favorites and library concepts
- Brand colors and identity
- Privacy messaging

Do not assume the desktop layout, density, dialog size, or pointer interactions can be reused unchanged.

## TV-specific requirements

- Remote-only navigation
- Highly visible focus
- Predictable directional movement
- State-based Back behavior
- Large readable typography
- Larger controls and spacing
- Few simultaneous actions
- Lightweight rendering
- Reliable playback and recovery
- Real-device validation

Titan OS documentation describes manufacturer-specific Back key differences and warns against processing both keydown and keyup for the same action. The implementation must verify the exact behavior on target devices.

## Initial device strategy

Start with a small target matrix instead of claiming all Titan OS devices. Select:

- One primary market
- One Philips target family if that remains in scope
- One lower-spec target
- One higher-spec target
- A documented resolution and playback baseline

Expand only after the interaction model is stable.

## Source entry

Use the platform keyboard first. Keep first-run setup short:

1. Choose M3U or Xtream.
2. Enter only required fields.
3. Save the source locally.
4. Configure advanced guide or DRM options later.

Avoid a custom keyboard unless testing proves it is necessary. Do not trigger both a custom keyboard and the platform keyboard. Do not commit to QR pairing or a companion service without a separate architecture and privacy decision.

## Storage risk

The desktop catalog and source documents may not fit comfortably in a TV browser storage model. Before a TV port, measure realistic catalog sizes and verify IndexedDB, localStorage, persistence, clearing behavior, and storage limits on target devices.

Possible TV-specific decisions include:

- Reduced catalog retention
- Lazy loading
- Separate source-document policy
- Explicit storage management
- TV backup/restore limitations

## Performance

Design for constrained TV hardware:

- Render only visible catalog content where practical.
- Use appropriately sized images.
- Avoid heavy blur, large shadows, and unnecessary video backgrounds.
- Keep startup lightweight.
- Defer non-essential work.
- Prevent parsing or rendering work from blocking remote input.

## TV validation gate

Do not begin full TV implementation until these are tested:

- Remote key events
- Initial focus
- Directional movement
- Back and exit confirmation
- Platform keyboard
- Playback and DRM
- Local storage persistence
- Accessibility behavior
- Startup and navigation performance
