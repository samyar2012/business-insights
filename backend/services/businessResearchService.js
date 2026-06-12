const { query } = require('../db')
const { searchWeb } = require('./searchService')
const { scanWebsite } = require('./websiteScanService')
const { scoreBusinessResearch } = require('./scoringService')
const { saveResearchMemory, saveBusinessContextFromOnboarding } = require('./memoryService')

function buildSearchQueries(business) {
  const name = business.business_name || 'business'
  const type = business.business_type || 'ecommerce'
  const product = business.product_sold || 'products'
  const audience = business.target_customers || 'customers'

  return [
    `${name} official website`,
    `${name} ${type}`,
    `${product} ${type} successful brand examples`,
    `${product} ecommerce trends`,
    `${audience} buying behavior ${product}`,
    `${type} marketing strategy ${product}`,
  ].filter(Boolean)
}

function buildSearchSummary(queryRuns) {
  const allResults = []
  const sources = []

  for (const run of queryRuns) {
    for (const item of run.results || []) {
      allResults.push({ ...item, query: run.query })
      if (item.url) sources.push({ title: item.title, url: item.url, query: run.query })
    }
  }

  const snippets = allResults.map((r) => r.snippet).join(' ')
  const extracted = {
    trend_signals: /trend|growing|demand/i.test(snippets),
    competitor_signals: /competitor|brand|market leader/i.test(snippets),
    success_examples: /successful|example|case study|top/i.test(snippets),
    audience_signals: /customer|buyer|audience/i.test(snippets),
  }

  return {
    queries: queryRuns.map((r) => r.query),
    providers: [...new Set(queryRuns.map((r) => r.provider))],
    total_results: allResults.length,
    all_results: allResults,
    sources: sources.slice(0, 20),
    extracted,
    query_runs: queryRuns,
  }
}

function buildExtractedSignals(business, websiteScan, searchSummary) {
  const ws = websiteScan?.summary || {}
  return {
    business_name: business.business_name,
    business_type: business.business_type,
    product_sold: business.product_sold,
    target_customers: business.target_customers,
    store_url: business.store_url,
    website: {
      https: ws.https ?? null,
      title: ws.title ?? null,
      h1: ws.h1 ?? null,
      social_links: ws.social_links || [],
      policy_pages: ws.policy_pages || {},
      product_keywords: ws.product_keywords || [],
      trust_keywords: ws.trust_keywords || [],
    },
    search: searchSummary.extracted || {},
    market_result_count: searchSummary.total_results || 0,
  }
}

function formatProfile(row) {
  if (!row) return null
  return {
    id: row.id,
    user_id: row.user_id,
    business_id: row.business_id,
    search_summary: row.search_summary_json,
    website_scan: row.website_scan_json,
    extracted_signals: row.extracted_signals_json,
    scores: row.score_json,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

async function getLatestResearchProfile(userId, businessId) {
  const result = await query(
    `SELECT * FROM business_research_profiles
     WHERE user_id = $1 AND business_id = $2
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId, businessId],
  )
  return formatProfile(result.rows[0])
}

async function saveWebsiteScanEvent(userId, businessId, scan) {
  await query(
    `INSERT INTO website_scan_events (user_id, business_id, url, status, result_json)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      userId,
      businessId,
      scan.url || businessId,
      scan.status || 'unknown',
      JSON.stringify(scan),
    ],
  )
}

async function researchBusiness({ userId, business }) {
  await saveBusinessContextFromOnboarding(userId, business)

  const queries = buildSearchQueries(business)
  const queryRuns = []

  for (const q of queries) {
    const run = await searchWeb(q, {
      userId,
      businessId: business.id,
      limit: 4,
    })
    queryRuns.push({
      query: q,
      provider: run.provider,
      cached: run.cached,
      limit_reached: run.limit_reached,
      results: run.results || [],
    })
  }

  const searchSummary = buildSearchSummary(queryRuns)

  let websiteScan = { status: 'skipped', url: null, summary: {}, pages: [] }
  if (business.store_url) {
    websiteScan = await scanWebsite(business.store_url)
    await saveWebsiteScanEvent(userId, business.id, websiteScan)
  }

  const extractedSignals = buildExtractedSignals(business, websiteScan, searchSummary)
  const scores = scoreBusinessResearch({ business, websiteScan, searchSummary })

  const insert = await query(
    `INSERT INTO business_research_profiles (
       user_id, business_id, search_summary_json, website_scan_json,
       extracted_signals_json, score_json, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, now())
     RETURNING *`,
    [
      userId,
      business.id,
      JSON.stringify(searchSummary),
      JSON.stringify(websiteScan),
      JSON.stringify(extractedSignals),
      JSON.stringify(scores),
    ],
  )

  const profile = formatProfile(insert.rows[0])
  await saveResearchMemory(userId, business.id, profile)

  return profile
}

module.exports = {
  researchBusiness,
  getLatestResearchProfile,
  buildSearchQueries,
}
