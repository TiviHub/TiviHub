# Open Decisions and Risks

## Decisions to make

### Target Titan OS devices

Start with a small verified matrix: one primary market, one Philips target if in scope, one lower-spec device, and one higher-spec device. Do not claim universal support before testing across relevant families.

### TV source entry

Use the Titan OS system keyboard first. Minimize required fields and defer advanced guide/DRM configuration. QR pairing or companion-device setup requires a separate privacy and architecture decision.

### Desktop versus TV patterns

Carry over product concepts, naming, content types, library behavior, brand identity, and privacy language. Adapt layout density, focus, typography, remote navigation, Back behavior, source entry, and playback controls for TV.

### Hosting

Treat the TV build as a statically deployable hosted HTML5 app unless platform requirements prove otherwise. Verify HTTPS, asset paths, caching, cross-origin media, DRM, and production URL behavior.

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Remote text entry is too slow for source setup | High | Minimize fields; test platform keyboard; defer advanced settings |
| Titan OS behavior differs by manufacturer | High | Maintain a target-device matrix and test real hardware |
| Desktop catalog storage is too large for TV | High | Measure realistic data; verify IndexedDB/localStorage; consider reduced retention |
| Heavy artwork or effects cause input lag | High | Use lightweight rendering and visible-content limits |
| Playback or DRM support differs from desktop | High | Validate formats and DRM early with target providers/devices |
| Desktop focus patterns do not transfer to TV | Medium | Define TV focus maps independently |
| A redesign changes privacy expectations | High | Keep local-first language and architecture as explicit guardrails |
| Visual polish hides unclear actions | Medium | Prioritize task completion and usability testing |

## Evidence classification

Every issue should be labeled as one of:

- Confirmed repository observation
- User-research finding
- Accessibility finding
- Platform-documentation fact
- Real-device finding
- Design hypothesis

Untested assumptions must not become hard requirements without evidence.
