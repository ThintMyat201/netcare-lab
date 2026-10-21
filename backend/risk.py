"""Predictive maintenance risk, scored on demand from each asset's history.

A port of Atlas NetCare's weighted model, kept transparent on purpose: each factor is a
measurement divided by a ceiling, clamped to 0..1, multiplied by its weight and scaled to
0-100. A factor that cannot be measured is left out and the remaining weights are
renormalised, so missing data never reads as low risk. Nothing is stored; the report
scores every asset in service when it is generated.
"""
from collections import defaultdict
from datetime import datetime, timedelta

from core import db, now

# Atlas's weights for the factors netcare-lab can measure, rescaled to sum to 1 per asset
# type. Atlas also scores a PC's age and an access point's packet-loss trend; netcare-lab
# records neither, so those two are not listed rather than always missing.
WEIGHTS = {
    'PC': {'fault_frequency': 0.40, 'fail_rate': 0.33, 'days_since_inspect': 0.27},
    'AP': {'latency_trend': 0.40, 'offline_hours': 0.40, 'peak_load': 0.20},
}

# The measurement that counts as a full-weight concern: ten tickets in ninety days, a month
# without an inspection, latency 120 ms worse than at the start of the window, five hours
# with an outage. Access points use the last seven days, all the telemetry netcare-lab keeps.
INPUTS = {
    'fault_window_days': 90,
    'fault_ceiling': 10,
    'inspect_ceiling_days': 30,
    'trend_days': 7,
    'latency_ceiling_ms': 120,
    'offline_ceiling_hours': 5,
}

# Lower bound of each band, inclusive: 64.9 is medium, 65 is high.
BANDS = [('critical', 85), ('high', 65), ('medium', 40), ('low', 0)]
BAND_LABELS = {'low': 'Low risk', 'medium': 'Medium risk', 'high': 'High risk', 'critical': 'Critical risk'}


def band(score):
    return next(name for name, floor in BANDS if score >= floor)


def combine(weights, raw):
    """Weighted sum of the measurable factors, scaled to 0-100, or None when nothing is measurable."""
    factors, available = {}, 0.0
    for name, value in raw.items():
        if value is None:
            continue
        available += weights[name]
        factors[name] = max(0.0, min(1.0, float(value))) * weights[name] * 100
    if available <= 0:
        return None
    score = round(sum(factors.values()) / available, 2)
    return {'score': score, 'band': band(score), 'factors': {k: round(v / available, 2) for k, v in factors.items()}}


def _parse(value):
    try:
        return datetime.fromisoformat(value)
    except (TypeError, ValueError):
        return None


def score_pc(tickets, checklists, at):
    """`tickets` and `checklists` are this PC's records; `at` is the time of scoring."""
    since = at - timedelta(days=INPUTS['fault_window_days'])
    faults = sum(1 for t in tickets if (_parse(t.get('created_at')) or at) >= since)
    recent = [c for c in checklists if (_parse(c.get('created_at')) or since) >= since]
    checks = [result for c in recent for result in (c.get('checks') or {}).values()]
    # Not inspected in the window is unknown, not passing.
    fail_rate = (sum(r == 'fail' for r in checks) / len(checks)) if checks else None
    last = max((d for d in (_parse(c.get('created_at')) for c in checklists) if d), default=None)
    # Never inspected is the strongest form of this signal, so it scores the full ceiling.
    days = INPUTS['inspect_ceiling_days'] if last is None else (at - last).total_seconds() / 86400
    return combine(WEIGHTS['PC'], {
        'fault_frequency': faults / INPUTS['fault_ceiling'],
        'fail_rate': fail_rate,
        'days_since_inspect': days / INPUTS['inspect_ceiling_days'],
    })


def score_ap(samples):
    """`samples` are this access point's telemetry rows inside the trend window."""
    rows = sorted((s for s in samples if s.get('status') and s['status'] != 'stale'), key=lambda s: s['timestamp'])
    if not rows:
        # "No data" and "healthy" are different answers.
        return None
    latencies = [s['latency'] for s in rows if s.get('latency') is not None]
    # How much latency worsened: the second half's mean minus the first half's. Improvement counts as 0.
    trend = None
    if len(latencies) >= 2:
        half = len(latencies) // 2
        early, late = latencies[:half], latencies[half:]
        trend = max(0.0, sum(late) / len(late) - sum(early) / len(early)) / INPUTS['latency_ceiling_ms']
    offline_hours = len({s['timestamp'][:13] for s in rows if s['status'] == 'offline'})
    loads = [s['load'] for s in rows if s.get('load') is not None]
    return combine(WEIGHTS['AP'], {
        'latency_trend': trend,
        'offline_hours': offline_hours / INPUTS['offline_ceiling_hours'],
        'peak_load': (max(loads) / 100) if loads else None,
    })


async def assess_assets():
    """Score every asset in service. Returns the asset rows, each with a `risk` key (None when unscored)."""
    at = now()
    assets = await db.assets.find({'archived': False}, {'_id': 0}).to_list(2000)
    tickets, checklists, samples = defaultdict(list), defaultdict(list), defaultdict(list)
    for t in await db.tickets.find({'synthetic': {'$ne': True}}, {'_id': 0, 'asset_id': 1, 'created_at': 1}).to_list(20000):
        tickets[t['asset_id']].append(t)
    for c in await db.checklists.find({}, {'_id': 0, 'asset_id': 1, 'created_at': 1, 'checks': 1}).to_list(20000):
        checklists[c['asset_id']].append(c)
    since = (at - timedelta(days=INPUTS['trend_days'])).isoformat()
    fields = {'_id': 0, 'asset_id': 1, 'timestamp': 1, 'status': 1, 'latency': 1, 'load': 1}
    for s in await db.telemetry.find({'timestamp': {'$gte': since}}, fields).to_list(50000):
        samples[s['asset_id']].append(s)
    for asset in assets:
        if asset['kind'] == 'PC':
            asset['risk'] = score_pc(tickets[asset['id']], checklists[asset['id']], at)
        else:
            asset['risk'] = score_ap(samples[asset['id']])
    return assets
