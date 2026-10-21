import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus,
  Search,
  Monitor,
  Wifi,
  Archive,
  UserRoundCog,
  Save,
  Lock,
  Pencil,
  UserX,
  UserCheck,
  Trash2,
  ShieldCheck,
  CheckCheck,
  X,
} from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
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

const USER_SCOPES = [
  'All Campus Systems',
  'Campus Core Network',
  'Core & AP Telemetry',
  'Computing Lab A',
  'Computing Lab B',
  'Innovation Lab',
];
const ROLE_DEFAULT_SCOPE: Record<string, string> = {
  admin: 'All Campus Systems',
  engineer: 'Core & AP Telemetry',
  assistant: 'Computing Lab A',
};
const ROLE_FILTERS: [string, string][] = [
  ['all', 'All'],
  ['admin', 'Administrators'],
  ['engineer', 'Network Engineers'],
  ['assistant', 'IT Assistants'],
];
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const initialsOf = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(part => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || '?';

type MemberForm = {
  name: string;
  email: string;
  role: string;
  scope: string;
  active: boolean;
  password: string;
};

const blankMember: MemberForm = {
  name: '',
  email: '',
  role: 'assistant',
  scope: ROLE_DEFAULT_SCOPE.assistant,
  active: true,
  password: '',
};

export function Team() {
  const { user } = useAuth();
  const list = useData('/users');
  const [members, setMembers] = useState<any[] | null>(null);
  const [roleFilter, setRoleFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState<'create' | 'edit' | null>(null);
  const [selected, setSelected] = useState<any>(null);
  const [form, setForm] = useState<MemberForm>(blankMember);
  const [removing, setRemoving] = useState<any>(null);
  const [error, setError] = useState('');
  const [rowError, setRowError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (Array.isArray(list.data)) setMembers(list.data);
  }, [list.data]);

  const all = useMemo(() => members || [], [members]);
  const isOwner = (u: any) => u?.id === 'owner';
  const isSelf = (u: any) => u?.id === user.id;
  const isProtected = (u: any) => isOwner(u) || isSelf(u);
  const protectedReason = (u: any) =>
    isOwner(u)
      ? 'Protected · Workspace Owner account cannot be suspended, demoted, or removed'
      : 'Protected · You cannot suspend, demote, or remove your own account';

  const counts = useMemo(
    () => ({
      all: all.length,
      admin: all.filter(u => u.role === 'admin').length,
      engineer: all.filter(u => u.role === 'engineer').length,
      assistant: all.filter(u => u.role === 'assistant').length,
    }),
    [all]
  );
  const activeCount = all.filter(u => u.active).length;

  const rows = all.filter(
    u =>
      (roleFilter === 'all' || u.role === roleFilter) &&
      `${u.name} ${u.email} ${u.role} ${roleLabel(u.role)} ${u.scope || ''}`.toLowerCase().includes(search.trim().toLowerCase())
  );

  const upsertLocal = (row: any) =>
    setMembers(prev => {
      const current = prev || [];
      return current.some(u => u.id === row.id) ? current.map(u => (u.id === row.id ? { ...u, ...row } : u)) : [...current, row];
    });

  const openCreate = () => {
    setSelected(null);
    setForm(blankMember);
    setError('');
    setMode('create');
  };

  const openEdit = (u: any) => {
    setSelected(u);
    setForm({
      name: u.name,
      email: u.email,
      role: u.role,
      scope: u.scope || ROLE_DEFAULT_SCOPE[u.role],
      active: !!u.active,
      password: '',
    });
    setError('');
    setMode('edit');
  };

  const closeForm = () => {
    setMode(null);
    setSelected(null);
  };

  const changeRole = (role: string) =>
    setForm(prev => ({
      ...prev,
      role,
      // Follow the role's default scope unless the admin already picked a custom assignment
      scope: !prev.scope || prev.scope === ROLE_DEFAULT_SCOPE[prev.role] ? ROLE_DEFAULT_SCOPE[role] : prev.scope,
    }));

  const emailTrimmed = form.email.trim().toLowerCase();
  const emailFormatError = emailTrimmed && !EMAIL_PATTERN.test(emailTrimmed) ? 'Enter a valid email address (e.g. name@campus.edu.my).' : '';
  const emailTaken =
    emailTrimmed && all.some(u => u.email?.toLowerCase() === emailTrimmed && u.id !== selected?.id)
      ? 'Another team member already uses this email address.'
      : '';
  const emailError = emailFormatError || emailTaken;
  const lockRole = mode === 'edit' && isProtected(selected) && selected?.role === 'admin';
  const lockStatus = mode === 'edit' && isProtected(selected);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (emailError || form.name.trim().length < 2) {
      setError(emailError || 'Full name must be at least 2 characters.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (mode === 'edit' && selected) {
        const payload: any = {
          name: form.name.trim(),
          email: emailTrimmed,
          scope: form.scope,
          ...(lockRole ? {} : { role: form.role }),
          ...(lockStatus ? {} : { active: form.active }),
          ...(form.password ? { password: form.password } : {}),
        };
        const r = await api.patch(`/users/${selected.id}`, payload);
        upsertLocal(r.data);
        setNotice(`Updated ${r.data.name} · ${roleLabel(r.data.role)} · ${r.data.scope}.`);
      } else {
        const r = await api.post('/users', {
          name: form.name.trim(),
          email: emailTrimmed,
          role: form.role,
          scope: form.scope,
          active: form.active,
          ...(form.password ? { password: form.password } : {}),
        });
        upsertLocal(r.data);
        setNotice(`Added team member ${r.data.name} as ${roleLabel(r.data.role)}.`);
      }
      closeForm();
      list.load();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const toggleStatus = async (u: any) => {
    if (isProtected(u)) return;
    setRowError('');
    try {
      const r = await api.patch(`/users/${u.id}`, { active: !u.active });
      upsertLocal(r.data);
      setNotice(`${r.data.name} is now ${r.data.active ? 'Active' : 'Suspended'}.`);
      list.load();
    } catch (err) {
      setRowError(errorText(err));
    }
  };

  const confirmRemove = async () => {
    if (!removing || isProtected(removing)) return;
    setBusy(true);
    setError('');
    try {
      await api.delete(`/users/${removing.id}`);
      setMembers(prev => (prev || []).filter(u => u.id !== removing.id));
      setNotice(`Removed team member ${removing.name}.`);
      setRemoving(null);
      list.load();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageTitle title="Team & Access" subtitle="Manage team member accounts, operational roles, campus assignments, and access status.">
        <Button id="provision-user" variant="primary" onClick={openCreate}>
          <Plus size={16} />
          Add Team Member
        </Button>
      </PageTitle>

      <ErrorBox error={list.error || rowError} retry={list.error ? list.load : undefined} />

      {notice && (
        <div className="success-box" data-testid="user-confirmation">
          <CheckCheck size={16} />
          <span>{notice}</span>
          <button className="text-button" data-testid="dismiss-user-confirmation" onClick={() => setNotice('')}>
            Dismiss
          </button>
        </div>
      )}

      <div className="team-toolbar">
        <div className="search-field">
          <Search size={15} />
          <input
            type="search"
            data-testid="user-search"
            aria-label="Search team members"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search team members by name, email, or role…"
          />
        </div>
        <div className="role-pills" role="group" aria-label="Filter by role">
          {ROLE_FILTERS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              data-testid={`role-filter-${key}`}
              aria-pressed={roleFilter === key}
              className={roleFilter === key ? 'active' : ''}
              onClick={() => setRoleFilter(key)}
            >
              {label}
              <span>{(counts as any)[key]}</span>
            </button>
          ))}
        </div>
        <span className="count-label" data-testid="team-count">
          {activeCount} active · {all.length} total accounts
        </span>
      </div>

      {list.busy && !members ? (
        <Loading />
      ) : rows.length ? (
        <div className="table-wrap">
          <table className="data-table team-table">
            <thead>
              <tr>
                <th className="pl-6">TEAM MEMBER</th>
                <th>ASSIGNED ROLE</th>
                <th>OPERATIONAL SCOPE / ASSIGNMENT</th>
                <th>STATUS</th>
                <th>ACCOUNT TYPE</th>
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {rows.map((u, index) => {
                const locked = isProtected(u);
                const isNearBottom = index >= rows.length - 2;
                return (
                  <tr data-testid={`user-row-${u.id}`} key={u.id} className={u.active ? '' : 'is-suspended'}>
                    <td className="pl-6">
                      <div className="user-name">
                        <span className="avatar w-9 h-9">{initialsOf(u.name)}</span>
                        <div>
                          <strong>
                            {u.name}
                            {isSelf(u) && <span className="you-badge">you</span>}
                          </strong>
                          <small>{u.email}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`role-badge role-${u.role}`} data-testid={`user-role-${u.id}`}>
                        {roleLabel(u.role)}
                      </span>
                    </td>
                    <td className="scope-cell">{u.scope || ROLE_DEFAULT_SCOPE[u.role]}</td>
                    <td>
                      <span className={`member-status ${u.active ? 'active' : 'suspended'}`} data-testid={`user-status-${u.id}`}>
                        <i />
                        {u.active ? 'Active' : 'Suspended'}
                      </span>
                    </td>
                    <td className="muted">
                      {isOwner(u) ? (
                        <span className="owner-type">
                          <ShieldCheck size={13} /> Workspace Owner
                        </span>
                      ) : (
                        'Standard Account'
                      )}
                    </td>
                    <td>
                      <DropdownMenu.Root modal={false}>
                        <DropdownMenu.Trigger asChild>
                          <button
                            className="icon-button"
                            title="Manage member"
                            aria-label={`Manage ${u.name}`}
                            data-testid={`edit-user-${u.id}`}
                          >
                            <UserRoundCog size={17} />
                          </button>
                        </DropdownMenu.Trigger>
                        <DropdownMenu.Portal>
                          <DropdownMenu.Content
                            className="member-menu z-50 bg-slate-900 border border-slate-700/80 shadow-2xl shadow-black/80 opacity-100"
                            side={isNearBottom ? 'top' : 'bottom'}
                            align="end"
                            sideOffset={6}
                            collisionPadding={16}
                            avoidCollisions
                          >
                            <DropdownMenu.Label className="member-menu-label">{u.name}</DropdownMenu.Label>
                            <DropdownMenu.Item className="member-menu-item" data-testid={`menu-edit-${u.id}`} onSelect={() => openEdit(u)}>
                              <Pencil size={14} /> Edit Member
                            </DropdownMenu.Item>
                            <DropdownMenu.Item
                              className="member-menu-item"
                              data-testid={`menu-status-${u.id}`}
                              disabled={locked}
                              title={locked ? protectedReason(u) : undefined}
                              onSelect={() => toggleStatus(u)}
                            >
                              {u.active ? <UserX size={14} /> : <UserCheck size={14} />}
                              {u.active ? 'Suspend Access' : 'Reactivate Access'}
                              {locked && (
                                <span className="menu-protected">
                                  <Lock size={11} /> Protected
                                </span>
                              )}
                            </DropdownMenu.Item>
                            <DropdownMenu.Separator className="member-menu-sep" />
                            <DropdownMenu.Item
                              className="member-menu-item danger"
                              data-testid={`menu-remove-${u.id}`}
                              disabled={locked}
                              title={locked ? protectedReason(u) : undefined}
                              onSelect={() => {
                                setError('');
                                setRemoving(u);
                              }}
                            >
                              <Trash2 size={14} /> Remove Member
                              {locked && (
                                <span className="menu-protected">
                                  <Lock size={11} /> Protected
                                </span>
                              )}
                            </DropdownMenu.Item>
                          </DropdownMenu.Content>
                        </DropdownMenu.Portal>
                      </DropdownMenu.Root>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty text="No team members match your search or role filter." />
      )}

      <Modal
        open={!!mode}
        onClose={(open: boolean) => !open && closeForm()}
        title={mode === 'edit' ? 'Edit Team Member' : 'Add Team Member'}
        description={
          mode === 'edit' ? `${selected?.email || ''} · update profile, role, assignment, and access` : 'Create a campus operations account and assign its role and scope'
        }
        id="user-dialog"
      >
        <form onSubmit={submit} noValidate>
          <div className="member-preview">
            <span className="avatar">{initialsOf(form.name)}</span>
            <div>
              <strong>{form.name.trim() || 'New team member'}</strong>
              <span className={`role-badge role-${form.role}`}>{roleLabel(form.role)}</span>
            </div>
          </div>

          <div className="form-grid">
            <Field label="Full Name" id="user-name">
              <input
                data-testid="user-name"
                id="user-name"
                required
                minLength={2}
                maxLength={80}
                autoComplete="name"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. Aisyah Rahman"
              />
            </Field>

            <Field label="Email Address" id="user-email">
              <input
                type="email"
                id="user-email"
                data-testid="user-email"
                required
                autoComplete="email"
                aria-invalid={!!emailError}
                aria-describedby={emailError ? 'user-email-error' : undefined}
                value={form.email}
                onChange={e => setForm({ ...form, email: e.target.value })}
                placeholder="name@campus.edu.my"
              />
            </Field>
          </div>
          {emailError && (
            <p className="field-error" id="user-email-error" data-testid="user-email-error">
              {emailError}
            </p>
          )}

          <div className="form-grid">
            <Field label="Assigned Role" id="user-role">
              <Select id="user-role" value={form.role} disabled={lockRole} onChange={(e: any) => changeRole(e.target.value)}>
                {['admin', 'engineer', 'assistant'].map(r => (
                  <option key={r} value={r}>
                    {roleLabel(r)}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Primary Assignment / Scope" id="user-scope">
              <Select id="user-scope" value={form.scope} onChange={(e: any) => setForm({ ...form, scope: e.target.value })}>
                {USER_SCOPES.map(s => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label={mode === 'edit' ? 'Account Status' : 'Initial Status'} id="user-active">
            <Select
              id="user-active"
              value={String(form.active)}
              disabled={lockStatus}
              onChange={(e: any) => setForm({ ...form, active: e.target.value === 'true' })}
            >
              <option value="true">Active</option>
              <option value="false">Inactive / Suspended</option>
            </Select>
          </Field>

          {(lockRole || lockStatus) && (
            <p className="protected-note" data-testid="user-protected-note">
              <Lock size={13} /> {protectedReason(selected)}. Name, email, and scope can still be edited.
            </p>
          )}

          <Field label={mode === 'edit' ? 'Reset Password (optional)' : 'Initial Password (optional)'} id="user-password">
            <input
              type="password"
              id="user-password"
              data-testid="user-password"
              minLength={10}
              maxLength={72}
              autoComplete="new-password"
              value={form.password}
              onChange={e => setForm({ ...form, password: e.target.value })}
              placeholder={mode === 'edit' ? 'Leave blank to keep current password' : 'Leave blank to auto-generate a secure temporary password'}
            />
          </Field>

          <p className="permission-notice">
            Suspending an account or resetting its password signs the member out immediately. Every change is recorded in the Activity Log.
          </p>

          <ErrorBox error={error} />

          <Button variant="primary" id="save-user" disabled={busy || !!emailError} type="submit">
            <Save size={15} />
            {busy ? 'Saving…' : mode === 'edit' ? 'Save Member Changes' : 'Add Team Member'}
          </Button>
        </form>
      </Modal>

      <Modal
        open={!!removing}
        onClose={(open: boolean) => !open && setRemoving(null)}
        title="Remove Team Member"
        description="This permanently deletes the account and signs the member out."
        id="remove-user-dialog"
      >
        {removing && (
          <>
            <p className="remove-confirm" data-testid="remove-user-confirm-text">
              Are you sure you want to remove <strong>{removing.name}</strong> ({roleLabel(removing.role)} · {removing.scope})? Their
              upcoming shifts will be cancelled; past tickets and inspection records are kept for audit.
            </p>
            <ErrorBox error={error} />
            <div className="confirm-actions">
              <Button id="cancel-remove-user" onClick={() => setRemoving(null)}>
                <X size={15} /> Cancel
              </Button>
              <Button variant="primary" className="danger-button" id="confirm-remove-user" disabled={busy} onClick={confirmRemove}>
                <Trash2 size={15} /> {busy ? 'Removing…' : 'Remove Member'}
              </Button>
            </div>
          </>
        )}
      </Modal>
    </>
  );
}
