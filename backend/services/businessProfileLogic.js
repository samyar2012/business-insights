
function normalizeProductEntry(product) {
  if (!product) return null
  if (typeof product === 'string') {
    return {
      name: product,
      confidence: 40,
      source: 'legacy_string',
      signals: {},
    }
  }
  if (typeof product === 'object' && product.name) return product
  return null
}

function productKey(product) {
  return String(product.name || '')
    .trim()
    .toLowerCase()
}

function classifySite(pages, aggregated) {
  const hints = aggregated.page_classification_hints || []
  const indicators = new Set(aggregated.page_classification_indicators || [])
  const marketplaceVotes = hints.filter((h) => h === 'marketplace').length
  const shopifyVotes = hints.filter((h) => h === 'shopify_dtc').length
  const ecommerceVotes = hints.filter((h) => h === 'single_brand_ecommerce').length
  const serviceVotes = hints.filter((h) => h === 'service').length
  const contentVotes = hints.filter((h) => h === 'content_social').length

  let classification = 'unknown'
  let confidence = 40

  if (marketplaceVotes > 0 || indicators.has('marketplace_host') || indicators.has('marketplace_copy')) {
    classification = 'marketplace'
    confidence = 85
  } else if (shopifyVotes > 0 && aggregated.platform === 'Shopify') {
    classification = 'shopify_dtc'
    confidence = 80
  } else if (ecommerceVotes > 0 || aggregated.high_confidence_products.length >= 2) {
    classification = 'single_brand_ecommerce'
    confidence = 75
  } else if (serviceVotes > 0 && serviceVotes >= contentVotes) {
    classification = 'service'
    confidence = 70
  }

  if (classification === 'unknown' && contentVotes > 0) {
    classification = 'content_social'
    confidence = 65
  }

  if (
    classification === 'unknown' &&
    aggregated.products.length > 0 &&
    aggregated.extraction_meta.avg_product_confidence >= 65
  ) {
    classification = 'single_brand_ecommerce'
    confidence = 60
  }

  return {
    classification,
    confidence,
    indicators: [...indicators],
    hint_counts: {
      marketplace: marketplaceVotes,
      shopify_dtc: shopifyVotes,
      single_brand_ecommerce: ecommerceVotes,
      service: serviceVotes,
      content_social: contentVotes,
    },
  }
}

function aggregatePages(pages) {
  const productsByKey = new Map()
  const services = new Set()
  const social = new Set()
  const emails = new Set()
  const phones = new Set()
  const prices = new Set()
  const ctas = new Set()
  const navLabels = new Set()
  const policies = { shipping: false, returns: false, privacy: false, terms: false }
  const pageClassificationHints = []
  const pageClassificationIndicators = new Set()

  let platform = 'unknown'
  let reviewIndicators = false
  let newsletterIndicators = false
  let totalText = 0
  let https = false
  let jsRenderedPages = 0
  let noisyPages = 0
  let pricesWithoutProductsPages = 0
  let hasProductDetailPage = false
  let hasReliableProductCards = false
  let hasJsonLdProducts = false
  let confidenceTotal = 0
  let confidenceCount = 0

  for (const page of pages) {
    let data = page.extracted_data_json || {}
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data)
      } catch {
        data = {}
      }
    }

    const pageProducts = (data.products || [])
      .map(normalizeProductEntry)
      .filter(Boolean)

    for (const product of pageProducts) {
      const key = productKey(product)
      const existing = productsByKey.get(key)
      if (!existing || (product.confidence || 0) > (existing.confidence || 0)) {
        productsByKey.set(key, product)
      }
      confidenceTotal += product.confidence || 0
      confidenceCount += 1
    }

    if (page.page_type === 'services') services.add(page.title)
    ;(data.social_links || []).forEach((s) => social.add(s))
    ;(data.emails || []).forEach((e) => emails.add(e))
    ;(data.phones || []).forEach((p) => phones.add(p))
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

    const meta = data.extraction_meta || {}
    if (meta.has_product_detail_signals) hasProductDetailPage = true
    if (meta.has_reliable_product_cards) hasReliableProductCards = true
    if (meta.has_json_ld_products) hasJsonLdProducts = true
    if (meta.heading_promo_noise) noisyPages += 1
    if (meta.prices_without_products) pricesWithoutProductsPages += 1

    if (data.page_classification_hint) pageClassificationHints.push(data.page_classification_hint)
    ;(data.page_classification_indicators || []).forEach((i) => pageClassificationIndicators.add(i))

    totalText += (page.extracted_text || '').length
    if ((page.final_url || page.url || '').startsWith('https://')) https = true
    if (page.requires_browser || meta.sparse_content) jsRenderedPages += 1
  }

  const products = [...productsByKey.values()].sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
  const highConfidenceProducts = products.filter((p) => (p.confidence || 0) >= 75)
  const avgProductConfidence = confidenceCount
    ? Math.round(confidenceTotal / confidenceCount)
    : 0

  const extractionMeta = {
    product_count: products.length,
    high_confidence_product_count: highConfidenceProducts.length,
    avg_product_confidence: avgProductConfidence,
    has_reliable_product_cards: hasReliableProductCards,
    has_product_detail_page: hasProductDetailPage,
    has_json_ld_products: hasJsonLdProducts,
    noisy_pages: noisyPages,
    prices_without_products_pages: pricesWithoutProductsPages,
    js_rendered_pages: jsRenderedPages,
    low_confidence_extraction: products.length > 0 && avgProductConfidence < 60,
  }

  const partialAggregated = {
    products,
    high_confidence_products: highConfidenceProducts,
    platform,
    extraction_meta: extractionMeta,
    page_classification_hints: pageClassificationHints,
    page_classification_indicators: [...pageClassificationIndicators],
  }

  const siteClassification = classifySite(pages, partialAggregated)

  return {
    products,
    product_names: products.map((p) => p.name),
    high_confidence_products: highConfidenceProducts,
    services: [...services].slice(0, 15),
    social_channels: [...social],
    contact_signals: { emails: [...emails], phones: [...phones] },
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
    extraction_meta: extractionMeta,
    site_classification: siteClassification,
    page_classification_hints: pageClassificationHints,
    page_classification_indicators: [...pageClassificationIndicators],
  }
}

function inferBusinessType(business, aggregated) {
  if (business?.business_type) return business.business_type
  if (aggregated.site_classification?.classification === 'marketplace') return 'marketplace'
  if (aggregated.products.length > 0 || aggregated.site_classification?.classification?.includes('ecommerce')) {
    return 'ecommerce'
  }
  if (aggregated.services.length > 0 || aggregated.site_classification?.classification === 'service') {
    return 'services'
  }
  return 'unknown'
}

function buildValueProposition(pages, business) {
  const home = pages.find((p) => p.page_type === 'homepage') || pages[0]
  if (home?.meta_description) return home.meta_description
  if (home?.title) return home.title
  return business?.product_sold || null
}

const { calculatePriorityScores } = require('./priorityWebsiteScoring')

function calculateScores(aggregated, business, pages, options = {}) {
  return calculatePriorityScores(aggregated, business, pages, options)
}

function buildProfileScoresPayload(aggregated, business, pages, options = {}) {
  const scores = calculateScores(aggregated, business, pages, options)
  return {
    ...scores,
    strengths: buildStrengths(aggregated, scores),
    risks: buildRisks(aggregated, pages, scores),
    recommended_actions: buildRecommendedActions(aggregated, scores),
  }
}

function isEcommerceRubric(rubric) {
  return rubric === 'ecommerce_store'
}

function buildStrengths(aggregated, scores) {
  const strengths = []
  const meta = aggregated.extraction_meta || {}
  const rubric = scores.scoring_rubric || 'ecommerce_store'
  const positiveReasons = (scores.score_explanation || [])
    .filter((e) => e.delta > 0 && e.category !== 'mismatch')
    .map((e) => e.reason)

  if (aggregated.trust_signals.https) strengths.push('Website is served over HTTPS.')
  if (isEcommerceRubric(rubric) && meta.has_json_ld_products) {
    strengths.push('Structured product data (JSON-LD) is present.')
  }
  if (isEcommerceRubric(rubric) && meta.high_confidence_product_count >= 2) {
    strengths.push(`${meta.high_confidence_product_count} high-confidence products extracted.`)
  }
  if (aggregated.platform !== 'unknown') {
    strengths.push(`Detected platform: ${aggregated.platform}.`)
  }
  if (aggregated.social_channels.length) strengths.push('Social profiles are linked from the site.')
  if (
    isEcommerceRubric(rubric) &&
    aggregated.policy_signals.shipping &&
    aggregated.policy_signals.returns
  ) {
    strengths.push('Shipping and return policies are discoverable.')
  }
  if (scores.overall_score >= 70) strengths.push('Overall website presentation score is solid.')
  for (const reason of positiveReasons.slice(0, 3)) {
    strengths.push(reason)
  }
  return [...new Set(strengths)].slice(0, 6)
}

function buildRisks(aggregated, pages, scores = {}) {
  const risks = []
  const meta = aggregated.extraction_meta || {}
  const siteClass = aggregated.site_classification?.classification
  const rubric = scores.scoring_rubric || 'ecommerce_store'
  const ecommerceRubric = isEcommerceRubric(rubric)

  if (scores.safety_status === 'unsafe') {
    risks.push(
      scores.score_explanation?.find((e) => e.category === 'safety' && /flagged|unsafe|phishing|malware/i.test(e.reason))
        ?.reason || 'Site was flagged as unsafe by security checks (malware, phishing, or social engineering).',
    )
  }
  if (scores.safety_status === 'unknown') {
    risks.push(
      'Live Google Safe Browsing verification is not configured — safety could not be fully verified.',
    )
  }
  if (scores.score_caps_applied?.includes('homepage_failure_cap_40')) {
    risks.push('Homepage failed to load; overall score is capped until the site is reachable.')
  }
  if (scores.score_caps_applied?.includes('key_pages_failure_cap_60')) {
    risks.push('Many key pages failed to crawl; contact, services, or gallery pages may be missing or unreachable.')
  }
  if (scores.functionality_score != null && scores.functionality_score < 10) {
    risks.push('Website functionality score is low — HTTPS, crawl success, or readable content may be failing.')
  }

  if (pages.length === 0) risks.push('No pages could be crawled from the submitted URL.')
  if (!aggregated.trust_signals.https) risks.push('Site may not use HTTPS consistently.')

  if (ecommerceRubric && meta.prices_without_products_pages > 0) {
    risks.push('Crawler found prices but no reliable product cards.')
  }
  if (siteClass === 'marketplace' && rubric !== 'marketplace_listing') {
    risks.push('Marketplace page detected; this does not look like a single SMB storefront.')
  }
  if (ecommerceRubric && meta.low_confidence_extraction) {
    risks.push(
      'Product extraction confidence is low because headings/promos dominated the page.',
    )
  }
  if (ecommerceRubric && meta.noisy_pages > 0 && meta.high_confidence_product_count === 0) {
    risks.push('Promo headings and navigation labels were noisy but no product cards were confirmed.')
  }
  if (ecommerceRubric && !meta.has_reliable_product_cards && aggregated.products.length > 0) {
    risks.push('Products were inferred weakly without card-level name, price, and link/image signals.')
  }
  if (ecommerceRubric && !meta.has_product_detail_page) {
    risks.push('No product detail page was crawled.')
  }
  if (meta.js_rendered_pages > 0) {
    risks.push('Very little readable content extracted — site may be JavaScript-heavy.')
  }
  if (ecommerceRubric && !aggregated.policy_signals.returns) {
    risks.push('Return policy page not detected.')
  }
  if (ecommerceRubric && !aggregated.policy_signals.shipping) {
    risks.push('Shipping policy page not detected.')
  }
  if (!aggregated.trust_signals.review_indicators) {
    risks.push('No review or testimonial signals detected on crawled pages.')
  }
  if (aggregated.social_channels.length === 0 && rubric === 'content_social_business') {
    risks.push('No social profile links found.')
  }
  for (const warning of scores.mismatch_warnings || []) {
    risks.push(warning)
  }
  if (risks.length === 0) {
    risks.push('No major risks detected on crawled pages — continue improving UX and conversion signals.')
  }
  return [...new Set(risks)].slice(0, 8)
}

function buildRecommendedActions(aggregated, scores) {
  const actions = []
  const meta = aggregated.extraction_meta || {}
  const explanations = scores.score_explanation || []
  const rubric = scores.scoring_rubric || 'ecommerce_store'
  const ecommerceRubric = isEcommerceRubric(rubric)

  const penalized = (category) =>
    explanations.some((e) => e.category === category && e.delta < 0)

  if (ecommerceRubric && (meta.prices_without_products_pages > 0 || penalized('business_fit'))) {
    actions.push('Expose product names beside prices in product cards or JSON-LD Product markup.')
  }
  if (ecommerceRubric && !meta.has_reliable_product_cards) {
    actions.push('Use consistent product card markup with title, price, image, and product link together.')
  }
  if (ecommerceRubric && !meta.has_product_detail_page) {
    actions.push('Ensure product detail URLs are linked internally so the crawler can reach PDPs.')
  }
  if (ecommerceRubric && (meta.low_confidence_extraction || penalized('business_fit'))) {
    actions.push('Reduce promo/section headings that look like product names in listing pages.')
  }
  if (meta.js_rendered_pages > 0 || penalized('functionality')) {
    actions.push('Improve server-rendered HTML for key storefront pages (title, products, policies).')
  }
  if (ecommerceRubric && !aggregated.policy_signals.shipping) {
    actions.push('Publish and link a shipping policy page.')
  }
  if (ecommerceRubric && !aggregated.policy_signals.returns) {
    actions.push('Add a clear return policy to reduce purchase hesitation.')
  }
  if (
    ['online_plus_offline_store', 'online_plus_physical_service', 'local_service_business'].includes(
      rubric,
    ) &&
    penalized('business_fit')
  ) {
    actions.push('Add phone, address, hours, and a contact page so local customers can reach you.')
  }
  if (
    ['online_plus_physical_service', 'local_service_business'].includes(rubric) &&
    penalized('business_fit')
  ) {
    actions.push('Add a clear quote or booking CTA and describe your service area.')
  }
  if (!aggregated.trust_signals.review_indicators || penalized('customer_attraction')) {
    actions.push('Add customer reviews or testimonials above the fold.')
  }
  if (aggregated.social_channels.length === 0 && rubric === 'content_social_business') {
    actions.push('Link Instagram or TikTok from your homepage footer.')
  }
  if (siteClassMismatch(aggregated, rubric)) {
    actions.push('Submit your own brand storefront URL instead of a marketplace listing page.')
  }
  if (scores.safety_status === 'unsafe') {
    actions.push('Resolve malware or phishing flags with your host and request a Safe Browsing review before promoting the site.')
  }
  if (scores.safety_status === 'unknown') {
    actions.push('Configure GOOGLE_SAFE_BROWSING_API_KEY in production to verify visitor safety before driving traffic.')
  }
  if (scores.score_caps_applied?.includes('homepage_failure_cap_40')) {
    actions.push('Fix homepage availability and SSL so the primary URL loads over HTTPS without errors.')
  }
  if (scores.functionality_score != null && scores.functionality_score < 12) {
    actions.push('Improve crawlability: ensure key pages return HTML (not blank JS shells) and link contact/services pages internally.')
  }
  if (scores.ux_ui_score != null && scores.ux_ui_score < 12) {
    actions.push('Add a clear H1 hero message, navigation labels, visible contact info, and a mobile viewport meta tag.')
  }
  if (actions.length === 0) {
    actions.push('Maintain current strengths and A/B test primary CTAs to improve customer attraction.')
  }
  return [...new Set(actions)].slice(0, 8)
}

function siteClassMismatch(aggregated, rubric) {
  const siteClass = aggregated.site_classification?.classification
  return siteClass === 'marketplace' && rubric !== 'marketplace_listing'
}

module.exports = {
  aggregatePages,
  inferBusinessType,
  buildValueProposition,
  calculateScores,
  buildProfileScoresPayload,
  buildStrengths,
  buildRisks,
  buildRecommendedActions,
  classifySite,
}
