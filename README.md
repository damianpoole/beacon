# Beacon

Beacon is a Mac desktop app that monitors GitHub PR checks, surfaces failures, and proposes fix suggestions via the GitHub Copilot SDK. It runs locally, relies on `gh` for GitHub access, and keeps a human-in-the-loop, suggest-only workflow.

## Goals

- Monitor PR checks for multiple local repositories.
- Fetch failing CI logs and generate fix suggestions.
- Present diffs for review and let the user apply patches locally.
- Keep code and credentials local with no auto-commit or push.

## What It Does

- Electron app with a React renderer UI.
- Background polling of PR checks via `gh pr checks`.
- Log retrieval for failures via `gh run view --log-failed`.
- Copilot SDK sessions for classification and fix suggestions.
- Diff preview and an apply action that writes to the working tree only.

## Status

Completed (current MVP progress):

- App shell (Electron main process and lifecycle)
- UI shell layout (dashboard + sidebar + detail pane)
- Repo path input and validation
- GitHub CLI auth validation
- PR discovery for local repos
- PR polling loop with manual refresh
- Failed run log capture
- Failure classification (heuristics)
- UI: PR list with status/actionable badges

In progress / planned:

- Local storage (SQLite + diff files)
- PR polling persistence
- Failure classification (Copilot fallback)
- Copilot SDK toolset integration
- Suggestion generation and diff storage
- UI: diff viewer, apply action
- Settings: model selection and discovery
- Observability and safe logging
- End-to-end smoke flow and core tests

## Requirements

- macOS
- Node.js (see `package.json` for scripts)
- GitHub CLI (`gh`) authenticated via `gh auth login`

## Setup

Install dependencies and run the app in dev mode:

```bash
npm install
npm run dev
```

Build and run the Electron app:

```bash
npm run build
npm run start
```

Typecheck and tests:

```bash
npm run typecheck
npm run test
```

## Copilot SDK Notes

- The model is cloud-based and selectable in settings.
- Logs and code may be sent to the selected model to generate suggestions.
- Apply actions never auto-commit or push.

## Non-Goals (Initial)

- No server backend
- No Azure DevOps or other CI providers
- No automatic commit/push

## Repository Structure

- `src/main` - Electron main process and background services
- `src/renderer` - React UI
- `tasks/tasks.json` - Task tracker for planned work
- `.plans/plan.md` - High-level plan
- `.plans/initial-idea.md` - Original idea exploration
