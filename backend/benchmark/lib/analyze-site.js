const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') })
process.chdir(path.resolve(__dirname, '../..'))

const { aggregatePages } = require('../../services/businessProfileLogic')
const { buildProfileScoresPayload } = require('../../services/businessProfileLogic')
const { checkUrlSafety } = require('../../services/safeBrowsingService')
const { runVisualAudit } = require('../../services/visualAuditService')
const { extractUxFeatures } = require('../../services/uxFeatureExtractor')
const { detectOperationalSignals } = require('../../services/businessScoringRubrics')
const { resolveScoringRubric } = require('../../services/businessModelConfig')
const { crawlWebsiteLite } = require('./crawl-lite')

async function analyzeFixtureSite(fixture, options = {}) {
  const startedAt = Date.now()
  const maxPages = options.maxPages ?? 8
  const visualAuditEnabled = options.visualAudit !== false

  const business = {
    store_url: fixture.url,
    business_model: fixture.business_model,
    business_name: fixture.id,
  }

  let crawl = null
  let crawlError = null
  try {
    crawl = await crawlWebsiteLite(fixture.url, { maxPages, maxDepth: 2 })
    if (!crawl?.pages?.length) {
      crawl = await crawlWebsiteLite(fixture.url, { maxPages, maxDepth: 2 })
    }
  } catch (err) {
    crawlError = err.message || String(err)
    try {
      crawl = await crawlWebsiteLite(fixture.url, { maxPages, maxDepth: 2 })
    } catch (retryErr) {
      crawlError = retryErr.message || String(retryErr)
    }
  }

  const crawlMs = Date.now() - startedAt
  const analyzeStarted = Date.now()

  if (!crawl?.pages?.length) {
    return {
      fixture,
      status: 'crawl_failed',
      error: crawlError || 'No pages crawled',
      crawl_ms: crawlMs,
      analyze_ms: 0,
      total_ms: Date.now() - startedAt,
    }
  }

  const aggregated = aggregatePages(crawl.pages)
  const safetyResult = await checkUrlSafety(crawl.startUrl)

  let visualAudit = null
  if (visualAuditEnabled && String(process.env.VISUAL_AUDIT_ENABLED || '').toLowerCase() === 'true') {
    try {
      visualAudit = await runVisualAudit(crawl.startUrl)
    } catch (err) {
      visualAudit = { ok: false, enabled: true, error: err.message || String(err) }
    }
  } else {
    visualAudit = { ok: false, enabled: false, skipped: true, reason: 'disabled_for_benchmark' }
  }

  const rubric = resolveScoringRubric(business, aggregated)
  const signals = detectOperationalSignals(crawl.pages, aggregated)
  const uxFeatures = extractUxFeatures({
    visualAudit,
    pages: crawl.pages,
    aggregated,
    businessModel: rubric,
    signals,
  })

  const scores = buildProfileScoresPayload(aggregated, business, crawl.pages, {
    crawlMeta: {
      homepage_fetch_ok: crawl.homepage_fetch_ok,
      pages_discovered: crawl.pages_discovered,
      pages_crawled: crawl.pages_crawled,
    },
    safetyResult,
    visualAudit,
    uxFeatures,
  })

  const analyzeMs = Date.now() - analyzeStarted

  return {
    fixture,
    status: 'ok',
    error: null,
    crawl,
    aggregated,
    scores,
    safetyResult,
    visualAudit,
    rubric,
    crawl_ms: crawlMs,
    analyze_ms: analyzeMs,
    total_ms: Date.now() - startedAt,
  }
}

module.exports = {
  analyzeFixtureSite,
}
