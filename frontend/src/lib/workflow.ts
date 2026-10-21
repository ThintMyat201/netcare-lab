import { CAMPUS_TIMEZONE } from './api';

const SHIFT_STATE_KEY = 'atlas_shift_workflow_v2';
const LOCAL_TICKETS_KEY = 'atlas_local_tickets_v2';
const LOCAL_CHECKLISTS_KEY = 'atlas_local_checklists_v2';

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
    assistant_id: 'assistant',
    assistant_name: 'Jamie Santos',
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
  const isNetwork =
    t.category === 'network' ||
    String(t.asset_tag || '').startsWith('AP-') ||
    String(t.tier || '').toLowerCase().includes('tier 2');
  return {
    ...t,
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
  const byId = new Map<string, any>();
  for (const item of [...local, ...base]) {
    if (item?.id && !byId.has(item.id)) {
      byId.set(item.id, enrichTicket(item));
    }
  }
  return Array.from(byId.values()).sort(
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

