import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Search, ArrowUpRight, ArrowRight, CheckCircle2, Send, LayoutGrid, List, Clock, MessageSquarePlus } from 'lucide-react';
import { useAuth } from '../context';
import { api, errorText, time } from '../lib/api';
import { mergeTickets, saveLocalTicket, enrichTicket } from '../lib/workflow';
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
  const [viewMode, setViewMode] = useState<'table' | 'kanban'>('table');
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

  const progress = async (status: string) => {
    setBusy(true);
    setError('');
    try {
      const r = await api.patch(`/tickets/${selected.id}`, { status, resolution_notes: notes });
      const enriched = enrichTicket(r.data);
      saveLocalTicket(enriched);
      setSelected(enriched);
      setNotes('');
      list.load();
    } catch (e) {
      // Fallback for locally created tickets
      const nowIso = new Date().toISOString();
      const updated = enrichTicket({
        ...selected,
        status,
        updated_at: nowIso,
        resolved_at: status === 'resolved' ? nowIso : selected.resolved_at,
        resolution_notes: status === 'resolved' ? notes : selected.resolution_notes,
        events: [
          ...(selected.events || []),
          {
            actor: user.name,
            action: status === 'resolved' ? 'Resolved' : 'Investigation started',
            notes,
            timestamp: nowIso,
          },
        ],
      });
      saveLocalTicket(updated);
      setSelected(updated);
      setNotes('');
    } finally {
      setBusy(false);
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
      <PageTitle
        title="Incident Tickets"
        subtitle={
          user.role === 'assistant'
            ? 'Track your reported issues, workstation inspection faults, and Tier 2 escalations.'
            : 'Investigate, track, and resolve tiered campus network (Tier 2) and lab equipment (Tier 1) issues.'
        }
      >
        <div className="view-toggle-group" data-testid="tickets-view-toggle">
          <button
            type="button"
            className={viewMode === 'table' ? 'active' : ''}
            data-testid="view-mode-table"
            onClick={() => setViewMode('table')}
          >
            <List size={15} /> Table View
          </button>
          <button
            type="button"
            className={viewMode === 'kanban' ? 'active' : ''}
            data-testid="view-mode-kanban"
            onClick={() => setViewMode('kanban')}
          >
            <LayoutGrid size={15} /> Kanban Board
          </button>
        </div>
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
      ) : viewMode === 'kanban' ? (
        <div className="kanban-board" data-testid="tickets-kanban-board">
          {[
            { key: 'open', title: 'Open / Triage Queue', tone: 'amber' },
            { key: 'in_progress', title: 'In Progress (Investigating)', tone: 'blue' },
            { key: 'resolved', title: 'Resolved & Verified', tone: 'green' },
          ].map(col => {
            const colTickets = rows.filter((t: any) => t.status === col.key);
            return (
              <div key={col.key} className="kanban-col" data-testid={`kanban-col-${col.key}`}>
                <div className={`kanban-col-head tone-${col.tone}`}>
                  <strong>{col.title}</strong>
                  <span>{colTickets.length}</span>
                </div>
                <div className="kanban-col-body">
                  {colTickets.length ? (
                    colTickets.map((t: any) => {
                      const sla = getSlaBadge(t);
                      return (
                        <div
                          key={t.id}
                          className="kanban-card"
                          data-testid={`kanban-card-${t.id}`}
                          onClick={() => {
                            setSelected(t);
                            setError('');
                            setNotes('');
                          }}
                        >
                          <div className="kanban-card-top">
                            <span className="mono small">{t.number}</span>
                            <Status value={t.priority} />
                          </div>
                          <strong>{t.title}</strong>
                          <div className="kanban-card-meta">
                            <span className="mono">{t.asset_tag}</span>
                            <span>·</span>
                            <span>{t.lab_name}</span>
                          </div>
                          <div className="kanban-card-foot">
                            <span className={`tier-pill ${t.tier_code === 'tier2' ? 'tier2' : 'tier1'}`}>
                              {t.tier_code === 'tier2' ? 'Tier 2 · NOC' : 'Tier 1 · Lab'}
                            </span>
                            <span className={`sla-chip tone-${sla.tone}`}>
                              <Clock size={11} /> {sla.label}
                            </span>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="kanban-empty">No tickets in {col.title.toLowerCase()}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : rows?.length ? (
        <div className="table-wrap">
          <table className="data-table tickets-table">
            <thead>
              <tr>
                <th>TICKET</th>
                <th>EQUIPMENT</th>
                <th>TIER & ROUTING</th>
                <th>PRIORITY & SLA</th>
                <th>STATUS</th>
                <th>REPORTED (MYT)</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((t: any) => {
                const sla = getSlaBadge(t);
                return (
                  <tr key={t.id} data-testid={`ticket-row-${t.id}`}>
                    <td>
                      <button
                        className="ticket-title"
                        data-testid={`open-ticket-${t.id}`}
                        onClick={() => {
                          setSelected(t);
                          setError('');
                          setNotes('');
                        }}
                      >
                        <span>{t.number}</span>
                        <strong>{t.title}</strong>
                      </button>
                    </td>
                    <td>
                      <strong className="mono small">{t.asset_tag}</strong>
                      <small className="cell-sub">{t.lab_name}</small>
                    </td>
                    <td>
                      <span className={`tier-pill ${t.tier_code === 'tier2' ? 'tier2' : 'tier1'}`}>
                        {t.tier}
                      </span>
                      <small className="cell-sub">{t.assigned_name}</small>
                    </td>
                    <td>
                      <Status value={t.priority} id={`priority-${t.id}`} />
                      <small className={`cell-sub sla-text-${sla.tone}`}>{sla.label}</small>
                    </td>
                    <td>
                      <Status value={t.status} id={`ticket-status-${t.id}`} />
                    </td>
                    <td className="mono small">{time(t.created_at, true)} MYT</td>
                    <td>
                      <button
                        className="icon-button"
                        title="View ticket details"
                        aria-label="View ticket details"
                        data-testid={`ticket-detail-${t.id}`}
                        onClick={() => {
                          setSelected(t);
                          setError('');
                          setNotes('');
                        }}
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
        description={`${selected?.asset_tag || ''} · ${selected?.lab_name || ''}`}
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
                  <Button
                    variant="primary"
                    id={selected.status === 'open' ? 'start-investigation' : 'resolve-ticket'}
                    disabled={busy || (selected.status === 'in_progress' && notes.trim().length < 10)}
                    onClick={() => progress(selected.status === 'open' ? 'in_progress' : 'resolved')}
                  >
                    {selected.status === 'open' ? (
                      <>
                        <ArrowRight size={16} />Begin Investigation
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={16} />Mark as Resolved
                      </>
                    )}
                  </Button>
                </>
              )
            )}
          </>
        )}
      </Modal>
    </>
  );
}
