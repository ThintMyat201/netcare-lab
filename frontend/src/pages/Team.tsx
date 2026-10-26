import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus,
  Search,
  UserRoundCog,
  Save,
  Lock,
  Pencil,
  UserX,
  UserCheck,
  Trash2,
  ShieldCheck,
  CheckCheck,
} from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useAuth } from '../context';
import { api, errorText, roleLabel } from '../lib/api';
import { PageTitle, Button, Modal, Field, Select, ErrorBox, Loading, Empty, useData } from '../components/shared';

const USER_SCOPES = [
  'All Campus Systems',
  'Campus Core Network',
  'Core & AP Telemetry',
  'Computing Lab A',
  'Computing Lab B',
  'Computing Lab C',
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

  useEffect(() => {
    const handleProfileUpdate = (e: any) => {
      const updatedUser = e.detail;
      if (updatedUser && updatedUser.id) {
        setMembers(prev => {
          if (!prev) return prev;
          return prev.map(m => (m.id === updatedUser.id ? { ...m, ...updatedUser } : m));
        });
      }
      list.load();
    };
    window.addEventListener('atlas-user-profile-updated', handleProfileUpdate);
    return () => window.removeEventListener('atlas-user-profile-updated', handleProfileUpdate);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
  const emailFormatError = emailTrimmed && !EMAIL_PATTERN.test(emailTrimmed) ? 'Enter a valid email address (e.g. name@apu.edu.my).' : '';
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
      <PageTitle title="Team & Access">
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
        <div className="table-wrap w-full overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <div className="w-full overflow-x-auto">
            <table className="data-table team-table w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-900/50 text-xs font-semibold tracking-wider text-slate-500 uppercase">
                  <th className="px-5 py-4">TEAM MEMBER</th>
                  <th className="px-5 py-4">ASSIGNED ROLE</th>
                  <th className="px-5 py-4">OPERATIONAL SCOPE / ASSIGNMENT</th>
                  <th className="px-5 py-4">STATUS</th>
                  <th className="px-5 py-4">ACCOUNT TYPE</th>
                  <th className="px-5 py-4" aria-label="Actions" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {rows.map((u, index) => {
                  const locked = isProtected(u);
                  const isNearBottom = index >= rows.length - 2;
                  return (
                    <tr
                      data-testid={`user-row-${u.id}`}
                      key={u.id}
                      className={`${u.active ? '' : 'is-suspended'} hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors`}
                    >
                      <td className="px-5 py-4">
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
                      <td className="px-5 py-4">
                        <span className={`role-badge role-${u.role}`} data-testid={`user-role-${u.id}`}>
                          {roleLabel(u.role)}
                        </span>
                      </td>
                      <td className="px-5 py-4 scope-cell">{u.scope || ROLE_DEFAULT_SCOPE[u.role]}</td>
                      <td className="px-5 py-4">
                        <span className={`member-status ${u.active ? 'active' : 'suspended'}`} data-testid={`user-status-${u.id}`}>
                          <i />
                          {u.active ? 'Active' : 'Suspended'}
                        </span>
                      </td>
                      <td className="px-5 py-4 muted">
                        {isOwner(u) ? (
                          <span className="owner-type">
                            <ShieldCheck size={13} /> Workspace Owner
                          </span>
                        ) : (
                          'Standard Account'
                        )}
                      </td>
                      <td className="px-5 py-4">
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
                            className="member-menu z-50 min-w-[220px] p-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 shadow-xl rounded-xl opacity-100"
                            side={isNearBottom ? 'top' : 'bottom'}
                            align="end"
                            sideOffset={6}
                            collisionPadding={16}
                            avoidCollisions
                          >
                            <DropdownMenu.Label className="member-menu-label px-2.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                              {u.name}
                            </DropdownMenu.Label>
                            <DropdownMenu.Item
                              className="member-menu-item flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/80 cursor-pointer outline-none transition-colors"
                              data-testid={`menu-edit-${u.id}`}
                              onSelect={() => openEdit(u)}
                            >
                              <Pencil size={14} /> Edit Member
                            </DropdownMenu.Item>
                            <DropdownMenu.Item
                              className="member-menu-item flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/80 cursor-pointer outline-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                              data-testid={`menu-status-${u.id}`}
                              disabled={locked}
                              title={locked ? protectedReason(u) : undefined}
                              onSelect={() => toggleStatus(u)}
                            >
                              {u.active ? <UserX size={14} /> : <UserCheck size={14} />}
                              {u.active ? 'Suspend Access' : 'Reactivate Access'}
                              {locked && (
                                <span className="menu-protected ml-auto inline-flex items-center gap-1 text-[10px] font-bold text-amber-500">
                                  <Lock size={11} /> Protected
                                </span>
                              )}
                            </DropdownMenu.Item>
                            <DropdownMenu.Separator className="member-menu-sep h-px my-1 bg-slate-100 dark:bg-slate-800" />
                            <DropdownMenu.Item
                              className="member-menu-item danger flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer outline-none transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                                <span className="menu-protected ml-auto inline-flex items-center gap-1 text-[10px] font-bold text-amber-500">
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
        </div>
      ) : (
        <Empty text="No team members match your search or role filter." />
      )}

      <Modal
        open={!!mode}
        onClose={(open: boolean) => !open && closeForm()}
        title={mode === 'edit' ? 'Edit Team Member' : 'Add Team Member'}
        id="user-dialog"
      >
        <form onSubmit={submit} noValidate className="flex flex-col gap-4 text-slate-900 dark:text-slate-100">
          {/* Header Profile Card */}
          <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50/80 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
            <span className="w-9 h-9 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-bold text-xs flex items-center justify-center flex-shrink-0 border border-blue-200 dark:border-blue-800">
              {initialsOf(form.name)}
            </span>
            <div className="min-w-0 flex-1 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <strong className="block text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                  {form.name.trim() || 'New team member'}
                </strong>
                <span className="text-xs text-slate-600 dark:text-slate-400 truncate block">
                  {form.email.trim() || 'No email provided'}
                </span>
              </div>
              <span className={`role-badge role-${form.role} text-[11px] font-semibold px-2.5 py-0.5 rounded-full flex-shrink-0`}>
                {roleLabel(form.role)}
              </span>
            </div>
          </div>

          {/* Form Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Row 1: Full Name | Email Address */}
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
                className="w-full rounded-lg px-3.5 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
              />
            </Field>

            <div>
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
                  placeholder="name@apu.edu.my"
                  className="w-full rounded-lg px-3.5 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
                />
              </Field>
              {emailError && (
                <p className="field-error text-xs text-red-500 mt-1" id="user-email-error" data-testid="user-email-error">
                  {emailError}
                </p>
              )}
            </div>

            {/* Row 2: Assigned Role | Primary Assignment / Scope */}
            <Field label="Assigned Role" id="user-role">
              <Select
                id="user-role"
                value={form.role}
                disabled={lockRole}
                onChange={(e: any) => changeRole(e.target.value)}
                className="w-full rounded-lg px-3.5 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500"
              >
                {['admin', 'engineer', 'assistant'].map(r => (
                  <option key={r} value={r} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
                    {roleLabel(r)}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Primary Assignment / Scope" id="user-scope">
              <Select
                id="user-scope"
                value={form.scope}
                onChange={(e: any) => setForm({ ...form, scope: e.target.value })}
                className="w-full rounded-lg px-3.5 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500"
              >
                {USER_SCOPES.map(s => (
                  <option key={s} value={s} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">
                    {s}
                  </option>
                ))}
              </Select>
            </Field>

            {/* Row 3: Account Status | Reset / Initial Password */}
            <Field label={mode === 'edit' ? 'Account Status' : 'Initial Status'} id="user-active">
              <Select
                id="user-active"
                value={String(form.active)}
                disabled={lockStatus}
                onChange={(e: any) => setForm({ ...form, active: e.target.value === 'true' })}
                className="w-full rounded-lg px-3.5 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 focus:outline-none focus:border-blue-500"
              >
                <option value="true" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">Active</option>
                <option value="false" className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100">Inactive / Suspended</option>
              </Select>
            </Field>

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
                placeholder={mode === 'edit' ? 'Leave blank to keep current' : 'Leave blank to auto-generate'}
                className="w-full rounded-lg px-3.5 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-blue-500"
              />
            </Field>
          </div>

          {(lockRole || lockStatus) && (
            <p className="protected-note flex items-center gap-2 p-2.5 rounded-lg text-xs font-medium bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20" data-testid="user-protected-note">
              <Lock size={13} className="flex-shrink-0" /> {protectedReason(selected)}. Name, email, and scope can still be edited.
            </p>
          )}

          {/* Security Notice Callout */}
          <div className="flex items-center gap-2.5 p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400">
            <ShieldCheck size={16} className="flex-shrink-0 text-slate-500 dark:text-slate-400" />
            <span>Suspending an account or resetting its password signs the member out immediately. All changes are logged.</span>
          </div>

          <ErrorBox error={error} />

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200 dark:border-slate-800">
            <Button
              type="button"
              variant="outline"
              onClick={() => closeForm()}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              id="save-user"
              disabled={busy || !!emailError}
              type="submit"
            >
              <Save size={14} />
              {busy ? 'Saving…' : mode === 'edit' ? 'Save Member Changes' : 'Add Team Member'}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={!!removing}
        onClose={(open: boolean) => !open && setRemoving(null)}
        title="Remove Team Member"
        id="remove-user-dialog"
      >
        {removing && (
          <div className="flex flex-col gap-4">
            <p className="remove-confirm text-sm text-slate-600 dark:text-slate-300" data-testid="remove-user-confirm-text">
              Are you sure you want to remove <strong className="font-semibold text-slate-900 dark:text-slate-100">{removing.name}</strong> ({roleLabel(removing.role)} · {removing.scope})? Their
              upcoming shifts will be cancelled; past tickets and inspection records are kept for audit.
            </p>
            <ErrorBox error={error} />
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200 dark:border-slate-800">
              <Button type="button" variant="outline" id="cancel-remove-user" onClick={() => setRemoving(null)}>
                Cancel
              </Button>
              <Button variant="danger" id="confirm-remove-user" disabled={busy} onClick={confirmRemove}>
                <Trash2 size={14} /> {busy ? 'Removing…' : 'Remove Member'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
