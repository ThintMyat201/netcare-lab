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
  Building2,
  Layers,
  DoorOpen,
  Monitor,
  Wifi,
  Sparkles,
  ChevronRight,
  Eye,
  Network,
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
  const [editingLoc, setEditingLoc] = useState<CampusLocation | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<CampusLocation | null>(null);
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

  const handleOpenEdit = (loc: CampusLocation) => {
    setEditingLoc(loc);
    setEditForm({
      code: loc.code,
      name: loc.name,
      block: loc.block || 'Block B',
      level: loc.level || 'Level 4',
      room: loc.room || '',
      category: loc.category || 'Computing Lab',
    });
    setError('');
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingLoc) return;
    setBusy(true);
    setError('');
    try {
      const res = await api.patch(`/locations/${editingLoc.id}`, {
        code: editForm.code.trim().toUpperCase(),
        name: editForm.name.trim(),
        block: editForm.block.trim(),
        level: editForm.level.trim(),
        room: editForm.room.trim(),
        category: editForm.category,
      });
      const updated = res.data;
      setEditingLoc(null);
      if (selectedRoom?.id === editingLoc.id) {
        setSelectedRoom({ ...selectedRoom, ...updated });
      }
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
      if (selectedRoom?.id === loc.id) setSelectedRoom(null);
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

      <ErrorBox error={list.error || (!openAdd && !editingLoc && error)} retry={list.load} />

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

      {/* ROOM INSPECTOR DRAWER / MODAL */}
      {selectedRoom && (
        <>
          <div className="slide-over-scrim" onClick={() => setSelectedRoom(null)} />
          <aside className="slide-over-drawer bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 border-l border-slate-200 dark:border-slate-800" aria-label="Room Inspector" data-testid="room-inspector-drawer">
            <div className="drawer-header border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <div className="drawer-header-info flex items-center gap-2.5">
                <span className="apspace-code-pill font-mono text-xs font-bold px-2.5 py-1 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                  {selectedRoom.code}
                </span>
                <div>
                  <h3 className="m-0 text-[15px] font-bold text-slate-900 dark:text-slate-100">
                    {selectedRoom.name}
                  </h3>
                  <small className="text-slate-500 dark:text-slate-400 text-xs">
                    {selectedRoom.block} · {selectedRoom.level}
                  </small>
                </div>
              </div>
              <button className="icon-btn-subtle" onClick={() => setSelectedRoom(null)} aria-label="Close inspector">
                <X size={18} />
              </button>
            </div>

            <div className="drawer-body">
              {/* Room Details Card */}
              <div className="drawer-card bg-slate-50/70 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <Building2 size={13} />
                  <span>Physical Room Specifications</span>
                </div>
                <div className="spec-grid grid grid-cols-2 gap-3 mt-1">
                  <div className="spec-item flex flex-col gap-0.5">
                    <span className="spec-label text-xs text-slate-500 dark:text-slate-400">Category</span>
                    <span className="spec-value text-xs font-medium text-slate-800 dark:text-slate-200">{selectedRoom.category}</span>
                  </div>
                  <div className="spec-item flex flex-col gap-0.5">
                    <span className="spec-label text-xs text-slate-500 dark:text-slate-400">Building Block</span>
                    <span className="spec-value text-xs font-medium text-slate-800 dark:text-slate-200">{selectedRoom.block}</span>
                  </div>
                  <div className="spec-item flex flex-col gap-0.5">
                    <span className="spec-label text-xs text-slate-500 dark:text-slate-400">Floor / Level</span>
                    <span className="spec-value text-xs font-medium text-slate-800 dark:text-slate-200">{selectedRoom.level}</span>
                  </div>
                  <div className="spec-item flex flex-col gap-0.5">
                    <span className="spec-label text-xs text-slate-500 dark:text-slate-400">Room Identifier</span>
                    <span className="spec-value text-xs font-medium text-slate-800 dark:text-slate-200">{selectedRoom.room || 'General Area'}</span>
                  </div>
                </div>
              </div>

              {/* Installed Equipment Fleet */}
              <div className="drawer-card bg-slate-50/70 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <Cpu size={13} />
                    <span>Installed Hardware Fleet</span>
                  </div>
                  <span className="text-xs font-semibold text-blue-600 dark:text-blue-400">
                    {selectedRoomDevices.length} Device{selectedRoomDevices.length === 1 ? '' : 's'}
                  </span>
                </div>

                {selectedRoomDevices.length > 0 ? (
                  <div className="max-h-64 overflow-y-auto border border-slate-200 dark:border-slate-800 rounded-lg p-2 space-y-2">
                    {selectedRoomDevices.map((dev: any) => {
                      const isPC = dev.kind === 'PC';
                      return (
                        <div
                          key={dev.id}
                          className="flex items-center justify-between p-2.5 rounded-lg bg-white dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-700/60"
                        >
                          <div className="flex items-center gap-2.5">
                            <div className={`device-icon-wrap ${isPC ? 'pc-icon' : 'ap-icon'}`} style={{ width: '26px', height: '26px' }}>
                              {isPC ? <Monitor size={14} /> : <Wifi size={14} />}
                            </div>
                            <div>
                              <strong className="text-xs font-semibold text-slate-900 dark:text-slate-100">{dev.tag}</strong>
                              <small className="block text-[11px] text-slate-500 dark:text-slate-400">
                                {dev.model || (isPC ? 'OptiPlex 7010' : 'AP-515')}
                              </small>
                            </div>
                          </div>
                          <div className="text-right">
                            <span className="font-mono text-xs font-semibold text-blue-600 dark:text-blue-400 block">
                              {dev.ip || 'DHCP'}
                            </span>
                            <small className={`block text-[10px] font-medium ${dev.archived ? 'text-red-500 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                              {dev.archived ? 'Archived' : 'Active'}
                            </small>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="p-4 text-center text-slate-400 dark:text-slate-500 text-xs italic">
                    No hardware devices currently registered in this room.
                  </div>
                )}
              </div>

              {/* Shortcut to Add Equipment */}
              <Button
                variant="primary"
                onClick={() => navigate('/assets')}
                style={{ width: '100%', justifyContent: 'center' }}
              >
                <Plus size={15} />
                Manage Hardware in Inventory
              </Button>
            </div>

            <div className="drawer-footer flex items-center justify-between p-4 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <Button
                type="button"
                variant="danger"
                size="sm"
                data-testid={`delete-loc-${selectedRoom.id}`}
                disabled={busy}
                onClick={() => {
                  const loc = selectedRoom;
                  setSelectedRoom(null);
                  handleDelete(loc);
                }}
              >
                <Trash2 size={13} />
                Delete Location
              </Button>
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    const loc = selectedRoom;
                    setSelectedRoom(null);
                    handleOpenEdit(loc);
                  }}
                >
                  <Pencil size={13} />
                  Edit Room
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedRoom(null)}
                >
                  Close
                </Button>
              </div>
            </div>
          </aside>
        </>
      )}

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

      {/* EDIT LOCATION MODAL */}
      <Modal
        open={Boolean(editingLoc)}
        onClose={() => setEditingLoc(null)}
        title="Edit Campus Location"
        id="edit-location-dialog"
      >
        <form onSubmit={handleEditSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Room / Location Code" id="loc-edit-code">
              <input
                required
                minLength={2}
                maxLength={40}
                id="loc-edit-code"
                data-testid="loc-edit-input-code"
                value={editForm.code}
                onChange={e => setEditForm({ ...editForm, code: e.target.value })}
                placeholder="e.g. B-04-03"
                spellCheck={false}
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
                />
              </Field>
            </div>

            <Field label="Building Block" id="loc-edit-block">
              <Select
                id="loc-edit-block"
                data-testid="loc-edit-select-block"
                value={editForm.block}
                onChange={(e: any) => setEditForm({ ...editForm, block: e.target.value })}
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
                onChange={(e: any) => setEditForm({ ...editForm, level: e.target.value })}
              >
                {LEVEL_OPTIONS.map(lvl => (
                  <option key={lvl} value={lvl}>
                    {lvl}
                  </option>
                ))}
              </Select>
            </Field>

            <div className="sm:col-span-2">
              <Field label="Room Number / Landmark" id="loc-edit-room">
                <input
                  required
                  minLength={1}
                  maxLength={40}
                  id="loc-edit-room"
                  data-testid="loc-edit-input-room"
                  value={editForm.room}
                  onChange={e => setEditForm({ ...editForm, room: e.target.value })}
                  placeholder="e.g. 03"
                />
              </Field>
            </div>
          </div>

          <ErrorBox error={error} />

          <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-200 dark:border-slate-800">
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditingLoc(null)}
            >
              Cancel
            </Button>
            <Button id="save-edit-location-btn" variant="primary" type="submit" disabled={busy}>
              <Save size={14} />
              {busy ? 'Saving Changes…' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
