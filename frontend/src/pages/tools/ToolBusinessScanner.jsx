import { Link } from 'react-router-dom'
import { useCallback, useEffect, useState } from 'react'
import { apiFetch } from '../../lib/api'
import Alert from '../../components/app/Alert'
import ScoreBar, { formatScanDate } from '../../components/app/ScanUi'

const CHECKLIST_FIELDS = [
  { key: 'has_reviews', label: 'We show customer reviews or social proof' },
  { key: 'has_shipping_policy', label: 'Shipping policy is published' },
  { key: 'has_return_policy', label: 'Return policy is published' },
  { key: 'has_clear_product_photos', label: 'Product photos are clear and professional' },
  { key: 'posts_weekly', label: 'We post on social at least weekly' },
  { key: 'has_competitor', label: 'We track at least one competitor' },
  { key: 'offer_is_clear', label: 'Our main offer is clear above the fold' },
]

const defaultChecklist = Object.fromEntries(CHECKLIST_FIELDS.map((f) => [f.key, false]))

const ToolBusinessScanner = () => {
  const [businesses, setBusinesses] = useState([])
  const [form, setForm] = useState({
    business_id: '',
    store_url: '',
    social_url: '',
    competitor_url: '',
    notes: '',
    ...defaultChecklist,
  })
  const [scan, setScan] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const loadBusinesses = useCallback(async () => {
    const data = await apiFetch('/businesses')
    const list = data.businesses || []
    setBusinesses(list)
    if (list.length && !form.business_id) {
      setForm((f) => ({
        ...f,
        business_id: list[0].id,
        store_url: f.store_url || list[0].store_url || '',
      }))
    }
  }, [form.business_id])

  useEffect(() => {
    loadBusinesses().catch(() => {})
  }, [loadBusinesses])

  const handleBusinessChange = (businessId) => {
    const biz = businesses.find((b) => b.id === businessId)
    setForm((f) => ({
      ...f,
      business_id: businessId,
      store_url: f.store_url || biz?.store_url || '',
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setScan(null)
    if (!form.business_id) {
      setError('Select a business to scan.')
      return
    }
    if (!form.store_url.trim()) {
      setError('Store URL is required.')
      return
    }
    setBusy(true)
    try {
      const data = await apiFetch('/scans', {
        method: 'POST',
        body: JSON.stringify(form),
      })
      setScan(data.scan)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-4xl">
      <Link to="/app/tools" className="app-link text-sm font-medium">
        &larr; All tools
      </Link>
      <header className="mt-4">
        <p className="app-eyebrow">Tool</p>
        <h1 className="app-page-title mt-2">Business Scanner</h1>
        <p className="app-page-subtitle">
          Run a rule-based health scan on your storefront, social presence, and competitive context.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="app-card mt-8 space-y-4 p-6">
        <label className="app-label block">
          Business
          <select
            className="app-field mt-1"
            value={form.business_id}
            onChange={(e) => handleBusinessChange(e.target.value)}
            required
          >
            <option value="">Select a business...</option>
            {businesses.map((b) => (
              <option key={b.id} value={b.id}>
                {b.business_name}
              </option>
            ))}
          </select>
        </label>

        {businesses.length === 0 ? (
          <p className="text-sm text-[var(--app-text-secondary)]">
            No businesses yet.{' '}
            <Link to="/app/businesses" className="app-link">
              Add one first
            </Link>
            .
          </p>
        ) : null}

        <label className="app-label block">
          Store URL
          <input
            className="app-field mt-1"
            type="url"
            placeholder="https://yourstore.com"
            value={form.store_url}
            onChange={(e) => setForm((f) => ({ ...f, store_url: e.target.value }))}
            required
          />
        </label>

        <label className="app-label block">
          Social URL
          <input
            className="app-field mt-1"
            type="url"
            placeholder="https://instagram.com/yourbrand"
            value={form.social_url}
            onChange={(e) => setForm((f) => ({ ...f, social_url: e.target.value }))}
          />
        </label>

        <label className="app-label block">
          Competitor URL
          <input
            className="app-field mt-1"
            type="url"
            placeholder="https://competitor.com"
            value={form.competitor_url}
            onChange={(e) => setForm((f) => ({ ...f, competitor_url: e.target.value }))}
          />
        </label>

        <fieldset className="rounded-lg border border-[var(--app-border)] p-4">
          <legend className="px-1 text-sm font-semibold text-[var(--app-text)]">
            Store checklist (optional)
          </legend>
          <p className="mb-3 text-xs text-[var(--app-text-muted)]">
            These answers adjust category scores in your report.
          </p>
          <ul className="space-y-2">
            {CHECKLIST_FIELDS.map(({ key, label }) => (
              <li key={key}>
                <label className="flex cursor-pointer items-start gap-2.5 text-sm text-[var(--app-text-secondary)]">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={Boolean(form[key])}
                    onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.checked }))}
                  />
                  <span>{label}</span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>

        <label className="app-label block">
          Notes
          <textarea
            className="app-field mt-1"
            rows={3}
            placeholder="Optional context: recent launches, ad spend, seasonal goals..."
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          />
        </label>

        {error ? (
          <Alert variant="error" title="Scan failed" onDismiss={() => setError('')}>
            {error}
          </Alert>
        ) : null}

        <button type="submit" disabled={busy || businesses.length === 0} className="app-btn app-btn--primary">
          {busy ? 'Running scan...' : 'Run scan'}
        </button>
      </form>

      {scan ? (
        <section className="app-card mt-8 p-6">
          <p className="app-eyebrow">Results</p>
          <div className="mt-4 flex flex-wrap items-end gap-4">
            <div>
              <p className="text-sm text-[var(--app-text-secondary)]">Overall score</p>
              <p className="app-stat-value text-4xl">{scan.overall_score}</p>
            </div>
            <p className="text-xs text-[var(--app-text-muted)]">Scanned {formatScanDate(scan.created_at)}</p>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <ScoreBar label="Store" value={scan.store_score} />
            <ScoreBar label="Trust" value={scan.trust_score} />
            <ScoreBar label="Content" value={scan.content_score} />
            <ScoreBar label="Competitor" value={scan.competitor_score} />
          </div>

          <div className="mt-8 grid gap-6 sm:grid-cols-3">
            <div>
              <h3 className="text-sm font-semibold text-[var(--app-text)]">Strengths</h3>
              <ul className="mt-2 space-y-1.5 text-sm text-[var(--app-text-secondary)]">
                {(scan.top_strengths || []).map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="text-[var(--app-accent-strong)]">+</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[var(--app-text)]">Risks</h3>
              <ul className="mt-2 space-y-1.5 text-sm text-[var(--app-text-secondary)]">
                {(scan.top_risks || []).map((item) => (
                  <li key={item} className="flex gap-2">
                    <span className="text-amber-500">!</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[var(--app-text)]">Next actions</h3>
              <ul className="mt-2 space-y-1.5 text-sm text-[var(--app-text-secondary)]">
                {(scan.next_actions || []).map((item) => (
                  <li key={item} className="flex gap-2">
                    <span>-&gt;</span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="mt-8 flex flex-wrap gap-3 border-t border-[var(--app-border)] pt-6">
            <Link to={`/app/scans/${scan.id}`} className="app-btn app-btn--primary">
              View full report
            </Link>
            <Link to="/app/scans" className="app-btn app-btn--secondary">
              Scan history
            </Link>
            <button
              type="button"
              className="app-btn app-btn--ghost"
              onClick={() => {
                setScan(null)
                window.scrollTo({ top: 0, behavior: 'smooth' })
              }}
            >
              Run another scan
            </button>
          </div>
        </section>
      ) : null}
    </div>
  )
}

export default ToolBusinessScanner
