# Atlas NetCare — Academic Demo

A campus network-operations demonstration: React + TypeScript on the front end, FastAPI on the back end, MongoDB for storage.

> **This is not a production monitoring service.** Telemetry and notifications are *simulated*; operational records are *persistent*. There is no live network access, no network configuration, no real email, no offline sync, and no closed-browser alarms.

---

## Table of contents

- [Quick start](#quick-start)
- [Prerequisites](#prerequisites)
- [Environment variables](#environment-variables)
- [Running the app](#running-the-app)
- [Demo accounts](#demo-accounts)
- [Maintenance scheduler](#maintenance-scheduler)
- [Resetting the demo data](#resetting-the-demo-data)
- [Project layout](#project-layout)
- [API reference](#api-reference)
- [Permission matrix](#permission-matrix)
- [Behavioral invariants](#behavioral-invariants)
- [Evaluator walkthrough](#evaluator-walkthrough)
- [Troubleshooting](#troubleshooting)
- [Scope and limits](#scope-and-limits)

---

## Quick start

From a clean checkout, with MongoDB already running:

```bash
# 1. Backend dependencies
cd backend
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt

# 2. Frontend dependencies
cd ../frontend
npm install

# 3. Create backend/.env and frontend/.env  (see "Environment variables")

# 4. Run the two servers in separate terminals
cd backend  && .venv/bin/uvicorn server:app --host 0.0.0.0 --port 8001 --reload
cd frontend && npm start
```

Then open **http://localhost:3000** and sign in with `admin@atlas.demo` / `AtlasDemo2026!`.

The backend seeds the demo database automatically on startup — no separate seed command is needed.

---

## Prerequisites

| Requirement | Version used | Notes |
|---|---|---|
| Python | 3.12 | `motor` 3.3.1 / `pymongo` 4.6.3 pin the async driver; 3.12 is what the checked-in venv targets. |
| Node.js | 24.x | Any modern LTS works. |
| npm | ships with Node | `package-lock.json` is committed, so `npm install` is the supported install path. |
| MongoDB | 8.x | Must be reachable at `MONGO_URL` before the backend starts. |

Start MongoDB on macOS (Homebrew):

```bash
brew services start mongodb-community
# verify it is listening
nc -z localhost 27017 && echo "mongo is up"
```

---

## Environment variables

Both `.env` files are git-ignored. **Generate your own secrets per installation and never commit them.**

### `backend/.env`

| Variable | Purpose | Example |
|---|---|---|
| `MONGO_URL` | MongoDB connection string | `mongodb://127.0.0.1:27017` |
| `DB_NAME` | Base database name (a suffix is appended — see below) | `netcare` |
| `DEMO_MODE` | Must be `true` for the isolated academic demo | `true` |
| `JWT_SECRET` | Signs access and refresh tokens | *generate a random string* |
| `WEBHOOK_CRON_SECRET` | Bearer secret for the maintenance endpoint | *generate a random string* |
| `ADMIN_EMAIL` | Owner account's email (the one real identifier) | `you@example.com` |
| `ADMIN_PASSWORD` | Owner account's private password | *generate* |
| `DEMO_PASSWORD` | Shared password for the eight fictional accounts | `AtlasDemo2026!` |
| `FRONTEND_URL` | Exact origin allowed by CORS | `http://localhost:3000` |
| `CAMPUS_TIMEZONE` | Shift-entry timezone | `Asia/Manila` |
| `PREVIEW_PROXY_ORIGIN` | *Optional.* Extra allowed origin when a preview proxy rewrites `Origin`. | — |

**Database isolation:** the effective database name is `DB_NAME` + `_atlas_demo` when `DEMO_MODE=true` (so `netcare` → `netcare_atlas_demo`), and `DB_NAME` + `_atlas` otherwise. Demo data never shares collections with a non-demo installation.

### `frontend/.env`

```dotenv
REACT_APP_BACKEND_URL=http://localhost:8001
PORT=3000
```

`FRONTEND_URL` in the backend and the port the frontend actually serves on must match exactly, or every mutating request is rejected with a 403 by the origin guard.

---

## Running the app

### Backend — FastAPI on port 8001

```bash
cd backend
.venv/bin/uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

On startup the lifespan hook runs `seed()`, which idempotently creates 9 accounts, 3 labs, 12 access points, 30 PCs, and roughly 24 hours of synthetic history at 15-minute intervals. Restarting never wipes existing records.

Confirm the service and its database connection:

```bash
curl -s http://localhost:8001/api/health
# {"status":"ok","service":"Atlas NetCare","mode":"academic-demo"}
```

Interactive API docs are at **http://localhost:8001/docs**.

### Frontend — React dev server on port 3000

```bash
cd frontend
npm start            # craco start; add BROWSER=none to suppress auto-open
```

Wait for `Compiled successfully!`, then open **http://localhost:3000**. Both servers hot-reload on save; restart only after changing dependencies or `.env`.

### Calling the API directly

Mutating requests from a browser context are guarded. A raw `curl` login needs both headers:

```bash
curl -s -X POST http://localhost:8001/api/auth/login \
  -H 'Content-Type: application/json' \
  -H 'X-Atlas-Request: 1' \
  -H 'Origin: http://localhost:3000' \
  -d '{"email":"admin@atlas.demo","password":"AtlasDemo2026!"}'
```

The React API client sends `X-Atlas-Request: 1` automatically, so this only matters for manual testing.

---

## Demo accounts

Shared password for all fictional accounts: the value of `DEMO_PASSWORD` (`AtlasDemo2026!` by convention). The sign-in page also offers explicit role buttons.

| Email | Name | Role |
|---|---|---|
| *your* `ADMIN_EMAIL` | Campus Owner | admin — password is `ADMIN_PASSWORD`, not the shared one |
| `admin@atlas.demo` | Alex Morgan | admin |
| `engineer@atlas.demo` | Daniel Reyes | engineer |
| `sofia@atlas.demo` | Sofia Cruz | engineer |
| `assistant@atlas.demo` | Jamie Santos | assistant |
| `mika@atlas.demo` | Mika Flores | assistant |
| `leo@atlas.demo` | Leo Garcia | assistant |
| `nina@atlas.demo` | Nina Ramos | assistant |
| `kai@atlas.demo` | Kai Mendoza | assistant |

The first visit to the workspace creates an isolated public demo-admin session; signing out returns to sign-in. **Do not enter real student or campus operational data.**

**Password recovery is simulated.** `POST /api/auth/forgot-password` returns a generic acknowledgement — no email, no token, no password change. An admin resets passwords from *Team & access*. Deactivation and resets revoke sessions.

### Session security

Access JWTs last 15 minutes, refresh JWTs 7 days; both ride in `Secure`/`httpOnly` cookies backed by persisted, revocable sessions. Role and active status are re-read server-side on every request. Sign-in is limited to 10 attempts per client/account per 15-minute bucket. Cookie-bearing mutations require `X-Atlas-Request: 1` and a valid `Origin`.

---

## Maintenance scheduler

The 15-minute maintenance tick is **not** self-starting — nothing reconciles reminders or generates fresh telemetry until an external scheduler (cron, a systemd timer, or a hosted cron service) calls the endpoint:

```bash
curl -s -X POST http://localhost:8001/api/cron/maintain \
  -H "Authorization: Bearer $WEBHOOK_CRON_SECRET" \
  -H 'Content-Type: application/json' \
  -H "X-Webhook-Id: $(uuidgen)" \
  -d '{"event":"schedule.triggered"}'
# {"accepted":true}
```

The request body must carry `event: "schedule.triggered"` and a run ID (either the `X-Webhook-Id` header or a `run_id` field). The endpoint acknowledges with `202` immediately and does the work in the background. Run IDs are deduplicated, so a replayed tick returns `{"accepted":true,"duplicate":true}` and does nothing. Interrupted job state is recorded and the next tick reconciles it; full durable retries are out of scope for this demo.

A local crontab entry for every 15 minutes:

```cron
*/15 * * * * curl -sS -X POST http://localhost:8001/api/cron/maintain -H "Authorization: Bearer YOUR_SECRET" -H 'Content-Type: application/json' -H "X-Webhook-Id: $(uuidgen)" -d '{"event":"schedule.triggered"}'
```

---

## Resetting the demo data

**Destructive to demo records only.** Stop any evaluation in progress first, and never reset with requests in flight.

```bash
cd backend
.venv/bin/python reset_demo.py --confirm RESET-ATLAS-DEMO
```

The script refuses to run unless `DEMO_MODE=true` *and* the database name ends in `_atlas_demo`. It drops the demo database, rebuilds indexes and fictional data, and invalidates all prior sessions. There is no public reset endpoint, and normal restarts never reset records.

---

## Project layout

```
netcare-lab/
├── backend/
│   ├── server.py        # FastAPI app, CORS, origin guard, /api/health
│   ├── core.py          # env loading, Mongo client, demo-suffixed db, shared models
│   ├── auth.py          # sign-in, sessions, refresh, simulated recovery
│   ├── operations.py    # labs, assets, users, shifts, checklists, incidents, tickets
│   ├── monitoring.py    # telemetry, simulation controls, alerts
│   ├── reporting.py     # overview, audit, reports, cron maintenance
│   ├── seed.py          # idempotent fixture data
│   └── reset_demo.py    # explicit demo-only reset
├── frontend/src/
│   ├── pages/           # Login, Dashboard, Monitoring, Checklists, Tickets,
│   │                    #   Shifts, Management, Insights
│   ├── components/      # Layout, Telemetry, shared, ui/ (shadcn + Radix)
│   ├── context.tsx      # auth/session context
│   ├── hooks/ lib/ constants/
│   └── App.tsx
├── tests/               # package scaffold; pytest.ini configures xdist (-n 2, loadscope)
└── design_guidelines.json
```

---

## API reference

All routes are prefixed with `/api`.

**Auth** — `POST /auth/login` · `POST /auth/demo` · `GET /auth/me` · `POST /auth/logout` · `POST /auth/refresh` · `POST /auth/forgot-password`

**Assets and labs** — `GET /labs` · `GET /assets` · `POST /assets` · `PATCH /assets/{id}/archive`

**Users** — `GET /users` · `POST /users` · `PATCH /users/{id}`

**Shifts** — `GET /shifts` · `POST /shifts` · `POST /shifts/{id}/acknowledge` · `POST /shifts/{id}/cancel`

**Checklists and tickets** — `POST /checklists` · `GET /checklists` · `GET /checklists/{id}` · `POST /incidents` · `GET /tickets` · `GET /tickets/{id}` · `PATCH /tickets/{id}`

**Monitoring** — `GET /monitoring` · `GET /monitoring/{id}/history` · `POST /monitoring/sample` · `POST /simulation` · `GET /alerts`

**Reporting and ops** — `GET /overview` · `GET /audit` · `GET /reports` · `POST /cron/maintain` · `GET /health`

Only `GET`, `POST`, and `PATCH` are allowed by CORS. There is no deletion endpoint for users or assets — archival and deactivation preserve history.

---

## Permission matrix

| Action | Assistant | Engineer | Admin |
|---|---|---|---|
| AP status and synthetic alerts | Yes | Yes | Yes |
| Submit checklist | Yes | No | Yes |
| Report incident | Yes | Yes | Yes |
| Read tickets | Own/linked only | All | All |
| Progress and resolve | No | Yes | Yes |
| View shifts | Own only | Own (normally none) | All |
| Acknowledge shift | Own only | No | Own only |
| Manage assets/accounts/rosters | No | No | Yes |
| Simulate telemetry | No | Yes | Yes |
| Audit/report/export | No | No | Yes |

Foreign assistant records return `404`; forbidden role actions return `403`. Admins cannot demote or deactivate their own account.

---

## Behavioral invariants

**Checklists.** Unique on `(created_by, request_id)`, backed by a Mongo lease and a payload fingerprint. A same-key retry returns the same saved record. Uncertain transport errors retain and lock the original payload for retry. Drafts live in tab memory across navigation — not on disk, and there is no offline sync.

**Tickets.** A partial unique index on `active_key = asset_id:category` makes concurrent fault reports link to a single open ticket; reporter access is added atomically. Lifecycle is open → in_progress → resolved. Resolution requires at least 10 characters of notes and clears the active key so a future recurrence opens a fresh ticket. Resolved tickets are read-only.

**Shifts.** Entered in Asia/Manila (PHT, UTC+8) and stored as UTC ISO strings. End must follow start, with a 24-hour maximum. A per-assistant Mongo lease protects the cross-midnight overlap check. Adjacent shifts are allowed; cancelled records are retained.

**Reminders.** Exactly one per shift, due 15 minutes before start. An unacknowledged shift shows *Missed* once its start time passes. These are states, not duplicate alert rows, and acknowledgement preserves its first saved time. In-app only.

**Telemetry.** Deterministic states: normal, congestion (85%+ utilization), explicit outage, feed interruption, and recovery. Samples that are interrupted or older than 20 minutes display **Stale / unknown** — never an inferred outage. Interrupted feeds preserve their last-seen value; recovery closes prior active alerts and resumes sampling. Retention is bounded by 7 days and 20,000 rows via TTL plus prune. Initial history is 24 hours at 15-minute intervals; AP detail shows the latest 200 samples. Manual controls create server-confirmed samples.

---

## Evaluator walkthrough

1. Open **Overview** as the demo admin; inspect AP statuses, timestamps, and simulation badges.
2. Provision an assistant and add a PC. Duplicate email or tag should be rejected.
3. Assign a shift, attempt overlapping and cross-midnight assignments (both rejected), then sign in as that assistant and acknowledge it.
4. Submit a PC checklist: mark all passed, fail *Network*, add notes, submit. Follow the ticket link. A second fault in the same category links to the existing open ticket.
5. As an engineer, start the investigation, enter the required resolution notes, and resolve. Empty notes cannot resolve.
6. As an admin, confirm report and audit outcomes and export CSV. Archive a PC and deactivate an assistant; history remains and the existing assistant session fails.
7. Run congestion → outage → feed interruption → recovery on an AP. Interruption must read as unknown while preserving last-seen; recovery restores data and closes alerts.
8. Block backend requests in the browser. There must be no false checklist success, and the draft must survive. Unblock and retry with the original key.
9. Restart the backend; saved records must remain. Test permission denials through the real API, not UI visibility alone.

---

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Backend exits with `KeyError` on startup | A required variable is missing from `backend/.env`. Every name in the table above except `PREVIEW_PROXY_ORIGIN` is mandatory. |
| `ServerSelectionTimeoutError` after ~4s | MongoDB is not running or `MONGO_URL` is wrong. Start it and re-check port 27017. |
| Every write returns `403 Untrusted request origin` | The browser's origin does not match `FRONTEND_URL`. They must be byte-identical, scheme and port included. |
| `403 Browser request safeguard is required` | A cookie-bearing or cross-origin mutation arrived without `X-Atlas-Request: 1`. Add the header for manual API calls. |
| Frontend loads but all data calls fail | `REACT_APP_BACKEND_URL` is wrong, or it changed without restarting `npm start` — CRA inlines env vars at build time. |
| `401 Invalid scheduler credentials` on the cron call | The bearer token does not match `WEBHOOK_CRON_SECRET`. |
| Reminders and telemetry never advance | Expected: nothing calls `/api/cron/maintain` on its own. See [Maintenance scheduler](#maintenance-scheduler). |
| `reset_demo.py` prints `REFUSED` | `DEMO_MODE` is not `true`, or the database name does not end in `_atlas_demo`. This guard is intentional. |
| Port 3000 or 8001 already in use | `lsof -ti:8001 \| xargs kill` (or change `PORT` / `--port`, updating `FRONTEND_URL` and `REACT_APP_BACKEND_URL` to match). |

---

## Scope and limits

Core interactions target **under 7 seconds** with the confirmed **10 concurrent users** and the documented dataset. That is a measured demo target, not an annual uptime commitment.

Deliberately out of scope: live network access, network configuration, real email delivery, offline sync, closed-browser alarms, durable job retries, and production availability engineering. Hosting is unspecified. Future direction: authorized read-only telemetry, real notifications, offline sync.

The `tests/` directory is a package scaffold — `backend/pytest.ini` fixes the xdist configuration (`-n 2 --dist loadscope`) for suites added later. Run them with `cd backend && .venv/bin/pytest`.
