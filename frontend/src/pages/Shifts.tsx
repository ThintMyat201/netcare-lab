import React, { useState } from 'react';
import { CalendarDays, Plus, CheckCheck, Clock3, UserRound, Bell, Check } from 'lucide-react';
import { useAuth } from '../context';
import { api, errorText, time } from '../lib/api';
import { PageTitle, Button, Modal, Field, Select, Status, ErrorBox, Loading, Empty, useData } from '../components/shared';

export default function Shifts() {
  const { user } = useAuth();
  const list = useData('/shifts');
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [form, setForm] = useState({ assistant_id: '', lab_id: 'lab-1', start: '', end: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [filter, setFilter] = useState('active');

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

  const action = async (id: string, kind: string) => {
    setBusy(true);
    setError('');
    try {
      await api.post(`/shifts/${id}/${kind}`);
      setNotice(
        kind === 'acknowledge'
          ? 'Shift acknowledgement confirmed.'
          : 'Shift assignment cancelled. Historical log retained.'
      );
      list.load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const rows = list.data?.filter((s: any) => filter === 'all' || !s.cancelled);

  return (
    <>
      <PageTitle
        title={user.role === 'admin' ? 'Staff Schedule' : 'Your Shift Schedule'}
        subtitle="Lab assistant shift assignments and acknowledgements · Asia/Kuala Lumpur (MYT)"
      >
        {user.role === 'admin' && (
          <Button id="assign-shift" variant="primary" onClick={add}>
            <Plus size={16} />Assign Shift
          </Button>
        )}
      </PageTitle>

      <ErrorBox error={list.error || (!open && error)} retry={list.load} />

      <div className="simulation-strip">
        <div>
          <Bell size={16} />
          <strong>In-App Reminders</strong>
          <span>
            {list.data?.filter((s: any) => s.status === 'missed').length || 0} unacknowledged shifts · in-app notifications only
          </span>
        </div>
        <Select id="shift-filter" value={filter} onChange={(e: any) => setFilter(e.target.value)}>
          <option value="active">Active Shifts</option>
          <option value="all">All Shifts (Including Cancelled)</option>
        </Select>
      </div>

      {notice && (
        <div className="success-box" data-testid="shift-confirmation">
          <CheckCheck size={17} />
          {notice}
        </div>
      )}

      {list.busy && !list.data ? (
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
                {user.role === 'admin' && !s.cancelled && (
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
            </article>
          ))}
        </div>
      ) : (
        <Empty text="No scheduled shifts found for this view." />
      )}

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