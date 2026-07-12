import { Link } from 'react-router-dom'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { apiFetch } from '../lib/api'
import ToolIcon from '../components/app/ToolIcon'
import { scoreTone } from '../components/app/ScanUi'

const greetingForHour = (hour) => {
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}

const JOURNEY_STEPS = [
  { key: 'analyze', label: 'Analyze website', icon: 'website' },
  { key: 'review', label: 'Review report', icon: 'scan' },
  { key: 'fix', label: 'Fix top problems', icon: 'plan' },
  { key: 'rescan', label: 'Rescan to confirm', icon: 'health' },
]

function journeyStepState(step, { webProfile, isCrawling }) {
  if (step === 'analyze') {
    if (isCrawling) return 'active'
    if (webProfile) return 'done'
    return 'active'
  }
  if (step === 'review') {
    if (webProfile) return 'active'
    return 'pending'
  }
  if (step === 'fix' || step === 'rescan') {
    if (webProfile) return 'active'
    return 'pending'
  }
  return 'pending'
}

const CATEGORY_DEFS = [
  { id: 'safety_trust', label: 'Safety & trust', key: 'safety_score', max: 20 },
  { id: 'technical_functionality', label: 'Functionality', key: 'functionality_score', max: 15 },
  { id: 'ux_ui_visual', label: 'UX / UI', key: 'ux_ui_score', max: 25 },
  { id: 'offer_business_fit', label: 'Business fit', key: 'business_fit_score', max: 20 },
  { id: 'customer_attraction', label: 'Customer attraction', key: 'customer_attraction_score', max: 20 },
]

function categoryStatus(value, max) {
  if (value == null || !max) return { label: 'Unknown', tone: 'muted' }
  const pct = value / max
  if (pct >= 0.7) return { label: 'Good', tone: 'success' }
  if (pct >= 0.45) return { label: 'Needs work', tone: 'warning' }
  return { label: 'Priority fix', tone: 'error' }
}

const statusToneClass = {
  success: 'text-[var(--app-success-icon)]',
  warning: 'text-[var(--app-warning-icon)]',
  error: 'text-[var(--app-danger-icon)]',
  muted: 'text-[var(--app-text-muted)]',
}

const Dashboard = () => {
  const { user } = useAuth()
  const [webProfile, setWebProfile] = useState(null)
  const [latestCrawl, setLatestCrawl] = useState(null)
  const [loading, setLoading] = useState(true)

  const name = user?.profile?.display_name || user?.email?.split('@')[0] || 'there'
  const business = user?.businesses?.[0]
  const hour = new Date().getHours()
  const greeting = greetingForHour(hour)
  const reportPath = business?.id ? `/app/businesses/${business.id}/website-report` : '/app/businesses'
  const isCrawling = latestCrawl?.status === 'running'

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const webData = business?.id
        ? await apiFetch(`/businesses/${business.id}/web-profile`).catch(() => ({
            profile: null,
            latest_crawl: null,
          }))
        : { profile: null, latest_crawl: null }
      setWebProfile(webData.profile || null)
      setLatestCrawl(webData.latest_crawl || null)
    } finally {
      setLoading(false)
    }
  }, [business?.id])

  useEffect(() => {
    load()
  }, [load])

  const scores = webProfile?.scores || {}
  const isV2 = scores.scoring_version === 'business_insights_analyzer_v2'
  const fixPlan = scores.fix_plan || []
  const topFix = fixPlan[0] || null

  const categories = useMemo(() => {
    if (!isV2) return []
    return CATEGORY_DEFS.map((def) => {
      const value = typeof scores[def.key] === 'number' ? scores[def.key] : null
      const status = categoryStatus(value, def.max)
      const fix = fixPlan.find((item) => item.affected_scores?.includes(def.id)) || null
      return { ...def, value, status, fix }
    })
  }, [isV2, scores, fixPlan])

  const nextBestAction = (() => {
    if (!business?.id) {
      return {
        eyebrow: 'Get started',
        title: 'Add your business',
        description: 'Create a business profile with your website URL to run the Website Analyzer.',
        cta: 'Manage businesses',
        to: '/app/businesses',
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
      }
    }
    if (isCrawling) {
      return {
        eyebrow: 'In progress',
        title: 'Website scan running',
        description: `Crawling pages - ${latestCrawl?.pages_crawled ?? 0} of ${latestCrawl?.pages_discovered ?? '?'} complete.`,
        cta: 'View progress',
        to: reportPath,
      }
    }
    if (topFix) {
      return {
        eyebrow: 'Next best action',
        title: topFix.title,
        description: topFix.unlock_reason || topFix.why_it_matters || 'Your highest-ranked fix from the latest scan.',
        cta: 'Open full report',
        to: reportPath,
      }
    }
    return {
      eyebrow: 'Looking good',
      title: 'Keep improving',
      description: 'No major issues found. Rescan periodically to measure progress after changes.',
      cta: 'Rescan website',
      to: reportPath,
    }
  })()

  const journeyContext = { webProfile, isCrawling }

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
          . Analyze your website, see exactly what to fix, then rescan to confirm the score went up.
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
        </div>
      </section>

      <nav className="app-journey app-stagger mt-8" aria-label="Product workflow">
        <ol className="app-journey__steps">
          {JOURNEY_STEPS.map((step) => {
            const state = journeyStepState(step.key, journeyContext)
            return (
              <li key={step.key} className={`app-journey__step app-journey__step--${state}`}>
                <span className="app-journey__icon">
                  <ToolIcon name={step.icon} className="h-4 w-4" />
                </span>
                <span className="app-journey__label">{step.label}</span>
              </li>
            )
          })}
        </ol>
      </nav>

      <div className="app-stagger mt-8 grid gap-4 sm:grid-cols-2">
        <div className="app-metric">
          <p className="app-eyebrow">Website score</p>
          {loading ? (
            <p className="app-metric__value mt-2 text-[var(--app-text-muted)]">-</p>
          ) : webProfile ? (
            <>
              <p className={`app-metric__value mt-2 ${scoreTone(scores.overall_score)}`}>
                {scores.overall_score ?? '-'}
              </p>
              <p className="mt-1 text-xs text-[var(--app-text-muted)]">
                {webProfile.summary?.platform ? `${webProfile.summary.platform} · ` : ''}
                {webProfile.summary?.pages_analyzed
                  ? `${webProfile.summary.pages_analyzed} pages`
                  : 'Report ready'}
              </p>
            </>
          ) : isCrawling ? (
            <p className="app-metric__value mt-2 text-sm text-[var(--app-text-secondary)]">Scanning...</p>
          ) : (
            <p className="app-metric__value mt-2 text-sm text-[var(--app-text-muted)]">Not analyzed</p>
          )}
          <Link to={reportPath} className="app-link mt-3 inline-block text-xs font-medium">
            {webProfile ? 'View full report ->' : 'Analyze website ->'}
          </Link>
        </div>

        <div className="app-metric">
          <p className="app-eyebrow">Business</p>
          <p className="app-metric__value mt-2 text-lg">{business?.business_name || '-'}</p>
          <p className="mt-1 text-xs text-[var(--app-text-muted)]">{business?.business_type || '-'}</p>
          <Link to="/app/businesses" className="app-link mt-3 inline-block text-xs font-medium">
            {'Manage ->'}
          </Link>
        </div>
      </div>

      {isV2 ? (
        <section className="app-stagger mt-10">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="app-eyebrow">Score by department</p>
              <h2 className="mt-1 text-lg font-semibold text-[var(--app-text)]">
                Where to improve, category by category
              </h2>
            </div>
            <Link to={reportPath} className="app-link text-sm font-medium">
              {'Full report ->'}
            </Link>
          </div>
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((cat) => (
              <div key={cat.id} className="app-score-category">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-[var(--app-text)]">{cat.label}</p>
                  <span className={`text-xs font-semibold ${statusToneClass[cat.status.tone]}`}>
                    {cat.status.label}
                  </span>
                </div>
                <p className="mt-2 text-2xl font-semibold text-[var(--app-text)]">
                  {cat.value ?? '-'}
                  <span className="text-sm text-[var(--app-text-muted)]">/{cat.max}</span>
                </p>
                {cat.fix ? (
                  <p className="mt-2 text-xs leading-relaxed text-[var(--app-text-secondary)]">
                    Fix #{cat.fix.rank}: {cat.fix.title}
                  </p>
                ) : (
                  <p className="mt-2 text-xs text-[var(--app-text-muted)]">No open fixes here right now.</p>
                )}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {topFix ? (
        <section className="app-next-action app-stagger mt-8">
          <p className="app-eyebrow">Top fix to work on right now</p>
          <h2 className="mt-2 text-lg font-semibold tracking-tight text-[var(--app-text)]">
            Fix #{topFix.rank}: {topFix.title}
          </h2>
          {topFix.unlock_reason ? (
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--app-text-secondary)]">
              {topFix.unlock_reason}
            </p>
          ) : null}
          {topFix.evidence?.length ? (
            <p className="mt-2 max-w-2xl text-xs text-[var(--app-text-muted)]">{topFix.evidence[0]}</p>
          ) : null}
          {topFix.research_basis ? (
            <p className="app-fix-card__research mt-3 max-w-2xl">
              <strong>The research: </strong>
              {topFix.research_basis}
            </p>
          ) : null}
          <div className="mt-4">
            <Link to={reportPath} className="app-btn app-btn--primary">
              See all fixes in the report
            </Link>
          </div>
        </section>
      ) : null}
    </div>
  )
}

export default Dashboard
