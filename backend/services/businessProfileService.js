const { query } = require('../db')
const {
  aggregatePages,
  inferBusinessType,
  buildValueProposition,
  calculateScores,
  buildStrengths,
  buildRisks,
  buildRecommendedActions,
} = require('./businessProfileLogic')

async function buildBusinessWebProfile({ userId, businessId, business, crawlRunId, pages, startUrl }) {
  const aggregated = aggregatePages(pages)

  const summary = {
    business_name: business?.business_name || pages[0]?.title || null,
    business_type: inferBusinessType(business, aggregated),
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

  const scores = calculateScores(aggregated, business, pages)
  const signals = {
    ...aggregated,
    source: 'website_crawl',
    crawl_run_id: crawlRunId,
    obtained_at: new Date().toISOString(),
  }

  const profilePayload = {
    ...scores,
    strengths: buildStrengths(aggregated, scores),
    risks: buildRisks(aggregated, pages),
    recommended_actions: buildRecommendedActions(aggregated, scores),
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
    summary: row.summary_json,
    signals: row.signals_json,
    scores: row.scores_json,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

async function getBusinessWebProfile(userId, businessId) {
  const result = await query(
    `SELECT * FROM business_web_profiles WHERE user_id = $1 AND business_id = $2
     ORDER BY updated_at DESC LIMIT 1`,
    [userId, businessId],
  )
  return formatWebProfile(result.rows[0])
}

module.exports = {
  buildBusinessWebProfile,
  getBusinessWebProfile,
}
