import { CAMPUS_TIMEZONE } from './api';

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

export function getApOverrides(): Record<string, any> {
  try {
    const raw = sessionStorage.getItem(AP_OVERRIDES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveApOverride(assetIdOrTag: string, override: any) {
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

export const SIMULATION_FLEET_APS = [
  // Computing Lab A (6 APs: 3 Online, 1 Congested, 1 Offline, 1 Feed Interrupted)
  { id: 'ap-01', tag: 'AP-CL-A-01', name: 'Computing Lab A · AP 01', kind: 'AP', lab_id: 'lab-1', lab_name: 'Computing Lab A', ip: '10.20.1.11', model: 'Aruba AP-515', status: 'online', scenario: 'normal', clients: 28, load: 38, latency: 12, throughput: 31.4 },
  { id: 'ap-02', tag: 'AP-CL-A-02', name: 'Computing Lab A · AP 02', kind: 'AP', lab_id: 'lab-1', lab_name: 'Computing Lab A', ip: '10.20.1.12', model: 'Aruba AP-515', status: 'online', scenario: 'normal', clients: 32, load: 44, latency: 11, throughput: 34.8 },
  { id: 'ap-03', tag: 'AP-CL-A-03', name: 'Computing Lab A · AP 03', kind: 'AP', lab_id: 'lab-1', lab_name: 'Computing Lab A', ip: '10.20.1.13', model: 'Aruba AP-515', status: 'congested', scenario: 'congestion', clients: 71, load: 87, latency: 119, throughput: 66.8 },
  { id: 'ap-04', tag: 'AP-CL-A-04', name: 'Computing Lab A · AP 04', kind: 'AP', lab_id: 'lab-1', lab_name: 'Computing Lab A', ip: '10.20.1.14', model: 'Aruba AP-515', status: 'offline', scenario: 'outage', clients: 0, load: 0, latency: null, throughput: 0 },
  { id: 'ap-13', tag: 'AP-CL-A-05', name: 'Computing Lab A · AP 05', kind: 'AP', lab_id: 'lab-1', lab_name: 'Computing Lab A', ip: '10.20.1.15', model: 'Aruba AP-515', status: 'online', scenario: 'normal', clients: 25, load: 35, latency: 9, throughput: 27.6 },
  { id: 'ap-14', tag: 'AP-CL-A-06', name: 'Computing Lab A · AP 06', kind: 'AP', lab_id: 'lab-1', lab_name: 'Computing Lab A', ip: '10.20.1.16', model: 'Aruba AP-515', status: 'stale', scenario: 'feed', clients: null, load: null, latency: null, throughput: null },

  // Computing Lab B (5 APs: 2 Online, 1 Congested, 1 Offline, 1 Feed Interrupted)
  { id: 'ap-05', tag: 'AP-CL-B-01', name: 'Computing Lab B · AP 01', kind: 'AP', lab_id: 'lab-2', lab_name: 'Computing Lab B', ip: '10.20.2.11', model: 'Aruba AP-515', status: 'online', scenario: 'normal', clients: 29, load: 41, latency: 12, throughput: 29.5 },
  { id: 'ap-06', tag: 'AP-CL-B-02', name: 'Computing Lab B · AP 02', kind: 'AP', lab_id: 'lab-2', lab_name: 'Computing Lab B', ip: '10.20.2.12', model: 'Aruba AP-515', status: 'online', scenario: 'normal', clients: 34, load: 48, latency: 14, throughput: 35.2 },
  { id: 'ap-07', tag: 'AP-CL-B-03', name: 'Computing Lab B · AP 03', kind: 'AP', lab_id: 'lab-2', lab_name: 'Computing Lab B', ip: '10.20.2.13', model: 'Aruba AP-515', status: 'congested', scenario: 'congestion', clients: 84, load: 92, latency: 142, throughput: 79.4 },
  { id: 'ap-08', tag: 'AP-CL-B-04', name: 'Computing Lab B · AP 04', kind: 'AP', lab_id: 'lab-2', lab_name: 'Computing Lab B', ip: '10.20.2.14', model: 'Aruba AP-515', status: 'offline', scenario: 'outage', clients: 0, load: 0, latency: null, throughput: 0 },
  { id: 'ap-15', tag: 'AP-CL-B-05', name: 'Computing Lab B · AP 05', kind: 'AP', lab_id: 'lab-2', lab_name: 'Computing Lab B', ip: '10.20.2.15', model: 'Aruba AP-515', status: 'stale', scenario: 'feed', clients: null, load: null, latency: null, throughput: null },

  // Computing Lab C (5 APs: 2 Online, 1 Congested, 1 Offline, 1 Feed Interrupted)
  { id: 'ap-16', tag: 'AP-CL-C-01', name: 'Computing Lab C · AP 01', kind: 'AP', lab_id: 'lab-4', lab_name: 'Computing Lab C', ip: '10.20.4.11', model: 'Aruba AP-515', status: 'online', scenario: 'normal', clients: 26, load: 36, latency: 10, throughput: 28.4 },
  { id: 'ap-17', tag: 'AP-CL-C-02', name: 'Computing Lab C · AP 02', kind: 'AP', lab_id: 'lab-4', lab_name: 'Computing Lab C', ip: '10.20.4.12', model: 'Aruba AP-515', status: 'online', scenario: 'normal', clients: 38, load: 52, latency: 13, throughput: 41.0 },
  { id: 'ap-18', tag: 'AP-CL-C-03', name: 'Computing Lab C · AP 03', kind: 'AP', lab_id: 'lab-4', lab_name: 'Computing Lab C', ip: '10.20.4.13', model: 'Aruba AP-515', status: 'congested', scenario: 'congestion', clients: 88, load: 94, latency: 156, throughput: 82.5 },
  { id: 'ap-19', tag: 'AP-CL-C-04', name: 'Computing Lab C · AP 04', kind: 'AP', lab_id: 'lab-4', lab_name: 'Computing Lab C', ip: '10.20.4.14', model: 'Aruba AP-515', status: 'offline', scenario: 'outage', clients: 0, load: 0, latency: null, throughput: 0 },
  { id: 'ap-20', tag: 'AP-CL-C-05', name: 'Computing Lab C · AP 05', kind: 'AP', lab_id: 'lab-4', lab_name: 'Computing Lab C', ip: '10.20.4.15', model: 'Aruba AP-515', status: 'stale', scenario: 'feed', clients: null, load: null, latency: null, throughput: null },

  // Innovation Lab (5 APs: 2 Online, 2 Congested, 1 Offline)
  { id: 'ap-09', tag: 'AP-IL-01', name: 'Innovation Lab · AP 01', kind: 'AP', lab_id: 'lab-3', lab_name: 'Innovation Lab', ip: '10.20.3.11', model: 'Aruba AP-515', status: 'online', scenario: 'normal', clients: 44, load: 56, latency: 12, throughput: 51.8 },
  { id: 'ap-10', tag: 'AP-IL-02', name: 'Innovation Lab · AP 02', kind: 'AP', lab_id: 'lab-3', lab_name: 'Innovation Lab', ip: '10.20.3.12', model: 'Aruba AP-515', status: 'congested', scenario: 'congestion', clients: 76, load: 89, latency: 128, throughput: 71.2 },
  { id: 'ap-11', tag: 'AP-IL-03', name: 'Innovation Lab · AP 03', kind: 'AP', lab_id: 'lab-3', lab_name: 'Innovation Lab', ip: '10.20.3.13', model: 'Aruba AP-515', status: 'online', scenario: 'normal', clients: 39, load: 49, latency: 11, throughput: 45.6 },
  { id: 'ap-12', tag: 'AP-IL-04', name: 'Innovation Lab · AP 04', kind: 'AP', lab_id: 'lab-3', lab_name: 'Innovation Lab', ip: '10.20.3.14', model: 'Aruba AP-515', status: 'congested', scenario: 'congestion', clients: 69, load: 86, latency: 115, throughput: 64.9 },
  { id: 'ap-21', tag: 'AP-IL-05', name: 'Innovation Lab · AP 05', kind: 'AP', lab_id: 'lab-3', lab_name: 'Innovation Lab', ip: '10.20.3.15', model: 'Aruba AP-515', status: 'offline', scenario: 'outage', clients: 0, load: 0, latency: null, throughput: 0 },
];

export function getSharedFleetAps(): any[] {
  const isSim = isMonitoringSimActive();
  const overrides = getApOverrides();

  if (!isSim) {
    // Healthy baseline: all 21 APs online
    return SIMULATION_FLEET_APS.map(ap => {
      const idKey = String(ap.id).toLowerCase();
      const tagKey = String(ap.tag).toUpperCase();
      const override = overrides[idKey] || overrides[tagKey] || {};
      return {
        ...ap,
        status: 'online',
        scenario: 'normal',
        clients: 28 + ((parseInt(ap.id.replace(/\D/g, '') || '1', 10) * 3) % 15),
        load: 34 + ((parseInt(ap.id.replace(/\D/g, '') || '1', 10) * 5) % 20),
        latency: 11 + ((parseInt(ap.id.replace(/\D/g, '') || '1', 10)) % 4),
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
      return { ...ap, ...override };
    }
    return ap;
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
    const updated = checklists.map((c: any) => {
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

export const SIMULATION_LINKED_TICKETS = [
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
    description: 'Automated NOC escalation: Sustained 92% airtime utilization and 142ms RTT on AP-CL-B-03 (10.20.2.13).',
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
    description: '100% ICMP packet loss detected on AP-CL-A-04 (10.20.1.14). Upstream PoE switch port Gi1/0/4 link down.',
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
    description: 'Hardware link outage on AP-CL-C-04 (10.20.4.14) in Computing Lab C. Device unreachable from core router.',
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

export function getAssistantUnacknowledgedShifts(user: any): any[] {
  try {
    const shifts = normalizeCampusShifts(null);
    return shifts.filter(
      (s: any) =>
        !s.cancelled &&
        !s.acknowledged_at &&
        !s.completed_at &&
        (s.assistant_id === user?.id || s.assistant_name === user?.name || user?.role === 'assistant')
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

export function loadLocalTickets(): any[] {
  try {
    const raw = localStorage.getItem(LOCAL_TICKETS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveLocalTicket(ticket: any) {
  const list = loadLocalTickets();
  const next = [ticket, ...list.filter((t: any) => t.id !== ticket.id)];
  try {
    localStorage.setItem(LOCAL_TICKETS_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event('atlas-workflow-updated'));
  } catch {
    // ignore
  }
}

export function loadLocalChecklists(): any[] {
  try {
    const raw = localStorage.getItem(LOCAL_CHECKLISTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveLocalChecklist(checklist: any) {
  const list = loadLocalChecklists();
  const next = [checklist, ...list.filter((c: any) => c.id !== checklist.id)];
  try {
    localStorage.setItem(LOCAL_CHECKLISTS_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event('atlas-workflow-updated'));
  } catch {
    // ignore
  }
}

export function enrichTicket(t: any) {
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
    String(t.tier || '').toLowerCase().includes('tier 2') ||
    String(t.title || '').toLowerCase().includes('network') ||
    String(t.title || '').toLowerCase().includes('connectivity') ||
    String(t.title || '').toLowerCase().includes('nic');

  return {
    ...t,
    lab_name: inferredLab,
    tier: t.tier || (isNetwork ? 'Tier 2 · Network / Connectivity' : 'Tier 1 · Hardware / Peripheral'),
    tier_code: isNetwork ? 'tier2' : 'tier1',
    assigned_role: t.assigned_role || (isNetwork ? 'engineer' : 'assistant'),
    assigned_name:
      t.assigned_name ||
      (isNetwork ? 'Daniel Reyes (Network Engineer)' : 'Jamie Santos (Lab Support · Tier 1)'),
  };
}

export function mergeTickets(apiTickets: any[] | null | undefined): any[] {
  const local = loadLocalTickets();
  const base = Array.isArray(apiTickets) ? apiTickets : [];
  const sim = isMonitoringSimActive() ? SIMULATION_LINKED_TICKETS : [];
  const byKey = new Map<string, any>();
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
    (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
  );
}

export function mergeChecklists(apiChecklists: any[] | null | undefined): any[] {
  const local = loadLocalChecklists();
  const base = Array.isArray(apiChecklists) ? apiChecklists : [];
  const byId = new Map<string, any>();
  for (const item of [...local, ...base]) {
    if (item?.id && !byId.has(item.id)) {
      byId.set(item.id, item);
    }
  }
  return Array.from(byId.values()).sort(
    (a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()
  );
}

export function normalizeCampusShifts(rawShifts: any[] | null | undefined): any[] {
  const today = getTodayMytDateString();
  const overrides = loadShiftOverrides();
  const input = Array.isArray(rawShifts) ? [...rawShifts] : [];

  // Ensure all 3 standard campus lab blocks exist with realistic 4-hour windows
  const normalized: any[] = CAMPUS_SHIFT_BLOCKS.map((block, idx) => {
    const existing =
      input.find(s => s.id === `shift-seed-${idx}`) ||
      input.find(s => s.lab_id === block.lab_id || s.lab_name === block.lab_name);

    const id = existing?.id || `shift-seed-${idx}`;
    const ov = overrides[id] || {};
    const startIso = `${today}T${block.startHour}+08:00`;
    const endIso = `${today}T${block.endHour}+08:00`;

    // By default, keep Morning Shift On Duty (acknowledged) and Afternoon/Evening shifts Pending Acknowledgement unless overridden
    const ackAt =
      ov.acknowledged_at !== undefined
        ? ov.acknowledged_at
        : existing?.acknowledged_at || null;
    const compAt =
      ov.completed_at !== undefined
        ? ov.completed_at
        : existing?.completed_at || null;
    const handoverNotes =
      ov.handover_notes !== undefined
        ? ov.handover_notes
        : existing?.handover_notes || '';
    const cancelled = ov.cancelled !== undefined ? ov.cancelled : Boolean(existing?.cancelled);

    const lifecycle = cancelled
      ? 'cancelled'
      : compAt
      ? 'completed'
      : ackAt
      ? 'in_progress'
      : 'pending_ack';

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

    const lifecycle = cancelled
      ? 'cancelled'
      : compAt
      ? 'completed'
      : ackAt
      ? 'in_progress'
      : 'pending_ack';

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
  checklists: any[] | null | undefined,
  assets: any[] | null | undefined
) {
  const required = 4;
  const allChecks = mergeChecklists(checklists);
  const labChecks = allChecks.filter(
    (c: any) => c.lab_id === labId || c.lab_name === labName
  );
  const checkedAssetTags = new Set(labChecks.map((c: any) => c.asset_tag).filter(Boolean));
  const checkedAssetIds = new Set(labChecks.map((c: any) => c.asset_id).filter(Boolean));

  const labWorkstations = (Array.isArray(assets) ? assets : []).filter(
    (a: any) => a.kind === 'PC' && !a.archived && (a.lab_id === labId || a.lab_name === labName)
  );

  const nextUnchecked =
    labWorkstations.find((pc: any) => !checkedAssetIds.has(pc.id) && !checkedAssetTags.has(pc.tag)) ||
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

