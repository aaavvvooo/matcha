# Matcha

A dating web app built for the 42 curriculum: register, build a profile, discover and like people nearby, and
chat in real time once the interest is mutual.

**Stack:** React 19 · FastAPI (Python 3.13) · PostgreSQL 17 with hand-written SQL · MinIO / Google Cloud Storage ·
Docker Compose.

## Run it

Prerequisites: Docker with the Compose plugin.

1. Create `.env` in the repository root (it is gitignored — never commit it) with the variables below.
2. Start everything:
   ```bash
   docker compose up --build
   ```
   On start the backend applies migrations and seeds the tag list plus **500+ profiles**
   (`scripts/seed_profiles.py --target 500`, `scripts/seed_armenia_profiles.py --count 50`).
3. Open:

   | Service | URL |
   |---|---|
   | App | http://localhost:3000 |
   | API + OpenAPI docs | http://localhost:8000/docs |
   | MinIO console | http://localhost:9001 |

Seeded accounts use emails ending in `@matcha-seed.dev` or `@matcha-seed-am.dev` and the password defined as `DEFAULT_PASSWORD` in
`backend/scripts/seed_common.py`.

## Environment variables

| Variable | Purpose |
|---|---|
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | Database credentials |
| `POSTGRES_HOST`, `POSTGRES_PORT_INNER` | DB host/port inside the Docker network (`postgres`, `5432`) |
| `POSTGRES_PORT_OUTER` | DB port published on the host |
| `JWT_SECRET_KEY`, `JWT_ALGORITHM` | Token signing |
| `BACKEND_HOST`, `BACKEND_PORT` | Uvicorn bind host, published API port |
| `FRONTEND_URL` | Allowed CORS origin and base for email links |
| `REACT_APP_API_URL` | API base URL used by the frontend |
| `BREVO_API_KEY`, `FROM_EMAIL` | Transactional email (verification, password reset) |
| `MINIO_ROOT_USER`, `MINIO_ROOT_PASSWORD`, `MINIO_BUCKET` | Local photo storage |
| `STORAGE_BACKEND` | `minio` or `gcs`; Compose hardcodes `minio` for the backend, so set it only outside Compose |
| `GCP_PROJECT_ID`, `GCS_BUCKET_NAME` | Only when `STORAGE_BACKEND=gcs` |
| `NOMINATIM_URL`, `NOMINATIM_USER_AGENT`, `NOMINATIM_ACCEPT_LANGUAGE` | Optional geocoding overrides |

## Development

Backend (from `backend/`, uses [uv](https://docs.astral.sh/uv/)):
```bash
uv sync
uv run ruff check application
uv run mypy --config-file application/mypy.ini application
uv run alembic revision -m "describe change"   # new migration
```

Frontend (from `frontend/`):
```bash
npm install
npm start          # dev server on :3000
npm run build
```

## Documentation

| File | Contents |
|---|---|
| `docs/en.subject_matcha.pdf` | The project subject (requirements) |
| `docs/EPICS.md` | Epics, features, status, and roadmap |
| `docs/DESIGN.md` | Architecture, schema, API, matching, real-time and security design |
| `CLAUDE.md` | Rules for AI coding agents working in this repo |
