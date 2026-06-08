import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { apiFetch } from '../../lib/api'
import Alert from './Alert'

const businessTypes = ['Shopify', 'Dropshipping', 'Social-first', 'B2B SaaS', 'Agency', 'Other']

const OnboardingSurvey = ({ onComplete, redirectTo = '/app' }) => {
  const [form, setForm] = useState({
    owner_name: '',
    business_name: '',
    business_type: 'Shopify',
    product_sold: '',
    target_customers: '',
    store_url: '',
    monthly_revenue: '',
    customer_count: '',
    monthly_orders: '',
  })
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const navigate = useNavigate()

  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await apiFetch('/businesses/onboarding', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          monthly_revenue: form.monthly_revenue ? Number(form.monthly_revenue) : null,
          customer_count: form.customer_count ? Number(form.customer_count) : null,
          monthly_orders: form.monthly_orders ? Number(form.monthly_orders) : null,
        }),
      })
      await onComplete?.()
      navigate(redirectTo, { replace: true })
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="app-card p-6 sm:p-8">
        <header>
          <p className="app-eyebrow">Welcome setup</p>
          <h2 className="app-page-title mt-2 text-2xl">Tell us about your business</h2>
          <p className="app-page-subtitle">
            Complete this once so we can personalize your dashboard and tools.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <label className="app-label">
            Your name
            <input
              required
              value={form.owner_name}
              onChange={(e) => set('owner_name', e.target.value)}
              className="app-field"
            />
          </label>
          <label className="app-label">
            Business name
            <input
              required
              value={form.business_name}
              onChange={(e) => set('business_name', e.target.value)}
              className="app-field"
            />
          </label>
          <label className="app-label">
            Type of business
            <select
              value={form.business_type}
              onChange={(e) => set('business_type', e.target.value)}
              className="app-field"
            >
              {businessTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          <label className="app-label">
            Product you sell
            <input
              value={form.product_sold}
              onChange={(e) => set('product_sold', e.target.value)}
              className="app-field"
            />
          </label>
          <label className="app-label">
            Your customers
            <textarea
              rows={3}
              value={form.target_customers}
              onChange={(e) => set('target_customers', e.target.value)}
              className="app-field"
              placeholder="Who buys from you? Demographics, niches, regions..."
            />
          </label>
          <label className="app-label">
            Store / website link
            <input
              type="url"
              value={form.store_url}
              onChange={(e) => set('store_url', e.target.value)}
              className="app-field"
              placeholder="https://"
            />
          </label>

          <fieldset>
            <legend className="app-label mb-3">Statistics</legend>
            <div className="grid gap-4 sm:grid-cols-3">
              <label className="app-label">
                Monthly revenue ($)
                <input
                  type="number"
                  min="0"
                  value={form.monthly_revenue}
                  onChange={(e) => set('monthly_revenue', e.target.value)}
                  className="app-field"
                />
              </label>
              <label className="app-label">
                Customers
                <input
                  type="number"
                  min="0"
                  value={form.customer_count}
                  onChange={(e) => set('customer_count', e.target.value)}
                  className="app-field"
                />
              </label>
              <label className="app-label">
                Monthly orders
                <input
                  type="number"
                  min="0"
                  value={form.monthly_orders}
                  onChange={(e) => set('monthly_orders', e.target.value)}
                  className="app-field"
                />
              </label>
            </div>
          </fieldset>

          {error ? (
            <Alert variant="error" title="Could not save setup" onDismiss={() => setError('')}>
              {error}
            </Alert>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="app-btn app-btn--primary app-btn--block"
          >
            {submitting ? 'Saving...' : 'Complete setup'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default OnboardingSurvey
