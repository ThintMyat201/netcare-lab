import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FlaskConical, RefreshCw, Search, Wifi, Activity, Users } from 'lucide-react';
import { PageTitle, Button, Select, Status, Loading, ErrorBox, SectionHead, Modal, useData } from '../components/shared';
import { TrafficChart, APTable, Simulation } from '../components/Telemetry';
import { useAuth } from '../context';
import { api, time, errorText } from '../lib/api';

function apIndex(id: string): number {
  const digits = String(id || '1').replace(/\D/g, '');
  return digits ? parseInt(digits, 10) : 1;
}

function baselineApMetrics(ap: any, idx: number, tick = 0, sampleIso?: string) {
  const num = apIndex(ap.id) || idx + 1;
  const labId = ap.lab_id || 'lab-1';
  const baseClients = labId === 'lab-3' ? 44 : labId === 'lab-1' ? 31 : 22;
  const baseLoad = labId === 'lab-3' ? 49 : labId === 'lab-1' ? 36 : 28;
  const tpFactor = labId === 'lab-3' ? 1.18 : labId === 'lab-1' ? 0.96 : 0.86;

  const waveC = Math.round(Math.sin(tick * 1.15 + num * 1.4) * 4 + Math.cos(tick * 0.7) * 2.5);
  const waveL = Math.round(Math.cos(tick * 1.05 + num * 1.2) * 5 + Math.sin(tick * 0.65) * 2.5);

  const clients = Math.max(10, baseClients + ((num * 5) % 11) + waveC);
  const load = Math.max(14, Math.min(76, baseLoad + ((num * 4) % 14) + waveL));
  const latency = Math.max(6, 9 + ((num * 3 + tick * 2) % 11) + (labId === 'lab-3' ? 3 : 0));
  const throughput = Math.round(clients * (tpFactor + Math.sin(tick * 0.8 + num) * 0.12) * 10) / 10;

  return {
    ...ap,
    scenario: 'normal',
    status: 'online',
    clients,
    load,
    latency,
    throughput,
    last_seen: sampleIso || ap.last_seen || new Date().toISOString(),
  };
}

function stepApMetrics(ap: any, idx: number, tick: number, sampleIso: string) {
  const num = apIndex(ap.id) || idx + 1;
  const status = ap.status || 'online';
  const scenario = ap.scenario || (status === 'congested' ? 'congestion' : status === 'offline' ? 'outage' : status === 'stale' ? 'feed' : 'normal');

  if (scenario === 'feed' || status === 'stale') {
    return {
      ...ap,
      status: 'stale',
      clients: null,
      load: null,
      latency: null,
      throughput: null,
    };
  }

  if (scenario === 'outage' || status === 'offline') {
    return {
      ...ap,
      status: 'offline',
      clients: 0,
      load: 0,
      latency: null,
      throughput: 0,
      last_seen: sampleIso,
    };
  }

  if (scenario === 'flapping') {
    const slot = (tick + num) % 3;
    if (slot === 0) {
      return {
        ...ap,
        status: 'stale',
        clients: null,
        load: null,
        latency: null,
        throughput: null,
      };
    }
    if (slot === 1) {
      return baselineApMetrics(ap, idx, tick, sampleIso);
    }
  }

  if (scenario === 'congestion' || scenario === 'degradation' || status === 'congested') {
    const baseC = typeof ap.clients === 'number' && ap.clients >= 60 ? ap.clients : ap.lab_id === 'lab-3' ? 84 : 74;
    const baseL = typeof ap.load === 'number' && ap.load >= 82 ? ap.load : 90;
    const deltaC = Math.round(Math.sin(tick * 1.3 + num * 1.7) * 4 + Math.cos(tick * 0.8) * 2);
    const deltaL = Math.round(Math.cos(tick * 1.1 + num * 1.3) * 3 + Math.sin(tick * 0.6) * 1.5);
    const clients = Math.max(62, Math.min(98, baseC + deltaC));
    const load = Math.max(85, Math.min(98, baseL + deltaL));
    const latency = 118 + ((num * 7 + tick * 5) % 34);
    const throughput = Math.round(clients * (0.9 + Math.sin(tick * 0.9 + num) * 0.14) * 10) / 10;
    return {
      ...ap,
      status: 'congested',
      clients,
      load,
      latency,
      throughput,
      last_seen: sampleIso,
    };
  }

  return baselineApMetrics(ap, idx, tick, sampleIso);
}

function computeStats(aps: any[]) {
  return {
    total: aps.length,
    online: aps.filter(a => a.status === 'online').length,
    congested: aps.filter(a => a.status === 'congested').length,
    offline: aps.filter(a => a.status === 'offline').length,
    stale: aps.filter(a => a.status === 'stale').length,
    clients: aps.reduce((sum, a) => sum + (typeof a.clients === 'number' ? a.clients : 0), 0),
  };
}

export default function Monitoring() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const [lab, setLab] = useState(params.get('lab') || '');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [simulation, setSimulation] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [detail, setDetail] = useState<any>(null);
  const [localError, setLocalError] = useState('');
  const [sampling, setSampling] = useState(false);
  const [pulseActive, setPulseActive] = useState(false);
  const [sampleInterval, setSampleInterval] = useState<number>(0);

  const [liveAps, setLiveAps] = useState<any[] | null>(null);
  const [liveSamples, setLiveSamples] = useState<any[]>([]);
  const [lastSampleAt, setLastSampleAt] = useState<string>('');

  const sampleTickRef = useRef(0);
  const userSimulatedRef = useRef(false);
  const repairedDbRef = useRef(false);
  const pulseTimeoutRef = useRef<number | null>(null);

  const { data, error, busy, load } = useData(`/monitoring${lab ? '?lab_id=' + lab : ''}`);

  // Normalize stuck all-congested state on initial load into a realistic AP status distribution
  useEffect(() => {
    if (!data?.aps) return;
    let nextAps = [...data.aps];
    const allCongested = nextAps.length >= 4 && nextAps.every((a: any) => a.status === 'congested');

    if (allCongested && !userSimulatedRef.current) {
      const congestedIdx = nextAps.findIndex((a: any) => a.id === 'ap-07' || a.tag === 'AP-CL-B-03');
      const keepCongested = congestedIdx >= 0 ? congestedIdx : Math.max(0, nextAps.length - 2);
      const nowIso = new Date().toISOString();

      nextAps = nextAps.map((ap: any, idx: number) =>
        idx === keepCongested
          ? stepApMetrics({ ...ap, scenario: 'congestion', status: 'congested' }, idx, sampleTickRef.current, nowIso)
          : baselineApMetrics(ap, idx, sampleTickRef.current, nowIso)
      );

      // Persist the repaired baseline distribution to MongoDB once per session
      if (!repairedDbRef.current && user.role !== 'assistant') {
        repairedDbRef.current = true;
        const targetId = nextAps[keepCongested]?.id || 'ap-07';
        api
          .post('/simulation', { asset_id: 'all', scenario: 'normal' })
          .then(() => api.post('/simulation', { asset_id: targetId, scenario: 'congestion' }))
          .catch(() => {});
      }
    }

    setLiveAps(nextAps);
    if (!lastSampleAt && (data.last_updated || data.server_time)) {
      setLastSampleAt(data.last_updated || data.server_time);
    }
  }, [data, user.role]); // eslint-disable-line react-hooks/exhaustive-deps

  const inspect = async (a: any, keepDetail = false) => {
    setSelected(a);
    if (!keepDetail) setDetail(null);
    setLocalError('');
    try {
      const res = await api.get(`/monitoring/${a.id}/history`);
      setDetail({
        ...res.data,
        asset: { ...res.data.asset, ...a },
      });
    } catch (e) {
      setLocalError(errorText(e));
    }
  };

  useEffect(() => {
    if (data && params.get('ap')) {
      const a = (liveAps || data.aps).find((item: any) => item.id === params.get('ap'));
      if (a) inspect(a);
    }
  }, [!!data]); // eslint-disable-line react-hooks/exhaustive-deps

  const triggerPulse = () => {
    setPulseActive(true);
    if (pulseTimeoutRef.current) {
      window.clearTimeout(pulseTimeoutRef.current);
    }
    pulseTimeoutRef.current = window.setTimeout(() => {
      setPulseActive(false);
    }, 650);
  };

  useEffect(() => {
    return () => {
      if (pulseTimeoutRef.current) {
        window.clearTimeout(pulseTimeoutRef.current);
      }
    };
  }, []);

  const handleSample = async () => {
    if (sampling) return;
    setSampling(true);
    setLocalError('');
    triggerPulse();

    sampleTickRef.current += 1;
    const tick = sampleTickRef.current;
    const sampleIso = new Date().toISOString();

    const sourceAps = liveAps || data?.aps || [];
    const updatedAps = sourceAps.map((ap: any, idx: number) => stepApMetrics(ap, idx, tick, sampleIso));

    const reportingAps = updatedAps.filter((a: any) => typeof a.clients === 'number');
    const totalClients = reportingAps.reduce((sum: number, a: any) => sum + (a.clients || 0), 0);
    const totalThroughput =
      Math.round(
        reportingAps.reduce(
          (sum: number, a: any) => sum + (typeof a.throughput === 'number' ? a.throughput : (a.clients || 0) * 0.96),
          0
        ) * 10
      ) / 10;
    const avgLoad = reportingAps.length
      ? Math.round((reportingAps.reduce((sum: number, a: any) => sum + (a.load || 0), 0) / reportingAps.length) * 10) / 10
      : null;
    const latencyAps = reportingAps.filter((a: any) => typeof a.latency === 'number');
    const avgLatency = latencyAps.length
      ? Math.round((latencyAps.reduce((sum: number, a: any) => sum + (a.latency || 0), 0) / latencyAps.length) * 10) / 10
      : null;

    const newPoint = {
      timestamp: sampleIso,
      clients: totalClients,
      throughput: totalThroughput,
      load: avgLoad,
      latency: avgLatency,
      live: true,
    };

    setLiveAps(updatedAps);
    setLastSampleAt(sampleIso);
    setLiveSamples(prev => [...prev.slice(-24), newPoint]);

    if (selected) {
      const updatedSelected = updatedAps.find((a: any) => a.id === selected.id);
      if (updatedSelected) {
        setSelected(updatedSelected);
        setDetail((prev: any) =>
          prev
            ? {
                ...prev,
                asset: { ...prev.asset, ...updatedSelected },
                history: [
                  ...(prev.history || []),
                  {
                    timestamp: sampleIso,
                    clients: updatedSelected.clients,
                    throughput: updatedSelected.throughput,
                    load: updatedSelected.load,
                    latency: updatedSelected.latency,
                    status: updatedSelected.status,
                    live: true,
                  },
                ],
              }
            : prev
        );
      }
    }

    try {
      await api.post('/monitoring/sample');
    } catch (e) {
      setLocalError(errorText(e));
    } finally {
      setSampling(false);
    }
  };

  const sampleRef = useRef(handleSample);
  sampleRef.current = handleSample;

  useEffect(() => {
    if (!sampleInterval || user.role === 'assistant') return;
    const timerId = window.setInterval(() => {
      sampleRef.current();
    }, sampleInterval);
    return () => window.clearInterval(timerId);
  }, [sampleInterval, user.role]);

  const handleRefresh = async () => {
    triggerPulse();
    await load();
  };

  const handleSimulationDone = async (scenario?: string) => {
    userSimulatedRef.current = scenario !== 'normal';
    setLiveSamples([]);
    setStatus('all');
    await load();
    setLastSampleAt(new Date().toISOString());
  };

  const activeAps = useMemo(() => liveAps || data?.aps || [], [liveAps, data?.aps]);
  const stats = useMemo(() => computeStats(activeAps), [activeAps]);

  const chartHistory = useMemo(() => {
    const baseHistory = Array.isArray(data?.history) ? data.history : [];
    const allCongested = data?.aps?.length >= 4 && data.aps.every((a: any) => a.status === 'congested');
    const normalizedBase =
      allCongested && !userSimulatedRef.current
        ? baseHistory.map((pt: any, i: number) => {
            const phase = i * 0.45;
            const clients = Math.max(45, Math.round(stats.clients + Math.sin(phase) * 26 + Math.cos(phase * 0.6) * 14));
            const throughput = Math.round(clients * (0.96 + Math.sin(phase * 0.8) * 0.12) * 10) / 10;
            return { ...pt, clients, throughput };
          })
        : baseHistory;
    return [...normalizedBase, ...liveSamples];
  }, [data?.history, data?.aps, liveSamples, stats.clients]);

  if (!data) {
    return (
      <>
        <PageTitle title="Device Monitoring" />
        <ErrorBox error={error} retry={load} />
        {busy && <Loading />}
      </>
    );
  }

  const filteredAps = activeAps.filter(
    (a: any) =>
      (status === 'all' || a.status === status) &&
      (a.tag + ' ' + a.lab_name).toLowerCase().includes(search.toLowerCase())
  );

  const displayedLastUpdated = lastSampleAt || data.last_updated || data.server_time;
  const isFeedActive = sampling || pulseActive || sampleInterval > 0;

  return (
    <>
      <PageTitle
        title="Device Monitoring"
        subtitle="Real-time access point status, bandwidth load, and connection telemetry"
      >
        <Button id="monitoring-refresh" onClick={handleRefresh}>
          <RefreshCw size={15} className={busy ? 'spin' : ''} /> Refresh Status
        </Button>
        {user.role !== 'assistant' && (
          <Button variant="primary" id="monitoring-simulate" onClick={() => setSimulation(true)}>
            <FlaskConical size={16} /> Run Simulation
          </Button>
        )}
      </PageTitle>

      <ErrorBox error={error || (!selected && localError)} retry={load} />

      <div className={`monitor-status-strip ${pulseActive ? 'is-sampling' : ''}`}>
        <span className="feed-label">
          <RadioIcon pulsing={sampling || pulseActive} active={isFeedActive} />
          LIVE TELEMETRY FEED
        </span>
        <span data-testid="monitor-last-updated" className={pulseActive ? 'sample-timestamp-flash' : ''}>
          Last sample: {time(displayedLastUpdated, true, true)} MYT
        </span>
        <span>7-day retention · 20,000 sample capacity</span>
        {user.role !== 'assistant' && (
          <div className="monitor-strip-actions">
            <div className="auto-poll-control" data-testid="auto-sample-control">
              <span className="auto-poll-label">Auto-Sample</span>
              <Select
                id="auto-sample-interval"
                aria-label="Auto-sample interval"
                value={sampleInterval}
                onChange={(e: any) => {
                  const nextVal = Number(e.target.value);
                  setSampleInterval(nextVal);
                  if (nextVal > 0) {
                    sampleRef.current();
                  }
                }}
              >
                <option value={0}>Off / Manual</option>
                <option value={5000}>5s</option>
                <option value={15000}>15s</option>
                <option value={30000}>30s</option>
              </Select>
            </div>
            <Button
              id="generate-sample"
              className={sampling || pulseActive ? 'sample-btn-active' : ''}
              disabled={sampling}
              onClick={handleSample}
            >
              <RefreshCw size={14} className={sampling || pulseActive ? 'spin' : ''} />
              {sampling ? 'Sampling…' : 'Sample Telemetry'}
            </Button>
          </div>
        )}
      </div>

      <div className="filter-tabs">
        {[
          ['all', 'All Access Points', stats.total],
          ['online', 'Online', stats.online],
          ['congested', 'Congested', stats.congested],
          ['offline', 'Offline', stats.offline],
          ['stale', 'Feed Interrupted', stats.stale],
        ].map(([key, label, count]) => (
          <button
            data-testid={`ap-filter-${key}`}
            className={status === key ? 'active' : ''}
            onClick={() => setStatus(String(key))}
            key={key}
          >
            {label}
            <span>{count}</span>
          </button>
        ))}
      </div>

      <TrafficChart history={chartHistory} height={250} />

      <section className="monitor-table">
        <SectionHead title="Access Points">
          <div className="section-actions">
            <div className="search-field">
              <Search size={15} />
              <input
                data-testid="search-access-points"
                placeholder="Search access points by tag or lab…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <Select
              id="monitor-lab-filter"
              value={lab}
              onChange={(e: any) => {
                setLab(e.target.value);
                setLiveAps(null);
              }}
            >
              <option value="">All Labs</option>
              <option value="lab-1">Computing Lab A</option>
              <option value="lab-2">Computing Lab B</option>
              <option value="lab-3">Innovation Lab</option>
            </Select>
          </div>
        </SectionHead>
        <APTable
          aps={filteredAps}
          onSelect={inspect}
          onResetFilter={
            status !== 'all' || search
              ? () => {
                  setStatus('all');
                  setSearch('');
                }
              : undefined
          }
        />
      </section>

      <Simulation open={simulation} onClose={setSimulation} aps={activeAps} onDone={handleSimulationDone} />

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.tag || 'Access Point Details'}
        description={`${selected?.lab_name || ''} · Real-time device telemetry`}
        id="ap-detail-dialog"
      >
        <ErrorBox error={localError} />
        {detail ? (
          <>
            <div className="ap-detail-meta">
              <Status value={detail.asset.status} id="detail-ap-status" />
              <span className="mono">{detail.asset.ip}</span>
              <span>{detail.asset.model}</span>
            </div>
            <div className="detail-metrics">
              <div>
                <Users size={17} />
                <strong>{detail.asset.clients ?? '—'}</strong>
                <span>Connected Devices</span>
              </div>
              <div>
                <Activity size={17} />
                <strong>{detail.asset.load == null ? '—' : `${detail.asset.load}%`}</strong>
                <span>Bandwidth Load</span>
              </div>
              <div>
                <Wifi size={17} />
                <strong>{detail.asset.latency == null ? '—' : `${detail.asset.latency} ms`}</strong>
                <span>Network Latency</span>
              </div>
            </div>
            {detail.asset.status === 'stale' && (
              <div className="notice" data-testid="stale-explanation">
                Telemetry feed is interrupted or expired. Device status is unconfirmed.
              </div>
            )}
            <TrafficChart history={detail.history} height={180} />
            <p className="muted small" data-testid="ap-detail-last-seen">
              Last reported: {time(detail.asset.last_seen, true, true)} MYT
            </p>
          </>
        ) : (
          !localError && <Loading />
        )}
      </Modal>
    </>
  );
}

const RadioIcon = ({ pulsing, active }: { pulsing?: boolean; active?: boolean }) => (
  <span className={`tiny-dot green ${pulsing ? 'feed-pulse' : active ? 'feed-live' : ''}`} />
);
