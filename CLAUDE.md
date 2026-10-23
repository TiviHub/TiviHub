# TiviHub

Tauri 2 desktop app (Rust in `src-tauri/`) with a React 19 + Vite + TypeScript UI in `src/`. Local-first: no server, accounts or analytics. Goal: fast, consistent, and clean enough to be a model open-source repo.

## Skills (in `.claude/skills/`, load the one that matches the work)

| Skill | Use for |
|---|---|
| `architecture` | layers, where code goes, Tauri commands, speed rules |
| `coding` | TypeScript, React and Rust conventions, the done-checklist |
| `database` | SQLite/IndexedDB stores, migrations, caches, secrets |
| `ui` | every UI/CSS change: tokens, shared components, style guide |
| `testing-and-ci` | tests, lint, perf measuring, CI workflows |
| `release` | version, release notes, tags, commit format |
| `karpathy-guidelines` | how to work: assumptions, small diffs, verify |
| `landing-design` | the marketing page in `src/landing/` only |

## Always

- UI: reuse shared components, use theme tokens, no new font sizes or literal radii. `npm run styleguide` is the source of truth; read the `ui` skill first.
- Layers: components never call `fetch`, `invoke` or storage directly.
- Schema change = a new `user_version` migration step plus a test. Never edit an old step.
- A bug fix starts with a failing test. Never skip or weaken a test to get green.
- Do not add dependencies, Prettier or Stylelint, or a monorepo, without asking.
- Before saying done: `npx tsc --noEmit`, `npm run lint`, `npx vitest run src` (plus `cargo test` if Rust changed). Report what you could not run.
- Plans, specs and notes go in `tasks/<topic>/{spec,plan,todo}.md`. `docs/` holds release notes only.
- `src/` root stays `main.tsx`, `App.tsx`, `types.ts`: pure helpers in `src/lib/`, I/O logic in `src/services/`, CSS in `src/styles/`.
