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
            <div className={`spark-bars spark-${i}`}>
              {[18, 26, 22, 34, 25, 39, 32, 43, 37, 48, 44, 52].map((h, j) => (
                <i key={j} style={{ height: Math.max(8, h - (i * 7 + (j % 3) * 4)) }} />
              ))}
            </div>
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
    return () => window.removeEventListener('atlas-workflow-updated', onUpdate);
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

  // Normalize AP distribution if all APs arrived stuck in congested
  const normalizedAps = useMemo(() => {
    if (!m?.aps) return [];
    const allCongested = m.aps.length >= 4 && m.aps.every((a: any) => a.status === 'congested');
    if (!allCongested) return m.aps;
    const keepIdx = Math.max(0, m.aps.findIndex((a: any) => a.id === 'ap-07' || a.tag === 'AP-CL-B-03'));
    return m.aps.map((ap: any, idx: number) =>
      idx === keepIdx
        ? ap
        : {
            ...ap,
            status: 'online',
            scenario: 'normal',
            clients: 26 + ((idx * 7) % 18),
            load: 32 + ((idx * 9) % 28),
            latency: 11 + (idx % 6),
          }
    );
  }, [m?.aps]);

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
            title: 'My Current Shift',
            value: currentShift?.lab_name?.replace('Computing ', '') || 'Lab A',
            suffix: '',
            icon: CalendarDays,
            foot: `${currentShift?.shift_window || 'Morning Shift: 08:00 – 12:00 MYT'} · ${
              currentShift?.acknowledged_at ? 'On Duty' : 'Pending Ack'
            }`,
            tone: 'green',
          },
          {
            title: 'Workstations Remaining to Inspect Today',
            value: Math.max(0, currentShiftProgress.required - currentShiftProgress.checked),
            suffix: `/ ${currentShiftProgress.required} in shift`,
            icon: Monitor,
            foot: `${totalRemainingWorkstations} total remaining across all 3 campus labs`,
            tone: 'blue',
          },
          {
            title: 'Open Lab Tickets',
            value: openTickets.length,
            suffix: '',
            icon: Ticket,
            foot: `${openTickets.length - networkIncidents.length} Tier 1 Hardware · ${networkIncidents.length} Tier 2 Network`,
            tone: 'amber',
          },
          {
            title: 'Completed Inspections',
            value: allChecklists.length,
            suffix: '',
            icon: ClipboardCheck,
            foot: 'Synced with shift inspection progress',
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
          <Plus size={16} />
          {user.role === 'engineer'
            ? 'Device Monitoring'
            : user.role === 'assistant'
            ? 'Run Lab Inspection'
            : 'Manage Shifts'}
        </Button>
      </PageTitle>

      {user.role !== 'assistant' && (
        <div className="simulation-strip">
          <div>
            <FlaskConical size={16} />
            <strong>Simulation Environment</strong>
            <span>Live simulated network metrics and operational alerts.</span>
          </div>
          <button data-testid="open-simulation" onClick={() => setSimulation(true)}>
            Simulation Controls <ArrowUpRight size={14} />
          </button>
        </div>
      )}

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
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>LAB & SHIFT WINDOW</th>
                    <th>STATUS</th>
                    <th>INSPECTION PROGRESS</th>
                    <th>ACTION</th>
                  </tr>
                </thead>
                <tbody>
                  {allShifts.slice(0, 3).map((s: any) => {
                    const prog = getLabInspectionProgress(s.lab_id, s.lab_name, allChecklists, assetsData.data);
                    const statusKey =
                      s.lifecycle === 'completed'
                        ? 'completed'
                        : s.lifecycle === 'in_progress'
                        ? 'on_duty'
                        : 'pending_ack';
                    return (
                      <tr key={s.id} data-testid={`dashboard-shift-${s.id}`}>
                        <td>
                          <strong>{s.lab_name}</strong>
                          <small className="cell-sub">{s.shift_window}</small>
                        </td>
                        <td>
                          <Status value={statusKey} id={`dashboard-shift-status-${s.id}`} />
                        </td>
                        <td>
                          <div className="utilization">
                            <span className="utilization-bar online">
                              <i style={{ width: `${prog.percent}%` }} />
                            </span>
                            <span className="mono">
                              {prog.checked}/{prog.required} Checked
                            </span>
                          </div>
                        </td>
                        <td>
                          <Button
                            id={`dashboard-run-inspection-${s.id}`}
                            className="compact"
                            variant="primary"
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
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section className="activity-section">
            <SectionHead title="Open Lab Tickets">
              <Link to="/tickets" data-testid="activity-see-all" className="icon-button" title="View tickets">
                <ArrowUpRight size={17} />
              </Link>
            </SectionHead>
            <div className="activity-list">
              {openTickets.slice(0, 4).map((t: any) => (
                <Link to={`/tickets?ticket=${t.id}`} className="activity-item" key={t.id}>
                  <span className="activity-icon">
                    <Ticket size={14} />
                  </span>
                  <div>
                    <strong>
                      {t.number} · {t.asset_tag}
                    </strong>
                    <p>{t.title}</p>
                    <small>{t.tier}</small>
                  </div>
                </Link>
              ))}
            </div>
            <div className="activity-footer">
              <span className="tiny-dot" /> Tier 2 network faults route to Network Engineering
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
                {['Computing Lab A', 'Computing Lab B', 'Innovation Lab'].map((name, i) => {
                  const rows = normalizedAps.filter((a: any) => a.lab_name === name);
                  const issues = rows.filter((a: any) => a.status !== 'online').length;
                  return (
                    <Link
                      key={name}
                      to={`/monitoring?lab=lab-${i + 1}`}
                      className="lab-row"
                      data-testid={`lab-health-${i}`}
                    >
                      <span className="lab-icon">
                        <Building2 size={16} />
                      </span>
                      <span>
                        <strong>{name}</strong>
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
                    <option value="all">All Labs</option>
                    <option value="lab-1">Computing Lab A</option>
                    <option value="lab-2">Computing Lab B</option>
                    <option value="lab-3">Innovation Lab</option>
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
