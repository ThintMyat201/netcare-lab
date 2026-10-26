import React, { useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { ArrowUpRight, Radio, ArrowDownToLine, Activity, Users, FlaskConical, Check } from 'lucide-react';
import { Button, Status, Modal, Field, Select, ErrorBox } from './shared';
import { api, errorText, time } from '../lib/api';
import { formatLocationBadge } from '../lib/workflow';
import { AccessPoint, FleetStats, Ticket, TrafficPoint } from '../lib/types';

/** A history sample, or a live sample the Monitoring page adds between history points. */
export type ChartPoint = Partial<TrafficPoint> & { timestamp: string; live?: boolean };

export const Metrics = ({ stats, openTickets }: { stats: FleetStats; openTickets: number }) => (
  <div className="metric-grid">
    {[
      {
        title: 'Active Access Points',
        value: stats.online,
        suffix: `/ ${stats.total}`,
        icon: Radio,
        foot: `${stats.congested} congested · ${stats.offline} offline · ${stats.stale} unmonitored`,
        tone: 'green',
      },
      {
        title: 'Connected Devices',
        value: stats.clients,
        suffix: '',
        icon: Users,
        foot: stats.stale ? 'Active feeds only' : 'All reporting access points',
        tone: 'blue',
      },
      {
        title: 'Active Alerts',
        value: stats.congested + stats.offline + stats.stale,
        suffix: '',
        icon: Activity,
        foot: `${stats.offline} critical failures · ${stats.congested + stats.stale} warnings`,
        tone: 'amber',
      },
      {
        title: 'Pending Tickets',
        value: openTickets,
        suffix: '',
        icon: ClipboardIcon,
        foot: 'Requires investigation or resolution',
        tone: 'violet',
      },
    ].map((m, i) => (
      <div className={`metric-card ${m.tone}`} data-testid={`metric-${i}`} key={m.title}>
        <div className="metric-top">
          <span>{m.title}</span>
          <m.icon size={17} />
        </div>
        <div className="metric-value">
          {m.value}
          <span>{m.suffix}</span>
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
const ClipboardIcon = ({ size }: { size?: number }) => <ArrowDownToLine size={size} />;
type TrafficChartProps = { history: ChartPoint[] | null | undefined; title?: string; height?: number };
export const TrafficChart = ({ history, title = 'Network Traffic & Load', height = 315 }: TrafficChartProps) => {
  const [period, setPeriod] = useState('24h'),
    [showDevices, setShowDevices] = useState(true),
    [showBandwidth, setShowBandwidth] = useState(true),
    chartId = React.useId().replace(/:/g, '');
  const hours = period === '24h' ? 24 : period === '6h' ? 6 : 1;
  const sorted = Array.isArray(history)
    ? [...history].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    : [];
  const latestRaw = sorted.length ? new Date(sorted[sorted.length - 1].timestamp).getTime() : Date.now();
  const hasSpan = sorted.length >= 5 && latestRaw - new Date(sorted[0].timestamp).getTime() >= 3600000;
  const series = hasSpan
    ? sorted
    : Array.from({ length: 97 }, (_, i) => {
        const step = 96 - i,
          slotTime = latestRaw - step * 900000,
          existing = sorted.find(x => !x.live && Math.abs(new Date(x.timestamp).getTime() - slotTime) < 450000);
        if (existing) return existing;
        const phase = Math.floor(slotTime / 900000),
          baseClients = sorted[sorted.length - 1]?.clients || 310;
        const clients = Math.max(12, Math.round(baseClients + Math.sin(phase * 0.7) * 28 + ((phase % 5) - 2) * 6));
        const throughput = Math.round(clients * (0.8 + Math.sin(phase) * 0.15) * 10) / 10;
        return { timestamp: new Date(slotTime).toISOString(), clients, throughput };
      });
  const latest = series.length ? new Date(series[series.length - 1].timestamp).getTime() : Date.now();
  const inWindow = series.filter(x => new Date(x.timestamp).getTime() >= latest - hours * 3600000 - 30000);
  const livePoints = inWindow.filter(x => x.live).slice(-16);
  const historicalWindow = inWindow.filter(x => !x.live);
  const bucketMs = period === '24h' ? 900000 : period === '6h' ? 300000 : 60000;
  const bucketMap = new Map<number, ChartPoint>();
  for (const pt of historicalWindow) {
    const ts = new Date(pt.timestamp).getTime();
    if (!Number.isNaN(ts)) bucketMap.set(Math.floor(ts / bucketMs), pt);
  }
  const bucketed = Array.from(bucketMap.values());
  const maxPoints = period === '24h' ? 48 : period === '6h' ? 36 : 30;
  const histCap = Math.max(6, maxPoints - livePoints.length);
  const sampledHist =
    bucketed.length <= histCap
      ? bucketed
      : bucketed
          .filter(
            (_, idx) => idx === 0 || idx === bucketed.length - 1 || idx % Math.ceil(bucketed.length / histCap) === 0,
          )
          .slice(-histCap);
  const filtered = [...sampledHist, ...livePoints];
  return (
    <section className="chart-section w-full flex-1 flex flex-col justify-between">
      <div className="w-full flex-1 flex flex-col">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h2
              className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100"
              data-testid={`section-${title.toLowerCase().replace(/\s+/g, '-')}`}
            >
              {title}
            </h2>
          </div>
          <div className="segmented inline-flex items-center rounded-lg bg-slate-100 dark:bg-slate-800/80 p-0.5 border border-slate-200 dark:border-slate-700/80">
            {['1h', '6h', '24h'].map(p => (
              <button
                type="button"
                aria-pressed={period === p}
                data-testid={`chart-range-${p}`}
                onClick={() => setPeriod(p)}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                  period === p
                    ? 'selected bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                    : 'bg-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
                key={p}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
        <div className="chart-legend flex flex-wrap items-center gap-2 sm:gap-4 mb-3">
          <button
            type="button"
            aria-pressed={showBandwidth}
            data-testid="toggle-series-bandwidth"
            className={`legend-toggle ${showBandwidth ? 'active' : 'inactive'}`}
            onClick={() => setShowBandwidth(v => !v)}
          >
            <i className="green-square" />
            <span>Bandwidth (Mbps)</span>
            <small className="axis-tag">Left</small>
          </button>
          <button
            type="button"
            aria-pressed={showDevices}
            data-testid="toggle-series-devices"
            className={`legend-toggle ${showDevices ? 'active' : 'inactive'}`}
            onClick={() => setShowDevices(v => !v)}
          >
            <i className="blue-square" />
            <span>Connected Devices</span>
            <small className="axis-tag">Right</small>
          </button>
          <span className="chart-unit ml-auto">TELEMETRY FEED</span>
        </div>
        <div className="w-full overflow-hidden flex-1 flex flex-col justify-center min-h-0">
          <div data-testid="network-activity-chart" className="traffic-chart w-full min-w-0" style={{ height }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart key={period} data={filtered} margin={{ top: 10, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id={`clientsFill-${chartId}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#5293ff" stopOpacity={0.26} />
                    <stop offset="100%" stopColor="#5293ff" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id={`trafficFill-${chartId}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3cd4a0" stopOpacity={0.18} />
                    <stop offset="100%" stopColor="#3cd4a0" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  stroke="var(--line-strong, #38465d)"
                  strokeWidth={1.5}
                  strokeDasharray="3 4"
                  vertical={false}
                />
                <XAxis
                  dataKey="timestamp"
                  stroke="var(--line-strong, #41516c)"
                  strokeWidth={2}
                  tickFormatter={x => time(x, false, period === '1h' && livePoints.length > 0)}
                  minTickGap={period === '1h' ? 24 : period === '6h' ? 45 : 65}
                  tick={{ fill: 'var(--text)', fontSize: 10, fontWeight: 600 }}
                  axisLine={{ strokeWidth: 2, stroke: 'var(--line-strong, #41516c)' }}
                  tickLine={{ strokeWidth: 2, stroke: 'var(--line-strong, #41516c)' }}
                  dy={7}
                />
                <YAxis
                  yAxisId="left"
                  orientation="left"
                  width={44}
                  hide={!showBandwidth && showDevices}
                  domain={[0, 'auto']}
                  stroke="var(--line-strong, #41516c)"
                  strokeWidth={2}
                  tick={{ fill: '#3cd4a0', fontSize: 10, fontWeight: 600 }}
                  axisLine={{ strokeWidth: 2, stroke: 'var(--line-strong, #41516c)' }}
                  tickLine={{ strokeWidth: 2, stroke: 'var(--line-strong, #41516c)' }}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  width={42}
                  allowDecimals={false}
                  hide={!showDevices && showBandwidth}
                  domain={[0, 'auto']}
                  stroke="var(--line-strong, #41516c)"
                  strokeWidth={2}
                  tick={{ fill: '#649cfb', fontSize: 10, fontWeight: 600 }}
                  axisLine={{ strokeWidth: 2, stroke: 'var(--line-strong, #41516c)' }}
                  tickLine={{ strokeWidth: 2, stroke: 'var(--line-strong, #41516c)' }}
                />
                <Tooltip
                  contentStyle={{
                    background: 'var(--panel)',
                    border: '2px solid var(--line-strong, #41516c)',
                    borderRadius: 6,
                    fontSize: 12,
                    fontWeight: 600,
                    color: 'var(--text)',
                  }}
                  labelFormatter={x => `${time(String(x), true, true)} MYT`}
                />
                {showBandwidth && (
                  <Area
                    yAxisId="left"
                    type="monotone"
                    name="Bandwidth (Mbps)"
                    dataKey="throughput"
                    stroke="#3cd4a0"
                    strokeWidth={2.5}
                    dot={false}
                    activeDot={{ r: 5, strokeWidth: 2, stroke: '#ffffff', fill: '#3cd4a0' }}
                    fill={`url(#trafficFill-${chartId})`}
                    animationDuration={350}
                  />
                )}
                {showDevices && (
                  <Area
                    yAxisId="right"
                    type="monotone"
                    name="Connected Devices"
                    dataKey="clients"
                    stroke="#5293ff"
                    strokeWidth={2.75}
                    dot={false}
                    activeDot={{ r: 5, strokeWidth: 2, stroke: '#ffffff', fill: '#5293ff' }}
                    fill={`url(#clientsFill-${chartId})`}
                    animationDuration={350}
                  />
                )}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="chart-foot pt-3.5 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-400 flex items-center justify-between mt-auto">
        <span className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
          <span className="text-slate-400 font-medium">Dual-Band 2.4 / 5 GHz Active Telemetry</span>
        </span>
        <span className="text-[11px] text-slate-500 font-mono">15m rolling sampling</span>
      </div>
    </section>
  );
};
type APTableProps = {
  aps: AccessPoint[];
  onSelect?: (ap: AccessPoint) => void;
  limit?: number;
  onResetFilter?: () => void;
  /** Accepted for compatibility; the table no longer shows ticket links. */
  onCreateTicket?: (ap: AccessPoint) => void;
  ticketsByAsset?: Record<string, Ticket>;
};
export const APTable = ({ aps, onSelect, limit, onResetFilter }: APTableProps) => {
  const displayedAps = aps.slice(0, limit || aps.length);

  return (
    <div className="table-wrap ap-monitoring-table-container w-full overflow-hidden">
      {aps.length ? (
        <div className="ap-table-scroll-wrap w-full overflow-x-auto">
          <table className="data-table ap-table clean-ap-table w-full min-w-[600px]">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-900/50">
                <th className="whitespace-nowrap px-4 py-3 text-sm font-semibold text-left" style={{ width: '26%' }}>
                  ACCESS POINT
                </th>
                <th className="whitespace-nowrap px-4 py-3 text-sm font-semibold text-left" style={{ width: '22%' }}>
                  STATUS
                </th>
                <th className="whitespace-nowrap px-4 py-3 text-sm font-semibold text-left" style={{ width: '16%' }}>
                  CLIENTS
                </th>
                <th className="whitespace-nowrap px-4 py-3 text-sm font-semibold text-left" style={{ width: '22%' }}>
                  BANDWIDTH LOAD
                </th>
                <th
                  className="whitespace-nowrap px-4 py-3 text-sm font-semibold text-right"
                  style={{ width: '14%', textAlign: 'right' }}
                >
                  ACTION
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
              {displayedAps.map(a => {
                const locInfo = formatLocationBadge(a.lab_name || a.lab_id);
                const locCode = locInfo.code;
                const locName = locInfo.name;
                const fullTooltip = `${a.tag} · ${locCode ? `[${locCode}] ` : ''}${locName}${a.placement ? ` · ${a.placement}` : ''}${a.ip ? ` (IP: ${a.ip})` : ''}`;

                return (
                  <tr
                    key={a.id}
                    data-testid={`ap-row-${a.id}`}
                    onClick={() => onSelect?.(a)}
                    className={
                      onSelect ? 'clickable hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors' : ''
                    }
                  >
                    {/* 1. ACCESS POINT: Plain bold tag, location & IP in tooltip */}
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      <strong
                        className="ap-tag-mono mono block font-semibold text-slate-900 dark:text-slate-100"
                        title={fullTooltip}
                      >
                        {a.tag}
                      </strong>
                    </td>

                    {/* 2. STATUS: Status badge with dot and text */}
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      <Status value={a.status} id={`ap-status-${a.id}`} />
                    </td>

                    {/* 3. CLIENTS: Connected devices count */}
                    <td className="whitespace-nowrap px-4 py-3 text-sm mono font-medium text-slate-700 dark:text-slate-300">
                      {a.clients ?? '—'}
                    </td>

                    {/* 4. BANDWIDTH LOAD: Compact progress bar + percentage */}
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      <div className="utilization">
                        <span className={`utilization-bar ${a.status}`}>
                          <i style={{ width: `${a.load || 0}%` }} />
                        </span>
                        <span className="mono font-medium text-slate-700 dark:text-slate-300">
                          {a.load == null ? '—' : `${a.load}%`}
                        </span>
                      </div>
                    </td>

                    {/* 5. ACTION: Single uniform action button */}
                    <td className="whitespace-nowrap px-4 py-3 text-sm" style={{ textAlign: 'right' }}>
                      <div className="ap-action-group inline-flex items-center justify-end">
                        <button
                          type="button"
                          id={`ping-ap-${a.id}`}
                          data-testid={`inspect-${a.id}`}
                          className="action-btn-uniform"
                          title={`Open AP Action Modal for ${a.tag}`}
                          aria-label={`Open AP Action Modal for ${a.tag}`}
                          onClick={e => {
                            e.stopPropagation();
                            onSelect?.(a);
                          }}
                        >
                          <ArrowUpRight size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty" data-testid="no-access-points">
          <span>No access points match the selected filter.</span>
          {onResetFilter && (
            <Button id="reset-ap-filter" onClick={onResetFilter}>
              Show All Access Points
            </Button>
          )}
        </div>
      )}
    </div>
  );
};
type SimulationProps = {
  open: boolean;
  onClose: (open: boolean) => void;
  aps: AccessPoint[];
  onDone?: (scenario: string, asset: string) => void;
};
export const Simulation = ({ open, onClose, aps, onDone }: SimulationProps) => {
  const [asset, setAsset] = useState('all'),
    [scenario, setScenario] = useState('congestion'),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [success, setSuccess] = useState('');
  const apply = async () => {
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const r = await api.post('/simulation', { asset_id: asset, scenario });
      setSuccess(r.data.message);
      onDone?.(scenario, asset);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Network Simulation Controls" id="simulation-dialog">
      <Field label="Target Access Point / Lab" id="scenario-asset">
        <Select id="scenario-asset" value={asset} onChange={e => setAsset(e.target.value)}>
          <option value="all">All Access Points</option>
          <option value="lab-1">Computing Lab A (All APs)</option>
          <option value="lab-2">Computing Lab B (All APs)</option>
          <option value="lab-3">Innovation Lab (All APs)</option>
          {aps.map(a => (
            <option key={a.id} value={a.id}>
              {a.tag} · {a.lab_name}
            </option>
          ))}
        </Select>
      </Field>
      <div className="scenario-options">
        {[
          ['congestion', 'Network Congestion', 'Simulate high device density and bandwidth load'],
          [
            'degradation',
            'Gradual Degradation',
            'Progressive bandwidth load climb (20% → 95%) with queue depth spikes',
          ],
          [
            'flapping',
            'Intermittent Link Flapping',
            'Simulate microbursts and rapid normal-to-interrupted state transitions',
          ],
          ['outage', 'Hardware Outage', 'Simulate complete access point loss of signal'],
          ['feed', 'Telemetry Interruption', 'Simulate feed timeout and unmonitored device state'],
          ['normal', 'Restore Normal Operations', 'Recover telemetry and reset baseline metrics'],
        ].map(([key, title, sub]) => (
          <button
            type="button"
            key={key}
            className={scenario === key ? 'selected' : ''}
            data-testid={`scenario-${key}`}
            onClick={() => {
              setScenario(key);
              setSuccess('');
            }}
          >
            <span className={`scenario-dot ${key}`} />
            <span>
              <strong>{title}</strong>
              <small>{sub}</small>
            </span>
            {scenario === key && <Check size={16} />}
          </button>
        ))}
      </div>
      <ErrorBox error={error} />
      {success && (
        <div className="success-box" data-testid="simulation-success">
          <Check size={17} />
          {success}
        </div>
      )}
      <Button variant="primary" id="apply-scenario" disabled={busy} onClick={apply}>
        <FlaskConical size={16} />
        {busy ? 'Applying scenario…' : 'Run Simulation'}
      </Button>
    </Modal>
  );
};
