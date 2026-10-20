import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Search, ArrowUpRight, ArrowRight, Ticket, CheckCircle2, Send } from 'lucide-react';
import { useAuth } from '../context';
import { api, errorText, time } from '../lib/api';
import { PageTitle, Button, Modal, Field, Select, Status, ErrorBox, Loading, Empty, useData } from '../components/shared';

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
  const [form, setForm] = useState({ asset_id: '', category: 'network', title: '', description: '', priority: 'medium' });

  useEffect(() => {
    if (list.data && params.get('ticket')) {
      setSelected(list.data.find((t: any) => t.id === params.get('ticket')) || null);
    }
  }, [!!list.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const report = async (e: any) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await api.post('/incidents', form);
      setCreated(`Issue reported and linked to ticket ${r.data.number}.`);
      setOpen(false);
      setSelected(r.data);
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
      setSelected(r.data);
      setNotes('');
      list.load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const rows = list.data?.filter((t: any) =>
    (filter === 'all' || t.status === filter) &&
    (t.number + ' ' + t.title + ' ' + t.asset_tag).toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <PageTitle
        title="Incident Tickets"
        subtitle={
          user.role === 'assistant'
            ? 'Track your reported issues and workstation inspection faults.'
            : 'Investigate, track, and resolve campus network and equipment issues.'
        }
      >
        <Button variant="primary" id="report-incident" onClick={() => { setError(''); setOpen(true); }}>
          <Plus size={16} />Report Issue
        </Button>
      </PageTitle>

      <ErrorBox error={list.error} retry={list.load} />

      {created && (
        <div className="success-box" data-testid="incident-success">
          {created}
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
            ['resolved', 'Resolved']
          ].map(([key, label]) => (
            <button
              key={key}
              data-testid={`ticket-filter-${key}`}
              className={filter === key ? 'active' : ''}
              onClick={() => setFilter(key)}
            >
              {label}
              <span>{list.data?.filter((t: any) => key === 'all' || t.status === key).length || 0}</span>
            </button>
          ))}
        </div>

        <div className="search-field">
          <Search size={16} />
          <input
            data-testid="ticket-search"
            placeholder="Search tickets by title, ID, or equipment…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      {list.busy && !list.data ? (
        <Loading />
      ) : rows?.length ? (
        <div className="table-wrap">
          <table className="data-table tickets-table">
            <thead>
              <tr>
                <th>TICKET</th>
                <th>EQUIPMENT</th>
                <th>PRIORITY</th>
                <th>STATUS</th>
                <th>REPORTED (MYT)</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((t: any) => (
                <tr key={t.id} data-testid={`ticket-row-${t.id}`}>
                  <td>
                    <button
                      className="ticket-title"
                      data-testid={`open-ticket-${t.id}`}
                      onClick={() => { setSelected(t); setError(''); setNotes(''); }}
                    >
                      <span>{t.number}</span>
                      <strong>{t.title}</strong>
                    </button>
                  </td>
                  <td>
                    <strong className="mono small">{t.asset_tag}</strong>
                    <small className="cell-sub">{t.lab_name}</small>
                  </td>
                  <td><Status value={t.priority} id={`priority-${t.id}`} /></td>
                  <td><Status value={t.status} id={`ticket-status-${t.id}`} /></td>
                  <td className="mono small">{time(t.created_at, true)} MYT</td>
                  <td>
                    <button
                      className="icon-button"
                      title="View ticket details"
                      aria-label="View ticket details"
                      data-testid={`ticket-detail-${t.id}`}
                      onClick={() => { setSelected(t); setError(''); setNotes(''); }}
                    >
                      <ArrowUpRight size={16} />
                    </button>
                  </td>
                </tr>
              ))}
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
        description="Related faults link to one active ticket per equipment and category."
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
                {assets.data?.filter((a: any) => !a.archived).map((a: any) => (
                  <option key={a.id} value={a.id}>{a.tag} ({a.model})</option>
                ))}
              </Select>
            </Field>

            <Field label="Fault Category" id="incident-category">
              <Select
                id="incident-category"
                value={form.category}
                onChange={(e: any) => setForm({ ...form, category: e.target.value })}
              >
                {['network', 'power', 'display', 'peripherals', 'software', 'other'].map(v => (
                  <option key={v} value={v}>{v.charAt(0).toUpperCase() + v.slice(1)}</option>
                ))}
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

            <p className="notes-block" data-testid="detail-ticket-description">{selected.description}</p>

            <div className="detail-line">
              <span>Fault Category</span>
              <strong className="capitalize">{selected.category}</strong>
            </div>

            <div className="detail-line">
              <span>Priority Level</span>
              <Status value={selected.priority} id="detail-ticket-priority" />
            </div>

            <div className="ticket-events">
              {selected.events.map((event: any, i: number) => (
                <div key={i} data-testid={`ticket-event-${i}`}>
                  <span className="event-dot" />
                  <div>
                    <strong>{event.action}</strong>
                    <small>{event.actor} · {time(event.timestamp, true)} MYT</small>
                    {event.notes && <p>{event.notes}</p>}
                  </div>
                </div>
              ))}
            </div>

            {selected.status === 'resolved' ? (
              <div className="success-box" data-testid="resolution-notes">
                <CheckCircle2 size={20} />
                <div>
                  <strong>Resolution Notes</strong>
                  <p>{selected.resolution_notes}</p>
                </div>
              </div>
            ) : user.role !== 'assistant' && (
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
                    <><ArrowRight size={16} />Begin Investigation</>
                  ) : (
                    <><CheckCircle2 size={16} />Mark as Resolved</>
                  )}
                </Button>
              </>
            )}
          </>
        )}
      </Modal>
    </>
  );
}