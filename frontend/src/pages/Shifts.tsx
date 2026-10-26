import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  CheckCheck,
  Clock3,
  UserRound,
  ClipboardCheck,
  ArrowRight,
  FileCheck2,
  ArrowUpRight,
  Monitor,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '../context';
import { api, errorText } from '../lib/api';
import {
  getTodayMytDateString,
  normalizeCampusShifts,
  saveShiftOverride,
  getLabInspectionProgress,
  findLocation,
} from '../lib/workflow';
import { PageTitle, Button, Modal, Field, Select, ErrorBox, Loading, Empty, useData } from '../components/shared';

export default function Shifts() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const list = useData('/shifts');
  const checklists = useData('/checklists');
  const assets = useData('/assets');

  const SESSION_WINDOWS: Record<string, { start: string; end: string }> = {
    morning: { start: '08:00', end: '12:00' },
    afternoon: { start: '12:00', end: '16:00' },
    evening: { start: '16:00', end: '20:00' },
  };

  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [form, setForm] = useState(() => {
    const today = getTodayMytDateString();
    return {
      assistant_id: '',
      lab_id: 'lab-1',
      date: today,
      session: 'morning' as 'morning' | 'afternoon' | 'evening',
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

  const add = async () => {
    setOpen(true);
    setError('');
    setForm(prev => ({
      ...prev,
      date: getTodayMytDateString(),
      session: 'morning',
    }));
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
    const win = SESSION_WINDOWS[form.session] || SESSION_WINDOWS.morning;
    const startIso = `${form.date}T${win.start}`;
    const endIso = `${form.date}T${win.end}`;
    try {
      await api.post('/shifts', {
        assistant_id: form.assistant_id,
        lab_id: form.lab_id,
        start: startIso,
        end: endIso,
      });
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

  const formatCompactShiftTime = (windowStr: string) => {
    if (!windowStr) return '—';
    const match = windowStr.match(/(\d{1,2}:\d{2}\s*[-–—]\s*\d{1,2}:\d{2})/);
    if (match) {
      return match[1].replace('-', '–');
    }
    return windowStr.replace(/^(Morning|Afternoon|Evening|Night)\s*Shift:\s*/i, '').replace(/\s*MYT\s*$/i, '').trim();
  };

  const formatDetailedShiftWindow = (windowStr: string) => {
    if (!windowStr) return '—';
    const timeMatch = windowStr.match(/(\d{1,2}:\d{2}\s*[-–—]\s*\d{1,2}:\d{2})/);
    const periodMatch = windowStr.match(/^(Morning|Afternoon|Evening|Night)/i);
    if (timeMatch && periodMatch) {
      return `${timeMatch[1].replace('-', '–')} MYT (${periodMatch[1]})`;
    }
    if (timeMatch) {
      return `${timeMatch[1].replace('-', '–')} MYT`;
    }
    return windowStr;
  };

  const selectedLabLoc = useMemo(() => {
    if (!selectedShift?.shift) return null;
    return findLocation(selectedShift.shift.lab_name || selectedShift.shift.lab_id);
  }, [selectedShift]);

  const targetWorkstations = useMemo(() => {
    if (!selectedShift) return [];
    if (selectedShift.progress?.labWorkstations?.length) {
      return selectedShift.progress.labWorkstations.slice(0, 4);
    }
    const loc = selectedLabLoc;
    const shortTag = loc?.short ? loc.short.replace('Lab ', 'CL-') : 'CL-A';
    return [1, 2, 3, 4].map(num => ({
      id: `pc-${shortTag.toLowerCase()}-0${num}`,
      tag: `PC-${shortTag}-0${num}`,
      name: `Workstation 0${num}`,
    }));
  }, [selectedShift, selectedLabLoc]);

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

      <div className={`listing-toolbar mb-4 flex items-center ${user.role === 'assistant' ? 'justify-between' : 'justify-end'} gap-3`}>
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
        <div className="shifts-table-card-wrapper w-full overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-900 shadow-sm text-slate-900 dark:text-slate-100">
          <div className="w-full overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse clean-shifts-table">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-900/50 text-xs font-semibold tracking-wider text-slate-500 uppercase">
                  <th className="px-5 py-4" style={{ width: '34%' }}>ROOM</th>
                  <th className="px-5 py-4" style={{ width: '22%' }}>ASSISTANT</th>
                  <th className="px-5 py-4" style={{ width: '18%' }}>SHIFT TIME</th>
                  <th className="px-5 py-4" style={{ width: '14%' }}>STATUS</th>
                  <th className="px-5 py-4 text-right" style={{ width: '12%' }}>ACTION</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {rows.map((s: any) => {
                  const progress = getLabInspectionProgress(s.lab_id, s.lab_name, checklists.data, assets.data);
                  const isAcknowledged = Boolean(s.acknowledged_at);
                  const isCompleted = s.lifecycle === 'completed' || Boolean(s.completed_at);

                  const statusKey =
                    s.lifecycle === 'cancelled'
                      ? 'cancelled'
                      : isCompleted
                      ? 'completed'
                      : isAcknowledged
                      ? 'on_duty'
                      : 'pending_ack';

                  const statusLabel =
                    s.lifecycle === 'cancelled'
                      ? 'Cancelled'
                      : isCompleted
                      ? 'Completed'
                      : isAcknowledged
                      ? 'On Duty'
                      : 'Pending';

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
                        <span className="font-semibold text-slate-900 dark:text-slate-100 shift-lab-text">
                          {labRoomText}
                        </span>
                      </td>
                      <td className="px-5 py-4 shift-cell-assistant whitespace-nowrap">
                        <span className="text-slate-700 dark:text-slate-300 font-medium shift-assistant-text">
                          {s.assistant_name}
                        </span>
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        <span
                          className="font-mono text-xs text-slate-600 dark:text-slate-400 shift-window-text"
                          data-testid={`shift-window-${s.id}`}
                        >
                          {formatCompactShiftTime(s.shift_window)}
                        </span>
                      </td>
                      <td className="px-5 py-4 whitespace-nowrap">
                        <span
                          data-testid={`shift-status-${s.id}`}
                          className={`status ${statusKey}`}
                          id={`shift-status-${s.id}`}
                        >
                          <i />
                          {statusLabel}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-right whitespace-nowrap text-xs" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-end">
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
        title={
          (() => {
            const s = selectedShift?.shift;
            if (!s) return 'Shift Details';
            const loc = selectedLabLoc;
            const isAcknowledged = Boolean(s.acknowledged_at);
            const isCompleted = s.lifecycle === 'completed' || Boolean(s.completed_at);
            const statusKey =
              s.lifecycle === 'cancelled'
                ? 'cancelled'
                : isCompleted
                ? 'completed'
                : isAcknowledged
                ? 'on_duty'
                : 'pending_ack';
            const statusLabel =
              s.lifecycle === 'cancelled'
                ? 'Cancelled'
                : isCompleted
                ? 'Completed'
                : isAcknowledged
                ? 'On Duty'
                : 'Pending Acknowledgement';

            return (
              <div className="flex flex-wrap items-center gap-2.5">
                {loc?.code && (
                  <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold border border-slate-200 dark:border-slate-700">
                    {loc.code}
                  </span>
                )}
                <span className="text-base font-bold text-slate-900 dark:text-slate-100">
                  {loc?.name || s.lab_name}
                </span>
                <span className={`status ${statusKey} text-[11px]`}>
                  <i />
                  {statusLabel}
                </span>
              </div>
            );
          })()
        }
        id="shift-detail-dialog"
      >
        {selectedShift && (() => {
          const s = selectedShift.shift;
          const progress = selectedShift.progress;
          const isAcknowledged = Boolean(s.acknowledged_at);
          const isCompleted = s.lifecycle === 'completed' || Boolean(s.completed_at);
          const displayChecked = isAcknowledged ? progress.checked : 0;
          const percent = isAcknowledged ? progress.percent : 0;
          const isAllChecked = isAcknowledged && progress.checked >= progress.required;
          const checkedAssetTags = new Set((progress.labChecks || []).map((c: any) => c.asset_tag).filter(Boolean));
          const checkedAssetIds = new Set((progress.labChecks || []).map((c: any) => c.asset_id).filter(Boolean));

          return (
            <div className="flex flex-col gap-3.5">
              {/* 1. Compact 3-Column Summary Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                <div className="flex flex-col">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    Assigned Assistant
                  </span>
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 mt-1 flex items-center gap-1.5">
                    <UserRound size={14} className="text-slate-400" />
                    {s.assistant_name || 'Unassigned'}
                  </span>
                </div>

                <div className="flex flex-col">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    Shift Window
                  </span>
                  <span className="text-sm font-medium text-slate-900 dark:text-slate-100 mt-1 flex items-center gap-1.5">
                    <Clock3 size={14} className="text-slate-400" />
                    <span className="font-mono text-xs">{formatDetailedShiftWindow(s.shift_window)}</span>
                  </span>
                </div>

                <div className="flex flex-col">
                  <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    Inspection Progress
                  </span>
                  <div className="mt-1">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                        {displayChecked} / {progress.required} Checked
                      </span>
                      <span className="font-mono text-[11px] text-slate-500">{percent}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* 2. Shift Inspection Scope (2x2 Grid) */}
              <div className="flex flex-col gap-2 mt-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <ClipboardCheck size={14} className="text-slate-400" />
                    Shift Inspection Scope ({displayChecked} / 4 Workstations)
                  </span>
                  {isAcknowledged && !isCompleted && user.role === 'assistant' && (
                    <span className="text-[11px] text-slate-400">
                      Requires 4 workstations verified
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  {targetWorkstations.map((pc: any) => {
                    const isVerified = isCompleted || (isAcknowledged && (checkedAssetIds.has(pc.id) || checkedAssetTags.has(pc.tag)));
                    return (
                      <div
                        key={pc.id || pc.tag}
                        className={`flex items-center justify-between p-2.5 rounded-lg border text-xs transition-colors ${
                          isVerified
                            ? 'border-emerald-200 dark:border-emerald-800/50 bg-emerald-50/40 dark:bg-emerald-950/20'
                            : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Monitor size={14} className={isVerified ? 'text-emerald-500 flex-shrink-0' : 'text-slate-400 flex-shrink-0'} />
                          <div className="min-w-0 truncate">
                            <span className="font-mono font-semibold text-slate-900 dark:text-slate-100 block truncate">
                              {pc.tag}
                            </span>
                            <span className="text-[11px] text-slate-500 block truncate">
                              {pc.name || 'Workstation'}
                            </span>
                          </div>
                        </div>
                        <span
                          className={`flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${
                            isVerified
                              ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          {isVerified ? (
                            <>
                              <CheckCircle2 size={11} className="text-emerald-500" />
                              Verified
                            </>
                          ) : (
                            'Unchecked'
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 3. Handover Notes if present */}
              {s.handover_notes && (
                <div className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 text-xs mt-1" data-testid={`shift-handover-${s.id}`}>
                  <div className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-200 mb-1">
                    <FileCheck2 size={14} className="text-emerald-500" />
                    Handover Summary
                  </div>
                  <p className="text-slate-600 dark:text-slate-400 leading-relaxed">{s.handover_notes}</p>
                </div>
              )}

              {/* 4. Clean Action Footer (Single Top Border) */}
              <div className="flex items-center justify-end gap-2.5 mt-3 pt-3.5 border-t border-slate-200 dark:border-slate-800/80">
                {user.role === 'admin' && !s.cancelled && (
                  <Button
                    variant="danger"
                    size="sm"
                    id={`cancel-shift-modal-${s.id}`}
                    disabled={busy}
                    onClick={() => {
                      setSelectedShift(null);
                      cancelShift(s);
                    }}
                  >
                    Cancel Shift
                  </Button>
                )}

                {user.role === 'assistant' && !isAcknowledged && !s.cancelled && (
                  <Button
                    variant="primary"
                    size="sm"
                    id={`ack-shift-modal-${s.id}`}
                    disabled={busy}
                    onClick={() => {
                      setSelectedShift(null);
                      acknowledgeShift(s);
                    }}
                  >
                    <CheckCheck size={14} className="mr-1" /> Acknowledge Shift
                  </Button>
                )}

                {user.role === 'assistant' && isAcknowledged && !isCompleted && !s.cancelled && (
                  <>
                    <Button
                      variant="primary"
                      size="sm"
                      id={`run-shift-inspection-modal-${s.id}`}
                      onClick={() => {
                        setSelectedShift(null);
                        runLabInspection(s, progress);
                      }}
                    >
                      Run Lab Inspection <ArrowRight size={13} className="ml-1 inline" />
                    </Button>
                    {isAllChecked && (
                      <Button
                        variant="secondary"
                        size="sm"
                        id={`complete-shift-modal-${s.id}`}
                        onClick={() => {
                          setSelectedShift(null);
                          openHandoverModal(s, progress);
                        }}
                      >
                        Complete Handover
                      </Button>
                    )}
                  </>
                )}

                <Button variant="outline" size="sm" onClick={() => setSelectedShift(null)}>
                  Close
                </Button>
              </div>
            </div>
          );
        })()}
      </Modal>

      <Modal
        open={!!handoverShift}
        onClose={() => setHandoverShift(null)}
        title="Complete Shift & Submit Handover Note"
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
                  </option>
                ))}
            </Select>
          </Field>

          <Field label="Assigned Lab" id="shift-lab">
            <Select
              id="shift-lab"
              required
              value={form.lab_id}
              onChange={(e: any) => setForm({ ...form, lab_id: e.target.value })}
            >
              <option value="lab-1">B-04-03 · Computing Lab A</option>
              <option value="lab-2">B-04-04 · Computing Lab B</option>
              <option value="lab-4">B-04-05 · Computing Lab C</option>
              <option value="lab-3">Tech Lab 5-02 · Innovation Lab</option>
            </Select>
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Shift Date" id="shift-date">
              <input
                type="date"
                required
                id="shift-date"
                data-testid="shift-date"
                value={form.date}
                onChange={e => setForm({ ...form, date: e.target.value })}
              />
            </Field>

            <Field label="Shift Window" id="shift-window">
              <Select
                id="shift-window"
                value={form.session}
                onChange={(e: any) => setForm({ ...form, session: e.target.value })}
              >
                <option value="morning">Morning (08:00 – 12:00)</option>
                <option value="afternoon">Afternoon (12:00 – 16:00)</option>
                <option value="evening">Evening (16:00 – 20:00)</option>
              </Select>
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
