import { useAuth } from '../context/AuthContext'
import ThemeToggle from '../components/app/ThemeToggle'

const AppSettings = () => {
  const { user } = useAuth()

  const rows = [
    { label: 'Name', value: user?.profile?.display_name || '—' },
    { label: 'Email', value: user?.email },
    {
      label: 'Plan',
      value: user?.is_premium ? 'Premium' : 'Free',
      badge: user?.is_premium ? 'success' : 'info',
    },
    {
      label: 'Onboarding',
      value: user?.onboarding_completed ? 'Completed' : 'Incomplete',
      badge: user?.onboarding_completed ? 'success' : 'warning',
    },
  ]

  const badgeClass = {
    success: 'bg-[var(--app-success-bg)] text-[var(--app-success-fg)] border-[var(--app-success-border)]',
    warning: 'bg-[var(--app-warning-bg)] text-[var(--app-warning-fg)] border-[var(--app-warning-border)]',
    info: 'bg-[var(--app-info-bg)] text-[var(--app-info-fg)] border-[var(--app-info-border)]',
  }

  return (
    <div className="mx-auto max-w-2xl">
      <header>
        <p className="app-eyebrow">Preferences</p>
        <h1 className="app-page-title mt-2">Settings</h1>
        <p className="app-page-subtitle">Customize appearance and review account details.</p>
      </header>

      <section className="app-card mt-8 p-6">
        <h2 className="text-sm font-semibold text-[var(--app-text)]">Appearance</h2>
        <p className="mt-1 text-sm text-[var(--app-text-secondary)]">
          Choose light, dark, or match your system preference.
        </p>
        <div className="mt-4">
          <ThemeToggle />
        </div>
      </section>

      <section className="app-card mt-6 p-6">
        <h2 className="text-sm font-semibold text-[var(--app-text)]">Account</h2>
        <dl className="mt-5 space-y-4">
          {rows.map((row) => (
            <div
              key={row.label}
              className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--app-border)] pb-4 last:border-0 last:pb-0"
            >
              <dt className="text-sm text-[var(--app-text-muted)]">{row.label}</dt>
              <dd className="text-sm font-medium text-[var(--app-text)]">
                {row.badge ? (
                  <span
                    className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-semibold ${badgeClass[row.badge]}`}
                  >
                    {row.value}
                  </span>
                ) : (
                  row.value
                )}
              </dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  )
}

export default AppSettings
