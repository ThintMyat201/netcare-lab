# 📡 Atlas NetCare — Campus Network Operations & Lab Asset Management Platform

<div align="center">

![Python Version](https://img.shields.io/badge/Python-3.12%2B-3776AB?style=for-the-badge&logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-Async%20REST-009688?style=for-the-badge&logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-19%20%2B%20TypeScript%205.9-61DAFB?style=for-the-badge&logo=react&logoColor=0f172a)
![MongoDB](https://img.shields.io/badge/MongoDB-8.x%20Motor%20Async-47A248?style=for-the-badge&logo=mongodb&logoColor=white)
![Security](https://img.shields.io/badge/Security-3--Tier%20RBAC%20%2B%20HttpOnly%20JWT-8B5CF6?style=for-the-badge)
![Status](https://img.shields.io/badge/University%20Project-Grade%20A%2B%20Ready-F59E0B?style=for-the-badge)

*A full-stack, enterprise-grade web platform built to unify campus wireless telemetry monitoring, physical lab workstation inspections, automated Tier 1 / Tier 2 incident escalation, hardware asset management, and staff duty handovers across university laboratories and shared zones.*

---

</div>

## 📖 Executive Summary

**Atlas NetCare** is an integrated campus IT operations platform engineered for **Asia Pacific University of Technology & Innovation (APU)** to eliminate operational silos across computer laboratories, academic blocks, and shared wireless zones. In many higher-education environments, wireless access-point monitoring, physical lab workstation readiness checks, incident ticketing, hardware inventory tracking, and student/staff assistant shift handovers are scattered across disconnected spreadsheets and standalone tools. Atlas NetCare consolidates these workflows into a single role-tailored operational portal featuring a **Live Wireless Telemetry & Fault Simulation Engine**, standardized **5-Point Workstation Checklists**, **Automated Tier 1 / Tier 2 Incident Routing**, and **Exportable SLA & Audit Compliance Reports**.

To demonstrate rigorous full-stack software engineering, clean domain boundaries, and production-grade reliability, the platform is built with an asynchronous **Python 3.12 & FastAPI** backend, a **13-collection indexed MongoDB** persistence layer powered by **Motor**, a strictly typed **React 19 + TypeScript 5.9 + Tailwind CSS** SPA supporting both Dark and Light themes, and **57 automated integration, simulation, and AST architecture tests**.

> **Academic Demonstration Note:** Wireless telemetry metrics, remote ICMP/PoE/5GHz diagnostics, radio remediation, and password-recovery notices are deterministically simulated so examiners and evaluators can safely inject, diagnose, and resolve realistic campus network faults live without connecting to physical university switches or wireless controllers. All operational records—users, sessions, locations, assets, checklists, tickets, shifts, alerts, telemetry samples, and audit logs—are persisted in **MongoDB**.

---

## 🌟 Key Technical Highlights & Architecture

Why this implementation exemplifies software engineering best practices:

- **🏗️ Strictly Enforced Unidirectional Architecture**: Backend domain modules (`core` → `auth` → `campus` / `monitoring` → `inventory` / `team` / `roster` / `tickets` → `reporting` → `server`) follow a strict one-way dependency graph verified automatically on every test run via Python AST static analysis (`tests/test_architecture.py`), guaranteeing zero circular or upward imports.
- **🛡️ Enterprise-Grade Security**:
  - **HttpOnly JWT Cookie Sessions & Refresh Flow**: Short-lived `HS256` access tokens (15 minutes) paired with server-side revocable refresh sessions (7 days) stored inside `HttpOnly` cookies protect credentials from XSS token theft, while active tab lifecycle tracking in `sessionStorage` enforces clean `/login` entry on new sessions.
  - **Bcrypt Hashing & Sliding-Window Rate Limiting**: User passwords are encrypted with `bcrypt`, and authentication/recovery endpoints enforce per-IP + account rate limiting (`db.login_attempts` with TTL expiry) returning `429 Too Many Requests` against brute-force attacks.
  - **Strict Origin & Custom Header CSRF Defense**: Every state-mutating request (`POST`, `PATCH`, `PUT`, `DELETE`) validates the `Origin` header against `FRONTEND_URL` and requires `X-Atlas-Request: 1`, while Pydantic v2 `Input` models enforce `extra='forbid'` and automatic whitespace stripping.
  - **Distributed Atomic Leases & Idempotency Fingerprinting**: Cross-worker short leases (`db.locks` with 30-second TTL) and compound `(created_by, request_id)` payload fingerprinting prevent race conditions on overlapping shift assignments, double-submitted checklists, and concurrent incident creation.
- **⚡ High-Performance Asynchronous Design**:
  - **100% Non-Blocking Motor I/O & Strategic Indexing**: All database queries execute asynchronously over `motor.motor_asyncio`, backed by unique, compound, partial-filter (`active_key`), and automatic TTL indexes (`telemetry`, `sessions`, `locks`, `login_attempts`).
  - **Side-Effect-Free Reads & 15s Background Worker**: `GET` endpoints never mutate database state. An asynchronous background maintenance loop (paired with an HMAC-authenticated `POST /api/cron/maintain` webhook) samples AP metrics every 15 seconds, opens/resolves threshold alerts, and generates shift reminders.
- **👥 3-Tier Role-Based Access Control (RBAC)**: Dual-layer authorization guards across React Router protected routes and FastAPI `authorize()` dependencies strictly isolate **IT Assistant**, **Network Engineer**, and **Administrator** capabilities while recording unauthorized attempts in the audit trail.

---

## 👥 Role-Based Feature Matrix

| Feature / Operational Domain | 🛠️ IT Assistant | 🌐 Network Engineer | ⚙️ Administrator |
| :--- | :---: | :---: | :---: |
| **Role-Tailored Dashboard & CSV/PDF Snapshot (`/`)** | ✅ | ✅ | ✅ |
| **Acknowledge Duty Shifts & Submit Handover Notes (`/shifts`)** | ✅ | — | ✅ |
| **Schedule, Assign & Cancel Staff Duty Roster (`/shifts`)** | — | — | ✅ |
| **Execute 5-Point Workstation Checklists & Batch Verify (`/checklists`)** | ✅ | — | 👁️ View Only |
| **Interactive 2D Lab Floor Workstation Readiness Map (`/checklists`)** | ✅ | — | 👁️ View Only |
| **Report Hardware or Network Fault Incidents (`/tickets`)** | ✅ | ✅ | ✅ |
| **Triage, Investigate & Resolve Tier 1 / Tier 2 Tickets (`/tickets`)** | — | ✅ | ✅ |
| **Live Wireless AP Telemetry, 24h Traffic Charts & Alerts (`/monitoring`)** | — | ✅ | ✅ |
| **Run Remote ICMP / PoE / 5GHz Diagnostics & Remediation (`/monitoring`)** | — | ✅ | ✅ |
| **Trigger & Reset Network Fault Simulations (`/monitoring`)** | — | ✅ | ✅ |
| **Manage Hardware Inventory, VLANs & DHCP Reservations (`/assets`)** | — | — | ✅ |
| **Manage Campus Locations, Buildings & Room Codes (`/locations`)** | — | — | ✅ |
| **Provision Staff Accounts, Roles & Password Resets (`/users`)** | — | — | ✅ |
| **View & Export SLA Reports and Activity Audit Logs (`/reports`, `/audit`)** | — | — | ✅ |

---

## 🗄️ Database Schema & Collection Structure

The application is backed by a **13-collection indexed MongoDB database** (isolated automatically under `<DB_NAME>_atlas_demo` in demonstration mode) engineered for referential clarity, concurrency safety, and bounded storage:

```
+------------------+       +-------------------------+       +--------------------+
|      users       | <---- |         sessions        |       |   login_attempts   |
+------------------+       +-------------------------+       +--------------------+
  |      |      |
  |      |      +--------> +-------------------------+       +--------------------+
  |      |                 |         shifts          | ----> |     reminders      |
  |      |                 +-------------------------+       +--------------------+
  |      |                              |
  |      |                              v
  |      |                 +-------------------------+       +--------------------+
  |      +---------------> |       checklists        | ----> |       assets       |
  |                        +-------------------------+       +--------------------+
  |                                     |                       |       |      |
  |                                     v                       v       |      v
  +----------------------> +-------------------------+       +------+   |   +-----------+
  |                        |         tickets         |       | labs |   |   | telemetry |
  |                        +-------------------------+       +------+   |   +-----------+
  |                                     |                               v
  +----------------------> +-------------------------+       +--------------------+
                           |          audit          |       |       alerts       |
                           +-------------------------+       +--------------------+
                                                                +--------------+
                                                                | system/locks |
                                                                +--------------+
```

### Collection Breakdown
1. `users`: Staff credentials (`bcrypt` hashed), campus email (`unique`), full name, RBAC role (`admin`, `engineer`, `assistant`), active status flag, and operational scope.
2. `sessions`: Server-side revocable refresh/access session records mapped to `user_id` with an automatic 7-day MongoDB TTL index on `expires_at`.
3. `login_attempts`: Sliding 15-minute rate-limiting buckets keyed by `<client_ip>:<email>:<window>` with automatic TTL cleanup.
4. `labs`: Directory of 11 campus computing laboratories, lecture theatres, library, canteen, and outdoor wireless zones with building, floor, and room code metadata.
5. `assets`: Unified hardware inventory for **28 Wireless Access Points (`AP`)** and **30 Lab Workstations (`PC`)**, storing unique asset tags, VLAN IDs, DHCP/static IPs, hardware models, archive flags, and active simulation scenarios.
6. `telemetry`: Time-series wireless performance samples (`clients`, `load`, `throughput`, `latency`, `queue_depth`) indexed uniquely by `(asset_id, timestamp)` with a 7-day TTL retention policy.
7. `alerts`: Automated fleet anomaly records (`congested`, `offline`, `stale`) deduplicated via a partial unique index on `active_key`.
8. `checklists`: Standardized 5-point workstation inspection submissions (*Power & Boot*, *Display*, *Keyboard & Mouse*, *Network Connectivity*, *OS & Lab Software*) protected by a unique `(created_by, request_id)` idempotency index and SHA-256 payload fingerprint.
9. `tickets`: End-to-end incident records (`INC-1001+`) with Tier 1 / Tier 2 routing, priority levels, partial-unique `active_key` (`<asset_id>:<category>`) deduplication, resolution notes, and embedded chronological `events` timelines.
10. `shifts`: Duty roster blocks scheduled in Malaysia Time (`Asia/Kuala_Lumpur`, `UTC+8`) tracking start/end windows, acknowledgement timestamps, completion states, and structured handover notes.
11. `reminders`: Role-isolated unacknowledged shift alerts indexed uniquely by `shift_id`.
12. `audit`: Immutable chronological ledger of administrative, operational, and security events (`Signed in`, `Shift assigned`, `Ticket resolved`, `Scenario simulated`, `Access denied`).
13. `locks` *(plus `counters`, `cron_runs` & `meta`)*: Distributed 30-second TTL mutex leases for conflict-free roster/ticket mutations, atomic `INC-*` sequence counters, idempotent cron execution tracking, and startup seed markers.

---

## 📂 Project Directory Structure

```text
netcare-lab/
├── backend/                     # FastAPI + AsyncIO Motor Backend Service (Python 3.12)
│   ├── server.py                # App entry point, CORS, Origin/CSRF middleware & 15s maintenance loop
│   ├── core.py                  # Env loader, MongoDB client, RBAC matrix, TTL indexes & distributed leases
│   ├── auth.py                  # HttpOnly JWT cookies, login/logout, token refresh & profile updates
│   ├── campus.py                # Campus zone catalog, VLAN mapping, DHCP IP allocator & asset tagger
│   ├── inventory.py             # Campus locations & hardware asset CRUD / archive endpoints
│   ├── team.py                  # User provisioning, role assignment & password administration
│   ├── roster.py                # MYT shift scheduling, overlap validation, acknowledgement & handovers
│   ├── tickets.py               # Idempotent 5-point checklists, batch verification & ticket lifecycle
│   ├── monitoring.py            # AP telemetry generator, fault simulation, diagnostics & remediation
│   ├── reporting.py             # Role overview, SLA/MTTR analytics, audit trail & cron webhook
│   ├── seed.py                  # Idempotent demo data seeder & MYT timestamp normalizer
│   ├── reset_demo.py            # Guarded CLI utility to wipe and re-seed `_atlas_demo` collections
│   ├── requirements.txt         # Production Python dependencies
│   └── requirements-dev.txt     # Test & lint toolchain (pytest, mongomock-motor, flake8, black)
├── frontend/                    # React 19 + TypeScript 5.9 + Tailwind CSS Frontend SPA
│   ├── src/
│   │   ├── pages/               # Route views: Login, Dashboard, Monitoring, Checklists, Tickets,
│   │   │                        # Shifts, Assets, Locations, Team, Reports, Audit, Alerts
│   │   ├── components/          # Layout shell (sidebar, topbar, role bell alerts), Telemetry charts,
│   │   │                        # APTable, Simulation modal, UserProfileModal & shared UI primitives
│   │   ├── lib/                 # Axios refresh client, TypeScript contracts, CSV exporter & fleet helpers
│   │   ├── context.tsx          # Authentication context & sessionStorage tab-lifecycle manager
│   │   ├── App.tsx              # ThemeProvider & strict 3-tier role-protected routing guard
│   │   ├── index.css            # Tailwind layers & Dark/Light CSS custom properties
│   │   └── App.css              # Enterprise data tables, cards, modals & responsive breakpoints
│   ├── tailwind.config.js       # Tailwind CSS design tokens & dark-mode class configuration
│   └── package.json             # Build, dev server, strict TypeScript & Prettier scripts
├── tests/                       # 57 Automated Pytest Suites (API, RBAC, Simulation & AST Architecture)
└── .github/workflows/ci.yml     # GitHub Actions CI Pipeline (Backend Python 3.12 + Frontend Node 24)
```

---

## 🛠️ Step-by-Step Installation & Setup Guide

Atlas NetCare runs locally on macOS, Linux, or Windows with Python, Node.js, and MongoDB.

### Prerequisites
- **Python**: Version `3.12` (or `3.13`)
- **Node.js**: Version `20+` LTS (`24.x` recommended) and **npm**
- **Database**: **MongoDB** `8.x` (or `7.x+`) running locally on `mongodb://127.0.0.1:27017`

### 1. Clone the Repository
```bash
git clone https://github.com/your-username/netcare-lab.git
cd netcare-lab
```

### 2. Backend & Database Initialization
1. Create an isolated Python virtual environment and install backend dependencies:
   ```bash
   cd backend
   python3.12 -m venv .venv
   .venv/bin/pip install -r requirements.txt
   ```
   *(On Windows PowerShell/CMD, run `.venv\Scripts\pip install -r requirements.txt`).*

2. Create `backend/.env` with your local configuration:
   ```dotenv
   MONGO_URL=mongodb://127.0.0.1:27017
   DB_NAME=netcare
   DEMO_MODE=true
   JWT_SECRET=replace-with-a-secure-random-secret-at-least-32-characters
   WEBHOOK_CRON_SECRET=replace-with-a-webhook-maintenance-secret
   ADMIN_EMAIL=owner@apu.edu.my
   ADMIN_PASSWORD=OwnerSecure2026!
   DEMO_PASSWORD=AtlasDemo2026!
   FRONTEND_URL=http://localhost:3000
   CAMPUS_TIMEZONE=Asia/Kuala_Lumpur
   ```

3. Launch the FastAPI server on port `8001`:
   ```bash
   .venv/bin/uvicorn server:app --host 0.0.0.0 --port 8001 --reload
   ```
   *(On initial startup with `DEMO_MODE=true`, the backend automatically creates all MongoDB indexes and seeds **11 campus locations**, **28 wireless access points**, **30 lab workstations**, default staff accounts, active shifts, sample tickets, and **24 hours of historical telemetry**).*
   - **API Health Check**: `http://localhost:8001/api/health`
   - **Interactive Swagger / OpenAPI Docs**: `http://localhost:8001/docs`

### 3. Frontend Configuration & Launch
1. Open a second terminal, navigate to `frontend/`, and install dependencies:
   ```bash
   cd frontend
   npm install --legacy-peer-deps
   ```
2. Create `frontend/.env`:
   ```dotenv
   REACT_APP_BACKEND_URL=http://localhost:8001
   PORT=3000
   ```
3. Start the React development server:
   ```bash
   npm start
   ```
   Open your browser and navigate to **`http://localhost:3000`** (unauthenticated sessions redirect cleanly to **`http://localhost:3000/login`**).

### 4. Optional Demo Database Reset & Test Suite Execution
To wipe and re-seed the demonstration database back to a pristine baseline before a viva or grading session:
```bash
cd backend
.venv/bin/python reset_demo.py --confirm RESET-ATLAS-DEMO
```
To run the full **57-test automated backend suite** (uses in-memory `mongomock-motor`, requiring zero live MongoDB connection) and **frontend type/build checks**:
```bash
# Backend tests & linters (from project root)
backend/.venv/bin/pip install -r backend/requirements-dev.txt
backend/.venv/bin/pytest
backend/.venv/bin/flake8 backend tests

# Frontend static verification
cd frontend && npm run typecheck && npm run format:check && npm run build
```

---

## 🔑 Test Credentials for Evaluation

The database is pre-seeded with ready-to-use demonstration accounts across all 3 operational role tiers (using `DEMO_PASSWORD` = **`AtlasDemo2026!`** from the sample `.env` above):

| Role Tier | Email Address | Password | Staff Name | Key Modules & Routes to Evaluate |
| :--- | :--- | :--- | :--- | :--- |
| **Administrator** | `admin@apu.edu.my` | `AtlasDemo2026!` | Alex Morgan | `/`, `/assets`, `/locations`, `/users`, `/shifts`, `/reports`, `/audit` |
| **Network Engineer** | `engineer@apu.edu.my` | `AtlasDemo2026!` | Daniel Reyes | `/`, `/monitoring` *(Fault Simulation & Diagnostics)*, `/tickets` *(Tier 2 Queue)* |
| **IT Assistant** | `assistant@apu.edu.my` | `AtlasDemo2026!` | Jamie Santos | `/`, `/shifts` *(Acknowledge & Handover)*, `/checklists` *(2D Lab Map & Inspections)* |
| **Network Engineer 2** | `sofia@apu.edu.my` | `AtlasDemo2026!` | Sofia Cruz | *(Test multi-engineer Tier 2 ticket triage & concurrent remediation)* |
| **IT Assistant 2** | `mika@apu.edu.my` | `AtlasDemo2026!` | Mika Flores | *(Test multi-assistant shift scheduling, overlap guards & lab handovers)* |
| **Owner Admin** | `owner@apu.edu.my` | `OwnerSecure2026!` | Campus Owner | *(Protected root administrator configured via `ADMIN_EMAIL` / `ADMIN_PASSWORD`)* |

*(Additional seeded IT Assistant roster accounts: `leo@apu.edu.my`, `nina@apu.edu.my`, and `kai@apu.edu.my` — all using `AtlasDemo2026!`).*

---

## 📡 Telemetry Algorithms, Fault Escalation & SLA Mechanics

### 1. Deterministic Wireless Telemetry & Honest Anomaly Classification
Each of the 28 campus access points is modeled using zone-specific baseline profiles (computing labs, lecture theatres, library, canteen, lounge, outdoor bus stop) combined with sinusoidal diurnal client waves across six injectable operational states:
- **Online (`normal`)**: Healthy client density, balanced airtime load (`12% – 78%`), and low RTT latency.
- **Congested (`congestion` / `degradation`)**: High wireless client density and airtime load (`85% – 98%`) with elevated packet queue depth (`260+` frames) and RTT spikes (`122+ ms`).
- **Offline (`outage`)**: Confirmed hardware or PoE link loss (`0` clients, `0.0 Mbps` throughput, `null` RTT).
- **Feed Interrupted (`stale`)**: Triggered by `feed` interruption, `flapping` microbursts, or telemetry silence exceeding **20 minutes (`1,200s`)**—honestly distinguishing unmonitored telemetry daemons from confirmed hardware outages.

### 2. Automated Tier 1 / Tier 2 Fault Routing & Deduplication
When an IT Assistant fails any item on a 5-point workstation checklist or an operator reports an incident, the engine computes a composite deduplication key (`active_key = "<asset_id>:<category>"`):
- If an unresolved ticket already exists for that asset and fault category, the report appends a timestamped corroboration event to the existing ticket rather than cluttering the queue with duplicates.
- **Tier 1 (Lab Support)**: Workstation hardware faults (*Power & Boot*, *Display*, *Keyboard & Mouse*, *OS & Software*).
- **Tier 2 (NOC Engineering)**: All `AP-*` access point anomalies and workstation *Network Connectivity* failures are automatically escalated to **Tier 2** and elevated from `medium` to `high` priority.

### 3. SLA Compliance & Mean Time to Resolution (MTTR)
Operational reports (`/reports`) and executive dashboard snapshots compute real-time KPIs directly from committed records:

$$\text{MTTR (minutes)} = \frac{1}{N_{\text{resolved}}} \sum_{i=1}^{N_{\text{resolved}}} \frac{t_{\text{resolved}, i} - t_{\text{created}, i}}{60}$$

$$\text{Shift Acknowledgement Rate} = \left( \frac{N_{\text{acknowledged}} + N_{\text{completed}}}{N_{\text{active shifts}}} \right) \times 100\%$$

*(Note: When $N_{\text{resolved}} = 0$, the reporting engine returns `null` rather than fabricating a synthetic average).*

---

## 🎓 Academic Learning Outcomes Demonstrated

This capstone project demonstrates core university software engineering and network operations competencies:
1. **Full-Stack Asynchronous Web Engineering**: End-to-end integration of an async Python/FastAPI REST service with a strictly typed React 19 + TypeScript single-page application.
2. **Database Modeling, Indexing & Concurrency Control**: Designing compound unique, partial-filter, and TTL indexes alongside distributed MongoDB lease locks to guarantee data integrity under concurrent writes.
3. **Clean Software Architecture & Automated Verification**: Enforcing unidirectional domain module boundaries via AST static analysis, backed by 57 automated `pytest` tests and GitHub Actions CI.
4. **Web Security & Defensive API Design**: Implementing `HttpOnly` JWT cookie authentication, `bcrypt` hashing, sliding-window rate limiting, strict CORS/`Origin` verification, anti-CSRF headers, and 3-tier RBAC.
5. **Operational Observability & UX Design**: Translating complex NOC telemetry, 2D physical lab readiness maps, and SLA compliance metrics into an accessible, mobile-responsive Dark/Light interface with instant CSV and printable PDF exports.

---

<div align="center">
  <p><b>Built with ❤️ for Campus Network Reliability & Academic Excellence.</b></p>
  <p><i>Atlas NetCare Platform © 2026 · Asia Pacific University of Technology & Innovation (APU)</i></p>
</div>
