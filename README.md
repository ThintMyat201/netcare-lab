# Atlas NetCare — Academic Demo

React + TypeScript / FastAPI / MongoDB campus operations demonstration. **Not a production monitoring service.** Telemetry and notifications are simulated; operational records are persistent. No live network access, network configuration, real email, offline sync or closed-browser alarms.

## Setup
Keep existing `MONGO_URL` and `REACT_APP_BACKEND_URL`. Required backend env: `DB_NAME`, `DEMO_MODE=true`, `JWT_SECRET`, `WEBHOOK_CRON_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `DEMO_PASSWORD`, `FRONTEND_URL`, `CAMPUS_TIMEZONE=Asia/Manila`. Generate per-installation secrets; never commit env files.
Install: `cd backend && pip install -r requirements.txt`, then `cd frontend && yarn install`. The provided supervisor serves FastAPI on `0.0.0.0:8001` and React on 3000. Use `supervisorctl restart backend frontend` after dependencies/env changes; code hot-reloads. `GET /api/health` verifies the database.

## Isolated academic access
Demo database uses the configured `DB_NAME` with `_atlas_demo` suffix; non-demo records are never read. Nine accounts: 2 admins (including owner), 2 engineers, 5 assistants. Dataset: 3 labs, 12 APs, 30 PCs, about 24 hours of historical synthetic samples.

Owner email uses the requested `ADMIN_EMAIL`; private password is `ADMIN_PASSWORD`. Fictional public accounts: `admin@atlas.demo`, `engineer@atlas.demo`, `assistant@atlas.demo`; shared demo password `AtlasDemo2026!` (from `DEMO_PASSWORD`). Explicit role buttons are available at sign-in. First workspace visit creates an isolated public demo-admin session; sign-out returns to sign-in. Do not enter real student/campus operational data. The owner email is the only user-requested real account identifier.

Recovery is **SIMULATED**: generic acknowledgement, no email/token/password change. An admin can reset passwords in Team & access. Deactivation and resets revoke sessions.

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

Role and active status are reloaded server-side each request. Foreign assistant records return 404; forbidden role actions return 403. Users/assets have no deletion endpoint. Admins cannot demote/deactivate their current account. Sign-in allows 10 attempts/client/account/15-minute bucket. Access JWT (15 min) and refresh JWT (7 days) use Secure/httpOnly cookies and persisted revocable sessions. CORS allows configured frontend and optional explicit PREVIEW_PROXY_ORIGIN (the preview proxy rewrites Origin). Browser/cookie mutations require X-Atlas-Request: 1 and validate Origin. The React API client sends the custom header automatically.

## Invariants
- Checklist unique `(created_by, request_id)` plus Mongo lease and payload fingerprint. Same-key retry returns the same saved record. Uncertain transport errors retain and lock the original payload for retry. Drafts remain in tab memory across navigation, not disk/offline sync.
- Ticket partial unique `active_key=asset_id:category`: concurrent fault reports link to one open ticket. Reporter access is added atomically. Resolution removes the active key for future recurrence. Lifecycle: open → in_progress → resolved. Resolution requires at least 10 note characters. Resolved tickets are read-only.
- Shift entry timezone **Asia/Manila / PHT / UTC+8**; storage UTC ISO. End must follow start, max 24 hours. Per-assistant Mongo lease protects cross-midnight overlap checks. Adjacent shifts allowed; cancelled records retained.
- Exactly one reminder per shift. Due 15 minutes before start; unacknowledged shifts show Missed once start passes. These are states, not duplicate alert rows. Acknowledgement preserves its first saved time. In-app only.
- Deterministic normal, congestion (85%+ utilization), explicit outage, feed interruption, recovery. Interrupted or older-than-20-minute samples show **Stale / unknown**, never inferred outage. Interrupted feeds preserve last-seen. Recovery closes prior active alerts and resumes samples.
- Telemetry bounded by **7 days and 20,000 rows** via TTL plus prune. Initial history is 24 hours/15-minute intervals. AP detail displays latest 200 samples. Manual controls create server-confirmed samples.
- Maintenance runs every 15 minutes via any external scheduler (cron, systemd timer, hosted cron) issuing an authenticated `POST /api/cron/maintain` with the `WEBHOOK_CRON_SECRET`; immediate acknowledgement/background work, persistent run-ID deduplication. Interrupted job state is recorded; next tick reconciles reminders/telemetry. Full durable retries are outside this demo.

## Repeatable reset — destructive to demo records only
Stop evaluations. Run `cd /app/backend && python reset_demo.py --confirm RESET-ATLAS-DEMO`. Refuses non-demo mode or a non-demo-suffixed database. No public reset endpoint. Rebuilds indexes/fictional data and invalidates old sessions. Normal restarts never reset records. Do not reset with requests in flight.

## Evaluator walkthrough
1. Open Overview as demo admin; inspect AP statuses, timestamps and simulation badges.
2. Provision an assistant and add a PC. Duplicate email/tag should be rejected.
3. Assign a shift, attempt overlapping/cross-midnight assignments (rejected), then sign in as that assistant and acknowledge it.
4. Submit PC checklist: mark all passed, fail Network, add notes, submit. Follow the ticket link. Another same-category fault links to the existing open ticket.
5. As engineer, start investigation, enter required resolution notes, resolve. Empty notes cannot resolve.
6. As admin, confirm report and audit outcomes, export CSV. Archive PC/deactivate assistant; history remains and existing assistant session fails.
7. Run congestion → outage → feed interruption → recovery on an AP. Verify interruption means unknown and preserves last-seen; recovery restores data and closes alerts.
8. Block backend requests in browser. No false checklist success; draft remains. Unblock and retry original key.
9. Restart backend; saved records must remain. Test permission denials through the real API, not UI visibility alone.

## Evaluation
Core interactions target **under 7 seconds** with the confirmed **10 concurrent users** and documented dataset. This is a measured demo target, not annual uptime. See `EVALUATION.md` and `/app/test_reports/` for evidence. Hosting remains unspecified; no deadline was requested. Future: authorized read-only telemetry, real notifications, offline sync and production availability engineering.