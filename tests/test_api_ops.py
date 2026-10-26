"""Operational flows over HTTP: sessions, batch inspections, tickets, monitoring tools, cron, startup."""

import os
import sys

import pytest

from .conftest import DEMO_PASSWORD, run

ADMIN = "admin@apu.edu.my"
ENGINEER = "engineer@apu.edu.my"
ASSISTANT = "assistant@apu.edu.my"


# Sessions and profile


def test_refresh_issues_new_tokens_for_a_live_session(client, login):
    login(ASSISTANT)
    assert client.post("/api/auth/refresh").json()["email"] == ASSISTANT
    client.post("/api/auth/logout")
    assert client.post("/api/auth/refresh").status_code == 401


def test_role_buttons_sign_in_as_that_role(client):
    assert client.post("/api/auth/demo", json={"role": "engineer"}).json()["role"] == "engineer"
    assert client.post("/api/auth/demo", json={"role": "nobody"}).status_code == 404


def test_password_recovery_is_simulated(client):
    message = client.post("/api/auth/forgot-password", json={"email": ASSISTANT}).json()["message"]
    assert message.startswith("SIMULATED")


def test_profile_rename_follows_to_the_roster(client, login):
    login(ASSISTANT)
    assert client.patch("/api/auth/profile", json={"name": "Jamie S."}).json()["name"] == "Jamie S."
    seeded = next(s for s in client.get("/api/shifts").json() if s["assistant_id"] == "assistant")
    assert seeded["assistant_name"] == "Jamie S."
    assert client.patch("/api/auth/profile", json={"email": "mika@apu.edu.my"}).status_code == 409


def test_profile_password_change(client, login):
    login(ASSISTANT)
    change = {"current_password": DEMO_PASSWORD, "new_password": "NewSecret2026"}
    assert client.patch("/api/auth/profile", json=change).status_code == 200
    assert client.patch("/api/auth/profile", json={"new_password": "Another2026"}).status_code == 422
    client.post("/api/auth/logout")
    assert client.post("/api/auth/login", json={"email": ASSISTANT, "password": "NewSecret2026"}).status_code == 200


# Inspections and tickets


def test_batch_inspection_passes_healthy_pcs_only(client, login):
    login(ASSISTANT)
    batch = client.post("/api/checklists/batch", json={"lab_id": "lab-2"}).json()
    assert 1 <= batch["count"] <= 4
    assert all(c["result"] == "passed" for c in batch["created"])
    # pc-14 has an open display ticket from the seed, so the batch must skip it.
    assert "pc-14" not in {c["asset_id"] for c in batch["created"]}
    detail = client.get(f"/api/checklists/{batch['created'][0]['id']}").json()
    assert detail["lab_name"] == "Computing Lab B" and "fingerprint" not in detail


def test_ticket_detail_and_troubleshooting_notes(client, login):
    login(ENGINEER)
    assert client.get("/api/tickets/ticket-seed-0").json()["number"] == "INC-1001"
    assert client.get("/api/tickets/missing").status_code == 404
    noted = client.post("/api/tickets/ticket-seed-0/comment", json={"comment": "Reseated the cable"}).json()
    assert noted["events"][-1]["action"] == "Troubleshooting note added"


# Monitoring tools


def test_diagnose_and_remediate_an_access_point(client, login):
    login(ENGINEER)
    client.post("/api/simulation", json={"asset_id": "ap-03", "scenario": "outage"})
    diagnosis = client.post("/api/monitoring/ap-03/diagnose").json()
    assert diagnosis["status"] == "offline" and diagnosis["packet_loss_pct"] == 100
    fixed = client.post("/api/monitoring/ap-03/remediate", json={"action": "reboot_poe"}).json()
    assert fixed["status"] == "online" and fixed["asset"]["status"] == "online"
    assert client.post("/api/monitoring/sample").status_code == 200


def test_history_for_an_unknown_access_point_is_404(client, login):
    login(ENGINEER)
    assert client.get("/api/monitoring/pc-01/history").status_code == 404


# Scheduler endpoint


def cron(client, run_id="run-1", secret=None, body=None):
    headers = {"Authorization": f"Bearer {secret or os.environ['WEBHOOK_CRON_SECRET']}", "X-Webhook-Id": run_id}
    return client.post("/api/cron/maintain", headers=headers, json=body or {"event": "schedule.triggered"})


def test_cron_needs_the_secret_and_a_valid_envelope(client):
    assert client.post("/api/cron/maintain", json={"event": "schedule.triggered"}).status_code == 401
    assert cron(client, secret="wrong").status_code == 401
    assert cron(client, body={"event": "something.else"}).status_code == 400


def test_cron_runs_once_per_run_id(client, mock_db):
    first = cron(client)
    assert first.status_code == 202 and first.json() == {"accepted": True}
    assert cron(client).json() == {"accepted": True, "duplicate": True}
    assert run(mock_db.cron_runs.find_one({"run_id": "run-1"}))["status"] == "complete"


# Startup and the reset script


def test_startup_seeds_runs_a_tick_and_answers_health(mock_db):
    from fastapi.testclient import TestClient

    from server import app

    run(mock_db.users.update_one({"id": "asst-5"}, {"$set": {"email": "kai@atlas.demo"}}))
    with TestClient(app, base_url="https://testserver") as client:
        assert client.get("/api/health").json()["status"] == "ok"
    # The seed migrates old demo addresses, and the startup tick creates reminders.
    assert run(mock_db.users.find_one({"id": "asst-5"}))["email"] == "kai@apu.edu.my"
    assert run(mock_db.reminders.count_documents({})) > 0


def test_reset_refuses_a_database_without_the_demo_suffix(mock_db, monkeypatch):
    import reset_demo

    monkeypatch.setattr(reset_demo, "db", mock_db)
    monkeypatch.setattr(sys, "argv", ["reset_demo.py", "--confirm", "RESET-ATLAS-DEMO"])
    with pytest.raises(SystemExit, match="REFUSED"):
        run(reset_demo.run())
    assert run(mock_db.users.count_documents({})) == 9
