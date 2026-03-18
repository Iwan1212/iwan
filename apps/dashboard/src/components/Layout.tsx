import { NavLink, Outlet, useLocation } from 'react-router-dom';

const navItems = [
  { to: '/', label: 'Health' },
  { to: '/scheduler', label: 'Scheduler' },
  { to: '/errors', label: 'Errors' },
  { to: '/cache', label: 'Cache' },
  { to: '/channels', label: 'Channels' },
  { to: '/deals', label: 'Deal Digests' },
  { to: '/workforce', label: 'Workforce' },
  { to: '/config', label: 'Config' },
];

const pageTitles: Record<string, string> = {
  '/': 'Health Overview',
  '/scheduler': 'Scheduler Jobs',
  '/errors': 'Error Logs',
  '/cache': 'Cache Statistics',
  '/channels': 'Channels',
  '/deals': 'Deal Digests',
  '/workforce': 'Workforce Alerts',
  '/config': 'Configuration',
};

function handleLogout() {
  localStorage.removeItem('iwan_token');
  window.location.href = '/login';
}

export default function Layout() {
  const location = useLocation();
  const title = pageTitles[location.pathname] ?? 'Iwan Dashboard';

  return (
    <div className="flex h-screen">
      {/* Sidebar */}
      <aside className="w-56 bg-blue-darker text-white flex flex-col flex-shrink-0">
        <div className="px-5 py-6">
          <h1 className="text-xl font-semibold tracking-tight">Iwan</h1>
          <p className="text-xs text-blue-light mt-0.5">Admin Dashboard</p>
        </div>
        <nav className="flex-1 px-3 space-y-0.5">
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `block px-3 py-2 rounded text-sm transition-colors ${
                  isActive ? 'bg-blue text-white font-medium' : 'text-neutral-300 hover:text-white hover:bg-blue-dark'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="px-3 pb-4">
          <button
            onClick={handleLogout}
            className="w-full px-3 py-2 text-sm text-neutral-400 hover:text-white transition-colors text-left"
          >
            Wyloguj
          </button>
        </div>
      </aside>

      {/* Content */}
      <main className="flex-1 overflow-y-auto">
        <header className="bg-neutral-0 border-b border-neutral-200 px-8 py-5">
          <h2 className="text-lg font-medium" style={{ fontFamily: "'Inter', sans-serif" }}>{title}</h2>
        </header>
        <div className="p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
