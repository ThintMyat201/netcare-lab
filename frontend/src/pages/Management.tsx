import React, { useState } from 'react';
import { Plus, Search, Monitor, Wifi, Archive, UserRoundCog, Save } from 'lucide-react';
import { useAuth } from '../context';
import { api, errorText, roleLabel } from '../lib/api';
import { PageTitle, Button, Modal, Field, Select, Status, ErrorBox, Loading, Empty, useData } from '../components/shared';

export function Assets() {
  const list = useData('/assets');
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('all');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const initial = { tag: '', name: '', kind: 'PC', lab_id: 'lab-1', model: '', ip: '' };
  const [form, setForm] = useState(initial);

  const submit = async (e: any) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await api.post('/assets', form);
      setOpen(false);
      setForm(initial);
      setNotice('Equipment registered into inventory.');
      list.load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const archive = async (a: any) => {
    if (!window.confirm(`Archive equipment ${a.tag}? Existing inspection logs and tickets will be retained.`)) return;
    setBusy(true);
    setError('');
    try {
      await api.patch(`/assets/${a.id}/archive`);
      setNotice(`${a.tag} archived successfully. Operational logs retained.`);
      list.load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const rows = list.data?.filter((a: any) =>
    (kind === 'all' || kind === 'archived'
      ? kind === 'archived'
        ? a.archived
        : !a.archived
      : !a.archived && a.kind === kind) &&
    (a.tag + ' ' + a.name + ' ' + a.lab_name).toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <PageTitle
        title="Hardware Inventory"
        subtitle="Monitored access points, workstations, and equipment operational records."
      >
        <Button id="add-asset" variant="primary" onClick={() => { setOpen(true); setError(''); }}>
          <Plus size={16} />Add Equipment
        </Button>
      </PageTitle>

      <ErrorBox error={list.error || (!open && error)} retry={list.load} />

      {notice && (
        <div className="success-box" data-testid="asset-confirmation">
          {notice}
        </div>
      )}

      <div className="listing-toolbar">
        <div className="filter-tabs">
          {[
            ['all', 'All Hardware'],
            ['AP', 'Access Points'],
            ['PC', 'Workstations'],
            ['archived', 'Archived']
          ].map(([key, label]) => (
            <button
              key={key}
              data-testid={`asset-filter-${key}`}
              className={kind === key ? 'active' : ''}
              onClick={() => setKind(key)}
            >
              {label}
              <span>
                {list.data?.filter((a: any) =>
                  key === 'archived' ? a.archived : !a.archived && (key === 'all' || a.kind === key)
                ).length || 0}
              </span>
            </button>
          ))}
        </div>

        <div className="search-field">
          <Search size={15} />
          <input
            data-testid="asset-search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search equipment by tag, name, or lab…"
          />
        </div>
      </div>

      {list.busy && !list.data ? (
        <Loading />
      ) : rows?.length ? (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>EQUIPMENT</th>
                <th>LAB LOCATION</th>
                <th>TYPE / MODEL</th>
                <th>IP ADDRESS</th>
                <th>STATUS</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((a: any) => (
                <tr key={a.id} data-testid={`asset-row-${a.id}`}>
                  <td>
                    <div className="asset-name">
                      <span className="asset-icon">{a.kind === 'PC' ? <Monitor size={16} /> : <Wifi size={16} />}</span>
                      <div>
                        <strong>{a.tag}</strong>
                        <small>{a.name}</small>
                      </div>
                    </div>
                  </td>
                  <td>{a.lab_name}</td>
                  <td>
                    {a.model || a.kind}
                    <small className="cell-sub">{a.kind === 'PC' ? 'Workstation' : 'Access Point'}</small>
                  </td>
                  <td className="mono small">{a.ip || '—'}</td>
                  <td>
                    <Status value={a.archived ? 'archived' : 'active'} id={`asset-state-${a.id}`} />
                  </td>
                  <td>
                    {!a.archived && (
                      <button
                        className="icon-button"
                        title="Archive equipment"
                        aria-label={`Archive ${a.tag}`}
                        data-testid={`archive-asset-${a.id}`}
                        disabled={busy}
                        onClick={() => archive(a)}
                      >
                        <Archive size={15} />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty text="No equipment found matching your criteria." />
      )}

      <Modal
        open={open}
        onClose={setOpen}
        title="Register Equipment"
        description="Campus network inventory · unique equipment tag required"
        id="asset-dialog"
      >
        <form onSubmit={submit}>
          <div className="form-grid">
            <Field label="Equipment Tag" id="asset-tag">
              <input
                required
                minLength={3}
                maxLength={40}
                id="asset-tag"
                data-testid="asset-tag"
                value={form.tag}
                onChange={e => setForm({ ...form, tag: e.target.value })}
                placeholder="e.g. PC-CL-A-11 or AP-CL-A-01"
              />
            </Field>
            <Field label="Equipment Type" id="asset-kind">
              <Select id="asset-kind" value={form.kind} onChange={(e: any) => setForm({ ...form, kind: e.target.value })}>
                <option value="PC">Workstation</option>
                <option value="AP">Access Point</option>
              </Select>
            </Field>
          </div>

          <Field label="Device Name" id="asset-name">
            <input
              required
              minLength={2}
              maxLength={80}
              id="asset-name"
              data-testid="asset-name"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Student Workstation 11"
            />
          </Field>

          <Field label="Assigned Lab" id="asset-lab">
            <Select id="asset-lab" value={form.lab_id} onChange={(e: any) => setForm({ ...form, lab_id: e.target.value })}>
              <option value="lab-1">Computing Lab A</option>
              <option value="lab-2">Computing Lab B</option>
              <option value="lab-3">Innovation Lab</option>
            </Select>
          </Field>

          <div className="form-grid">
            <Field label="Hardware Model (Optional)" id="asset-model">
              <input
                maxLength={80}
                data-testid="asset-model"
                id="asset-model"
                value={form.model}
                onChange={e => setForm({ ...form, model: e.target.value })}
                placeholder="e.g. Dell OptiPlex 7090"
              />
            </Field>
            <Field label="IP Address (Optional)" id="asset-ip">
              <input
                maxLength={45}
                data-testid="asset-ip"
                id="asset-ip"
                value={form.ip}
                onChange={e => setForm({ ...form, ip: e.target.value })}
                placeholder="e.g. 10.10.1.45"
              />
            </Field>
          </div>

          <ErrorBox error={error} />

          <Button id="save-asset" variant="primary" type="submit" disabled={busy}>
            <Save size={15} />
            {busy ? 'Saving…' : 'Register Equipment'}
          </Button>
        </form>
      </Modal>
    </>
  );
}

export function Team() {
  const { user } = useAuth();
  const list = useData('/users');
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const initial = { name: '', email: '', role: 'assistant', password: '' };
  const [form, setForm] = useState(initial);
  const [edit, setEdit] = useState({ role: 'assistant', active: true, password: '' });

  const submit = async (e: any) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (selected) {
        await api.patch(`/users/${selected.id}`, {
          role: edit.role,
          active: edit.active,
          ...(edit.password ? { password: edit.password } : {})
        });
        setNotice(`Account permissions updated for ${selected.name}.`);
      } else {
        await api.post('/users', form);
        setNotice('User account successfully created.');
        setForm(initial);
      }
      setOpen(false);
      setSelected(null);
      list.load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const rows = list.data?.filter((u: any) =>
    (u.name + ' ' + u.email + ' ' + u.role).toLowerCase().includes(search.toLowerCase())
  );

  return (
    <>
      <PageTitle
        title="Team & Access"
        subtitle="User accounts, permissions, and operational access roles."
      >
        <Button id="provision-user" variant="primary" onClick={() => { setSelected(null); setOpen(true); setError(''); }}>
          <Plus size={16} />Add Team Member
        </Button>
      </PageTitle>

      <ErrorBox error={list.error} retry={list.load} />

      {notice && (
        <div className="success-box" data-testid="user-confirmation">
          {notice}
        </div>
      )}

      <div className="page-search">
        <div className="search-field">
          <Search size={15} />
          <input
            data-testid="user-search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search team members by name, email, or role…"
          />
        </div>
        <span className="count-label" data-testid="team-count">
          {list.data?.filter((u: any) => u.active).length || 0} active · {list.data?.length || 0} total accounts
        </span>
      </div>

      {list.busy && !list.data ? (
        <Loading />
      ) : rows?.length ? (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>TEAM MEMBER</th>
                <th>ASSIGNED ROLE</th>
                <th>STATUS</th>
                <th>ACCOUNT TYPE</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((u: any) => (
                <tr data-testid={`user-row-${u.id}`} key={u.id}>
                  <td>
                    <div className="user-name">
                      <span className="avatar">
                        {u.name.split(' ').map((s: string) => s[0]).slice(0, 2).join('')}
                      </span>
                      <div>
                        <strong>{u.name}{u.id === user.id ? ' (you)' : ''}</strong>
                        <small>{u.email}</small>
                      </div>
                    </div>
                  </td>
                  <td>{roleLabel(u.role)}</td>
                  <td>
                    <Status value={u.active ? 'active' : 'inactive'} id={`user-status-${u.id}`} />
                  </td>
                  <td className="muted">{u.id === 'owner' ? 'Workspace Owner' : 'Standard Account'}</td>
                  <td>
                    <button
                      className="icon-button"
                      title="Edit account permissions"
                      aria-label={`Edit ${u.name}`}
                      data-testid={`edit-user-${u.id}`}
                      onClick={() => {
                        setSelected(u);
                        setEdit({ role: u.role, active: u.active, password: '' });
                        setError('');
                        setOpen(true);
                      }}
                    >
                      <UserRoundCog size={17} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty text="No team members match your search." />
      )}

      <Modal
        open={open}
        onClose={setOpen}
        title={selected ? 'Edit Account Permissions' : 'Create Team Account'}
        description={selected ? selected.email : 'Campus operations portal · create and assign account'}
        id="user-dialog"
      >
        <form onSubmit={submit}>
          {selected ? (
            <>
              <Field label="Assigned Role" id="edit-user-role">
                <Select
                  id="edit-user-role"
                  value={edit.role}
                  disabled={selected.id === user.id}
                  onChange={(e: any) => setEdit({ ...edit, role: e.target.value })}
                >
                  {['assistant', 'engineer', 'admin'].map(r => (
                    <option key={r} value={r}>{roleLabel(r)}</option>
                  ))}
                </Select>
              </Field>

              <Field label="Account Status" id="edit-user-active">
                <Select
                  id="edit-user-active"
                  disabled={selected.id === user.id}
                  value={String(edit.active)}
                  onChange={(e: any) => setEdit({ ...edit, active: e.target.value === 'true' })}
                >
                  <option value="true">Active</option>
                  <option value="false">Deactivated (Access Revoked)</option>
                </Select>
              </Field>

              <Field label="Reset Password (Leave empty to keep current)" id="edit-user-password">
                <input
                  type="password"
                  id="edit-user-password"
                  data-testid="edit-user-password"
                  minLength={10}
                  maxLength={72}
                  value={edit.password}
                  onChange={e => setEdit({ ...edit, password: e.target.value })}
                  placeholder="New password (10+ characters)"
                />
              </Field>

              <p className="permission-notice">
                Deactivation and password resets revoke active sessions immediately. Role updates apply on next session reload.
              </p>
            </>
          ) : (
            <>
              <Field label="Full Name" id="user-name">
                <input
                  data-testid="user-name"
                  id="user-name"
                  required
                  minLength={2}
                  maxLength={80}
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Maria Santos"
                />
              </Field>

              <Field label="Campus Email Address" id="user-email">
                <input
                  type="email"
                  id="user-email"
                  data-testid="user-email"
                  required
                  value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  placeholder="name@campus.edu.my"
                />
              </Field>

              <Field label="Assigned Role" id="user-role">
                <Select id="user-role" value={form.role} onChange={(e: any) => setForm({ ...form, role: e.target.value })}>
                  {['assistant', 'engineer', 'admin'].map(r => (
                    <option key={r} value={r}>{roleLabel(r)}</option>
                  ))}
                </Select>
              </Field>

              <Field label="Initial Password" id="user-password">
                <input
                  type="password"
                  data-testid="user-password"
                  id="user-password"
                  required
                  minLength={10}
                  maxLength={72}
                  value={form.password}
                  onChange={e => setForm({ ...form, password: e.target.value })}
                  placeholder="Minimum 10 characters"
                />
              </Field>
            </>
          )}

          <ErrorBox error={error} />

          <Button variant="primary" id="save-user" disabled={busy} type="submit">
            <Save size={15} />
            {busy ? 'Saving…' : selected ? 'Save Account Changes' : 'Create Account'}
          </Button>
        </form>
      </Modal>
    </>
  );
}