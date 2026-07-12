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

const PILLAR_DESCRIPTIONS = {
  acquire: 'Discovery channels: SEO, local, social, listings, referrals.',
  convert: 'Offer clarity, trust, CTA flow, and friction-free action paths.',
  retain: 'Reviews, follow-up, loyalty, and repeat customer momentum.',
  operate: 'Response speed, handoffs, fulfillment, and support readiness.',
}

const DIFFICULTY_LABELS = {
  easy: 'Easy',
  moderate: 'Moderate effort',
  medium: 'Moderate effort',
  hard: 'Hard',
}

const difficultyClass = {
  easy: 'bg-[var(--app-success-bg)] text-[var(--app-success-icon)]',
  moderate: 'bg-[var(--app-warning-bg)] text-[var(--app-warning-icon)]',
  medium: 'bg-[var(--app-warning-bg)] text-[var(--app-warning-icon)]',
  hard: 'bg-[var(--app-error-bg)] text-[var(--app-error-fg)]',
}

const readMeta = (action, key) => action.metadata?.[key] ?? null

const actionPillar = (action) => readMeta(action, 'pillar')

const sortSteps = (a, b) => {
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
  return `/app/tools/growth-coach?${params.toString()}`
}

/** Sum "+low-high pts" tokens across open steps into a single plan-level range. */
function estimatePlanLift(steps) {
  let low = 0
  let high = 0
  let found = false
  for (const step of steps) {
    if (step.status === 'done') continue
    const label = readMeta(step, 'expected_score_lift')
    if (!label) continue
    const matches = String(label).matchAll(/\+(\d+)(?:-(\d+))?\s*pts/g)
    for (const match of matches) {
      found = true
      low += Number(match[1])
      high += Number(match[2] ?? match[1])
    }
  }
  if (!found) return null
  if (low === high) return `+${high} pts`
  return `+${low} to +${high} pts`
}

function StatusChip({ state }) {
  if (state === 'done') {
    return <span className="text-xs font-semibold text-[var(--app-success-icon)]">Done</span>
  }
  if (state === 'in_progress') {
    return <span className="text-xs font-semibold text-[var(--app-warning-icon)]">In progress</span>
  }
  if (state === 'current') {
    return <span className="text-xs font-semibold text-[var(--app-accent-strong)]">Up next</span>
  }
  return <span className="text-xs font-medium text-[var(--app-text-muted)]">Later</span>
}

function StepDetails({ action }) {
  const evidence = readMeta(action, 'evidence') || []
  const whyItMatters = readMeta(action, 'why_it_matters') || readMeta(action, 'reason') || action.description
  const expectedBusinessOutcome = readMeta(action, 'expected_business_outcome')
  const steps = readMeta(action, 'steps') || []
  const affectedScores = readMeta(action, 'affected_scores') || []
  const expectedLift = readMeta(action, 'expected_score_lift')
  const relatedPages = readMeta(action, 'related_pages') || []
  const researchBasis = readMeta(action, 'research_basis')

  return (
    <div className="space-y-4">
      {evidence.length ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--app-text-muted)]">
            What the analyzer found
          </p>
          <ul className="mt-1.5 list-inside list-disc space-y-1 text-sm leading-relaxed text-[var(--app-text-secondary)]">
            {evidence.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {whyItMatters ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--app-text-muted)]">
            Why this grows the business
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-[var(--app-text-secondary)]">{whyItMatters}</p>
        </div>
      ) : null}

      {expectedBusinessOutcome ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--app-text-muted)]">
            Expected business outcome
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-[var(--app-text-secondary)]">
            {expectedBusinessOutcome}
          </p>
        </div>
      ) : null}

      {steps.length ? (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--app-text-muted)]">
            How to complete this step
          </p>
          <ol className="mt-1.5 list-inside list-decimal space-y-1 text-sm leading-relaxed text-[var(--app-text-secondary)]">
            {steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </div>
      ) : null}

      {researchBasis ? (
        <p className="app-fix-card__research">
          <strong>The research: </strong>
          {researchBasis}
        </p>
      ) : null}

      {affectedScores.length || expectedLift ? (
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-[var(--app-text-muted)]">
          {affectedScores.length ? (
            <span>
              <span className="font-semibold">Improves: </span>
              {affectedScores.map((key) => CORE_CATEGORY_LABELS[key] || String(key).replace(/_/g, ' ')).join(', ')}
            </span>
          ) : null}
          {expectedLift ? (
            <span>
              <span className="font-semibold">Expected score lift: </span>
              {expectedLift}
            </span>
          ) : null}
        </div>
      ) : null}

      {relatedPages.length ? (
        <div className="text-xs text-[var(--app-text-muted)]">
          <span className="font-semibold">Pages to work on: </span>
          {relatedPages.map((page, i) => (
            <span key={page.url || page}>
              {i > 0 ? ', ' : ''}
              <a
                href={page.url || page}
                target="_blank"
                rel="noreferrer"
                className="app-link"
              >
                {page.title || page.url || page}
              </a>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}

function StepActions({ action, busyId, onStatus, primary = false }) {
  const busy = busyId === action.id
  return (
    <div className="flex flex-wrap gap-2">
      {action.status === 'todo' ? (
        <button
          type="button"
          className={`app-btn ${primary ? 'app-btn--primary' : 'app-btn--secondary'}`}
          disabled={busy}
          onClick={() => onStatus(action, 'in_progress')}
        >
          Start
        </button>
      ) : null}
      {action.status !== 'done' ? (
        <button
          type="button"
          className={`app-btn ${action.status === 'in_progress' && primary ? 'app-btn--primary' : 'app-btn--secondary'}`}
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
        Ask AI Coach how to do this
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [creating, setCreating] = useState(false)
  const [expandedId, setExpandedId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const query = businessId ? `?business_id=${businessId}` : ''
      const data = await apiFetch(`/actions${query}`)
      setActions(data.actions || [])
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
      const result = await apiFetch('/actions/fix-plan', {
        method: 'POST',
        body: JSON.stringify({ business_id: businessId, scores }),
      })
      setActions(result.actions || [])
      if (result.already_exists) {
        setNotice('Your plan already includes every fix from the latest report.')
      } else if (result.created?.length) {
        setNotice(`Added ${result.created.length} fix${result.created.length === 1 ? '' : 'es'} from your latest website report.`)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setCreating(false)
    }
  }

  const steps = useMemo(() => [...actions].sort(sortSteps), [actions])
  const completed = steps.filter((s) => s.status === 'done')
  const currentIndex = steps.findIndex((s) => s.status !== 'done')
  const currentStep = currentIndex === -1 ? null : steps[currentIndex]
  const planLift = useMemo(() => estimatePlanLift(steps), [steps])
  const allDone = steps.length > 0 && !currentStep

  const reportPath = businessId ? `/app/businesses/${businessId}/website-report` : '/app/businesses'

  const stepState = (step, index) => {
    if (step.status === 'done') return 'done'
    if (step.status === 'in_progress') return 'in_progress'
    if (index === currentIndex) return 'current'
    return 'later'
  }

  return (
    <div className="mx-auto max-w-4xl">
      <header className="app-stagger">
        <p className="app-eyebrow">Improve</p>
        <h1 className="app-page-title mt-2">Growth Roadmap</h1>
        <p className="app-page-subtitle max-w-2xl">
          Your ordered execution plan{business ? ` for ${business.business_name}` : ''}. Work through the
          steps top to bottom - each step unlocks the next, then rescan to confirm your score went up.
        </p>
      </header>

      {error ? (
        <Alert variant="error" title="Something went wrong" className="mt-6">
          {error}
        </Alert>
      ) : null}
      {notice ? (
        <Alert variant="success" title="Growth roadmap updated" className="mt-6">
          {notice}
        </Alert>
      ) : null}

      {loading ? (
        <p className="mt-8 text-sm text-[var(--app-text-muted)]">Loading growth roadmap...</p>
      ) : steps.length === 0 ? (
        <div className="app-card mt-8 p-8 text-center">
          <p className="text-sm font-medium text-[var(--app-text)]">No growth roadmap yet.</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-[var(--app-text-secondary)]">
            Analyze your website first, then turn the ranked findings into a step-by-step plan you can
            execute and track.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            {businessId ? (
              <button
                type="button"
                className="app-btn app-btn--primary"
                disabled={creating}
                onClick={createFromReport}
              >
                {creating ? 'Creating roadmap...' : 'Create roadmap from latest report'}
              </button>
            ) : null}
            <Link to={reportPath} className="app-btn app-btn--secondary">
              Open Website Analyzer
            </Link>
          </div>
        </div>
      ) : (
        <>
          <section className="mt-8">
            <p className="app-eyebrow">4 growth pillars</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {Object.entries(PILLAR_LABELS).map(([pillar, label]) => {
                const count = steps.filter((item) => actionPillar(item) === pillar).length
                return (
                  <div key={pillar} className="app-card p-4">
                    <p className="text-sm font-semibold text-[var(--app-text)]">{label}</p>
                    <p className="mt-1 text-xs text-[var(--app-text-muted)]">{PILLAR_DESCRIPTIONS[pillar]}</p>
                    <p className="mt-2 text-xs font-semibold text-[var(--app-accent-strong)]">
                      {count} step{count === 1 ? '' : 's'}
                    </p>
                  </div>
                )
              })}
            </div>
          </section>

          <div className="app-stagger mt-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="app-metric">
              <p className="app-eyebrow">Total steps</p>
              <p className="app-metric__value mt-2">{steps.length}</p>
            </div>
            <div className="app-metric">
              <p className="app-eyebrow">Completed</p>
              <p className="app-metric__value mt-2">{completed.length}</p>
            </div>
            <div className="app-metric">
              <p className="app-eyebrow">Current step</p>
              <p className="app-metric__value mt-2">
                {allDone ? 'All done' : `Step ${currentIndex + 1}`}
              </p>
            </div>
            <div className="app-metric">
              <p className="app-eyebrow">Estimated score lift</p>
              <p className="app-metric__value mt-2 text-lg">{planLift || '-'}</p>
            </div>
          </div>

          {allDone ? (
            <section className="app-next-action app-stagger mt-8">
              <p className="app-eyebrow">Plan complete</p>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-[var(--app-text)]">
                Every step is done. Rescan to confirm your score went up.
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--app-text-secondary)]">
                Run the Website Analyzer again to measure the improvement and generate the next round of
                growth opportunities.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link to={reportPath} className="app-btn app-btn--primary">
                  Rescan website
                </Link>
                <button
                  type="button"
                  className="app-btn app-btn--secondary"
                  disabled={creating}
                  onClick={createFromReport}
                >
                  {creating ? 'Checking report...' : 'Pull updates from latest report'}
                </button>
              </div>
            </section>
          ) : currentStep ? (
            <section className="app-next-action app-stagger mt-8">
              <div className="flex flex-wrap items-center gap-2">
                <p className="app-eyebrow">Do this first</p>
                {readMeta(currentStep, 'difficulty') ? (
                  <span
                    className={`rounded px-2 py-0.5 text-xs font-medium ${difficultyClass[readMeta(currentStep, 'difficulty')] || ''}`}
                  >
                    {DIFFICULTY_LABELS[readMeta(currentStep, 'difficulty')] || readMeta(currentStep, 'difficulty')}
                  </span>
                ) : null}
              </div>
              <h2 className="mt-2 text-xl font-semibold tracking-tight text-[var(--app-text)]">
                Step {currentIndex + 1}: {currentStep.title}
              </h2>
              {readMeta(currentStep, 'unlock_reason') ? (
                <p className="app-fix-card__unlock mt-3 max-w-2xl">
                  {readMeta(currentStep, 'unlock_reason')}
                </p>
              ) : null}
              <div className="mt-4">
                <StepDetails action={currentStep} />
              </div>
              <div className="mt-5">
                <StepActions action={currentStep} busyId={busyId} onStatus={updateStatus} primary />
              </div>
            </section>
          ) : null}

          <section className="mt-10">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="app-eyebrow">The full plan</p>
                <h2 className="mt-1 text-lg font-semibold text-[var(--app-text)]">
                  {steps.length} steps, in order
                </h2>
              </div>
              <Link to={reportPath} className="app-link text-sm font-medium">
                {'View website report ->'}
              </Link>
            </div>

            <ol className="mt-5 space-y-3">
              {steps.map((step, index) => {
                const state = stepState(step, index)
                const isCurrent = state === 'current' || state === 'in_progress'
                const expanded = expandedId === step.id || isCurrent
                const difficulty = readMeta(step, 'difficulty')
                const expectedLift = readMeta(step, 'expected_score_lift')
                const unlockReason = readMeta(step, 'unlock_reason')
                const pillar = actionPillar(step)

                return (
                  <li
                    key={step.id}
                    className={`app-card p-4 sm:p-5 ${state === 'done' ? 'opacity-70' : ''}`}
                  >
                    <div className="flex items-start gap-3">
                      <span className="app-priority-fix__rank shrink-0">{index + 1}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--app-text-muted)]">
                            Step {index + 1}
                            {pillar ? ` - ${PILLAR_LABELS[pillar] || pillar}` : ''}
                            {readMeta(step, 'category_label') ? ` - ${readMeta(step, 'category_label')}` : ''}
                          </p>
                          <StatusChip state={state} />
                          {difficulty ? (
                            <span
                              className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${difficultyClass[difficulty] || ''}`}
                            >
                              {DIFFICULTY_LABELS[difficulty] || difficulty}
                            </span>
                          ) : null}
                        </div>
                        <p
                          className={`mt-1 text-sm font-semibold leading-snug ${
                            state === 'done'
                              ? 'text-[var(--app-text-muted)] line-through'
                              : 'text-[var(--app-text)]'
                          }`}
                        >
                          {step.title}
                        </p>
                        {!expanded && expectedLift ? (
                          <p className="mt-1 text-xs text-[var(--app-text-muted)]">
                            Expected score lift: {expectedLift}
                          </p>
                        ) : null}
                        {expanded && unlockReason && !isCurrent ? (
                          <p className="app-fix-card__unlock mt-2">{unlockReason}</p>
                        ) : null}

                        {expanded ? (
                          <div className="mt-4">
                            <StepDetails action={step} />
                            <div className="mt-4">
                              <StepActions action={step} busyId={busyId} onStatus={updateStatus} />
                            </div>
                          </div>
                        ) : (
                          <div className="mt-3 flex flex-wrap items-center gap-3">
                            <button
                              type="button"
                              className="app-link text-xs font-semibold"
                              onClick={() => setExpandedId(step.id)}
                            >
                              Show details
                            </button>
                            {state !== 'done' ? (
                              <button
                                type="button"
                                className="app-link text-xs font-semibold"
                                disabled={busyId === step.id}
                                onClick={() => updateStatus(step, 'done')}
                              >
                                Mark done
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="app-link text-xs font-semibold"
                                disabled={busyId === step.id}
                                onClick={() => updateStatus(step, 'todo')}
                              >
                                Reopen
                              </button>
                            )}
                            <Link to={coachPathForAction(step)} className="app-link text-xs font-semibold">
                              Ask AI Coach how to do this
                            </Link>
                          </div>
                        )}

                        {expanded && expandedId === step.id && !isCurrent ? (
                          <button
                            type="button"
                            className="app-link mt-3 text-xs font-semibold"
                            onClick={() => setExpandedId(null)}
                          >
                            Hide details
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ol>
          </section>

          <div className="mt-10 flex flex-wrap gap-3 border-t border-[var(--app-border)] pt-6">
            <button
              type="button"
              className="app-btn app-btn--secondary"
              disabled={creating || !businessId}
              onClick={createFromReport}
            >
              {creating ? 'Syncing...' : 'Sync roadmap with latest report'}
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
