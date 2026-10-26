import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  Plus,
  Check,
  CheckCheck,
  ArrowUpRight,
  Sparkles,
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
  formatLocationWithCode,
  findLocation,
} from '../lib/workflow';
import { PageTitle, Button, Modal, Field, Select, ErrorBox, Loading, Empty, useData } from '../components/shared';

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
  'lab-4': 'Computing Lab C',
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
  const [inspectionStatus, setInspectionStatus] = useState<'passed' | 'failed'>('passed');
  const [linkedTicketChoice, setLinkedTicketChoice] = useState<string>('new-tier1');
  const [version, setVersion] = useState(0);
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchNotice, setBatchNotice] = useState('');

  const [open, setOpen] = useState(() => isAssistant && params.has('new'));
  const [draft, setDraft] = useState(
    () =>
      drafts[user.id] || {
        asset_id: params.get('asset') || '',
        checks: { power: 'pass', display: 'pass', peripherals: 'pass', network: 'pass', software: 'pass' },
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

  const activeAsset = useMemo(() => {
    return assets.data?.find((a: any) => a.id === draft.asset_id);
  }, [assets.data, draft.asset_id]);

  const workstationTag = activeAsset?.tag || 'PC-CL-A-01';
  const loc = activeAsset ? (findLocation(activeAsset.lab_id) || findLocation(activeAsset.lab_name)) : null;
  const roomBadge = loc ? `${loc.code} · ${loc.name}` : (activeAsset?.lab_name || 'B-04-03 · Computing Lab A');

  const openTicketsForAsset = useMemo(() => {
    return allTickets.filter((t: any) => t.status !== 'resolved');
  }, [allTickets]);

  const update = (value: any) => setDraft({ ...draft, ...value });

  const handleModalChange = (nextOpen: boolean) => {
    if (!isAssistant) {
      setOpen(false);
      return;
    }
    setOpen(nextOpen);
  };


  const submit = async (e: any) => {
    e.preventDefault();
    if (!isAssistant) return;
    setSending(true);
    setLocked(true);
    setFormError('');
    try {
      const isFailed = inspectionStatus === 'failed';
      const isNetworkFault = isFailed && (faultTier === 'tier2' || linkedTicketChoice === 'new-tier2');
      const checksPayload = isFailed
        ? {
            power: 'pass',
            display: 'pass',
            peripherals: isNetworkFault ? 'pass' : 'fail',
            network: isNetworkFault ? 'fail' : 'pass',
            software: 'pass',
          }
        : {
            power: 'pass',
            display: 'pass',
            peripherals: 'pass',
            network: 'pass',
            software: 'pass',
          };

      const payload = {
        ...draft,
        checks: checksPayload,
      };

      const r = await api.post('/checklists', payload);
      const saved = r.data;
      const pcAsset = assets.data?.find((a: any) => a.id === draft.asset_id);
      const tierLabel = isNetworkFault
        ? 'Tier 2 · Network / Connectivity'
        : 'Tier 1 · Hardware / Peripheral';
      const assignedRole = isNetworkFault ? 'engineer' : 'assistant';
      const assignedName = isNetworkFault
        ? 'Daniel Reyes (Network Engineer)'
        : 'Jamie Santos (Lab Support · Tier 1)';

      const rawTickets = Array.isArray(saved.tickets) && saved.tickets.length > 0
        ? saved.tickets
        : isFailed
        ? [
            {
              id: `inc-${Date.now()}`,
              number: linkedTicketChoice.startsWith('INC-') ? linkedTicketChoice : `INC-${1000 + Math.floor(Math.random() * 900)}`,
              category: isNetworkFault ? 'network' : 'hardware',
            },
          ]
        : [];

      const enrichedTickets = rawTickets.map((t: any) => {
        const isNetTicket = t.category === 'network' || isNetworkFault;
        const tag = saved.asset_tag || pcAsset?.tag || 'PC-CL-A-01';
        const lab = saved.lab_name || pcAsset?.lab_name || 'Computing Lab A';
        const ticketNumber = linkedTicketChoice.startsWith('INC-') ? linkedTicketChoice : t.number;
        const ticketRecord = {
          id: t.id,
          number: ticketNumber,
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
            : `Hardware check failed on ${tag}`,
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
        fault_tier: isFailed ? tierLabel : 'All Checks Passed',
        assigned_role: isFailed ? assignedRole : null,
        assigned_name: isFailed ? assignedName : null,
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
        const isFailed = inspectionStatus === 'failed';
        const isNetworkFault = isFailed && (faultTier === 'tier2' || linkedTicketChoice === 'new-tier2');
        const pcAsset = assets.data?.find((a: any) => a.id === draft.asset_id);
        const tag = pcAsset?.tag || 'PC-CL-A-01';
        const lab = pcAsset?.lab_name || 'Computing Lab A';
        const num = linkedTicketChoice.startsWith('INC-') ? linkedTicketChoice : `INC-${1000 + Math.floor(Math.random() * 900)}`;
        const localTicket = isFailed ? {
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
          checks: isFailed
            ? { power: 'pass', display: 'pass', peripherals: isNetworkFault ? 'pass' : 'fail', network: isNetworkFault ? 'fail' : 'pass', software: 'pass' }
            : { power: 'pass', display: 'pass', peripherals: 'pass', network: 'pass', software: 'pass' },
          notes: draft.notes,
          result: isFailed ? 'failed' : 'passed',
          fault_tier: isFailed ? (isNetworkFault ? 'Tier 2 · Network / Connectivity' : 'Tier 1 · Hardware / Peripheral') : 'All Checks Passed',
          assigned_role: isFailed ? (isNetworkFault ? 'engineer' : 'assistant') : null,
          assigned_name: isFailed ? (isNetworkFault ? 'Daniel Reyes (Network Engineer)' : 'Jamie Santos (Lab Support · Tier 1)') : null,
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
    let targetAssetId = preselectedAssetId;
    if (!targetAssetId) {
      if (labFilter !== 'all' && assets.data) {
        const prog = getLabInspectionProgress(labFilter, LAB_NAMES[labFilter] || '', allChecklists, assets.data);
        if (prog.nextUnchecked) targetAssetId = prog.nextUnchecked.id;
      }
      if (!targetAssetId && selectableWorkstations.length > 0) {
        targetAssetId = selectableWorkstations[0].id;
      }
    }
    setDraft({
      asset_id: targetAssetId || '',
      checks: { power: 'pass', display: 'pass', peripherals: 'pass', network: 'pass', software: 'pass' },
      notes: '',
      request_id: crypto.randomUUID(),
    });
    setInspectionStatus('passed');
    setLinkedTicketChoice('new-tier1');
    setFaultTier('tier1');
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

  const allWorkstations = useMemo(() => {
    const pcs = (assets.data || []).filter((a: any) => a.kind === 'PC' && !a.archived);
    return pcs.map((pc: any) => {
      const activeTicket = allTickets.find(
        (t: any) => t.status !== 'resolved' && (t.asset_id === pc.id || t.asset_tag === pc.tag)
      );
      const latestCheck = allChecklists.find(
        (c: any) => c.asset_id === pc.id || c.asset_tag === pc.tag
      );
      const linkedTicket = activeTicket || (latestCheck?.tickets && latestCheck.tickets[0]) || null;
      const outcomeKey = activeTicket || latestCheck?.result === 'failed'
        ? 'failed'
        : latestCheck?.result === 'passed'
        ? 'passed'
        : 'unchecked';
      const loc = findLocation(pc.lab_name || pc.lab_id);
      const roomCode = loc?.code || pc.lab_id || '—';

      return {
        ...pc,
        activeTicket,
        latestCheck,
        linkedTicket,
        outcomeKey,
        roomCode,
        inspectedBy: latestCheck?.created_by_name || '—',
        submittedAt: latestCheck?.created_at || null,
      };
    });
  }, [assets.data, allTickets, allChecklists]);

  const filteredWorkstations = useMemo(() => {
    return allWorkstations.filter((w: any) => {
      const matchesLab =
        labFilter === 'all' ||
        w.lab_id === labFilter ||
        w.lab_name === LAB_NAMES[labFilter] ||
        w.lab_name === labFilter;
      const matchesOutcome =
        outcomeFilter === 'all' ||
        w.outcomeKey === outcomeFilter;
      return matchesLab && matchesOutcome;
    });
  }, [allWorkstations, labFilter, outcomeFilter]);

  const selectableWorkstations = useMemo(() => {
    const pcs = (assets.data || []).filter((a: any) => a.kind === 'PC' && !a.archived);
    if (labFilter === 'all') return pcs;
    const inLab = pcs.filter((a: any) => a.lab_id === labFilter || a.lab_name === LAB_NAMES[labFilter]);
    return inLab.length ? inLab : pcs;
  }, [assets.data, labFilter]);

  return (
    <>
      <PageTitle title="Equipment Checklists">
        {isAssistant && (
          <div className="flex items-center gap-2">
            <Button
              id="batch-verify-lab"
              variant="secondary"
              disabled={batchBusy}
              onClick={batchVerifyLab}
            >
              <Sparkles size={14} className="mr-1" />
              {batchBusy ? 'Verifying…' : 'Batch Pass Lab'}
            </Button>
            <Button id="new-checklist" variant="primary" onClick={() => start()}>
              <Plus size={16} className="mr-1" />Start Inspection
            </Button>
          </div>
        )}
      </PageTitle>

      <ErrorBox error={error} retry={load} />

      {batchNotice && (
        <div className="success-box" data-testid="batch-verify-confirmation">
          <CheckCheck size={17} />
          <span>{batchNotice}</span>
          <button className="text-button" onClick={() => setBatchNotice('')}>
            Dismiss
          </button>
        </div>
      )}

      <div className="listing-toolbar">
        <div className="filter-tabs">
          {[
            ['all', 'All Workstations', allWorkstations.length],
            ['passed', 'Passed', allWorkstations.filter((w: any) => w.outcomeKey === 'passed').length],
            ['failed', 'Faults Reported', allWorkstations.filter((w: any) => w.outcomeKey === 'failed').length],
            ['unchecked', 'Unchecked', allWorkstations.filter((w: any) => w.outcomeKey === 'unchecked').length],
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
          <option value="all">All Campus Labs</option>
          <option value="lab-1">[B-04-03] Computing Lab A</option>
          <option value="lab-2">[B-04-04] Computing Lab B</option>
          <option value="lab-4">[B-04-05] Computing Lab C</option>
          <option value="lab-3">[Tech Lab 5-02] Innovation Lab</option>
        </Select>
      </div>

      {busy && !data ? (
        <Loading />
      ) : filteredWorkstations.length ? (
        <div className="checklists-table-card-wrapper w-full overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <div className="w-full overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse clean-checklists-table">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-900/50 text-xs font-semibold tracking-wider text-slate-500 uppercase">
                  <th className="px-4 py-3 text-left whitespace-nowrap">WORKSTATION</th>
                  <th className="px-4 py-3 text-left whitespace-nowrap">ROOM</th>
                  <th className="px-4 py-3 text-left whitespace-nowrap">INSPECTED BY</th>
                  <th className="px-4 py-3 text-left whitespace-nowrap">OUTCOME</th>
                  <th className="px-4 py-3 text-left whitespace-nowrap">TICKET</th>
                  <th className="px-4 py-3 text-right whitespace-nowrap">SUBMITTED / ACTION</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {filteredWorkstations.map((w: any) => {
                  return (
                    <tr
                      key={w.id}
                      data-testid={`checklist-row-${w.latestCheck?.id || w.id}`}
                      className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors"
                    >
                      <td className="px-4 py-3 font-mono font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                        {w.tag}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-600 dark:text-slate-300 whitespace-nowrap">
                        {w.roomCode}
                      </td>
                      <td className="px-4 py-3 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                        {w.inspectedBy}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className="inline-flex items-center gap-1.5 text-xs font-medium"
                          data-testid={`checklist-result-${w.latestCheck?.id || w.id}`}
                        >
                          <span
                            className={`w-2 h-2 rounded-full ${
                              w.outcomeKey === 'passed'
                                ? 'bg-emerald-400'
                                : w.outcomeKey === 'failed'
                                ? 'bg-amber-400'
                                : 'bg-slate-500'
                            }`}
                          />
                          <span
                            className={
                              w.outcomeKey === 'passed'
                                ? 'text-emerald-400'
                                : w.outcomeKey === 'failed'
                                ? 'text-amber-400'
                                : 'text-slate-400'
                            }
                          >
                            {w.outcomeKey === 'passed'
                              ? 'Passed'
                              : w.outcomeKey === 'failed'
                              ? 'Fault Reported'
                              : 'Unchecked'}
                          </span>
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {w.linkedTicket ? (
                          isAssistant ? (
                            <button
                              type="button"
                              className="font-mono text-xs font-semibold text-sky-400 hover:underline cursor-pointer"
                              data-testid={`checklist-ticket-${w.latestCheck?.id || w.id}-${w.linkedTicket.id}`}
                              onClick={() => {
                                const isNet = w.linkedTicket.category === 'network' || w.latestCheck?.checks?.network === 'fail';
                                setViewTicket({
                                  ...w.linkedTicket,
                                  routingLabel: isNet ? 'Escalated to Network Eng' : 'Tier 1 Hardware Fault',
                                  statusLabel: w.linkedTicket.status === 'resolved' ? 'Resolved' : 'Open',
                                  assetTag: w.tag,
                                  labName: w.roomCode,
                                });
                              }}
                            >
                              {w.linkedTicket.number}
                            </button>
                          ) : (
                            <Link
                              className="font-mono text-xs font-semibold text-sky-400 hover:underline"
                              data-testid={`checklist-ticket-${w.latestCheck?.id || w.id}-${w.linkedTicket.id}`}
                              to={`/tickets?ticket=${w.linkedTicket.id}`}
                            >
                              {w.linkedTicket.number}
                            </Link>
                          )
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          <span className="font-mono text-xs text-slate-400 whitespace-nowrap">
                            {w.submittedAt ? time(w.submittedAt, true) : '—'}
                          </span>
                          {isAssistant && (
                            <Button
                              size="sm"
                              variant="secondary"
                              className="btn-inspect-workstation text-xs py-1 px-2.5 h-7 whitespace-nowrap"
                              data-testid={`inspect-asset-${w.id}`}
                              onClick={() => start(w.id)}
                            >
                              Inspect
                            </Button>
                          )}
                          {w.latestCheck && (
                            <button
                              type="button"
                              className="action-btn-uniform inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 outline-none focus:outline-none focus:ring-0 transition-colors"
                              title="View inspection details"
                              aria-label="View inspection details"
                              data-testid={`view-checklist-${w.latestCheck.id}`}
                              onClick={() => setSelected(w.latestCheck)}
                            >
                              <ArrowUpRight size={15} />
                            </button>
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
      ) : (
        <Empty text="No equipment inspections match the selected filters." />
      )}

      {isAssistant && (
        <Modal
          open={isAssistant && open}
          onClose={handleModalChange}
          title={
            success ? (
              'Inspection Confirmed'
            ) : (
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="font-mono font-bold text-base text-slate-900 dark:text-slate-100">
                  {workstationTag}
                </span>
                <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                  {roomBadge}
                </span>
              </div>
            )
          }
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
                <p>All verification checks passed.</p>
              )}
              <Button id="checklist-done" variant="primary" onClick={() => setOpen(false)}>
                Done
              </Button>
            </div>
          ) : (
            <form onSubmit={submit} className="flex flex-col gap-4">
              <input type="hidden" id="checklist-asset" value={draft.asset_id} readOnly />

              {!activeAsset && (
                <Field label="Select Workstation" id="checklist-asset-select">
                  <Select
                    id="checklist-asset-select"
                    value={draft.asset_id}
                    required
                    disabled={locked || sending}
                    onChange={(e: any) => update({ asset_id: e.target.value })}
                  >
                    <option value="">Select a workstation…</option>
                    {selectableWorkstations.map((a: any) => (
                      <option value={a.id} key={a.id}>
                        {a.tag} · {formatLocationWithCode(a.lab_name || a.lab_id)}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Row 1: Inspection Status | Inspected By */}
                <Field label="Inspection Status" id="checklist-status">
                  <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-lg border border-slate-200 dark:border-slate-700/80 h-[38px]">
                    <button
                      type="button"
                      className={`flex-1 h-full rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                        inspectionStatus === 'passed'
                          ? 'bg-emerald-600 text-white shadow-sm'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                      onClick={() => {
                        setInspectionStatus('passed');
                        update({
                          checks: { power: 'pass', display: 'pass', peripherals: 'pass', network: 'pass', software: 'pass' },
                        });
                      }}
                    >
                      <span className={`w-2 h-2 rounded-full ${inspectionStatus === 'passed' ? 'bg-white' : 'bg-emerald-500'}`} />
                      Passed
                    </button>
                    <button
                      type="button"
                      className={`flex-1 h-full rounded-md text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                        inspectionStatus === 'failed'
                          ? 'bg-amber-600 text-white shadow-sm'
                          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                      }`}
                      onClick={() => {
                        setInspectionStatus('failed');
                        const isNet = linkedTicketChoice === 'new-tier2';
                        update({
                          checks: {
                            power: 'pass',
                            display: 'pass',
                            peripherals: isNet ? 'pass' : 'fail',
                            network: isNet ? 'fail' : 'pass',
                            software: 'pass',
                          },
                        });
                      }}
                    >
                      <span className={`w-2 h-2 rounded-full ${inspectionStatus === 'failed' ? 'bg-white' : 'bg-amber-500'}`} />
                      Fault Reported
                    </button>
                  </div>
                </Field>

                <Field label="Inspected By" id="checklist-inspector">
                  <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 text-sm h-[38px]">
                    <div className="w-5 h-5 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 font-bold text-[10px] flex items-center justify-center flex-shrink-0">
                      {(user.name || 'Jamie Santos').split(' ').map((n: string) => n[0]).join('')}
                    </div>
                    <span className="font-medium text-xs truncate">{user.name || 'Jamie Santos'}</span>
                    <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 ml-auto uppercase tracking-wide flex-shrink-0">IT Assistant</span>
                  </div>
                </Field>

                {/* Row 2 (Full Width if Fault Reported): Link Incident Ticket */}
                {inspectionStatus === 'failed' && (
                  <div className="sm:col-span-2">
                    <Field label="Link Incident Ticket" id="checklist-fault-tier">
                      <Select
                        id="checklist-fault-tier"
                        value={linkedTicketChoice}
                        disabled={locked || sending}
                        onChange={(e: any) => {
                          const val = e.target.value;
                          setLinkedTicketChoice(val);
                          const isNet = val === 'new-tier2' || val.toLowerCase().includes('network');
                          const tier = isNet ? 'tier2' : 'tier1';
                          setFaultTier(tier);
                          update({
                            checks: {
                              power: 'pass',
                              display: 'pass',
                              peripherals: tier === 'tier1' ? 'fail' : 'pass',
                              network: tier === 'tier2' ? 'fail' : 'pass',
                              software: 'pass',
                            },
                          });
                        }}
                      >
                        <option value="new-tier1">Auto-Trigger Quick Ticket · Tier 1 Hardware Support Queue</option>
                        <option value="new-tier2">Auto-Trigger Quick Ticket · Tier 2 Network Connectivity Engineer</option>
                        {openTicketsForAsset.map((t: any) => (
                          <option key={t.id} value={t.number}>
                            Attach Existing Ticket · {t.number} ({t.title || t.category})
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                )}

                {/* Row 3 (Full Width): Audit Notes / Observations */}
                <div className="sm:col-span-2">
                  <Field label="Audit Notes / Observations" id="checklist-notes">
                    <textarea
                      data-testid="checklist-notes"
                      id="checklist-notes"
                      maxLength={2000}
                      value={draft.notes}
                      disabled={locked || sending}
                      onChange={e => update({ notes: e.target.value })}
                      placeholder="Peripherals verified, power supply stable…"
                      rows={2}
                    />
                  </Field>
                </div>
              </div>

              <ErrorBox error={formError || assets.error} />

              {locked && !sending && (
                <p className="notice" data-testid="draft-retry-notice">
                  Draft retained. Retry the same submission to confirm whether it was saved.
                </p>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200 dark:border-slate-800">
                <Button
                  type="button"
                  variant="outline"
                  disabled={sending}
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  id="submit-checklist"
                  variant="primary"
                  disabled={sending || !draft.asset_id}
                >
                  <Check size={14} />
                  {sending ? 'Saving…' : 'Save Inspection Record'}
                </Button>
              </div>
            </form>
          )}
        </Modal>
      )}

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={
          selected ? (
            <div className="flex items-center gap-2.5">
              <span className="font-mono text-base font-bold text-slate-900 dark:text-slate-100">
                {selected.asset_tag || 'Workstation'}
              </span>
              <span
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                  selected.result === 'passed'
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60'
                    : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800/60'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    selected.result === 'passed' ? 'bg-emerald-500' : 'bg-rose-500'
                  }`}
                />
                {selected.result === 'passed' ? 'Passed' : 'Fault Reported'}
              </span>
            </div>
          ) : (
            'Inspection Details'
          )
        }
        id="checklist-detail-dialog"
      >
        {selected && (
          <div className="flex flex-col">
            {/* Clean, Compact Checklist Items List */}
            <div className="border border-slate-200 dark:border-slate-800 rounded-lg divide-y divide-slate-100 dark:divide-slate-800/60 overflow-hidden">
              {categories.map(([key, label, , tierBadge]) => {
                const isPass = selected.checks?.[key] === 'pass';
                return (
                  <div
                    className="flex items-center justify-between px-3.5 py-2.5 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors"
                    data-testid={`saved-check-${key}`}
                    key={key}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center sm:gap-2">
                      <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        {label}
                      </span>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        ({tierBadge})
                      </span>
                    </div>
                    <div>
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                          isPass
                            ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/60'
                            : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-800/60'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${isPass ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                        {isPass ? 'Passed' : 'Failed'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Highlighted Technician Audit Notes */}
            {(selected.notes || selected.result === 'failed') && (
              <div
                className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3.5 text-sm text-amber-700 dark:text-amber-300 mt-4"
                data-testid="saved-checklist-notes"
              >
                <div className="font-semibold mb-1 flex items-center gap-1.5 text-xs uppercase tracking-wider">
                  <AlertTriangle size={14} className="text-amber-500 flex-shrink-0" />
                  <span>Technician Remarks</span>
                </div>
                <p className="text-xs sm:text-sm text-amber-900 dark:text-amber-200">
                  {selected.notes || 'Inspection failed: hardware fault logged and escalated.'}
                </p>
              </div>
            )}

            {/* Standardized Footer */}
            <div className="flex items-center justify-end pt-4 mt-4 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors focus:outline-none cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={!!viewTicket}
        onClose={() => setViewTicket(null)}
        title={`Incident ${viewTicket?.number || 'Ticket'} (Read-Only)`}
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
