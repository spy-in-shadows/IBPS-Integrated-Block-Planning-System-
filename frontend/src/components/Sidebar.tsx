import { NavLink } from 'react-router-dom';

const NAV_GROUPS = [
  {
    title: 'INGESTION',
    items: [
      { num: '01', to: '/ingestion', label: 'DATA INGESTION & AUDIT' },
    ],
  },
  {
    title: 'MONITOR',
    items: [
      { num: '02', to: '/dashboard', label: 'OVERVIEW' },
      { num: '03', to: '/tasks', label: 'MAINTENANCE WORKBANK' },
    ],
  },
  {
    title: 'PLANNING & OPERATIONS',
    items: [
      { num: '04', to: '/comparison', label: 'PLAN COMPARISON' },
      { num: '05', to: '/planning', label: 'SCHEDULE PLANNING' },
      { num: '06', to: '/blocks', label: 'BLOCK TIMETABLE' },
      { num: '07', to: '/contingency', label: 'CONTINGENCY CONTROL' },
    ],
  },
  {
    title: 'TECHNICAL',
    items: [
      { num: '08', to: '/diagnostics', label: 'DIAGNOSTICS & AUDIT' },
    ],
  },
];

export function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <div className="brand-code">IBPS</div>
        <div className="brand-name">INTEGRATED BLOCK PLANNING SYSTEM</div>
        <div className="brand-sub">MINISTRY OF RAILWAYS — DECISION SUPPORT</div>
      </div>

      <nav className="sidebar-nav" aria-label="Primary navigation">
        {NAV_GROUPS.map((group) => (
          <div key={group.title} className="nav-group">
            <div className="nav-label">{group.title}</div>
            {group.items.map(({ num, to, label }) => (
              <NavLink key={to} to={to} className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
                <span className="nav-num mono">{num}</span>
                <span className="nav-text">{label}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>

      <div className="sidebar-status">
        <div className="nav-label">SYSTEM STATUS</div>
        <StatusLine label="API CONNECTED" />
        <StatusLine label="SYNTHETIC DEMO DATA" alert />
        <p>Decision-support prototype. Synthetic data only. Final approval remains with railway personnel.</p>
      </div>
    </aside>
  );
}

function StatusLine({ label, alert = false }: { label: string; alert?: boolean }) {
  return (
    <div className={`side-status-line ${alert ? 'alert' : ''}`}>
      <span className="status-square" />
      {label}
    </div>
  );
}

