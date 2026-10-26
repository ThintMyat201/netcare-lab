import { CAMPUS_TIMEZONE } from './api';
import { AccessPoint, Asset, Checklist, Shift, Ticket, User } from './types';

/** The parts of an asset that say where it is. */
type Placed = Pick<Asset, 'zone_group' | 'lab_id' | 'lab_name'> | null | undefined;

const SHIFT_STATE_KEY = 'atlas_shift_workflow_v2';
const LOCAL_TICKETS_KEY = 'atlas_local_tickets_v2';
const LOCAL_CHECKLISTS_KEY = 'atlas_local_checklists_v2';
const SIM_STATE_KEY = 'atlas_monitoring_sim_active_v1';
const AP_OVERRIDES_KEY = 'atlas_ap_overrides_v1';

export function isMonitoringSimActive(): boolean {
  try {
    const raw = sessionStorage.getItem(SIM_STATE_KEY);
    if (raw === null) return true;
    return raw === 'true';
  } catch {
    return true;
  }
}

export function getApOverrides(): Record<string, Partial<AccessPoint>> {
  try {
    const raw = sessionStorage.getItem(AP_OVERRIDES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveApOverride(assetIdOrTag: string, override: Partial<AccessPoint>) {
  try {
    const current = getApOverrides();
    const idKey = String(assetIdOrTag).toLowerCase();
    const upperKey = String(assetIdOrTag).toUpperCase();
    current[idKey] = { ...(current[idKey] || {}), ...override };
    current[upperKey] = { ...(current[upperKey] || {}), ...override };
    sessionStorage.setItem(AP_OVERRIDES_KEY, JSON.stringify(current));
  } catch {
    // ignore
  }
}

export function clearApOverrides() {
  try {
    sessionStorage.removeItem(AP_OVERRIDES_KEY);
  } catch {
    // ignore
  }
}

export function setMonitoringSimActive(active: boolean) {
  try {
    sessionStorage.setItem(SIM_STATE_KEY, String(active));
    clearApOverrides();
    window.dispatchEvent(new CustomEvent('atlas-sim-state', { detail: { active } }));
    window.dispatchEvent(new Event('atlas-workflow-updated'));
  } catch {
    // ignore storage errors
  }
}

export type ZoneGroup = 'labs' | 'academic' | 'common' | 'outdoor';

export const ZONE_GROUP_LABELS: Record<ZoneGroup, string> = {
  labs: 'Computing Labs',
  academic: 'Classrooms & Library',
  common: 'Canteen & Common Areas',
  outdoor: 'Outdoor / Bus Stop',
};

/** Quick zone filter pills used by Hardware Inventory and Device Monitoring. */
export const ZONE_FILTERS: [string, string][] = [
  ['all', 'All Locations'],
  ['labs', 'Computing Labs'],
  ['academic', 'Classrooms & Library'],
  ['common', 'Canteen & Common Areas'],
  ['outdoor', 'Outdoor / Bus Stop'],
];

export interface CampusLocation {
  id: string;
  code: string;
  name: string;
  block: string;
  level: string;
  /** Older names for block and level that GET /api/locations still returns. */
  building?: string;
  floor?: string;
  room: string;
  category: string;
  zone_group?: ZoneGroup;
  vlan_octet?: number;
  short?: string;
  placeholder?: string;
  workstation_count?: number;
  ap_count?: number;
  equipment_count?: number;
}

/** Campus locations (mirrors backend/campus.py). vlan_octet = third octet of the zone's DHCP scope. */
export const CAMPUS_LOCATIONS: CampusLocation[] = [
  {
    id: 'lab-1',
    code: 'B-04-03',
    name: 'Computing Lab A',
    block: 'Block B',
    level: 'Level 4',
    room: 'Room 03',
    category: 'Computing Lab',
    zone_group: 'labs',
    vlan_octet: 1,
    short: 'Lab A',
    placeholder: 'e.g. Lab A · Row 2, Desk 4',
  },
  {
    id: 'lab-2',
    code: 'B-04-04',
    name: 'Computing Lab B',
    block: 'Block B',
    level: 'Level 4',
    room: 'Room 04',
    category: 'Computing Lab',
    zone_group: 'labs',
    vlan_octet: 2,
    short: 'Lab B',
    placeholder: 'e.g. Lab B · Row 1, Desk 3',
  },
  {
    id: 'lab-4',
    code: 'B-04-05',
    name: 'Computing Lab C',
    block: 'Block B',
    level: 'Level 4',
    room: 'Room 05',
    category: 'Computing Lab',
    zone_group: 'labs',
    vlan_octet: 4,
    short: 'Lab C',
    placeholder: 'e.g. Lab C · Row 3, Desk 2',
  },
  {
    id: 'lab-3',
    code: 'Tech Lab 5-02',
    name: 'Cisco & Network Lab (Innovation Lab)',
    block: 'Block E / Tech',
    level: 'Level 5',
    room: 'Room 02',
    category: 'Computing Lab',
    zone_group: 'labs',
    vlan_octet: 3,
    short: 'Innovation Lab',
    placeholder: 'e.g. Innovation Lab · Maker Bench 2',
  },
  {
    id: 'zone-robotic',
    code: 'B-03-Robotic',
    name: 'Robotic & CADCAM Lab',
    block: 'Block B',
    level: 'Level 3',
    room: 'Room 01',
    category: 'Specialty Lab',
    zone_group: 'labs',
    vlan_octet: 5,
    short: 'Robotic Lab',
    placeholder: 'e.g. CADCAM Station 01',
  },
  {
    id: 'zone-classroom-a',
    code: 'A-04-05',
    name: 'Lecture Classroom A-04-05',
    block: 'Block A',
    level: 'Level 4',
    room: 'Room 05',
    category: 'Classroom',
    zone_group: 'academic',
    vlan_octet: 11,
    short: 'Classroom A-04-05',
    placeholder: 'e.g. Classroom A-04-05 · Front Wall Mount',
  },
  {
    id: 'zone-lt1',
    code: 'A-03-AUD7',
    name: 'Auditorium 7 @ Block A Level 3',
    block: 'Block A',
    level: 'Level 3',
    room: 'Room 07',
    category: 'Auditorium',
    zone_group: 'academic',
    vlan_octet: 12,
    short: 'Auditorium 7',
    placeholder: 'e.g. Auditorium 7 · Rear Projection Booth',
  },
  {
    id: 'zone-library',
    code: 'A-01-LIB',
    name: 'Campus Library (L1)',
    block: 'Block A',
    level: 'Level 1',
    room: 'Room 01',
    category: 'Classroom',
    zone_group: 'academic',
    vlan_octet: 13,
    short: 'Library L1',
    placeholder: 'e.g. Library L1 · Quiet Study Zone Ceiling Grid D5',
  },
  {
    id: 'zone-canteen',
    code: 'C-01-CANTEEN',
    name: 'Main Campus Canteen / Atrium',
    block: 'Block C',
    level: 'Level 1',
    room: 'Atrium',
    category: 'Common Area',
    zone_group: 'common',
    vlan_octet: 21,
    short: 'Main Canteen',
    placeholder: 'e.g. Main Canteen · Ceiling Pillar C3 near Cashier',
  },
  {
    id: 'zone-lounge',
    code: 'C-02-LOUNGE',
    name: 'Student Lounge & Atrium',
    block: 'Block C',
    level: 'Level 2',
    room: 'Atrium',
    category: 'Common Area',
    zone_group: 'common',
    vlan_octet: 22,
    short: 'Student Lounge',
    placeholder: 'e.g. Student Lounge · Atrium Mezzanine Railing',
  },
  {
    id: 'zone-busstop',
    code: 'G-01-BUS',
    name: 'Campus Transit & Bus Stop',
    block: 'Outdoor Gate 1',
    level: 'Ground Level',
    room: 'Bay 01',
    category: 'Outdoor / Transit',
    zone_group: 'outdoor',
    vlan_octet: 31,
    short: 'Bus Stop',
    placeholder: 'e.g. Bus Stop · Covered Waiting Bay North',
  },
];

/** Grouped options for the Access Point location selector. */
export const AP_LOCATION_GROUPS: { label: string; zones: ZoneGroup[] }[] = [
  { label: 'Computing Labs & Specialty Labs', zones: ['labs'] },
  { label: 'Academic & Classrooms', zones: ['academic'] },
  { label: 'Campus Common & Outdoor Areas', zones: ['common', 'outdoor'] },
];

export function findLocation(labIdOrName?: string) {
  if (!labIdOrName) return undefined;
  const target = String(labIdOrName).trim();
  if (target === 'zone-classroom-b' || target === 'Classroom Block B (L2)') {
    return CAMPUS_LOCATIONS.find(l => l.id === 'zone-classroom-a') || CAMPUS_LOCATIONS[5];
  }
  return (
    CAMPUS_LOCATIONS.find(
      l =>
        l.id === target ||
        l.name === target ||
        l.code === target ||
        l.short === target ||
        target.includes(l.code) ||
        target.includes(l.name),
    ) || CAMPUS_LOCATIONS.find(l => target.toLowerCase().includes(l.short.toLowerCase()))
  );
}

export function formatLocationWithCode(labIdOrName?: string): string {
  if (!labIdOrName) return '';
  const loc = findLocation(labIdOrName);
  if (!loc) return labIdOrName;
  if (loc.code && labIdOrName.includes(loc.code)) return labIdOrName;
  return `${loc.name} (${loc.code || ''})`;
}

export function formatLocationBadge(labIdOrName?: string): { code: string; name: string; summary: string } {
  const loc = findLocation(labIdOrName);
  if (!loc) return { code: '', name: labIdOrName || 'Campus', summary: '' };
  const summary = [loc.block, loc.level, loc.room].filter(Boolean).join(' · ');
  return { code: loc.code, name: loc.name, summary };
}

export function computeNextDevice(
  kind: 'PC' | 'AP' | string,
  labId: string,
  existingAssets: Pick<Asset, 'tag'>[] = [],
): { tag: string; name: string; model: string; placement: string } {
  const loc = findLocation(labId);
  const locId = loc?.id || labId;
  const locShort = loc?.short || loc?.name || 'Lab';

  let prefix = '';
  if (locId === 'lab-1') {
    prefix = kind === 'PC' ? 'PC-CL-A-' : 'AP-CL-A-';
  } else if (locId === 'lab-2') {
    prefix = kind === 'PC' ? 'PC-CL-B-' : 'AP-CL-B-';
  } else if (locId === 'lab-4') {
    prefix = kind === 'PC' ? 'PC-CL-C-' : 'AP-CL-C-';
  } else if (locId === 'lab-3') {
    prefix = kind === 'PC' ? 'PC-IL-' : 'AP-IL-';
  } else if (locId === 'zone-canteen') {
    prefix = kind === 'PC' ? 'PC-CANTEEN-' : 'AP-CANTEEN-';
  } else if (locId === 'zone-busstop') {
    prefix = kind === 'PC' ? 'PC-BUS-' : 'AP-BUS-';
  } else if (locId === 'zone-classroom-a') {
    prefix = kind === 'PC' ? 'PC-CLASS-A-' : 'AP-CLASS-A04-';
  } else if (locId === 'zone-lt1') {
    prefix = kind === 'PC' ? 'PC-AUD7-' : 'AP-AUD7-';
  } else if (locId === 'zone-library') {
    prefix = kind === 'PC' ? 'PC-LIB-' : 'AP-LIB-';
  } else if (locId === 'zone-robotic') {
    prefix = kind === 'PC' ? 'PC-ROBOTIC-' : 'AP-ROBOTIC-';
  } else if (locId === 'zone-lounge') {
    prefix = kind === 'PC' ? 'PC-LOUNGE-' : 'AP-LOUNGE-';
  } else {
    const cleanCode = (loc?.code || 'RM').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    prefix = `${kind}-${cleanCode}-`;
  }

  const matching = existingAssets.filter(a => (a.tag || '').toUpperCase().startsWith(prefix.toUpperCase()));
  let maxNum = 0;
  matching.forEach(a => {
    const numPart = (a.tag || '').slice(prefix.length);
    const n = parseInt(numPart, 10);
    if (!isNaN(n) && n > maxNum) maxNum = n;
  });

  const nextNum = maxNum + 1;
  const padded = nextNum < 10 ? `0${nextNum}` : String(nextNum);
  const tag = `${prefix}${padded}`;

  const name = kind === 'PC' ? `Workstation ${padded}` : `${loc?.short || loc?.name || 'Campus'} · AP ${padded}`;

  const model =
    kind === 'PC'
      ? 'Dell OptiPlex 7090'
      : loc?.zone_group === 'outdoor'
        ? 'Aruba AP-575 (Outdoor IP67)'
        : 'Aruba AP-515';

  let placement = '';
  if (kind === 'PC') {
    const row = Math.floor((nextNum - 1) / 5) + 1;
    const desk = ((nextNum - 1) % 5) + 1;
    placement = `${locShort} · Row ${row}, Desk ${desk}`;
  } else {
    placement = `${locShort} · Ceiling Mount Grid ${nextNum}`;
  }

  return { tag, name, model, placement };
}

export function computeAutoRoomCode(block: string, level: string, room: string): string {
  const roomClean = room.trim().toUpperCase();
  if (!roomClean) return '';

  let blockPrefix = 'B';
  if (block.includes('Block A')) blockPrefix = 'A';
  else if (block.includes('Block B')) blockPrefix = 'B';
  else if (block.includes('Block C')) blockPrefix = 'C';
  else if (block.includes('Block D')) blockPrefix = 'D';
  else if (block.includes('Block S')) blockPrefix = 'S';
  else if (block.includes('Tech')) blockPrefix = 'Tech Lab';
  else if (block.includes('Outdoor') || block.includes('Gate')) blockPrefix = 'G';

  let levelNum = '01';
  const digitMatch = level.match(/\d+/);
  if (digitMatch) {
    const d = parseInt(digitMatch[0], 10);
    levelNum = d < 10 ? `0${d}` : String(d);
  } else if (level.toLowerCase().includes('ground')) {
    levelNum = '01';
  } else if (level.toLowerCase().includes('rooftop')) {
    levelNum = 'RF';
  }

  if (blockPrefix === 'Tech Lab') {
    const numOnly = parseInt(levelNum, 10) || 5;
    const roomPad = roomClean.length === 1 ? `0${roomClean}` : roomClean;
    return `Tech Lab ${numOnly}-${roomPad}`;
  }

  const roomPadded = /^\d$/.test(roomClean) ? `0${roomClean}` : roomClean;
  return `${blockPrefix}-${levelNum}-${roomPadded}`;
}

export function zoneGroupOf(asset: Placed): ZoneGroup {
  return (
    (asset?.zone_group as ZoneGroup) ||
    findLocation(asset?.lab_id)?.zone_group ||
    findLocation(asset?.lab_name)?.zone_group ||
    'labs'
  );
}

export function matchesZone(asset: Placed, zone: string): boolean {
  return zone === 'all' || zoneGroupOf(asset) === zone;
}

/** VLAN 10 = lab workstations, VLAN 20 = wireless access points. Addresses are DHCP leases. */
export function vlanFor(kind: string): number {
  return kind === 'PC' ? 10 : 20;
}

export function dhcpScopePreview(kind: string, labId: string): string {
  const vlan = vlanFor(kind);
  const octet = findLocation(labId)?.vlan_octet ?? 1;
  return `VLAN ${vlan} · 10.${vlan}.${octet}.x (DHCP)`;
}

export function networkLabel(asset: Pick<Asset, 'vlan' | 'kind' | 'ip'> | null | undefined): {
  vlan: number;
  ip: string;
} {
  return { vlan: asset?.vlan || vlanFor(asset?.kind), ip: asset?.ip || 'Lease pending' };
}

export const SIMULATION_FLEET_APS: AccessPoint[] = [
  // Computing Lab A (6 APs: 3 Online, 1 Congested, 1 Offline, 1 Feed Interrupted)
  {
    id: 'ap-01',
    tag: 'AP-CL-A-01',
    name: 'Computing Lab A · AP 01',
    kind: 'AP',
    lab_id: 'lab-1',
    lab_name: 'Computing Lab A',
    zone_group: 'labs',
    placement: 'Lab A · Ceiling Mount Grid 1',
    ip: '10.20.1.11',
    model: 'Aruba AP-515',
    status: 'online',
    scenario: 'normal',
    clients: 28,
    load: 38,
    latency: 12,
    throughput: 31.4,
  },
  {
    id: 'ap-02',
    tag: 'AP-CL-A-02',
    name: 'Computing Lab A · AP 02',
    kind: 'AP',
    lab_id: 'lab-1',
    lab_name: 'Computing Lab A',
    zone_group: 'labs',
    placement: 'Lab A · Ceiling Mount Grid 2',
    ip: '10.20.1.12',
    model: 'Aruba AP-515',
    status: 'online',
    scenario: 'normal',
    clients: 32,
    load: 44,
    latency: 11,
    throughput: 34.8,
  },
  {
    id: 'ap-03',
    tag: 'AP-CL-A-03',
    name: 'Computing Lab A · AP 03',
    kind: 'AP',
    lab_id: 'lab-1',
    lab_name: 'Computing Lab A',
    zone_group: 'labs',
    placement: 'Lab A · Ceiling Mount Grid 3',
    ip: '10.20.1.13',
    model: 'Aruba AP-515',
    status: 'congested',
    scenario: 'congestion',
    clients: 71,
    load: 87,
    latency: 119,
    throughput: 66.8,
  },
  {
    id: 'ap-04',
    tag: 'AP-CL-A-04',
    name: 'Computing Lab A · AP 04',
    kind: 'AP',
    lab_id: 'lab-1',
    lab_name: 'Computing Lab A',
    zone_group: 'labs',
    placement: 'Lab A · Ceiling Mount Grid 4',
    ip: '10.20.1.14',
    model: 'Aruba AP-515',
    status: 'offline',
    scenario: 'outage',
    clients: 0,
    load: 0,
    latency: null,
    throughput: 0,
  },
  {
    id: 'ap-13',
    tag: 'AP-CL-A-05',
    name: 'Computing Lab A · AP 05',
    kind: 'AP',
    lab_id: 'lab-1',
    lab_name: 'Computing Lab A',
    zone_group: 'labs',
    placement: 'Lab A · Rear Ceiling Grid R2',
    ip: '10.20.1.15',
    model: 'Aruba AP-515',
    status: 'online',
    scenario: 'normal',
    clients: 25,
    load: 35,
    latency: 9,
    throughput: 27.6,
  },
  {
    id: 'ap-14',
    tag: 'AP-CL-A-06',
    name: 'Computing Lab A · AP 06',
    kind: 'AP',
    lab_id: 'lab-1',
    lab_name: 'Computing Lab A',
    zone_group: 'labs',
    placement: 'Lab A · Instructor Podium Ceiling',
    ip: '10.20.1.16',
    model: 'Aruba AP-515',
    status: 'stale',
    scenario: 'feed',
    clients: null,
    load: null,
    latency: null,
    throughput: null,
  },

  // Computing Lab B (5 APs: 2 Online, 1 Congested, 1 Offline, 1 Feed Interrupted)
  {
    id: 'ap-05',
    tag: 'AP-CL-B-01',
    name: 'Computing Lab B · AP 01',
    kind: 'AP',
    lab_id: 'lab-2',
    lab_name: 'Computing Lab B',
    zone_group: 'labs',
    placement: 'Lab B · Ceiling Mount Grid 1',
    ip: '10.20.2.11',
    model: 'Aruba AP-515',
    status: 'online',
    scenario: 'normal',
    clients: 29,
    load: 41,
    latency: 12,
    throughput: 29.5,
  },
  {
    id: 'ap-06',
    tag: 'AP-CL-B-02',
    name: 'Computing Lab B · AP 02',
    kind: 'AP',
    lab_id: 'lab-2',
    lab_name: 'Computing Lab B',
    zone_group: 'labs',
    placement: 'Lab B · Ceiling Mount Grid 2',
    ip: '10.20.2.12',
    model: 'Aruba AP-515',
    status: 'online',
    scenario: 'normal',
    clients: 34,
    load: 48,
    latency: 14,
    throughput: 35.2,
  },
  {
    id: 'ap-07',
    tag: 'AP-CL-B-03',
    name: 'Computing Lab B · AP 03',
    kind: 'AP',
    lab_id: 'lab-2',
    lab_name: 'Computing Lab B',
    zone_group: 'labs',
    placement: 'Lab B · Ceiling Mount Grid 3',
    ip: '10.20.2.13',
    model: 'Aruba AP-515',
    status: 'congested',
    scenario: 'congestion',
    clients: 84,
    load: 92,
    latency: 142,
    throughput: 79.4,
  },
  {
    id: 'ap-08',
    tag: 'AP-CL-B-04',
    name: 'Computing Lab B · AP 04',
    kind: 'AP',
    lab_id: 'lab-2',
    lab_name: 'Computing Lab B',
    zone_group: 'labs',
    placement: 'Lab B · Ceiling Mount Grid 4',
    ip: '10.20.2.14',
    model: 'Aruba AP-515',
    status: 'offline',
    scenario: 'outage',
    clients: 0,
    load: 0,
    latency: null,
    throughput: 0,
  },
  {
    id: 'ap-15',
    tag: 'AP-CL-B-05',
    name: 'Computing Lab B · AP 05',
    kind: 'AP',
    lab_id: 'lab-2',
    lab_name: 'Computing Lab B',
    zone_group: 'labs',
    placement: 'Lab B · Server Rack Corner Wall Mount',
    ip: '10.20.2.15',
    model: 'Aruba AP-515',
    status: 'stale',
    scenario: 'feed',
    clients: null,
    load: null,
    latency: null,
    throughput: null,
  },

  // Computing Lab C (5 APs: 2 Online, 1 Congested, 1 Offline, 1 Feed Interrupted)
  {
    id: 'ap-16',
    tag: 'AP-CL-C-01',
    name: 'Computing Lab C · AP 01',
    kind: 'AP',
    lab_id: 'lab-4',
    lab_name: 'Computing Lab C',
    zone_group: 'labs',
    placement: 'Lab C · Entrance Ceiling Grid A1',
    ip: '10.20.4.11',
    model: 'Aruba AP-515',
    status: 'online',
    scenario: 'normal',
    clients: 26,
    load: 36,
    latency: 10,
    throughput: 28.4,
  },
  {
    id: 'ap-17',
    tag: 'AP-CL-C-02',
    name: 'Computing Lab C · AP 02',
    kind: 'AP',
    lab_id: 'lab-4',
    lab_name: 'Computing Lab C',
    zone_group: 'labs',
    placement: 'Lab C · Centre Ceiling Grid B3',
    ip: '10.20.4.12',
    model: 'Aruba AP-515',
    status: 'online',
    scenario: 'normal',
    clients: 38,
    load: 52,
    latency: 13,
    throughput: 41.0,
  },
  {
    id: 'ap-18',
    tag: 'AP-CL-C-03',
    name: 'Computing Lab C · AP 03',
    kind: 'AP',
    lab_id: 'lab-4',
    lab_name: 'Computing Lab C',
    zone_group: 'labs',
    placement: 'Lab C · Window Side Ceiling Grid C2',
    ip: '10.20.4.13',
    model: 'Aruba AP-515',
    status: 'congested',
    scenario: 'congestion',
    clients: 88,
    load: 94,
    latency: 156,
    throughput: 82.5,
  },
  {
    id: 'ap-19',
    tag: 'AP-CL-C-04',
    name: 'Computing Lab C · AP 04',
    kind: 'AP',
    lab_id: 'lab-4',
    lab_name: 'Computing Lab C',
    zone_group: 'labs',
    placement: 'Lab C · Rear Ceiling Grid D4',
    ip: '10.20.4.14',
    model: 'Aruba AP-515',
    status: 'offline',
    scenario: 'outage',
    clients: 0,
    load: 0,
    latency: null,
    throughput: 0,
  },
  {
    id: 'ap-20',
    tag: 'AP-CL-C-05',
    name: 'Computing Lab C · AP 05',
    kind: 'AP',
    lab_id: 'lab-4',
    lab_name: 'Computing Lab C',
    zone_group: 'labs',
    placement: 'Lab C · Project Room Wall Mount',
    ip: '10.20.4.15',
    model: 'Aruba AP-515',
    status: 'stale',
    scenario: 'feed',
    clients: null,
    load: null,
    latency: null,
    throughput: null,
  },

  // Innovation Lab (5 APs: 2 Online, 2 Congested, 1 Offline)
  {
    id: 'ap-09',
    tag: 'AP-IL-01',
    name: 'Innovation Lab · AP 01',
    kind: 'AP',
    lab_id: 'lab-3',
    lab_name: 'Innovation Lab',
    zone_group: 'labs',
    placement: 'Innovation Lab · Ceiling Mount Grid 1',
    ip: '10.20.3.11',
    model: 'Aruba AP-515',
    status: 'online',
    scenario: 'normal',
    clients: 44,
    load: 56,
    latency: 12,
    throughput: 51.8,
  },
  {
    id: 'ap-10',
    tag: 'AP-IL-02',
    name: 'Innovation Lab · AP 02',
    kind: 'AP',
    lab_id: 'lab-3',
    lab_name: 'Innovation Lab',
    zone_group: 'labs',
    placement: 'Innovation Lab · Ceiling Mount Grid 2',
    ip: '10.20.3.12',
    model: 'Aruba AP-515',
    status: 'congested',
    scenario: 'congestion',
    clients: 76,
    load: 89,
    latency: 128,
    throughput: 71.2,
  },
  {
    id: 'ap-11',
    tag: 'AP-IL-03',
    name: 'Innovation Lab · AP 03',
    kind: 'AP',
    lab_id: 'lab-3',
    lab_name: 'Innovation Lab',
    zone_group: 'labs',
    placement: 'Innovation Lab · Ceiling Mount Grid 3',
    ip: '10.20.3.13',
    model: 'Aruba AP-515',
    status: 'online',
    scenario: 'normal',
    clients: 39,
    load: 49,
    latency: 11,
    throughput: 45.6,
  },
  {
    id: 'ap-12',
    tag: 'AP-IL-04',
    name: 'Innovation Lab · AP 04',
    kind: 'AP',
    lab_id: 'lab-3',
    lab_name: 'Innovation Lab',
    zone_group: 'labs',
    placement: 'Innovation Lab · Ceiling Mount Grid 4',
    ip: '10.20.3.14',
    model: 'Aruba AP-515',
    status: 'congested',
    scenario: 'congestion',
    clients: 69,
    load: 86,
    latency: 115,
    throughput: 64.9,
  },
  {
    id: 'ap-21',
    tag: 'AP-IL-05',
    name: 'Innovation Lab · AP 05',
    kind: 'AP',
    lab_id: 'lab-3',
    lab_name: 'Innovation Lab',
    zone_group: 'labs',
    placement: 'Innovation Lab · Maker Bench Ceiling',
    ip: '10.20.3.15',
    model: 'Aruba AP-515',
    status: 'offline',
    scenario: 'outage',
    clients: 0,
    load: 0,
    latency: null,
    throughput: 0,
  },

  // Campus-wide coverage beyond the labs (7 APs · healthy in every demo state)
  {
    id: 'ap-22',
    tag: 'AP-CLASS-B2',
    name: 'Classroom Block B · AP B2',
    kind: 'AP',
    lab_id: 'zone-classroom-a',
    lab_name: 'Lecture Classroom A-04-05',
    zone_group: 'academic',
    placement: 'Classroom A-04-05 · Front Wall Mount above Whiteboard',
    ip: '10.20.11.11',
    model: 'Aruba AP-515',
    status: 'online',
    scenario: 'normal',
    clients: 36,
    load: 41,
    latency: 11,
    throughput: 29.8,
  },
  {
    id: 'ap-23',
    tag: 'AP-LT1-01',
    name: 'Auditorium 7 @ Block A · AP 01',
    kind: 'AP',
    lab_id: 'zone-lt1',
    lab_name: 'Auditorium 7 @ Block A Level 3',
    zone_group: 'academic',
    placement: 'Auditorium 7 · Rear Projection Booth',
    ip: '10.20.12.11',
    model: 'Aruba AP-535',
    status: 'online',
    scenario: 'normal',
    clients: 54,
    load: 52,
    latency: 13,
    throughput: 38.6,
  },
  {
    id: 'ap-24',
    tag: 'AP-LIB-01',
    name: 'Campus Library L1 · AP 01',
    kind: 'AP',
    lab_id: 'zone-library',
    lab_name: 'Campus Library (L1)',
    zone_group: 'academic',
    placement: 'Library L1 · Quiet Study Zone Ceiling Grid D5',
    ip: '10.20.13.11',
    model: 'Aruba AP-515',
    status: 'online',
    scenario: 'normal',
    clients: 40,
    load: 39,
    latency: 10,
    throughput: 35.1,
  },
  {
    id: 'ap-25',
    tag: 'AP-CANTEEN-01',
    name: 'Campus Canteen · AP 01',
    kind: 'AP',
    lab_id: 'zone-canteen',
    lab_name: 'Main Campus Canteen / Atrium',
    zone_group: 'common',
    placement: 'Main Canteen · Ceiling Pillar C3 near Cashier',
    ip: '10.20.21.11',
    model: 'Aruba AP-535',
    status: 'online',
    scenario: 'normal',
    clients: 52,
    load: 57,
    latency: 14,
    throughput: 31.2,
  },
  {
    id: 'ap-26',
    tag: 'AP-CANTEEN-02',
    name: 'Campus Canteen · AP 02',
    kind: 'AP',
    lab_id: 'zone-canteen',
    lab_name: 'Main Campus Canteen / Atrium',
    zone_group: 'common',
    placement: 'Food Court Seating · East Wall near Drinks Stall',
    ip: '10.20.21.12',
    model: 'Aruba AP-535',
    status: 'online',
    scenario: 'normal',
    clients: 47,
    load: 53,
    latency: 13,
    throughput: 28.4,
  },
  {
    id: 'ap-27',
    tag: 'AP-LOUNGE-01',
    name: 'Student Lounge & Atrium · AP 01',
    kind: 'AP',
    lab_id: 'zone-lounge',
    lab_name: 'Student Lounge & Atrium',
    zone_group: 'common',
    placement: 'Student Lounge · Atrium Mezzanine Railing',
    ip: '10.20.22.11',
    model: 'Aruba AP-515',
    status: 'online',
    scenario: 'normal',
    clients: 30,
    load: 34,
    latency: 11,
    throughput: 22.5,
  },
  {
    id: 'ap-28',
    tag: 'AP-BUS-01',
    name: 'School Bus Stop · Outdoor AP 01',
    kind: 'AP',
    lab_id: 'zone-busstop',
    lab_name: 'Campus Transit & Bus Stop',
    zone_group: 'outdoor',
    placement: 'Bus Stop · Covered Waiting Bay North (Pole Mount)',
    ip: '10.20.31.11',
    model: 'Aruba AP-575 (Outdoor IP67)',
    status: 'online',
    scenario: 'normal',
    clients: 16,
    load: 24,
    latency: 15,
    throughput: 8.8,
  },
];

export function getSharedFleetAps(): AccessPoint[] {
  const isSim = isMonitoringSimActive();
  const overrides = getApOverrides();
  const nowIso = new Date().toISOString();

  if (!isSim) {
    // Healthy baseline: all 28 APs online
    return SIMULATION_FLEET_APS.map(ap => {
      const idKey = String(ap.id).toLowerCase();
      const tagKey = String(ap.tag).toUpperCase();
      const override = overrides[idKey] || overrides[tagKey] || {};
      return {
        ...ap,
        last_seen: ap.last_seen || override.last_seen || nowIso,
        status: 'online',
        scenario: 'normal',
        clients: 28 + ((parseInt(ap.id.replace(/\D/g, '') || '1', 10) * 3) % 15),
        load: 34 + ((parseInt(ap.id.replace(/\D/g, '') || '1', 10) * 5) % 20),
        latency: 11 + (parseInt(ap.id.replace(/\D/g, '') || '1', 10) % 4),
        throughput: 32.5,
        ...override,
      };
    }).sort((a, b) => (a.tag || '').localeCompare(b.tag || ''));
  }

  return SIMULATION_FLEET_APS.map(ap => {
    const idKey = String(ap.id).toLowerCase();
    const tagKey = String(ap.tag).toUpperCase();
    const override = overrides[idKey] || overrides[tagKey];
    if (override) {
      return {
        ...ap,
        last_seen: ap.last_seen || override.last_seen || nowIso,
        ...override,
      };
    }
    return {
      ...ap,
      last_seen: ap.last_seen || nowIso,
    };
  }).sort((a, b) => (a.tag || '').localeCompare(b.tag || ''));
}

export function restoreDevice(assetIdOrTag: string) {
  if (!assetIdOrTag) return;
  const raw = String(assetIdOrTag).trim();
  const lower = raw.toLowerCase();
  const upper = raw.toUpperCase();

  // 1. If it's an Access Point (AP-*)
  if (lower.startsWith('ap-') || lower.startsWith('ap_') || upper.startsWith('AP-') || lower.includes('ap')) {
    saveApOverride(raw, {
      status: 'online',
      scenario: 'normal',
      load: 36,
      clients: 26,
      latency: 11,
      throughput: 30.5,
    });
  }

  // 2. If it's a Lab PC (PC-*) or workstation, restore checklist to passed
  try {
    const rawChecklists = localStorage.getItem(LOCAL_CHECKLISTS_KEY);
    const checklists = rawChecklists ? JSON.parse(rawChecklists) : [];
    let changed = false;
    const updated = checklists.map((c: Checklist) => {
      if (
        c.asset_id === raw ||
        c.asset_tag === raw ||
        c.asset_tag === upper ||
        String(c.asset_id).toLowerCase() === lower
      ) {
        changed = true;
        return {
          ...c,
          result: 'passed',
          summary: 'All workstation hardware & network checks passed and verified nominal.',
          notes: (c.notes || '') + ' [Restored & verified by Network Engineer]',
        };
      }
      return c;
    });

    if (changed) {
      localStorage.setItem(LOCAL_CHECKLISTS_KEY, JSON.stringify(updated));
    }
  } catch {
    // ignore
  }

  // Notify all components of state changes
  window.dispatchEvent(new CustomEvent('atlas-sim-state', { detail: { active: isMonitoringSimActive() } }));
  window.dispatchEvent(new Event('atlas-workflow-updated'));
}

export const SIMULATION_LINKED_TICKETS: Ticket[] = [
  {
    id: 'sim-inc-1038',
    number: 'INC-1038',
    asset_id: 'ap-07',
    asset_tag: 'AP-CL-B-03',
    asset_name: 'Computing Lab B · AP 03',
    asset_kind: 'AP',
    lab_id: 'lab-2',
    lab_name: 'Computing Lab B',
    category: 'network',
    priority: 'high',
    status: 'in_progress',
    title: 'High Bandwidth Congestion (92%) — AP-CL-B-03',
    description:
      'Automated NOC escalation: Sustained 92% airtime utilization and 142ms RTT on AP-CL-B-03 (10.20.2.13).',
    created_at: '2026-10-21T09:15:00+08:00',
    updated_at: '2026-10-21T09:30:00+08:00',
    synthetic: true,
  },
  {
    id: 'sim-inc-1041',
    number: 'INC-1041',
    asset_id: 'ap-04',
    asset_tag: 'AP-CL-A-04',
    asset_name: 'Computing Lab A · AP 04',
    asset_kind: 'AP',
    lab_id: 'lab-1',
    lab_name: 'Computing Lab A',
    category: 'network',
    priority: 'high',
    status: 'open',
    title: 'Hardware Link Outage / Unreachable — AP-CL-A-04',
    description:
      '100% ICMP packet loss detected on AP-CL-A-04 (10.20.1.14). Upstream PoE switch port Gi1/0/4 link down.',
    created_at: '2026-10-21T09:42:00+08:00',
    updated_at: '2026-10-21T09:42:00+08:00',
    synthetic: true,
  },
  {
    id: 'sim-inc-1042',
    number: 'INC-1042',
    asset_id: 'ap-08',
    asset_tag: 'AP-CL-B-04',
    asset_name: 'Computing Lab B · AP 04',
    asset_kind: 'AP',
    lab_id: 'lab-2',
    lab_name: 'Computing Lab B',
    category: 'network',
    priority: 'high',
    status: 'open',
    title: 'Hardware Link Outage / Unreachable — AP-CL-B-04',
    description: '100% ICMP packet loss detected on AP-CL-B-04 (10.20.2.14). Switch port PoE power draw dropped to 0W.',
    created_at: '2026-10-21T09:45:00+08:00',
    updated_at: '2026-10-21T09:45:00+08:00',
    synthetic: true,
  },
  {
    id: 'sim-inc-1043',
    number: 'INC-1043',
    asset_id: 'ap-19',
    asset_tag: 'AP-CL-C-04',
    asset_name: 'Computing Lab C · AP 04',
    asset_kind: 'AP',
    lab_id: 'lab-4',
    lab_name: 'Computing Lab C',
    category: 'network',
    priority: 'high',
    status: 'open',
    title: 'Hardware Link Outage / Unreachable — AP-CL-C-04',
    description:
      'Hardware link outage on AP-CL-C-04 (10.20.4.14) in Computing Lab C. Device unreachable from core router.',
    created_at: '2026-10-21T09:48:00+08:00',
    updated_at: '2026-10-21T09:48:00+08:00',
    synthetic: true,
  },
  {
    id: 'sim-inc-1044',
    number: 'INC-1044',
    asset_id: 'ap-21',
    asset_tag: 'AP-IL-05',
    asset_name: 'Innovation Lab · AP 05',
    asset_kind: 'AP',
    lab_id: 'lab-3',
    lab_name: 'Innovation Lab',
    category: 'network',
    priority: 'high',
    status: 'open',
    title: 'Hardware Link Outage / Unreachable — AP-IL-05',
    description: 'Hardware link outage on AP-IL-05 (10.20.3.15) in Innovation Lab. Uplink transceiver loss of signal.',
    created_at: '2026-10-21T09:50:00+08:00',
    updated_at: '2026-10-21T09:50:00+08:00',
    synthetic: true,
  },
];

export interface ShiftWorkflowState {
  acknowledged_at?: string | null;
  completed_at?: string | null;
  handover_notes?: string;
  cancelled?: boolean;
}

export function getTodayMytDateString(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: CAMPUS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const y = parts.find(p => p.type === 'year')?.value || '2026';
  const m = parts.find(p => p.type === 'month')?.value || '10';
  const d = parts.find(p => p.type === 'day')?.value || '21';
  return `${y}-${m}-${d}`;
}

export const CAMPUS_SHIFT_BLOCKS = [
  {
    key: 'morning',
    label: 'Morning Shift',
    windowText: '08:00 – 12:00 MYT',
    startHour: '08:00:00',
    endHour: '12:00:00',
    lab_id: 'lab-1',
    lab_name: 'Computing Lab A',
    assistant_id: 'assistant',
    assistant_name: 'Jamie Santos',
  },
  {
    key: 'afternoon',
    label: 'Afternoon Shift',
    windowText: '12:00 – 16:00 MYT',
    startHour: '12:00:00',
    endHour: '16:00:00',
    lab_id: 'lab-2',
    lab_name: 'Computing Lab B',
    assistant_id: 'asst-2',
    assistant_name: 'Mika Flores',
  },
  {
    key: 'evening',
    label: 'Evening Shift',
    windowText: '16:00 – 20:00 MYT',
    startHour: '16:00:00',
    endHour: '20:00:00',
    lab_id: 'lab-3',
    lab_name: 'Innovation Lab',
    assistant_id: 'assistant',
    assistant_name: 'Jamie Santos',
  },
];

export function getAssistantUnacknowledgedShifts(user: User | null): Shift[] {
  try {
    const shifts = normalizeCampusShifts(null);
    return shifts.filter(
      s =>
        !s.cancelled &&
        !s.acknowledged_at &&
        !s.completed_at &&
        (s.assistant_id === user?.id || s.assistant_name === user?.name || user?.role === 'assistant'),
    );
  } catch {
    return [];
  }
}

export function loadShiftOverrides(): Record<string, ShiftWorkflowState> {
  try {
    const raw = localStorage.getItem(SHIFT_STATE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveShiftOverride(shiftId: string, patch: Partial<ShiftWorkflowState>) {
  const current = loadShiftOverrides();
  current[shiftId] = { ...(current[shiftId] || {}), ...patch };
  try {
    localStorage.setItem(SHIFT_STATE_KEY, JSON.stringify(current));
    window.dispatchEvent(new Event('atlas-workflow-updated'));
  } catch {
    // ignore storage errors
  }
}

export function loadLocalTickets(): Ticket[] {
  try {
    const raw = localStorage.getItem(LOCAL_TICKETS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveLocalTicket(ticket: Ticket) {
  const list = loadLocalTickets();
  const next = [ticket, ...list.filter(t => t.id !== ticket.id)];
  try {
    localStorage.setItem(LOCAL_TICKETS_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event('atlas-workflow-updated'));
  } catch {
    // ignore
  }
}

export function loadLocalChecklists(): Checklist[] {
  try {
    const raw = localStorage.getItem(LOCAL_CHECKLISTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveLocalChecklist(checklist: Checklist) {
  const list = loadLocalChecklists();
  const next = [checklist, ...list.filter(c => c.id !== checklist.id)];
  try {
    localStorage.setItem(LOCAL_CHECKLISTS_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event('atlas-workflow-updated'));
  } catch {
    // ignore
  }
}

export function enrichTicket(t: Ticket): Ticket {
  const tag = String(t.asset_tag || '').toUpperCase();
  const inferredLab =
    t.lab_name ||
    (tag.includes('-CL-A') || tag.includes('CL-A')
      ? 'Computing Lab A'
      : tag.includes('-CL-B') || tag.includes('CL-B')
        ? 'Computing Lab B'
        : tag.includes('-CL-C') || tag.includes('CL-C')
          ? 'Computing Lab C'
          : tag.includes('-IL') || tag.includes('IL')
            ? 'Innovation Lab'
            : 'Computing Lab A');

  const isNetwork =
    t.category === 'network' ||
    tag.startsWith('AP-') ||
    String(t.tier || '')
      .toLowerCase()
      .includes('tier 2') ||
    String(t.title || '')
      .toLowerCase()
      .includes('network') ||
    String(t.title || '')
      .toLowerCase()
      .includes('connectivity') ||
    String(t.title || '')
      .toLowerCase()
      .includes('nic');

  return {
    ...t,
    lab_name: inferredLab,
    tier: t.tier || (isNetwork ? 'Tier 2 · Network / Connectivity' : 'Tier 1 · Hardware / Peripheral'),
    tier_code: isNetwork ? 'tier2' : 'tier1',
    assigned_role: t.assigned_role || (isNetwork ? 'engineer' : 'assistant'),
    assigned_name:
      t.assigned_name || (isNetwork ? 'Daniel Reyes (Network Engineer)' : 'Jamie Santos (Lab Support · Tier 1)'),
  };
}

export function mergeTickets(apiTickets: Ticket[] | null | undefined): Ticket[] {
  const local = loadLocalTickets();
  const base = Array.isArray(apiTickets) ? apiTickets : [];
  const sim = isMonitoringSimActive() ? SIMULATION_LINKED_TICKETS : [];
  const byKey = new Map<string, Ticket>();
  const seenIds = new Set<string>();

  for (const item of [...local, ...sim, ...base]) {
    if (!item) continue;
    const numKey = item.number ? String(item.number).toUpperCase() : null;
    const idKey = item.id ? String(item.id) : null;
    const primaryKey = numKey || idKey;
    if (!primaryKey) continue;

    if (byKey.has(primaryKey) || (numKey && seenIds.has(numKey)) || (idKey && seenIds.has(idKey))) {
      continue;
    }

    const enriched = enrichTicket(item);
    byKey.set(primaryKey, enriched);
    if (numKey) seenIds.add(numKey);
    if (idKey) seenIds.add(idKey);
  }
  return Array.from(byKey.values()).sort(
    (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime(),
  );
}

export function mergeChecklists(apiChecklists: Checklist[] | null | undefined): Checklist[] {
  const local = loadLocalChecklists();
  const base = Array.isArray(apiChecklists) ? apiChecklists : [];
  const byId = new Map<string, Checklist>();
  for (const item of [...local, ...base]) {
    if (item?.id && !byId.has(item.id)) {
      byId.set(item.id, item);
    }
  }
  return Array.from(byId.values()).sort(
    (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime(),
  );
}

export function normalizeCampusShifts(rawShifts: Shift[] | null | undefined): Shift[] {
  const today = getTodayMytDateString();
  const overrides = loadShiftOverrides();
  const input = Array.isArray(rawShifts) ? [...rawShifts] : [];

  // Ensure all 3 standard campus lab blocks exist with realistic 4-hour windows
  const normalized: Shift[] = CAMPUS_SHIFT_BLOCKS.map((block, idx) => {
    const existing =
      input.find(s => s.id === `shift-seed-${idx}`) ||
      input.find(s => s.lab_id === block.lab_id || s.lab_name === block.lab_name);

    const id = existing?.id || `shift-seed-${idx}`;
    const ov = overrides[id] || {};
    const startIso = `${today}T${block.startHour}+08:00`;
    const endIso = `${today}T${block.endHour}+08:00`;

    // By default, keep Morning Shift On Duty (acknowledged) and Afternoon/Evening shifts Pending Acknowledgement unless overridden
    const ackAt = ov.acknowledged_at !== undefined ? ov.acknowledged_at : existing?.acknowledged_at || null;
    const compAt = ov.completed_at !== undefined ? ov.completed_at : existing?.completed_at || null;
    const handoverNotes = ov.handover_notes !== undefined ? ov.handover_notes : existing?.handover_notes || '';
    const cancelled = ov.cancelled !== undefined ? ov.cancelled : Boolean(existing?.cancelled);

    const lifecycle = cancelled ? 'cancelled' : compAt ? 'completed' : ackAt ? 'in_progress' : 'pending_ack';

    return {
      ...(existing || {}),
      id,
      lab_id: block.lab_id,
      lab_name: block.lab_name,
      assistant_id: existing?.assistant_id || block.assistant_id,
      assistant_name: existing?.assistant_name || block.assistant_name,
      start: startIso,
      end: endIso,
      shift_label: block.label,
      shift_window: `${block.label}: ${block.windowText}`,
      acknowledged_at: ackAt,
      completed_at: compAt,
      handover_notes: handoverNotes,
      cancelled,
      lifecycle,
      status:
        lifecycle === 'completed'
          ? 'completed'
          : lifecycle === 'in_progress'
            ? 'in_progress'
            : lifecycle === 'cancelled'
              ? 'cancelled'
              : 'pending',
    };
  });

  // Also include any extra admin-created shifts that aren't already in normalized
  const usedIds = new Set(normalized.map(s => s.id));
  for (const extra of input) {
    if (!extra?.id || usedIds.has(extra.id)) continue;
    const ov = overrides[extra.id] || {};
    const startDate = new Date(extra.start);
    const endDate = new Date(extra.end);
    const durationHours = (endDate.getTime() - startDate.getTime()) / 3600000;
    const hasWeirdHours =
      Number.isNaN(durationHours) ||
      durationHours > 6 ||
      durationHours < 1 ||
      startDate.getMinutes() !== 0 ||
      endDate.getMinutes() !== 0;

    const block =
      CAMPUS_SHIFT_BLOCKS.find(b => b.lab_id === extra.lab_id || b.lab_name === extra.lab_name) ||
      CAMPUS_SHIFT_BLOCKS[0];

    const startIso = hasWeirdHours ? `${today}T${block.startHour}+08:00` : extra.start;
    const endIso = hasWeirdHours ? `${today}T${block.endHour}+08:00` : extra.end;
    const ackAt = ov.acknowledged_at !== undefined ? ov.acknowledged_at : extra.acknowledged_at || null;
    const compAt = ov.completed_at !== undefined ? ov.completed_at : extra.completed_at || null;
    const handoverNotes = ov.handover_notes !== undefined ? ov.handover_notes : extra.handover_notes || '';
    const cancelled = ov.cancelled !== undefined ? ov.cancelled : Boolean(extra.cancelled);

    const lifecycle = cancelled ? 'cancelled' : compAt ? 'completed' : ackAt ? 'in_progress' : 'pending_ack';

    normalized.push({
      ...extra,
      start: startIso,
      end: endIso,
      shift_label: extra.shift_window || block.label,
      shift_window: hasWeirdHours ? `${block.label}: ${block.windowText}` : `${block.label}: ${block.windowText}`,
      acknowledged_at: ackAt,
      completed_at: compAt,
      handover_notes: handoverNotes,
      cancelled,
      lifecycle,
      status:
        lifecycle === 'completed'
          ? 'completed'
          : lifecycle === 'in_progress'
            ? 'in_progress'
            : lifecycle === 'cancelled'
              ? 'cancelled'
              : 'pending',
    });
  }

  return normalized;
}

export function getLabInspectionProgress(
  labId: string,
  labName: string,
  checklists: Checklist[] | null | undefined,
  assets: Asset[] | null | undefined,
) {
  const required = 4;
  const allChecks = mergeChecklists(checklists);
  const labChecks = allChecks.filter(c => c.lab_id === labId || c.lab_name === labName);
  const checkedAssetTags = new Set(labChecks.map(c => c.asset_tag).filter(Boolean));
  const checkedAssetIds = new Set(labChecks.map(c => c.asset_id).filter(Boolean));

  const labWorkstations = (Array.isArray(assets) ? assets : []).filter(
    a => a.kind === 'PC' && !a.archived && (a.lab_id === labId || a.lab_name === labName),
  );

  const nextUnchecked =
    labWorkstations.find(pc => !checkedAssetIds.has(pc.id) && !checkedAssetTags.has(pc.tag)) ||
    labWorkstations[0] ||
    null;

  const uniqueCheckedCount = Math.max(checkedAssetTags.size, checkedAssetIds.size, labChecks.length);
  const checked = Math.min(required, uniqueCheckedCount);

  return {
    checked,
    required,
    totalChecked: uniqueCheckedCount,
    percent: Math.min(100, Math.round((checked / required) * 100)),
    nextUnchecked,
    labWorkstations,
    labChecks,
  };
}
