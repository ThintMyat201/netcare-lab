import { useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, TriangleAlert, ArrowUpRight, CheckCheck, FlaskConical } from 'lucide-react';
import { PageTitle, Button, Status, ErrorBox, Loading, Empty, useData } from '../components/shared';
import { time } from '../lib/api';
import { Alert } from '../lib/types';

export function Alerts() {
  const { data, error, busy, load } = useData<Alert[]>('/alerts');
  const [filter, setFilter] = useState('active');
  const rows = data?.filter(a => (filter === 'all' ? true : filter === 'active' ? a.active : !a.active));

  return (
    <>
      <PageTitle title="System Alerts" subtitle="Real-time network anomaly detection, warnings, and recovery history.">
        <Button id="refresh-alerts" onClick={load}>
          <RefreshCw size={15} />
          Refresh Alerts
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
          ['all', 'All Alerts'],
        ].map(([key, label]) => (
          <button
            key={key}
            data-testid={`alerts-filter-${key}`}
            className={filter === key ? 'active' : ''}
            onClick={() => setFilter(key)}
          >
            {label}
            <span>
              {data?.filter(a => (key === 'all' ? true : key === 'active' ? a.active : !a.active)).length || 0}
            </span>
          </button>
        ))}
      </div>

      {busy && !data ? (
        <Loading />
      ) : rows?.length ? (
        <div className="alert-grid">
          {rows.map(a => (
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
