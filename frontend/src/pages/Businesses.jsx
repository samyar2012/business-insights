import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import Alert from '../components/app/Alert'
import PricingCard from '../components/app/PricingCard'
import { apiFetch } from '../lib/api'

const Businesses = () => {
  const { user, refreshUser } = useAuth()
  const [businesses, setBusinesses] = useState(user?.businesses || [])
  const [showUpgrade, setShowUpgrade] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [form, setForm] = useState({ business_name: '', business_type: '', store_url: '' })

  const load = useCallback(async () => {
    const data = await apiFetch('/businesses')
    setBusinesses(data.businesses || [])
    await refreshUser()
  }, [refreshUser])

  useEffect(() => {
    load().catch(() => {})
  }, [load])

  const handleAdd = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setShowUpgrade(false)
    try {
      await apiFetch('/businesses', { method: 'POST', body: JSON.stringify(form) })
      setForm({ business_name: '', business_type: '', store_url: '' })
      setSuccess('Business added successfully.')
      await load()
    } catch (err) {
      if (err.status === 402 || err.message.includes('Upgrade')) {
        setShowUpgrade(true)
        setError('')
      } else {
        setError(err.message)
      }
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <header>
        <p className="app-eyebrow">Account history</p>
        <h1 className="app-page-title mt-2">Your businesses</h1>
        <p className="app-page-subtitle">
          View and manage your workspaces. Your first business is included; additional businesses
          require a paid plan.
        </p>
      </header>

      {businesses.length === 0 ? (
        <Alert variant="info" className="mt-8" title="No businesses yet">
          Complete onboarding or add your first business below.
        </Alert>
      ) : (
        <ul className="app-stagger mt-8 space-y-4">
          {businesses.map((b) => (
            <li key={b.id} className="app-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-lg font-semibold text-[var(--app-text)]">{b.business_name}</p>
                  <p className="text-sm text-[var(--app-text-secondary)]">{b.business_type}</p>
                </div>
                {b.store_url ? (
                  <a href={b.store_url} target="_blank" rel="noreferrer" className="app-link text-sm">
                    Visit store ->
                  </a>
                ) : null}
              </div>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-[var(--app-text-muted)]">Product</dt>
                  <dd className="mt-0.5 text-[var(--app-text)]">{b.product_sold || '-'}</dd>
                </div>
                <div>
                  <dt className="text-[var(--app-text-muted)]">Customers</dt>
                  <dd className="mt-0.5 text-[var(--app-text)]">{b.target_customers || '-'}</dd>
                </div>
                <div>
                  <dt className="text-[var(--app-text-muted)]">Customer count</dt>
                  <dd className="mt-0.5 text-[var(--app-text)]">{b.customer_count ?? '-'}</dd>
                </div>
                <div>
                  <dt className="text-[var(--app-text-muted)]">Monthly orders</dt>
                  <dd className="mt-0.5 text-[var(--app-text)]">{b.monthly_orders ?? '-'}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleAdd} className="app-card mt-10 p-6">
        <h2 className="font-semibold text-[var(--app-text)]">Add another business</h2>
        <p className="mt-1 text-sm text-[var(--app-text-secondary)]">
          Requires a premium plan if you already have one business.
        </p>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <input
            placeholder="Business name"
            value={form.business_name}
            onChange={(e) => setForm((f) => ({ ...f, business_name: e.target.value }))}
            className="app-field"
            required
          />
          <input
            placeholder="Type"
            value={form.business_type}
            onChange={(e) => setForm((f) => ({ ...f, business_type: e.target.value }))}
            className="app-field"
          />
          <input
            placeholder="Store URL"
            value={form.store_url}
            onChange={(e) => setForm((f) => ({ ...f, store_url: e.target.value }))}
            className="app-field"
          />
        </div>

        {error ? (
          <Alert variant="error" title="Could not add business" className="mt-4" onDismiss={() => setError('')}>
            {error}
          </Alert>
        ) : null}

        {success ? (
          <Alert variant="success" title="Saved" className="mt-4" onDismiss={() => setSuccess('')}>
            {success}
          </Alert>
        ) : null}

        {showUpgrade ? (
          <Alert variant="warning" title="Upgrade required" className="mt-4">
            Additional businesses require a paid plan. Choose a plan below to continue.
          </Alert>
        ) : null}

        <button type="submit" className="app-btn app-btn--primary mt-5">
          Add business
        </button>
      </form>

      {showUpgrade ? (
        <div className="mt-6 space-y-4">
          <PricingCard />
          <Link to="/app/plans" className="app-btn app-btn--secondary inline-flex">
            View full plans page
          </Link>
        </div>
      ) : null}
    </div>
  )
}

export default Businesses
