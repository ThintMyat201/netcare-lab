/**
 * Shapes of the data the backend returns (see backend/*.py), plus the optional fields that the
 * client-side simulation layer in workflow.ts adds to the same records.
 */

export type Role = 'admin' | 'engineer' | 'assistant';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role | string;
  active: boolean;
  scope?: string;
  created_at?: string;
}

export interface Asset {
  id: string;
  tag: string;
  name: string;
  kind: 'AP' | 'PC' | string;
  lab_id: string;
  lab_name: string;
  zone_group?: string;
  ip?: string;
  vlan?: number;
  mac?: string;
  model?: string;
  placement?: string;
  ip_assignment?: string;
  archived?: boolean;
  created_at?: string;
  // Access points only
  scenario?: string;
  scenario_at?: string;
  last_seen?: string;
}

/** An access point with its latest metrics, as GET /api/monitoring and the simulated fleet return it. */
export interface AccessPoint extends Asset {
  status?: string;
  clients?: number | null;
  load?: number | null;
  latency?: number | null;
  throughput?: number | null;
  queue_depth?: number | null;
  synthetic_override?: boolean;
  linked_ticket?: Ticket | null;
  updated_at?: string;
  last_updated?: string;
}

export interface TicketEvent {
  actor: string;
  action: string;
  notes?: string;
  timestamp: string;
}

export interface Ticket {
  id: string;
  number: string;
  asset_id: string;
  asset_tag: string;
  asset_name?: string;
  asset_kind?: string;
  lab_id?: string;
  lab_name: string;
  category: string;
  title: string;
  description: string;
  status: 'open' | 'in_progress' | 'resolved' | string;
  priority: 'low' | 'medium' | 'high' | string;
  tier?: string;
  tier_code?: 'tier1' | 'tier2' | string;
  assigned_role?: string;
  assigned_name?: string;
  assigned_to?: string;
  active_key?: string;
  reporter_ids?: string[];
  created_by?: string;
  created_at: string;
  updated_at?: string;
  resolved_at?: string;
  resolution_notes?: string;
  events?: TicketEvent[];
  synthetic?: boolean;
  scenario?: string;
}

/** The short ticket reference a checklist keeps for each failed check. */
export interface ChecklistTicketRef {
  id: string;
  number: string;
  category?: string;
  tier?: string;
  assigned_role?: string;
  assigned_name?: string;
  /** Only present when the browser stored the whole ticket. */
  status?: string;
}

export type CheckResult = 'pass' | 'fail';

export interface Checklist {
  id: string;
  // Missing on batch verifications that only exist in this browser.
  request_id?: string;
  asset_id: string;
  asset_tag: string;
  lab_id?: string;
  lab_name: string;
  checks: Record<string, CheckResult>;
  notes: string;
  result: 'passed' | 'failed' | string;
  tickets: (ChecklistTicketRef | Ticket)[];
  created_by: string;
  created_by_name?: string;
  created_at: string;
  replayed?: boolean;
  fault_tier?: string;
  assigned_role?: string | null;
  assigned_name?: string | null;
  summary?: string;
}

export interface Shift {
  id: string;
  assistant_id: string;
  assistant_name: string;
  lab_id: string;
  lab_name: string;
  start: string;
  end: string;
  acknowledged_at: string | null;
  completed_at?: string | null;
  handover_notes?: string;
  cancelled: boolean;
  created_at?: string;
  created_by?: string;
  status?: string;
  // Added by normalizeCampusShifts
  shift_label?: string;
  shift_window?: string;
  lifecycle?: 'pending_ack' | 'in_progress' | 'completed' | 'cancelled';
}

export interface Alert {
  id: string;
  asset_id: string;
  asset_tag: string;
  lab_id: string;
  lab_name: string;
  status: string;
  severity: 'high' | 'medium' | string;
  title: string;
  detail: string;
  active: boolean;
  created_at: string;
  resolved_at?: string;
  synthetic?: boolean;
}

export interface TrafficPoint {
  timestamp: string;
  clients: number;
  throughput: number;
  load: number | null;
  latency: number | null;
  queue_depth: number | null;
}

export interface FleetStats {
  total: number;
  online: number;
  congested: number;
  offline: number;
  stale: number;
  clients: number;
}

export interface MonitoringSnapshot {
  aps: AccessPoint[];
  history: TrafficPoint[];
  alerts: Alert[];
  synthetic: boolean;
  last_updated: string | null;
  server_time: string;
  stats: FleetStats;
}

export interface AuditEntry {
  id: string;
  actor_id: string;
  actor: string;
  action: string;
  detail: string;
  resource_id?: string | null;
  timestamp: string;
}

export interface Overview {
  tickets: Ticket[];
  open_tickets: number;
  resolved_tickets: number;
  checklists: number;
  shifts: Shift[];
  activity: AuditEntry[];
}

export interface ReportLab {
  id: string;
  name: string;
  assets: number;
  inspections: number;
  passed_inspections: number;
  open_tickets: number;
  open_only: number;
  in_progress_only: number;
}

export interface Report {
  generated_at: string;
  tickets_total: number;
  open: number;
  in_progress: number;
  resolved: number;
  tier1_tickets: number;
  tier2_tickets: number;
  checklists_total: number;
  passed: number;
  failed: number;
  missed_acknowledgements: number;
  acknowledged_shifts: number;
  mean_resolution_minutes: number | null;
  labs: ReportLab[];
}

export interface Diagnosis {
  asset_id: string;
  asset_tag: string;
  tag: string;
  ip: string;
  status: string;
  packets_sent: number;
  packets_received: number;
  packet_loss_pct: number;
  rtt_min_ms: number | null;
  rtt_avg_ms: number | null;
  rtt_max_ms: number | null;
  poe_draw_watts: number;
  poe_status: string;
  radio_channel: string;
  channel_5ghz: string;
  snr_db: number;
  switch_port: string;
  gateway_hop: string;
  summary: string;
  timestamp: string;
}

/** FastAPI error body: a message, or a list of validation errors. */
export interface ApiErrorBody {
  detail?: string | { msg: string }[];
}
