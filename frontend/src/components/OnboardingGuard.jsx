import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

/** Redirects incomplete onboarding users away from the main app shell. */
const OnboardingGuard = () => {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="app-loading min-h-[50vh] items-center justify-center">
        <span className="app-loading__dot" />
        <span className="app-loading__dot" />
        <span className="app-loading__dot" />
        Loading…
      </div>
    )
  }

  if (user && !user.onboarding_completed) {
    return <Navigate to="/app/onboarding" replace />
  }

  return <Outlet />
}

export default OnboardingGuard
