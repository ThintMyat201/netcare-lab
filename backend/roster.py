"""Weekly shift templates and the roster logic built on them (Atlas NetCare FR-407, FR-408).

An administrator describes the week once as templates ("Mondays 08:00-12:00, Computing Lab A,
2 assistants"). Generating a week turns the templates into dated shifts. The week is then
adjusted by hand: a shift can be handed to somebody else until it ends, and removed until it
starts. From the moment a shift starts it is the attendance record and stays.
"""
import re
from collections import Counter
from datetime import date, datetime, timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from pymongo.errors import DuplicateKeyError

from auth import current
from core import CAMPUS_TZ, audit, authorize, db, lease, now, stamp, uid
from operations import Input, get_lab, make_reminders, overlapping_shift, remove_shift, shift_view

router = APIRouter(prefix='/api')

# 0 = Monday ... 6 = Sunday, Python's date.weekday(). Atlas counts from Sunday; the stored
# number never leaves this module, so the off-by-one cannot leak.
DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
TIME = re.compile(r'^([01]\d|2[0-3]):[0-5]\d$')


class TemplateInput(Input):
    name: str = Field(min_length=2, max_length=120)
    day_of_week: int = Field(ge=0, le=6)
    start_time: str
    end_time: str
    lab_id: str
    required_assistants: int = Field(default=1, ge=1, le=10)
    active: bool = True

    @field_validator('start_time', 'end_time')
    @classmethod
    def clock_time(cls, value):
        if not TIME.match(value):
            raise ValueError('Use a 24-hour time such as 09:00.')
        return value


class TemplatePatch(Input):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    day_of_week: int | None = Field(default=None, ge=0, le=6)
    start_time: str | None = None
    end_time: str | None = None
    lab_id: str | None = None
    required_assistants: int | None = Field(default=None, ge=1, le=10)
    active: bool | None = None

    @field_validator('start_time', 'end_time')
    @classmethod
    def clock_time(cls, value):
        if value is not None and not TIME.match(value):
            raise ValueError('Use a 24-hour time such as 09:00.')
        return value


class WeekInput(BaseModel):
    week: str | None = None


class ReassignInput(Input):
    assistant_id: str


def week_start(value=None):
    """The Monday of the week holding `value` (YYYY-MM-DD, campus calendar), or of this week."""
    if value:
        try:
            day = date.fromisoformat(value)
        except ValueError:
            raise HTTPException(422, 'Week must be a date such as 2026-10-19.')
    else:
        day = now().date()
    return day - timedelta(days=day.weekday())


def at(day, clock):
    """A campus wall-clock time on a calendar day, as an aware datetime."""
    hours, minutes = map(int, clock.split(':'))
    return datetime(day.year, day.month, day.day, hours, minutes, tzinfo=CAMPUS_TZ)


def template_view(t, shift_count=0):
    return {**t, 'day_name': DAY_NAMES[t['day_of_week']], 'shift_count': shift_count}


async def week_shifts(monday, assistant_id=None):
    query = {'start': {'$gte': at(monday, '00:00').isoformat(), '$lt': at(monday + timedelta(days=7), '00:00').isoformat()}}
    if assistant_id:
        query['assistant_id'] = assistant_id
    return await db.shifts.find(query, {'_id': 0}).sort('start', 1).to_list(2000)


async def active_assistants():
    return await db.users.find({'role': 'assistant', 'active': True}, {'_id': 0, 'password_hash': 0}).sort('name', 1).to_list(500)


# ---------------------------------------------------------------- templates

@router.get('/shift-templates')
async def list_templates(user=Depends(current)):
    await authorize(user, 'shifts')
    rows = await db.shift_templates.find({}, {'_id': 0}).sort([('day_of_week', 1), ('start_time', 1)]).to_list(500)
    # Removed shifts stay as cancelled rows, so leave them out: the count is the shifts on the roster.
    live = Counter(s['template_id'] for s in await db.shifts.find({'template_id': {'$in': [t['id'] for t in rows]}, 'cancelled': False}, {'_id': 0, 'template_id': 1}).to_list(20000))
    return [template_view(t, live[t['id']]) for t in rows]


@router.post('/shift-templates')
async def add_template(body: TemplateInput, user=Depends(current)):
    await authorize(user, 'shifts')
    if body.end_time <= body.start_time:
        raise HTTPException(422, 'A shift has to end after it starts.')
    lab = await get_lab(body.lab_id)
    row = {**body.model_dump(), 'id': uid(), 'lab_name': lab['name'], 'created_at': stamp(), 'updated_at': stamp()}
    await db.shift_templates.insert_one(row.copy())
    await audit(user, 'Shift template added', f'{row["name"]} · {DAY_NAMES[row["day_of_week"]]} {row["start_time"]}-{row["end_time"]}', row['id'])
    return template_view(row)


@router.patch('/shift-templates/{id}')
async def update_template(id: str, body: TemplatePatch, user=Depends(current)):
    """Shifts already generated keep the times they were made with; only new shifts follow the change.
    There is no delete: deactivating stops new shifts without touching the ones people worked."""
    await authorize(user, 'shifts')
    row = await db.shift_templates.find_one({'id': id}, {'_id': 0})
    if not row:
        raise HTTPException(404, 'Shift template not found.')
    changes = body.model_dump(exclude_none=True)
    if not changes:
        raise HTTPException(422, 'Nothing to change.')
    merged = {**row, **changes}
    if merged['end_time'] <= merged['start_time']:
        raise HTTPException(422, 'A shift has to end after it starts.')
    if 'lab_id' in changes:
        changes['lab_name'] = (await get_lab(changes['lab_id']))['name']
    changes['updated_at'] = stamp()
    await db.shift_templates.update_one({'id': id}, {'$set': changes})
    await audit(user, 'Shift template updated', f'{merged["name"]} · ' + ', '.join(k for k in changes if k not in ('updated_at', 'lab_name')), id)
    return template_view(await db.shift_templates.find_one({'id': id}, {'_id': 0}))


# ---------------------------------------------------------------- the week

@router.get('/roster')
async def roster(week: str = '', user=Depends(current)):
    """One week of shifts, Monday to Sunday. Assistants see their own; admins see everyone's and the tools to change it."""
    await authorize(user, 'view')
    monday = week_start(week or None)
    rows = [shift_view(s) for s in await week_shifts(monday, None if user['role'] == 'admin' else user['id'])]
    result = {
        'week_start': monday.isoformat(),
        'week_end': (monday + timedelta(days=6)).isoformat(),
        'this_week': monday == week_start(),
        'shifts': rows,
        'shift_count': sum(not s['cancelled'] for s in rows),
        'removable_count': sum(s['removable'] for s in rows),
    }
    if user['role'] == 'admin':
        result['active_templates'] = await db.shift_templates.count_documents({'active': True})
        result['assistants'] = [{'id': a['id'], 'name': a['name']} for a in await active_assistants()]
    return result


@router.post('/roster/generate')
async def generate(body: WeekInput, user=Depends(current)):
    """Fill the week from the active templates.

    Safe to press twice: every template seat has a slot key with a unique index, so a second run,
    even a concurrent one, finds the seat taken and moves on. Seats whose time has already come are
    skipped, because a shift made after its start is a no-show nobody could have attended.
    Each seat goes to the active assistant with the fewest shifts that week who is free at that
    time. Under-filling a seat is honest; double-booking a person is not.
    """
    await authorize(user, 'shifts')
    monday = week_start(body.week)
    templates = await db.shift_templates.find({'active': True}, {'_id': 0}).sort([('day_of_week', 1), ('start_time', 1)]).to_list(500)
    if not templates:
        return {'created': 0, 'message': 'There are no active shift templates, so there is nothing to generate.'}
    assistants = await active_assistants()
    if not assistants:
        raise HTTPException(422, 'There are no active assistants to roster.')
    load = Counter(s['assistant_id'] for s in await week_shifts(monday) if not s['cancelled'])
    created = []
    for template in templates:
        day = monday + timedelta(days=template['day_of_week'])
        start, end = at(day, template['start_time']), at(day, template['end_time'])
        if start <= now():
            continue
        lab = await db.labs.find_one({'id': template['lab_id']}, {'_id': 0}) or {'id': template['lab_id'], 'name': template['lab_name']}
        for seat in range(template['required_assistants']):
            slot_key = f'{template["id"]}:{day.isoformat()}:{seat}'
            if await db.shifts.find_one({'slot_key': slot_key}, {'_id': 1}):
                continue
            shift = None
            for assistant in sorted(assistants, key=lambda a: (load[a['id']], a['name'])):
                async with lease('roster:' + assistant['id']):
                    if await overlapping_shift(assistant['id'], start.isoformat(), end.isoformat()):
                        continue
                    shift = {'id': uid(), 'assistant_id': assistant['id'], 'assistant_name': assistant['name'],
                             'lab_id': lab['id'], 'lab_name': lab['name'], 'start': start.isoformat(), 'end': end.isoformat(),
                             'acknowledged_at': None, 'created_at': stamp(), 'created_by': user['id'], 'cancelled': False,
                             # Copied from the template, so editing the template never rewrites a shift somebody worked.
                             'template_id': template['id'], 'slot_key': slot_key}
                    try:
                        await db.shifts.insert_one(shift.copy())
                    except DuplicateKeyError:
                        shift = 'taken'
                break
            if shift is None:
                break  # Everyone is busy at this time; the remaining seats stay empty.
            if shift != 'taken':
                load[shift['assistant_id']] += 1
                created.append(shift)
    if created:
        await make_reminders()
    await audit(user, 'Roster generated', f'{len(created)} shift(s) for the week of {monday:%d %b %Y}')
    message = (f'{len(created)} shift{"s" if len(created) != 1 else ""} created for the week of {monday:%d %b}.' if created
               else 'Nothing new to add: every seat this week is filled or has already started.')
    return {'created': len(created), 'message': message}


@router.post('/roster/clear')
async def clear_week(body: WeekInput, user=Depends(current)):
    """Remove every shift in the week that has not started. Started and finished ones stay as the attendance record;
    generating the week fills the removed template seats again."""
    await authorize(user, 'shifts')
    monday = week_start(body.week)
    live = [s for s in await week_shifts(monday) if not s['cancelled']]
    removed = 0
    for row in live:
        if datetime.fromisoformat(row['start']) > now():
            try:
                await remove_shift(row, user)
                removed += 1
            except HTTPException:
                pass  # Started or removed meanwhile; it stays as it is.
    return {'removed': removed, 'kept': len(live) - removed}


@router.post('/shifts/{id}/reassign')
async def reassign(id: str, body: ReassignInput, user=Depends(current)):
    """Hand one shift to a different assistant: how a real week diverges from the templates."""
    await authorize(user, 'shifts')
    row = await db.shifts.find_one({'id': id}, {'_id': 0})
    if not row:
        raise HTTPException(404, 'Shift not found.')
    if row.get('cancelled'):
        raise HTTPException(409, 'This shift has been removed from the roster.')
    if datetime.fromisoformat(row['end']) <= now():
        raise HTTPException(409, 'This shift has already ended, so it cannot be reassigned.')
    to = await db.users.find_one({'id': body.assistant_id, 'role': 'assistant', 'active': True}, {'_id': 0, 'password_hash': 0})
    if not to:
        raise HTTPException(422, 'Shifts can only be assigned to an active assistant.')
    if to['id'] == row['assistant_id']:
        raise HTTPException(409, 'That shift is already assigned to them.')
    async with lease('roster:' + to['id']):
        if await overlapping_shift(to['id'], row['start'], row['end'], exclude_id=id):
            raise HTTPException(409, f'{to["name"]} is already rostered at that time.')
        # The new assistant has not seen it yet, so any acknowledgement belonged to the previous one.
        result = await db.shifts.update_one({'id': id, 'assistant_id': row['assistant_id'], 'cancelled': False},
                                            {'$set': {'assistant_id': to['id'], 'assistant_name': to['name'], 'acknowledged_at': None, 'reassigned_at': stamp()}})
    if not result.modified_count:
        raise HTTPException(409, 'This shift changed. Refresh and try again.')
    await db.reminders.update_one({'shift_id': id}, {'$set': {'assistant_id': to['id'], 'acknowledged_at': None}})
    await audit(user, 'Shift reassigned', f'{row["assistant_name"]} → {to["name"]} · {row["lab_name"]}', id)
    return shift_view(await db.shifts.find_one({'id': id}, {'_id': 0}))
