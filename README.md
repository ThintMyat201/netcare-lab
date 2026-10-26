# Atlas NetCare academic demo

A campus network-operations demonstration. React and TypeScript on the front end, FastAPI on the back end, MongoDB for storage.

> **This is not a production monitoring service.** Telemetry and notifications are *simulated*. Operational records are *persistent*. There is no live network access, no network configuration, no real email, no offline sync, and no closed-browser alarms.

---

## Table of contents

- [Quick start](#quick-start)
- [Prerequisites](#prerequisites)
- [Environment variables](#environment-variables)
- [Running the app](#running-the-app)
- [Demo accounts](#demo-accounts)
- [Background maintenance](#background-maintenance)
- [Resetting the demo data](#resetting-the-demo-data)
- [Project layout](#project-layout)
- [API reference](#api-reference)
- [Permission matrix](#permission-matrix)
- [Known security gaps](#known-security-gaps)
- [Client-side simulation layer](#client-side-simulation-layer)
- [Behavioral invariants](#behavioral-invariants)
- [Testing and CI](#testing-and-ci)
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
npm install --legacy-peer-deps

# 3. Create backend/.env and frontend/.env (see "Environment variables")

# 4. Run the two servers in separate terminals
cd backend  && .venv/bin/uvicorn server:app --host 0.0.0.0 --port 8001 --reload
cd frontend && npm start
```

Then open **http://localhost:3000** and sign in with `admin@apu.edu.my` and the `DEMO_PASSWORD` value (`AtlasDemo2026!` by convention).

The backend seeds the demo database on startup, so there is no separate seed command.

---

## Prerequisites

| Requirement | Version used | Notes |
|---|---|---|
| Python | 3.12 | `motor` 3.3.1 and `pymongo` 4.6.3 pin the async driver. 3.13 also passes the test suite. |
| Node.js | 24.x | Any current LTS works. |
| npm | ships with Node | Install with `npm install --legacy-peer-deps` (or `npm ci --legacy-peer-deps`). Plain `npm install` stops with `ERESOLVE` because `react-scripts` 5 (Create React App) expects TypeScript 3 or 4, and this project uses TypeScript 5.9. |
| MongoDB | 8.x | Must be reachable at `MONGO_URL` before the backend starts. The test suite does not need it. |

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
| `DB_NAME` | Base database name. The backend appends a suffix, see below. | `netcare` |
| `DEMO_MODE` | Must be `true` for the isolated academic demo | `true` |
| `JWT_SECRET` | Signs access and refresh tokens. Use at least 32 random bytes. | *generate a random string* |
| `WEBHOOK_CRON_SECRET` | Bearer secret for the maintenance endpoint | *generate a random string* |
| `ADMIN_EMAIL` | Owner account's email (the one real identifier) | `you@example.com` |
| `ADMIN_PASSWORD` | Owner account's private password | *generate* |
| `DEMO_PASSWORD` | Shared password for the eight fictional accounts | `AtlasDemo2026!` |
| `FRONTEND_URL` | Exact origin allowed by CORS | `http://localhost:3000` |
| `CAMPUS_TIMEZONE` | Shift-entry timezone | `Asia/Kuala_Lumpur` |
| `PREVIEW_PROXY_ORIGIN` | *Optional.* Extra allowed origin when a preview proxy rewrites `Origin`. | |

**Database isolation.** The effective database name is `DB_NAME` + `_atlas_demo` when `DEMO_MODE=true` (so `netcare` becomes `netcare_atlas_demo`), and `DB_NAME` + `_atlas` otherwise. Demo data never shares collections with a non-demo installation.

### `frontend/.env`

```dotenv
REACT_APP_BACKEND_URL=http://localhost:8001
PORT=3000
```

`FRONTEND_URL` in the backend must match the frontend's origin exactly. Otherwise the origin guard rejects every mutating request with a 403.

---

## Running the app

### Backend: FastAPI on port 8001

```bash
cd backend
.venv/bin/uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

On startup the lifespan hook runs `seed()`. On an empty database it creates 9 accounts, 11 campus locations, 28 access points, 30 PCs, 3 open tickets, 3 shifts, and 24 hours of synthetic telemetry at 15-minute intervals. On later starts it only fills gaps, so restarting never wipes records. It then runs one maintenance tick (see [Background maintenance](#background-maintenance)).

Confirm the service and its database connection:

```bash
curl -s http://localhost:8001/api/health
# {"status":"ok","service":"Atlas NetCare","mode":"academic-demo"}
```

Interactive API docs are at **http://localhost:8001/docs**.

### Frontend: React dev server on port 3000

```bash
cd frontend
npm start            # craco start; add BROWSER=none to suppress auto-open
```

Wait for `Compiled successfully!`, then open **http://localhost:3000**. Both servers reload on save. Restart them only after changing dependencies or `.env`.

### Calling the API directly

The backend guards mutating requests from browsers. A raw `curl` login needs both headers:

```bash
curl -s -X POST http://localhost:8001/api/auth/login \
  -H 'Content-Type: application/json' \
  -H 'X-Atlas-Request: 1' \
  -H 'Origin: http://localhost:3000' \
  -d '{"email":"admin@apu.edu.my","password":"AtlasDemo2026!"}'
```

The React API client sends `X-Atlas-Request: 1` on every request, so this only matters for manual testing.

---

## Demo accounts

All fictional accounts share the `DEMO_PASSWORD` value. The sign-in page also has one-click role buttons.

| Email | Name | Role |
|---|---|---|
| *your* `ADMIN_EMAIL` | Campus Owner | admin. Its password is `ADMIN_PASSWORD`, not the shared one. |
| `admin@apu.edu.my` | Alex Morgan | admin |
| `engineer@apu.edu.my` | Daniel Reyes | engineer |
| `sofia@apu.edu.my` | Sofia Cruz | engineer |
| `assistant@apu.edu.my` | Jamie Santos | assistant |
| `mika@apu.edu.my` | Mika Flores | assistant |
| `leo@apu.edu.my` | Leo Garcia | assistant |
| `nina@apu.edu.my` | Nina Ramos | assistant |
| `kai@apu.edu.my` | Kai Mendoza | assistant |

Older databases seeded with `@atlas.demo` addresses are renamed to `@apu.edu.my` on the next startup.

The first visit to the workspace signs the browser in as the demo admin. Signing out returns to the sign-in page. **Do not enter real student or campus operational data.**

**Password recovery is simulated.** `POST /api/auth/forgot-password` returns a generic acknowledgement. It sends no email, creates no token, and changes no password. An admin resets passwords from *Team & access*. Deactivating an account or resetting its password revokes its sessions.

### Sessions

Access JWTs last 15 minutes and refresh JWTs 7 days. Both are `Secure`, `httpOnly` cookies backed by session records the server can revoke. The server re-reads role and active status on every request. Sign-in allows 10 attempts per client and account per 15-minute window. Cookie-bearing mutations need `X-Atlas-Request: 1` and an allowed `Origin`.

---

## Background maintenance

While the backend runs, it does one maintenance tick at startup and then one every 15 seconds:

- write a synthetic telemetry sample for every active access point
- open or close alerts to match each access point's current state
- make sure every shift has exactly one reminder

Every 60th tick (15 minutes) it also fills gaps in the 15-minute telemetry history and moves the three seeded demo shifts onto today's date. A failed tick is logged and retried on the next one.

All background writes happen here. GET endpoints only read, and a test checks this.

### External scheduler (optional)

A deployment that runs the API without a long-lived process can trigger the same work from cron, a systemd timer or a hosted scheduler:

```bash
curl -s -X POST http://localhost:8001/api/cron/maintain \
  -H "Authorization: Bearer $WEBHOOK_CRON_SECRET" \
  -H 'Content-Type: application/json' \
  -H "X-Webhook-Id: $(uuidgen)" \
  -d '{"event":"schedule.triggered"}'
# {"accepted":true}
```

The body must carry `event: "schedule.triggered"` and a run ID, either in the `X-Webhook-Id` header or a `run_id` field. The endpoint returns `202` at once and does the work in the background. It records each run ID, so a replayed call returns `{"accepted":true,"duplicate":true}` and does nothing.

---

## Resetting the demo data

**This deletes demo records.** Stop any evaluation in progress first, and never reset with requests in flight.

```bash
cd backend
.venv/bin/python reset_demo.py --confirm RESET-ATLAS-DEMO
```

The script refuses to run unless `DEMO_MODE=true` *and* the database name ends in `_atlas_demo`. It drops the demo database, rebuilds indexes and fictional data, and so invalidates every session. There is no reset endpoint, and normal restarts never reset records.

---

## Project layout

```
netcare-lab/
├── backend/
│   ├── server.py           # FastAPI app, CORS, origin guard, background maintenance, /api/health
│   ├── core.py             # env loading, Mongo client, demo-suffixed db, permissions, lease, indexes, base models
│   ├── auth.py             # sign-in, sessions, refresh, profile, simulated recovery
│   ├── inventory.py        # campus locations, lab PCs and access points
│   ├── team.py             # team accounts, roles and scopes
│   ├── roster.py           # shifts, reminders, acknowledgement and handover
│   ├── tickets.py          # checklists, incidents and tickets
│   ├── campus.py           # campus location catalogue, DHCP/VLAN addressing, MAC and serial helpers
│   ├── monitoring.py       # synthetic telemetry, simulation controls, alerts, diagnostics
│   ├── reporting.py        # overview, audit, reports, cron maintenance endpoint
│   ├── seed.py             # idempotent demo data and startup migrations
│   ├── reset_demo.py       # explicit demo-only reset
│   ├── requirements.txt    # runtime dependencies
│   └── requirements-dev.txt
├── frontend/src/
│   ├── pages/              # Login, Dashboard, Monitoring, Checklists, Tickets,
│   │                       #   Shifts, Management, Locations, Insights
│   ├── components/         # Layout, Telemetry, UserProfileModal, shared, ui/
│   ├── lib/workflow.ts     # client-side simulation layer (see below)
│   ├── context.tsx         # auth and session context
│   └── App.tsx             # role-based routes
├── tests/
│   ├── conftest.py         # in-memory MongoDB fixtures
│   ├── test_api*.py        # HTTP tests through the real FastAPI app
│   ├── test_architecture.py # allowed import direction between backend modules
│   └── test_simulation.py  # unit tests for telemetry, inventory and profile logic
├── .github/workflows/ci.yml
├── pyproject.toml          # black and pytest settings
├── .flake8                 # flake8 settings
└── design_guidelines.json
```

---

## API reference

All routes start with `/api`.

**Auth.** `POST /auth/login` · `POST /auth/demo` · `GET /auth/me` · `PATCH /auth/profile` · `POST /auth/logout` · `POST /auth/refresh` · `POST /auth/forgot-password`

**Locations and assets.** `GET /labs` · `GET /locations` · `POST /locations` · `PATCH /locations/{id}` · `DELETE /locations/{id}` · `GET /assets` · `POST /assets` · `PATCH /assets/{id}` · `PATCH /assets/{id}/archive` · `DELETE /assets/{id}`

**Users.** `GET /users` · `POST /users` · `PATCH /users/{id}` · `DELETE /users/{id}`

**Shifts.** `GET /shifts` · `POST /shifts` · `POST /shifts/{id}/acknowledge` · `POST /shifts/{id}/complete` · `POST /shifts/{id}/cancel`

**Checklists and tickets.** `POST /checklists` · `POST /checklists/batch` · `GET /checklists` · `GET /checklists/{id}` · `POST /incidents` · `GET /tickets` · `GET /tickets/{id}` · `PATCH /tickets/{id}` · `POST /tickets/{id}/comment`

**Monitoring.** `GET /monitoring` · `GET /monitoring/{id}/history` · `POST /monitoring/sample` · `POST /monitoring/{id}/diagnose` · `POST /monitoring/{id}/remediate` · `POST /simulation` · `GET /alerts`

**Reporting and operations.** `GET /overview` · `GET /audit` · `GET /reports` · `POST /cron/maintain` · `GET /health`

CORS allows `GET`, `POST`, `PATCH` and `DELETE`. Deleting is permanent. Archiving an asset or deactivating an account keeps it and its history. A location can only be deleted once no active equipment or shift refers to it, and the owner account and your own account cannot be deleted.

---

## Permission matrix

This table shows what the API enforces today. Rows marked "gap" are listed under [Known security gaps](#known-security-gaps).

| Action | Assistant | Engineer | Admin |
|---|---|---|---|
| AP status and synthetic alerts (API) | Yes | Yes | Yes |
| Monitoring page (UI) | No, dashboard only | Yes | Yes |
| Submit checklist | Yes | No | No |
| Report incident | Yes | Yes | Yes |
| Read tickets and checklists | All (gap) | All | All |
| Progress and resolve tickets | No | Yes | Yes |
| List shifts | All (gap) | All (gap) | All |
| Acknowledge or complete a shift | Any shift (gap) | No | Any shift |
| Manage locations, assets, accounts and rosters | No | No | Yes |
| Simulate telemetry, diagnose, remediate | No | Yes | Yes |
| Audit log and reports | No | No | Yes |

Forbidden role actions return `403`. Admins cannot demote, deactivate or delete their own account or the owner account.

---

## Known security gaps

These are known and deferred to a later security pass. Do not deploy the demo anywhere public until they are fixed.

1. **Automatic admin sign-in.** On the first visit, `frontend/src/context.tsx` calls `POST /api/auth/demo` with `role: "admin"`, and the backend issues an admin session to any caller while `DEMO_MODE=true`.
2. **Password-change bypass.** In demo mode, `PATCH /api/auth/profile` accepts several fixed strings (including `demo`) as the current password.
3. **No record ownership checks.** `ticket_scope` and `checklist_scope` in `tickets.py` return no filter, so every role reads every ticket and checklist. `GET /shifts` returns every shift.
4. **Shift actions are not owner-checked.** Any assistant can acknowledge or complete another assistant's shift.
5. **Ticket comments.** Any signed-in role can comment on any ticket, including resolved ones, and set its assignee name to any text.
6. **Owner protection is partial.** Any admin can reset the owner account's password or change its email.
7. **Refresh tokens are not rotated** when they are used.

---

## Client-side simulation layer

The frontend deliberately keeps a second, browser-only data layer in `frontend/src/lib/workflow.ts` so the demo always has realistic content:

- A fixed fleet of access points drives the dashboard and monitoring tiles, with per-browser overrides in `sessionStorage`.
- Simulated tickets (`SIMULATION_LINKED_TICKETS`) are merged with server tickets.
- Tickets, checklists and shift states the browser saved locally are kept in `localStorage` and merged with server data. A local copy wins over the server copy with the same ticket number or id.
- Some writes fall back to the browser and still show as done:
  - A checklist submission that fails with a network error or a 5xx is saved locally, together with a local ticket for a failed check. Their ids start with `chk-local-` and `inc-local-`, and they never reach the server.
  - A ticket status change that fails for any reason is applied to the local copy.
  - Shift acknowledgement and cancellation are saved locally before the request is sent, and server errors are ignored.

So two browsers can show different data, and the server's reports and audit log only cover what reached the server. This is a known design choice for the demo, not a bug in the server.

---

## Behavioral invariants

**Checklists.** Unique on `(created_by, request_id)`, backed by a Mongo lease and a payload fingerprint. Retrying with the same key returns the saved record, and reusing a key with a different payload returns `409`. Every one of the five checks is required, and only workstations take checklists. Each failed check opens or joins a ticket.

**Tickets.** A partial unique index on `active_key = asset_id:category` makes concurrent fault reports link to a single open ticket, and the reporter is added in the same update. Network faults and AP faults route to Tier 2, and a medium priority on them becomes high. The lifecycle is open, then in_progress, then resolved. A status change only applies if the ticket still has the status the request read, so two engineers cannot overwrite each other. Resolving needs at least 10 characters of notes and clears the active key, so a recurrence opens a fresh ticket. Resolved tickets cannot change status.

**Shifts.** Entered in Asia/Kuala Lumpur time (MYT, UTC+8) and stored as ISO strings. End must follow start, with a 24-hour maximum. A per-assistant Mongo lease protects the overlap check, which includes shifts that cross midnight. Adjacent shifts are allowed. Acknowledging keeps the first time. Completing twice keeps the first completion and handover notes. Completed shifts cannot be cancelled, and cancelled shifts stay in history.

**Reminders.** Exactly one per shift, due 15 minutes before start. An unacknowledged shift shows *Missed* once its start time passes. These are states, not repeated alert rows, and they appear in the app only.

**Telemetry.** Deterministic states: normal, congestion (85% or more utilization), explicit outage, feed interruption, flapping, gradual degradation, and recovery. Samples that are interrupted or older than 20 minutes show **Stale / unknown**, never an inferred outage. Interrupted feeds keep their last-seen value. Recovery closes active alerts and resumes sampling. A TTL index and a prune step keep at most 7 days and 20,000 rows. AP detail shows the latest 200 samples.

**Reports.** Mean resolution time is the average over resolved tickets, from opening to resolution. It is `null` until at least one ticket is resolved.

---

## Testing and CI

The tests run against an in-memory MongoDB (`mongomock-motor`), so they need no database server and no `.env` file.

```bash
python3.12 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements-dev.txt
backend/.venv/bin/pytest          # from the repository root, about 35 seconds
backend/.venv/bin/flake8 backend tests
backend/.venv/bin/black --check backend tests
```

- `tests/test_api.py`, `test_api_admin.py` and `test_api_ops.py` sign in through the real FastAPI routes, the same way the React pages call them. They cover sign-in, refresh and profile changes, role denials, checklists and batch inspections, ticket linking, lifecycle and notes, roster rules, assets, locations and team accounts, the DELETE preflight, simulated outages with diagnosis and remediation, report averages, read-only GET endpoints, the cron endpoint, startup, and the reset script's safety check. Together they cover 90% of the backend.
- `tests/test_architecture.py` fails if a backend module imports one it should not, for example `inventory.py` importing `tickets.py`.
- `tests/test_simulation.py` unit-tests telemetry profiles, simulation scenarios, inventory and DHCP assignment, locations, team management and profile updates.

GitHub Actions (`.github/workflows/ci.yml`) runs flake8, black and pytest on Python 3.12, and runs `npm ci --legacy-peer-deps` and a production build of the frontend, on every push and pull request.

---

## Evaluator walkthrough

1. Open **Overview** as the demo admin. Inspect AP statuses, timestamps and simulation badges.
2. Provision an assistant and add a PC. A duplicate email or tag is rejected.
3. Assign a shift, then try an overlapping assignment and one that crosses midnight into it. Both are rejected. Sign in as that assistant and acknowledge the shift.
4. Submit a PC checklist: mark all passed, fail *Network*, add notes, submit. Follow the ticket link. A second fault in the same category links to the existing open ticket.
5. As an engineer, start the investigation, enter resolution notes, and resolve. Notes shorter than 10 characters cannot resolve.
6. As an admin, check the report and audit log and export CSV. Archive a PC and deactivate an assistant. History remains, and that assistant's existing session stops working.
7. Run congestion, then outage, then feed interruption, then recovery on an AP. Interruption reads as unknown while keeping last-seen, and recovery restores data and closes alerts.
8. Block backend requests in the browser and submit a checklist. The page saves it in this browser only (its id starts with `chk-local-`), as described under [Client-side simulation layer](#client-side-simulation-layer). Unblock and submit again to save it on the server.
9. Restart the backend. Saved records remain. Test permission denials through the API, not only through what the UI hides.

---

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| Backend exits with `KeyError` on startup | A required variable is missing from `backend/.env`. Every name in the table above except `PREVIEW_PROXY_ORIGIN` and `CAMPUS_TIMEZONE` is required. |
| `ServerSelectionTimeoutError` after about 4 seconds | MongoDB is not running or `MONGO_URL` is wrong. Start it and check port 27017. |
| Every write returns `403 Untrusted request origin` | The browser's origin does not match `FRONTEND_URL`. They must be identical, including scheme and port. |
| `403 Browser request safeguard is required` | A cookie-bearing or cross-origin mutation arrived without `X-Atlas-Request: 1`. Add the header for manual API calls. |
| Frontend loads but every data call fails | `REACT_APP_BACKEND_URL` is wrong, or it changed without restarting `npm start`. Create React App inlines env vars at build time. |
| `401 Invalid scheduler credentials` on the cron call | The bearer token does not match `WEBHOOK_CRON_SECRET`. |
| Reminders and telemetry stop advancing | The backend process stopped, or its log shows `Maintenance tick ... failed`. Restart it, or check MongoDB. |
| `reset_demo.py` prints `REFUSED` | `DEMO_MODE` is not `true`, or the database name does not end in `_atlas_demo`. This guard is intentional. |
| Port 3000 or 8001 already in use | `lsof -ti:8001 \| xargs kill`, or change `PORT` or `--port` and update `FRONTEND_URL` and `REACT_APP_BACKEND_URL` to match. |

---

## Scope and limits

Core interactions target **under 7 seconds** with **10 concurrent users** and the seeded dataset. That is a demo target, not an uptime commitment.

Out of scope on purpose: live network access, network configuration, real email delivery, offline sync, closed-browser alarms, durable job retries, and production availability engineering. Hosting is not decided. Next steps after the security pass: authorized read-only telemetry, real notifications and offline sync.
