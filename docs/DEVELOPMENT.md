# Development

## Prerequisites

- Node.js 22+
- pnpm 10+
- Rust toolchain (https://rustup.rs)
- Python 3.10+

## Quick Start

```bash
pnpm install         # Install dependencies
pnpm dev:desktop     # Start desktop app
pnpm dev:ocr         # Test OCR worker CLI
```

## Workspace Structure

```
guestfill/
  apps/desktop/          Tauri desktop application
  workers/ocr/           Python OCR worker
  workers/desktop_agent/ Python desktop automation agent (placeholder)
  apps/browser-extension/ Chrome extension (placeholder)
  packages/shared/       Shared TypeScript types and utilities
  docs/                  Project documentation
  scripts/               Development automation scripts
```

## Quality Commands

| Command                 | What it does                            |
| ----------------------- | --------------------------------------- |
| `pnpm format`           | Format all source files                 |
| `pnpm format:check`     | Check formatting without changing files |
| `pnpm lint`             | Run all linters                         |
| `pnpm typecheck`        | Run all type checks                     |
| `pnpm test`             | Run all tests (unit, integration, E2E)  |
| `pnpm test:ts`          | Run TypeScript tests (Vitest)           |
| `pnpm test:py`          | Run Python tests (pytest)               |
| `pnpm quality`          | Format check + lint + typecheck         |
| `pnpm verify`           | Full quality check + tests              |
| `pnpm secrets:scan`     | Scan for secrets and .env files         |
| `pnpm check-env`        | Verify required tools are installed     |
| `pnpm verify-workspace` | Verify project structure is complete    |

## Git Hooks

This project uses [lefthook](https://github.com/evilmartians/lefthook) for git hooks.

### Installation

Hooks are installed automatically via `pnpm install` (the `prepare` script runs `lefthook install`).

To install manually:

```bash
pnpm prepare
```

### Pre-commit Checks

- **Format check** — ensures all files are formatted (Prettier for TS, Ruff for Python)
- **Lint** — runs ESLint for TypeScript, Ruff for Python
- **Typecheck** — runs TypeScript and mypy type checks
- **Secret scan** — scans for .env files and potential secrets

### Pre-push Checks

- **Verify** — full quality check + tests
- **CodeGraph** — trigger CodeGraph index update if installed

### Bypassing Hooks (Emergency Only)

```bash
git commit --no-verify -m "message"
git push --no-verify
```

Only bypass hooks when absolutely necessary, and fix the issue afterward.

## Branch Naming

```text
feature/<short-name>
fix/<short-name>
chore/<short-name>
docs/<short-name>
refactor/<short-name>
test/<short-name>
```

Examples:

```text
feature/ocr-worker-cli
fix/excel-export-lock-error
chore/setup-git-hooks
```

## Commit Messages

Use [Conventional Commits](https://www.conventionalcommits.org/):

```text
feat: add OCR worker CLI skeleton
fix: handle locked Excel output file
chore: setup lefthook quality checks
docs: update development guide
refactor: split OCR parser modules
test: add MRZ validator tests
```

Allowed types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `style`, `perf`, `ci`, `build`, `revert`

## CodeGraph Trigger

CodeGraph automatic indexing runs on `git push` via lefthook.

To trigger manually:

```bash
pnpm codegraph
```

The trigger script (`scripts/codegraph-trigger.mjs`) detects whether `codegraph` CLI is installed. If not, it skips with a message.

To enable CodeGraph, install it from: https://codegraph.dev

## Fixing Common Hook Failures

| Problem                 | Solution                                        |
| ----------------------- | ----------------------------------------------- |
| Format check fails      | Run `pnpm format` and stage the changes         |
| Lint errors             | Fix the reported lint issues                    |
| Typecheck errors        | Fix the type errors                             |
| Secret scan warning     | Check for .env files or hardcoded secrets       |
| Commit message rejected | Use conventional commit format: `type: message` |

## Folder Conventions

| Folder                         | Contents                              |
| ------------------------------ | ------------------------------------- |
| `apps/desktop/src/screens/`    | Page-level components (one per route) |
| `apps/desktop/src/components/` | Reusable UI components                |
| `apps/desktop/src/features/`   | Feature-specific logic, types, stores |
| `workers/ocr/guestfill_ocr/`   | Python OCR worker packages            |
| `packages/shared/src/`         | Shared TypeScript types and utilities |
| `docs/`                        | Project documentation                 |
| `scripts/`                     | Development automation scripts        |
