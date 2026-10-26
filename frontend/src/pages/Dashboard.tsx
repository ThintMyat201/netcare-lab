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
  Download,
  FileText,
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

function downloadCSV(name: string, rows: any[][]) {
  const escape = (v: any) => '"' + String(v ?? '').replace(/^[=+@-]/, "'").replace(/"/g, '""') + '"';
  const blob = new Blob(['\ufeff' + rows.map(r => r.map(escape).join(',')).join('\r\n')], {
    type: 'text/csv;charset=utf-8;',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

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

  const exportCSV = () => {
    const rows = [
      ['ATLAS NETCARE - CAMPUS DASHBOARD SUMMARY', 'APU University Main Campus'],
      ['Generated Timestamp (MYT)', `${time(new Date().toISOString(), true)} MYT`],
      [],
      ['CAMPUS OPERATIONAL METRICS'],
      ['Metric', 'Value', 'Details'],
      ['Campus SLA Compliance', `${slaCompliance}%`, `${apStats.online} of ${apStats.total} APs meeting target SLA`],
      ['Access Points Online', `${apStats.online} / ${apStats.total}`, `${apStats.congested} congested, ${apStats.offline} offline, ${apStats.stale} stale`],
      ['Wireless Clients Connected', apStats.clients, `Peak Load: ${apStats.peakLoad}%`],
      ['Shift Acknowledgement Rate', `${shiftAckRate}%`, `${ackedShiftsCount} of ${allShifts.length} shifts acknowledged`],
      ['Active Faults & Incidents', openTickets.length, `${networkIncidents.length} Tier-2 Network, ${openTickets.length - networkIncidents.length} Tier-1 Hardware`],
      [],
      ['ACTIVE FAULTS & INCIDENTS QUEUE'],
      ['Ticket #', 'Title', 'Asset Tag', 'Lab / Location', 'Tier / Category', 'Priority', 'Status', 'Created (MYT)'],
      ...(openTickets.length > 0
        ? openTickets.map((t: any) => [
            t.number || t.id,
            t.title,
            t.asset_tag || '—',
            t.lab_name || 'General Campus',
            t.category === 'network' ? 'Tier 2 NOC' : 'Tier 1 Hardware',
            t.priority || 'Normal',
            t.status,
            time(t.created_at, true),
          ])
        : [['No active incidents', '—', '—', '—', '—', '—', '—', '—']]),
    ];
    downloadCSV('atlas-netcare-dashboard.csv', rows);
  };

  const exportPDF = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Please allow popups to export the PDF dashboard snapshot.');
      return;
    }

    const genTime = time(new Date().toISOString(), true);

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>atlas-netcare-dashboard</title>
  <style>
    @page { size: A4 portrait; margin: 15mm; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      color: #0f172a;
      background: #ffffff;
      margin: 0;
      padding: 24px;
      line-height: 1.5;
      font-size: 13px;
    }
    .header {
      border-bottom: 2px solid #0284c7;
      padding-bottom: 14px;
      margin-bottom: 20px;
    }
    .header h1 {
      font-size: 20px;
      font-weight: 800;
      color: #0f172a;
      margin: 0 0 4px 0;
      letter-spacing: -0.02em;
    }
    .header .meta {
      font-size: 12px;
      color: #475569;
      display: flex;
      justify-content: space-between;
    }
    .section-title {
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #475569;
      margin: 20px 0 10px 0;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 4px;
    }
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin-bottom: 20px;
    }
    .kpi-card {
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 12px;
      background: #f8fafc;
    }
    .kpi-card .label {
      font-size: 11px;
      font-weight: 600;
      color: #64748b;
      text-transform: uppercase;
      margin-bottom: 4px;
    }
    .kpi-card .value {
      font-size: 18px;
      font-weight: 800;
      color: #0f172a;
      margin-bottom: 4px;
    }
    .kpi-card .subtext {
      font-size: 11px;
      color: #475569;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
      margin-top: 8px;
    }
    th {
      background: #f1f5f9;
      color: #475569;
      font-weight: 700;
      text-transform: uppercase;
      font-size: 11px;
      padding: 8px 10px;
      border: 1px solid #e2e8f0;
      text-align: left;
    }
    td {
      padding: 8px 10px;
      border: 1px solid #e2e8f0;
      color: #1e293b;
    }
    tr:nth-child(even) td {
      background: #f8fafc;
    }
    .footer {
      margin-top: 24px;
      padding-top: 10px;
      border-top: 1px solid #e2e8f0;
      font-size: 11px;
      color: #64748b;
      display: flex;
      justify-content: space-between;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>Atlas NetCare — Campus Dashboard Snapshot</h1>
    <div class="meta">
      <span>APU University Main Campus · Executive Oversight</span>
      <span>Generated: <strong>${genTime} MYT</strong></span>
    </div>
  </div>

  <div class="section-title">1. Operational Summary</div>
  <div class="kpi-grid">
    <div class="kpi-card">
      <div class="label">SLA Compliance</div>
      <div class="value">${slaCompliance}%</div>
      <div class="subtext">${apStats.online} / ${apStats.total} APs operational</div>
    </div>
    <div class="kpi-card">
      <div class="label">Shifts Acknowledged</div>
      <div class="value">${shiftAckRate}%</div>
      <div class="subtext">${ackedShiftsCount} / ${allShifts.length} shifts active</div>
    </div>
    <div class="kpi-card">
      <div class="label">Active Faults</div>
      <div class="value">${openTickets.length} Active</div>
      <div class="subtext">${networkIncidents.length} Tier 2 · ${openTickets.length - networkIncidents.length} Tier 1</div>
    </div>
    <div class="kpi-card">
      <div class="label">Wireless Clients</div>
      <div class="value">${apStats.clients}</div>
      <div class="subtext">Peak Load: ${apStats.peakLoad}%</div>
    </div>
  </div>

  <div class="section-title">2. Active Faults &amp; Incidents</div>
  <table>
    <thead>
      <tr>
        <th>Ticket #</th>
        <th>Title</th>
        <th>Equipment</th>
        <th>Location</th>
        <th>Tier</th>
        <th>Priority</th>
        <th style="text-align: right;">Status</th>
      </tr>
    </thead>
    <tbody>
      ${openTickets.length > 0 ? openTickets.map((t: any) => `
        <tr>
          <td><strong>${t.number || t.id}</strong></td>
          <td>${t.title}</td>
          <td>${t.asset_tag || '—'}</td>
          <td>${t.lab_name || 'General Campus'}</td>
          <td>${t.category === 'network' ? 'Tier 2 NOC' : 'Tier 1'}</td>
          <td>${t.priority || 'Normal'}</td>
          <td style="text-align: right;">${t.status}</td>
        </tr>
      `).join('') : `
        <tr>
          <td colspan="7" style="text-align: center; color: #64748b; font-style: italic;">
            Zero active incidents. Campus network and equipment are nominal.
          </td>
        </tr>
      `}
    </tbody>
  </table>

  <div class="footer">
    <span>Atlas NetCare Campus Management System</span>
    <span>Confidential Executive Dashboard Snapshot</span>
  </div>

  <script>
    window.onload = function() {
      setTimeout(function() {
        window.print();
      }, 300);
    };
  </script>
</body>
</html>
    `;

    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  return (
    <>
      <PageTitle title="Campus Dashboard">
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
          id="export-dashboard-csv"
          data-testid="export-dashboard-csv"
          variant="outline"
          onClick={exportCSV}
          className="whitespace-nowrap flex items-center gap-1.5"
        >
          <Download size={14} />
          Export CSV
        </Button>
        <Button
          id="export-dashboard-pdf"
          data-testid="export-dashboard-pdf"
          variant="primary"
          onClick={exportPDF}
          className="whitespace-nowrap flex items-center gap-1.5"
        >
          <FileText size={14} />
          Export PDF
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
        {user.role === 'engineer' && (
          <Button
            id="dashboard-primary-action"
            variant="primary"
            onClick={() => navigate('/monitoring')}
          >
            <Radio size={15} /> Open Device Monitor <ArrowRight size={14} />
          </Button>
        )}
        {user.role === 'assistant' && (
          <Button
            id="dashboard-primary-action"
            variant="primary"
            onClick={() => navigate(`/checklists?lab=${currentShift?.lab_id || 'lab-1'}&new=1`)}
          >
            <Plus size={16} /> Run Lab Inspection
          </Button>
        )}
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
            <div className="w-full overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm dashboard-shifts-wrap">
              <div className="w-full overflow-x-auto">
                <table className="data-table dashboard-shifts-table min-w-full">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-900/50 text-slate-500 uppercase">
                      <th className="px-5 py-3.5 text-xs font-semibold tracking-wider text-left col-shift-name">LAB &amp; SHIFT WINDOW</th>
                      <th className="px-5 py-3.5 text-xs font-semibold tracking-wider text-left col-shift-status">STATUS</th>
                      <th className="px-5 py-3.5 text-xs font-semibold tracking-wider text-left col-shift-progress">INSPECTION PROGRESS</th>
                      <th className="px-5 py-3.5 text-xs font-semibold tracking-wider text-right col-shift-action">ACTION</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
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
                        <tr key={s.id} data-testid={`dashboard-shift-${s.id}`} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                          <td className="px-5 py-4 col-shift-name">
                            <strong>{s.lab_name}</strong>
                            <small className="cell-sub">{s.shift_window}</small>
                          </td>
                          <td className="px-5 py-4 col-shift-status">
                            <Status value={statusKey} id={`dashboard-shift-status-${s.id}`} />
                          </td>
                          <td className="px-5 py-4 col-shift-progress">
                            <div className="utilization">
                              <span className="utilization-bar online">
                                <i style={{ width: `${displayPercent}%` }} />
                              </span>
                              <span className="mono">
                                {displayChecked}/{prog.required} Checked
                              </span>
                            </div>
                          </td>
                          <td className="px-5 py-4 col-shift-action text-right">
                            <div className="dashboard-shift-actions justify-end">
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
