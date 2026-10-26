# Atlas NetCare

Atlas NetCare is a campus network-operations portal built for the Asia Pacific University (APU) capstone project. It brings Wi-Fi access-point monitoring, lab workstation inspections, incident tickets and the IT assistant duty roster into one web application with three roles: IT Assistant, Network Engineer and Administrator.

> **Academic demo.** Network telemetry and notifications are simulated. Operational records (accounts, assets, checklists, tickets, shifts, audit entries) are stored in MongoDB and persist across restarts. The system does not connect to real network equipment, send email, or change network configuration.

---

## Contents

1. [Features](#features)
2. [Technology](#technology)
3. [Getting started](#getting-started)
4. [Default accounts](#default-accounts)
5. [Configuration](#configuration)
6. [Testing and CI](#testing-and-ci)
7. [Project structure](#project-structure)
8. [API overview](#api-overview)
9. [Roles and permissions](#roles-and-permissions)
10. [Business rules](#business-rules)
11. [Background maintenance](#background-maintenance)
12. [Simulation layer](#simulation-layer)
13. [Known limitations and security gaps](#known-limitations-and-security-gaps)
14. [Troubleshooting](#troubleshooting)

---

## Features

| Module | What it does |
|---|---|
| Wi-Fi telemetry dashboard | Status, connected clients, load and latency for 28 access points across labs, classrooms, the library, the canteen and outdoor areas, with 24 hours of history and alerts for congestion, outages and interrupted feeds. |
| Lab inspection checklists | Five-point workstation checks (power, display, peripherals, network, software). A failed check opens or joins an incident ticket. |
| Incident ticketing | Fault reports with priority, Tier 1 / Tier 2 routing, an open → in progress → resolved lifecycle and a full event history. |
| Duty roster | Shift assignment with overlap checks, acknowledgement, handover notes and in-app reminders. |
| Administration | Campus locations, hardware inventory with DHCP/VLAN addressing, team accounts, operational reports with CSV export, and an audit log. |
| Simulation controls | Engineers can trigger congestion, outage, feed interruption, flapping, degradation and recovery scenarios, then diagnose and remediate devices. |

## Technology

| Layer | Stack |
|---|---|
| Frontend | React 19, TypeScript, Tailwind CSS, Recharts, Create React App with CRACO |
| Backend | Python 3.12, FastAPI, Motor (async MongoDB driver), Pydantic |
| Database | MongoDB 8 |
| Quality | pytest (57 tests, 90% backend coverage), flake8, black, TypeScript type check, Prettier, GitHub Actions |

---

## Getting started

### Prerequisites

- Python 3.12 (3.13 also works)
- Node.js 24 and npm
- MongoDB 8, running and reachable at `MONGO_URL`

### 1. Backend

```bash
cd backend
python3.12 -m venv .venv
.venv/bin/pip install -r requirements.txt     # Windows: .venv\Scripts\pip
```

Create `backend/.env`:

```dotenv
MONGO_URL=mongodb://127.0.0.1:27017
DB_NAME=netcare
DEMO_MODE=true
JWT_SECRET=change-me-to-a-long-random-string-of-32-bytes-or-more
WEBHOOK_CRON_SECRET=change-me-too
ADMIN_EMAIL=owner@example.com
ADMIN_PASSWORD=choose-an-owner-password
DEMO_PASSWORD=AtlasDemo2026!
FRONTEND_URL=http://localhost:3000
CAMPUS_TIMEZONE=Asia/Kuala_Lumpur
```

Start the API on port 8001:

```bash
.venv/bin/uvicorn server:app --host 0.0.0.0 --port 8001 --reload
```

On first start the backend seeds the database with demo accounts, 11 campus locations, 28 access points, 30 workstations, sample tickets and shifts, and 24 hours of telemetry. Later starts never wipe data. Check it is up with `curl http://localhost:8001/api/health`. Interactive API docs are at http://localhost:8001/docs.

### 2. Frontend

```bash
cd frontend
npm install --legacy-peer-deps
```

Create `frontend/.env`:

```dotenv
REACT_APP_BACKEND_URL=http://localhost:8001
PORT=3000
```

Start the app on port 3000:

```bash
npm start
```

Open http://localhost:3000 and sign in with one of the [default accounts](#default-accounts).

`--legacy-peer-deps` is required because `react-scripts` 5 (Create React App) declares TypeScript 3 or 4 as a peer, and this project uses TypeScript 5.9.

---

## Default accounts

Every role has ready-made accounts. All of them use the password set in `DEMO_PASSWORD`; with the `.env` above that is **`AtlasDemo2026!`**.

| Role | Email | Password | Name |
|---|---|---|---|
| Administrator | `admin@apu.edu.my` | `AtlasDemo2026!` | Alex Morgan |
| Network Engineer | `engineer@apu.edu.my` | `AtlasDemo2026!` | Daniel Reyes |
| IT Assistant | `assistant@apu.edu.my` | `AtlasDemo2026!` | Jamie Santos |

More accounts for testing:

| Role | Email | Name |
|---|---|---|
| Network Engineer | `sofia@apu.edu.my` | Sofia Cruz |
| IT Assistant | `mika@apu.edu.my` | Mika Flores |
| IT Assistant | `leo@apu.edu.my` | Leo Garcia |
| IT Assistant | `nina@apu.edu.my` | Nina Ramos |
| IT Assistant | `kai@apu.edu.my` | Kai Mendoza |
| Administrator (owner) | value of `ADMIN_EMAIL` | password is `ADMIN_PASSWORD` |

Administrators can add accounts and reset passwords under **Team & Access**. Use fictional data only; do not enter real student or staff information.

---

## Configuration

### Backend (`backend/.env`)

| Variable | Required | Purpose |
|---|---|---|
| `MONGO_URL` | Yes | MongoDB connection string |
| `DB_NAME` | Yes | Base database name. The effective name is `DB_NAME_atlas_demo` in demo mode and `DB_NAME_atlas` otherwise, so demo data never mixes with other data. |
| `DEMO_MODE` | Yes | `true` for this academic demo |
| `JWT_SECRET` | Yes | Signs access and refresh tokens. Use at least 32 random bytes. |
| `WEBHOOK_CRON_SECRET` | Yes | Bearer secret for the optional maintenance endpoint |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Yes | The owner administrator account |
| `DEMO_PASSWORD` | Yes | Password for every default account |
| `FRONTEND_URL` | Yes | Exact browser origin allowed by CORS, including scheme and port |
| `CAMPUS_TIMEZONE` | No | Defaults to `Asia/Kuala_Lumpur` |
| `PREVIEW_PROXY_ORIGIN` | No | One extra allowed origin, for preview proxies |

### Frontend (`frontend/.env`)

| Variable | Purpose |
|---|---|
| `REACT_APP_BACKEND_URL` | Base URL of the API. Restart `npm start` after changing it. |
| `PORT` | Dev server port. Must match `FRONTEND_URL` in the backend. |

Both `.env` files are git-ignored. Never commit real secrets.

### Resetting the demo data

```bash
cd backend
.venv/bin/python reset_demo.py --confirm RESET-ATLAS-DEMO
```

The script only runs when `DEMO_MODE=true` and the database name ends in `_atlas_demo`. It drops the demo database and seeds it again, which also signs everyone out.

---

## Testing and CI

### Backend

The backend tests use an in-memory MongoDB (`mongomock-motor`), so they need no database server and no `.env`.

```bash
python3.12 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements-dev.txt
backend/.venv/bin/pytest                      # from the repository root, about 35 seconds
backend/.venv/bin/flake8 backend tests
backend/.venv/bin/black --check backend tests
```

| Test file | Covers |
|---|---|
| `tests/test_api.py`, `test_api_admin.py`, `test_api_ops.py` | The real FastAPI routes over HTTP: sign-in and sessions, role denials, checklists, tickets, roster rules, assets, locations, team accounts, simulations, reports, the cron endpoint, startup and the reset safeguard |
| `tests/test_architecture.py` | Backend modules only import in the allowed direction |
| `tests/test_simulation.py` | Telemetry profiles, scenarios, DHCP assignment and inventory logic |

### Frontend

```bash
cd frontend
npm run typecheck        # TypeScript, including a check for unused code
npm run format:check     # Prettier
npm run build            # production build
```

### Continuous integration

GitHub Actions (`.github/workflows/ci.yml`) runs on every push and pull request:

- **Backend:** flake8, black and pytest on Python 3.12
- **Frontend:** `npm ci --legacy-peer-deps`, type check, Prettier check and production build

---

## Project structure

```
netcare-lab/
├── backend/
│   ├── server.py          FastAPI app, CORS, origin guard, background maintenance, health check
│   ├── core.py            Settings, MongoDB client, permissions, leases, indexes, base models
│   ├── auth.py            Sign-in, sessions, token refresh, profile, simulated password recovery
│   ├── inventory.py       Campus locations, lab PCs and access points
│   ├── team.py            Team accounts, roles and scopes
│   ├── roster.py          Shifts, reminders, acknowledgement and handover
│   ├── tickets.py         Checklists, incidents and tickets
│   ├── monitoring.py      Synthetic telemetry, simulation, alerts, diagnostics
│   ├── reporting.py       Overview, audit log, reports, cron endpoint
│   ├── campus.py          Location catalogue, DHCP/VLAN addressing, hardware IDs
│   ├── seed.py            Demo data and startup migrations
│   └── reset_demo.py      Demo-only reset script
├── frontend/src/
│   ├── pages/             One file per page: Login, Dashboard, Monitoring, Checklists, Tickets,
│   │                      Shifts, Assets, Team, Locations, Reports, Audit, Alerts
│   ├── components/        Layout, Telemetry, UserProfileModal, shared UI, ui/
│   ├── lib/types.ts       Types for the data the API returns
│   ├── lib/workflow.ts    Client-side simulation layer
│   ├── lib/fleetSimulation.ts  Simulated access-point metrics
│   ├── lib/csv.ts         CSV export
│   ├── lib/api.ts         HTTP client and formatting helpers
│   ├── context.tsx        Authentication context
│   └── App.tsx            Role-based routes
├── tests/                 Backend test suite
└── .github/workflows/     CI pipeline
```

---

## API overview

All routes are under `/api`. Full request and response schemas are at `/docs` while the backend runs.

| Area | Routes |
|---|---|
| Auth | `POST /auth/login`, `POST /auth/logout`, `POST /auth/refresh`, `GET /auth/me`, `PATCH /auth/profile`, `POST /auth/forgot-password`, `POST /auth/demo` |
| Locations and assets | `GET /labs`, `GET/POST /locations`, `PATCH/DELETE /locations/{id}`, `GET/POST /assets`, `PATCH /assets/{id}`, `PATCH /assets/{id}/archive`, `DELETE /assets/{id}` |
| Team | `GET/POST /users`, `PATCH/DELETE /users/{id}` |
| Roster | `GET/POST /shifts`, `POST /shifts/{id}/acknowledge`, `POST /shifts/{id}/complete`, `POST /shifts/{id}/cancel` |
| Checklists and tickets | `GET/POST /checklists`, `POST /checklists/batch`, `GET /checklists/{id}`, `POST /incidents`, `GET /tickets`, `GET/PATCH /tickets/{id}`, `POST /tickets/{id}/comment` |
| Monitoring | `GET /monitoring`, `GET /monitoring/{id}/history`, `POST /monitoring/sample`, `POST /monitoring/{id}/diagnose`, `POST /monitoring/{id}/remediate`, `POST /simulation`, `GET /alerts` |
| Reporting | `GET /overview`, `GET /audit`, `GET /reports`, `POST /cron/maintain`, `GET /health` |

Mutating requests from a browser must send the `X-Atlas-Request: 1` header and come from an allowed origin. The frontend does this automatically. For manual testing:

```bash
curl -X POST http://localhost:8001/api/auth/login \
  -H 'Content-Type: application/json' -H 'X-Atlas-Request: 1' -H 'Origin: http://localhost:3000' \
  -d '{"email":"admin@apu.edu.my","password":"AtlasDemo2026!"}'
```

---

## Roles and permissions

What the API enforces today. Items marked *gap* are listed under [known security gaps](#known-limitations-and-security-gaps).

| Action | IT Assistant | Network Engineer | Administrator |
|---|---|---|---|
| View access points and alerts (API) | Yes | Yes | Yes |
| Monitoring page | No (dashboard only) | Yes | Yes |
| Submit inspection checklists | Yes | No | No |
| Report incidents | Yes | Yes | Yes |
| Read tickets and checklists | All (*gap*) | All | All |
| Start and resolve tickets | No | Yes | Yes |
| Acknowledge or complete a shift | Any shift (*gap*) | No | Any shift |
| Manage locations, assets, accounts and rosters | No | No | Yes |
| Run simulations, diagnose, remediate | No | Yes | Yes |
| Audit log and reports | No | No | Yes |

---

## Business rules

- **Checklists.** All five checks are required, and only workstations take checklists. Each submission carries a request key; retrying with the same key returns the saved checklist instead of a duplicate, and reusing a key with different content is rejected.
- **Tickets.** Repeat reports of the same fault on the same asset join the one open ticket. Network and access-point faults route to Tier 2, and a medium priority on them becomes high. A ticket must be in progress before it can be resolved, resolution notes need at least 10 characters, and resolved tickets cannot change status.
- **Shifts.** Times are entered in Malaysia time (UTC+8). A shift lasts at most 24 hours and cannot overlap another shift for the same assistant, including across midnight. Completing a shift twice keeps the first handover, and a completed shift cannot be cancelled.
- **Telemetry.** A feed that is interrupted or older than 20 minutes shows as *Stale / unknown*, never as an outage. History is kept for 7 days and capped at 20,000 samples.
- **Reports.** Mean resolution time is the measured average over resolved tickets and stays empty until one exists.

## Background maintenance

While running, the backend performs a maintenance tick at startup and every 15 seconds: it records a telemetry sample for each access point, opens and closes alerts, and makes sure every shift has a reminder. Every 15 minutes it also fills gaps in telemetry history and moves the seeded demo shifts to the current day. Failed ticks are logged and retried. GET endpoints never write to the database.

Deployments without a long-running process can trigger the same work from an external scheduler with `POST /api/cron/maintain`, using `Authorization: Bearer <WEBHOOK_CRON_SECRET>`, a unique `X-Webhook-Id`, and the body `{"event": "schedule.triggered"}`. Repeated run IDs are ignored.

## Simulation layer

To keep the demo populated, the frontend also keeps browser-only data in `frontend/src/lib/workflow.ts`: a fixed simulated access-point fleet, simulated tickets, and checklists, tickets and shift states saved in browser storage. These are merged with server data on screen. If the server cannot be reached, some actions are saved in the browser only (their IDs start with `chk-local-` or `inc-local-`). Server reports and the audit log only include what reached the server.

## Known limitations and security gaps

Out of scope for this demo: live network access, network configuration, email delivery, offline sync and production hosting.

The following security gaps are known and scheduled for a later security pass. Do not deploy this build publicly until they are fixed.

1. On the first visit, the frontend signs the browser in as the demo administrator automatically (`POST /api/auth/demo`).
2. In demo mode, profile password changes accept several fixed strings as the current password.
3. Tickets, checklists and shifts are not filtered by owner, so every role can read all of them.
4. Any assistant can acknowledge or complete another assistant's shift.
5. Any signed-in user can comment on any ticket and change its assignee name.
6. Any administrator can reset the owner account's password or email.
7. Refresh tokens are not rotated when used.

## Troubleshooting

| Problem | Fix |
|---|---|
| Backend exits with `KeyError` | A required variable is missing from `backend/.env`. |
| `ServerSelectionTimeoutError` | MongoDB is not running, or `MONGO_URL` is wrong. |
| Every save fails with `403 Untrusted request origin` | `FRONTEND_URL` must match the browser address exactly, including the port. |
| Pages load but all data fails | `REACT_APP_BACKEND_URL` is wrong, or was changed without restarting `npm start`. |
| `npm install` fails with `ERESOLVE` | Use `npm install --legacy-peer-deps`. |
| Sign-in fails with the default accounts | Check `DEMO_PASSWORD` in `backend/.env`. If you changed it after the first start, run the reset script. |
| `reset_demo.py` prints `REFUSED` | `DEMO_MODE` must be `true` and the database name must end in `_atlas_demo`. |
