# Matcha — Sprint Plan

**Generated:** 2026-04-17  
**Branch:** refactor-redis-migration

---

## Audit Summary

| Area | Backend | Frontend |
|------|---------|----------|
| Auth (register / login / verify / reset) | ✅ Done | ✅ Done |
| JWT refresh + token blacklist | ✅ Done | ✅ Done (interceptor) |
| DB models (user, profile, photo, tags) | ✅ Done | — |
| Location fields (lat/lon) | ❌ Missing | — |
| Profile CRUD endpoints | ❌ Missing | ⚠️ UI exists, not wired |
| Photo upload / delete / set-main | ❌ Missing | ⚠️ UI exists, not wired |
| Tags endpoints | ❌ Missing | ⚠️ UI exists, not wired |
| Browse / feed (filter + rank) | ❌ Missing | ❌ Missing |
| Advanced search | ❌ Missing | ❌ Missing |
| Likes / unlike | ❌ Missing | ❌ Missing |
| Profile view tracking | ❌ Missing | ❌ Missing |
| Block / report | ❌ Missing | ❌ Missing |
| Connections (mutual like) | ❌ Missing | ❌ Missing |
| Online status / last-seen | ❌ Missing | ❌ Missing |
| Fame rating calculation | ❌ Missing (field only) | ❌ Missing |
| Real-time chat (WebSocket) | ❌ Missing | ❌ Missing |
| Notifications (WebSocket) | ❌ Missing | ❌ Missing |
| Global notification badge | — | ❌ Missing |
| Seed script (≥500 profiles) | ❌ Missing | — |

---

## Sprint 1 — Profile Core  
**Goal:** A logged-in user can fully build their profile.

### Backend tasks
- [ ] Add `latitude`, `longitude`, `location_label` columns to `user_profiles` via Alembic migration
- [ ] `GET /api/profiles/me` — return full profile for current user
- [ ] `PUT /api/profiles/me` — update gender, sexual_preference, bio, location, tags (upsert user_tags)
- [ ] `GET /api/tags` — list all available tags (for autocomplete)
- [ ] `POST /api/photos/` — upload photo (multipart), MIME + magic-bytes validation, max 5 per user
- [ ] `DELETE /api/photos/{id}` — delete photo (own only)
- [ ] `PATCH /api/photos/{id}/set-profile` — set as profile picture (requires photo exists and user has it)
- [ ] Enforce: user cannot like others until they have a profile picture
- [ ] Add `online_status` boolean + `last_seen` timestamp to `users` table

### Frontend tasks
- [ ] Wire `ProfileSetupPage` and `ProfileEditPage` to `PUT /api/profiles/me`
- [ ] Wire photo upload/delete/set-main in edit page to new photo endpoints
- [ ] Tag input: fetch from `GET /api/tags`, allow free-text creation
- [ ] GPS consent prompt → store lat/lon; fallback to manual city input
- [ ] `profileApi.js` — create API module for profiles, photos, tags

### Definition of Done
- User can set all profile fields, upload photos, set profile picture, and update location.

---

## Sprint 2 — Browse, Search & Interactions  
**Goal:** Users can discover each other and interact.

### Backend tasks
- [ ] Create `likes` table + Alembic migration
- [ ] Create `profile_views` table + Alembic migration
- [ ] Create `blocks` table + Alembic migration
- [ ] Create `reports` table + Alembic migration
- [ ] Create `connections` table + Alembic migration
- [ ] `GET /api/profiles/browse` — paginated feed filtered by sexual preference + blocks; ranked by proximity / shared tags / fame rating (Haversine distance)
  - Query params: `sort_by`, `order`, `min_age`, `max_age`, `max_distance_km`, `min_fame`, `max_fame`, `tags`
- [ ] `GET /api/profiles/search` — same filters but user-driven (not ranked)
- [ ] `GET /api/users/{id}` — public profile view (no email/password); record visit
- [ ] `POST /api/users/{id}/like` — like; if mutual → insert connection row
- [ ] `DELETE /api/users/{id}/like` — unlike; delete connection if exists
- [ ] `POST /api/users/{id}/block` — block; remove any existing connection/like
- [ ] `POST /api/users/{id}/report` — report fake account
- [ ] `GET /api/users/me/views` — list users who viewed my profile
- [ ] `GET /api/users/me/likes` — list users who liked me
- [ ] Fame rating service: `calculate_fame(user_id)` = `min(100, likes*3 + views*1 + connections*5)`; call on like/unlike/view/connect events

### Frontend tasks
- [ ] `BrowsePage` — card feed with sort/filter bar, like button, load more
- [ ] `SearchPage` — advanced filter form + results list
- [ ] `PublicProfilePage` — view another user's profile; show online/last-seen, like/unlike button, connected status, block/report actions
- [ ] `ProfileViewersPage` — wire to `GET /api/users/me/views`
- [ ] `LikedByPage` — wire to `GET /api/users/me/likes`
- [ ] `interactionsApi.js` — like, unlike, block, report, views, likes-received

### Definition of Done
- Full discover → view → like → match flow works end-to-end.

---

## Sprint 3 — Real-Time: Chat & Notifications  
**Goal:** Connected users can chat; all users get live notifications.

### Backend tasks
- [ ] Create `messages` table + Alembic migration
- [ ] Create `notifications` table + Alembic migration
- [ ] WebSocket endpoint `GET /api/ws/{token}` — auth via token, register connection in in-memory registry
- [ ] Message dispatch: on WS message `{type:"message", to, body}` → validate connection → persist → push to recipient if online
- [ ] Notification dispatch helper: on any trigger event → persist notification row → push to recipient WS if online
- [ ] Trigger notifications for: like received, profile viewed, message received, match (mutual like), unlike/disconnect
- [ ] `GET /api/chat/conversations` — list conversations (last message + unread count per contact)
- [ ] `GET /api/chat/messages/{user_id}` — paginated message history
- [ ] `PATCH /api/chat/messages/{user_id}/read` — mark messages as read
- [ ] `GET /api/notifications` — list notifications (paginated)
- [ ] `PATCH /api/notifications/read` — mark all as read
- [ ] Online status: set `is_online=true` on WS connect, `is_online=false` + `last_seen=now()` on disconnect

### Frontend tasks
- [ ] `NotificationContext` — open WS on login, dispatch incoming events, expose `unreadCount`
- [ ] Global notification badge in header/navbar (all pages) — subscribe to `NotificationContext`
- [ ] `ChatPage` — conversation list sidebar + message thread; send via WS; poll fallback
- [ ] `NotificationsPage` — full list with mark-as-read
- [ ] `chatApi.js` / `notificationsApi.js` — REST calls for history, mark-read

### Definition of Done
- Two connected users can chat in real time. All 5 notification events fire and show the badge.

---

## Sprint 4 — Polish, Security & Seed  
**Goal:** Production-ready: no security holes, data seeded, full eval checklist green.

### Backend tasks
- [ ] **Seed script** `backend/scripts/seed.py` — generate ≥500 profiles with faker; realistic French locations; varied tags; hashed passwords; at least some mutual likes for testing
- [ ] Validate file uploads: MIME type header + magic bytes (first 8 bytes), reject non-image types
- [ ] Rate-limit hardening: confirm SlowAPI covers `/login`, `/register`, `/forgot-password`
- [ ] CORS: ensure only known frontend origin(s) are whitelisted
- [ ] Ensure all SQL uses parameterised queries (audit for any f-string SQL)
- [ ] Input sanitisation: strip HTML from bio, tags, location label fields
- [ ] Verify token blacklist is checked on every protected route
- [ ] Add `password strength` error to reset-password endpoint (same zxcvbn check as register)
- [ ] HTTP error responses: never expose stack traces; structured `{ detail: "..." }` only
- [ ] Fix: blocked users must be excluded from browse, search, and notifications
- [ ] Fix: user without profile picture cannot like others (enforce server-side)

### Frontend tasks
- [ ] Form validation on all forms (client-side before submit)
- [ ] Global error boundary — catch unhandled JS errors gracefully
- [ ] Mobile layout audit — test all pages at 320 px, 375 px, 768 px
- [ ] Header / main / footer structure on every page (required by subject)
- [ ] Display proper error messages from API (not raw JSON)
- [ ] Show fame rating on profile cards + profile views
- [ ] Confirm "unlike" / "disconnect" states are visually clear

### Definition of Done
- Full peer-eval checklist passes. No console errors. No security vulnerabilities. 500+ seed profiles visible in browse.

---

## Sprint 5 — Bonuses (only if Sprint 1–4 are complete and defect-free)

| Bonus | Tasks |
|-------|-------|
| **B1 OmniAuth** | Add OAuth2 button (Google / GitHub / 42). Backend: exchange code → create/link user. Frontend: OAuth redirect flow. |
| **B2 Photo gallery** | Replace upload form with react-dropzone. Add canvas-based crop/rotate/filter editor. Drag-to-reorder gallery. |
| **B3 Interactive map** | Leaflet.js map showing matched users as pins (neighbourhood-snapped). Clicking pin → mini profile card. |
| **B4 Video/Audio chat** | WebRTC peer connection signalled via existing WS. Offer/answer/ICE flow. Incoming call modal. |
| **B5 Date scheduling** | Propose/accept/decline date (title, location, datetime). Calendar view. Server-side reminder notification 1 h before. |

---

## Priority Order (if time is limited)

1. Sprint 1 — Profile is the foundation; nothing else works without it.
2. Sprint 4 Seed script — needed early for manual testing.
3. Sprint 2 — Core matching loop is what gets evaluated first.
4. Sprint 3 — Real-time features; highest complexity.
5. Sprint 4 remaining — Security/polish before defense.
6. Sprint 5 — Only after everything above.
