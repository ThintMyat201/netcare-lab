from datetime import datetime, timedelta

import pytest

from core import CAMPUS_TZ
from risk import combine, score_ap, score_pc

AT = datetime(2030, 1, 7, 12, 0, tzinfo=CAMPUS_TZ)


def days_ago(days):
    return (AT - timedelta(days=days)).isoformat()


def test_a_factor_that_cannot_be_measured_is_left_out_not_scored_as_zero():
    result = combine({"faults": 0.5, "inspections": 0.5}, {"faults": 1.0, "inspections": None})
    assert (result["score"], result["band"]) == (100.0, "critical")
    assert combine({"faults": 1.0}, {"faults": None}) is None


@pytest.mark.parametrize(
    "measurement, band",
    [(0.399, "low"), (0.40, "medium"), (0.649, "medium"), (0.65, "high"), (0.85, "critical"), (3.0, "critical")],
)
def test_band_floors_are_inclusive_and_a_measurement_past_its_ceiling_counts_as_the_ceiling(measurement, band):
    assert combine({"only": 1.0}, {"only": measurement})["band"] == band


def test_a_pc_scores_recent_faults_failed_checks_and_time_since_inspection():
    tickets = [{"created_at": days_ago(10)}, {"created_at": days_ago(100)}]  # The second is outside the 90 days.
    checklists = [{"created_at": days_ago(15), "checks": {"power": "pass", "display": "fail"}}]
    result = score_pc(tickets, checklists, AT)
    # 1 fault of 10, half the checks failed, 15 of 30 days: 0.1 * 40 + 0.5 * 33 + 0.5 * 27.
    assert (result["score"], result["band"]) == (34.0, "low")


def test_a_pc_never_inspected_scores_the_whole_inspection_factor():
    result = score_pc([], [], AT)
    # No checks means no fail rate, so the inspection factor's 27 counts out of 40 + 27.
    assert (result["score"], result["band"]) == (40.3, "medium")
    assert "fail_rate" not in result["factors"]


def test_an_access_point_ignores_stale_samples_and_counts_each_offline_hour_once():
    def sample(clock, status, latency=None, load=None):
        return {"timestamp": f"2030-01-07T{clock}:00+08:00", "status": status, "latency": latency, "load": load}

    samples = [
        sample("10:00", "online", 20, 30),
        sample("10:30", "offline"),
        sample("10:45", "offline"),
        sample("11:00", "online", 80, 60),
        sample("12:00", "stale", 999, 100),  # A dead feed is unknown, not busy or slow.
    ]
    # Latency 60 ms worse of 120, 1 offline hour of 5, peak load 60%: 0.5 * 40 + 0.2 * 40 + 0.6 * 20.
    assert score_ap(samples)["score"] == 40.0
    assert score_ap(samples[-1:]) is None
