import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useSidebar } from '../../context/SidebarContext'
import AccountMenu from './AccountMenu'
import PlanAccountSection, { PersonIcon, usePlanLabel } from './PlanAccountSection'
import ThemeToggle from './ThemeToggle'

const SidebarExpandIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
    <path d="M6.75 3a.75.75 0 00-.75.75V16.25a.75.75 0 001.5 0V3.75A.75.75 0 006.75 3zM15.22 5.22a.75.75 0 011.06 0l2.25 2.25a.75.75 0 010 1.06l-2.25 2.25a.75.75 0 11-1.06-1.06L16.44 8.5l-1.22-1.22a.75.75 0 010-1.06zM11.25 8.5a.75.75 0 011.06 0l2.25 2.25a.75.75 0 010 1.06l-2.25 2.25a.75.75 0 11-1.06-1.06L12.44 11l-1.22-1.22a.75.75 0 010-1.06z" />
  </svg>
)

const SidebarCollapseIcon = () => (
  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4" aria-hidden>
    <path d="M4.75 3a.75.75 0 00-.75.75v12.5c0 .414.336.75.75.75h10.5a.75.75 0 000-1.5H5.5V3.75A.75.75 0 004.75 3zM15.22 5.22a.75.75 0 011.06 0l2.25 2.25a.75.75 0 010 1.06l-2.25 2.25a.75.75 0 11-1.06-1.06L16.44 8.5l-1.22-1.22a.75.75 0 010-1.06z" />
  </svg>
)

const AppTopBar = () => {
  const { collapsed, toggleCollapsed, mobileOpen, toggleMobile, closeMobile, isDesktop } = useSidebar()
  const [menuOpen, setMenuOpen] = useState(false)
  const planLabel = usePlanLabel()

  const sidebarOpen = isDesktop ? !collapsed : mobileOpen

  const handleNavToggle = () => {
    if (isDesktop) toggleCollapsed()
    else toggleMobile()
  }

  const NavIcon = sidebarOpen ? SidebarCollapseIcon : SidebarExpandIcon

  useEffect(() => {
    if (mobileOpen) setMenuOpen(false)
  }, [mobileOpen])

  return (
    <header className="app-topbar">
      <div className="app-topbar__start">
        <button
          type="button"
          onClick={handleNavToggle}
          className="app-icon-btn app-topbar__nav-toggle"
          aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          aria-expanded={sidebarOpen}
        >
          <NavIcon />
        </button>

        <Link to="/app" className="app-topbar__brand">
          <span className="app-logo-mark">BI</span>
          <span className="app-topbar__brand-text">Business Insight</span>
        </Link>
      </div>

      <div className="app-topbar__end">
        <ThemeToggle compact />
        <Link to="/app/settings" className="app-btn app-btn--ghost app-topbar__settings">
          Settings
        </Link>
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              closeMobile()
              setMenuOpen((o) => !o)
            }}
            className="app-plan-topbar-trigger"
            aria-label="Account menu"
            aria-expanded={menuOpen}
          >
            <span className="app-plan-section__icon app-plan-section__icon--sm">
              <PersonIcon className="h-4 w-4" />
            </span>
            <span className="app-topbar__plan-label">{planLabel}</span>
          </button>
          {menuOpen ? <AccountMenu onClose={() => setMenuOpen(false)} /> : null}
        </div>
      </div>
    </header>
  )
}

export default AppTopBar
