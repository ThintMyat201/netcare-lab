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
        subtitle="Manage university physical room codes (Block, Floor/Level, Room), computing labs, and coverage zones."
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

      {/* APSpace-Style Zone Filter Pills & Quick Search Bar */}
      <div className="zone-filter-pills" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
          {ZONE_PILLS.map(({ key, label }) => (
            <button
              key={key}
              data-testid={`loc-filter-${key}`}
              className={`zone-pill-btn ${zonePill === key ? 'active' : ''}`}
              onClick={() => setZonePill(key)}
            >
              {label}
              <span style={{ marginLeft: '6px', fontSize: '11px', opacity: 0.8 }}>
                {rawData.filter(loc => matchesZonePill(loc, key)).length}
              </span>
            </button>
          ))}
        </div>

        <div className="search-field inventory-search" style={{ minWidth: '280px' }}>
          <Search size={15} />
          <input
            data-testid="location-search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search room code (e.g. B-04-03), name, block…"
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
        <div className="room-cards-grid">
          {filtered.map(loc => {
            const CatIcon = CATEGORY_ICONS[loc.category] || MapPin;
            const badgeClass = CATEGORY_BADGE_CLASSES[loc.category] || 'zone-labs';
            const wsCount = loc.workstation_count ?? 0;
            const apCount = loc.ap_count ?? 0;
            const totalEq = loc.equipment_count ?? wsCount + apCount;

            return (
              <div
                key={loc.id}
                className="apspace-room-card"
                data-testid={`location-card-${loc.id}`}
                onClick={() => setSelectedRoom(loc)}
              >
                {/* 1. TOP: Room Code Pill + Category Badge */}
                <div className="room-card-top">
                  <span className="apspace-code-pill" data-testid={`loc-code-${loc.id}`}>
                    {loc.code}
                  </span>
                  <span className={`zone-badge ${badgeClass}`}>
                    <CatIcon size={12} />
                    {loc.category}
                  </span>
                </div>

                {/* 2. MIDDLE: Location Name + Subtext Breakdown */}
                <div className="room-card-middle">
                  <h3 className="room-name-title">{loc.name}</h3>
                  <span className="room-location-subtext">
                    <Building2 size={12} />
                    {loc.block} · {loc.level} · {String(loc.room || '').toLowerCase().startsWith('room') ? String(loc.room) : (loc.room ? `Room ${loc.room}` : 'Common Area')}
                  </span>
                </div>

                {/* 3. BOTTOM: Installed Hardware Chips + Actions */}
                <div className="room-card-footer">
                  <div className="room-devices-summary" data-testid={`loc-equipment-${loc.id}`}>
                    {totalEq > 0 ? (
                      <>
                        {wsCount > 0 && (
                          <span className="dev-count-chip pc">
                            <Monitor size={12} />
                            {wsCount} Workstation{wsCount > 1 ? 's' : ''}
                          </span>
                        )}
                        {wsCount > 0 && apCount > 0 && <span style={{ color: 'var(--muted)' }}>·</span>}
                        {apCount > 0 && (
                          <span className="dev-count-chip ap">
                            <Wifi size={12} />
                            {apCount} AP{apCount > 1 ? 's' : ''}
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="dev-count-empty">No devices installed</span>
                    )}
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }} onClick={e => e.stopPropagation()}>
                    <button
                      type="button"
                      className="icon-btn-subtle"
                      title="Edit Location"
                      aria-label={`Edit ${loc.name}`}
                      data-testid={`edit-loc-${loc.id}`}
                      onClick={() => handleOpenEdit(loc)}
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      type="button"
                      className="icon-btn-subtle danger"
                      title="Remove Location"
                      aria-label={`Delete ${loc.name}`}
                      data-testid={`delete-loc-${loc.id}`}
                      disabled={busy}
                      onClick={() => handleDelete(loc)}
                    >
                      <Trash2 size={13} />
                    </button>
                    <span
                      className="room-card-view-btn"
                      onClick={() => setSelectedRoom(loc)}
                      style={{ cursor: 'pointer', marginLeft: '4px' }}
                    >
                      View &rarr;
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <Empty text="No campus locations match your filter or search query." />
      )}

      {/* ROOM INSPECTOR DRAWER / MODAL */}
      {selectedRoom && (
        <>
          <div className="slide-over-scrim" onClick={() => setSelectedRoom(null)} />
          <aside className="slide-over-drawer" aria-label="Room Inspector" data-testid="room-inspector-drawer">
            <div className="drawer-header">
              <div className="drawer-header-info">
                <span className="apspace-code-pill" style={{ fontSize: '15px', padding: '4px 10px' }}>
                  {selectedRoom.code}
                </span>
                <div>
                  <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--text)' }}>
                    {selectedRoom.name}
                  </h3>
                  <small style={{ color: 'var(--muted)', fontSize: '12px' }}>
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
              <div className="drawer-card">
                <div className="drawer-card-header">
                  <Building2 size={13} />
                  <span>Physical Room Specifications</span>
                </div>
                <div className="spec-grid">
                  <div className="spec-item">
                    <span className="spec-label">Category</span>
                    <span className="spec-value">{selectedRoom.category}</span>
                  </div>
                  <div className="spec-item">
                    <span className="spec-label">Building Block</span>
                    <span className="spec-value">{selectedRoom.block}</span>
                  </div>
                  <div className="spec-item">
                    <span className="spec-label">Floor / Level</span>
                    <span className="spec-value">{selectedRoom.level}</span>
                  </div>
                  <div className="spec-item">
                    <span className="spec-label">Room Identifier</span>
                    <span className="spec-value">{selectedRoom.room || 'General Area'}</span>
                  </div>
                </div>
              </div>

              {/* Installed Equipment Fleet */}
              <div className="drawer-card">
                <div className="drawer-card-header" style={{ justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Cpu size={13} />
                    <span>Installed Hardware Fleet</span>
                  </div>
                  <span style={{ fontSize: '11px', color: '#60a5fa', fontWeight: 600 }}>
                    {selectedRoomDevices.length} Device{selectedRoomDevices.length === 1 ? '' : 's'}
                  </span>
                </div>

                {selectedRoomDevices.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '300px', overflowY: 'auto' }}>
                    {selectedRoomDevices.map((dev: any) => {
                      const isPC = dev.kind === 'PC';
                      return (
                        <div
                          key={dev.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '8px 12px',
                            background: 'rgba(0,0,0,0.2)',
                            borderRadius: '6px',
                            border: '1px solid rgba(255,255,255,0.05)',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <div className={`device-icon-wrap ${isPC ? 'pc-icon' : 'ap-icon'}`} style={{ width: '24px', height: '24px' }}>
                              {isPC ? <Monitor size={13} /> : <Wifi size={13} />}
                            </div>
                            <div>
                              <strong style={{ fontSize: '12.5px', color: 'var(--text)' }}>{dev.tag}</strong>
                              <small style={{ display: 'block', fontSize: '11px', color: 'var(--muted)' }}>
                                {dev.model || (isPC ? 'OptiPlex 7010' : 'AP-515')}
                              </small>
                            </div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <span style={{ fontFamily: 'monospace', fontSize: '12px', color: '#60a5fa' }}>
                              {dev.ip || 'DHCP'}
                            </span>
                            <small style={{ display: 'block', fontSize: '10px', color: dev.archived ? '#f87171' : '#34d399' }}>
                              {dev.archived ? 'Archived' : 'Active'}
                            </small>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ padding: '16px 8px', textAlign: 'center', color: 'var(--muted)', fontSize: '12.5px', fontStyle: 'italic' }}>
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

            <div className="drawer-footer">
              <Button
                type="button"
                variant="outline"
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
                onClick={() => setSelectedRoom(null)}
              >
                Close
              </Button>
            </div>
          </aside>
        </>
      )}

      {/* SMART AUTO-CODE CREATE LOCATION MODAL */}
      <Modal
        open={openAdd}
        onClose={setOpenAdd}
        title="Add Campus Location"
        description="Register a new room code, computing lab, or coverage zone with APSpace-standard code generator."
        id="add-location-dialog"
      >
        <form onSubmit={handleAddSubmit}>
          {/* APSpace Live Auto-Code Preview Banner */}
          <div className="auto-code-preview-bar">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Sparkles size={16} style={{ color: '#60a5fa' }} />
              <span className="auto-code-preview-label">Generated APSpace Room Code:</span>
            </div>
            <span className="auto-code-preview-val">{form.code || 'B-04-06'}</span>
          </div>

          <div className="form-grid">
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
          </div>

          <div className="form-grid">
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
          </div>

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

          <Field label="Room / Location Code (Auto-Generated, Customizable)" id="loc-add-code">
            <input
              required
              minLength={2}
              maxLength={40}
              id="loc-add-code"
              data-testid="loc-input-code"
              value={form.code}
              onChange={e => setForm({ ...form, code: e.target.value })}
              placeholder="e.g. B-04-06 or Tech Lab 5-02"
              spellCheck={false}
            />
          </Field>

          <ErrorBox error={error} />

          <Button id="save-location-btn" variant="primary" type="submit" disabled={busy} style={{ marginTop: '14px' }}>
            <Save size={15} />
            {busy ? 'Saving…' : 'Create Location'}
          </Button>
        </form>
      </Modal>

      {/* EDIT LOCATION MODAL */}
      <Modal
        open={Boolean(editingLoc)}
        onClose={() => setEditingLoc(null)}
        title="Edit Campus Location"
        description="Update physical room code, block, floor, or category. Changes sync automatically across hardware inventory."
        id="edit-location-dialog"
      >
        <form onSubmit={handleEditSubmit}>
          <div className="form-grid">
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
          </div>

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

          <div className="form-grid">
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
          </div>

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

          <ErrorBox error={error} />

          <Button id="save-edit-location-btn" variant="primary" type="submit" disabled={busy} style={{ marginTop: '14px' }}>
            <Save size={15} />
            {busy ? 'Saving Changes…' : 'Save Changes'}
          </Button>
        </form>
      </Modal>
    </>
  );
}
