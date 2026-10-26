/** Client-side AP fleet simulation used by the Monitoring page. */
import { SIMULATION_FLEET_APS } from './workflow';

export function apIndex(id: string): number {
  const digits = String(id || '1').replace(/\D/g, '');
  return digits ? parseInt(digits, 10) : 1;
}

export function baselineApMetrics(ap: any, idx: number, tick = 0, sampleIso?: string) {
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

export function buildSimulationFleet(nowIso?: string) {
  const ts = nowIso || new Date().toISOString();
  return SIMULATION_FLEET_APS.map(ap => ({
    ...ap,
    last_seen: ts,
  })).sort((a, b) => (a.tag || '').localeCompare(b.tag || ''));
}

export function buildHealthyFleet(nowIso?: string) {
  const ts = nowIso || new Date().toISOString();
  return SIMULATION_FLEET_APS.map((ap, idx) =>
    baselineApMetrics({ ...ap, status: 'online', scenario: 'normal' }, idx, 0, ts),
  ).sort((a, b) => (a.tag || '').localeCompare(b.tag || ''));
}

export function stepApMetrics(ap: any, idx: number, tick: number, sampleIso: string) {
  const num = apIndex(ap.id) || idx + 1;
  const status = ap.status || 'online';
  const scenario =
    ap.scenario ||
    (status === 'congested' ? 'congestion' : status === 'offline' ? 'outage' : status === 'stale' ? 'feed' : 'normal');

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

export function computeStats(aps: any[]) {
  return {
    total: aps.length,
    online: aps.filter(a => a.status === 'online').length,
    congested: aps.filter(a => a.status === 'congested').length,
    offline: aps.filter(a => a.status === 'offline').length,
    stale: aps.filter(a => a.status === 'stale').length,
    clients: aps.reduce((sum, a) => sum + (typeof a.clients === 'number' ? a.clients : 0), 0),
  };
}
