import { Link } from 'react-router-dom'
import { useCallback, useEffect, useState } from 'react'
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
  const [scansLoading, setScansLoading] = useState(true)

  const name = user?.profile?.display_name || user?.email?.split('@')[0] || 'there'
  const business = user?.businesses?.[0]
  const hour = new Date().getHours()
  const greeting = greetingForHour(hour)

  const loadLatestScan = useCallback(async () => {
    setScansLoading(true)
    try {
      const data = await apiFetch('/scans')
      setLatestScan((data.scans || [])[0] || null)
    } catch {
      setLatestScan(null)
    } finally {
      setScansLoading(false)
    }
  }, [])

  useEffect(() => {
    loadLatestScan()
  }, [loadLatestScan])

  return (
    <div className="mx-auto max-w-5xl">
      <section className="app-dashboard-hero app-stagger rounded-2xl p-6 sm:p-10">
        <p className="app-eyebrow">{greeting}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[var(--app-text)] sm:text-4xl">
          Welcome back, {name}
        </h1>
        <p className="mt-3 max-w-xl text-base leading-relaxed text-[var(--app-text-secondary)]">
          Your command center is ready. Connect a workspace, run a Business Scanner, and turn store
          signals into growth wins - starting with{' '}
          <span className="font-medium text-[var(--app-text)]">
            {business?.business_name || 'your business'}
          </span>
          .
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link to="/app/tools/business-scanner" className="app-btn app-btn--primary">
            Run Business Scanner
          </Link>
          <Link to="/app/tools" className="app-btn app-btn--secondary">
            Explore tools
          </Link>
          <Link to="/app/plans" className="app-btn app-btn--ghost">
            View plans
          </Link>
        </div>
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
                    {latestScan.business_name || 'Business scan'} · {formatScanDate(latestScan.created_at)}
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
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="app-eyebrow">Your next steps</p>
            <h2 className="mt-1 text-xl font-semibold text-[var(--app-text)]">
              Build momentum today
            </h2>
          </div>
          <Link to="/app/workspace/github" className="app-link text-sm font-medium">
            Set up workspace -&gt;
          </Link>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Link to="/app/workspace/github" className="app-card app-card--interactive block p-5">
            <p className="text-sm font-semibold text-[var(--app-text)]">Connect GitHub</p>
            <p className="mt-1 text-sm text-[var(--app-text-secondary)]">
              Sync repos and version your growth experiments.
            </p>
          </Link>
          <Link to="/app/workspace/url" className="app-card app-card--interactive block p-5">
            <p className="text-sm font-semibold text-[var(--app-text)]">Add your store URL</p>
            <p className="mt-1 text-sm text-[var(--app-text-secondary)]">
              Link your site for richer tool context.
            </p>
          </Link>
        </div>
      </section>

      <section className="app-stagger mt-10">
        <p className="app-eyebrow">Tools preview</p>
        <h2 className="mt-1 text-xl font-semibold text-[var(--app-text)]">
          See what you can do next
        </h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-3">
          {TOOL_CATALOG.map((tool) => (
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
