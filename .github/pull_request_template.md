## What changed and why

<!-- One or two sentences. Link the issue if there is one. -->

## How it was checked

- [ ] `npx tsc --noEmit`
- [ ] `npm run lint`
- [ ] `npx vitest run src`
- [ ] `cargo test --manifest-path src-tauri/Cargo.toml` (if Rust changed)
- [ ] Ran the app and tried the change (desktop or `npm run dev`)

## Checklist

- [ ] Bug fix: a test that failed before the fix is included
- [ ] UI change: reused shared components and tokens, checked `npm run styleguide` in both themes (add screenshots below)
- [ ] Stored data changed: added a `user_version` migration step and a migration test
- [ ] User-visible change: noted for the release notes (`docs/releases/`)
- [ ] No credentials, private playlist URLs or real provider data in code, tests or screenshots

## Screenshots

<!-- Before / after for UI changes. Remove this section if not needed. -->
