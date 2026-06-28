import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiFetch } from '../lib/api'
import Alert from '../components/app/Alert'
import ScoreBar, { formatScanDate, scoreTone } from '../components/app/ScanUi'

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

  return (
    <div className="mx-auto max-w-4xl">
      <Link to="/app" className="app-link text-sm font-medium">&lt;- Dashboard</Link>

      <header className="mt-4">
        <p className="app-eyebrow">Website analysis</p>
        <h1 className="app-page-title mt-2">{business?.business_name || 'Website report'}</h1>
        <p className="app-page-subtitle">
          {business?.store_url ? (
            <span className="break-all">{business.store_url}</span>
          ) : (
            'Add a store URL to analyze your website.'
          )}
        </p>
      </header>

      {error ? (
        <Alert variant="error" title="Error" className="mt-6">{error}</Alert>
      ) : null}

      {!profile && !isRunning ? (
        <div className="app-card mt-8 p-6 text-center">
          <p className="text-sm text-[var(--app-text-secondary)]">
            Analyze your public website pages to build a structured business profile — no search API required.
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
          <section className="app-card mt-8 p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="app-eyebrow">Overall score</p>
                <p className={`app-stat-value text-5xl ${scoreTone(scores.overall_score)}`}>
                  {scores.overall_score ?? '-'}
                </p>
                <p className="mt-1 text-sm text-[var(--app-text-muted)]">
                  {latestCrawl?.completed_at
                    ? `Last analyzed ${formatScanDate(latestCrawl.completed_at)}`
                    : profile.updated_at
                      ? `Updated ${formatScanDate(profile.updated_at)}`
                      : ''}
                  {scores.scoring_rubric ? (
                    <span className="block mt-1">
                      Scoring rubric:{' '}
                      <span className="font-medium capitalize">
                        {String(scores.scoring_rubric).replace(/_/g, ' ')}
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
              {[
                ['Store', scores.store_score],
                ['Trust', scores.trust_score],
                ['Offer', scores.offer_score],
                ['Content', scores.content_score],
                ['Technical', scores.technical_score],
              ].map(([label, value]) => (
                <ScoreBar key={label} label={label} value={value ?? 0} />
              ))}
            </div>
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

          {scores.score_explanation?.length ? (
            <section className="app-card mt-6 p-5">
              <h2 className="text-sm font-semibold">Score breakdown</h2>
              <ul className="mt-3 space-y-2 text-sm">
                {scores.score_explanation.map((item) => (
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
                    {item.delta > 0 ? '+' : ''}
                    {item.delta !== 0 ? `${item.delta} ` : ''}
                    {item.reason}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="app-card mt-6 p-5">
            <h2 className="text-sm font-semibold">Products &amp; services</h2>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs text-[var(--app-text-muted)]">Products</p>
                <ul className="mt-1 list-inside list-disc text-sm text-[var(--app-text-secondary)]">
                  {(summary.products || []).slice(0, 8).map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                  {!summary.products?.length ? <li>-</li> : null}
                </ul>
              </div>
              <div>
                <p className="text-xs text-[var(--app-text-muted)]">Services</p>
                <ul className="mt-1 list-inside list-disc text-sm text-[var(--app-text-secondary)]">
                  {(summary.services || []).slice(0, 8).map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                  {!summary.services?.length ? <li>-</li> : null}
                </ul>
              </div>
            </div>
          </section>

          <section className="app-card mt-6 p-5">
            <h2 className="text-sm font-semibold">Social &amp; contact</h2>
            <ul className="mt-3 space-y-1 text-sm text-[var(--app-text-secondary)]">
              {(summary.social_channels || []).map((url) => (
                <li key={url}>
                  <a href={url} target="_blank" rel="noreferrer" className="app-link break-all">
                    {url}
                  </a>
                </li>
              ))}
              {!summary.social_channels?.length ? <li>No social links detected</li> : null}
              {(summary.contact_signals?.emails || []).map((email) => (
                <li key={email}>{email}</li>
              ))}
            </ul>
          </section>

          <section className="app-card mt-6 p-5">
            <h2 className="text-sm font-semibold">Policies detected</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {Object.entries(summary.policy_signals || {}).map(([key, found]) => (
                <span
                  key={key}
                  className={`rounded-full px-3 py-1 text-xs font-medium ${
                    found
                      ? 'bg-[var(--app-success-bg)] text-[var(--app-success-icon)]'
                      : 'bg-[var(--app-input-bg)] text-[var(--app-text-muted)]'
                  }`}
                >
                  {key}
                </span>
              ))}
            </div>
          </section>

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
                  {!items?.length ? <li>-</li> : null}
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
