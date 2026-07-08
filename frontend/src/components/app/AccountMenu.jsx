import { useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import PlanAccountSection from './PlanAccountSection'

const AccountMenu = ({ onClose }) => {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const ref = useRef(null)

  useEffect(() => {
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) onClose()
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [onClose])

  const handleLogout = () => {
    logout()
    navigate('/login')
    onClose()
  }

  return (
    <div
      ref={ref}
      className="app-account-menu absolute right-0 top-12 z-50 w-[min(100vw-2rem,16rem)] overflow-hidden rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] shadow-[var(--app-shadow)]"
    >
      <PlanAccountSection variant="menu" onUpgradeClick={onClose} />

      <div className="app-divider space-y-0.5 px-2 py-2">
        <Link
          to="/app/businesses"
          onClick={onClose}
          className="block rounded-lg px-2.5 py-2 text-sm text-[var(--app-text-secondary)] transition hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)]"
        >
          Manage businesses
        </Link>
        <Link
          to="/app/settings"
          onClick={onClose}
          className="block rounded-lg px-2.5 py-2 text-sm text-[var(--app-text-secondary)] transition hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)]"
        >
          Settings
        </Link>
        <button
          type="button"
          onClick={handleLogout}
          className="block w-full rounded-lg px-2.5 py-2 text-left text-sm text-[var(--app-text-secondary)] transition hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)]"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}

export default AccountMenu
