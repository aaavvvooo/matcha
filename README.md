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

Seeded accounts use emails ending in `@matcha-seed.example.org` or `@matcha-seed-am.example.org` (reserved, unregistrable domains; older `.dev` seeds are moved on the next start) and the password defined as `DEFAULT_PASSWORD` in
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
| `OAUTH_REDIRECT_BASE_URL` | Public base URL of the API used in OAuth callback URLs (Compose: `http://localhost:8000`) |
| `OAUTH_42_CLIENT_ID`, `OAUTH_42_CLIENT_SECRET` | Optional: "Continue with 42" (UID / SECRET of a 42 Intra app) |
| `OAUTH_GITHUB_CLIENT_ID`, `OAUTH_GITHUB_CLIENT_SECRET` | Optional: "Continue with GitHub" (GitHub OAuth app) |

**OAuth sign-in (optional).** A provider is enabled only when its id + secret, `OAUTH_REDIRECT_BASE_URL` and
`FRONTEND_URL` are all set; otherwise its button is hidden and its routes return 404. Register one app per
provider with exactly this callback URL (the backend's, not the frontend's):

| Provider | Where | Callback / redirect URI |
|---|---|---|
| 42 Intra | intra.42.fr → Settings → API → *Register a new app* (scope `public`) | `http://localhost:8000/auth/oauth/42/callback` |
| GitHub | github.com → Settings → Developer settings → *OAuth Apps* → *New OAuth App* | `http://localhost:8000/auth/oauth/github/callback` |

Replace `http://localhost:8000` with `OAUTH_REDIRECT_BASE_URL` when deployed. Open the app as
`http://localhost:3000` (not `127.0.0.1`) so the SPA and the API stay the same site for the session cookie.
New accounts from 42 (which doesn't mark emails verified) must confirm the address through the usual
verification email before they can sign in; GitHub sign-in requires a verified primary email on the GitHub
account. OAuth needs the SPA and the API on the same site (true for Compose); see `docs/DESIGN.md` §6 for what a
split production deployment would need.

**Email delivery:** Brevo rejects API calls from IPs that aren't on the account's allowlist (`401 unrecognised IP
address`). Before running on a new network (e.g. the defense machine), add its public IP to the authorised IPs in
the Brevo account's security settings, or turn the restriction off. Server errors, `429` and network failures are
retried 3 times; any other `4xx` (bad key, IP not allowlisted, invalid sender) is logged once and not retried. Logs
come from `application.api.endpoints.auth` and carry the HTTP status and Brevo's error `code` only (e.g.
`status=401 code=unauthorized`); check with `docker logs fastapi_backend`.

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
