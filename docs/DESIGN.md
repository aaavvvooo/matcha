# Matcha — Technical Design

**Version:** 2.1 · **Updated:** 2026-11-10 (E5/E6 real-time built)

Requirements: `docs/en.subject_matcha.pdf`. Roadmap and status: `docs/EPICS.md`.
Everything here describes the code as it is; sections for roadmap items not yet built are marked **(planned)**
(none at the moment).

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
                 indexes ix_messages_pair (sender_id, receiver_id, id), ix_messages_unread (receiver_id, sender_id) WHERE is_read = false
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
| POST | `/register` | Sends verification email · 10/hour |
| POST | `/verify-email` | Token in body |
| POST | `/login` | Form body (username or email + password) · body `{access_token, token_type}` only (the refresh token is never in a response body), sets the refresh and `access_token` cookies · 5/min |
| GET | `/me` | Current user |
| POST | `/forget-password` | Always same message (no user enumeration) · 3/min |
| POST | `/logout` | Idempotent: blacklists a live access token, revokes the refresh token (username from access or refresh token), closes all of that user's WebSockets (1008 `logged_out`), always clears both cookies |
| POST | `/refresh` | Rotates the refresh token (httpOnly, SameSite=Strict cookie); body `{access_token, token_type}` |
| POST | `/reset-password` | Token + new password in body · 5/min |

### Own profile — `/profile`
| Method | Path | Notes |
|---|---|---|
| POST | `/set` | First-time profile setup |
| GET | `/get` | Own full profile |
| PATCH | `/update` | Gender, orientation, bio, birth date, tags |
| PATCH | `/location` | `{latitude, longitude}` (GPS) or `{city}` (geocoded) |
| POST | `/upload-photo` | multipart `files[]`; JPEG/PNG/WebP, ≤5 MB, ≤5 total |
| DELETE | `/delete-photos` | `{photo_ids: []}` |
| POST | `/set-profpic` | `{photo_id}` |
| GET | `/get-all-tags` | Tag autocomplete |
| GET | `/photo/{key}` | Serves a stored photo (cookie auth) |

### Other users — `/users`
| Method | Path | Notes |
|---|---|---|
| PATCH | `/me` | Name / email (email change ⇒ re-verify) |
| GET | `/me/blocks` | My blocked list |
| GET | `/{id}` | Public profile (no email); records a view; 403 if they blocked me |
| POST / DELETE | `/{id}/like` | Like requires own photo; mutual ⇒ connection. Unlike removes connection |
| POST / DELETE | `/{id}/block` | Block also removes likes + connection both ways |
| POST | `/{id}/report` | Fake-account report |
| GET | `/{id}/views` | Own only (403 otherwise) |
| GET | `/{id}/likes` | Own only |

### Discovery — `/profiles` (E3)
| Method | Path | Notes |
|---|---|---|
| GET | `/browse` | Suggested list (§8), people already liked are skipped. Params: `sort_by` (`score`·`age`·`distance`·`fame`·`tags`), `order` (`asc`·`desc`, default per sort), `min_age`, `max_age` (18–120), `max_distance_km`, `min_fame`, `max_fame` (0–100), `tags` (comma-separated names, any match, case-insensitive, `#` optional), `limit` (≤50, default 20), `offset`. Requires a complete profile (403). 400 if `max_distance_km` is set and there is no reference position |
| GET | `/search` | Same filters and sorts, liked people included; plus `location` (city, geocoded → replaces the viewer's position; 400 unknown, 503 geocoder down) |

Both return `DiscoveryProfile[]`: `user_id`, `username`, `first_name`, `last_name`, `age`, `gender`, `sexual_orientation`, `bio`, `fame_rating`, `is_online`, `last_seen`, `location_label`, `distance_km` (whole km, min 1, NULL without positions), `shared_tags`, `tags` (names), `photos` (main first), `score`. No email.

### Notifications — `/notifications` (E6)
| Method | Path | Notes |
|---|---|---|
| GET | `/notifications/unread-count` | `{"unread": n}`: all unread notifications (not just the first page), excluding senders blocked either way. 60/min |
| GET | `/notifications` | Newest first. Params: `limit` (1–100, default 50), `offset` (≤10000). Items: `id`, `type`, `from_user`, `from_username`, `from_photo_url`, `is_read`, `created_at`. Notifications from users blocked in either direction are hidden. 60/min |
| POST | `/notifications/read` | Marks all read → `{"updated": n}`. 60/min |

The badge shows the server total: it is loaded from `/notifications/unread-count` and replaced by the `unread` field of every pushed `notification` frame (§7); mark-read sets it to 0.

### Chat — `/chat` (E5)
| Method | Path | Notes |
|---|---|---|
| WS | `/ws` | Presence, notifications and chat (§7) |
| GET | `/conversations` | Connected users who are not blocked either way, most recent activity (last message, else the connection) first. Items: `user_id`, `username`, `first_name`, `last_name`, `photo_url`, `is_online`, `last_seen`, `last_message` (body or null), `last_sender_id`, `sent_at` (of the last message, or null), `unread_count`, `connected_at`. 60/min |
| GET | `/messages/{user_id}` | History of one thread, **oldest first**. Params: `limit` (1–100, default 50) returns the newest `limit` messages; `before_id` returns the page of messages older than that id (use the first id you hold). Items: `id`, `sender_id`, `receiver_id`, `body`, `sent_at`, `is_read`. Ids (`user_id`, `before_id`) must be 1–2147483647, else 422. Fetching the newest page (no `before_id`) marks that user's messages to you as read. 403 `"You are not connected with this user"` unless connected and unblocked (also for yourself). 120/min |
| POST | `/messages/{user_id}/read` | Marks that user's messages as read → `{"updated": n}`; same 403 rule. The client calls it when a message arrives in the open thread. 120/min |

## 6. Authentication flow

```
register → email link → POST /auth/verify-email → is_validated = true
login    → access token (body) + refresh token (httpOnly cookie only, hash stored in refresh_tokens)
request  → Bearer access token; blacklist checked in get_current_user
expired  → axios interceptor → single-flight refresh in api/client.js (shared with the WebSocket) → retry
logout   → access token hash → token_blacklist; refresh cookie cleared; user's sockets closed
tokens   → JWTs carry type=access|refresh; every bearer/cookie/WS credential check requires type=access,
           /auth/refresh requires type=refresh (a refresh JWT is never an access credential)
```

## 7. Real-time design

One socket per browser tab at `/chat/ws`. The client sends `{"type":"auth","token":"<access>"}` as its first
frame (token is never in the URL); the server closes with 1008 if it is missing, invalid, or blacklisted, or after
10 s. Only an **access** JWT is accepted (a refresh JWT is refused), and it must not be blacklisted. On success the
server sends `{"type":"auth_ok"}`; clients treat the socket as connected only then. Server pings every 25 s
(`{"type":"ping"}`); the client may answer `{"type":"pong"}` (ignored).

The token's `exp` is kept: when it passes (checked on every inbound frame and on the ping tick) the server closes the
socket with 1008. Close reasons the client acts on: `auth_failed` (bad/blacklisted/refresh token, missing auth
frame), `token_expired`, `logged_out` (logout), `too_many_connections` (more than **5** sockets per user; extra
connections are closed after auth). Logout closes all of the user's sockets. On any 1008 other than
`too_many_connections` the client gets a fresh token through the single-flight refresh in `api/client.js` and
reconnects with exponential backoff (1 s to 30 s, reset by `auth_ok`); if the refresh is rejected (401) it stops and
the session ends. `too_many_connections` just retries at the maximum backoff.

`PresenceManager` (`websocket/manager.py`) keeps `user_id → set[WebSocket]` (max 5 per user); `users.is_online`
flips on the first connect and back (with `last_seen = now()`) when the last socket closes. It also owns the
per-user message rate limiter (created with the first socket, dropped with the last) and `close_user(user_id)`.
`send_to_user(user_id, payload)` pushes to every open socket of a user, best effort and never raising (2 s per
socket); a socket that times out or fails is closed and dropped so later pushes don't wait on it again. Returns
how many sockets got it.

**Server → client frames**
- `{"type":"notification","id","event","from_user","from_username","from_photo_url","created_at","unread"}`
  where `event` is `like` · `view` · `message` · `match` · `unlike` and `unread` is the recipient's total unread
  count after this notification.
- `{"type":"message","id","from","from_username","to","body","sent_at"}` — a stored chat message. Sent to the
  recipient **and** to every socket of the sender (other tabs, and the sending tab learns the persisted id), so
  clients de-duplicate by `id`. The sender's copy also carries `"ref"` when the client supplied one.
- `{"type":"error","code","detail"[,"to"][,"ref"]}` — a rejected client frame; `detail` is safe to show, `to` is
  echoed when the frame carried a valid id, `ref` when it carried a (valid) `ref`. The socket stays open.

**Client → server `{"type":"message","to":<user id>,"body":"<text>"[,"ref":"<nonce>"]}`** (`ChatService.send_message`).
`ref` is an optional client correlation id (string, 1–64 characters, otherwise ignored): the client keeps the text
under it until the echo (same `ref`) arrives, or restores it into the input when an error carries it.
1. `to` must be an integer in 1–2147483647 (not a bool), not the sender → `invalid_recipient`.
2. `body` must be a string → `invalid_body`; after `strip()` it must be non-empty → `empty_body` and at most
   **2000 characters** (`MAX_BODY_LENGTH`) → `body_too_long`. Bodies containing NUL or other control characters
   (anything but `\n` and `\t`) or unpaired surrogates → `invalid_body`. The stored/pushed body is the stripped text.
3. One `INSERT … SELECT … WHERE EXISTS(connection) AND NOT EXISTS(block either way)` statement stores the message
   (`is_read=false`). No row ⇒ `not_connected` ("You are not connected with this user") — the same answer for
   never connected, unliked, blocked, or a non-existent user. Being atomic, an unlike/block racing with a send
   cannot let a message through.
4. Push the `message` frame to the recipient and the sender, then `notify_safe(recipient, "message", sender)`.

Other error codes: `invalid_frame` (not JSON, not an object, binary frame), `frame_too_large` (> 8192 characters),
`unknown_type`, `rate_limited`, `server_error` (unexpected failure, logged server-side, generic detail).
Limits, sliding window: any frame 60 per 10 s **per connection**; chat messages 10 per 10 s **per user** (shared by
all their sockets); 5 sockets per user. Handling a frame never raises out of the receive loop; a bad frame gets an
error frame and the socket is not closed. The 8192-character check is app-level; uvicorn runs with
`--ws-max-size 16384` (Dockerfile and compose command) so bigger frames are refused before they are buffered.

**Notifications** (`NotificationService.notify(to_user, type, from_user)` → id or `None`; every trigger calls
`notify_safe`, which logs and swallows a failure so a like, view, unlike or message never fails or rolls back because
its notification did). Suppressed (nothing
stored or pushed) for: self actions; a block in either direction (E6.6); a `message` between users who are not
connected (so a message notification can only follow a stored message); a repeated `view` from the same viewer
within 60 minutes. Otherwise insert, then push the `notification` frame.
- `like` → liked user, only when the like is new (a repeated like is a no-op).
- `match` → both users, when a like completes a mutual like (replaces `like`). Only the request whose
  `INSERT … ON CONFLICT DO NOTHING RETURNING` actually created the connection notifies, so simultaneous mutual likes
  announce the match once.
- `view` → viewed user, on a profile visit (not own, not blocked).
- `unlike` → the unliked user, only if the two were connected and a like was actually removed.
- `message` → recipient, for every stored message.
Unlike and block both delete the `connections` row, which is what disables chat (E5.4); a later match restores it.

**Frontend.** `api/client.js` owns the access token and the single-flight refresh; `AuthContext` mirrors it.
`NotificationContext` owns the single socket (opened once per session, keyed on the user id, token read at each
connect) and exposes `connected` (true from `auth_ok`), `subscribe(listener)` and `send(frame)`. `ChatContext` subscribes: it appends `message` frames (de-duplicated by id), counts unread per
conversation (`unreadMessages` drives the badges in `BottomNav` and `Header`), shows `error` frames, reloads
conversations on `match`/`unlike` notifications, a `not_connected` error and after a reconnect. A thread's history is requested only once the conversation list is loaded and contains the partner
(no deliberate 403s); a partner missing from a loaded list shows the "no longer connected" state, a failed list
load shows an error with retry instead.

Single process, in-memory registry and rate-limit state: acceptable for one-node evaluation; not multi-worker safe.

## 8. Matching (E3, `repository/discovery_repo.py`)

**Eligibility** — a candidate appears only if all hold:
1. Not the viewer; email validated; profile complete; has a main photo.
2. No block in either direction.
3. Orientation is mutual: the candidate's gender is one the viewer is interested in **and** vice versa.

Interest rule, given a person's gender `g` and orientation `o` (NULL ⇒ `Bisexual`):

| o | interested in |
|---|---|
| `Heterosexual` | `Man` ⇄ `Woman` (the other one); for `Non-binary`/`Other` gender ⇒ everyone |
| `Homosexual` | same gender as `g` |
| `Bisexual`, `Other`, NULL | everyone |

> Confirmed 2026-11-08 (product decision, not dictated by the subject).

**Location privacy** — candidate positions are snapped to a 0.02° grid (~2 km) before distance, the
`max_distance_km` filter, sorting and the score are computed, and `distance_km` is returned as whole km (min 1),
so moving one's own position or searching other cities can't trilaterate anyone beyond a grid cell. Geocoding
(Nominatim) goes through one process-wide gate (≥1 s between upstream calls, ≤10 queued, else 503) with a 24 h
cache.

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
| Malicious upload | Type detected from magic bytes (`utils/image.py`), never client `content_type`; ≤5 MB read cap; all files validated before any is stored; served with `nosniff` | ✅ (request-size limit: R2) |
| Info leakage | `main.py` middleware logs unhandled errors and returns `{"detail":"Internal server error"}`; `/health` reports only connectivity | ✅ |
| Secrets | `.env` gitignored | ✅ |

**Micro-framework rule (subject §III).** Decision 2026-11-07: keep FastAPI + Pydantic. Defense position: FastAPI is
used as a router + request parser; there is no ORM at runtime (raw SQL in `repository/`), and no user-account
library (auth, tokens, verification, reset are hand-written).

## 11. Frontend

- **Contexts:** `AuthContext` (user + access token), `NotificationContext` (owns the single WS, unread count),
  `ChatContext` (conversations, threads, unread count, chat errors; sends and receives over
  `NotificationContext`'s socket via `send` / `subscribe`).
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
