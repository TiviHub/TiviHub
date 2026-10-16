# Contributing to TiviHub

Thanks for your interest in contributing to TiviHub. Contributions should preserve the app's local-first design, protect user and provider credentials, and keep the download website static.

## Development checks

Use Node.js 20 or later:

```sh
npm ci
npm run typecheck
npm test
npm run build
```

Run checks locally before opening a pull request, and describe the change and the checks you performed. A Windows installer release is built and published by GitHub Actions when a matching version tag (for example, `v0.2.0`) is pushed; website deployment remains a separate static-hosting step.

## Code expectations

- Follow the existing React, TypeScript, and CSS patterns.
- Keep provider parsers, storage logic, and transformations testable.
- Surface errors instead of silently substituting empty or success-shaped results.
- Do not add credentials, private playlist URLs, API keys, personal data, or copyrighted media.
- Keep user data local to the desktop app; do not add a TiviHub application server, account service, analytics, or proxy without discussing the architectural change first.
- Keep the website static; do not require a Node.js runtime or application server on the hosting provider.
- Follow the [Code of Conduct](./CODE_OF_CONDUCT.md). Report security issues privately as described in [SECURITY.md](./SECURITY.md).
