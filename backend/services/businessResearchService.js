const { searchWeb, DAILY_SEARCH_LIMIT } = require('./searchService')
const { getBusinessWebProfile } = require('./businessProfileService')
const { saveResearchMemory, saveBusinessContextFromOnboarding } = require('./memoryService')

function buildExternalSearchQueries(business) {
  const name = business.business_name || 'business'
  const type = business.business_type || 'ecommerce'
  const product = business.product_sold || 'products'
  const audience = business.target_customers || 'customers'

  return [
    `${name} competitors ${type}`,
    `${product} customer reviews`,
    `${product} ${type} trends`,
    `${audience} buying behavior ${product}`,
    `successful ${type} brands ${product}`,
    `${name} brand mentions`,
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
    review_signals: /review|rating|testimonial/i.test(snippets),
    mention_signals: /mention|press|featured/i.test(snippets),
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

function buildExtractedSignals(business, webProfile, searchSummary) {
  const summary = webProfile?.summary || {}
  const signals = webProfile?.signals || {}
  return {
    business_name: business.business_name,
    business_type: business.business_type || summary.business_type,
    product_sold: business.product_sold,
    target_customers: business.target_customers,
    store_url: business.store_url,
    website: {
      platform: summary.platform || signals.platform,
      products: summary.products || [],
      services: summary.services || [],
      social_channels: summary.social_channels || [],
      policy_signals: summary.policy_signals || {},
      trust_signals: summary.trust_signals || {},
      pages_analyzed: summary.pages_analyzed || 0,
      source: 'website_crawl',
    },
    search: searchSummary.extracted || {},
    market_result_count: searchSummary.total_results || 0,
  }
}

function mergeScores(webScores, searchSummary) {
  const ws = webScores || {}
  let market_score = 40
  const results = searchSummary?.all_results || []
  if (results.length >= 3) market_score += 15
  if (results.length >= 8) market_score += 10
  const blob = results.map((r) => `${r.title} ${r.snippet}`).join(' ').toLowerCase()
  if (/trend|growing|demand|market/i.test(blob)) market_score += 10
  if (/competitor|brand|successful|leader/i.test(blob)) market_score += 10
  if (/example|case study|top/i.test(blob)) market_score += 10
  market_score = Math.max(0, Math.min(100, Math.round(market_score)))

  const overall_score = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        (ws.overall_score || 50) * 0.8 +
          market_score * 0.2,
      ),
    ),
  )

  return {
    ...ws,
    market_score,
    overall_score,
    strengths: ws.strengths || [],
    risks: ws.risks || [],
    next_actions: ws.recommended_actions || ws.next_actions || [],
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
    web_profile: row.web_profile_json,
    extracted_signals: row.extracted_signals_json,
    scores: row.score_json,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

async function getLatestResearchProfile(userId, businessId) {
  const { query } = require('../db')
  const result = await query(
    `SELECT * FROM business_research_profiles
     WHERE user_id = $1 AND business_id = $2
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId, businessId],
  )
  return formatProfile(result.rows[0])
}

async function runExternalResearch({ userId, business, includeSearch = true }) {
  await saveBusinessContextFromOnboarding(userId, business)

  let searchSummary = {
    queries: [],
    providers: [],
    total_results: 0,
    all_results: [],
    sources: [],
    extracted: {},
    query_runs: [],
    skipped: true,
  }

  if (includeSearch) {
    const queries = buildExternalSearchQueries(business)
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
    searchSummary = buildSearchSummary(queryRuns)
  }

  const webProfile = await getBusinessWebProfile(userId, business.id)
  const websiteScan = webProfile
    ? {
        status: 'ok',
        url: business.store_url,
        source: 'website_crawl',
        summary: webProfile.summary,
        scores: webProfile.scores,
        pages_analyzed: webProfile.summary?.pages_analyzed || 0,
      }
    : { status: 'not_crawled', url: business.store_url, summary: {}, pages: [] }

  const extractedSignals = buildExtractedSignals(business, webProfile, searchSummary)
  const scores = mergeScores(webProfile?.scores, searchSummary)

  const { query } = require('../db')
  const insert = await query(
    `INSERT INTO business_research_profiles (
       user_id, business_id, search_summary_json, website_scan_json,
       web_profile_json, extracted_signals_json, score_json, updated_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, now())
     RETURNING *`,
    [
      userId,
      business.id,
      JSON.stringify(searchSummary),
      JSON.stringify(websiteScan),
      JSON.stringify(webProfile),
      JSON.stringify(extractedSignals),
      JSON.stringify(scores),
    ],
  )

  const profile = formatProfile(insert.rows[0])
  await saveResearchMemory(userId, business.id, profile)
  return profile
}

async function researchBusiness({ userId, business }) {
  return runExternalResearch({ userId, business, includeSearch: true })
}

module.exports = {
  researchBusiness,
  runExternalResearch,
  getLatestResearchProfile,
  buildExternalSearchQueries,
}
