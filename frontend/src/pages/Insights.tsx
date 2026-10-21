import React, { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { Link } from 'react-router-dom';
import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Download, Search, RefreshCw, TriangleAlert, ArrowUpRight, CheckCheck, FlaskConical, Printer, Wrench, Ticket, CircleCheck, ListChecks } from 'lucide-react';
import { PageTitle, Button, Status, ErrorBox, Loading, Empty, useData } from '../components/shared';
import { useAuth } from '../context';
import { time, CAMPUS_TIMEZONE } from '../lib/api';

function downloadCSV(name: string, rows: any[][]) {
  // A text cell that starts with = + - @ or a tab or carriage return is a formula to a spreadsheet,
  // so it gets a leading quote. Numbers are left alone: -5 stays -5.
  const escape = (v: any) => {
    const text = String(v ?? '');
    const safe = typeof v !== 'number' && /^[=+\-@\t\r]/.test(text) ? "'" + text : text;
    return '"' + safe.replace(/"/g, '""') + '"';
  };
  const blob = new Blob(['\ufeff' + rows.map(r => r.map(escape).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const BAND_COLOURS: Record<string, string> = {
  low: 'var(--risk-low)',
  medium: 'var(--risk-medium)',
  high: 'var(--risk-high)',
  critical: 'var(--risk-critical)'
};

// Short names on the chart axis: on paper the chart is half a page wide and "Critical risk" collides
// with its neighbour. The table beside the chart carries the full names.
const BAND_SHORT: Record<string, string> = { low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical' };

const longDate = (value: string) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: CAMPUS_TIMEZONE, day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(value));

// Recharts measures its box on screen. While the browser prepares a printout the charts are drawn
// again at a fixed size that fits half an A4 column, then go back to measuring when printing ends.
function usePrinting() {
  const [printing, setPrinting] = useState(false);
  useEffect(() => {
    const before = () => flushSync(() => setPrinting(true));
    const after = () => setPrinting(false);
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => {
      window.removeEventListener('beforeprint', before);
      window.removeEventListener('afterprint', after);
    };
  }, []);
  return printing;
}

type ChartRow = { label: string; value: number; colour: string };

function ReportChart({ data, label, printing, percent = false }: { data: ChartRow[]; label: string; printing: boolean; percent?: boolean }) {
  const axis = { stroke: 'var(--chart-axis)' };
  const ticks = { fill: 'var(--chart-text)', fontSize: 10, fontWeight: 600 };
  // Recharts animates from script, which the stylesheet's reduced-motion rule cannot stop.
  const still = printing || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const chart = (size?: { width: number; height: number }) => (
    <BarChart {...size} data={data} margin={{ top: 8, right: 6, left: 0, bottom: 0 }}>
      <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="3 4" vertical={false} />
      <XAxis dataKey="label" tick={ticks} axisLine={axis} tickLine={false} interval={0} />
      <YAxis width={38} allowDecimals={false} domain={percent ? [0, 100] : [0, 'auto']} tick={ticks} axisLine={axis} tickLine={false}
        tickFormatter={(v: number) => (percent ? `${v}%` : `${v}`)} />
      {!printing && (
        <Tooltip cursor={{ fill: 'var(--panel-hover)' }} formatter={(v: any) => [percent ? `${v}%` : v, percent ? 'Pass rate' : 'Assets']}
          contentStyle={{ background: 'var(--panel)', border: '2px solid var(--line-strong)', borderRadius: 6, fontSize: 12, fontWeight: 600, color: 'var(--text)' }} />
      )}
      <Bar dataKey="value" radius={[3, 3, 0, 0]} maxBarSize={64} isAnimationActive={!still}>
        {data.map(d => <Cell key={d.label} fill={d.colour} />)}
      </Bar>
    </BarChart>
  );
  return (
    <figure className="report-chart" role="img" aria-label={`${label}: ${data.map(d => `${d.label} ${d.value}${percent ? '%' : ''}`).join(', ')}`}>
      {printing ? chart({ width: 300, height: 190 }) : <ResponsiveContainer width="100%" height={240}>{chart()}</ResponsiveContainer>}
    </figure>
  );
}

function ReportSection({ id, title, subtitle, children }: { id: string; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="report-card" data-testid={id}>
      <header className="report-card-head">
        <h2>{title}</h2>
        {subtitle && <p>{subtitle}</p>}
      </header>
      <div className="report-card-body">{children}</div>
    </section>
  );
}

type Header = string | [string, 'num'];

function ReportTable({ headers, children }: { headers: Header[]; children: React.ReactNode }) {
  return (
    <div className="table-wrap">
      <table className="data-table report-table">
        <thead>
          <tr>{headers.map(h => (Array.isArray(h) ? <th key={h[0]} className="num">{h[0]}</th> : <th key={h}>{h}</th>))}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Reports() {
  const { user } = useAuth();
  const { data, error, busy, load } = useData('/reports');
  const printing = usePrinting();

  const f = data?.figures;
  const scoredAny = data?.risk.some((r: any) => r.band !== 'unscored' && r.total > 0);
  const priorities: { key: string; label: string }[] = data?.priorities || [];

  const figures = f ? [
    {
      label: 'Assets at high risk or worse', icon: Wrench, value: f.at_risk, unit: `of ${f.scored} scored`,
      note: f.at_risk > 0 ? 'Worth a preventive visit' : '', tone: 'urgent'
    },
    { label: 'Tickets raised', icon: Ticket, value: f.tickets_raised, unit: '', note: '', tone: '' },
    {
      label: 'Tickets resolved', icon: CircleCheck, value: f.tickets_resolved, unit: '',
      note: f.resolution_on_target == null ? '' : f.resolution_on_target ? 'Every priority within target' : 'A priority is over target',
      tone: f.resolution_on_target ? 'healthy' : 'attention'
    },
    {
      label: 'Inspection pass rate', icon: ListChecks, value: f.pass_rate ?? '—', unit: f.inspected ? `% of ${f.inspected}` : '',
      note: '', tone: ''
    }
  ] : [];

  const exportReport = () => {
    if (!data) return;
    downloadCSV('atlas-operations-report.csv', [
      ['Atlas NetCare operations report', 'Generated', data.generated_at],
      [],
      ['Figure', 'Value'],
      ['Assets at high risk or worse', `${f.at_risk} of ${f.scored} scored`],
      ['Tickets raised', f.tickets_raised],
      ['Tickets resolved', f.tickets_resolved],
      ['Inspection pass rate', f.pass_rate == null ? 'No inspections' : `${f.pass_rate}% of ${f.inspected}`],
      [],
      ['Band', 'Lab PCs', 'Access points', 'Total'],
      ...data.risk.map((r: any) => [r.label, r.lab_pcs, r.access_points, r.total]),
      [],
      ['Category', ...priorities.map(p => p.label), 'Total'],
      ...data.ticket_volume.map((r: any) => [r.label, ...priorities.map(p => r[p.key]), r.total]),
      [],
      ['Priority', 'Resolved', 'Mean hours', 'Target hours', 'Against target'],
      ...data.resolution.map((r: any) => [r.label, r.resolved, r.mean_hours ?? '', r.target_hours, r.mean_hours == null ? 'Nothing resolved yet' : r.within_target ? 'Within target' : 'Over target']),
      [],
      ['Lab', 'Passed', 'Failed', 'Pass rate %'],
      ...data.inspections.map((r: any) => [r.lab, r.passed, r.failed, r.rate]),
      [],
      ['Lab', 'Access points', 'Mean uptime %', 'Mean latency ms', 'Peak clients'],
      ...data.access_points.map((r: any) => [r.lab, r.access_points, r.uptime, r.latency ?? '', r.peak_clients])
    ]);
  };

  return (
    <div className="report">
      <PageTitle
        title="Operational Reports"
        subtitle={data ? `How the campus is doing, from every module at once. Generated ${time(data.generated_at, true)} MYT.` : 'How the campus is doing, from every module at once.'}
      >
        <Button id="refresh-reports" onClick={load} disabled={busy}>
          <RefreshCw size={15} />Refresh
        </Button>
        <Button id="export-report" disabled={!data} onClick={exportReport}>
          <Download size={15} />Export CSV
        </Button>
        <Button id="print-report" variant="primary" disabled={!data} onClick={() => window.print()}>
          <Printer size={15} />Print or Save as PDF
        </Button>
      </PageTitle>

      <ErrorBox error={error} retry={load} />

      {busy && !data ? (
        <Loading />
      ) : data && (
        <>
          {/* Paper only. On screen the page title above says the same thing next to its buttons. */}
          <header className="report-print-head" aria-hidden="true">
            <p className="report-print-brand">Atlas NetCare</p>
            <h1>Operations report</h1>
            <p className="report-print-lead">
              How the campus is doing, from every module at once: maintenance risk, tickets, inspections and access point health.
            </p>
            <dl>
              <div><dt>Generated</dt><dd>{longDate(data.generated_at)} campus time</dd></div>
              <div><dt>Prepared by</dt><dd>{user?.name}</dd></div>
              <div><dt>Period</dt><dd>All records to date. Access points: last {data.telemetry_days} days.</dd></div>
            </dl>
          </header>

          <div className="metric-grid report-figures">
            {figures.map((m, i) => (
              <div className="metric-card report-figure" data-testid={`report-figure-${i}`} key={m.label}>
                <div className="metric-top"><span>{m.label}</span><m.icon size={17} /></div>
                <div className="metric-value">{m.value}{m.unit && <span>{m.unit}</span>}</div>
                {m.note && <p className={`report-figure-note ${m.tone}`}>{m.note}</p>}
              </div>
            ))}
          </div>

          <ReportSection id="report-risk" title="Assets by risk band" subtitle="Predictive maintenance risk across every asset in service.">
            {!scoredAny ? (
              <Empty text="Nothing has been scored yet. Assets are scored from their tickets, inspections and telemetry." />
            ) : (
              <div className="report-pair">
                <ReportChart
                  label="Assets in each risk band"
                  printing={printing}
                  data={data.risk.filter((r: any) => r.band !== 'unscored').map((r: any) => ({ label: BAND_SHORT[r.band], value: r.total, colour: BAND_COLOURS[r.band] }))}
                />
                <ReportTable headers={['Band', ['Lab PCs', 'num'], ['Access points', 'num'], ['Total', 'num']]}>
                  {data.risk.map((r: any) => (
                    <tr key={r.band} className={r.band === 'unscored' ? 'report-row-muted' : ''}>
                      <td>{r.label}</td>
                      <td className="num">{r.lab_pcs}</td>
                      <td className="num">{r.access_points}</td>
                      <td className="num strong">{r.total}</td>
                    </tr>
                  ))}
                </ReportTable>
              </div>
            )}
          </ReportSection>

          <ReportSection id="report-tickets" title="Ticket volume" subtitle={`${f.tickets_raised} tickets by category and priority.`}>
            {f.tickets_raised === 0 ? (
              <Empty text="No tickets yet." />
            ) : (
              <ReportTable headers={['Category', ...priorities.map(p => [p.label, 'num'] as Header), ['Total', 'num']]}>
                {data.ticket_volume.map((r: any) => (
                  <tr key={r.category}>
                    <td>{r.label}</td>
                    {priorities.map(p => <td key={p.key} className="num">{r[p.key]}</td>)}
                    <td className="num strong">{r.total}</td>
                  </tr>
                ))}
              </ReportTable>
            )}
            {data.simulator_tickets_excluded > 0 && (
              <p className="report-note">
                {data.simulator_tickets_excluded === 1 ? '1 simulator ticket is' : `${data.simulator_tickets_excluded} simulator tickets are`} left out of every figure on this page. Simulator tickets record a demonstration, not a fault somebody reported.
              </p>
            )}
          </ReportSection>

          <ReportSection id="report-resolution" title="Mean time to resolution" subtitle="Measured from when a ticket was opened until it was resolved.">
            <ReportTable headers={['Priority', ['Resolved', 'num'], ['Mean hours', 'num'], ['Target', 'num'], 'Against target']}>
              {data.resolution.map((r: any) => (
                <tr key={r.priority}>
                  <td>{r.label}</td>
                  <td className="num">{r.resolved}</td>
                  <td className="num">{r.mean_hours == null ? '—' : r.mean_hours.toFixed(1)}</td>
                  <td className="num report-faint">{r.target_hours} h</td>
                  <td>
                    {r.mean_hours == null ? (
                      <span className="report-faint">Nothing resolved yet</span>
                    ) : (
                      <span className={`status ${r.within_target ? 'online' : 'offline'}`}><i />{r.within_target ? 'Within target' : 'Over target'}</span>
                    )}
                  </td>
                </tr>
              ))}
            </ReportTable>
            <p className="report-note">
              This is the average for each priority. An average inside its target can still hide one ticket that took a week.
            </p>
          </ReportSection>

          <ReportSection id="report-inspections" title="Inspection pass rate by lab" subtitle="Every submitted workstation inspection, by lab.">
            {data.inspections.length === 0 ? (
              <Empty text="No inspections yet." />
            ) : (
              <div className="report-pair">
                <ReportChart
                  label="Percentage of inspections passed, by lab"
                  printing={printing}
                  percent
                  data={data.inspections.map((r: any) => ({ label: r.code, value: r.rate, colour: 'var(--risk-low)' }))}
                />
                <ReportTable headers={['Lab', ['Passed', 'num'], ['Failed', 'num'], ['Rate', 'num']]}>
                  {data.inspections.map((r: any) => (
                    <tr key={r.lab}>
                      <td>{r.lab}</td>
                      <td className="num">{r.passed}</td>
                      <td className="num">{r.failed}</td>
                      <td className="num strong">{r.rate}%</td>
                    </tr>
                  ))}
                </ReportTable>
              </div>
            )}
          </ReportSection>

          <ReportSection id="report-access-points" title="Access point uptime and congestion" subtitle={`Last ${data.telemetry_days} days, by lab.`}>
            {data.access_points.length === 0 ? (
              <Empty text={`No telemetry in the last ${data.telemetry_days} days.`} />
            ) : (
              <>
                <ReportTable headers={['Lab', ['APs', 'num'], ['Mean uptime', 'num'], ['Mean latency', 'num'], ['Peak clients', 'num']]}>
                  {data.access_points.map((r: any) => (
                    <tr key={r.lab}>
                      <td>{r.lab}</td>
                      <td className="num">{r.access_points}</td>
                      <td className="num">{r.uptime}%</td>
                      <td className="num">{r.latency == null ? '—' : `${r.latency} ms`}</td>
                      <td className="num">{r.peak_clients}</td>
                    </tr>
                  ))}
                </ReportTable>
                <p className="report-note">
                  Uptime counts the samples in which an access point answered. Samples with no telemetry are unknown, so they count neither way.
                  Peak clients adds up every access point in a lab at its busiest sample, an upper bound on how many people were online there at once.
                </p>
              </>
            )}
          </ReportSection>
        </>
      )}
    </div>
  );
}

export function Audit() {
  const { data, error, busy, load } = useData('/audit');
  const [search, setSearch] = useState('');
  const rows = data?.filter((a: any) =>
    (a.action + ' ' + a.actor + ' ' + a.detail).toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <PageTitle
        title="Activity Log"
        subtitle="Chronological log of campus operations, hardware changes, and staff activities."
      >
        <Button id="refresh-audit" onClick={load}>
          <RefreshCw size={15} />Refresh Log
        </Button>
        <Button
          id="export-audit"
          onClick={() =>
            downloadCSV('atlas-activity-log.csv', [
              ['Timestamp MYT', 'Actor', 'Action', 'Detail'],
              ...(rows || []).map((a: any) => [a.timestamp, a.actor, a.action, a.detail])
            ])
          }
          disabled={!data}
        >
          <Download size={15} />Export CSV
        </Button>
      </PageTitle>

      <ErrorBox error={error} retry={load} />

      <div className="page-search">
        <div className="search-field">
          <Search size={15} />
          <input
            data-testid="audit-search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by actor, action, or equipment…"
          />
        </div>
        <span className="count-label" data-testid="audit-count">
          {rows?.length || 0} events · latest 1,000 records
        </span>
      </div>

      {busy && !data ? (
        <Loading />
      ) : rows?.length ? (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>TIMESTAMP (MYT)</th>
                <th>PERFORMED BY</th>
                <th>ACTION</th>
                <th>DETAILS</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((a: any) => (
                <tr key={a.id} data-testid={`audit-event-${a.id}`}>
                  <td className="mono small">{time(a.timestamp, true)} MYT</td>
                  <td>{a.actor}</td>
                  <td className="audit-action">{a.action}</td>
                  <td className="audit-detail muted">{a.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty text="No activity log events match your search." />
      )}
    </>
  );
}

export function Alerts() {
  const { data, error, busy, load } = useData('/alerts');
  const [filter, setFilter] = useState('active');
  const rows = data?.filter((a: any) => (filter === 'all' ? true : filter === 'active' ? a.active : !a.active));

  return (
    <>
      <PageTitle
        title="System Alerts"
        subtitle="Real-time network anomaly detection, warnings, and recovery history."
      >
        <Button id="refresh-alerts" onClick={load}>
          <RefreshCw size={15} />Refresh Alerts
        </Button>
      </PageTitle>

      <ErrorBox error={error} retry={load} />

      <div className="simulation-strip">
        <div>
          <FlaskConical size={16} />
          <strong>Live In-App Notifications</strong>
          <span>Real-time anomaly alerts and shift reminders across campus networks.</span>
        </div>
        <Link to="/shifts" data-testid="alerts-shift-link" className="inline-link">
          View Shift Schedule <ArrowUpRight size={12} />
        </Link>
      </div>

      <div className="filter-tabs">
        {[
          ['active', 'Active Alerts'],
          ['recovered', 'Resolved History'],
          ['all', 'All Alerts']
        ].map(([key, label]) => (
          <button
            key={key}
            data-testid={`alerts-filter-${key}`}
            className={filter === key ? 'active' : ''}
            onClick={() => setFilter(key)}
          >
            {label}
            <span>{data?.filter((a: any) => (key === 'all' ? true : key === 'active' ? a.active : !a.active)).length || 0}</span>
          </button>
        ))}
      </div>

      {busy && !data ? (
        <Loading />
      ) : rows?.length ? (
        <div className="alert-grid">
          {rows.map((a: any) => (
            <article key={a.id} className={`alert-card ${a.status}`} data-testid={`alert-${a.id}`}>
              {a.active ? (
                <TriangleAlert className="alert-icon" size={21} />
              ) : (
                <CheckCheck className="alert-icon" size={21} />
              )}
              <div>
                <div className="alert-meta">
                  <strong>{a.asset_tag}</strong>
                  <span className="demo-badge">LIVE MONITOR</span>
                </div>
                <h2>{a.title}</h2>
                <p>{a.detail}</p>
                <small>
                  {a.lab_name} · {time(a.created_at, true)} MYT
                  {a.resolved_at ? ` · Recovered ${time(a.resolved_at, true)} MYT` : ''}
                </small>
              </div>
              <Status value={a.active ? a.status : 'resolved'} id={`alert-status-${a.id}`} />
              <Link
                className="icon-button"
                title="Inspect access point details"
                aria-label="Inspect access point details"
                to={`/monitoring?ap=${a.asset_id}`}
                data-testid={`alert-inspect-${a.id}`}
              >
                <ArrowUpRight size={17} />
              </Link>
            </article>
          ))}
        </div>
      ) : (
        <Empty text="No alerts found for this filter." />
      )}
    </>
  );
}