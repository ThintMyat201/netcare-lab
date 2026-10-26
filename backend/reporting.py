import hmac
import os
from collections import Counter
from datetime import datetime
from fastapi import APIRouter, Depends, Request, HTTPException, BackgroundTasks
from pymongo.errors import DuplicateKeyError
from core import db, stamp, authorize, Document
from auth import current
from roster import make_reminders, shift_status
from tickets import ticket_scope, checklist_scope
from monitoring import generate_sample, sync_alerts

router = APIRouter(prefix='/api')


@router.get('/overview')
async def overview(user=Depends(current)):
    await authorize(user, 'view')
    tickets = await db.tickets.find(ticket_scope(user), {'_id': 0}).sort('created_at', -1).to_list(500)
    shifts = (
        await db.shifts.find(
            {'cancelled': False, **({'assistant_id': user['id']} if user['role'] != 'admin' else {})}, {'_id': 0}
        )
        .sort('start', 1)
        .to_list(500)
    )
    activity = (
        await db.audit.find({} if user['role'] == 'admin' else {'actor_id': user['id']}, {'_id': 0})
        .sort('timestamp', -1)
        .limit(6)
        .to_list(6)
    )
    return {
        'tickets': tickets[:5],
        'open_tickets': sum(t['status'] != 'resolved' for t in tickets),
        'resolved_tickets': sum(t['status'] == 'resolved' for t in tickets),
        'checklists': await db.checklists.count_documents(checklist_scope(user)),
        'shifts': [{**s, 'status': shift_status(s)} for s in shifts],
        'activity': activity,
    }


@router.get('/audit', response_model=list[Document])
async def audits(user=Depends(current)):
    await authorize(user, 'audit')
    return await db.audit.find({}, {'_id': 0}).sort('timestamp', -1).to_list(1000)


def resolution_minutes(ticket):
    opened = datetime.fromisoformat(ticket['created_at'])
    closed = datetime.fromisoformat(ticket['resolved_at'])
    return (closed - opened).total_seconds() / 60


def is_tier2(ticket):
    return ticket.get('category') == 'network' or str(ticket.get('asset_tag', '')).startswith('AP-')


@router.get('/reports')
async def reports(user=Depends(current)):
    await authorize(user, 'reports')
    tickets = await db.tickets.find({}, {'_id': 0}).to_list(5000)
    checklists = await db.checklists.find({}, {'_id': 0, 'fingerprint': 0}).to_list(5000)
    shifts = await db.shifts.find({'cancelled': False}, {'_id': 0}).to_list(5000)
    labs = await db.labs.find({}, {'_id': 0}).to_list(100)
    active_assets = await db.assets.find({'archived': False}, {'_id': 0, 'lab_id': 1}).to_list(5000)
    assets_per_lab = Counter(a.get('lab_id') for a in active_assets)

    resolved = [t for t in tickets if t['status'] == 'resolved' and t.get('resolved_at')]
    durations = [resolution_minutes(t) for t in resolved]
    tier2 = sum(is_tier2(t) for t in tickets)

    def lab_row(lab):
        lab_checks = [c for c in checklists if c['lab_name'] == lab['name']]
        lab_tickets = [t for t in tickets if t['lab_name'] == lab['name']]
        return {
            'id': lab['id'],
            'name': lab['name'],
            'assets': assets_per_lab[lab['id']],
            'inspections': len(lab_checks),
            'passed_inspections': sum(c['result'] == 'passed' for c in lab_checks),
            'open_tickets': sum(t['status'] != 'resolved' for t in lab_tickets),
            'open_only': sum(t['status'] == 'open' for t in lab_tickets),
            'in_progress_only': sum(t['status'] == 'in_progress' for t in lab_tickets),
        }

    return {
        'generated_at': stamp(),
        'tickets_total': len(tickets),
        'open': sum(t['status'] == 'open' for t in tickets),
        'in_progress': sum(t['status'] == 'in_progress' for t in tickets),
        'resolved': sum(t['status'] == 'resolved' for t in tickets),
        'tier1_tickets': len(tickets) - tier2,
        'tier2_tickets': tier2,
        'checklists_total': len(checklists),
        'passed': sum(c['result'] == 'passed' for c in checklists),
        'failed': sum(c['result'] == 'failed' for c in checklists),
        'missed_acknowledgements': sum(shift_status(s) == 'missed' for s in shifts),
        'acknowledged_shifts': sum(bool(s['acknowledged_at']) for s in shifts),
        # None until at least one ticket is resolved, so the report never shows an invented average.
        'mean_resolution_minutes': round(sum(durations) / len(durations), 1) if durations else None,
        'labs': [lab_row(lab) for lab in labs],
    }


async def maintenance(run_id):
    principal = {'id': 'scheduler', 'name': 'Atlas scheduler', 'role': 'scheduler'}
    try:
        await authorize(principal, 'maintain')
        await make_reminders()
        await generate_sample()
        await sync_alerts()
        await db.cron_runs.update_one({'run_id': run_id}, {'$set': {'status': 'complete', 'finished_at': stamp()}})
    except Exception:
        await db.cron_runs.update_one({'run_id': run_id}, {'$set': {'status': 'failed', 'finished_at': stamp()}})
        raise


@router.post('/cron/maintain', status_code=202)
async def cron(request: Request, background: BackgroundTasks):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    auth = request.headers.get('Authorization', '')
    if not auth.startswith('Bearer ') or not hmac.compare_digest(auth[7:], os.environ['WEBHOOK_CRON_SECRET']):
        raise HTTPException(401, 'Invalid scheduler credentials.')
    try:
        body = await request.json()
        run_id = request.headers.get('X-Webhook-Id') or body['run_id']
        if (
            not isinstance(body, dict)
            or body.get('event') != 'schedule.triggered'
            or not isinstance(run_id, str)
            or not run_id
        ):
            raise ValueError()
    except Exception:
        raise HTTPException(400, 'Invalid scheduler envelope.')
    try:
        await db.cron_runs.insert_one({'run_id': run_id, 'status': 'queued', 'created_at': stamp()})
    except DuplicateKeyError:
        return {'accepted': True, 'duplicate': True}
    background.add_task(maintenance, run_id)
    return {'accepted': True}
