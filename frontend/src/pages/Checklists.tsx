import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Plus, Check, CheckCheck, X, Monitor, ClipboardCheck, ArrowUpRight, Send } from 'lucide-react';
import { useAuth } from '../context';
import { api, errorText, time } from '../lib/api';
import { PageTitle, Button, Modal, Field, Select, ErrorBox, Loading, Empty, useData } from '../components/shared';

const categories = [
  ['power', 'Power & Boot Sequence', 'Powers on smoothly and boots OS without errors'],
  ['display', 'Monitor & Display', 'Screen is clear, properly colored, and responsive'],
  ['peripherals', 'Keyboard & Mouse', 'All keys, wheel, and pointer buttons respond accurately'],
  ['network', 'Campus Network', 'Successfully connects to campus network with valid IP'],
  ['software', 'Required Applications', 'Required lab software packages launch and run normally']
];

const drafts: Record<string, any> = {};

export default function Checklists() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const { data, error, busy, load } = useData('/checklists');
  const assets = useData('/assets');

  const [open, setOpen] = useState(params.has('new'));
  const [draft, setDraft] = useState(() => drafts[user.id] || { asset_id: '', checks: {}, notes: '', request_id: crypto.randomUUID() });
  const [sending, setSending] = useState(false);
  const [locked, setLocked] = useState(false);
  const [formError, setFormError] = useState('');
  const [success, setSuccess] = useState<any>(null);
  const [selected, setSelected] = useState<any>(null);

  useEffect(() => {
    drafts[user.id] = draft;
  }, [draft, user.id]);

  const update = (value: any) => setDraft({ ...draft, ...value });

  const submit = async (e: any) => {
    e.preventDefault();
    setSending(true);
    setLocked(true);
    setFormError('');
    try {
      const r = await api.post('/checklists', draft);
      setSuccess(r.data);
      setDraft({ asset_id: '', checks: {}, notes: '', request_id: crypto.randomUUID() });
      setLocked(false);
      load();
    } catch (e: any) {
      setFormError(errorText(e));
      if (e.response) setLocked(false);
    } finally {
      setSending(false);
    }
  };

  const start = () => {
    setSuccess(null);
    setOpen(true);
  };

  return (
    <>
      <PageTitle
        title="Equipment Checklists"
        subtitle="Daily workstation inspections and automated fault reporting."
      >
        <Button id="new-checklist" variant="primary" onClick={start}>
          <Plus size={16} />Start Inspection
        </Button>
      </PageTitle>

      <ErrorBox error={error} retry={load} />

      <div className="summary-strip">
        <span><ClipboardCheck size={18} /><strong>{data?.length || 0}</strong> inspections completed</span>
        <span><i className="tiny-dot green" />{data?.filter((c: any) => c.result === 'passed').length || 0} all checks passed</span>
        <span><i className="tiny-dot amber" />{data?.filter((c: any) => c.result === 'failed').length || 0} with reported faults</span>
      </div>

      {busy && !data ? (
        <Loading />
      ) : data?.length ? (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>WORKSTATION</th>
                <th>INSPECTED BY</th>
                <th>OUTCOME</th>
                <th>LINKED TICKETS</th>
                <th>SUBMITTED (MYT)</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.map((c: any) => (
                <tr key={c.id} data-testid={`checklist-row-${c.id}`}>
                  <td>
                    <div className="asset-name">
                      <span className="asset-icon"><Monitor size={17} /></span>
                      <div>
                        <strong>{c.asset_tag}</strong>
                        <small>{c.lab_name}</small>
                      </div>
                    </div>
                  </td>
                  <td>{c.created_by_name}</td>
                  <td>
                    <span
                      className={`status ${c.result === 'passed' ? 'online' : 'congested'}`}
                      data-testid={`checklist-result-${c.id}`}
                    >
                      <i />
                      {c.result === 'passed' ? 'All Checks Passed' : 'Faults Reported'}
                    </span>
                  </td>
                  <td>
                    {c.tickets.length ? (
                      c.tickets.map((t: any) => (
                        <Link
                          className="inline-link"
                          data-testid={`checklist-ticket-${c.id}-${t.id}`}
                          key={t.id}
                          to={`/tickets?ticket=${t.id}`}
                        >
                          {t.number}{' '}
                        </Link>
                      ))
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="mono">{time(c.created_at, true)}</td>
                  <td>
                    <button
                      className="icon-button"
                      title="View inspection details"
                      aria-label="View inspection details"
                      data-testid={`view-checklist-${c.id}`}
                      onClick={() => setSelected(c)}
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
        <Empty text="No equipment inspections recorded yet." />
      )}

      <Modal
        open={open}
        onClose={setOpen}
        title={success ? 'Inspection Confirmed' : 'New Equipment Inspection'}
        description="Workstation inspection · Campus operational record"
        id="checklist-dialog"
      >
        {success ? (
          <div className="checklist-success" data-testid="checklist-confirmation">
            <span className="success-icon"><CheckCheck size={32} /></span>
            <h3>{success.asset_tag}</h3>
            <p>
              {success.replayed
                ? 'Existing inspection record confirmed.'
                : 'Workstation inspection successfully recorded.'}
            </p>
            {success.tickets.length ? (
              <>
                <p>{success.tickets.length} incident ticket(s) automatically created or linked:</p>
                {success.tickets.map((t: any) => (
                  <Link
                    className="linked-ticket"
                    data-testid={`success-ticket-${t.id}`}
                    key={t.id}
                    to={`/tickets?ticket=${t.id}`}
                  >
                    {t.number} · {t.category}
                    <ArrowUpRight size={15} />
                  </Link>
                ))}
              </>
            ) : (
              <p>All five verification checks passed.</p>
            )}
            <Button id="checklist-done" variant="primary" onClick={() => setOpen(false)}>
              Done
            </Button>
          </div>
        ) : (
          <form onSubmit={submit}>
            <Field label="Workstation" id="checklist-asset">
              <Select
                id="checklist-asset"
                value={draft.asset_id}
                required
                disabled={locked || sending}
                onChange={(e: any) => update({ asset_id: e.target.value })}
              >
                <option value="">Select a workstation…</option>
                {assets.data?.filter((a: any) => a.kind === 'PC' && !a.archived).map((a: any) => (
                  <option value={a.id} key={a.id}>
                    {a.tag} · {a.lab_name}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="checklist-subhead">
              <span>INSPECTION CHECKLIST</span>
              <button
                type="button"
                className="text-button"
                data-testid="mark-all-passed"
                disabled={locked || sending}
                onClick={() => update({ checks: Object.fromEntries(categories.map(([c]) => [c, 'pass'])) })}
              >
                <CheckCheck size={14} />Pass All Checks
              </button>
            </div>

            <div className="checklist-items">
              {categories.map(([key, label, sub]) => (
                <div className="checklist-item" key={key}>
                  <div>
                    <strong>{label}</strong>
                    <small>{sub}</small>
                  </div>
                  <div className="check-choices">
                    {['pass', 'fail'].map(v => (
                      <button
                        type="button"
                        disabled={locked || sending}
                        key={v}
                        className={draft.checks[key] === v ? `selected ${v}` : ''}
                        aria-pressed={draft.checks[key] === v}
                        data-testid={`check-${key}-${v}`}
                        onClick={() => update({ checks: { ...draft.checks, [key]: v } })}
                      >
                        {v === 'pass' ? <Check size={15} /> : <X size={15} />}
                        <span>{v === 'pass' ? 'Pass' : 'Fail'}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <Field label="Inspection Notes (Optional)" id="checklist-notes">
              <textarea
                data-testid="checklist-notes"
                id="checklist-notes"
                maxLength={2000}
                value={draft.notes}
                disabled={locked || sending}
                onChange={e => update({ notes: e.target.value })}
                placeholder="Add observations, hardware issues, or notes…"
                rows={3}
              />
            </Field>

            <ErrorBox error={formError || assets.error} />

            {locked && !sending && (
              <p className="notice" data-testid="draft-retry-notice">
                Draft retained. Retry the same submission to confirm whether it was saved.
              </p>
            )}

            <div className="form-footer">
              <span>{Object.keys(draft.checks).length} / 5 checks completed</span>
              <Button
                type="submit"
                id="submit-checklist"
                variant="primary"
                disabled={sending || !draft.asset_id || Object.keys(draft.checks).length !== 5}
              >
                <Send size={15} />
                {sending ? 'Saving…' : locked ? 'Retry Submission' : 'Submit Inspection'}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.asset_tag || 'Inspection Record'}
        description="Verified workstation inspection log"
        id="checklist-detail-dialog"
      >
        {selected && (
          <>
            <p data-testid="checklist-detail-author">
              {selected.created_by_name} · {time(selected.created_at, true)} MYT
            </p>
            {categories.map(([key, label]) => (
              <div className="detail-line" data-testid={`saved-check-${key}`} key={key}>
                <span>{label}</span>
                <span className={`status ${selected.checks[key] === 'pass' ? 'online' : 'offline'}`}>
                  {selected.checks[key] === 'pass' ? 'Passed' : 'Failed'}
                </span>
              </div>
            ))}
            <p className="notes-block" data-testid="saved-checklist-notes">
              {selected.notes || 'No additional notes provided.'}
            </p>
          </>
        )}
      </Modal>
    </>
  );
}