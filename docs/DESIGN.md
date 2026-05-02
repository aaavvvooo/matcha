# Matcha — Technical Design Document

**Version:** 1.0  
**Date:** 2026-04-17

---

## 1. Architecture Overview

```
┌──────────────┐   HTTP/WS    ┌──────────────────┐   asyncpg   ┌──────────────┐
│  React SPA   │ ◄──────────► │  FastAPI backend  │ ◄─────────► │  PostgreSQL  │
│  (port 3000) │              │   (port 8000)     │             │  (port 5432) │
└──────────────┘              └──────────────────┘             └──────────────┘
       │                               │
       │                        ┌──────┴──────┐
       └── Nginx (prod) ──────► │  .env secrets│
                                └─────────────┘
```

All three services run as Docker containers orchestrated by `docker-compose.yaml`. In production the React build is served by Nginx, which also terminates TLS and reverse-proxies to the FastAPI backend.

---

## 2. Technology Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Frontend | React 19 + React Router 7 | CRA toolchain; fast iteration |
| Backend | FastAPI (Python 3.13) | Async-native, auto OpenAPI docs, type-safe with Pydantic |
| Database | PostgreSQL 17 | Relational, mature geospatial support |
| ORM / queries | SQLAlchemy 2 async + raw SQL where needed | Prevents SQL injection; migrations via Alembic |
| Auth | JWT (python-jose) + Argon2 (passlib) | Industry standard; Argon2 for password hashing |
| Password strength | zxcvbn | Rejects dictionary passwords |
| Real-time | WebSockets (FastAPI native) | Low-latency chat + notifications |
| Email | Brevo (sib-api-v3-sdk) | Transactional email for verification/reset |
| Rate limiting | SlowAPI | Protects auth endpoints |
| Containerisation | Docker + Docker Compose | Reproducible dev + prod environment |

---

## 3. Directory Structure

```
matcha/
├── backend/
│   ├── application/
│   │   ├── api/
│   │   │   ├── endpoints/      # auth, photos, tags, users, profiles
│   │   │   └── router.py
│   │   ├── models/             # SQLAlchemy ORM models
│   │   ├── repository/         # DB query functions
│   │   ├── schema/             # Pydantic request/response schemas
│   │   ├── service/            # Business logic layer
│   │   ├── tasks/              # Background tasks (email)
│   │   ├── clients/            # External service clients (email provider)
│   │   ├── utils/              # Helpers (hashing, JWT, geolocation)
│   │   ├── templates/          # Jinja2 email templates
│   │   ├── config.py           # Settings from .env via pydantic-settings
│   │   ├── database.py         # Async engine + session factory
│   │   └── main.py             # App factory, middleware, lifespan
│   ├── alembic/                # DB migrations
│   └── pyproject.toml
├── frontend/
│   └── src/
│       ├── pages/
│       │   ├── auth/           # Login, Register, Verify, Reset
│       │   ├── home/           # Browse feed
│       │   └── profile/        # View/edit profile, search
│       ├── components/         # Shared UI components
│       ├── context/            # React context (auth state, WS, notifications)
│       ├── api/                # Axios/fetch wrapper per resource
│       └── routes/             # Protected/public route guards
├── docs/
└── docker-compose.yaml
```

---

## 4. Database Schema

### Core Tables

```sql
users
  id            SERIAL PK
  username      VARCHAR(50)  UNIQUE NOT NULL
  email         VARCHAR(255) UNIQUE NOT NULL
  password_hash TEXT         NOT NULL
  first_name    VARCHAR(100)
  last_name     VARCHAR(100)
  is_verified   BOOLEAN      DEFAULT false
  is_online     BOOLEAN      DEFAULT false
  last_seen     TIMESTAMPTZ
  fame_rating   FLOAT        DEFAULT 0
  created_at    TIMESTAMPTZ  DEFAULT now()

user_profiles
  id               SERIAL PK
  user_id          INT FK → users.id UNIQUE
  gender           VARCHAR(20)         -- male | female | non-binary | other
  sexual_preference VARCHAR(20)        -- male | female | both (default both)
  biography        TEXT
  latitude         FLOAT
  longitude        FLOAT
  location_label   VARCHAR(255)        -- human-readable city/neighbourhood
  profile_photo_id INT FK → photos.id NULLABLE

photos
  id          SERIAL PK
  user_id     INT FK → users.id
  url         TEXT NOT NULL
  is_profile  BOOLEAN DEFAULT false
  uploaded_at TIMESTAMPTZ DEFAULT now()

tags
  id   SERIAL PK
  name VARCHAR(50) UNIQUE NOT NULL

user_tags
  user_id INT FK → users.id
  tag_id  INT FK → tags.id
  PRIMARY KEY (user_id, tag_id)

likes
  liker_id  INT FK → users.id
  liked_id  INT FK → users.id
  created_at TIMESTAMPTZ DEFAULT now()
  PRIMARY KEY (liker_id, liked_id)

profile_views
  viewer_id  INT FK → users.id
  viewed_id  INT FK → users.id
  viewed_at  TIMESTAMPTZ DEFAULT now()

connections
  user_a_id  INT FK → users.id
  user_b_id  INT FK → users.id
  created_at TIMESTAMPTZ DEFAULT now()
  PRIMARY KEY (user_a_id, user_b_id)
  CONSTRAINT ordered CHECK (user_a_id < user_b_id)

messages
  id          SERIAL PK
  sender_id   INT FK → users.id
  receiver_id INT FK → users.id
  body        TEXT NOT NULL
  is_read     BOOLEAN DEFAULT false
  sent_at     TIMESTAMPTZ DEFAULT now()

notifications
  id          SERIAL PK
  user_id     INT FK → users.id
  type        VARCHAR(50)   -- like | view | message | match | unlike
  from_user   INT FK → users.id NULLABLE
  is_read     BOOLEAN DEFAULT false
  created_at  TIMESTAMPTZ DEFAULT now()

blocks
  blocker_id INT FK → users.id
  blocked_id INT FK → users.id
  PRIMARY KEY (blocker_id, blocked_id)

reports
  reporter_id INT FK → users.id
  reported_id INT FK → users.id
  created_at  TIMESTAMPTZ DEFAULT now()

verification_tokens
  id         SERIAL PK
  user_id    INT FK → users.id
  token      VARCHAR(255) UNIQUE NOT NULL
  expires_at TIMESTAMPTZ NOT NULL
  used       BOOLEAN DEFAULT false

refresh_tokens
  id         SERIAL PK
  user_id    INT FK → users.id
  token      TEXT UNIQUE NOT NULL
  expires_at TIMESTAMPTZ NOT NULL

token_blacklist
  jti        VARCHAR(255) PK
  expires_at TIMESTAMPTZ NOT NULL
```

---

## 5. API Endpoints

### Auth  (`/api/auth`)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/register` | Create account, send verification email |
| POST | `/verify-email` | Activate account using token in request body |
| POST | `/login` | Return access + refresh JWT |
| POST | `/logout` | Blacklist access token |
| POST | `/refresh` | Rotate refresh token |
| POST | `/forget-password` | Send reset email |
| POST | `/reset-password` | Set new password using token in request body |

### Users (`/api/users`)
| Method | Path | Description |
|--------|------|-------------|
| GET  | `/me` | Current user info |
| PATCH | `/me` | Update name/email |
| GET  | `/{id}` | Public profile (no email/password) |
| GET  | `/{id}/views` | Who viewed my profile |
| GET  | `/{id}/likes` | Who liked me |
| POST | `/{id}/like` | Like a user |
| DELETE | `/{id}/like` | Unlike a user |
| POST | `/{id}/block` | Block a user |
| POST | `/{id}/report` | Report fake account |

### Profiles (`/api/profiles`)
| Method | Path | Description |
|--------|------|-------------|
| GET  | `/me` | Get own profile details |
| PUT  | `/me` | Update profile (gender, pref, bio, location, tags) |
| GET  | `/browse` | Suggested profiles feed |
| GET  | `/search` | Advanced search with query params |

### Photos (`/api/photos`)
| Method | Path | Description |
|--------|------|-------------|
| POST | `/` | Upload photo (multipart/form-data) |
| DELETE | `/{id}` | Delete photo |
| PATCH | `/{id}/set-profile` | Set as profile picture |

### Chat (`/api/chat` + WebSocket)
| Method | Path | Description |
|--------|------|-------------|
| GET  | `/conversations` | List active conversations |
| GET  | `/messages/{user_id}` | Message history with a user |
| WS   | `/ws/{token}` | Real-time message + notification stream |

---

## 6. Authentication Flow

```
Register → (email sent) → GET /verify/{token} → account active
Login → POST /login → { access_token (15 min), refresh_token (7 days) }
  → every request: Authorization: Bearer <access_token>
  → access expired → POST /refresh → new access_token
  → logout → POST /logout → jti added to token_blacklist
```

- Access tokens: short-lived (15 min), stateless JWT.
- Refresh tokens: stored in DB; rotated on use; revocable.
- Blacklist: checked on every request for logged-out tokens; expired entries purged by background task.

---

## 7. Real-Time Design

A single WebSocket endpoint `/api/chat/ws/{token}` serves both chat messages and notifications:

```
Client connects with JWT in path/query
Server authenticates token → registers connection in in-memory registry
  { user_id → WebSocket }

Incoming message:
  { type: "message", to: <user_id>, body: "..." }
  → validate connected state → persist to messages table
  → push { type: "message", from, body, sent_at } to recipient if online
  → create notification row for recipient

Server-side events (likes, views, matches, unlikes):
  → create notification row
  → if recipient online: push { type: "notification", event, from_user }
  → if not: badge shown on next login

Disconnect:
  → update users.is_online = false, last_seen = now()
```

---

## 8. Matching Algorithm

```python
def score(candidate, viewer):
    distance_km = haversine(viewer.lat, viewer.lon, candidate.lat, candidate.lon)
    proximity   = 1 / (1 + distance_km)            # 0–1, higher = closer
    shared_tags = len(viewer.tags & candidate.tags)
    fame        = candidate.fame_rating / 100       # normalised 0–1
    return 0.5 * proximity + 0.3 * shared_tags_norm + 0.2 * fame
```

- `shared_tags_norm` = `shared_tags / max(1, max_possible_shared)`
- Result sorted descending; pagination via `limit`/`offset`.
- Pre-filter: remove blocked users, unmatched orientations, already-connected profiles.

---

## 9. Fame Rating

Recalculated on every relevant event:

```
fame_rating = min(100, (likes_received * 3) + (profile_views * 1) + (active_connections * 5))
```

Stored on `users.fame_rating` and refreshed asynchronously (background task triggered on like/view/connect/disconnect events).

---

## 10. Security Measures

| Threat | Mitigation |
|--------|-----------|
| SQL injection | SQLAlchemy parameterised queries throughout |
| XSS | React escapes by default; backend strips HTML in text fields |
| Password cracking | Argon2id hashing (passlib); zxcvbn score ≥ 3 required |
| CSRF | SameSite=Lax cookies for refresh token; CORS whitelist |
| Brute-force | SlowAPI: 5 req/min on `/login`, `/forgot-password` |
| Malicious uploads | MIME + magic-bytes validation; random filename; no exec permission |
| Token replay | Access token blacklist; refresh token single-use rotation |
| Info leakage | No stack traces in responses; structured error bodies only |
| Secrets | `.env` excluded from Git; loaded via pydantic-settings |

---

## 11. Frontend Architecture

- **State management:** React Context — `AuthContext` (user + tokens), `NotificationContext` (unread count + WS), `ChatContext` (active conversations).
- **Routing:** React Router 7 with `PrivateRoute` wrapper that redirects unauthenticated users to `/login`.
- **API layer:** thin fetch wrappers per domain (auth, users, profiles, photos, chat) that attach the Bearer token and handle 401 → refresh flow.
- **Notifications badge:** global component in App.jsx subscribed to `NotificationContext`, visible on all pages.
- **Responsive layout:** CSS flexbox/grid; breakpoint at 768 px; header / main / footer structure enforced.

---

## 12. Deployment (Docker Compose)

```
postgres   ← healthcheck before backend starts
backend    ← uvicorn, mounts ./backend as volume for hot reload
frontend   ← Nginx serves React build, proxies /api/* to backend:8000
```

Production additions (outside project scope but noted):
- Nginx TLS with Let's Encrypt.
- `DATABASE_URL` uses SSL mode.
- Static files and uploads on a named volume.

---

## 13. Open Items / Known Gaps

| # | Item | Priority |
|---|------|----------|
| 1 | WebSocket registry is in-memory — not multi-process safe. Acceptable for single-node eval. | Low |
| 2 | Seed script (≥500 profiles) not yet implemented. | **High** |
| 3 | Fame rating background refresh task not wired up. | High |
| 4 | Password reset token expiry and single-use enforcement to be verified. | High |
| 5 | Block/report endpoints not reflected in browse/search pre-filter. | High |
| 6 | Frontend pages for Search, Notifications, and Chat not yet scaffolded. | Medium |
| 7 | Integration tests for auth flow missing. | Medium |
