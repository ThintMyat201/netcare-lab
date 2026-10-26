import hashlib
import json
import re
import secrets
from typing import Literal
from datetime import datetime
from zoneinfo import ZoneInfo
import os
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, EmailStr
from pymongo import ReturnDocument
from pymongo.errors import DuplicateKeyError
from core import db, uid, stamp, now, audit, authorize, lease, Document, DEMO
from auth import current, hash_password, public
import campus

router = APIRouter(prefix='/api')
ROLE_LABELS = {'admin': 'Administrator', 'engineer': 'Network Engineer', 'assistant': 'IT Assistant'}


def roleLabel(role):
    return ROLE_LABELS.get(role, role)


class Input(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)


class AssetInput(Input):
    tag: str = Field(min_length=3, max_length=40)
    name: str = Field(min_length=2, max_length=80)
    kind: Literal['AP', 'PC']
    lab_id: str
    model: str = Field(default='', max_length=80)
    mac: str = Field(default='', max_length=40)
    placement: str = Field(default='', max_length=120)


class AssetPatch(Input):
    tag: str | None = Field(default=None, min_length=3, max_length=40)
    name: str | None = Field(default=None, min_length=2, max_length=80)
    kind: Literal['AP', 'PC'] | None = None
    lab_id: str | None = None
    model: str | None = Field(default=None, max_length=80)
    mac: str | None = Field(default=None, max_length=40)
    placement: str | None = Field(default=None, max_length=120)
    archived: bool | None = None


class LocationInput(Input):
    code: str = Field(min_length=2, max_length=40)
    name: str = Field(min_length=2, max_length=80)
    block: str = Field(min_length=2, max_length=60)
    level: str = Field(min_length=2, max_length=40)
    room: str = Field(min_length=1, max_length=40)
    category: Literal[
        'Computing Lab', 'Specialty Lab', 'Classroom', 'Auditorium', 'Common Area', 'Outdoor / Transit', 'Outdoor'
    ] = 'Computing Lab'


class LocationPatch(Input):
    code: str | None = Field(default=None, min_length=2, max_length=40)
    name: str | None = Field(default=None, min_length=2, max_length=80)
    block: str | None = Field(default=None, min_length=2, max_length=60)
    level: str | None = Field(default=None, min_length=2, max_length=40)
    room: str | None = Field(default=None, min_length=1, max_length=40)
    category: (
        Literal[
            'Computing Lab', 'Specialty Lab', 'Classroom', 'Auditorium', 'Common Area', 'Outdoor / Transit', 'Outdoor'
        ]
        | None
    ) = None


CATEGORY_ZONE_MAP = {
    'Computing Lab': 'labs',
    'Specialty Lab': 'labs',
    'Classroom': 'academic',
    'Auditorium': 'academic',
    'Common Area': 'common',
    'Outdoor / Transit': 'outdoor',
    'Outdoor': 'outdoor',
}


class UserInput(Input):
    name: str = Field(min_length=2, max_length=80)
    email: EmailStr
    role: Literal['admin', 'engineer', 'assistant']
    scope: str | None = Field(default=None, max_length=60)
    active: bool = True
    password: str | None = Field(default=None, min_length=10, max_length=72)


class UserPatch(Input):
    name: str | None = Field(default=None, min_length=2, max_length=80)
    email: EmailStr | None = None
    role: Literal['admin', 'engineer', 'assistant'] | None = None
    scope: str | None = Field(default=None, max_length=60)
    active: bool | None = None
    password: str | None = Field(default=None, min_length=10, max_length=72)


class ShiftInput(Input):
    assistant_id: str
    lab_id: str
    start: datetime
    end: datetime


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


class ShiftCompleteInput(Input):
    handover_notes: str = Field(default='', max_length=2000)


class BatchChecklistInput(Input):
    lab_id: str
    notes: str = Field(default='Batch shift verification — all healthy workstations passed.', max_length=1000)


class TicketCommentInput(Input):
    comment: str = Field(min_length=2, max_length=2000)
    assigned_name: str | None = None


async def get_asset(id, active=True):
    query = {'id': id}
    if active:
        query['archived'] = False
    row = await db.assets.find_one(query, {'_id': 0})
    if not row:
        raise HTTPException(404, 'Active asset not found.')
    return row


async def get_lab(id):
    lab = await db.labs.find_one({'id': id}, {'_id': 0})
    if not lab:
        raise HTTPException(404, 'Lab not found.')
    return lab


def ticket_scope(user):
    return {}


def checklist_scope(user):
    return {}


@router.get('/labs', response_model=list[Document])
async def labs(user=Depends(current)):
    await authorize(user, 'view')
    return await db.labs.find({}, {'_id': 0}).to_list(100)


@router.get('/assets', response_model=list[Document])
async def assets(user=Depends(current)):
    await authorize(user, 'view')
    return await db.assets.find({}, {'_id': 0}).sort('tag', 1).to_list(500)


@router.post('/assets', response_model=Document)
async def add_asset(body: AssetInput, user=Depends(current)):
    await authorize(user, 'inventory')
    loc = campus.location(body.lab_id)
    campus.validate_placement(body.kind, loc)
    tag = body.tag.upper()
    if await db.assets.find_one({'tag': tag}, {'_id': 0}):
        raise HTTPException(409, 'An asset already uses this tag.')
    hw_id = campus.normalize_hw_id(body.mac) or campus.generate_mac(body.kind)
    if await db.assets.find_one({'mac': hw_id}, {'_id': 0}):
        raise HTTPException(409, 'Another asset is already registered with this MAC address / serial tag.')
    vlan, ip = await campus.assign_dhcp_ip(body.kind, loc)
    row = {
        **body.model_dump(),
        'id': uid(),
        'tag': tag,
        'mac': hw_id,
        'lab_name': loc['name'],
        'zone_group': loc['zone_group'],
        'placement': body.placement or campus.default_placement({'kind': body.kind, 'tag': tag}, loc),
        'ip': ip,
        'vlan': vlan,
        'ip_assignment': 'dhcp',
        'archived': False,
        'created_at': stamp(),
    }
    if body.kind == 'AP':
        row.update(scenario='normal', scenario_at=stamp(), last_seen=stamp())
    try:
        await db.assets.insert_one(row.copy())
    except DuplicateKeyError:
        raise HTTPException(409, 'An asset already uses this tag.')
    await audit(user, 'Asset added', f'{row["tag"]} · {loc["name"]} · {campus.network_label(vlan, ip)}', row['id'])
    return row


@router.patch('/assets/{id}/archive', response_model=Document)
async def archive(id: str, user=Depends(current)):
    await authorize(user, 'inventory')
    row = await get_asset(id)
    await db.assets.update_one({'id': id}, {'$set': {'archived': True}})
    await db.alerts.update_many(
        {'asset_id': id, 'active': True},
        {'$set': {'active': False, 'resolved_at': stamp()}, '$unset': {'active_key': ''}},
    )
    await audit(user, 'Asset archived', row['tag'], id)
    return {**row, 'archived': True}


@router.patch('/assets/{id}', response_model=Document)
async def update_asset(id: str, body: AssetPatch, user=Depends(current)):
    await authorize(user, 'inventory')
    asset = await db.assets.find_one({'id': id}, {'_id': 0})
    if not asset:
        raise HTTPException(404, 'Asset not found.')
    updates = {}
    loc = None
    target_kind = body.kind or asset.get('kind')
    if body.lab_id is not None and body.lab_id != asset.get('lab_id'):
        loc = campus.location(body.lab_id)
        campus.validate_placement(target_kind, loc)
        updates['lab_id'] = loc['id']
        updates['lab_name'] = loc['name']
        updates['zone_group'] = loc['zone_group']
        vlan, ip = await campus.assign_dhcp_ip(target_kind, loc)
        updates['vlan'] = vlan
        updates['ip'] = ip
    if body.tag is not None:
        new_tag = body.tag.strip().upper()
        if new_tag != asset.get('tag', '').upper():
            dup = await db.assets.find_one({'tag': new_tag, 'id': {'$ne': id}}, {'_id': 0})
            if dup:
                raise HTTPException(409, f'An asset already uses tag "{new_tag}".')
        updates['tag'] = new_tag
    if body.name is not None:
        updates['name'] = body.name.strip()
    if body.kind is not None and body.kind != asset.get('kind'):
        current_loc = loc or campus.location(asset.get('lab_id'))
        campus.validate_placement(body.kind, current_loc)
        updates['kind'] = body.kind
        vlan, ip = await campus.assign_dhcp_ip(body.kind, current_loc)
        updates['vlan'] = vlan
        updates['ip'] = ip
    if body.model is not None:
        updates['model'] = body.model.strip()
    if body.placement is not None:
        updates['placement'] = body.placement.strip()
    if body.mac is not None:
        new_hw = campus.normalize_hw_id(body.mac)
        if new_hw and new_hw != asset.get('mac'):
            dup_mac = await db.assets.find_one({'mac': new_hw, 'id': {'$ne': id}}, {'_id': 0})
            if dup_mac:
                raise HTTPException(409, 'Another asset is already registered with this MAC address / serial tag.')
            updates['mac'] = new_hw
    if body.archived is not None:
        updates['archived'] = body.archived
        if body.archived:
            await db.alerts.update_many(
                {'asset_id': id, 'active': True},
                {'$set': {'active': False, 'resolved_at': stamp()}, '$unset': {'active_key': ''}},
            )
    if updates:
        await db.assets.update_one({'id': id}, {'$set': updates})
        await audit(
            user,
            'Asset updated',
            f'{updates.get("tag", asset.get("tag"))} · {updates.get("name", asset.get("name"))}',
            id,
        )
    return await db.assets.find_one({'id': id}, {'_id': 0})


@router.delete('/assets/{id}')
async def delete_asset(id: str, user=Depends(current)):
    await authorize(user, 'inventory')
    asset = await db.assets.find_one({'id': id}, {'_id': 0})
    if not asset:
        raise HTTPException(404, 'Asset not found.')
    await db.assets.delete_one({'id': id})
    await db.alerts.delete_many({'asset_id': id})
    await audit(user, 'Asset deleted', f'{asset.get("tag")} ({asset.get("name")})', id)
    return {'ok': True, 'id': id}


@router.get('/locations', response_model=list[Document])
async def get_locations(user=Depends(current)):
    await authorize(user, 'view')
    locations = await db.labs.find({}, {'_id': 0}).to_list(200)
    assets = await db.assets.find({'archived': False}, {'_id': 0, 'id': 1, 'lab_id': 1, 'kind': 1}).to_list(5000)
    counts = {}
    for a in assets:
        lid = a.get('lab_id')
        if not lid:
            continue
        if lid not in counts:
            counts[lid] = {'workstations': 0, 'aps': 0}
        if a.get('kind') == 'PC':
            counts[lid]['workstations'] += 1
        elif a.get('kind') == 'AP':
            counts[lid]['aps'] += 1
    enriched = []
    for loc in locations:
        lid = loc.get('id')
        c = counts.get(lid, {'workstations': 0, 'aps': 0})
        ws = c['workstations']
        aps = c['aps']
        ref = campus.LOCATIONS_BY_ID.get(lid, {})
        enriched.append(
            {
                **loc,
                'code': loc.get('code') or ref.get('code') or loc.get('name') or 'CAMPUS',
                'block': loc.get('block') or loc.get('building') or ref.get('block') or 'Block B',
                'level': loc.get('level') or loc.get('floor') or ref.get('level') or 'Level 1',
                'category': loc.get('category') or ref.get('category') or 'Computing Lab',
                'room': loc.get('room') or ref.get('room') or '',
                'workstation_count': ws,
                'ap_count': aps,
                'equipment_count': ws + aps,
            }
        )
    return enriched


@router.post('/locations', response_model=Document)
async def create_location(body: LocationInput, user=Depends(current)):
    await authorize(user, 'inventory')
    code = body.code.strip()
    existing = await db.labs.find_one({'$or': [{'code': code}, {'code': code.upper()}]}, {'_id': 0})
    if existing:
        raise HTTPException(409, f'A location with code "{body.code}" already exists.')
    loc_id = f"loc-{re.sub(r'[^a-zA-Z0-9]+', '-', code.lower()).strip('-')}"
    if await db.labs.find_one({'id': loc_id}, {'_id': 0}):
        loc_id = f"loc-{uid()[:8]}"
    zone_group = CATEGORY_ZONE_MAP.get(body.category, 'labs')
    all_labs = await db.labs.find({}, {'_id': 0, 'vlan_octet': 1}).to_list(200)
    used_octets = {lab.get('vlan_octet') for lab in all_labs if lab.get('vlan_octet') is not None}
    next_octet = 1
    for cand in range(1, 250):
        if cand not in used_octets:
            next_octet = cand
            break
    row = {
        'id': loc_id,
        'code': code,
        'name': body.name.strip(),
        'block': body.block.strip(),
        'building': body.block.strip(),
        'floor': body.level.strip(),
        'level': body.level.strip(),
        'room': body.room.strip(),
        'category': body.category,
        'zone_group': zone_group,
        'vlan_octet': next_octet,
        'short': body.name.strip(),
        'placeholder': f'e.g. {body.name.strip()} · Desk / Pillar 1',
        'created_at': stamp(),
    }
    await db.labs.insert_one(row.copy())
    campus.LOCATIONS_BY_ID[loc_id] = row
    await audit(user, 'Location added', f'{row["code"]} · {row["name"]} ({row["block"]})', loc_id)
    return {**row, 'workstation_count': 0, 'ap_count': 0, 'equipment_count': 0}


@router.patch('/locations/{id}', response_model=Document)
async def update_location(id: str, body: LocationPatch, user=Depends(current)):
    await authorize(user, 'inventory')
    loc = await db.labs.find_one({'id': id}, {'_id': 0})
    if not loc:
        raise HTTPException(404, 'Campus location not found.')
    updates = {}
    if body.code is not None:
        new_code = body.code.strip()
        if new_code.upper() != loc.get('code', '').upper():
            dup = await db.labs.find_one({'code': new_code, 'id': {'$ne': id}}, {'_id': 0})
            if dup:
                raise HTTPException(409, f'Another location already uses code "{new_code}".')
        updates['code'] = new_code
    if body.name is not None:
        updates['name'] = body.name.strip()
        updates['short'] = body.name.strip()
    if body.block is not None:
        updates['block'] = body.block.strip()
        updates['building'] = body.block.strip()
    if body.level is not None:
        updates['level'] = body.level.strip()
        updates['floor'] = body.level.strip()
    if body.room is not None:
        updates['room'] = body.room.strip()
    if body.category is not None:
        updates['category'] = body.category
        updates['zone_group'] = CATEGORY_ZONE_MAP.get(body.category, 'labs')
    if updates:
        await db.labs.update_one({'id': id}, {'$set': updates})
        if 'name' in updates:
            await db.assets.update_many({'lab_id': id}, {'$set': {'lab_name': updates['name']}})
        await audit(
            user,
            'Location updated',
            f'{updates.get("code", loc.get("code"))} · {updates.get("name", loc.get("name"))}',
            id,
        )
    updated = await db.labs.find_one({'id': id}, {'_id': 0})
    campus.LOCATIONS_BY_ID[id] = updated
    ws_count = await db.assets.count_documents({'lab_id': id, 'kind': 'PC', 'archived': False})
    ap_count = await db.assets.count_documents({'lab_id': id, 'kind': 'AP', 'archived': False})
    return {**updated, 'workstation_count': ws_count, 'ap_count': ap_count, 'equipment_count': ws_count + ap_count}


@router.delete('/locations/{id}')
async def remove_location(id: str, user=Depends(current)):
    await authorize(user, 'inventory')
    loc = await db.labs.find_one({'id': id}, {'_id': 0})
    if not loc:
        raise HTTPException(404, 'Campus location not found.')
    active_equipment_count = await db.assets.count_documents({'lab_id': id, 'archived': False})
    if active_equipment_count > 0:
        raise HTTPException(
            409,
            f'Cannot delete "{loc.get("name")}" because {active_equipment_count} active equipment are '
            'currently assigned to it. Please reassign or archive them first.',
        )
    shift_count = await db.shifts.count_documents({'lab_id': id})
    if shift_count > 0:
        raise HTTPException(409, f'Cannot delete "{loc.get("name")}" because scheduled shifts are linked to this lab.')
    await db.labs.delete_one({'id': id})
    campus.LOCATIONS_BY_ID.pop(id, None)
    await audit(user, 'Location removed', f'{loc.get("code")} · {loc.get("name")}', id)
    return {'ok': True, 'id': id}


USER_SCOPES = [
    'All Campus Systems',
    'Campus Core Network',
    'Core & AP Telemetry',
    'Computing Lab A',
    'Computing Lab B',
    'Computing Lab C',
    'Innovation Lab',
]
SEED_USER_SCOPES = {
    'owner': 'All Campus Systems',
    'admin': 'All Campus Systems',
    'engineer': 'Campus Core Network',
    'eng-2': 'Core & AP Telemetry',
    'assistant': 'Computing Lab A',
    'asst-2': 'Computing Lab B',
    'asst-3': 'Innovation Lab',
    'asst-4': 'Computing Lab A',
    'asst-5': 'Computing Lab B',
}
ROLE_DEFAULT_SCOPE = {'admin': 'All Campus Systems', 'engineer': 'Core & AP Telemetry', 'assistant': 'Computing Lab A'}


def _with_scope(u):
    if u.get('scope'):
        return u
    return {
        **u,
        'scope': SEED_USER_SCOPES.get(u.get('id'), ROLE_DEFAULT_SCOPE.get(u.get('role'), 'All Campus Systems')),
    }


def _check_scope(scope):
    if scope is not None and scope not in USER_SCOPES:
        raise HTTPException(422, 'Choose a valid primary assignment / scope.')


def _is_protected(target, user):
    return target.get('id') == 'owner' or target.get('id') == user.get('id')


@router.get('/users', response_model=list[Document])
async def users(user=Depends(current)):
    await authorize(user, 'users')
    rows = await db.users.find({}, {'_id': 0, 'password_hash': 0}).sort('created_at', 1).to_list(500)
    return [public(_with_scope(u)) for u in rows]


@router.post('/users', response_model=Document)
async def add_user(body: UserInput, user=Depends(current)):
    await authorize(user, 'users')
    _check_scope(body.scope)
    password = body.password or secrets.token_urlsafe(16)
    if len(password.encode()) > 72:
        raise HTTPException(422, 'Password must be at most 72 bytes.')
    email = body.email.lower()
    if await db.users.find_one({'email': email}, {'_id': 0, 'id': 1}):
        raise HTTPException(409, 'This email already has an account.')
    row = {
        'id': uid(),
        'name': body.name,
        'email': email,
        'role': body.role,
        'scope': body.scope or ROLE_DEFAULT_SCOPE[body.role],
        'password_hash': hash_password(password),
        'active': body.active,
        'created_at': stamp(),
    }
    try:
        await db.users.insert_one(row.copy())
    except DuplicateKeyError:
        raise HTTPException(409, 'This email already has an account.')
    await audit(
        user,
        'Team member added',
        f'Added team member {body.name} as {roleLabel(body.role)} · {row["scope"]}',
        row['id'],
    )
    return public(row)


@router.patch('/users/{id}', response_model=Document)
async def update_user(id: str, body: UserPatch, user=Depends(current)):
    await authorize(user, 'users')
    target = await db.users.find_one({'id': id}, {'_id': 0, 'password_hash': 0})
    if not target:
        raise HTTPException(404, 'Account not found.')
    _check_scope(body.scope)
    if _is_protected(target, user) and (
        body.active is False or (body.role and body.role != 'admin' and target.get('role') == 'admin')
    ):
        raise HTTPException(
            409, 'This account is protected: the workspace owner and your own account cannot be suspended or demoted.'
        )
    changes = body.model_dump(exclude_none=True)
    if 'email' in changes:
        changes['email'] = changes['email'].lower()
        clash = await db.users.find_one({'email': changes['email']}, {'_id': 0, 'id': 1})
        if clash and clash.get('id') != id:
            raise HTTPException(409, 'Another account already uses this email.')
    if 'password' in changes:
        if len(changes['password'].encode()) > 72:
            raise HTTPException(422, 'Password must be at most 72 bytes.')
        changes['password_hash'] = hash_password(changes.pop('password'))
    changes = {k: v for k, v in changes.items() if k == 'password_hash' or target.get(k) != v}
    if not changes:
        return public(_with_scope(target))
    try:
        await db.users.update_one({'id': id}, {'$set': changes})
    except DuplicateKeyError:
        raise HTTPException(409, 'Another account already uses this email.')
    if 'name' in changes:
        await db.shifts.update_many({'assistant_id': id}, {'$set': {'assistant_name': changes['name']}})
    if changes.get('active') is False or 'password_hash' in changes:
        await db.sessions.delete_many({'user_id': id})

    def _desc(k, v):
        if k == 'password_hash':
            return 'password reset'
        if k == 'active':
            return 'status: Active' if v else 'status: Suspended'
        if k == 'role':
            return f'role: {roleLabel(v)}'
        return f'{k}: {v}'

    action = (
        'Team member suspended'
        if changes.get('active') is False
        else 'Team member reactivated' if changes.get('active') is True else 'Team member updated'
    )
    await audit(
        user,
        action,
        f'{changes.get("name", target["name"])} · ' + ', '.join(_desc(k, v) for k, v in changes.items()),
        id,
    )
    return public(_with_scope(await db.users.find_one({'id': id}, {'_id': 0, 'password_hash': 0})))


@router.delete('/users/{id}', response_model=Document)
async def remove_user(id: str, user=Depends(current)):
    await authorize(user, 'users')
    target = await db.users.find_one({'id': id}, {'_id': 0, 'password_hash': 0})
    if not target:
        raise HTTPException(404, 'Account not found.')
    if _is_protected(target, user):
        raise HTTPException(
            409, 'This account is protected: the workspace owner and your own account cannot be removed.'
        )
    await db.users.delete_many({'id': id})
    await db.sessions.delete_many({'user_id': id})
    await db.shifts.update_many(
        {'assistant_id': id, 'cancelled': False, 'completed_at': None, 'start': {'$gt': stamp()}},
        {'$set': {'cancelled': True}},
    )
    await audit(
        user, 'Team member removed', f'Removed team member {target["name"]} ({roleLabel(target.get("role", ""))})', id
    )
    return {'ok': True, 'id': id, 'name': target['name']}


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
    await db.shifts.update_one({'id': id}, {'$set': {'cancelled': True}})
    await audit(user, 'Shift cancelled', row['assistant_name'], id)
    return {'message': 'Shift cancelled. History retained.'}


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
