import asyncio
import sys
from pathlib import Path
from datetime import datetime, timezone, timedelta

BACKEND_DIR = Path(__file__).resolve().parent.parent / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import monitoring  # noqa: E402
from monitoring import (  # noqa: E402
    Scenario,
    ap_history,
    metrics,
    monitoring as get_monitoring,
    simulation,
    sync_alerts,
)


class FakeCursor:
    def __init__(self, docs):
        self._docs = [dict(d) for d in docs]

    def sort(self, key, direction=1):
        self._docs.sort(key=lambda d: d.get(key, ""), reverse=(direction < 0))
        return self

    def limit(self, n):
        self._docs = self._docs[:n]
        return self

    async def to_list(self, _n=None):
        return [dict(d) for d in self._docs]


def _match(doc, query):
    for k, v in query.items():
        if k == "$or":
            if not any(_match(doc, sub) for sub in v):
                return False
        elif isinstance(v, dict):
            val = doc.get(k)
            if "$in" in v and val not in v["$in"]:
                return False
            if "$ne" in v and val == v["$ne"]:
                return False
            if "$gte" in v and (val is None or val < v["$gte"]):
                return False
            if "$lt" in v and (val is None or val >= v["$lt"]):
                return False
            if "$gt" in v and (val is None or val <= v["$gt"]):
                return False
        else:
            if doc.get(k) != v:
                return False
    return True


def _apply_update(doc, update, is_insert=False):
    if is_insert and "$setOnInsert" in update:
        for k, v in update["$setOnInsert"].items():
            doc.setdefault(k, v)
    if "$set" in update:
        doc.update(update["$set"])
    if "$unset" in update:
        for k in update["$unset"]:
            doc.pop(k, None)
    if "$inc" in update:
        for k, v in update["$inc"].items():
            doc[k] = doc.get(k, 0) + v
    if "$addToSet" in update:
        for k, v in update["$addToSet"].items():
            arr = list(doc.get(k, []))
            if v not in arr:
                arr.append(v)
            doc[k] = arr
    if "$push" in update:
        for k, v in update["$push"].items():
            arr = list(doc.get(k, []))
            arr.append(v)
            doc[k] = arr


class FakeCollection:
    def __init__(self, docs=None):
        self.docs = [dict(d) for d in (docs or [])]

    def find(self, query=None, projection=None):
        query = query or {}
        matched = [dict(d) for d in self.docs if _match(d, query)]
        return FakeCursor(matched)

    async def find_one(self, query=None, projection=None):
        query = query or {}
        for d in self.docs:
            if _match(d, query):
                return dict(d)
        return None

    async def insert_one(self, doc):
        self.docs.append(dict(doc))

    async def update_one(self, query, update, upsert=False):
        for d in self.docs:
            if _match(d, query):
                _apply_update(d, update, is_insert=False)
                return
        if upsert:
            new_doc = {k: v for k, v in query.items() if not k.startswith("$") and not isinstance(v, dict)}
            _apply_update(new_doc, update, is_insert=True)
            self.docs.append(new_doc)

    async def update_many(self, query, update):
        for d in self.docs:
            if _match(d, query):
                _apply_update(d, update, is_insert=False)

    async def find_one_and_update(self, query, update, upsert=False, return_document=None, projection=None):
        for d in self.docs:
            if _match(d, query):
                _apply_update(d, update, is_insert=False)
                return dict(d)
        if upsert:
            new_doc = {k: v for k, v in query.items() if not k.startswith("$") and not isinstance(v, dict)}
            _apply_update(new_doc, update, is_insert=True)
            self.docs.append(new_doc)
            return dict(new_doc)
        return None

    async def delete_one(self, query):
        for i, d in enumerate(self.docs):
            if _match(d, query):
                self.docs.pop(i)
                return

    async def delete_many(self, query):
        self.docs = [d for d in self.docs if not _match(d, query)]

    async def count_documents(self, query=None):
        query = query or {}
        return sum(1 for d in self.docs if _match(d, query))

    async def distinct(self, key, query=None):
        query = query or {}
        return list({d[key] for d in self.docs if _match(d, query) and key in d})


class FakeDB:
    def __init__(self):
        labs = [
            {"id": "lab-1", "name": "Computing Lab A", "code": "CL-A"},
            {"id": "lab-2", "name": "Computing Lab B", "code": "CL-B"},
            {"id": "lab-3", "name": "Innovation Lab", "code": "IL"},
        ]
        now_iso = datetime.now(timezone.utc).isoformat()
        aps = []
        for i in range(12):
            lab = labs[i // 4]
            n = i + 1
            state = "congestion" if n == 7 else "outage" if n == 11 else "normal"
            aps.append(
                {
                    "id": f"ap-{n:02}",
                    "tag": f"AP-{lab['code']}-{i % 4 + 1:02}",
                    "name": f"{lab['name']} · AP {i % 4 + 1:02}",
                    "kind": "AP",
                    "lab_id": lab["id"],
                    "lab_name": lab["name"],
                    "ip": f"10.20.{i // 4 + 1}.{n + 10}",
                    "model": "Aruba AP-515",
                    "archived": False,
                    "scenario": state,
                    "scenario_at": now_iso,
                    "last_seen": now_iso,
                    "created_at": now_iso,
                }
            )
        self.assets = FakeCollection(aps)
        self.telemetry = FakeCollection()
        self.alerts = FakeCollection()
        self.tickets = FakeCollection()
        self.audit = FakeCollection()
        self.counters = FakeCollection([{"key": "ticket", "value": 1003}])


ADMIN_USER = {"id": "admin", "name": "Alex Morgan", "email": "admin@atlas.demo", "role": "admin", "active": True}


def test_expanded_inventory_and_lab_variance():
    fake_db = FakeDB()
    at = datetime.now(timezone.utc)
    normal_aps = [a for a in fake_db.assets.docs if a["scenario"] == "normal"]
    assert len(normal_aps) == 10

    computed = [metrics(a, at) for a in normal_aps]
    client_counts = [m["clients"] for m in computed]
    loads = [m["load"] for m in computed]

    assert all(c is not None and c > 0 for c in client_counts)
    assert len(set(client_counts)) >= 6
    assert len(set(loads)) >= 6

    lab1_clients = [metrics(a, at)["clients"] for a in normal_aps if a["lab_id"] == "lab-1"]
    lab2_clients = [metrics(a, at)["clients"] for a in normal_aps if a["lab_id"] == "lab-2"]
    lab3_clients = [metrics(a, at)["clients"] for a in normal_aps if a["lab_id"] == "lab-3"]
    assert sum(lab3_clients) / len(lab3_clients) > sum(lab1_clients) / len(lab1_clients)
    assert sum(lab1_clients) / len(lab1_clients) > sum(lab2_clients) / len(lab2_clients)


def test_gradual_degradation_and_flapping_profiles():
    at = datetime.now(timezone.utc)
    ap = {
        "id": "ap-01",
        "tag": "AP-CL-A-01",
        "lab_id": "lab-1",
        "lab_name": "Computing Lab A",
        "scenario": "degradation",
        "last_seen": at.isoformat(),
    }
    ramp_loads = []
    ramp_queues = []
    for step in range(8):
        p = step / 7.0
        m = metrics({**ap, "degradation_progress": p}, at)
        ramp_loads.append(m["load"])
        ramp_queues.append(m["queue_depth"])

    assert ramp_loads[0] == 20
    assert ramp_loads[-1] == 95
    assert ramp_loads == sorted(ramp_loads)
    assert ramp_queues[-1] > ramp_queues[0] * 10

    flap_ap = {**ap, "scenario": "flapping"}
    states = set()
    for offset in range(6):
        t = at + timedelta(seconds=30 * offset)
        m = metrics({**flap_ap, "last_seen": t.isoformat()}, t)
        states.add(m["status"])
    assert "stale" in states
    assert "congested" in states


def test_simulation_lifecycle_alerts_tickets_and_baseline_restoration(monkeypatch):
    fake_db = FakeDB()
    monkeypatch.setattr(monitoring, "db", fake_db)
    import core

    monkeypatch.setattr(core, "db", fake_db)

    async def _run():
        # 1. Trigger Hardware Outage across Computing Lab A (lab-1)
        res_outage = await simulation(Scenario(asset_id="lab-1", scenario="outage"), user=ADMIN_USER)
        assert res_outage["affected"] == 4
        lab1_aps = await fake_db.assets.find({"lab_id": "lab-1"}).to_list(10)
        assert all(a["scenario"] == "outage" and a.get("synthetic_override") is True for a in lab1_aps)

        active_alerts = await fake_db.alerts.find({"lab_id": "lab-1", "active": True}).to_list(10)
        assert len(active_alerts) == 4
        assert all(al["status"] == "offline" and al["severity"] == "high" for al in active_alerts)

        open_tickets = await fake_db.tickets.find({"status": "open", "synthetic": True}).to_list(10)
        assert len(open_tickets) >= 1
        assert any(a["actor"] == "Alex Morgan" and "outage" in a["detail"] for a in fake_db.audit.docs)

        # 2. Trigger Telemetry Interruption on ap-05
        await simulation(Scenario(asset_id="ap-05", scenario="feed"), user=ADMIN_USER)
        ap5_detail = await ap_history("ap-05", user=ADMIN_USER)
        assert ap5_detail["asset"]["status"] == "stale"
        assert ap5_detail["asset"]["clients"] is None

        # 3. Trigger Gradual Degradation on Innovation Lab (lab-3)
        await simulation(Scenario(asset_id="lab-3", scenario="degradation"), user=ADMIN_USER)
        mon_lab3 = await get_monitoring(lab_id="lab-3", user=ADMIN_USER)
        assert all(a["load"] >= 85 and a["queue_depth"] > 200 for a in mon_lab3["aps"])

        # 4. Trigger Intermittent Link Flapping on ap-02
        await simulation(Scenario(asset_id="ap-02", scenario="flapping"), user=ADMIN_USER)
        ap2_hist = await ap_history("ap-02", user=ADMIN_USER)
        hist_statuses = {h["status"] for h in ap2_hist["history"][-9:]}
        assert "stale" in hist_statuses

        # 5. Restore Normal Operations across All Access Points
        res_restore = await simulation(Scenario(asset_id="all", scenario="normal"), user=ADMIN_USER)
        assert res_restore["affected"] == 12
        mon_all = await get_monitoring(user=ADMIN_USER)
        assert mon_all["stats"]["online"] == 12
        assert mon_all["stats"]["offline"] == 0
        assert mon_all["stats"]["congested"] == 0
        assert mon_all["stats"]["stale"] == 0
        assert len(mon_all["alerts"]) == 0

        for a in fake_db.assets.docs:
            assert a["scenario"] == "normal"
            assert "synthetic_override" not in a
            assert "degradation_progress" not in a
            assert "flap_state" not in a

        unresolved_sim_tickets = await fake_db.tickets.find({"synthetic": True, "status": "open"}).to_list(20)
        assert len(unresolved_sim_tickets) == 0

    asyncio.run(_run())


def test_malaysia_timezone_configuration():
    import core

    assert core.CAMPUS_TIMEZONE == "Asia/Kuala_Lumpur"
    assert getattr(core.CAMPUS_TZ, "key", None) == "Asia/Kuala_Lumpur"
    current_dt = core.now()
    assert current_dt.utcoffset() == timedelta(hours=8)
    assert core.stamp().endswith("+08:00")


def test_rapid_sampling_buckets_within_minute(monkeypatch):
    fake_db = FakeDB()
    monkeypatch.setattr(monitoring, "db", fake_db)
    import core

    monkeypatch.setattr(core, "db", fake_db)
    base_minute = core.now().replace(second=0, microsecond=0)

    async def _run():
        for sec in (5, 12, 27, 44):
            await monitoring.generate_sample(at=base_minute + timedelta(seconds=sec), overwrite=True)
        distinct_ts = await fake_db.telemetry.distinct("timestamp")
        assert distinct_ts == [base_minute.isoformat()]

    asyncio.run(_run())


def test_checklist_rbac_restricts_submission_to_assistants(monkeypatch):
    import core
    from fastapi import HTTPException

    fake_db = FakeDB()
    monkeypatch.setattr(core, "db", fake_db)

    assert "checklist" in core.PERMS["assistant"]
    assert "checklist" not in core.PERMS["admin"]
    assert "checklist" not in core.PERMS["engineer"]

    async def _run():
        await core.authorize({"id": "assistant", "name": "Jamie Santos", "role": "assistant"}, "checklist")
        for role in ("admin", "engineer"):
            try:
                await core.authorize({"id": role, "name": role.title(), "role": role}, "checklist")
                assert False, f"{role} should not be authorized for checklist submission"
            except HTTPException as exc:
                assert exc.status_code == 403

    asyncio.run(_run())


def test_live_diagnostics_and_remediation_endpoints(monkeypatch):
    fake_db = FakeDB()
    monkeypatch.setattr(monitoring, "db", fake_db)
    import core

    monkeypatch.setattr(core, "db", fake_db)

    async def _run():
        # Put ap-07 into congestion and run diagnostic
        await simulation(Scenario(asset_id="ap-07", scenario="congestion"), user=ADMIN_USER)
        diag = await monitoring.diagnose_ap("ap-07", user=ADMIN_USER)
        assert diag["asset_id"] == "ap-07"
        assert diag["status"] == "congested"
        assert diag["packet_loss_pct"] == 8
        assert "Ch 149" in diag["channel_5ghz"]

        # Remediate ap-07 and verify it restores to online
        rem = await monitoring.remediate_ap(
            "ap-07", monitoring.RemediateAction(action="rebalance_channel"), user=ADMIN_USER
        )
        assert rem["status"] == "online"
        assert rem["asset"]["status"] == "online"

    asyncio.run(_run())








def test_team_member_crud_with_owner_and_self_protection(monkeypatch):
    import core
    import operations
    from fastapi import HTTPException

    fake_db = FakeDB()
    fake_db.users = FakeCollection(
        [
            {"id": "owner", "name": "Campus Owner", "email": "owner@campus.edu.my", "role": "admin", "active": True, "created_at": "1"},
            {"id": "admin", "name": "Alex Morgan", "email": "admin@atlas.demo", "role": "admin", "active": True, "created_at": "2"},
            {"id": "assistant", "name": "Jamie Santos", "email": "assistant@atlas.demo", "role": "assistant", "active": True, "created_at": "3"},
        ]
    )
    fake_db.sessions = FakeCollection()
    fake_db.shifts = FakeCollection()
    monkeypatch.setattr(core, "db", fake_db)
    monkeypatch.setattr(operations, "db", fake_db)

    async def expect_conflict(coro):
        try:
            await coro
            assert False, "expected protected-account conflict"
        except HTTPException as exc:
            assert exc.status_code == 409

    async def _run():
        listed = await operations.users(user=ADMIN_USER)
        assert {u["id"]: u["scope"] for u in listed}["assistant"] == "Computing Lab A"
        assert all("password_hash" not in u for u in listed)

        created = await operations.add_user(
            operations.UserInput(name="Aisyah Rahman", email="Aisyah@campus.edu.my", role="assistant", scope="Innovation Lab", active=True),
            user=ADMIN_USER,
        )
        assert created["email"] == "aisyah@campus.edu.my" and created["scope"] == "Innovation Lab"
        assert "password_hash" not in created
        assert any("Added team member Aisyah Rahman as IT Assistant" in a["detail"] for a in fake_db.audit.docs)

        # Duplicate email is rejected
        await expect_conflict(
            operations.add_user(operations.UserInput(name="Dup", email="aisyah@campus.edu.my", role="engineer"), user=ADMIN_USER)
        )

        # Edit name/email/role/scope and suspend
        updated = await operations.update_user(
            created["id"],
            operations.UserPatch(name="Aisyah R.", role="engineer", scope="Campus Core Network", active=False),
            user=ADMIN_USER,
        )
        assert updated["name"] == "Aisyah R." and updated["role"] == "engineer" and updated["active"] is False
        assert fake_db.audit.docs[-1]["action"] == "Team member suspended"

        # Owner and self are protected from suspend / demote / delete
        await expect_conflict(operations.update_user("owner", operations.UserPatch(active=False), user=ADMIN_USER))
        await expect_conflict(operations.update_user("admin", operations.UserPatch(role="engineer"), user=ADMIN_USER))
        await expect_conflict(operations.remove_user("owner", user=ADMIN_USER))
        await expect_conflict(operations.remove_user("admin", user=ADMIN_USER))

        # Remove a standard member
        removed = await operations.remove_user(created["id"], user=ADMIN_USER)
        assert removed["ok"] is True
        assert await fake_db.users.find_one({"id": created["id"]}) is None
        assert fake_db.audit.docs[-1]["action"] == "Team member removed"

    asyncio.run(_run())



def test_itam_registration_dhcp_vlan_assignment_and_zone_rules(monkeypatch):
    import core
    import operations
    import campus
    from fastapi import HTTPException
    from pydantic import ValidationError

    fake_db = FakeDB()
    fake_db.labs = FakeCollection()
    monkeypatch.setattr(core, "db", fake_db)
    monkeypatch.setattr(operations, "db", fake_db)
    monkeypatch.setattr(campus, "db", fake_db)

    async def expect_status(coro, code):
        try:
            await coro
            assert False, f"expected HTTP {code}"
        except HTTPException as exc:
            assert exc.status_code == code

    async def _run():
        # Manual IP entry is no longer part of the registration contract.
        try:
            operations.AssetInput(tag="AP-X-01", name="Test AP", kind="AP", lab_id="lab-1", ip="10.10.1.45")
            assert False, "ip should be rejected"
        except ValidationError:
            pass

        # Canteen AP: VLAN 20 lease in the canteen subnet, auto-generated Aruba MAC, landmark kept.
        ap = await operations.add_asset(
            operations.AssetInput(tag="ap-canteen-09", name="Canteen AP 09", kind="AP", lab_id="zone-canteen",
                                  placement="Main Canteen · Ceiling Pillar C3 near Cashier"),
            user=ADMIN_USER,
        )
        assert ap["tag"] == "AP-CANTEEN-09"
        assert ap["vlan"] == 20 and ap["ip"] == "10.20.21.11" and ap["ip_assignment"] == "dhcp"
        assert ap["mac"].startswith("20:4C:03:") and ap["zone_group"] == "common"
        assert ap["lab_name"] in ["Main Campus Canteen / Atrium", "Campus Canteen / Cafeteria"]
        assert ap["placement"] == "Main Canteen · Ceiling Pillar C3 near Cashier"

        # Next AP in the same zone leases the next free host address.
        ap2 = await operations.add_asset(
            operations.AssetInput(tag="AP-CANTEEN-10", name="Canteen AP 10", kind="AP", lab_id="zone-canteen", mac="aa-bb-cc-11-22-33"),
            user=ADMIN_USER,
        )
        assert ap2["ip"] == "10.20.21.12" and ap2["mac"] == "AA:BB:CC:11:22:33"

        # Workstation in Computing Lab C: VLAN 10 lease and a default desk placement.
        pc = await operations.add_asset(
            operations.AssetInput(tag="PC-CL-C-01", name="Workstation 01", kind="PC", lab_id="lab-4", mac="SN-DELL-7090-001"),
            user=ADMIN_USER,
        )
        assert pc["vlan"] == 10 and pc["ip"] == "10.10.4.11" and pc["mac"] == "SN-DELL-7090-001"
        assert pc["placement"] == "Lab C · Row 1, Desk 1"

        # Workstations are restricted to computing labs; identifiers must be valid and unique.
        await expect_status(operations.add_asset(operations.AssetInput(tag="PC-BUS-01", name="Kiosk", kind="PC", lab_id="zone-busstop"), user=ADMIN_USER), 422)
        await expect_status(operations.add_asset(operations.AssetInput(tag="AP-LIB-09", name="Library AP", kind="AP", lab_id="zone-library", mac="not a mac!"), user=ADMIN_USER), 422)
        await expect_status(operations.add_asset(operations.AssetInput(tag="AP-LIB-10", name="Library AP", kind="AP", lab_id="zone-library", mac="AA:BB:CC:11:22:33"), user=ADMIN_USER), 409)
        await expect_status(operations.add_asset(operations.AssetInput(tag="AP-CANTEEN-09", name="Dup AP", kind="AP", lab_id="zone-canteen"), user=ADMIN_USER), 409)
        await expect_status(operations.add_asset(operations.AssetInput(tag="AP-NOWHERE-1", name="Nowhere AP", kind="AP", lab_id="zone-mars"), user=ADMIN_USER), 404)

    asyncio.run(_run())


def test_campus_inventory_seed_and_legacy_backfill(monkeypatch):
    import campus

    fake_db = FakeDB()
    fake_db.labs = FakeCollection([{"id": "lab-1", "name": "Computing Lab A", "code": "CL-A"}])
    fake_db.assets.docs.append(
        {"id": "pc-01", "tag": "PC-CL-A-01", "name": "Workstation 01", "kind": "PC", "lab_id": "lab-1",
         "lab_name": "Computing Lab A", "ip": "10.30.1.10", "archived": False}
    )
    monkeypatch.setattr(campus, "db", fake_db)
    monkeypatch.setattr(monitoring, "db", fake_db)
    monkeypatch.setattr(campus, "DEMO", True)

    async def _run():
        await campus.ensure_campus_inventory()
        await campus.ensure_campus_inventory()  # idempotent

        labs = {l["id"]: l for l in fake_db.labs.docs}
        assert labs["lab-1"]["zone_group"] == "labs" and labs["lab-4"]["name"] == "Computing Lab C"
        assert labs["zone-busstop"]["zone_group"] == "outdoor" and labs["zone-canteen"]["vlan_octet"] == 21

        by_tag = {a["tag"]: a for a in fake_db.assets.docs}
        aps = [a for a in fake_db.assets.docs if a["kind"] == "AP"]
        assert len(aps) == 28 and len(by_tag) == len(fake_db.assets.docs)
        assert by_tag["AP-BUS-01"]["lab_name"] in ["Campus Transit & Bus Stop", "School Bus Stop (Gate 1)"]
        assert by_tag["AP-BUS-01"]["placement"].startswith("Bus Stop · Covered Waiting Bay North")
        assert by_tag["AP-CANTEEN-01"]["zone_group"] == "common"
        assert by_tag["AP-CLASS-B2"]["ip"] == "10.20.11.11"
        assert len([t for t in fake_db.telemetry.docs if t["asset_id"] == "ap-28"]) == 97

        # Legacy workstation migrated to VLAN 10 with stable MAC and desk landmark.
        pc = by_tag["PC-CL-A-01"]
        assert pc["ip"] == "10.10.1.10" and pc["vlan"] == 10 and pc["ip_assignment"] == "dhcp"
        assert pc["mac"].startswith("B0:7B:25:") and pc["placement"] == "Lab A · Row 1, Desk 1"
        assert all(a.get("vlan") == 20 and a.get("mac") for a in aps)

    asyncio.run(_run())


def test_locations_crud_and_asset_patch_delete(monkeypatch):
    import core
    import operations
    import campus
    from fastapi import HTTPException

    fake_db = FakeDB()
    fake_db.labs = FakeCollection()
    fake_db.assets = FakeCollection()
    fake_db.shifts = FakeCollection()
    fake_db.alerts = FakeCollection()
    monkeypatch.setattr(core, "db", fake_db)
    monkeypatch.setattr(operations, "db", fake_db)
    monkeypatch.setattr(campus, "db", fake_db)

    async def expect_status(coro, code):
        try:
            await coro
            assert False, f"expected HTTP {code}"
        except HTTPException as exc:
            assert exc.status_code == code

    async def _run():
        await campus.ensure_locations()

        # Add an asset to lab-1
        fake_db.assets.docs.append({
            "id": "pc-test-1", "tag": "PC-TEST-01", "name": "Test PC", "kind": "PC",
            "lab_id": "lab-1", "lab_name": "Computing Lab A", "ip": "10.10.1.11",
            "vlan": 10, "archived": False
        })

        # 1. GET /locations returns enriched counts
        locs = await operations.get_locations(user=ADMIN_USER)
        lab1 = next(l for l in locs if l["id"] == "lab-1")
        assert lab1["code"] == "B-04-03"
        assert lab1["workstation_count"] == 1 and lab1["equipment_count"] == 1

        # 2. POST /locations creates a new campus room
        created = await operations.create_location(
            operations.LocationInput(
                code="A-06-03", name="Design Studio A", block="Block A", level="Level 6", room="03", category="Specialty Lab"
            ),
            user=ADMIN_USER
        )
        assert created["code"] == "A-06-03"
        assert created["zone_group"] == "labs"

        # Duplicate code is rejected
        await expect_status(
            operations.create_location(
                operations.LocationInput(
                    code="A-06-03", name="Another Studio", block="Block A", level="Level 6", room="03", category="Specialty Lab"
                ),
                user=ADMIN_USER
            ),
            409
        )

        # 3. PATCH /locations updates details
        updated = await operations.update_location(
            created["id"],
            operations.LocationPatch(name="Advanced Design Studio A"),
            user=ADMIN_USER
        )
        assert updated["name"] == "Advanced Design Studio A"

        # 4. DELETE /locations with equipment assigned is rejected with 409
        await expect_status(operations.remove_location("lab-1", user=ADMIN_USER), 409)

        # Deleting empty location succeeds
        del_res = await operations.remove_location(created["id"], user=ADMIN_USER)
        assert del_res["ok"] is True

        # 5. PATCH /assets/{id} updates metadata
        asset_updated = await operations.update_asset(
            "pc-test-1",
            operations.AssetPatch(name="Updated Test PC", placement="Lab A · Row 3, Desk 2"),
            user=ADMIN_USER
        )
        assert asset_updated["name"] == "Updated Test PC"
        assert asset_updated["placement"] == "Lab A · Row 3, Desk 2"

        # 6. DELETE /assets/{id} deletes the asset
        asset_deleted = await operations.delete_asset("pc-test-1", user=ADMIN_USER)
        assert asset_deleted["ok"] is True
        assert await fake_db.assets.find_one({"id": "pc-test-1"}) is None

    asyncio.run(_run())
