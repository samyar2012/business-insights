import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import { getBusinessModelLabel } from '../lib/businessFormConfig'
import Alert from '../components/app/Alert'
import ScoreBar, { formatScanDate, scoreTone } from '../components/app/ScanUi'

const V2_CATEGORIES = [
  { id: 'safety_trust', label: 'Safety & trust', key: 'safety_score', max: 20 },
  { id: 'technical_functionality', label: 'Technical functionality', key: 'functionality_score', max: 15 },
  { id: 'ux_ui_visual', label: 'UX / UI & visual quality', key: 'ux_ui_score', max: 25 },
  { id: 'offer_business_fit', label: 'Offer clarity & business fit', key: 'business_fit_score', max: 20 },
  { id: 'customer_attraction', label: 'Customer attraction & conversion', key: 'customer_attraction_score', max: 20 },
]

const LEGACY_CATEGORIES = [
  { label: 'Safety', key: 'safety_score', max: 30 },
  { label: 'Functionality', key: 'functionality_score', max: 20 },
  { label: 'UX / UI', key: 'ux_ui_score', max: 20 },
  { label: 'Business fit', key: 'business_fit_score', max: 20 },
  { label: 'Customer attraction', key: 'customer_attraction_score', max: 10 },
]

function isAnalyzerV2(scores) {
  return scores?.scoring_version === 'business_insights_analyzer_v2'
}

function weightedCategories(scores) {
  return isAnalyzerV2(scores) ? V2_CATEGORIES : LEGACY_CATEGORIES
}

function readWeightedScore(scores, key) {
  const value = scores?.[key]
  if (typeof value === 'number' && !Number.isNaN(value)) return value
  return null
}

function weightedCategorySum(scores) {
  return weightedCategories(scores).reduce((sum, { key }) => {
    const value = readWeightedScore(scores, key)
    return sum + (value ?? 0)
  }, 0)
}

function hasMissingWeightedScores(scores) {
  return weightedCategories(scores).some(({ key }) => readWeightedScore(scores, key) === null)
}

const WEIGHTED_EXPLANATION_CATEGORIES = new Set([
  'safety',
  'functionality',
  'ux_ui',
  'business_fit',
  'customer_attraction',
  'mismatch',
])

function weightedScoreExplanations(scores) {
  return (scores?.score_explanation || []).filter((item) =>
    WEIGHTED_EXPLANATION_CATEGORIES.has(item.category),
  )
}

function lensStatus(value, max) {
  if (value == null || max <= 0) return { label: 'Unknown', tone: 'muted' }
  const pct = value / max
  if (pct >= 0.7) return { label: 'Good', tone: 'success' }
  if (pct >= 0.45) return { label: 'Needs work', tone: 'warning' }
  return { label: 'Priority fix', tone: 'error' }
}

const ANALYZER_LENSES_V2 = [
  {
    question: 'Is my site safe and trustworthy?',
    id: 'safety_trust',
    key: 'safety_score',
    max: 20,
    detail: 'HTTPS, Safe Browsing, contact info, policies, and social proof.',
  },
  {
    question: 'Does the site work technically?',
    id: 'technical_functionality',
    key: 'functionality_score',
    max: 15,
    detail: 'Homepage load, crawl depth, extractability, and mobile viewport.',
  },
  {
    question: 'Is the UX/UI strong enough to convert?',
    id: 'ux_ui_visual',
    key: 'ux_ui_score',
    max: 25,
    detail: 'Visual hierarchy, readability, CTAs, mobile layout, and contrast.',
  },
  {
    question: 'Does the site fit my business model?',
    id: 'offer_business_fit',
    key: 'business_fit_score',
    max: 20,
    detail: 'Model-specific offer signals — products, services, or listing quality.',
  },
  {
    question: 'Will visitors know what to do next?',
    id: 'customer_attraction',
    key: 'customer_attraction_score',
    max: 20,
    detail: 'Primary CTA, proof, contact path, and SEO clarity.',
  },
]

const ANALYZER_LENSES_LEGACY = [
  {
    question: 'Is my site safe?',
    key: 'safety_score',
    max: 30,
    detail: 'Malware, phishing, and HTTPS trust signals.',
  },
  {
    question: 'Is my site functional?',
    key: 'functionality_score',
    max: 20,
    detail: 'Pages load, HTTPS works, and content is reachable.',
  },
  {
    question: 'Is my UX/UI good enough?',
    key: 'ux_ui_score',
    max: 20,
    detail: 'Headings, navigation, CTAs, and mobile layout.',
  },
  {
    question: 'Does my site match my business type?',
    key: 'business_fit_score',
    max: 20,
    detail: 'Signals align with your selected business model.',
  },
  {
    question: 'Will this site attract and convert customers?',
    key: 'customer_attraction_score',
    max: 10,
    detail: 'CTAs, proof, contact paths, and local relevance.',
  },
]

function analyzerLenses(scores) {
  return isAnalyzerV2(scores) ? ANALYZER_LENSES_V2 : ANALYZER_LENSES_LEGACY
}

const CAP_LABELS = {
  unsafe_site_cap_30: 'Unsafe site (malware/phishing)',
  homepage_failure_cap_40: 'Homepage failed to load',
  no_readable_content_cap_45: 'Very little readable content',
  business_model_mismatch_cap_65: 'Business model mismatch',
  mobile_overflow_cap_70: 'Severe mobile layout overflow',
  no_conversion_path_cap_75: 'No contact, booking, or purchase path',
}

const UX_COMPONENT_LABELS = {
  navbar_score: 'Navigation',
  hero_score: 'Hero / above fold',
  readability_score: 'Readability',
  visual_hierarchy_score: 'Visual hierarchy',
  image_quality_score: 'Image quality',
  layout_balance_score: 'Layout balance',
  conversion_path_score: 'Conversion path',
  trust_visual_score: 'Trust visuals',
}

const PRIORITY_LABELS = {
  critical: 'Critical',
  high: 'High impact',
  medium: 'Medium impact',
  low: 'Polish',
}

function uxUiScoreDetail(scores) {
  const uxModel = scores.ux_model
  if (uxModel?.used) {
    return `Layout analysis ${scores.deterministic_ux_ui_score ?? scores.crawl_ux_ui_score ?? '-'}/20 blended with ML prediction ${uxModel.predicted_ux_score_on_20_scale}/20.`
  }
  if (scores.ux_scoring_mode === 'feature_signals') {
    return 'Scored from page layout, readability, navigation, and mobile signals.'
  }
  if (scores.ux_scoring_mode === 'visual_audit' || scores.ux_scoring_mode === 'analyzer_v2') {
    return 'Scored from visual layout audit plus page signals.'
  }
  return 'Headings, navigation, CTAs, and mobile layout.'
}

const WebsiteReport = () => {
  const { businessId } = useParams()
  const [business, setBusiness] = useState(null)
  const [profile, setProfile] = useState(null)
  const [latestCrawl, setLatestCrawl] = useState(null)
  const [pages, setPages] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [polling, setPolling] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setError('')
    try {
      const data = await apiFetch(`/businesses/${businessId}/web-profile`)
      setBusiness(data.business)
      setProfile(data.profile)
      setLatestCrawl(data.latest_crawl)
      setPages(data.pages || [])
      return data
    } catch (err) {
      setError(err.message)
      return null
    } finally {
      setLoading(false)
    }
  }, [businessId])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    if (!polling || !latestCrawl || latestCrawl.status !== 'running') return undefined
    const timer = setInterval(async () => {
      const data = await load()
      if (data?.latest_crawl?.status !== 'running') {
        setPolling(false)
      }
    }, 2500)
    return () => clearInterval(timer)
  }, [polling, latestCrawl, load])

  const startCrawl = async (skipCache = false) => {
    setBusy(true)
    setError('')
    try {
      const data = await apiFetch(`/businesses/${businessId}/crawls`, {
        method: 'POST',
        body: JSON.stringify({ skip_cache: skipCache }),
      })
      setProfile(data.profile)
      if (data.crawl) {
        setLatestCrawl(data.crawl)
        if (data.crawl.status === 'running') setPolling(true)
      }
      await load()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const rescan = () => startCrawl(true)

  if (loading) {
    return (
      <div className="app-loading mt-8">
        <span /><span /><span />
        <p className="mt-3 text-sm text-[var(--app-text-muted)]">Loading website report...</p>
      </div>
    )
  }

  const summary = profile?.summary || {}
  const scores = profile?.scores || {}
  const isRunning = latestCrawl?.status === 'running' || busy
  const missingWeightedScores = profile ? hasMissingWeightedScores(scores) : false
  const weightedSum = weightedCategorySum(scores)
  const scoreSumMismatch =
    !missingWeightedScores &&
    typeof scores.overall_score === 'number' &&
    scores.overall_score !== weightedSum &&
    !(scores.score_caps_applied?.length > 0)
  const scoreExplanations = weightedScoreExplanations(scores)
  const priorityFixes = scores.priority_fixes?.length
    ? scores.priority_fixes
    : (scores.recommended_actions || []).map((action, index) => ({
        rank: index + 1,
        priority: index === 0 ? 'high' : 'medium',
        category: 'customer_attraction',
        action,
        impact: '',
      }))
  const benchmark = scores.benchmark_comparison
  const uxFeatures = scores.ux_features || {}
  const categoryDetails = scores.category_details || {}
  const v2Report = isAnalyzerV2(scores)
  const categories = weightedCategories(scores)
  const lenses = analyzerLenses(scores)

  return (
    <div className="mx-auto max-w-4xl">
      <Link to="/app" className="app-link text-sm font-medium">&lt;- Dashboard</Link>

      <header className="mt-4">
        <p className="app-eyebrow">Website improvement workspace</p>
        <h1 className="app-page-title mt-2">{business?.business_name || 'Website report'}</h1>
        <p className="app-page-subtitle">
          {business?.store_url ? (
            <span className="break-all">{business.store_url}</span>
          ) : (
            'Add a store URL to analyze how well your site attracts and converts customers.'
          )}
        </p>
      </header>

      {error ? (
        <Alert variant="error" title="Error" className="mt-6">{error}</Alert>
      ) : null}

      {!profile && !isRunning ? (
        <div className="app-card mt-8 p-6 text-center">
          <p className="text-sm text-[var(--app-text-secondary)]">
            Run a customer-attraction analysis on your public pages — see what helps or hurts conversions.
          </p>
          <button
            type="button"
            className="app-btn app-btn--primary mt-4"
            disabled={busy || !business?.store_url}
            onClick={() => startCrawl(false)}
          >
            {busy ? 'Starting...' : 'Analyze your website'}
          </button>
        </div>
      ) : null}

      {isRunning ? (
        <section className="app-card mt-8 p-6">
          <p className="app-eyebrow">Crawl in progress</p>
          <p className="mt-2 text-sm text-[var(--app-text-secondary)]">
            Scanning public pages on your domain. This may take a minute.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-[var(--app-border)] px-4 py-3">
              <p className="text-xs text-[var(--app-text-muted)]">Pages discovered</p>
              <p className="text-2xl font-semibold">{latestCrawl?.pages_discovered ?? 0}</p>
            </div>
            <div className="rounded-lg border border-[var(--app-border)] px-4 py-3">
              <p className="text-xs text-[var(--app-text-muted)]">Pages crawled</p>
              <p className="text-2xl font-semibold">{latestCrawl?.pages_crawled ?? 0}</p>
            </div>
          </div>
          {latestCrawl?.pages_discovered > 0 ? (
            <ScoreBar
              label="Progress"
              value={Math.min(
                100,
                Math.round(
                  ((latestCrawl?.pages_crawled || 0) / Math.max(latestCrawl?.pages_discovered || 1, 1)) * 100,
                ),
              )}
            />
          ) : (
            <p className="app-loading mt-4 text-sm text-[var(--app-text-muted)]">Discovering pages...</p>
          )}
        </section>
      ) : null}

      {latestCrawl?.status === 'failed' ? (
        <Alert variant="error" title="Crawl failed" className="mt-6">
          {latestCrawl.error_message || 'The website could not be crawled. Check the URL and try again.'}
        </Alert>
      ) : null}

      {profile ? (
        <>
          {!missingWeightedScores ? (
            <section className="app-card mt-8 p-6">
              <h2 className="text-sm font-semibold">What this analysis answers</h2>
              <ul className="mt-4 space-y-3">
                {lenses.map(({ question, key, max, detail, id }) => {
                  const value = readWeightedScore(scores, key)
                  const status = lensStatus(value, max)
                  const lensDetail = key === 'ux_ui_score' ? uxUiScoreDetail(scores) : detail
                  const detailBlock = id ? categoryDetails[id] : null
                  return (
                    <li
                      key={key}
                      className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-[var(--app-border)] px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[var(--app-text)]">{question}</p>
                        <p className="mt-0.5 text-xs text-[var(--app-text-muted)]">{lensDetail}</p>
                        {detailBlock?.problems?.[0] ? (
                          <p className="mt-1 text-xs text-[var(--app-danger-icon)]">{detailBlock.problems[0]}</p>
                        ) : null}
                      </div>
                      <div className="text-right text-sm shrink-0">
                        <span
                          className={
                            status.tone === 'success'
                              ? 'font-semibold text-[var(--app-success-icon)]'
                              : status.tone === 'warning'
                                ? 'font-semibold text-[var(--app-warning-icon)]'
                                : status.tone === 'error'
                                  ? 'font-semibold text-[var(--app-danger-icon)]'
                                  : 'text-[var(--app-text-muted)]'
                          }
                        >
                          {status.label}
                        </span>
                        {value != null ? (
                          <p className="text-xs text-[var(--app-text-muted)]">
                            {value}/{max}
                            {detailBlock?.confidence != null ? ` · ${detailBlock.confidence}% confidence` : ''}
                          </p>
                        ) : null}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>
          ) : null}

          {scores.readable_summary ? (
            <section className="app-card mt-6 p-5">
              <h2 className="text-sm font-semibold">Executive summary</h2>
              <p className="mt-3 text-sm leading-relaxed text-[var(--app-text-secondary)]">
                {scores.readable_summary}
              </p>
            </section>
          ) : null}

          <section className="app-card mt-8 p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="app-eyebrow">Overall score</p>
                <p className={`app-stat-value text-5xl ${scoreTone(scores.overall_score)}`}>
                  {scores.overall_score ?? '-'}
                  <span className="text-2xl text-[var(--app-text-muted)]">/100</span>
                </p>
                {v2Report && scores.human_equivalent_score != null ? (
                  <p className="mt-1 text-sm font-medium text-[var(--app-text-secondary)]">
                    Benchmark equivalent: {scores.human_equivalent_score}/20
                  </p>
                ) : null}
                {typeof scores.confidence_score === 'number' ? (
                  <p className="mt-1 text-sm text-[var(--app-text-muted)]">
                    Confidence: {scores.confidence_score}/100
                  </p>
                ) : null}
                <p className="mt-1 text-sm text-[var(--app-text-muted)]">
                  {latestCrawl?.completed_at
                    ? `Last analyzed ${formatScanDate(latestCrawl.completed_at)}`
                    : profile.updated_at
                      ? `Updated ${formatScanDate(profile.updated_at)}`
                      : ''}
                  {scores.scoring_rubric ? (
                    <span className="block mt-1">
                      Business model:{' '}
                      <span className="font-medium">
                        {getBusinessModelLabel(scores.scoring_rubric)}
                      </span>
                    </span>
                  ) : null}
                </p>
              </div>
              <div className="text-sm">
                <p className="text-[var(--app-text-muted)]">Platform</p>
                <p className="font-semibold capitalize">{summary.platform || 'unknown'}</p>
              </div>
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {categories.map(({ label, key, max, id }) => {
                const value = readWeightedScore(scores, key)
                const detail = id ? categoryDetails[id] : null
                if (value === null) {
                  return (
                    <div key={label}>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-[var(--app-text-secondary)]">{label}</span>
                        <span className="font-medium text-[var(--app-warning-icon)]">Missing score data</span>
                      </div>
                    </div>
                  )
                }
                return (
                  <div key={label} className="rounded-lg border border-[var(--app-border)] p-3">
                    <ScoreBar label={label} value={value} max={max} />
                    {detail?.confidence != null ? (
                      <p className="mt-1 text-xs text-[var(--app-text-muted)]">
                        {detail.confidence}% confidence
                      </p>
                    ) : null}
                    {key === 'ux_ui_score' && typeof scores.visual_score_100 === 'number' ? (
                      <p className="mt-1 text-xs text-[var(--app-text-muted)]">
                        Visual {scores.visual_score_100}/100 → category {value}/{max}
                        {scores.ux_model?.advisory_only ? ' (ML advisory only, not blended down)' : ''}
                      </p>
                    ) : null}
                    {key === 'customer_attraction_score' && detail?.point_breakdown?.length ? (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs text-[var(--app-text-muted)]">
                          Why this score ({value}/{max})
                        </summary>
                        <ul className="mt-1 space-y-1 text-xs text-[var(--app-text-secondary)]">
                          {detail.point_breakdown.map((row) => (
                            <li key={row.key}>
                              {row.label}:{' '}
                              {row.type === 'penalty' || row.earned < 0
                                ? `−${Math.abs(row.earned)} penalty`
                                : `${row.earned}/${row.max}`}
                              {row.note ? ` — ${row.note}` : ''}
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : null}
                    {detail?.strengths?.[0] ? (
                      <p className="mt-2 text-xs text-[var(--app-success-icon)]">{detail.strengths[0]}</p>
                    ) : null}
                    {detail?.problems?.[0] ? (
                      <p className="mt-1 text-xs text-[var(--app-danger-icon)]">{detail.problems[0]}</p>
                    ) : null}
                  </div>
                )
              })}
            </div>
            {scores.cap_reasons?.length ? (
              <Alert variant="warning" title="Why your score was capped" className="mt-4">
                <ul className="list-inside list-disc space-y-1 text-sm">
                  {scores.cap_reasons.map((cap) => (
                    <li key={cap.cap}>
                      <span className="font-medium">{CAP_LABELS[cap.cap] || cap.cap}:</span> {cap.reason}
                    </li>
                  ))}
                </ul>
              </Alert>
            ) : null}
            {missingWeightedScores ? (
              <Alert variant="warning" title="Outdated score data" className="mt-4">
                This report uses an older score format. Rescan the website to refresh weighted category
                scores.
              </Alert>
            ) : null}
            {scoreSumMismatch ? (
              <Alert variant="warning" title="Score mismatch" className="mt-4">
                Overall score ({scores.overall_score}) does not equal the weighted category sum ({weightedSum}
                ). Rescan the website if this persists.
              </Alert>
            ) : null}
            {scores.safety_status ? (
              <p className="mt-4 text-xs text-[var(--app-text-muted)]">
                Safety status:{' '}
                <span className="font-medium capitalize">
                  {scores.safety_status === 'verified' ? 'Verified (HTTPS + crawl)' : scores.safety_status}
                </span>
                {scores.score_caps_applied?.length ? (
                  <span className="block mt-1">
                    Score caps applied: {scores.score_caps_applied.join(', ')}
                  </span>
                ) : null}
              </p>
            ) : null}
          </section>

          {scores.mismatch_warnings?.length ? (
            <Alert variant="warning" title="Model mismatch" className="mt-6">
              <ul className="list-inside list-disc space-y-1 text-sm">
                {scores.mismatch_warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </Alert>
          ) : null}

          {scoreExplanations.length ? (
            <section className="app-card mt-6 p-5">
              <h2 className="text-sm font-semibold">Score breakdown</h2>
              <p className="mt-1 text-xs text-[var(--app-text-muted)]">
                Weighted categories only — safety, functionality, UX, business fit, and customer attraction.
              </p>
              <ul className="mt-3 space-y-2 text-sm">
                {scoreExplanations.map((item) => (
                  <li
                    key={`${item.category}-${item.reason}`}
                    className={
                      item.delta > 0
                        ? 'text-[var(--app-success-icon)]'
                        : item.delta < 0
                          ? 'text-[var(--app-danger-icon)]'
                          : 'text-[var(--app-text-secondary)]'
                    }
                  >
                    <span className="text-xs uppercase tracking-wide text-[var(--app-text-muted)]">
                      {String(item.category).replace(/_/g, ' ')}
                    </span>
                    {' — '}
                    {item.delta > 0 ? '+' : ''}
                    {item.delta !== 0 ? `${item.delta} ` : ''}
                    {item.reason}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {priorityFixes.length ? (
            <section className="app-card mt-6 p-5">
              <h2 className="text-sm font-semibold">Fix first — ranked by customer impact</h2>
              <ol className="mt-4 space-y-4">
                {priorityFixes.map((fix) => (
                  <li key={`${fix.rank}-${fix.action}`} className="flex gap-3">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--app-input-bg)] text-xs font-bold">
                      {fix.rank}
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-medium uppercase tracking-wide text-[var(--app-warning-icon)]">
                        {PRIORITY_LABELS[fix.priority] || fix.priority}
                        {fix.category ? (
                          <span className="text-[var(--app-text-muted)]">
                            {' '}
                            · {String(fix.category).replace(/_/g, ' ')}
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-1 text-sm font-medium text-[var(--app-text)]">{fix.action}</p>
                      {fix.reason ? (
                        <p className="mt-1 text-xs text-[var(--app-text-muted)]">{fix.reason}</p>
                      ) : null}
                      {fix.expected_impact || fix.impact ? (
                        <p className="mt-1 text-xs text-[var(--app-text-muted)]">
                          {fix.expected_impact || fix.impact}
                        </p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ol>
            </section>
          ) : null}

          {scores.ux_score_components && Object.keys(scores.ux_score_components).length ? (
            <section className="app-card mt-6 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold">UX / UI visual breakdown</h2>
                  <p className="mt-1 text-xs text-[var(--app-text-muted)]">
                    {scores.visual_audit_status?.ok
                      ? 'Scored from rendered desktop and mobile layout audit.'
                      : 'Scored from HTML/crawler signals — lower confidence without visual audit.'}
                    {typeof scores.ux_confidence === 'number' ? ` Confidence: ${scores.ux_confidence}/100.` : ''}
                    {typeof scores.visual_score_100 === 'number'
                      ? ` Visual score: ${scores.visual_score_100}/100 → UX category ${scores.ux_ui_score ?? '?'}/25.`
                      : ''}
                  </p>
                </div>
                {scores.visual_audit_status ? (
                  <span className="rounded bg-[var(--app-input-bg)] px-2 py-1 text-xs capitalize">
                    Audit: {scores.visual_audit_status.ok ? 'rendered' : scores.visual_audit_status.skipped ? 'skipped' : 'unavailable'}
                  </span>
                ) : null}
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                {Object.entries(scores.ux_score_components).map(([key, value]) => (
                  <ScoreBar
                    key={key}
                    label={UX_COMPONENT_LABELS[key] || key.replace(/_score$/, '').replace(/_/g, ' ')}
                    value={value}
                    max={100}
                  />
                ))}
              </div>
              {scores.ux_features?.visual_strengths?.length ? (
                <div className="mt-4">
                  <p className="text-xs font-semibold text-[var(--app-success-icon)]">Visual strengths</p>
                  <ul className="mt-1 list-inside list-disc text-sm text-[var(--app-text-secondary)]">
                    {scores.ux_features.visual_strengths.slice(0, 5).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {scores.ux_features?.visual_issues?.length ? (
                <div className="mt-4">
                  <p className="text-xs font-semibold text-[var(--app-danger-icon)]">Evidence-backed visual issues</p>
                  <ul className="mt-1 list-inside list-disc text-sm text-[var(--app-text-secondary)]">
                    {scores.ux_features.visual_issues.slice(0, 6).map((item) => (
                      <li key={item.message || item.category}>
                        {item.message}
                        {item.confidence ? ` (confidence ${Math.round(item.confidence * 100)}%)` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {scores.ux_features?.visual_problems?.length ? (
                <div className="mt-4">
                  <p className="text-xs font-semibold text-[var(--app-danger-icon)]">Visual problems</p>
                  <ul className="mt-1 list-inside list-disc text-sm text-[var(--app-text-secondary)]">
                    {scores.ux_features.visual_problems.slice(0, 6).map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {scores.ux_features?.visual_evidence_summary ? (
                <details className="mt-3 rounded-lg border border-[var(--app-border)] px-3 py-2">
                  <summary className="cursor-pointer text-xs font-semibold">Visual evidence summary</summary>
                  <ul className="mt-2 list-inside list-disc text-sm text-[var(--app-text-secondary)]">
                    <li>
                      Misaligned images (high confidence):{' '}
                      {scores.ux_features.visual_evidence_summary.misaligned_image_count || 0}
                    </li>
                    <li>
                      Alignment confidence:{' '}
                      {Math.round((scores.ux_features.visual_evidence_summary.misalignment_confidence || 0) * 100)}%
                    </li>
                    <li>
                      Density confidence:{' '}
                      {Math.round((scores.ux_features.visual_evidence_summary.density_confidence || 0) * 100)}%
                    </li>
                  </ul>
                </details>
              ) : null}
              {scores.ux_features?.score_trace ? (
                <details className="mt-3 rounded-lg border border-[var(--app-border)] px-3 py-2">
                  <summary className="cursor-pointer text-xs font-semibold">Analyzer debug trace</summary>
                  <pre className="mt-2 overflow-x-auto text-xs text-[var(--app-text-secondary)]">
                    {JSON.stringify(scores.ux_features.score_trace, null, 2)}
                  </pre>
                </details>
              ) : null}
              {uxFeatures.hero_heading ? (
                <details className="mt-4 rounded-lg border border-[var(--app-border)] px-3 py-2">
                  <summary className="cursor-pointer text-xs font-semibold">Hero / H1 evidence</summary>
                  <ul className="mt-2 list-inside list-disc text-sm text-[var(--app-text-secondary)]">
                    <li>Hero heading: {uxFeatures.hero_heading.hero_heading_text || 'Not detected'}</li>
                    <li>Source: {uxFeatures.hero_heading.hero_heading_source || 'unknown'}</li>
                    <li>Above fold: {uxFeatures.hero_heading.hero_heading_above_fold ? 'yes' : 'no'}</li>
                    <li>Semantic H1: {uxFeatures.hero_heading.has_h1 ? 'yes' : 'no'}</li>
                  </ul>
                </details>
              ) : null}
              {uxFeatures.readability_factors ? (
                <details className="mt-3 rounded-lg border border-[var(--app-border)] px-3 py-2">
                  <summary className="cursor-pointer text-xs font-semibold">Readability factors</summary>
                  <ul className="mt-2 list-inside list-disc text-sm text-[var(--app-text-secondary)]">
                    <li>Avg paragraph length: {uxFeatures.readability_factors.average_paragraph_length || 0}</li>
                    <li>Max text block: {uxFeatures.readability_factors.max_text_block_length || 0}</li>
                    <li>Sections: {uxFeatures.readability_factors.section_count || 0}</li>
                    <li>Bullets: {uxFeatures.readability_factors.bullet_count || 0}</li>
                  </ul>
                  {uxFeatures.readability_strengths?.length ? (
                    <p className="mt-2 text-xs text-[var(--app-success-icon)]">
                      {uxFeatures.readability_strengths[0]}
                    </p>
                  ) : null}
                  {uxFeatures.readability_problems?.[0] ? (
                    <p className="mt-1 text-xs text-[var(--app-danger-icon)]">{uxFeatures.readability_problems[0]}</p>
                  ) : null}
                </details>
              ) : null}
              {uxFeatures.layout_strengths?.length || uxFeatures.layout_problems?.length ? (
                <details className="mt-3 rounded-lg border border-[var(--app-border)] px-3 py-2">
                  <summary className="cursor-pointer text-xs font-semibold">Layout strengths & problems</summary>
                  {uxFeatures.layout_strengths?.length ? (
                    <ul className="mt-2 list-inside list-disc text-sm text-[var(--app-text-secondary)]">
                      {uxFeatures.layout_strengths.slice(0, 3).map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : null}
                  {uxFeatures.layout_problems?.length ? (
                    <ul className="mt-2 list-inside list-disc text-sm text-[var(--app-danger-icon)]">
                      {uxFeatures.layout_problems.slice(0, 3).map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  ) : null}
                </details>
              ) : null}
            </section>
          ) : null}

          {benchmark?.enabled ? (
            <section className="app-card mt-6 p-5">
              <h2 className="text-sm font-semibold">Benchmark comparison</h2>
              <p className="mt-1 text-xs text-[var(--app-text-muted)]">
                {benchmark.current_benchmark_level || benchmark.target_level}:{' '}
                {benchmark.current_human_equivalent_score ?? benchmark.target_human_score}/20
                {benchmark.comparison_scope === 'same_business_model'
                  ? ` · ${benchmark.compared_count} same-model sites`
                  : benchmark.benchmark_warning
                    ? ' · limited same-model data'
                    : ''}
              </p>
              {(benchmark.target_human_score ?? 0) < 17 ? (
                <p className="mt-2 text-xs text-[var(--app-danger-icon)]">
                  {(benchmark.target_human_score ?? 0)}/20 is below average (17/20) — this is not strong benchmark performance.
                </p>
              ) : null}
              {benchmark.benchmark_warning ? (
                <p className="mt-2 text-xs text-[var(--app-warning-icon)]">{benchmark.benchmark_warning}</p>
              ) : null}
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-lg border border-[var(--app-border)] px-3 py-2 text-sm">
                  <p className="text-xs text-[var(--app-text-muted)]">Gap to average (17/20)</p>
                  <p className="font-semibold">{benchmark.gaps?.gap_to_average ?? '-'} pts</p>
                </div>
                <div className="rounded-lg border border-[var(--app-border)] px-3 py-2 text-sm">
                  <p className="text-xs text-[var(--app-text-muted)]">Gap to strong (18/20)</p>
                  <p className="font-semibold">{benchmark.gaps?.gap_to_strong ?? '-'} pts</p>
                </div>
                <div className="rounded-lg border border-[var(--app-border)] px-3 py-2 text-sm">
                  <p className="text-xs text-[var(--app-text-muted)]">Gap to top (19–20/20)</p>
                  <p className="font-semibold">{benchmark.gaps?.gap_to_top ?? '-'} pts</p>
                </div>
              </div>
              {benchmark.comparison_narrative?.length ? (
                <ul className="mt-4 list-inside list-disc space-y-1 text-sm text-[var(--app-text-secondary)]">
                  {benchmark.comparison_narrative.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              ) : null}
              {benchmark.strong_examples?.length ? (
                <div className="mt-4">
                  <p className="text-xs font-medium text-[var(--app-text-muted)]">Strong examples (18/20)</p>
                  <ul className="mt-1 space-y-1 text-xs text-[var(--app-text-secondary)]">
                    {benchmark.strong_examples.slice(0, 3).map((example) => (
                      <li key={example.url} className="truncate">
                        {example.url} — {example.human_score}/20
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {benchmark.same_model_examples?.length ? (
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs font-medium text-[var(--app-text-muted)]">
                    Same-model examples
                  </summary>
                  <ul className="mt-1 space-y-1 text-xs text-[var(--app-text-secondary)]">
                    {benchmark.same_model_examples.slice(0, 4).map((example) => (
                      <li key={example.url} className="truncate">
                        {example.url} — {example.human_score}/20
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
              {benchmark.top_examples?.length ? (
                <details className="mt-3">
                  <summary className="cursor-pointer text-xs font-medium text-[var(--app-text-muted)]">
                    Top examples (19–20/20)
                  </summary>
                  <ul className="mt-1 space-y-1 text-xs text-[var(--app-text-secondary)]">
                    {benchmark.top_examples.slice(0, 4).map((example) => (
                      <li key={example.url} className="truncate">
                        {example.url} — {example.human_score}/20
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </section>
          ) : null}

          {v2Report && Object.keys(categoryDetails).length ? (
            <section className="app-card mt-6 p-5">
              <h2 className="text-sm font-semibold">Evidence from the crawl</h2>
              <div className="mt-4 space-y-4">
                {Object.entries(categoryDetails).map(([category, detail]) => (
                  <div key={category}>
                    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--app-text-muted)]">
                      {String(category).replace(/_/g, ' ')}
                    </p>
                    <ul className="mt-2 space-y-1 text-sm text-[var(--app-text-secondary)]">
                      {(detail.evidence || []).slice(0, 3).map((item) => (
                        <li key={`${item.signal}-${item.label}`}>
                          <span className="font-medium">{item.label}:</span> {item.detail || item.label}
                        </li>
                      ))}
                      {!detail.evidence?.length ? (
                        <li className="text-[var(--app-text-muted)]">No detailed evidence captured.</li>
                      ) : null}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {[
              ['Strengths', scores.strengths],
              ['Risks', scores.risks],
              ['Next actions', scores.recommended_actions],
            ].map(([title, items]) => (
              <section key={title} className="app-card p-5">
                <h2 className="text-sm font-semibold">{title}</h2>
                <ul className="mt-3 list-inside list-disc space-y-1 text-sm text-[var(--app-text-secondary)]">
                  {(items || []).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                  {!items?.length ? (
                    <li className="text-[var(--app-text-muted)]">No items identified yet.</li>
                  ) : null}
                </ul>
              </section>
            ))}
          </div>

          <section className="app-card mt-6 p-5">
            <h2 className="text-sm font-semibold">Analyzed pages ({pages.length})</h2>
            <ul className="mt-3 divide-y divide-[var(--app-border)] text-sm">
              {pages.map((page) => (
                <li key={page.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-[var(--app-text)]">{page.title || page.url}</p>
                    <p className="truncate text-xs text-[var(--app-text-muted)]">{page.url}</p>
                  </div>
                  <span className="shrink-0 rounded bg-[var(--app-input-bg)] px-2 py-0.5 text-xs">
                    {page.page_type || 'page'}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <div className="mt-8 flex flex-wrap gap-3">
            <button
              type="button"
              className="app-btn app-btn--primary"
              disabled={busy || !business?.store_url}
              onClick={rescan}
            >
              {busy ? 'Rescanning...' : 'Rescan website'}
            </button>
            <Link to="/app/tools/growth-coach" className="app-btn app-btn--secondary">
              Ask AI coach
            </Link>
          </div>
        </>
      ) : null}
    </div>
  )
}

export default WebsiteReport
