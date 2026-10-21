from datetime import datetime, timedelta

from reporting import access_point_health, inspection_rates, resolution_times, risk_section

LABS = [{"id": "lab-1", "name": "Computing Lab A", "code": "CL-A"}, {"id": "lab-2", "name": "Computing Lab B", "code": "CL-B"}]


def ticket(priority, status, hours=None):
    opened = datetime(2030, 1, 7, 8, 0)
    resolved = (opened + timedelta(hours=hours)).isoformat() if hours is not None else None
    return {"priority": priority, "status": status, "category": "network", "created_at": opened.isoformat(), "resolved_at": resolved}


def test_resolution_time_averages_resolved_tickets_against_the_target():
    rows = {r["priority"]: r for r in resolution_times([
        ticket("high", "resolved", 2), ticket("high", "resolved", 6), ticket("high", "open"),
        ticket("low", "resolved", 80),
    ])}
    assert (rows["high"]["resolved"], rows["high"]["mean_hours"], rows["high"]["within_target"]) == (2, 4.0, True)
    assert (rows["medium"]["resolved"], rows["medium"]["mean_hours"]) == (0, None)
    assert (rows["low"]["mean_hours"], rows["low"]["within_target"]) == (80.0, False)  # The target is 72 hours.


def test_inspection_rate_is_per_lab_and_leaves_out_labs_never_inspected():
    checklists = [{"lab_name": "Computing Lab A", "result": "passed"}] * 3 + [{"lab_name": "Computing Lab A", "result": "failed"}]
    assert inspection_rates(checklists, LABS) == [
        {"lab": "Computing Lab A", "code": "CL-A", "passed": 3, "failed": 1, "total": 4, "rate": 75.0},
    ]


def test_access_point_uptime_leaves_out_stale_samples_and_peak_clients_sum_the_room():
    def sample(asset, clock, status, clients, latency=None, lab="lab-1"):
        return {"asset_id": asset, "lab_id": lab, "timestamp": f"2030-01-07T{clock}:00+08:00", "status": status, "clients": clients, "latency": latency}

    samples = [
        sample("ap-1", "10:00", "online", 10, 20), sample("ap-2", "10:00", "online", 15, 40),
        sample("ap-1", "10:05", "offline", 0), sample("ap-2", "10:05", "online", 30, 30),
        sample("ap-1", "10:10", "stale", 50),
        sample("ap-3", "10:00", "stale", 5, lab="lab-2"),  # Nothing but stale data, so no row.
    ]
    assert access_point_health(samples, LABS) == [
        {"lab": "Computing Lab A", "code": "CL-A", "access_points": 2, "uptime": 75.0, "latency": 30.0, "peak_clients": 30},
    ]


def test_risk_bands_count_lab_pcs_and_access_points_and_keep_unscored_assets_apart():
    rows = {r["band"]: r for r in risk_section([
        {"kind": "PC", "risk": {"band": "high"}},
        {"kind": "AP", "risk": {"band": "high"}},
        {"kind": "PC", "risk": None},
    ])}
    assert (rows["high"]["lab_pcs"], rows["high"]["access_points"], rows["high"]["total"]) == (1, 1, 2)
    assert (rows["unscored"]["total"], rows["low"]["total"]) == (1, 0)
