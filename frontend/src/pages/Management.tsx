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
  MapPin,
  Cpu,
  GraduationCap,
  UtensilsCrossed,
  Bus,
  SlidersHorizontal,
  ChevronRight,
  Sparkles,
  ArrowUpRight,
} from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useAuth } from '../context';
import { api, errorText, roleLabel } from '../lib/api';
import { PageTitle, Button, Modal, Field, Select, Status, ErrorBox, Loading, Empty, useData } from '../components/shared';
import {
  CAMPUS_LOCATIONS,
  AP_LOCATION_GROUPS,
  ZONE_FILTERS,
  ZONE_GROUP_LABELS,
  findLocation,
  zoneGroupOf,
  matchesZone,
  vlanFor,
  dhcpScopePreview,
  networkLabel,
  computeNextDevice,
} from '../lib/workflow';

const ZONE_ICONS: Record<string, any> = {
  labs: Cpu,
  academic: GraduationCap,
  common: UtensilsCrossed,
  outdoor: Bus,
};

const MAC_PATTERN = /^[0-9A-Fa-f]{2}([:-]?)[0-9A-Fa-f]{2}(\1[0-9A-Fa-f]{2}){4}$/;
const SERIAL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9\-_/]{3,39}$/;

export const ZoneBadge = ({ asset, testId }: { asset: any; testId?: string }) => {
  const zone = zoneGroupOf(asset);
  const Icon = ZONE_ICONS[zone] || MapPin;
  return (
    <span className={`zone-badge zone-${zone}`} data-testid={testId} title={ZONE_GROUP_LABELS[zone]}>
      <Icon size={12} />
      {asset.lab_name || findLocation(asset.lab_id)?.name || 'Unassigned'}
    </span>
  );
};

export function Assets() {
  const list = useData('/assets');
  const [open, setOpen] = useState(false);
  const [detailsAsset, setDetailsAsset] = useState<any | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const isDrawerEditing = isEditing;
  const setIsDrawerEditing = setIsEditing;
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState('all');
  const [locFilter, setLocFilter] = useState('all');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const initial = { tag: '', name: '', kind: 'PC', lab_id: 'lab-1', model: '', mac: '', placement: '' };
  const [form, setForm] = useState(initial);

  const [editForm, setEditForm] = useState({
    tag: '',
    name: '',
    kind: 'PC',
    model: '',
    lab_id: 'lab-1',
    placement: '',
    mac: '',
  });

  const selectedLocation = findLocation(form.lab_id);
  const locationChoices = useMemo(
    () => CAMPUS_LOCATIONS.filter(l => form.kind === 'AP' || l.zone_group === 'labs'),
    [form.kind]
  );

  const editLocationChoices = useMemo(
    () => CAMPUS_LOCATIONS.filter(l => editForm.kind === 'AP' || l.zone_group === 'labs'),
    [editForm.kind]
  );

  const openAddModal = (targetLabId?: string) => {
    const labId = targetLabId || form.lab_id || 'lab-1';
    const next = computeNextDevice(form.kind, labId, list.data || []);
    setForm({
      tag: next.tag,
      name: next.name,
      kind: form.kind,
      lab_id: labId,
      model: next.model,
      mac: '',
      placement: next.placement,
    });
    setError('');
    setOpen(true);
  };

  const changeKind = (nextKind: string) => {
    const keepLocation = nextKind === 'AP' || findLocation(form.lab_id)?.zone_group === 'labs';
    const targetLab = keepLocation ? form.lab_id : 'lab-1';
    const next = computeNextDevice(nextKind, targetLab, list.data || []);
    setForm({
      ...form,
      kind: nextKind,
      lab_id: targetLab,
      tag: next.tag,
      name: next.name,
      model: next.model,
      placement: next.placement,
    });
  };

  const changeLocation = (nextLabId: string) => {
    const next = computeNextDevice(form.kind, nextLabId, list.data || []);
    setForm({
      ...form,
      lab_id: nextLabId,
      tag: next.tag,
      name: next.name,
      model: next.model,
      placement: next.placement,
    });
  };

  const changeEditKind = (nextKind: string) => {
    const keepLocation = nextKind === 'AP' || findLocation(editForm.lab_id)?.zone_group === 'labs';
    setEditForm({ ...editForm, kind: nextKind, lab_id: keepLocation ? editForm.lab_id : 'lab-1' });
  };

  const submit = async (e: any) => {
    e.preventDefault();
    const hwId = form.mac.trim();
    if (hwId && !MAC_PATTERN.test(hwId) && !SERIAL_PATTERN.test(hwId)) {
      setError('Enter a valid MAC address (AA:BB:CC:11:22:33) or serial tag (4–40 letters, digits, - _ /), or leave blank to auto-generate.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await api.post('/assets', { ...form, mac: hwId, placement: form.placement.trim() });
      const created = res.data || {};
      setOpen(false);
      setForm(initial);
      setNotice(
        `${created.tag || form.tag.toUpperCase()} registered in ${created.lab_name || selectedLocation?.name} · DHCP leased VLAN ${
          created.vlan || vlanFor(form.kind)
        } · ${created.ip || 'pending'} · Hardware ID ${created.mac || 'auto-generated'}.`
      );
      list.load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const handleOpenDetails = (a: any, editMode: boolean = false) => {
    setDetailsAsset(a);
    setIsEditing(editMode);
    setEditForm({
      tag: a.tag || '',
      name: a.name || a.tag || '',
      kind: a.kind || 'PC',
      model: a.model || '',
      lab_id: a.lab_id || 'lab-1',
      placement: a.placement || '',
      mac: a.mac || '',
    });
    setError('');
  };

  const startEdit = (assetToEdit?: any) => {
    const a = assetToEdit || detailsAsset;
    if (!a) return;
    setEditForm({
      tag: a.tag || '',
      name: a.name || a.tag || '',
      kind: a.kind || 'PC',
      model: a.model || '',
      lab_id: a.lab_id || 'lab-1',
      placement: a.placement || '',
      mac: a.mac || '',
    });
    setError('');
    setIsEditing(true);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detailsAsset) return;
    const hwId = editForm.mac.trim();
    if (hwId && !MAC_PATTERN.test(hwId) && !SERIAL_PATTERN.test(hwId)) {
      setError('Enter a valid MAC address (AA:BB:CC:11:22:33) or serial tag (4–40 letters, digits, - _ /).');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await api.patch(`/assets/${detailsAsset.id}`, {
        tag: editForm.tag.trim().toUpperCase(),
        name: editForm.name?.trim() || editForm.tag.trim().toUpperCase(),
        kind: editForm.kind,
        model: editForm.model.trim(),
        lab_id: editForm.lab_id,
        placement: editForm.placement.trim(),
        mac: hwId,
      });
      const updated = res.data || {};
      setDetailsAsset(updated);
      setIsEditing(false);
      setNotice(`Equipment ${updated.tag || editForm.tag} updated successfully.`);
      list.load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const submitEdit = handleSaveEdit;

  const archive = async (a: any) => {
    if (!window.confirm(`Archive equipment ${a.tag}? Existing inspection logs and tickets will be retained.`)) return;
    setBusy(true);
    setError('');
    try {
      await api.patch(`/assets/${a.id}/archive`);
      if (detailsAsset?.id === a.id) setDetailsAsset(null);
      setNotice(`${a.tag} archived successfully. Operational logs retained and DHCP lease released.`);
      list.load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const restoreAsset = async (a: any) => {
    setBusy(true);
    setError('');
    try {
      await api.patch(`/assets/${a.id}`, { archived: false });
      if (detailsAsset?.id === a.id) {
        setDetailsAsset({ ...detailsAsset, archived: false });
      }
      setNotice(`${a.tag} restored to active inventory.`);
      list.load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (a: any) => {
    if (!window.confirm(`Permanently delete equipment ${a.tag}? This cannot be undone.`)) return;
    setBusy(true);
    setError('');
    try {
      await api.delete(`/assets/${a.id}`);
      if (detailsAsset?.id === a.id) setDetailsAsset(null);
      setNotice(`${a.tag} deleted from system inventory.`);
      list.load();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const matchesKind = (a: any, key: string) =>
    key === 'archived' ? a.archived : !a.archived && (key === 'all' || a.kind === key);

  const matchesLocation = (a: any) => {
    if (locFilter === 'all') return true;
    const loc = findLocation(a.lab_id) || findLocation(a.lab_name);
    return a.lab_id === locFilter || a.lab_name === locFilter || loc?.id === locFilter;
  };

  const query = search.trim().toLowerCase();
  const matchesSearch = (a: any) => {
    if (!query) return true;
    const loc = findLocation(a.lab_id) || findLocation(a.lab_name);
    const haystack = [
      a.tag,
      a.name,
      a.lab_name,
      loc?.name,
      loc?.code,
      loc?.block,
      loc?.level,
      a.placement,
      a.mac,
      a.ip,
      a.model,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return query.split(/\s+/).every(term => haystack.includes(term));
  };

  const all = Array.isArray(list.data) ? list.data : [];
  const rows = all.filter((a: any) => matchesKind(a, kind) && matchesLocation(a) && matchesSearch(a));

  return (
    <>
      <PageTitle
        title="Hardware Inventory"
      >
        <Button
          id="add-asset"
          variant="primary"
          onClick={() => openAddModal()}
        >
          <Plus size={16} />
          Add Equipment
        </Button>
      </PageTitle>

      <ErrorBox error={list.error || (!open && !detailsAsset && error)} retry={list.load} />

      {notice && (
        <div className="success-box" data-testid="asset-confirmation">
          <CheckCheck size={17} />
          <span>{notice}</span>
          <button className="text-button" onClick={() => setNotice('')}>
            Dismiss
          </button>
        </div>
      )}

      {/* 2-Row Layout: Row 1 = Full-width Category Tabs (overflow-x-auto); Row 2 = Location Filter & Search */}
      <div className="inventory-controls-stack">
        <div className="filter-tabs inventory-filter-tabs w-full overflow-x-auto">
          {[
            ['all', 'All Hardware'],
            ['AP', 'Access Points'],
            ['PC', 'Workstations'],
            ['archived', 'Archived'],
          ].map(([key, label]) => (
            <button
              key={key}
              data-testid={`asset-filter-${key}`}
              className={kind === key ? 'active' : ''}
              onClick={() => setKind(key)}
            >
              {label}
              <span>{all.filter((a: any) => matchesKind(a, key) && matchesLocation(a)).length}</span>
            </button>
          ))}
        </div>

        <div className="inventory-filters-row">
          <div className="location-filter-wrap">
            <select
              aria-label="Filter by Campus Location"
              data-testid="asset-location-select"
              className="compact-select"
              value={locFilter}
              onChange={e => setLocFilter(e.target.value)}
            >
              <option value="all">All Campus Locations</option>
              {CAMPUS_LOCATIONS.map(loc => (
                <option key={loc.id} value={loc.id}>
                  [{loc.code}] {loc.name} ({loc.block})
                </option>
              ))}
            </select>
          </div>

          <div className="search-field inventory-search">
            <Search size={15} />
            <input
              data-testid="asset-search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search equipment by tag, room code, MAC…"
              aria-label="Search equipment by tag, location, placement landmark, or MAC"
            />
            {search && (
              <button type="button" className="search-clear" aria-label="Clear search" onClick={() => setSearch('')}>
                <X size={14} />
              </button>
            )}
          </div>
        </div>
      </div>

      {list.busy && !list.data ? (
        <Loading />
      ) : rows.length ? (
        <div className="inventory-card-wrapper w-full overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <div className="w-full overflow-x-auto">
            <table className="clean-inventory-table w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-900/50 text-xs font-semibold tracking-wider text-slate-500 uppercase">
                  <th className="px-5 py-4" style={{ width: '22%' }}>TAG</th>
                  <th className="px-5 py-4" style={{ width: '18%' }}>TYPE</th>
                  <th className="px-5 py-4" style={{ width: '30%' }}>MODEL</th>
                  <th className="px-5 py-4" style={{ width: '16%' }}>ROOM</th>
                  <th className="px-5 py-4 text-right" style={{ width: '14%' }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {rows.map((a: any) => {
                  const loc = findLocation(a.lab_id) || findLocation(a.lab_name);
                  const locCode = loc?.code || 'CAMPUS';
                  const locName = a.lab_name || loc?.name || 'Unassigned';
                  const isPC = a.kind === 'PC';
                  const modelName = a.model || (isPC ? 'Dell OptiPlex 7010' : 'Aruba AP-515');
                  const fullRoomTooltip = `${locCode} · ${locName}${a.placement ? ` · ${a.placement}` : ''}`;

                  return (
                    <tr
                      key={a.id}
                      data-testid={`asset-row-${a.id}`}
                      className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors"
                      onClick={() => handleOpenDetails(a, false)}
                    >
                      {/* 1. TAG: Bold monospace/clean tag */}
                      <td className="px-5 py-4">
                        <span className="device-tag-mono">{a.tag}</span>
                      </td>

                      {/* 2. TYPE: Plain text */}
                      <td className="px-5 py-4">
                        <span className="device-type-plain">{isPC ? 'Workstation' : 'Access Point'}</span>
                      </td>

                      {/* 3. MODEL: Full model name (never truncated) */}
                      <td className="px-5 py-4">
                        <span className="device-model-plain">{modelName}</span>
                      </td>

                      {/* 4. ROOM: Plain text room code only */}
                      <td className="px-5 py-4">
                        <span className="device-room-mono mono" title={fullRoomTooltip} data-testid={`asset-room-code-${a.id}`}>
                          {locCode}
                        </span>
                      </td>

                      {/* 5. ACTIONS: Clean uniform action button to open detail modal */}
                      <td className="px-5 py-4 text-right" onClick={e => e.stopPropagation()}>
                        <div className="inline-flex items-center gap-2 justify-end">
                          <button
                            type="button"
                            className="action-btn-uniform"
                            data-testid={`details-asset-${a.id}`}
                            title={`View and edit hardware details for ${a.tag}`}
                            aria-label={`View and edit hardware details for ${a.tag}`}
                            onClick={() => handleOpenDetails(a, false)}
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
        <Empty text="No equipment found in this location or matching your search." />
      )}

      {/* 2-CLICK SMART AUTO-FILLING REGISTER MODAL */}
      <Modal
        open={open}
        onClose={setOpen}
        title="Register Equipment"
        id="asset-dialog"
      >
        <form onSubmit={submit} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Row 1: Equipment Type | Assigned Location / Zone */}
            <Field label="Equipment Type" id="asset-kind">
              <Select id="asset-kind" value={form.kind} onChange={(e: any) => changeKind(e.target.value)}>
                <option value="PC">Workstation</option>
                <option value="AP">Access Point</option>
              </Select>
            </Field>

            <Field label="Assigned Location / Zone" id="asset-lab">
              <Select id="asset-lab" value={form.lab_id} onChange={(e: any) => changeLocation(e.target.value)}>
                {form.kind === 'AP'
                  ? AP_LOCATION_GROUPS.map(group => (
                      <optgroup key={group.label} label={group.label}>
                        {locationChoices
                          .filter(l => group.zones.includes(l.zone_group))
                          .map(l => (
                            <option key={l.id} value={l.id}>
                              [{l.code}] {l.name} ({l.block}, {l.level})
                            </option>
                          ))}
                      </optgroup>
                    ))
                  : locationChoices.map(l => (
                      <option key={l.id} value={l.id}>
                        [{l.code}] {l.name} ({l.block}, {l.level})
                      </option>
                    ))}
              </Select>
            </Field>

            {/* Row 2: Equipment Tag | Device Name */}
            <Field label="Equipment Tag" id="asset-tag">
              <input
                required
                minLength={3}
                maxLength={40}
                id="asset-tag"
                data-testid="asset-tag"
                value={form.tag}
                onChange={e => setForm({ ...form, tag: e.target.value })}
                placeholder={form.kind === 'AP' ? 'e.g. AP-CANTEEN-03' : 'e.g. PC-CL-A-11'}
              />
            </Field>

            <Field label="Device Name" id="asset-name">
              <input
                required
                minLength={2}
                maxLength={80}
                id="asset-name"
                data-testid="asset-name"
                value={form.name}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder={form.kind === 'AP' ? 'e.g. Campus Canteen · AP 03' : 'e.g. Student Workstation 11'}
              />
            </Field>

            {/* Row 3 (Full Width): Physical Placement / Landmark */}
            <div className="sm:col-span-2">
              <Field label="Physical Placement / Landmark" id="asset-placement">
                <input
                  required
                  minLength={3}
                  maxLength={120}
                  id="asset-placement"
                  data-testid="asset-placement"
                  value={form.placement}
                  onChange={e => setForm({ ...form, placement: e.target.value })}
                  placeholder={selectedLocation?.placeholder || 'e.g. Row 1, Desk 1'}
                />
              </Field>
            </div>

            {/* Row 4: Hardware Model | MAC / Serial Tag */}
            <Field label="Hardware Model (Optional)" id="asset-model">
              <input
                maxLength={80}
                data-testid="asset-model"
                id="asset-model"
                value={form.model}
                onChange={e => setForm({ ...form, model: e.target.value })}
                placeholder={form.kind === 'AP' ? 'e.g. Aruba AP-535' : 'e.g. Dell OptiPlex 7090'}
              />
            </Field>

            <Field label="MAC / Serial Tag" id="asset-mac">
              <input
                maxLength={40}
                data-testid="asset-mac"
                id="asset-mac"
                value={form.mac}
                onChange={e => setForm({ ...form, mac: e.target.value })}
                placeholder="AA:BB:CC:11:22:33 (blank = auto)"
                spellCheck={false}
                autoCapitalize="characters"
              />
            </Field>
          </div>

          <span data-testid="asset-dhcp-preview" className="sr-only" aria-hidden="true" />
          <span data-testid="asset-location-hint" className="sr-only" aria-hidden="true" />

          <ErrorBox error={error} />

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200 dark:border-slate-800">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              id="save-asset"
              variant="primary"
              type="submit"
              disabled={busy}
            >
              <Save size={14} />
              {busy ? 'Registering…' : 'Register Equipment'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* EQUIPMENT DETAIL & EDIT MODAL */}
      <Modal
        open={Boolean(detailsAsset)}
        onClose={() => {
          setDetailsAsset(null);
          setIsEditing(false);
        }}
        title={
          detailsAsset ? (
            <div className="flex items-center gap-2.5">
              <span className="text-lg font-bold text-slate-900 dark:text-slate-100 font-mono">
                {detailsAsset.tag}
              </span>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                  detailsAsset.archived
                    ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-900'
                    : 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900'
                }`}
              >
                {detailsAsset.archived ? 'Archived' : 'Active'}
              </span>
            </div>
          ) : (
            'Equipment Details'
          )
        }
        id="asset-detail-dialog"
      >
        {detailsAsset && (
          <div data-testid="asset-inspector-drawer" className="relative z-10 pointer-events-auto">
            {isEditing ? (
              /* Edit Mode: Form with 2-Column Grid & Footer */
              <form onSubmit={handleSaveEdit} className="flex flex-col gap-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Row 1: Equipment Tag | Equipment Type */}
                  <Field label="Equipment Tag" id="edit-asset-tag">
                    <input
                      required
                      minLength={3}
                      maxLength={40}
                      id="edit-asset-tag"
                      data-testid="edit-asset-tag"
                      value={editForm.tag}
                      onChange={e => setEditForm({ ...editForm, tag: e.target.value })}
                      className="w-full rounded-lg px-3.5 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 font-mono uppercase"
                    />
                  </Field>

                  <Field label="Equipment Type" id="edit-asset-kind">
                    <Select id="edit-asset-kind" value={editForm.kind} onChange={(e: any) => changeEditKind(e.target.value)}>
                      <option value="AP">Access Point</option>
                      <option value="PC">Workstation</option>
                    </Select>
                  </Field>

                  {/* Row 2: Assigned Room | Hardware Model */}
                  <Field label="Assigned Room" id="edit-asset-lab">
                    <Select
                      id="edit-asset-lab"
                      value={editForm.lab_id}
                      onChange={(e: any) => setEditForm({ ...editForm, lab_id: e.target.value })}
                    >
                      {editForm.kind === 'AP'
                        ? AP_LOCATION_GROUPS.map(group => (
                            <optgroup key={group.label} label={group.label}>
                              {editLocationChoices
                                .filter(l => group.zones.includes(l.zone_group))
                                .map(l => (
                                  <option key={l.id} value={l.id}>
                                    [{l.code}] {l.name}
                                  </option>
                                ))}
                            </optgroup>
                          ))
                        : editLocationChoices.map(l => (
                            <option key={l.id} value={l.id}>
                              [{l.code}] {l.name}
                            </option>
                          ))}
                    </Select>
                  </Field>

                  <Field label="Hardware Model" id="edit-asset-model">
                    <input
                      maxLength={80}
                      id="edit-asset-model"
                      data-testid="edit-asset-model"
                      value={editForm.model}
                      onChange={e => setEditForm({ ...editForm, model: e.target.value })}
                      placeholder={editForm.kind === 'PC' ? 'e.g. Dell OptiPlex 7090' : 'e.g. Aruba AP-575'}
                      className="w-full rounded-lg px-3.5 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100"
                    />
                  </Field>

                  {/* Row 3: Placement Landmark | MAC / Serial Tag */}
                  <Field label="Placement Landmark" id="edit-asset-placement">
                    <input
                      required
                      minLength={3}
                      maxLength={120}
                      id="edit-asset-placement"
                      data-testid="edit-asset-placement"
                      value={editForm.placement}
                      onChange={e => setEditForm({ ...editForm, placement: e.target.value })}
                      placeholder="e.g. Bus Stop · Waiting Bay"
                      className="w-full rounded-lg px-3.5 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100"
                    />
                  </Field>

                  <Field label="MAC / Serial Tag" id="edit-asset-mac">
                    <input
                      maxLength={40}
                      id="edit-asset-mac"
                      data-testid="edit-asset-mac"
                      value={editForm.mac}
                      onChange={e => setEditForm({ ...editForm, mac: e.target.value })}
                      placeholder="AA:BB:CC:11:22:33"
                      spellCheck={false}
                      autoCapitalize="characters"
                      className="w-full rounded-lg px-3.5 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 font-mono"
                    />
                  </Field>
                </div>

                <ErrorBox error={error} />

                {/* Edit Mode Footer */}
                <div className="flex items-center justify-between pt-4 mt-2 border-t border-slate-200 dark:border-slate-800">
                  <div>
                    {!detailsAsset.archived ? (
                      <button
                        type="button"
                        disabled={busy}
                        data-testid={`archive-asset-${detailsAsset.id}`}
                        onClick={() => archive(detailsAsset)}
                        className="px-3.5 py-1.5 rounded-lg text-xs font-semibold border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/50 transition-colors inline-flex items-center gap-1.5 focus:outline-none cursor-pointer"
                      >
                        <Archive size={14} />
                        Archive
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => restoreAsset(detailsAsset)}
                        className="px-3.5 py-1.5 rounded-lg text-xs font-semibold border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors inline-flex items-center gap-1.5 focus:outline-none cursor-pointer"
                      >
                        <CheckCheck size={14} />
                        Restore
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsEditing(false)}
                      className="px-3.5 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors focus:outline-none cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      id="save-edit-asset"
                      data-testid="save-edit-asset"
                      type="submit"
                      disabled={busy}
                      className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors inline-flex items-center gap-1.5 focus:outline-none shadow-sm cursor-pointer"
                    >
                      <Save size={14} />
                      {busy ? 'Saving…' : 'Save Changes'}
                    </button>
                  </div>
                </div>
              </form>
            ) : (
              /* View Mode: 2x2 Summary Card & View Footer (Not inside a form) */
              <div className="flex flex-col gap-4">
                {(() => {
                  const loc = findLocation(detailsAsset.lab_id) || findLocation(detailsAsset.lab_name);
                  return (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800">
                      <div className="flex flex-col gap-1">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                          Location
                        </span>
                        <span className="text-sm font-medium text-slate-900 dark:text-slate-100" data-testid={`asset-room-code-${detailsAsset.id}`}>
                          {loc ? `${loc.code} · ${detailsAsset.lab_name || loc.name}` : detailsAsset.lab_name || 'Unassigned'}
                        </span>
                      </div>

                      <div className="flex flex-col gap-1">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                          Placement Landmark
                        </span>
                        <span className="text-sm font-medium text-slate-900 dark:text-slate-100" data-testid={`asset-placement-${detailsAsset.id}`}>
                          {detailsAsset.placement || 'Placement landmark not recorded'}
                        </span>
                      </div>

                      <div className="flex flex-col gap-1">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                          Network IP &amp; VLAN
                        </span>
                        <span className="text-sm font-medium font-mono text-slate-900 dark:text-slate-100">
                          {detailsAsset.ip || 'DHCP Pending'} · VLAN {detailsAsset.vlan || vlanFor(detailsAsset.kind)}
                        </span>
                      </div>

                      <div className="flex flex-col gap-1">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                          MAC / Serial Tag
                        </span>
                        <span className="text-sm font-medium font-mono text-slate-900 dark:text-slate-100">
                          {detailsAsset.mac || 'Provisioned by DHCP'}
                        </span>
                      </div>
                    </div>
                  );
                })()}

                {/* View Mode Footer */}
                <div className="flex items-center justify-between pt-4 mt-2 border-t border-slate-200 dark:border-slate-800">
                  <div>
                    {!detailsAsset.archived ? (
                      <button
                        type="button"
                        disabled={busy}
                        data-testid={`archive-asset-${detailsAsset.id}`}
                        onClick={() => archive(detailsAsset)}
                        className="px-3.5 py-1.5 rounded-lg text-xs font-semibold border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/50 transition-colors inline-flex items-center gap-1.5 focus:outline-none cursor-pointer"
                      >
                        <Archive size={14} />
                        Archive
                      </button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => restoreAsset(detailsAsset)}
                          className="px-3.5 py-1.5 rounded-lg text-xs font-semibold border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors inline-flex items-center gap-1.5 focus:outline-none cursor-pointer"
                        >
                          <CheckCheck size={14} />
                          Restore
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          data-testid={`delete-asset-${detailsAsset.id}`}
                          onClick={() => handleDelete(detailsAsset)}
                          className="px-3.5 py-1.5 rounded-lg text-xs font-semibold border border-rose-300 dark:border-rose-800 bg-rose-600 text-white hover:bg-rose-700 transition-colors inline-flex items-center gap-1.5 focus:outline-none cursor-pointer"
                        >
                          <Trash2 size={14} />
                          Delete
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setDetailsAsset(null);
                        setIsEditing(false);
                      }}
                      className="px-3.5 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors focus:outline-none cursor-pointer"
                    >
                      Close
                    </button>
                    <button
                      type="button"
                      id="edit-asset-button"
                      data-testid="edit-asset-button"
                      onClick={() => startEdit(detailsAsset)}
                      className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors inline-flex items-center gap-1.5 focus:outline-none shadow-sm cursor-pointer"
                    >
                      <Pencil size={13} />
                      Edit
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
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
