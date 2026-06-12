function clamp(value) {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function scoreStore(websiteScan, business) {
  let score = 40
  const s = websiteScan?.summary || {}

  if (websiteScan?.status === 'ok') score += 15
  if (s.https) score += 15
  if (s.title && s.title.length > 3) score += 10
  if (s.meta_description && s.meta_description.length > 20) score += 10
  if (s.h1) score += 10
  if ((s.product_keywords || []).length >= 2) score += 10
  if ((s.social_links || []).length > 0) score += 10
  if (!business?.store_url) score -= 15

  return clamp(score)
}

function scoreTrust(websiteScan) {
  let score = 35
  const s = websiteScan?.summary || {}

  if (s.has_contact_page) score += 12
  if (s.has_about_page) score += 10
  if (s.has_shipping_policy) score += 12
  if (s.has_return_policy) score += 12
  if (s.has_privacy_policy) score += 10
  if ((s.trust_keywords || []).length >= 2) score += 9

  return clamp(score)
}

function scoreContent(websiteScan) {
  let score = 40
  const s = websiteScan?.summary || {}

  if ((s.social_links || []).length > 0) score += 15
  if ((s.blog_links || []).length > 0) score += 15
  if ((s.product_keywords || []).length >= 3) score += 10
  if ((s.text_length || 0) > 800) score += 10
  if ((s.text_length || 0) > 2000) score += 10

  return clamp(score)
}

function scoreOffer(websiteScan, business) {
  let score = 45
  const s = websiteScan?.summary || {}

  if (business?.product_sold) score += 15
  if (business?.target_customers) score += 15
  if (s.h1) score += 10
  if ((s.cta_keywords || []).length >= 2) score += 15
  if (s.meta_description && /value|best|premium|free|save/i.test(s.meta_description)) score += 10

  return clamp(score)
}

function scoreMarket(searchSummary) {
  let score = 40
  const results = searchSummary?.all_results || []
  const queries = searchSummary?.queries || []

  if (results.length >= 3) score += 15
  if (results.length >= 8) score += 10

  const blob = results.map((r) => `${r.title} ${r.snippet}`).join(' ').toLowerCase()
  if (/trend|growing|demand|market/i.test(blob)) score += 10
  if (/competitor|brand|successful|leader/i.test(blob)) score += 10
  if (/example|case study|top/i.test(blob)) score += 10
  if (queries.length >= 4) score += 5

  return clamp(score)
}

function buildStrengths(scores, websiteScan, business, searchSummary) {
  const strengths = []
  const s = websiteScan?.summary || {}

  if (s.https) strengths.push('Store uses HTTPS for secure browsing.')
  if (s.h1) strengths.push(`Clear homepage headline: "${s.h1}".`)
  if ((s.social_links || []).length) strengths.push('Social profiles linked from the website.')
  if (s.has_shipping_policy && s.has_return_policy) {
    strengths.push('Shipping and return policy pages are discoverable.')
  }
  if (business?.product_sold) strengths.push(`Clear product focus: ${business.product_sold}.`)
  if (business?.target_customers) strengths.push(`Defined audience: ${business.target_customers}.`)
  if ((searchSummary?.all_results || []).length >= 5) {
    strengths.push('Market research returned useful public signals.')
  }
  if (scores.store_score >= 75) strengths.push('Store presentation score is strong.')

  return [...new Set(strengths)].slice(0, 6)
}

function buildRisks(scores, websiteScan, business) {
  const risks = []
  const s = websiteScan?.summary || {}

  if (!business?.store_url) risks.push('No store URL provided - website could not be scanned.')
  if (websiteScan?.status === 'fetch_failed') risks.push('Homepage could not be fetched for analysis.')
  if (!s.https && business?.store_url) risks.push('Site may not be served over HTTPS.')
  if (!s.meta_description) risks.push('Missing or weak meta description for SEO and clarity.')
  if (!s.h1) risks.push('No clear H1 headline detected on the homepage.')
  if (!s.has_return_policy) risks.push('Return policy page not detected.')
  if (!s.has_shipping_policy) risks.push('Shipping policy page not detected.')
  if ((s.social_links || []).length === 0) risks.push('No social profile links found on the site.')
  if (scores.trust_score < 55) risks.push('Trust signals need improvement before scaling traffic.')
  if (scores.market_score < 55) risks.push('Limited market/competitor signals from search research.')

  return [...new Set(risks)].slice(0, 6)
}

function buildNextActions(scores, websiteScan, business) {
  const actions = []
  const s = websiteScan?.summary || {}

  if (!business?.store_url) actions.push('Add your live store URL and rerun research.')
  if (!s.h1) actions.push('Add a clear H1 that states your main product and who it is for.')
  if (!s.has_shipping_policy) actions.push('Publish a shipping policy page and link it in the footer.')
  if (!s.has_return_policy) actions.push('Publish a return policy to reduce purchase hesitation.')
  if ((s.social_links || []).length === 0) actions.push('Link Instagram or TikTok from your homepage.')
  if (scores.offer_score < 65) actions.push('Sharpen your hero offer with a direct CTA above the fold.')
  if (scores.content_score < 65) actions.push('Add product education content or a simple blog/resources section.')
  if (scores.market_score < 65) actions.push('Review competitor search results and differentiate your offer.')

  return [...new Set(actions)].slice(0, 6)
}

function scoreBusinessResearch({ business, websiteScan, searchSummary }) {
  const store_score = scoreStore(websiteScan, business)
  const trust_score = scoreTrust(websiteScan)
  const content_score = scoreContent(websiteScan)
  const offer_score = scoreOffer(websiteScan, business)
  const market_score = scoreMarket(searchSummary)

  const overall_score = clamp(
    store_score * 0.22 +
      trust_score * 0.22 +
      content_score * 0.18 +
      offer_score * 0.18 +
      market_score * 0.2,
  )

  const strengths = buildStrengths(
    { store_score, trust_score, content_score, offer_score, market_score, overall_score },
    websiteScan,
    business,
    searchSummary,
  )
  const risks = buildRisks(
    { store_score, trust_score, content_score, offer_score, market_score, overall_score },
    websiteScan,
    business,
  )
  const next_actions = buildNextActions(
    { store_score, trust_score, content_score, offer_score, market_score, overall_score },
    websiteScan,
    business,
  )

  return {
    overall_score,
    store_score,
    trust_score,
    content_score,
    offer_score,
    market_score,
    strengths,
    risks,
    next_actions,
  }
}

module.exports = { scoreBusinessResearch }
