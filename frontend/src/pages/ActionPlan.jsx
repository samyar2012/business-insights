import { Link, useSearchParams } from 'react-router-dom'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../lib/api'
import Alert from '../components/app/Alert'

const STATUS_COLUMNS = [
  { key: 'todo', label: 'To do' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'done', label: 'Done' },
]

const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 }

const priorityClass = {
  high: 'text-[var(--app-error-fg)]',
  medium: 'text-[var(--app-warning-fg)]',
  low: 'text-[var(--app-text-muted)]',
}

const difficultyClass = {
  easy: 'bg-[var(--app-success-bg)] text-[var(--app-success-icon)]',
  moderate: 'bg-[var(--app-warning-bg)] text-[var(--app-warning-icon)]',
  hard: 'bg-[var(--app-error-bg)] text-[var(--app-error-fg)]',
}

const SOURCE_LABELS = {
  'website-report': 'Website report',
  scan: 'Scan',
  manual: 'Manual',
}

const CORE_CATEGORY_LABELS = {
  safety_trust: 'Safety & trust',
  technical_functionality: 'Technical functionality',
  ux_ui_visual: 'UX / UI & visual quality',
  offer_business_fit: 'Offer clarity & business fit',
  customer_attraction: 'Customer attraction & conversion',
}

const formatDate = (value) => {
  if (!value) return '-'
  return new Date(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

const readMeta = (action, key) => action.metadata?.[key] ?? null

const sourceLabel = (action) => SOURCE_LABELS[action.source] || action.source || 'Manual'

const reportLink = (action) => {
  const fromMeta = readMeta(action, 'report_path')
  if (fromMeta) return { to: fromMeta, label: 'View website report' }
  if (action.business_id) {
    return { to: `/app/businesses/${action.business_id}/website-report`, label: 'View website report' }
  }
  if (action.scan_id) return { to: `/app/scans/${action.scan_id}`, label: 'View source scan' }
  return null
}

const coachPathForAction = (action) => {
  const params = new URLSearchParams()
  if (action.business_id) params.set('businessId', action.business_id)
  params.set('context', 'fix-plan')
  params.set('actionId', action.id)
  return `/app/tools/growth-coach?${params.toString()}`
}

const sortByPriorityThenDate = (a, b) => {
  const rankA = readMeta(a, 'fix_rank')
  const rankB = readMeta(b, 'fix_rank')
  if (rankA != null && rankB != null) return rankA - rankB
  const pa = PRIORITY_ORDER[a.priority] ?? 3
  const pb = PRIORITY_ORDER[b.priority] ?? 3
  if (pa !== pb) return pa - pb
  return new Date(a.created_at) - new Date(b.created_at)
}

const ActionPlan = () => {
  const [searchParams] = useSearchParams()
  const filterBusinessId = searchParams.get('businessId') || ''
  const [actions, setActions] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const query = filterBusinessId ? `?business_id=${filterBusinessId}` : ''
      const data = await apiFetch(`/actions${query}`)
      setActions(data.actions || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [filterBusinessId])

  useEffect(() => {
    load()
  }, [load])

  const updateStatus = async (action, status) => {
    setBusyId(action.id)
    setError('')
    try {
      const data = await apiFetch(`/actions/${action.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      })
      setActions((prev) => prev.map((a) => (a.id === action.id ? data.action : a)))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyId(null)
    }
  }

  const metrics = useMemo(() => {
    const total = actions.length
    const open = actions.filter((a) => a.status === 'todo').length
    const inProgress = actions.filter((a) => a.status === 'in_progress').length
    const completed = actions.filter((a) => a.status === 'done').length
    const highPriority = actions.filter((a) => a.priority === 'high').length
    return { total, open, inProgress, completed, highPriority }
  }, [actions])

  const nextFix = useMemo(() => {
    const openItems = actions.filter((a) => a.status !== 'done')
    if (!openItems.length) return null
    return [...openItems].sort(sortByPriorityThenDate)[0]
  }, [actions])

  const columns = useMemo(() => {
    const grouped = { todo: [], in_progress: [], done: [] }
    for (const action of actions) {
      if (grouped[action.status]) grouped[action.status].push(action)
    }
    for (const key of Object.keys(grouped)) {
      grouped[key].sort(sortByPriorityThenDate)
    }
    return grouped
  }, [actions])

  return (
    <div className="mx-auto max-w-6xl">
      <header>
        <p className="app-eyebrow">Improve</p>
        <h1 className="app-page-title mt-2">Fix Plan</h1>
        <p className="app-page-subtitle">
          Turn analyzer findings into trackable website and business improvements.
        </p>
      </header>

      {error ? (
        <Alert variant="error" title="Could not update" className="mt-6">
          {error}
        </Alert>
      ) : null}

      {loading ? (
        <p className="mt-8 text-sm text-[var(--app-text-muted)]">Loading fix plan...</p>
      ) : actions.length === 0 ? (
        <div className="app-card mt-8 p-8 text-center">
          <p className="text-sm text-[var(--app-text-secondary)]">No fixes in your plan yet.</p>
          <p className="mt-2 text-sm text-[var(--app-text-muted)]">
            Open a website report and create a fix plan from ranked analyzer findings.
          </p>
          <Link to="/app" className="app-btn app-btn--primary mt-5 inline-flex">
            Go to dashboard
          </Link>
        </div>
      ) : (
        <>
          <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <div className="app-metric">
              <p className="app-eyebrow">Total fixes</p>
              <p className="app-metric__value mt-2">{metrics.total}</p>
            </div>
            <div className="app-metric">
              <p className="app-eyebrow">Open</p>
              <p className="app-metric__value mt-2">{metrics.open}</p>
            </div>
            <div className="app-metric">
              <p className="app-eyebrow">In progress</p>
              <p className="app-metric__value mt-2">{metrics.inProgress}</p>
            </div>
            <div className="app-metric">
              <p className="app-eyebrow">Completed</p>
              <p className="app-metric__value mt-2">{metrics.completed}</p>
            </div>
            <div className="app-metric">
              <p className="app-eyebrow">High priority</p>
              <p className="app-metric__value mt-2 text-[var(--app-error-fg)]">{metrics.highPriority}</p>
            </div>
          </div>

          {nextFix ? (
            <section className="app-next-action mt-8">
              <p className="app-eyebrow">Next fix to work on</p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-[var(--app-text)]">
                {nextFix.title}
              </h2>
              {nextFix.description || readMeta(nextFix, 'reason') || readMeta(nextFix, 'why_it_matters') ? (
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--app-text-secondary)]">
                  {readMeta(nextFix, 'why_it_matters') || readMeta(nextFix, 'reason') || nextFix.description}
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-[var(--app-text-muted)]">
                <span className={`font-semibold uppercase tracking-wide ${priorityClass[nextFix.priority] || ''}`}>
                  {nextFix.priority} priority
                </span>
                {nextFix.business_name ? <span>{nextFix.business_name}</span> : null}
                <span>{sourceLabel(nextFix)}</span>
                {readMeta(nextFix, 'expected_score_lift') ? (
                  <span>Estimated lift: {readMeta(nextFix, 'expected_score_lift')}</span>
                ) : null}
              </div>
              {readMeta(nextFix, 'evidence')?.length ? (
                <div className="mt-4">
                  <p className="text-xs font-semibold text-[var(--app-text-muted)]">What we found</p>
                  <ul className="mt-1 list-inside list-disc space-y-0.5 text-sm text-[var(--app-text-secondary)]">
                    {readMeta(nextFix, 'evidence')
                      .slice(0, 3)
                      .map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                  </ul>
                </div>
              ) : null}
              <div className="mt-5 flex flex-wrap gap-3">
                {nextFix.status === 'todo' ? (
                  <button
                    type="button"
                    className="app-btn app-btn--primary"
                    disabled={busyId === nextFix.id}
                    onClick={() => updateStatus(nextFix, 'in_progress')}
                  >
                    Start
                  </button>
                ) : null}
                <button
                  type="button"
                  className={nextFix.status === 'todo' ? 'app-btn app-btn--secondary' : 'app-btn app-btn--primary'}
                  disabled={busyId === nextFix.id}
                  onClick={() => updateStatus(nextFix, 'done')}
                >
                  Mark done
                </button>
                <Link to={coachPathForAction(nextFix)} className="app-btn app-btn--ghost">
                  Ask AI coach
                </Link>
              </div>
            </section>
          ) : null}

          <div className="mt-10 grid gap-5 lg:grid-cols-3">
            {STATUS_COLUMNS.map((col) => (
              <section key={col.key}>
                <div className="flex items-center justify-between px-1">
                  <h2 className="text-sm font-semibold text-[var(--app-text)]">{col.label}</h2>
                  <span className="text-xs text-[var(--app-text-muted)]">{columns[col.key].length}</span>
                </div>

                <ul className="mt-3 space-y-3">
                  {columns[col.key].map((action) => {
                    const whyItMatters = readMeta(action, 'why_it_matters')
                    const reason = whyItMatters || readMeta(action, 'reason') || action.description
                    const difficulty = readMeta(action, 'difficulty')
                    const categoryLabel = readMeta(action, 'category_label')
                    const evidence = readMeta(action, 'evidence') || []
                    const steps = readMeta(action, 'steps') || []
                    const affectedScores = readMeta(action, 'affected_scores') || []
                    const expectedLift = readMeta(action, 'expected_score_lift')
                    const link = reportLink(action)

                    return (
                      <li key={action.id} className="app-card p-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={`text-xs font-semibold uppercase tracking-wide ${priorityClass[action.priority] || ''}`}
                          >
                            {action.priority}
                          </span>
                          {difficulty ? (
                            <span
                              className={`rounded px-2 py-0.5 text-xs font-medium capitalize ${difficultyClass[difficulty] || ''}`}
                            >
                              {difficulty}
                            </span>
                          ) : null}
                          {categoryLabel ? (
                            <span className="text-xs text-[var(--app-text-muted)]">{categoryLabel}</span>
                          ) : null}
                        </div>

                        <p className="mt-2 text-sm font-semibold text-[var(--app-text)]">{action.title}</p>
                        {reason ? (
                          <p className="mt-1 text-xs leading-relaxed text-[var(--app-text-secondary)]">
                            {reason}
                          </p>
                        ) : null}

                        {evidence.length ? (
                          <ul className="mt-2 list-inside list-disc space-y-0.5 text-xs text-[var(--app-text-secondary)]">
                            {evidence.slice(0, 2).map((item) => (
                              <li key={item}>{item}</li>
                            ))}
                          </ul>
                        ) : null}

                        {steps.length ? (
                          <details className="mt-2">
                            <summary className="cursor-pointer text-xs font-semibold text-[var(--app-text-muted)]">
                              How to fix it ({steps.length} steps)
                            </summary>
                            <ol className="mt-1 list-inside list-decimal space-y-0.5 text-xs text-[var(--app-text-secondary)]">
                              {steps.map((step) => (
                                <li key={step}>{step}</li>
                              ))}
                            </ol>
                          </details>
                        ) : null}

                        {affectedScores.length || expectedLift ? (
                          <p className="mt-2 text-xs text-[var(--app-text-muted)]">
                            {affectedScores.length
                              ? `Affects: ${affectedScores.map((key) => CORE_CATEGORY_LABELS[key] || key).join(', ')}`
                              : null}
                            {affectedScores.length && expectedLift ? ' · ' : ''}
                            {expectedLift ? `Estimated lift: ${expectedLift}` : null}
                          </p>
                        ) : null}

                        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[var(--app-text-muted)]">
                          {action.business_name ? <span>{action.business_name}</span> : null}
                          <span>{sourceLabel(action)}</span>
                          <span>{formatDate(action.created_at)}</span>
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          {STATUS_COLUMNS.filter((s) => s.key !== action.status).map((s) => (
                            <button
                              key={s.key}
                              type="button"
                              className="app-btn app-btn--ghost text-xs"
                              disabled={busyId === action.id}
                              onClick={() => updateStatus(action, s.key)}
                            >
                              {s.key === 'todo' ? 'Move to to do' : s.key === 'in_progress' ? 'Start' : 'Mark done'}
                            </button>
                          ))}
                        </div>

                        <div className="mt-3 flex flex-wrap gap-3 border-t border-[var(--app-border)] pt-3">
                          {link ? (
                            <Link to={link.to} className="app-link text-xs font-medium">
                              {link.label} -&gt;
                            </Link>
                          ) : null}
                          <Link to={coachPathForAction(action)} className="app-link text-xs font-medium">
                            Ask AI coach -&gt;
                          </Link>
                        </div>
                      </li>
                    )
                  })}
                  {!columns[col.key].length ? (
                    <li className="rounded-lg border border-dashed border-[var(--app-border)] p-4 text-center text-xs text-[var(--app-text-muted)]">
                      Nothing here yet.
                    </li>
                  ) : null}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export default ActionPlan
