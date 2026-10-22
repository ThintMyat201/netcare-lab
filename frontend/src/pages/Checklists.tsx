import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  Plus,
  Check,
  CheckCheck,
  X,
  Monitor,
  ClipboardCheck,
  ArrowUpRight,
  Send,
  Sparkles,
  LayoutGrid,
  AlertTriangle,
} from 'lucide-react';
import { useAuth } from '../context';
import { api, errorText, time } from '../lib/api';
import {
  mergeChecklists,
  mergeTickets,
  saveLocalChecklist,
  saveLocalTicket,
  getLabInspectionProgress,
} from '../lib/workflow';
import { PageTitle, Button, Modal, Field, Select, ErrorBox, Loading, Empty, SectionHead, useData } from '../components/shared';

const categories: [string, string, string, string][] = [
  ['power', 'Power & Boot Sequence', 'Powers on smoothly and boots OS without errors', 'Hardware / Peripheral (Tier 1)'],
  ['display', 'Monitor & Display', 'Screen is clear, properly colored, and responsive', 'Hardware / Peripheral (Tier 1)'],
  ['peripherals', 'Keyboard & Mouse', 'All keys, wheel, and pointer buttons respond accurately', 'Hardware / Peripheral (Tier 1)'],
  ['network', 'Campus Network & Connectivity', 'Successfully connects to campus network with valid IP', 'Network / Connectivity (Tier 2)'],
  ['software', 'Required Applications', 'Required lab software packages launch and run normally', 'Hardware / Peripheral (Tier 1)'],
];

const LAB_NAMES: Record<string, string> = {
  'lab-1': 'Computing Lab A',
  'lab-2': 'Computing Lab B',
  'lab-3': 'Innovation Lab',
};

const drafts: Record<string, any> = {};

export default function Checklists() {
  const { user } = useAuth();
  const isAssistant = user?.role === 'assistant';
  const [params] = useSearchParams();
  const { data, error, busy, load } = useData('/checklists');
  const assets = useData('/assets');
  const ticketsData = useData('/tickets');

  const initialLabParam = params.get('lab') || 'all';
  const [labFilter, setLabFilter] = useState(initialLabParam);
  const [mapLab, setMapLab] = useState(initialLabParam === 'all' ? 'lab-1' : initialLabParam);
  const [outcomeFilter, setOutcomeFilter] = useState('all');
  const [faultTier, setFaultTier] = useState<'tier1' | 'tier2'>('tier1');
  const [version, setVersion] = useState(0);
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchNotice, setBatchNotice] = useState('');

  const [open, setOpen] = useState(() => isAssistant && params.has('new'));
  const [draft, setDraft] = useState(
    () =>
      drafts[user.id] || {
        asset_id: params.get('asset') || '',
        checks: {},
        notes: '',
        request_id: crypto.randomUUID(),
      }
  );
  const [sending, setSending] = useState(false);
  const [locked, setLocked] = useState(false);
  const [formError, setFormError] = useState('');
  const [success, setSuccess] = useState<any>(null);
  const [selected, setSelected] = useState<any>(null);
  const [viewTicket, setViewTicket] = useState<any>(null);

  useEffect(() => {
    const onUpdate = () => setVersion(v => v + 1);
    window.addEventListener('atlas-workflow-updated', onUpdate);
    return () => window.removeEventListener('atlas-workflow-updated', onUpdate);
  }, []);

  useEffect(() => {
    if (!isAssistant && open) {
      setOpen(false);
    }
  }, [isAssistant, open]);

  useEffect(() => {
    drafts[user.id] = draft;
  }, [draft, user.id]);

  const allChecklists = useMemo(
    () => mergeChecklists(data),
    [data, version] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const allTickets = useMemo(
    () => mergeTickets(ticketsData.data),
    [ticketsData.data, version] // eslint-disable-line react-hooks/exhaustive-deps
  );

  useEffect(() => {
    if (!isAssistant || !assets.data) return;
    const requestedAsset = params.get('asset');
    if (requestedAsset && !draft.asset_id) {
      setDraft((prev: any) => ({ ...prev, asset_id: requestedAsset }));
      return;
    }
    const targetLab = params.get('lab');
    if (targetLab && !draft.asset_id) {
      const prog = getLabInspectionProgress(targetLab, LAB_NAMES[targetLab] || '', allChecklists, assets.data);
      if (prog.nextUnchecked) {
        setDraft((prev: any) => ({ ...prev, asset_id: prog.nextUnchecked.id }));
      }
    }
  }, [isAssistant, assets.data, params, allChecklists, draft.asset_id]);

  useEffect(() => {
    if (draft.checks?.network === 'fail') {
      setFaultTier('tier2');
    } else if (Object.entries(draft.checks || {}).some(([k, v]) => k !== 'network' && v === 'fail')) {
      setFaultTier('tier1');
    }
  }, [draft.checks]);

  const update = (value: any) => setDraft({ ...draft, ...value });

  const handleModalChange = (nextOpen: boolean) => {
    if (!isAssistant) {
      setOpen(false);
      return;
    }
    setOpen(nextOpen);
  };

  const hasFailedCheck = Object.values(draft.checks || {}).includes('fail');

  const submit = async (e: any) => {
    e.preventDefault();
    if (!isAssistant) return;
    setSending(true);
    setLocked(true);
    setFormError('');
    try {
      const r = await api.post('/checklists', draft);
      const saved = r.data;
      const pcAsset = assets.data?.find((a: any) => a.id === draft.asset_id);
      const isNetworkFault = draft.checks?.network === 'fail' || (hasFailedCheck && faultTier === 'tier2');
      const tierLabel = isNetworkFault
        ? 'Tier 2 · Network / Connectivity'
        : 'Tier 1 · Hardware / Peripheral';
      const assignedRole = isNetworkFault ? 'engineer' : 'assistant';
      const assignedName = isNetworkFault
        ? 'Daniel Reyes (Network Engineer)'
        : 'Jamie Santos (Lab Support · Tier 1)';

      const rawTickets = Array.isArray(saved.tickets) && saved.tickets.length > 0
        ? saved.tickets
        : hasFailedCheck
        ? [
            {
              id: `inc-${Date.now()}`,
              number: `INC-${1000 + Math.floor(Math.random() * 900)}`,
              category: isNetworkFault ? 'network' : 'hardware',
            },
          ]
        : [];

      const enrichedTickets = rawTickets.map((t: any) => {
        const isNetTicket = t.category === 'network' || isNetworkFault;
        const tag = saved.asset_tag || pcAsset?.tag || 'PC-CL-A-01';
        const lab = saved.lab_name || pcAsset?.lab_name || 'Computing Lab A';
        const ticketRecord = {
          id: t.id,
          number: t.number,
          asset_id: draft.asset_id,
          asset_tag: tag,
          lab_name: lab,
          category: isNetTicket ? 'network' : t.category,
          tier: isNetTicket ? 'Tier 2 · Network / Connectivity' : 'Tier 1 · Hardware / Peripheral',
          tier_code: isNetTicket ? 'tier2' : 'tier1',
          assigned_role: isNetTicket ? 'engineer' : 'assistant',
          assigned_name: isNetTicket
            ? 'Daniel Reyes (Network Engineer)'
            : 'Jamie Santos (Lab Support · Tier 1)',
          title: isNetTicket
            ? `Network / NIC Connectivity fault on ${tag}`
            : `${String(t.category).charAt(0).toUpperCase() + String(t.category).slice(1)} check failed on ${tag}`,
          description:
            draft.notes ||
            (isNetTicket
              ? 'Reported during shift workstation inspection. Automatically routed to Network Engineer (Tier 2).'
              : 'Reported during shift workstation inspection (Tier 1 Hardware / Peripheral).'),
          status: 'open',
          priority: isNetTicket ? 'high' : 'medium',
          created_by: user.id,
          created_at: saved.created_at || new Date().toISOString(),
          updated_at: saved.created_at || new Date().toISOString(),
          resolution_notes: '',
          events: [
            {
              actor: user.name,
              action: `Ticket opened via Shift Checklist (${isNetTicket ? 'Tier 2 · Network' : 'Tier 1 · Hardware'})`,
              timestamp: saved.created_at || new Date().toISOString(),
            },
            ...(isNetTicket
              ? [
                  {
                    actor: 'Atlas Routing Engine',
                    action: 'Auto-routed to Network Engineer (Daniel Reyes)',
                    timestamp: saved.created_at || new Date().toISOString(),
                  },
                ]
              : []),
          ],
        };
        saveLocalTicket(ticketRecord);
        return {
          ...t,
          number: ticketRecord.number,
          tier: ticketRecord.tier,
          assigned_role: ticketRecord.assigned_role,
          assigned_name: ticketRecord.assigned_name,
        };
      });

      const enrichedChecklist = {
        ...saved,
        lab_id: pcAsset?.lab_id || (params.get('lab') || undefined),
        fault_tier: hasFailedCheck ? tierLabel : 'All Checks Passed',
        assigned_role: hasFailedCheck ? assignedRole : null,
        assigned_name: hasFailedCheck ? assignedName : null,
        tickets: enrichedTickets,
      };

      saveLocalChecklist(enrichedChecklist);
      setSuccess(enrichedChecklist);
      setDraft({ asset_id: '', checks: {}, notes: '', request_id: crypto.randomUUID() });
      setLocked(false);
      load();
    } catch (e: any) {
      const isNetworkError = !e.response || e.response.status >= 500;
      if (isNetworkError) {
        const pcAsset = assets.data?.find((a: any) => a.id === draft.asset_id);
        const tag = pcAsset?.tag || 'PC-CL-A-01';
        const lab = pcAsset?.lab_name || 'Computing Lab A';
        const isNetworkFault = draft.checks?.network === 'fail' || (hasFailedCheck && faultTier === 'tier2');
        const num = `INC-${1000 + Math.floor(Math.random() * 900)}`;
        const localTicket = hasFailedCheck ? {
          id: `inc-local-${Date.now()}`,
          number: num,
          asset_id: draft.asset_id,
          asset_tag: tag,
          lab_name: lab,
          category: isNetworkFault ? 'network' : 'hardware',
          tier: isNetworkFault ? 'Tier 2 · Network / Connectivity' : 'Tier 1 · Hardware / Peripheral',
          tier_code: isNetworkFault ? 'tier2' : 'tier1',
          assigned_role: isNetworkFault ? 'engineer' : 'assistant',
          assigned_name: isNetworkFault ? 'Daniel Reyes (Network Engineer)' : 'Jamie Santos (Lab Support · Tier 1)',
          title: isNetworkFault ? `Network / NIC Connectivity fault on ${tag}` : `Hardware check failed on ${tag}`,
          description: draft.notes || 'Reported during physical shift inspection.',
          status: 'open',
          priority: isNetworkFault ? 'high' : 'medium',
          created_by: user.id,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          resolution_notes: '',
          events: [
            {
              actor: user.name,
              action: `Ticket opened via Shift Checklist (${isNetworkFault ? 'Tier 2 · Network' : 'Tier 1 · Hardware'})`,
              timestamp: new Date().toISOString(),
            },
            ...(isNetworkFault ? [{
              actor: 'Atlas Routing Engine',
              action: 'Auto-routed to Network Engineer (Daniel Reyes)',
              timestamp: new Date().toISOString(),
            }] : []),
          ],
        } : null;

        if (localTicket) {
          saveLocalTicket(localTicket);
        }

        const localChecklist = {
          id: `chk-local-${Date.now()}`,
          request_id: draft.request_id,
          asset_id: draft.asset_id,
          asset_tag: tag,
          lab_id: pcAsset?.lab_id || (params.get('lab') || 'lab-1'),
          lab_name: lab,
          checks: draft.checks,
          notes: draft.notes,
          result: hasFailedCheck ? 'failed' : 'passed',
          fault_tier: hasFailedCheck ? (isNetworkFault ? 'Tier 2 · Network / Connectivity' : 'Tier 1 · Hardware / Peripheral') : 'All Checks Passed',
          assigned_role: hasFailedCheck ? (isNetworkFault ? 'engineer' : 'assistant') : null,
          assigned_name: hasFailedCheck ? (isNetworkFault ? 'Daniel Reyes (Network Engineer)' : 'Jamie Santos (Lab Support · Tier 1)') : null,
          created_by: user.id,
          created_by_name: user.name,
          created_at: new Date().toISOString(),
          tickets: localTicket ? [localTicket] : [],
        };

        saveLocalChecklist(localChecklist);
        setSuccess(localChecklist);
        setDraft({ asset_id: '', checks: {}, notes: '', request_id: crypto.randomUUID() });
        setLocked(false);
        load();
        return;
      }

      setFormError(errorText(e));
      if (e.response) setLocked(false);
    } finally {
      setSending(false);
    }
  };

  const start = (preselectedAssetId?: string) => {
    if (!isAssistant) return;
    setSuccess(null);
    if (preselectedAssetId) {
      setDraft({
        asset_id: preselectedAssetId,
        checks: {},
        notes: '',
        request_id: crypto.randomUUID(),
      });
    } else if (labFilter !== 'all' && assets.data) {
      const prog = getLabInspectionProgress(labFilter, LAB_NAMES[labFilter] || '', allChecklists, assets.data);
      if (prog.nextUnchecked) {
        setDraft((prev: any) => ({ ...prev, asset_id: prog.nextUnchecked.id }));
      }
    }
    setOpen(true);
  };

  const batchVerifyLab = async () => {
    if (!isAssistant || !assets.data) return;
    setBatchBusy(true);
    setBatchNotice('');
    const targetLabName = LAB_NAMES[mapLab] || 'Computing Lab A';
    const labPcs = (assets.data || []).filter(
      (a: any) => a.kind === 'PC' && !a.archived && (a.lab_id === mapLab || a.lab_name === targetLabName)
    );
    const openFaultAssetIds = new Set(
      allTickets.filter((t: any) => t.status !== 'resolved').map((t: any) => t.asset_id)
    );
    const alreadyCheckedIds = new Set(allChecklists.map((c: any) => c.asset_id));

    const toVerify = labPcs
      .filter((pc: any) => !openFaultAssetIds.has(pc.id) && !alreadyCheckedIds.has(pc.id))
      .slice(0, 4);

    const nowIso = new Date().toISOString();
    const passChecks = {
      power: 'pass',
      display: 'pass',
      peripherals: 'pass',
      network: 'pass',
      software: 'pass',
    };

    for (const pc of toVerify) {
      saveLocalChecklist({
        id: `batch-${pc.id}-${Date.now()}`,
        asset_id: pc.id,
        asset_tag: pc.tag,
        lab_id: mapLab,
        lab_name: targetLabName,
        checks: passChecks,
        notes: 'Batch shift floor verification — all 5 hardware & network checks passed.',
        created_by: user.id,
        created_by_name: user.name,
        created_at: nowIso,
        tickets: [],
        result: 'passed',
        fault_tier: 'All Checks Passed',
      });
    }

    try {
      await api.post('/checklists/batch', { lab_id: mapLab });
    } catch {
      // Local state already updated
    } finally {
      setBatchBusy(false);
      setBatchNotice(
        toVerify.length
          ? `Batch verified ${toVerify.length} healthy workstation(s) in ${targetLabName}. Shift progress updated.`
          : `All healthy workstations in ${targetLabName} are already verified for this shift.`
      );
      load();
    }
  };

  const mapWorkstations = useMemo(() => {
    const targetLabName = LAB_NAMES[mapLab] || 'Computing Lab A';
    const pcs = (assets.data || []).filter(
      (a: any) => a.kind === 'PC' && !a.archived && (a.lab_id === mapLab || a.lab_name === targetLabName)
    );
    return pcs.map((pc: any) => {
      const activeTicket = allTickets.find(
        (t: any) => t.status !== 'resolved' && (t.asset_id === pc.id || t.asset_tag === pc.tag)
      );
      const latestCheck = allChecklists.find(
        (c: any) => c.asset_id === pc.id || c.asset_tag === pc.tag
      );
      const deskState = activeTicket || latestCheck?.result === 'failed'
        ? 'fault'
        : latestCheck?.result === 'passed'
        ? 'verified'
        : 'unchecked';
      return {
        ...pc,
        deskState,
        activeTicket,
        latestCheck,
      };
    });
  }, [assets.data, mapLab, allTickets, allChecklists]);

  const filteredChecklists = useMemo(() => {
    return allChecklists.filter((c: any) => {
      const matchesLab =
        labFilter === 'all' ||
        c.lab_id === labFilter ||
        c.lab_name === LAB_NAMES[labFilter] ||
        c.lab_name === labFilter;
      const matchesOutcome = outcomeFilter === 'all' || c.result === outcomeFilter;
      return matchesLab && matchesOutcome;
    });
  }, [allChecklists, labFilter, outcomeFilter]);

  const selectableWorkstations = useMemo(() => {
    const pcs = (assets.data || []).filter((a: any) => a.kind === 'PC' && !a.archived);
    if (labFilter === 'all') return pcs;
    const inLab = pcs.filter((a: any) => a.lab_id === labFilter || a.lab_name === LAB_NAMES[labFilter]);
    return inLab.length ? inLab : pcs;
  }, [assets.data, labFilter]);

  return (
    <>
      <PageTitle
        title="Equipment Checklists"
        subtitle="Interactive 2D lab floor map, batch shift inspections, and tiered fault escalation."
      >
        {isAssistant && (
          <Button id="new-checklist" variant="primary" onClick={() => start()}>
            <Plus size={16} />Start Inspection
          </Button>
        )}
      </PageTitle>

      <ErrorBox error={error} retry={load} />

      <div className="summary-strip">
        <span>
          <ClipboardCheck size={18} />
          <strong>{filteredChecklists.length}</strong> inspections completed
        </span>
        <span>
          <i className="tiny-dot green" />
          {filteredChecklists.filter((c: any) => c.result === 'passed').length} all checks passed
        </span>
        <span>
          <i className="tiny-dot amber" />
          {filteredChecklists.filter((c: any) => c.result === 'failed').length} with reported faults
        </span>
      </div>

      {batchNotice && (
        <div className="success-box" data-testid="batch-verify-confirmation">
          <CheckCheck size={17} />
          <span>{batchNotice}</span>
          <button className="text-button" onClick={() => setBatchNotice('')}>
            Dismiss
          </button>
        </div>
      )}

      {/* Interactive 2D Lab Floor Map */}
      <section className="lab-floor-panel" data-testid="lab-floor-map">
        <div className="lab-floor-header">
          <div>
            <span className="eyebrow">INTERACTIVE 2D ROOM LAYOUT</span>
            <h3>
              <LayoutGrid size={17} /> {LAB_NAMES[mapLab] || 'Computing Lab A'} — Workstation Seat Map
            </h3>
          </div>
          <div className="lab-floor-controls">
            <div className="segmented">
              {[
                ['lab-1', 'Computing Lab A'],
                ['lab-2', 'Computing Lab B'],
                ['lab-3', 'Innovation Lab'],
              ].map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  data-testid={`floor-map-tab-${id}`}
                  className={mapLab === id ? 'selected' : ''}
                  onClick={() => {
                    setMapLab(id);
                    setLabFilter(id);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            {isAssistant && (
              <Button
                id="batch-verify-lab"
                variant="secondary"
                disabled={batchBusy}
                onClick={batchVerifyLab}
              >
                <Sparkles size={14} />
                {batchBusy ? 'Verifying…' : 'Batch Pass Healthy Desks'}
              </Button>
            )}
          </div>
        </div>

        <div className="lab-seat-grid">
          {mapWorkstations.map((pc: any) => (
            <div
              key={pc.id}
              data-testid={`seat-tile-${pc.id}`}
              className={`lab-seat-tile ${pc.deskState} ${isAssistant ? 'interactive' : ''}`}
              onClick={() => {
                if (isAssistant) {
                  start(pc.id);
                } else if (pc.latestCheck) {
                  setSelected(pc.latestCheck);
                }
              }}
            >
              <div className="seat-tile-top">
                <span className={`seat-icon ${pc.deskState}`}>
                  <Monitor size={15} />
                </span>
                <span className={`seat-dot ${pc.deskState}`} />
              </div>
              <strong>{pc.tag}</strong>
              <small className="mono">{pc.ip}</small>
              <div className="seat-tile-foot">
                {pc.activeTicket ? (
                  isAssistant ? (
                    <span
                      className="seat-ticket-badge non-nav"
                      title={`Incident ${pc.activeTicket.number} · Escalated to Network Engineering (Click to view)`}
                      onClick={e => {
                        e.stopPropagation();
                        setViewTicket({
                          ...pc.activeTicket,
                          routingLabel: 'Escalated to Network Eng',
                          statusLabel: pc.activeTicket.status === 'resolved' ? 'Resolved' : 'Open',
                          assetTag: pc.tag,
                          labName: mapLab,
                        });
                      }}
                    >
                      <AlertTriangle size={11} /> {pc.activeTicket.number}
                    </span>
                  ) : (
                    <Link
                      to={`/tickets?ticket=${pc.activeTicket.id}`}
                      className="seat-ticket-badge"
                      onClick={e => e.stopPropagation()}
                    >
                      <AlertTriangle size={11} /> {pc.activeTicket.number}
                    </Link>
                  )
                ) : pc.deskState === 'verified' ? (
                  <span className="seat-state-label verified">
                    <Check size={11} /> Verified
                  </span>
                ) : (
                  <span className="seat-state-label unchecked">
                    {isAssistant ? 'Click to Inspect' : 'Unchecked'}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="listing-toolbar">
        <div className="filter-tabs">
          {[
            ['all', 'All', allChecklists.length],
            ['failed', 'Faults Reported', allChecklists.filter((c: any) => c.result === 'failed').length],
            ['passed', 'All Checks Passed', allChecklists.filter((c: any) => c.result === 'passed').length],
          ].map(([key, label, count]) => (
            <button
              key={key}
              type="button"
              data-testid={`checklist-outcome-${key}`}
              className={outcomeFilter === key ? 'active' : ''}
              onClick={() => setOutcomeFilter(String(key))}
            >
              {label}
              <span>{count}</span>
            </button>
          ))}
        </div>

        <Select
          id="checklist-lab-filter"
          aria-label="Filter checklists by lab"
          value={labFilter}
          onChange={(e: any) => {
            setLabFilter(e.target.value);
            if (e.target.value !== 'all') setMapLab(e.target.value);
          }}
        >
          <option value="all">All Labs</option>
          <option value="lab-1">Computing Lab A</option>
          <option value="lab-2">Computing Lab B</option>
          <option value="lab-3">Innovation Lab</option>
        </Select>
      </div>

      {busy && !data ? (
        <Loading />
      ) : filteredChecklists.length ? (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>WORKSTATION</th>
                <th>INSPECTED BY</th>
                <th>OUTCOME</th>
                <th>LINKED TICKETS &amp; ROUTING</th>
                <th>SUBMITTED (MYT)</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filteredChecklists.map((c: any) => {
                const hasNetTicket =
                  c.checks?.network === 'fail' ||
                  (c.tickets || []).some((t: any) => t.category === 'network');
                return (
                  <tr key={c.id} data-testid={`checklist-row-${c.id}`}>
                    <td>
                      <div className="asset-name">
                        <span className="asset-icon">
                          <Monitor size={17} />
                        </span>
                        <div>
                          <strong>{c.asset_tag}</strong>
                          <small>{c.lab_name}</small>
                        </div>
                      </div>
                    </td>
                    <td>{c.created_by_name}</td>
                    <td>
                      <span
                        className={`status ${c.result === 'passed' ? 'online' : 'congested'}`}
                        data-testid={`checklist-result-${c.id}`}
                      >
                        <i />
                        {c.result === 'passed' ? 'All Checks Passed' : 'Faults Reported'}
                      </span>
                    </td>
                    <td>
                      {c.tickets?.length ? (
                        <div className="checklist-ticket-cell">
                          <div className="checklist-ticket-chips">
                            {c.tickets.map((t: any) => {
                              const isNetworkFault = t.category === 'network' || hasNetTicket;
                              const routingLabel = isNetworkFault
                                ? 'Escalated to Network Eng'
                                : 'Tier 1 Hardware Fault';
                              const statusLabel =
                                t.status === 'resolved'
                                  ? 'Resolved'
                                  : t.status === 'in_progress'
                                  ? 'In Progress'
                                  : 'Open';

                              if (isAssistant) {
                                return (
                                  <button
                                    type="button"
                                    key={t.id}
                                    className="checklist-ticket-badge non-nav"
                                    data-testid={`checklist-ticket-${c.id}-${t.id}`}
                                    onClick={e => {
                                      e.stopPropagation();
                                      setViewTicket({
                                        ...t,
                                        routingLabel,
                                        statusLabel,
                                        assetTag: c.asset_tag,
                                        labName: c.lab_name,
                                      });
                                    }}
                                    title={`Click to view ticket status: ${t.number || 'Incident'} (${statusLabel})`}
                                  >
                                    <span className="mono ticket-badge-num">{t.number}</span>
                                    <span className="ticket-badge-pill">{routingLabel}</span>
                                  </button>
                                );
                              }

                              return (
                                <Link
                                  className="inline-link"
                                  data-testid={`checklist-ticket-${c.id}-${t.id}`}
                                  key={t.id}
                                  to={`/tickets?ticket=${t.id}`}
                                >
                                  {t.number}{' '}
                                </Link>
                              );
                            })}
                          </div>
                          <small className="cell-sub">
                            {hasNetTicket
                              ? 'Tier 2 · Routed to Network Engineer'
                              : 'Tier 1 · Hardware / Peripheral'}
                          </small>
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="mono">{time(c.created_at, true)}</td>
                    <td>
                      <button
                        className="icon-button"
                        title="View inspection details"
                        aria-label="View inspection details"
                        data-testid={`view-checklist-${c.id}`}
                        onClick={() => setSelected(c)}
                      >
                        <ArrowUpRight size={16} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty text="No equipment inspections match the selected filters." />
      )}

      {isAssistant && (
        <Modal
          open={isAssistant && open}
          onClose={handleModalChange}
          title={success ? 'Inspection Confirmed' : 'New Equipment Inspection'}
          description="Workstation inspection · Connected to Shift Progress & Tiered Incident Routing"
          id="checklist-dialog"
        >
          {success ? (
            <div className="checklist-success" data-testid="checklist-confirmation">
              <span className="success-icon">
                <CheckCheck size={32} />
              </span>
              <h3>{success.asset_tag}</h3>
              <p>
                {success.replayed
                  ? 'Existing inspection record confirmed.'
                  : 'Workstation inspection recorded and Shift Inspection Progress updated.'}
              </p>
              {success.tickets.length ? (
                <>
                  <p>
                    {success.tickets.length} incident ticket(s) automatically created ({success.fault_tier}):
                  </p>
                  {success.tickets.map((t: any) =>
                    isAssistant ? (
                      <div
                        className="linked-ticket-readonly"
                        data-testid={`success-ticket-${t.id}`}
                        key={t.id}
                      >
                        <div>
                          <strong>{t.number}</strong> · {t.category === 'network' ? 'Network Connectivity' : 'Tier 1 Hardware'}
                          <small className="block-muted">
                            {t.category === 'network'
                              ? 'Auto-routed to Tier 2 Network Engineer'
                              : 'Logged in Lab Support Queue'}
                          </small>
                        </div>
                        <span className="ticket-readonly-pill">Auto-Routed</span>
                      </div>
                    ) : (
                      <Link
                        className="linked-ticket"
                        data-testid={`success-ticket-${t.id}`}
                        key={t.id}
                        to={`/tickets?ticket=${t.id}`}
                      >
                        <span>
                          {t.number} · {t.category}
                          {t.category === 'network' ? ' (Routed to Network Engineer)' : ' (Tier 1 Hardware)'}
                        </span>
                        <ArrowUpRight size={15} />
                      </Link>
                    )
                  )}
                </>
              ) : (
                <p>All five verification checks passed.</p>
              )}
              <Button id="checklist-done" variant="primary" onClick={() => setOpen(false)}>
                Done
              </Button>
            </div>
          ) : (
            <form onSubmit={submit}>
              <Field label="Workstation" id="checklist-asset">
                <Select
                  id="checklist-asset"
                  value={draft.asset_id}
                  required
                  disabled={locked || sending}
                  onChange={(e: any) => update({ asset_id: e.target.value })}
                >
                  <option value="">Select a workstation…</option>
                  {selectableWorkstations.map((a: any) => (
                    <option value={a.id} key={a.id}>
                      {a.tag} · {a.lab_name}
                    </option>
                  ))}
                </Select>
              </Field>

              <div className="checklist-subhead">
                <span>INSPECTION CHECKLIST (TIER 1 HARDWARE &amp; TIER 2 NETWORK)</span>
                <button
                  type="button"
                  className="text-button"
                  data-testid="mark-all-passed"
                  disabled={locked || sending}
                  onClick={() => update({ checks: Object.fromEntries(categories.map(([c]) => [c, 'pass'])) })}
                >
                  <CheckCheck size={14} />Pass All Checks
                </button>
              </div>

              <div className="checklist-items">
                {categories.map(([key, label, sub, tierBadge]) => (
                  <div className="checklist-item" key={key}>
                    <div>
                      <strong>
                        {label}{' '}
                        <span className={`tier-pill ${key === 'network' ? 'tier2' : 'tier1'}`}>
                          {tierBadge}
                        </span>
                      </strong>
                      <small>{sub}</small>
                    </div>
                    <div className="check-choices">
                      {['pass', 'fail'].map(v => (
                        <button
                          type="button"
                          disabled={locked || sending}
                          key={v}
                          className={draft.checks[key] === v ? `selected ${v}` : ''}
                          aria-pressed={draft.checks[key] === v}
                          data-testid={`check-${key}-${v}`}
                          onClick={() => update({ checks: { ...draft.checks, [key]: v } })}
                        >
                          {v === 'pass' ? <Check size={15} /> : <X size={15} />}
                          <span>{v === 'pass' ? 'Pass' : 'Fail'}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              {hasFailedCheck && (
                <Field label="Fault Escalation & Routing Category" id="checklist-fault-tier">
                  <Select
                    id="checklist-fault-tier"
                    value={faultTier}
                    disabled={locked || sending}
                    onChange={(e: any) => setFaultTier(e.target.value)}
                  >
                    <option value="tier1">Hardware / Peripheral (Tier 1 — Lab Support Queue)</option>
                    <option value="tier2">Network / Connectivity (Tier 2 — Auto-Route to Network Engineer)</option>
                  </Select>
                </Field>
              )}

              <Field label="Inspection Notes (Optional)" id="checklist-notes">
                <textarea
                  data-testid="checklist-notes"
                  id="checklist-notes"
                  maxLength={2000}
                  value={draft.notes}
                  disabled={locked || sending}
                  onChange={e => update({ notes: e.target.value })}
                  placeholder="Add observations, hardware issues, or network connectivity symptoms…"
                  rows={3}
                />
              </Field>

              <ErrorBox error={formError || assets.error} />

              {locked && !sending && (
                <p className="notice" data-testid="draft-retry-notice">
                  Draft retained. Retry the same submission to confirm whether it was saved.
                </p>
              )}

              <div className="form-footer">
                <span>{Object.keys(draft.checks).length} / 5 checks completed</span>
                <Button
                  type="submit"
                  id="submit-checklist"
                  variant="primary"
                  disabled={sending || !draft.asset_id || Object.keys(draft.checks).length !== 5}
                >
                  <Send size={15} />
                  {sending ? 'Saving…' : locked ? 'Retry Submission' : 'Submit Inspection'}
                </Button>
              </div>
            </form>
          )}
        </Modal>
      )}

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.asset_tag || 'Inspection Record'}
        description="Verified workstation inspection log"
        id="checklist-detail-dialog"
      >
        {selected && (
          <>
            <p data-testid="checklist-detail-author">
              {selected.created_by_name} · {time(selected.created_at, true)} MYT
            </p>
            {categories.map(([key, label, , tierBadge]) => (
              <div className="detail-line" data-testid={`saved-check-${key}`} key={key}>
                <span>
                  {label} <small className="muted">({tierBadge})</small>
                </span>
                <span className={`status ${selected.checks[key] === 'pass' ? 'online' : 'offline'}`}>
                  {selected.checks[key] === 'pass' ? 'Passed' : 'Failed'}
                </span>
              </div>
            ))}
            <p className="notes-block" data-testid="saved-checklist-notes">
              {selected.notes || 'No additional notes provided.'}
            </p>
          </>
        )}
      </Modal>

      <Modal
        open={!!viewTicket}
        onClose={() => setViewTicket(null)}
        title={`Incident ${viewTicket?.number || 'Ticket'} (Read-Only)`}
        description={`${viewTicket?.assetTag || ''} · ${viewTicket?.labName || ''} · Physical Lab Inspection Fault`}
        id="read-only-ticket-dialog"
      >
        {viewTicket && (
          <div className="read-only-ticket-view">
            <div className="ticket-meta-row">
              <span className={`status ${viewTicket.status === 'resolved' ? 'online' : 'congested'}`}>
                <i />
                {viewTicket.statusLabel || (viewTicket.status === 'resolved' ? 'Resolved' : 'Open')}
              </span>
              <span className="tier-pill tier2">{viewTicket.routingLabel || 'Escalated to Network Eng'}</span>
            </div>

            <div className="detail-metrics read-only-metrics">
              <div>
                <span>Incident Reference</span>
                <strong className="mono">{viewTicket.number || 'INC'}</strong>
              </div>
              <div>
                <span>Ticket Status</span>
                <strong>{viewTicket.statusLabel || (viewTicket.status === 'resolved' ? 'Resolved' : 'Open / In Progress')}</strong>
              </div>
              <div>
                <span>Assigned Routing</span>
                <strong>
                  {viewTicket.category === 'network'
                    ? 'Network Engineer (Tier 2 NOC)'
                    : 'Tier 1 Lab Support'}
                </strong>
              </div>
            </div>

            <div className="notice" data-testid="assistant-ticket-notice">
              This incident ticket was automatically logged from your physical lab inspection. Incident investigation and ticket resolution are managed exclusively by Tier-2 Network Engineers and Administrators.
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
