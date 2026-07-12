import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import Alert from '../components/app/Alert'
import { formatScanDate, scoreTone } from '../components/app/ScanUi'

const BusinessResearchReport = () => {
  const { businessId } = useParams()
  const [business, setBusiness] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await apiFetch(`/research/business/${businessId}`)
      setBusiness(data.business)
      setProfile(data.profile)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [businessId])

  useEffect(() => {
    load()
  }, [load])

  const rescan = async () => {
    setBusy(true)
    setError('')
    try {
      const data = await apiFetch(`/research/business/${businessId}/rescan`, { method: 'POST' })
      setBusiness(data.business)
      setProfile(data.profile)
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return <p className="text-sm text-[var(--app-text-muted)]">Loading research report...</p>
  }

  if (error && !business) {
    return (
      <div className="mx-auto max-w-4xl">
        <Alert variant="error" title="Research unavailable">{error}</Alert>
        <Link to="/app" className="app-btn app-btn--secondary mt-4 inline-flex">Back to dashboard</Link>
      </div>
    )
  }

  const scores = profile?.scores || {}
  const website = profile?.website_scan?.summary || {}
  const search = profile?.search_summary || {}
  const signals = profile?.extracted_signals || {}

  return (
    <div className="mx-auto max-w-4xl">
      <Link to="/app" className="app-link text-sm font-medium">&lt;- Dashboard</Link>

      <header className="mt-4">
        <p className="app-eyebrow">Business research</p>
        <h1 className="app-page-title mt-2">{business?.business_name || 'Research report'}</h1>
        <p className="app-page-subtitle">
          {profile ? `Last researched ${formatScanDate(profile.created_at)}` : 'No research run yet'}
        </p>
      </header>

      {!profile ? (
        <div className="app-card mt-8 p-6 text-center">
          <p className="text-sm text-[var(--app-text-secondary)]">No research profile found.</p>
          <button type="button" className="app-btn app-btn--primary mt-4" disabled={busy} onClick={rescan}>
            {busy ? 'Researching...' : 'Run business research'}
          </button>
        </div>
      ) : (
        <>
          <section className="app-card mt-8 p-6">
            <p className="app-eyebrow">Scores</p>
            <p className={`app-stat-value text-5xl ${scoreTone(scores.overall_score)}`}>
              {scores.overall_score ?? '-'}
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {[
                ['Store', scores.store_score],
                ['Trust', scores.trust_score],
                ['Content', scores.content_score],
                ['Offer', scores.offer_score],
                ['Market', scores.market_score],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-[var(--app-border)] px-3 py-2 text-sm">
                  <span className="text-[var(--app-text-muted)]">{label}</span>
                  <p className="font-semibold text-[var(--app-text)]">{value ?? '-'}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="app-card mt-6 p-5">
            <h2 className="text-sm font-semibold">Business info</h2>
            <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <div><dt className="text-[var(--app-text-muted)]">Type</dt><dd>{business?.business_type || '-'}</dd></div>
              <div><dt className="text-[var(--app-text-muted)]">Product</dt><dd>{business?.product_sold || '-'}</dd></div>
              <div><dt className="text-[var(--app-text-muted)]">Audience</dt><dd>{business?.target_customers || '-'}</dd></div>
              <div><dt className="text-[var(--app-text-muted)]">Store URL</dt><dd className="break-all">{business?.store_url || '-'}</dd></div>
            </dl>
          </section>

          <section className="app-card mt-6 p-5">
            <h2 className="text-sm font-semibold">Website scan summary</h2>
            <ul className="mt-3 space-y-1 text-sm text-[var(--app-text-secondary)]">
              <li>HTTPS: {website.https ? 'Yes' : 'No'}</li>
              <li>Title: {website.title || '-'}</li>
              <li>H1: {website.h1 || '-'}</li>
              <li>Meta: {website.meta_description || '-'}</li>
              <li>Social links: {(website.social_links || []).length}</li>
              <li>Pages scanned: {profile.website_scan?.pages_scanned ?? 0}</li>
            </ul>
          </section>

          <section className="app-card mt-6 p-5">
            <h2 className="text-sm font-semibold">Search summary</h2>
            <p className="mt-2 text-sm text-[var(--app-text-secondary)]">
              {search.total_results ?? 0} results across {search.queries?.length ?? 0} queries.
            </p>
            <p className="mt-1 text-xs text-[var(--app-text-muted)]">
              Providers: {(search.providers || []).join(', ') || 'mock'}
            </p>
          </section>

          <section className="app-card mt-6 p-5">
            <h2 className="text-sm font-semibold">Extracted signals</h2>
            <pre className="mt-3 overflow-x-auto rounded-lg bg-[var(--app-surface)] p-3 text-xs text-[var(--app-text-secondary)]">
              {JSON.stringify(signals, null, 2)}
            </pre>
          </section>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {[
              ['Strengths', scores.strengths],
              ['Risks', scores.risks],
              ['Next actions', scores.next_actions],
            ].map(([title, items]) => (
              <section key={title} className="app-card p-5">
                <h2 className="text-sm font-semibold">{title}</h2>
                <ul className="mt-3 space-y-2 text-sm text-[var(--app-text-secondary)]">
                  {(items || []).length ? (
                    items.map((item) => <li key={item}>- {item}</li>)
                  ) : (
                    <li className="text-[var(--app-text-muted)]">None recorded.</li>
                  )}
                </ul>
              </section>
            ))}
          </div>

          {(search.sources || []).length ? (
            <section className="app-card mt-6 p-5">
              <h2 className="text-sm font-semibold">Sources found</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {search.sources.map((src) => (
                  <li key={`${src.url}-${src.query}`}>
                    <a href={src.url} target="_blank" rel="noreferrer" className="app-link break-all">
                      {src.title || src.url}
                    </a>
                    <span className="text-xs text-[var(--app-text-muted)]"> - {src.query}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <div className="mt-8 flex flex-wrap gap-3">
            <button type="button" className="app-btn app-btn--primary" disabled={busy} onClick={rescan}>
              {busy ? 'Rescanning...' : 'Rescan business'}
            </button>
          </div>
        </>
      )}

      {error ? (
        <Alert variant="error" title="Error" className="mt-4">{error}</Alert>
      ) : null}
    </div>
  )
}

export default BusinessResearchReport
