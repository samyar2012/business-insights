import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useSidebar } from '../../context/SidebarContext'
import AccountMenu from './AccountMenu'
import PlanAccountSection, { PersonIcon, usePlanLabel } from './PlanAccountSection'
import ThemeToggle from './ThemeToggle'

const AppTopBar = () => {
  const { collapsed, toggleCollapsed } = useSidebar()
  const [menuOpen, setMenuOpen] = useState(false)
  const planLabel = usePlanLabel()

  return (
    <header className="app-topbar sticky top-0 z-40 flex h-16 shrink-0 items-center justify-between px-4 sm:px-6">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={toggleCollapsed}
          className="app-icon-btn hidden lg:flex"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Show sidebar' : 'Hide sidebar'}
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
            {collapsed ? (
              <path d="M6.75 3a.75.75 0 00-.75.75V16.25a.75.75 0 001.5 0V3.75A.75.75 0 006.75 3zM15.22 5.22a.75.75 0 011.06 0l2.25 2.25a.75.75 0 010 1.06l-2.25 2.25a.75.75 0 11-1.06-1.06L16.44 8.5l-1.22-1.22a.75.75 0 010-1.06zM11.25 8.5a.75.75 0 011.06 0l2.25 2.25a.75.75 0 010 1.06l-2.25 2.25a.75.75 0 11-1.06-1.06L12.44 11l-1.22-1.22a.75.75 0 010-1.06z" />
            ) : (
              <path d="M4.75 3a.75.75 0 00-.75.75v12.5c0 .414.336.75.75.75h10.5a.75.75 0 000-1.5H5.5V3.75A.75.75 0 004.75 3zM15.22 5.22a.75.75 0 011.06 0l2.25 2.25a.75.75 0 010 1.06l-2.25 2.25a.75.75 0 11-1.06-1.06L16.44 8.5l-1.22-1.22a.75.75 0 010-1.06z" />
            )}
          </svg>
        </button>
        <Link to="/app" className="group flex items-center gap-3">
          <span className="app-logo-mark">BI</span>
          <span className="hidden text-sm font-semibold tracking-tight text-[var(--app-text)] sm:inline">
            Business Insight
          </span>
        </Link>
      </div>

      <div className="relative flex items-center gap-2">
        <ThemeToggle compact />
        <Link
          to="/app/settings"
          className="app-btn app-btn--ghost hidden px-3 py-2 sm:inline-flex"
        >
          Settings
        </Link>
        <button
          type="button"
          onClick={() => setMenuOpen((o) => !o)}
          className="app-plan-topbar-trigger"
          aria-label="Account menu"
          aria-expanded={menuOpen}
        >
          <span className="app-plan-section__icon app-plan-section__icon--sm">
            <PersonIcon className="h-4 w-4" />
          </span>
          <span className="text-sm font-medium text-[var(--app-text-secondary)]">{planLabel}</span>
        </button>
        {menuOpen ? <AccountMenu onClose={() => setMenuOpen(false)} /> : null}
      </div>
    </header>
  )
}

export default AppTopBar
