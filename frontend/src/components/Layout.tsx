import React, { useState, useEffect, useRef, useMemo } from 'react';
import { NavLink, useLocation, useNavigate, Link } from 'react-router-dom';
import {
  LayoutDashboard,
  Radio,
  Tickets,
  ClipboardCheck,
  CalendarDays,
  Server,
  Users,
  ScrollText,
  ChartNoAxesCombined,
  ChevronDown,
  ChevronRight,
  LogOut,
  Bell,
  Menu,
  FlaskConical,
  Sun,
  Moon,
  ArrowUpRight,
  ShieldCheck,
  X,
  Search,
  Activity,
  Power,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  MapPin,
} from 'lucide-react';
import { Logo, Button, Modal, ErrorBox } from './shared';
import { useAuth } from '../context';
import { roleLabel, errorText } from '../lib/api';
import {
  isMonitoringSimActive,
  setMonitoringSimActive,
  getAssistantUnacknowledgedShifts,
  getSharedFleetAps,
  mergeTickets,
} from '../lib/workflow';

const QUICK_JUMP_ITEMS = [
  { label: 'AP-CL-B-03 · Computing Lab B (10.20.2.13)', type: 'Access Point', to: '/monitoring?ap=ap-07', roles: ['admin', 'engineer'] },
  { label: 'AP-CL-A-01 · Computing Lab A (10.20.1.11)', type: 'Access Point', to: '/monitoring?ap=ap-01', roles: ['admin', 'engineer'] },
  { label: 'AP-IL-C-01 · Innovation Lab (10.20.3.11)', type: 'Access Point', to: '/monitoring?ap=ap-09', roles: ['admin', 'engineer'] },
  { label: 'Computing Lab A · 2D Workstation Map', type: 'Lab Floor Map', to: '/checklists', roles: ['admin', 'assistant'] },
  { label: 'Incident Tickets · Kanban Triage Board', type: 'Operations', to: '/tickets', roles: ['admin', 'engineer'] },
  { label: 'Campus Locations & Room Codes', type: 'Administration', to: '/locations', roles: ['admin'] },
  { label: 'Shift Handover & Compliance', type: 'Operations', to: '/shifts', roles: ['admin', 'assistant'] },
  { label: 'Operational SLA Reports & CSV Export', type: 'Administration', to: '/reports', roles: ['admin'] },
];

const getNavigation = (role: string) => {
  if (role === 'assistant') {
    return [
      {
        label: 'OPERATIONS',
        items: [
          ['/', 'Dashboard', LayoutDashboard],
          ['/shifts', 'Shift Schedule', CalendarDays],
          ['/checklists', 'Equipment Checklists', ClipboardCheck],
        ],
      },
    ];
  }
  if (role === 'engineer') {
    return [
      {
        label: 'OPERATIONS',
        items: [
          ['/', 'Dashboard', LayoutDashboard],
          ['/monitoring', 'Network Monitoring', Radio],
          ['/tickets', 'Incident Tickets', Tickets],
        ],
      },
    ];
  }
  return [
    {
      label: 'OPERATIONS',
      items: [
        ['/', 'Dashboard', LayoutDashboard],
        ['/monitoring', 'Network Monitoring', Radio],
        ['/shifts', 'Shift Schedule', CalendarDays],
        ['/checklists', 'Equipment Checklists', ClipboardCheck],
        ['/tickets', 'Incident Tickets', Tickets],
      ],
    },
    {
      label: 'ADMINISTRATION',
      items: [
        ['/assets', 'Hardware Inventory', Server],
        ['/locations', 'Campus Locations', MapPin],
        ['/users', 'Team & Access', Users],
        ['/reports', 'Operational Reports', ChartNoAxesCombined],
        ['/audit', 'Activity Log', ScrollText],
      ],
    },
  ];
};

export const Layout = ({ children }: any) => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobile, setMobile] = useState(false);
  const [account, setAccount] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [cmdQuery, setCmdQuery] = useState('');
  const [error, setError] = useState('');
  const [light, setLight] = useState(false);
  const [simAnomalyActive, setSimAnomalyActive] = useState(() => isMonitoringSimActive());
  const [bellOpen, setBellOpen] = useState(false);
  const [version, setVersion] = useState(0);
  const bellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onWorkflowUpdate = () => setVersion(v => v + 1);
    window.addEventListener('atlas-workflow-updated', onWorkflowUpdate);
    return () => window.removeEventListener('atlas-workflow-updated', onWorkflowUpdate);
  }, []);

  const isAssistant = user?.role === 'assistant';
  const assistantUnackShifts = useMemo(() => {
    if (!isAssistant) return [];
    return getAssistantUnacknowledgedShifts(user);
  }, [isAssistant, user, version]); // eslint-disable-line react-hooks/exhaustive-deps

  const liveFleetAps = useMemo(() => {
    return getSharedFleetAps();
  }, [version, simAnomalyActive]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeApAnomalies = useMemo(() => {
    return liveFleetAps.filter((a: any) => a.status !== 'online');
  }, [liveFleetAps]);

  const activeTickets = useMemo(() => {
    return mergeTickets([]).filter((t: any) => t.status !== 'resolved');
  }, [version, simAnomalyActive]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasAlertActive = isAssistant ? assistantUnackShifts.length > 0 : activeApAnomalies.length > 0;
  const shouldShake = !isAssistant && activeApAnomalies.length > 0;

  useEffect(() => {
    if (!bellOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setBellOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setBellOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [bellOpen]);

  useEffect(() => {
    const onSimState = (e: any) => {
      if (typeof e?.detail?.active === 'boolean') {
        setSimAnomalyActive(e.detail.active);
      } else {
        setSimAnomalyActive(isMonitoringSimActive());
      }
    };
    window.addEventListener('atlas-sim-state', onSimState as EventListener);
    return () => window.removeEventListener('atlas-sim-state', onSimState as EventListener);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdOpen(v => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const links = getNavigation(user.role);
  const activeGroup = links.find(g => g.items.some(x => x[0] === location.pathname));
  const sectionLabel =
    activeGroup?.label === 'ADMINISTRATION' || ['/assets', '/inventory', '/locations', '/users', '/reports', '/audit'].includes(location.pathname)
      ? 'Administration'
      : 'Operations';
  const current = String(
    links.flatMap(g => g.items).find(x => x[0] === location.pathname)?.[1] ||
      (location.pathname === '/alerts' ? 'System Alerts' : 'Dashboard')
  );
  const signout = async () => {
    try {
      await logout();
    } catch (e) {
      setError(errorText(e));
    }
  };

  const quickItems = QUICK_JUMP_ITEMS.filter(
    item => item.roles.includes(user.role) && (item.label + ' ' + item.type).toLowerCase().includes(cmdQuery.toLowerCase())
  );

  useEffect(() => {
    document.documentElement.classList.toggle('dark', !light);
    document.documentElement.classList.toggle('light-theme', light);
  }, [light]);

  return (
    <div className={`app-shell ${light ? 'light-theme' : 'dark'}`}>
      <aside className={`sidebar ${mobile ? 'is-open' : ''}`}>
        <Link to="/" data-testid="brand-home">
          <Logo />
        </Link>
        <button className="mobile-close icon-button" data-testid="close-navigation" onClick={() => setMobile(false)}>
          <X size={18} />
        </button>
        <div className="workspace-switch">
          <img src="https://images.unsplash.com/photo-1562774053-701939374585?w=100&h=100&fit=crop" alt="Campus facility" />
          <div>
            <strong>APU University</strong>
            <span>Main Campus</span>
          </div>
          <span className="campus-dot" />
        </div>
        <nav>
          {links.map(
            group =>
              group.items.length > 0 && (
                <div className="nav-group" key={group.label}>
                  <p>{group.label}</p>
                  {group.items.map(([path, label, Icon]: any) => (
                    <NavLink
                      end={path === '/'}
                      to={path}
                      key={path}
                      data-testid={`nav-${path === '/' ? 'overview' : path.slice(1)}`}
                      onClick={() => setMobile(false)}
                      className={({ isActive }) => (isActive ? 'nav-item active' : 'nav-item')}
                    >
                      <Icon size={18} />
                      <span>{label}</span>
                      {path === '/monitoring' && <span className="nav-live" data-testid="nav-monitoring-live-dot" />}
                    </NavLink>
                  ))}
                </div>
              )
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="environment" data-testid="sidebar-heartbeat-badge">
            <FlaskConical size={18} />
            <div>
              <strong>Live Heartbeat Active</strong>
              <span>Auto-Telemetry & SLA Loop</span>
            </div>
            <span className="environment-dot" data-testid="sidebar-heartbeat-dot" />
          </div>
          <button className="user-profile" data-testid="open-account" onClick={() => setAccount(true)}>
            <span className="avatar">
              {user.name
                .split(' ')
                .map((s: string) => s[0])
                .slice(0, 2)
                .join('')}
            </span>
            <span>
              <strong>{user.name}</strong>
              <small>{roleLabel(user.role)}</small>
            </span>
            <ChevronDown size={15} />
          </button>
        </div>
      </aside>
      {mobile && <div className="nav-scrim" onClick={() => setMobile(false)} data-testid="navigation-overlay" />}
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button className="mobile-menu icon-button" data-testid="open-navigation" onClick={() => setMobile(true)}>
              <Menu size={20} />
            </button>
            <span data-testid="breadcrumb-section">{sectionLabel}</span>
            <ChevronRight size={14} />
            <strong data-testid="breadcrumb-current">{current}</strong>
          </div>
          <div className="topbar-right">
            <button
              type="button"
              className="cmd-palette-btn"
              data-testid="command-palette-trigger"
              onClick={() => {
                setCmdQuery('');
                setCmdOpen(true);
              }}
            >
              <Search size={14} />
              <span>Quick Jump…</span>
              <kbd>⌘K</kbd>
            </button>
            <span className="timezone">
              Asia/Kuala Lumpur <span>MYT</span>
            </span>
            <button
              className="icon-button"
              title="Toggle dark / light theme"
              aria-label="Toggle dark / light theme"
              data-testid="theme-toggle"
              onClick={() => setLight(!light)}
            >
              {light ? <Moon size={17} /> : <Sun size={17} />}
            </button>

            {/* Notification Bell with Role-Isolated Alerts */}
            <div className="notification-bell-wrap" ref={bellRef}>
              <button
                type="button"
                className={`icon-button notification-button ${hasAlertActive ? 'bell-alert-active' : ''}`}
                data-testid="notification-bell"
                title={
                  isAssistant
                    ? assistantUnackShifts.length
                      ? `${assistantUnackShifts.length} Shift Reminder${assistantUnackShifts.length > 1 ? 's' : ''} (Click to view)`
                      : 'Shift Reminders'
                    : activeApAnomalies.length > 0
                    ? `Active Fleet Alerts: ${activeApAnomalies.length} Anomalies Detected (Click to view)`
                    : 'System Alerts'
                }
                aria-label={
                  isAssistant
                    ? `${assistantUnackShifts.length} Shift Reminders`
                    : activeApAnomalies.length > 0
                    ? `Active Fleet Alerts: ${activeApAnomalies.length} Anomalies Detected`
                    : 'System Alerts'
                }
                aria-expanded={bellOpen}
                onClick={() => setBellOpen(v => !v)}
              >
                <Bell size={18} className={shouldShake ? 'bell-icon-shake' : ''} />
                {hasAlertActive ? (
                  <span
                    className={`bell-badge-pill ${shouldShake ? 'animate-pulse' : 'assistant-shift-badge'}`}
                    data-testid="notification-badge-count"
                  >
                    <span className="bell-badge-dot" />
                    <span className="bell-badge-text">
                      {isAssistant
                        ? `${assistantUnackShifts.length} SHIFT${assistantUnackShifts.length > 1 ? 'S' : ''} DUE`
                        : `${activeApAnomalies.length} FAULTS`}
                    </span>
                  </span>
                ) : (
                  <i className="normal-bell-dot" />
                )}
              </button>

              {/* Notification Dropdown Panel */}
              {bellOpen && (
                <div
                  className="notification-dropdown"
                  data-testid="notification-dropdown"
                  role="region"
                  aria-label={isAssistant ? 'Shift Schedule Reminders' : 'Active Fleet Alerts & Anomalies'}
                >
                  {isAssistant ? (
                    <>
                      <div className="notification-header">
                        <div className="notification-header-title">
                          <Bell size={15} />
                          <strong>Shift Schedule Reminders</strong>
                        </div>
                        <span className={`notification-status-badge ${assistantUnackShifts.length ? 'alert' : 'nominal'}`}>
                          {assistantUnackShifts.length
                            ? `${assistantUnackShifts.length} Shift${assistantUnackShifts.length > 1 ? 's' : ''} Pending Ack`
                            : 'All Shifts Acknowledged'}
                        </span>
                      </div>

                      {assistantUnackShifts.length ? (
                        <>
                          <div className="notification-summary-chips">
                            <span className="chip congested">
                              <CalendarDays size={12} /> {assistantUnackShifts.length} Pending Acknowledgement
                            </span>
                          </div>

                          <div className="notification-items-list">
                            {assistantUnackShifts.map((s: any) => (
                              <div className="notification-item congested" key={s.id}>
                                <div className="notif-item-head">
                                  <span className="notif-tag">{s.lab_name}</span>
                                  <span className="notif-badge congested">Pending Ack</span>
                                </div>
                                <div className="notif-item-body">
                                  <span>{s.shift_window}</span>
                                  <Link
                                    to="/shifts"
                                    onClick={() => setBellOpen(false)}
                                    className="notif-link"
                                  >
                                    Acknowledge Shift <ArrowUpRight size={12} />
                                  </Link>
                                </div>
                              </div>
                            ))}
                          </div>

                          <div className="notification-footer">
                            <Link
                              to="/shifts"
                              className="notif-footer-link"
                              onClick={() => setBellOpen(false)}
                            >
                              Open Shift Schedule <ArrowUpRight size={13} />
                            </Link>
                          </div>
                        </>
                      ) : (
                        <div className="notification-empty">
                          <CheckCircle2 size={26} className="text-green" />
                          <strong>All Shifts Acknowledged</strong>
                          <p>You have acknowledged your active shift. Ready for equipment inspections.</p>
                          <Link
                            to="/checklists"
                            className="notif-link-center"
                            onClick={() => setBellOpen(false)}
                          >
                            Go to Equipment Checklists <ArrowUpRight size={13} />
                          </Link>
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="notification-header">
                        <div className="notification-header-title">
                          <Bell size={15} />
                          <strong>Fleet Alerts &amp; Telemetry</strong>
                        </div>
                        {activeApAnomalies.length > 0 ? (
                          <span className="notification-status-badge alert">{activeApAnomalies.length} Anomalies Active</span>
                        ) : (
                          <span className="notification-status-badge nominal">All Systems Nominal</span>
                        )}
                      </div>

                      {activeApAnomalies.length > 0 ? (
                        <>
                          <div className="notification-summary-chips">
                            <span className="chip congested">
                              <Activity size={12} /> {liveFleetAps.filter((a: any) => a.status === 'congested').length} Congested
                            </span>
                            <span className="chip offline">
                              <Power size={12} /> {liveFleetAps.filter((a: any) => a.status === 'offline').length} Offline
                            </span>
                            <span className="chip stale">
                              <Radio size={12} /> {liveFleetAps.filter((a: any) => a.status === 'stale').length} Interrupted
                            </span>
                          </div>

                          <div className="notification-items-list">
                            {activeApAnomalies.map((ap: any) => {
                              const isCongested = ap.status === 'congested';
                              const isOffline = ap.status === 'offline';
                              const badgeClass = isCongested ? 'congested' : isOffline ? 'offline' : 'stale';
                              const badgeText = isCongested ? `${ap.load}% Load` : isOffline ? 'Offline' : 'Feed Interrupted';
                              const simTicket = activeTickets.find(
                                (t: any) => t.asset_id === ap.id || t.asset_tag === ap.tag
                              );

                              return (
                                <div key={ap.id} className={`notification-item ${badgeClass}`}>
                                  <div className="notif-item-head">
                                    <span className="notif-tag">{ap.tag}</span>
                                    <span className="notif-lab">{ap.lab_name}</span>
                                    <span className={`notif-badge ${badgeClass}`}>{badgeText}</span>
                                  </div>
                                  <div className="notif-item-body">
                                    <span>
                                      {isCongested
                                        ? `Airtime load (${ap.load}%) · ${ap.clients} clients`
                                        : isOffline
                                        ? 'Hardware / PoE link outage detected'
                                        : 'Telemetry daemon timeout / interrupted'}
                                      {simTicket ? (
                                        <> · Linked to <strong>{simTicket.number}</strong></>
                                      ) : null}
                                    </span>
                                    <Link
                                      to={simTicket ? `/tickets?ticket=${simTicket.id}` : `/monitoring?ap=${ap.id}`}
                                      onClick={() => setBellOpen(false)}
                                      className="notif-link"
                                    >
                                      {simTicket ? 'View Ticket' : 'Investigate'} <ArrowUpRight size={12} />
                                    </Link>
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          <div className="notification-footer">
                            <button
                              type="button"
                              className="notif-reset-btn"
                              onClick={() => {
                                setMonitoringSimActive(false);
                                setSimAnomalyActive(false);
                                setVersion(v => v + 1);
                                setBellOpen(false);
                              }}
                            >
                              <RotateCcw size={13} /> Reset Fleet to Healthy
                            </button>
                            <Link
                              to="/monitoring"
                              className="notif-footer-link"
                              onClick={() => setBellOpen(false)}
                            >
                              Network Monitoring <ArrowUpRight size={13} />
                            </Link>
                          </div>
                        </>
                      ) : (
                        <div className="notification-empty">
                          <CheckCircle2 size={26} className="text-green" />
                          <strong>All Systems Nominal</strong>
                          <p>All campus Access Points reporting healthy telemetry. Zero active fleet anomalies.</p>
                          <Link
                            to="/monitoring"
                            className="notif-link-center"
                            onClick={() => setBellOpen(false)}
                          >
                            Open Network Monitoring <ArrowUpRight size={13} />
                          </Link>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="main-content" key={location.pathname}>
          {children}
        </main>
        <footer className="app-footer">
          <span>
            <span className="tiny-dot" /> Campus Network Operations Portal
          </span>
          <span>
            Atlas NetCare <span className="footer-version">v1.0</span> <span className="footer-sep">/</span> Timezone: Asia/Kuala Lumpur (MYT)
          </span>
        </footer>
      </div>

      <Modal open={cmdOpen} onClose={setCmdOpen} title="Quick Jump & Asset Search" id="command-palette-dialog">
        <div className="search-field" style={{ marginBottom: 12 }}>
          <Search size={16} />
          <input
            autoFocus
            data-testid="command-palette-input"
            placeholder="Type an AP tag (e.g. AP-CL-B-03), lab name, or page…"
            value={cmdQuery}
            onChange={e => setCmdQuery(e.target.value)}
          />
        </div>
        <div className="cmd-palette-list">
          {quickItems.map((item, idx) => (
            <button
              key={idx}
              type="button"
              className="cmd-palette-item"
              data-testid={`cmd-item-${idx}`}
              onClick={() => {
                setCmdOpen(false);
                navigate(item.to);
              }}
            >
              <div>
                <strong>{item.label}</strong>
                <span>{item.type}</span>
              </div>
              <ArrowUpRight size={15} />
            </button>
          ))}
        </div>
      </Modal>

      <Modal open={account} onClose={setAccount} title="User Account & Role" id="account-dialog">
        <div className="account-info" data-testid="account-details">
          <ShieldCheck size={30} />
          <strong>{user.name}</strong>
          <span>{user.email}</span>
          <span>{roleLabel(user.role)}</span>
        </div>
        <ErrorBox error={error} />
        <Button id="logout-button" onClick={signout}>
          <LogOut size={16} /> Sign Out
        </Button>
      </Modal>
    </div>
  );
};