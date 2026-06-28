const { query } = require('../db')
const { checkUrlSafety } = require('./safeBrowsingService')
const { needsWeightedScoreRehydration } = require('./businessScoringRubrics')
const {
  aggregatePages,
  inferBusinessType,
  buildValueProposition,
  buildProfileScoresPayload,
} = require('./businessProfileLogic')

function parseJsonField(value, fallback = null) {
  if (value == null) return fallback
  if (typeof value === 'object') return value
  try {
    return JSON.parse(value)
  } catch {
    return fallback
  }
}

function inferCrawlMetaFromPages(pages, crawlRun = {}) {
  const homepage =
    pages.find((page) => page.page_type === 'homepage') ||
    pages.find((page) => /\/$/.test(String(page.url || page.final_url || ''))) ||
    pages[0] ||
    null

  const homepageOk = Boolean(
    homepage && (homepage.status_code === undefined || homepage.status_code < 400),
  )

  return {
    homepage_fetch_ok: homepageOk,
    pages_discovered: crawlRun.pages_discovered ?? pages.length,
    pages_crawled: crawlRun.pages_crawled ?? pages.length,
  }
}

async function persistProfileScores(profileId, profilePayload) {
  const updated = await query(
    `UPDATE business_web_profiles
     SET scores_json = $1, updated_at = now()
     WHERE id = $2
     RETURNING *`,
    [JSON.stringify(profilePayload), profileId],
  )
  return updated.rows[0] || null
}

async function rehydrateWebProfileScores({
  profile,
  business,
  pages,
  crawlRun = {},
  startUrl,
  safetyResult = null,
}) {
  if (!profile || !needsWeightedScoreRehydration(profile.scores) || !pages?.length) {
    return profile
  }

  const aggregated = aggregatePages(pages)
  const resolvedStartUrl =
    startUrl || crawlRun.start_url || business?.store_url || profile.summary?.start_url || null
  const resolvedSafety =
    safetyResult || (resolvedStartUrl ? await checkUrlSafety(resolvedStartUrl) : null)
  const profilePayload = buildProfileScoresPayload(aggregated, business, pages, {
    crawlMeta: inferCrawlMetaFromPages(pages, crawlRun),
    safetyResult: resolvedSafety,
  })

  const row = await persistProfileScores(profile.id, profilePayload)
  return row ? formatWebProfile(row) : { ...profile, scores: profilePayload }
}

async function buildBusinessWebProfile({
  userId,
  businessId,
  business,
  crawlRunId,
  pages,
  startUrl,
  crawlMeta = {},
  safetyResult = null,
}) {
  const aggregated = aggregatePages(pages)
  const resolvedSafety =
    safetyResult || (startUrl ? await checkUrlSafety(startUrl) : null)
  const profilePayload = buildProfileScoresPayload(aggregated, business, pages, {
    crawlMeta,
    safetyResult: resolvedSafety,
  })

  const summary = {
    business_name: business?.business_name || pages[0]?.title || null,
    business_type: inferBusinessType(business, aggregated),
    business_model: business?.business_model || null,
    scoring_rubric: profilePayload.scoring_rubric || null,
    products: aggregated.product_names || aggregated.products.map((p) => p.name || p),
    services: aggregated.services,
    site_classification: aggregated.site_classification,
    target_audience: business?.target_customers || null,
    value_proposition: buildValueProposition(pages, business),
    pricing_signals: aggregated.pricing_signals,
    social_channels: aggregated.social_channels,
    contact_signals: aggregated.contact_signals,
    trust_signals: aggregated.trust_signals,
    policy_signals: aggregated.policy_signals,
    content_signals: aggregated.content_signals,
    platform: aggregated.platform,
    start_url: startUrl,
    pages_analyzed: pages.length,
  }

  const signals = {
    ...aggregated,
    source: 'website_crawl',
    crawl_run_id: crawlRunId,
    obtained_at: new Date().toISOString(),
  }

  const existing = await query(
    `SELECT id FROM business_web_profiles WHERE business_id = $1 LIMIT 1`,
    [businessId],
  )

  let row
  if (existing.rows[0]) {
    const updated = await query(
      `UPDATE business_web_profiles
       SET crawl_run_id = $1, summary_json = $2, signals_json = $3, scores_json = $4, updated_at = now()
       WHERE business_id = $5
       RETURNING *`,
      [crawlRunId, JSON.stringify(summary), JSON.stringify(signals), JSON.stringify(profilePayload), businessId],
    )
    row = updated.rows[0]
  } else {
    const inserted = await query(
      `INSERT INTO business_web_profiles (
         user_id, business_id, crawl_run_id, summary_json, signals_json, scores_json
       ) VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING *`,
      [userId, businessId, crawlRunId, JSON.stringify(summary), JSON.stringify(signals), JSON.stringify(profilePayload)],
    )
    row = inserted.rows[0]
  }

  return formatWebProfile(row)
}

function formatWebProfile(row) {
  if (!row) return null
  return {
    id: row.id,
    user_id: row.user_id,
    business_id: row.business_id,
    crawl_run_id: row.crawl_run_id,
    summary: parseJsonField(row.summary_json, {}),
    signals: parseJsonField(row.signals_json, {}),
    scores: parseJsonField(row.scores_json, {}),
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

async function getBusinessWebProfile(userId, businessId, options = {}) {
  const result = await query(
    `SELECT * FROM business_web_profiles WHERE user_id = $1 AND business_id = $2
     ORDER BY updated_at DESC LIMIT 1`,
    [userId, businessId],
  )
  let profile = formatWebProfile(result.rows[0])
  if (
    profile &&
    options.rehydrateScores &&
    needsWeightedScoreRehydration(profile.scores) &&
    options.pages?.length
  ) {
    profile = await rehydrateWebProfileScores({
      profile,
      business: options.business,
      pages: options.pages,
      crawlRun: options.crawlRun,
      startUrl: options.startUrl,
      safetyResult: options.safetyResult,
    })
  }
  return profile
}

module.exports = {
  buildBusinessWebProfile,
  getBusinessWebProfile,
  formatWebProfile,
  rehydrateWebProfileScores,
  parseJsonField,
}
