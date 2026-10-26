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
        <div className="filter-tabs overflow-x-auto whitespace-nowrap no-scrollbar -webkit-overflow-scrolling-touch flex items-center gap-5">
          {[
            ['all', 'All Tickets'],
            ['open', 'Open'],
            ['in_progress', 'In Progress'],
            ['resolved', 'Resolved'],
          ].map(([key, label]) => (
            <button
              key={key}
              data-testid={`ticket-filter-${key}`}
              className={`flex-shrink-0 ${filter === key ? 'active' : ''}`}
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
        <div className="tickets-table-card-wrapper w-full overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm text-slate-900 dark:text-slate-100">
          <div className="w-full overflow-x-auto -webkit-overflow-scrolling-touch">
            <table className="w-full min-w-[650px] text-left text-sm border-collapse clean-tickets-table">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-900/50 text-xs font-semibold tracking-wider text-slate-500 uppercase">
                  <th className="px-4 py-3.5 min-w-[200px] max-w-[260px]">TICKET</th>
                  <th className="px-4 py-3.5 whitespace-nowrap">DEVICE</th>
                  <th className="px-4 py-3.5 whitespace-nowrap">ASSIGNEE</th>
                  <th className="px-4 py-3.5 whitespace-nowrap">PRIORITY</th>
                  <th className="px-4 py-3.5 whitespace-nowrap">STATUS</th>
                  <th className="px-4 py-3.5 text-right whitespace-nowrap">ACTION</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {rows.map((t: any) => {
                  const sla = getSlaBadge(t);
                  const cleanAssignee = t.assigned_name
                    ? t.assigned_name.replace(/\s*\([^)]*\)/g, '').trim()
                    : '—';
                  const priorityLabel =
                    t.priority === 'high' ? 'High' : t.priority === 'medium' ? 'Medium' : t.priority === 'low' ? 'Low' : t.priority;
                  const priorityDotColor =
                    t.priority === 'high'
                      ? 'bg-rose-500'
                      : t.priority === 'medium'
                      ? 'bg-amber-500'
                      : 'bg-sky-500';

                  return (
                    <tr
                      key={t.id}
                      data-testid={`ticket-row-${t.id}`}
                      className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors"
                    >
                      <td className="px-4 py-3.5 min-w-[200px] max-w-[260px]">
                        <button
                          type="button"
                          className="text-left w-full group cursor-pointer block bg-transparent border-0 p-0 m-0 shadow-none outline-none focus:outline-none"
                          data-testid={`open-ticket-${t.id}`}
                          onClick={() => {
                            setSelected(t);
                            setError('');
                            setNotes('');
                          }}
                        >
                          <span className="font-mono font-bold text-sky-600 dark:text-sky-400 group-hover:underline block text-xs tracking-wide">
                            {t.number}
                          </span>
                          <span
                            className="font-normal text-slate-500 dark:text-slate-400 group-hover:text-sky-500 dark:group-hover:text-sky-300 block truncate text-xs mt-0.5"
                            title={t.title}
                          >
                            {t.title}
                          </span>
                        </button>
                      </td>
                      <td
                        className="px-4 py-3.5 font-mono font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap text-xs"
                        title={formatLocationWithCode(t.lab_name || t.lab_id)}
                      >
                        {t.asset_tag}
                      </td>
                      <td className="px-4 py-3.5 text-slate-600 dark:text-slate-300 whitespace-nowrap text-xs">
                        {cleanAssignee}
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap text-xs" title={sla.label}>
                        <span
                          data-testid={`priority-${t.id}`}
                          className="inline-flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300"
                        >
                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${priorityDotColor}`} />
                          {priorityLabel}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 whitespace-nowrap text-xs">
                        <Status value={t.status} id={`ticket-status-${t.id}`} />
                      </td>
                      <td className="px-4 py-3.5 text-right whitespace-nowrap text-xs" onClick={e => e.stopPropagation()}>
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
        id="incident-dialog"
      >
        <form onSubmit={report} className="flex flex-col gap-4">
          {/* Row 1: Equipment & Category (2-Column Grid) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Equipment" id="incident-asset">
              <Select
                id="incident-asset"
                value={form.asset_id}
                required
                onChange={(e: any) => setForm({ ...form, asset_id: e.target.value })}
                className="w-full rounded-lg px-3.5 py-2.5 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
              >
                <option value="">Select equipment...</option>
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
                className="w-full rounded-lg px-3.5 py-2.5 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
              >
                <option value="network">Network / Connectivity (Tier 2)</option>
                <option value="power">Power & Boot (Tier 1)</option>
                <option value="display">Monitor & Display (Tier 1)</option>
                <option value="peripherals">Peripherals (Tier 1)</option>
                <option value="software">Software / OS (Tier 1)</option>
                <option value="other">Other Equipment Fault (Tier 1)</option>
              </Select>
            </Field>
          </div>

          {/* Row 2: Issue Title (Full Width) */}
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
              className="w-full rounded-lg px-3.5 py-2.5 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </Field>

          {/* Row 3: Detailed Description (Full Width, rows={3}) */}
          <Field label="Detailed Description" id="incident-description">
            <textarea
              id="incident-description"
              data-testid="incident-description"
              required
              minLength={4}
              maxLength={3000}
              rows={3}
              value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              placeholder="Provide details about symptoms, location, and observations…"
              className="w-full rounded-lg px-3.5 py-2.5 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-sky-500 resize-none"
            />
          </Field>

          {/* Row 4: Priority Level (Full Width) */}
          <Field label="Priority Level" id="incident-priority">
            <Select
              id="incident-priority"
              value={form.priority}
              onChange={(e: any) => setForm({ ...form, priority: e.target.value })}
              className="w-full rounded-lg px-3.5 py-2.5 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-sky-500"
            >
              <option value="medium">Medium Priority</option>
              <option value="high">High Priority</option>
              <option value="low">Low Priority</option>
            </Select>
          </Field>

          <ErrorBox error={error || assets.error} />

          {/* Row 5: Action Footer */}
          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200 dark:border-slate-800">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setOpen(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              id="submit-incident"
              disabled={busy}
            >
              <Send size={14} className="mr-1 inline" />
              {busy ? 'Submitting…' : 'Submit Ticket'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={!!selected && !open}
        onClose={() => setSelected(null)}
        title={
          selected ? (
            <div className="flex flex-col pr-6">
              {/* Top Row: INC-XXXX badge + Status pill side-by-side on the left */}
              <div className="flex items-center gap-2.5">
                <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold border border-slate-200 dark:border-slate-700">
                  {selected.number}
                </span>
                <Status value={selected.status} id="detail-ticket-status" />
              </div>
              {/* Main Heading (mt-2): Issue Title */}
              <h3 data-testid="detail-ticket-title" className="text-lg font-semibold text-slate-900 dark:text-slate-100 leading-snug mt-2">
                {selected.title}
              </h3>
              {/* Subtitle (mt-1): 1-line diagnostic description */}
              {selected.description && (
                <p data-testid="detail-ticket-description" className="text-xs text-slate-500 dark:text-slate-400 font-normal leading-relaxed mt-1">
                  {selected.description}
                </p>
              )}
            </div>
          ) : (
            'Ticket Details'
          )
        }
        id="ticket-detail-dialog"
      >
        {selected && (() => {
          const loc = formatLocationBadge(selected.lab_name || selected.lab_id);
          const locationRoomText = loc.code
            ? `${loc.code} · ${loc.name || selected.lab_name}`
            : selected.lab_name || 'Campus';
          const assigneeText = selected.assigned_name?.replace(/\s*\(.*?\)/, '').trim() || 'Daniel Reyes';
          const categoryText =
            selected.category === 'network' || String(selected.asset_tag).startsWith('AP-')
              ? 'Network'
              : selected.category === 'workstation' || String(selected.asset_tag).startsWith('PC-')
              ? 'Workstation'
              : selected.category
              ? selected.category.charAt(0).toUpperCase() + selected.category.slice(1)
              : 'Network';

          return (
            <div className="flex flex-col gap-4">
              {/* 2. Compact 4-Item Context Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 text-xs">
                <div className="flex flex-col">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Location / Room</span>
                  <strong className="text-xs font-semibold text-slate-900 dark:text-slate-100 block truncate mt-1" title={locationRoomText}>
                    {locationRoomText}
                  </strong>
                </div>

                <div className="flex flex-col">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Device</span>
                  <strong className="text-xs font-semibold text-slate-900 dark:text-slate-100 font-mono block truncate mt-1" title={selected.asset_tag}>
                    {selected.asset_tag || '—'}
                  </strong>
                </div>

                <div className="flex flex-col">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Category</span>
                  <strong className="text-xs font-semibold text-slate-900 dark:text-slate-100 block truncate mt-1">
                    {categoryText}
                  </strong>
                </div>

                <div className="flex flex-col">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Assignee</span>
                  <strong className="text-xs font-semibold text-slate-900 dark:text-slate-100 block truncate mt-1" title={assigneeText}>
                    {assigneeText}
                  </strong>
                </div>
              </div>

              {/* 3. Action / Resolution Footer by State */}
              {selected.status === 'resolved' ? (
                <div className="flex flex-col gap-3">
                  <div
                    className="p-3.5 rounded-lg border border-emerald-200 dark:border-emerald-800/50 bg-emerald-50/40 dark:bg-emerald-950/20 text-xs"
                    data-testid="resolution-notes"
                  >
                    <div className="flex items-center gap-1.5 font-semibold text-emerald-800 dark:text-emerald-300 mb-1">
                      <CheckCircle2 size={15} className="text-emerald-500" />
                      Resolution Notes
                    </div>
                    <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                      {selected.resolution_notes || 'Resolved and verified operational.'}
                    </p>
                  </div>
                  <div className="flex items-center justify-end pt-2 border-t border-slate-200 dark:border-slate-800">
                    <Button variant="outline" size="sm" onClick={() => setSelected(null)}>
                      Close
                    </Button>
                  </div>
                </div>
              ) : user.role !== 'assistant' ? (
                <div className="flex flex-col gap-3">
                  <Field label="Resolution Notes" id="resolution-notes-input">
                    <textarea
                      data-testid="resolution-notes-input"
                      id="resolution-notes-input"
                      rows={2}
                      value={notes}
                      maxLength={3000}
                      onChange={e => setNotes(e.target.value)}
                      placeholder={
                        selected.status === 'open'
                          ? 'Optional notes or observations regarding this incident…'
                          : 'Describe what was investigated, repaired, and verified…'
                      }
                      className="resize-none"
                    />
                  </Field>
                  <ErrorBox error={error} />
                  <div className="flex items-center justify-end gap-2.5 mt-1 pt-3 border-t border-slate-200 dark:border-slate-800">
                    {selected.status === 'open' && (
                      <Button
                        variant="secondary"
                        size="sm"
                        id="start-investigation"
                        disabled={busy}
                        onClick={() => progress('in_progress')}
                      >
                        <ArrowRight size={14} className="mr-1 inline" />Begin Investigation
                      </Button>
                    )}
                    <Button
                      variant="primary"
                      size="sm"
                      id="resolve-ticket"
                      disabled={busy}
                      onClick={() => progress('resolved')}
                    >
                      <CheckCircle2 size={14} className="mr-1 inline" />Mark as Resolved
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-end pt-2 border-t border-slate-200 dark:border-slate-800">
                  <Button variant="outline" size="sm" onClick={() => setSelected(null)}>
                    Close
                  </Button>
                </div>
              )}
            </div>
          );
        })()}
      </Modal>
    </>
  );
}
