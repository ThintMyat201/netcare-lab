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




