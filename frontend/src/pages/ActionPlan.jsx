import { Link, useSearchParams } from 'react-router-dom'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiFetch } from '../lib/api'
import Alert from '../components/app/Alert'

const STATUS_OPTIONS = [
  { value: 'todo', label: 'Not started' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'done', label: 'Done' },
]

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

const formatDate = (value) => {
  if (!value) return '—'
  return new Date(value).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

const readMeta = (action, key) => action.metadata?.[key] ?? null

const isWebsiteFix = (action) =>
  readMeta(action, 'plan_type') === 'website_fix' || action.source === 'website-report'

const coachPathForFix = (action) => {
  const params = new URLSearchParams()
  if (action.business_id) params.set('businessId', action.business_id)
  params.set('context', 'fix')
  params.set('fix', action.title)
  const category = readMeta(action, 'category')
  if (category) params.set('category', category)
  return `/app/tools/growth-coach?${params.toString()}`
}

const reportPathForAction = (action) => {
  const fromMeta = readMeta(action, 'report_path')
  if (fromMeta) return fromMeta
  if (action.business_id) return `/app/businesses/${action.business_id}/website-report`
  return null
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

  const fixItems = useMemo(() => {
    const items = actions.filter(isWebsiteFix)
    return items.sort((a, b) => {
      const rankA = readMeta(a, 'fix_rank')
      const rankB = readMeta(b, 'fix_rank')
      if (rankA != null && rankB != null) return rankA - rankB
      if (rankA != null) return -1
      if (rankB != null) return 1
      return new Date(b.created_at) - new Date(a.created_at)
    })
  }, [actions])

  const otherItems = useMemo(() => actions.filter((a) => !isWebsiteFix(a)), [actions])

  const progress = useMemo(() => {
    const total = fixItems.length || actions.length
    const done = (fixItems.length ? fixItems : actions).filter((a) => a.status === 'done').length
    return { total, done, pct: total ? Math.round((done / total) * 100) : 0 }
  }, [actions, fixItems])

  const businessGroups = useMemo(() => {
    const map = new Map()
    for (const action of fixItems) {
      const key = action.business_id || 'unknown'
      if (!map.has(key)) {
        map.set(key, {
          businessId: action.business_id,
          businessName: action.business_name || 'Website',
          items: [],
        })
      }
      map.get(key).items.push(action)
    }
    return [...map.values()]
  }, [fixItems])

  const updateStatus = async (action, status) => {
    setBusyId(action.id)
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

  return (
    <div className="mx-auto max-w-5xl">
      <header>
        <p className="app-eyebrow">Improve</p>
        <h1 className="app-page-title mt-2">Fix Plan</h1>
        <p className="app-page-subtitle">
          Structured fixes from your website analyzer — ranked by customer impact, with clear next
          steps for you or your team.
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
            Open a website report and generate a fix plan from ranked analyzer findings.
          </p>
          <Link to="/app" className="app-btn app-btn--primary mt-5 inline-flex">
            Go to dashboard
          </Link>
        </div>
      ) : (
        <>
          <section className="app-card mt-8 p-5">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-[var(--app-text)]">Progress</p>
                <p className="mt-1 text-xs text-[var(--app-text-muted)]">
                  {progress.done} of {progress.total} fixes completed
                </p>
              </div>
              <p className="text-2xl font-semibold text-[var(--app-text)]">{progress.pct}%</p>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--app-input-bg)]">
              <div
                className="h-full rounded-full bg-[var(--app-success-icon)] transition-all"
                style={{ width: `${progress.pct}%` }}
              />
            </div>
          </section>

          {fixItems.length ? (
            <div className="mt-8 space-y-8">
              {businessGroups.map((group) => (
                <section key={group.businessId || group.businessName}>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h2 className="text-lg font-semibold text-[var(--app-text)]">
                        {group.businessName}
                      </h2>
                      <p className="mt-1 text-sm text-[var(--app-text-secondary)]">
                        {group.items.length} prioritized fix{group.items.length === 1 ? '' : 'es'} from
                        your website report
                      </p>
                    </div>
                    {group.businessId ? (
                      <Link
                        to={`/app/businesses/${group.businessId}/website-report`}
                        className="app-link text-sm font-medium"
                      >
                        View website report →
                      </Link>
                    ) : null}
                  </div>

                  <ol className="mt-5 space-y-4">
                    {group.items.map((action) => {
                      const reason = readMeta(action, 'reason') || action.description
                      const impact = readMeta(action, 'expected_impact')
                      const difficulty = readMeta(action, 'difficulty')
                      const ownerAction = readMeta(action, 'owner_action')
                      const categoryLabel = readMeta(action, 'category_label')
                      const reportPath = reportPathForAction(action)
                      const rank = readMeta(action, 'fix_rank')

                      return (
                        <li key={action.id} className="app-card p-5">
                          <div className="flex flex-wrap items-start gap-3">
                            {rank != null ? (
                              <span className="app-priority-fix__rank shrink-0">{rank}</span>
                            ) : null}
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span
                                  className={`text-xs font-semibold uppercase tracking-wide ${priorityClass[action.priority] || ''}`}
                                >
                                  {action.priority} priority
                                </span>
                                {difficulty ? (
                                  <span
                                    className={`rounded px-2 py-0.5 text-xs font-medium capitalize ${difficultyClass[difficulty] || ''}`}
                                  >
                                    {difficulty}
                                  </span>
                                ) : null}
                                {categoryLabel ? (
                                  <span className="text-xs text-[var(--app-text-muted)]">
                                    {categoryLabel}
                                  </span>
                                ) : null}
                              </div>
                              <h3 className="mt-2 text-base font-semibold text-[var(--app-text)]">
                                {action.title}
                              </h3>

                              {reason ? (
                                <div className="mt-4">
                                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--app-text-muted)]">
                                    Why this matters
                                  </p>
                                  <p className="mt-1 text-sm text-[var(--app-text-secondary)]">
                                    {reason}
                                  </p>
                                </div>
                              ) : null}

                              {impact ? (
                                <div className="mt-4">
                                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--app-text-muted)]">
                                    Expected customer impact
                                  </p>
                                  <p className="mt-1 text-sm text-[var(--app-text-secondary)]">
                                    {impact}
                                  </p>
                                </div>
                              ) : null}

                              {ownerAction ? (
                                <div className="mt-4">
                                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--app-text-muted)]">
                                    Suggested owner action
                                  </p>
                                  <p className="mt-1 text-sm text-[var(--app-text-secondary)]">
                                    {ownerAction}
                                  </p>
                                </div>
                              ) : null}

                              <div className="mt-5 flex flex-wrap items-center gap-3">
                                <label className="text-xs font-medium text-[var(--app-text-muted)]">
                                  Status
                                  <select
                                    className="app-input ml-2 mt-1 block min-w-[10rem] text-sm"
                                    value={action.status}
                                    disabled={busyId === action.id}
                                    onChange={(e) => updateStatus(action, e.target.value)}
                                  >
                                    {STATUS_OPTIONS.map((opt) => (
                                      <option key={opt.value} value={opt.value}>
                                        {opt.label}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <span className="text-xs text-[var(--app-text-muted)]">
                                  Updated {formatDate(action.updated_at)}
                                </span>
                              </div>

                              <div className="mt-4 flex flex-wrap gap-2">
                                {reportPath ? (
                                  <Link
                                    to={reportPath}
                                    className="app-btn app-btn--secondary text-xs"
                                  >
                                    View in website report
                                  </Link>
                                ) : null}
                                <Link
                                  to={coachPathForFix(action)}
                                  className="app-btn app-btn--ghost text-xs"
                                >
                                  Ask AI coach about this fix
                                </Link>
                              </div>
                            </div>
                          </div>
                        </li>
                      )
                    })}
                  </ol>
                </section>
              ))}
            </div>
          ) : null}

          {otherItems.length ? (
            <section className="mt-10">
              <h2 className="text-lg font-semibold text-[var(--app-text)]">Other tasks</h2>
              <p className="mt-1 text-sm text-[var(--app-text-secondary)]">
                Manual items and scan tasks that are not part of a website fix plan.
              </p>
              <ul className="mt-5 space-y-3">
                {otherItems.map((action) => (
                  <li
                    key={action.id}
                    className="rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] p-4"
                  >
                    <p className="text-sm font-semibold text-[var(--app-text)]">{action.title}</p>
                    {action.description ? (
                      <p className="mt-1 text-xs text-[var(--app-text-secondary)]">
                        {action.description}
                      </p>
                    ) : null}
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <select
                        className="app-input text-xs"
                        value={action.status}
                        disabled={busyId === action.id}
                        onChange={(e) => updateStatus(action, e.target.value)}
                      >
                        {STATUS_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      {action.scan_id ? (
                        <Link to={`/app/scans/${action.scan_id}`} className="app-link text-xs">
                          View source scan →
                        </Link>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}
    </div>
  )
}

export default ActionPlan
