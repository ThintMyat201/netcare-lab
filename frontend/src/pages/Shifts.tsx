import React, { useEffect, useState } from 'react';
import { CalendarDays, Plus, CheckCheck, Clock3, UserRound, Bell, Check, ChevronLeft, ChevronRight, Zap, CalendarCog, Pencil, Trash2 } from 'lucide-react';
import { useAuth } from '../context';
import { api, errorText, time } from '../lib/api';
import { PageTitle, Button, Modal, Field, Select, Status, ErrorBox, Loading, Empty, useData } from '../components/shared';

// day_of_week as the API stores it: 0 = Monday ... 6 = Sunday.
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// Week bounds are calendar dates (YYYY-MM-DD). Counting them in UTC means adding days never meets a clock change.
const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const dayLabel = (day: string, withYear = false) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short', ...(withYear ? { year: 'numeric' as const } : {}) }).format(new Date(`${day}T00:00:00Z`));
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

const BLANK_TEMPLATE = { name: '', day_of_week: 0, start_time: '09:00', end_time: '13:00', lab_id: '', required_assistants: 1, active: true };

function ShiftTemplates({ open, onClose, onChanged }: { open: boolean; onClose: (open: boolean) => void; onChanged: () => void }) {
  const [list, setList] = useState<any[] | null>(null);
  const [labs, setLabs] = useState<any[]>([]);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>(BLANK_TEMPLATE);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setError('');
    try {
      const [templates, labList] = await Promise.all([api.get('/shift-templates'), api.get('/labs')]);
      setList(templates.data);
      setLabs(labList.data);
    } catch (e) {
      setError(errorText(e));
    }
  };

  useEffect(() => {
    if (open) {
      setEditing(null);
      load();
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const startEdit = (template?: any) => {
    setError('');
    setForm(template
      ? { name: template.name, day_of_week: template.day_of_week, start_time: template.start_time, end_time: template.end_time, lab_id: template.lab_id, required_assistants: template.required_assistants, active: template.active }
      : { ...BLANK_TEMPLATE, lab_id: labs[0]?.id || '' });
    setEditing(template || {});
  };

  const save = async (e: any) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const body = { ...form, day_of_week: Number(form.day_of_week), required_assistants: Number(form.required_assistants) };
      if (editing.id) await api.patch(`/shift-templates/${editing.id}`, body);
      else await api.post('/shift-templates', body);
      setEditing(null);
      await load();
      onChanged();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={editing ? (editing.id ? 'Edit Shift Template' : 'New Shift Template') : 'Shift Templates'}
      description={editing ? 'A weekly slot. Generating a week turns it into dated shifts.' : 'Weekly patterns. Generating a week turns the active ones into dated shifts.'}
      id="templates-dialog"
    >
      <ErrorBox error={error} />
      {editing ? (
        <form onSubmit={save}>
          <Field label="Name" id="template-name">
            <input id="template-name" data-testid="template-name" required minLength={2} maxLength={120} value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })} placeholder="e.g. Morning lab cover" />
          </Field>
          <div className="form-grid">
            <Field label="Day" id="template-day">
              <Select id="template-day" value={form.day_of_week} onChange={(e: any) => setForm({ ...form, day_of_week: e.target.value })}>
                {DAYS.map((day, i) => <option key={day} value={i}>{day}</option>)}
              </Select>
            </Field>
            <Field label="Assistants needed" id="template-seats">
              <input type="number" id="template-seats" data-testid="template-seats" required min={1} max={10} value={form.required_assistants}
                onChange={e => setForm({ ...form, required_assistants: e.target.value })} />
            </Field>
          </div>
          <div className="form-grid">
            <Field label="Starts (MYT)" id="template-start">
              <input type="time" id="template-start" data-testid="template-start" required value={form.start_time}
                onChange={e => setForm({ ...form, start_time: e.target.value })} />
            </Field>
            <Field label="Ends (MYT)" id="template-end">
              <input type="time" id="template-end" data-testid="template-end" required value={form.end_time}
                onChange={e => setForm({ ...form, end_time: e.target.value })} />
            </Field>
          </div>
          <Field label="Lab" id="template-lab">
            <Select id="template-lab" required value={form.lab_id} onChange={(e: any) => setForm({ ...form, lab_id: e.target.value })}>
              <option value="">Choose a lab…</option>
              {labs.map(lab => <option key={lab.id} value={lab.id}>{lab.name}</option>)}
            </Select>
          </Field>
          <label className="template-active">
            <input type="checkbox" data-testid="template-active" checked={form.active} onChange={e => setForm({ ...form, active: e.target.checked })} />
            Active, so generating a week includes this slot
          </label>
          <div className="form-footer">
            <Button type="button" id="template-back" onClick={() => { setEditing(null); setError(''); }}>Back to Templates</Button>
            <Button type="submit" id="save-template" variant="primary" disabled={busy}>
              {busy ? 'Saving…' : editing.id ? 'Save Template' : 'Add Template'}
            </Button>
          </div>
        </form>
      ) : (
        <>
          {list === null ? (
            !error && <Loading />
          ) : list.length === 0 ? (
            <Empty text="No shift templates yet. Add the weekly slots first: generating a week has nothing to work from without them." />
          ) : (
            <ul className="template-list">
              {list.map(t => (
                <li key={t.id} className={t.active ? '' : 'inactive'} data-testid={`template-${t.id}`}>
                  <div>
                    <strong>{t.name}</strong>
                    <small>{t.day_name} {t.start_time}-{t.end_time} · {t.lab_name}</small>
                    <small>{plural(t.required_assistants, 'assistant')} · {plural(t.shift_count, 'shift')} on the roster · {t.active ? 'Active' : 'Inactive'}</small>
                  </div>
                  <button type="button" className="icon-button" aria-label={`Edit ${t.name} on ${t.day_name}`} title="Edit template" onClick={() => startEdit(t)}>
                    <Pencil size={15} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Button id="new-template" variant="primary" onClick={() => startEdit()} disabled={!labs.length}>
            <Plus size={15} />New Template
          </Button>
        </>
      )}
    </Modal>
  );
}

export default function Shifts() {
  const { user } = useAuth();
  const isAdmin = user.role === 'admin';
  const [week, setWeek] = useState('');
  const list = useData(`/roster${week ? `?week=${week}` : ''}`);
  const data = list.data;
  const [open, setOpen] = useState(false);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [form, setForm] = useState({ assistant_id: '', lab_id: 'lab-1', start: '', end: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [filter, setFilter] = useState('active');
  // Who each shift card's "Hand to somebody else" select points at, until Hand Over is pressed.
  const [handTo, setHandTo] = useState<Record<string, string>>({});

  const add = async () => {
    setOpen(true);
    setError('');
    try {
      setUsers((await api.get('/users')).data);
    } catch (e) {
      setError(errorText(e));
    }
  };

  const submit = async (e: any) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/shifts', form);
      setOpen(false);
      setNotice('Shift assignment successfully created.');
      setForm({ assistant_id: '', lab_id: 'lab-1', start: '', end: '' });
      list.load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  // One runner for every roster action: clear the old message, call the API, show what happened, reload the week.
  const run = async (request: () => Promise<string>) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      setNotice(await request());
      list.load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const action = (id: string, kind: string) => run(async () => {
    await api.post(`/shifts/${id}/${kind}`);
    return kind === 'acknowledge' ? 'Shift acknowledgement confirmed.' : 'Shift assignment cancelled. Historical log retained.';
  });

  const generate = () => run(async () => (await api.post('/roster/generate', { week: data.week_start })).data.message);

  const clearWeek = () => {
    if (!window.confirm(`Remove the ${plural(data.removable_count, 'shift')} this week that ${data.removable_count === 1 ? 'has' : 'have'} not started? Shifts that have started stay as the attendance record, and generating the week fills the template slots again.`)) return;
    run(async () => {
      const { removed, kept } = (await api.post('/roster/clear', { week: data.week_start })).data;
      return `Removed ${plural(removed, 'shift')} from the week of ${dayLabel(data.week_start)}.` + (kept ? ` ${plural(kept, 'shift')} that already started ${kept === 1 ? 'stays' : 'stay'} as the attendance record.` : '');
    });
  };

  const reassign = (shift: any) => {
    const assistantId = handTo[shift.id];
    if (!assistantId) return;
    run(async () => {
      const updated = (await api.post(`/shifts/${shift.id}/reassign`, { assistant_id: assistantId })).data;
      setHandTo(choices => ({ ...choices, [shift.id]: '' }));
      return `${updated.assistant_name} now has the ${updated.lab_name} shift on ${time(updated.start, true)} MYT.`;
    });
  };

  // Another week starts without the last action's message.
  const showWeek = (start: string) => {
    setNotice('');
    setError('');
    setWeek(start);
  };

  const rows = data?.shifts.filter((s: any) => filter === 'all' || !s.cancelled);
  const assistants: any[] = data?.assistants || [];

  return (
    <>
      <PageTitle
        title={isAdmin ? 'Staff Schedule' : 'Your Shift Schedule'}
        subtitle={isAdmin
          ? `${data ? plural(data.shift_count, 'shift') : 'Shifts'} this week. Generated from the shift templates, then adjusted here · Asia/Kuala Lumpur (MYT)`
          : 'Your shifts this week and their acknowledgements · Asia/Kuala Lumpur (MYT)'}
      >
        {isAdmin && (
          <>
            <Button id="open-templates" onClick={() => setTemplatesOpen(true)}>
              <CalendarCog size={16} />Shift Templates
            </Button>
            <Button id="assign-shift" onClick={add}>
              <Plus size={16} />Assign Shift
            </Button>
            <Button id="generate-week" variant="primary" onClick={generate} disabled={busy || !data || data.active_templates === 0}>
              <Zap size={16} />Generate This Week
            </Button>
          </>
        )}
      </PageTitle>

      <ErrorBox error={list.error || (!open && error)} retry={list.error ? list.load : undefined} />

      <div className="simulation-strip">
        <div>
          <Bell size={16} />
          <strong>In-App Reminders</strong>
          <span>
            {data?.shifts.filter((s: any) => s.status === 'missed').length || 0} unacknowledged shifts this week · in-app notifications only
          </span>
        </div>
        <Select id="shift-filter" value={filter} onChange={(e: any) => setFilter(e.target.value)}>
          <option value="active">Active Shifts</option>
          <option value="all">All Shifts (Including Cancelled)</option>
        </Select>
      </div>

      {data && (
        <div className="roster-toolbar">
          <div className="week-nav" role="group" aria-label="Week shown">
            <button type="button" className="icon-button" aria-label="Previous week" data-testid="previous-week" disabled={busy}
              onClick={() => showWeek(addDays(data.week_start, -7))}>
              <ChevronLeft size={16} />
            </button>
            <span data-testid="week-label" aria-live="polite">{dayLabel(data.week_start)} to {dayLabel(data.week_end, true)}</span>
            <button type="button" className="icon-button" aria-label="Next week" data-testid="next-week" disabled={busy}
              onClick={() => showWeek(addDays(data.week_start, 7))}>
              <ChevronRight size={16} />
            </button>
          </div>
          {!data.this_week && (
            <Button id="this-week" className="compact" onClick={() => showWeek('')}>This Week</Button>
          )}
          {isAdmin && data.removable_count > 0 && (
            <Button id="clear-week" variant="danger" className="compact clear-week" onClick={clearWeek} disabled={busy}>
              <Trash2 size={14} />Clear Week
            </Button>
          )}
        </div>
      )}

      {isAdmin && data?.active_templates === 0 && (
        <p className="notice roster-notice" data-testid="no-templates">
          There are no active shift templates, so there is nothing to generate yet. Add the weekly slots under Shift Templates first.
        </p>
      )}

      {notice && (
        <div className="success-box" data-testid="shift-confirmation" role="status">
          <CheckCheck size={17} />
          {notice}
        </div>
      )}

      {list.busy && !data ? (
        <Loading />
      ) : rows?.length ? (
        <div className="shift-grid">
          {rows.map((s: any) => (
            <article className={`shift-card ${s.status}`} data-testid={`shift-card-${s.id}`} key={s.id}>
              <div className="shift-card-top">
                <span className="calendar-icon">
                  <CalendarDays size={20} />
                </span>
                <Status value={s.status} id={`shift-status-${s.id}`} />
              </div>
              <h2>{s.lab_name}</h2>
              <div className="shift-info">
                <span>
                  <UserRound size={15} />
                  {s.assistant_name}
                </span>
                <span>
                  <CalendarDays size={15} />
                  {time(s.start, true)} MYT
                </span>
                <span>
                  <Clock3 size={15} />
                  Until {time(s.end, true)} MYT
                </span>
              </div>
              <div className="shift-card-foot">
                {s.acknowledged_at ? (
                  <span className="ack-label">
                    <CheckCheck size={15} />
                    Acknowledged {time(s.acknowledged_at)} MYT
                  </span>
                ) : s.assistant_id === user.id && !s.cancelled ? (
                  <Button
                    id={`ack-shift-${s.id}`}
                    onClick={() => action(s.id, 'acknowledge')}
                    disabled={busy}
                    variant="primary"
                  >
                    <Check size={15} />Confirm Acknowledgement
                  </Button>
                ) : (
                  <span className="muted small">
                    {s.cancelled ? 'Assignment Cancelled' : 'Awaiting Assistant Acknowledgement'}
                  </span>
                )}
                {/* Only before it starts: from then on the shift is the attendance record. */}
                {isAdmin && s.removable && (
                  <Button
                    id={`cancel-shift-${s.id}`}
                    onClick={() => {
                      if (window.confirm('Cancel this shift assignment? Its historical record will be retained.')) {
                        action(s.id, 'cancel');
                      }
                    }}
                    disabled={busy}
                    className="compact"
                  >
                    Cancel Shift
                  </Button>
                )}
              </div>
              {/* Until it ends, somebody else can take the shift over. Picking a name only chooses: on Windows the
                  arrow keys change a closed select, so acting on change would hand the shift to whoever the keyboard passed. */}
              {isAdmin && s.reassignable && assistants.length > 1 && (
                <div className="shift-card-reassign">
                  <Select
                    id={`reassign-${s.id}`}
                    aria-label={`Hand ${s.assistant_name}'s ${s.lab_name} shift on ${time(s.start, true)} MYT to somebody else`}
                    value={handTo[s.id] || ''}
                    disabled={busy}
                    onChange={(e: any) => setHandTo({ ...handTo, [s.id]: e.target.value })}
                  >
                    <option value="">Hand to somebody else…</option>
                    {assistants.filter(a => a.id !== s.assistant_id).map(a => (
                      <option key={a.id} value={a.id}>{a.name}</option>
                    ))}
                  </Select>
                  <Button id={`hand-over-${s.id}`} onClick={() => reassign(s)} disabled={busy || !handTo[s.id]}>
                    Hand Over
                  </Button>
                </div>
              )}
            </article>
          ))}
        </div>
      ) : (
        <Empty text={isAdmin ? 'No shifts this week. Generate the week from the shift templates, or assign a shift.' : 'No shifts for you this week.'} />
      )}

      {isAdmin && <ShiftTemplates open={templatesOpen} onClose={setTemplatesOpen} onChanged={list.load} />}

      <Modal
        open={open}
        onClose={setOpen}
        title="Assign Lab Shift"
        description="Campus timezone: Asia/Kuala Lumpur (MYT)"
        id="shift-dialog"
      >
        <form onSubmit={submit}>
          <Field label="Lab Assistant" id="shift-assistant">
            <Select
              id="shift-assistant"
              required
              value={form.assistant_id}
              onChange={(e: any) => setForm({ ...form, assistant_id: e.target.value })}
            >
              <option value="">Select an assistant…</option>
              {users.filter(u => u.role === 'assistant' && u.active).map(u => (
                <option value={u.id} key={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Assigned Lab" id="shift-lab">
            <Select
              id="shift-lab"
              value={form.lab_id}
              onChange={(e: any) => setForm({ ...form, lab_id: e.target.value })}
            >
              <option value="lab-1">Computing Lab A</option>
              <option value="lab-2">Computing Lab B</option>
              <option value="lab-3">Innovation Lab</option>
            </Select>
          </Field>

          <div className="form-grid">
            <Field label="Start Time (MYT)" id="shift-start">
              <input
                type="datetime-local"
                required
                data-testid="shift-start"
                id="shift-start"
                value={form.start}
                onChange={e => setForm({ ...form, start: e.target.value })}
              />
            </Field>

            <Field label="End Time (MYT)" id="shift-end">
              <input
                type="datetime-local"
                required
                data-testid="shift-end"
                id="shift-end"
                value={form.end}
                onChange={e => setForm({ ...form, end: e.target.value })}
              />
            </Field>
          </div>

          <ErrorBox error={error} />

          <Button type="submit" variant="primary" id="save-shift" disabled={busy}>
            {busy ? 'Saving…' : 'Confirm Assignment'}
          </Button>
        </form>
      </Modal>
    </>
  );
}
