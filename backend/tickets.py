"""Lab inspections (checklists) and the incident tickets that failed checks and fault reports open."""

import hashlib
import json
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException
from pydantic import Field
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError
from core import db, uid, stamp, now, audit, authorize, lease, Document, Input
from auth import current
from inventory import get_asset, get_lab

router = APIRouter(prefix='/api')


class ChecklistInput(Input):
    request_id: str = Field(min_length=8, max_length=100)
    asset_id: str
    checks: dict[str, Literal['pass', 'fail']]
    notes: str = Field(default='', max_length=2000)


class IncidentInput(Input):
    asset_id: str
    category: Literal['power', 'display', 'peripherals', 'network', 'software', 'other']
    title: str = Field(min_length=4, max_length=150)
    description: str = Field(min_length=4, max_length=3000)
    priority: Literal['low', 'medium', 'high'] = 'medium'


class TicketPatch(Input):
    status: Literal['in_progress', 'resolved']
    resolution_notes: str = Field(default='', max_length=3000)


class BatchChecklistInput(Input):
    lab_id: str
    notes: str = Field(default='Batch shift verification — all healthy workstations passed.', max_length=1000)


class TicketCommentInput(Input):
    comment: str = Field(min_length=2, max_length=2000)
    assigned_name: str | None = None


def ticket_scope(user):
    return {}


def checklist_scope(user):
    return {}


async def open_ticket(asset, category, title, description, user, priority='medium'):
    key = f'{asset["id"]}:{category}'
    is_net = category == 'network' or asset.get('kind') == 'AP'
    tier = 'Tier 2 · Network / Connectivity' if is_net else 'Tier 1 · Hardware / Peripheral'
    assigned_role = 'engineer' if is_net else 'assistant'
    assigned_name = 'Daniel Reyes (Network Engineer)' if is_net else 'Campus Lab Support (Tier 1)'
    events = [{'actor': user['name'], 'action': 'Ticket opened', 'timestamp': stamp()}]
    if is_net:
        events.append(
            {
                'actor': 'Atlas Routing Engine',
                'action': 'Auto-routed to Network Engineer (Tier 2)',
                'timestamp': stamp(),
            }
        )
    counter = await db.counters.find_one_and_update(
        {'key': 'ticket'}, {'$inc': {'value': 1}}, upsert=True, return_document=ReturnDocument.AFTER
    )
    row = {
        'id': uid(),
        'number': f'INC-{counter["value"]}',
        'asset_id': asset['id'],
        'asset_tag': asset['tag'],
        'lab_name': asset['lab_name'],
        'category': category,
        'tier': tier,
        'assigned_role': assigned_role,
        'assigned_name': assigned_name,
        'title': title,
        'description': description,
        'status': 'open',
        'priority': 'high' if is_net and priority == 'medium' else priority,
        'active_key': key,
        'created_by': user['id'],
        'created_at': stamp(),
        'updated_at': stamp(),
        'resolution_notes': '',
        'events': events,
    }
    try:
        ticket = await db.tickets.find_one_and_update(
            {'active_key': key},
            {'$setOnInsert': row, '$addToSet': {'reporter_ids': user['id']}},
            upsert=True,
            return_document=ReturnDocument.AFTER,
            projection={'_id': 0},
        )
    except DuplicateKeyError:
        ticket = await db.tickets.find_one_and_update(
            {'active_key': key},
            {'$addToSet': {'reporter_ids': user['id']}},
            return_document=ReturnDocument.AFTER,
            projection={'_id': 0},
        )
        if not ticket:
            return await open_ticket(asset, category, title, description, user, priority)
    return ticket


@router.post('/checklists', response_model=Document)
async def submit_checklist(body: ChecklistInput, user=Depends(current)):
    await authorize(user, 'checklist')
    if set(body.checks) != {'power', 'display', 'peripherals', 'network', 'software'}:
        raise HTTPException(422, 'Complete all five required checks.')
    fingerprint = hashlib.sha256(json.dumps(body.model_dump(), sort_keys=True).encode()).hexdigest()
    async with lease(f'checklist:{user["id"]}:{body.request_id}'):
        query = {'created_by': user['id'], 'request_id': body.request_id}
        existing = await db.checklists.find_one(query, {'_id': 0})
        if existing:
            if existing['fingerprint'] != fingerprint:
                raise HTTPException(409, 'This submission key belongs to a different checklist.')
            return {**existing, 'replayed': True}
        asset = await get_asset(body.asset_id)
        if asset['kind'] != 'PC':
            raise HTTPException(422, 'Checklists are only available for workstations.')
        tickets = []
        for category, result in body.checks.items():
            if result == 'fail':
                t = await open_ticket(
                    asset,
                    category,
                    f'{category.title()} check failed',
                    body.notes or 'Failed during equipment inspection.',
                    user,
                )
                tickets.append({'id': t['id'], 'number': t['number'], 'category': category})
        row = {
            'id': uid(),
            **body.model_dump(),
            'fingerprint': fingerprint,
            'asset_tag': asset['tag'],
            'lab_name': asset['lab_name'],
            'created_by': user['id'],
            'created_by_name': user['name'],
            'created_at': stamp(),
            'tickets': tickets,
            'result': 'failed' if tickets else 'passed',
        }
        await db.checklists.insert_one(row.copy())
        await audit(
            user, 'Checklist submitted', f'{asset["tag"]} · {row["result"]} · {len(tickets)} ticket(s)', row['id']
        )
        return {**row, 'replayed': False}


@router.get('/checklists', response_model=list[Document])
async def checklists(user=Depends(current)):
    await authorize(user, 'view')
    return (
        await db.checklists.find(checklist_scope(user), {'_id': 0, 'fingerprint': 0})
        .sort('created_at', -1)
        .to_list(500)
    )


@router.post('/checklists/batch')
async def batch_checklists(body: BatchChecklistInput, user=Depends(current)):
    await authorize(user, 'checklist')
    lab = await get_lab(body.lab_id)
    pcs = (
        await db.assets.find({'kind': 'PC', 'lab_id': lab['id'], 'archived': False}, {'_id': 0})
        .sort('tag', 1)
        .to_list(100)
    )
    open_tickets = await db.tickets.find({'lab_name': lab['name'], 'status': {'$ne': 'resolved'}}, {'_id': 0}).to_list(
        200
    )
    faulty_ids = {t['asset_id'] for t in open_tickets}
    existing_checks = await db.checklists.find({'lab_name': lab['name']}, {'_id': 0}).to_list(500)
    checked_ids = {c['asset_id'] for c in existing_checks}
    created = []
    checks = {'power': 'pass', 'display': 'pass', 'peripherals': 'pass', 'network': 'pass', 'software': 'pass'}
    for pc in pcs:
        if pc['id'] in faulty_ids or pc['id'] in checked_ids:
            continue
        req_id = f'batch-{pc["id"]}-{int(now().timestamp())}'
        row = {
            'id': uid(),
            'request_id': req_id,
            'asset_id': pc['id'],
            'asset_tag': pc['tag'],
            'lab_id': lab['id'],
            'lab_name': lab['name'],
            'checks': checks,
            'notes': body.notes,
            'fingerprint': hashlib.sha256(req_id.encode()).hexdigest(),
            'created_by': user['id'],
            'created_by_name': user['name'],
            'created_at': stamp(),
            'tickets': [],
            'result': 'passed',
        }
        await db.checklists.insert_one(row.copy())
        created.append(row)
        if len(created) >= 4:
            break
    await audit(user, 'Batch lab inspection completed', f'{lab["name"]} · {len(created)} workstation(s) verified')
    return {'created': created, 'count': len(created), 'lab_name': lab['name']}


@router.get('/checklists/{id}', response_model=Document)
async def checklist(id: str, user=Depends(current)):
    await authorize(user, 'view')
    row = await db.checklists.find_one({'id': id, **checklist_scope(user)}, {'_id': 0, 'fingerprint': 0})
    if not row:
        raise HTTPException(404, 'Checklist not found.')
    return row


@router.post('/incidents', response_model=Document)
async def incident(body: IncidentInput, user=Depends(current)):
    await authorize(user, 'incident')
    asset = await get_asset(body.asset_id)
    t = await open_ticket(asset, body.category, body.title, body.description, user, body.priority)
    await audit(user, 'Incident reported', f'{asset["tag"]} · linked to {t["number"]}', t['id'])
    return t


@router.get('/tickets', response_model=list[Document])
async def tickets(user=Depends(current)):
    await authorize(user, 'view')
    return await db.tickets.find(ticket_scope(user), {'_id': 0}).sort('created_at', -1).to_list(500)


@router.get('/tickets/{id}', response_model=Document)
async def ticket(id: str, user=Depends(current)):
    await authorize(user, 'view')
    row = await db.tickets.find_one({'id': id, **ticket_scope(user)}, {'_id': 0})
    if not row:
        raise HTTPException(404, 'Ticket not found.')
    return row


@router.patch('/tickets/{id}', response_model=Document)
async def progress(id: str, body: TicketPatch, user=Depends(current)):
    await authorize(user, 'tickets')
    row = await db.tickets.find_one({'id': id}, {'_id': 0})
    if not row:
        raise HTTPException(404, 'Ticket not found.')
    if row['status'] == 'resolved':
        raise HTTPException(409, 'Resolved tickets are read-only. Report a new incident if the fault returns.')
    if row['status'] == body.status:
        return row
    if body.status == 'resolved' and row['status'] != 'in_progress':
        raise HTTPException(409, 'Start the investigation before resolving this ticket.')
    if body.status == 'resolved' and len(body.resolution_notes.strip()) < 10:
        raise HTTPException(422, 'Resolution notes must contain at least 10 characters.')
    change = {'status': body.status, 'updated_at': stamp(), 'assigned_to': user['id'], 'assigned_name': user['name']}
    update = {
        '$set': change,
        '$push': {
            'events': {
                'actor': user['name'],
                'action': 'Resolved' if body.status == 'resolved' else 'Investigation started',
                'notes': body.resolution_notes,
                'timestamp': stamp(),
            }
        },
    }
    if body.status == 'resolved':
        change.update(resolution_notes=body.resolution_notes, resolved_at=stamp())
        update['$unset'] = {'active_key': ''}
    result = await db.tickets.find_one_and_update(
        {'id': id, 'status': row['status']}, update, projection={'_id': 0}, return_document=ReturnDocument.AFTER
    )
    if not result:
        raise HTTPException(409, 'This ticket changed. Refresh and try again.')
    await audit(user, 'Ticket ' + body.status.replace('_', ' '), f'{row["number"]} · {row["asset_tag"]}', id)
    return result


@router.post('/tickets/{id}/comment', response_model=Document)
async def add_ticket_comment(id: str, body: TicketCommentInput, user=Depends(current)):
    await authorize(user, 'view')
    row = await db.tickets.find_one({'id': id}, {'_id': 0})
    if not row:
        raise HTTPException(404, 'Ticket not found.')
    ev = {'actor': user['name'], 'action': 'Troubleshooting note added', 'notes': body.comment, 'timestamp': stamp()}
    updates = {'updated_at': stamp()}
    if body.assigned_name:
        updates['assigned_name'] = body.assigned_name
    updated = await db.tickets.find_one_and_update(
        {'id': id},
        {'$set': updates, '$push': {'events': ev}},
        projection={'_id': 0},
        return_document=ReturnDocument.AFTER,
    )
    await audit(user, 'Ticket note added', f'{row["number"]} · {body.comment[:40]}', id)
    return updated
