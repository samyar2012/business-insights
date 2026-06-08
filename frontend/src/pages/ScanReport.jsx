import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import Alert from '../components/app/Alert'
import ScoreBar, { formatScanDate } from '../components/app/ScanUi'

const ScanReport = () => {
  const { id } = useParams()
  const [scan, setScan] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await apiFetch(`/scans/${id}`)
      setScan(data.scan)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  if (loading) {
    return (
      <div className="app-loading mx-auto max-w-4xl">
        <span className="app-loading__dot" />
        <span className="app-loading__dot" />
        <span className="app-loading__dot" />
        Loading report...
      </div>
    )
  }

  if (error || !scan) {
    return (
      <div className="mx-auto max-w-4xl">
        <Alert variant="error" title="Report unavailable">
          {error || 'Scan not found.'}
        </Alert>
        <Link to="/app/scans" className="app-btn app-btn--secondary mt-4 inline-flex">
          Back to scan history
        </Link>
      </div>
    )
  }

  const urls = [
    { label: 'Store URL', value: scan.store_url },
    { label: 'Social URL', value: scan.social_url },
    { label: 'Competitor URL', value: scan.competitor_url },
  ].filter((row) => row.value)

  return (
    <div className="mx-auto max-w-4xl">
      <Link to="/app/scans" className="app-link text-sm font-medium">
        &larr; Scan history
      </Link>

      <header className="mt-4">
        <p className="app-eyebrow">Full report</p>
        <h1 className="app-page-title mt-2">
          {scan.business_name ? `${scan.business_name} scan` : 'Business scan report'}
        </h1>
        <p className="app-page-subtitle">
          {formatScanDate(scan.created_at)}
          {scan.business_type ? ` · ${scan.business_type}` : ''}
        </p>
      </header>

      <section className="app-card mt-8 p-6">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <p className="text-sm text-[var(--app-text-secondary)]">Overall score</p>
            <p className="app-stat-value text-5xl">{scan.overall_score}</p>
          </div>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <ScoreBar label="Store" value={scan.store_score} />
          <ScoreBar label="Trust" value={scan.trust_score} />
          <ScoreBar label="Content" value={scan.content_score} />
          <ScoreBar label="Competitor" value={scan.competitor_score} />
        </div>
      </section>

      <div className="mt-6 grid gap-6 sm:grid-cols-3">
        <section className="app-card p-5">
          <h2 className="text-sm font-semibold text-[var(--app-text)]">Strengths</h2>
          <ul className="mt-3 space-y-2 text-sm text-[var(--app-text-secondary)]">
            {(scan.top_strengths || []).length ? (
              scan.top_strengths.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="text-[var(--app-success-icon)]">+</span>
                  <span>{item}</span>
                </li>
              ))
            ) : (
              <li className="text-[var(--app-text-muted)]">No strengths recorded.</li>
            )}
          </ul>
        </section>

        <section className="app-card p-5">
          <h2 className="text-sm font-semibold text-[var(--app-text)]">Risks</h2>
          <ul className="mt-3 space-y-2 text-sm text-[var(--app-text-secondary)]">
            {(scan.top_risks || []).length ? (
              scan.top_risks.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="text-[var(--app-warning-icon)]">!</span>
                  <span>{item}</span>
                </li>
              ))
            ) : (
              <li className="text-[var(--app-text-muted)]">No risks recorded.</li>
            )}
          </ul>
        </section>

        <section className="app-card p-5">
          <h2 className="text-sm font-semibold text-[var(--app-text)]">Next actions</h2>
          <ul className="mt-3 space-y-2 text-sm text-[var(--app-text-secondary)]">
            {(scan.next_actions || []).length ? (
              scan.next_actions.map((item) => (
                <li key={item} className="flex gap-2">
                  <span>-&gt;</span>
                  <span>{item}</span>
                </li>
              ))
            ) : (
              <li className="text-[var(--app-text-muted)]">No actions recorded.</li>
            )}
          </ul>
        </section>
      </div>

      {urls.length ? (
        <section className="app-card mt-6 p-5">
          <h2 className="text-sm font-semibold text-[var(--app-text)]">URLs scanned</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {urls.map((row) => (
              <li key={row.label}>
                <span className="text-[var(--app-text-muted)]">{row.label}: </span>
                <a href={row.value} target="_blank" rel="noreferrer" className="app-link break-all">
                  {row.value}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {scan.notes ? (
        <section className="app-card mt-6 p-5">
          <h2 className="text-sm font-semibold text-[var(--app-text)]">Notes</h2>
          <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--app-text-secondary)]">{scan.notes}</p>
        </section>
      ) : null}

      <div className="mt-8 flex flex-wrap gap-3">
        <Link to="/app/tools/business-scanner" className="app-btn app-btn--primary">
          Run another scan
        </Link>
        <Link to="/app/scans" className="app-btn app-btn--secondary">
          Back to scan history
        </Link>
      </div>
    </div>
  )
}

export default ScanReport
