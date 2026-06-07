import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'

export const PersonIcon = ({ className = 'h-5 w-5' }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
    <path
      fillRule="evenodd"
      d="M7.5 6a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM3.751 20.105a8.25 8.25 0 0116.498 0 .75.75 0 01-.437.695A18.683 18.683 0 0112 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 01-.437-.695z"
      clipRule="evenodd"
    />
  </svg>
)

export const usePlanLabel = () => {
  const { user } = useAuth()
  return user?.is_premium ? 'Premium plan' : 'Free plan'
}

/** ChatGPT-style plan strip: person icon + plan label, upgrade below */
const PlanAccountSection = ({ variant = 'sidebar', onUpgradeClick }) => {
  const { user } = useAuth()
  const planLabel = user?.is_premium ? 'Premium plan' : 'Free plan'
  const showUpgrade = !user?.is_premium

  if (variant === 'topbar') {
    return (
      <span className="hidden items-center gap-2 sm:inline-flex">
        <PersonIcon className="h-4 w-4 text-[var(--app-text-secondary)]" />
        <span className="text-sm font-medium text-[var(--app-text-secondary)]">{planLabel}</span>
      </span>
    )
  }

  if (variant === 'menu') {
    return (
      <div className="app-plan-section app-plan-section--menu">
        <div className="app-plan-section__row">
          <span className="app-plan-section__icon">
            <PersonIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-[var(--app-text)]">
              {user?.profile?.display_name || user?.email?.split('@')[0] || 'Account'}
            </p>
            <p className="text-xs text-[var(--app-text-muted)]">{planLabel}</p>
          </div>
        </div>
        {showUpgrade ? (
          <Link
            to="/app/plans"
            onClick={onUpgradeClick}
            className="app-plan-section__upgrade"
          >
            Upgrade
          </Link>
        ) : null}
      </div>
    )
  }

  // sidebar (default)
  return (
    <div className="app-plan-section">
      <div className="app-plan-section__row">
        <span className="app-plan-section__icon">
          <PersonIcon className="h-5 w-5" />
        </span>
        <span className="text-sm font-medium text-[var(--app-text)]">{planLabel}</span>
      </div>
      {showUpgrade ? (
        <Link to="/app/plans" className="app-plan-section__upgrade">
          Upgrade
        </Link>
      ) : (
        <Link to="/app/plans" className="app-plan-section__upgrade app-plan-section__upgrade--muted">
          Manage plan
        </Link>
      )}
    </div>
  )
}

export default PlanAccountSection
