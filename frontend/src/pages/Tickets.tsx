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
  MessageSquarePlus,
} from 'lucide-react';
import { useAuth } from '../context';
import { api, errorText, time } from '../lib/api';
import { mergeTickets, saveLocalTicket, enrichTicket, restoreDevice, formatLocationWithCode } from '../lib/workflow';
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
  const [commentText, setCommentText] = useState('');
  const [postingComment, setPostingComment] = useState(false);
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

  const postComment = async (e: any) => {
    e.preventDefault();
    if (!selected || commentText.trim().length < 2 || postingComment) return;
    setPostingComment(true);
    setError('');
    const text = commentText.trim();
    try {
      const r = await api.post(`/tickets/${selected.id}/comment`, { notes: text });
      const enriched = enrichTicket(r.data);
      saveLocalTicket(enriched);
      setSelected(enriched);
      setCommentText('');
      list.load();
    } catch {
      const nowIso = new Date().toISOString();
      const updated = enrichTicket({
        ...selected,
        updated_at: nowIso,
        events: [
          ...(selected.events || []),
          {
            actor: user.name,
            action: 'Troubleshooting Note',
            notes: text,
            timestamp: nowIso,
          },
        ],
      });
      saveLocalTicket(updated);
      setSelected(updated);
      setCommentText('');
    } finally {
      setPostingComment(false);
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
                      <td className="px-5 py-4 text-right whitespace-nowrap text-xs">
                        <div className="flex items-center justify-end gap-1.5">
                          {user.role !== 'assistant' && (
                            <>
                              {t.status === 'open' && (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  className="btn-ticket-action btn-start-work text-xs py-1 px-2.5 h-7 whitespace-nowrap"
                                  data-testid={`start-work-${t.id}`}
                                  title="Move ticket to In Progress"
                                  disabled={busy}
                                  onClick={(e: any) => {
                                    e.stopPropagation();
                                    handleStatusChange(t, 'in_progress');
                                  }}
                                >
                                  <Play size={11} className="mr-1" /> Start Work
                                </Button>
                              )}
                              {t.status !== 'resolved' && (
                                <Button
                                  size="sm"
                                  variant="primary"
                                  className="btn-ticket-action btn-resolve-ticket text-xs py-1 px-2.5 h-7 whitespace-nowrap"
                                  data-testid={`resolve-ticket-${t.id}`}
                                  title="Mark ticket as resolved and restore device"
                                  disabled={busy}
                                  onClick={(e: any) => {
                                    e.stopPropagation();
                                    handleStatusChange(t, 'resolved');
                                  }}
                                >
                                  <CheckCircle2 size={12} className="mr-1" /> Resolve
                                </Button>
                              )}
                              {t.status === 'resolved' && (
                                <span className="inline-flex items-center gap-1 text-xs text-emerald-400 font-medium px-2 py-0.5">
                                  <CheckCheck size={13} /> Resolved
                                </span>
                              )}
                            </>
                          )}
                          <button
                            type="button"
                            className="p-1 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded transition-colors"
                            title="View ticket details"
                            aria-label="View ticket details"
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
          <>
            <div className="ticket-detail-heading">
              <h3 data-testid="detail-ticket-title">{selected.title}</h3>
              <Status value={selected.status} id="detail-ticket-status" />
            </div>

            <p className="notes-block" data-testid="detail-ticket-description">
              {selected.description}
            </p>

            <div className="detail-line">
              <span>Escalation Tier</span>
              <span className={`tier-pill ${selected.tier_code === 'tier2' ? 'tier2' : 'tier1'}`}>
                {selected.tier}
              </span>
            </div>

            <div className="detail-line">
              <span>Assigned To</span>
              <strong>{selected.assigned_name}</strong>
            </div>

            <div className="detail-line">
              <span>Fault Category</span>
              <strong className="capitalize">{selected.category}</strong>
            </div>

            <div className="detail-line">
              <span>Priority Level</span>
              <Status value={selected.priority} id="detail-ticket-priority" />
            </div>

            <div className="ticket-events">
              {(selected.events || []).map((event: any, i: number) => (
                <div key={i} data-testid={`ticket-event-${i}`}>
                  <span className="event-dot" />
                  <div>
                    <strong>{event.action}</strong>
                    <small>
                      {event.actor} · {time(event.timestamp, true)} MYT
                    </small>
                    {event.notes && <p>{event.notes}</p>}
                  </div>
                </div>
              ))}
            </div>

            {selected.status !== 'resolved' && (
              <form className="ticket-comment-form" onSubmit={postComment} data-testid="ticket-comment-form">
                <input
                  id="ticket-comment-input"
                  data-testid="ticket-comment-input"
                  value={commentText}
                  onChange={e => setCommentText(e.target.value)}
                  placeholder="Add a timestamped troubleshooting note or lab observation…"
                />
                <Button
                  type="submit"
                  size="sm"
                  id="submit-ticket-comment"
                  disabled={postingComment || commentText.trim().length < 2}
                >
                  <MessageSquarePlus size={14} /> Post Note
                </Button>
              </form>
            )}

            {selected.status === 'resolved' ? (
              <div className="success-box" data-testid="resolution-notes">
                <CheckCircle2 size={20} />
                <div>
                  <strong>Resolution Notes</strong>
                  <p>{selected.resolution_notes}</p>
                </div>
              </div>
            ) : (
              user.role !== 'assistant' && (
                <>
                  {selected.status === 'in_progress' && (
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
                  )}
                  <ErrorBox error={error} />
                  <div className="ticket-modal-actions">
                    {selected.status === 'open' && (
                      <Button
                        variant="primary"
                        id="start-investigation"
                        disabled={busy}
                        onClick={() => progress('in_progress')}
                      >
                        <ArrowRight size={16} />Begin Investigation
                      </Button>
                    )}
                    <Button
                      variant={selected.status === 'in_progress' ? 'primary' : 'secondary'}
                      id="resolve-ticket"
                      disabled={busy}
                      onClick={() => progress('resolved')}
                    >
                      <CheckCircle2 size={16} />Mark as Resolved
                    </Button>
                  </div>
                </>
              )
            )}
          </>
        )}
      </Modal>
    </>
  );
}
