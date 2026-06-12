import { Link } from 'react-router-dom'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { apiFetch } from '../lib/api'
import { TOOL_CATALOG, TOOL_ICONS } from './tools/toolConfig'
import { formatScanDate, scoreTone } from '../components/app/ScanUi'

const greetingForHour = (hour) => {
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

const Dashboard = () => {
  const { user } = useAuth()
  const [latestScan, setLatestScan] = useState(null)
  const [actions, setActions] = useState([])
  const [research, setResearch] = useState(null)
  const [researchBusy, setResearchBusy] = useState(false)
  const [latestInsight, setLatestInsight] = useState('')
  const [scansLoading, setScansLoading] = useState(true)

  const name = user?.profile?.display_name || user?.email?.split('@')[0] || 'there'
  const business = user?.businesses?.[0]
  const hour = new Date().getHours()
  const greeting = greetingForHour(hour)

  const load = useCallback(async () => {
    setScansLoading(true)
    try {
      const [scansData, actionsData, researchData] = await Promise.all([
        apiFetch('/scans'),
        apiFetch('/actions').catch(() => ({ actions: [] })),
        business?.id
          ? apiFetch(`/research/business/${business.id}`).catch(() => ({ profile: null }))
          : Promise.resolve({ profile: null }),
      ])
      setLatestScan((scansData.scans || [])[0] || null)
      setActions(actionsData.actions || [])
      setResearch(researchData.profile || null)
    } catch {
      setLatestScan(null)
      setActions([])
    } finally {
      setScansLoading(false)
    }
  }, [business?.id])

  useEffect(() => {
    load()
  }, [load])

  const runResearch = async () => {
    if (!business?.id) return
    setResearchBusy(true)
    try {
      const data = await apiFetch(`/research/business/${business.id}/run`, { method: 'POST' })
      setResearch(data.profile)
    } catch {
      // keep dashboard usable if research fails
    } finally {
      setResearchBusy(false)
    }
  }

  const openActions = useMemo(
    () => actions.filter((a) => a.status !== 'done'),
    [actions],
  )
  const doneActions = useMemo(
    () => actions.filter((a) => a.status === 'done'),
    [actions],
  )
  const nextHighPriority = useMemo(
    () =>
      openActions
        .filter((a) => a.priority === 'high')
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))[0] ||
      openActions[0] ||
      null,
    [openActions],
  )

  useEffect(() => {
    if (!latestScan && !nextHighPriority) return
    const parts = []
    if (latestScan) {
      parts.push(
        `Latest scan scored ${latestScan.overall_score} for ${latestScan.business_name || 'your business'}.`,
      )
    }
    if (research?.scores?.overall_score != null) {
      parts.push(`Research score: ${research.scores.overall_score}/100.`)
    }
    if (nextHighPriority) {
      parts.push(`Next up: ${nextHighPriority.title}`)
    }
    setLatestInsight(parts.join(' '))
  }, [latestScan, nextHighPriority, research])

  return (
    <div className="mx-auto max-w-5xl">
      <section className="app-dashboard-hero app-stagger rounded-2xl p-6 sm:p-10">
        <p className="app-eyebrow">{greeting}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--app-text)] sm:text-4xl">
          Welcome back, {name}
        </h1>
        <p className="mt-3 max-w-xl text-base leading-relaxed text-[var(--app-text-secondary)]">
          Your command center for scans, action plans, and AI growth tools - starting with{' '}
          <span className="font-medium text-[var(--app-text)]">
            {business?.business_name || 'your business'}
          </span>
          .
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link to="/app/tools/business-scanner" className="app-btn app-btn--primary">
            Run scan
          </Link>
          <Link to="/app/action-plan" className="app-btn app-btn--secondary">
            View action plan
          </Link>
          <Link to="/app/tools/growth-coach" className="app-btn app-btn--secondary">
            Ask AI coach
          </Link>
          <Link to="/app/tools/content-generator" className="app-btn app-btn--ghost">
            Generate content
          </Link>
        </div>
      </section>

      <div className="app-stagger mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <article className="app-card p-5">
          <p className="app-eyebrow">Open tasks</p>
          <p className="app-stat-value mt-2">{openActions.length}</p>
        </article>
        <article className="app-card p-5">
          <p className="app-eyebrow">Completed</p>
          <p className="app-stat-value mt-2">{doneActions.length}</p>
        </article>
        <article className="app-card p-5 sm:col-span-2">
          <p className="app-eyebrow">Next high-priority task</p>
          <p className="mt-2 text-sm font-medium text-[var(--app-text)]">
            {nextHighPriority?.title || 'No open tasks'}
          </p>
          {nextHighPriority ? (
            <Link to="/app/action-plan" className="app-link mt-2 inline-block text-xs font-medium">
              Open action plan -&gt;
            </Link>
          ) : null}
        </article>
      </div>

      <section className="app-stagger mt-8">
        <article className="app-card p-5">
          <p className="app-eyebrow">Business research</p>
          {research ? (
            <>
              <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className={`text-4xl font-semibold ${scoreTone(research.scores?.overall_score)}`}>
                    {research.scores?.overall_score ?? '-'}
                  </p>
                  <p className="mt-1 text-sm text-[var(--app-text-secondary)]">
                    {business?.business_name || 'Business'} - researched {formatScanDate(research.created_at)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-[var(--app-text-muted)]">
                  <span>Store {research.scores?.store_score}</span>
                  <span>Trust {research.scores?.trust_score}</span>
                  <span>Offer {research.scores?.offer_score}</span>
                  <span>Market {research.scores?.market_score}</span>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link to={`/app/research/${business?.id}`} className="app-btn app-btn--primary">
                  Full research report
                </Link>
                <button
                  type="button"
                  className="app-btn app-btn--secondary"
                  disabled={researchBusy}
                  onClick={runResearch}
                >
                  {researchBusy ? 'Rescanning...' : 'Rescan'}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="mt-3 text-sm text-[var(--app-text-secondary)]">
                Research your business online using onboarding data and your store URL.
              </p>
              <button
                type="button"
                className="app-btn app-btn--primary mt-4"
                disabled={researchBusy || !business?.id}
                onClick={runResearch}
              >
                {researchBusy ? 'Researching...' : 'Run business research'}
              </button>
            </>
          )}
        </article>
      </section>

      <section className="app-stagger mt-8">
        <article className="app-card p-5">
          <p className="app-eyebrow">Latest scan</p>
          {scansLoading ? (
            <p className="mt-3 text-sm text-[var(--app-text-muted)]">Loading scan data...</p>
          ) : latestScan ? (
            <>
              <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className={`text-4xl font-semibold ${scoreTone(latestScan.overall_score)}`}>
                    {latestScan.overall_score}
                  </p>
                  <p className="mt-1 text-sm text-[var(--app-text-secondary)]">
                    {latestScan.business_name || 'Business scan'} - {formatScanDate(latestScan.created_at)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-[var(--app-text-muted)]">
                  <span>Store {latestScan.store_score}</span>
                  <span>Trust {latestScan.trust_score}</span>
                  <span>Content {latestScan.content_score}</span>
                  <span>Competitor {latestScan.competitor_score}</span>
                </div>
              </div>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link to={`/app/scans/${latestScan.id}`} className="app-btn app-btn--primary">
                  View report
                </Link>
                <Link to="/app/tools/business-scanner" className="app-btn app-btn--secondary">
                  Run new scan
                </Link>
                <Link to="/app/scans" className="app-link self-center text-sm font-medium">
                  All scans -&gt;
                </Link>
              </div>
            </>
          ) : (
            <>
              <p className="mt-3 text-sm text-[var(--app-text-secondary)]">No scans yet</p>
              <p className="mt-1 text-sm text-[var(--app-text-muted)]">
                Run the Business Scanner to get scores, risks, and next actions.
              </p>
              <Link to="/app/tools/business-scanner" className="app-btn app-btn--primary mt-4 inline-flex">
                Run Business Scanner
              </Link>
            </>
          )}
        </article>
      </section>

      {latestInsight ? (
        <section className="app-stagger mt-6">
          <article className="app-card p-5">
            <p className="app-eyebrow">Latest AI insight</p>
            <p className="mt-2 text-sm text-[var(--app-text-secondary)]">{latestInsight}</p>
            <Link to="/app/tools/growth-coach" className="app-link mt-3 inline-block text-sm font-medium">
              Ask AI coach -&gt;
            </Link>
          </article>
        </section>
      ) : null}

      <div className="app-stagger mt-8 grid gap-4 sm:grid-cols-3">
        <article className="app-card app-card--interactive p-5">
          <p className="app-eyebrow">Business</p>
          <p className="app-stat-value mt-3">{business?.business_name || '-'}</p>
          <p className="mt-1 text-sm text-[var(--app-text-secondary)]">{business?.business_type || '-'}</p>
        </article>
        <article className="app-card app-card--interactive p-5">
          <p className="app-eyebrow">Customers</p>
          <p className="app-stat-value mt-3">{business?.customer_count ?? '-'}</p>
          <p className="mt-1 text-sm text-[var(--app-text-muted)]">Total tracked</p>
        </article>
        <article className="app-card app-card--interactive p-5">
          <p className="app-eyebrow">Monthly revenue</p>
          <p className="app-stat-value mt-3">
            {business?.monthly_revenue != null ? `$${business.monthly_revenue.toLocaleString()}` : '-'}
          </p>
          <p className="mt-1 text-sm text-[var(--app-text-muted)]">Last reported</p>
        </article>
      </div>

      <section className="app-stagger mt-10">
        <p className="app-eyebrow">Tools</p>
        <h2 className="mt-1 text-xl font-semibold text-[var(--app-text)]">Quick access</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          {TOOL_CATALOG.slice(0, 6).map((tool) => (
            <Link key={tool.slug} to={tool.to} className="app-card app-card--interactive block p-5">
              <span className="text-lg text-[var(--app-accent-strong)]">{TOOL_ICONS[tool.icon] || '*'}</span>
              <p className="mt-3 font-semibold text-[var(--app-text)]">{tool.title}</p>
              <p className="mt-1 text-xs text-[var(--app-text-secondary)]">{tool.tagline}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}

export default Dashboard
