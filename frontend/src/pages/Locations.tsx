import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MapPin,
  Plus,
  Search,
  Pencil,
  Trash2,
  CheckCheck,
  X,
  Cpu,
  GraduationCap,
  UtensilsCrossed,
  Bus,
  Save,
  Sparkles,
  ChevronRight,
  ArrowUpRight,
} from 'lucide-react';
import { api, errorText } from '../lib/api';
import { PageTitle, Button, Modal, Field, Select, ErrorBox, Loading, Empty, useData } from '../components/shared';
import { CampusLocation, CAMPUS_LOCATIONS, computeAutoRoomCode } from '../lib/workflow';

const CATEGORY_ICONS: Record<string, any> = {
  'Computing Lab': Cpu,
  'Specialty Lab': Cpu,
  Classroom: GraduationCap,
  Auditorium: GraduationCap,
  'Common Area': UtensilsCrossed,
  'Outdoor / Transit': Bus,
  Outdoor: Bus,
};

const CATEGORY_BADGE_CLASSES: Record<string, string> = {
  'Computing Lab': 'zone-labs',
  'Specialty Lab': 'zone-labs',
  Classroom: 'zone-academic',
  Auditorium: 'zone-academic',
  'Common Area': 'zone-common',
  'Outdoor / Transit': 'zone-outdoor',
  Outdoor: 'zone-outdoor',
};

const ZONE_PILLS = [
  { key: 'all', label: 'All Zones' },
  { key: 'Block A', label: 'Block A' },
  { key: 'Block B', label: 'Block B' },
  { key: 'Block C', label: 'Block C (Canteen)' },
  { key: 'Tech Labs', label: 'Tech Labs' },
  { key: 'Outdoor', label: 'Outdoor / Transit' },
];

const BLOCK_OPTIONS = [
  'Block A',
  'Block B',
  'Block C',
  'Block D',
  'Block E / Tech',
  'Block S',
  'Outdoor Gate 1',
];

const LEVEL_OPTIONS = [
  'Ground Level',
  'Level 1',
  'Level 2',
  'Level 3',
  'Level 4',
  'Level 5',
  'Level 6',
  'Rooftop',
];

const CATEGORY_OPTIONS = [
  'Computing Lab',
  'Specialty Lab',
  'Classroom',
  'Auditorium',
  'Common Area',
  'Outdoor / Transit',
];

export default function Locations() {
  const navigate = useNavigate();
  const list = useData('/locations');
  const assetsList = useData('/assets');
  const [openAdd, setOpenAdd] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<CampusLocation | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [search, setSearch] = useState('');
  const [zonePill, setZonePill] = useState('all');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');

  const initialAdd = {
    code: 'B-04-06',
    name: '',
    block: 'Block B',
    level: 'Level 4',
    room: '06',
    category: 'Computing Lab',
  };
  const [form, setForm] = useState(initialAdd);

  const initialEdit = {
    code: '',
    name: '',
    block: 'Block B',
    level: 'Level 4',
    room: '',
    category: 'Computing Lab',
  };
  const [editForm, setEditForm] = useState(initialEdit);

  // Fallback to client reference data if server returns empty, or backfill any missing properties
  const rawData: CampusLocation[] = useMemo(() => {
    if (!Array.isArray(list.data) || list.data.length === 0) {
      return CAMPUS_LOCATIONS;
    }
    return list.data.map((item: any) => {
      // Find client reference location by ID or code or name to backfill any missing fields
      const ref = CAMPUS_LOCATIONS.find(
        l => l.id === item.id || l.code === item.code || l.name === item.name
      );
      return {
        id: item.id || ref?.id || 'loc-unknown',
        code: item.code || ref?.code || item.name || 'CAMPUS',
        name: item.name || ref?.name || 'Unnamed Location',
        block: item.block || item.building || ref?.block || 'Block B',
        level: item.level || item.floor || ref?.level || 'Level 1',
        room: item.room || ref?.room || '',
        category: item.category || ref?.category || 'Computing Lab',
        workstation_count: item.workstation_count ?? ref?.workstation_count ?? 0,
        ap_count: item.ap_count ?? ref?.ap_count ?? 0,
        equipment_count: item.equipment_count ?? (item.workstation_count || 0) + (item.ap_count || 0),
        short: item.short || ref?.short || item.name,
        zone_group: item.zone_group || ref?.zone_group || 'labs',
        vlan_octet: item.vlan_octet ?? ref?.vlan_octet ?? 1,
        placeholder: item.placeholder || ref?.placeholder || '',
      };
    });
  }, [list.data]);

  const handleOpenAdd = () => {
    const autoCode = computeAutoRoomCode('Block B', 'Level 4', '06') || 'B-04-06';
    setForm({
      code: autoCode,
      name: '',
      block: 'Block B',
      level: 'Level 4',
      room: '06',
      category: 'Computing Lab',
    });
    setError('');
    setOpenAdd(true);
  };

  const handleBlockChange = (block: string) => {
    const code = computeAutoRoomCode(block, form.level, form.room);
    setForm(prev => ({ ...prev, block, code: code || prev.code }));
  };

  const handleLevelChange = (level: string) => {
    const code = computeAutoRoomCode(form.block, level, form.room);
    setForm(prev => ({ ...prev, level, code: code || prev.code }));
  };

  const handleRoomChange = (room: string) => {
    const code = computeAutoRoomCode(form.block, form.level, room);
    setForm(prev => ({ ...prev, room, code: code || prev.code }));
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const res = await api.post('/locations', {
        code: form.code.trim().toUpperCase(),
        name: form.name.trim(),
        block: form.block.trim(),
        level: form.level.trim(),
        room: form.room.trim(),
        category: form.category,
      });
      const created = res.data;
      setOpenAdd(false);
      setForm(initialAdd);
      setNotice(`Location [${created.code}] ${created.name} (${created.block}) added successfully.`);
      list.load();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (locToEdit?: CampusLocation | null) => {
    const loc = locToEdit || selectedRoom;
    if (!loc) return;
    setEditForm({
      code: loc.code,
      name: loc.name,
      block: loc.block || 'Block B',
      level: loc.level || 'Level 4',
      room: loc.room || '',
      category: loc.category || 'Computing Lab',
    });
    setError('');
    setIsEditing(true);
  };

  const handleOpenEdit = (loc: CampusLocation) => {
    setSelectedRoom(loc);
    startEdit(loc);
  };

  const handleEditBlockChange = (block: string) => {
    const code = computeAutoRoomCode(block, editForm.level, editForm.room);
    setEditForm(prev => ({ ...prev, block, code: code || prev.code }));
  };

  const handleEditLevelChange = (level: string) => {
    const code = computeAutoRoomCode(editForm.block, level, editForm.room);
    setEditForm(prev => ({ ...prev, level, code: code || prev.code }));
  };

  const handleEditRoomChange = (room: string) => {
    const code = computeAutoRoomCode(editForm.block, editForm.level, room);
    setEditForm(prev => ({ ...prev, room, code: code || prev.code }));
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const loc = selectedRoom;
    if (!loc) return;
    setBusy(true);
    setError('');
    try {
      const res = await api.patch(`/locations/${loc.id}`, {
        code: editForm.code.trim().toUpperCase(),
        name: editForm.name.trim(),
        block: editForm.block.trim(),
        level: editForm.level.trim(),
        room: editForm.room.trim(),
        category: editForm.category,
      });
      const updated = res.data;
      setIsEditing(false);
      setSelectedRoom(prev => (prev?.id === loc.id ? { ...prev, ...updated } : prev));
      setNotice(`Location [${updated.code}] ${updated.name} updated successfully.`);
      list.load();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (loc: CampusLocation) => {
    const eqCount = loc.equipment_count ?? 0;
    if (eqCount > 0) {
      alert(
        `Cannot delete location [${loc.code}] ${loc.name} because it currently has ${eqCount} active equipment installed (${loc.workstation_count || 0} workstations, ${loc.ap_count || 0} APs).\n\nPlease reassign or archive all equipment in Hardware Inventory before removing this room.`
      );
      return;
    }

    if (!window.confirm(`Are you sure you want to remove location [${loc.code}] ${loc.name}? This action cannot be undone.`)) {
      return;
    }

    setBusy(true);
    setError('');
    try {
      await api.delete(`/locations/${loc.id}`);
      if (selectedRoom?.id === loc.id) {
        setSelectedRoom(null);
        setIsEditing(false);
      }
      setNotice(`Location [${loc.code}] ${loc.name} deleted successfully.`);
      list.load();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const matchesZonePill = (loc: CampusLocation, pill: string) => {
    if (pill === 'all') return true;
    const block = String(loc.block || '');
    const category = String(loc.category || '');
    const code = String(loc.code || '');

    if (pill === 'Block A') return block.includes('Block A') || code.startsWith('A-');
    if (pill === 'Block B') return (block.includes('Block B') || code.startsWith('B-')) && !category.includes('Specialty');
    if (pill === 'Block C') return block.includes('Block C') || category.includes('Common') || code.includes('CANTEEN') || code.includes('LOUNGE');
    if (pill === 'Tech Labs') return category.includes('Specialty') || block.includes('Tech') || code.includes('Tech') || code.includes('Robotic');
    if (pill === 'Outdoor') return category.includes('Outdoor') || block.includes('Outdoor') || code.includes('BUS') || code.startsWith('G-');
    return true;
  };

  const query = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    return rawData.filter(loc => {
      // Zone Pill filter
      if (!matchesZonePill(loc, zonePill)) {
        return false;
      }

      // Search query
      if (query) {
        const text = [
          loc.code,
          loc.name,
          loc.block,
          loc.level,
          loc.room,
          loc.category,
          loc.short,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return query.split(/\s+/).every(term => text.includes(term));
      }

      return true;
    });
  }, [rawData, zonePill, query]);

  // Devices in currently selected room for drawer inspection
  const selectedRoomDevices = useMemo(() => {
    if (!selectedRoom || !Array.isArray(assetsList.data)) return [];
    return assetsList.data.filter((a: any) => {
      return (
        a.lab_id === selectedRoom.id ||
        a.lab_name === selectedRoom.name ||
        (a.lab_id && a.lab_id.toLowerCase() === selectedRoom.id.toLowerCase())
      );
    });
  }, [selectedRoom, assetsList.data]);

  return (
    <>
      <PageTitle
        title="Campus Locations & Rooms"
      >
        <Button
          id="add-location-btn"
          variant="primary"
          onClick={handleOpenAdd}
        >
          <Plus size={16} />
          Add Location
        </Button>
      </PageTitle>

      <ErrorBox error={list.error || (!openAdd && !selectedRoom && error)} retry={list.load} />

      {notice && (
        <div className="success-box" data-testid="location-notice">
          <CheckCheck size={17} />
          <span>{notice}</span>
          <button className="text-button" onClick={() => setNotice('')}>
            Dismiss
          </button>
        </div>
      )}

      {/* Zone Filter Tabs & Quick Search Bar */}
      <div className="locations-controls-bar flex flex-wrap items-center justify-between gap-3">
        <div className="filter-tabs locations-filter-tabs">
          {ZONE_PILLS.map(({ key, label }) => (
            <button
              key={key}
              data-testid={`loc-filter-${key}`}
              className={zonePill === key ? 'active' : ''}
              onClick={() => setZonePill(key)}
            >
              {label}
              <span>
                {rawData.filter(loc => matchesZonePill(loc, key)).length}
              </span>
            </button>
          ))}
        </div>

        <div className="search-field inventory-search" style={{ minWidth: '260px' }}>
          <Search size={15} />
          <input
            data-testid="location-search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search room code, name, block…"
            aria-label="Search campus locations"
          />
          {search && (
            <button
              type="button"
              className="search-clear"
              aria-label="Clear search"
              onClick={() => setSearch('')}
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {list.busy && !list.data ? (
        <Loading />
      ) : filtered.length ? (
        <div className="locations-table-wrapper w-full overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <div className="w-full overflow-x-auto">
            <table className="clean-locations-table w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-900/50 text-xs font-semibold tracking-wider text-slate-500 uppercase">
                  <th className="px-5 py-4" style={{ width: '22%' }}>ROOM CODE</th>
                  <th className="px-5 py-4" style={{ width: '44%' }}>LOCATION NAME</th>
                  <th className="px-5 py-4" style={{ width: '20%' }}>DEVICES</th>
                  <th className="px-5 py-4 text-right" style={{ width: '14%' }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {filtered.map(loc => {
                  const wsCount = loc.workstation_count ?? 0;
                  const apCount = loc.ap_count ?? 0;
                  const devParts: string[] = [];
                  if (wsCount > 0) devParts.push(`${wsCount} PC`);
                  if (apCount > 0) devParts.push(`${apCount} AP`);
                  const devicesSummary = devParts.length > 0 ? devParts.join(' · ') : '0';

                  return (
                    <tr
                      key={loc.id}
                      data-testid={`location-card-${loc.id}`}
                      className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors"
                      onClick={() => setSelectedRoom(loc)}
                    >
                      {/* 1. ROOM CODE: Bold room code in neutral text */}
                      <td className="px-5 py-4">
                        <span className="loc-code-neutral mono" data-testid={`loc-code-${loc.id}`}>
                          {loc.code}
                        </span>
                      </td>

                      {/* 2. LOCATION NAME: Clean text */}
                      <td className="px-5 py-4">
                        <span className="loc-name-plain">{loc.name}</span>
                      </td>

                      {/* 3. DEVICES: Compact summary, e.g. 10 PC · 6 AP or 2 AP or 0 */}
                      <td className="px-5 py-4">
                        <span className="loc-devices-plain" data-testid={`loc-equipment-${loc.id}`}>
                          {devicesSummary}
                        </span>
                      </td>

                      {/* 4. ACTIONS: Clean uniform action button to open detail modal */}
                      <td className="px-5 py-4 text-right" onClick={e => e.stopPropagation()}>
                        <div className="inline-flex items-center gap-2 justify-end">
                          <button
                            type="button"
                            className="action-btn-uniform"
                            title={`View location specifications & devices for ${loc.name}`}
                            aria-label={`View location specifications & devices for ${loc.name}`}
                            data-testid={`edit-loc-${loc.id}`}
                            onClick={() => setSelectedRoom(loc)}
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
        <Empty text="No campus locations match your filter or search query." />
      )}

      {/* LOCATION DETAIL & INLINE EDIT MODAL */}
      <Modal
        open={Boolean(selectedRoom)}
        onClose={() => {
          setSelectedRoom(null);
          setIsEditing(false);
        }}
        title={
          selectedRoom ? (
            <div className="flex items-center gap-2.5">
              <span className="font-mono text-xs font-bold px-2.5 py-1 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                {selectedRoom.code}
              </span>
              <span className="text-lg font-bold text-slate-900 dark:text-slate-100">
                {selectedRoom.name}
              </span>
            </div>
          ) : (
            'Location Details'
          )
        }
        id="room-detail-dialog"
      >
        {selectedRoom && (
          <div data-testid="room-inspector-drawer" className="relative z-10 pointer-events-auto">
            {isEditing ? (
              /* Edit Mode: Form with 2-Column Grid & Footer */
              <form onSubmit={handleEditSubmit} className="flex flex-col gap-4">
                {/* APSpace Live Auto-Code Preview Banner */}
                <div className="auto-code-preview-bar">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Sparkles size={16} style={{ color: '#60a5fa' }} />
                    <span className="auto-code-preview-label">APSpace Room Code:</span>
                  </div>
                  <span className="auto-code-preview-val font-mono font-bold">
                    {editForm.code || selectedRoom.code}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Row 1: Building Block | Floor / Level */}
                  <Field label="Building Block" id="loc-edit-block">
                    <Select
                      id="loc-edit-block"
                      data-testid="loc-edit-select-block"
                      value={editForm.block}
                      onChange={(e: any) => handleEditBlockChange(e.target.value)}
                    >
                      {BLOCK_OPTIONS.map(b => (
                        <option key={b} value={b}>
                          {b}
                        </option>
                      ))}
                    </Select>
                  </Field>

                  <Field label="Floor / Level" id="loc-edit-level">
                    <Select
                      id="loc-edit-level"
                      data-testid="loc-edit-select-level"
                      value={editForm.level}
                      onChange={(e: any) => handleEditLevelChange(e.target.value)}
                    >
                      {LEVEL_OPTIONS.map(lvl => (
                        <option key={lvl} value={lvl}>
                          {lvl}
                        </option>
                      ))}
                    </Select>
                  </Field>

                  {/* Row 2: Room Identifier | Location Category */}
                  <Field label="Room Identifier" id="loc-edit-room">
                    <input
                      required
                      minLength={1}
                      maxLength={40}
                      id="loc-edit-room"
                      data-testid="loc-edit-input-room"
                      value={editForm.room}
                      onChange={e => handleEditRoomChange(e.target.value)}
                      placeholder="e.g. 03 or Gate 1"
                      className="w-full rounded-lg px-3.5 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100"
                    />
                  </Field>

                  <Field label="Location Category" id="loc-edit-cat">
                    <Select
                      id="loc-edit-cat"
                      data-testid="loc-edit-select-cat"
                      value={editForm.category}
                      onChange={(e: any) => setEditForm({ ...editForm, category: e.target.value })}
                    >
                      {CATEGORY_OPTIONS.map(c => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </Select>
                  </Field>

                  {/* Row 3 (Full Width): Location / Lab Name */}
                  <div className="sm:col-span-2">
                    <Field label="Location / Lab Name" id="loc-edit-name">
                      <input
                        required
                        minLength={2}
                        maxLength={80}
                        id="loc-edit-name"
                        data-testid="loc-edit-input-name"
                        value={editForm.name}
                        onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                        placeholder="e.g. Computing Lab A"
                        className="w-full rounded-lg px-3.5 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100"
                      />
                    </Field>
                  </div>
                </div>

                <ErrorBox error={error} />

                {/* Edit Mode Footer */}
                <div className="flex items-center justify-end gap-2.5 pt-4 mt-2 border-t border-slate-200 dark:border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="px-3.5 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors focus:outline-none cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    id="save-edit-location-btn"
                    data-testid="save-edit-location-btn"
                    type="submit"
                    disabled={busy}
                    className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors inline-flex items-center gap-1.5 focus:outline-none shadow-sm cursor-pointer"
                  >
                    <Save size={14} />
                    {busy ? 'Saving Changes…' : 'Save Changes'}
                  </button>
                </div>
              </form>
            ) : (
              /* View Mode: 3-Column Info Strip + Compact Device List + View Footer (Not inside a form) */
              <div className="flex flex-col gap-4">
                {/* 3-Column Info Strip */}
                <div className="grid grid-cols-3 gap-3 p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800">
                  <div className="flex flex-col gap-1">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Category
                    </span>
                    <span className="text-xs sm:text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                      {selectedRoom.category}
                    </span>
                  </div>

                  <div className="flex flex-col gap-1">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Zone / Floor
                    </span>
                    <span className="text-xs sm:text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                      {selectedRoom.block} · {selectedRoom.level}
                    </span>
                  </div>

                  <div className="flex flex-col gap-1">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                      Assigned Devices
                    </span>
                    <span className="text-xs sm:text-sm font-medium text-slate-900 dark:text-slate-100">
                      {(() => {
                        const wsCount = selectedRoomDevices.filter((d: any) => d.kind === 'PC').length || selectedRoom.workstation_count || 0;
                        const apCount = selectedRoomDevices.filter((d: any) => d.kind === 'AP').length || selectedRoom.ap_count || 0;
                        const devParts: string[] = [];
                        if (wsCount > 0) devParts.push(`${wsCount} PC`);
                        if (apCount > 0) devParts.push(`${apCount} AP`);
                        return devParts.length > 0 ? devParts.join(' · ') : `${selectedRoomDevices.length || selectedRoom.equipment_count || 0} Total`;
                      })()}
                    </span>
                  </div>
                </div>

                {/* Compact Scrollable Device List */}
                <div className="flex flex-col gap-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    Assigned Hardware ({selectedRoomDevices.length})
                  </span>

                  {selectedRoomDevices.length > 0 ? (
                    <div className="max-h-44 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-lg divide-y divide-slate-100 dark:divide-slate-800/60">
                      <div className="flex items-center justify-between px-3.5 py-2 bg-slate-50/70 dark:bg-slate-800/40 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 sticky top-0 backdrop-blur-sm">
                        <span>Device Tag</span>
                        <span>Type</span>
                      </div>
                      {selectedRoomDevices.map((dev: any) => (
                        <div
                          key={dev.id}
                          className="flex items-center justify-between px-3.5 py-2 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors"
                        >
                          <span className="font-mono text-xs font-semibold text-slate-900 dark:text-slate-100">
                            {dev.tag}
                          </span>
                          <span className="text-xs text-slate-600 dark:text-slate-400">
                            {dev.kind === 'PC' ? 'Workstation' : 'Access Point'}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 text-center text-slate-400 dark:text-slate-500 text-xs italic border border-slate-200 dark:border-slate-800 rounded-lg">
                      No hardware currently assigned to this location.
                    </div>
                  )}
                </div>

                {/* View Mode Footer */}
                <div className="flex items-center justify-between pt-4 mt-2 border-t border-slate-200 dark:border-slate-800">
                  <div>
                    <button
                      type="button"
                      disabled={busy}
                      data-testid={`delete-loc-${selectedRoom.id}`}
                      onClick={() => handleDelete(selectedRoom)}
                      className="px-3.5 py-1.5 rounded-lg text-xs font-semibold border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 hover:bg-rose-100 dark:hover:bg-rose-900/50 transition-colors inline-flex items-center gap-1.5 focus:outline-none cursor-pointer"
                    >
                      <Trash2 size={13} />
                      Delete
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedRoom(null);
                        setIsEditing(false);
                      }}
                      className="px-3.5 py-1.5 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors focus:outline-none cursor-pointer"
                    >
                      Close
                    </button>
                    <button
                      type="button"
                      id="edit-room-button"
                      data-testid="edit-room-button"
                      onClick={() => startEdit(selectedRoom)}
                      className="px-4 py-1.5 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white transition-colors inline-flex items-center gap-1.5 focus:outline-none shadow-sm cursor-pointer"
                    >
                      <Pencil size={13} />
                      Edit Room
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* SMART AUTO-CODE CREATE LOCATION MODAL */}
      <Modal
        open={openAdd}
        onClose={setOpenAdd}
        title="Add Campus Location"
        id="add-location-dialog"
      >
        <form onSubmit={handleAddSubmit} className="flex flex-col gap-4">
          {/* APSpace Live Auto-Code Preview Banner */}
          <div className="auto-code-preview-bar">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sparkles size={16} style={{ color: '#60a5fa' }} />
              <span className="auto-code-preview-label">Generated APSpace Room Code:</span>
            </div>
            <span className="auto-code-preview-val font-mono font-bold">{form.code || 'B-04-06'}</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Row 1: Building Block | Floor / Level */}
            <Field label="Building Block" id="loc-add-block">
              <Select
                id="loc-add-block"
                data-testid="loc-select-block"
                value={form.block}
                onChange={(e: any) => handleBlockChange(e.target.value)}
              >
                {BLOCK_OPTIONS.map(b => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Floor / Level" id="loc-add-level">
              <Select
                id="loc-add-level"
                data-testid="loc-select-level"
                value={form.level}
                onChange={(e: any) => handleLevelChange(e.target.value)}
              >
                {LEVEL_OPTIONS.map(lvl => (
                  <option key={lvl} value={lvl}>
                    {lvl}
                  </option>
                ))}
              </Select>
            </Field>

            {/* Row 2: Room Number / Identifier | Location Category */}
            <Field label="Room Number / Identifier" id="loc-add-room">
              <input
                required
                minLength={1}
                maxLength={40}
                id="loc-add-room"
                data-testid="loc-input-room"
                value={form.room}
                onChange={e => handleRoomChange(e.target.value)}
                placeholder="e.g. 06, 07, Atrium, or Gate 1"
              />
            </Field>

            <Field label="Location Category" id="loc-add-cat">
              <Select
                id="loc-add-cat"
                data-testid="loc-select-cat"
                value={form.category}
                onChange={(e: any) => setForm({ ...form, category: e.target.value })}
              >
                {CATEGORY_OPTIONS.map(c => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </Select>
            </Field>

            {/* Row 3 (Full Width): Location / Lab Name */}
            <div className="sm:col-span-2">
              <Field label="Location / Lab Name" id="loc-add-name">
                <input
                  required
                  minLength={2}
                  maxLength={80}
                  id="loc-add-name"
                  data-testid="loc-input-name"
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Computing Lab D or Design Studio A"
                />
              </Field>
            </div>
          </div>

          <input type="hidden" data-testid="loc-input-code" value={form.code} readOnly />

          <ErrorBox error={error} />

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200 dark:border-slate-800">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpenAdd(false)}
            >
              Cancel
            </Button>
            <Button
              id="save-location-btn"
              variant="primary"
              type="submit"
              disabled={busy}
            >
              <Save size={14} />
              {busy ? 'Saving…' : 'Create Location'}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
