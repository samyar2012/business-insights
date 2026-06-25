import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import ThemeToggle from '../components/app/ThemeToggle'
import { apiFetch } from '../lib/api'
import Alert from '../components/app/Alert'

const StoreUrlSettings = ({ businesses }) => {
  const { refreshUser } = useAuth()
  const business = businesses[0] || null
  const [storeUrl, setStoreUrl] = useState(business?.store_url || '')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setStoreUrl(business?.store_url || '')
  }, [business?.store_url])

  const handleSave = async (e) => {
    e.preventDefault()
    if (!business?.id) return
    setBusy(true)
    setError('')
    setSuccess('')
    try {
      const data = await apiFetch(`/businesses/${business.id}/store-url`, {
        method: 'PATCH',
        body: JSON.stringify({ store_url: storeUrl.trim() }),
      })
      setSuccess(data.message || 'Store URL saved.')
      await refreshUser()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const handleRemove = async () => {
    if (!business?.id) return
    const confirmed = window.confirm(
      'Remove your store URL and delete all scans, website analysis, and research results?',
    )
    if (!confirmed) return

    setBusy(true)
    setError('')
    setSuccess('')
    try {
      const data = await apiFetch(`/businesses/${business.id}/store-url`, {
        method: 'PATCH',
        body: JSON.stringify({ store_url: '' }),
      })
      setStoreUrl('')
      setSuccess(data.message || 'Store URL removed and analysis data cleared.')
      await refreshUser()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const handleClearResults = async () => {
    if (!business?.id) return
    const confirmed = window.confirm(
      'Clear all scans, website analysis, and research results? Your store URL will stay the same.',
    )
    if (!confirmed) return

    setBusy(true)
    setError('')
    setSuccess('')
    try {
      const data = await apiFetch(`/businesses/${business.id}/analysis-data`, {
        method: 'DELETE',
      })
      setSuccess(data.message || 'Analysis data cleared.')
      await refreshUser()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (!business) {
    return (
      <p className="mt-4 text-sm text-[var(--app-text-muted)]">
        No business on file yet. Complete onboarding to add a store URL.
      </p>
    )
  }

  return (
    <div className="mt-4">
      <p className="text-xs font-semibold uppercase text-[var(--app-text-muted)]">
        {business.business_name}
      </p>

      {error ? (
        <Alert variant="error" title="Could not update" className="mt-4">
          {error}
        </Alert>
      ) : null}

      {success ? (
        <Alert variant="success" title="Saved" className="mt-4" onDismiss={() => setSuccess('')}>
          {success}
        </Alert>
      ) : null}

      <form onSubmit={handleSave} className="mt-4 space-y-3">
        <label className="app-label" htmlFor="settings-store-url">
          Store URL
        </label>
        <input
          id="settings-store-url"
          type="url"
          placeholder="https://yourstore.com"
          value={storeUrl}
          onChange={(e) => setStoreUrl(e.target.value)}
          className="app-field w-full"
          disabled={busy}
        />
        <p className="text-xs text-[var(--app-text-muted)]">
          Saving a different URL removes previous dashboard scans and website reports so you can analyze
          the new site from scratch.
        </p>
        <div className="flex flex-wrap gap-3 pt-1">
          <button type="submit" className="app-btn app-btn--primary" disabled={busy || !storeUrl.trim()}>
            {busy ? 'Saving...' : 'Save store URL'}
          </button>
          <button
            type="button"
            className="app-btn app-btn--secondary"
            disabled={busy}
            onClick={handleClearResults}
          >
            Clear scans &amp; results
          </button>
          {business.store_url ? (
            <button
              type="button"
              className="app-btn app-btn--ghost text-[var(--app-error-icon)]"
              disabled={busy}
              onClick={handleRemove}
            >
              Remove URL
            </button>
          ) : null}
        </div>
      </form>
    </div>
  )
}

const AppSettings = () => {
  const { user } = useAuth()
  const [memories, setMemories] = useState([])
  const [memoryError, setMemoryError] = useState('')
  const [deletingId, setDeletingId] = useState(null)

  const rows = [
    { label: 'Name', value: user?.profile?.display_name || '-' },
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

  const loadMemories = useCallback(async () => {
    setMemoryError('')
    try {
      const data = await apiFetch('/memory')
      setMemories(data.memories || [])
    } catch (err) {
      setMemoryError(err.message)
    }
  }, [])

  useEffect(() => {
    loadMemories()
  }, [loadMemories])

  const deleteMemory = async (id) => {
    setDeletingId(id)
    try {
      await apiFetch(`/memory/${id}`, { method: 'DELETE' })
      setMemories((prev) => prev.filter((m) => m.id !== id))
    } catch (err) {
      setMemoryError(err.message)
    } finally {
      setDeletingId(null)
    }
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
        <h2 className="text-sm font-semibold text-[var(--app-text)]">Store URL</h2>
        <p className="mt-1 text-sm text-[var(--app-text-secondary)]">
          Change your store address or remove it to start fresh. Updating or removing the URL clears
          website crawls, scans, and research results tied to the previous address.
        </p>

        <StoreUrlSettings businesses={user?.businesses || []} />
      </section>

      <section className="app-card mt-6 p-6">
        <h2 className="text-sm font-semibold text-[var(--app-text)]">AI memory</h2>
        <p className="mt-1 text-sm text-[var(--app-text-secondary)]">
          Business Insights uses saved preferences and context to personalize recommendations. This is
          not model training - your data stays in your account for coaching and content tools.
        </p>

        {memoryError ? (
          <Alert variant="error" title="Memory error" className="mt-4">
            {memoryError}
          </Alert>
        ) : null}

        {!memories.length ? (
          <p className="mt-4 text-sm text-[var(--app-text-muted)]">
            No memories saved yet. Chat with AI Growth Coach to build preferences over time.
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {memories.map((mem) => (
              <li
                key={mem.id}
                className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-[var(--app-border)] p-3"
              >
                <div>
                  <p className="text-xs font-semibold uppercase text-[var(--app-text-muted)]">
                    {mem.memory_type} / {mem.key}
                  </p>
                  <p className="mt-1 text-sm text-[var(--app-text-secondary)]">
                    {JSON.stringify(mem.value)}
                  </p>
                </div>
                <button
                  type="button"
                  className="app-btn app-btn--ghost text-xs"
                  disabled={deletingId === mem.id}
                  onClick={() => deleteMemory(mem.id)}
                >
                  Delete
                </button>
              </li>
            ))}
          </ul>
        )}
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
