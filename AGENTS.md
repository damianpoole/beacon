# Beacon Agent Guide

This file orients coding agents working in this repo. Keep changes local; do
not auto-commit or push. Follow repo conventions and avoid modifying files
outside the requested scope.

## Project Summary
- Mac desktop app (Electron main + React renderer) for monitoring GitHub PR
  checks and surfacing fix suggestions.
- Runs locally and relies on `gh` for GitHub access.
- Suggest-only workflow: no auto-commit, no auto-push.

## Tech Stack
- Electron + React (renderer) + TypeScript
- Vite for dev/build
- Vitest for tests
- better-sqlite3 for local storage

## Key Directories
- `src/main` : Electron main process, backend services
- `src/renderer` : React UI
- `test` : Vitest tests
- `scripts` : build helpers

## Install
- Preferred package manager: `pnpm` (see `pnpm-lock.yaml` and CI)
- Install: `pnpm install`

## Common Commands
- Dev server: `pnpm dev`
- Build: `pnpm build`
- Start Electron (after build): `pnpm start`
- Typecheck: `pnpm typecheck`
- Tests: `pnpm test`
- Rebuild native deps for Node: `pnpm rebuild:node`
- Rebuild native deps for Electron: `pnpm rebuild:electron`

## Test Commands (Vitest)
- `pnpm test` runs `pnpm rebuild:node` then `vitest run`.
- Single file: `pnpm test -- test/storage.test.ts`
- Single test name: `pnpm test -- -t "upserts pull requests by repo"`
- Watch a file: `pnpm exec vitest test/shell.test.ts`

## Linting
- No lint script defined in `package.json`.
- Do not introduce new lint tooling unless requested.

## Build Notes
- Build runs Vite + TypeScript builds for main/preload.
- Preload is renamed via `scripts/rename-preload.cjs`.
- Electron entrypoint: `dist/main/index.js`.
- `pnpm start` runs `pnpm rebuild:electron` before launching.

## Runtime Requirements
- macOS
- `gh` authenticated (`gh auth login`)

## Code Style Guidelines
### General
- Language: TypeScript, ES modules.
- Use explicit types where ambiguity hurts readability.
- Prefer small, composable functions and early returns.
- Keep UI logic in renderer; backend and OS/CLI interactions in main.

### Formatting
- Use double quotes for strings.
- Use semicolons.
- 2-space indentation.
- Trailing commas on multi-line literals.

### Imports
- Group imports by origin: external, built-in `node:*`, then local.
- Prefer `node:` prefixes for Node built-ins (`node:fs`, `node:path`).
- Use named imports over default unless module conventions require default.
- Keep import lists sorted and minimal.

### React
- Components are function components with hooks.
- Prefer `React.FC` only when it helps readability (current files use it).
- Co-locate small components in the same file if they are not reused.
- Keep effect cleanup consistent and explicit.

### State and Effects
- Use `useState` for local UI state; `useRef` for mutable non-render state.
- Guard async effects with an `active` flag to avoid updates after unmount.
- Avoid overlapping polling; see `pollingRef` usage in `shell.tsx`.

### Types
- Use `type` for object shapes and unions (current convention).
- Prefer narrow union types for finite state (`"infra" | "code" | "unknown"`).
- Avoid explicit return types unless necessary; lean on inference.
- Keep API boundary types in sync (preload + renderer ambient types).

### Naming
- Functions: `camelCase`.
- Types: `PascalCase`.
- Constants: `camelCase` unless truly constant or enum-like.
- File names: `kebab-case` for non-entry scripts, `index.ts` for entrypoints.

### Error Handling
- Validate inputs early and return user-facing error messages.
- Use `error instanceof Error` to extract messages safely.
- Log errors via `logError` in main process.
- Avoid throwing from renderer unless it is a hard startup failure.

### IPC & Preload
- All renderer access to main APIs goes through `contextBridge`.
- Keep preload APIs narrow and typed in `src/renderer/ambient.d.ts`.
- Validate repo paths and PR numbers in main before executing commands.

### Logging
- Use `logInfo` / `logError` from `src/main/logging.ts`.
- Keep logs concise and include context objects when helpful.

### Database & Storage
- Prefer `Storage` methods over raw DB access.
- Keep SQL statements in `Storage` and return typed records.
- Ensure file system writes are scoped to app-owned directories.

## Testing Guidelines
- Use Vitest (`describe/it/expect`).
- Tests live in `test/`.
- Keep tests small and deterministic; use temp dirs for filesystem work.

## UI / UX Notes
- Keep the renderer responsive; avoid long sync work on the main thread.
- Use clear empty states and error messaging (existing pattern).

## Cursor / Copilot Rules
- No `.cursor/rules/`, `.cursorrules`, or `.github/copilot-instructions.md`
  found in this repo.

## Safety
- Never auto-commit or push changes.
- Avoid modifying unrelated files in a dirty working tree.
- Do not introduce new dependencies without explicit request.

## Quick File Map
- Main process entry: `src/main/index.ts`
- Preload: `src/main/preload.ts`
- Renderer entry: `src/renderer/index.tsx`
- Main UI shell: `src/renderer/shell.tsx`
- Storage: `src/main/storage.ts`
- Tests: `test/storage.test.ts`, `test/shell.test.ts`

## Notes for Agents
- Prefer `pnpm` commands to match CI.
- Keep changes aligned with existing style and patterns.
- When in doubt, follow existing code patterns in `src/main` and
  `src/renderer`.
