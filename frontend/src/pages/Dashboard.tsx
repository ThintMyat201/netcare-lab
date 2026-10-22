import React, { useState, useEffect, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowUpRight,
  ArrowRight,
  FlaskConical,
  RefreshCw,
  Plus,
  Radio,
  ChevronRight,
  Building2,
  CheckCheck,
  Clock3,
  ClipboardCheck,
  Ticket,
  ShieldCheck,
  Activity,
  Users,
  Monitor,
  CalendarDays,
  AlertTriangle,
} from 'lucide-react';
import { PageTitle, Button, Select, Status, Loading, ErrorBox, SectionHead, useData } from '../components/shared';
import { TrafficChart, APTable, Simulation } from '../components/Telemetry';
import { useAuth } from '../context';
import { time } from '../lib/api';
import {
  normalizeCampusShifts,
  mergeTickets,
  mergeChecklists,
  getLabInspectionProgress,
  getSharedFleetAps,
} from '../lib/workflow';

function RoleMetricsGrid({ cards }: { cards: any[] }) {
  return (
    <div className="metric-grid">
      {cards.map((m, i) => (
        <div className={`metric-card ${m.tone}`} data-testid={`metric-${i}`} key={m.title}>
          <div className="metric-top">
            <span>{m.title}</span>
            <m.icon size={17} />
          </div>
          <div className="metric-value">
            {m.value}
            {m.suffix && <span>{m.suffix}</span>}
          </div>
          <div className={`spark-bars spark-${i}`} aria-hidden="true">
            {[18, 26, 22, 34, 25, 39, 32, 43, 37, 48, 44, 52].map((h, j) => (
              <i key={j} style={{ height: Math.max(8, h - (i * 7 + (j % 3) * 4)) }} />
            ))}
          </div>
          <p>
            <span className="tiny-dot" />
            {m.foot}
          </p>
        </div>
      ))}
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const monitor = useData('/monitoring');
  const overview = useData('/overview');
  const checklistsData = useData('/checklists');
  const assetsData = useData('/assets');
  const ticketsData = useData('/tickets');
  const shiftsData = useData('/shifts');

  const [lab, setLab] = useState('all');
  const [simulation, setSimulation] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const onUpdate = () => setVersion(v => v + 1);
    window.addEventListener('atlas-workflow-updated', onUpdate);
    window.addEventListener('atlas-sim-state', onUpdate);
    return () => {
      window.removeEventListener('atlas-workflow-updated', onUpdate);
      window.removeEventListener('atlas-sim-state', onUpdate);
    };
  }, []);

  const refresh = () => {
    monitor.load();
    overview.load();
    checklistsData.load();
    ticketsData.load();
    shiftsData.load();
  };

  const m = monitor.data;
  const o = overview.data;

  // Dynamically synchronized 21-AP campus fleet state
  const normalizedAps = useMemo(() => {
    return getSharedFleetAps();
  }, [version]); // eslint-disable-line react-hooks/exhaustive-deps

  const apStats = useMemo(() => {
    const total = normalizedAps.length;
    const online = normalizedAps.filter((a: any) => a.status === 'online').length;
    const congested = normalizedAps.filter((a: any) => a.status === 'congested').length;
    const offline = normalizedAps.filter((a: any) => a.status === 'offline').length;
    const stale = normalizedAps.filter((a: any) => a.status === 'stale').length;
    const clients = normalizedAps.reduce((s: number, a: any) => s + (typeof a.clients === 'number' ? a.clients : 0), 0);
    const peakLoad = normalizedAps.reduce((max: number, a: any) => Math.max(max, typeof a.load === 'number' ? a.load : 0), 0);
    const peakAp = normalizedAps.find((a: any) => a.load === peakLoad);
    return { total, online, congested, offline, stale, clients, peakLoad, peakAp };
  }, [normalizedAps]);

  const allShifts = useMemo(
    () => normalizeCampusShifts(shiftsData.data || o?.shifts),
    [shiftsData.data, o?.shifts, version] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const allTickets = useMemo(
    () => mergeTickets(ticketsData.data || o?.tickets),
    [ticketsData.data, o?.tickets, version] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const allChecklists = useMemo(
    () => mergeChecklists(checklistsData.data),
    [checklistsData.data, version] // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Workstation checklist faults strictly isolated from AP telemetry incidents
  const workstationChecklistFaults = useMemo(() => {
    return allTickets.filter((t: any) => {
      if (t.status === 'resolved') return false;
      const tag = String(t.asset_tag || '').toUpperCase();
      const assetId = String(t.asset_id || '').toLowerCase();
      // Strictly exclude Access Point (AP-*) incidents
      if (tag.startsWith('AP-') || tag.startsWith('AP ') || assetId.startsWith('ap-') || assetId.startsWith('ap_')) {
        return false;
      }
      return true;
    });
  }, [allTickets]);

  if (!m || !o) {
    return (
      <>
        <PageTitle title="Campus Dashboard" />
        <ErrorBox error={monitor.error || overview.error} retry={refresh} />
        {(monitor.busy || overview.busy) && <Loading />}
      </>
    );
  }

  const aps = normalizedAps.filter((a: any) => lab === 'all' || a.lab_id === lab);

  // Compute role-specific summary cards
  const openTickets = allTickets.filter((t: any) => t.status !== 'resolved');
  const networkIncidents = openTickets.filter((t: any) => t.tier_code === 'tier2' || t.category === 'network');

  const currentShift =
    allShifts.find((s: any) => s.lifecycle === 'in_progress') ||
    allShifts.find((s: any) => s.lifecycle === 'pending_ack') ||
    allShifts[0];

  const currentShiftProgress = currentShift
    ? getLabInspectionProgress(currentShift.lab_id, currentShift.lab_name, allChecklists, assetsData.data)
    : { checked: 0, required: 4, nextUnchecked: null };

  const totalRemainingWorkstations = allShifts.reduce((sum: number, s: any) => {
    const p = getLabInspectionProgress(s.lab_id, s.lab_name, allChecklists, assetsData.data);
    return sum + Math.max(0, p.required - p.checked);
  }, 0);

  const ackedShiftsCount = allShifts.filter((s: any) => s.acknowledged_at || s.completed_at).length;
  const shiftAckRate = allShifts.length ? Math.round((ackedShiftsCount / allShifts.length) * 100) : 100;
  const slaCompliance = apStats.total
    ? Math.min(99.8, Math.max(82, Math.round(((apStats.online / apStats.total) * 0.7 + 0.26) * 1000) / 10))
    : 96.4;

  const roleCards =
    user.role === 'assistant'
      ? [
          {
            title: 'My Shift Schedule',
            value: currentShift?.lab_name?.replace('Computing ', '') || 'Lab A',
            suffix: currentShift?.shift_window ? ` · ${currentShift.shift_window.split(':')[0]}` : '',
            icon: CalendarDays,
            foot: `${currentShift?.shift_window || 'Morning Shift: 08:00 – 12:00 MYT'} · ${
              currentShift?.acknowledged_at ? 'On Duty (Active)' : 'Pending Acknowledgement'
            }`,
            tone: 'green',
          },
          {
            title: 'Workstation Checklists Completed Today',
            value: allChecklists.length,
            suffix: ' verified',
            icon: ClipboardCheck,
            foot: `${currentShiftProgress.checked}/${currentShiftProgress.required} in shift · Synced with compliance`,
            tone: 'blue',
          },
          {
            title: 'Escalated Faults Status',
            value: workstationChecklistFaults.length,
            suffix: ' escalated',
            icon: AlertTriangle,
            foot: `${
              workstationChecklistFaults.filter((t: any) => t.category === 'network' || t.tier_code === 'tier2').length
            } Tier 2 Network escalated to NOC · Workstation faults`,
            tone: 'amber',
          },
          {
            title: 'Workstations Remaining in Shift',
            value: Math.max(0, currentShiftProgress.required - currentShiftProgress.checked),
            suffix: `/ ${currentShiftProgress.required} target`,
            icon: Monitor,
            foot: `${totalRemainingWorkstations} remaining across all campus labs`,
            tone: 'violet',
          },
        ]
      : user.role === 'engineer'
      ? [
          {
            title: 'Campus AP Health',
            value: apStats.online,
            suffix: `/ ${apStats.total} Online`,
            icon: Radio,
            foot: `${apStats.congested} congested · ${apStats.offline} offline · ${apStats.stale} interrupted`,
            tone: 'green',
          },
          {
            title: 'Peak Bandwidth Load',
            value: `${apStats.peakLoad}%`,
            suffix: apStats.peakAp ? ` (${apStats.peakAp.tag})` : '',
            icon: Activity,
            foot: `${apStats.clients} active wireless clients connected`,
            tone: 'amber',
          },
          {
            title: 'Assigned Network Incidents',
            value: networkIncidents.length,
            suffix: ' Tier 2',
            icon: Ticket,
            foot: 'Auto-routed from checklists & AP telemetry',
            tone: 'violet',
          },
          {
            title: 'Connected Devices',
            value: apStats.clients,
            suffix: '',
            icon: Users,
            foot: 'Across all reporting campus access points',
            tone: 'blue',
          },
        ]
      : [
          {
            title: 'Campus SLA Compliance',
            value: `${slaCompliance}%`,
            suffix: '',
            icon: ShieldCheck,
            foot: `${apStats.online} of ${apStats.total} access points meeting target SLA`,
            tone: 'green',
          },
          {
            title: 'Shift Acknowledgement Rate',
            value: `${shiftAckRate}%`,
            suffix: ` (${ackedShiftsCount}/${allShifts.length})`,
            icon: CalendarDays,
            foot: 'Standard 4-hour campus blocks (MYT)',
            tone: 'blue',
          },
          {
            title: 'Total Active Incidents',
            value: openTickets.length,
            suffix: '',
            icon: Ticket,
            foot: `${networkIncidents.length} Tier 2 Network · ${openTickets.length - networkIncidents.length} Tier 1 Hardware`,
            tone: 'amber',
          },
          {
            title: 'Recent Audit Activity',
            value: o.activity?.length || 0,
            suffix: ' events',
            icon: ClipboardCheck,
            foot: o.activity?.[0] ? `Latest: ${o.activity[0].action} (${o.activity[0].actor})` : 'Operational logs persisted',
            tone: 'violet',
          },
        ];

  const subtitleByRole =
    user.role === 'assistant'
      ? 'Student IT Assistant Workspace · Shift inspections, workstation checklists, and lab fault reporting.'
      : user.role === 'engineer'
      ? 'NOC Network Engineer Workspace · Campus AP telemetry, bandwidth load, and Tier 2 incident queue.'
      : 'Administrator Oversight · Campus SLA compliance, shift operations, active incidents, and audit activity.';

  return (
    <>
      <PageTitle title="Campus Dashboard" subtitle={subtitleByRole}>
        <span className="date-label" data-testid="dashboard-date">
          {new Intl.DateTimeFormat('en-MY', {
            timeZone: 'Asia/Kuala_Lumpur',
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          }).format(new Date())}
        </span>
        <Button id="refresh-overview" onClick={refresh} disabled={monitor.busy}>
          <RefreshCw size={14} className={monitor.busy ? 'spin' : ''} />
          Refresh
        </Button>
        {user.role === 'assistant' && currentShift && !currentShift.acknowledged_at && (
          <Button
            id="dashboard-ack-shift-btn"
            variant="secondary"
            onClick={() => navigate('/shifts')}
            title="Acknowledge your scheduled shift"
          >
            <CheckCheck size={14} />
            Acknowledge Shift
          </Button>
        )}
        <Button
          id="dashboard-primary-action"
          variant="primary"
          onClick={() =>
            navigate(
              user.role === 'engineer'
                ? '/monitoring'
                : user.role === 'assistant'
                ? `/checklists?lab=${currentShift?.lab_id || 'lab-1'}&new=1`
                : '/shifts'
            )
          }
        >
          {user.role === 'engineer' ? (
            <>
              <Radio size={15} /> Open Device Monitor <ArrowRight size={14} />
            </>
          ) : user.role === 'assistant' ? (
            <>
              <Plus size={16} /> Run Lab Inspection
            </>
          ) : (
            <>
              <Plus size={16} /> Manage Shifts
            </>
          )}
        </Button>
      </PageTitle>

      <ErrorBox error={monitor.error || overview.error} retry={refresh} />

      <RoleMetricsGrid cards={roleCards} />

      {user.role === 'assistant' ? (
        <div className="dashboard-bottom">
          <section className="access-section">
            <SectionHead title="Today's Campus Lab Shifts & Inspection Progress">
              <Link to="/shifts" data-testid="view-all-shifts">
                Open Shift Schedule <ArrowRight size={13} />
              </Link>
            </SectionHead>
            <div className="table-wrap dashboard-shifts-wrap">
              <table className="data-table dashboard-shifts-table">
                <thead>
                  <tr>
                    <th className="col-shift-name">LAB &amp; SHIFT WINDOW</th>
                    <th className="col-shift-status">STATUS</th>
                    <th className="col-shift-progress">INSPECTION PROGRESS</th>
                    <th className="col-shift-action">ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {allShifts.slice(0, 3).map((s: any) => {
                    const prog = getLabInspectionProgress(s.lab_id, s.lab_name, allChecklists, assetsData.data);
                    const isAcknowledged = Boolean(s.acknowledged_at);
                    const displayChecked = isAcknowledged ? prog.checked : 0;
                    const displayPercent = isAcknowledged ? prog.percent : 0;
                    const statusKey =
                      s.lifecycle === 'completed'
                        ? 'completed'
                        : isAcknowledged
                        ? 'on_duty'
                        : 'pending_ack';
                    return (
                      <tr key={s.id} data-testid={`dashboard-shift-${s.id}`}>
                        <td className="col-shift-name">
                          <strong>{s.lab_name}</strong>
                          <small className="cell-sub">{s.shift_window}</small>
                        </td>
                        <td className="col-shift-status">
                          <Status value={statusKey} id={`dashboard-shift-status-${s.id}`} />
                        </td>
                        <td className="col-shift-progress">
                          <div className="utilization">
                            <span className="utilization-bar online">
                              <i style={{ width: `${displayPercent}%` }} />
                            </span>
                            <span className="mono">
                              {displayChecked}/{prog.required} Checked
                            </span>
                          </div>
                        </td>
                        <td className="col-shift-action">
                          <div className="dashboard-shift-actions">
                            {!isAcknowledged && s.assistant_id === user.id ? (
                              <Button
                                id={`dashboard-shift-ack-${s.id}`}
                                className="compact"
                                variant="primary"
                                onClick={() => navigate('/shifts')}
                                title="Acknowledge shift to unlock lab inspection"
                              >
                                <CheckCheck size={12} /> Acknowledge Shift
                              </Button>
                            ) : (
                              <Button
                                id={`dashboard-run-inspection-${s.id}`}
                                className="compact"
                                variant="primary"
                                disabled={!isAcknowledged && user.role === 'assistant'}
                                onClick={() =>
                                  navigate(
                                    `/checklists?lab=${s.lab_id}&new=1${
                                      prog.nextUnchecked ? `&asset=${prog.nextUnchecked.id}` : ''
                                    }`
                                  )
                                }
                              >
                                Run Lab Inspection <ArrowRight size={13} />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="activity-section">
            <SectionHead title="Escalated Faults Status">
              <Link
                to="/checklists"
                data-testid="activity-see-all"
                className="icon-button"
                title="View Equipment Checklists"
              >
                <ClipboardCheck size={17} />
              </Link>
            </SectionHead>
            <div className="activity-list">
              {workstationChecklistFaults.length ? (
                workstationChecklistFaults.slice(0, 4).map((t: any) => (
                  <div className="activity-item non-interactive" key={t.id}>
                    <span className="activity-icon fault-escalated">
                      <AlertTriangle size={14} />
                    </span>
                    <div>
                      <div className="fault-item-header">
                        <strong>
                          {t.number} · {t.asset_tag}
                        </strong>
                        <span className={`fault-routed-pill ${t.category === 'network' ? 'tier2' : 'tier1'}`}>
                          {t.category === 'network' ? 'Tier 2 NOC' : 'Tier 1'}
                        </span>
                      </div>
                      <p>{t.title}</p>
                      <small>
                        Auto-routed to {t.category === 'network' ? 'Network Engineer' : 'Lab Support'} · Read-only tracking
                      </small>
                    </div>
                  </div>
                ))
              ) : (
                <div className="empty-subtle">
                  <span>Zero open workstation faults. All campus equipment inspected and nominal.</span>
                </div>
              )}
            </div>
            <div className="activity-footer">
              <span className="tiny-dot" /> Incident resolution is managed by Tier-2 Network Engineers &amp; Admins
            </div>
          </section>
        </div>
      ) : (
        <>
          <div className="dashboard-mid">
            <TrafficChart history={m.history} />
            <section className="lab-health">
              <SectionHead title="Lab Operational Health">
                <Link
                  to="/monitoring"
                  data-testid="view-labs-link"
                  className="icon-button"
                  title="View device monitoring"
                >
                  <ArrowUpRight size={17} />
                </Link>
              </SectionHead>
              <div className="health-summary">
                <div
                  className="health-ring"
                  style={{ '--health': `${Math.round((apStats.online / apStats.total) * 100)}%` } as any}
                >
                  <span>
                    {Math.round((apStats.online / apStats.total) * 100)}
                    <small>%</small>
                  </span>
                </div>
                <div>
                  <strong data-testid="network-health-label">Network Health</strong>
                  <span>
                    {apStats.online} of {apStats.total} access points operational
                  </span>
                  <small>Real-time telemetry snapshot</small>
                </div>
              </div>
              <div className="lab-list">
                {[
                  { id: 'lab-1', name: 'Computing Lab A' },
                  { id: 'lab-2', name: 'Computing Lab B' },
                  { id: 'lab-4', name: 'Computing Lab C' },
                  { id: 'lab-3', name: 'Innovation Lab' },
                ].map((l, i) => {
                  const rows = normalizedAps.filter((a: any) => a.lab_name === l.name || a.lab_id === l.id);
                  const issues = rows.filter((a: any) => a.status !== 'online').length;
                  return (
                    <Link
                      key={l.id}
                      to={`/monitoring?lab=${l.id}`}
                      className="lab-row"
                      data-testid={`lab-health-${i}`}
                    >
                      <span className="lab-icon">
                        <Building2 size={16} />
                      </span>
                      <span>
                        <strong>{l.name}</strong>
                        <small>{rows.length} access points</small>
                      </span>
                      <span className={`lab-state ${issues ? 'warn' : ''}`}>
                        {issues ? `${issues} alert(s) active` : 'Operational'}
                      </span>
                      <ChevronRight size={13} />
                    </Link>
                  );
                })}
              </div>
              <div className="lab-foot">
                <span className="tiny-dot" /> Last sample {time(m.last_updated, false, true)} MYT
              </div>
            </section>
          </div>

          <div className="dashboard-bottom">
            <section className="access-section">
              <SectionHead title="Access Point Status">
                <div className="section-actions">
                  <Select
                    id="dashboard-lab-filter"
                    value={lab}
                    onChange={(e: any) => setLab(e.target.value)}
                  >
                    <option value="all">All Labs ({normalizedAps.length} APs)</option>
                    <option value="lab-1">Computing Lab A (6 APs)</option>
                    <option value="lab-2">Computing Lab B (5 APs)</option>
                    <option value="lab-4">Computing Lab C (5 APs)</option>
                    <option value="lab-3">Innovation Lab (5 APs)</option>
                  </Select>
                  <Link to="/monitoring" data-testid="view-all-aps">
                    View all access points <ArrowRight size={13} />
                  </Link>
                </div>
              </SectionHead>
              <APTable
                aps={[...aps].sort(
                  (a: any, b: any) => (a.status === 'online' ? 1 : 0) - (b.status === 'online' ? 1 : 0)
                )}
                limit={5}
                onSelect={(a: any) => navigate(`/monitoring?ap=${a.id}`)}
              />
              <div className="table-foot">
                Showing {Math.min(5, aps.length)} of {aps.length} access points
                <span>
                  <Radio size={12} /> TELEMETRY FEED
                </span>
              </div>
            </section>

            <section className="activity-section">
              <SectionHead
                title={user.role === 'engineer' ? 'Assigned Network Incidents' : 'Recent System Activity'}
              >
                <Link
                  to={user.role === 'admin' ? '/audit' : '/tickets'}
                  data-testid="activity-see-all"
                  className="icon-button"
                  title="View all"
                >
                  <ArrowUpRight size={17} />
                </Link>
              </SectionHead>
              <div className="activity-list">
                {user.role === 'engineer'
                  ? networkIncidents.slice(0, 4).map((t: any) => (
                      <Link
                        to={`/tickets?ticket=${t.id}`}
                        data-testid={`engineer-incident-${t.id}`}
                        className="activity-item"
                        key={t.id}
                      >
                        <span className="activity-icon">
                          <Ticket size={14} />
                        </span>
                        <div>
                          <strong>
                            {t.number} · {t.asset_tag}
                          </strong>
                          <p>{t.title}</p>
                          <small>
                            {t.lab_name} <span>·</span> {time(t.created_at)} MYT
                          </small>
                        </div>
                      </Link>
                    ))
                  : o.activity.slice(0, 4).map((a: any, i: number) => (
                      <div className="activity-item" data-testid={`activity-${a.id}`} key={a.id}>
                        <span className={`activity-icon activity-${i}`}>
                          <CheckCheck size={14} />
                        </span>
                        <div>
                          <strong>{a.action}</strong>
                          <p>{a.detail}</p>
                          <small>
                            {a.actor} <span>·</span> {time(a.timestamp)} MYT
                          </small>
                        </div>
                      </div>
                    ))}
              </div>
              <div className="activity-footer">
                <span className="tiny-dot" />{' '}
                {user.role === 'engineer'
                  ? 'Tier 2 network escalation queue active'
                  : 'Audit logs recorded and persisted'}
              </div>
            </section>
          </div>
        </>
      )}

      <Simulation open={simulation} onClose={setSimulation} aps={normalizedAps} onDone={refresh} />
    </>
  );
}
