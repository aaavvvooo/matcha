# Matcha — Technical Design

**Version:** 2.0 · **Updated:** 2026-11-07 (re-synced with the code)

Requirements: `docs/en.subject_matcha.pdf`. Roadmap and status: `docs/EPICS.md`.
Sections marked **(planned)** describe the design for roadmap items not yet built; everything else describes the
code as it is.

---

## 1. Architecture

```
┌──────────────┐  HTTP + WS   ┌──────────────────┐   asyncpg   ┌──────────────┐
│  React SPA   │ ◄──────────► │  FastAPI backend │ ◄─────────► │ PostgreSQL 17│
│  :3000       │              │  :8000           │             │  :5432       │
└──────────────┘              └────────┬─────────┘             └──────────────┘
                                       │ boto3 / google-cloud-storage
                                ┌──────▼───────┐        ┌────────────────────┐
                                │ MinIO (dev)  │        │ Brevo (email)      │
                                │ or GCS (prod)│        │ Nominatim (geocode)│
                                └──────────────┘        └────────────────────┘
```

Local development runs everything through `docker-compose.yaml` (postgres, backend, minio, frontend).
Production deploys via `.github/workflows/deploy.yml` with GCS as photo storage.

## 2. Technology stack

| Layer | Technology | Notes |
|---|---|---|
| Frontend | React 19, React Router 7, axios, CRA | |
| Backend | FastAPI, Python 3.13 | Used for routing + request parsing only (see §10) |
| Database | PostgreSQL 17 | |
| Queries | **Hand-written SQL via asyncpg** (`$1` placeholders) | No ORM at runtime |
| Migrations | Alembic; SQLAlchemy models exist **only** to describe schema for Alembic | Never import models in app code |
| Auth | JWT (python-jose) + Argon2 (passlib) + zxcvbn | |
| Real-time | FastAPI WebSocket, single endpoint | |
| Email | Brevo (`sib-api-v3-sdk`) | |
| Geocoding | Nominatim (OpenStreetMap) via httpx | |
| Photo storage | `clients/storage.py`: MinIO (S3 API) or GCS, chosen by `STORAGE_BACKEND` | |
| Rate limiting | SlowAPI | |

## 3. Backend layout and layering

```
backend/application/
├── api/endpoints/   # HTTP/WS handlers: parse request, call service, return schema
├── service/         # business rules; raises HTTPException with a safe message
├── repository/      # ALL SQL lives here; returns asyncpg Records
├── schema/          # Pydantic request/response models
├── clients/         # email, geocoding, storage
├── websocket/       # PresenceManager (live sockets per user)
├── utils/           # deps (get_current_user, require_profile), tokens, password, photo_url
├── models/          # SQLAlchemy models — Alembic only
├── database.py      # asyncpg pool: fetch_one / fetch_all / fetch_val / execute
├── limiter.py, config.py, main.py
```

Rules: endpoint → service → repository, with SQL in `repository/`. New domains get their own
repo/service/endpoint file rather than growing an unrelated one. Existing exceptions (move them when touched):
- SQL outside `repository/`: `main.py` (startup presence reset, `/health`), `websocket/manager.py` (presence),
  `SocialService.get_user_profile` (`fame_rating` read).
- Endpoints calling repositories directly: `auth.py` `/auth/me`, `photos.py` `/profile/photo/{key}`,
  `profile.py` upload photo-count check.
- Dynamic `SET` clauses (`user_repo`, `profile_repo`) build column names with f-strings from code-defined keys;
  values are always `$n` parameters. Never let request field names reach those keys unfiltered.

## 4. Database schema (current)

```
users            id PK, email UQ, username UQ, hashed_password, first_name, last_name, is_validated, is_superuser,
                 is_online, last_seen, created_at, updated_at
user_profiles    id PK, user_id FK UQ, bio, birth_date, gender, sexual_orientation,
                 profile_picture_id FK→photos, fame_rating FLOAT, latitude, longitude, location_label,
                 created_at, updated_at
photos           id PK, user_id FK, url, "order", is_main, created_at, updated_at
tags             id PK, name UQ, created_at, updated_at
user_tags        (user_id, tag_id) PK
likes            (liker_id, liked_id) PK, created_at
profile_views    (viewer_id, viewed_id) PK, viewed_at            -- one row per pair, viewed_at refreshed
connections      (user_a_id, user_b_id) PK, CHECK user_a_id < user_b_id, created_at
messages         id PK, sender_id FK, receiver_id FK, body TEXT, is_read, sent_at
notifications    id PK, user_id FK, type VARCHAR(50), from_user FK NULL, is_read, created_at
blocks           (blocker_id, blocked_id) PK
reports          (reporter_id, reported_id) PK, created_at
verification_tokens  id PK, user_id FK, token UQ, token_type, expires_at, used, created_at
refresh_tokens   id PK, username UQ, token_hash, expires_at, created_at
token_blacklist  id PK, token_hash UQ, expires_at, created_at
```

Value sets (shared by frontend, seed scripts, and matching; `Literal` types in
`application/schema/value_sets.py`, enforced by CHECK constraints `ck_user_profiles_gender`,
`ck_user_profiles_sexual_orientation`, `ck_notifications_type`):
- `gender`: `Man` · `Woman` · `Non-binary` · `Other`
- `sexual_orientation`: `Heterosexual` · `Homosexual` · `Bisexual` · `Other` (NULL ⇒ treated as `Bisexual`)
- `notifications.type`: `like` · `view` · `message` · `match` · `unlike`

A profile counts as **complete** when `user_profiles.gender IS NOT NULL`; incomplete profiles are hidden everywhere.

## 5. HTTP API

No `/api` prefix. Public routes: `/auth/register`, `/verify-email`, `/login`, `/forget-password`, `/refresh`,
`/reset-password`. `/auth/logout` takes an optional Bearer token plus the refresh cookie and works even with an
expired token. `/profile/photo/*` is authenticated by the `access_token` cookie (so `<img src>` works). Everything
else, including `/auth/me`, requires `Authorization: Bearer <access>`.

### Auth — `/auth`
| Method | Path | Notes |
|---|---|---|
| POST | `/register` | Sends verification email · 10/hour · 409 if username/email is taken |
| POST | `/verify-email` | Token in body |
| POST | `/login` | Form body (username or email + password) · returns access token, sets refresh cookie · 5/min |
| GET | `/me` | Current user |
| POST | `/forget-password` | Always same message (no user enumeration) · 3/min |
| POST | `/logout` | Idempotent: blacklists a live access token, revokes the refresh token (username from access or refresh token), always clears both cookies |
| POST | `/refresh` | Rotates refresh token (httpOnly, SameSite=Strict cookie) |
| POST | `/reset-password` | Token + new password in body · 5/min |

### Own profile — `/profile`
| Method | Path | Notes |
|---|---|---|
| POST | `/set` | First-time profile setup |
| GET | `/get` | Own full profile |
| PATCH | `/update` | Gender, orientation, bio, birth date, tags |
| PATCH | `/location` | `{latitude, longitude}` (GPS) or `{city}` (geocoded) |
| POST | `/upload-photo` | multipart `files[]`; JPEG/PNG/WebP, ≤5 MB each, ≤5 total. Refused before parsing: 411 (no `Content-Length` / chunked), 401 (no credentials), 413 (body > 5×5 MB + 64 KB) |
| DELETE | `/delete-photos` | `{photo_ids: []}` |
| POST | `/set-profpic` | `{photo_id}` |
| GET | `/get-all-tags` | Tag autocomplete |
| GET | `/photo/{key}` | Serves a stored photo (cookie auth) |

### Other users — `/users`
| Method | Path | Notes |
|---|---|---|
| PATCH | `/me` | Name / email (email change ⇒ re-verify) · 409 if username/email is taken |
| GET | `/me/blocks` | My blocked list |
| GET | `/{id}` | Public profile (no email); records a view; 403 if they blocked me |
| POST / DELETE | `/{id}/like` | Like requires own photo; mutual ⇒ connection. Unlike removes connection |
| POST / DELETE | `/{id}/block` | Block also removes likes + connection both ways |
| POST | `/{id}/report` | Fake-account report |
| GET | `/{id}/views` | Own only (403 otherwise) |
| GET | `/{id}/likes` | Own only |

### Discovery — `/profiles` (planned, E3)
| Method | Path | Notes |
|---|---|---|
| GET | `/browse` | Suggested list (§8). Params: `sort_by` (`score`·`age`·`distance`·`fame`·`tags`), `order`, `min_age`, `max_age`, `max_distance_km`, `min_fame`, `max_fame`, `tags`, `limit`, `offset` |
| GET | `/search` | Same filters, user-driven; plus `location` (city, geocoded) |

### Notifications — `/notifications` (planned, E6)
| Method | Path | Notes |
|---|---|---|
| GET | `/notifications` | Paginated, newest first, with `from_username`, `from_photo_url` |
| POST | `/notifications/read` | Mark all read |

### Chat — `/chat`
| Method | Path | Notes |
|---|---|---|
| WS | `/ws` | Exists — presence; chat + notifications planned (§7) |
| GET | `/conversations` | (planned, E5) Connected users with last message + unread count |
| GET | `/messages/{user_id}` | (planned, E5) Paginated history; 403 unless connected |

## 6. Authentication flow

```
register → email link → POST /auth/verify-email → is_validated = true
login    → access token (body) + refresh token (httpOnly cookie, hash stored in refresh_tokens)
request  → Bearer access token; blacklist checked in get_current_user
expired  → axios interceptor → POST /auth/refresh → retry queued requests
logout   → access token hash → token_blacklist; refresh cookie cleared
```

## 7. Real-time design

One socket per browser tab at `/chat/ws`. The client sends `{"type":"auth","token":"<access>"}` as its first
frame (token is never in the URL); the server closes with 1008 if it is missing, invalid, or blacklisted, or after
10 s. Server pings every 25 s.

`PresenceManager` (`websocket/manager.py`) keeps `user_id → set[WebSocket]`; `users.is_online` flips on the first
connect and back (with `last_seen = now()`) when the last socket closes.

**(planned, E6/E5)**
- `PresenceManager.send_to_user(user_id, payload)` pushes to every open socket of a user.
- `NotificationService.notify(user_id, type, from_user)`: skip if either side blocked the other; skip if the
  recipient has unliked / disconnected from the sender where the subject requires it; insert the row; push
  `{"type":"notification","event":type,"from_user","from_username","from_photo_url","id","created_at"}`.
- Triggers: like (`like`), profile view (`view`), message (`message`), mutual like (`match`, to both),
  unlike by a connected user (`unlike`).
- Client → server `{"type":"message","to":id,"body":"..."}`: verify a connection exists and no block → persist →
  push `{"type":"message","from","from_username","body","sent_at","id"}` to the recipient (and echo to the
  sender's other tabs) → `notify(..., "message")`.
- Single process, in-memory registry: acceptable for one-node evaluation; not multi-worker safe.

## 8. Matching (planned, E3)

**Eligibility** — a candidate appears only if all hold:
1. Not the viewer; profile complete; has a main photo.
2. No block in either direction.
3. Orientation is mutual: the candidate's gender is one the viewer is interested in **and** vice versa.

Interest rule, given a person's gender `g` and orientation `o` (NULL ⇒ `Bisexual`):

| o | interested in |
|---|---|
| `Heterosexual` | `Man` ⇄ `Woman` (the other one); for `Non-binary`/`Other` gender ⇒ everyone |
| `Homosexual` | same gender as `g` |
| `Bisexual`, `Other`, NULL | everyone |

> Confirm this table at E3 Gate 1 — it is a product decision, not dictated by the subject.

**Score** (default `sort_by=score`), computed in SQL:

```
distance_km  = haversine(viewer, candidate)               -- NULL coords ⇒ ranked last
proximity    = 1 / (1 + distance_km / 10)
shared_norm  = shared_tags / GREATEST(1, viewer_tag_count)
fame_norm    = fame_rating / 100
score        = 0.5 * proximity + 0.3 * shared_norm + 0.2 * fame_norm
```

"Same area first" (subject IV.3) is enforced by the proximity weight. Explicit sorts (`age`, `distance`, `fame`,
`tags`) replace the score; filters apply before sorting. Pagination by `limit`/`offset`.

## 9. Fame rating

Recomputed synchronously by `SocialRepository.recalculate_fame` on like, unlike, view, and block:

```
fame_rating = min(100, likes_received * 3 + profile_viewers * 1 + connections * 5)
```

Stored in `user_profiles.fame_rating`. `profile_viewers` counts distinct viewers (one row per pair).

## 10. Security

| Threat | Mitigation | Status |
|---|---|---|
| SQL injection | All values are asyncpg `$n` parameters; f-strings only for code-defined column names (§3) | ✅ |
| XSS | React escapes output; no `dangerouslySetInnerHTML` | ✅ |
| Weak passwords | Argon2; zxcvbn score ≥ 2 + length/charset rules | ✅ |
| CSRF | Refresh cookie httpOnly + SameSite=Strict; CORS whitelist | ✅ |
| Brute force | SlowAPI limits on auth routes | ✅ |
| Token replay | Access blacklist on logout; refresh rotation | ✅ |
| Malicious upload | Type detected from magic bytes (`utils/image.py`), never client `content_type`; ≤5 MB read cap; all files validated before any is stored; served with `nosniff`; `upload_size_guard` (`main.py`) refuses oversized, chunked or anonymous upload bodies from the headers before Starlette parses them | ✅ |
| Info leakage | `main.py` middleware logs unhandled errors and returns `{"detail":"Internal server error"}`; `/health` returns only `status` (`healthy`/`degraded`/`unhealthy`), database connectivity and `storage.ready` — no versions, hosts or errors | ✅ |
| Secrets | `.env` gitignored | ✅ |

**Micro-framework rule (subject §III).** Decision 2026-11-07: keep FastAPI + Pydantic. Defense position: FastAPI is
used as a router + request parser; there is no ORM at runtime (raw SQL in `repository/`), and no user-account
library (auth, tokens, verification, reset are hand-written).

## 11. Frontend

- **Contexts:** `AuthContext` (user + access token), `NotificationContext` (owns the single WS, unread count),
  `ChatContext` (conversations/messages; sends over `NotificationContext`'s socket).
- **API modules** in `src/api/`: `authApi` (fetch), the rest via `client.js` (axios + 401 → refresh).
- **Routing:** `ProtectedRoute` redirects to `/login`; `/profile/setup` for incomplete profiles.
- **Layout:** `Layout.jsx` renders `[BottomNav (side menu ≥860 px / tab bar below) + Header + <main>]` then
  `Footer` as the last row (under the tab bar on mobile, full width on desktop). The landing page `/` draws its
  own header/main/footer; signed-in users visiting `/` are redirected to `/browse`.
- **Errors:** `components/ErrorBoundary.jsx` wraps the whole app (render errors only — async errors must be
  handled where they occur).
- **Design system:** tokens in `src/index.css` (cream / matcha palette, Playfair Display + DM Sans);
  shared UI in `src/components/ui/`.

## 12. Known gaps

Tracked in `docs/EPICS.md`. Architectural notes only:
- WebSocket registry is in-memory (single process).
- No backend test suite yet (EPICS Phase 2).
