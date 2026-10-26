"""Campus location catalogue, DHCP/VLAN address assignment, and hardware identifier helpers.

IP addressing is a network (DHCP/VLAN) function: administrators register physical hardware by
location, placement landmark, and MAC address / serial tag, and the system leases the address
from the VLAN subnet that matches the device type and campus zone.
"""
import hashlib
import re
import secrets
from datetime import timedelta
from fastapi import HTTPException
from core import db, stamp, now, uid, DEMO

# Zone groups drive the context-aware location selector and the inventory/monitoring zone filters.
ZONE_GROUPS = {
    'labs': 'Computing Labs',
    'academic': 'Classrooms & Library',
    'common': 'Canteen & Common Areas',
    'outdoor': 'Outdoor / Bus Stop',
}

# vlan_octet is the third octet of the zone subnet on both VLANs (10.10.<octet>.x / 10.20.<octet>.x).
CAMPUS_LOCATIONS = [
    {
        'id': 'lab-1',
        'code': 'B-04-03',
        'name': 'Computing Lab A',
        'block': 'Block B',
        'building': 'Block B',
        'floor': 'Level 4',
        'level': 'Level 4',
        'room': 'Room 03',
        'category': 'Computing Lab',
        'zone_group': 'labs',
        'vlan_octet': 1,
        'short': 'Lab A',
        'placeholder': 'e.g. Lab A · Row 2, Desk 4',
    },
    {
        'id': 'lab-2',
        'code': 'B-04-04',
        'name': 'Computing Lab B',
        'block': 'Block B',
        'building': 'Block B',
        'floor': 'Level 4',
        'level': 'Level 4',
        'room': 'Room 04',
        'category': 'Computing Lab',
        'zone_group': 'labs',
        'vlan_octet': 2,
        'short': 'Lab B',
        'placeholder': 'e.g. Lab B · Row 1, Desk 3',
    },
    {
        'id': 'lab-4',
        'code': 'B-04-05',
        'name': 'Computing Lab C',
        'block': 'Block B',
        'building': 'Block B',
        'floor': 'Level 4',
        'level': 'Level 4',
        'room': 'Room 05',
        'category': 'Computing Lab',
        'zone_group': 'labs',
        'vlan_octet': 4,
        'short': 'Lab C',
        'placeholder': 'e.g. Lab C · Row 3, Desk 2',
    },
    {
        'id': 'lab-3',
        'code': 'Tech Lab 5-02',
        'name': 'Cisco & Network Lab (Innovation Lab)',
        'block': 'Block E / Tech',
        'building': 'Block E / Tech',
        'floor': 'Level 5',
        'level': 'Level 5',
        'room': 'Room 02',
        'category': 'Computing Lab',
        'zone_group': 'labs',
        'vlan_octet': 3,
        'short': 'Innovation Lab',
        'placeholder': 'e.g. Innovation Lab · Maker Bench 2',
    },
    {
        'id': 'zone-robotic',
        'code': 'B-03-Robotic',
        'name': 'Robotic & CADCAM Lab',
        'block': 'Block B',
        'building': 'Block B',
        'floor': 'Level 3',
        'level': 'Level 3',
        'room': 'Room 01',
        'category': 'Specialty Lab',
        'zone_group': 'labs',
        'vlan_octet': 5,
        'short': 'Robotic Lab',
        'placeholder': 'e.g. CADCAM Station 01',
    },
    {
        'id': 'zone-classroom-a',
        'code': 'A-04-05',
        'name': 'Lecture Classroom A-04-05',
        'block': 'Block A',
        'building': 'Block A',
        'floor': 'Level 4',
        'level': 'Level 4',
        'room': 'Room 05',
        'category': 'Classroom',
        'zone_group': 'academic',
        'vlan_octet': 11,
        'short': 'Classroom A-04-05',
        'placeholder': 'e.g. Classroom A-04-05 · Front Wall Mount',
    },
    {
        'id': 'zone-lt1',
        'code': 'A-03-AUD7',
        'name': 'Auditorium 7 @ Block A Level 3',
        'block': 'Block A',
        'building': 'Block A',
        'floor': 'Level 3',
        'level': 'Level 3',
        'room': 'Room 07',
        'category': 'Auditorium',
        'zone_group': 'academic',
        'vlan_octet': 12,
        'short': 'Auditorium 7',
        'placeholder': 'e.g. Auditorium 7 · Rear Projection Booth',
    },
    {
        'id': 'zone-library',
        'code': 'A-01-LIB',
        'name': 'Campus Library (L1)',
        'block': 'Block A',
        'building': 'Block A',
        'floor': 'Level 1',
        'level': 'Level 1',
        'room': 'Room 01',
        'category': 'Classroom',
        'zone_group': 'academic',
        'vlan_octet': 13,
        'short': 'Library L1',
        'placeholder': 'e.g. Library L1 · Quiet Study Zone Ceiling Grid D5',
    },
    {
        'id': 'zone-canteen',
        'code': 'C-01-CANTEEN',
        'name': 'Main Campus Canteen / Atrium',
        'block': 'Block C',
        'building': 'Block C',
        'floor': 'Level 1',
        'level': 'Level 1',
        'room': 'Atrium',
        'category': 'Common Area',
        'zone_group': 'common',
        'vlan_octet': 21,
        'short': 'Main Canteen',
        'placeholder': 'e.g. Main Canteen · Ceiling Pillar C3 near Cashier',
    },
    {
        'id': 'zone-lounge',
        'code': 'C-02-LOUNGE',
        'name': 'Student Lounge & Atrium',
        'block': 'Block C',
        'building': 'Block C',
        'floor': 'Level 2',
        'level': 'Level 2',
        'room': 'Atrium',
        'category': 'Common Area',
        'zone_group': 'common',
        'vlan_octet': 22,
        'short': 'Student Lounge',
        'placeholder': 'e.g. Student Lounge · Atrium Mezzanine Railing',
    },
    {
        'id': 'zone-busstop',
        'code': 'G-01-BUS',
        'name': 'Campus Transit & Bus Stop',
        'block': 'Outdoor Gate 1',
        'building': 'Gate 1 Transit Bay',
        'floor': 'Ground Level',
        'level': 'Ground Level',
        'room': 'Bay 01',
        'category': 'Outdoor / Transit',
        'zone_group': 'outdoor',
        'vlan_octet': 31,
        'short': 'Bus Stop',
        'placeholder': 'e.g. Bus Stop · Covered Waiting Bay North',
    },
]
LOCATIONS_BY_ID = {loc['id']: loc for loc in CAMPUS_LOCATIONS}
LOCATIONS_BY_ID['zone-classroom-b'] = LOCATIONS_BY_ID['zone-classroom-a']

# VLAN 10 = lab workstations, VLAN 20 = wireless access points.
VLAN_BY_KIND = {'PC': 10, 'AP': 20}
VLAN_LABEL = {10: 'Lab Workstations', 20: 'Wireless Access Points'}
OUI_BY_KIND = {'AP': '20:4C:03', 'PC': 'B0:7B:25'}  # Aruba / Dell vendor prefixes

MAC_RE = re.compile(r'^[0-9A-Fa-f]{2}([:-]?)[0-9A-Fa-f]{2}(\1[0-9A-Fa-f]{2}){4}$')
SERIAL_RE = re.compile(r'^[A-Za-z0-9][A-Za-z0-9\-_/]{3,39}$')

# Additional demo fleet. Lab APs align with the frontend Device Monitoring fleet; campus APs extend
# Wi-Fi coverage to classrooms, library, canteen, lounge, and the outdoor bus stop.
FLEET_APS = [
    ('ap-13', 'AP-CL-A-05', 'lab-1', 'Computing Lab A · AP 05', '10.20.1.15', 'Aruba AP-515', 'Lab A · Rear Ceiling Grid R2'),
    ('ap-14', 'AP-CL-A-06', 'lab-1', 'Computing Lab A · AP 06', '10.20.1.16', 'Aruba AP-515', 'Lab A · Instructor Podium Ceiling'),
    ('ap-15', 'AP-CL-B-05', 'lab-2', 'Computing Lab B · AP 05', '10.20.2.19', 'Aruba AP-515', 'Lab B · Server Rack Corner Wall Mount'),
    ('ap-16', 'AP-CL-C-01', 'lab-4', 'Computing Lab C · AP 01', '10.20.4.11', 'Aruba AP-515', 'Lab C · Entrance Ceiling Grid A1'),
    ('ap-17', 'AP-CL-C-02', 'lab-4', 'Computing Lab C · AP 02', '10.20.4.12', 'Aruba AP-515', 'Lab C · Centre Ceiling Grid B3'),
    ('ap-18', 'AP-CL-C-03', 'lab-4', 'Computing Lab C · AP 03', '10.20.4.13', 'Aruba AP-515', 'Lab C · Window Side Ceiling Grid C2'),
    ('ap-19', 'AP-CL-C-04', 'lab-4', 'Computing Lab C · AP 04', '10.20.4.14', 'Aruba AP-515', 'Lab C · Rear Ceiling Grid D4'),
    ('ap-20', 'AP-CL-C-05', 'lab-4', 'Computing Lab C · AP 05', '10.20.4.15', 'Aruba AP-515', 'Lab C · Project Room Wall Mount'),
    ('ap-21', 'AP-IL-05', 'lab-3', 'Innovation Lab · AP 05', '10.20.3.23', 'Aruba AP-515', 'Innovation Lab · Maker Bench Ceiling'),
    ('ap-22', 'AP-CLASS-B2', 'zone-classroom-a', 'Lecture Classroom A-04-05 · AP B2', '10.20.11.11', 'Aruba AP-515', 'Classroom A-04-05 · Front Wall Mount above Whiteboard'),
    ('ap-23', 'AP-LT1-01', 'zone-lt1', 'Auditorium 7 @ Block A Level 3 · AP 01', '10.20.12.11', 'Aruba AP-535', 'Auditorium 7 · Rear Projection Booth'),
    ('ap-24', 'AP-LIB-01', 'zone-library', 'Campus Library L1 · AP 01', '10.20.13.11', 'Aruba AP-515', 'Library L1 · Quiet Study Zone Ceiling Grid D5'),
    ('ap-25', 'AP-CANTEEN-01', 'zone-canteen', 'Main Campus Canteen · AP 01', '10.20.21.11', 'Aruba AP-535', 'Main Canteen · Ceiling Pillar C3 near Cashier'),
    ('ap-26', 'AP-CANTEEN-02', 'zone-canteen', 'Main Campus Canteen · AP 02', '10.20.21.12', 'Aruba AP-535', 'Food Court Seating · East Wall near Drinks Stall'),
    ('ap-27', 'AP-LOUNGE-01', 'zone-lounge', 'Student Lounge & Atrium · AP 01', '10.20.22.11', 'Aruba AP-515', 'Student Lounge · Atrium Mezzanine Railing'),
    ('ap-28', 'AP-BUS-01', 'zone-busstop', 'Campus Transit & Bus Stop · Outdoor AP 01', '10.20.31.11', 'Aruba AP-575 (Outdoor IP67)', 'Bus Stop · Covered Waiting Bay North (Pole Mount)'),
]


def location(location_id: str) -> dict:
    loc = LOCATIONS_BY_ID.get(location_id)
    if loc:
        return loc
    for candidate in CAMPUS_LOCATIONS:
        if (
            candidate['id'] == location_id
            or candidate['code'] == location_id
            or candidate['name'] == location_id
            or candidate['short'] == location_id
        ):
            return candidate
    raise HTTPException(404, 'Campus location not found.')


def validate_placement(kind: str, loc: dict):
    if kind == 'PC' and loc['zone_group'] != 'labs':
        raise HTTPException(422, 'Lab workstations can only be registered to a campus computing lab.')


def network_label(vlan: int, ip: str) -> str:
    return f'VLAN {vlan} · {ip} (DHCP)'


async def assign_dhcp_ip(kind: str, loc: dict) -> tuple[int, str]:
    """Lease the next free host address in the VLAN subnet for this device type and campus zone."""
    vlan = VLAN_BY_KIND[kind]
    prefix = f'10.{vlan}.{loc["vlan_octet"]}.'
    rows = await db.assets.find({'kind': kind}, {'_id': 0, 'ip': 1}).to_list(5000)
    used = {str(r.get('ip', '')) for r in rows}
    for host in range(11, 251):
        candidate = f'{prefix}{host}'
        if candidate not in used:
            return vlan, candidate
    raise HTTPException(409, f'DHCP scope {prefix}0/24 is exhausted for this location.')


def normalize_hw_id(value: str) -> str:
    """Accept a MAC address (any common delimiter) or a manufacturer serial/asset tag."""
    raw = (value or '').strip()
    if not raw:
        return ''
    if MAC_RE.match(raw):
        hexes = re.sub(r'[^0-9A-Fa-f]', '', raw).upper()
        return ':'.join(hexes[i:i + 2] for i in range(0, 12, 2))
    if SERIAL_RE.match(raw):
        return raw.upper()
    raise HTTPException(422, 'Enter a valid MAC address (AA:BB:CC:11:22:33) or serial tag (4–40 letters, digits, - _ /).')


def generate_mac(kind: str, seed: str | None = None) -> str:
    """Generate a vendor-prefixed MAC. Deterministic when a seed is given (used for backfills)."""
    tail = hashlib.sha256(seed.encode()).digest()[:3] if seed else secrets.token_bytes(3)
    return OUI_BY_KIND.get(kind, '02:00:00') + ':' + ':'.join(f'{b:02X}' for b in tail)


def default_placement(asset: dict, loc: dict | None) -> str:
    short = (loc or {}).get('short') or asset.get('lab_name') or 'Campus'
    digits = ''.join(filter(str.isdigit, str(asset.get('tag', '')).split('-')[-1])) or '1'
    n = int(digits)
    if asset.get('kind') == 'PC':
        return f'{short} · Row {(n - 1) // 5 + 1}, Desk {(n - 1) % 5 + 1}'
    return f'{short} · Ceiling Mount Grid {n}'


async def ensure_locations():
    """Upsert campus locations into the labs collection (reference data for every installation)."""
    for loc in CAMPUS_LOCATIONS:
        fields = {
            'id': loc['id'],
            'code': loc['code'],
            'name': loc['name'],
            'building': loc.get('building', loc.get('block', '')),
            'block': loc.get('block', loc.get('building', '')),
            'floor': loc.get('floor', loc.get('level', '')),
            'level': loc.get('level', loc.get('floor', '')),
            'room': loc.get('room', ''),
            'category': loc.get('category', 'Computing Lab'),
            'zone_group': loc.get('zone_group', 'labs'),
            'vlan_octet': loc.get('vlan_octet', 1),
            'short': loc.get('short', loc['name']),
            'placeholder': loc.get('placeholder', ''),
        }
        await db.labs.update_one({'id': loc['id']}, {'$set': fields}, upsert=True)


async def backfill_itam_fields():
    """Give legacy inventory rows a VLAN, DHCP lease, MAC/serial identifier, and placement landmark."""
    for asset in await db.assets.find({}, {'_id': 0}).to_list(5000):
        kind = asset.get('kind')
        if kind not in VLAN_BY_KIND:
            continue
        loc = LOCATIONS_BY_ID.get(asset.get('lab_id'))
        updates = {}
        vlan = VLAN_BY_KIND[kind]
        ip = str(asset.get('ip') or '')
        # Legacy workstation subnet 10.30.x.x migrates onto the VLAN 10 workstation scope.
        if kind == 'PC' and ip.startswith('10.30.'):
            updates['ip'] = '10.10.' + ip[len('10.30.'):]
        elif not ip and loc:
            _, updates['ip'] = await assign_dhcp_ip(kind, loc)
        if asset.get('vlan') != vlan:
            updates['vlan'] = vlan
        if asset.get('ip_assignment') != 'dhcp':
            updates['ip_assignment'] = 'dhcp'
        if not asset.get('mac'):
            updates['mac'] = generate_mac(kind, seed=asset.get('id') or asset.get('tag'))
        if not asset.get('placement'):
            updates['placement'] = default_placement(asset, loc)
        if loc and asset.get('zone_group') != loc['zone_group']:
            updates['zone_group'] = loc['zone_group']
        if updates and asset.get('id'):
            await db.assets.update_one({'id': asset['id']}, {'$set': updates})


async def _seed_ap_history(asset: dict):
    from monitoring import metrics  # local import avoids a circular dependency
    base = now().replace(minute=(now().minute // 15) * 15, second=0, microsecond=0)
    for step in range(96, -1, -1):
        slot = base - timedelta(minutes=15 * step)
        m = metrics({**asset, 'scenario': 'normal', 'last_seen': slot.isoformat()}, slot)
        row = {'id': uid(), 'asset_id': asset['id'], 'lab_id': asset['lab_id'], 'timestamp': slot.isoformat(), **m,
               'expires_at': slot + timedelta(days=7), 'synthetic': True}
        await db.telemetry.update_one({'asset_id': asset['id'], 'timestamp': slot.isoformat()}, {'$setOnInsert': row}, upsert=True)


async def ensure_campus_fleet():
    """Seed the demo campus-wide AP fleet (idempotent) with 24h of baseline telemetry for new devices."""
    if not DEMO:
        return
    ts = stamp()
    for ap_id, tag, loc_id, name, ip, model, placement in FLEET_APS:
        if await db.assets.find_one({'$or': [{'id': ap_id}, {'tag': tag}]}, {'_id': 0}):
            continue
        loc = LOCATIONS_BY_ID[loc_id]
        if await db.assets.find_one({'ip': ip}, {'_id': 0}):
            _, ip = await assign_dhcp_ip('AP', loc)
        row = {'id': ap_id, 'tag': tag, 'name': name, 'kind': 'AP', 'lab_id': loc_id, 'lab_name': loc['name'],
               'zone_group': loc['zone_group'], 'ip': ip, 'vlan': VLAN_BY_KIND['AP'], 'ip_assignment': 'dhcp',
               'mac': generate_mac('AP', seed=ap_id), 'placement': placement, 'model': model, 'archived': False,
               'scenario': 'normal', 'scenario_at': ts, 'last_seen': ts, 'created_at': ts}
        await db.assets.update_one({'id': ap_id}, {'$setOnInsert': row}, upsert=True)
        await _seed_ap_history(row)


async def ensure_campus_inventory():
    await ensure_locations()
    await ensure_campus_fleet()
    await backfill_itam_fields()

