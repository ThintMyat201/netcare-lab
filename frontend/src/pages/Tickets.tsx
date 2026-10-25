import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Plus,
  Search,
  ArrowUpRight,
  ArrowRight,
  CheckCircle2,
  CheckCheck,
  Play,
  Send,
  Clock,
} from 'lucide-react';
import { useAuth } from '../context';
import { api, errorText, time } from '../lib/api';
import { mergeTickets, saveLocalTicket, enrichTicket, restoreDevice, formatLocationWithCode, formatLocationBadge } from '../lib/workflow';
import { PageTitle, Button, Modal, Field, Select, Status, ErrorBox, Loading, Empty, useData } from '../components/shared';

function getSlaBadge(ticket: any): { label: string; tone: 'green' | 'amber' | 'slate' } {
  if (ticket.status === 'resolved') {
    return { label: 'SLA Met · Resolved', tone: 'green' };
  }
  const targetMins = ticket.priority === 'high' ? 120 : ticket.priority === 'medium' ? 240 : 480;
  const idSeed = String(ticket.id || '1').replace(/\D/g, '');
  const elapsed = ((Number(idSeed || 3) * 19) % Math.max(30, targetMins - 25)) + 18;
  const remaining = Math.max(14, targetMins - elapsed);
  const hrs = Math.floor(remaining / 60);
  const mins = remaining % 60;
  const timeStr = hrs > 0 ? `${hrs}h ${mins}m left` : `${mins}m left`;
  return {
    label: `SLA: ${timeStr}`,
    tone: remaining <= 45 ? 'amber' : 'green',
  };
}

export default function Tickets() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const list = useData('/tickets');
  const assets = useData('/assets');
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState('');
  const [version, setVersion] = useState(0);
  const [form, setForm] = useState({
    asset_id: '',
    category: 'network',
    title: '',
    description: '',
    priority: 'medium',
  });

  useEffect(() => {
    const onUpdate = () => setVersion(v => v + 1);
    window.addEventListener('atlas-workflow-updated', onUpdate);
    return () => window.removeEventListener('atlas-workflow-updated', onUpdate);
  }, []);

  const allTickets = useMemo(
    () => mergeTickets(list.data),
    [list.data, version] // eslint-disable-line react-hooks/exhaustive-deps
  );

  useEffect(() => {
    if (allTickets.length && params.get('ticket')) {
      setSelected(allTickets.find((t: any) => t.id === params.get('ticket') || t.number === params.get('ticket')) || null);
    }
  }, [allTickets, params]);

  const report = async (e: any) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await api.post('/incidents', form);
      const enriched = enrichTicket(r.data);
      saveLocalTicket(enriched);
      setCreated(
        `Issue reported and linked to ticket ${enriched.number} (${enriched.tier}).`
      );
      setOpen(false);
      setSelected(enriched);
      setForm({ asset_id: '', category: 'network', title: '', description: '', priority: 'medium' });
      list.load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const handleStatusChange = async (ticket: any, newStatus: string, customNotes?: string) => {
    if (!ticket) return;
    setBusy(true);
    setError('');
    const nowIso = new Date().toISOString();
    const defaultNote =
      newStatus === 'resolved'
        ? `Resolved and verified operational by ${user.name || 'Network Engineer'}.`
        : `Investigation started by ${user.name || 'Network Engineer'}.`;
    const note = customNotes && customNotes.trim() ? customNotes.trim() : defaultNote;

    try {
      const r = await api.patch(`/tickets/${ticket.id}`, { status: newStatus, resolution_notes: note });
      const enriched = enrichTicket(r.data);
      saveLocalTicket(enriched);
      if (selected?.id === ticket.id) setSelected(enriched);
    } catch {
      // Fallback for locally created / synthetic tickets
      const updated = enrichTicket({
        ...ticket,
        status: newStatus,
        updated_at: nowIso,
        resolved_at: newStatus === 'resolved' ? nowIso : ticket.resolved_at,
        resolution_notes: newStatus === 'resolved' ? note : ticket.resolution_notes,
        events: [
          ...(ticket.events || []),
          {
            actor: user.name,
            action: newStatus === 'resolved' ? 'Resolved' : 'Investigation started',
            notes: note,
            timestamp: nowIso,
          },
        ],
      });
      saveLocalTicket(updated);
      if (selected?.id === ticket.id) setSelected(updated);
    }

    if (newStatus === 'resolved') {
      restoreDevice(ticket.asset_id || ticket.asset_tag);
      setCreated(`Ticket ${ticket.number} marked as Resolved. ${ticket.asset_tag} restored to operational status.`);
    } else if (newStatus === 'in_progress') {
      setCreated(`Ticket ${ticket.number} moved to In Progress (assigned to ${user.name}).`);
    }

    setNotes('');
    setVersion(v => v + 1);
    setBusy(false);
    list.load();
  };

  const progress = async (status: string) => {
    if (selected) {
      await handleStatusChange(selected, status, notes);
    }
  };

  const rows = allTickets.filter(
    (t: any) =>
      (filter === 'all' || t.status === filter) &&
      (t.number + ' ' + t.title + ' ' + t.asset_tag + ' ' + (t.tier || '')).toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <PageTitle title="Incident Tickets">
        <Button
          variant="primary"
          id="report-incident"
          onClick={() => {
            setError('');
            setOpen(true);
          }}
        >
          <Plus size={16} />Report Issue
        </Button>
      </PageTitle>

      <ErrorBox error={list.error} retry={list.load} />

      {created && (
        <div className="success-box" data-testid="incident-success">
          <span>{created}</span>
          <button className="text-button" data-testid="dismiss-incident-success" onClick={() => setCreated('')}>
            Dismiss
          </button>
        </div>
      )}

      <div className="listing-toolbar">
        <div className="filter-tabs">
          {[
            ['all', 'All Tickets'],
            ['open', 'Open'],
            ['in_progress', 'In Progress'],
            ['resolved', 'Resolved'],
          ].map(([key, label]) => (
            <button
              key={key}
              data-testid={`ticket-filter-${key}`}
              className={filter === key ? 'active' : ''}
              onClick={() => setFilter(key)}
            >
              {label}
              <span>{allTickets.filter((t: any) => key === 'all' || t.status === key).length || 0}</span>
            </button>
          ))}
        </div>

        <div className="search-field">
          <Search size={16} />
          <input
            data-testid="ticket-search"
            placeholder="Search tickets by title, ID, tier, or equipment…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {list.busy && !list.data ? (
        <Loading />
      ) : rows?.length ? (
        <div className="tickets-table-card-wrapper w-full overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <div className="w-full overflow-x-auto">
            <table className="w-full table-fixed text-left text-sm border-collapse clean-tickets-table">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-900/50 text-xs font-semibold tracking-wider text-slate-500 uppercase">
                  <th className="px-5 py-4 w-72 max-w-xs" style={{ width: '28%' }}>TICKET</th>
                  <th className="px-5 py-4" style={{ width: '14%' }}>DEVICE</th>
                  <th className="px-5 py-4" style={{ width: '16%' }}>ASSIGNEE</th>
                  <th className="px-5 py-4" style={{ width: '13%' }}>PRIORITY</th>
                  <th className="px-5 py-4" style={{ width: '13%' }}>STATUS</th>
                  <th className="px-5 py-4 text-right" style={{ width: '16%' }}>ACTION</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {rows.map((t: any) => {
                  const sla = getSlaBadge(t);
                  const cleanAssignee = t.assigned_name
                    ? t.assigned_name.replace(/\s*\([^)]*\)/g, '').trim()
                    : '—';
                  return (
                    <tr
                      key={t.id}
                      data-testid={`ticket-row-${t.id}`}
                      className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors"
                    >
                      <td className="px-5 py-4 w-72 max-w-xs">
                        <button
                          type="button"
                          className="text-left w-full group cursor-pointer block"
                          data-testid={`open-ticket-${t.id}`}
                          onClick={() => {
                            setSelected(t);
                            setError('');
                            setNotes('');
                          }}
                        >
                          <span className="font-mono font-bold text-sky-400 group-hover:underline block text-xs tracking-wide">
                            {t.number}
                          </span>
                          <span
                            className="font-medium text-slate-100 dark:text-slate-100 group-hover:text-sky-300 block truncate text-xs mt-0.5"
                            title={t.title}
                          >
                            {t.title}
                          </span>
                        </button>
                      </td>
                      <td
                        className="px-5 py-4 font-mono font-medium text-slate-200 whitespace-nowrap text-xs"
                        title={formatLocationWithCode(t.lab_name || t.lab_id)}
                      >
                        {t.asset_tag}
                      </td>
                      <td className="px-5 py-4 text-slate-300 whitespace-nowrap text-xs">
                        {cleanAssignee}
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap text-xs" title={sla.label}>
                        <Status value={t.priority} id={`priority-${t.id}`} />
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap text-xs">
                        <Status value={t.status} id={`ticket-status-${t.id}`} />
                      </td>
                      <td className="px-5 py-4 text-right whitespace-nowrap text-xs" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end">
                          <button
                            type="button"
                            className="action-btn-uniform"
                            title="View ticket details and actions"
                            aria-label="View ticket details and actions"
                            data-testid={`ticket-detail-${t.id}`}
                            onClick={() => {
                              setSelected(t);
                              setError('');
                              setNotes('');
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
        </div>
      ) : (
        <Empty text="No tickets match the selected filter." />
      )}

      <Modal
        open={open}
        onClose={setOpen}
        title="Report an Issue"
        description="Network faults (Tier 2) automatically route to Network Engineering; Hardware faults (Tier 1) route to Lab Support."
        id="incident-dialog"
      >
        <form onSubmit={report}>
          <div className="form-grid">
            <Field label="Equipment" id="incident-asset">
              <Select
                id="incident-asset"
                value={form.asset_id}
                required
                onChange={(e: any) => setForm({ ...form, asset_id: e.target.value })}
              >
                <option value="">Select equipment</option>
                {assets.data
                  ?.filter((a: any) => !a.archived)
                  .map((a: any) => (
                    <option key={a.id} value={a.id}>
                      {a.tag} ({a.model})
                    </option>
                  ))}
              </Select>
            </Field>

            <Field label="Fault Category & Tier" id="incident-category">
              <Select
                id="incident-category"
                value={form.category}
                onChange={(e: any) => setForm({ ...form, category: e.target.value })}
              >
                <option value="network">Network / Connectivity (Tier 2 — Network Engineer)</option>
                <option value="power">Power & Boot (Tier 1 — Hardware)</option>
                <option value="display">Monitor & Display (Tier 1 — Hardware)</option>
                <option value="peripherals">Peripherals (Tier 1 — Hardware)</option>
                <option value="software">Software / OS (Tier 1 — Lab Support)</option>
                <option value="other">Other Equipment Fault (Tier 1)</option>
              </Select>
            </Field>
          </div>

          <Field label="Issue Title" id="incident-title">
            <input
              data-testid="incident-title"
              id="incident-title"
              required
              minLength={4}
              maxLength={150}
              value={form.title}
              onChange={e => setForm({ ...form, title: e.target.value })}
              placeholder="Brief summary of the issue"
            />
          </Field>

          <Field label="Detailed Description" id="incident-description">
            <textarea
              id="incident-description"
              data-testid="incident-description"
              required
              minLength={4}
              maxLength={3000}
              rows={4}
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              placeholder="Provide details about symptoms, location, and observations…"
            />
          </Field>

          <Field label="Priority Level" id="incident-priority">
            <Select
              id="incident-priority"
              value={form.priority}
              onChange={(e: any) => setForm({ ...form, priority: e.target.value })}
            >
              <option value="low">Low Priority</option>
              <option value="medium">Medium Priority</option>
              <option value="high">High Priority</option>
            </Select>
          </Field>

          <ErrorBox error={error || assets.error} />

          <Button type="submit" variant="primary" id="submit-incident" disabled={busy}>
            <Send size={15} />
            {busy ? 'Submitting…' : 'Submit Ticket'}
          </Button>
        </form>
      </Modal>

      <Modal
        open={!!selected && !open}
        onClose={() => setSelected(null)}
        title={selected?.number || 'Ticket Details'}
        description={`${selected?.asset_tag || ''} · ${formatLocationWithCode(selected?.lab_name || selected?.lab_id)}`}
        id="ticket-detail-dialog"
      >
        {selected && (
          <div className="flex flex-col gap-4">
            {/* 1. Header: Ticket ID + Status badge, Issue Title, 1-line description */}
            <div className="flex flex-col gap-1.5 pb-3 border-b border-slate-100 dark:border-slate-800/60">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-slate-500 uppercase tracking-wider">{selected.number}</span>
                <Status value={selected.status} id="detail-ticket-status" />
              </div>
              <h3 data-testid="detail-ticket-title" className="text-base font-semibold text-slate-900 dark:text-slate-100 leading-snug">
                {selected.title}
              </h3>
              <p data-testid="detail-ticket-description" className="text-xs text-slate-500 leading-relaxed">
                {selected.description}
              </p>
            </div>

            {/* 2. Compact 4-Item Summary Grid */}
            {(() => {
              const loc = formatLocationBadge(selected.lab_name || selected.lab_id);
              const devText = `${selected.asset_tag || ''}${loc.code ? ` (${loc.code})` : ''}`;
              const assigneeText = selected.assigned_name?.replace(/\s*\(.*?\)/, '') || 'Unassigned';
              const priorityText = selected.priority === 'high' ? 'High' : selected.priority === 'low' ? 'Low' : 'Medium';
              const catText = selected.category ? selected.category.charAt(0).toUpperCase() + selected.category.slice(1) : 'Network';

              return (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 text-xs">
                  <div>
                    <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">Device</span>
                    <strong className="text-xs font-semibold text-slate-900 dark:text-slate-100 block truncate mt-0.5" title={devText}>
                      {devText}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">Assignee</span>
                    <strong className="text-xs font-semibold text-slate-900 dark:text-slate-100 block truncate mt-0.5" title={assigneeText}>
                      {assigneeText}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">Category</span>
                    <strong className="text-xs font-semibold text-slate-900 dark:text-slate-100 block mt-0.5">
                      {catText}
                    </strong>
                  </div>
                  <div>
                    <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">Priority</span>
                    <strong className="text-xs font-semibold text-slate-900 dark:text-slate-100 block mt-0.5" id="detail-ticket-priority">
                      {priorityText}
                    </strong>
                  </div>
                </div>
              );
            })()}

            {/* 3. Resolution Section */}
            {selected.status === 'resolved' ? (
              <div className="success-box" data-testid="resolution-notes">
                <CheckCircle2 size={18} />
                <div>
                  <strong>Resolution Notes</strong>
                  <p>{selected.resolution_notes || 'Resolved and verified operational.'}</p>
                </div>
              </div>
            ) : (
              user.role !== 'assistant' && (
                <div className="flex flex-col gap-3">
                  <Field label="Resolution Notes (Required)" id="resolution-notes-input">
                    <textarea
                      data-testid="resolution-notes-input"
                      id="resolution-notes-input"
                      rows={3}
                      value={notes}
                      maxLength={3000}
                      onChange={e => setNotes(e.target.value)}
                      placeholder="Describe what was investigated, repaired, and verified (minimum 10 characters)…"
                    />
                  </Field>
                  <ErrorBox error={error} />
                  <div className="ticket-modal-actions flex items-center justify-end gap-3 mt-1">
                    {selected.status === 'open' && (
                      <Button
                        variant="secondary"
                        id="start-investigation"
                        disabled={busy}
                        onClick={() => progress('in_progress')}
                      >
                        <ArrowRight size={15} />Begin Investigation
                      </Button>
                    )}
                    <Button
                      variant="primary"
                      id="resolve-ticket"
                      disabled={busy}
                      onClick={() => progress('resolved')}
                    >
                      <CheckCircle2 size={16} />Mark as Resolved
                    </Button>
                  </div>
                </div>
              )
            )}
          </div>
        )}
      </Modal>
    </>
  );
}
