"""Admin flows over HTTP: inventory, campus locations, team accounts."""

from fastapi.testclient import TestClient

from .conftest import DEMO_PASSWORD

ADMIN = "admin@apu.edu.my"


def second_client():
    """A separate browser with its own cookies, for checks that need two signed-in users at once."""
    from server import app

    return TestClient(app, base_url="https://testserver", headers={"X-Atlas-Request": "1"})


def new_pc(tag="PC-TEST-01", lab_id="lab-1", **extra):
    return {"tag": tag, "name": "Test PC", "kind": "PC", "lab_id": lab_id, **extra}


# Assets


def test_new_pc_gets_a_dhcp_address_on_the_workstation_vlan(client, login):
    login(ADMIN)
    asset = client.post("/api/assets", json=new_pc(mac="aa-bb-cc-11-22-33")).json()
    assert asset["tag"] == "PC-TEST-01" and asset["vlan"] == 10
    assert asset["ip"].startswith("10.10.1.")
    assert asset["mac"] == "AA:BB:CC:11:22:33"


def test_pcs_can_only_go_in_computing_labs(client, login):
    login(ADMIN)
    assert client.post("/api/assets", json=new_pc(lab_id="zone-canteen")).status_code == 422


def test_bad_hardware_id_is_rejected(client, login):
    login(ADMIN)
    assert client.post("/api/assets", json=new_pc(mac="not a mac!")).status_code == 422


def test_moving_an_asset_updates_lab_and_address(client, login):
    login(ADMIN)
    moved = client.patch("/api/assets/pc-10", json={"lab_id": "lab-2", "mac": "001122334455"}).json()
    assert moved["lab_name"] == "Computing Lab B"
    assert moved["ip"].startswith("10.10.2.")
    assert moved["mac"] == "00:11:22:33:44:55"


def test_archiving_keeps_the_asset_but_only_once(client, login):
    login(ADMIN)
    archived = client.patch("/api/assets/pc-10/archive").json()
    assert archived["archived"] is True
    assert client.patch("/api/assets/pc-10/archive").status_code == 404
    assert any(a["id"] == "pc-10" for a in client.get("/api/assets").json())


def test_deleting_an_asset_removes_it(client, login):
    login(ADMIN)
    assert client.delete("/api/assets/pc-10").status_code == 200
    assert all(a["id"] != "pc-10" for a in client.get("/api/assets").json())
    assert client.delete("/api/assets/pc-10").status_code == 404


# Locations


ROOM = {"code": "T-01-01", "name": "Test Room", "block": "Block T", "level": "Level 1", "room": "Room 01"}


def test_location_lifecycle(client, login):
    login(ADMIN)
    created = client.post("/api/locations", json={**ROOM, "category": "Classroom"}).json()
    assert created["id"] == "loc-t-01-01" and created["equipment_count"] == 0
    assert client.post("/api/locations", json=ROOM).status_code == 409

    renamed = client.patch(f"/api/locations/{created['id']}", json={"name": "Renamed Room"}).json()
    assert renamed["name"] == "Renamed Room"

    assert client.delete(f"/api/locations/{created['id']}").status_code == 200
    assert all(loc["id"] != created["id"] for loc in client.get("/api/locations").json())


def test_location_with_equipment_cannot_be_deleted(client, login):
    login(ADMIN)
    assert client.delete("/api/locations/lab-1").status_code == 409


def test_renaming_a_lab_renames_it_on_its_assets(client, login):
    login(ADMIN)
    client.patch("/api/locations/lab-2", json={"name": "Lab Bravo"})
    pc = next(a for a in client.get("/api/assets").json() if a["id"] == "pc-11")
    assert pc["lab_name"] == "Lab Bravo"


# Team


def test_new_team_member_can_sign_in(client, login):
    login(ADMIN)
    member = {"name": "Test User", "email": "Test.User@apu.edu.my", "role": "assistant", "password": "StrongPass2026"}
    created = client.post("/api/users", json=member).json()
    assert created["email"] == "test.user@apu.edu.my" and "password_hash" not in created
    assert client.post("/api/users", json=member).status_code == 409
    assert client.post("/api/users", json={**member, "email": "x@apu.edu.my", "scope": "Mars"}).status_code == 422

    other = second_client()
    response = other.post("/api/auth/login", json={"email": "test.user@apu.edu.my", "password": "StrongPass2026"})
    assert response.status_code == 200


def test_suspending_a_member_ends_their_session(client, login):
    other = second_client()
    assert other.post("/api/auth/login", json={"email": "leo@apu.edu.my", "password": DEMO_PASSWORD}).status_code == 200
    assert other.get("/api/auth/me").status_code == 200

    login(ADMIN)
    assert client.patch("/api/users/asst-3", json={"active": False}).json()["active"] is False
    assert other.get("/api/auth/me").status_code == 401


def test_admins_cannot_suspend_or_demote_themselves(client, login):
    login(ADMIN)
    assert client.patch("/api/users/admin", json={"active": False}).status_code == 409
    assert client.patch("/api/users/admin", json={"role": "engineer"}).status_code == 409
    assert client.patch("/api/users/admin", json={"name": "Alex M."}).json()["name"] == "Alex M."
