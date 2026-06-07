import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useSidebar } from '../../context/SidebarContext'
import PlanAccountSection from './PlanAccountSection'

const Chevron = ({ open }) => (
  <svg
    viewBox="0 0 20 20"
    fill="currentColor"
    className={`h-4 w-4 shrink-0 opacity-50 transition-transform duration-300 ${open ? 'rotate-90' : ''}`}
    aria-hidden
  >
    <path
      fillRule="evenodd"
      d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
      clipRule="evenodd"
    />
  </svg>
)

const workspaceItems = [
  { label: 'Connect GitHub', to: '/app/workspace/github', icon: '⌘' },
  { label: 'Add URL', to: '/app/workspace/url', icon: '🔗' },
  { label: 'Create project', to: '/app/workspace/create', icon: '＋' },
  { label: 'Load project', to: '/app/workspace/load', icon: '↗' },
]

const toolItems = [
  { label: 'Overview', to: '/app/tools', icon: '◫' },
  { label: 'Churn prediction', to: '/app/tools/churn-prediction', icon: '◎' },
  { label: 'File analyze', to: '/app/tools/file-analyze', icon: '▤' },
  { label: 'AI coach', to: '/app/tools/ai-coach', icon: '✦' },
]

const topLinks = [{ label: 'Dashboard', to: '/app', icon: '◫' }]

const bottomLinks = [
  { label: 'Businesses', to: '/app/businesses', icon: '◈' },
  { label: 'Settings', to: '/app/settings', icon: '⚙' },
]

const pathMatches = (pathname, to) => {
  if (to === '/app/tools') return pathname === '/app/tools'
  if (to === '/app') return pathname === '/app'
  return pathname === to || pathname.startsWith(`${to}/`)
}

const NavDropdown = ({ label, items, pathname, collapsed, defaultOpen = false }) => {
  const isSectionActive = items.some((item) => pathMatches(pathname, item.to))
  const [open, setOpen] = useState(defaultOpen || isSectionActive)

  if (collapsed) {
    return (
      <div className="space-y-1">
        {items.map((item) => {
          const active = pathMatches(pathname, item.to)
          return (
            <Link
              key={item.to}
              to={item.to}
              title={item.label}
              className={`app-sidebar__nav-link justify-center px-2 ${active ? 'is-active' : ''}`}
            >
              <span aria-hidden>{item.icon}</span>
            </Link>
          )
        })}
      </div>
    )
  }

  return (
    <div className="space-y-0.5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`app-sidebar__nav-link w-full ${isSectionActive ? 'text-[var(--app-text)]' : ''}`}
        aria-expanded={open}
      >
        <Chevron open={open} />
        <span className="flex-1 text-left">{label}</span>
      </button>
      <div
        className={`app-sidebar-dropdown ${open ? 'app-sidebar-dropdown--open' : ''}`}
        aria-hidden={!open}
      >
        <div className="space-y-0.5 pl-2">
          {items.map((item) => {
            const active = pathMatches(pathname, item.to)
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`app-sidebar__nav-link app-sidebar__nav-link--sub ${active ? 'is-active' : ''}`}
              >
                <span className="text-xs opacity-60" aria-hidden>
                  {item.icon}
                </span>
                {item.label}
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}

const AppSidebar = () => {
  const { pathname } = useLocation()
  const { collapsed } = useSidebar()

  return (
    <aside
      className={`app-sidebar hidden shrink-0 flex-col lg:flex ${
        collapsed ? 'app-sidebar--collapsed w-14' : 'w-[13.5rem]'
      }`}
    >
      <div className="flex flex-1 flex-col overflow-y-auto px-2.5 py-5">
        {!collapsed ? <p className="app-eyebrow px-2">Navigation</p> : null}

        <nav className={`space-y-1 ${collapsed ? 'mt-2' : 'mt-4'}`}>
          {topLinks.map((item) => {
            const active = pathname === item.to
            return (
              <Link
                key={item.to}
                to={item.to}
                title={collapsed ? item.label : undefined}
                className={`app-sidebar__nav-link ${active ? 'is-active' : ''} ${
                  collapsed ? 'justify-center px-2' : ''
                }`}
              >
                <span className="text-xs opacity-60" aria-hidden>
                  {item.icon}
                </span>
                {!collapsed ? item.label : null}
              </Link>
            )
          })}

          <NavDropdown
            label="Workspace"
            items={workspaceItems}
            pathname={pathname}
            collapsed={collapsed}
            defaultOpen
          />

          <NavDropdown
            label="Tools"
            items={toolItems}
            pathname={pathname}
            collapsed={collapsed}
          />

          {bottomLinks.map((item) => {
            const active = pathname === item.to || pathname.startsWith(`${item.to}/`)
            return (
              <Link
                key={item.to}
                to={item.to}
                title={collapsed ? item.label : undefined}
                className={`app-sidebar__nav-link ${active ? 'is-active' : ''} ${
                  collapsed ? 'justify-center px-2' : ''
                }`}
              >
                <span className="text-xs opacity-60" aria-hidden>
                  {item.icon}
                </span>
                {!collapsed ? item.label : null}
              </Link>
            )
          })}
        </nav>
      </div>

      {!collapsed ? (
        <div className="app-divider p-3">
          <PlanAccountSection variant="sidebar" />
        </div>
      ) : null}
    </aside>
  )
}

export default AppSidebar
