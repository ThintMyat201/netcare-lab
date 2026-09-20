# Atlas NetCare — Academic Demo

## Original problem statement
Responsive web app demonstrating campus Wi-Fi monitoring and IT lab operations, not production monitoring. IT assistants view APs/shifts, acknowledge reminders, submit PC checklists and report incidents. Engineers review synthetic telemetry/history/alerts and resolve tickets with required notes. Admins provision accounts/roles/assets/manual shifts and see audit/reports. Persistent operational records; explicitly synthetic telemetry and notifications. Controls for congestion, AP outage, feed interruption and recovery.

Main flow: admin prepares users/assets/shifts → assistant acknowledges shift and inspects PC → failed check creates/links an open ticket by asset/fault category → engineer investigates/resolves → audit/reports reflect outcome. Stack replaces Laravel proposal with React + TypeScript, FastAPI, MongoDB.

Safeguards: interrupted feed means stale/unknown not inferred outage; idempotent checklist retries; unique concurrent open ticket; in-memory unsent drafts/no offline sync; overlap rejection including cross-midnight in documented timezone; exactly-once reminder creation and exposed missed acknowledgement; archive/deactivate retain history and revoked accounts lose access; hashed passwords, rate limits, record permissions/audit, isolated public demo. Verify restart persistence, forbidden actions, backend unavailable, retries, telemetry recovery, and under-7-second core interactions on documented dataset/load. Demo-only reset/setup/walkthrough. No real network, email, closed-browser alarms, native app, automatic roster optimization. Future-only real read-only telemetry/notifications/offline sync/production availability.

## Confirmed user choices
- Asia/Manila UTC+8; 3 labs, 12 APs, 30 PCs, 9 accounts; evaluate 10 concurrent users.
- Professional accessible monitoring interface selected by designer. No deadline; complete demo now. Hosting unspecified.
- Owner account email: phonemyat2k16@gmail.com (provided by user). Public demo accounts remain fictional.

## Architecture and personas
React TypeScript role-aware routes with custom dark command-center styling, Outfit/IBM Plex Sans/JetBrains Mono, Shadcn modals/buttons, Recharts. Responsive sidebar, dashboard/monitor/checklists/tickets/shifts/inventory/team/reports/audit/alerts. Secure cookie JWT + persisted sessions; active account loaded per request. Roles: admin, engineer, assistant. RBAC + assistant ownership, single shared demo campus; no extra tenancy engine.
FastAPI modules core/auth/seed/operations/monitoring/reporting. Motor MongoDB isolated DB_NAME_atlas_demo. UUID IDs, no ObjectId responses. Unique indexes protect asset tags, emails, open faults, checklist request keys, reminders, telemetry. Mongo leases protect concurrency. TTL and explicit 20k cap bound telemetry. Platform 15-minute cron with auth/deduplication/background work; no live campus integration.

## Implemented — 2026-09-19
- All primary routes and workflows, login/logout/refresh, provisioning, roles/deactivation/admin password reset and simulated recovery.
- Fictional seed: 3 labs, 12 APs, 30 PCs, 9 users, initial tickets/shifts and 24-hour telemetry. Public isolated demo auto-entry plus explicit role sign-in.
- Checklist five-category inspection, tab-memory drafts, same-key retries, matching fault tickets, lifecycle validation/notes. User/asset archival semantics.
- Manual rosters in PHT, atomic overlap prevention, cancelled history, one persisted reminder per shift, idempotent acknowledgements/missed state.
- AP charts/status/details/scenarios/sample controls, explicit stale semantics/recovery, deduplicated alerts, audit, operational reports and CSV exports.
- README setup/permission matrix/invariants/evaluator walkthrough; guarded CLI reset. Testing underway; evidence to follow.

## Prioritized backlog
P0: Complete end-to-end permission/failure-path/concurrency/restart/load verification and fix findings.
P1: Record measured test evidence and limitations in EVALUATION.md; improve any visual/accessibility issues found.
P2 / future only: authorized real read-only telemetry, notification delivery, offline synchronization and production availability work. Not part of academic demo acceptance.

## Next tasks
Browser screenshots, testing-agent verification, fix findings, finalize measured handoff.
