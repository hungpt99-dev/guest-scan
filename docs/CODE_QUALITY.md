# Code Quality

## Naming Conventions

- **TypeScript:** camelCase for variables/functions, PascalCase for types/interfaces/components
- **Python:** snake_case for functions/variables, PascalCase for classes
- **Rust:** snake_case for functions/variables, PascalCase for types
- **Files:** kebab-case for all file names

## TypeScript Standards

- Strict mode enabled (`strict: true` in tsconfig)
- `noUncheckedIndexedAccess: true` — always check array/object access
- `noUnusedLocals` and `noUnusedParameters` — no dead code
- Prefer `unknown` over `any` when type is uncertain
- Use `interface` for public API shapes, `type` for unions
- Use `import type` for type-only imports

### ESLint Rules

- Based on `@typescript-eslint/recommended`
- `no-explicit-any` is a warning, not an error
- Unused variables (except those prefixed with `_`) are warnings
- Consistent type imports are enforced

### Prettier Rules

- Single quotes: disabled
- Semicolons: required
- Trailing commas: all
- Print width: 120
- Tab width: 2

## Python Standards

- Type hints on all function signatures
- dataclasses for data containers
- pathlib for file paths
- Explicit error codes (not generic exceptions)
- Code prepared for PyInstaller packaging

### Ruff Rules

- Line length: 100
- Target: Python 3.11
- Selected rules: E (pycodestyle), F (pyflakes), I (isort), B (flake8-bugbear), UP (pyupgrade), SIM (simplify)

### mypy Rules

- `warn_return_any`: true
- `disallow_untyped_defs`: false (practical for skeleton state)
- `ignore_missing_imports`: true (for optional dependencies)

## Rust Standards

- Commands should be small and focused
- Return `Result<T, AppError>` from commands
- Validate all file paths before access
- Keep command modules separated by feature
- `cargo fmt` for formatting
- `cargo clippy` with `-D warnings` for linting

## Testing Standards

- Unit tests for all parser, validation, and transformation logic
- Integration tests for feature workflows
- Tests should not depend on real files or external services
- Python tests use pytest with standard `test_*.py` naming
- TypeScript tests (when added) should use vitest or jest

## Commit Message Rules

Use [Conventional Commits](https://www.conventionalcommits.org/):

```text
<type>: <description>

[optional body]
[optional footer]
```

Allowed types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `style`, `perf`, `ci`, `build`, `revert`

Commit messages are validated by commitlint on every commit.

## Error Handling

- Use Result-style error handling (union types in TS, `Ok`/`Err` in Python, `Result<T, AppError>` in Rust)
- Define explicit error codes
- Never expose internal error details to the user without sanitization

## AI Agent Quality Checklist

Before submitting changes:

1. Run `pnpm quality` — format check, lint, typecheck
2. Run `pnpm test` — all tests pass
3. Review for sensitive data (passport numbers, .env files)
4. Update relevant documentation
5. Use conventional commit message
