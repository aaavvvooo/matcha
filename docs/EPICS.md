# Matcha — Epics & Features

Source of truth: `docs/en.subject_matcha.pdf` (v6.1). Status audited against the codebase on 2026-11-06
(static read of code, not a runtime test). Technical design: `docs/DESIGN.md`.

Legend: ✅ done · ⚠️ partial / broken · ❌ missing

---

## Mandatory

### E1 — Authentication & Account (subject IV.1) — ✅

| Feature | Status | Notes |
|---|---|---|
| Register with email, username, first/last name, password | ✅ | `first_name` + `last_name` (R13) |
| Reject weak / dictionary passwords | ✅ | zxcvbn score ≥ 2 + character rules |
| Email verification link | ✅ | |
| Login with username + password | ✅ | Email also accepted |
| Password reset by email | ✅ | |
| One-click logout from any page | ✅ | In BottomNav; re-verify after E8 header work |
| JWT refresh + token blacklist | ✅ | |

### E2 — User Profile (IV.2) — ✅

| Feature | Status | Notes |
|---|---|---|
| Gender, sexual preference, bio | ✅ | |
| Reusable interest tags | ✅ | |
| Up to 5 photos, one profile picture | ✅ | Content validated by magic bytes (F2) |
| Edit first/last name, email, profile anytime | ✅ | Value sets enforced (R12), first/last name (R13) |
| GPS location with consent, manual city fallback, editable | ✅ | Nominatim geocoding |
| See who viewed my profile | ✅ | |
| See who liked me | ✅ | |
| Public fame rating | ✅ | `min(100, likes·3 + views + connections·5)` |

### E3 — Discovery: Browse & Search (IV.3, IV.4) — ✅

| Feature | Status | Notes |
|---|---|---|
| E3.1 Suggested list filtered by orientation (unset ⇒ bisexual), excluding blocked users | ✅ | `GET /profiles/browse`; mutual interest rule DESIGN §8; liked people skipped |
| E3.2 Ranking: same area first, then shared tags, then fame | ✅ | Haversine + score in SQL |
| E3.3 Sort by age / distance / fame / common tags | ✅ | Server-side `sort_by` + `order` |
| E3.4 Filter by age / distance / fame / tags | ✅ | BrowsePage filter row |
| E3.5 Advanced search: age range, fame range, location, tags; sortable + filterable | ✅ | `GET /profiles/search`; real tag list; city geocoded |

### E4 — Profile View & Interactions (IV.5) — ✅

| Feature | Status | Notes |
|---|---|---|
| View profile without email/password; visit recorded | ✅ | |
| Like (requires profile picture); mutual ⇒ connected | ✅ | |
| Unlike ⇒ disconnect | ✅ | |
| Online status / last connection | ✅ | Presence websocket |
| Report as fake account | ✅ | |
| Block / unblock | ✅ | Exclusion from browse/search/notifications depends on E3, E6 |
| "Liked you" / "connected" indicators | ✅ | |

### E5 — Real-time Chat (IV.6) — ✅

| Feature | Status | Notes |
|---|---|---|
| E5.1 Send/receive messages over WS, connected users only, ≤10 s | ✅ | `/chat/ws` `message` frames → `ChatService.send_message`; error frames, 2000-char cap, per-connection rate limits (DESIGN §7) |
| E5.2 Conversations list + message history | ✅ | `GET /chat/conversations`, `GET /chat/messages/{id}` (`limit`, `before_id`), `POST /chat/messages/{id}/read`; indexes `ix_messages_pair`, `ix_messages_unread` |
| E5.3 New-message indicator on every page | ✅ | `ChatContext.unreadMessages` → badge on the Chat tab (`BottomNav`) and a Messages icon in `Header`; live, cleared when the thread is opened |
| E5.4 Chat disabled after unlike / block | ✅ | Unlike/block delete the connection; sends get `not_connected`, history 403, the thread shows "no longer connected" |

### E6 — Real-time Notifications (IV.7) — ✅

| Feature | Status | Notes |
|---|---|---|
| E6.1 Push to user's WS ≤10 s | ✅ | `PresenceManager.send_to_user()` |
| E6.2 Triggers: like, profile view, message, like-back (match), unlike by connection | ✅ | `NotificationService.notify` from `SocialService` and `ChatService` |
| E6.3 REST: list + mark read | ✅ | `GET /notifications` (`limit`, `offset`), `POST /notifications/read` |
| E6.4 Unread badge on every page | ✅ | `NotificationContext.unreadCount` = server total (`GET /notifications/unread-count`, replaced by each pushed frame's `unread`); live pushes de-duplicated by server id |
| E6.5 Notifications page reachable | ✅ | `/notifications` route (F4) |
| E6.6 No notifications from blocked / unliked users | ✅ | `notify` skips blocked pairs and `message` between non-connected users; list hides blocked senders; unlike clears the connection |

### E7 — Security Hardening (General Instructions, VI.1) — ⚠️ · any breach = 0

| Feature | Status | Notes |
|---|---|---|
| Hashed passwords, parameterised SQL | ✅ | argon2; asyncpg `$n` placeholders |
| No internal details in error responses | ✅ | Error middleware (F1) |
| Upload validation by content (magic bytes), not declared type | ✅ | `utils/image.py` (F2); request-size guard in `main.py` (R2) |
| Logout always ends the session | ✅ | Idempotent `/auth/logout` clears cookies + revokes refresh token even with an expired access token |
| Rate limiting, CORS whitelist, secrets in `.env` (gitignored) | ✅ | |

### E8 — Layout & Platform Compliance (General Instructions) — ⚠️

| Feature | Status | Notes |
|---|---|---|
| Header + main + footer on every page | ✅ | F3 |
| No unhandled errors in console | ⚠️ | ErrorBoundary added (F5); E3/E5/E6 endpoints exist; full console sweep is Phase 5 |
| Mobile-friendly; latest Firefox + Chrome | ⚠️ | Unaudited |
| ≥ 500 profiles in DB | ✅ | `scripts/seed_profiles.py --target 500` |

### Decision — micro-framework rule (2026-11-07)

The subject forbids frameworks that include an ORM, validators, or a user account manager. Queries are raw
SQL (SQLAlchemy is used only for Alembic models); FastAPI ships Pydantic validation. **Decision: keep FastAPI +
Pydantic.** Be ready to justify it at defense: routing + request parsing only, no ORM, hand-written SQL, no
account-manager library.

---

## Bonus (V) — evaluated only if the mandatory part is flawless

All ❌. Each bonus reuses mandatory infrastructure, so its dependencies must be done first.

### B1 — OAuth sign-in · depends on E1

| Feature | Notes |
|---|---|
| B1.1 Provider registration (42 Intra, plus Google or GitHub); credentials in `.env` | |
| B1.2 Authorize redirect + callback with `state` (CSRF) and PKCE | Hand-rolled with `httpx`, not a user-account-manager library |
| B1.3 Account linking: `oauth_accounts` table; create user or link to existing verified email | Never auto-link to an unverified email |
| B1.4 First OAuth login ⇒ generate username, redirect to profile setup | |
| B1.5 Frontend: provider buttons on login/register, callback page | Tokens never placed in URLs |

### B2 — Photo gallery with editing · depends on E2, E7 (magic-byte check)

| Feature | Notes |
|---|---|
| B2.1 Drag-and-drop upload zone (native HTML5 DnD) ✅ | Same 5-photo limit and server validation |
| B2.2 Drag-to-reorder gallery + `PATCH` order endpoint ✅ | Photo order column already exists |
| B2.3 Editor: crop, rotate, filters on `<canvas>`; result uploaded as a new image ✅ | Server re-validates the edited file |

### B3 — Interactive user map · depends on E3

| Feature | Notes |
|---|---|
| B3.1 Precise GPS via browser Geolocation API, with consent | |
| B3.2 Map endpoint: users in a bounding box, same preference + block filters as browse | Reuse E3 query |
| B3.3 Privacy: other users shown at neighbourhood precision (snapped / jittered) | |
| B3.4 Leaflet + OpenStreetMap; marker ⇒ mini profile card ⇒ full profile | |

### B4 — Video / audio chat · depends on E5, E6.1

| Feature | Notes |
|---|---|
| B4.1 WebRTC signalling (offer / answer / ICE) relayed over the existing WS, connected users only | |
| B4.2 Call UI: incoming-call modal, accept / decline, mute, camera toggle, hang up | |
| B4.3 STUN config (TURN optional); graceful handling of denied mic/camera | |
| B4.4 Active call ends on unlike / block | |

### B5 — Date scheduling · depends on E6

| Feature | Notes |
|---|---|
| B5.1 `dates` table: proposer, invitee, title, place, datetime, status | Done — migration `b5d4e7a2c910` |
| B5.2 Propose / accept / decline / cancel, connected users only | Done — `/dates`, atomic transitions; unlike/block cancel future dates |
| B5.3 Notification on every status change | Done — `date_*` types; reuses E6 |
| B5.4 Upcoming-dates list (calendar view optional) | Done — Dates tab on Matches (`/dates`), propose form in chat |
| B5.5 Reminder notification before the date | Done — 24 h window, 60 s loop |

Suggested bonus order (cheapest first, highest reuse): B2 → B3 → B5 → B1 → B4.

---

## Roadmap

Check a story off here when it merges.

### Phase 0 — Docs
- [x] D1 Roadmap (`docs/EPICS.md`)
- [x] D2 `docs/DESIGN.md` re-synced with the code (API, schema, matching rules, real-time plan)
- [x] D3 `CLAUDE.md` agent rules + root `README.md`
- [x] D4 Remove obsolete `docs/SPRINTS.md`, `docs/PRD.md`, `frontend/README.md`

### Phase 1 — Quick fixes (main session, verified with ruff/mypy, frontend build, manual check)
- [x] F1 E7 — replace 14 leaking `Internal server error: {e}` responses with a generic message + server-side log
- [x] F2 E7 — magic-byte validation on photo upload (JPEG / PNG / WebP)
- [x] F3 E8 — render Header + `<main>` + Footer on every page
- [x] F4 E6.5 — add `/notifications` route
- [x] F5 E8 — React error boundary
- [x] F6 E7 — `/profile/set` no longer accepts client photo keys (could delete another user's photo) *(found in review)*

### Phase 1 review follow-ups (security-reviewer + react-reviewer, 2026-11-07) — do before Phase 5

**Done 2026-11-08** (PRs #9, #10). Verified with ruff, mypy, `npm run build` and scripted smoke runs
against a scratch Postgres; no automated test suite (Phase 2 deferred).

- [x] R1 E7 — map `asyncpg.UniqueViolationError` → 409 and FK violations → 400 (register, update_me, second `/profile/set`, unknown tag ids); wrap `update_profile` profile + tag writes in one transaction; `user_repo.update_user` builds `SET` column names with an f-string from `data.keys()` — restrict to a fixed column allowlist
- [x] R2 E7 — upload limits: reject on `Content-Length`, cap file count per request; run blocking storage calls via `asyncio.to_thread`
- [x] R3 E7 — photo cap race (concurrent uploads exceed 5) and orphaned objects when `add_photos` rejects after storage upload
- [x] R4 E7 — repositories `print(e); raise` leak emails to stdout → `logger.exception` or just `raise`
- [x] R5a E7 — `POST /auth/logout` mapped every exception to 400 and kept the refresh cookie when the access token had expired *(fixed in PR #8 review)*
- [x] R5b E1 — register creates the user before checking the email client is configured (503 after the account already exists)
- [x] R6 E6.3 — notifications UI hides failures: initial GET can resolve after `clearUnread` and restore a stale count; failed load shows "no notifications" (`.catch(() => {})`); `clearUnread` clears locally even if `markRead` failed; WS has no `onclose`/reconnect and an empty `catch` in `onmessage`
- [x] R7 E8 — undefined CSS tokens (`--border`, `--surface`, `--text-muted`, `--accent`…) in `styles/global.css`, BrowsePage.css, SearchPage.css
- [x] R8 E8 — landing header overflows at 320 px; mobile landscape leaves ~240 px for content (consider hiding footer at `max-height: 500px`)
- [x] R9 E8 — `minio/minio` image no longer pullable (removed from Docker Hub/Quay) → Compose uses `pgsty/minio:RELEASE.2026-08-04T00-00-00Z`
- [x] R10 E1/E7 — email + logging failures are silent: `clients/email_client.py` catches Brevo `ApiException` and only `print`s (retry in `_send_with_retry` never fires, registration still 200); no `PYTHONUNBUFFERED=1` so `print` never reaches `docker logs`; Alembic startup prints the full DB URL with password (`DEBUGGING: tables`). Brevo also enforces an IP allowlist — allow the defense network's IP (or disable the restriction) and note it in README

### PR #8 review follow-ups (`/ecc:review-pr`, 2026-11-07)
- [x] R11 E7 — pre-existing silent failures: `set_location` turns geocoder outages into 400 "Could not find that location" (no log; should be 502/503); `delete_photos` swallows storage errors with `pass` (private image stays in bucket); `_token_cleanup_loop` dies silently on first DB error; failed `ensure_bucket` is never retried and `/health` still says healthy
- [x] R12 E2 — validate profile value sets: `Gender` / `Orientation` `Literal` types in Set/Update requests + `ProfileResponse` (today `""` passes the `gender IS NOT NULL` completeness check and `"foo"` is accepted); `NotificationType` `Literal`; consider DB CHECK constraints; make `bio`/`birth_date` `Optional`; drop client-settable `user_id` from `SetProfileRequest`
- [x] R13 E1 — **mandatory gap**: split `full_name` into `first_name` + `last_name` (migration with data backfill, register/update/profile schemas, RegisterPage + ProfileEditPage, seed scripts)
- [x] R14 E8 — landing page shows invented stats ("2,847 members", "94% find a match"): derive from DB or remove
- [x] R15 — share one `useLogout()` hook between Header and BottomNav; ErrorBoundary could reuse `components/ui/Btn`

### PR #9–#11 review follow-ups (`/ecc:review-pr`, 2026-11-09)
- [x] R16 E1 — README overstated email retries (4xx are not retried); logs now carry Brevo's error `code` so an un-allowlisted IP (401) is distinguishable from a bad key
- [x] R17 E6/E8 — WebSocket reconnect looped every 1 s once the access token expired: axios refreshes never reached `AuthContext`; refresh is now single-flight in `api/client.js` and synced to React state, a 1008 close triggers one refresh, backoff resets only after a server frame
- [x] R18 E2 — `update_profile` read tags on a second pooled connection inside its transaction (pool exhaustion / tag-cap race): read on `conn` under a profile row lock; storage clients get short timeouts so the photo lock is bounded; cleanup logs carry the object key
- [x] R19 E8 — invalid `transition: <prop> var(--transition-base)` declarations (token is a full shorthand) dropped every hover transition; `.error-msg`/`.success-msg` use tokens; ProfileEditPage shows save errors (shared `api/errors.js`)
- [x] R20 E3 — default `score` sort is banded by distance (≤25/100/500 km) so "same area first" holds; Search pages with "Load more", switches the sort chip only on success; Browse retry resumes after passed cards; tag-load failures shown; blank `location` → 422
- [ ] R21 E2 — legacy rows whose gender the value-set migration NULLed can't finish setup (`/profile/set` is a plain INSERT → 409); fresh seeds unaffected. Fix: upsert when the existing row is incomplete
- [ ] R22 E3 — Browse "shared tags" highlight is never fed (`RightPanel` `myTags`); discovery returns tag names but `/profile/get` returns ids
- [ ] R23 E3 — one process-wide geocoder gate is shared by search and profile location; many unique-city searches can 503 onboarding
- [ ] R24 E1 — `auth_service.refresh` reads then upserts the single refresh row non-atomically: two tabs refreshing with the same cookie → the loser gets 401 and is sent to /login (pre-existing; more likely now that the WebSocket refreshes on 1008). Fix: `UPDATE … WHERE token_hash = $old RETURNING` as the rotation check

### Phase 2 — Test harness — **deferred (2026-11-08)**
Judged not worth the cost before the mandatory features exist; changes are verified with static checks and
scripted smoke runs instead. Revisit only if regressions start costing time.
- [ ] T1 Backend pytest + test Postgres + fixtures (2 users with profiles). `main.py` connects DB/storage in `lifespan` — tests must override it or use a test DB
- [ ] T2 Regression tests, ranked: F6 `/profile/set` ignores `photos`; F2 upload (type from bytes, oversize, all-or-nothing storage, 5-photo cap, `detect_image_type` edge cases incl. `RIFF…WAVE`, `nosniff` header); F1 middleware (generic 500 + CORS header, HTTPException untouched, `/health` body); logout idempotency (expired access + refresh cookie → revoked + cookies cleared); frontend `clearUnread` stable identity, `logout` clears state on API failure, `/` redirect, one banner/main/contentinfo per page
- [ ] T3 Fix frontend test setup: `App.test.js` is the stale CRA default ("learn react") and CRA Jest can't resolve `react-router-dom` v7 → add `moduleNameMapper` or move to Vitest

### Phase 3 — Discovery (track A)
- [x] E3.1–E3.4 `GET /profiles/browse`: orientation filter, blocks, ranking, sort, filter + BrowsePage wiring
- [x] E3.5 `GET /profiles/search` + SearchPage wiring (real tag list)

### Phase 4 — Real-time (track B, parallel with Phase 3)
- [x] E6.1 `PresenceManager.send_to_user()` push
- [x] E6.2 + E6.6 Notification triggers, block / unlike suppression
- [x] E6.3 Notification REST endpoints
- [x] E5.1 + E5.4 Chat messages over WS, connected users only
- [x] E5.2 Conversations + history endpoints
- [x] E5.3 Global new-message indicator

### Phase 5 — Mandatory sign-off
- [ ] E8 Mobile audit (320 / 375 / 768 px), Firefox + Chrome
- [ ] E8 Zero console errors across all pages
- [ ] E7 Full security scan
- [ ] Two-user E2E: register → profile → browse → like → match → chat → notifications ≤10 s
- [ ] Seed ≥500 profiles on the eval database

### Phase 6 — Bonus (only after Phase 5 is fully green)
- [x] **B2 Gallery** — B2.1 drag-and-drop upload · B2.2 drag-to-reorder + order endpoint · B2.3 crop / rotate / filter editor
- [ ] **B3 Map** — B3.1 precise GPS · B3.2 bounding-box endpoint · B3.3 neighbourhood-level privacy · B3.4 Leaflet map + mini cards
- [x] **B5 Dates** — B5.1 `dates` table · B5.2 propose / accept / decline / cancel · B5.3 notifications · B5.4 upcoming list · B5.5 reminder (optional)
- [ ] **B1 OAuth** — B1.1 providers · B1.2 redirect + callback (state, PKCE) · B1.3 account linking · B1.4 first-login setup · B1.5 frontend buttons + callback page
- [ ] **B4 Video / audio** — B4.1 WebRTC signalling over WS · B4.2 call UI · B4.3 STUN + permission errors · B4.4 end call on unlike / block

Parallel-safe tracks: Phase 3 ∥ Phase 4. Within Phase 4, E6.1 must land before chat. Bonus epics are independent of
each other once their dependencies are done, but they all touch shared areas (WS, profile), so run them one at a time.
