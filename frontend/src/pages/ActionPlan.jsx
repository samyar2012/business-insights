import { Link, useSearchParams } from 'react-router-dom'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { apiFetch } from '../lib/api'
import Alert from '../components/app/Alert'

const CORE_CATEGORY_LABELS = {
  safety_trust: 'Safety & trust',
  technical_functionality: 'Technical functionality',
  ux_ui_visual: 'UX / UI & visual quality',
  offer_business_fit: 'Offer clarity & business fit',
  customer_attraction: 'Customer attraction & conversion',
}

const PILLAR_LABELS = {
  acquire: 'Acquire',
  convert: 'Convert',
  retain: 'Retain',
  operate: 'Operate',
}

const CONFIDENCE_CLASS = {
  high: 'bg-[var(--app-success-bg)] text-[var(--app-success-icon)]',
  medium: 'bg-[var(--app-warning-bg)] text-[var(--app-warning-icon)]',
  low: 'bg-[var(--app-error-bg)] text-[var(--app-error-fg)]',
}

const readMeta = (action, key) => action.metadata?.[key] ?? null

const sortMoves = (a, b) => {
  const rankA = readMeta(a, 'fix_rank')
  const rankB = readMeta(b, 'fix_rank')
  if (rankA != null && rankB != null) return rankA - rankB
  if (rankA != null) return -1
  if (rankB != null) return 1
  const order = { high: 0, medium: 1, low: 2 }
  const pa = order[a.priority] ?? 3
  const pb = order[b.priority] ?? 3
  if (pa !== pb) return pa - pb
  return new Date(a.created_at) - new Date(b.created_at)
}

const coachPathForAction = (action) => {
  const params = new URLSearchParams()
  if (action.business_id) params.set('businessId', action.business_id)
  params.set('context', 'growth-plan')
  params.set('actionId', action.id)
  const prompt = readMeta(action, 'ask_ai_prompt')
  if (prompt) params.set('prompt', prompt.slice(0, 500))
  return `/app/tools/growth-coach?${params.toString()}`
}

function ConfidenceBadge({ value }) {
  if (!value) return null
  return (
    <span className={`rounded px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${CONFIDENCE_CLASS[value] || CONFIDENCE_CLASS.medium}`}>
      {value} confidence
    </span>
  )
}

function AffectedScores({ scores }) {
  if (!scores?.length) return null
  return (
    <div className="flex flex-wrap gap-1.5">
      {scores.map((key) => (
        <span
          key={key}
          className="rounded border border-[var(--app-border)] bg-[var(--app-bg-elevated)] px-2 py-0.5 text-[11px] font-medium text-[var(--app-text-secondary)]"
        >
          {CORE_CATEGORY_LABELS[key] || String(key).replace(/_/g, ' ')}
        </span>
      ))}
    </div>
  )
}

function MoveBody({ action }) {
  const evidence = readMeta(action, 'evidence') || []
  const customerProblem = readMeta(action, 'customer_problem')
  const whatToChange = readMeta(action, 'what_to_change')
  const whyItMatters =
    readMeta(action, 'why_it_matters') || readMeta(action, 'reason') || action.description
  const howToVerify = readMeta(action, 'how_to_verify')
  const expectedOutcome = readMeta(action, 'expected_business_outcome')
  const steps = readMeta(action, 'steps') || []
  const affectedScores = readMeta(action, 'affected_scores') || []

  return (
    <div className="space-y-4">
      {customerProblem ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--app-text-muted)]">
            Why it costs customers
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-[var(--app-text-secondary)]">{customerProblem}</p>
        </div>
      ) : whyItMatters ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--app-text-muted)]">
            Why it costs customers
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-[var(--app-text-secondary)]">{whyItMatters}</p>
        </div>
      ) : null}

      {evidence.length ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--app-text-muted)]">
            Evidence from the scan
          </p>
          <ul className="mt-1.5 list-inside list-disc space-y-1 text-sm leading-relaxed text-[var(--app-text-secondary)]">
            {evidence.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {whatToChange ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--app-text-muted)]">
            What to change
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-[var(--app-text-secondary)]">{whatToChange}</p>
        </div>
      ) : null}

      {steps.length ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--app-text-muted)]">
            Implementation steps
          </p>
          <ol className="mt-1.5 list-inside list-decimal space-y-1 text-sm leading-relaxed text-[var(--app-text-secondary)]">
            {steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
      ) : null}

      {howToVerify || expectedOutcome ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--app-text-muted)]">
            How to verify it worked
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-[var(--app-text-secondary)]">
            {howToVerify || expectedOutcome}
          </p>
        </div>
      ) : null}

      {affectedScores.length ? (
        <div>
          <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-[var(--app-text-muted)]">
            Affects scores
          </p>
          <AffectedScores scores={affectedScores} />
        </div>
      ) : null}
    </div>
  )
}

function MoveActions({ action, busyId, onStatus }) {
  const busy = busyId === action.id
  return (
    <div className="flex flex-wrap gap-2">
      {action.status === 'todo' ? (
        <button
          type="button"
          className="app-btn app-btn--secondary"
          disabled={busy}
          onClick={() => onStatus(action, 'in_progress')}
        >
          Start
        </button>
      ) : null}
      {action.status !== 'done' ? (
        <button
          type="button"
          className="app-btn app-btn--primary"
          disabled={busy}
          onClick={() => onStatus(action, 'done')}
        >
          Mark done
        </button>
      ) : (
        <button
          type="button"
          className="app-btn app-btn--ghost"
          disabled={busy}
          onClick={() => onStatus(action, 'todo')}
        >
          Reopen
        </button>
      )}
      <Link to={coachPathForAction(action)} className="app-btn app-btn--ghost">
        Ask AI Coach
      </Link>
    </div>
  )
}

const ActionPlan = () => {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const businesses = user?.businesses || []
  const businessId = searchParams.get('businessId') || businesses[0]?.id || ''
  const business = businesses.find((b) => b.id === businessId) || businesses[0] || null

  const [actions, setActions] = useState([])
  const [reportScores, setReportScores] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const query = businessId ? `?business_id=${businessId}` : ''
      const [actionsData, profileData] = await Promise.all([
        apiFetch(`/actions${query}`),
        businessId ? apiFetch(`/businesses/${businessId}/web-profile`).catch(() => null) : Promise.resolve(null),
      ])
      setActions(actionsData.actions || [])
      setReportScores(profileData?.profile?.scores || null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [businessId])

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

  const createFromReport = async () => {
    if (!businessId) return
    setCreating(true)
    setError('')
    setNotice('')
    try {
      const webData = await apiFetch(`/businesses/${businessId}/web-profile`)
      const scores = webData?.profile?.scores
      if (!scores) {
        setError('No website report found yet. Run the Website Analyzer first.')
        return
      }
      setReportScores(scores)
      const result = await apiFetch('/actions/fix-plan', {
        method: 'POST',
        body: JSON.stringify({ business_id: businessId, scores }),
      })
      setActions(result.actions || [])
      if (result.already_exists) {
        setNotice('Your Growth Plan already includes every move from the latest report.')
      } else if (result.created?.length) {
        setNotice(
          `Added ${result.created.length} growth move${result.created.length === 1 ? '' : 's'} from your latest website report.`,
        )
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setCreating(false)
    }
  }

  const moves = useMemo(() => [...actions].sort(sortMoves), [actions])
  const primaryMoves = useMemo(() => {
    const flagged = moves.filter((m) => readMeta(m, 'is_primary') || readMeta(m, 'tier') === 'primary')
    if (flagged.length) return flagged.slice(0, 3)
    return moves.slice(0, 3)
  }, [moves])
  const secondaryMoves = useMemo(() => {
    const primaryIds = new Set(primaryMoves.map((m) => m.id))
    return moves.filter((m) => !primaryIds.has(m.id))
  }, [moves, primaryMoves])

  const diagnosis =
    reportScores?.growth_diagnosis ||
    readMeta(moves[0], 'growth_diagnosis') ||
    null

  const evidencePillars = useMemo(() => {
    const counts = {}
    for (const move of moves) {
      const pillar = readMeta(move, 'pillar')
      if (!pillar) continue
      counts[pillar] = (counts[pillar] || 0) + 1
    }
    return Object.entries(counts).filter(([, count]) => count > 0)
  }, [moves])

  const completedPrimary = primaryMoves.filter((m) => m.status === 'done').length
  const allPrimaryDone = primaryMoves.length > 0 && completedPrimary === primaryMoves.length
  const reportPath = businessId ? `/app/businesses/${businessId}/website-report` : '/app/businesses'

  return (
    <div className="mx-auto max-w-4xl">
      <header className="app-stagger">
        <p className="app-eyebrow">Improve</p>
        <h1 className="app-page-title mt-2">Growth Plan Studio</h1>
        <p className="app-page-subtitle max-w-2xl">
          The three highest-leverage moves{business ? ` for ${business.business_name}` : ''} based on
          your latest website evidence — not a generic checklist.
        </p>
      </header>

      {error ? (
        <Alert variant="error" title="Something went wrong" className="mt-6">
          {error}
        </Alert>
      ) : null}
      {notice ? (
        <Alert variant="success" title="Growth plan updated" className="mt-6">
          {notice}
        </Alert>
      ) : null}

      {loading ? (
        <p className="mt-8 text-sm text-[var(--app-text-muted)]">Loading growth plan...</p>
      ) : moves.length === 0 ? (
        <div className="app-card mt-8 p-8 text-center">
          <p className="text-sm font-medium text-[var(--app-text)]">No growth plan yet.</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-[var(--app-text-secondary)]">
            Analyze your website first, then generate the top 3 evidence-backed growth moves to work
            this week.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            {businessId ? (
              <button
                type="button"
                className="app-btn app-btn--primary"
                disabled={creating}
                onClick={createFromReport}
              >
                {creating ? 'Building plan...' : 'Build plan from latest report'}
              </button>
            ) : null}
            <Link to={reportPath} className="app-btn app-btn--secondary">
              Open Website Analyzer
            </Link>
          </div>
        </div>
      ) : (
        <>
          {diagnosis ? (
            <section className="app-next-action app-stagger mt-8">
              <p className="app-eyebrow">Growth diagnosis</p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-[var(--app-text)]">
                What is holding growth back
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--app-text-secondary)]">
                {diagnosis}
              </p>
              <div className="mt-4 flex flex-wrap gap-3 text-xs text-[var(--app-text-muted)]">
                <span>
                  <span className="font-semibold text-[var(--app-text-secondary)]">Primary moves: </span>
                  {primaryMoves.length}
                </span>
                <span>
                  <span className="font-semibold text-[var(--app-text-secondary)]">Completed: </span>
                  {completedPrimary}/{primaryMoves.length}
                </span>
                {typeof reportScores?.overall_score === 'number' ? (
                  <span>
                    <span className="font-semibold text-[var(--app-text-secondary)]">Site score: </span>
                    {reportScores.overall_score}/100
                  </span>
                ) : null}
              </div>
            </section>
          ) : null}

          {evidencePillars.length > 0 ? (
            <section className="mt-6">
              <p className="app-eyebrow">Evidence-backed pillars</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {evidencePillars.map(([pillar, count]) => (
                  <span
                    key={pillar}
                    className="rounded border border-[var(--app-border)] px-3 py-1.5 text-xs font-medium text-[var(--app-text-secondary)]"
                  >
                    {PILLAR_LABELS[pillar] || pillar}
                    <span className="ml-1.5 text-[var(--app-text-muted)]">
                      {count} move{count === 1 ? '' : 's'}
                    </span>
                  </span>
                ))}
              </div>
            </section>
          ) : null}

          {allPrimaryDone ? (
            <section className="app-card mt-8 p-6">
              <p className="app-eyebrow">Primary moves complete</p>
              <h2 className="mt-2 text-lg font-semibold text-[var(--app-text)]">
                Rescan to confirm the gains, then pull the next round.
              </h2>
              <div className="mt-4 flex flex-wrap gap-3">
                <Link to={reportPath} className="app-btn app-btn--primary">
                  Rescan website
                </Link>
                <button
                  type="button"
                  className="app-btn app-btn--secondary"
                  disabled={creating}
                  onClick={createFromReport}
                >
                  {creating ? 'Checking report...' : 'Sync from latest report'}
                </button>
              </div>
            </section>
          ) : null}

          <section className="mt-10">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="app-eyebrow">Focus this week</p>
                <h2 className="mt-1 text-lg font-semibold text-[var(--app-text)]">
                  Top 3 Growth Moves
                </h2>
              </div>
              <Link to={reportPath} className="app-link text-sm font-medium">
                {'View website report ->'}
              </Link>
            </div>

            <ol className="mt-5 space-y-4">
              {primaryMoves.map((move, index) => {
                const confidence = readMeta(move, 'confidence')
                const affected = readMeta(move, 'affected_scores') || []
                const done = move.status === 'done'

                return (
                  <li
                    key={move.id}
                    className={`app-card border-l-4 p-5 sm:p-6 ${
                      done
                        ? 'border-l-[var(--app-success-icon)] opacity-75'
                        : 'border-l-[var(--app-accent-strong)]'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="app-priority-fix__rank">{index + 1}</span>
                          <ConfidenceBadge value={confidence} />
                          {done ? (
                            <span className="text-xs font-semibold text-[var(--app-success-icon)]">Done</span>
                          ) : move.status === 'in_progress' ? (
                            <span className="text-xs font-semibold text-[var(--app-warning-icon)]">
                              In progress
                            </span>
                          ) : null}
                        </div>
                        <h3
                          className={`mt-2 text-base font-semibold leading-snug sm:text-lg ${
                            done ? 'text-[var(--app-text-muted)] line-through' : 'text-[var(--app-text)]'
                          }`}
                        >
                          {move.title}
                        </h3>
                        {affected.length ? (
                          <div className="mt-3">
                            <AffectedScores scores={affected} />
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-5 border-t border-[var(--app-border)] pt-5">
                      <MoveBody action={move} />
                    </div>

                    <div className="mt-5">
                      <MoveActions action={move} busyId={busyId} onStatus={updateStatus} />
                    </div>
                  </li>
                )
              })}
            </ol>
          </section>

          {secondaryMoves.length ? (
            <section className="mt-10">
              <p className="app-eyebrow">After the top 3</p>
              <h2 className="mt-1 text-lg font-semibold text-[var(--app-text)]">
                Secondary moves
              </h2>
              <p className="mt-1 text-sm text-[var(--app-text-muted)]">
                Still evidence-backed, but lower leverage than the primary three.
              </p>
              <ul className="mt-4 space-y-3">
                {secondaryMoves.map((move) => (
                  <li key={move.id} className={`app-card p-4 ${move.status === 'done' ? 'opacity-70' : ''}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <ConfidenceBadge value={readMeta(move, 'confidence')} />
                      {readMeta(move, 'pillar') ? (
                        <span className="text-[11px] font-medium text-[var(--app-text-muted)]">
                          {PILLAR_LABELS[readMeta(move, 'pillar')] || readMeta(move, 'pillar')}
                        </span>
                      ) : null}
                    </div>
                    <p
                      className={`mt-2 text-sm font-semibold ${
                        move.status === 'done'
                          ? 'text-[var(--app-text-muted)] line-through'
                          : 'text-[var(--app-text)]'
                      }`}
                    >
                      {move.title}
                    </p>
                    <div className="mt-3">
                      <MoveBody action={move} />
                    </div>
                    <div className="mt-4">
                      <MoveActions action={move} busyId={busyId} onStatus={updateStatus} />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <div className="mt-10 flex flex-wrap gap-3 border-t border-[var(--app-border)] pt-6">
            <button
              type="button"
              className="app-btn app-btn--secondary"
              disabled={creating || !businessId}
              onClick={createFromReport}
            >
              {creating ? 'Syncing...' : 'Sync plan with latest report'}
            </button>
            <Link to={reportPath} className="app-btn app-btn--ghost">
              Open website report
            </Link>
          </div>
        </>
      )}
    </div>
  )
}

export default ActionPlan
