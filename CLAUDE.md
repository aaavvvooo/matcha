# Matcha — agent instructions

42 school dating-site project. Requirements are fixed by `docs/en.subject_matcha.pdf`; a single security hole or
console error fails the defense.

## Read first
- `docs/EPICS.md` — roadmap, story IDs (E3.1, F2, B2.3…) and status. Tick a story when it merges.
- `docs/DESIGN.md` — architecture, schema, API contract, matching, real-time design. Planned endpoints there are the
  contract the frontend already calls: implement those paths, don't invent new ones.

## Stack
FastAPI (Python 3.13, uv) + asyncpg + PostgreSQL 17 · React 19 (CRA) · MinIO/GCS photos · Docker Compose.

## Hard rules
- **SQL**: hand-written, parameterised (`$1`) asyncpg queries, only in `backend/application/repository/`.
  No ORM at runtime — `models/` exists for Alembic only; never import it in app code. Never build SQL with f-strings
  from user input.
- **Layering**: endpoint → service → repository. Services raise `HTTPException` with a safe message. Never put
  exception text (`{e}`), stack traces, or SQL in a response.
- **Schema changes**: new Alembic revision in `backend/alembic/versions/`, update the model, update DESIGN.md §4.
- **Value sets** (gender, orientation, notification types) are defined in DESIGN.md §4 — reuse them.
- **Uploads**: validate by magic bytes and size server-side; never trust `content_type`.
- **Blocks** hide users everywhere: browse, search, profile view, notifications, chat.
- **Real-time**: one WebSocket per tab at `/chat/ws`, owned by `NotificationContext` on the frontend and
  `PresenceManager` on the backend. Extend these; don't open a second socket.
- **Frontend**: API calls go through `src/api/*` (axios `client.js`; `authApi.js` uses `fetch`); no `dangerouslySetInnerHTML`; use design
  tokens from `src/index.css` and components in `src/components/ui/`.
- **Secrets** only in `.env` (gitignored). Never commit credentials.

## Checks
Run from `backend/` unless noted (`uv sync` installs ruff from the dev group; rule set pinned in `pyproject.toml`).
Baseline on 2026-11-08: ruff clean, mypy 8 errors — add no new ones.
```bash
uv run ruff check application
uv run mypy --config-file application/mypy.ini application
uv run pytest                          # once the Phase 2 harness exists
cd ../frontend && npm run build        # must compile with no errors
```
Full stack: `docker compose up --build` from the repo root (runs migrations and seeds 500+ profiles).

## Workflow
- Branch per story or phase off `main`; conventional commits (`feat:`, `fix:`, `docs:`…).
- ECC: one `/ecc:orch-*` run per roadmap item; include the story ID and point at EPICS.md + DESIGN.md.
- Security-sensitive diffs (auth, input, SQL, uploads, WS) get `security-reviewer` before commit.
