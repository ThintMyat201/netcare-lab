import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Search, RefreshCw, TriangleAlert, ArrowUpRight, CheckCheck, FlaskConical } from 'lucide-react';
import { PageTitle, Button, Status, ErrorBox, Loading, Empty, SectionHead, useData } from '../components/shared';
import { time } from '../lib/api';

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

export function Reports() {
  const { data, error, busy, load } = useData('/reports');

  const exportReport = () => {
    if (data) {
      downloadCSV('atlas-operational-report.csv', [
        ['Atlas NetCare Operational Report', 'Generated at', data.generated_at],
        ['Metric', 'Value'],
        ['Total Tickets', data.tickets_total],
        ['Open', data.open],
        ['In Progress', data.in_progress],
        ['Resolved', data.resolved],
        ['Inspections Completed', data.checklists_total],
        ['Passed', data.passed],
        ['Failed', data.failed],
        ['Missed Acknowledgements', data.missed_acknowledgements],
        ['Mean Resolution Minutes', data.mean_resolution_minutes ?? 'No resolutions'],
        [],
        ['Lab', 'Active Hardware', 'Inspections', 'Open Issues'],
        ...data.labs.map((l: any) => [l.name, l.assets, l.inspections, l.open_tickets])
      ]);
    }
  };

  return (
    <>
      <PageTitle
        title="Operational Reports"
        subtitle="Consolidated metrics, service performance, and inspection outcomes."
      >
        <Button id="refresh-reports" onClick={load}>
          <RefreshCw size={15} />Refresh Data
        </Button>
        <Button id="export-report" variant="primary" disabled={!data} onClick={exportReport}>
          <Download size={15} />Export CSV Report
        </Button>
      </PageTitle>

      <ErrorBox error={error} retry={load} />

      {busy && !data ? (
        <Loading />
      ) : data && (
        <>
          <div className="monitor-status-strip">
            <span className="feed-label">
              <FlaskConical size={13} /> OPERATIONS SUMMARY
            </span>
            <span data-testid="report-generated">Generated {time(data.generated_at, true)} MYT</span>
            <span>Cumulative Operational Records</span>
          </div>

          <div className="report-grid">
            {[
              ['Inspections Completed', data.checklists_total, `${data.passed} passed · ${data.failed} with faults`],
              ['Tickets Resolved', data.resolved, `${data.tickets_total} total tickets reported`],
              [
                'Average Resolution Time',
                data.mean_resolution_minutes == null ? '—' : `${data.mean_resolution_minutes}m`,
                'From report submission to verified resolution'
              ],
              [
                'Unacknowledged Shifts',
                data.missed_acknowledgements,
                `${data.acknowledged_shifts} shifts confirmed on schedule`
              ]
            ].map(([title, value, sub], i) => (
              <div className="report-stat" data-testid={`report-stat-${i}`} key={title as string}>
                <span>{title}</span>
                <strong>{value}</strong>
                <small>{sub}</small>
              </div>
            ))}
          </div>

          <div className="report-two">
            <section>
              <SectionHead title="Ticket Outcomes" />
              <div className="distribution" data-testid="ticket-outcomes-chart">
                {[data.open, data.in_progress, data.resolved].map((v: number, i: number) => (
                  <i key={i} style={{ flex: v }} />
                ))}
              </div>
              <div className="distribution-legend">
                <span>Open · {data.open}</span>
                <span>In Progress · {data.in_progress}</span>
                <span>Resolved · {data.resolved}</span>
              </div>
            </section>

            <section>
              <SectionHead title="Workstation Inspection Outcomes" />
              {data.checklists_total ? (
                <>
                  <div className="distribution" data-testid="inspection-outcomes-chart">
                    <i style={{ flex: data.passed, background: 'var(--green)' }} />
                    <i style={{ flex: data.failed }} />
                  </div>
                  <div className="distribution-legend">
                    <span>All Checks Passed · {data.passed}</span>
                    <span>Faults Reported · {data.failed}</span>
                  </div>
                </>
              ) : (
                <p className="muted small" data-testid="reports-no-inspections">
                  No equipment inspections recorded yet.
                </p>
              )}
            </section>
          </div>

          <SectionHead title="Lab Performance & Health" />
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>LAB</th>
                  <th>ACTIVE HARDWARE</th>
                  <th>INSPECTIONS</th>
                  <th>OPEN ISSUES</th>
                </tr>
              </thead>
              <tbody>
                {data.labs.map((l: any, i: number) => (
                  <tr key={l.name} data-testid={`report-lab-${i}`}>
                    <td>{l.name}</td>
                    <td className="mono">{l.assets}</td>
                    <td className="mono">{l.inspections}</td>
                    <td className="mono">{l.open_tickets}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="permission-notice" data-testid="report-scope">
            Resolution times and metrics describe campus network operations and lab equipment management.
          </p>
        </>
      )}
    </>
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