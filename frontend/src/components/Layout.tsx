import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { Logo, Button, Modal, ErrorBox } from './shared';
import { useAuth } from '../context';
import { roleLabel, errorText } from '../lib/api';

const QUICK_JUMP_ITEMS = [
  { label: 'AP-CL-B-03 · Computing Lab B (10.20.2.13)', type: 'Access Point', to: '/monitoring?ap=ap-07', roles: ['admin', 'engineer'] },
  { label: 'AP-CL-A-01 · Computing Lab A (10.20.1.11)', type: 'Access Point', to: '/monitoring?ap=ap-01', roles: ['admin', 'engineer'] },
  { label: 'AP-IL-C-01 · Innovation Lab (10.20.3.11)', type: 'Access Point', to: '/monitoring?ap=ap-09', roles: ['admin', 'engineer'] },
  { label: 'Computing Lab A · 2D Workstation Map', type: 'Lab Floor Map', to: '/checklists', roles: ['admin', 'engineer', 'assistant'] },
  { label: 'Incident Tickets · Kanban Triage Board', type: 'Operations', to: '/tickets', roles: ['admin', 'engineer', 'assistant'] },
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
          ['/tickets', 'Incident Tickets', Tickets],
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
          ['/monitoring', 'Device Monitoring', Radio],
          ['/tickets', 'Incident Tickets', Tickets],
          ['/checklists', 'Equipment Checklists', ClipboardCheck],
        ],
      },
    ];
  }
  return [
    {
      label: 'OPERATIONS',
      items: [
        ['/', 'Dashboard', LayoutDashboard],
        ['/monitoring', 'Device Monitoring', Radio],
        ['/shifts', 'Shift Schedule', CalendarDays],
        ['/checklists', 'Equipment Checklists', ClipboardCheck],
        ['/tickets', 'Incident Tickets', Tickets],
      ],
    },
    {
      label: 'ADMINISTRATION',
      items: [
        ['/assets', 'Hardware Inventory', Server],
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
    activeGroup?.label === 'ADMINISTRATION' || ['/assets', '/users', '/reports', '/audit'].includes(location.pathname)
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

  return (
    <div className={`app-shell ${light ? 'light-theme' : ''}`}>
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
                      {path === '/monitoring' && <span className="nav-live" />}
                    </NavLink>
                  ))}
                </div>
              )
          )}
        </nav>
        <div className="sidebar-bottom">
          <div className="environment">
            <FlaskConical size={18} />
            <div>
              <strong>Live Heartbeat Active</strong>
              <span>Auto-Telemetry & SLA Loop</span>
            </div>
            <span className="environment-dot" />
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
            <Link
              to="/alerts"
              title="System Alerts"
              aria-label="System Alerts"
              className="icon-button notification-button"
              data-testid="notification-bell"
            >
              <Bell size={18} />
              <i />
            </Link>
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

      <Modal open={cmdOpen} onClose={setCmdOpen} title="Quick Jump & Asset Search" description="Jump to any access point, lab floor map, or operations view (⌘K)" id="command-palette-dialog">
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