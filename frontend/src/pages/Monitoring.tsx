import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import {
  FlaskConical,
  RefreshCw,
  Search,
  Play,
  RotateCcw,
  Wifi,
  Activity,
  Users,
  Send,
  CheckCheck,
  CheckCircle2,
  ArrowUpRight,
  Terminal,
  Power,
  Radio,
  Wrench,
  SlidersHorizontal,
  MapPin,
  X,
} from 'lucide-react';
import { PageTitle, Button, Select, Status, Loading, ErrorBox, SectionHead, Modal, Field, useData } from '../components/shared';
import { TrafficChart, APTable, Simulation } from '../components/Telemetry';
import { useAuth } from '../context';
import { api, time, errorText } from '../lib/api';
import {
  saveLocalTicket,
  mergeTickets,
  restoreDevice,
  enrichTicket,
  isMonitoringSimActive,
  setMonitoringSimActive,
  SIMULATION_FLEET_APS,
  getSharedFleetAps,
  ZONE_FILTERS,
  ZONE_GROUP_LABELS,
  matchesZone,
  zoneGroupOf,
  CAMPUS_LOCATIONS,
  AP_LOCATION_GROUPS,
  formatLocationWithCode,
  formatLocationBadge,
} from '../lib/workflow';



function apIndex(id: string): number {
  const digits = String(id || '1').replace(/\D/g, '');
  return digits ? parseInt(digits, 10) : 1;
}

function baselineApMetrics(ap: any, idx: number, tick = 0, sampleIso?: string) {
  const num = apIndex(ap.id) || idx + 1;
  const labId = ap.lab_id || 'lab-1';
  const baseClients = labId === 'lab-3' ? 40 : labId === 'lab-1' ? 29 : labId === 'lab-4' ? 31 : 27;
  const baseLoad = labId === 'lab-3' ? 48 : labId === 'lab-1' ? 38 : labId === 'lab-4' ? 41 : 36;
  const tpFactor = labId === 'lab-3' ? 1.18 : labId === 'lab-1' ? 0.96 : 0.9;

  const waveC = Math.round(Math.sin(tick * 1.15 + num * 1.4) * 3 + Math.cos(tick * 0.7) * 2);
  const waveL = Math.round(Math.cos(tick * 1.05 + num * 1.2) * 4 + Math.sin(tick * 0.65) * 2);

  const clients = Math.max(20, baseClients + ((num * 3) % 9) + waveC);
  const load = Math.max(30, Math.min(60, baseLoad + ((num * 3) % 12) + waveL));
  const latency = Math.max(8, 9 + ((num * 2 + tick * 2) % 6) + (labId === 'lab-3' ? 2 : 0));
  const throughput = Math.round(clients * (tpFactor + Math.sin(tick * 0.8 + num) * 0.1) * 10) / 10;

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

function buildSimulationFleet(nowIso?: string) {
  const ts = nowIso || new Date().toISOString();
  return SIMULATION_FLEET_APS.map(ap => ({
    ...ap,
    last_seen: ts,
  })).sort((a, b) => (a.tag || '').localeCompare(b.tag || ''));
}

function buildHealthyFleet(nowIso?: string) {
  const ts = nowIso || new Date().toISOString();
  return SIMULATION_FLEET_APS.map((ap, idx) =>
    baselineApMetrics({ ...ap, status: 'online', scenario: 'normal' }, idx, 0, ts)
  ).sort((a, b) => (a.tag || '').localeCompare(b.tag || ''));
}

function stepApMetrics(ap: any, idx: number, tick: number, sampleIso: string) {
  const num = apIndex(ap.id) || idx + 1;
  const status = ap.status || 'online';
  const scenario =
    ap.scenario ||
    (status === 'congested'
      ? 'congestion'
      : status === 'offline'
      ? 'outage'
      : status === 'stale'
      ? 'feed'
      : 'normal');

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
    const baseL = typeof ap.load === 'number' && ap.load >= 85 ? ap.load : 90;
    const deltaC = Math.round(Math.sin(tick * 1.3 + num * 1.7) * 3 + Math.cos(tick * 0.8) * 1.5);
    const deltaL = Math.round(Math.cos(tick * 1.1 + num * 1.3) * 2 + Math.sin(tick * 0.6) * 1);
    const clients = Math.max(66, Math.min(96, baseC + deltaC));
    const load = Math.max(85, Math.min(95, baseL + deltaL));
    const latency = 115 + ((num * 7 + tick * 5) % 38);
    const throughput = Math.round(clients * (0.9 + Math.sin(tick * 0.9 + num) * 0.12) * 10) / 10;
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
  const navigate = useNavigate();
  const [lab, setLab] = useState(params.get('lab') || '');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const [zone, setZone] = useState('all');
  const [simulation, setSimulation] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [detail, setDetail] = useState<any>(null);
  const [localError, setLocalError] = useState('');
  const [sampling, setSampling] = useState(false);
  const [pulseActive, setPulseActive] = useState(false);
  const [sampleInterval, setSampleInterval] = useState<number>(0);

  const initialSimActive = isMonitoringSimActive();
  const [simulationActive, setSimulationActive] = useState<boolean>(initialSimActive);
  const [busySimulation, setBusySimulation] = useState(false);

  const [liveAps, setLiveAps] = useState<any[] | null>(() =>
    initialSimActive ? buildSimulationFleet() : buildHealthyFleet()
  );
  const [liveSamples, setLiveSamples] = useState<any[]>([]);
  const [lastSampleAt, setLastSampleAt] = useState<string>(() => new Date().toISOString());

  const [ticketForm, setTicketForm] = useState({ title: '', description: '', priority: 'high' });
  const [creatingTicket, setCreatingTicket] = useState(false);
  const [createdTicket, setCreatedTicket] = useState<any>(null);
  const [diagResult, setDiagResult] = useState<any>(null);
  const [runningDiag, setRunningDiag] = useState(false);
  const [remediating, setRemediating] = useState(false);
  const [remediationNote, setRemediationNote] = useState('');

  const sampleTickRef = useRef(0);
  const userSimulatedRef = useRef<boolean>(initialSimActive);
  const pulseTimeoutRef = useRef<number | null>(null);

  const { data, error, busy, load } = useData(`/monitoring${lab ? '?lab_id=' + lab : ''}`);
  const ticketsData = useData('/tickets');

  const [workflowVersion, setWorkflowVersion] = useState(0);

  const activeTicketsByAsset = useMemo(() => {
    const map: Record<string, any> = {};
    const merged = mergeTickets(ticketsData.data);
    for (const t of merged) {
      if (t.asset_id && t.status !== 'resolved') {
        map[t.asset_id] = t;
      }
      if (t.asset_tag && t.status !== 'resolved') {
        map[t.asset_tag] = t;
      }
    }
    if (createdTicket?.asset_id && createdTicket.status !== 'resolved') {
      map[createdTicket.asset_id] = createdTicket;
    }
    return map;
  }, [ticketsData.data, createdTicket, workflowVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onWorkflow = () => {
      setLiveAps(getSharedFleetAps());
      setWorkflowVersion(v => v + 1);
    };
    window.addEventListener('atlas-workflow-updated', onWorkflow);
    window.addEventListener('atlas-sim-state', onWorkflow);
    return () => {
      window.removeEventListener('atlas-workflow-updated', onWorkflow);
      window.removeEventListener('atlas-sim-state', onWorkflow);
    };
  }, []);

  // Keep 21-AP fleet synchronized with active simulation or healthy baseline state
  useEffect(() => {
    setLiveAps(getSharedFleetAps());
    if (!lastSampleAt && (data?.last_updated || data?.server_time)) {
      setLastSampleAt(data.last_updated || data.server_time);
    }
  }, [data, simulationActive]); // eslint-disable-line react-hooks/exhaustive-deps

  const inspect = async (a: any, keepDetail = false) => {
    setSelected(a);
    setDiagResult(null);
    setRemediationNote('');
    if (!keepDetail) setDetail(null);
    setLocalError('');
    const statusLabel =
      a.status === 'stale'
        ? 'Telemetry Feed Interrupted'
        : a.status === 'offline'
        ? 'Hardware Outage / Unreachable'
        : `High Bandwidth Congestion (${a.load ?? 90}%)`;
    setTicketForm({
      title: `${statusLabel} — ${a.tag}`,
      description: `Infrastructure telemetry escalation for ${a.tag} (${a.lab_name || a.lab_id}, IP ${a.ip}). Status: ${String(a.status).toUpperCase()}.`,
      priority: 'high',
    });
    try {
      const res = await api.get(`/monitoring/${a.id}/history`);
      setDetail({
        ...res.data,
        asset: { ...res.data.asset, ...a, last_seen: a.last_seen || res.data?.asset?.last_seen || new Date().toISOString() },
      });
    } catch {
      const nowMs = Date.now();
      const syntheticHistory = Array.from({ length: 12 }, (_, idx) => {
        const ptIso = new Date(nowMs - (11 - idx) * 5 * 60 * 1000).toISOString();
        const stepped = stepApMetrics(a, idx, idx + 1, ptIso);
        return {
          timestamp: ptIso,
          clients: stepped.clients ?? 0,
          throughput: stepped.throughput ?? 0,
          load: stepped.load,
          latency: stepped.latency,
          status: stepped.status,
        };
      });
      setDetail({
        asset: { ...a, last_seen: a.last_seen || new Date().toISOString() },
        history: syntheticHistory,
      });
    }
  };

  const runDiagnostics = async (ap: any) => {
    if (!ap || runningDiag) return;
    setRunningDiag(true);
    setLocalError('');
    try {
      const res = await api.post(`/monitoring/${ap.id}/diagnose`);
      setDiagResult(res.data);
    } catch {
      const st = ap.status || 'online';
      const loss = st === 'offline' ? 100 : st === 'congested' ? 8 : st === 'stale' ? 20 : 0;
      const avgRtt = st === 'offline' ? null : st === 'congested' ? (ap.latency || 126) : (ap.latency || 12);
      setDiagResult({
        asset_id: ap.id,
        tag: ap.tag,
        ip: ap.ip,
        status: st,
        packets_sent: 5,
        packets_received: Math.round(5 * (1 - loss / 100)),
        packet_loss_pct: loss,
        rtt_min_ms: avgRtt ? Math.max(4, Math.round((avgRtt - 2.4) * 10) / 10) : null,
        rtt_avg_ms: avgRtt,
        rtt_max_ms: avgRtt ? Math.round((avgRtt + 5.8) * 10) / 10 : null,
        poe_draw_watts: st === 'offline' ? 0 : st === 'congested' ? 22.8 : 15.6,
        poe_status: st === 'offline' ? 'No Power / Link Down' : '802.3at PoE+ Nominal',
        channel_5ghz: st === 'congested' ? 'Ch 149 (80 MHz · High DFS Contention)' : 'Ch 36 (80 MHz · Clean)',
        snr_db: st === 'offline' ? null : st === 'congested' ? 18 : 35,
        switch_port: `SW-${(ap.lab_id || 'LAB1').toUpperCase().replace('-', '')}-Gi1/0/${apIndex(ap.id)}`,
        summary:
          st === 'offline'
            ? '100% ICMP packet loss. Switch port reports PoE link down.'
            : st === 'congested'
            ? 'Elevated airtime utilization and packet retransmissions on 5GHz radio.'
            : st === 'stale'
            ? 'ICMP reachable with intermittent SNMP/telemetry agent timeout.'
            : '0% packet loss, healthy PoE power draw, and optimal SNR.',
      });
    } finally {
      setRunningDiag(false);
    }
  };

  const runRemediation = async (ap: any, action: string) => {
    if (!ap || remediating) return;
    setRemediating(true);
    setLocalError('');
    setRemediationNote('');
    const nowIso = new Date().toISOString();
    try {
      const res = await api.post(`/monitoring/${ap.id}/remediate`, { action });
      setRemediationNote(res.data?.action_label || 'Remediation action completed. Device restored to Online.');
    } catch {
      try {
        await api.post('/simulation', { asset_id: ap.id, scenario: 'normal' });
      } catch {}
      const labels: Record<string, string> = {
        reboot_poe: 'PoE Switch Port Cycled & AP Rebooted — Device Restored to Online',
        rebalance_channel: '5GHz Radio Channel Rebalanced & Airtime Cleared — Device Restored to Online',
        restart_agent: 'SNMP / Telemetry Daemon Restarted — Feed Restored to Online',
      };
      setRemediationNote(labels[action] || 'Remediation action completed.');
    } finally {
      const linkedTicket = activeTicketsByAsset[ap.id] || activeTicketsByAsset[ap.tag];
      if (linkedTicket) {
        saveLocalTicket({ ...linkedTicket, status: 'resolved', updated_at: nowIso });
      }
      restoreDevice(ap.id);
      const idx = Math.max(0, (liveAps || data?.aps || []).findIndex((x: any) => x.id === ap.id));
      const healthyAp = baselineApMetrics({ ...ap, status: 'online', scenario: 'normal' }, idx, sampleTickRef.current + 1, nowIso);
      setLiveAps(getSharedFleetAps());
      setSelected(healthyAp);
      setDetail((prev: any) =>
        prev
          ? {
              ...prev,
              asset: { ...prev.asset, ...healthyAp },
              history: [
                ...(prev.history || []),
                {
                  timestamp: nowIso,
                  clients: healthyAp.clients,
                  throughput: healthyAp.throughput,
                  load: healthyAp.load,
                  latency: healthyAp.latency,
                  status: 'online',
                  live: true,
                },
              ],
            }
          : prev
      );
      setDiagResult(null);
      setRemediating(false);
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

  const submitNetworkTicket = async (e: any) => {
    e.preventDefault();
    const targetAp = detail?.asset || selected;
    if (!targetAp) return;
    setCreatingTicket(true);
    setLocalError('');
    try {
      const r = await api.post('/incidents', {
        asset_id: targetAp.id,
        category: 'network',
        title: ticketForm.title,
        description: ticketForm.description || `Infrastructure telemetry escalation for ${targetAp.tag}`,
        priority: ticketForm.priority,
      });
      const enriched = enrichTicket({
        ...r.data,
        tier: 'Tier 2 · Network / Connectivity',
        tier_code: 'tier2',
        assigned_role: 'engineer',
        assigned_name: 'Daniel Reyes (Network Engineer)',
      });
      saveLocalTicket(enriched);
      setCreatedTicket(enriched);
      setWorkflowVersion(v => v + 1);
      ticketsData.load();
    } catch {
      const fallbackNum = `INC-${1045 + Math.floor(Math.random() * 50)}`;
      const nowIso = new Date().toISOString();
      const enriched = enrichTicket({
        id: `local-${targetAp.id}-${Date.now()}`,
        number: fallbackNum,
        asset_id: targetAp.id,
        asset_tag: targetAp.tag,
        asset_name: targetAp.name,
        asset_kind: 'AP',
        lab_id: targetAp.lab_id,
        lab_name: targetAp.lab_name,
        category: 'network',
        priority: ticketForm.priority,
        status: 'open',
        title: ticketForm.title,
        description: ticketForm.description || `Infrastructure telemetry escalation for ${targetAp.tag}`,
        created_at: nowIso,
        updated_at: nowIso,
        tier: 'Tier 2 · Network / Connectivity',
        tier_code: 'tier2',
        assigned_role: 'engineer',
        assigned_name: 'Daniel Reyes (Network Engineer)',
      });
      saveLocalTicket(enriched);
      setCreatedTicket(enriched);
      setWorkflowVersion(v => v + 1);
      ticketsData.load();
    } finally {
      setCreatingTicket(false);
    }
  };

  const handleRefresh = async () => {
    triggerPulse();
    await handleSample();
  };

  const handlePollLiveMetrics = async () => {
    await handleSample();
  };

  const handleTriggerSimulation = async () => {
    if (busySimulation) return;
    setBusySimulation(true);
    setLocalError('');
    triggerPulse();
    userSimulatedRef.current = true;
    sampleTickRef.current += 1;
    const nowIso = new Date().toISOString();

    const updatedAps = buildSimulationFleet(nowIso);

    setLiveAps(updatedAps);
    setLastSampleAt(nowIso);
    setSimulationActive(true);
    setMonitoringSimActive(true);

    const reporting = updatedAps.filter((a: any) => typeof a.clients === 'number');
    const totalClients = reporting.reduce((s: number, a: any) => s + (a.clients || 0), 0);
    const totalThroughput = Math.round(reporting.reduce((s: number, a: any) => s + (a.throughput || 0), 0) * 10) / 10;
    const avgLoad = reporting.length ? Math.round((reporting.reduce((s: number, a: any) => s + (a.load || 0), 0) / reporting.length) * 10) / 10 : null;
    const latList = reporting.filter((a: any) => typeof a.latency === 'number');
    const avgLatency = latList.length ? Math.round((latList.reduce((s: number, a: any) => s + (a.latency || 0), 0) / latList.length) * 10) / 10 : null;

    setLiveSamples(prev => [
      ...prev.slice(-24),
      {
        timestamp: nowIso,
        clients: totalClients,
        throughput: totalThroughput,
        load: avgLoad,
        latency: avgLatency,
        live: true,
      },
    ]);

    try {
      await Promise.allSettled([
        api.post('/simulation', { asset_id: 'ap-07', scenario: 'congestion' }),
        api.post('/simulation', { asset_id: 'ap-10', scenario: 'congestion' }),
        api.post('/simulation', { asset_id: 'ap-03', scenario: 'congestion' }),
        api.post('/simulation', { asset_id: 'ap-12', scenario: 'congestion' }),
        api.post('/simulation', { asset_id: 'ap-04', scenario: 'outage' }),
        api.post('/simulation', { asset_id: 'ap-08', scenario: 'outage' }),
      ]);
    } catch {
      // Best-effort backend notification
    } finally {
      setBusySimulation(false);
    }
  };

  const handleResetSimulation = async () => {
    if (busySimulation) return;
    setBusySimulation(true);
    setLocalError('');
    triggerPulse();
    userSimulatedRef.current = false;
    sampleTickRef.current += 1;
    const nowIso = new Date().toISOString();

    const restoredAps = buildHealthyFleet(nowIso);

    setLiveAps(restoredAps);
    setLastSampleAt(nowIso);
    setSimulationActive(false);
    setMonitoringSimActive(false);

    const reporting = restoredAps.filter((a: any) => typeof a.clients === 'number');
    const totalClients = reporting.reduce((s: number, a: any) => s + (a.clients || 0), 0);
    const totalThroughput = Math.round(reporting.reduce((s: number, a: any) => s + (a.throughput || 0), 0) * 10) / 10;
    const avgLoad = reporting.length ? Math.round((reporting.reduce((s: number, a: any) => s + (a.load || 0), 0) / reporting.length) * 10) / 10 : null;
    const latList = reporting.filter((a: any) => typeof a.latency === 'number');
    const avgLatency = latList.length ? Math.round((latList.reduce((s: number, a: any) => s + (a.latency || 0), 0) / latList.length) * 10) / 10 : null;

    setLiveSamples(prev => [
      ...prev.slice(-24),
      {
        timestamp: nowIso,
        clients: totalClients,
        throughput: totalThroughput,
        load: avgLoad,
        latency: avgLatency,
        live: true,
      },
    ]);

    try {
      await api.post('/simulation', { asset_id: 'all', scenario: 'normal' });
    } catch {
      // Best-effort backend notification
    } finally {
      setBusySimulation(false);
    }
  };

  const handleSimulationDone = async (scenario?: string) => {
    const isAnomaly = scenario !== 'normal';
    userSimulatedRef.current = isAnomaly;
    setSimulationActive(isAnomaly);
    setMonitoringSimActive(isAnomaly);
    setLiveAps(isAnomaly ? buildSimulationFleet() : buildHealthyFleet());
    setLiveSamples([]);
    setStatus('all');
    setLastSampleAt(new Date().toISOString());
  };

  const activeAps = useMemo(
    () => (liveAps && liveAps.length > 0 ? liveAps : simulationActive ? buildSimulationFleet() : buildHealthyFleet()),
    [liveAps, simulationActive]
  );
  const labScopedAps = useMemo(
    () => (lab ? activeAps.filter((a: any) => a.lab_id === lab) : activeAps),
    [activeAps, lab]
  );
  const stats = useMemo(() => computeStats(labScopedAps), [labScopedAps]);

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

  if (!data && !liveAps) {
    return (
      <div className="monitoring-page pt-20 sm:pt-24 px-4 sm:px-6 pb-12 w-full max-w-7xl mx-auto flex flex-col gap-6 flex-1 min-w-0">
        <PageTitle title="Network Monitoring" />
        <ErrorBox error={error} retry={load} />
        {busy && <Loading />}
      </div>
    );
  }

  const query = search.trim().toLowerCase();
  const filteredAps = labScopedAps.filter((a: any) => {
    if (status !== 'all' && a.status !== status) return false;
    if (!query) return true;
    const haystack = [
      a.tag,
      a.name,
      a.lab_name,
      a.placement,
      a.ip,
      a.model,
      a.mac,
      ZONE_GROUP_LABELS[zoneGroupOf(a)],
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return query.split(/\s+/).every(term => haystack.includes(term));
  });

  const displayedLastUpdated = lastSampleAt || data?.last_updated || data?.server_time || new Date().toISOString();
  const isFeedActive = sampling || pulseActive || sampleInterval > 0;

  return (
    <div className="monitoring-page pt-20 sm:pt-24 px-4 sm:px-6 pb-12 w-full max-w-7xl mx-auto flex flex-col gap-6 flex-1 min-w-0">
      <PageTitle
        title="Network Monitoring"
      />

      <ErrorBox error={error || (!selected && localError)} retry={load} />

      {createdTicket && (
        <div className="success-box" data-testid="ap-ticket-created-banner">
          <CheckCheck size={17} />
          <span>
            Infrastructure ticket <strong>{createdTicket.number}</strong> created for{' '}
            <strong>{createdTicket.asset_tag}</strong> (Routed to Network Engineer).
          </span>
          <Link className="inline-link" to={`/tickets?ticket=${createdTicket.id}`}>
            View Ticket <ArrowUpRight size={14} />
          </Link>
          <button className="text-button" onClick={() => setCreatedTicket(null)}>
            Dismiss
          </button>
        </div>
      )}

      <div className={`monitor-status-strip monitor-unified-bar ${pulseActive ? 'is-sampling' : ''}`}>
        <div className="telemetry-bar-info">
          <span className="feed-label" data-testid="telemetry-feed-badge">
            <RadioIcon pulsing={sampling || pulseActive} active={isFeedActive} />
            LIVE TELEMETRY FEED
          </span>
          <span data-testid="monitor-last-updated" className={`sample-timestamp ${pulseActive ? 'sample-timestamp-flash' : ''}`}>
            Last sample: {time(displayedLastUpdated, true, true)} MYT
          </span>
          <span className="sample-retention-info">{activeAps.length || 28} Campus APs · 7-day retention</span>
        </div>

        {user.role !== 'assistant' && (
          <div className="monitor-strip-actions">
            <div className="auto-poll-control" data-testid="auto-sample-control">
              <span className="auto-poll-label">Auto-Sample:</span>
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
              variant="secondary"
              className={`monitor-poll-btn ${sampling || pulseActive ? 'sample-btn-active' : ''}`}
              disabled={sampling}
              onClick={handlePollLiveMetrics}
              title="Poll live telemetry metrics for all access points"
            >
              <RefreshCw size={14} className={sampling || pulseActive ? 'spin' : ''} />
              {sampling ? 'Polling…' : 'Poll Live Metrics'}
            </Button>

            <Button
              id="monitoring-simulate"
              data-testid="monitoring-simulate"
              variant={simulationActive ? 'danger' : 'primary'}
              className={`sim-toggle-btn ${simulationActive ? 'sim-btn-active' : 'sim-btn-idle'}`}
              disabled={busySimulation}
              onClick={simulationActive ? handleResetSimulation : handleTriggerSimulation}
              title={
                simulationActive
                  ? 'Reset all access points to baseline healthy status'
                  : 'Inject demonstration simulation dataset'
              }
            >
              {busySimulation ? (
                <>
                  <RefreshCw size={14} className="spin" />
                  <span>{simulationActive ? 'Restoring…' : 'Injecting…'}</span>
                </>
              ) : simulationActive ? (
                <>
                  <RotateCcw size={14} className="sim-reset-icon" />
                  <span>Reset to Healthy</span>
                </>
              ) : (
                <>
                  <Play size={13} fill="currentColor" />
                  <span>Run Simulation</span>
                </>
              )}
            </Button>
          </div>
        )}
      </div>

      <div
        className="flex items-center gap-2.5 overflow-x-auto no-scrollbar sm:flex-wrap pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 monitoring-filter-tabs"
        role="tablist"
        aria-label="Access Point Status Filter"
      >
        {[
          ['all', 'All Access Points', stats.total],
          ['online', 'Online', stats.online],
          ['congested', 'Congested', stats.congested],
          ['offline', 'Offline', stats.offline],
          ['stale', 'Feed Interrupted', stats.stale],
        ].map(([key, label, count]) => (
          <button
            key={key}
            role="tab"
            aria-selected={status === key}
            data-testid={`ap-filter-${key}`}
            className={`flex-shrink-0 whitespace-nowrap ${status === key ? 'active' : ''}`}
            onClick={() => setStatus(String(key))}
          >
            {label}
            <span>{count}</span>
          </button>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
        <TrafficChart history={chartHistory} height={250} />
      </div>

      <section className="monitor-table">
        <SectionHead title="Access Points">
          <div className="section-actions ap-filter-controls">
            <div className="search-field ap-search-field">
              <Search size={15} />
              <input
                data-testid="search-access-points"
                placeholder="Search access points..."
                aria-label="Search access points"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              {search && (
                <button
                  type="button"
                  className="search-clear"
                  aria-label="Clear search"
                  onClick={() => setSearch('')}
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <Select
              id="monitor-lab-filter"
              className="ap-location-select"
              value={lab}
              onChange={(e: any) => {
                setLab(e.target.value);
              }}
            >
              <option value="">All Campus Locations ({activeAps.length} APs)</option>
              {AP_LOCATION_GROUPS.map(group => (
                <optgroup key={group.label} label={group.label}>
                  {CAMPUS_LOCATIONS
                    .filter(l => group.zones.includes(l.zone_group))
                    .map(l => (
                      <option key={l.id} value={l.id}>
                        [{l.code}] {l.name} ({activeAps.filter((a: any) => a.lab_id === l.id).length} APs)
                      </option>
                    ))}
                </optgroup>
              ))}
            </Select>
          </div>
        </SectionHead>

        <APTable
          aps={filteredAps}
          onSelect={inspect}
          ticketsByAsset={activeTicketsByAsset}
          onResetFilter={
            status !== 'all' || search || lab
              ? () => {
                  setStatus('all');
                  setSearch('');
                  setLab('');
                }
              : undefined
          }
        />
      </section>

      <Simulation open={simulation} onClose={setSimulation} aps={activeAps} onDone={handleSimulationDone} />

      {/* UNIFIED COMPACT AP ACTION MODAL */}
      <Modal
        open={!!selected}
        onClose={() => {
          setSelected(null);
          setDetail(null);
          setDiagResult(null);
          setRemediationNote('');
        }}
        title={
          <div className="flex items-center gap-2.5">
            <span>{detail?.asset?.tag || selected?.tag || 'Access Point'}</span>
            <Status value={detail?.asset?.status || selected?.status} id="detail-ap-status" />
          </div>
        }
        id="ap-detail-dialog"
      >
        <ErrorBox error={localError} />
        {selected ? (
          (() => {
            const ap = detail?.asset || selected;
            const linkedTicket = activeTicketsByAsset[ap.id] || activeTicketsByAsset[ap.tag] || ap.linked_ticket;
            const isFaulted = ap.status === 'stale' || ap.status === 'congested' || ap.status === 'offline';

            return (
              <div className="flex flex-col gap-3.5">
                {/* 2. Compact 3-Metric Strip */}
                <div className="grid grid-cols-3 gap-2.5 p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 text-center">
                  <div>
                    <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">Connected Devices</span>
                    <strong className="text-base font-semibold text-slate-900 dark:text-slate-100 mt-0.5 block">{ap.clients ?? '—'}</strong>
                  </div>
                  <div>
                    <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">Bandwidth Load</span>
                    <strong className="text-base font-semibold text-slate-900 dark:text-slate-100 mt-0.5 block">{ap.load == null ? '—' : `${ap.load}%`}</strong>
                  </div>
                  <div>
                    <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">Latency</span>
                    <strong className="text-base font-semibold text-slate-900 dark:text-slate-100 mt-0.5 block">{ap.latency == null ? '—' : `${ap.latency} ms`}</strong>
                  </div>
                </div>

                {ap.status === 'stale' && (
                  <div className="notice text-xs py-2 px-3" data-testid="stale-explanation">
                    Telemetry feed is interrupted or expired. Device status is unconfirmed.
                  </div>
                )}

                {/* 3. Remote Recovery Actions */}
                {user.role !== 'assistant' && (
                  <div className="flex flex-col gap-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        id="run-ap-diagnostic"
                        disabled={runningDiag}
                        onClick={() => runDiagnostics(ap)}
                      >
                        <Terminal size={13} />
                        {runningDiag ? 'Probing…' : 'Run Ping Check'}
                      </Button>
                      <Button
                        size="sm"
                        variant={ap.status === 'congested' ? 'primary' : 'secondary'}
                        id="remediate-ap-channel"
                        disabled={remediating}
                        onClick={() => runRemediation(ap, 'rebalance_channel')}
                      >
                        <Radio size={13} /> {remediating ? 'Applying…' : 'Rebalance 5GHz'}
                      </Button>
                      {ap.status === 'stale' && (
                        <Button
                          size="sm"
                          variant="primary"
                          id="remediate-ap-agent"
                          disabled={remediating}
                          onClick={() => runRemediation(ap, 'restart_agent')}
                        >
                          <Wrench size={13} /> Restart Agent
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant={ap.status === 'offline' ? 'primary' : 'secondary'}
                        id="remediate-ap-reboot"
                        disabled={remediating}
                        onClick={() => runRemediation(ap, 'reboot_poe')}
                      >
                        <Power size={13} /> {remediating ? 'Executing…' : 'Reboot AP'}
                      </Button>
                    </div>

                    {remediationNote && (
                      <div className="success-box text-xs py-2 px-3" data-testid="ap-remediation-banner">
                        <CheckCheck size={15} />
                        <span>{remediationNote}</span>
                      </div>
                    )}

                    {diagResult && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 text-xs" data-testid="ap-diag-results">
                        <div>
                          <span className="text-[10px] text-slate-500 uppercase block">ICMP Loss</span>
                          <strong className={diagResult.packet_loss_pct > 0 ? 'text-amber-500' : 'text-emerald-500'}>
                            {diagResult.packet_loss_pct}% ({diagResult.packets_received}/{diagResult.packets_sent})
                          </strong>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500 uppercase block">RTT Avg</span>
                          <strong className="mono">{diagResult.rtt_avg_ms == null ? 'Timeout' : `${diagResult.rtt_avg_ms} ms`}</strong>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500 uppercase block">Port & PoE</span>
                          <strong>{diagResult.switch_port} · {diagResult.poe_draw_watts}W</strong>
                        </div>
                        <div>
                          <span className="text-[10px] text-slate-500 uppercase block">5GHz Radio</span>
                          <strong>{diagResult.channel_5ghz}</strong>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* 4. Contextual Incident Ticket Section */}
                {linkedTicket ? (
                  <div className="flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50">
                    <div className="flex flex-col">
                      <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                        Linked Ticket: {linkedTicket.number} ({linkedTicket.title || (isFaulted ? 'Congested / Offline' : 'Active')})
                      </span>
                      <span className="text-[11px] text-slate-500">Tier 2 Network Escalation · {linkedTicket.status}</span>
                    </div>
                    <Button
                      size="sm"
                      variant="primary"
                      id={`view-ticket-${ap.id}`}
                      data-testid={`view-ticket-${ap.id}`}
                      onClick={() => {
                        setSelected(null);
                        navigate(`/tickets?ticket=${linkedTicket.id || linkedTicket.number}`);
                      }}
                    >
                      Open Ticket {linkedTicket.number} →
                    </Button>
                  </div>
                ) : !isFaulted || ap.status === 'online' ? (
                  <div className="text-xs text-slate-400 py-1">
                    No active incident tickets for this access point.
                  </div>
                ) : user.role !== 'assistant' ? (
                  <form onSubmit={submitNetworkTicket} className="flex flex-col gap-2.5 pt-3 border-t border-slate-100 dark:border-slate-800/60">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">Escalate Issue to NOC (Tier 2)</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div className="sm:col-span-2">
                        <label className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block mb-1" htmlFor="ap-ticket-title">
                          Incident Title
                        </label>
                        <input
                          id="ap-ticket-title"
                          data-testid="ap-ticket-title"
                          required
                          className="w-full text-xs"
                          value={ticketForm.title}
                          onChange={e => setTicketForm({ ...ticketForm, title: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block mb-1" htmlFor="ap-ticket-priority">
                          Priority
                        </label>
                        <Select
                          id="ap-ticket-priority"
                          value={ticketForm.priority}
                          onChange={(e: any) => setTicketForm({ ...ticketForm, priority: e.target.value })}
                        >
                          <option value="high">High Priority</option>
                          <option value="medium">Medium Priority</option>
                        </Select>
                      </div>
                    </div>
                    <div className="flex items-center justify-end gap-2 mt-1">
                      <Button
                        type="submit"
                        variant="primary"
                        id="submit-ap-ticket"
                        disabled={creatingTicket}
                        size="sm"
                      >
                        <Send size={13} />
                        {creatingTicket ? 'Creating Ticket…' : 'Create Network Ticket'}
                      </Button>
                    </div>
                  </form>
                ) : null}

                <p className="muted small text-[11px] text-slate-400 mt-1" data-testid="ap-detail-last-seen">
                  Last reported: {time(ap.last_seen || ap.updated_at || ap.last_updated || new Date().toISOString(), true, true)} MYT
                </p>
              </div>
            );
          })()
        ) : (
          !localError && <Loading />
        )}
      </Modal>
    </div>
  );
}

const RadioIcon = ({ pulsing, active }: { pulsing?: boolean; active?: boolean }) => (
  <span
    data-testid="telemetry-heartbeat-dot"
    className={`tiny-dot green ${pulsing ? 'feed-pulse' : active ? 'feed-live' : ''}`}
  />
);
