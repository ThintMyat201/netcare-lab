import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CalendarDays,
  Plus,
  CheckCheck,
  Clock3,
  UserRound,
  Bell,
  Check,
  ClipboardCheck,
  ArrowRight,
  FileCheck2,
  Lock,
} from 'lucide-react';
import { useAuth } from '../context';
import { api, errorText, time } from '../lib/api';
import {
  CAMPUS_SHIFT_BLOCKS,
  getTodayMytDateString,
  normalizeCampusShifts,
  saveShiftOverride,
  getLabInspectionProgress,
} from '../lib/workflow';
import { PageTitle, Button, Modal, Field, Select, Status, ErrorBox, Loading, Empty, useData } from '../components/shared';

export default function Shifts() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const list = useData('/shifts');
  const checklists = useData('/checklists');
  const assets = useData('/assets');

  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [shiftPreset, setShiftPreset] = useState('morning');
  const [form, setForm] = useState(() => {
    const today = getTodayMytDateString();
    return {
      assistant_id: '',
      lab_id: 'lab-1',
      start: `${today}T08:00`,
      end: `${today}T12:00`,
    };
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [filter, setFilter] = useState('active');
  const [scopeFilter, setScopeFilter] = useState<'my' | 'all'>(() => (user.role === 'assistant' ? 'my' : 'all'));
  const [version, setVersion] = useState(0);

  const [handoverShift, setHandoverShift] = useState<any>(null);
  const [handoverNotes, setHandoverNotes] = useState('');

  useEffect(() => {
    const onUpdate = () => setVersion(v => v + 1);
    window.addEventListener('atlas-workflow-updated', onUpdate);
    return () => window.removeEventListener('atlas-workflow-updated', onUpdate);
  }, []);

  const normalizedShifts = useMemo(
    () => normalizeCampusShifts(list.data),
    [list.data, version] // eslint-disable-line react-hooks/exhaustive-deps
  );

  const rows = useMemo(() => {
    return normalizedShifts.filter((s: any) => {
      if (filter !== 'all' && s.cancelled) return false;
      if (scopeFilter === 'my') {
        const isMy =
          s.assistant_id === user.id ||
          s.assistant_name === user.name ||
          (user.role === 'assistant' && !s.assistant_id);
        if (!isMy) return false;
      }
      return true;
    });
  }, [normalizedShifts, filter, scopeFilter, user]);

  const unacknowledgedCount = useMemo(
    () => normalizedShifts.filter((s: any) => !s.cancelled && !s.acknowledged_at && !s.completed_at).length,
    [normalizedShifts]
  );

  const add = async () => {
    setOpen(true);
    setError('');
    try {
      setUsers((await api.get('/users')).data);
    } catch (e) {
      setError(errorText(e));
    }
  };

  const applyPreset = (presetKey: string) => {
    setShiftPreset(presetKey);
    const today = getTodayMytDateString();
    const block = CAMPUS_SHIFT_BLOCKS.find(b => b.key === presetKey) || CAMPUS_SHIFT_BLOCKS[0];
    setForm(prev => ({
      ...prev,
      lab_id: block.lab_id,
      start: `${today}T${block.startHour.slice(0, 5)}`,
      end: `${today}T${block.endHour.slice(0, 5)}`,
    }));
  };

  const submit = async (e: any) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/shifts', form);
      setOpen(false);
      setNotice('Shift assignment successfully created.');
      list.load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const acknowledgeShift = async (s: any) => {
    setBusy(true);
    setError('');
    const ackAt = new Date().toISOString();
    saveShiftOverride(s.id, { acknowledged_at: ackAt });
    setVersion(v => v + 1);
    try {
      await api.post(`/shifts/${s.id}/acknowledge`);
    } catch {
      // Local workflow state already updated
    } finally {
      setNotice(`Shift acknowledged for ${s.lab_name} (${s.shift_window}). You are now On Duty.`);
      setBusy(false);
      list.load();
    }
  };

  const cancelShift = async (s: any) => {
    setBusy(true);
    setError('');
    saveShiftOverride(s.id, { cancelled: true });
    setVersion(v => v + 1);
    try {
      await api.post(`/shifts/${s.id}/cancel`);
    } catch {
      // ignore
    } finally {
      setNotice('Shift assignment cancelled. Historical log retained.');
      setBusy(false);
      list.load();
    }
  };

  const openHandoverModal = (s: any, progress: any) => {
    setHandoverShift(s);
    setHandoverNotes(
      s.handover_notes ||
        `Completed ${progress.checked}/${progress.required} scheduled workstation checks in ${s.lab_name}. All reported faults linked to incident tickets.`
    );
  };

  const submitHandover = async (e: any) => {
    e.preventDefault();
    if (!handoverShift) return;
    setBusy(true);
    const nowIso = new Date().toISOString();
    const notesText =
      handoverNotes.trim() ||
      `All scheduled lab workstation inspections completed in ${handoverShift.lab_name}.`;

    saveShiftOverride(handoverShift.id, {
      acknowledged_at: handoverShift.acknowledged_at || nowIso,
      completed_at: nowIso,
      handover_notes: notesText,
    });
    setVersion(v => v + 1);

    try {
      await api.post(`/shifts/${handoverShift.id}/complete`, { handover_notes: notesText });
    } catch {
      // Local workflow state already updated
    } finally {
      setNotice(`Shift completed for ${handoverShift.lab_name}. Handover note recorded.`);
      setHandoverShift(null);
      setBusy(false);
      list.load();
    }
  };

  const runLabInspection = (s: any, progress: any) => {
    if (!s.acknowledged_at && user.role === 'assistant') {
      return; // Locked until acknowledged
    }
    const nextAssetParam = progress.nextUnchecked ? `&asset=${progress.nextUnchecked.id}` : '';
    navigate(`/checklists?lab=${s.lab_id}&new=1&shift=${s.id}${nextAssetParam}`);
  };

  return (
    <>
      <PageTitle
        title={user.role === 'admin' ? 'Staff Schedule' : 'Your Shift Schedule'}
        subtitle="Standard 4-hour campus lab shifts, inspection task tracking, and shift handovers · Asia/Kuala Lumpur (MYT)"
      >
        {user.role === 'admin' && (
          <Button id="assign-shift" variant="primary" onClick={add}>
            <Plus size={16} />Assign Shift
          </Button>
        )}
      </PageTitle>

      <ErrorBox error={list.error || (!open && error)} retry={list.load} />

      <div className="simulation-strip shift-scope-bar">
        <div>
          <Bell size={16} />
          <strong>In-App Reminders</strong>
          <span data-testid="unacknowledged-shifts-counter">
            {unacknowledgedCount} unacknowledged shift{unacknowledgedCount === 1 ? '' : 's'} · in-app notifications only
          </span>
        </div>
        <div className="shift-filter-controls">
          {user.role === 'assistant' && (
            <div className="segmented shift-scope-segmented" role="tablist">
              <button
                type="button"
                className={scopeFilter === 'my' ? 'selected' : ''}
                onClick={() => setScopeFilter('my')}
                data-testid="shift-scope-my"
              >
                My Shifts
              </button>
              <button
                type="button"
                className={scopeFilter === 'all' ? 'selected' : ''}
                onClick={() => setScopeFilter('all')}
                data-testid="shift-scope-all"
              >
                All Lab Shifts
              </button>
            </div>
          )}
          <Select id="shift-filter" value={filter} onChange={(e: any) => setFilter(e.target.value)}>
            <option value="active">Active Shifts</option>
            <option value="all">All Shifts (Including Cancelled)</option>
          </Select>
        </div>
      </div>

      {notice && (
        <div className="success-box" data-testid="shift-confirmation">
          <CheckCheck size={17} />
          <span>{notice}</span>
          <button className="text-button" onClick={() => setNotice('')}>
            Dismiss
          </button>
        </div>
      )}

      {list.busy && !list.data ? (
        <Loading />
      ) : rows?.length ? (
        <div className="shift-grid">
          {rows.map((s: any) => {
            const progress = getLabInspectionProgress(s.lab_id, s.lab_name, checklists.data, assets.data);
            const isMyShift =
              user.role === 'admin' ||
              s.assistant_id === user.id ||
              s.assistant_name === user.name ||
              (user.role === 'assistant' && !s.assistant_id);
            const isAcknowledged = Boolean(s.acknowledged_at);
            const isCompleted = s.lifecycle === 'completed' || Boolean(s.completed_at);
            const displayChecked = isAcknowledged ? progress.checked : 0;
            const displayPercent = isAcknowledged ? progress.percent : 0;
            const isAllChecked = isAcknowledged && progress.checked >= progress.required;

            const statusKey =
              s.lifecycle === 'cancelled'
                ? 'cancelled'
                : isCompleted
                ? 'completed'
                : isAcknowledged
                ? 'on_duty'
                : 'pending_ack';

            return (
              <article className={`shift-card ${s.lifecycle}`} data-testid={`shift-card-${s.id}`} key={s.id}>
                <div className="shift-card-top">
                  <span className="calendar-icon">
                    <CalendarDays size={20} />
                  </span>
                  <Status value={statusKey} id={`shift-status-${s.id}`} />
                </div>

                <h2>{s.lab_name}</h2>
                <p className="shift-window-badge" data-testid={`shift-window-${s.id}`}>
                  <Clock3 size={13} />
                  <span>{s.shift_window}</span>
                </p>

                <div className="shift-info">
                  <span className={!isMyShift ? 'text-amber' : ''}>
                    <UserRound size={15} />
                    {s.assistant_name}
                  </span>
                  <span>
                    <CalendarDays size={15} />
                    {time(s.start, true)} – {time(s.end)} MYT
                  </span>
                </div>

                <div className="shift-progress-box" data-testid={`shift-progress-${s.id}`}>
                  <div className="shift-progress-head">
                    <span>
                      <ClipboardCheck size={14} />
                      Lab Inspection Progress
                    </span>
                    <strong>
                      {displayChecked} / {progress.required} Workstations Checked
                    </strong>
                  </div>
                  <div className="shift-progress-bar">
                    <i style={{ width: `${displayPercent}%` }} />
                  </div>
                  <small className="shift-progress-sub">
                    {!isAcknowledged
                      ? 'Shift pending acknowledgement — inspections unlock once On Duty.'
                      : isAllChecked
                      ? 'All required shift workstation checks completed — ready for handover.'
                      : progress.nextUnchecked
                      ? `Next workstation due: ${progress.nextUnchecked.tag}`
                      : `${progress.required - displayChecked} workstation(s) remaining this shift`}
                  </small>
                </div>

                {s.completed_at && s.handover_notes && (
                  <div className="shift-handover-summary" data-testid={`shift-handover-${s.id}`}>
                    <strong>
                      <FileCheck2 size={13} /> Handover Note ({time(s.completed_at)} MYT)
                    </strong>
                    <p>{s.handover_notes}</p>
                  </div>
                )}

                {!s.cancelled && user.role === 'assistant' && !isCompleted && (
                  <div className="shift-workflow-actions">
                    {!isMyShift ? (
                      <Button
                        disabled
                        variant="secondary"
                        className="shift-locked-btn"
                        title={`This shift is assigned to ${s.assistant_name}`}
                      >
                        <Lock size={14} /> Assigned to {s.assistant_name}
                      </Button>
                    ) : (
                      <Button
                        id={`run-shift-inspection-${s.id}`}
                        variant={isAcknowledged ? 'primary' : 'secondary'}
                        disabled={!isAcknowledged}
                        title={
                          !isAcknowledged
                            ? 'Acknowledge shift first to unlock lab inspection'
                            : 'Run physical workstation inspections for this shift'
                        }
                        onClick={() => runLabInspection(s, progress)}
                      >
                        {!isAcknowledged ? <Lock size={14} /> : <ClipboardCheck size={15} />}
                        Run Lab Inspection <ArrowRight size={14} />
                      </Button>
                    )}
                  </div>
                )}

                <div className="shift-card-foot">
                  {isCompleted ? (
                    <span className="ack-label completed">
                      <CheckCheck size={15} />
                      Shift Completed · {time(s.completed_at)} MYT
                    </span>
                  ) : !isAcknowledged && !s.cancelled ? (
                    user.role === 'assistant' ? (
                      isMyShift ? (
                        <Button
                          id={`ack-shift-${s.id}`}
                          onClick={() => acknowledgeShift(s)}
                          disabled={busy}
                          variant="primary"
                          className="ack-shift-btn"
                        >
                          <Check size={15} /> ✓ Acknowledge Shift
                        </Button>
                      ) : (
                        <span className="muted small">Assigned to {s.assistant_name}</span>
                      )
                    ) : (
                      <span className="muted small">Pending Assistant Acknowledgement</span>
                    )
                  ) : isAcknowledged && !s.cancelled ? (
                    <div className="shift-duty-foot">
                      <span className="ack-label on-duty">
                        <CheckCheck size={15} />
                        On Duty · Acknowledged {time(s.acknowledged_at)} MYT
                      </span>
                      {user.role === 'assistant' && isMyShift && isAllChecked && (
                        <Button
                          id={`complete-shift-${s.id}`}
                          variant="primary"
                          className="handover-complete-btn"
                          onClick={() => openHandoverModal(s, progress)}
                          disabled={busy}
                          title="All 4 workstations checked — complete shift handover"
                        >
                          <CheckCheck size={15} />
                          ✓ Complete Shift Handover
                        </Button>
                      )}
                      {user.role === 'assistant' && isMyShift && !isAllChecked && (
                        <Button
                          id={`complete-shift-${s.id}`}
                          variant="secondary"
                          onClick={() => openHandoverModal(s, progress)}
                          disabled={busy}
                          className="compact faint-handover-btn"
                          title="Submit early handover note"
                        >
                          <FileCheck2 size={14} />
                          Handover Note
                        </Button>
                      )}
                    </div>
                  ) : (
                    <span className="muted small">Assignment Cancelled</span>
                  )}

                  {user.role === 'admin' && !s.cancelled && (
                    <Button
                      id={`cancel-shift-${s.id}`}
                      onClick={() => {
                        if (window.confirm('Cancel this shift assignment? Its historical record will be retained.')) {
                          cancelShift(s);
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
            );
          })}
        </div>
      ) : (
        <Empty text="No scheduled shifts found for this view." />
      )}

      <Modal
        open={!!handoverShift}
        onClose={() => setHandoverShift(null)}
        title="Complete Shift & Submit Handover Note"
        description={`${handoverShift?.lab_name || ''} · ${handoverShift?.shift_window || ''}`}
        id="shift-handover-dialog"
      >
        <form onSubmit={submitHandover}>
          <Field label="Shift Handover Summary" id="shift-handover-notes">
            <textarea
              id="shift-handover-notes"
              data-testid="shift-handover-notes"
              rows={4}
              required
              value={handoverNotes}
              onChange={e => setHandoverNotes(e.target.value)}
              placeholder="Summarize workstation checks, reported hardware/network faults, and notes for the incoming shift…"
            />
          </Field>
          <div className="form-footer">
            <span>Recorded in campus operational log (MYT)</span>
            <Button type="submit" variant="primary" id="submit-shift-handover" disabled={busy}>
              <CheckCheck size={15} />
              {busy ? 'Submitting…' : 'Complete Shift'}
            </Button>
          </div>
        </form>
      </Modal>

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
              {users
                .filter(u => u.role === 'assistant' && u.active)
                .map(u => (
                  <option value={u.id} key={u.id}>
                    {u.name}
                    {u.scope ? ` · ${u.scope}` : ''}                  </option>
                ))}
            </Select>
          </Field>

          <Field label="Standard 4-Hour Shift Window" id="shift-preset">
            <Select
              id="shift-preset"
              value={shiftPreset}
              onChange={(e: any) => applyPreset(e.target.value)}
            >
              <option value="morning">Morning Shift: 08:00 – 12:00 MYT</option>
              <option value="afternoon">Afternoon Shift: 12:00 – 16:00 MYT</option>
              <option value="evening">Evening Shift: 16:00 – 20:00 MYT</option>
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
