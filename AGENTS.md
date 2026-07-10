# Repository instructions

Before changing code, read:

- `docs/design.md`
- `docs/coding-standards.md`
- `docs/folder-structure.md`
- `docs/database-design.md`
- `docs/functional-design.md`
- `docs/implementation-plan.md`

Required implementation rules:

- Keep FastAPI controllers limited to HTTP concerns.
- Organize backend code by feature under `modules/`, separating controller, service, repository, models, and schemas within each feature.
- Route all user-facing UI text through i18n resources; support `ja` and `en` with `ja` as the default and fallback.
- Put use cases, authorization, and transaction boundaries in services.
- Keep SQLAlchemy access in repositories; repositories do not commit.
- Scope every user-owned query by the authenticated user ID.
- Use Alembic for all schema changes; do not use `create_all()` in production.
- Add unit tests for new business logic and regression tests for bug fixes.
- Test both allowed and denied authorization paths.
- Never expose passwords, sessions, API keys, signed URLs, or authorization headers.
- Pass validated argument arrays to FFmpeg; do not construct shell commands from user input.
- Check touched code for duplication and growth. Refactor when the signals in `docs/coding-standards.md` apply.
- A change is complete only after relevant lint, type checks, tests, and documentation pass.
