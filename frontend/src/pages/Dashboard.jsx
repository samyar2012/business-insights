import { Link } from 'react-router-dom'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { apiFetch } from '../lib/api'
import ToolIcon from '../components/app/ToolIcon'
import { TOOL_CATALOG, resolveToolPath } from './tools/toolConfig'
import { formatScanDate, scoreTone } from '../components/app/ScanUi'

const greetingForHour = (hour) => {
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

const JOURNEY_STEPS = [
  { key: 'analyze', label: 'Analyze website', icon: 'website' },
  { key: 'review', label: 'Review report', icon: 'scan' },
  { key: 'plan', label: 'Work on fix plan', icon: 'plan' },
  { key: 'coach', label: 'Ask AI coach', icon: 'coach' },
]

function journeyStepState(step, { webProfile, isCrawling, openActions }) {
  if (step === 'analyze') {
    if (isCrawling) return 'active'
    if (webProfile) return 'done'
    return 'active'
  }
  if (step === 'review') {
    if (webProfile) return 'active'
    if (isCrawling) return 'pending'
    return 'pending'
  }
  if (step === 'plan') {
    if (openActions.length) return 'active'
    if (webProfile) return 'active'
    return 'pending'
  }
  if (step === 'coach') {
    if (webProfile) return 'active'
    return 'pending'
  }
  return 'pending'
}

const Dashboard = () => {
  const { user } = useAuth()
  const [actions, setActions] = useState([])
  const [webProfile, setWebProfile] = useState(null)
  const [latestCrawl, setLatestCrawl] = useState(null)
  const [scansLoading, setScansLoading] = useState(true)

  const name = user?.profile?.display_name || user?.email?.split('@')[0] || 'there'
  const business = user?.businesses?.[0]
  const hour = new Date().getHours()
  const greeting = greetingForHour(hour)
  const reportPath = business?.id ? `/app/businesses/${business.id}/website-report` : '/app/businesses'
  const isCrawling = latestCrawl?.status === 'running'

  const load = useCallback(async () => {
    setScansLoading(true)
    try {
      const [actionsData, webData] = await Promise.all([
        apiFetch('/actions').catch(() => ({ actions: [] })),
        business?.id
          ? apiFetch(`/businesses/${business.id}/web-profile`).catch(() => ({
              profile: null,
              latest_crawl: null,
            }))
          : Promise.resolve({ profile: null, latest_crawl: null }),
      ])
      setActions(actionsData.actions || [])
      setWebProfile(webData.profile || null)
      setLatestCrawl(webData.latest_crawl || null)
    } catch {
      setActions([])
    } finally {
      setScansLoading(false)
    }
  }, [business?.id])

  useEffect(() => {
    load()
  }, [load])

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

  const nextBestAction = (() => {
    if (!business?.id) {
      return {
        eyebrow: 'Get started',
        title: 'Add your business',
        description: 'Create a business profile with your website URL to run the Website Analyzer.',
        cta: 'Manage businesses',
        to: '/app/businesses',
        secondaryCta: 'Explore tools',
        secondaryTo: '/app/tools',
      }
    }
    if (!webProfile && !isCrawling) {
      return {
        eyebrow: 'Next best action',
        title: 'Analyze your website',
        description: business.store_url
          ? 'Run the Website Analyzer on your public pages to find what stops customers from buying or contacting you.'
          : 'Add your website URL, then run the analyzer to get scores and ranked fixes.',
        cta: business.store_url ? 'Start analysis' : 'Add website URL',
        to: business.store_url ? reportPath : '/app/businesses',
        secondaryCta: 'Explore tools',
        secondaryTo: '/app/tools',
      }
    }
    if (isCrawling) {
      return {
        eyebrow: 'In progress',
        title: 'Website scan running',
        description: `Crawling pages — ${latestCrawl?.pages_crawled ?? 0} of ${latestCrawl?.pages_discovered ?? '?'} complete.`,
        cta: 'View progress',
        to: reportPath,
      }
    }
    if (webProfile && openActions.length === 0) {
      return {
        eyebrow: 'Next best action',
        title: 'Create your fix plan',
        description:
          'Your report is ready. Turn ranked problems into trackable tasks so you know what to fix first.',
        cta: 'Open website report',
        to: reportPath,
        secondaryCta: 'View action plan',
        secondaryTo: '/app/action-plan',
      }
    }
    if (nextHighPriority) {
      return {
        eyebrow: 'Next best action',
        title: nextHighPriority.title,
        description: nextHighPriority.description || 'Your highest-priority open task from the fix plan.',
        cta: 'Open action plan',
        to: '/app/action-plan',
        secondaryCta: 'View report',
        secondaryTo: reportPath,
      }
    }
    return {
      eyebrow: 'Looking good',
      title: 'Keep improving',
      description:
        'No urgent open tasks. Ask the AI coach for advice or rescan to measure progress after your fixes.',
      cta: 'Ask AI coach',
      to: `/app/tools/growth-coach?businessId=${business.id}&context=website-report`,
      secondaryCta: 'Rescan website',
      secondaryTo: reportPath,
    }
  })()

  const journeyContext = { webProfile, isCrawling, openActions }

  return (
    <div className="mx-auto max-w-5xl">
      <header className="app-stagger">
        <p className="app-eyebrow">{greeting}</p>
        <h1 className="app-page-title mt-2">Welcome back, {name}</h1>
        <p className="app-page-subtitle max-w-2xl">
          Your command center for{' '}
          <span className="font-medium text-[var(--app-text)]">
            {business?.business_name || 'your business'}
          </span>
          . Scan your site, review the report, work your fix plan, then ask the AI coach.
        </p>
      </header>

      <section className="app-next-action app-stagger mt-8">
        <p className="app-eyebrow">{nextBestAction.eyebrow}</p>
        <h2 className="mt-2 text-xl font-semibold tracking-tight text-[var(--app-text)] sm:text-2xl">
          {nextBestAction.title}
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--app-text-secondary)]">
          {nextBestAction.description}
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link to={nextBestAction.to} className="app-btn app-btn--primary">
            {nextBestAction.cta}
          </Link>
          {nextBestAction.secondaryCta ? (
            <Link to={nextBestAction.secondaryTo} className="app-btn app-btn--secondary">
              {nextBestAction.secondaryCta}
            </Link>
          ) : null}
        </div>
      </section>

      <nav className="app-journey app-stagger mt-8" aria-label="Product workflow">
        <ol className="app-journey__steps">
          {JOURNEY_STEPS.map((step) => {
            const state = journeyStepState(step.key, journeyContext)
            return (
              <li
                key={step.key}
                className={`app-journey__step app-journey__step--${state}`}
              >
                <span className="app-journey__icon">
                  <ToolIcon name={step.icon} className="h-4 w-4" />
                </span>
                <span className="app-journey__label">{step.label}</span>
              </li>
            )
          })}
        </ol>
      </nav>

      <div className="app-stagger mt-8 grid gap-4 sm:grid-cols-3">
        <div className="app-metric">
          <p className="app-eyebrow">Website score</p>
          {scansLoading ? (
            <p className="app-metric__value mt-2 text-[var(--app-text-muted)]">—</p>
          ) : webProfile ? (
            <>
              <p className={`app-metric__value mt-2 ${scoreTone(webProfile.scores?.overall_score)}`}>
                {webProfile.scores?.overall_score ?? '—'}
              </p>
              <p className="mt-1 text-xs text-[var(--app-text-muted)]">
                {webProfile.summary?.platform ? `${webProfile.summary.platform} · ` : ''}
                {webProfile.summary?.pages_analyzed
                  ? `${webProfile.summary.pages_analyzed} pages`
                  : 'Report ready'}
              </p>
            </>
          ) : isCrawling ? (
            <p className="app-metric__value mt-2 text-sm text-[var(--app-text-secondary)]">Scanning…</p>
          ) : (
            <p className="app-metric__value mt-2 text-sm text-[var(--app-text-muted)]">Not analyzed</p>
          )}
          <Link to={reportPath} className="app-link mt-3 inline-block text-xs font-medium">
            {webProfile ? 'View report →' : 'Analyze website →'}
          </Link>
        </div>

        <div className="app-metric">
          <p className="app-eyebrow">Open fixes</p>
          <p className="app-metric__value mt-2">{openActions.length}</p>
          <p className="mt-1 text-xs text-[var(--app-text-muted)]">{doneActions.length} completed</p>
          <Link to="/app/action-plan" className="app-link mt-3 inline-block text-xs font-medium">
            Open action plan →
          </Link>
        </div>

        <div className="app-metric">
          <p className="app-eyebrow">Business</p>
          <p className="app-metric__value mt-2 text-lg">{business?.business_name || '—'}</p>
          <p className="mt-1 text-xs text-[var(--app-text-muted)]">{business?.business_type || '—'}</p>
          <Link to="/app/businesses" className="app-link mt-3 inline-block text-xs font-medium">
            Manage →
          </Link>
        </div>
      </div>

      <section className="app-stagger mt-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="app-eyebrow">Tools</p>
            <h2 className="mt-1 text-lg font-semibold text-[var(--app-text)]">Continue your workflow</h2>
          </div>
          <Link to="/app/tools" className="app-link text-sm font-medium">
            All tools →
          </Link>
        </div>
        <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {TOOL_CATALOG.slice(0, 4).map((tool) => (
            <li key={tool.slug}>
              <Link
                to={resolveToolPath(tool, business?.id)}
                className="app-tool-row group block"
              >
                <span className="app-tool-row__icon">
                  <ToolIcon name={tool.icon} className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block font-semibold text-[var(--app-text)]">{tool.title}</span>
                  <span className="mt-0.5 block text-xs text-[var(--app-text-secondary)] line-clamp-2">
                    {tool.tagline}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

export default Dashboard
