---
name: release
description: Version bump, release notes and tagging for TiviHub. Use when preparing a release, writing docs/releases/*.md, or bumping the version.
---

# Releasing

Semantic Versioning: `MAJOR` breaking change or data migration users must know about, `MINOR` new feature, `PATCH` fix only. Pre-releases use `-beta.N` (published as GitHub prereleases).

## Steps

1. Version must match in `package.json` and `src-tauri/tauri.conf.json` (keep `src-tauri/Cargo.toml` and the lockfiles in step too). `node scripts/verify-release-version.mjs` checks the first two and the tag; CI runs it.
2. Write `docs/releases/vX.Y.Z.md`. The release job fails if this file is missing.
3. Run the checks from the `testing-and-ci` skill; add the `release-dry-run` label to the PR to rehearse the installers.
4. Merge, then tag `vX.Y.Z` on `main` and push the tag. CI builds, creates a draft release with the notes, and attaches installers. Review the draft, then publish.

## In-app updates (Windows)

The Windows build is signed with the updater key (`TAURI_SIGNING_PRIVATE_KEY` repo secret, public key in `tauri.conf.json`) and `package-windows.mjs` writes `latest.json`, which the release uploads. The app reads `releases/latest/download/latest.json`, so it only sees stable, published releases. Other platforms still open the release download. Losing the private key means installed apps can never update themselves again.

## Release notes format

Copy the shape of `docs/releases/v2.0.0.md`:

```
## TiviHub vX.Y.Z

One plain sentence: what this release is about.

### Highlights
- Feature or fix, written for a user: what they can do now. Name the platform if it is not everywhere.

### Security      (only if there is something)
### Under the hood (only if users could notice, e.g. a refactor that changes risk)
### Platform and privacy
```

Rules: no commit hashes, no internal file names, no marketing words. Say what changed for the user. Mention data migrations and anything that cannot be undone. Mention limits honestly (for example, that Stalker category counts fill in over a minute or two on a large portal).

## Commits and PRs

Conventional commits: `feat:`, `fix:`, `perf:`, `refactor:`, `docs:`, `test:`, `chore:`, `ci:`. Subject in the imperative, under ~72 characters, scope optional. One logical change per commit. `fix:` and `feat:` lines feed the release notes, so write them so a user could understand them.
