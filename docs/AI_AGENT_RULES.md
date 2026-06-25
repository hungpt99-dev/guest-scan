# AI Agent Rules

These rules must be followed by any AI coding agent working on this project.

## Before Coding

1. Always read `README.md` and `docs/DOCS_INDEX.md` before modifying any code.
2. Read feature-specific design docs (e.g., `OCR_TECHNICAL_DESIGN.md`) before modifying that feature.
3. Run `pnpm check-env` to verify all required tools are installed.
4. Run `pnpm verify-workspace` to verify the project structure.

## During Coding

5. Do not implement unrelated features. Stay focused on the task at hand.
6. Keep modules small and focused. Each module should have one responsibility.
7. Do not put business logic directly inside React components. Extract into feature modules.
8. Use typed interfaces for all cross-module data. No implicit shapes.
9. Use Result-style error handling wherever possible (`Ok<T, E>` or `Result<T, E>`).
10. Do not log sensitive guest data (passport numbers, ID numbers, full names, raw OCR text).
11. Do not call external APIs unless explicitly configured. All processing is local by default.
12. Do not bypass git hooks unless explicitly requested by the user.

## Architecture Rules

13. OCR output is draft data. The reviewed Excel file is the source of truth.
14. Auto-fill must not save or submit by default. It assists the user, it does not automate without confirmation.

## Testing

15. Add tests for all parser, validation, and transformation logic.

## Documentation

16. Update docs when architecture or commands change.

## Before Final Answer

Run the quality checks that are relevant to your changes:

- `pnpm format:check` — verify formatting
- `pnpm lint` — verify linting
- `pnpm typecheck` — verify types
- `pnpm test` — verify tests pass

## AI Agent Final Response Checklist

Every coding response should include:

1. **Files changed** — list of created/modified files
2. **Commands run** — what was executed during the task
3. **Tests passed/failed** — test results if tests were run
4. **Known limitations** — what is incomplete or placeholder
5. **Next recommended step** — what the next agent/developer should work on
