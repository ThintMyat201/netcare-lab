"""Campus locations and the hardware registered in them: lab PCs and access points."""

import re
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException
from pydantic import Field
from pymongo.errors import DuplicateKeyError
from core import db, uid, stamp, audit, authorize, Document, Input
from auth import current
import campus

router = APIRouter(prefix='/api')


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
        try:
            await db.assets.update_one({'id': id}, {'$set': updates})
        except DuplicateKeyError:
            raise HTTPException(409, 'Another asset already uses this tag.')
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
