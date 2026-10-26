"""End-to-end API tests: real FastAPI routes, real auth cookies, in-memory MongoDB seeded like a first start."""

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from .conftest import DEMO_PASSWORD, dump, run

ADMIN = "admin@apu.edu.my"
ENGINEER = "engineer@apu.edu.my"
ASSISTANT = "assistant@apu.edu.my"
MIKA = "mika@apu.edu.my"
NINA = "nina@apu.edu.my"
MYT = ZoneInfo("Asia/Kuala_Lumpur")
ALL_PASS = {"power": "pass", "display": "pass", "peripherals": "pass", "network": "pass", "software": "pass"}


def day(offset_days, hour):
    """A naive campus-local timestamp, the way the roster form sends it."""
    base = datetime.now(MYT).replace(hour=0, minute=0, second=0, microsecond=0, tzinfo=None)
    return (base + timedelta(days=offset_days, hours=hour)).isoformat()


# Sign-in


def test_login_me_and_logout(client, login):
    assert login(ADMIN)["role"] == "admin"
    assert client.get("/api/auth/me").json()["email"] == ADMIN
    assert client.post("/api/auth/logout").status_code == 200
    assert client.get("/api/auth/me").status_code == 401


def test_wrong_password_is_rejected(client):
    response = client.post("/api/auth/login", json={"email": ADMIN, "password": "not-the-password"})
    assert response.status_code == 401


# Role permissions


def test_role_permissions_are_enforced_by_the_api(client, login):
    login(ASSISTANT)
    assert (
        client.post(
            "/api/assets", json={"tag": "PC-X-01", "name": "Test PC", "kind": "PC", "lab_id": "lab-1"}
        ).status_code
        == 403
    )
    assert client.post("/api/simulation", json={"asset_id": "ap-01", "scenario": "outage"}).status_code == 403
    login(ENGINEER)
    checklist = {"request_id": "req-engineer-1", "asset_id": "pc-05", "checks": ALL_PASS}
    assert client.post("/api/checklists", json=checklist).status_code == 403
    assert client.get("/api/users").status_code == 403


# Checklists


def test_failed_checklist_opens_a_ticket_and_replays_safely(client, login):
    login(ASSISTANT)
    body = {
        "request_id": "req-0001-abcd",
        "asset_id": "pc-05",
        "checks": {**ALL_PASS, "display": "fail"},
        "notes": "Flicker",
    }
    first = client.post("/api/checklists", json=body).json()
    assert first["result"] == "failed" and first["replayed"] is False
    assert [t["category"] for t in first["tickets"]] == ["display"]

    replay = client.post("/api/checklists", json=body).json()
    assert replay["replayed"] is True and replay["id"] == first["id"]

    changed = {**body, "notes": "Different payload, same key"}
    assert client.post("/api/checklists", json=changed).status_code == 409


def test_checklist_needs_all_five_checks_and_a_workstation(client, login):
    login(ASSISTANT)
    partial = {"request_id": "req-0002-abcd", "asset_id": "pc-05", "checks": {"power": "pass"}}
    assert client.post("/api/checklists", json=partial).status_code == 422
    on_ap = {"request_id": "req-0003-abcd", "asset_id": "ap-01", "checks": ALL_PASS}
    assert client.post("/api/checklists", json=on_ap).status_code == 422


# Tickets


def incident(asset_id="pc-06", category="power", priority="medium"):
    return {
        "asset_id": asset_id,
        "category": category,
        "title": "No power",
        "description": "Dead PC",
        "priority": priority,
    }


def test_repeat_fault_reports_link_to_one_open_ticket(client, login):
    login(ASSISTANT)
    first = client.post("/api/incidents", json=incident(priority="low")).json()
    assert first["status"] == "open" and first["priority"] == "low"
    login(MIKA)
    second = client.post("/api/incidents", json=incident()).json()
    assert second["id"] == first["id"]
    assert set(second["reporter_ids"]) == {"assistant", "asst-2"}


def test_ticket_lifecycle_rules(client, login):
    login(ASSISTANT)
    ticket = client.post("/api/incidents", json=incident()).json()
    assert client.patch(f"/api/tickets/{ticket['id']}", json={"status": "in_progress"}).status_code == 403

    login(ENGINEER)
    url = f"/api/tickets/{ticket['id']}"
    long_notes = "Replaced the power supply unit."
    assert client.patch(url, json={"status": "resolved", "resolution_notes": long_notes}).status_code == 409
    started = client.patch(url, json={"status": "in_progress"})
    assert started.status_code == 200, started.text
    assert started.json()["assigned_name"] == "Daniel Reyes"
    assert client.patch(url, json={"status": "resolved", "resolution_notes": "short"}).status_code == 422
    assert client.patch(url, json={"status": "resolved", "resolution_notes": long_notes}).json()["status"] == "resolved"
    assert client.patch(url, json={"status": "in_progress"}).status_code == 409

    recurrence = client.post("/api/incidents", json=incident()).json()
    assert recurrence["id"] != ticket["id"]


def test_network_faults_route_to_tier_2_with_high_priority(client, login):
    login(ASSISTANT)
    ticket = client.post("/api/incidents", json=incident(category="network")).json()
    assert ticket["tier"].startswith("Tier 2") and ticket["assigned_role"] == "engineer"
    assert ticket["priority"] == "high"


# Reports


def test_mean_resolution_time_is_measured_not_invented(client, login):
    login(ADMIN)
    assert client.get("/api/reports").json()["mean_resolution_minutes"] is None

    login(ASSISTANT)
    ticket = client.post("/api/incidents", json=incident()).json()
    login(ENGINEER)
    client.patch(f"/api/tickets/{ticket['id']}", json={"status": "in_progress"})
    client.patch(
        f"/api/tickets/{ticket['id']}", json={"status": "resolved", "resolution_notes": "Fixed within the test."}
    )

    login(ADMIN)
    report = client.get("/api/reports").json()
    assert report["resolved"] == 1
    # Resolved seconds after opening; the old code replaced anything under 5 minutes with a made-up 48+ minutes.
    assert report["mean_resolution_minutes"] < 1
    lab_a = next(lab for lab in report["labs"] if lab["id"] == "lab-1")
    assert lab_a["assets"] > 0


# Shifts


def add_shift(client, start, end, assistant_id="asst-4"):
    return client.post(
        "/api/shifts", json={"assistant_id": assistant_id, "lab_id": "lab-1", "start": start, "end": end}
    )


def test_roster_rejects_overlaps_including_across_midnight(client, login):
    login(ADMIN)
    assert add_shift(client, day(2, 22), day(3, 2)).status_code == 200
    assert add_shift(client, day(3, 1), day(3, 3)).status_code == 409
    assert add_shift(client, day(3, 2), day(3, 6)).status_code == 200
    assert add_shift(client, day(4, 10), day(4, 9)).status_code == 422
    assert add_shift(client, day(4, 0), day(5, 1)).status_code == 422


def test_acknowledge_complete_and_cancel_are_safe_to_repeat(client, login):
    login(ADMIN)
    shift = add_shift(client, day(2, 8), day(2, 12)).json()
    login(NINA)
    first_ack = client.post(f"/api/shifts/{shift['id']}/acknowledge").json()
    assert first_ack["status"] == "acknowledged"
    assert (
        client.post(f"/api/shifts/{shift['id']}/acknowledge").json()["acknowledged_at"] == first_ack["acknowledged_at"]
    )

    done = client.post(f"/api/shifts/{shift['id']}/complete", json={"handover_notes": "All good"}).json()
    again = client.post(f"/api/shifts/{shift['id']}/complete", json={"handover_notes": "Second try"}).json()
    assert again["completed_at"] == done["completed_at"] and again["handover_notes"] == "All good"

    login(ADMIN)
    assert client.post(f"/api/shifts/{shift['id']}/cancel").status_code == 409


def test_cancelling_twice_writes_one_audit_entry(client, login, mock_db):
    login(ADMIN)
    shift = add_shift(client, day(2, 13), day(2, 17)).json()
    assert client.post(f"/api/shifts/{shift['id']}/cancel").status_code == 200
    assert client.post(f"/api/shifts/{shift['id']}/cancel").status_code == 200
    assert run(mock_db.audit.count_documents({"action": "Shift cancelled", "resource_id": shift["id"]})) == 1


# Inventory


def test_asset_tags_stay_unique(client, login):
    login(ADMIN)
    duplicate = {"tag": "PC-CL-A-01", "name": "Duplicate", "kind": "PC", "lab_id": "lab-1"}
    assert client.post("/api/assets", json=duplicate).status_code == 409
    assert client.patch("/api/assets/pc-02", json={"tag": "PC-CL-A-01"}).status_code == 409


def test_removed_team_member_can_no_longer_sign_in(client, login):
    login(ADMIN)
    assert client.delete("/api/users/asst-5").status_code == 200
    assert client.delete("/api/users/owner").status_code == 409
    response = client.post("/api/auth/login", json={"email": "kai@apu.edu.my", "password": DEMO_PASSWORD})
    assert response.status_code == 401


# Monitoring


def test_simulated_outage_shows_up_and_recovers(client, login):
    login(ENGINEER)
    assert client.post("/api/simulation", json={"asset_id": "ap-01", "scenario": "outage"}).json()["affected"] == 1
    snapshot = client.get("/api/monitoring").json()
    assert next(ap for ap in snapshot["aps"] if ap["id"] == "ap-01")["status"] == "offline"
    assert any(alert["asset_id"] == "ap-01" for alert in snapshot["alerts"])

    client.post("/api/simulation", json={"asset_id": "ap-01", "scenario": "normal"})
    snapshot = client.get("/api/monitoring").json()
    assert next(ap for ap in snapshot["aps"] if ap["id"] == "ap-01")["status"] == "online"
    assert not any(alert["asset_id"] == "ap-01" for alert in snapshot["alerts"])


# Background work


READ_ENDPOINTS = [
    "/api/auth/me",
    "/api/labs",
    "/api/assets",
    "/api/locations",
    "/api/users",
    "/api/shifts",
    "/api/checklists",
    "/api/tickets",
    "/api/monitoring",
    "/api/monitoring/ap-01/history",
    "/api/alerts",
    "/api/overview",
    "/api/audit",
    "/api/reports",
]


def test_get_endpoints_do_not_write(client, login, mock_db):
    login(ADMIN)
    before = run(dump(mock_db))
    for path in READ_ENDPOINTS:
        assert client.get(path).status_code == 200, path
    assert run(dump(mock_db)) == before


def test_maintenance_tick_creates_reminders_and_moves_demo_shifts_to_today(mock_db):
    import server

    run(server.maintenance_tick(0))
    shifts = run(mock_db.shifts.find({"cancelled": False}).to_list(None))
    reminders = run(mock_db.reminders.find({}).to_list(None))
    assert {r["shift_id"] for r in reminders} == {s["id"] for s in shifts}

    morning = next(s for s in shifts if s["id"] == "shift-seed-0")
    start = datetime.fromisoformat(morning["start"])
    assert start.date() == datetime.now(MYT).date() and start.hour == 8

    alerts = run(mock_db.alerts.find({"active": True}).to_list(None))
    assert {"ap-07", "ap-11"} <= {a["asset_id"] for a in alerts}
