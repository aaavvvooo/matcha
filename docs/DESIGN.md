# Matcha — Technical Design

**Version:** 2.2 · **Updated:** 2026-11-11 (B5 date scheduling built)

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
- SQL outside `repository/`: `main.py` (`/health` ping), `SocialService.get_user_profile` (`fame_rating` read).
  (The presence updates of `websocket/manager.py` and the startup reset moved to `UserRepository`.)
- Endpoints calling repositories directly: `auth.py` `/auth/me` (profile + pending email), `photos.py` `/profile/photo/{key}`,
  `profile.py` upload photo-count check.
- Dynamic `SET` clauses (`user_repo`, `profile_repo`) build column names with f-strings from code-defined keys;
  values are always `$n` parameters. Never let request field names reach those keys unfiltered.

## 4. Database schema (current)

```
users            id PK, email UQ, username UQ, hashed_password, first_name, last_name, is_validated, is_superuser,
                 is_online, last_seen, created_at, updated_at, token_version INT DEFAULT 0
                 unique indexes uq_users_email_lower (lower(email)), uq_users_username_lower (lower(username)):
                 both are unique ignoring case; emails are stored lower-case and every lookup compares lower()
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
dates            id PK, proposer_id FK→users CASCADE, invitee_id FK→users CASCADE, title VARCHAR(100), place VARCHAR(200),
                 note VARCHAR(500) NULL, scheduled_at TIMESTAMPTZ, status VARCHAR(20) DEFAULT 'pending',
                 reminder_sent_at TIMESTAMPTZ NULL, created_at, updated_at
                 CHECKs ck_dates_distinct_users (proposer_id <> invitee_id), ck_dates_status;
                 indexes ix_dates_proposer (proposer_id, scheduled_at), ix_dates_invitee (invitee_id, scheduled_at),
                 ix_dates_reminder (scheduled_at) WHERE status = 'accepted' AND reminder_sent_at IS NULL
blocks           (blocker_id, blocked_id) PK
reports          (reporter_id, reported_id) PK, created_at
verification_tokens  id PK, user_id FK, token UQ (SHA-256 of the mailed secret), token_type, expires_at, used, created_at,
                 new_email NULL (pending email change), index ix_verification_tokens_user_type (user_id, token_type, created_at)
refresh_tokens   id PK, user_id FK→users ON DELETE CASCADE UQ, token_hash, expires_at, created_at  -- one row per user
token_blacklist  id PK, token_hash UQ, expires_at, created_at
oauth_accounts   id PK, user_id FK→users ON DELETE CASCADE, provider VARCHAR(20), provider_user_id VARCHAR(64),
                 created_at, UQ(provider, provider_user_id), UQ(user_id, provider)   -- B1
```

Value sets (shared by frontend, seed scripts, and matching; `Literal` types in
`application/schema/value_sets.py`, enforced by CHECK constraints `ck_user_profiles_gender`,
`ck_user_profiles_sexual_orientation`, `ck_notifications_type`):
- `gender`: `Man` · `Woman` · `Non-binary` · `Other`
- `sexual_orientation`: `Heterosexual` · `Homosexual` · `Bisexual` · `Other` (NULL ⇒ treated as `Bisexual`)
- `notifications.type`: `like` · `view` · `message` · `match` · `unlike` · `date_proposed` · `date_accepted` ·
  `date_declined` · `date_cancelled` · `date_reminder`
- `dates.status` (`ck_dates_status`): `pending` · `accepted` · `declined` · `cancelled`
- `oauth_accounts.provider`: `42` · `github` (`ck_oauth_accounts_provider`; allowlist in `clients/oauth_client.py`)
- `verification_tokens.token_type`: `email` (sign-up verification; with `new_email` set, a pending email change) ·
  `password_reset` (`TOKEN_EMAIL` / `TOKEN_PASSWORD_RESET` in `service/auth_service.py`). Each consumer accepts only its own type.
- Username rule (`schema/fields.Username`, register / `PATCH /users/me` / OAuth generator): `^[A-Za-z0-9_.-]{3,30}$`,
  so a username can never contain `@` or look like an email. Checked on write only: older usernames still sign in.

All timestamps in the schema are `timestamptz`; the API accepts and returns ISO 8601 UTC instants and the frontend
renders them in the viewer's local timezone. `dates.scheduled_at` must be sent with an offset (a naive value is a 422).

A profile counts as **complete** when `user_profiles.gender IS NOT NULL`; incomplete profiles are hidden everywhere.

## 5. HTTP API

No `/api` prefix. Request bodies: at most 64 KB except `/profile/upload-photo` (413 above; 411 for a chunked body).
Public routes: `/auth/register`, `/verify-email`, `/login`, `/forget-password`, `/refresh`,
`/reset-password`, `/oauth/*`. `/auth/logout` takes an optional Bearer token plus the refresh cookie and works even with an
expired token. `/profile/photo/*` is authenticated by the `access_token` cookie (so `<img src>` works). Everything
else, including `/auth/me`, requires `Authorization: Bearer <access>`.

### Auth — `/auth`
| Method | Path | Notes |
|---|---|---|
| POST | `/register` | Sends verification email · 10/hour · 409 if username/email is taken (case-insensitive) · 422 if the username breaks the rule (§4) |
| POST | `/verify-email` | Token in body; only `email` tokens (a password-reset token is "Invalid token"). Confirms a sign-up, or applies a pending email change: the new address is re-checked and written in one locked transaction (409 "Email already registered" if it was taken meanwhile; nothing changes); a token is spent atomically (single use) |
| POST | `/login` | Form body (username or email + password) · body `{access_token, token_type}` only (the refresh token is never in a response body), sets the refresh and `access_token` cookies · 5/min |
| GET | `/me` | Current user: `id`, `first_name`, `last_name`, `username`, `email`, `is_validated`, `has_profile`, `pending_email` (address of an unconfirmed email change, or null) |
| POST | `/forget-password` | Always same message (no user enumeration) · 3/min per IP, and per account at most one reset mail per 2 minutes (a request inside the cooldown gets the same answer and sends nothing); a new reset link invalidates the previous ones |
| POST | `/logout` | Idempotent: blacklists a live access token, revokes the refresh token (user id from the access or refresh token, if it still matches the account's `token_version`), closes all of that user's WebSockets (1008 `logged_out`), always clears both cookies |
| POST | `/refresh` | Rotates the refresh token (httpOnly, SameSite=Strict cookie); body `{access_token, token_type}`. **204 No Content** (empty body) when the request carries no `refresh_token` cookie (nothing to restore: a signed-out page load must not log a console error); 401 when a cookie is present but invalid, expired or revoked. 10/min |
| POST | `/reset-password` | Token + new password in body · 5/min · only `password_reset` tokens. Ends every session of the account: all its outstanding tokens are spent, `token_version` is bumped (every access/refresh JWT dies at once), the refresh row is deleted, its sockets are closed (1008 `logged_out`). The link went to the account's address, so a reset also marks an unverified account verified |
| GET | `/oauth/providers` | `{"providers": [...]}` — only providers with credentials configured (B1) |
| GET | `/oauth/{provider}/start` | `provider` ∈ `42`·`github` and configured, else 404 · 302 to the provider with `state` (+ PKCE S256 for GitHub) · sets the `oauth_flow` cookie · 20/min |
| GET | `/oauth/{provider}/callback` | `code`, `state` (or provider `error`) · always 302 to `{FRONTEND_URL}/oauth/callback?status=ok\|verify_email` or `?error=<code>`; on success sets the same cookies as `/login` · 20/min |

### Own profile — `/profile`
| Method | Path | Notes |
|---|---|---|
| POST | `/set` | First-time profile setup |
| GET | `/get` | Own full profile |
| PATCH | `/update` | Gender, orientation, bio, birth date, tags |
| PATCH | `/location` | `{latitude, longitude}` (GPS) or `{city}` (geocoded) |
| POST | `/upload-photo` | multipart `files[]`; JPEG/PNG/WebP, ≤5 MB each, ≤5 total. Every file is decoded and re-encoded server-side (§10, `utils/image.py`); only the re-encoded bytes are stored and hashed into the key, so duplicate detection compares re-encoded images. 400 "Photo N: …" for an unreadable, oversized (> 16 MP) or non-image file. Refused before parsing: 411 (no `Content-Length` / chunked), 401 (no valid, unexpired access token — signature/type/expiry checked without the DB), 413 (body > 5×5 MB + 64 KB). Optional form field `replaces` (photo id, B2.3): atomic replace, valid with exactly one file (else 400). In one locked transaction the new image is stored, inserted at the old `"order"` with the old `is_main`, `profile_picture_id` is repointed and the old row deleted; the old storage object is removed only after commit, the new one if the transaction fails, so the original disappears only if the replacement commits. Net photo count is unchanged (works at 5/5). 400 if the id isn't the caller's; 409 "This image is already in your gallery" if the bytes match any existing photo of the caller (including the one being replaced), nothing changed. Returns a one-element list |
| DELETE | `/delete-photos` | `{photo_ids: []}` |
| POST | `/set-profpic` | `{photo_id}` |
| PATCH | `/photo-order` | `{photo_ids: []}` (B2.2) · 30/min. Must be exactly the caller's photo ids, each once, in the new order, else 400 (foreign, duplicate, missing, unknown or empty list). Renumbers `"order"` 1..n in one statement under the per-user photo lock. Returns the photos in the new order. `is_main` / `profile_picture_id` are untouched: the profile picture is the explicit `is_main` flag (browse/search sort "main first, then `"order"`"), so reordering never changes it |
| GET | `/get-all-tags` | Tag autocomplete |
| GET | `/photo/{key}` | Serves a stored photo (cookie auth). The type is sniffed from the first bytes (JPEG/PNG/WebP only, else 404), never taken from object metadata; headers `Content-Security-Policy: default-src 'none'; sandbox`, `X-Content-Type-Options: nosniff`, `Content-Disposition: inline` |

### Other users — `/users`
| Method | Path | Notes |
|---|---|---|
| PATCH | `/me` | Name / username / email · 409 if username/email is taken (case-insensitive). **Email change is pending:** `users.email` is not touched; the new address is stored with an `email` token (`new_email`) and the link goes to the **new** address; the account stays validated on its current address until that link is clicked (`/auth/verify-email`). Response `MeResponse` adds `pending_email`, `email_verification_sent`. One pending change at a time (a new one invalidates the previous link); 429 if one was requested < 2 min ago or 5 in the last hour |
| GET | `/me/blocks` | My blocked list |
| GET | `/{id}` | Public profile (no email); records a view; 404 if they blocked me (same as a missing user) |
| POST / DELETE | `/{id}/like` | Like requires own photo; mutual ⇒ connection. Unlike removes connection. 404 "User not found" for a missing/hidden user **and** for one who blocked you (a block is not detectable) |
| POST / DELETE | `/{id}/block` | Block also removes likes + connection both ways · 404 for an unknown user |
| POST | `/{id}/report` | Fake-account report · 404 for an unknown user |
| GET | `/{id}/views` | Own only (403 otherwise) |
| GET | `/{id}/likes` | Own only |

### Discovery — `/profiles` (E3)
| Method | Path | Notes |
|---|---|---|
| GET | `/browse` | Suggested list (§8), people already liked are skipped. Params: `sort_by` (`score`·`age`·`distance`·`fame`·`tags`), `order` (`asc`·`desc`, default per sort), `min_age`, `max_age` (18–120), `max_distance_km`, `min_fame`, `max_fame` (0–100), `tags` (comma-separated names, any match, case-insensitive, `#` optional), `limit` (≤50, default 20), `offset`. Requires a complete profile (403). 400 if `max_distance_km` is set and there is no reference position |
| GET | `/search` | Same filters and sorts, liked people included; plus `location` (city, geocoded → replaces the viewer's position; 400 unknown, 503 geocoder down) |

| GET | `/map` | (B3) Users in a viewport box. Params: `min_lat`, `max_lat` (−90…90), `min_lng`, `max_lng` (−180…180), `limit` (1–200, default 200). 422 for missing/non-numeric/out-of-range values; 400 unless `min_lat < max_lat` **and** `min_lng < max_lng` — boxes crossing the antimeridian are rejected (the client clamps to ±180). Same eligibility as browse (§8, one shared SQL fragment); requires a complete profile (403); rate limit 120/min. Ordered by fame then id, truncated at `limit` (the client says "zoom in" when it gets 200) |

`/browse` and `/search` return `DiscoveryProfile[]`: `user_id`, `username`, `first_name`, `last_name`, `age`, `gender`, `sexual_orientation`, `bio`, `fame_rating`, `is_online`, `last_seen`, `location_label`, `distance_km` (whole km, min 1, NULL without positions), `shared_tags`, `tags` (names), `photos` (main first), `score`. No email.

`/map` returns `MapUser[]`: `user_id`, `username`, `first_name`, `age`, `fame_rating`, `is_online`, `photo_url` (main photo, via `to_photo_url`), `latitude`, `longitude` (**grid-cell centre**, 4 decimals), `shared_tags`. No email, last name or true coordinates.

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
| WS | `/ws` | Presence, notifications, chat and call signalling (§7) |
| GET | `/ice-servers` | B4: `{"ice_servers":[{"urls":[...],"username"?,"credential"?}]}` for `RTCPeerConnection`: the STUN server (`STUN_URL`, default `stun:stun.l.google.com:19302`) plus, only when `TURN_URL`, `TURN_USERNAME` and `TURN_CREDENTIAL` are all set, one TURN entry (`TURN_URL` may list several comma-separated URLs). Authenticated; 30/min. The TURN credential is static and reaches every signed-in user: use a relay with short-lived credentials in production |
| GET | `/conversations` | Connected users who are not blocked either way, most recent activity (last message, else the connection) first. Items: `user_id`, `username`, `first_name`, `last_name`, `photo_url`, `is_online`, `last_seen`, `last_message` (body or null), `last_sender_id`, `sent_at` (of the last message, or null), `unread_count`, `connected_at`. 60/min |
| GET | `/messages/{user_id}` | History of one thread, **oldest first**. Params: `limit` (1–100, default 50) returns the newest `limit` messages; `before_id` returns the page of messages older than that id (use the first id you hold). Items: `id`, `sender_id`, `receiver_id`, `body`, `sent_at`, `is_read`. Ids (`user_id`, `before_id`) must be 1–2147483647, else 422. Fetching the newest page (no `before_id`) marks that user's messages to you as read. 403 `"You are not connected with this user"` unless connected and unblocked (also for yourself). 120/min |
| POST | `/messages/{user_id}/read` | Marks that user's messages as read → `{"updated": n}`; same 403 rule. The client calls it when a message arrives in the open thread. 120/min |

### Dates — `/dates` (B5)
Only between users who are **currently connected** and not blocked either way. Item (`DateResponse`): `id`,
`proposer_id`, `invitee_id`, `title`, `place`, `note` (or null), `scheduled_at`, `status`, `created_at`, `updated_at`,
`with_user` (the *other* participant: `id`, `username`, `first_name`, `last_name`, `photo_url`).
| Method | Path | Notes |
|---|---|---|
| POST | `/dates` | Propose `{invitee_id, title, place, scheduled_at, note?}` → 201 + the date. Titles ≤100, places ≤200, notes ≤500 characters, trimmed; control characters / NUL / lone surrogates / bidi controls (U+202A–202E, U+2066–2069) / U+2028–2029 rejected (a note may contain newlines; the form turns a pasted tab into a space and refuses the rest before sending); unknown fields rejected; `scheduled_at` must carry a timezone, be in the future and at most 366 days ahead (422). Yourself → 400. Not connected, unliked, blocked or non-existent → the same 403 `"You are not connected with this user"` as chat. At most **3 pending** proposals per pair (either direction) and **20 pending** per proposer → 409; only pending dates that are still in the future count (an unanswered, expired proposal no longer blocks new ones). Both caps are exact under concurrency: one transaction takes an advisory lock on the proposer, then one on the pair. 10/min |
| GET | `/dates` | The caller's dates, ordered by `scheduled_at` (`order=asc\|desc`, default asc), paginated (`limit` 1–100, default 50; `offset` ≤10000). Filters: `status` (`pending`·`accepted`·`declined`·`cancelled`), `upcoming` (`true` = `scheduled_at >= now` and pending/accepted; `false` = everything else; omitted = all). Dates with users blocked in either direction are hidden (past ones included). A pending date whose time has passed is *expired*: it appears under `upcoming=false` and the UI shows it as expired with no actions. 60/min |
| POST | `/dates/{id}/accept` | Invitee only, from `pending`, date still in the future, pair still connected and unblocked. 30/min |
| POST | `/dates/{id}/decline` | Invitee only, from `pending`. Possible without a connection (e.g. after an unlike that raced), but never across a block (404). 30/min |
| POST | `/dates/{id}/cancel` | Proposer while `pending`; either participant once `accepted` and still in the future. Possible without a connection, but never across a block (404). 30/min |

Each transition is one conditional `UPDATE … WHERE id=$1 AND status=… AND <actor rule> RETURNING`, so two racing
requests cannot both win. Errors: 404 for a date the caller is not part of, for unknown ids, and for any date whose other participant is blocked
in either direction (reads and transitions alike: no existence or profile leak),
403 for the wrong role or (accept) a lost connection, 409 for an invalid transition (already accepted/declined/
cancelled, or in the past). Ids are 1–2147483647, else 422. Every status change sends a notification to the other
participant (§7); every transition returns the updated date.

## 6. Authentication flow

```
register → email link → POST /auth/verify-email → is_validated = true
login    → access token (body) + refresh token (httpOnly cookie only, hash stored in refresh_tokens)
request  → Bearer access token; utils/deps.resolve_access_token (shared by REST, the photo cookie and the WebSocket):
           type=access, not blacklisted, sub = user id + ver = users.token_version, account is_validated
identity → JWT `sub` is the immutable user id (string) plus `ver`; never the username. Tokens minted before this
           (sub=<username>, no ver) never resolve: everyone signed in before the upgrade signs in again
email    → change: PATCH /users/me stores new_email with an `email` token, mails the NEW address; users.email changes
           only when that link is confirmed (uniqueness re-checked). Reset tokens never verify an email and vice versa
reset    → POST /auth/reset-password: spends all of the user's tokens, bumps token_version, deletes the refresh row,
           closes the user's sockets; outstanding access tokens are rejected immediately (no 15-minute residual)
boot     → AuthContext calls refreshAccessToken() (api/client.js) once: 200 restores the session, 204 (no cookie)
           leaves the user signed out without any failed request, 401 (stale cookie) also signed out
expiring → the axios request interceptor refreshes a token that expires within 30 s before sending (at most once a
           minute per token), so an idle tab's next call doesn't produce a logged 401
expired  → axios interceptor → single-flight refresh in api/client.js (shared with boot and the WebSocket) → retry;
           only a 401 from the refresh sends the user to /login (offline/429/5xx surface as the request's error)
ws token → the socket lives as long as the access token it last presented (§7): the client sends a fresh token in-band
           (`{"type":"auth"}`) after every refresh and refreshes ahead of the socket's expiry even when idle
logout   → client token cleared first (socket closes, an in-flight refresh result is discarded), then the server
           call: access token hash → token_blacklist; refresh row deleted, cookie cleared; user's sockets closed
tokens   → JWTs carry type=access|refresh; every bearer/cookie/WS credential check requires type=access,
           /auth/refresh requires type=refresh (a refresh JWT is never an access credential)
```

**OAuth sign-in (B1)** — hand-rolled with httpx (`clients/oauth_client.py`, `service/oauth_service.py`,
`api/endpoints/oauth.py`); no OAuth/account library.

```
button (plain link) → GET /auth/oauth/{p}/start
    state = 256-bit random; GitHub: code_verifier (86 chars) + S256 challenge
    Set-Cookie oauth_flow=<b64url(json{p, s, v, e=now+10 min})>.<b64url(HMAC-SHA256(flow_key, payload))>;
        HttpOnly; SameSite=Lax; Path=/auth/oauth; Max-Age=600 (Secure when https)
        flow_key = HMAC-SHA256(JWT_SECRET_KEY, "matcha/oauth-flow-v1") — derived, never the JWT key itself
    nothing is stored server-side
    302 → provider authorize URL (redirect_uri = OAUTH_REDIRECT_BASE_URL + /auth/oauth/{p}/callback, never from the request)
provider → GET /auth/oauth/{p}/callback?code&state      (cross-site top-level GET: Lax cookie is sent)
    verify the cookie: ≤1 KB, one ".", strict base64url, MAC (hmac.compare_digest), exactly {p,s,v,e} with
      typed/shaped values, not expired and not further than 10 min ahead; p == path provider;
      state == query state (hmac.compare_digest) — any failure → error=invalid_state, before any provider call
    provider `error` → error=access_denied
    exchange code server-side (10 s timeout, no redirects followed, + code_verifier) → profile
      (42: /v2/me · GitHub: /user + /user/emails primary entry, used only if `verified`)
    provider access token dropped; provider bodies, codes and tokens never logged or returned; the callback's
      query string is redacted from uvicorn access logs (`main.py` filter)
    linking (below) → AuthService.issue_session (same as /login: refresh hash in refresh_tokens)
    302 → {FRONTEND_URL}/oauth/callback?status=ok, with Set-Cookie refresh_token / access_token
         (httpOnly, SameSite=Strict, exactly as /login); oauth_flow is cleared on every outcome
SPA /oauth/callback → AuthProvider's page-load POST /auth/refresh (same-site XHR from :3000 to :8000, so the
    Strict cookie is sent) → access token in memory → /profile/setup if !has_profile, else /browse
```

**Single use** rests on the browser dropping `oauth_flow` (cleared on every callback outcome, 10-minute expiry)
plus the providers' single-use, short-lived authorization codes (and PKCE for GitHub): a callback URL replayed
in the same browser finds no cookie; one replayed elsewhere has no valid cookie. The flow is stateless, so
`/start` cannot exhaust server memory and any instance can serve the callback. The cookie also carries the PKCE
`code_verifier`; that is acceptable because it is httpOnly, path-scoped, MAC-protected and sent only back to
our own callback by the same browser that started the flow — an attacker who could read it could equally read
the code.

Tokens never appear in a URL. The landing navigation itself is cross-site-initiated, so it carries no Strict
cookie; nothing relies on it — the session is picked up by the follow-up same-site XHR.

**Deployment scope.** OAuth (like page-reload session restore, which uses the same Strict refresh cookie) works
only when the SPA and the API are the **same site**. That holds in Compose / the evaluation setup:
`localhost:3000` and `localhost:8000` are one site (ports don't count). It does **not** hold for the
production workflow (`.github/workflows/deploy.yml`): SPA on `*.vercel.app`, API on Cloud Run `*.run.app`
(separate public suffixes, so separate sites), where the browser never sends the Strict refresh cookie — this
already breaks session restore on reload, and would break the OAuth hand-off the same way. Production would
need both served under one registrable domain (custom domains, e.g. `app.example.com` + `api.example.com`, or a
Vercel rewrite proxying the API under the SPA's origin), with `OAUTH_REDIRECT_BASE_URL`/`FRONTEND_URL` set to
those URLs and https so the cookies get `Secure`.

Linking, keyed on the provider's stable numeric id (never login or email):
1. `(provider, provider_user_id)` already linked → that user (refused with `email_unverified` while
   `is_validated` is false — same rule as password login, so a pending email change can't be bypassed).
2. Provider email matches a local user (`lower(email)`): linked only if the **provider marks the address
   verified** and the local user `is_validated`. Unvalidated local user → `link_unverified`; a 42 address (no
   verified flag) → `email_in_use`, never linked.
3. Otherwise a new user + link in one transaction:
   - **GitHub** only with a *verified primary* email; an unverified or missing one → `no_email` (no account, no
     link, no mail). Creating an unvalidated account for an address the GitHub user merely typed would let them
     pre-register someone else's address with a GitHub link that survives the owner's later password reset.
   - **42**: addresses are assigned by 42 to the student (they can't claim someone else's), but there is no
     verified flag, so the account starts with `is_validated = false` and our verification email is sent
     (`status=verify_email`, no session; `email_unavailable` if email isn't configured, checked before anything
     is created). The link is inert until that mail is clicked (rule 1), and the only person who can click it
     is the owner of the 42 mailbox, i.e. the same student — so no pre-hijack.
   - Username from the provider login (`[A-Za-z0-9_-]`, ≤40, `user` if shorter than 3) with `2`…`9` then random
     6-digit suffixes, retried on the unique index; names stripped of control/format characters and capped at
     50; `hashed_password` is the Argon2 hash of a random 32-byte secret (unusable — "forgot password" sets a
     real one).

Error codes (fixed; the SPA maps them to text): `access_denied`, `invalid_state`, `provider_error`, `no_email`,
`email_in_use`, `link_unverified`, `already_linked`, `email_unverified`, `email_unavailable`, `server_error`.

PKCE: GitHub yes (S256 only). 42: not documented in its public API docs, so not sent — it is a confidential
client (secret only server-to-server) and `state` still binds the callback to the browser; flip `pkce=True`
in `PROVIDERS` if 42 confirms support.

## 7. Real-time design

One socket per browser tab at `/chat/ws`. The client sends `{"type":"auth","token":"<access>"}` as its first
frame (token is never in the URL); the server closes with 1008 if it is missing, invalid, or blacklisted, or after
10 s. Only an **access** JWT is accepted (a refresh JWT is refused); it must not be blacklisted, must carry the user id
and the account's current `token_version`, and the account must be validated (`resolve_access_token`, same as REST). On success the
server sends `{"type":"auth_ok"}`; clients treat the socket as connected only then. Server pings every 25 s
(`{"type":"ping"}`); the client may answer `{"type":"pong"}` (ignored).

The token's `exp` is kept: when it passes (checked on every inbound frame and on the ping tick) the server closes the
socket with 1008. **In-band re-auth:** an open socket accepts `{"type":"auth","token":"<fresh access token>"}` at any
time. The token is validated exactly like the first frame (signature, `type == access`, not blacklisted, token version,
validated account) and must belong
to the **same user** (another user's token closes the socket with 1008 `auth_failed`; an invalid or refresh token gets an
`auth_failed` error frame and the socket stays); on success the socket's expiry becomes the new token's (never earlier
than before) and `auth_ok` answers. It counts against the per-connection frame limit. The client does this on every
`onTokenChange` and renews the token (`refreshAccessToken()`, single-flight) 2 minutes before the socket's token expires
(or when 40% of its remaining life is left, for short-lived tokens), even in an idle tab, so a call is not cut by the 15-minute access
token. A background tab whose timers are throttled harder than that still falls back to the close-and-reconnect path
(the call would end then). Logout / `close_user` still close every socket. Close reasons the client acts on: `auth_failed` (bad/blacklisted/refresh token, missing auth
frame), `token_expired`, `logged_out` (logout), `too_many_connections` (more than **5** sockets per user; extra
connections are closed after auth). Logout closes all of the user's sockets. On any 1008 other than
`too_many_connections` the client gets a fresh token through the single-flight refresh in `api/client.js` (once per
healthy connection) and reconnects with exponential backoff (1 s to 30 s, reset by `auth_ok`); if the refresh is
rejected (401) the session ends, and if the fresh token is rejected again the client stops reconnecting. Before each
connect the client also refreshes a token that expires within 30 s. `too_many_connections` just retries at the maximum backoff.

`PresenceManager` (`websocket/manager.py`) keeps `user_id → set[WebSocket]` (max 5 per user); `users.is_online`
flips on the first connect and back (with `last_seen = now()`) when the last socket closes (through `UserRepository`). It also owns the
per-user message rate limiter (created with the first socket, dropped with the last) and `close_user(user_id)`.
`send_to_user(user_id, payload)` pushes to every open socket of a user, best effort and never raising (2 s per
socket); a socket that times out or fails is closed and dropped so later pushes don't wait on it again. Returns
how many sockets got it.

**Server → client frames**
- `{"type":"notification","id","event","from_user","from_username","from_photo_url","created_at","unread"}`
  where `event` is `like` · `view` · `message` · `match` · `unlike` · `date_proposed` · `date_accepted` ·
  `date_declined` · `date_cancelled` · `date_reminder` and `unread` is the recipient's total unread
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
Limits, sliding window: any frame except call `signal` 60 per 10 s **per connection**; `signal` frames 120 per 10 s per connection; chat messages 10 per 10 s **per user** (shared by
all their sockets); 5 sockets per user. Handling a frame never raises out of the receive loop; a bad frame gets an
error frame and the socket is not closed. The 8192-character check is app-level; uvicorn runs with
`--ws-max-size 32768` (Dockerfile and compose command, twice the largest allowed frame) so bigger frames are refused
before they are buffered. The one exception to the 8192 cap is a call `signal` frame (below): up to **16384** characters,
with a separate per-connection limit. A frame is charged to a rate limiter **before** it is parsed: frames whose text
contains `"signal"` (a substring test, no parsing) to the signal budget, all others to the general one; a frame over
8192 characters without `"signal"` is refused unparsed, and one that merely mentions the word but is not a real signal is
charged to the general budget as well.

**Calls (B4): voice / video over the same socket.** WebRTC media is peer-to-peer; the server only relays the
signalling (`CallService` validates and authorises, `CallManager` in `websocket/call_manager.py` holds the state).
There is no second socket and no call history table (a missed call is only shown to the callee's open tabs; no
notification type was added).

*Client → server* `{"type":"call","action":A,"call_id":"<client uuid>","to":<user id>,...}`. `call_id` matches
`^[A-Za-z0-9_-]{8,64}$`, `to` is an int4 and not the sender (`invalid_recipient`); unknown actions → `invalid_call`.
- `invite` (+ `"media":"audio"|"video"`, else `invalid_media`): 6 per user per minute (`rate_limited`); call_id already in
  use → `invalid_call`; caller already in a call → `busy` (`reason:"you_in_call"`). The call is then **registered for the
  caller first** (state `checking`, nothing sent), and only after that is the pair checked (`can_chat`): not connected or
  blocked either way, or no such user → `not_connected`, the same answer as chat. Registering first means an unlike /
  block that commits meanwhile finds the call and ends it before it can ring (`end_between` covers both users). Only
  after the check: callee in a call → `busy` (`peer_in_call`); callee has no open socket → `unavailable`; otherwise the
  call rings **every** socket of the callee. Binding re-checks synchronously that the caller's (and, on accept, the
  accepting) socket is still registered, so a socket closed during the database check never leaves a lingering call.
- `accept` (callee, while ringing): the connection is checked again (lost → the call ends with `disconnected` and
  the accepter gets `not_connected`). The **first** accept wins: that socket becomes the callee socket, the caller gets
  `accept`, the callee's other sockets get `answered_elsewhere`.
- `decline` / `busy` (callee, while ringing): the caller gets `decline` / `busy`, other callee tabs `answered_elsewhere`
  (`outcome:"declined"`). `cancel` (caller, while ringing): callee sockets get `cancel`. `hangup`: ends an active call;
  while ringing it acts as cancel (caller) or decline (callee).
- `signal` + `"data"`: only after accept (else `call_not_active`), only between the two bound sockets.
  `data` is exactly `{"kind":"offer"|"answer","sdp":str}` (SDP 1-12000 characters, starting `v=0`) or
  `{"kind":"candidate","candidate":{candidate,sdpMid,sdpMLineIndex,usernameFragment}}` (candidate line starts
  `candidate:`, at most 1024 characters, `sdpMLineIndex` 0-255 or null); extra keys, wrong types or oversize →
  `invalid_signal`. Every string must be **ASCII without control characters** (an SDP may contain CR / LF): real
  SDP / ICE text is, and a lone surrogate or other unencodable text must never reach the peer's socket encoder. Nothing
  else is ever relayed. The end-of-candidates marker (an empty candidate) is not valid: clients skip it, and a client
  does not end an active call on a single `invalid_signal`.
- Every non-invite frame must name a known `call_id`, come from a participant (the caller's bound socket; the
  callee's sockets while ringing, then only the accepting one) and carry the other participant in `to`; anything else,
  including a foreign or finished call, → `unknown_call` (one answer for all, so call ids reveal nothing).

*Server → client* `{"type":"call","action":...,"call_id",...}`: `invite` (`from`, `from_username`, `media`; stamped by the
server, a client-supplied `from` is ignored), `ringing` (ack to the caller), `accept`, `decline`, `busy`, `unavailable`,
`cancel`, `answered_elsewhere` (`outcome`), `signal` (`from`, `from_username`, `data`), `hangup` (`reason`, and `from`
when the peer ended it). Errors are ordinary `error` frames carrying `call_id`. `hangup` reasons: `hangup` (peer ended),
`timeout` (ringing for **45 s** with no answer: caller and every callee tab), `connection_lost` (a bound socket closed,
the user logged out, the token expired or a push to the socket failed), `disconnected` (unlike or block, B4.4).

*State* (`CallManager`, in memory, one process like the socket registry; same multi-instance caveat as below):
`call_id → {caller, callee, media, state: checking|ringing|active, caller socket, callee socket once accepted}` plus
`user → call`, so a user is in at most one call as either party. Created by `invite`, removed by hangup, decline,
cancel, timeout, a bound socket's disconnect (hook on `PresenceManager.disconnect`, which `send_to_user` failures,
logout's `close_user` and token expiry all go through; the hooks run before the presence UPDATE so the peer hears at once, and
`PresenceManager` push / disconnect never raise: an unencodable payload is dropped without costing the recipient their
socket, a failing UPDATE is logged) and `SocialService.unlike` / `block` (after their transaction
commits, `end_between`). State is removed before anyone is notified, so a notification that drops a slow socket cannot
see a half-removed call; the endpoint's cleanup is shielded from cancellation. Authorisation is checked at `invite` and
`accept`; an active call's frames are authorised by the call state, which unlike / block tear down.
*Limits:* `signal` frames: 120 per 10 s per connection (separate from the 60 per 10 s general limit, so an ICE burst of
20-30 candidates never starves chat), plus per call and side 60 per 10 s and 600 in total. Size: a measured Chromium 156
audio+video offer is **5.4 KB** of SDP (about 5.6 KB as a frame with JSON escaping), an answer 4.7 KB, and a Firefox 157
offer **3.1 KB** (3.4 KB as a frame; all ASCII); the cap for
`signal` frames is 16384 characters (about 3x headroom; the SDP itself is capped at 12000), nothing else may exceed
8192. A frame over 16384 → `frame_too_large`. Safari offers were not measured.

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
- `date_proposed` → invitee; `date_accepted` / `date_declined` → proposer; `date_cancelled` → the other participant
  (from_user = whoever acted); `date_reminder` → both participants (from_user = the other one).
Unlike and block both delete the `connections` row, which is what disables chat (E5.4); a later match restores it.
They also close the pair's dates: **every** pending date (expired ones too) and every accepted date still in the future
become `cancelled` (`DateRepository.cancel_between`, idempotent). `SocialService.unlike` / `block` run the like
and block rows, the connection delete and this cancel in **one transaction**, so a failure leaves everything as it
was (no live date without a connection) and a retry still sends the `unlike` notification; notifications and fame
are recalculated after commit. This is silent: the `unlike`
notification already tells the other user and a block notifies nobody, so no extra `date_cancelled` is sent. Past accepted dates
stay as history (hidden under a block). `date_*` notifications are subject to the same block suppression as any other.

On shutdown the lifespan cancels both background loops and awaits them (`gather(..., return_exceptions=True)`) before closing the pool.

**Date reminders (B5.5).** `main.py` starts `_date_reminder_loop` in the lifespan (cancelled on shutdown), modelled on
`_token_cleanup_loop`: every 60 s it calls `DateService.send_due_reminders()`, and a failed run is logged
(exception class + sqlstate only) and retried on the next tick so the loop never dies. The run claims accepted dates
starting within the next **24 hours** whose pair is still connected and not blocked, at most 200 per statement
(`ORDER BY scheduled_at … LIMIT 200 FOR UPDATE SKIP LOCKED`, up to 5 statements per run), with one `UPDATE … SET reminder_sent_at = now() WHERE
status = 'accepted' AND reminder_sent_at IS NULL … RETURNING`, so a restart or a second loop cannot claim a date twice, then sends
`date_reminder` to both participants. A date accepted less than 24 h ahead is reminded at the next tick.

**Frontend.** `api/client.js` owns the access token and the single-flight refresh; `AuthContext` mirrors it.
`NotificationContext` owns the single socket (opened once per session, keyed on the user id, token read at each
connect) and exposes `connected` (true from `auth_ok`), `subscribe(listener)` and `send(frame)`. `CallContext` (B4) subscribes too. `DatesPanel` (the Dates tab of the Matches page, route `/dates`) subscribes too and reloads (debounced 300 ms, newest response wins) on every `date_*`
notification and on `unlike`, and once after a *re*connect. `ChatContext` subscribes: it appends `message` frames (de-duplicated by id), counts unread per
conversation (`unreadMessages` drives the badges in `BottomNav` and `Header`), shows `error` frames, reloads
conversations on `match`/`unlike` notifications, a `not_connected` error and after a reconnect. A thread's history is requested only once the conversation list is loaded and contains the partner
(no deliberate 403s); a partner missing from a loaded list shows the "no longer connected" state, a failed list
load shows an error with retry instead.

In-memory registry and rate-limit state: correct only within one process. Fine for the Compose/evaluation setup (one
uvicorn process); production (`deploy.yml`) allows up to 2 Cloud Run instances, where users on different instances
would not see each other's presence/pushes. Same caveat for the SlowAPI counters (per instance).

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
cache. The 0.02° cell is ~2.2 km north–south and ~2.2·cos(latitude) km east–west (narrower at high latitudes, e.g.
~1.5 km at 47°N); this holds for browse and the map alike.

**Map privacy (B3.3)** — `GET /profiles/map` reuses the same eligibility and the same snapped position (`_ELIGIBLE`,
`GRID_DEG`). The bounding box is tested against the *snapped* cell centre, and only that centre is returned, so
changing the box (pan/zoom) can reveal at most which 0.02° cell someone is in — never a position inside it. People
in one cell therefore share coordinates; the frontend draws one marker per cell (count badge) and lists the people
in it in the bottom card. The viewer's own exact position (from `GET /profile/get`) is drawn for themself only.

**Score** (default `sort_by=score`), computed in SQL:

```
distance_km  = haversine(viewer, candidate)               -- NULL coords ⇒ ranked last
proximity    = 1 / (1 + distance_km / 10)
shared_norm  = shared_tags / GREATEST(1, viewer_tag_count)
fame_norm    = fame_rating / 100
score        = 0.5 * proximity + 0.3 * shared_norm + 0.2 * fame_norm
```

"Same area first" (subject IV.3) is enforced by ordering, not only by the weight: `sort_by=score` sorts by distance
band first — ≤25 km, ≤100 km, ≤500 km, farther, unknown distance last (`AREA_BANDS_KM`) — and by score within a band,
so shared tags or fame never lift a distant candidate above a nearby one. Explicit sorts (`age`, `distance`, `fame`,
`tags`) replace the score and are not banded; filters apply before sorting. Pagination by `limit`/`offset`.

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
| XSS | React escapes output; no `dangerouslySetInnerHTML`; email templates rendered by Jinja2 with `autoescape` (html/xml) and links built with `urlencode` | ✅ |
| Security headers | API (`main.py` middleware, every response incl. errors): `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Cross-Origin-Resource-Policy: same-site` (the SPA on `localhost:3000` is the same site as the API, so `<img>` photos still load). SPA production image (`frontend/nginx.conf`): CSP `default-src 'self'; script-src 'self'` (the build sets `INLINE_RUNTIME_CHUNK=false`, so no inline script), `style-src 'self' 'unsafe-inline' fonts.googleapis.com` (react-hot-toast injects a `<style>`), `img-src` self/data/blob/API/OSM tiles, `connect-src` self + API http(s)/ws(s) origins (substituted at image build from `REACT_APP_API_URL`/`REACT_APP_WS_URL`), `media-src blob: mediastream:`, `frame-ancestors 'none'`, plus `X-Frame-Options`, `nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` (OSM tiles need a Referer). Dev server (`npm start`): `src/setupProxy.js` adds `X-Frame-Options`, `frame-ancestors 'none'`, `nosniff` only. Vercel (`vercel.json`) sets no headers | ✅ / ⚠️ Vercel |
| Weak passwords | Argon2; zxcvbn score ≥ 2 + length/charset rules | ✅ |
| CSRF | Refresh cookie httpOnly + SameSite=Strict; CORS whitelist | ✅ |
| Brute force | SlowAPI limits on auth routes | ✅ |
| Token replay | Access blacklist on logout; refresh rotation; password reset bumps `users.token_version`, which every JWT carries (`ver`), so all outstanding access/refresh tokens die at once | ✅ |
| Session identity | JWT `sub` = immutable user id (+ `ver`), `refresh_tokens` keyed by `user_id` (FK, cascade): renaming, or taking someone's old username, can never move a session to another account. Old username-based tokens are rejected | ✅ |
| Email verification / account takeover | Tokens are looked up with their type (reset ≠ verify); an email change is pending (`verification_tokens.new_email`) and applied only via the link sent to the new address, with uniqueness re-checked; confirming it spends every other outstanding token (reset links mailed to the old address die); email and username unique ignoring case; every credential check (Bearer, photo cookie, refresh, WS) requires a validated account | ✅ |
| Mail abuse | Per IP (SlowAPI) **and** per account: one reset mail / 2 min (silent, same response), one email-change mail / 2 min and 5 / hour (429); counted from `verification_tokens.created_at` under a row lock on the user | ✅ |
| User text | One validator (`schema/fields.has_unsafe_chars`) for every request text field, chat and dates: no NUL / control characters / lone surrogates (would be a 500 in Postgres), no bidi controls or U+2028/2029; names also no zero-width / format characters; length caps everywhere (login identifier ≤ 254); `birth_date` must give an age of 18–120 | ✅ |
| Request size | `body_size_guard` (`main.py`): non-upload bodies ≤ 64 KB by `Content-Length` (413), chunked bodies refused (411) | ✅ |
| Malicious upload | Type detected from magic bytes (`utils/image.py`), never client `content_type`; ≤5 MB read cap; then decoded and **re-encoded with Pillow** (same format family): header-declared size > 16 MP or any decode error / truncation → 400 (decompression bombs never decoded), EXIF orientation applied then **all metadata dropped** (EXIF incl. GPS, XMP, ICC, text chunks), longest side ≤ 4096, animated images keep their first frame only; only the re-encoded bytes are stored; CPU work in `asyncio.to_thread`, at most 2 decodes at a time per process; all files validated before any is stored; `body_size_guard` (`main.py`) refuses oversized, chunked, anonymous or forged-token upload bodies from the headers before Starlette parses them | ✅ |
| Photo serving | `GET /profile/photo/{key}` sniffs JPEG/PNG/WebP from the stored bytes (anything else 404), ignores object metadata, sends `CSP: default-src 'none'; sandbox`, `nosniff`, `Content-Disposition: inline`. MinIO has no credential defaults in code (startup fails with a clear error if `MINIO_ROOT_USER`/`MINIO_ROOT_PASSWORD` are unset) and Compose publishes MinIO and Postgres on `127.0.0.1` only | ✅ |
| Cookies | Session and OAuth-flow cookies get `Secure` when the API's public URL (`OAUTH_REDIRECT_BASE_URL`, else `REACT_APP_API_URL`) is https, on set and on delete (`config.SECURE_COOKIES`) | ✅ |
| User enumeration | Login answers "Invalid credentials" for both unknown users and wrong passwords and spends the same Argon2 work for an unknown user (dummy hash); forgot-password always answers the same; profile/like/block/report use one 404. **Accepted trade-off:** `/auth/register` (and `PATCH /users/me`) say 409 "Email already registered" / "Username already taken" — needed for a usable sign-up form, rate limited 10/hour per IP | ⚠️ documented |
| Info leakage | `main.py` middleware logs unhandled errors and returns `{"detail":"Internal server error"}`; `/health` returns only `status` (`healthy`/`degraded`/`unhealthy`), database connectivity and `storage.ready` — no versions, hosts or errors | ✅ |
| Secrets | `.env` gitignored | ✅ |
| OAuth login CSRF / session fixation | 256-bit `state` in a stateless HMAC-SHA256-sealed (derived key) httpOnly SameSite=Lax cookie, strict parsing, constant-time compare, 10 min TTL, cleared on every callback; single use = cookie clearing + providers' single-use codes (§6). No server state, so `/start` can't exhaust memory | ✅ |
| OAuth code injection / interception | Code exchanged server-side with the client secret; PKCE S256 (GitHub); `redirect_uri` fixed from config; provider id in the flow must match the callback path (no mix-up) | ✅ |
| OAuth account takeover / pre-hijack | Link by email only when the provider marks it verified **and** the local account is validated; GitHub sign-up only with a verified primary email; 42 addresses never linked, and a new 42 account's link stays inert until our verification email is clicked; identities keyed on the provider's numeric id; one identity per provider per user | ✅ |
| Codes in logs | uvicorn access-log query string redacted for `/auth/oauth/*/callback` (`main.py`); app logs carry only error tags/status codes | ✅ |
| Seed account takeover | Seed users are validated, so their emails use the reserved `matcha-seed[-am].example.org` (RFC 2606) instead of registrable domains; old `.dev` seeds are moved on the next seed run | ✅ |
| Call signalling abuse | Call frames only between connected, unblocked users (checked at invite and accept, call torn down on unlike / block); `from` stamped by the server; only the call's two bound sockets can act on a `call_id` (foreign / unknown ids get one generic error); SDP / ICE validated structurally with size caps, nothing else relayed; separate invite / signal / per-call rate limits; no exception text in frames | ✅ |
| IP exposure through WebRTC | ICE candidates carry each peer's IP addresses (inherent to peer-to-peer media). They are produced and relayed only after the callee **accepts** (the caller creates its offer, and starts gathering, only on `accept`; the callee gathers only when answering), and only between connected, unblocked users. A TURN relay (`TURN_URL`) hides addresses from the peer at the cost of relaying the media through it. The public STUN server sees the user's address too | ⚠️ inherent, documented |
| Per-IP rate limits behind a proxy | uvicorn runs without `--proxy-headers`/`--forwarded-allow-ips`, so behind Cloud Run's front end every client may share one key and per-IP limits collapse into a global one | ⚠️ known gap |
| Same-site assumption | The Strict refresh cookie (session restore, OAuth hand-off) needs SPA and API on one site: true in Compose, false for the vercel.app / run.app production split (§6) | ⚠️ known gap |
| Email change without password | `PATCH /users/me` needs a valid session but not the current password: someone holding a live session could move the account to their mailbox (then reset the password). Mitigated by short access tokens, validated-only sessions and the confirm-by-new-mailbox step | ⚠️ known gap |
| Reset-link churn | Anyone can request a reset for a username every 2 minutes; each new link invalidates the previous one, so a slow user may click a dead link (the newest mail always works) | ⚠️ accepted |
| Refresh-token reuse | Rotation keeps one refresh row per user; replaying an already-rotated refresh token is refused, but it does not revoke the session family (no reuse detection) | ⚠️ known gap |
| Login CSRF | `/auth/login` has no Origin check; a cross-site form can sign a browser into an attacker's account (SameSite=Strict cookies limit what follows) | ⚠️ known gap |
| Public API docs | `/docs` and `/openapi.json` are public (handy for the evaluation; disable in a real deployment) | ⚠️ known gap |
| Seed accounts | Seeded profiles share one password (`scripts/seed_common.py`); never run the seed scripts against a public deployment | ⚠️ known gap |
| Geocoder queue | Nominatim lookups are serialised per process (1 request/s, at most 10 waiting, then 503 "busy"); one client sending uncached cities can keep the queue full and starve everyone's location search for a while (rate limited per IP only) | ⚠️ known gap |
| OAuth open redirect / token leakage | Callback redirects only to the fixed `{FRONTEND_URL}/oauth/callback` with `status`/`error` from a fixed set; tokens only in httpOnly cookies; provider token discarded; provider bodies/codes never logged; `provider` path param checked against a fixed allowlist (404) | ✅ |

**Micro-framework rule (subject §III).** Decision 2026-11-07: keep FastAPI + Pydantic. Defense position: FastAPI is
used as a router + request parser; there is no ORM at runtime (raw SQL in `repository/`), and no user-account
library (auth, tokens, verification, reset and OAuth sign-in are hand-written).

## 11. Frontend

- **Contexts:** `AuthContext` (user + access token), `NotificationContext` (owns the single WS, unread count),
  `ChatContext` (conversations, threads, unread count, chat errors; sends and receives over
  `NotificationContext`'s socket via `send` / `subscribe`), `CallContext` (B4, below).
- **Calls (B4):** `context/CallContext.jsx` is mounted inside `ChatProvider`, so it works on every page, and renders
  the incoming-call modal (`components/calls/IncomingCallModal.jsx`: caller name and photo as text, accept with video /
  audio only / decline; focus-trapped, Escape declines, and focus starts on **Decline** with Accept ignored for the first
  600 ms, so a user typing in the chat is never switched onto a call by a stray Space / Enter; a WebAudio ring only if
  the page has had a user gesture),
  the in-call overlay (`CallOverlay.jsx`: remote `<video>`, muted `playsInline` local preview, mute, camera, hang up,
  timer, status "Connecting… / Reconnecting…", usable at 320 px) and a notice banner (`CallNotice.jsx`, `role=alert`
  for errors). Start buttons (audio / video) are in the chat thread header, only for online partners from the loaded
  conversations list (refreshed every 30 s while a thread is open). One call at a time per tab; the server also allows
  one per user, so a second tab shows "already in a call" and a second ringing tab shows "answered in another tab".
  The microphone / camera are opened **before** the invite is sent (caller) or the `accept` (callee), so a denied or
  missing device (`NotAllowedError`, `NotFoundError`, `NotReadableError`, `OverconstrainedError`, no
  `navigator.mediaDevices` on an insecure page) shows an inline message and the call is never started / is declined
  rather than left ringing; a missing camera falls back to audio only. `getUserMedia` needs a secure context:
  `http://localhost` qualifies, a LAN IP over plain http does not. The caller creates the offer only after `accept`;
  candidates that arrive before the remote description wait; signals are applied in order; one ICE restart (caller) on
  `failed` / persistent `disconnected`, then the call ends; 30 s without connecting ends it. Every end path
  (hang up, decline, timeout, peer gone, socket drop, logout, unmount) stops all tracks, closes the connection and
  clears `srcObject`; `pagehide` sends cancel / hang up. ICE servers come from `GET /chat/ice-servers`
  (`api/chatApi.js`), falling back to the public STUN server.
- **API modules** in `src/api/`: `authApi` (fetch), the rest via `client.js` (axios + 401 → refresh).
- **Dates (B5):** `api/datesApi.js`; the list lives in the **Dates tab of the Matches page** (`/dates` renders
  `MatchesPage` with that tab selected, so there is no 7th tab-bar item): upcoming dates (those waiting for your
  answer first), a lazy "past and closed" history, accept / decline / cancel with inline 403/404/409 messages.
  "Propose a date" is a button in the chat thread header (`components/dates/ProposeDateForm.jsx`), shown only for
  partners in the loaded conversations list. The `datetime-local` value is read in local time and sent as
  `toISOString()` (UTC). Titles/places/notes render as text only. `utils/notificationInfo.js` maps every notification
  type to text and link (unknown types get a generic line); `date_*` notifications link to `/dates`.
- **Account settings:** `pages/profile/ProfileEditPage.jsx` sends only changed name / username / email fields to
  `PATCH /users/me`. The username field shows the server rule (`utils/username.js`, also used by the register form).
  An email change keeps showing the current address and says "Check your new inbox …" with the pending address (also
  after a reload, from `/auth/me`'s `pending_email`).
- **Routing:** `ProtectedRoute` redirects to `/login`; `/profile/setup` for incomplete profiles.
  `/oauth/callback` (public) finishes OAuth sign-in from AuthProvider's page-load refresh; provider buttons
  (`components/auth/OAuthButtons.jsx`) appear on Login/Register only for providers the API reports.
- **Layout:** `Layout.jsx` renders `[BottomNav (side menu ≥860 px / tab bar below) + Header + <main>]` then
  `Footer` as the last row (under the tab bar on mobile, full width on desktop). The landing page `/` draws its
  own header/main/footer; signed-in users visiting `/` are redirected to `/browse`.
- **Photo gallery (B2):** `pages/profile/PhotoGallery.jsx` on the edit page. `ui/PhotoDropZone` (native HTML5 drop
  + click/Enter fallback; type/size/count pre-checks are UX only, the server re-validates), drag-to-reorder with
  left/right buttons for keyboard and touch (`PATCH /profile/photo-order`), and `ui/PhotoEditor`, a modal that
  crops, rotates (90° steps) and filters (grayscale, sepia, brightness, contrast) on a `<canvas>`
  (`utils/photoEdit.js`, no image library) and exports a JPEG (longest side ≤ 2048 px, re-encoded under 5 MB).
  Photos come from another origin, so an existing photo is fetched as a Blob through the API client
  (`fetchPhotoBlob`) rather than drawn from its `<img>` URL, which would taint the canvas. The edited file goes into
  an "upload" tray; an edit of an existing photo is sent as one `POST /profile/upload-photo` with `replaces`, which
  swaps it in atomically on the server (position and profile-picture status carried over, original removed only if
  the copy is saved), so there is no client-side delete/upload sequence and no 5-photo special case. The tray item
  stays for retry if the request fails. `hooks/useBlockFileDrops` cancels stray file drops so the browser never
  navigates to a dropped image.
  `ProfileSetupPage` uses the drop zone for its single photo.
- **Map (B3):** `/map` → `pages/map/MapPage.jsx`, plain Leaflet 1.9 used imperatively in a `useEffect` (created once
  after the viewer's profile loads, `map.remove()` on unmount) with OpenStreetMap tiles
  (`https://tile.openstreetmap.org`, attribution control shown). Users are re-fetched on `moveend`, debounced 300 ms,
  with the previous request aborted; the view is locked to the world (±180°, ±85°, no wrapping). Markers are
  `L.divIcon`s built from DOM nodes (`textContent`, no HTML from user data); the mini profile card is React, rendered
  outside Leaflet, with a button to `/profile/:id`. GPS goes through the shared `LocationPicker` →
  `PATCH /profile/location` (explicit button = consent; denied / unavailable / timeout shown inline). The production
  CSP (`frontend/nginx.conf`, §10) allows `https://tile.openstreetmap.org` and `https://*.tile.openstreetmap.org` in
  `img-src`, and the SPA's `Referrer-Policy` keeps a Referer for the tile servers.
- **Errors:** `components/ErrorBoundary.jsx` wraps the whole app (render errors only — async errors must be
  handled where they occur).
- **Design system:** tokens in `src/index.css` (cream / matcha palette, Playfair Display + DM Sans);
  shared UI in `src/components/ui/`.

## 12. Known gaps

Tracked in `docs/EPICS.md`. Architectural notes only:
- WebSocket registry and rate-limit counters are in-memory per process; production allows 2 Cloud Run
  instances (§7).
- Production splits SPA (vercel.app) and API (run.app) across sites, so the SameSite=Strict refresh cookie is
  never sent there: session restore on reload and the OAuth hand-off need a same-site setup (§6).
- uvicorn has no `--proxy-headers`/`--forwarded-allow-ips`, so behind a proxy per-IP limits collapse (§10).
- No backend test suite yet (EPICS Phase 2).
