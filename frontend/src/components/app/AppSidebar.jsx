import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useSidebar } from '../../context/SidebarContext'
import PlanAccountSection from './PlanAccountSection'
import { TOOL_CATALOG, TOOL_ICONS } from '../../pages/tools/toolConfig'

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
  { label: 'Connect GitHub', to: '/app/workspace/github', icon: 'G' },
  { label: 'Add URL', to: '/app/workspace/url', icon: 'U' },
  { label: 'Create project', to: '/app/workspace/create', icon: '+' },
  { label: 'Load project', to: '/app/workspace/load', icon: 'L' },
]

const toolItems = [
  { label: 'Overview', to: '/app/tools', icon: 'T' },
  ...TOOL_CATALOG.map((tool) => ({
    label: tool.title,
    to: tool.to,
    icon: TOOL_ICONS[tool.icon] || '*',
  })),
]

const topLinks = [
  { label: 'Dashboard', to: '/app', icon: 'D' },
  { label: 'Scans', to: '/app/scans', icon: 'S' },
  { label: 'Action Plan', to: '/app/action-plan', icon: 'P' },
]

const bottomLinks = [
  { label: 'Businesses', to: '/app/businesses', icon: 'B' },
  { label: 'Settings', to: '/app/settings', icon: '*' },
]

const pathMatches = (pathname, to) => {
  if (to === '/app/tools') return pathname === '/app/tools'
  if (to === '/app/scans') return pathname === '/app/scans' || pathname.startsWith('/app/scans/')
  if (to === '/app/action-plan') return pathname === '/app/action-plan'
  if (to === '/app') return pathname === '/app'
  return pathname === to || pathname.startsWith(`${to}/`)
}

const NavDropdown = ({ label, items, pathname, collapsed, defaultOpen = false, onNavigate }) => {
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
              onClick={onNavigate}
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
                onClick={onNavigate}
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
  const { collapsed, mobileOpen, isDesktop, closeMobile } = useSidebar()
  const effectiveCollapsed = collapsed && isDesktop
  const sidebarVisible = isDesktop ? true : mobileOpen

  useEffect(() => {
    closeMobile()
  }, [pathname, closeMobile])

  const handleNavigate = isDesktop ? undefined : closeMobile

  const sidebarStateClass = isDesktop
    ? effectiveCollapsed
      ? 'app-sidebar--collapsed'
      : 'app-sidebar--expanded'
    : mobileOpen
      ? 'app-sidebar--expanded'
      : 'app-sidebar--hidden'

  return (
    <>
      {!isDesktop && mobileOpen ? (
        <button
          type="button"
          className="app-sidebar-backdrop"
          aria-label="Close navigation"
          onClick={closeMobile}
        />
      ) : null}
      <aside
        className={`app-sidebar flex min-h-0 shrink-0 flex-col self-stretch ${sidebarStateClass}`}
        aria-hidden={!sidebarVisible ? true : undefined}
      >
        <div className="app-sidebar__inner flex min-h-0 flex-1 flex-col">
          <div
            className={`flex flex-1 flex-col overflow-y-auto py-5 ${
              effectiveCollapsed ? 'px-1.5' : 'px-2.5'
            }`}
          >
          {!effectiveCollapsed ? <p className="app-eyebrow px-2">Navigation</p> : null}

          <nav className={`space-y-1 ${effectiveCollapsed ? 'mt-2' : 'mt-4'}`}>
            {topLinks.map((item) => {
              const active = pathMatches(pathname, item.to)
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  title={effectiveCollapsed ? item.label : undefined}
                  onClick={handleNavigate}
                  className={`app-sidebar__nav-link ${active ? 'is-active' : ''} ${
                    effectiveCollapsed ? 'justify-center px-2' : ''
                  }`}
                >
                  <span className="text-xs opacity-60" aria-hidden>
                    {item.icon}
                  </span>
                  {!effectiveCollapsed ? <span className="app-sidebar__label">{item.label}</span> : null}
                </Link>
              )
            })}

            <NavDropdown
              label="Workspace"
              items={workspaceItems}
              pathname={pathname}
              collapsed={effectiveCollapsed}
              defaultOpen
              onNavigate={handleNavigate}
            />

            <NavDropdown
              label="Tools"
              items={toolItems}
              pathname={pathname}
              collapsed={effectiveCollapsed}
              onNavigate={handleNavigate}
            />

            {bottomLinks.map((item) => {
              const active = pathname === item.to || pathname.startsWith(`${item.to}/`)
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  title={effectiveCollapsed ? item.label : undefined}
                  onClick={handleNavigate}
                  className={`app-sidebar__nav-link ${active ? 'is-active' : ''} ${
                    effectiveCollapsed ? 'justify-center px-2' : ''
                  }`}
                >
                  <span className="text-xs opacity-60" aria-hidden>
                    {item.icon}
                  </span>
                  {!effectiveCollapsed ? <span className="app-sidebar__label">{item.label}</span> : null}
                </Link>
              )
            })}
          </nav>
        </div>

        {!effectiveCollapsed ? (
          <div className="app-divider shrink-0 p-3">
            <PlanAccountSection variant="sidebar" />
          </div>
        ) : null}
        </div>
      </aside>
    </>
  )
}

export default AppSidebar
