# Matcha — Product Requirements Document

**Version:** 1.0  
**Date:** 2026-04-17  
**Project:** 42 School — Matcha Web (v6.1)

---

## 1. Overview

Matcha is a full-stack dating web application. Users register, build profiles, browse algorithmically matched suggestions, like profiles, chat in real time, and receive live notifications — all within a secure, mobile-responsive interface.

### 1.1 Goals

- Enable end-to-end user matching: registration → profile → browse → like → chat.
- Enforce privacy and consent (GDPR-aware GPS handling).
- Score 100% on the 42 peer-evaluation checklist with zero security vulnerabilities.
- Seed the database with ≥500 distinct profiles for evaluation.

### 1.2 Non-Goals

- Native mobile app.
- Monetization / subscription tiers.
- External social graph integrations (bonus OmniAuth is stretch).

---

## 2. User Stories

### Authentication

| ID | Story |
|----|-------|
| A1 | As a new user I can register with email, username, first name, last name, and a strong password. |
| A2 | As a new user I receive a verification email with a unique link; my account is inactive until verified. |
| A3 | As a registered user I can log in with username + password and log out from any page. |
| A4 | As a forgetful user I can request a password-reset email and set a new password via the link. |
| A5 | Weak / dictionary passwords are rejected at registration and reset time. |

### Profile

| ID | Story |
|----|-------|
| P1 | As a logged-in user I can set gender, sexual preference, biography, interest tags, and upload up to 5 photos (one as profile picture). |
| P2 | I can edit any profile field at any time, including first/last name and email. |
| P3 | I can see who has viewed my profile and who has liked me. |
| P4 | My location is detected via browser GPS (with consent) or entered manually (city/neighbourhood). I can change it at any time. |
| P5 | Each profile displays a public "fame rating" computed from likes received, profile views, and mutual connections. |

### Browsing & Search

| ID | Story |
|----|-------|
| B1 | As a user I see a feed of suggested profiles filtered by my sexual preference. |
| B2 | Suggestions are ranked by: geographic proximity → shared tags → fame rating. |
| B3 | I can sort the feed by age, location, fame rating, or number of common tags. |
| B4 | I can filter the feed by age range, location radius, fame rating range, and tags. |
| B5 | Advanced search lets me query any combination of age range, fame rating range, location, and tags — with the same sort/filter options. |

### Profile View & Interactions

| ID | Story |
|----|-------|
| V1 | Viewing a profile records a visit (visible to the profile owner). |
| V2 | I can "like" a profile picture if I have a profile picture myself. |
| V3 | When two users mutually like each other they become "connected" and chat is unlocked. |
| V4 | I can revoke a like; this disables chat with that user and suppresses their future notifications to me. |
| V5 | I can see whether a profile has liked me and whether we are connected. |
| V6 | I can see a user's online status or last-seen timestamp. |
| V7 | I can report a user as a fake account. |
| V8 | I can block a user; they disappear from search/feed and cannot message or notify me. |

### Chat

| ID | Story |
|----|-------|
| C1 | Connected users can exchange real-time messages (≤10 s delivery). |
| C2 | An unread-message badge is visible from every page. |

### Notifications

| ID | Story |
|----|-------|
| N1 | I receive a real-time notification (≤10 s) when: someone likes me, views my profile, messages me, likes me back (match), or unlikes/disconnects from me. |
| N2 | Unread notification count is visible from every page. |

---

## 3. Functional Requirements

### 3.1 Registration & Auth
- Email uniqueness enforced at DB level.
- Password hashed with Argon2 (never stored plain text).
- Password strength checked with zxcvbn; score < 3 rejected.
- JWT access + refresh token flow; tokens blacklisted on logout.
- Verification and reset links are single-use tokens with expiry.

### 3.2 Profile & Photos
- Maximum 5 photos per user; one must be designated profile picture.
- Accepted image types: JPEG, PNG, WEBP. Max size enforced server-side.
- Tags are shared across users (reusable); stored normalised.
- Fame rating formula: `(likes_received * 3) + (profile_views * 1) + (mutual_connections * 5)` — normalised to 0–100.

### 3.3 Location
- GPS via browser Geolocation API (requires explicit user consent).
- Fallback: free-text city entry geocoded to lat/lon.
- Distance calculation uses the Haversine formula.

### 3.4 Matching Algorithm
- Filter by sexual preference compatibility before ranking.
- Rank score: `w1*(1/distance_km) + w2*shared_tags + w3*fame_rating` (weights tunable via config).

### 3.5 Real-Time Features
- WebSocket (or Server-Sent Events) for chat and notifications.
- Presence tracking: a user is "online" while their WebSocket is open; last-seen persisted on disconnect.

### 3.6 Security (mandatory)
- No plain-text passwords.
- All SQL via parameterised queries / SQLAlchemy ORM (no raw string interpolation).
- HTML/JS injection prevention: all user-supplied content escaped on render.
- File upload validation: MIME type + magic bytes check, no executable extensions.
- Rate limiting on auth endpoints (via SlowAPI).
- All secrets in `.env` — never committed.
- CORS restricted to known frontend origin.
- HTTPS enforced in production (Nginx TLS termination).

### 3.7 Data Seeding
- Seed script generates ≥500 distinct profiles with realistic data (faker), varied locations across France, random tags, and hashed passwords.

---

## 4. Non-Functional Requirements

| Category | Requirement |
|----------|-------------|
| Performance | Page load < 2 s on 4G. API response < 300 ms p95. |
| Availability | Single-node Docker Compose; `restart: unless-stopped` on all services. |
| Compatibility | Latest Firefox and Chrome (desktop + mobile viewports). |
| Mobile | Responsive layout (min width 320 px). Header, main, footer structure required. |
| Error handling | No unhandled exceptions. API returns proper HTTP status codes. No stack traces exposed. |
| Accessibility | Semantic HTML; form labels; keyboard-navigable critical flows. |

---

## 5. Bonus Features

Bonuses are evaluated **only if the mandatory part is fully functional and defect-free**.

### B1 — OmniAuth Social Login
- Add OAuth2 sign-in buttons (Google, GitHub, 42 Intranet, etc.) on the login and register pages.
- On first OAuth login, auto-create a user record with a randomly generated strong password.
- Link OAuth identity to an existing account if the email matches.
- Users registered via OAuth can still set a password for username/password login.

### B2 — Personal Photo Gallery with Drag-and-Drop Editing
- Replace the simple upload form with a drag-and-drop zone (react-dropzone or similar).
- After upload, show an in-browser editor: crop (aspect-ratio lock), rotate (90° steps), apply basic filters (grayscale, brightness, contrast).
- Edits applied client-side (canvas API) before uploading the final blob.
- Gallery view: thumbnail grid, reorder by drag-and-drop, one-click set-as-profile-picture.

### B3 — Interactive User Map
- Show matched/discovered users as pins on an interactive map (Leaflet.js recommended).
- Requires higher-precision GPS (browser Geolocation API with `enableHighAccuracy: true`).
- Clicking a pin opens a mini profile card with a link to the full profile.
- Map respects the same block/preference filters as the browse feed.
- Do **not** show exact coordinates — snap to neighbourhood-level grid (~500 m).

### B4 — Video / Audio Chat
- Extend the real-time channel with WebRTC peer-to-peer video/audio for connected users.
- Signalling via the existing WebSocket connection (offer/answer/ICE candidate exchange).
- UI: "Start Video Call" button on the chat page; recipient sees an incoming-call modal.
- Graceful fallback to text chat if WebRTC is not supported or user declines.

### B5 — Schedule Real-Life Dates / Events
- Connected users can propose a date: title, description, location (address + map pin), date-time.
- The other user can accept, decline, or propose a counter-time.
- Calendar view showing upcoming dates for the current user.
- Reminder notification 1 hour before a scheduled date (server-side task).

---

## 6. Out of Scope

- Native mobile app.
- Monetization / subscription tiers.
- Push notifications via FCM/APNs (web notifications only).

---

## 6. Acceptance Criteria (Peer Eval Checklist)

- [ ] Registration, email verification, login, logout, password reset all function.
- [ ] Profile creation and editing (all fields, photo upload) works.
- [ ] Profile view/like history visible to profile owner.
- [ ] Browsing feed respects sexual preference; sortable and filterable.
- [ ] Advanced search with all four criteria works.
- [ ] Viewing a profile records a visit.
- [ ] Like / unlike / match / unmatch flow correct; chat enabled only on match.
- [ ] Report and block features work; blocked users invisible.
- [ ] Real-time chat with ≤10 s latency.
- [ ] Real-time notifications for all five events with ≤10 s latency.
- [ ] No plain-text passwords, no SQL injection, no XSS, no unauthorised file uploads.
- [ ] Database contains ≥500 seeded profiles.
- [ ] No unhandled errors in browser console or server logs.
