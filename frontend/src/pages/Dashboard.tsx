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
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {cards.map((m, i) => (
        <div className={`metric-card ${m.tone}`} data-testid={`metric-${i}`} key={m.title}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-base sm:text-lg font-semibold text-slate-800 dark:text-slate-200 tracking-tight mb-1">
              {m.title}
            </span>
            <m.icon size={18} className="shrink-0 text-slate-400 dark:text-slate-500" />
          </div>
          <div className="metric-value text-xl sm:text-2xl font-bold truncate">
            {m.value}
            {m.suffix && <span>{m.suffix}</span>}
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
    <div className="dashboard-page w-full max-w-full overflow-x-hidden">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3.5 mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100" data-testid="page-title">
            Campus Dashboard
          </h1>
          <span className="date-label hidden lg:inline-block text-xs font-semibold text-slate-400" data-testid="dashboard-date">
            {new Intl.DateTimeFormat('en-MY', {
              timeZone: 'Asia/Kuala_Lumpur',
              weekday: 'short',
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            }).format(new Date())}
          </span>
        </div>
        <div className={user.role === 'assistant' ? 'grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2.5 w-full sm:w-auto' : 'grid grid-cols-3 sm:flex items-center gap-2 w-full sm:w-auto'}>
          <button
            type="button"
            id="refresh-overview"
            onClick={refresh}
            disabled={monitor.busy}
            className="inline-flex items-center justify-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 py-2 rounded-lg text-xs sm:text-sm font-medium bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700/80 hover:bg-slate-50 dark:hover:bg-slate-800 outline-none focus:outline-none focus:ring-0 transition-colors whitespace-nowrap disabled:opacity-50 w-full sm:w-auto"
          >
            <RefreshCw size={14} className={monitor.busy ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            id="export-dashboard-csv"
            data-testid="export-dashboard-csv"
            onClick={exportCSV}
            className="inline-flex items-center justify-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 py-2 rounded-lg text-xs sm:text-sm font-medium bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700/80 hover:bg-slate-50 dark:hover:bg-slate-800 outline-none focus:outline-none focus:ring-0 transition-colors whitespace-nowrap w-full sm:w-auto"
          >
            <Download size={14} />
            <span>Export CSV</span>
          </button>
          <button
            type="button"
            id="export-dashboard-pdf"
            data-testid="export-dashboard-pdf"
            onClick={exportPDF}
            className="inline-flex items-center justify-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-sm border border-transparent outline-none focus:outline-none focus:ring-0 transition-colors whitespace-nowrap w-full sm:w-auto"
          >
            <FileText size={14} />
            <span>Export PDF</span>
          </button>
          {user.role === 'assistant' && (
            <button
              type="button"
              id="dashboard-primary-action"
              onClick={() => navigate(`/checklists?lab=${currentShift?.lab_id || 'lab-1'}&new=1`)}
              className="inline-flex items-center justify-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-sm border border-transparent outline-none focus:outline-none focus:ring-0 transition-colors whitespace-nowrap w-full sm:w-auto"
            >
              <Plus size={16} />
              <span>Run Lab Inspection</span>
            </button>
          )}
          {user.role === 'engineer' && (
            <button
              type="button"
              id="dashboard-primary-action"
              onClick={() => navigate('/monitoring')}
              className="inline-flex items-center justify-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 py-2 rounded-lg text-xs sm:text-sm font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-sm border border-transparent outline-none focus:outline-none focus:ring-0 transition-colors whitespace-nowrap w-full sm:w-auto"
            >
              <Radio size={15} />
              <span>Open Device Monitor</span>
              <ArrowRight size={14} />
            </button>
          )}
        </div>
      </header>

      <ErrorBox error={monitor.error || overview.error} retry={refresh} />

      <RoleMetricsGrid cards={roleCards} />

      {user.role === 'assistant' ? (
        <div className="dashboard-bottom">
          <section className="access-section">
            <div className="flex items-center justify-between gap-3 mb-3">
              <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100" data-testid="section-today's-campus-lab-shifts-&-inspection-progress">
                Today's Campus Lab Shifts &amp; Inspection Progress
              </h2>
              <Link
                to="/shifts"
                data-testid="view-all-shifts"
                className="whitespace-nowrap shrink-0 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 flex items-center gap-1.5 transition-colors"
              >
                Open Shift Schedule <ArrowRight size={13} />
              </Link>
            </div>
            <div className="w-full overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm dashboard-shifts-wrap">
              <div className="w-full overflow-x-auto">
                <table className="data-table dashboard-shifts-table min-w-[580px] w-full">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-900/50 text-slate-500 uppercase">
                      <th className="px-4 py-3 text-xs font-semibold tracking-wider text-left whitespace-nowrap col-shift-name">LAB &amp; SHIFT WINDOW</th>
                      <th className="px-4 py-3 text-xs font-semibold tracking-wider text-left whitespace-nowrap col-shift-status">STATUS</th>
                      <th className="px-4 py-3 text-xs font-semibold tracking-wider text-left whitespace-nowrap col-shift-progress">INSPECTION PROGRESS</th>
                      <th className="px-4 py-3 text-xs font-semibold tracking-wider text-right whitespace-nowrap col-shift-action">ACTION</th>
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
                          <td className="px-4 py-3 whitespace-nowrap col-shift-name">
                            <strong className="block text-slate-900 dark:text-slate-100 font-bold">{s.lab_name}</strong>
                            <small className="cell-sub block text-xs text-slate-400 mt-0.5">{s.shift_window}</small>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap col-shift-status">
                            <Status value={statusKey} id={`dashboard-shift-status-${s.id}`} />
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap col-shift-progress">
                            <div className="utilization">
                              <span className="utilization-bar online">
                                <i style={{ width: `${displayPercent}%` }} />
                              </span>
                              <span className="mono text-xs">
                                {displayChecked}/{prog.required} Checked
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-right col-shift-action">
                            <div className="dashboard-shift-actions justify-end flex items-center gap-1.5">
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
          <div className="dashboard-mid grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch mb-6 w-full max-w-full">
            {/* Left Card: Network Traffic & Load (lg:col-span-8) */}
            <div className="lg:col-span-8 col-span-1 w-full max-w-full overflow-hidden rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-sm flex flex-col justify-between">
              <TrafficChart history={m.history} height={315} />
            </div>

            {/* Right Card: Lab Operational Health (lg:col-span-4) */}
            <section className="lab-health lg:col-span-4 col-span-1 w-full max-w-full overflow-hidden rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-sm flex flex-col justify-between">
              <div className="w-full flex-1 flex flex-col">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <h2
                    className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100"
                    data-testid="section-lab-operational-health"
                  >
                    Lab Operational Health
                  </h2>
                  <Link
                    to="/monitoring"
                    data-testid="view-labs-link"
                    className="inline-flex items-center justify-center w-8 h-8 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-800 transition-all"
                    title="View device monitoring"
                  >
                    <ArrowUpRight size={16} />
                  </Link>
                </div>

                <div className="flex flex-col gap-3.5 mb-4">
                  <div className="health-summary flex items-center gap-3.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 !m-0">
                    <div
                      className="health-ring shrink-0"
                      style={{ '--health': `${Math.round((apStats.online / apStats.total) * 100)}%` } as any}
                    >
                      <span>
                        {Math.round((apStats.online / apStats.total) * 100)}
                        <small>%</small>
                      </span>
                    </div>
                    <div className="min-w-0">
                      <strong className="block text-sm font-bold text-slate-900 dark:text-slate-100 truncate" data-testid="network-health-label">
                        Network Health
                      </strong>
                      <span className="block text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                        {apStats.online} of {apStats.total} access points operational
                      </span>
                      <small className="block text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">Real-time telemetry snapshot</small>
                    </div>
                  </div>

                  <div className="lab-list flex flex-col gap-2">
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
                          className="lab-row flex items-center justify-between p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 hover:bg-slate-100 dark:hover:bg-slate-800/70 transition-colors"
                          data-testid={`lab-health-${i}`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className="lab-icon shrink-0 p-1.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 border-0">
                              <Building2 size={15} />
                            </span>
                            <div className="min-w-0">
                              <strong className="block text-xs font-bold text-slate-900 dark:text-slate-100 truncate">{l.name}</strong>
                              <small className="block text-[10px] text-slate-400">{rows.length} access points</small>
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0 ml-1.5">
                            <span className={`lab-state text-[11px] font-semibold px-2 py-0.5 rounded-full ${issues ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'}`}>
                              {issues ? `${issues} alert(s)` : 'Operational'}
                            </span>
                            <ChevronRight size={13} className="text-slate-400" />
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="lab-foot pt-3.5 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-400 flex items-center justify-between mt-auto">
                <span className="flex items-center gap-2">
                  <span className="tiny-dot w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-slate-400 font-medium">Telemetry Feed Active</span>
                </span>
                <span className="text-[11px] text-slate-500 font-mono">Last sample {time(m.last_updated, false, true)} MYT</span>
              </div>
            </section>
          </div>

          <div className="dashboard-bottom mt-6">
            <section className="access-section">
              <SectionHead title="Access Point Status">
                <div className="section-actions flex flex-wrap items-center gap-2 sm:gap-3">
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
              <div className="w-full overflow-x-auto">
                <APTable
                  aps={[...aps].sort(
                    (a: any, b: any) => (a.status === 'online' ? 1 : 0) - (b.status === 'online' ? 1 : 0)
                  )}
                  limit={5}
                  onSelect={(a: any) => navigate(`/monitoring?ap=${a.id}`)}
                />
              </div>
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
    </div>
  );
}
