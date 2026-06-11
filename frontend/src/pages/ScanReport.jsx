import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import Alert from '../components/app/Alert'
import ScoreBar, {
  CHECKLIST_DISPLAY,
  formatScanDate,
  interpretScore,
  scoreTone,
} from '../components/app/ScanUi'

const toneClass = {
  success: 'border-[var(--app-success-border)] bg-[var(--app-success-bg)] text-[var(--app-success-fg)]',
  warning: 'border-[var(--app-warning-border)] bg-[var(--app-warning-bg)] text-[var(--app-warning-fg)]',
  error: 'border-[var(--app-error-border)] bg-[var(--app-error-bg)] text-[var(--app-error-fg)]',
}

const ScanReport = () => {
  const { id } = useParams()
  const navigate = useNavigate()
  const [scan, setScan] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [planBusy, setPlanBusy] = useState(false)
  const [planMessage, setPlanMessage] = useState('')
  const [createdActions, setCreatedActions] = useState([])

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

  const interpretation = useMemo(
    () => (scan ? interpretScore(scan.overall_score) : null),
    [scan],
  )

  const createActionPlan = async () => {
    setPlanBusy(true)
    setPlanMessage('')
    setError('')
    try {
      const data = await apiFetch(`/scans/${id}/create-action-plan`, { method: 'POST' })
      setCreatedActions(data.actions || [])
      setPlanMessage(
        data.already_exists
          ? 'Action plan already exists for this scan. Showing existing tasks.'
          : `Created ${(data.actions || []).length} tasks from next actions.`,
      )
    } catch (err) {
      setError(err.message)
    } finally {
      setPlanBusy(false)
    }
  }

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

  const checklist = scan.checklist || {}
  const hasChecklist = CHECKLIST_DISPLAY.some((item) => checklist[item.key] != null)

  return (
    <div className="mx-auto max-w-4xl">
      <Link to="/app/scans" className="app-link text-sm font-medium">
        &lt;- Scan history
      </Link>

      <header className="mt-4">
        <p className="app-eyebrow">Full report</p>
        <h1 className="app-page-title mt-2">
          {scan.business_name ? `${scan.business_name} scan` : 'Business scan report'}
        </h1>
        <p className="app-page-subtitle">
          {formatScanDate(scan.created_at)}
          {scan.business_type ? ` - ${scan.business_type}` : ''}
        </p>
      </header>

      <section className="app-card mt-8 p-6">
        <p className="app-eyebrow">Report summary</p>
        <div className="mt-4 flex flex-wrap items-start gap-6">
          <div>
            <p className="text-sm text-[var(--app-text-secondary)]">Overall score</p>
            <p className={`app-stat-value text-5xl ${scoreTone(scan.overall_score)}`}>
              {scan.overall_score}
            </p>
          </div>
          {interpretation ? (
            <div
              className={`rounded-lg border px-4 py-3 text-sm ${toneClass[interpretation.tone]}`}
            >
              <p className="font-semibold">{interpretation.label}</p>
              <p className="mt-1 opacity-90">{interpretation.detail}</p>
              <p className="mt-2 text-xs opacity-80">
                75-100 Strong - 55-74 Needs work - 0-54 High priority
              </p>
            </div>
          ) : null}
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <ScoreBar label="Store" value={scan.store_score} />
          <ScoreBar label="Trust" value={scan.trust_score} />
          <ScoreBar label="Content" value={scan.content_score} />
          <ScoreBar label="Competitor" value={scan.competitor_score} />
        </div>
      </section>

      {hasChecklist ? (
        <section className="app-card mt-6 p-5">
          <h2 className="text-sm font-semibold text-[var(--app-text)]">Checklist answers</h2>
          <p className="mt-1 text-xs text-[var(--app-text-muted)]">
            Self-reported at scan time. Used to adjust category scores.
          </p>
          <ul className="mt-4 grid gap-2 sm:grid-cols-2">
            {CHECKLIST_DISPLAY.map((item) => {
              const value = checklist[item.key]
              if (value == null) return null
              const yes = Boolean(value)
              return (
                <li
                  key={item.key}
                  className="flex items-center justify-between rounded-lg border border-[var(--app-border)] px-3 py-2 text-sm"
                >
                  <span className="text-[var(--app-text-secondary)]">{item.label}</span>
                  <span
                    className={`font-medium ${yes ? 'text-[var(--app-success-icon)]' : 'text-[var(--app-text-muted)]'}`}
                  >
                    {yes ? 'Yes' : 'No'}
                  </span>
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}

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

      <section className="app-card mt-8 p-5">
        <h2 className="text-sm font-semibold text-[var(--app-text)]">Turn insights into tasks</h2>
        <p className="mt-1 text-sm text-[var(--app-text-secondary)]">
          Create trackable action items from this scan&apos;s next actions.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            className="app-btn app-btn--primary"
            disabled={planBusy || !(scan.next_actions || []).length}
            onClick={createActionPlan}
          >
            {planBusy ? 'Creating...' : 'Create action plan'}
          </button>
          <button
            type="button"
            className="app-btn app-btn--secondary"
            onClick={() => navigate(`/app/tools/growth-coach?scanId=${id}`)}
          >
            Ask AI about this report
          </button>
          <Link to="/app/action-plan" className="app-btn app-btn--ghost">
            Open action plan
          </Link>
        </div>
        {planMessage ? (
          <p className="mt-3 text-sm text-[var(--app-success-fg)]">{planMessage}</p>
        ) : null}
        {createdActions.length ? (
          <ul className="mt-4 space-y-2 text-sm text-[var(--app-text-secondary)]">
            {createdActions.map((action) => (
              <li key={action.id} className="flex gap-2">
                <span>-&gt;</span>
                <span>{action.title}</span>
                <span className="text-xs text-[var(--app-text-muted)]">({action.priority})</span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

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
