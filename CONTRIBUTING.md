# Contributing to TiviHub

Thanks for your interest in contributing to TiviHub Web. Contributions should preserve the app's local-first design, protect user and provider credentials, and keep the deployed product static.

## Development checks

Use Node.js 20 or later:

```sh
npm ci
npm run typecheck
npm test
npm run build
```

The repository intentionally has no CI/CD build or deployment pipeline. Run checks locally before opening a pull request, and describe the change and the checks you performed.

## Code expectations

- Follow the existing React, TypeScript, and CSS patterns.
- Keep provider parsers, storage logic, and transformations testable.
- Surface errors instead of silently substituting empty or success-shaped results.
- Do not add credentials, private playlist URLs, API keys, personal data, or copyrighted media.
- Keep user data in browser storage; do not add a TiviHub application server, account service, analytics, or proxy without discussing the architectural change first.
- Do not add CI/CD workflows or require a Node.js runtime on the static host.
- Follow the [Code of Conduct](./CODE_OF_CONDUCT.md). Report security issues privately as described in [SECURITY.md](./SECURITY.md).
