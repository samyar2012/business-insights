function clamp(value) {
  return Math.max(0, Math.min(100, Math.round(value)))
}

function aggregatePages(pages) {
  const products = new Set()
  const services = new Set()
  const social = new Set()
  const emails = new Set()
  const prices = new Set()
  const ctas = new Set()
  const navLabels = new Set()
  const policies = { shipping: false, returns: false, privacy: false, terms: false }
  let platform = 'unknown'
  let reviewIndicators = false
  let newsletterIndicators = false
  let totalText = 0
  let https = false

  for (const page of pages) {
    let data = page.extracted_data_json || {}
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data)
      } catch {
        data = {}
      }
    }

    ;(data.products || []).forEach((p) => products.add(p))
    if (page.page_type === 'services') services.add(page.title)
    ;(data.social_links || []).forEach((s) => social.add(s))
    ;(data.emails || []).forEach((e) => emails.add(e))
    ;(data.prices || []).forEach((p) => prices.add(p))
    ;(data.ctas || []).forEach((c) => ctas.add(c))
    ;(data.navigation_labels || []).forEach((n) => navLabels.add(n))

    if (data.policies) {
      Object.keys(policies).forEach((k) => {
        if (data.policies[k]) policies[k] = true
      })
    }
    if (data.platform && data.platform !== 'unknown') platform = data.platform
    if (data.review_indicators) reviewIndicators = true
    if (data.newsletter_indicators) newsletterIndicators = true
    totalText += (page.extracted_text || '').length
    if ((page.final_url || page.url || '').startsWith('https://')) https = true
  }

  return {
    products: [...products].slice(0, 30),
    services: [...services].slice(0, 15),
    social_channels: [...social],
    contact_signals: { emails: [...emails], phones: [] },
    pricing_signals: [...prices].slice(0, 20),
    policy_signals: policies,
    trust_signals: {
      review_indicators: reviewIndicators,
      https,
      policy_count: Object.values(policies).filter(Boolean).length,
    },
    content_signals: {
      total_text_length: totalText,
      page_count: pages.length,
      navigation_labels: [...navLabels].slice(0, 20),
      ctas: [...ctas].slice(0, 15),
      newsletter_indicators: newsletterIndicators,
    },
    platform,
  }
}

function inferBusinessType(business, aggregated) {
  if (business?.business_type) return business.business_type
  if (aggregated.products.length > 0) return 'ecommerce'
  if (aggregated.services.length > 0) return 'services'
  return 'unknown'
}

function buildValueProposition(pages, business) {
  const home = pages.find((p) => p.page_type === 'homepage') || pages[0]
  if (home?.meta_description) return home.meta_description
  if (home?.title) return home.title
  return business?.product_sold || null
}

function calculateScores(aggregated, business, pages) {
  let store_score = 40
  let trust_score = 35
  let offer_score = 45
  let content_score = 40
  let technical_score = 40

  if (pages.length >= 3) store_score += 10
  if (aggregated.trust_signals.https) technical_score += 20
  if (aggregated.platform !== 'unknown') technical_score += 15
  if (aggregated.social_channels.length > 0) store_score += 10
  if (aggregated.products.length >= 3) offer_score += 15
  if (aggregated.content_signals.ctas.length >= 2) offer_score += 10
  if (aggregated.policy_signals.shipping) trust_score += 12
  if (aggregated.policy_signals.returns) trust_score += 12
  if (aggregated.policy_signals.privacy) trust_score += 10
  if (aggregated.trust_signals.review_indicators) trust_score += 10
  if (aggregated.content_signals.total_text_length > 1500) content_score += 20
  if (aggregated.content_signals.page_count >= 5) content_score += 15
  if (business?.store_url) store_score += 10
  if (!business?.store_url) store_score -= 15

  const overall_score = clamp(
    store_score * 0.22 +
      trust_score * 0.22 +
      offer_score * 0.18 +
      content_score * 0.18 +
      technical_score * 0.2,
  )

  return {
    overall_score,
    store_score: clamp(store_score),
    trust_score: clamp(trust_score),
    offer_score: clamp(offer_score),
    content_score: clamp(content_score),
    technical_score: clamp(technical_score),
  }
}

function buildStrengths(aggregated, scores) {
  const strengths = []
  if (aggregated.trust_signals.https) strengths.push('Website is served over HTTPS.')
  if (aggregated.platform !== 'unknown') {
    strengths.push(`Detected platform: ${aggregated.platform}.`)
  }
  if (aggregated.social_channels.length) strengths.push('Social profiles are linked from the site.')
  if (aggregated.policy_signals.shipping && aggregated.policy_signals.returns) {
    strengths.push('Shipping and return policies are discoverable.')
  }
  if (aggregated.products.length >= 3) strengths.push('Multiple products or offers detected on site.')
  if (scores.overall_score >= 75) strengths.push('Overall website presentation score is strong.')
  return [...new Set(strengths)].slice(0, 6)
}

function buildRisks(aggregated, pages) {
  const risks = []
  if (pages.length === 0) risks.push('No pages could be crawled from the submitted URL.')
  if (!aggregated.trust_signals.https) risks.push('Site may not use HTTPS consistently.')
  if (!aggregated.policy_signals.returns) risks.push('Return policy page not detected.')
  if (!aggregated.policy_signals.shipping) risks.push('Shipping policy page not detected.')
  if (!aggregated.trust_signals.review_indicators) risks.push('No review or testimonial signals detected.')
  if (aggregated.social_channels.length === 0) risks.push('No social profile links found.')
  if (aggregated.content_signals.total_text_length < 500) {
    risks.push('Very little readable content extracted — site may be JavaScript-heavy.')
  }
  return [...new Set(risks)].slice(0, 6)
}

function buildRecommendedActions(aggregated, scores) {
  const actions = []
  if (!aggregated.policy_signals.shipping) actions.push('Publish and link a shipping policy page.')
  if (!aggregated.policy_signals.returns) actions.push('Add a clear return policy to reduce purchase hesitation.')
  if (aggregated.social_channels.length === 0) {
    actions.push('Link Instagram or TikTok from your homepage footer.')
  }
  if (!aggregated.trust_signals.review_indicators) {
    actions.push('Add customer reviews or testimonials above the fold.')
  }
  if (scores.content_score < 65) actions.push('Expand product descriptions and educational content.')
  if (scores.technical_score < 65) actions.push('Improve technical SEO basics: title, meta, and HTTPS.')
  return [...new Set(actions)].slice(0, 6)
}

module.exports = {
  aggregatePages,
  inferBusinessType,
  buildValueProposition,
  calculateScores,
  buildStrengths,
  buildRisks,
  buildRecommendedActions,
}
