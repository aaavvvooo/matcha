# Matcha — Epics & Features

Source of truth: `docs/en.subject_matcha.pdf` (v6.1). Status audited against the codebase on 2026-11-06
(static read of code, not a runtime test). Technical design: `docs/DESIGN.md`.

Legend: ✅ done · ⚠️ partial / broken · ❌ missing

---

## Mandatory

### E1 — Authentication & Account (subject IV.1) — ✅

| Feature | Status | Notes |
|---|---|---|
| Register with email, username, first/last name, password | ✅ | |
| Reject weak / dictionary passwords | ✅ | zxcvbn score ≥ 2 + character rules |
| Email verification link | ✅ | |
| Login with username + password | ✅ | Email also accepted |
| Password reset by email | ✅ | |
| One-click logout from any page | ✅ | In BottomNav; re-verify after E8 header work |
| JWT refresh + token blacklist | ✅ | |

### E2 — User Profile (IV.2) — ✅ (one gap)

| Feature | Status | Notes |
|---|---|---|
| Gender, sexual preference, bio | ✅ | |
| Reusable interest tags | ✅ | |
| Up to 5 photos, one profile picture | ⚠️ | Works; upload trusts client `content_type` → fixed in E7 |
| Edit first/last name, email, profile anytime | ✅ | Email change re-sends verification |
| GPS location with consent, manual city fallback, editable | ✅ | Nominatim geocoding |
| See who viewed my profile | ✅ | |
| See who liked me | ✅ | |
| Public fame rating | ✅ | `min(100, likes·3 + views + connections·5)` |

### E3 — Discovery: Browse & Search (IV.3, IV.4) — ❌ backend missing · **top priority**

| Feature | Status | Notes |
|---|---|---|
| E3.1 Suggested list filtered by orientation (unset ⇒ bisexual), excluding blocked users | ❌ | `BrowsePage` calls `GET /profiles/browse` — no such route |
| E3.2 Ranking: same area first, then shared tags, then fame | ❌ | Haversine in SQL |
| E3.3 Sort by age / distance / fame / common tags | ❌ | |
| E3.4 Filter by age / distance / fame / tags | ❌ | |
| E3.5 Advanced search: age range, fame range, location, tags; sortable + filterable | ❌ | `SearchPage` calls `GET /profiles/search` — no such route; uses hardcoded tag list instead of `/profile/get-all-tags` |

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

### E5 — Real-time Chat (IV.6) — ❌ backend missing · depends on E6.1

| Feature | Status | Notes |
|---|---|---|
| E5.1 Send/receive messages over WS, connected users only, ≤10 s | ❌ | `/chat/ws` handles presence only; `messages` table exists |
| E5.2 Conversations list + message history | ❌ | Frontend calls `/chat/conversations`, `/chat/messages/:id` |
| E5.3 New-message indicator on every page | ❌ | `ChatContext.receiveMessage` never wired to WS |
| E5.4 Chat disabled after unlike / block | ❌ | |

### E6 — Real-time Notifications (IV.7) — ❌ backend missing

| Feature | Status | Notes |
|---|---|---|
| E6.1 Push to user's WS ≤10 s | ❌ | Add `send_to_user()` to `PresenceManager` (already tracks sockets) |
| E6.2 Triggers: like, profile view, message, like-back (match), unlike by connection | ❌ | `create_notification` exists in repo, never called |
| E6.3 REST: list + mark read | ❌ | Frontend calls `GET /notifications`, `POST /notifications/read` |
| E6.4 Unread badge on every page | ⚠️ | UI ready, waiting on backend |
| E6.5 Notifications page reachable | ⚠️ | `NotificationsPage` has no route |
| E6.6 No notifications from blocked / unliked users | ❌ | |

### E7 — Security Hardening (General Instructions, VI.1) — ⚠️ · any breach = 0

| Feature | Status | Notes |
|---|---|---|
| Hashed passwords, parameterised SQL | ✅ | argon2; asyncpg `$n` placeholders |
| No internal details in error responses | ❌ | 14× `detail=f"Internal server error: {e}"` |
| Upload validation by content (magic bytes), not declared type | ❌ | Only client `content_type` checked |
| Rate limiting, CORS whitelist, secrets in `.env` (gitignored) | ✅ | |

### E8 — Layout & Platform Compliance (General Instructions) — ⚠️

| Feature | Status | Notes |
|---|---|---|
| Header + main + footer on every page | ❌ | `Header.jsx` / `Footer.jsx` exist but are never rendered |
| No unhandled errors in console | ⚠️ | No React error boundary; missing endpoints cause 404s |
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
| B2.1 Drag-and-drop upload zone (native HTML5 DnD) | Same 5-photo limit and server validation |
| B2.2 Drag-to-reorder gallery + `PATCH` order endpoint | Photo order column already exists |
| B2.3 Editor: crop, rotate, filters on `<canvas>`; result uploaded as a new image | Server re-validates the edited file |

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
| B5.1 `dates` table: proposer, invitee, title, place, datetime, status | |
| B5.2 Propose / accept / decline / cancel, connected users only | |
| B5.3 Notification on every status change | Reuse E6 |
| B5.4 Upcoming-dates list (calendar view optional) | |
| B5.5 Reminder notification before the date | Optional |

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
- [ ] F1 E7 — replace 14 leaking `Internal server error: {e}` responses with a generic message + server-side log
- [ ] F2 E7 — magic-byte validation on photo upload (JPEG / PNG / WebP)
- [ ] F3 E8 — render Header + `<main>` + Footer on every page
- [ ] F4 E6.5 — add `/notifications` route
- [ ] F5 E8 — React error boundary

### Phase 2 — Test harness (`/ecc:orch-add-feature`)
- [ ] T1 Backend pytest + test Postgres + fixtures (2 users with profiles)
- [ ] T2 Regression tests for F1 and F2

### Phase 3 — Discovery (track A)
- [ ] E3.1–E3.4 `GET /profiles/browse`: orientation filter, blocks, ranking, sort, filter + BrowsePage wiring
- [ ] E3.5 `GET /profiles/search` + SearchPage wiring (real tag list)

### Phase 4 — Real-time (track B, parallel with Phase 3)
- [ ] E6.1 `PresenceManager.send_to_user()` push
- [ ] E6.2 + E6.6 Notification triggers, block / unlike suppression
- [ ] E6.3 Notification REST endpoints
- [ ] E5.1 + E5.4 Chat messages over WS, connected users only
- [ ] E5.2 Conversations + history endpoints
- [ ] E5.3 Global new-message indicator

### Phase 5 — Mandatory sign-off
- [ ] E8 Mobile audit (320 / 375 / 768 px), Firefox + Chrome
- [ ] E8 Zero console errors across all pages
- [ ] E7 Full security scan
- [ ] Two-user E2E: register → profile → browse → like → match → chat → notifications ≤10 s
- [ ] Seed ≥500 profiles on the eval database

### Phase 6 — Bonus (only after Phase 5 is fully green)
- [ ] **B2 Gallery** — B2.1 drag-and-drop upload · B2.2 drag-to-reorder + order endpoint · B2.3 crop / rotate / filter editor
- [ ] **B3 Map** — B3.1 precise GPS · B3.2 bounding-box endpoint · B3.3 neighbourhood-level privacy · B3.4 Leaflet map + mini cards
- [ ] **B5 Dates** — B5.1 `dates` table · B5.2 propose / accept / decline / cancel · B5.3 notifications · B5.4 upcoming list · B5.5 reminder (optional)
- [ ] **B1 OAuth** — B1.1 providers · B1.2 redirect + callback (state, PKCE) · B1.3 account linking · B1.4 first-login setup · B1.5 frontend buttons + callback page
- [ ] **B4 Video / audio** — B4.1 WebRTC signalling over WS · B4.2 call UI · B4.3 STUN + permission errors · B4.4 end call on unlike / block

Parallel-safe tracks: Phase 3 ∥ Phase 4. Within Phase 4, E6.1 must land before chat. Bonus epics are independent of
each other once their dependencies are done, but they all touch shared areas (WS, profile), so run them one at a time.
