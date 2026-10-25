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
  ArrowUpRight,
} from 'lucide-react';
import { useAuth } from '../context';
import { api, errorText, time } from '../lib/api';
import {
  CAMPUS_SHIFT_BLOCKS,
  getTodayMytDateString,
  normalizeCampusShifts,
  saveShiftOverride,
  getLabInspectionProgress,
  findLocation,
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
  const [selectedShift, setSelectedShift] = useState<{ shift: any; progress: any } | null>(null);
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
      <PageTitle title={user.role === 'admin' ? 'Staff Schedule' : 'Your Shift Schedule'}>
        {user.role === 'admin' && (
          <Button id="assign-shift" variant="primary" onClick={add}>
            <Plus size={16} className="mr-1" />Assign Shift
          </Button>
        )}
      </PageTitle>

      <ErrorBox error={list.error || (!open && error)} retry={list.load} />

      <div className="listing-toolbar">
        {user.role === 'assistant' ? (
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
        ) : (
          <div className="text-xs text-slate-400 font-medium" data-testid="unacknowledged-shifts-counter">
            {unacknowledgedCount > 0
              ? `${unacknowledgedCount} unacknowledged shift${unacknowledgedCount === 1 ? '' : 's'}`
              : 'All active shifts acknowledged'}
          </div>
        )}

        <Select id="shift-filter" value={filter} onChange={(e: any) => setFilter(e.target.value)}>
          <option value="active">Active Shifts</option>
          <option value="all">All Shifts (Including Cancelled)</option>
        </Select>
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
        <div className="shifts-table-card-wrapper w-full overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <div className="w-full overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse clean-shifts-table" style={{ minWidth: '780px' }}>
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-900/50 text-xs font-semibold tracking-wider text-slate-500 uppercase">
                  <th className="px-5 py-4" style={{ width: '25%' }}>LAB / ROOM</th>
                  <th className="px-5 py-4" style={{ width: '18%' }}>ASSISTANT</th>
                  <th className="px-5 py-4" style={{ width: '20%' }}>SHIFT WINDOW</th>
                  <th className="px-5 py-4" style={{ width: '13%' }}>PROGRESS</th>
                  <th className="px-5 py-4" style={{ width: '11%' }}>STATUS</th>
                  <th className="px-5 py-4 text-right" style={{ width: '13%' }}>ACTION</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
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
                  const isAllChecked = isAcknowledged && progress.checked >= progress.required;

                  const statusKey =
                    s.lifecycle === 'cancelled'
                      ? 'cancelled'
                      : isCompleted
                      ? 'completed'
                      : isAcknowledged
                      ? 'on_duty'
                      : 'pending_ack';

                  const loc = findLocation(s.lab_name || s.lab_id);
                  const labRoomText = loc?.code
                    ? `${loc.code} · ${loc.name || s.lab_name}`
                    : s.lab_name;

                  return (
                    <tr
                      key={s.id}
                      data-testid={`shift-row-${s.id}`}
                      className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors cursor-pointer"
                      onClick={() => setSelectedShift({ shift: s, progress })}
                    >
                      <td className="px-5 py-4 shift-cell-lab whitespace-nowrap">
                        <span className="font-semibold shift-lab-text">
                          {labRoomText}
                        </span>
                      </td>
                      <td className="px-5 py-4 shift-cell-assistant whitespace-nowrap">
                        <span className="shift-assistant-text">
                          {s.assistant_name}
                        </span>
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        <span
                          className="font-mono text-xs shift-window-text"
                          data-testid={`shift-window-${s.id}`}
                        >
                          {s.shift_window}
                        </span>
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        <span
                          className="font-mono text-xs shift-progress-text"
                          data-testid={`shift-progress-${s.id}`}
                        >
                          {displayChecked} / {progress.required} Checked
                        </span>
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        <Status value={statusKey} id={`shift-status-${s.id}`} />
                      </td>
                      <td className="px-5 py-4 text-right whitespace-nowrap" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1.5">
                          {user.role === 'admin' && !s.cancelled && (
                            <Button
                              size="sm"
                              variant="secondary"
                              id={`cancel-shift-${s.id}`}
                              className="text-xs py-1 px-2.5 h-7"
                              disabled={busy}
                              onClick={() => {
                                if (
                                  window.confirm(
                                    'Cancel this shift assignment? Its historical record will be retained.'
                                  )
                                ) {
                                  cancelShift(s);
                                }
                              }}
                            >
                              Cancel Shift
                            </Button>
                          )}

                          {user.role === 'assistant' && (
                            <>
                              {isCompleted ? (
                                <span className="text-xs text-emerald-400 font-medium">Completed</span>
                              ) : !isAcknowledged && !s.cancelled ? (
                                isMyShift ? (
                                  <Button
                                    size="sm"
                                    variant="primary"
                                    id={`ack-shift-${s.id}`}
                                    className="text-xs py-1 px-2.5 h-7"
                                    disabled={busy}
                                    onClick={() => acknowledgeShift(s)}
                                  >
                                    Acknowledge
                                  </Button>
                                ) : (
                                  <span className="text-xs text-slate-400">Assigned</span>
                                )
                              ) : isAcknowledged && !s.cancelled ? (
                                isMyShift ? (
                                  <div className="flex items-center gap-1.5">
                                    <Button
                                      size="sm"
                                      variant="primary"
                                      id={`run-shift-inspection-${s.id}`}
                                      className="text-xs py-1 px-2.5 h-7"
                                      onClick={() => runLabInspection(s, progress)}
                                    >
                                      Inspect Lab
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant={isAllChecked ? 'primary' : 'secondary'}
                                      id={`complete-shift-${s.id}`}
                                      className="text-xs py-1 px-2.5 h-7"
                                      disabled={busy}
                                      onClick={() => openHandoverModal(s, progress)}
                                      title={
                                        isAllChecked
                                          ? 'Complete shift handover'
                                          : 'Submit handover note'
                                      }
                                    >
                                      Handover
                                    </Button>
                                  </div>
                                ) : (
                                  <span className="text-xs text-slate-400">On Duty</span>
                                )
                              ) : null}
                            </>
                          )}

                          <button
                            type="button"
                            className="action-btn-uniform"
                            title="View shift details and operational actions"
                            aria-label="View shift details and operational actions"
                            data-testid={`shift-detail-${s.id}`}
                            onClick={() => setSelectedShift({ shift: s, progress })}
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
        <Empty text="No scheduled shifts found for this view." />
      )}

      {/* SHIFT DETAILS & OPERATIONAL ACTIONS MODAL */}
      <Modal
        open={!!selectedShift}
        onClose={() => setSelectedShift(null)}
        title={selectedShift?.shift?.lab_name || 'Shift Details'}
        description={`${selectedShift?.shift?.shift_window || ''} · Assigned to ${selectedShift?.shift?.assistant_name || 'Staff'}`}
        id="shift-detail-dialog"
      >
        {selectedShift && (
          <div className="flex flex-col gap-3">
            <div className="detail-line">
              <span>Status</span>
              <Status
                value={
                  selectedShift.shift.lifecycle === 'cancelled'
                    ? 'cancelled'
                    : selectedShift.shift.lifecycle === 'completed' || Boolean(selectedShift.shift.completed_at)
                    ? 'completed'
                    : selectedShift.shift.acknowledged_at
                    ? 'on_duty'
                    : 'pending_ack'
                }
              />
            </div>
            <div className="detail-line">
              <span>Lab Room</span>
              <strong>{selectedShift.shift.lab_name}</strong>
            </div>
            <div className="detail-line">
              <span>Assigned Assistant</span>
              <strong>{selectedShift.shift.assistant_name}</strong>
            </div>
            <div className="detail-line">
              <span>Shift Window</span>
              <span className="font-mono text-xs">{selectedShift.shift.shift_window}</span>
            </div>
            <div className="detail-line">
              <span>Inspection Progress</span>
              <span className="font-mono text-xs">
                {selectedShift.shift.acknowledged_at ? selectedShift.progress.checked : 0} / {selectedShift.progress.required} Checked
              </span>
            </div>

            {selectedShift.shift.handover_notes && (
              <div className="success-box mt-2" data-testid={`shift-handover-${selectedShift.shift.id}`}>
                <FileCheck2 size={18} />
                <div>
                  <strong>Handover Summary</strong>
                  <p>{selectedShift.shift.handover_notes}</p>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 mt-4 pt-3 border-t border-slate-100 dark:border-slate-800/60">
              {user.role === 'admin' && !selectedShift.shift.cancelled && (
                <Button
                  variant="danger"
                  size="sm"
                  id={`cancel-shift-modal-${selectedShift.shift.id}`}
                  disabled={busy}
                  onClick={() => {
                    const s = selectedShift.shift;
                    setSelectedShift(null);
                    cancelShift(s);
                  }}
                >
                  Cancel Shift
                </Button>
              )}
              {user.role === 'assistant' && !selectedShift.shift.acknowledged_at && !selectedShift.shift.cancelled && (
                <Button
                  variant="primary"
                  size="sm"
                  id={`ack-shift-modal-${selectedShift.shift.id}`}
                  disabled={busy}
                  onClick={() => {
                    const s = selectedShift.shift;
                    setSelectedShift(null);
                    acknowledgeShift(s);
                  }}
                >
                  <CheckCheck size={14} /> Acknowledge Shift
                </Button>
              )}
              {user.role === 'assistant' && selectedShift.shift.acknowledged_at && !selectedShift.shift.completed_at && !selectedShift.shift.cancelled && (
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      const { shift, progress } = selectedShift;
                      setSelectedShift(null);
                      runLabInspection(shift, progress);
                    }}
                  >
                    Inspect Lab
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      const { shift, progress } = selectedShift;
                      setSelectedShift(null);
                      openHandoverModal(shift, progress);
                    }}
                  >
                    Complete Handover
                  </Button>
                </>
              )}
              <Button variant="outline" size="sm" onClick={() => setSelectedShift(null)}>
                Close
              </Button>
            </div>
          </div>
        )}
      </Modal>

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
