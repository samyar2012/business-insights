import { Navigate } from 'react-router-dom'
import { useTheme } from '../context/ThemeContext'
import { useAuth } from '../context/AuthContext'
import OnboardingSurvey from '../components/app/OnboardingSurvey'

const OnboardingLayout = () => {
  const { resolvedTheme } = useTheme()
  const { user, loading, refreshUser } = useAuth()

  if (loading) {
    return (
      <div className="app-workspace flex min-h-screen items-center justify-center" data-app-theme={resolvedTheme}>
        <div className="app-loading">
          <span className="app-loading__dot" />
          <span className="app-loading__dot" />
          <span className="app-loading__dot" />
          Loading...
        </div>
      </div>
    )
  }

  if (user?.onboarding_completed) {
    return <Navigate to="/app" replace />
  }

  return (
    <div className="app-workspace app-onboarding-scene min-h-screen" data-app-theme={resolvedTheme}>
      <div className="app-workspace__mesh" aria-hidden />
      <div className="app-workspace__inner relative flex min-h-screen flex-col">
        <header className="flex items-center justify-center px-4 py-8">
          <div className="flex items-center gap-3">
            <span className="app-logo-mark">BI</span>
            <span className="text-sm font-semibold tracking-tight text-[var(--app-text)]">
              Business Insight
            </span>
          </div>
        </header>
        <main className="flex flex-1 items-start justify-center px-4 pb-12 pt-2">
          <div className="app-onboarding-enter w-full max-w-2xl">
            <OnboardingSurvey onComplete={refreshUser} redirectTo="/app" />
          </div>
        </main>
      </div>
    </div>
  )
}

export default OnboardingLayout
