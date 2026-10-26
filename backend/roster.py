"""The IT assistant duty roster: shifts, reminders, acknowledgement and handover."""

import os
from datetime import datetime
from zoneinfo import ZoneInfo
from fastapi import APIRouter, Depends, HTTPException
from pydantic import Field
from core import db, uid, stamp, now, audit, authorize, lease, Document, Input, DEMO
from auth import current
from inventory import get_lab

router = APIRouter(prefix='/api')


class ShiftInput(Input):
    assistant_id: str
    lab_id: str
    start: datetime
    end: datetime


class ShiftCompleteInput(Input):
    handover_notes: str = Field(default='', max_length=2000)


async def make_reminders():
    for s in await db.shifts.find({'cancelled': False}, {'_id': 0}).to_list(5000):
        await db.reminders.update_one(
            {'shift_id': s['id']},
            {
                '$setOnInsert': {
                    'id': uid(),
                    'shift_id': s['id'],
                    'assistant_id': s['assistant_id'],
                    'title': f'{s["lab_name"]} shift',
                    'created_at': stamp(),
                    'simulated': True,
                    'acknowledged_at': s.get('acknowledged_at'),
                }
            },
            upsert=True,
        )


def shift_status(s):
    if s.get('cancelled'):
        return 'cancelled'
    if s.get('completed_at'):
        return 'completed'
    if s.get('acknowledged_at'):
        return 'acknowledged'
    start = datetime.fromisoformat(s['start'])
    if start <= now():
        return 'missed'
    if (start - now()).total_seconds() <= 900:
        return 'pending'
    return 'upcoming'


async def normalize_campus_shifts():
    """Move the three seeded demo shifts onto today's campus day. Runs at startup and from the maintenance loop."""
    if not DEMO:
        return
    day_base = now().replace(hour=0, minute=0, second=0, microsecond=0)
    windows = [
        ('shift-seed-0', 'lab-1', 'Computing Lab A', 'assistant', 'Jamie Santos', 8, 12, 'Morning Shift'),
        ('shift-seed-1', 'lab-2', 'Computing Lab B', 'assistant', 'Jamie Santos', 12, 16, 'Afternoon Shift'),
        ('shift-seed-2', 'lab-3', 'Innovation Lab', 'asst-2', 'Mika Flores', 16, 20, 'Evening Shift'),
    ]
    for sid, lid, lname, aid, aname, sh, eh, label in windows:
        s_dt = day_base.replace(hour=sh).isoformat()
        e_dt = day_base.replace(hour=eh).isoformat()
        await db.shifts.update_one(
            {'id': sid},
            {
                '$set': {
                    'lab_id': lid,
                    'lab_name': lname,
                    'assistant_id': aid,
                    'assistant_name': aname,
                    'start': s_dt,
                    'end': e_dt,
                    'shift_window': label,
                },
                '$setOnInsert': {
                    'id': sid,
                    'acknowledged_at': None,
                    'completed_at': None,
                    'handover_notes': '',
                    'created_at': stamp(),
                    'created_by': 'admin',
                    'cancelled': False,
                },
            },
            upsert=True,
        )


@router.get('/shifts', response_model=list[Document])
async def shifts(user=Depends(current)):
    await authorize(user, 'view')
    rows = await db.shifts.find({}, {'_id': 0}).sort('start', 1).to_list(500)
    return [{**s, 'status': shift_status(s)} for s in rows]


@router.post('/shifts', response_model=Document)
async def add_shift(body: ShiftInput, user=Depends(current)):
    await authorize(user, 'shifts')
    lab = await get_lab(body.lab_id)
    assistant = await db.users.find_one(
        {'id': body.assistant_id, 'role': 'assistant', 'active': True}, {'_id': 0, 'password_hash': 0}
    )
    if not assistant:
        raise HTTPException(422, 'Choose an active IT assistant.')
    zone = ZoneInfo(os.environ.get('CAMPUS_TIMEZONE', 'Asia/Kuala_Lumpur'))
    start = body.start if body.start.tzinfo else body.start.replace(tzinfo=zone)
    end = body.end if body.end.tzinfo else body.end.replace(tzinfo=zone)
    start, end = start.astimezone(zone), end.astimezone(zone)
    if end <= start or (end - start).total_seconds() > 86400:
        raise HTTPException(422, 'Shift end must follow its start, with a duration of at most 24 hours.')
    async with lease('roster:' + body.assistant_id):
        overlap = await db.shifts.find_one(
            {
                'assistant_id': body.assistant_id,
                'cancelled': False,
                'start': {'$lt': end.isoformat()},
                'end': {'$gt': start.isoformat()},
            },
            {'_id': 0},
        )
        if overlap:
            raise HTTPException(409, 'This assistant already has an overlapping shift, including across midnight.')
        row = {
            'id': uid(),
            'assistant_id': body.assistant_id,
            'assistant_name': assistant['name'],
            'lab_id': lab['id'],
            'lab_name': lab['name'],
            'start': start.isoformat(),
            'end': end.isoformat(),
            'acknowledged_at': None,
            'created_at': stamp(),
            'created_by': user['id'],
            'cancelled': False,
        }
        await db.shifts.insert_one(row.copy())
    await make_reminders()
    await audit(user, 'Shift assigned', f'{assistant["name"]} → {lab["name"]}', row['id'])
    return {**row, 'status': shift_status(row)}


@router.post('/shifts/{id}/acknowledge', response_model=Document)
async def ack(id: str, user=Depends(current)):
    await authorize(user, 'ack')
    row = await db.shifts.find_one({'id': id, 'cancelled': False}, {'_id': 0})
    if not row:
        raise HTTPException(404, 'Shift not found.')
    if not row.get('acknowledged_at'):
        at = stamp()
        result = await db.shifts.update_one({'id': id, 'acknowledged_at': None}, {'$set': {'acknowledged_at': at}})
        await db.reminders.update_one({'shift_id': id}, {'$set': {'acknowledged_at': at}})
        if result.modified_count:
            await audit(user, 'Shift acknowledged', row['lab_name'], id)
    row = await db.shifts.find_one({'id': id}, {'_id': 0})
    return {**row, 'status': shift_status(row)}


@router.post('/shifts/{id}/complete', response_model=Document)
async def complete_shift(id: str, body: ShiftCompleteInput, user=Depends(current)):
    await authorize(user, 'ack')
    row = await db.shifts.find_one({'id': id, 'cancelled': False}, {'_id': 0})
    if not row:
        raise HTTPException(404, 'Shift not found.')
    if row.get('completed_at'):
        return {**row, 'status': shift_status(row)}
    at = stamp()
    notes = body.handover_notes.strip() or 'All scheduled lab workstation inspections completed. Handover verified.'
    ack_at = row.get('acknowledged_at') or at
    await db.shifts.update_one(
        {'id': id}, {'$set': {'acknowledged_at': ack_at, 'completed_at': at, 'handover_notes': notes}}
    )
    await db.reminders.update_one({'shift_id': id}, {'$set': {'acknowledged_at': ack_at}})
    await audit(user, 'Shift completed', f'{row["lab_name"]} · Handover submitted', id)
    row = await db.shifts.find_one({'id': id}, {'_id': 0})
    return {**row, 'status': shift_status(row)}


@router.post('/shifts/{id}/cancel')
async def cancel_shift(id: str, user=Depends(current)):
    await authorize(user, 'shifts')
    row = await db.shifts.find_one({'id': id}, {'_id': 0})
    if not row:
        raise HTTPException(404, 'Shift not found.')
    if row.get('completed_at'):
        raise HTTPException(409, 'Completed shifts cannot be cancelled.')
    result = await db.shifts.update_one({'id': id, 'cancelled': False}, {'$set': {'cancelled': True}})
    if result.modified_count:
        await audit(user, 'Shift cancelled', row['assistant_name'], id)
    return {'message': 'Shift cancelled. History retained.'}
